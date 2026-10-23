import { describe, expect, it } from 'vitest';
import type { Layer } from '../src/core/types';
import {
  createLayer,
  createProject,
  duplicateLayers,
  parseProject,
  splitLayer,
} from '../src/core/project';
import {
  ENTRANCE_OPTIONS,
  EXIT_OPTIONS,
  LOOP_OPTIONS,
  getAnimationDistance,
  getLoopTiming,
  getMotionTiming,
  resetMotionPatch,
} from '../src/core/motion';
import { MOTION_PRESETS, detectSelectionMotion, getMotionPresetPatch } from '../src/core/presets';
import { animationState, renderFrame, type MediaCache } from '../src/engine/renderer';
import { exportSvg } from '../src/engine/export';
import { getElement3DQuad } from '../src/core/element3d';

const layerWith = (patch: Partial<Layer> = {}) =>
  createLayer('shape', {
    start: 1,
    duration: 6,
    animationDuration: 2,
    animationEasing: 'linear',
    ...patch,
  });

describe('entrance, exit and loop motion', () => {
  it('preserves legacy distances, timing, easing and exit fade exactly', () => {
    for (const animation of ['none', 'fade', 'rise', 'pop', 'slide'] as const) {
      const layer = layerWith({
        animation,
        animationDuration: undefined,
        animationEasing: undefined,
        exitDuration: 1,
      });
      for (const time of [1, 1.3, 1.6, 3, 6, 6.5, 7]) {
        const elapsed = time - layer.start;
        const progress = Math.min(1, Math.max(0, elapsed / 0.6));
        const eased = 1 - (1 - progress) ** 3;
        const exit = (1 - Math.min(1, Math.max(0, elapsed - layer.duration + 1))) ** 3;
        expect(animationState(layer, time)).toEqual({
          opacity: (animation === 'none' ? 1 : eased) * exit,
          x: animation === 'slide' ? -80 * (1 - eased) : 0,
          y: animation === 'rise' ? 48 * (1 - eased) : 0,
          scale: animation === 'pop' ? 0.72 + 0.28 * eased : 1,
        });
      }
    }
  });

  it.each([
    ['fall', 'y', -48, -24],
    ['slide-right', 'x', 80, 40],
    ['zoom-out', 'scale', 1.28, 1.14],
  ] as const)(
    'settles %s from its starting pose to the authored transform',
    (animation, key, start, middle) => {
      const layer = layerWith({ animation });
      expect(animationState(layer, 1)[key]).toBeCloseTo(start);
      expect(animationState(layer, 2)[key]).toBeCloseTo(middle);
      expect(animationState(layer, 2).opacity).toBe(0.5);
      expect(animationState(layer, 3)[key]).toBeCloseTo(key === 'scale' ? 1 : 0);
      expect(animationState(layer, 3).opacity).toBe(1);
    },
  );

  it('uses authored travel for both entrances and exits, including zero travel', () => {
    const layer = layerWith({
      animation: 'rise',
      animationDistance: 240,
      exitAnimation: 'slide-right',
      exitDuration: 2,
    });
    expect(animationState(layer, 2).y).toBe(120);
    expect(animationState(layer, 6).x).toBe(120);
    expect(animationState({ ...layer, animationDistance: 0 }, 2).y).toBe(0);
    expect(getAnimationDistance(layerWith(), 'slide-left')).toBe(80);
    expect(getAnimationDistance(layerWith(), 'fall')).toBe(48);
  });

  it.each([
    ['rise', 'y', -48],
    ['fall', 'y', 48],
    ['slide-left', 'x', -80],
    ['slide-right', 'x', 80],
    ['shrink', 'scale', 0.72],
  ] as const)('fades and moves %s at the clip end', (exitAnimation, key, end) => {
    const layer = layerWith({ exitAnimation, exitDuration: 2 });
    const initial = key === 'scale' ? 1 : 0;
    expect(animationState(layer, 5)[key]).toBeCloseTo(initial);
    expect(animationState(layer, 6)[key]).toBeCloseTo((initial + end) / 2);
    expect(animationState(layer, 6).opacity).toBe(0.5);
    expect(animationState(layer, 7)[key]).toBeCloseTo(end);
    expect(animationState(layer, 7).opacity).toBe(0);
  });

  it('reverses every entrance back towards its own initial pose', () => {
    for (const { id: animation } of ENTRANCE_OPTIONS) {
      const layer = layerWith({ animation, exitAnimation: 'reverse', exitDuration: 2 });
      const start = animationState(layer, 1);
      const end = animationState(layer, 7);
      for (const key of ['x', 'y', 'scale'] as const) expect(end[key]).toBeCloseTo(start[key]);
      expect(end.opacity).toBe(0);
    }
  });

  it('supports independent exit easing and explicit None without erasing saved duration', () => {
    const layer = layerWith({ exitDuration: 2, exitEasing: 'ease-in' });
    expect(animationState(layer, 6).opacity).toBe(0.875);
    expect(animationState({ ...layer, exitEasing: undefined }, 6).opacity).toBe(0.5);
    const disabled = { ...layer, exitAnimation: 'none' as const };
    expect(getMotionTiming(disabled).exitDuration).toBe(0);
    expect(animationState(disabled, 6.9).opacity).toBe(1);
    expect(disabled.exitDuration).toBe(2);
  });

  it('combines overlapping entrance and exit envelopes smoothly in very short clips', () => {
    const layer = layerWith({
      duration: 0.2,
      animation: 'rise',
      animationDelay: 0.1,
      animationDuration: 4,
      exitAnimation: 'fall',
      exitDuration: 4,
    });
    expect(getMotionTiming(layer)).toEqual({ delay: 0.1, duration: 0.1, exitDuration: 0.2 });
    const middle = animationState(layer, 1.15);
    expect(middle.opacity).toBeCloseTo(0.125);
    expect(middle.y).toBeCloseTo(60);
    for (const time of [1, 1.05, 1.1, 1.15, 1.2]) {
      expect(Object.values(animationState(layer, time)).every(Number.isFinite)).toBe(true);
    }
    expect(layer.animationDuration).toBe(4);
    expect(layer.exitDuration).toBe(4);
  });

  it('starts Float at rest after the entrance, loops around zero and respects delay-only clips', () => {
    const layer = layerWith({ animation: 'fade', animationDelay: 1, loopAnimation: 'float' });
    expect(getLoopTiming(layer)).toEqual({ delay: 3, period: 2, amount: 12 });
    expect(animationState(layer, 3.9).y).toBe(0);
    expect(animationState(layer, 4).y).toBe(0);
    expect(animationState(layer, 4.5).y).toBe(12);
    expect(animationState(layer, 5.5).y).toBe(-12);
    expect(animationState(layer, 6).y).toBeCloseTo(0);
    expect(getLoopTiming({ ...layer, animation: 'none' }).delay).toBe(1);
    expect(getLoopTiming({ ...layer, duration: 0.5 }).delay).toBe(0.5);
  });

  it('loops Pulse from neutral to the authored percentage and back without accumulating scale', () => {
    const layer = layerWith({ loopAnimation: 'pulse', loopDuration: 2 });
    expect(getLoopTiming(layer).amount).toBe(8);
    expect(animationState(layer, 1).scale).toBe(1);
    expect(animationState(layer, 1.5).scale).toBeCloseTo(1.04);
    expect(animationState(layer, 2).scale).toBe(1.08);
    expect(animationState(layer, 3).scale).toBe(1);
    expect(animationState({ ...layer, loopAmount: 0 }, 2).scale).toBe(1);
  });

  it('waits for enabled 3D entrances but not 3D Float or disabled perspective', () => {
    const layer = layerWith({
      animationDelay: 1,
      loopAnimation: 'float',
      transform3d: { enabled: true, rotateX: 10, rotateY: 20, z: 30, motion: 'tilt-in' },
    });
    expect(getLoopTiming(layer).delay).toBe(3);
    expect(
      getLoopTiming({ ...layer, transform3d: { ...layer.transform3d!, motion: 'flip-in' } }).delay,
    ).toBe(3);
    expect(
      getLoopTiming({ ...layer, transform3d: { ...layer.transform3d!, motion: 'float' } }).delay,
    ).toBe(1);
    expect(
      getLoopTiming({ ...layer, transform3d: { ...layer.transform3d!, enabled: false } }).delay,
    ).toBe(1);
  });

  it('resets all motion while retaining the 3D pose, clip timing and artwork', () => {
    const layer = layerWith({
      animation: 'fall',
      animationDistance: 300,
      exitAnimation: 'shrink',
      exitDuration: 2,
      exitEasing: 'ease-in',
      loopAnimation: 'pulse',
      loopDuration: 5,
      loopAmount: 30,
      transform3d: { enabled: true, rotateX: 18, rotateY: -30, z: 25, motion: 'float' },
    });
    const reset = { ...layer, ...resetMotionPatch(layer) };
    expect(reset.transform3d).toEqual({ ...layer.transform3d, motion: 'none' });
    expect(reset.start).toBe(layer.start);
    expect(reset.duration).toBe(layer.duration);
    expect(reset.fill).toBe(layer.fill);
    expect(animationState(reset, 4)).toEqual({ opacity: 1, x: 0, y: 0, scale: 1 });
    expect(reset.animationDistance).toBeUndefined();
    expect(reset.exitEasing).toBeUndefined();
    expect(reset.loopAmount).toBeUndefined();
    expect(resetMotionPatch(layerWith())).not.toHaveProperty('transform3d');
  });

  it('replaces custom motion with complete known recipes and detects active loops as custom', () => {
    const custom = layerWith({
      animationDistance: 400,
      exitAnimation: 'fall',
      exitEasing: 'ease-in',
      loopAnimation: 'pulse',
      loopDuration: 5,
      loopAmount: 40,
    });
    expect(detectSelectionMotion([custom])).toBe('custom');
    for (const preset of MOTION_PRESETS) {
      const next = { ...custom, ...getMotionPresetPatch(preset.id) };
      expect(detectSelectionMotion([next])).toBe(preset.id);
      expect(next.loopAnimation).toBe('none');
      expect(next.animationDistance).toBeUndefined();
    }
    expect(detectSelectionMotion([custom, { ...custom, loopAmount: 20 }])).toBe('mixed');
  });
});

