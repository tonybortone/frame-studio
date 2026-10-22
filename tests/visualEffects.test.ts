import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLayer, createProject, duplicateLayers, parseProject } from '../src/core/project';
import {
  applyImageEffects,
  colorMatchWeight,
  getMaskGeometry,
  sampleBorderColor,
} from '../src/core/visualEffects';
import { exportSvg } from '../src/engine/export';
import { hasImageEffects, ProcessedImageCache } from '../src/engine/imageEffects';
import type { MediaCache } from '../src/engine/renderer';

describe('visual edit project data', () => {
  it('round-trips editable effects in layers and components without changing the source or old projects', () => {
    const legacy = createProject();
    expect(parseProject(JSON.stringify(legacy))).toEqual(legacy);
    const layer = createLayer('image', {
      src: 'data:image/png;base64,YWJj',
      mask: 'rounded',
      maskInset: 12,
      maskRoundness: 30,
      flipX: true,
      flipY: false,
      backgroundRemoval: { color: '#FFFFFF', tolerance: 12, softness: 8 },
      colorReplace: { from: '#ef233c', to: '#2b2d42', tolerance: 8, softness: 4, strength: 80 },
    });
    legacy.layers = [layer];
    legacy.components = [{ id: 'image-component', name: 'Cutout', layers: [layer] }];
    expect(parseProject(JSON.stringify(legacy))).toEqual(legacy);
    expect(duplicateLayers([layer])[0]).toMatchObject({
      src: layer.src,
      backgroundRemoval: layer.backgroundRemoval,
      colorReplace: layer.colorReplace,
      mask: 'rounded',
    });
  });

  it('rejects malformed masks, nonfinite values, invalid effect colors and unexpected nested fields', () => {
    const invalid = [
      { mask: 'triangle' },
      { maskInset: -1 },
      { maskInset: 45.01 },
      { maskRoundness: 51 },
      { flipX: 1 },
      { backgroundRemoval: { color: '#fff', tolerance: 20, softness: 10 } },
      { backgroundRemoval: { color: '#ffffff', tolerance: 101, softness: 10 } },
      { backgroundRemoval: { color: '#ffffff', tolerance: 20, softness: 10, algorithm: 'ai' } },
      { colorReplace: { from: '#ffffff', to: 'red', tolerance: 20, softness: 0, strength: 100 } },
      {
        colorReplace: {
          from: '#ffffff',
          to: '#000000',
          tolerance: 20,
          softness: -1,
          strength: 100,
        },
      },
      {
        colorReplace: {
          from: '#ffffff',
          to: '#000000',
          tolerance: 20,
          softness: 10,
          strength: 101,
        },
      },
    ];
    for (const patch of invalid) {
      const project = createProject();
      project.layers = [Object.assign(createLayer('image'), patch)];
      expect(() => parseProject(JSON.stringify(project))).toThrow();
    }
    const project = createProject();
    project.layers = [createLayer('image', { maskInset: 1 })];
    expect(() =>
      parseProject(JSON.stringify(project).replace('"maskInset":1', '"maskInset":1e999')),
    ).toThrow('finite number');
  });

  it('limits pixel effects to images and clipping or flips to visual layers', () => {
    for (const kind of ['video', 'text', 'svg', 'shape', 'audio', 'drawing'] as const) {
      const project = createProject();
      project.layers = [
        createLayer(kind, { backgroundRemoval: { color: '#ffffff', tolerance: 10, softness: 5 } }),
      ];
      expect(() => parseProject(JSON.stringify(project))).toThrow('images only');
      project.layers = [
        createLayer(kind, {
          colorReplace: {
            from: '#ffffff',
            to: '#000000',
            tolerance: 10,
            softness: 5,
            strength: 100,
          },
        }),
      ];
      expect(() => parseProject(JSON.stringify(project))).toThrow('images only');
    }
    const project = createProject();
    project.layers = [createLayer('audio', { flipX: true })];
    expect(() => parseProject(JSON.stringify(project))).toThrow('visual layer');
  });
});

