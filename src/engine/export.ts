import type { Project } from '../core/types';
import { hasElement3D } from '../core/element3d';
import { evaluateKeyframedLayer } from '../core/keyframes';
import { getLayerFont, getRevealGeometry, getTextRevealLines } from '../core/motionEffects';
import { getMaskGeometry } from '../core/visualEffects';
import { hasImageEffects } from './imageEffects';
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
export function exportSvg(project: Project, time: number, media?: MediaCache): Blob {
  const active = project.layers.filter(
    (layer) => isLayerActive(layer, time) && layer.kind !== 'audio',
  );
  if (active.some((layer) => hasElement3D(evaluateKeyframedLayer(layer, time))))
    throw new Error(
      'This frame contains 3D elements. Export PNG or video to preserve perspective, or turn off 3D on those elements before exporting SVG.',
    );
  if (active.some((layer) => layer.kind === 'video'))
    throw new Error(
      'This frame contains video. Export PNG for a complete snapshot, or hide video layers before exporting SVG.',
    );
  const body = active
    .map((authored, index) => {
      const layer = evaluateKeyframedLayer(authored, time);
      const animation = animationState(layer, time);
      const scale =
        layer.flipX || layer.flipY
          ? `${animation.scale * (layer.flipX ? -1 : 1)} ${animation.scale * (layer.flipY ? -1 : 1)}`
          : `${animation.scale}`;
      const transform = `translate(${layer.x + layer.width / 2 + animation.x} ${layer.y + layer.height / 2 + animation.y}) rotate(${layer.rotation}) scale(${scale}) translate(${-layer.width / 2} ${-layer.height / 2})`;
      const filter = `brightness(${layer.brightness}) contrast(${layer.contrast}) saturate(${layer.saturation})`;
      const blur = layer.blur ?? 0;
      // Canvas filters are isotropic after the artwork transform. Compensate
      // SVG's local filter axes when width and height animate independently.
      const blurAxisRatio = Math.sqrt(
        layer.height / authored.height / (layer.width / authored.width),
      );
      const blurX = blur * blurAxisRatio;
      const blurY = blur / blurAxisRatio;
      const deviation = Math.abs(blurX - blurY) < 1e-9 ? `${blur}` : `${blurX} ${blurY}`;
      const blurId = `blur-${index}`;
      const blurDefinition =
        blur > 0
          ? `<defs><filter id="${blurId}" filterUnits="userSpaceOnUse" x="${-blurX * 3}" y="${-blurY * 3}" width="${authored.width + blurX * 6}" height="${authored.height + blurY * 6}" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${deviation}"/></filter></defs>`
          : '';
      const blurAttribute = blur > 0 ? ` filter="url(#${blurId})"` : '';
      let textClipsBlur = false;
      let content = '';
      if (authored.kind === 'shape')
        content = `<rect width="${authored.width}" height="${authored.height}" rx="${Math.max(0, authored.radius)}" fill="${escapeXml(authored.fill)}"/>`;
      else if (authored.kind === 'text') {
        const size = authored.fontSize ?? 48;
        const attributes = `fill="${escapeXml(authored.fill)}" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="${size}" font-weight="${authored.fontWeight ?? 600}" dominant-baseline="text-before-edge"`;
        content = `<text ${attributes}>${(authored.text ?? '')
          .split('\n')
          .map(
            (line, index) => `<tspan x="0" y="${index * size * 1.12}">${escapeXml(line)}</tspan>`,
          )
          .join('')}</text>`;
        if ((layer.textReveal ?? 1) < 1) {
          textClipsBlur = true;
          let measurement: CanvasRenderingContext2D | null | undefined;
          content = getTextRevealLines(authored.text ?? '', layer.textReveal, layer.textRevealMode)
            .map((line, lineIndex) => {
              if (!line.visibleText) return '';
              const text = `<text ${attributes} x="0" y="${lineIndex * size * 1.12}"${blurAttribute}>${escapeXml(line.text)}</text>`;
              if (line.complete) return text;
              measurement ??=
                typeof document === 'undefined'
                  ? null
                  : document.createElement('canvas').getContext('2d');
              if (!measurement)
                throw new Error(
                  'Text reveal SVG export requires canvas text measurement. Export from the app.',
                );
              measurement.font = getLayerFont(authored);
              const width = measurement.measureText(line.visibleText).width;
              const id = `text-reveal-${index}-${lineIndex}`;
              return `<defs><clipPath id="${id}" clipPathUnits="userSpaceOnUse"><rect x="${-size}" y="${lineIndex * size * 1.12 - size * 0.3}" width="${size + width}" height="${size * 1.6}"/></clipPath></defs><g clip-path="url(#${id})">${text}</g>`;
            })
            .join('');
        }
      } else if (authored.kind === 'image') {
        if (!authored.src?.startsWith('data:image/'))
          throw new Error('SVG export requires embedded image files.');
        if (hasImageEffects(authored) && !media)
          throw new Error('Image effects require prepared media before exporting SVG.');
        const source = hasImageEffects(authored) ? media!.imageDataUrl(authored) : authored.src;
        const legacyClip = authored.mask === undefined;
        content = `${legacyClip ? `<defs><clipPath id="image-${index}"><rect width="${authored.width}" height="${authored.height}" rx="${Math.max(0, authored.radius)}"/></clipPath></defs>` : ''}<image width="${authored.width}" height="${authored.height}" href="${escapeXml(source)}" preserveAspectRatio="xMidYMid slice"${legacyClip ? ` clip-path="url(#image-${index})"` : ''}/>`;
      } else if (authored.path) {
        const [x, y, width, height] = parseViewBox(
          authored.viewBox,
          authored.width,
          authored.height,
        );
        content = `<g transform="scale(${authored.width / width} ${authored.height / height}) translate(${-x} ${-y})"><path d="${escapeXml(authored.path)}" fill="${authored.kind === 'drawing' ? 'none' : escapeXml(authored.fill)}" stroke="${escapeXml(authored.stroke ?? 'none')}" stroke-width="${authored.strokeWidth ?? 3}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
      }
      if (blur > 0)
        content = `${blurDefinition}${textClipsBlur ? content : `<g${blurAttribute}>${content}</g>`}`;
      const mask = getMaskGeometry(authored);
      if (mask) {
        const geometry =
          mask.kind === 'ellipse'
            ? `<ellipse cx="${mask.x + mask.width / 2}" cy="${mask.y + mask.height / 2}" rx="${mask.width / 2}" ry="${mask.height / 2}"/>`
            : mask.kind === 'diamond'
              ? `<polygon points="${mask.x + mask.width / 2},${mask.y} ${mask.x + mask.width},${mask.y + mask.height / 2} ${mask.x + mask.width / 2},${mask.y + mask.height} ${mask.x},${mask.y + mask.height / 2}"/>`
              : `<rect x="${mask.x}" y="${mask.y}" width="${mask.width}" height="${mask.height}" rx="${mask.radius}"/>`;
        content = `<defs><clipPath id="mask-${index}" clipPathUnits="userSpaceOnUse">${geometry}</clipPath></defs><g clip-path="url(#mask-${index})">${content}</g>`;
      }
      const reveal = getRevealGeometry(authored, layer);
      if (reveal) {
        content = `<defs><clipPath id="reveal-${index}" clipPathUnits="userSpaceOnUse"><rect x="${reveal.x}" y="${reveal.y}" width="${reveal.width}" height="${reveal.height}"/></clipPath></defs><g clip-path="url(#reveal-${index})">${content}</g>`;
      }
      if (layer.width !== authored.width || layer.height !== authored.height)
        content = `<g transform="scale(${layer.width / authored.width} ${layer.height / authored.height})">${content}</g>`;
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
