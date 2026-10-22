import type { BackgroundRemoval, ColorReplace, Layer, LayerMask } from './types';

export interface MaskGeometry {
  kind: Exclude<LayerMask, 'none'>;
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

/** Coordinates are local to the layer, before its center-based rotation and flips. */
export function getMaskGeometry(
  layer: Pick<Layer, 'width' | 'height' | 'mask' | 'maskInset' | 'maskRoundness'>,
): MaskGeometry | null {
  if (!layer.mask || layer.mask === 'none') return null;
  const inset = Math.min(45, Math.max(0, layer.maskInset ?? 0)) / 100;
  const width = layer.width * (1 - inset * 2);
  const height = layer.height * (1 - inset * 2);
  return {
    kind: layer.mask,
    x: layer.width * inset,
    y: layer.height * inset,
    width,
    height,
    radius:
      layer.mask === 'rounded'
        ? (Math.min(width, height) * Math.min(50, Math.max(0, layer.maskRoundness ?? 12))) / 100
        : 0,
  };
}

export type ImageEffects = {
  backgroundRemoval?: BackgroundRemoval;
  colorReplace?: ColorReplace;
};
type RGB = readonly [number, number, number];

export function hexToRgb(color: string): RGB {
  if (!/^#[\da-f]{6}$/i.test(color)) throw new Error('Image effect colors must use #rrggbb.');
  return [
    parseInt(color.slice(1, 3), 16),
    parseInt(color.slice(3, 5), 16),
    parseInt(color.slice(5, 7), 16),
  ];
}

/** RGB distance expressed as a percentage of the largest possible RGB distance. */
export function colorMatchWeight(
  red: number,
  green: number,
  blue: number,
  target: RGB,
  tolerance: number,
  softness: number,
): number {
  const distanceSquared =
    (red - target[0]) ** 2 + (green - target[1]) ** 2 + (blue - target[2]) ** 2;
  const unitsPerPercent = (255 * Math.sqrt(3)) / 100;
  if (distanceSquared <= (tolerance * unitsPerPercent) ** 2) return 1;
  if (softness <= 0) return 0;
  if (distanceSquared >= ((tolerance + softness) * unitsPerPercent) ** 2) return 0;
  const distance = Math.sqrt(distanceSquared) / unitsPerPercent;
  // Smoothstep avoids a visible hard ring around the key or replacement range.
  const transition = Math.min(1, Math.max(0, (distance - tolerance) / softness));
  return 1 - transition * transition * (3 - 2 * transition);
}

/** Matches the original pixels for both effects, keys first, and never increases alpha. */
export function applyImageEffects(
  pixels: Uint8ClampedArray,
  effects: ImageEffects,
): Uint8ClampedArray {
  if (pixels.length % 4 !== 0) throw new Error('Image pixels must contain complete RGBA values.');
  const output = new Uint8ClampedArray(pixels);
  const removal = effects.backgroundRemoval;
  const replacement = effects.colorReplace;
  const keyColor = removal ? hexToRgb(removal.color) : undefined;
  const from = replacement ? hexToRgb(replacement.from) : undefined;
  const to = replacement ? hexToRgb(replacement.to) : undefined;
  for (let index = 0; index < pixels.length; index += 4) {
    if (!pixels[index + 3]) continue;
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    if (removal && keyColor) {
      const key = colorMatchWeight(red, green, blue, keyColor, removal.tolerance, removal.softness);
      output[index + 3] = pixels[index + 3] * (1 - key);
    }
    if (replacement && from && to && replacement.strength > 0) {
      const weight =
        (colorMatchWeight(red, green, blue, from, replacement.tolerance, replacement.softness) *
          replacement.strength) /
        100;
      output[index] = red + (to[0] - red) * weight;
      output[index + 1] = green + (to[1] - green) * weight;
      output[index + 2] = blue + (to[2] - blue) * weight;
    }
  }
  return output;
}

/** Select the most common opaque border color, allowing small JPEG color variations. */
export function sampleBorderColor(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): string {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    pixels.length !== width * height * 4
  )
    throw new Error('Border sampling requires a complete image.');
  const buckets = new Map<number, { count: number; red: number; green: number; blue: number }>();
  const sample = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    if (pixels[index + 3] < 128) return;
    const [red, green, blue] = [pixels[index], pixels[index + 1], pixels[index + 2]];
    const key = ((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4);
    const bucket = buckets.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
    bucket.count++;
    bucket.red += red;
    bucket.green += green;
    bucket.blue += blue;
    buckets.set(key, bucket);
  };
  for (let x = 0; x < width; x++) {
    sample(x, 0);
    if (height > 1) sample(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    sample(0, y);
    if (width > 1) sample(width - 1, y);
  }
  const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant)
    throw new Error('The image border is already transparent. Choose a background color manually.');
  return `#${[dominant.red, dominant.green, dominant.blue]
    .map((value) =>
      Math.round(value / dominant.count)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}
