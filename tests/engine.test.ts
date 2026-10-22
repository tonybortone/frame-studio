import { describe, expect, it } from 'vitest';
import { createLayer, createProject, parseProject, splitLayer } from '../src/core/project';
import {
  animationState,
  isLayerActive,
  MediaCache,
  parseViewBox,
  syncMedia,
} from '../src/engine/renderer';
import { exportSvg, getVideoFormats } from '../src/engine/export';
import { audioEnvelope, easeProgress, getAudioTiming, getMotionTiming } from '../src/core/motion';

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
    expect(animationState(layer, 1.3).opacity).toBeCloseTo(0.4375);
  });
  it('holds a delayed entrance, uses its authored duration, then fades out at the clip end', () => {
    const layer = createLayer('shape', {
      start: 1,
      duration: 5,
      animation: 'rise',
      animationDelay: 1,
      animationDuration: 2,
      animationEasing: 'linear',
      exitDuration: 1,
      opacity: 0.8,
    });
    expect(animationState(layer, 1.5)).toEqual({ opacity: 0, x: 0, y: 48, scale: 1 });
    expect(animationState(layer, 3)).toEqual({ opacity: 0.4, x: 0, y: 24, scale: 1 });
    expect(animationState(layer, 4)).toEqual({ opacity: 0.8, x: 0, y: 0, scale: 1 });
    expect(animationState(layer, 5.5)).toEqual({ opacity: 0.4, x: 0, y: 0, scale: 1 });
    expect(animationState(layer, 6).opacity).toBe(0);
  });
  it('keeps instant entrances and exit-only clips finite without inventing movement', () => {
    const instant = createLayer('shape', {
      animation: 'pop',
      animationDelay: 1,
      animationDuration: 0,
    });
    expect(animationState(instant, 0.9).scale).toBe(0.72);
    expect(animationState(instant, 1)).toEqual({ opacity: 1, x: 0, y: 0, scale: 1 });
    const exitOnly = createLayer('shape', {
      duration: 2,
      animation: 'none',
      exitDuration: 1,
      animationEasing: 'linear',
    });
    expect(animationState(exitOnly, 0)).toEqual({ opacity: 1, x: 0, y: 0, scale: 1 });
    expect(animationState(exitOnly, 1.5).opacity).toBe(0.5);
  });
  it('fits effective timings to short clips without overwriting authored values', () => {
    const layer = createLayer('shape', {
      duration: 0.2,
      animationDelay: 0.1,
      animationDuration: 2,
      exitDuration: 3,
      audioFadeIn: 3,
      audioFadeOut: 3,
    });
    expect(getMotionTiming(layer)).toEqual({ delay: 0.1, duration: 0.1, exitDuration: 0.2 });
    expect(getAudioTiming(layer)).toEqual({ fadeIn: 0.2, fadeOut: 0.2 });
    expect(getMotionTiming({ ...layer, animationDelay: 2 })).toEqual({
      delay: 0.2,
      duration: 0,
      exitDuration: 0.2,
    });
    expect(layer.animationDuration).toBe(2);
    expect(layer.audioFadeIn).toBe(3);
  });
  it('evaluates bounded easing curves with distinct timing and stable endpoints', () => {
    expect(easeProgress(0.5, 'linear')).toBe(0.5);
    expect(easeProgress(0.5, 'ease-in')).toBe(0.125);
    expect(easeProgress(0.5, 'ease-out')).toBe(0.875);
    expect(easeProgress(0.25, 'ease-in-out')).toBe(0.0625);
    expect(easeProgress(0.75, 'ease-in-out')).toBe(0.9375);
    for (const easing of ['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const) {
      expect(easeProgress(-1, easing)).toBe(0);
      expect(easeProgress(2, easing)).toBe(1);
    }
  });
  it('preserves nonzero SVG origins and rejects zero-size viewboxes', () => {
    expect(parseViewBox('10, 20, 200, 100', 80, 50)).toEqual([10, 20, 200, 100]);
    expect(parseViewBox('0 0 0 20', 80, 50)).toEqual([0, 0, 80, 50]);
  });
});

describe('SVG snapshot export', () => {
  it('applies authored delayed motion and exit opacity to exported snapshots', async () => {
    const project = createProject();
    project.layers = [
      createLayer('shape', {
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        start: 1,
        duration: 5,
        animation: 'rise',
        animationDelay: 1,
        animationDuration: 2,
        animationEasing: 'linear',
        exitDuration: 1,
        opacity: 0.8,
      }),
    ];
    const entrance = await exportSvg(project, 3).text();
    expect(entrance).toContain('translate(60 69)');
    expect(entrance).toContain('opacity="0.4"');
    const exit = await exportSvg(project, 5.5).text();
    expect(exit).toContain('translate(60 45)');
    expect(exit).toContain('opacity="0.4"');
  });
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

describe('sound fades', () => {
  it('uses linear clip-relative ramps and multiplies overlapping fades', () => {
    const layer = createLayer('audio', { start: 2, duration: 4, audioFadeIn: 1, audioFadeOut: 2 });
    expect(audioEnvelope(layer, 1)).toBe(0);
    expect(audioEnvelope(layer, 2)).toBe(0);
    expect(audioEnvelope(layer, 2.5)).toBe(0.5);
    expect(audioEnvelope(layer, 3)).toBe(1);
    expect(audioEnvelope(layer, 5)).toBe(0.5);
    expect(audioEnvelope(layer, 6)).toBe(0);
    expect(audioEnvelope({ ...layer, audioFadeIn: 4, audioFadeOut: 4 }, 4)).toBe(0.25);
    expect(audioEnvelope(createLayer('audio'), 0)).toBe(1);
  });
  it('applies fade gain through the media sink for both audio and video sound', () => {
    for (const kind of ['audio', 'video'] as const) {
      const project = createProject();
      const layer = createLayer(kind, {
        duration: 4,
        volume: 0.8,
        audioFadeIn: 1,
        audioFadeOut: 2,
      });
      project.layers = [layer];
      const element = { duration: 4, readyState: 1, currentTime: 0, paused: true, pause() {} };
      const sink = { gain: { value: -1 } };
      const media = {
        mediaEntries: () => [[layer.id, { element }]],
        setLevel: (_id: string, level: number) => {
          sink.gain.value = level;
        },
      } as unknown as MediaCache;
      syncMedia(project, 0.5, false, media);
      expect(sink.gain.value).toBeCloseTo(0.4);
      syncMedia(project, 1, false, media);
      expect(sink.gain.value).toBeCloseTo(0.8);
      syncMedia(project, 3, false, media);
      expect(sink.gain.value).toBeCloseTo(0.4);
      layer.muted = true;
      syncMedia(project, 1, false, media);
      expect(sink.gain.value).toBe(0);
      layer.muted = false;
      syncMedia(project, 4, false, media);
      expect(sink.gain.value).toBe(0);
    }
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
