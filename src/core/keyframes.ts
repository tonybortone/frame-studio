import type {
  KeyframeCurve,
  KeyframeEasing,
  KeyframeProperty,
  Layer,
  LayerKeyframes,
  PropertyKeyframe,
} from './types';

export const KEYFRAME_PROPERTIES = ['x', 'y', 'width', 'height', 'rotation', 'opacity'] as const;
export const KEYFRAME_EASINGS = [
  'linear',
  'hold',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'custom',
] as const;
export const MAX_PROPERTY_KEYFRAMES = 256;
export const MAX_KEYFRAME_TIME = 172800;
export const DEFAULT_KEYFRAME_CURVE: KeyframeCurve = [0.25, 0.1, 0.25, 1];
export const KEYFRAME_LIMITS: Record<KeyframeProperty, readonly [number, number]> = {
  x: [-100000, 100000],
  y: [-100000, 100000],
  width: [0.01, 32768],
  height: [0.01, 32768],
  rotation: [-360000, 360000],
  opacity: [0, 1],
};
const bound = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const boundedValue = (property: KeyframeProperty, value: number) =>
  bound(value, ...KEYFRAME_LIMITS[property]);
const cubic = (t: number, first: number, second: number) =>
  3 * (1 - t) ** 2 * t * first + 3 * (1 - t) * t ** 2 * second + t ** 3;

/** Solve the curve's x coordinate before sampling y; overshoot is intentional. */
export function cubicBezierProgress(progress: number, curve: KeyframeCurve): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  let low = 0,
    high = 1;
  for (let iteration = 0; iteration < 40; iteration++) {
    const t = (low + high) / 2;
    if (cubic(t, curve[0], curve[2]) < progress) low = t;
    else high = t;
  }
  return cubic((low + high) / 2, curve[1], curve[3]);
}

export function getKeyframeCurve(frame: Pick<PropertyKeyframe, 'easing' | 'curve'>): KeyframeCurve {
  if (frame.easing === 'custom') return [...(frame.curve ?? DEFAULT_KEYFRAME_CURVE)];
  if (frame.easing === 'ease-in') return [0.42, 0, 1, 1];
  if (frame.easing === 'ease-out') return [0, 0, 0.58, 1];
  if (frame.easing === 'ease-in-out') return [0.42, 0, 0.58, 1];
  return [0, 0, 1, 1];
}

export function evaluateKeyframeProgress(
  frame: Pick<PropertyKeyframe, 'easing' | 'curve'>,
  progress: number,
): number {
  if (frame.easing === 'hold') return progress >= 1 ? 1 : 0;
  if (frame.easing === 'linear') return bound(progress, 0, 1);
  return cubicBezierProgress(progress, getKeyframeCurve(frame));
}

export function getLocalKeyframeTime(layer: Layer, frame: PropertyKeyframe): number {
  return frame.time - (layer.keyframeOffset ?? 0);
}

export function evaluateKeyframeProperty(
  layer: Layer,
  property: KeyframeProperty,
  localTime: number,
): number {
  const frames = layer.keyframes?.[property];
  if (!frames?.length) return layer[property];
  const time = localTime + (layer.keyframeOffset ?? 0);
  if (time <= frames[0].time) return frames[0].value;
  const last = frames[frames.length - 1];
  if (time >= last.time) return last.value;
  let low = 0,
    high = frames.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (frames[middle].time <= time) low = middle;
    else high = middle;
  }
  const left = frames[low],
    right = frames[high];
  const progress = evaluateKeyframeProgress(left, (time - left.time) / (right.time - left.time));
  return boundedValue(property, left.value + (right.value - left.value) * progress);
}

/** Evaluate once before rendering; never overwrite authored keys or base values. */
export function evaluateKeyframedLayer(layer: Layer, projectTime: number): Layer {
  if (!KEYFRAME_PROPERTIES.some((property) => layer.keyframes?.[property]?.length)) return layer;
  const evaluated = { ...layer };
  for (const property of KEYFRAME_PROPERTIES) {
    if (layer.keyframes?.[property]?.length)
      evaluated[property] = evaluateKeyframeProperty(layer, property, projectTime - layer.start);
  }
  return evaluated;
}

function checkedLocalTime(layer: Layer, time: number): number {
  if (!Number.isFinite(time)) throw new Error('Keyframe time must be a finite number.');
  return bound(time, 0, Math.max(0, layer.duration));
}

type KeyframeOptions = { id?: string; easing?: KeyframeEasing; curve?: KeyframeCurve };

