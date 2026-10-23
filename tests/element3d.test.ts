import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ELEMENT_3D,
  getElement3DQuad,
  getElement3DState,
  getQuadBounds,
  hasElement3D,
  pointInQuad,
  projectElementPoint,
} from '../src/core/element3d';
import { createLayer, createProject } from '../src/core/project';
import { animationState, renderFrame, type MediaCache } from '../src/engine/renderer';

const neutral = { ...DEFAULT_ELEMENT_3D, rotateX: 0, rotateY: 0 };

describe('element-local perspective geometry', () => {
  it('leaves legacy, disabled, and audio layers flat', () => {
    const legacy = createLayer('shape', { x: 10, y: 20, width: 100, height: 50 });
    expect(hasElement3D(legacy)).toBe(false);
    expect(getElement3DQuad(legacy, 0)).toEqual([
      { x: 10, y: 20 },
      { x: 110, y: 20 },
      { x: 110, y: 70 },
      { x: 10, y: 70 },
    ]);
    for (const layer of [
      { ...legacy, transform3d: { ...DEFAULT_ELEMENT_3D, enabled: false } },
      createLayer('audio', { transform3d: DEFAULT_ELEMENT_3D }),
    ]) {
      expect(hasElement3D(layer)).toBe(false);
      expect(getElement3DState(layer, 1)).toEqual({ rotateX: 0, rotateY: 0, z: 0 });
    }
  });

  it('preserves the existing center, in-plane rotation, and 2D animated transform', () => {
    const layer = createLayer('shape', {
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      rotation: 90,
      transform3d: neutral,
    });
    const [topLeft] = getElement3DQuad(layer, 0, { x: 5, y: -10, scale: 0.5 });
    expect(topLeft.x).toBeCloseTo(77.5);
    expect(topLeft.y).toBeCloseTo(10);
    expect(projectElementPoint(layer, 0, { x: 50, y: 25 })).toEqual({ x: 60, y: 45 });
  });

  it('makes positive depth closer without changing any other layer or stack order', () => {
    const layer = createLayer('shape', {
      width: 100,
      height: 50,
      transform3d: { ...neutral, z: 100 },
    });
    expect(getQuadBounds(getElement3DQuad(layer, 0)).width).toBeCloseTo(200);
    expect(
      getQuadBounds(getElement3DQuad({ ...layer, transform3d: { ...neutral, z: -100 } }, 0)).width,
    ).toBeCloseTo(100 / 1.5);
    expect(projectElementPoint(layer, 0, { x: 50, y: 25 })).toEqual({
      x: layer.x + 50,
      y: layer.y + 25,
    });
  });

  it('projects a trapezoid and uses its actual corners for hit testing', () => {
    const layer = createLayer('shape', {
      x: 10,
      y: 20,
      width: 200,
      height: 200,
      transform3d: { ...neutral, rotateY: 50 },
    });
    const quad = getElement3DQuad(layer, 0);
    expect(quad[3].y - quad[0].y).toBeGreaterThan(quad[2].y - quad[1].y);
    expect(pointInQuad({ x: 110, y: 120 }, quad)).toBe(true);
    const bounds = getQuadBounds(quad);
    expect(pointInQuad({ x: bounds.x + bounds.width - 1, y: bounds.y + 1 }, quad)).toBe(false);
    expect(pointInQuad(quad[0], quad)).toBe(true);
  });

  it('accepts back faces and rejects edge-on degenerate planes', () => {
    const layer = createLayer('shape', { transform3d: { ...neutral, rotateY: 180 } });
    const center = { x: layer.x + layer.width / 2, y: layer.y + layer.height / 2 };
    expect(pointInQuad(center, getElement3DQuad(layer, 0))).toBe(true);
    expect(
      pointInQuad(
        center,
        getElement3DQuad({ ...layer, transform3d: { ...neutral, rotateY: 90 } }, 0),
      ),
    ).toBe(false);
  });

  it('keeps both dimensions finite at extreme supported tilts, depths, and aspect ratios', () => {
    for (const [width, height] of [
      [1, 8000],
      [8000, 1],
      [1000, 1000],
    ]) {
      for (const rotateX of [-180, -90, -45, 0, 45, 90, 180]) {
        for (const rotateY of [-180, -90, -45, 0, 45, 90, 180]) {
          for (const z of [-100, 100]) {
            const layer = createLayer('shape', {
              width,
              height,
              rotation: 45,
              transform3d: { ...neutral, rotateX, rotateY, z },
            });
            const points = getElement3DQuad(layer, 0);
            for (const point of points) {
              expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
              expect(Math.abs(point.x)).toBeLessThan(100_000);
              expect(Math.abs(point.y)).toBeLessThan(100_000);
            }
          }
        }
      }
    }
  });
});

