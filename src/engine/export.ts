import type { Project } from '../core/types';
import {
  animationState,
  isLayerActive,
  MediaCache,
  parseViewBox,
  renderFrame,
  seekMedia,
  stopMedia,
  syncMedia,
} from './renderer';

export interface VideoFormat {
  id: string;
  label: string;
  mimeType: string;
  extension: string;
}

export function getVideoFormats(): VideoFormat[] {
  if (typeof MediaRecorder === 'undefined') return [];
  const candidates: VideoFormat[] = [
    {
      id: 'mp4',
      label: 'MP4 · H.264',
      mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      extension: 'mp4',
    },
    { id: 'webm', label: 'WebM · VP9', mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
  ];
  const formats = candidates.filter((format) => MediaRecorder.isTypeSupported(format.mimeType));
  if (!formats.some((format) => format.id === 'mp4') && MediaRecorder.isTypeSupported('video/mp4'))
    formats.unshift({ id: 'mp4', label: 'MP4', mimeType: 'video/mp4', extension: 'mp4' });
  if (
    !formats.some((format) => format.id === 'webm') &&
    MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
  )
    formats.push({
      id: 'webm',
      label: 'WebM · VP8',
      mimeType: 'video/webm;codecs=vp8,opus',
      extension: 'webm',
    });
  return formats;
}

function makeCanvas(project: Project): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = project.width;
  canvas.height = project.height;
  return canvas;
}
function getContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas rendering is unavailable on this device.');
  return context;
}
function abortError(): DOMException {
  return new DOMException('Export canceled.', 'AbortError');
}
function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

/** Real-time alpha export: the same composition renderer, with a mixed audio track. */
export async function exportVideo(
  project: Project,
  media: MediaCache,
  format: VideoFormat,
  onProgress: (progress: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  checkAbort(signal);
  if (!getVideoFormats().some((item) => item.mimeType === format.mimeType))
    throw new Error(
      'This video format is not supported on your device. Choose another export format.',
    );
  if (project.duration <= 0) throw new Error('The project must contain at least one frame.');
  stopMedia(media);
  media.playbackError = null;
  await media.prepare(project.layers);
  checkAbort(signal);
  const canvas = makeCanvas(project);
  const context = getContext(canvas);
  let stream: MediaStream | undefined;
  let recorder: MediaRecorder | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await seekMedia(project, 0, media);
    checkAbort(signal);
    renderFrame(context, project, 0, media);
    if (!canvas.captureStream)
      throw new Error(
        'Video export is not available in this browser. Use the desktop app or a current Chromium browser.',
      );
    stream = canvas.captureStream(project.fps);
    if (media.mediaEntries().length) {
      const audio = await media.createAudioMix();
      audio.getAudioTracks().forEach((track) => stream!.addTrack(track));
    }
    checkAbort(signal);
    recorder = new MediaRecorder(stream, {
      mimeType: format.mimeType,
      videoBitsPerSecond: Math.min(
        24_000_000,
        Math.max(4_000_000, project.width * project.height * project.fps * 0.15),
      ),
      audioBitsPerSecond: 192_000,
    });
    const chunks: Blob[] = [];
    const output = await new Promise<Blob>((resolve, reject) => {
      let settled = false;
      let exportError: Error | undefined;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
      };
      const fail = (error: Error) => {
        if (settled) return;
        exportError = error;
        if (recorder!.state !== 'inactive') recorder!.stop();
        else {
          settled = true;
          cleanup();
          reject(error);
        }
      };
      const cancel = () => fail(abortError());
      signal?.addEventListener('abort', cancel, { once: true });
      recorder!.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder!.onerror = (event) =>
        fail(
          new Error(
            `Video encoding failed: ${'error' in event ? String(event.error) : 'encoder error'}. Try another format.`,
          ),
        );
      recorder!.onstop = () => {
        if (settled) return;
        settled = true;
        cleanup();
        if (exportError) {
          reject(exportError);
          return;
        }
        const blob = new Blob(chunks, { type: recorder!.mimeType || format.mimeType });
        if (!blob.size) {
          reject(new Error('The encoder produced an empty video. Try a different format.'));
          return;
        }
        onProgress(1);
        resolve(blob);
      };
      recorder!.start(250);
      const started = performance.now();
      let lastVisualFrame = 0;
      onProgress(0);
      const frame = () => {
        if (settled || exportError) return;
        try {
          checkAbort(signal);
          if (media.playbackError) throw media.playbackError;
          const time = Math.min(project.duration, (performance.now() - started) / 1000);
          if (time >= project.duration) {
            stopMedia(media);
            recorder!.stop();
            return;
          }
          // Sound envelopes need a steady cadence even when exporting a low-frame-rate scene.
          syncMedia(project, time, true, media);
          const visualFrame = Math.floor(time * project.fps);
          if (visualFrame > lastVisualFrame) {
            renderFrame(context, project, time, media);
            onProgress(time / project.duration);
            lastVisualFrame = visualFrame;
          }
          timer = setTimeout(
            frame,
            Math.max(1, Math.min(1000 / 60, (project.duration - time) * 1000)),
          );
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      };
      frame();
    });
    return output;
  } finally {
    if (timer) clearTimeout(timer);
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    stopMedia(media);
    media.endAudioMix();
    stream?.getTracks().forEach((track) => track.stop());
  }
}

