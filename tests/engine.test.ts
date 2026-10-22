import { describe, expect, it } from 'vitest';
import { createLayer, createProject, parseProject, splitLayer } from '../src/core/project';
import { animationState, isLayerActive, parseViewBox } from '../src/engine/renderer';
import { exportSvg, getVideoFormats } from '../src/engine/export';

describe('composition time and geometry', () => {
  it('uses an exclusive clip end and excludes hidden clips', () => {
    const layer = createLayer('shape', { start: 2, duration: 3 });
    expect(isLayerActive(layer, 1.999)).toBe(false);
    expect(isLayerActive(layer, 2)).toBe(true);
    expect(isLayerActive(layer, 5)).toBe(false);
    expect(isLayerActive({ ...layer, hidden: true }, 3)).toBe(false);
  });
  it('completes preset entrances without changing the final transform', () => {
    const layer = createLayer('shape', { start: 1, duration: 4, animation: 'rise', opacity: 0.5 });
    expect(animationState(layer, 1)).toEqual({ opacity: 0, x: 0, y: 48, scale: 1 });
    expect(animationState(layer, 1.6)).toEqual({ opacity: 0.5, x: 0, y: 0, scale: 1 });
  });
  it('preserves nonzero SVG origins and rejects zero-size viewboxes', () => {
    expect(parseViewBox('10, 20, 200, 100', 80, 50)).toEqual([10, 20, 200, 100]);
    expect(parseViewBox('0 0 0 20', 80, 50)).toEqual([0, 0, 80, 50]);
  });
});

describe('SVG snapshot export', () => {
  it('escapes text, preserves line breaks, and keeps layer order', async () => {
    const project = createProject();
    project.layers = [
      createLayer('shape', { fill: '#123456' }),
      createLayer('text', { text: '<script>\nA & B', fontSize: 20 }),
    ];
    const svg = await exportSvg(project, 1).text();
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('A &amp; B');
    expect(svg).toContain('y="22.400000000000002"');
    expect(svg.indexOf('#123456')).toBeLessThan(svg.indexOf('&lt;script&gt;'));
  });
  it('rejects a video snapshot rather than silently dropping the clip', () => {
    const project = createProject();
    project.layers = [createLayer('video')];
    expect(() => exportSvg(project, 1)).toThrow('contains video');
    project.layers[0].hidden = true;
    expect(() => exportSvg(project, 1)).not.toThrow();
  });
  it('does not advertise recording formats when the recorder API is unavailable', () => {
    expect(getVideoFormats()).toEqual([]);
  });
});
describe('original media duration', () => {
  it('preserves source bounds across splitting and permits legacy clips', () => {
    const project = createProject();
    const clip = createLayer('video', { duration: 3, mediaOffset: 2, sourceDuration: 5 });
    project.layers = splitLayer(clip, 1);
    const parsed = parseProject(JSON.stringify(project));
    expect(parsed.layers.map((layer) => layer.sourceDuration)).toEqual([5, 5]);
    expect(parsed.layers[1].mediaOffset).toBe(3);
    project.layers = [createLayer('video', { duration: 20 })];
    expect(parseProject(JSON.stringify(project)).layers[0].sourceDuration).toBeUndefined();
  });
  it('rejects nonfinite duration and clips extended beyond known source bounds', () => {
    const project = createProject();
    project.layers = [createLayer('audio', { duration: 3, mediaOffset: 2, sourceDuration: 5 })];
    const valid = JSON.stringify(project);
    expect(() =>
      parseProject(valid.replace('"sourceDuration":5', '"sourceDuration":1e999')),
    ).toThrow('finite number');
    project.layers[0].duration = 3.1;
    expect(() => parseProject(JSON.stringify(project))).toThrow('beyond the original media');
  });
});