describe('3D motion timing', () => {
  it('holds delayed entrances and finishes exactly at the authored pose', () => {
    for (const motion of ['tilt-in', 'flip-in'] as const) {
      const layer = createLayer('shape', {
        start: 2,
        duration: 8,
        animationDelay: 1,
        animationDuration: 2,
        animationEasing: 'linear',
        transform3d: { ...DEFAULT_ELEMENT_3D, z: 20, motion },
      });
      const initial = getElement3DState(layer, 2);
      const authored = { rotateX: 12, rotateY: -18, z: 20 };
      expect(getElement3DState(layer, 2.8)).toEqual(initial);
      const halfway = getElement3DState(layer, 4);
      expect(halfway.rotateY).toBeCloseTo((initial.rotateY + authored.rotateY) / 2);
      expect(getElement3DState(layer, 5)).toEqual(authored);
      expect(getElement3DState(layer, 8)).toEqual(authored);
      expect(layer.transform3d!.z).toBe(20);
    }
  });

  it('uses entrance easing and handles zero-duration motion without dividing by zero', () => {
    const layer = createLayer('shape', {
      animationDelay: 1,
      animationDuration: 2,
      animationEasing: 'ease-in',
      transform3d: { ...neutral, motion: 'tilt-in' },
    });
    expect(getElement3DState(layer, 2).rotateX).toBeCloseTo(28 * 0.875);
    const instant = { ...layer, animationDuration: 0 };
    expect(getElement3DState(instant, 0.9).rotateX).toBe(28);
    expect(getElement3DState(instant, 1)).toEqual({ rotateX: 0, rotateY: 0, z: 0 });
  });

  it('floats relative to the authored pose, holds before delay, and repeats without drift', () => {
    const layer = createLayer('shape', {
      start: 1,
      animationDelay: 1,
      animationDuration: 2,
      transform3d: { ...neutral, motion: 'float', z: 99 },
    });
    expect(getElement3DState(layer, 1.9)).toEqual({ rotateX: 0, rotateY: 0, z: 99 });
    expect(getElement3DState(layer, 2)).toEqual({ rotateX: 0, rotateY: 0, z: 99 });
    expect(getElement3DState(layer, 2.5)).toEqual({ rotateX: 6, rotateY: 10, z: 100 });
    expect(getElement3DState(layer, 4).rotateY).toBeCloseTo(0);
    expect(getElement3DState(layer, 8.5)).toEqual(getElement3DState(layer, 2.5));
    expect(getElement3DState({ ...layer, animationDuration: 0 }, 2.1).rotateX).toBeCloseTo(6);
  });

  it('combines with existing 2D motion without changing its opacity contract', () => {
    const layer = createLayer('shape', {
      animation: 'rise',
      animationDuration: 2,
      opacity: 0.6,
      transform3d: { ...neutral, motion: 'tilt-in' },
    });
    const animation = animationState(layer, 1);
    expect(animation).toEqual({ opacity: 0.525, x: 0, y: 6, scale: 1 });
    const center = projectElementPoint(
      layer,
      1,
      { x: layer.width / 2, y: layer.height / 2 },
      animation,
    );
    expect(center).toEqual({ x: layer.x + layer.width / 2, y: layer.y + layer.height / 2 + 6 });
  });
});

