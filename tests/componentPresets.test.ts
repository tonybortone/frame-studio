import { describe, expect, it } from 'vitest';
import {
  COMPONENT_PRESETS,
  COMPONENT_PREVIEWS,
  instantiateComponent,
} from '../src/core/componentPresets';
import { createProject, parseProject } from '../src/core/project';
import { animationState } from '../src/engine/renderer';

const scene = (width = 1920, height = 1080, duration = 12) => ({
  ...createProject(),
  width,
  height,
  duration,
});

describe('editable component presets', () => {
  it('provides 12 original presets with stable, renderer-ready previews', () => {
    expect(COMPONENT_PRESETS).toHaveLength(12);
    expect(new Set(COMPONENT_PRESETS.map((preset) => preset.id)).size).toBe(12);
    for (const { preset, project } of COMPONENT_PREVIEWS) {
      expect(project.layers).toHaveLength(preset.layers.length);
      expect(parseProject(JSON.stringify(project))).toEqual(project);
      expect(project.layers.every((layer) => ['shape', 'text'].includes(layer.kind))).toBe(true);
      expect(project.layers.some((layer) => layer.src)).toBe(false);
    }
  });

  it('fits every preset into landscape, portrait, square, and minimum-size frames', () => {
    for (const [width, height] of [
      [1920, 1080],
      [1080, 1920],
      [1080, 1080],
      [64, 64],
      [16, 16],
      [16, 900],
      [900, 16],
    ]) {
      for (const preset of COMPONENT_PRESETS) {
        const project = scene(width, height);
        const original = JSON.stringify(project);
        const layers = instantiateComponent(preset, project, 2.5);
        const label = `${preset.id} ${width}x${height}`;
        expect(parseProject(JSON.stringify({ ...project, layers })), label).toBeTruthy();
        expect(JSON.stringify(project), label).toBe(original);
        expect(new Set(layers.map((layer) => layer.groupId)).size, label).toBe(1);
        expect(new Set(layers.map((layer) => layer.id)).size, label).toBe(layers.length);
        for (const layer of layers) {
          expect(layer.x, label).toBeGreaterThanOrEqual(0);
          expect(layer.y, label).toBeGreaterThanOrEqual(0);
          expect(layer.x + layer.width, label).toBeLessThanOrEqual(width + 1e-6);
          expect(layer.y + layer.height, label).toBeLessThanOrEqual(height + 1e-6);
          expect(layer.start, label).toBe(2.5);
          expect(layer.duration, label).toBe(5);
          if (layer.fontSize !== undefined) expect(layer.fontSize, label).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('keeps at least one frame at the end, including very short timelines', () => {
    for (const duration of [12, 0.2, 0.01]) {
      for (const fps of [1, 24, 30, 60, 120]) {
        const project = { ...scene(1080, 1080, duration), fps };
        const frame = Math.min(duration, Math.max(0.01, 1 / fps));
        for (const time of [-10, 0, duration - 0.005, duration, duration + 20]) {
          for (const preset of COMPONENT_PRESETS) {
            const layers = instantiateComponent(preset, project, time);
            expect(parseProject(JSON.stringify({ ...project, layers }))).toBeTruthy();
            for (const layer of layers) {
              expect(layer.start).toBeGreaterThanOrEqual(0);
              expect(layer.duration).toBeGreaterThanOrEqual(0.01);
              expect(layer.duration + 1e-6).toBeGreaterThanOrEqual(frame);
              expect(layer.start + layer.duration).toBeLessThanOrEqual(duration + 1e-6);
              expect(layer.animationDelay).toBe(0);
              if (time >= duration - frame) {
                expect(layer.start).toBeCloseTo(duration - frame, 8);
                expect(layer.duration).toBeCloseTo(frame, 8);
              }
            }
          }
        }
      }
    }
  });

  it('creates independent groups and editable layers without mutating the original preset', () => {
    for (const preset of COMPONENT_PRESETS) {
      const original = JSON.stringify(preset);
      const project = scene();
      const first = instantiateComponent(preset, project, 0);
      const second = instantiateComponent(preset, project, 3);
      expect(new Set([...first, ...second].map((layer) => layer.id)).size).toBe(
        first.length + second.length,
      );
      expect(first[0].groupId).not.toBe(second[0].groupId);
      first[0].fill = '#d90429';
      first.find((layer) => layer.kind === 'text')!.text = 'My custom words';
      expect(JSON.stringify(preset)).toBe(original);
      expect(second.find((layer) => layer.kind === 'text')!.text).not.toBe('My custom words');
    }
  });

  it('shows every piece immediately without changing the playhead or adding motion', () => {
    for (const preset of COMPONENT_PRESETS) {
      for (const project of [scene(), scene(16, 16)]) {
        const layers = instantiateComponent(preset, project, 2);
        expect(layers.every((layer) => layer.animation === 'none')).toBe(true);
        for (const layer of layers) {
          expect(layer.start).toBe(2);
          expect(layer.exitDuration).toBe(0);
          expect(animationState(layer, 2)).toEqual({ opacity: 1, x: 0, y: 0, scale: 1 });
          expect(animationState(layer, 6.99)).toEqual({ opacity: 1, x: 0, y: 0, scale: 1 });
        }
      }
    }
  });

  it('rejects invalid playheads, invalid frames, and insertions above the project layer limit', () => {
    const preset = COMPONENT_PRESETS[0];
    for (const time of [NaN, Infinity, -Infinity])
      expect(() => instantiateComponent(preset, scene(), time)).toThrow('valid position');
    expect(() => instantiateComponent(preset, scene(0, 1080), 0)).toThrow('canvas size');
    for (const fps of [0, -1, 121, NaN, Infinity])
      expect(() => instantiateComponent(preset, { ...scene(), fps }, 0)).toThrow('frame rate');
    const project = scene();
    project.layers = Array.from({ length: 1000 }, () => ({ ...project.layers[0] }));
    expect(() => instantiateComponent(preset, project, 0)).toThrow('1,000-layer limit');
  });
});
