import type { AnimationEasing, Layer } from './types';

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
    exitDuration: clamp(layer.exitDuration ?? 0, length),
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
