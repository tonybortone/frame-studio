import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  changeAspectRatio,
  createLayer,
  createProject,
  duplicateLayers,
  parseProject,
  splitLayer,
} from '../src/core/project';
import {
  evaluateKeyframedLayer,
  evaluateKeyframeProperty,
  getKeyframeBaseValue,
  keyframeGeometryPatch,
  transformKeyframeGeometry,
  upsertKeyframe,
} from '../src/core/keyframes';
import { getRevealGeometry, getTextRevealLines } from '../src/core/motionEffects';
import { getElement3DQuad, pointInQuad, projectElementPoint } from '../src/core/element3d';
import { renderFrame, type MediaCache } from '../src/engine/renderer';
import { exportSvg } from '../src/engine/export';
import type { KeyframeProperty, Layer, PropertyKeyframe } from '../src/core/types';

const projection = vi.hoisted(() => ({ draw: vi.fn() }));
vi.mock('../src/engine/projectedLayer', () => ({ drawProjectedLayer: projection.draw }));

const track = (from: number, to: number): PropertyKeyframe[] => [
  { id: 'a', time: 0, value: from, easing: 'custom', curve: [0.22, 0.5, 0.7, 1.15] },
  { id: 'b', time: 4, value: to, easing: 'linear' },
];
const projectWith = (layer: Layer) => ({
  ...createProject(),
  width: 1000,
  height: 800,
  layers: [layer],
});
const plane = {
  enabled: true,
  rotateX: 25,
  rotateY: -30,
  z: 12,
  motion: 'none' as const,
  originX: 400,
  originY: 300,
  perspectiveDistance: 1600,
};