/** A recording canvas verifies the real renderer's compositing and allocation path. */
function recordingCanvas(width = 1000, height = 1000) {
  const state: Array<{ alpha: number; operation: string; filter: string }> = [];
  const draws: Array<{ alpha: number; operation: string; image: unknown }> = [];
  const fills: Array<{ alpha: number; filter: string; color: string }> = [];
  const canvas = { width, height, draws, fills, getContext: (): unknown => context };
  const context = {
    canvas,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    filter: 'none',
    fillStyle: '',
    save() {
      state.push({
        alpha: this.globalAlpha,
        operation: this.globalCompositeOperation,
        filter: this.filter,
      });
    },
    restore() {
      const previous = state.pop()!;
      this.globalAlpha = previous.alpha;
      this.globalCompositeOperation = previous.operation;
      this.filter = previous.filter;
    },
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    clip: vi.fn(),
    roundRect: vi.fn(),
    ellipse: vi.fn(),
    fill() {
      fills.push({ alpha: this.globalAlpha, filter: this.filter, color: this.fillStyle });
    },
    drawImage(image: unknown) {
      draws.push({ alpha: this.globalAlpha, operation: this.globalCompositeOperation, image });
    },
  };
  return { canvas, context, draws, fills };
}

function projectedSurfaces(output: ReturnType<typeof recordingCanvas>) {
  const composite = output.draws.at(-1)!.image as ReturnType<typeof recordingCanvas>['canvas'];
  const texture = composite.draws.at(-1)!.image as ReturnType<typeof recordingCanvas>['canvas'];
  return {
    composite,
    texture,
    textureContext: texture.getContext() as ReturnType<typeof recordingCanvas>['context'],
  };
}

