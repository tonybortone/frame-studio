import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLayer, createProject, parseProject } from '../src/core/project';
import { evaluateKeyframedLayer } from '../src/core/keyframes';
import { geometryEditPatch } from '../src/core/geometryEditing';
import { transformSelection } from '../src/core/selection';
import { getElement3DQuad, getQuadBounds, pointInQuad } from '../src/core/element3d';
import type { Layer, PropertyKeyframe } from '../src/core/types';
import { animationState, MediaCache, renderFrame } from '../src/engine/renderer';
import { exportSvg } from '../src/engine/export';

const projection = vi.hoisted(() => ({ draw: vi.fn() }));
vi.mock('../src/engine/projectedLayer', () => ({ drawProjectedLayer: projection.draw }));

function track(from: number, to: number): PropertyKeyframe[] {
  return [
    { id: `from-${from}`, time: 0, value: from, easing: 'linear' },
    { id: `to-${to}`, time: 2, value: to, easing: 'linear' },
  ];
}

function recordingContext() {
  const calls: Array<[string, ...unknown[]]> = [];
  let alpha = 1;
  const context = {
    canvas: { width: 1000, height: 1000 },
    get globalAlpha() {
      return alpha;
    },
    set globalAlpha(value: number) {
      alpha = value;
      calls.push(['alpha', value]);
    },
    font: '',
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    setTransform: (...values: number[]) => calls.push(['setTransform', ...values]),
    clearRect: (...values: number[]) => calls.push(['clearRect', ...values]),
    scale: (...values: number[]) => calls.push(['scale', ...values]),
    translate: (...values: number[]) => calls.push(['translate', ...values]),
    rotate: (value: number) => calls.push(['rotate', value]),
    fillRect: (...values: number[]) => calls.push(['fillRect', ...values]),
    beginPath: () => calls.push(['beginPath']),
    roundRect: (...values: number[]) => calls.push(['roundRect', ...values]),
    ellipse: (...values: number[]) => calls.push(['ellipse', ...values]),
    clip: () => calls.push(['clip']),
    fill: () => calls.push(['fill']),
    fillText: (text: string, x: number, y: number) =>
      calls.push(['text', text, x, y, context.font]),
  };
  return { context: context as unknown as CanvasRenderingContext2D, calls };
}

function projectWith(layer: Layer) {
  return { ...createProject(), width: 1000, height: 1000, layers: [layer] };
}