/** Insert or replace one key. Only the affected track is copied; other tracks remain intact. */
export function upsertKeyframe(
  layer: Layer,
  property: KeyframeProperty,
  localTime: number,
  value = evaluateKeyframeProperty(layer, property, localTime),
  options: KeyframeOptions = {},
): Partial<Layer> {
  if (!Number.isFinite(value)) throw new Error('Keyframe value must be a finite number.');
  if (options.id !== undefined && (!options.id.trim() || options.id.length > 128))
    throw new Error('Choose a valid keyframe ID.');
  if (options.easing !== undefined && !KEYFRAME_EASINGS.includes(options.easing))
    throw new Error('Unsupported keyframe easing.');
  if (
    options.curve &&
    (options.curve.length !== 4 ||
      options.curve.some(
        (value, index) =>
          !Number.isFinite(value) || value < (index % 2 ? -4 : 0) || value > (index % 2 ? 4 : 1),
      ))
  )
    throw new Error('Choose a bounded Bézier curve.');
  let offset = layer.keyframeOffset ?? 0;
  let keyframes = layer.keyframes ?? {};
  let time = checkedLocalTime(layer, localTime) + offset;
  // Extending a clip left may expose negative authored times. Rebase every track
  // together so storage stays nonnegative while local positions remain unchanged.
  if (time < 0) {
    const shift = -time;
    keyframes = Object.fromEntries(
      Object.entries(keyframes).map(([key, frames]) => [
        key,
        frames!.map((frame) => ({ ...frame, time: frame.time + shift })),
      ]),
    ) as LayerKeyframes;
    offset += shift;
    time = 0;
  }
  const original = keyframes[property] ?? [];
  const sameTime = original.find((frame) => Math.abs(frame.time - time) < 1e-8);
  const sameId = options.id ? original.find((frame) => frame.id === options.id) : undefined;
  const previous = sameId ?? sameTime;
  const easing = options.easing ?? previous?.easing ?? 'linear';
  const frame: PropertyKeyframe = {
    id: options.id ?? sameTime?.id ?? crypto.randomUUID(),
    time,
    value: boundedValue(property, value),
    easing,
    ...(easing === 'custom'
      ? {
          curve: [...(options.curve ?? previous?.curve ?? DEFAULT_KEYFRAME_CURVE)] as KeyframeCurve,
        }
      : {}),
  };
  const next = original
    .filter((key) => key.id !== frame.id && Math.abs(key.time - time) >= 1e-8)
    .concat(frame)
    .sort((a, b) => a.time - b.time);
  if (next.length > MAX_PROPERTY_KEYFRAMES)
    throw new Error(`A property supports up to ${MAX_PROPERTY_KEYFRAMES} keyframes.`);
  if (
    Math.abs(offset) > MAX_KEYFRAME_TIME ||
    Object.values(keyframes).some((frames) =>
      frames?.some((key) => key.time > MAX_KEYFRAME_TIME),
    ) ||
    next.some((key) => key.time > MAX_KEYFRAME_TIME)
  )
    throw new Error('Keyframe time is outside the supported range.');
  return {
    keyframes: { ...keyframes, [property]: next },
    ...(offset !== (layer.keyframeOffset ?? 0) ? { keyframeOffset: offset } : {}),
  };
}

export function removeKeyframe(
  layer: Layer,
  property: KeyframeProperty,
  id: string,
): Partial<Layer> {
  const frames = layer.keyframes?.[property];
  if (!frames?.some((frame) => frame.id === id)) return {};
  const keyframes = { ...layer.keyframes };
  const remaining = frames.filter((frame) => frame.id !== id);
  if (remaining.length) keyframes[property] = remaining;
  else delete keyframes[property];
  return Object.keys(keyframes).length
    ? { keyframes }
    : { keyframes: undefined, keyframeOffset: undefined };
}

export function moveKeyframe(
  layer: Layer,
  property: KeyframeProperty,
  id: string,
  localTime: number,
): Partial<Layer> {
  const frame = layer.keyframes?.[property]?.find((key) => key.id === id);
  return frame ? upsertKeyframe(layer, property, localTime, frame.value, frame) : {};
}

/** Auto-key already tracked scalar fields; static fields retain ordinary editing behavior. */
export function keyframeGeometryPatch(
  layer: Layer,
  patch: Partial<Layer>,
  projectTime: number,
  fps: number,
): Partial<Layer> {
  const result = { ...patch };
  let authored = layer;
  const localTime = Math.round((projectTime - layer.start) * fps) / fps;
  for (const property of KEYFRAME_PROPERTIES) {
    if (typeof patch[property] !== 'number' || !layer.keyframes?.[property]?.length) continue;
    const next = upsertKeyframe(authored, property, localTime, patch[property]);
    authored = { ...authored, ...next };
    Object.assign(result, next);
    delete result[property];
  }
  return result;
}

/** Geometry transforms apply to absolute key values as well as the caller's base geometry. */
export function transformKeyframeGeometry(
  layer: Layer,
  {
    scale = 1,
    translateX = 0,
    translateY = 0,
  }: { scale?: number; translateX?: number; translateY?: number },
): Partial<Layer> {
  if (!layer.keyframes) return {};
  if (![scale, translateX, translateY].every(Number.isFinite) || scale <= 0)
    throw new Error('Choose a positive scale and finite translation.');
  const keyframes = { ...layer.keyframes };
  for (const property of ['x', 'y', 'width', 'height'] as const) {
    if (!keyframes[property]) continue;
    keyframes[property] = keyframes[property]!.map((frame) => {
      const value =
        frame.value * scale + (property === 'x' ? translateX : property === 'y' ? translateY : 0);
      if (value !== boundedValue(property, value))
        throw new Error('That transform would move a keyframe outside the supported range.');
      return { ...frame, value };
    });
  }
  return { keyframes };
}
