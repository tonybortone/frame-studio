import type { Layer, Project } from '../core/types';
import {
  audioEnvelope,
  easeProgress,
  getAnimationDistance,
  getLoopTiming,
  getMotionTiming,
} from '../core/motion';
import { getMaskGeometry } from '../core/visualEffects';
import { getElement3DState } from '../core/element3d';
import { drawProjectedLayer } from './projectedLayer';
import { ProcessedImageCache } from './imageEffects';

type MediaElement = HTMLImageElement | HTMLVideoElement | HTMLAudioElement;
interface Entry {
  src: string;
  element: MediaElement;
  ready: Promise<void>;
  source?: MediaElementAudioSourceNode;
  gain?: GainNode;
  playPending?: boolean;
  cancelLoad?: () => void;
}

/** Decoded media is kept outside project JSON. Each clip gets its own playhead. */
export class MediaCache {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  private audioContext?: AudioContext;
  private monitor?: GainNode;
  private mix?: MediaStreamAudioDestinationNode;
  private processedImages = new ProcessedImageCache();
  playbackError: Error | null = null;

  async prepare(layers: Layer[]): Promise<void> {
    const wanted = new Set(layers.filter((layer) => layer.src).map((layer) => layer.id));
    for (const [id, entry] of this.entries) {
      if (!wanted.has(id)) {
        this.release(entry);
        this.entries.delete(id);
      }
    }
    await Promise.all(
      layers
        .filter((layer) => layer.src && ['image', 'video', 'audio'].includes(layer.kind))
        .map(async (layer) => {
          const existing = this.entries.get(layer.id);
          if (existing && existing.src === layer.src) return existing.ready;
          if (existing) this.release(existing);
          if (!/^(data:(?:image|video|audio)\/|blob:)/i.test(layer.src!)) {
            throw new Error(
              `“${layer.name}” uses an unsupported media source. Import a local file.`,
            );
          }
          const element =
            layer.kind === 'image'
              ? new Image()
              : document.createElement(layer.kind as 'video' | 'audio');
          if (element instanceof HTMLMediaElement) {
            element.preload = 'auto';
            if (element instanceof HTMLVideoElement) element.playsInline = true;
          }
          element.addEventListener('seeked', () => this.notify());
          const entry: Entry = { src: layer.src!, element, ready: Promise.resolve() };
          entry.ready = new Promise<void>((resolve, reject) => {
            const event = element instanceof HTMLImageElement ? 'load' : 'loadeddata';
            const cleanup = () => {
              clearTimeout(timer);
              element.removeEventListener(event, success);
              element.removeEventListener('error', failure);
            };
            const success = () => {
              cleanup();
              entry.cancelLoad = undefined;
              resolve();
              this.notify();
            };
            const failure = () => {
              cleanup();
              entry.cancelLoad = undefined;
              reject(
                new Error(
                  `Cannot decode “${layer.name}”. Try a supported image, H.264 video, or MP3/WAV audio.`,
                ),
              );
            };
            const timer = setTimeout(failure, 20_000);
            entry.cancelLoad = () => {
              cleanup();
              resolve();
            };
            element.addEventListener(event, success, { once: true });
            element.addEventListener('error', failure, { once: true });
            element.src = layer.src!;
            if (element instanceof HTMLMediaElement) element.load();
          });
          this.entries.set(layer.id, entry);
          return entry.ready;
        }),
    );
  }

  /** Subscribe to asynchronous decoded frames (especially while scrubbing paused video). */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  get(id: string): MediaElement | undefined {
    return this.entries.get(id)?.element;
  }
  imageSource(layer: Layer): HTMLImageElement | HTMLCanvasElement | undefined {
    const element = this.get(layer.id);
    return element instanceof HTMLImageElement
      ? this.processedImages.get(element, layer)
      : undefined;
  }
  imageDataUrl(layer: Layer): string {
    const element = this.get(layer.id);
    if (!(element instanceof HTMLImageElement) || !element.naturalWidth)
      throw new Error(`Wait for “${layer.name}” to finish loading before exporting SVG.`);
    return this.processedImages.dataUrl(element, layer);
  }
  mediaEntries(): Array<[string, Entry]> {
    return [...this.entries].filter(([, entry]) => entry.element instanceof HTMLMediaElement);
  }