describe('advanced editable keyframe channels', () => {
  it('has backward-compatible defaults and never mutates authored nested transforms', () => {
    const legacy = createLayer('text');
    expect(getKeyframeBaseValue(legacy, 'blur')).toBe(0);
    expect(getKeyframeBaseValue(legacy, 'reveal')).toBe(1);
    expect(getKeyframeBaseValue(legacy, 'textReveal')).toBe(1);
    expect(getKeyframeBaseValue(legacy, 'depth')).toBe(0);
    expect(evaluateKeyframedLayer(legacy, 1)).toBe(legacy);
    let layer = createLayer('text', { transform3d: { ...plane, enabled: false } });
    for (const [property, from, to] of [
      ['rotateX', 0, 60],
      ['rotateY', -40, 0],
      ['depth', -20, 20],
      ['blur', 20, 0],
      ['reveal', 0, 1],
      ['textReveal', 0, 1],
    ] as Array<[KeyframeProperty, number, number]>) {
      layer = { ...layer, ...upsertKeyframe(layer, property, 0, from) };
      layer = { ...layer, ...upsertKeyframe(layer, property, 4, to) };
    }
    const original = JSON.stringify(layer);
    const sampled = evaluateKeyframedLayer(layer, 2);
    expect(sampled.transform3d).toMatchObject({
      ...plane,
      rotateX: 30,
      rotateY: -20,
      z: 0,
      enabled: true,
    });
    expect(sampled).toMatchObject({
      blur: 10,
      reveal: 0.5,
      textReveal: 0.5,
      width: layer.width,
      height: layer.height,
    });
    expect(JSON.stringify(layer)).toBe(original);
    const saved = parseProject(JSON.stringify(projectWith(layer))).layers[0];
    expect(saved.keyframes).toEqual(layer.keyframes);
    expect(saved.transform3d).toEqual(layer.transform3d);
    expect(
      evaluateKeyframedLayer({ ...layer, transform3d: { ...plane, enabled: false } }, 2).transform3d
        ?.enabled,
    ).toBe(false);
  });

  it('auto-keys nested pose and effects while preserving base values and untracked metadata', () => {
    const layer = createLayer('shape', {
      blur: 0,
      reveal: 1,
      transform3d: plane,
      keyframes: {
        rotateX: track(0, 60),
        depth: track(0, 20),
        blur: track(30, 0),
        reveal: track(0, 1),
      },
    });
    const patch = keyframeGeometryPatch(
      layer,
      {
        transform3d: { ...plane, rotateX: 42, rotateY: 13, z: 35, enabled: false },
        blur: 7,
        reveal: 0.7,
        revealDirection: 'right',
      },
      1.01,
      30,
    );
    const next = { ...layer, ...patch };
    expect(next.transform3d).toEqual({ ...plane, rotateY: 13, enabled: false });
    expect(next).toMatchObject({ blur: 0, reveal: 1, revealDirection: 'right' });
    for (const [property, value] of [
      ['rotateX', 42],
      ['depth', 35],
      ['blur', 7],
      ['reveal', 0.7],
    ] as const)
      expect(evaluateKeyframeProperty(next, property, 1)).toBe(value);
    expect(layer.keyframes?.rotateX).toHaveLength(2);
    expect(() => parseProject(JSON.stringify(projectWith(next)))).not.toThrow();
  });

  it('retains exact 3D/effect curves across splits and a saved component round-trip', () => {
    const layer = createLayer('text', {
      start: 3,
      duration: 8,
      transform3d: plane,
      keyframes: {
        rotateX: track(-60, 60),
        rotateY: track(30, -30),
        depth: track(-20, 20),
        blur: track(30, 0),
        reveal: track(0, 1),
        textReveal: track(0, 1),
      },
    });
    const [, right] = splitLayer(layer, 4.3);
    const project = {
      ...projectWith(right),
      components: [{ id: 'saved', name: 'Animated UI', layers: [right] }],
    };
    const restored = parseProject(JSON.stringify(project));
    for (let time = 4.3; time < 7; time += 0.013) {
      const expected = evaluateKeyframedLayer(layer, time);
      const actual = evaluateKeyframedLayer(restored.components[0].layers[0], time);
      expect(actual.transform3d).toEqual(expected.transform3d);
      expect([actual.blur, actual.reveal, actual.textReveal]).toEqual([
        expected.blur,
        expected.reveal,
        expected.textReveal,
      ]);
    }
    const duplicate = duplicateLayers([right])[0];
    expect(duplicate.transform3d).not.toBe(right.transform3d);
    duplicate.transform3d!.originX = 999;
    expect(right.transform3d!.originX).toBe(400);
  });

  it('does not insert unchanged Y/depth keys when a full evaluated 3D control edits only X', () => {
    const layer = createLayer('shape', {
      transform3d: plane,
      keyframes: {
        rotateX: track(0, 60),
        rotateY: track(-40, 10),
        depth: track(-20, 20),
      },
    });
    const time = 1.017;
    const pose = evaluateKeyframedLayer(layer, time);
    const patch = keyframeGeometryPatch(
      layer,
      {
        transform3d: {
          ...pose.transform3d!,
          rotateX: pose.transform3d!.rotateX + 10,
        },
      },
      time,
      30,
    );
    expect(patch.keyframes?.rotateX).toHaveLength(3);
    expect(patch.keyframes?.rotateY).toBe(layer.keyframes?.rotateY);
    expect(patch.keyframes?.depth).toBe(layer.keyframes?.depth);
    expect(patch.transform3d).toEqual(plane);
    const next = { ...layer, ...patch };
    for (let at = 0; at < 4; at += 0.037) {
      expect(evaluateKeyframeProperty(next, 'rotateY', at)).toBe(
        evaluateKeyframeProperty(layer, 'rotateY', at),
      );
      expect(evaluateKeyframeProperty(next, 'depth', at)).toBe(
        evaluateKeyframeProperty(layer, 'depth', at),
      );
    }
  });

  it('strictly rejects invalid effect values, wrong layer kinds, and incomplete shared planes', () => {
    const shape = createLayer('shape');
    const invalid: Partial<Layer>[] = [
      { blur: 81 },
      { reveal: -0.1 },
      { reveal: NaN },
      { revealDirection: 'diagonal' as 'left' },
      { textReveal: 0.5 },
      { textRevealMode: 'words' },
      { keyframes: { depth: track(0, 101) } },
      { keyframes: { rotateY: track(0, 181) } },
      { keyframes: { textReveal: track(0, 1) } },
      { transform3d: { ...plane, perspectiveDistance: undefined } },
      { transform3d: { ...plane, perspectiveDistance: 0 } },
      { transform3d: { ...plane, originX: Infinity } },
    ];
    for (const patch of invalid)
      expect(() => parseProject(JSON.stringify(projectWith({ ...shape, ...patch })))).toThrow();
    expect(() =>
      parseProject(JSON.stringify(projectWith(createLayer('audio', { blur: 0 })))),
    ).toThrow();
    expect(() => upsertKeyframe(createLayer('audio'), 'blur', 0, 10)).toThrow();
    expect(() => upsertKeyframe(shape, 'textReveal', 0, 0)).toThrow();
  });
});

