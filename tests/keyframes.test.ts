import { describe, expect, it } from 'vitest';
import type { Layer, PropertyKeyframe } from '../src/core/types';
import {
  createLayer,
  createProject,
  parseProject,
  splitLayer,
  duplicateLayers,
  changeAspectRatio,
} from '../src/core/project';
import {
  MAX_PROPERTY_KEYFRAMES,
  cubicBezierProgress,
  evaluateKeyframeProgress,
  evaluateKeyframeProperty,
  evaluateKeyframedLayer,
  getKeyframeCurve,
  getLocalKeyframeTime,
  keyframeGeometryPatch,
  moveKeyframe,
  removeKeyframe,
  transformKeyframeGeometry,
  upsertKeyframe,
} from '../src/core/keyframes';

const key = (
  id: string,
  time: number,
  value: number,
  easing: PropertyKeyframe['easing'] = 'linear',
): PropertyKeyframe => ({ id, time, value, easing });
const animated = (patch: Partial<Layer> = {}) =>
  createLayer('shape', {
    start: 2,
    duration: 8,
    x: 50,
    y: 60,
    width: 100,
    height: 80,
    keyframes: { x: [key('a', 1, 100), key('b', 5, 300)] },
    ...patch,
  });

describe('scalar property-keyframe evaluation', () => {
  it('leaves old projects and untracked properties unchanged, including object identity', () => {
    const plain = createLayer('shape');
    expect(evaluateKeyframedLayer(plain, 4)).toBe(plain);
    expect(evaluateKeyframeProperty(plain, 'x', 3)).toBe(plain.x);
    const layer = animated();
    const atMiddle = evaluateKeyframedLayer(layer, 5);
    expect(atMiddle.x).toBe(200);
    expect(atMiddle.y).toBe(layer.y);
    expect(layer.x).toBe(50);
    expect(atMiddle.keyframes).toBe(layer.keyframes);
  });

  it('holds the first and last authored values, and interpolates using clip-relative time', () => {
    const layer = animated();
    for (const [localTime, expected] of [
      [-10, 100],
      [0, 100],
      [1, 100],
      [2, 150],
      [3, 200],
      [5, 300],
      [20, 300],
    ])
      expect(evaluateKeyframeProperty(layer, 'x', localTime)).toBe(expected);
    expect(evaluateKeyframedLayer(layer, 4).x).toBe(150);
  });

  it('uses outgoing easing and holds until the exact next key', () => {
    const layer = animated({
      keyframes: {
        x: [key('a', 0, 10, 'hold'), key('b', 2, 30, 'linear'), key('c', 4, 50, 'ease-out')],
      },
    });
    expect(evaluateKeyframeProperty(layer, 'x', 1.999)).toBe(10);
    expect(evaluateKeyframeProperty(layer, 'x', 2)).toBe(30);
    expect(evaluateKeyframeProperty(layer, 'x', 3)).toBe(40);
  });

  it('solves Bézier x before y, including flat x tangents and standard curve presets', () => {
    expect(cubicBezierProgress(0.125, [0, 1, 0, 1])).toBeCloseTo(0.875, 8);
    expect(evaluateKeyframeProgress({ easing: 'ease-in' }, 0.5)).toBeCloseTo(0.3153568, 6);
    expect(evaluateKeyframeProgress({ easing: 'ease-out' }, 0.5)).toBeCloseTo(0.6846432, 6);
    expect(evaluateKeyframeProgress({ easing: 'ease-in-out' }, 0.5)).toBeCloseTo(0.5, 8);
    expect(evaluateKeyframeProgress({ easing: 'hold' }, 0.99)).toBe(0);
    expect(evaluateKeyframeProgress({ easing: 'hold' }, 1)).toBe(1);
    expect(getKeyframeCurve({ easing: 'linear' })).toEqual([0, 0, 1, 1]);
    expect(getKeyframeCurve({ easing: 'ease-in' })).toEqual([0.42, 0, 1, 1]);
  });

  it('permits custom overshoot while keeping opacity and size renderable', () => {
    const over: PropertyKeyframe = { ...key('a', 0, 0, 'custom'), curve: [0.1, 4, 0.9, 4] };
    const layer = animated({
      keyframes: {
        x: [over, key('b', 2, 100)],
        opacity: [over, key('b', 2, 1)],
        width: [{ ...over, value: 32760 }, key('b', 2, 32768)],
        height: [{ ...over, value: 100 }, key('b', 2, 0.01)],
      },
    });
    expect(evaluateKeyframeProperty(layer, 'x', 1)).toBeGreaterThan(100);
    expect(evaluateKeyframeProperty(layer, 'opacity', 1)).toBe(1);
    expect(evaluateKeyframeProperty(layer, 'width', 1)).toBe(32768);
    expect(evaluateKeyframeProperty(layer, 'height', 1)).toBe(0.01);
  });

  it('samples rotation directly, permitting deliberate multi-turn animations', () => {
    const layer = animated({ keyframes: { rotation: [key('a', 0, 0), key('b', 2, 720)] } });
    expect(evaluateKeyframeProperty(layer, 'rotation', 1)).toBe(360);
  });
});

