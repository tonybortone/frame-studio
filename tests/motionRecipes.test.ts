import { describe, expect, it } from 'vitest';
import { createLayer, createProject, parseProject, splitLayer } from '../src/core/project';
import { applyMotionRecipe, MOTION_RECIPES, type MotionRecipeId } from '../src/core/motionRecipes';
import {
  evaluateKeyframedLayer,
  evaluateKeyframeProperty,
  getLocalKeyframeTime,
  MAX_PROPERTY_KEYFRAMES,
} from '../src/core/keyframes';
import { projectElementPoint } from '../src/core/element3d';
import type { Layer, Project, PropertyKeyframe } from '../src/core/types';

const key = (
  id: string,
  time: number,
  value: number,
  easing: PropertyKeyframe['easing'] = 'linear',
): PropertyKeyframe => ({ id, time, value, easing });
const projectOf = (...layers: Layer[]): Project => ({ ...createProject(), duration: 20, layers });
const shape = (patch: Partial<Layer> = {}) =>
  createLayer('shape', { x: 200, y: 160, width: 240, height: 120, duration: 20, ...patch });
const apply = (project: Project, recipeId: MotionRecipeId, options = {}) =>
  applyMotionRecipe(
    project,
    project.layers.map((layer) => layer.id),
    { recipeId, at: 0, duration: 2, stagger: 0, ...options },
  );
const localTimes = (layer: Layer, property: 'x' | 'y' | 'opacity' = 'y') =>
  layer.keyframes![property]!.map((frame) => getLocalKeyframeTime(layer, frame));

function assertConstantBefore(
  layer: Layer,
  original: Layer,
  property: 'y' | 'opacity' | 'blur',
  end: number,
) {
  for (let t = 0; t < end; t += 0.0317)
    expect(evaluateKeyframeProperty(layer, property, t)).toBeCloseTo(
      evaluateKeyframeProperty(original, property, t),
      8,
    );
}

describe('editable motion recipe catalog', () => {
  it('bakes every recipe into valid, finite, ordinary keyframes without mutating source artwork', () => {
    for (const recipe of MOTION_RECIPES) {
      const layer = shape({
        kind: recipe.id === 'type-on' ? 'text' : 'shape',
        text: 'Build something lovely',
        fontSize: 32,
        width: 800,
        height: 2600,
      });
      const project = projectOf(layer);
      const original = JSON.stringify(project);
      const result = apply(project, recipe.id, { duration: recipe.defaultDuration });
      expect(JSON.stringify(project)).toBe(original);
      expect(result.affectedIds).toEqual([layer.id]);
      expect(result.layers[0].keyframes).toBeDefined();
      expect(result.layers[0].x).toBe(layer.x);
      expect(result.layers[0].width).toBe(layer.width);
      expect(result.layers[0].fontSize).toBe(layer.fontSize);
      expect(
        parseProject(JSON.stringify({ ...project, layers: result.layers })).layers[0].keyframes,
      ).toEqual(result.layers[0].keyframes);
      for (const track of Object.values(result.layers[0].keyframes!)) {
        expect(track!.length).toBeGreaterThanOrEqual(2);
        expect(new Set(track!.map((frame) => frame.time)).size).toBe(track!.length);
        expect(new Set(track!.map((frame) => frame.id)).size).toBe(track!.length);
      }
    }
  });

  it('is deterministic and retains untouched layers and unrelated tracks by identity', () => {
    const original = shape({ keyframes: { rotation: [key('rotation', 0, 30)] } });
    const untouched = shape();
    const project = projectOf(original, untouched);
    const options = { recipeId: 'soft-rise' as const, at: 1, duration: 2 };
    const result = applyMotionRecipe(project, [original.id], options);
    expect(applyMotionRecipe(project, [original.id], options)).toEqual(result);
    expect(result.layers[1]).toBe(untouched);
    expect(result.layers[0].keyframes!.rotation).toBe(original.keyframes!.rotation);
  });

  it('clears overlapping legacy motion and keeps masks, text and color edits', () => {
    const original = shape({
      animation: 'pop',
      animationDelay: 1,
      loopAnimation: 'float',
      exitAnimation: 'fade',
      exitDuration: 0.5,
      mask: 'ellipse',
      brightness: 1.2,
      transform3d: { enabled: true, rotateX: 4, rotateY: 8, z: 3, motion: 'float' },
    });
    const next = apply(projectOf(original), 'soft-rise').layers[0];
    expect(next).toMatchObject({
      animation: 'none',
      animationDelay: 0,
      loopAnimation: 'none',
      exitAnimation: 'none',
      exitDuration: 0,
      mask: 'ellipse',
      brightness: 1.2,
      transform3d: { enabled: true, rotateX: 4, rotateY: 8, z: 3, motion: 'none' },
    });
  });

  it('honors direction, intensity, text mode and complete closed float cycles', () => {
    const layer = shape();
    const project = projectOf(layer);
    const left = apply(project, 'slide', { direction: 'left', strength: 0.5 }).layers[0];
    const right = apply(project, 'slide', { direction: 'right', strength: 1 }).layers[0];
    expect(evaluateKeyframedLayer(left, 0).x).toBeLessThan(layer.x);
    expect(evaluateKeyframedLayer(right, 0).x).toBeGreaterThan(layer.x);
    expect(evaluateKeyframedLayer(right, 0).x - layer.x).toBeCloseTo(
      (layer.x - evaluateKeyframedLayer(left, 0).x) * 2,
    );
    const floating = apply(project, 'float').layers[0];
    expect(evaluateKeyframeProperty(floating, 'y', 0)).toBe(layer.y);
    expect(evaluateKeyframeProperty(floating, 'y', 2)).toBe(layer.y);
    expect(evaluateKeyframeProperty(floating, 'y', 0.5)).toBeLessThan(layer.y);
    expect(evaluateKeyframeProperty(floating, 'y', 1.5)).toBeGreaterThan(layer.y);
    expect(apply(project, 'wipe', { direction: 'center' }).layers[0].revealDirection).toBe(
      'center',
    );
    const text = shape({ kind: 'text', text: 'Hello motion' });
    const typed = apply(projectOf(text), 'type-on', { textMode: 'words' }).layers[0];
    expect(typed.textRevealMode).toBe('words');
    expect(evaluateKeyframeProperty(typed, 'textReveal', 1)).toBeCloseTo(0.5);
  });
});

