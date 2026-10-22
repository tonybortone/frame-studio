import type { Layer } from './types';

/** Move selected unlocked visual blocks one step; sound tracks retain their exact array slots. */
export function reorderVisualLayers(layers: Layer[], ids: string[], direction: number): Layer[] {
  if (!Number.isFinite(direction) || direction === 0) return layers;
  const requested = new Set(ids);
  const selected = new Set(
    layers
      .filter((layer) => requested.has(layer.id) && !layer.locked && layer.kind !== 'audio')
      .map((layer) => layer.id),
  );
  if (!selected.size) return layers;
  const visual = layers.filter((layer) => layer.kind !== 'audio');
  let moved = false;
  if (direction > 0) {
    for (let index = visual.length - 2; index >= 0; index--) {
      if (selected.has(visual[index].id) && !selected.has(visual[index + 1].id)) {
        [visual[index], visual[index + 1]] = [visual[index + 1], visual[index]];
        moved = true;
      }
    }
  } else {
    for (let index = 1; index < visual.length; index++) {
      if (selected.has(visual[index].id) && !selected.has(visual[index - 1].id)) {
        [visual[index], visual[index - 1]] = [visual[index - 1], visual[index]];
        moved = true;
      }
    }
  }
  if (!moved) return layers;
  let index = 0;
  return layers.map((layer) => (layer.kind === 'audio' ? layer : visual[index++]));
}