describe('immutable keyframe editing', () => {
  it('inserts sorted keys, replaces same-time collisions and preserves other tracks', () => {
    const layer = animated({
      keyframes: { x: [key('a', 1, 100), key('b', 5, 300)], opacity: [key('o', 0, 0.5)] },
    });
    const before = JSON.stringify(layer);
    const inserted = {
      ...layer,
      ...upsertKeyframe(layer, 'x', 3, 220, { id: 'c', easing: 'ease-in' }),
    };
    expect(inserted.keyframes!.x!.map((frame) => frame.time)).toEqual([1, 3, 5]);
    expect(inserted.keyframes!.opacity).toBe(layer.keyframes!.opacity);
    const replaced = { ...inserted, ...upsertKeyframe(inserted, 'x', 3, 240) };
    expect(replaced.keyframes!.x![1]).toEqual(key('c', 3, 240, 'ease-in'));
    expect(JSON.stringify(layer)).toBe(before);
  });

  it('moves keys into collisions deterministically, clamps clip time, and removes tracks cleanly', () => {
    const layer = animated();
    const moved = { ...layer, ...moveKeyframe(layer, 'x', 'a', 5) };
    expect(moved.keyframes!.x).toEqual([key('a', 5, 100)]);
    const clamped = { ...moved, ...moveKeyframe(moved, 'x', 'a', -10) };
    expect(getLocalKeyframeTime(clamped, clamped.keyframes!.x![0])).toBe(0);
    expect(removeKeyframe(clamped, 'x', 'a')).toEqual({
      keyframes: undefined,
      keyframeOffset: undefined,
    });
    expect(moveKeyframe(layer, 'x', 'missing', 2)).toEqual({});
    expect(removeKeyframe(layer, 'x', 'missing')).toEqual({});
  });

  it('auto-keys paired position fields on one snapped frame while preserving authored base geometry', () => {
    const layer = animated({ keyframes: { x: [key('x', 0, 50)], y: [key('y', 0, 60)] } });
    const patch = keyframeGeometryPatch(layer, { x: 200, y: 300, opacity: 0.8 }, 3.019, 30);
    expect(patch.x).toBeUndefined();
    expect(patch.y).toBeUndefined();
    expect(patch.opacity).toBe(0.8);
    expect(patch.keyframes!.x![1].time).toBeCloseTo(31 / 30);
    expect(patch.keyframes!.y![1].time).toBe(patch.keyframes!.x![1].time);
    expect(patch.keyframes!.x![1].value).toBe(200);
    expect(patch.keyframes!.y![1].value).toBe(300);
    expect(layer.x).toBe(50);
  });

  it('rebases negative origins without shifting local positions on other properties', () => {
    const layer = animated({
      keyframeOffset: -2,
      keyframes: { x: [key('x', 0, 100)], y: [key('y', 1, 60)] },
    });
    const localY = getLocalKeyframeTime(layer, layer.keyframes!.y![0]);
    const updated = { ...layer, ...upsertKeyframe(layer, 'x', 0, 50, { id: 'new' }) };
    expect(updated.keyframeOffset).toBe(0);
    expect(updated.keyframes!.x!.map((frame) => frame.time)).toEqual([0, 2]);
    expect(getLocalKeyframeTime(updated, updated.keyframes!.y![0])).toBe(localY);
  });

  it('bounds values and key counts and rejects nonfinite updates or invalid curves', () => {
    const layer = animated();
    expect(upsertKeyframe(layer, 'opacity', 2, 10).keyframes!.opacity![0].value).toBe(1);
    expect(() => upsertKeyframe(layer, 'x', NaN, 20)).toThrow('finite');
    expect(() => upsertKeyframe(layer, 'x', 2, Infinity)).toThrow('finite');
    expect(() =>
      upsertKeyframe(layer, 'x', 2, 10, { easing: 'custom', curve: [2, 0, 1, 1] }),
    ).toThrow('Bézier');
    const full = animated({
      duration: 300,
      keyframes: {
        x: Array.from({ length: MAX_PROPERTY_KEYFRAMES }, (_, i) => key(`k${i}`, i, i)),
      },
    });
    expect(() => upsertKeyframe(full, 'x', 299, 20)).toThrow('up to');
  });
});

