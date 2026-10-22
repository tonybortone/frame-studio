import type { Layer } from './types';

export interface SelectionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SelectionTransform {
  /** Position of the selection's outer bounds, not each individual layer. */
  x?: number;
  y?: number;
  /** Uniform scale around the selection's top-left corner. */
  scale?: number;
}

export function getSelectionBounds(layers: readonly Layer[]): SelectionBounds | null {
  const visual = layers.filter((layer) => layer.kind !== 'audio');
  if (!visual.length) return null;
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const layer of visual) {
    const radians = (layer.rotation * Math.PI) / 180;
    const width =
      Math.abs(layer.width * Math.cos(radians)) + Math.abs(layer.height * Math.sin(radians));
    const height =
      Math.abs(layer.width * Math.sin(radians)) + Math.abs(layer.height * Math.cos(radians));
    const cx = layer.x + layer.width / 2;
    const cy = layer.y + layer.height / 2;
    left = Math.min(left, cx - width / 2);
    right = Math.max(right, cx + width / 2);
    top = Math.min(top, cy - height / 2);
    bottom = Math.max(bottom, cy + height / 2);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Move/resize a composition as one object, without flattening its editable parts. */
export function transformSelection(
  layers: Layer[],
  ids: string[],
  transform: SelectionTransform,
): Layer[] {
  const selected = new Set(ids);
  const visual = layers.filter((layer) => selected.has(layer.id) && layer.kind !== 'audio');
  const bounds = getSelectionBounds(visual);
  if (!bounds || visual.some((layer) => layer.locked)) return layers;
  const scale = transform.scale ?? 1;
  const x = transform.x ?? bounds.x;
  const y = transform.y ?? bounds.y;
  if (![scale, x, y].every(Number.isFinite) || scale <= 0)
    throw new Error('Choose a positive size and a valid position.');
  if (scale === 1 && x === bounds.x && y === bounds.y) return layers;
  return layers.map((layer) => {
    if (!selected.has(layer.id) || layer.kind === 'audio') return layer;
    return {
      ...layer,
      x: x + (layer.x - bounds.x) * scale,
      y: y + (layer.y - bounds.y) * scale,
      width: layer.width * scale,
      height: layer.height * scale,
      radius: layer.radius * scale,
      ...(layer.fontSize === undefined ? {} : { fontSize: layer.fontSize * scale }),
      ...(layer.strokeWidth === undefined || layer.viewBox
        ? {}
        : { strokeWidth: layer.strokeWidth * scale }),
    };
  });
}