export async function exportPng(project: Project, media: MediaCache, time: number): Promise<Blob> {
  await media.prepare(project.layers);
  await seekMedia(project, time, media);
  const canvas = makeCanvas(project);
  renderFrame(getContext(canvas), project, time, media);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not export this frame as PNG.'))),
      'image/png',
    ),
  );
}

function escapeXml(value: string): string {
  return value.replace(
    /[<>&"']/g,
    (character) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]!,
  );
}

/** SVG is an editable snapshot. Video needs PNG export; audio has no visual representation. */
export function exportSvg(project: Project, time: number): Blob {
  const active = project.layers.filter(
    (layer) => isLayerActive(layer, time) && layer.kind !== 'audio',
  );
  if (active.some((layer) => layer.kind === 'video'))
    throw new Error(
      'This frame contains video. Export PNG for a complete snapshot, or hide video layers before exporting SVG.',
    );
  const body = active
    .map((layer, index) => {
      const animation = animationState(layer, time);
      const transform = `translate(${layer.x + layer.width / 2 + animation.x} ${layer.y + layer.height / 2 + animation.y}) rotate(${layer.rotation}) scale(${animation.scale}) translate(${-layer.width / 2} ${-layer.height / 2})`;
      const filter = `brightness(${layer.brightness}) contrast(${layer.contrast}) saturate(${layer.saturation})`;
      let content = '';
      if (layer.kind === 'shape')
        content = `<rect width="${layer.width}" height="${layer.height}" rx="${Math.max(0, layer.radius)}" fill="${escapeXml(layer.fill)}"/>`;
      else if (layer.kind === 'text') {
        const size = layer.fontSize ?? 48;
        content = `<text fill="${escapeXml(layer.fill)}" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="${size}" font-weight="${layer.fontWeight ?? 600}" dominant-baseline="text-before-edge">${(
          layer.text ?? ''
        )
          .split('\n')
          .map(
            (line, index) => `<tspan x="0" y="${index * size * 1.12}">${escapeXml(line)}</tspan>`,
          )
          .join('')}</text>`;
      } else if (layer.kind === 'image') {
        if (!layer.src?.startsWith('data:image/'))
          throw new Error('SVG export requires embedded image files.');
        content = `<defs><clipPath id="image-${index}"><rect width="${layer.width}" height="${layer.height}" rx="${Math.max(0, layer.radius)}"/></clipPath></defs><image width="${layer.width}" height="${layer.height}" href="${escapeXml(layer.src)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#image-${index})"/>`;
      } else if (layer.path) {
        const [x, y, width, height] = parseViewBox(layer.viewBox, layer.width, layer.height);
        content = `<g transform="scale(${layer.width / width} ${layer.height / height}) translate(${-x} ${-y})"><path d="${escapeXml(layer.path)}" fill="${layer.kind === 'drawing' ? 'none' : escapeXml(layer.fill)}" stroke="${escapeXml(layer.stroke ?? 'none')}" stroke-width="${layer.strokeWidth ?? 3}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
      }
      return `<g transform="${transform}" opacity="${animation.opacity}" style="filter:${filter}">${content}</g>`;
    })
    .join('\n');
  return new Blob(
    [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${project.width}" height="${project.height}" viewBox="0 0 ${project.width} ${project.height}"><rect width="100%" height="100%" fill="${escapeXml(project.background)}"/>\n${body}</svg>`,
    ],
    { type: 'image/svg+xml' },
  );
}

export async function saveBlob(blob: Blob, name: string): Promise<boolean> {
  if (window.frameDesktop) {
    const result = await window.frameDesktop.saveFile(name, await blob.arrayBuffer());
    return !result.canceled;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
