import { describe, expect, it } from 'vitest';
import { createLayer, createProject, parseProject } from '../src/core/project';
import { getSelectionBounds, transformSelection } from '../src/core/selection';

describe('editable component transforms', () => {
  it('moves the selection bounds while preserving layout, audio, and unselected layers', () => {
    const base = createLayer('shape', { x: 20, y: 40, width: 200, height: 100 });
    const text = createLayer('text', { x: 40, y: 60, width: 120, height: 40 });
    const audio = createLayer('audio');
    const other = createLayer('shape');
    const result = transformSelection([base, text, audio, other], [base.id, text.id, audio.id], {
      x: 100,
      y: 200,
    });
    expect(result[0]).toMatchObject({ x: 100, y: 200 });
    expect(result[1]).toMatchObject({ x: 120, y: 220 });
    expect(result[2]).toBe(audio);
    expect(result[3]).toBe(other);
    expect(text.x).toBe(40);
  });

  it('scales rotated geometry, typography, and strokes around a common origin', () => {
    const a = createLayer('text', {
      x: 40,
      y: 60,
      width: 180,
      height: 50,
      rotation: 15,
      fontSize: 28,
    });
    const b = createLayer('drawing', {
      x: 80,
      y: 140,
      width: 100,
      height: 30,
      path: 'M 0 0 L 100 30',
      stroke: '#ef233c',
      strokeWidth: 4,
    });
    const c = createLayer('svg', {
      x: 100,
      y: 90,
      width: 40,
      height: 40,
      path: 'M 0 0 L 10 10',
      viewBox: '0 0 10 10',
      strokeWidth: 2,
    });
    const before = getSelectionBounds([a, b, c])!;
    const result = transformSelection([a, b, c], [a.id, b.id, c.id], { scale: 1.5 });
    const after = getSelectionBounds(result)!;
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(after.width).toBeCloseTo(before.width * 1.5);
    expect(after.height).toBeCloseTo(before.height * 1.5);
    expect(result[0]).toMatchObject({ fontSize: 42, rotation: 15 });
    expect(result[1].strokeWidth).toBe(6);
    expect(result[2].strokeWidth).toBe(2);
    expect(
      parseProject(JSON.stringify({ ...createProject(), layers: result })).layers,
    ).toHaveLength(3);
  });

  it('leaves a partially locked component intact and ignores empty selections', () => {
    const layers = [createLayer('shape'), createLayer('text', { locked: true })];
    expect(
      transformSelection(
        layers,
        layers.map((l) => l.id),
        { scale: 2 },
      ),
    ).toBe(layers);
    expect(transformSelection(layers, [], { x: 10 })).toBe(layers);
    expect(getSelectionBounds([createLayer('audio')])).toBeNull();
  });

  it('rejects invalid scaling without mutating the input', () => {
    const layer = createLayer('text');
    for (const scale of [0, -1, Infinity, NaN])
      expect(() => transformSelection([layer], [layer.id], { scale })).toThrow('positive size');
    for (const scale of [0.0001, 1000])
      expect(() => transformSelection([layer], [layer.id], { scale })).toThrow(
        'too small or too large',
      );
    expect(() => transformSelection([layer], [layer.id], { x: 100001 })).toThrow(
      'too small or too large',
    );
    expect(layer.fontSize).toBe(56);
  });
});