describe('component grouping and sequencing', () => {
  it('expands a selected grouped member and preserves component geometry throughout spring motion', () => {
    const a = shape({ groupId: 'card', x: 100, y: 100, width: 400, height: 240 });
    const b = shape({
      groupId: 'card',
      x: 140,
      y: 140,
      width: 200,
      height: 60,
      kind: 'text',
      text: 'Heading',
      fontSize: 30,
    });
    const other = shape();
    const result = applyMotionRecipe(projectOf(a, b, other), [a.id], {
      recipeId: 'spring-pop',
      at: 0,
      duration: 2,
    });
    expect(result.affectedIds).toEqual([a.id, b.id]);
    expect(result.expandedIds).toEqual([b.id]);
    expect(result.layers[2]).toBe(other);
    for (let t = 0; t <= 2; t += 0.013) {
      const aa = evaluateKeyframedLayer(result.layers[0], t),
        bb = evaluateKeyframedLayer(result.layers[1], t);
      const scale = aa.width / a.width;
      expect(bb.width / b.width).toBeCloseTo(scale, 8);
      expect(bb.height / b.height).toBeCloseTo(scale, 8);
      expect(bb.x - aa.x).toBeCloseTo((b.x - a.x) * scale, 8);
      expect(bb.y - aa.y).toBeCloseTo((b.y - a.y) * scale, 8);
    }
    expect(result.layers[1].fontSize).toBe(30);
  });

  it('keeps adjacent edges connected through shared-plane tilt and website camera movement', () => {
    const a = shape({ groupId: 'page', x: 0, y: 0, width: 600, height: 800 });
    const b = shape({ groupId: 'page', x: 0, y: 800, width: 600, height: 800 });
    for (const recipe of ['tilt-reveal', 'page-tour'] as const) {
      const result = apply(projectOf(a, b), recipe, { duration: 12 });
      expect(result.layers[0].transform3d).toEqual(result.layers[1].transform3d);
      for (let t = 0; t <= 12; t += 0.137) {
        const aa = evaluateKeyframedLayer(result.layers[0], t),
          bb = evaluateKeyframedLayer(result.layers[1], t);
        const edgeA = projectElementPoint(aa, t, { x: aa.width * 0.32, y: aa.height });
        const edgeB = projectElementPoint(bb, t, { x: bb.width * 0.32, y: 0 });
        expect(edgeA.x).toBeCloseTo(edgeB.x, 7);
        expect(edgeA.y).toBeCloseTo(edgeB.y, 7);
      }
    }
  });

  it('fits the complete tall page at the end and pans at constant detail scale', () => {
    const page = shape({ x: 50, y: 100, width: 800, height: 3000 });
    const project = projectOf(page);
    const result = apply(project, 'page-tour', { duration: 12 }).layers[0];
    const top = evaluateKeyframedLayer(result, Math.round(12 * 0.16 * project.fps) / project.fps),
      bottom = evaluateKeyframedLayer(result, Math.round(12 * 0.57 * project.fps) / project.fps),
      final = evaluateKeyframedLayer(result, 12);
    expect(top.width).toBeCloseTo(bottom.width, 5);
    expect(top.y).toBeGreaterThan(bottom.y);
    expect(final.width).toBeLessThanOrEqual(project.width * 0.78 + 1e-8);
    expect(final.height).toBeLessThanOrEqual(project.height * 0.82 + 1e-8);
    expect(final.x + final.width / 2).toBeCloseTo(project.width / 2);
    expect(final.y + final.height / 2).toBeCloseTo(project.height / 2);
    expect(final.transform3d).toMatchObject({ rotateX: 0, rotateY: 0 });
  });

  it('applies forward/reverse stagger by component and supports together/individual', () => {
    const a = shape({ groupId: 'a' }),
      b = shape({ groupId: 'a' }),
      c = shape({ groupId: 'b' });
    const project = projectOf(a, b, c);
    const forward = apply(project, 'float', { at: 1, stagger: 0.4 });
    expect(localTimes(forward.layers[0])[0]).toBe(0); // static hold anchor
    expect(localTimes(forward.layers[0])[1]).toBe(1);
    expect(localTimes(forward.layers[1])[1]).toBe(1);
    expect(localTimes(forward.layers[2])[1]).toBe(1.4);
    const reverse = apply(project, 'float', { at: 1, stagger: 0.4, order: 'reverse' });
    expect(localTimes(reverse.layers[0])[1]).toBe(1.4);
    expect(localTimes(reverse.layers[2])[1]).toBe(1);
    expect(reverse.end).toBe(3.4);
    const together = apply(project, 'float', { at: 1, stagger: 0.4, grouping: 'together' });
    expect(together.end).toBe(3);
    const individual = apply(project, 'float', { at: 1, stagger: 0.4, grouping: 'individual' });
    expect(localTimes(individual.layers[1])[1]).toBe(1.4);
    expect(individual.end).toBe(3.8);
  });

  it('expands one selected member for Together while explicit individual mode stays independent', () => {
    const first = shape({ groupId: 'card', x: 100 }),
      sibling = shape({ groupId: 'card', x: 180 });
    const project = projectOf(first, sibling);
    const together = applyMotionRecipe(project, [first.id], {
      recipeId: 'spring-pop',
      at: 0,
      duration: 2,
      grouping: 'together',
    });
    expect(together.affectedIds).toEqual([first.id, sibling.id]);
    expect(together.expandedIds).toEqual([sibling.id]);
    const individual = applyMotionRecipe(project, [first.id], {
      recipeId: 'spring-pop',
      at: 0,
      duration: 2,
      grouping: 'individual',
    });
    expect(individual.affectedIds).toEqual([first.id]);
    expect(individual.layers[1]).toBe(sibling);
  });

  it('skips a locked sibling group before merging the remaining Together selection', () => {
    const first = shape({ groupId: 'locked-card' }),
      sibling = shape({ groupId: 'locked-card', locked: true });
    const editable = shape({ groupId: 'open-card' }),
      editableSibling = shape({ groupId: 'open-card' }),
      audio = shape({ kind: 'audio' });
    const project = projectOf(first, sibling, editable, editableSibling, audio);
    const result = applyMotionRecipe(project, [first.id, editable.id, audio.id], {
      recipeId: 'spring-pop',
      at: 0,
      duration: 2,
      grouping: 'together',
      stagger: 0.5,
    });
    expect(result.affectedIds).toEqual([editable.id, editableSibling.id]);
    expect(new Set(result.skippedIds)).toEqual(new Set([first.id, sibling.id, audio.id]));
    expect(result.expandedIds).toEqual([editableSibling.id]);
    expect(result.layers[0]).toBe(first);
    expect(result.layers[1]).toBe(sibling);
    expect(result.layers[4]).toBe(audio);
    expect(result.end).toBe(2);
  });

  it('skips locked groups atomically and does not animate audio', () => {
    const a = shape({ groupId: 'card' }),
      b = shape({ groupId: 'card', locked: true }),
      c = shape(),
      audio = shape({ kind: 'audio' });
    const project = projectOf(a, b, c, audio);
    const result = apply(project, 'float');
    expect(result.affectedIds).toEqual([c.id]);
    expect(new Set(result.skippedIds)).toEqual(new Set([a.id, b.id, audio.id]));
    expect(result.layers[0]).toBe(a);
    expect(result.layers[1]).toBe(b);
    expect(result.layers[3]).toBe(audio);
    expect(() =>
      applyMotionRecipe(project, [a.id], { recipeId: 'float', at: 0, duration: 2 }),
    ).toThrow('unlocked visual');
  });
});