  /** Resume from a user gesture. Sources remain attached so repeated exports work. */
  async createAudioMix(): Promise<MediaStream> {
    this.audioContext ??= new AudioContext();
    this.monitor ??= this.audioContext.createGain();
    this.monitor.disconnect();
    this.monitor.connect(this.audioContext.destination);
    this.monitor.gain.value = 0;
    this.mix = this.audioContext.createMediaStreamDestination();
    for (const [, entry] of this.mediaEntries()) {
      if (!entry.source) {
        entry.source = this.audioContext.createMediaElementSource(
          entry.element as HTMLMediaElement,
        );
        entry.gain = this.audioContext.createGain();
        entry.source.connect(entry.gain);
        entry.gain.connect(this.monitor);
      }
      entry.gain!.connect(this.mix);
    }
    await this.audioContext.resume();
    return this.mix.stream;
  }

  endAudioMix(): void {
    if (this.mix) {
      for (const [, entry] of this.mediaEntries()) {
        try {
          entry.gain?.disconnect(this.mix);
        } catch {
          /* A removed clip is already disconnected. */
        }
      }
      this.mix.stream.getTracks().forEach((track) => track.stop());
      this.mix = undefined;
    }
    if (this.monitor) this.monitor.gain.value = 1;
  }

  setLevel(id: string, level: number): void {
    const entry = this.entries.get(id);
    if (!entry || !(entry.element instanceof HTMLMediaElement)) return;
    if (entry.gain) {
      entry.gain.gain.value = level;
      entry.element.volume = 1;
    } else entry.element.volume = level;
  }

  private release(entry: Entry): void {
    entry.cancelLoad?.();
    entry.cancelLoad = undefined;
    entry.source?.disconnect();
    entry.gain?.disconnect();
    if (entry.element instanceof HTMLMediaElement) {
      entry.element.pause();
      entry.element.removeAttribute('src');
      entry.element.load();
    } else {
      this.processedImages.release(entry.element);
      entry.element.src = '';
    }
  }

  dispose(): void {
    this.endAudioMix();
    for (const entry of this.entries.values()) this.release(entry);
    this.entries.clear();
    this.processedImages.clear();
    this.listeners.clear();
    void this.audioContext?.close();
    this.audioContext = undefined;
    this.monitor = undefined;
  }
}

export function isLayerActive(layer: Layer, time: number): boolean {
  return !layer.hidden && time >= layer.start && time < layer.start + layer.duration;
}

export function animationState(
  layer: Layer,
  time: number,
): { opacity: number; x: number; y: number; scale: number } {
  const elapsed = time - layer.start;
  const { delay, duration, exitDuration } = getMotionTiming(layer);
  const progress = duration > 0 ? (elapsed - delay) / duration : elapsed >= delay ? 1 : 0;
  const eased = easeProgress(progress, layer.animationEasing);
  const leaving =
    exitDuration > 0
      ? easeProgress(
          (elapsed - layer.duration + exitDuration) / exitDuration,
          layer.exitEasing ?? layer.animationEasing,
        )
      : 0;
  const entrance = 1 - eased;
  const travel = getAnimationDistance(layer);
  let x =
    layer.animation === 'slide'
      ? -travel * entrance
      : layer.animation === 'slide-right'
        ? travel * entrance
        : 0;
  let y =
    layer.animation === 'rise'
      ? travel * entrance
      : layer.animation === 'fall'
        ? -travel * entrance
        : 0;
  let scale =
    layer.animation === 'pop'
      ? 0.72 + 0.28 * eased
      : layer.animation === 'zoom-out'
        ? 1 + 0.28 * entrance
        : 1;
  const exit = layer.exitAnimation ?? 'fade';
  const exitTravel = getAnimationDistance(layer, exit === 'reverse' ? layer.animation : exit);
  if (exit === 'reverse') {
    // Return towards the entrance's initial pose, including its original scale.
    if (layer.animation === 'slide') x -= exitTravel * leaving;
    if (layer.animation === 'slide-right') x += exitTravel * leaving;
    if (layer.animation === 'rise') y += exitTravel * leaving;
    if (layer.animation === 'fall') y -= exitTravel * leaving;
    if (layer.animation === 'pop') scale *= 1 - 0.28 * leaving;
    if (layer.animation === 'zoom-out') scale *= 1 + 0.28 * leaving;
  } else {
    if (exit === 'slide-left') x -= exitTravel * leaving;
    if (exit === 'slide-right') x += exitTravel * leaving;
    if (exit === 'rise') y -= exitTravel * leaving;
    if (exit === 'fall') y += exitTravel * leaving;
    if (exit === 'shrink') scale *= 1 - 0.28 * leaving;
  }
  if (layer.loopAnimation && layer.loopAnimation !== 'none') {
    const loop = getLoopTiming(layer);
    const phase = (Math.max(0, elapsed - loop.delay) / loop.period) * Math.PI * 2;
    if (layer.loopAnimation === 'float') y += Math.sin(phase) * loop.amount;
    if (layer.loopAnimation === 'pulse')
      scale *= 1 + (((1 - Math.cos(phase)) / 2) * loop.amount) / 100;
  }
  return {
    opacity: layer.opacity * (layer.animation === 'none' ? 1 : eased) * (1 - leaving),
    x,
    y,
    scale,
  };
}