describe('keyframed render snapshots', () => {
  beforeEach(() => projection.draw.mockReset());

  it('combines absolute property keys with preset motion in canvas and SVG without mutating source', async () => {
    const layer = createLayer('shape', {
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      rotation: 0,
      opacity: 1,
      start: 3,
      duration: 5,
      animation: 'rise',
      animationDuration: 2,
      animationDistance: 40,
      animationEasing: 'linear',
      keyframes: {
        x: track(10, 210),
        y: track(20, 60),
        width: track(100, 200),
        height: track(50, 150),
        rotation: track(0, 90),
        opacity: track(1, 0.4),
      },
    });
    const before = JSON.stringify(layer);
    const { context, calls } = recordingContext();
    renderFrame(context, projectWith(layer), 4, {} as MediaCache);
    // Base at this frame is x=110, y=40, 150×100, 45° and opacity .7.
    // The preset then adds y=20 and multiplies opacity by .5.
    expect(calls).toContainEqual(['translate', 185, 110]);
    expect(calls).toContainEqual(['rotate', Math.PI / 4]);
    expect(calls).toContainEqual(['scale', 1.5, 2]);
    expect(calls).toContainEqual(['alpha', 0.35]);
    expect(calls).toContainEqual(['roundRect', 0, 0, 100, 50, layer.radius]);
    const svg = await exportSvg(projectWith(layer), 4).text();
    expect(svg).toContain('translate(185 110) rotate(45) scale(1) translate(-75 -50)');
    expect(svg).toContain('transform="scale(1.5 2)"');
    expect(svg).toContain('opacity="0.35"');
    expect(JSON.stringify(layer)).toBe(before);
  });

  it('scales text and its mask together while preserving the authored font', async () => {
    const layer = createLayer('text', {
      width: 100,
      height: 50,
      fontSize: 20,
      text: 'Animated',
      mask: 'ellipse',
      keyframes: { width: track(100, 300), height: track(50, 150) },
    });
    const { context, calls } = recordingContext();
    renderFrame(context, projectWith(layer), 1, {} as MediaCache);
    const contentScale = calls.findIndex(
      (call) => call[0] === 'scale' && call[1] === 2 && call[2] === 2,
    );
    const mask = calls.findIndex((call) => call[0] === 'ellipse');
    const text = calls.findIndex((call) => call[0] === 'text');
    expect(contentScale).toBeGreaterThan(-1);
    expect(mask).toBeGreaterThan(contentScale);
    expect(text).toBeGreaterThan(mask);
    expect(String(calls[text][4])).toContain('20px');
    const svg = await exportSvg(projectWith(layer), 1).text();
    expect(svg).toContain('<g transform="scale(2 2)"><defs><clipPath');
    expect(svg).toContain('font-size="20"');
    expect(layer.fontSize).toBe(20);
  });

  it('passes one evaluated pose and the same scaled painter into 3D textures', () => {
    const layer = createLayer('text', {
      x: 0,
      y: 10,
      width: 100,
      height: 50,
      fontSize: 24,
      text: 'Depth',
      start: 3,
      keyframeOffset: 0.5,
      keyframes: { x: track(0, 200), width: track(100, 300), height: track(50, 150) },
      transform3d: { enabled: true, rotateX: 12, rotateY: -18, z: 0, motion: 'none' },
    });
    const { context } = recordingContext();
    renderFrame(context, projectWith(layer), 3.5, {} as MediaCache);
    expect(projection.draw).toHaveBeenCalledTimes(1);
    const [, pose, time, , , paint] = projection.draw.mock.calls[0];
    expect(pose).toMatchObject({ x: 100, width: 200, height: 100 });
    expect(time).toBe(3.5);
    const texture = recordingContext();
    paint(texture.context);
    expect(texture.calls).toContainEqual(['scale', 2, 2]);
    expect(
      texture.calls.some((call) => call[0] === 'text' && String(call[4]).includes('24px')),
    ).toBe(true);
    expect(layer).toMatchObject({ x: 0, width: 100, height: 50, keyframeOffset: 0.5 });
  });

  it('uses evaluated rotation and dimensions for the visible selection and picking quad', () => {
    const authored = createLayer('shape', {
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      keyframes: {
        x: track(0, 400),
        width: track(100, 300),
        height: track(50, 150),
        rotation: track(0, 180),
      },
    });
    const pose = evaluateKeyframedLayer(authored, 1);
    const quad = getElement3DQuad(pose, 1, animationState(pose, 1));
    const bounds = getQuadBounds(quad);
    expect(bounds.x).toBeCloseTo(250);
    expect(bounds.y).toBeCloseTo(-50);
    expect(bounds.width).toBeCloseTo(100);
    expect(bounds.height).toBeCloseTo(200);
    expect(pointInQuad({ x: 300, y: 50 }, quad)).toBe(true);
    expect(pointInQuad({ x: 25, y: 25 }, quad)).toBe(false);
  });

  it.each(['width', 'height'] as const)(
    'resizes an imported %s-only size track without changing its authored artwork or double-scaling text',
    async (animatedAxis) => {
      const authored = createLayer('text', {
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        fontSize: 20,
        radius: 8,
        text: 'Resize',
        keyframes: { [animatedAxis]: animatedAxis === 'width' ? track(100, 200) : track(50, 100) },
      });
      const imported = parseProject(JSON.stringify(projectWith(authored))).layers[0];
      const pose = evaluateKeyframedLayer(imported, 1);
      const [resized] = transformSelection([pose], [pose.id], { scale: 2 });
      // Canvas/group resizing forwards geometry only for animated artwork.
      const patch = geometryEditPatch(
        imported,
        {
          x: resized.x,
          y: resized.y,
          width: resized.width,
          height: resized.height,
        },
        1,
        30,
      );
      const next = { ...imported, ...patch };
      expect(next).toMatchObject({ width: 100, height: 50, fontSize: 20, radius: 8 });
      expect(evaluateKeyframedLayer(next, 1)).toMatchObject({
        width: pose.width * 2,
        height: pose.height * 2,
      });
      const missingAxis = animatedAxis === 'width' ? 'height' : 'width';
      expect(next.keyframes?.[missingAxis]?.map(({ time, value }) => ({ time, value }))).toEqual([
        { time: 0, value: imported[missingAxis] },
        { time: 1, value: imported[missingAxis] * 2 },
      ]);
      const { context, calls } = recordingContext();
      renderFrame(context, projectWith(next), 1, {} as MediaCache);
      const sx = resized.width / imported.width;
      const sy = resized.height / imported.height;
      expect(calls).toContainEqual(['scale', sx, sy]);
      expect(calls.find((call) => call[0] === 'text')?.[4]).toContain('20px');
      const svg = await exportSvg(projectWith(next), 1).text();
      expect(svg).toContain(`transform="scale(${sx} ${sy})"`);
      expect(svg).toContain('font-size="20"');
      expect(() => parseProject(JSON.stringify(projectWith(next)))).not.toThrow();
      expect(imported.keyframes?.[missingAxis]).toBeUndefined();
    },
  );

  it('keeps static resize behavior and avoids inventing an unchanged size channel', () => {
    const staticLayer = createLayer('text', { width: 100, height: 50, fontSize: 20 });
    expect(
      geometryEditPatch(staticLayer, { width: 200, height: 100, fontSize: 40 }, 1, 30),
    ).toEqual({ width: 200, height: 100, fontSize: 40 });
    const partial = { ...staticLayer, keyframes: { width: track(100, 200) } };
    const patch = geometryEditPatch(partial, { width: 300, height: 50 }, 1, 30);
    expect(patch.keyframes?.height).toBeUndefined();
    expect(patch.height).toBe(50);
    expect(patch.width).toBeUndefined();
  });

  it('does not add a local content scale to unchanged legacy artwork', async () => {
    const layer = createLayer('text', { x: 10, y: 20, width: 100, height: 50, fontSize: 20 });
    const { context, calls } = recordingContext();
    renderFrame(context, projectWith(layer), 1, {} as MediaCache);
    expect(calls.filter((call) => call[0] === 'scale')).toEqual([
      ['scale', 1, 1],
      ['scale', 1, 1],
    ]);
    const svg = await exportSvg(projectWith(layer), 1).text();
    expect(svg).not.toContain('<g transform="scale(');
  });
});