describe('shared perspective for editable grouped UI', () => {
  it('maps touching members to one continuous plane despite their different local centers', () => {
    const left = createLayer('shape', {
      x: 100,
      y: 160,
      width: 300,
      height: 280,
      transform3d: plane,
    });
    const right = createLayer('text', {
      x: 400,
      y: 160,
      width: 180,
      height: 280,
      transform3d: plane,
    });
    for (let y = 0; y <= 280; y += 20) {
      expect(projectElementPoint(left, 0, { x: 300, y })).toEqual(
        projectElementPoint(right, 0, { x: 0, y }),
      );
    }
    const pose = { ...left, keyframes: { rotateY: track(-30, 40), depth: track(0, 20) } };
    const evaluated = evaluateKeyframedLayer(pose, 2);
    const point = projectElementPoint(evaluated, 2, { x: 150, y: 140 });
    expect(pointInQuad(point, getElement3DQuad(evaluated, 2))).toBe(true);
    expect(getElement3DQuad(evaluated, 2)).not.toEqual(getElement3DQuad(pose, 0));
  });

  it('keeps neutral shared projection identical to the flat element, including its own rotation', () => {
    const layer = createLayer('shape', { x: 100, y: 120, width: 320, height: 180, rotation: 24 });
    const shared = { ...layer, transform3d: { ...plane, rotateX: 0, rotateY: 0, z: 0 } };
    const expected = getElement3DQuad(layer, 0, { x: 20, y: -10, scale: 0.7 });
    const actual = getElement3DQuad(shared, 0, { x: 20, y: -10, scale: 0.7 });
    actual.forEach((point, index) => {
      expect(point.x).toBeCloseTo(expected[index].x);
      expect(point.y).toBeCloseTo(expected[index].y);
    });
  });

  it('transforms shared origins and perspective distance on canvas resizing and translated copies', () => {
    const layer = createLayer('shape', {
      x: 100,
      y: 150,
      width: 300,
      height: 200,
      transform3d: plane,
    });
    const project = projectWith(layer);
    const resized = changeAspectRatio(project, 2000, 1600);
    expect(resized.layers[0].transform3d).toMatchObject({
      originX: 800,
      originY: 600,
      perspectiveDistance: 3200,
    });
    const before = getElement3DQuad(layer, 0);
    const after = getElement3DQuad(resized.layers[0], 0);
    after.forEach((point, index) => {
      expect(point.x).toBeCloseTo(before[index].x * 2);
      expect(point.y).toBeCloseTo(before[index].y * 2);
    });
    const copy = {
      ...layer,
      ...transformKeyframeGeometry(layer, { translateX: 24, translateY: 24 }),
      x: layer.x + 24,
      y: layer.y + 24,
    };
    expect(copy.transform3d).toMatchObject({
      originX: 424,
      originY: 324,
      perspectiveDistance: 1600,
    });
    getElement3DQuad(copy, 0).forEach((point, index) => {
      expect(point.x).toBeCloseTo(before[index].x + 24);
      expect(point.y).toBeCloseTo(before[index].y + 24);
    });
  });
});

