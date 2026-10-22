import { describe, expect, it } from 'vitest';
import { createLayer } from '../src/core/project';
import {
  LOOK_PRESETS,
  MOTION_PRESETS,
  detectSelectionLook,
  detectSelectionMotion,
  getEditableVisualLayers,
  getLookPatch,
  getMotionPresetPatch,
} from '../src/core/presets';

describe('simple editing recipes', () => {
  it('replaces a previous look and blends strength from neutral without compounding it', () => {
    const original = createLayer('image');
    const vivid = { ...original, ...getLookPatch('vivid') };
    const soft = { ...vivid, ...getLookPatch('soft', 50) };
    expect(soft.brightness).toBeCloseTo(1.04);
    expect(soft.contrast).toBeCloseTo(0.925);
    expect(soft.saturation).toBeCloseTo(0.92);
    expect(detectSelectionLook([soft])).toEqual({ id: 'soft', strength: 50 });
    expect({ ...soft, ...getLookPatch('original') }).toEqual(original);
  });

  it('recovers every look and its strength from saved values, without preset metadata', () => {
    for (const preset of LOOK_PRESETS.slice(1)) {
      for (const strength of [1, 37, 100]) {
        const saved = JSON.parse(
          JSON.stringify(createLayer('video', getLookPatch(preset.id, strength))),
        );
        expect(detectSelectionLook([saved])).toEqual({ id: preset.id, strength });
      }
    }
    expect(getLookPatch('noir', -10)).toEqual(getLookPatch('original'));
    expect(getLookPatch('noir', 200)).toEqual(getLookPatch('noir'));
  });

  it('reports custom and mixed looks from actual per-layer adjustment values', () => {
    const a = createLayer('shape', getLookPatch('clean'));
    const b = createLayer('text', getLookPatch('clean'));
    expect(detectSelectionLook([a, b])).toEqual({ id: 'clean', strength: 100 });
    expect(detectSelectionLook([{ ...a, brightness: 1.5 }])).toEqual({ id: 'custom' });
    expect(detectSelectionLook([a, { ...b, saturation: 0.2 }])).toEqual({ id: 'mixed' });
    expect(detectSelectionLook([])).toEqual({ id: 'empty' });
  });

  it('targets only selected, unlocked visual layers without mutating the project', () => {
    const shape = createLayer('shape');
    const text = createLayer('text');
    const locked = createLayer('video', { locked: true });
    const audio = createLayer('audio');
    const layers = [shape, text, locked, audio];
    expect(getEditableVisualLayers(layers, [shape.id, locked.id, audio.id])).toEqual([shape]);
    expect(layers).toEqual([shape, text, locked, audio]);
  });

  it('applies complete motion recipes and removes entrance and exit with None', () => {
    const previous = createLayer('shape', {
      animation: 'slide',
      animationDuration: 2,
      animationDelay: 1,
      animationEasing: 'linear',
      exitDuration: 2,
    });
    for (const preset of MOTION_PRESETS) {
      const next = { ...previous, ...getMotionPresetPatch(preset.id) };
      expect(detectSelectionMotion([next])).toBe(preset.id);
      expect(next.animationDelay).toBe(0);
    }
    expect(getMotionPresetPatch('none')).toMatchObject({ animation: 'none', exitDuration: 0 });
  });

  it('distinguishes custom, mixed and legacy motion without changing short clip settings', () => {
    expect(detectSelectionMotion([createLayer('text')])).toBe('none');
    const fade = createLayer('image', { ...getMotionPresetPatch('fade'), duration: 0.1 });
    expect(detectSelectionMotion([fade])).toBe('fade');
    expect(fade.animationDuration).toBe(0.65);
    expect(detectSelectionMotion([{ ...fade, animationDelay: 0.1 }])).toBe('custom');
    expect(detectSelectionMotion([fade, { ...fade, exitDuration: 0 }])).toBe('mixed');
    expect(detectSelectionMotion([])).toBe('empty');
  });
});