describe('timeline windows, persistence and curve preservation', () => {
  it('anchors static channels so a late entrance does not alter any earlier frame', () => {
    const original = shape();
    const next = apply(projectOf(original), 'soft-rise', { at: 4, hideBefore: false }).layers[0];
    for (const property of ['y', 'opacity', 'blur'] as const)
      assertConstantBefore(next, original, property, 4);
    expect(evaluateKeyframeProperty(next, 'opacity', 4)).toBe(0);
    expect(evaluateKeyframeProperty(next, 'opacity', 6)).toBe(1);
  });

  it('hides delayed entrances by default without rewriting existing visibility tracks', () => {
    const a = shape(),
      b = shape();
    const project = projectOf(a, b);
    const delayed = apply(project, 'soft-rise', { at: 2, stagger: 0.5 });
    expect(evaluateKeyframeProperty(delayed.layers[0], 'opacity', 1)).toBe(0);
    expect(evaluateKeyframeProperty(delayed.layers[1], 'opacity', 2.4)).toBe(0);
    expect(evaluateKeyframeProperty(delayed.layers[1], 'opacity', 4.5)).toBe(1);
    const tracked = shape({ keyframes: { opacity: [key('old', 0, 0.8)] } });
    const preserved = apply(projectOf(tracked), 'soft-rise', { at: 2 }).layers[0];
    expect(evaluateKeyframeProperty(preserved, 'opacity', 1)).toBe(0.8);
    const typed = apply(projectOf(shape({ kind: 'text', text: 'Delayed words' })), 'type-on', {
      at: 2,
    }).layers[0];
    expect(evaluateKeyframeProperty(typed, 'textReveal', 1)).toBe(0);
  });

  it('reapplying an entrance keeps its destination visible and page tours use authored geometry', () => {
    for (const recipe of [
      'soft-rise',
      'spring-pop',
      'tilt-reveal',
      'type-on',
      'page-tour',
    ] as const) {
      const original = shape({
        kind: recipe === 'type-on' ? 'text' : 'shape',
        text: 'Hello',
        width: 600,
        height: 1800,
      });
      const project = projectOf(original);
      const once = apply(project, recipe).layers;
      const twice = apply({ ...project, layers: once }, recipe).layers;
      const firstEnd = evaluateKeyframedLayer(once[0], 2),
        secondEnd = evaluateKeyframedLayer(twice[0], 2);
      expect(secondEnd.opacity).toBe(firstEnd.opacity);
      expect(secondEnd.width).toBeCloseTo(firstEnd.width);
      expect(secondEnd.x).toBeCloseTo(firstEnd.x);
      if (recipe === 'type-on') expect(secondEnd.textReveal).toBe(1);
    }
  });

  it('snaps intermediate keys to composition frames even when a clip starts between frames', () => {
    const original = shape({ start: 0.11, duration: 10 });
    const next = apply(projectOf(original), 'spring-pop', { at: 1, duration: 2 }).layers[0];
    for (const frame of next.keyframes!.width!.filter(
      (frame) => getLocalKeyframeTime(next, frame) > 0,
    )) {
      const projectFrame = (getLocalKeyframeTime(next, frame) + next.start) * 30;
      expect(projectFrame).toBeCloseTo(Math.round(projectFrame), 7);
    }
  });

  it('splits crossing Bézier segments exactly when recipe boundary values agree', () => {
    // Float returns to its sampled start. Matching values at 2 and 4 make both boundaries continuous.
    const original = shape({
      keyframes: {
        y: [
          { ...key('a', 0, 100, 'custom'), curve: [0.2, 0.5, 0.7, 0.9] },
          key('b', 3, 200, 'ease-in-out'),
          key('c', 6, 100),
        ],
      },
    });
    const startValue = evaluateKeyframeProperty(original, 'y', 2);
    // Set the second segment end so y(4) exactly matches y(2).
    const fraction = (evaluateKeyframeProperty(original, 'y', 4) - 200) / (100 - 200);
    original.keyframes!.y![2].value = 200 + (startValue - 200) / fraction;
    const project = projectOf(original);
    const next = apply(project, 'float', { at: 2, duration: 2 }).layers[0];
    expect(next.keyframes!.y!.find((frame) => frame.id === 'a')?.value).toBe(100);
    expect(next.keyframes!.y!.find((frame) => frame.id === 'c')?.value).toBe(
      original.keyframes!.y![2].value,
    );
    for (let t = 0; t < 2; t += 0.017)
      expect(evaluateKeyframeProperty(next, 'y', t)).toBeCloseTo(
        evaluateKeyframeProperty(original, 'y', t),
        7,
      );
    for (let t = 4; t <= 7; t += 0.017)
      expect(evaluateKeyframeProperty(next, 'y', t)).toBeCloseTo(
        evaluateKeyframeProperty(original, 'y', t),
        7,
      );
    expect(next.keyframes!.y!.find((frame) => frame.id === 'b')).toBeUndefined();
    expect(
      parseProject(JSON.stringify({ ...project, layers: [next] })).layers[0].keyframes,
    ).toEqual(next.keyframes);
  });

  it('rejects incompatible crossing motion without changing any layer', () => {
    const first = shape(),
      animated = shape({ keyframes: { y: [key('a', 0, 0), key('b', 8, 800)] } });
    const project = projectOf(first, animated),
      snapshot = JSON.stringify(project);
    expect(() => apply(project, 'soft-rise', { at: 2, duration: 2 })).toThrow('already moving');
    expect(JSON.stringify(project)).toBe(snapshot);
    expect(() => apply(projectOf(animated), 'float', { at: 2, duration: 2 })).toThrow(
      'later animation',
    );
  });

  it('rejects shared-plane changes that would move an earlier 3D pose, and keeps disabled poses flat', () => {
    const tilted = shape({
      transform3d: { enabled: true, rotateX: 12, rotateY: -18, z: 0, motion: 'none' },
    });
    expect(() => apply(projectOf(tilted), 'tilt-reveal', { at: 3 })).toThrow('existing 3D origin');
    const disabled = { ...tilted, transform3d: { ...tilted.transform3d!, enabled: false } };
    const next = apply(projectOf(disabled), 'tilt-reveal', { at: 3, hideBefore: false }).layers[0];
    const before = evaluateKeyframedLayer(next, 1);
    expect(before.transform3d).toMatchObject({ rotateX: 0, rotateY: 0, z: 0 });
    const position = projectElementPoint(before, 1, { x: 0, y: 0 });
    expect(position.x).toBeCloseTo(disabled.x);
    expect(position.y).toBeCloseTo(disabled.y);
  });

  it('does not change existing reveal modes outside the chosen interval', () => {
    const masked = shape({
      revealDirection: 'left',
      keyframes: { reveal: [key('r0', 0, 0), key('r1', 1, 1)] },
    });
    expect(() => apply(projectOf(masked), 'wipe', { at: 3, direction: 'right' })).toThrow(
      'reveal direction or text mode',
    );
    const typed = shape({
      kind: 'text',
      text: 'Keep the timing',
      textRevealMode: 'characters',
      keyframes: { textReveal: [key('t0', 0, 0), key('t1', 1, 1)] },
    });
    expect(() => apply(projectOf(typed), 'type-on', { at: 3, textMode: 'words' })).toThrow(
      'reveal direction or text mode',
    );
    const partial = shape({ revealDirection: 'left', reveal: 0.5 });
    expect(() =>
      apply(projectOf(partial), 'wipe', { at: 3, direction: 'right', hideBefore: false }),
    ).toThrow('reveal direction or text mode');
  });

  it('rejects a clipped overshoot rather than altering its surrounding curve', () => {
    const original = shape({
      keyframes: {
        opacity: [{ ...key('a', 0, 0, 'custom'), curve: [0.2, 4, 0.8, 4] }, key('b', 6, 1)],
      },
    });
    const project = projectOf(original),
      before = JSON.stringify(project);
    expect(() => apply(project, 'soft-rise', { at: 0, duration: 2 })).toThrow('bounded overshoot');
    expect(JSON.stringify(project)).toBe(before);
  });

  it('replaces same-time boundary keys without duplicates and counts replaced keys', () => {
    const original = shape({
      keyframes: { y: [key('a', 0, 160), key('b', 2, 180), key('c', 4, 160), key('d', 7, 160)] },
    });
    const result = apply(projectOf(original), 'float', { at: 0, duration: 4 });
    const frames = result.layers[0].keyframes!.y!;
    expect(frames.filter((frame) => frame.time === 0)).toHaveLength(1);
    expect(frames.filter((frame) => frame.time === 4)).toHaveLength(1);
    expect(frames.find((frame) => frame.id === 'd')).toEqual(original.keyframes!.y![3]);
    expect(result.replacedKeyframes).toBe(3);
  });

  it('handles trimmed negative offsets and retained split timing without shifting unrelated keys', () => {
    const trimmed = shape({
      start: 1,
      duration: 10,
      keyframeOffset: -2,
      keyframes: { rotation: [key('r', 1, 30)] },
    });
    const next = apply(projectOf(trimmed), 'soft-rise', { at: 1 }).layers[0];
    expect(next.keyframeOffset).toBe(0);
    expect(getLocalKeyframeTime(next, next.keyframes!.rotation![0])).toBe(3);
    expect(localTimes(next, 'opacity')).toEqual([0, 2]);
    const original = shape();
    const baked = apply(projectOf(original), 'float', { duration: 4 }).layers[0];
    const [, right] = splitLayer(baked, 2)!;
    const rightProject = projectOf(right);
    const again = apply(rightProject, 'soft-rise', { at: 7, duration: 2 }).layers[0];
    expect(again.keyframeOffset).toBe(2);
    expect(getLocalKeyframeTime(again, again.keyframes!.opacity![1])).toBe(5);
    expect(evaluateKeyframeProperty(again, 'opacity', 7)).toBe(1);
  });
});

