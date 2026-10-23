import type { Animation, AnimationEasing, ExitAnimation, Layer, LoopAnimation } from './types';

export const ENTRANCE_OPTIONS = [
  { id: 'none', label: 'None' },
  { id: 'fade', label: 'Fade in' },
  { id: 'rise', label: 'Rise' },
  { id: 'fall', label: 'Fall' },
  { id: 'slide', label: 'From left' },
  { id: 'slide-right', label: 'From right' },
  { id: 'pop', label: 'Pop in' },
  { id: 'zoom-out', label: 'Settle in' },
] as const satisfies readonly { id: Animation; label: string }[];
export const EXIT_OPTIONS = [
  { id: 'none', label: 'None' },
  { id: 'fade', label: 'Fade out' },
  { id: 'reverse', label: 'Reverse entrance' },
  { id: 'rise', label: 'Move up' },
  { id: 'fall', label: 'Move down' },
  { id: 'slide-left', label: 'Move left' },
  { id: 'slide-right', label: 'Move right' },
  { id: 'shrink', label: 'Shrink away' },
] as const satisfies readonly { id: ExitAnimation; label: string }[];
export const LOOP_OPTIONS = [
  { id: 'none', label: 'None' },
  { id: 'float', label: 'Float' },
  { id: 'pulse', label: 'Pulse' },
] as const satisfies readonly { id: LoopAnimation; label: string }[];

const clamp = (value: number, maximum = 1) => Math.min(maximum, Math.max(0, value));

/** Authored settings stay intact when a clip is shortened; only effective timings are fitted. */
export function getMotionTiming(layer: Layer): {
  delay: number;
  duration: number;
  exitDuration: number;
} {
  const length = Math.max(0, layer.duration);
  const delay = clamp(layer.animationDelay ?? 0, length);
  return {
    delay,
    duration: clamp(layer.animationDuration ?? 0.6, length - delay),
    exitDuration: layer.exitAnimation === 'none' ? 0 : clamp(layer.exitDuration ?? 0, length),
  };
}

/** Travel defaults match legacy entrances, including when reused by a directional exit. */
export function getAnimationDistance(
  layer: Layer,
  direction: Animation | ExitAnimation = layer.animation,
): number {
  return layer.animationDistance ?? (direction.startsWith('slide') ? 80 : 48);
}

/** Loops begin at rest after any entrance, including an element's 3D entrance. */
export function getLoopTiming(layer: Layer): { delay: number; period: number; amount: number } {
  const { delay, duration } = getMotionTiming(layer);
  const has3DEntrance =
    layer.transform3d?.enabled &&
    (layer.transform3d.motion === 'tilt-in' || layer.transform3d.motion === 'flip-in');
  return {
    delay: delay + (layer.animation !== 'none' || has3DEntrance ? duration : 0),
    period: Math.max(0.4, layer.loopDuration ?? 2),
    amount: layer.loopAmount ?? (layer.loopAnimation === 'pulse' ? 8 : 12),
  };
}

/** Remove motion without flattening or repositioning the selected 3D element. */
export function resetMotionPatch(layer: Layer): Partial<Layer> {
  return {
    animation: 'none',
    animationDuration: 0.6,
    animationDelay: 0,
    animationEasing: 'ease-out',
    animationDistance: undefined,
    exitAnimation: 'none',
    exitDuration: 0,
    exitEasing: undefined,
    loopAnimation: 'none',
    loopDuration: 2,
    loopAmount: undefined,
    ...(layer.transform3d ? { transform3d: { ...layer.transform3d, motion: 'none' } } : {}),
  };
}

export function getAudioTiming(layer: Layer): { fadeIn: number; fadeOut: number } {
  const length = Math.max(0, layer.duration);
  return {
    fadeIn: clamp(layer.audioFadeIn ?? 0, length),
    fadeOut: clamp(layer.audioFadeOut ?? 0, length),
  };
}

export function easeProgress(progress: number, easing: AnimationEasing = 'ease-out'): number {
  const value = clamp(progress);
  if (easing === 'linear') return value;
  if (easing === 'ease-in') return value ** 3;
  if (easing === 'ease-in-out') return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
  return 1 - (1 - value) ** 3;
}

/** Gain is independent of visual opacity; overlapping ramps multiply smoothly. */
export function audioEnvelope(layer: Layer, time: number): number {
  const elapsed = time - layer.start;
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= layer.duration) return 0;
  const { fadeIn, fadeOut } = getAudioTiming(layer);
  return (
    (fadeIn > 0 ? clamp(elapsed / fadeIn) : 1) *
    (fadeOut > 0 ? clamp((layer.duration - elapsed) / fadeOut) : 1)
  );
}