describe('Unicode text and wipe sampling', () => {
  it('reveals whole grapheme clusters and preserves authored multiline text', () => {
    const text = 'A👩🏽‍💻e\u0301🇮🇹\nZ';
    expect(getTextRevealLines(text, 0.4)[0]).toEqual({
      text: 'A👩🏽‍💻e\u0301🇮🇹',
      visibleText: 'A👩🏽‍💻',
      complete: false,
    });
    expect(getTextRevealLines(text, 0.8)).toEqual([
      { text: 'A👩🏽‍💻e\u0301🇮🇹', visibleText: 'A👩🏽‍💻e\u0301🇮🇹', complete: true },
      { text: 'Z', visibleText: '', complete: false },
    ]);
    expect(getTextRevealLines(text, 1).every((line) => line.complete)).toBe(true);
  });

  it('reveals whole words without changing line positions and handles emoji-only titles', () => {
    const lines = getTextRevealLines('Hello, world!\nKeep creating.', 0.5, 'words');
    expect(lines[0]).toEqual({
      text: 'Hello, world!',
      visibleText: 'Hello, world!',
      complete: true,
    });
    expect(lines[1]).toEqual({ text: 'Keep creating.', visibleText: '', complete: false });
    expect(getTextRevealLines('👩🏽‍💻🎬', 0.5, 'words')[0].visibleText).toBe('👩🏽‍💻');
  });

  it('uses original local artwork dimensions for every wipe direction', () => {
    const artwork = { width: 200, height: 100 };
    expect(getRevealGeometry(artwork, { reveal: 1 })).toBeUndefined();
    expect(getRevealGeometry(artwork, { reveal: 0 })).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 100,
    });
    for (const [revealDirection, expected] of [
      ['left', [0, 0, 50, 100]],
      ['right', [150, 0, 50, 100]],
      ['up', [0, 0, 200, 25]],
      ['down', [0, 75, 200, 25]],
      ['center', [75, 0, 50, 100]],
    ] as const)
      expect(Object.values(getRevealGeometry(artwork, { reveal: 0.25, revealDirection })!)).toEqual(
        expected,
      );
  });
});

function contextRecorder() {
  const calls: Array<[string, ...unknown[]]> = [];
  const context = {
    canvas: { width: 1000, height: 800 },
    font: '',
    filter: '',
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    setTransform: () => {},
    clearRect: () => {},
    fillRect: () => {},
    scale: (...values: number[]) => calls.push(['scale', ...values]),
    translate: (...values: number[]) => calls.push(['translate', ...values]),
    rotate: () => {},
    beginPath: () => {},
    rect: (...values: number[]) => calls.push(['rect', ...values]),
    roundRect: (...values: number[]) => calls.push(['roundRect', ...values]),
    ellipse: (...values: number[]) => calls.push(['ellipse', ...values]),
    clip: () => calls.push(['clip']),
    fill: () => calls.push(['fill', context.filter]),
    measureText: (text: string) => ({ width: text.length * 10 }),
    fillText: (text: string, x: number, y: number) =>
      calls.push(['text', text, x, y, context.filter]),
  };
  return { context: context as unknown as CanvasRenderingContext2D, calls };
}

