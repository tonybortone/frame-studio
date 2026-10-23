import { easeProgress, getMotionTiming } from './motion';
import type { Layer } from './types';

/** A subtle initial pose makes element-level perspective visible immediately. */
export const DEFAULT_ELEMENT_3D = {
  enabled: true,
  rotateX: 12,
  rotateY: -18,
  z: 0,
  motion: 'none',
} as const;

export interface ElementPoint {
  x: number;
  y: number;
}
export type ElementQuad = [ElementPoint, ElementPoint, ElementPoint, ElementPoint];
export interface Element3DState {
  rotateX: number;
  rotateY: number;
  z: number;
}
export interface Element2DMotion {
  x: number;
  y: number;
  scale: number;
}
const STILL: Element2DMotion = { x: 0, y: 0, scale: 1 };
const radians = (angle: number) => (angle * Math.PI) / 180;
const clampDepth = (value: number) => Math.min(100, Math.max(-100, value));

export function hasElement3D(layer: Layer): boolean {
  return layer.kind !== 'audio' && layer.transform3d?.enabled === true;
}

/** Clip-relative motion; entrances always settle at the authored transform. */
export function getElement3DState(layer: Layer, time: number): Element3DState {
  if (!hasElement3D(layer)) return { rotateX: 0, rotateY: 0, z: 0 };
  const transform = layer.transform3d!;
  const authored = {
    rotateX: transform.rotateX,
    rotateY: transform.rotateY,
    z: transform.z,
  };
  const { delay, duration } = getMotionTiming(layer);
  const elapsed = time - layer.start - delay;
  if (transform.motion === 'float') {
    // A sine cycle starts at rest, so adding a delay cannot introduce a jump.
    if (elapsed <= 0) return authored;
    const period = Math.max(0.4, layer.animationDuration ?? 0.6);
    const wave = Math.sin((elapsed / period) * Math.PI * 2);
    return {
      rotateX: authored.rotateX + wave * 6,
      rotateY: authored.rotateY + wave * 10,
      z: clampDepth(authored.z + wave * 4),
    };
  }
  const progress = duration > 0 ? elapsed / duration : elapsed >= 0 ? 1 : 0;
  const remaining = 1 - easeProgress(progress, layer.animationEasing);
  if (transform.motion === 'tilt-in')
    return {
      rotateX: authored.rotateX + 28 * remaining,
      rotateY: authored.rotateY - 42 * remaining,
      z: clampDepth(authored.z - 18 * remaining),
    };
  if (transform.motion === 'flip-in')
    return {
      rotateX: authored.rotateX,
      rotateY: authored.rotateY - 120 * remaining,
      z: clampDepth(authored.z - 12 * remaining),
    };
  return authored;
}

/** Local perspective does not reorder layers or move any other layer. */
export function createElementProjector(
  layer: Layer,
  time: number,
  animation: Element2DMotion = STILL,
): (point: ElementPoint) => ElementPoint {
  const state = getElement3DState(layer, time);
  const distance = 2.5 * Math.max(1, layer.width, layer.height);
  const depth = (clampDepth(state.z) / 100) * distance * 0.5;
  const cx = Math.cos(radians(state.rotateX));
  const sx = Math.sin(radians(state.rotateX));
  const cy = Math.cos(radians(state.rotateY));
  const sy = Math.sin(radians(state.rotateY));
  const cz = Math.cos(radians(layer.rotation));
  const sz = Math.sin(radians(layer.rotation));
  const centerX = layer.x + layer.width / 2 + animation.x;
  const centerY = layer.y + layer.height / 2 + animation.y;
  return (point) => {
    const x = point.x - layer.width / 2;
    const y = point.y - layer.height / 2;
    // X tilt, Y turn, then the existing in-plane Z rotation.
    const turnedX = x * cy + y * sx * sy;
    const tiltedY = y * cx;
    const turnedZ = -x * sy + y * sx * cy;
    // Valid authored bounds stay comfortably behind this near plane. The clamp
    // also keeps external callers and numerical edge cases finite.
    const perspective = distance / Math.max(distance * 0.1, distance - depth - turnedZ);
    return {
      x: centerX + (turnedX * cz - tiltedY * sz) * perspective * animation.scale,
      y: centerY + (turnedX * sz + tiltedY * cz) * perspective * animation.scale,
    };
  };
}

export function projectElementPoint(
  layer: Layer,
  time: number,
  point: ElementPoint,
  animation: Element2DMotion = STILL,
): ElementPoint {
  return createElementProjector(layer, time, animation)(point);
}

/** Clockwise local corners; the projected winding reverses on the back face. */
export function getElement3DQuad(
  layer: Layer,
  time: number,
  animation: Element2DMotion = STILL,
): ElementQuad {
  const project = createElementProjector(layer, time, animation);
  return [
    project({ x: 0, y: 0 }),
    project({ x: layer.width, y: 0 }),
    project({ x: layer.width, y: layer.height }),
    project({ x: 0, y: layer.height }),
  ];
}

export function getQuadBounds(quad: ElementQuad): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const x = Math.min(...quad.map((point) => point.x));
  const y = Math.min(...quad.map((point) => point.y));
  return {
    x,
    y,
    width: Math.max(...quad.map((point) => point.x)) - x,
    height: Math.max(...quad.map((point) => point.y)) - y,
  };
}

/** Convex projected bounds, including back faces; an edge-on plane has no area. */
export function pointInQuad(point: ElementPoint, quad: ElementQuad): boolean {
  let positive = false;
  let negative = false;
  let area = 0;
  for (let index = 0; index < 4; index++) {
    const a = quad[index];
    const b = quad[(index + 1) % 4];
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    if (cross > 1e-7) positive = true;
    if (cross < -1e-7) negative = true;
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) > 1e-7 && !(positive && negative);
}