/** Draw local content once; 2D, perspective preview, PNG, and video share it. */
function drawLayerContents(ctx: CanvasRenderingContext2D, layer: Layer, media: MediaCache): void {
  const mask = getMaskGeometry(layer);
  if (mask) {
    ctx.beginPath();
    if (mask.kind === 'ellipse') {
      ctx.ellipse(
        mask.x + mask.width / 2,
        mask.y + mask.height / 2,
        mask.width / 2,
        mask.height / 2,
        0,
        0,
        Math.PI * 2,
      );
    } else if (mask.kind === 'diamond') {
      ctx.moveTo(mask.x + mask.width / 2, mask.y);
      ctx.lineTo(mask.x + mask.width, mask.y + mask.height / 2);
      ctx.lineTo(mask.x + mask.width / 2, mask.y + mask.height);
      ctx.lineTo(mask.x, mask.y + mask.height / 2);
      ctx.closePath();
    } else ctx.roundRect(mask.x, mask.y, mask.width, mask.height, mask.radius);
    ctx.clip();
  }
  ctx.filter = `brightness(${layer.brightness}) contrast(${layer.contrast}) saturate(${layer.saturation})`;
  ctx.fillStyle = layer.fill;
  if (layer.kind === 'shape') {
    ctx.beginPath();
    ctx.roundRect(0, 0, layer.width, layer.height, Math.max(0, layer.radius));
    ctx.fill();
  } else if (layer.kind === 'text') {
    const size = layer.fontSize ?? 48;
    ctx.font = `${layer.fontWeight ?? 600} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textBaseline = 'top';
    (layer.text ?? '')
      .split('\n')
      .forEach((line, index) => ctx.fillText(line, 0, index * size * 1.12));
  } else if (layer.kind === 'svg' || layer.kind === 'drawing') {
    if (layer.path) {
      const [x, y, width, height] = parseViewBox(layer.viewBox, layer.width, layer.height);
      ctx.scale(layer.width / width, layer.height / height);
      ctx.translate(-x, -y);
      const path = new Path2D(layer.path);
      if (layer.kind === 'svg' && layer.fill !== 'none') ctx.fill(path);
      if (layer.stroke && layer.stroke !== 'none') {
        ctx.strokeStyle = layer.stroke;
        ctx.lineWidth = layer.strokeWidth ?? 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke(path);
      }
    }
  } else {
    const element = media.get(layer.id);
    if (element && !(element instanceof HTMLAudioElement)) {
      const width = element instanceof HTMLVideoElement ? element.videoWidth : element.naturalWidth;
      const height =
        element instanceof HTMLVideoElement ? element.videoHeight : element.naturalHeight;
      if (width && height) {
        const source = element instanceof HTMLImageElement ? media.imageSource(layer)! : element;
        const sourcePixelWidth = source instanceof HTMLCanvasElement ? source.width : width;
        const sourcePixelHeight = source instanceof HTMLCanvasElement ? source.height : height;
        const scale = Math.max(layer.width / sourcePixelWidth, layer.height / sourcePixelHeight);
        const sourceWidth = layer.width / scale;
        const sourceHeight = layer.height / scale;
        if (layer.mask === undefined) {
          ctx.beginPath();
          ctx.roundRect(0, 0, layer.width, layer.height, Math.max(0, layer.radius));
          ctx.clip();
        }
        ctx.drawImage(
          source,
          (sourcePixelWidth - sourceWidth) / 2,
          (sourcePixelHeight - sourceHeight) / 2,
          sourceWidth,
          sourceHeight,
          0,
          0,
          layer.width,
          layer.height,
        );
      }
    }
  }
}

/** Both preview and exported frames call this function; layer order is bottom to top. */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  project: Project,
  time: number,
  media: MediaCache,
): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.scale(ctx.canvas.width / project.width, ctx.canvas.height / project.height);
  ctx.fillStyle = project.background;
  ctx.fillRect(0, 0, project.width, project.height);
  for (const layer of project.layers) {
    if (!isLayerActive(layer, time) || layer.kind === 'audio') continue;
    const animation = animationState(layer, time);
    const spatial = getElement3DState(layer, time);
    if (spatial.rotateX !== 0 || spatial.rotateY !== 0 || spatial.z !== 0) {
      drawProjectedLayer(
        ctx,
        layer,
        time,
        animation,
        {
          width: project.width,
          height: project.height,
          pixelScale: Math.max(
            ctx.canvas.width / project.width,
            ctx.canvas.height / project.height,
          ),
        },
        (context) => drawLayerContents(context, layer, media),
      );
      continue;
    }
    ctx.save();
    ctx.translate(
      layer.x + layer.width / 2 + animation.x,
      layer.y + layer.height / 2 + animation.y,
    );
    ctx.rotate((layer.rotation * Math.PI) / 180);
    ctx.scale(animation.scale * (layer.flipX ? -1 : 1), animation.scale * (layer.flipY ? -1 : 1));
    ctx.translate(-layer.width / 2, -layer.height / 2);
    ctx.globalAlpha = Math.min(1, Math.max(0, animation.opacity));
    drawLayerContents(ctx, layer, media);
    ctx.restore();
  }
  ctx.restore();
}

export function parseViewBox(
  value: string | undefined,
  width: number,
  height: number,
): [number, number, number, number] {
  const parts = value
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  return parts?.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0
    ? (parts as [number, number, number, number])
    : [0, 0, width || 1, height || 1];
}

export function syncMedia(
  project: Project,
  time: number,
  playing: boolean,
  media: MediaCache,
): void {
  const layers = new Map(project.layers.map((layer) => [layer.id, layer]));
  for (const [id, entry] of media.mediaEntries()) {
    const element = entry.element as HTMLMediaElement;
    const layer = layers.get(id);
    if (!layer) {
      element.pause();
      continue;
    }
    const active = isLayerActive(layer, time);
    const target = Math.max(0, time - layer.start + (layer.mediaOffset ?? 0));
    const validTime = Number.isFinite(element.duration)
      ? Math.min(target, Math.max(0, element.duration - 0.001))
      : target;
    media.setLevel(
      id,
      active && !layer.muted
        ? Math.min(1, Math.max(0, layer.volume ?? 1)) * audioEnvelope(layer, time)
        : 0,
    );
    if (
      (active || !playing) &&
      element.readyState >= 1 &&
      Math.abs(element.currentTime - validTime) > (playing ? 0.2 : 0.012)
    )
      element.currentTime = validTime;
    if (active && playing && target < element.duration) {
      if (element.paused && !entry.playPending) {
        entry.playPending = true;
        void element
          .play()
          .catch((error) => {
            if (error instanceof Error && error.name !== 'AbortError')
              media.playbackError = new Error(`Could not play “${layer.name}”: ${error.message}`);
          })
          .finally(() => {
            entry.playPending = false;
          });
      }
    } else element.pause();
  }
}

export function stopMedia(media: MediaCache): void {
  for (const [, entry] of media.mediaEntries()) (entry.element as HTMLMediaElement).pause();
}

/** Wait for a seek to finish before capturing still frames or the first export frame. */
export async function seekMedia(project: Project, time: number, media: MediaCache): Promise<void> {
  syncMedia(project, time, false, media);
  await Promise.all(
    media.mediaEntries().map(([, entry]) => {
      const element = entry.element as HTMLMediaElement;
      if (!element.seeking) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer);
          element.removeEventListener('seeked', done);
          element.removeEventListener('error', failed);
        };
        const done = () => {
          cleanup();
          resolve();
        };
        const failed = () => {
          cleanup();
          reject(new Error('A media clip could not seek to the requested frame.'));
        };
        const timer = setTimeout(failed, 10_000);
        element.addEventListener('seeked', done, { once: true });
        element.addEventListener('error', failed, { once: true });
      });
    }),
  );
}