describe('effects in preview and export', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    projection.draw.mockReset();
  });

  it('uses evaluated effects with authored bounds, combines masks, and preserves original text layout', () => {
    const layer = createLayer('text', {
      width: 200,
      height: 100,
      fontSize: 20,
      text: 'ABCD\nEF',
      mask: 'ellipse',
      keyframes: {
        width: track(200, 400),
        reveal: track(0, 1),
        blur: track(20, 0),
        textReveal: track(0, 1),
      },
    });
    // Linear keys make the selected halfway state unambiguous.
    Object.values(layer.keyframes!).forEach((frames) =>
      frames!.forEach((frame) => (frame.easing = 'linear')),
    );
    const { context, calls } = contextRecorder();
    renderFrame(context, projectWith(layer), 2, {} as MediaCache);
    expect(calls).toContainEqual(['scale', 1.5, 1]);
    expect(calls).toContainEqual(['rect', 0, 0, 100, 100]);
    expect(calls.some((call) => call[0] === 'ellipse')).toBe(true);
    expect(calls).toContainEqual([
      'text',
      'ABCD',
      0,
      0,
      'brightness(1) contrast(1) saturate(1) blur(10px)',
    ]);
    expect(calls.some((call) => call[0] === 'text' && call[1] === 'EF')).toBe(false);
    // Three revealed graphemes, but the entire original line is painted under the clip.
    expect(calls).toContainEqual(['rect', -20, -6, 50, 32]);
    expect(layer.text).toBe('ABCD\nEF');
  });

  it('passes evaluated 3D keys and padded blur into the same local painter', () => {
    const layer = createLayer('shape', {
      width: 200,
      height: 100,
      keyframes: { rotateY: track(0, 40), blur: track(20, 0), reveal: track(0, 1) },
    });
    const { context } = contextRecorder();
    renderFrame(context, projectWith(layer), 2, {} as MediaCache);
    const [, evaluated, , , viewport, paint] = projection.draw.mock.calls.at(-1)!;
    expect(evaluated.transform3d.enabled).toBe(true);
    expect(evaluated.transform3d.rotateY).toBeCloseTo(
      evaluateKeyframeProperty(layer, 'rotateY', 2),
    );
    expect(viewport.padding).toBeCloseTo(evaluated.blur * 3);
    const texture = contextRecorder();
    paint(texture.context);
    expect(texture.calls).toContainEqual(['rect', 0, 0, 200 * evaluated.reveal, 100]);
    expect(texture.calls).toContainEqual([
      'fill',
      `brightness(1) contrast(1) saturate(1) blur(${evaluated.blur}px)`,
    ]);
    expect(() => exportSvg(projectWith(layer), 2)).toThrow(/3D/);
  });

  it('exports measured Unicode-safe text clips, Gaussian blur, and local wipes to SVG', async () => {
    const recording = contextRecorder();
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => recording.context }) });
    const layer = createLayer('text', {
      width: 200,
      height: 100,
      fontSize: 20,
      text: 'A & B\nC',
      textReveal: 0.5,
      reveal: 0.75,
      revealDirection: 'right',
      blur: 4,
    });
    const svg = await exportSvg(projectWith(layer), 0).text();
    expect(svg).toContain('<feGaussianBlur stdDeviation="4"/>');
    expect(svg).toContain('id="reveal-0"');
    expect(svg).toContain('<rect x="50" y="0" width="150" height="100"/>');
    expect(svg).toContain('id="text-reveal-0-0"');
    expect(svg).toContain('A &amp; B</text>');
    expect(svg).not.toContain('>C</text>');
    expect(svg).toContain('<g clip-path="url(#text-reveal-0-0)"><text');
    expect(svg).toContain('filter="url(#blur-0)"');
  });

  it('keeps SVG blur isotropic in output when size tracks stretch only one axis', async () => {
    const layer = createLayer('shape', {
      width: 200,
      height: 100,
      blur: 8,
      keyframes: {
        width: [{ id: 'size', time: 0, value: 800, easing: 'linear' }],
      },
    });
    const svg = await exportSvg(projectWith(layer), 0).text();
    // Local X std-dev4 stretched4× and Y std-dev16 stretched1× both become16px,
    // matching the Canvas filter's8×sqrt(4) device-pixel radius.
    expect(svg).toContain('transform="scale(4 1)"');
    expect(svg).toContain('<feGaussianBlur stdDeviation="4 16"/>');
    expect(svg).toContain('x="-12" y="-48" width="224" height="196"');
  });
});
