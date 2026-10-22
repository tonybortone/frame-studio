import { describe, expect, it } from 'vitest';
import { createLayer } from '../src/core/project';
import { reorderVisualLayers } from '../src/core/layerOrder';

describe('visual layer order', () => {
  it('moves through visual neighbors while keeping audio at its exact array position', () => {
    const back = createLayer('shape'),
      audio = createLayer('audio'),
      front = createLayer('text');
    const layers = [back, audio, front];
    const result = reorderVisualLayers(layers, [back.id], 1);
    expect(result).toEqual([front, audio, back]);
    expect(result[1]).toBe(audio);
    expect(layers).toEqual([back, audio, front]);
    expect(reorderVisualLayers(result, [back.id], -1)).toEqual(layers);
  });
  it('keeps contiguous selected blocks stable regardless of selection click order', () => {
    const layers = Array.from({ length: 5 }, () => createLayer('shape'));
    const selected = [layers[2].id, layers[1].id];
    expect(reorderVisualLayers(layers, selected, 1)).toEqual([
      layers[0],
      layers[3],
      layers[1],
      layers[2],
      layers[4],
    ]);
    expect(reorderVisualLayers(layers, selected, -1)).toEqual([
      layers[1],
      layers[2],
      layers[0],
      layers[3],
      layers[4],
    ]);
  });
  it('moves disconnected selections one visual step without reversing their order', () => {
    const layers = Array.from({ length: 5 }, () => createLayer('shape'));
    expect(reorderVisualLayers(layers, [layers[2].id, layers[0].id], 1)).toEqual([
      layers[1],
      layers[0],
      layers[3],
      layers[2],
      layers[4],
    ]);
  });
  it('ignores locked and audio selections while moving eligible layers', () => {
    const locked = createLayer('shape', { locked: true }),
      audio = createLayer('audio'),
      back = createLayer('image'),
      front = createLayer('text');
    const layers = [locked, audio, back, front];
    expect(reorderVisualLayers(layers, [locked.id, audio.id], 1)).toBe(layers);
    expect(reorderVisualLayers(layers, [locked.id, audio.id, back.id], 1)).toEqual([
      locked,
      audio,
      front,
      back,
    ]);
  });
  it('returns the original array when empty, blocked at a boundary, or otherwise unchanged', () => {
    const layers = [createLayer('shape'), createLayer('text')];
    for (const [ids, direction] of [
      [[], 1],
      [['missing'], 1],
      [[layers[0].id], -1],
      [[layers[1].id], 1],
      [layers.map((layer) => layer.id), 1],
      [[layers[0].id], 0],
      [[layers[0].id], NaN],
    ] as Array<[string[], number]>) {
      expect(reorderVisualLayers(layers, ids, direction)).toBe(layers);
    }
  });
});