describe('mask geometry and exported transforms', () => {
  it('uses symmetric percent insets and roundness relative to the remaining shortest edge', () => {
    const layer = createLayer('shape', { width: 200, height: 100 });
    expect(getMaskGeometry(layer)).toBeNull();
    expect(getMaskGeometry({ ...layer, mask: 'none' })).toBeNull();
    expect(getMaskGeometry({ ...layer, mask: 'rounded', maskInset: 10 })).toEqual({
      kind: 'rounded',
      x: 20,
      y: 10,
      width: 160,
      height: 80,
      radius: 9.6,
    });
    for (const mask of ['rectangle', 'ellipse', 'diamond'] as const)
      expect(getMaskGeometry({ ...layer, mask, maskInset: 45 })).toMatchObject({
        kind: mask,
        x: 90,
        y: 45,
        radius: 0,
      });
    expect(getMaskGeometry({ ...layer, mask: 'rounded', maskRoundness: 50 })!.radius).toBe(50);
  });

  it('exports clips inside the center-based flipped transform for text and artwork', async () => {
    const project = createProject();
    project.layers = [
      createLayer('text', {
        x: 10,
        y: 20,
        width: 200,
        height: 100,
        rotation: 30,
        flipX: true,
        mask: 'ellipse',
        maskInset: 10,
      }),
    ];
    const svg = await exportSvg(project, 0).text();
    expect(svg).toContain('translate(110 70) rotate(30) scale(-1 1) translate(-100 -50)');
    expect(svg).toContain('<ellipse cx="100" cy="50" rx="80" ry="40"/>');
    expect(svg).toContain('<g clip-path="url(#mask-0)"><text');
    project.layers[0] = { ...project.layers[0], mask: 'diamond', flipX: false, flipY: true };
    const diamond = await exportSvg(project, 0).text();
    expect(diamond).toContain('scale(1 -1)');
    expect(diamond).toContain('<polygon points="100,10 180,50 100,90 20,50"/>');
  });

  it('embeds processed image pixels in SVG and never silently falls back to the original', async () => {
    const project = createProject();
    const original = 'data:image/png;base64,YWJj';
    const processed = 'data:image/png;base64,ZGVm';
    project.layers = [
      createLayer('image', {
        src: original,
        radius: 50,
        mask: 'rectangle',
        backgroundRemoval: { color: '#ffffff', tolerance: 10, softness: 4 },
      }),
    ];
    expect(() => exportSvg(project, 0)).toThrow('prepared media');
    const imageDataUrl = vi.fn(() => processed);
    const svg = await exportSvg(project, 0, { imageDataUrl } as unknown as MediaCache).text();
    expect(imageDataUrl).toHaveBeenCalledWith(project.layers[0]);
    expect(svg).toContain(processed);
    expect(svg).not.toContain(original);
    expect(svg).not.toContain('id="image-0"');
    expect(svg).toContain('rx="0"');
    delete project.layers[0].backgroundRemoval;
    delete project.layers[0].mask;
    expect(await exportSvg(project, 0).text()).toContain('rx="50"');
  });
});