describe('keyframe project persistence and geometry operations', () => {
  it('round-trips every property and easing in project and reusable components', () => {
    const project = createProject();
    const layer = animated({
      keyframeOffset: 1,
      keyframes: {
        x: [
          { ...key('a', 0, 20, 'custom'), curve: [0.2, -0.5, 0.8, 1.5] },
          key('b', 2, 50, 'hold'),
        ],
        y: [key('c', 0, 30, 'ease-in')],
        width: [key('d', 0, 100, 'ease-out')],
        height: [key('e', 0, 80, 'ease-in-out')],
        rotation: [key('f', 0, 720)],
        opacity: [key('g', 0, 0.5)],
      },
    });
    project.layers = [layer];
    project.components = [{ id: 'motion-card', name: 'Motion card', layers: [layer] }];
    expect(parseProject(JSON.stringify(project))).toEqual(project);
    const plain = createProject();
    expect(parseProject(JSON.stringify(plain))).toEqual(plain);
    expect(parseProject(JSON.stringify(plain)).layers[0]).not.toHaveProperty('keyframes');
  });

  it('preserves exact cubic and hold sampling after repeated splits and non-destructive trims', () => {
    const layer = animated({
      keyframes: {
        x: [{ ...key('a', 0, 0, 'custom'), curve: [0.05, -0.4, 0.8, 1.4] }, key('b', 8, 800)],
        opacity: [key('a', 0, 0.2, 'hold'), key('b', 3.5, 0.8)],
      },
    });
    const [left, right] = splitLayer(layer, 5.1);
    const [, last] = splitLayer(right, 7.25);
    for (const part of [left, right, last])
      for (let sample = 0; sample <= 20; sample++) {
        const time = part.start + (part.duration * sample) / 20;
        for (const property of ['x', 'opacity'] as const)
          expect(evaluateKeyframedLayer(part, time)[property]).toBeCloseTo(
            evaluateKeyframedLayer(layer, time)[property],
            9,
          );
      }
    const trimmed = {
      ...layer,
      start: layer.start + 2.4,
      duration: layer.duration - 2.4,
      keyframeOffset: 2.4,
    };
    expect(evaluateKeyframedLayer(trimmed, 6).x).toBeCloseTo(
      evaluateKeyframedLayer(layer, 6).x,
      10,
    );
    expect(trimmed.keyframes).toBe(layer.keyframes);
    expect(getLocalKeyframeTime(right, right.keyframes!.x![0])).toBeCloseTo(-3.1);
  });

  it('deep-copies reusable curves and translates duplicate/component geometry consistently', () => {
    const layer = animated({
      keyframes: {
        x: [{ ...key('a', 0, 10, 'custom'), curve: [0.1, 0.2, 0.3, 0.4] }, key('b', 2, 200)],
        y: [key('c', 0, 20)],
      },
    });
    const copy = duplicateLayers([layer])[0];
    expect(copy.keyframes).toEqual(layer.keyframes);
    expect(copy.keyframes).not.toBe(layer.keyframes);
    expect(copy.keyframes!.x![0].curve).not.toBe(layer.keyframes!.x![0].curve);
    const translated = {
      ...copy,
      x: copy.x + 24,
      y: copy.y + 24,
      ...transformKeyframeGeometry(copy, { translateX: 24, translateY: 24 }),
    };
    for (const time of [2, 2.5, 3, 4]) {
      expect(evaluateKeyframedLayer(translated, time).x).toBeCloseTo(
        evaluateKeyframedLayer(layer, time).x + 24,
        8,
      );
      expect(evaluateKeyframedLayer(translated, time).y).toBeCloseTo(
        evaluateKeyframedLayer(layer, time).y + 24,
        8,
      );
    }
    const component = { ...copy, start: 10 };
    expect(evaluateKeyframedLayer(component, 11).x).toBe(evaluateKeyframedLayer(layer, 3).x);
  });

  it('scales animated absolute geometry through aspect-ratio and group transforms', () => {
    const layer = animated({
      keyframes: {
        x: [key('x', 0, 100)],
        y: [key('y', 0, 50)],
        width: [key('w', 0, 300)],
        height: [key('h', 0, 150)],
        rotation: [key('r', 0, 45)],
      },
    });
    const project = { ...createProject(), width: 1000, height: 500, layers: [layer] };
    const resized = changeAspectRatio(project, 1000, 1000).layers[0];
    expect(evaluateKeyframedLayer(resized, 3)).toMatchObject({
      x: 100,
      y: 300,
      width: 300,
      height: 150,
      rotation: 45,
    });
    const group = {
      ...layer,
      ...transformKeyframeGeometry(layer, { scale: 2, translateX: -50, translateY: -60 }),
    };
    expect(evaluateKeyframedLayer(group, 3)).toMatchObject({
      x: 150,
      y: 40,
      width: 600,
      height: 300,
      rotation: 45,
    });
    expect(layer.keyframes!.x![0].value).toBe(100);
  });

  it('rejects malformed keys, nonfinite values, duplicate IDs/times, and unsupported tracks', () => {
    const invalid = [
      null,
      [],
      { color: [] },
      { x: null },
      { x: [key('a', -1, 0)] },
      { x: [key('a', 172801, 0)] },
      { x: [key('a', 0, 100001)] },
      { width: [key('a', 0, 0)] },
      { opacity: [key('a', 0, 1.1)] },
      { x: [key('a', 2, 0), key('b', 1, 0)] },
      { x: [key('a', 1, 0), key('b', 1, 5)] },
      { x: [key('a', 1, 0), key('a', 2, 5)] },
      { x: [{ ...key('a', 1, 0), easing: 'spring' }] },
      { x: [{ ...key('a', 1, 0), extra: true }] },
      { x: [key('a', 1, 0, 'custom')] },
      { x: [{ ...key('a', 1, 0, 'custom'), curve: [0, 0, 2, 1] }] },
      { x: [{ ...key('a', 1, 0, 'custom'), curve: [0, -5, 1, 1] }] },
      { x: [{ ...key('a', 1, 0), curve: [0, 0, 1, 1] }] },
      { x: Array.from({ length: MAX_PROPERTY_KEYFRAMES + 1 }, (_, i) => key(`${i}`, i, i)) },
    ];
    for (const frames of invalid)
      for (const component of [false, true]) {
        const project = createProject();
        project.layers = [{ ...animated(), keyframes: frames as Layer['keyframes'] }];
        if (component) {
          project.components = [{ id: 'bad', name: 'Bad', layers: project.layers }];
          project.layers = [];
        }
        expect(() => parseProject(JSON.stringify(project))).toThrow();
      }
    const project = { ...createProject(), layers: [animated()] };
    expect(() =>
      parseProject(JSON.stringify(project).replace('"value":100', '"value":1e999')),
    ).toThrow('finite');
    project.layers = [createLayer('audio', { keyframes: { x: [key('a', 0, 10)] } })];
    expect(() => parseProject(JSON.stringify(project))).toThrow('visual layer');
  });
});