describe('atomic recipe validation', () => {
  it('rejects windows outside any member or composition, and ambiguous sub-frame recipes', () => {
    const early = shape({ start: 1, duration: 4 }),
      short = shape({ groupId: 'a', duration: 1 }),
      long = shape({ groupId: 'a' });
    expect(() => apply(projectOf(early), 'float')).toThrow('not visible');
    expect(() => apply(projectOf(short, long), 'float')).toThrow('not visible');
    expect(() => apply(projectOf(shape(), shape()), 'float', { at: 18, stagger: 1 })).toThrow(
      'beyond the composition',
    );
    expect(() => apply(projectOf(shape()), 'spring-pop', { duration: 2 / 30 })).toThrow(
      'longer duration',
    );
  });

  it('rejects nonfinite inputs and transforms that would be silently clamped', () => {
    const project = projectOf(shape());
    for (const options of [
      { at: NaN },
      { duration: Infinity },
      { strength: 0 },
      { strength: 3 },
      { stagger: -1 },
    ])
      expect(() => apply(project, 'float', options)).toThrow();
    expect(() => apply(projectOf(shape({ y: 99999 })), 'soft-rise', { strength: 2 })).toThrow(
      'y must be between',
    );
    expect(() => apply(projectOf(shape({ width: 32768 })), 'spring-pop')).toThrow(
      'width must be between',
    );
  });

  it('rejects track overflow before any project mutation and preserves locked text', () => {
    const full = shape({
      keyframes: {
        y: Array.from({ length: MAX_PROPERTY_KEYFRAMES }, (_, i) => key(`k${i}`, 5 + i / 30, 160)),
      },
    });
    const project = projectOf(shape(), full),
      snapshot = JSON.stringify(project);
    expect(() => apply(project, 'float', { at: 0, duration: 2 })).toThrow('exceed 256');
    expect(JSON.stringify(project)).toBe(snapshot);
    const text = shape({ kind: 'text', text: 'Hello', locked: true });
    expect(() => apply(projectOf(text), 'type-on')).toThrow('unlocked text');
  });
});
