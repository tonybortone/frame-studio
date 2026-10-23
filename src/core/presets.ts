import type { Animation, AnimationEasing, Layer } from './types';
import { getAnimationDistance, getLoopTiming } from './motion';

export type LookValues = Pick<Layer, 'brightness' | 'contrast' | 'saturation'>;
export const LOOK_PRESETS = [
  { id: 'original', name: 'Original', brightness: 1, contrast: 1, saturation: 1 },
  { id: 'clean', name: 'Clean', brightness: 1.06, contrast: 1.08, saturation: 0.96 },
  { id: 'vivid', name: 'Vivid', brightness: 1.03, contrast: 1.16, saturation: 1.3 },
  { id: 'soft', name: 'Soft', brightness: 1.08, contrast: 0.85, saturation: 0.84 },
  { id: 'noir', name: 'Noir', brightness: 1.02, contrast: 1.24, saturation: 0 },
  { id: 'muted', name: 'Muted', brightness: 0.98, contrast: 0.94, saturation: 0.55 },
] as const;
export type LookId = (typeof LOOK_PRESETS)[number]['id'];
const LOOK_KEYS = ['brightness', 'contrast', 'saturation'] as const;
const close = (a: number, b: number) => Math.abs(a - b) < 0.00001;

/** Recipe strength always blends from neutral; it never compounds the current look. */
export function getLookPatch(id: LookId, strength = 100): LookValues {
  const recipe = LOOK_PRESETS.find((preset) => preset.id === id)!;
  const amount = Number.isFinite(strength) ? Math.min(100, Math.max(0, strength)) / 100 : 1;
  return {
    brightness: 1 + (recipe.brightness - 1) * amount,
    contrast: 1 + (recipe.contrast - 1) * amount,
    saturation: 1 + (recipe.saturation - 1) * amount,
  };
}

/** Shared targeting keeps audio and locked artwork out of batch visual edits. */
export function getEditableVisualLayers(layers: readonly Layer[], selected: readonly string[]) {
  const ids = new Set(selected);
  return layers.filter((layer) => ids.has(layer.id) && layer.kind !== 'audio' && !layer.locked);
}

export type LookMatch = { id: LookId; strength: number } | { id: 'custom' | 'mixed' | 'empty' };

/** Recover the recipe from authored values, so load, undo and manual sliders stay truthful. */
export function detectSelectionLook(layers: readonly Layer[]): LookMatch {
  if (!layers.length) return { id: 'empty' };
  const first = layers[0];
  if (layers.some((layer) => LOOK_KEYS.some((key) => !close(layer[key], first[key]))))
    return { id: 'mixed' };
  if (LOOK_KEYS.every((key) => close(first[key], 1))) return { id: 'original', strength: 100 };
  for (const recipe of LOOK_PRESETS.slice(1)) {
    const dominant = LOOK_KEYS.reduce((a, b) =>
      Math.abs(recipe[a] - 1) > Math.abs(recipe[b] - 1) ? a : b,
    );
    const amount = (first[dominant] - 1) / (recipe[dominant] - 1);
    if (
      amount > 0 &&
      amount <= 1.00001 &&
      LOOK_KEYS.every((key) => close(first[key], 1 + (recipe[key] - 1) * amount))
    )
      return { id: recipe.id, strength: Math.round(amount * 1000) / 10 };
  }
  return { id: 'custom' };
}

type MotionValues = Required<
  Pick<
    Layer,
    | 'animation'
    | 'animationDuration'
    | 'animationDelay'
    | 'animationEasing'
    | 'animationDistance'
    | 'exitDuration'
    | 'exitAnimation'
    | 'exitEasing'
    | 'loopAnimation'
    | 'loopDuration'
    | 'loopAmount'
  >
>;
export const MOTION_PRESETS = [
  { id: 'none', name: 'None', duration: 0.6, easing: 'ease-out', exit: 0 },
  { id: 'fade', name: 'Gentle fade', duration: 0.65, easing: 'ease-in-out', exit: 0.2 },
  { id: 'rise', name: 'Rise', duration: 0.7, easing: 'ease-out', exit: 0.2 },
  { id: 'slide', name: 'Slide', duration: 0.55, easing: 'ease-out', exit: 0.15 },
  { id: 'pop', name: 'Pop', duration: 0.45, easing: 'ease-out', exit: 0.15 },
] as const satisfies readonly {
  id: Animation;
  name: string;
  duration: number;
  easing: AnimationEasing;
  exit: number;
}[];
type MotionPresetId = (typeof MOTION_PRESETS)[number]['id'];

export function getMotionPresetPatch(id: MotionPresetId): Partial<Layer> {
  const recipe = MOTION_PRESETS.find((preset) => preset.id === id)!;
  return {
    animation: id,
    animationDuration: recipe.duration,
    animationDelay: 0,
    animationEasing: recipe.easing,
    animationDistance: undefined,
    exitDuration: recipe.exit,
    exitAnimation: recipe.exit > 0 ? 'fade' : 'none',
    exitEasing: undefined,
    loopAnimation: 'none',
    loopDuration: 2,
    loopAmount: undefined,
  };
}

function motionValues(layer: Layer): MotionValues {
  return {
    animation: layer.animation,
    animationDuration: layer.animationDuration ?? 0.6,
    animationDelay: layer.animationDelay ?? 0,
    animationEasing: layer.animationEasing ?? 'ease-out',
    animationDistance: getAnimationDistance(layer),
    exitDuration: layer.exitDuration ?? 0,
    exitAnimation: (layer.exitDuration ?? 0) > 0 ? (layer.exitAnimation ?? 'fade') : 'none',
    exitEasing: layer.exitEasing ?? layer.animationEasing ?? 'ease-out',
    loopAnimation: layer.loopAnimation ?? 'none',
    loopDuration: layer.loopDuration ?? 2,
    loopAmount: getLoopTiming(layer).amount,
  };
}

export function detectSelectionMotion(
  layers: readonly Layer[],
): Animation | 'custom' | 'mixed' | 'empty' {
  if (!layers.length) return 'empty';
  const first = motionValues(layers[0]);
  const same = (a: MotionValues, b: MotionValues) =>
    (Object.keys(a) as (keyof MotionValues)[]).every((key) =>
      typeof a[key] === 'number' ? close(a[key] as number, b[key] as number) : a[key] === b[key],
    );
  if (layers.some((layer) => !same(motionValues(layer), first))) return 'mixed';
  if (
    first.animation === 'none' &&
    (first.exitDuration === 0 || first.exitAnimation === 'none') &&
    first.loopAnimation === 'none'
  )
    return 'none';
  return (
    MOTION_PRESETS.find((preset) =>
      same(first, motionValues({ ...layers[0], ...getMotionPresetPatch(preset.id) })),
    )?.id ?? 'custom'
  );
}