describe('flat-color image edits', () => {
  it('keys matching original colors with smooth edges while preserving existing alpha and source pixels', () => {
    const pixels = new Uint8ClampedArray([
      255, 255, 255, 255, 128, 128, 128, 128, 0, 0, 0, 200, 255, 255, 255, 0,
    ]);
    const before = new Uint8ClampedArray(pixels);
    const result = applyImageEffects(pixels, {
      backgroundRemoval: { color: '#ffffff', tolerance: 0, softness: 100 },
    });
    expect(Array.from(result.slice(0, 4))).toEqual([255, 255, 255, 0]);
    expect(result[7]).toBeGreaterThan(60);
    expect(result[7]).toBeLessThan(68);
    expect(result[11]).toBe(200);
    expect(result[15]).toBe(0);
    expect(pixels).toEqual(before);
    expect(result).not.toBe(pixels);
    expect(colorMatchWeight(255, 255, 255, [255, 255, 255], 0, 0)).toBe(1);
    expect(colorMatchWeight(254, 255, 255, [255, 255, 255], 0, 0)).toBe(0);
    expect(colorMatchWeight(0, 0, 0, [255, 255, 255], 100, 0)).toBe(1);
  });

  it('replaces only the chosen original color at the selected strength and keeps keyed alpha', () => {
    const pixels = new Uint8ClampedArray([255, 0, 0, 128, 0, 0, 255, 255, 255, 0, 0, 0]);
    const replacement = { from: '#ff0000', to: '#00ff00', tolerance: 0, softness: 0, strength: 50 };
    const result = applyImageEffects(pixels, { colorReplace: replacement });
    expect(Array.from(result)).toEqual([128, 128, 0, 128, 0, 0, 255, 255, 255, 0, 0, 0]);
    expect(applyImageEffects(pixels, { colorReplace: { ...replacement, strength: 0 } })).toEqual(
      pixels,
    );
    const combined = applyImageEffects(pixels, {
      backgroundRemoval: { color: '#ff0000', tolerance: 0, softness: 0 },
      colorReplace: { ...replacement, strength: 100 },
    });
    expect(Array.from(combined.slice(0, 4))).toEqual([0, 255, 0, 0]);
    expect(Array.from(combined.slice(4, 8))).toEqual([0, 0, 255, 255]);
    expect(() => applyImageEffects(new Uint8ClampedArray(3), {})).toThrow('RGBA');
  });

  it('estimates the dominant border color, ignores transparent edges, and excludes the subject center', () => {
    const pixels = new Uint8ClampedArray(3 * 3 * 4);
    for (let i = 0; i < pixels.length; i += 4) pixels.set([250, 251, 252, 255], i);
    pixels.set([0, 0, 0, 255], 4 * 4);
    pixels.set([255, 0, 0, 255], 0);
    pixels.set([0, 255, 0, 0], 4);
    expect(sampleBorderColor(pixels, 3, 3)).toBe('#fafbfc');
    expect(sampleBorderColor(new Uint8ClampedArray([1, 2, 3, 255]), 1, 1)).toBe('#010203');
    expect(() => sampleBorderColor(new Uint8ClampedArray(4), 1, 1)).toThrow('already transparent');
  });
});

describe('processed image cache', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('reuses unchanged pixels, invalidates on effect or source changes, and evicts its ninth image', () => {
    const canvases: Array<{ width: number; height: number; toDataURL: ReturnType<typeof vi.fn> }> =
      [];
    const drawImage = vi.fn();
    vi.stubGlobal('document', {
      createElement: () => {
        const canvas = {
          width: 0,
          height: 0,
          getContext: () => ({
            drawImage,
            getImageData: () => ({
              data: new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]),
            }),
            putImageData: vi.fn(),
          }),
          toDataURL: vi.fn(() => 'data:image/png;base64,ZGVm'),
        };
        canvases.push(canvas);
        return canvas;
      },
    });
    const cache = new ProcessedImageCache();
    const image = { naturalWidth: 2, naturalHeight: 1, src: 'first' } as HTMLImageElement;
    const layer = createLayer('image', {
      backgroundRemoval: { color: '#ffffff', tolerance: 0, softness: 0 },
    });
    const first = cache.get(image, layer);
    expect(cache.get(image, { ...layer })).toBe(first);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(cache.dataUrl(image, layer)).toContain('data:image/png');
    layer.backgroundRemoval!.tolerance = 20;
    expect(cache.get(image, layer)).not.toBe(first);
    expect(canvases[0].width).toBe(0);
    image.src = 'new source';
    cache.get(image, layer);
    expect(drawImage).toHaveBeenCalledTimes(3);
    for (let index = 0; index < 8; index++)
      cache.get(
        { naturalWidth: 2, naturalHeight: 1, src: `image-${index}` } as HTMLImageElement,
        layer,
      );
    expect(canvases[2].width).toBe(0);
    cache.clear();
    expect(canvases.every((canvas) => canvas.width === 0)).toBe(true);
    expect(cache.get(image, createLayer('image'))).toBe(image);
    expect(
      hasImageEffects(
        createLayer('image', {
          colorReplace: { from: '#ffffff', to: '#000000', tolerance: 0, softness: 0, strength: 0 },
        }),
      ),
    ).toBe(false);
  });
});