describe('perspective renderer integration', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps neutral and disabled layers on the exact 2D path', () => {
    const project = createProject();
    project.layers = [createLayer('shape', { opacity: 0.4, transform3d: neutral })];
    const output = recordingCanvas();
    const createElement = vi.fn();
    vi.stubGlobal('document', { createElement });
    const media = {} as MediaCache;
    renderFrame(output.context as unknown as CanvasRenderingContext2D, project, 0, media);
    project.layers[0].transform3d = { ...DEFAULT_ELEMENT_3D, enabled: false };
    renderFrame(output.context as unknown as CanvasRenderingContext2D, project, 0, media);
    expect(createElement).not.toHaveBeenCalled();
    expect(output.draws).toHaveLength(0);
    expect(output.fills.map((fill) => fill.alpha)).toEqual([0.4, 0.4]);
  });

  it('paints masks, filters, and flips once, then composites opacity once after the mesh', () => {
    const project = createProject();
    project.layers = [
      createLayer('shape', {
        opacity: 0.37,
        mask: 'ellipse',
        brightness: 1.2,
        flipX: true,
        transform3d: DEFAULT_ELEMENT_3D,
      }),
    ];
    const output = recordingCanvas();
    const offscreen: ReturnType<typeof recordingCanvas>[] = [];
    vi.stubGlobal('document', {
      createElement: () => {
        const recording = recordingCanvas();
        offscreen.push(recording);
        return recording.canvas;
      },
    });
    renderFrame(
      output.context as unknown as CanvasRenderingContext2D,
      project,
      0,
      {} as MediaCache,
    );
    expect(offscreen.length).toBeLessThanOrEqual(2);
    const { texture, composite, textureContext } = projectedSurfaces(output);
    expect(textureContext.ellipse).toHaveBeenCalled();
    expect(textureContext.scale).toHaveBeenCalledWith(-1, 1);
    expect(texture.fills.slice(-1)).toEqual([
      {
        alpha: 1,
        filter: 'brightness(1.2) contrast(1) saturate(1)',
        color: project.layers[0].fill,
      },
    ]);
    expect(composite.draws.length).toBeGreaterThanOrEqual(2);
    expect(
      composite.draws.slice(-2).every((draw) => draw.alpha === 1 && draw.operation === 'copy'),
    ).toBe(true);
    expect(output.draws).toEqual([{ alpha: 0.37, operation: 'source-over', image: composite }]);
    expect(composite.width).toBeLessThan(output.canvas.width);
  });

  it('reuses bounded surfaces across many layers while preserving authored paint order', () => {
    const project = createProject();
    project.width = 8000;
    project.height = 8000;
    project.layers = ['#ff0000', '#00ff00', '#0000ff'].map((fill) =>
      createLayer('shape', {
        x: 0,
        y: 0,
        width: 8000,
        height: 8000,
        fill,
        transform3d: DEFAULT_ELEMENT_3D,
      }),
    );
    const output = recordingCanvas(8000, 8000);
    const offscreen: ReturnType<typeof recordingCanvas>[] = [];
    vi.stubGlobal('document', {
      createElement: () => {
        const recording = recordingCanvas();
        offscreen.push(recording);
        return recording.canvas;
      },
    });
    renderFrame(
      output.context as unknown as CanvasRenderingContext2D,
      project,
      0,
      {} as MediaCache,
    );
    expect(offscreen.length).toBeLessThanOrEqual(2);
    const { texture, composite } = projectedSurfaces(output);
    for (const canvas of [texture, composite]) {
      expect(canvas.width).toBeLessThanOrEqual(2048);
      expect(canvas.height).toBeLessThanOrEqual(2048);
      expect(canvas.width * canvas.height).toBeLessThanOrEqual(4_000_000);
    }
    expect(texture.fills.slice(-3).map((fill) => fill.color)).toEqual([
      '#ff0000',
      '#00ff00',
      '#0000ff',
    ]);
    expect(output.draws).toHaveLength(3);
  });

  it('recycles surfaces across many output contexts instead of reallocating per depth thumbnail', () => {
    const project = createProject();
    project.layers = [createLayer('shape', { transform3d: DEFAULT_ELEMENT_3D })];
    const createElement = vi.fn(() => recordingCanvas().canvas);
    vi.stubGlobal('document', { createElement });
    const outputs = Array.from({ length: 10 }, () => recordingCanvas(200, 200));
    for (let frame = 0; frame < 3; frame++) {
      for (const output of outputs) {
        renderFrame(
          output.context as unknown as CanvasRenderingContext2D,
          project,
          frame / 30,
          {} as MediaCache,
        );
      }
    }
    // Two texture/composite pairs are sufficient regardless of canvas count.
    expect(createElement.mock.calls.length).toBeLessThanOrEqual(4);
    expect(outputs.every((output) => output.draws.length === 3)).toBe(true);
  });

  it('uses thumbnail pixel scale while retaining native detail for full-resolution exports', () => {
    const project = createProject();
    project.width = 1000;
    project.height = 1000;
    project.layers = [
      createLayer('shape', { width: 500, height: 400, transform3d: DEFAULT_ELEMENT_3D }),
    ];
    vi.stubGlobal('document', { createElement: () => recordingCanvas().canvas });
    const thumbnail = recordingCanvas(100, 100);
    renderFrame(
      thumbnail.context as unknown as CanvasRenderingContext2D,
      project,
      0,
      {} as MediaCache,
    );
    const thumbnailWidth = projectedSurfaces(thumbnail).texture.width;
    expect(thumbnailWidth).toBeGreaterThanOrEqual(50);
    expect(thumbnailWidth).toBeLessThan(80);
    const full = recordingCanvas(1000, 1000);
    renderFrame(full.context as unknown as CanvasRenderingContext2D, project, 0, {} as MediaCache);
    const fullWidth = projectedSurfaces(full).texture.width;
    expect(fullWidth).toBeGreaterThanOrEqual(500);
    expect(fullWidth / thumbnailWidth).toBeGreaterThan(9.5);
  });
});
