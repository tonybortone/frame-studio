import type { Layer } from '../core/types';
import { applyImageEffects, sampleBorderColor } from '../core/visualEffects';

const MAX_EFFECT_PIXELS = 8_000_000;
const MAX_EFFECT_EDGE = 4096;
const MAX_CACHE_BYTES = 64 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 8;

function canvasForImage(image: HTMLImageElement, sampling = false): HTMLCanvasElement {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!width || !height) throw new Error('Wait for the image to finish loading.');
  const scale = sampling
    ? Math.min(1, 256 / Math.max(width, height))
    : Math.min(
        1,
        MAX_EFFECT_EDGE / Math.max(width, height),
        Math.sqrt(MAX_EFFECT_PIXELS / (width * height)),
      );
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  return canvas;
}

function readImage(image: HTMLImageElement, canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Image editing is unavailable on this device.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  try {
    return { context, pixels: context.getImageData(0, 0, canvas.width, canvas.height) };
  } catch {
    throw new Error('This image cannot be edited. Import the image from a local file.');
  }
}

export function sampleBackgroundColor(image: HTMLImageElement): string {
  const canvas = canvasForImage(image, true);
  const { pixels } = readImage(image, canvas);
  return sampleBorderColor(pixels.data, canvas.width, canvas.height);
}

export function hasImageEffects(
  layer: Pick<Layer, 'kind' | 'backgroundRemoval' | 'colorReplace'>,
): boolean {
  return (
    layer.kind === 'image' &&
    !!(layer.backgroundRemoval || (layer.colorReplace && layer.colorReplace.strength > 0))
  );
}

interface ProcessedEntry {
  signature: string;
  source: string;
  canvas: HTMLCanvasElement;
  bytes: number;
}

/**
 * Per-media-cache LRU: at most 8 images / 64 MB of RGBA rasters. Effects use up to
 * 4096 pixels per edge and 8 MP; originals remain untouched in project JSON.
 */
export class ProcessedImageCache {
  private entries = new Map<HTMLImageElement, ProcessedEntry>();
  private bytes = 0;

  get(image: HTMLImageElement, layer: Layer): HTMLImageElement | HTMLCanvasElement {
    if (!hasImageEffects(layer)) return image;
    const signature = JSON.stringify([
      image.naturalWidth,
      image.naturalHeight,
      layer.backgroundRemoval,
      layer.colorReplace,
    ]);
    const cached = this.entries.get(image);
    if (cached?.signature === signature && cached.source === image.src) {
      this.entries.delete(image);
      this.entries.set(image, cached);
      return cached.canvas;
    }
    this.release(image);
    const canvas = canvasForImage(image);
    const { context, pixels } = readImage(image, canvas);
    pixels.data.set(applyImageEffects(pixels.data, layer));
    context.putImageData(pixels, 0, 0);
    const bytes = canvas.width * canvas.height * 4;
    while (
      this.entries.size &&
      (this.entries.size >= MAX_CACHE_ENTRIES || this.bytes + bytes > MAX_CACHE_BYTES)
    ) {
      this.release(this.entries.keys().next().value!);
    }
    this.entries.set(image, { signature, source: image.src, canvas, bytes });
    this.bytes += bytes;
    return canvas;
  }

  dataUrl(image: HTMLImageElement, layer: Layer): string {
    const result = this.get(image, layer);
    if (result === image) return image.src;
    const entry = this.entries.get(image)!;
    // Do not retain a second base64 copy: SVG exports can be much larger than the raster.
    return entry.canvas.toDataURL('image/png');
  }

  release(image: HTMLImageElement): void {
    const existing = this.entries.get(image);
    if (!existing) return;
    this.bytes -= existing.bytes;
    existing.canvas.width = 0;
    existing.canvas.height = 0;
    this.entries.delete(image);
  }

  clear(): void {
    for (const image of this.entries.keys()) this.release(image);
  }
}