describe('motion persistence and shared rendering', () => {
  it('round-trips every motion option through projects and saved components', () => {
    const project = createProject();
    const combinations = ENTRANCE_OPTIONS.map(({ id: animation }, index) =>
      layerWith({
        animation,
        animationDistance: 2000,
        exitAnimation: EXIT_OPTIONS[index % EXIT_OPTIONS.length].id,
        exitEasing: 'ease-in-out',
        exitDuration: 0.4,
        loopAnimation: LOOP_OPTIONS[index % LOOP_OPTIONS.length].id,
        loopDuration: 0.4,
        loopAmount: 100,
      }),
    );
    project.layers = combinations;
    project.components = [{ id: 'motion', name: 'Motion', layers: combinations }];
    expect(parseProject(JSON.stringify(project))).toEqual(project);
    const layer = combinations[3];
    const keys = [
      'animation',
      'animationDistance',
      'exitAnimation',
      'exitEasing',
      'loopAnimation',
      'loopDuration',
      'loopAmount',
    ] as const;
    for (const copy of [duplicateLayers([layer])[0], ...splitLayer(layer, 3)]) {
      for (const key of keys) expect(copy[key]).toEqual(layer[key]);
    }
  });

  it('strictly rejects invalid enum, numeric bounds and nonfinite values in layers and components', () => {
    const invalid: Record<string, unknown[]> = {
      animation: ['spin', null, 1],
      exitAnimation: ['pop', null, 1],
      exitEasing: ['bounce', null, 1],
      loopAnimation: ['spin', null, 1],
      animationDistance: [-1, 2000.1, '1', null],
      loopDuration: [0, 0.39, 3600.1, '2', null],
      loopAmount: [-0.1, 100.1, '2', null],
    };
    for (const [key, values] of Object.entries(invalid))
      for (const value of values)
        for (const inComponent of [false, true]) {
          const project = createProject();
          project.layers = [layerWith({ [key]: value })];
          if (inComponent) {
            project.components = [{ id: 'bad', name: 'Bad', layers: project.layers }];
            project.layers = [];
          }
          expect(() => parseProject(JSON.stringify(project))).toThrow();
        }
    for (const key of ['animationDistance', 'loopDuration', 'loopAmount']) {
      const project = createProject();
      project.layers = [layerWith({ [key]: 1 })];
      expect(() =>
        parseProject(JSON.stringify(project).replace(`"${key}":1`, `"${key}":1e999`)),
      ).toThrow('finite number');
    }
  });

  it('leaves optional new fields absent in older files and accepts numeric boundaries', () => {
    const project = createProject();
    project.layers = [
      layerWith(),
      layerWith({ animationDistance: 0, loopDuration: 3600, loopAmount: 0 }),
    ];
    const loaded = parseProject(JSON.stringify(project));
    expect(loaded).toEqual(project);
    for (const key of [
      'animationDistance',
      'exitAnimation',
      'exitEasing',
      'loopAnimation',
      'loopDuration',
      'loopAmount',
    ])
      expect(loaded.layers[0]).not.toHaveProperty(key);
  });

  it('uses the same motion state for canvas rendering, SVG snapshots and 3D projection', async () => {
    const layer = layerWith({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      animation: 'slide-right',
      animationDistance: 100,
      loopAnimation: 'pulse',
      loopAmount: 20,
      exitAnimation: 'rise',
      exitDuration: 2,
    });
    const project = { ...createProject(), layers: [layer] };
    const svgEntrance = await exportSvg(project, 2).text();
    expect(svgEntrance).toContain('translate(110 45)');
    const svgLoop = await exportSvg(project, 4).text();
    expect(svgLoop).toContain('scale(1.2)');
    const svgExit = await exportSvg(project, 6).text();
    expect(svgExit).toContain('translate(60 -5)');
    expect(svgExit).toContain('opacity="0.5"');
    const translations: number[][] = [];
    const scales: number[][] = [];
    const ctx = new Proxy(
      {
        canvas: { width: project.width, height: project.height },
        translate: (...args: number[]) => translations.push(args),
        scale: (...args: number[]) => scales.push(args),
      },
      {
        get(target, key) {
          return key in target ? target[key as keyof typeof target] : () => {};
        },
      },
    ) as unknown as CanvasRenderingContext2D;
    renderFrame(ctx, project, 4, {} as MediaCache);
    expect(translations).toContainEqual([60, 45]);
    expect(scales).toContainEqual([1.2, 1.2]);
    const motion = animationState(layer, 4);
    const projected = getElement3DQuad(
      { ...layer, transform3d: { enabled: true, rotateX: 0, rotateY: 0, z: 0, motion: 'none' } },
      4,
      motion,
    );
    expect(projected[0].x).toBeCloseTo(0);
    expect(projected[0].y).toBeCloseTo(15);
  });
});
