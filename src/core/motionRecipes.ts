import type {
  KeyframeCurve,
  KeyframeEasing,
  KeyframeProperty,
  Layer,
  LayerKeyframes,
  Project,
  PropertyKeyframe,
} from './types';
import {
  KEYFRAME_LIMITS,
  MAX_KEYFRAME_TIME,
  MAX_PROPERTY_KEYFRAMES,
  evaluateKeyframedLayer,
  evaluateKeyframeProperty,
  evaluateKeyframeProgress,
  getKeyframeBaseValue,
  getKeyframeCurve,
} from './keyframes';

export type MotionRecipeId =
  | 'soft-rise'
  | 'slide'
  | 'spring-pop'
  | 'focus-zoom'
  | 'tilt-reveal'
  | 'float'
  | 'wipe'
  | 'type-on'
  | 'carousel'
  | 'page-tour';
export type MotionRecipeDirection = 'left' | 'right' | 'up' | 'down' | 'center';
export type MotionRecipeGrouping = 'groups' | 'together' | 'individual';
export interface MotionRecipe {
  id: MotionRecipeId;
  title: string;
  description: string;
  category: 'entrance' | 'motion' | 'reveal' | 'showcase';
  defaultDuration: number;
}
export const MOTION_RECIPES: readonly MotionRecipe[] = [
  {
    id: 'soft-rise',
    title: 'Soft rise',
    description: 'Lift into place with a soft focus and fade.',
    category: 'entrance',
    defaultDuration: 0.8,
  },
  {
    id: 'slide',
    title: 'Slide in',
    description: 'Bring a layer or whole component in from one side.',
    category: 'entrance',
    defaultDuration: 0.8,
  },
  {
    id: 'spring-pop',
    title: 'Spring pop',
    description: 'A small overshoot and settle, built from editable keys.',
    category: 'entrance',
    defaultDuration: 0.9,
  },
  {
    id: 'focus-zoom',
    title: 'Focus zoom',
    description: 'Pull a close-up into sharp focus.',
    category: 'entrance',
    defaultDuration: 1.2,
  },
  {
    id: 'tilt-reveal',
    title: 'Tilt reveal',
    description: 'Turn a whole component into view on one shared 3D plane.',
    category: 'entrance',
    defaultDuration: 1.4,
  },
  {
    id: 'float',
    title: 'Gentle float',
    description: 'A complete up-and-down cycle that returns to its starting pose.',
    category: 'motion',
    defaultDuration: 3,
  },
  {
    id: 'wipe',
    title: 'Mask reveal',
    description: 'Reveal the artwork through a simple directional mask.',
    category: 'reveal',
    defaultDuration: 0.9,
  },
  {
    id: 'type-on',
    title: 'Type on',
    description: 'Reveal editable text by character or word.',
    category: 'reveal',
    defaultDuration: 1.4,
  },
  {
    id: 'carousel',
    title: 'Card sequence',
    description: 'Slide and settle cards in order; stagger controls the spacing.',
    category: 'showcase',
    defaultDuration: 1.2,
  },
  {
    id: 'page-tour',
    title: 'Website tour',
    description: 'Zoom into a page, travel down it, then pull back to an overview.',
    category: 'showcase',
    defaultDuration: 12,
  },
];

export interface MotionRecipeOptions {
  recipeId: MotionRecipeId;
  /** Project seconds; the start and duration are snapped to composition frames. */
  at: number;
  /** Duration for each component, not the complete staggered sequence. */
  duration: number;
  /** Intensity multiplier, from 0.25 to 2. */
  strength?: number;
  /** Delay between components in seconds, from 0 to 10. */
  stagger?: number;
  order?: 'forward' | 'reverse';
  grouping?: MotionRecipeGrouping;
  direction?: MotionRecipeDirection;
  textMode?: 'characters' | 'words';
  /** Keep a new entrance hidden before its staggered start. Existing animated tracks are preserved. */
  hideBefore?: boolean;
}
export interface MotionRecipeResult {
  /** Complete replacement layer array. Unaffected layers retain object identity. */
  layers: Layer[];
  affectedIds: string[];
  skippedIds: string[];
  /** Group members included even though only another member was selected. */
  expandedIds: string[];
  start: number;
  end: number;
  replacedKeyframes: number;
}

type Values = Partial<Record<KeyframeProperty, number>>;
type Pose = { progress: number; values: Values; easing?: KeyframeEasing; curve?: KeyframeCurve };
type CurveShape = Pick<PropertyKeyframe, 'easing' | 'curve'>;
type Unit = { layers: Layer[]; start: number; end: number };
type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};
const EPSILON = 1e-8;
const SMOOTH: CurveShape = { easing: 'custom', curve: [0.22, 1, 0.36, 1] };
const near = (a: number, b: number) => Math.abs(a - b) <= EPSILON;
const rounded = (value: number) => Math.round(value * 1e10) / 1e10;
const finiteRange = (value: number, min: number, max: number, label: string) => {
  if (!Number.isFinite(value) || value < min || value > max)
    throw new Error(`${label} must be between ${min} and ${max}.`);
};

function groupBounds(layers: Layer[]): Bounds {
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const layer of layers) {
    const angle = (layer.rotation * Math.PI) / 180;
    const halfWidth =
      (Math.abs(Math.cos(angle)) * layer.width + Math.abs(Math.sin(angle)) * layer.height) / 2;
    const halfHeight =
      (Math.abs(Math.sin(angle)) * layer.width + Math.abs(Math.cos(angle)) * layer.height) / 2;
    const centerX = layer.x + layer.width / 2,
      centerY = layer.y + layer.height / 2;
    left = Math.min(left, centerX - halfWidth);
    right = Math.max(right, centerX + halfWidth);
    top = Math.min(top, centerY - halfHeight);
    bottom = Math.max(bottom, centerY + halfHeight);
  }
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

/** Scale member centers and dimensions around one pivot, preserving component geometry. */
function geometry(
  layer: Layer,
  bounds: Bounds,
  scale = 1,
  centerX = bounds.centerX,
  centerY = bounds.centerY,
): Values {
  const width = layer.width * scale,
    height = layer.height * scale;
  return {
    x: centerX + (layer.x + layer.width / 2 - bounds.centerX) * scale - width / 2,
    y: centerY + (layer.y + layer.height / 2 - bounds.centerY) * scale - height / 2,
    width,
    height,
  };
}

function directionVector(direction: MotionRecipeDirection): [number, number] {
  if (direction === 'left') return [-1, 0];
  if (direction === 'right') return [1, 0];
  if (direction === 'down') return [0, 1];
  return [0, -1];
}

function posesFor(
  project: Project,
  layer: Layer,
  bounds: Bounds,
  options: Required<Pick<MotionRecipeOptions, 'recipeId' | 'strength' | 'direction'>>,
  common: { rotateX: number; rotateY: number; depth: number },
): Pose[] {
  const { recipeId, strength, direction } = options;
  const end = (values: Values): Pose => ({ progress: 1, values });
  const begin = (values: Values): Pose => ({ progress: 0, values, ...SMOOTH });
  const blur = getKeyframeBaseValue(layer, 'blur');
  const travel = Math.min(project.width, project.height) * 0.12 * strength;
  if (recipeId === 'soft-rise')
    return [
      begin({ y: layer.y + travel * 0.6, opacity: 0, blur: Math.min(80, blur + 16 * strength) }),
      end({ y: layer.y, opacity: layer.opacity, blur }),
    ];
  if (recipeId === 'slide' || recipeId === 'carousel') {
    const [dx, dy] = directionVector(direction === 'center' ? 'right' : direction);
    const size = recipeId === 'carousel' ? 1 - 0.08 * strength : 1;
    return [
      begin({
        ...geometry(
          layer,
          bounds,
          size,
          bounds.centerX + dx * travel * 1.6,
          bounds.centerY + dy * travel * 1.6,
        ),
        opacity: 0,
      }),
      end({ ...geometry(layer, bounds), opacity: layer.opacity }),
    ];
  }
  if (recipeId === 'spring-pop')
    return [
      {
        progress: 0,
        values: { ...geometry(layer, bounds, Math.max(0.2, 1 - 0.3 * strength)), opacity: 0 },
        easing: 'ease-out',
      },
      {
        progress: 0.56,
        values: { ...geometry(layer, bounds, 1 + 0.085 * strength), opacity: layer.opacity },
        easing: 'ease-in-out',
      },
      {
        progress: 0.8,
        values: { ...geometry(layer, bounds, 1 - 0.025 * strength), opacity: layer.opacity },
        easing: 'ease-in-out',
      },
      end({ ...geometry(layer, bounds), opacity: layer.opacity }),
    ];
  if (recipeId === 'focus-zoom')
    return [
      begin({
        ...geometry(layer, bounds, 1 + 0.22 * strength),
        opacity: 0,
        blur: Math.min(80, blur + 20 * strength),
      }),
      end({ ...geometry(layer, bounds), opacity: layer.opacity, blur }),
    ];
  if (recipeId === 'tilt-reveal')
    return [
      begin({
        ...geometry(
          layer,
          bounds,
          1 - 0.08 * strength,
          bounds.centerX,
          bounds.centerY + travel * 0.4,
        ),
        opacity: 0,
        blur: Math.min(80, blur + 10 * strength),
        rotateX: common.rotateX + 18 * strength,
        rotateY: common.rotateY - 24 * strength,
        depth: common.depth,
      }),
      end({ ...geometry(layer, bounds), opacity: layer.opacity, blur, ...common }),
    ];
  if (recipeId === 'float')
    return [
      { progress: 0, values: { y: layer.y }, easing: 'ease-in-out' },
      { progress: 0.25, values: { y: layer.y - travel * 0.25 }, easing: 'ease-in-out' },
      { progress: 0.5, values: { y: layer.y }, easing: 'ease-in-out' },
      { progress: 0.75, values: { y: layer.y + travel * 0.25 }, easing: 'ease-in-out' },
      end({ y: layer.y }),
    ];
  if (recipeId === 'wipe')
    return [begin({ reveal: 0 }), end({ reveal: getKeyframeBaseValue(layer, 'reveal') })];
  if (recipeId === 'type-on')
    return [
      { progress: 0, values: { textReveal: 0 }, easing: 'linear' },
      end({ textReveal: getKeyframeBaseValue(layer, 'textReveal') }),
    ];
  const fit = Math.min(
    (project.width * 0.78) / bounds.width,
    (project.height * 0.82) / bounds.height,
  );
  const fullWidth = Math.max(fit, (project.width * 0.82) / bounds.width);
  const detail = Math.min(fit * 6, fit + (fullWidth - fit) * strength);
  const centerX = project.width / 2,
    centerY = project.height / 2;
  const overflow = Math.max(0, bounds.height * detail - project.height * 0.76);
  const topCenter = centerY + overflow / 2,
    bottomCenter = centerY - overflow / 2;
  return [
    {
      progress: 0,
      values: {
        ...geometry(layer, bounds, fit * 0.96, centerX, centerY),
        rotateX: 8 * strength,
        rotateY: -16 * strength,
        depth: 0,
        opacity: 0,
        blur: Math.min(80, blur + 12 * strength),
      },
      ...SMOOTH,
    },
    {
      progress: 0.16,
      values: {
        ...geometry(layer, bounds, detail, centerX, topCenter),
        rotateX: 8 * strength,
        rotateY: -10 * strength,
        depth: 0,
        opacity: layer.opacity,
        blur,
      },
      easing: 'ease-in-out',
    },
    {
      progress: 0.57,
      values: {
        ...geometry(layer, bounds, detail, centerX, bottomCenter),
        rotateX: -5 * strength,
        rotateY: 12 * strength,
        depth: 0,
        opacity: layer.opacity,
        blur,
      },
      easing: 'ease-in-out',
    },
    {
      progress: 0.73,
      values: {
        ...geometry(layer, bounds, detail, centerX, bottomCenter),
        rotateX: -2 * strength,
        rotateY: 10 * strength,
        depth: 0,
        opacity: layer.opacity,
        blur,
      },
      easing: 'ease-in-out',
    },
    end({
      ...geometry(layer, bounds, fit, centerX, centerY),
      rotateX: 0,
      rotateY: 0,
      depth: 0,
      opacity: layer.opacity,
      blur,
    }),
  ];
}

const pointLerp = (a: number[], b: number[], t: number) =>
  a.map((value, index) => value + (b[index] - value) * t);
/** Subdivide a temporal Bézier so adding a boundary does not reshape the preceding motion. */
function splitCurve(frame: PropertyKeyframe, progress: number): [CurveShape, CurveShape] {
  if (frame.easing === 'linear' || frame.easing === 'hold')
    return [{ easing: frame.easing }, { easing: frame.easing }];
  const curve = getKeyframeCurve(frame);
  const p0 = [0, 0],
    p1 = [curve[0], curve[1]],
    p2 = [curve[2], curve[3]],
    p3 = [1, 1];
  let low = 0,
    high = 1;
  for (let i = 0; i < 55; i++) {
    const t = (low + high) / 2;
    const x = 3 * (1 - t) ** 2 * t * curve[0] + 3 * (1 - t) * t ** 2 * curve[2] + t ** 3;
    if (x < progress) low = t;
    else high = t;
  }
  const t = (low + high) / 2;
  const a = pointLerp(p0, p1, t),
    b = pointLerp(p1, p2, t),
    c = pointLerp(p2, p3, t);
  const d = pointLerp(a, b, t),
    e = pointLerp(b, c, t),
    middle = pointLerp(d, e, t);
  const normalize = (
    from: number[],
    first: number[],
    second: number[],
    to: number[],
  ): CurveShape => {
    const dx = to[0] - from[0],
      dy = to[1] - from[1];
    if (Math.abs(dy) < 1e-10) {
      if (Math.abs(first[1] - from[1]) < 1e-10 && Math.abs(second[1] - from[1]) < 1e-10)
        return { easing: 'linear' };
      throw new Error(
        'This looping Bézier crosses a recipe boundary. Move the recipe to an existing keyframe.',
      );
    }
    const result: KeyframeCurve = [
      (first[0] - from[0]) / dx,
      (first[1] - from[1]) / dy,
      (second[0] - from[0]) / dx,
      (second[1] - from[1]) / dy,
    ];
    if (
      result.some(
        (value, index) =>
          !Number.isFinite(value) ||
          value < (index % 2 ? -4 : -EPSILON) ||
          value > (index % 2 ? 4 : 1 + EPSILON),
      )
    )
      throw new Error(
        'This extreme Bézier crosses a recipe boundary. Move the recipe to an existing keyframe.',
      );
    result[0] = Math.max(0, Math.min(1, result[0]));
    result[2] = Math.max(0, Math.min(1, result[2]));
    return { easing: 'custom', curve: result };
  };
  return [normalize(p0, a, d, middle), normalize(middle, e, c, p3)];
}

function splitTrackCurve(
  left: PropertyKeyframe,
  right: PropertyKeyframe,
  time: number,
  sampledValue: number,
): [CurveShape, CurveShape] {
  const progress = (time - left.time) / (right.time - left.time);
  const rawValue =
    left.value + (right.value - left.value) * evaluateKeyframeProgress(left, progress);
  if (!near(rawValue, sampledValue))
    throw new Error(
      'A bounded overshoot crosses this recipe boundary. Move the recipe to an existing keyframe.',
    );
  return splitCurve(left, progress);
}

function withCurve(frame: PropertyKeyframe, shape: CurveShape): PropertyKeyframe {
  const { curve: _curve, ...rest } = frame;
  return {
    ...rest,
    ...shape,
    ...(shape.curve ? { curve: [...shape.curve] as KeyframeCurve } : {}),
  };
}

function recipeKeyId(
  layer: Layer,
  property: KeyframeProperty,
  time: number,
  occupied: Set<string>,
): string {
  // Stable IDs make the function deterministic, including preview/apply comparisons.
  let hash = 2166136261;
  for (const char of `${layer.id}:${property}:${time}`)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const stem = `motion-${(hash >>> 0).toString(36)}-${property}`;
  let id = stem,
    suffix = 1;
  while (occupied.has(id)) id = `${stem}-${suffix++}`;
  occupied.add(id);
  return id;
}

function applyTrack(
  layer: Layer,
  property: KeyframeProperty,
  poses: Pose[],
  localStart: number,
  localEnd: number,
  fps: number,
  hideBefore: boolean,
): { frames: PropertyKeyframe[]; replaced: number } {
  const offset = layer.keyframeOffset ?? 0;
  const start = rounded(localStart + offset),
    end = rounded(localEnd + offset);
  const original = layer.keyframes?.[property] ?? [];
  const occupied = new Set(original.map((frame) => frame.id));
  const frames = poses.map((pose) => {
    const value = pose.values[property]!;
    const [low, high] = KEYFRAME_LIMITS[property];
    finiteRange(value, low, high, `${layer.name}: ${property}`);
    const localTime =
      pose.progress === 0
        ? localStart
        : pose.progress === 1
          ? localEnd
          : Math.round((layer.start + localStart + (localEnd - localStart) * pose.progress) * fps) /
              fps -
            layer.start;
    return {
      id: recipeKeyId(layer, property, rounded(localTime + offset), occupied),
      time: rounded(localTime + offset),
      value,
      easing: pose.easing ?? 'linear',
      ...(pose.curve ? { curve: [...pose.curve] as KeyframeCurve } : {}),
    } satisfies PropertyKeyframe;
  });
  if (frames.some((frame, index) => index > 0 && frame.time <= frames[index - 1].time + EPSILON))
    throw new Error(
      'This recipe needs a longer duration to keep its keyframes on separate frames.',
    );
  const before = original.filter((frame) => frame.time < start - EPSILON);
  const after = original.filter((frame) => frame.time > end + EPSILON);
  const first = frames[0],
    last = frames[frames.length - 1];
  if (localStart > EPSILON) {
    const left = before[before.length - 1];
    const right = original.find((frame) => frame.time >= start - EPSILON);
    const originalAtStart = evaluateKeyframeProperty(layer, property, localStart);
    const constant = !left || !right || near(left.value, right.value) || left.easing === 'hold';
    if (!near(first.value, originalAtStart) && !constant)
      throw new Error(
        `${layer.name}: ${property} is already moving across the recipe start. Place the recipe before or after that motion, or remove its overlapping keys.`,
      );
    if (left) {
      if (constant) before[before.length - 1] = withCurve(left, { easing: 'hold' });
      else if (right && !near(right.time, start)) {
        const [leftCurve] = splitTrackCurve(left, right, start, originalAtStart);
        before[before.length - 1] = withCurve(left, leftCurve);
      }
    } else {
      const hideStatic =
        hideBefore && !original.length && ['opacity', 'reveal', 'textReveal'].includes(property);
      const value = original.length
        ? original[0].value
        : hideStatic
          ? first.value
          : getKeyframeBaseValue(layer, property);
      before.push({
        id: recipeKeyId(layer, property, offset, occupied),
        time: offset,
        value,
        easing: 'hold',
      });
    }
  }
  if (after.length) {
    const originalAtEnd = evaluateKeyframeProperty(layer, property, localEnd);
    if (!near(last.value, originalAtEnd))
      throw new Error(
        `${layer.name}: ${property} has later animation with a different boundary value. Extend the recipe past those keys, or remove its overlapping keys.`,
      );
    const left = [...original].reverse().find((frame) => frame.time <= end + EPSILON);
    const right = after[0];
    let shape: CurveShape = { easing: 'hold' };
    if (left)
      shape = near(left.time, end) ? left : splitTrackCurve(left, right, end, originalAtEnd)[1];
    frames[frames.length - 1] = withCurve(last, shape);
  }
  const combined = [...before, ...frames, ...after].sort((a, b) => a.time - b.time);
  if (combined.length > MAX_PROPERTY_KEYFRAMES)
    throw new Error(
      `${layer.name}: ${property} would exceed ${MAX_PROPERTY_KEYFRAMES} keyframes. Remove some keys first.`,
    );
  return {
    frames: combined,
    replaced:
      original.length -
      before.filter((frame) => original.some((old) => old.id === frame.id)).length -
      after.length,
  };
}

function selectionUnits(
  project: Project,
  selectedIds: readonly string[],
  grouping: MotionRecipeGrouping,
  textOnly: boolean,
) {
  const selected = new Set(selectedIds);
  const candidates = project.layers.filter((layer) => selected.has(layer.id));
  const expanded = new Set<string>();
  let groups: Layer[][];
  if (textOnly || grouping === 'individual') groups = candidates.map((layer) => [layer]);
  else {
    const seen = new Set<string>();
    groups = [];
    for (const layer of candidates) {
      const id = layer.groupId ? `group:${layer.groupId}` : `layer:${layer.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const members = layer.groupId
        ? project.layers.filter((member) => member.groupId === layer.groupId)
        : [layer];
      for (const member of members) if (!selected.has(member.id)) expanded.add(member.id);
      groups.push(members);
    }
  }
  const skipped = new Set<string>();
  const usable = groups.filter((members) => {
    if (
      members.some(
        (layer) => layer.locked || layer.kind === 'audio' || (textOnly && layer.kind !== 'text'),
      )
    ) {
      members.forEach((layer) => skipped.add(layer.id));
      return false;
    }
    return true;
  });
  return {
    // Together still respects each component's membership and locks before
    // merging the usable components around one shared animation pivot.
    groups: grouping === 'together' && !textOnly && usable.length ? [usable.flat()] : usable,
    skippedIds: [...skipped],
    expandedIds: [...expanded].filter((id) => !skipped.has(id)),
  };
}

/**
 * Bake a recipe into ordinary editable keys in one immutable operation.
 * Existing channels outside the window are retained. Crossing curves are split
 * exactly when boundary values agree; incompatible overlaps are rejected.
 */
export function applyMotionRecipe(
  project: Project,
  selectedIds: readonly string[],
  options: MotionRecipeOptions,
): MotionRecipeResult {
  const recipe = MOTION_RECIPES.find((item) => item.id === options.recipeId);
  if (!recipe) throw new Error('Choose a supported motion recipe.');
  finiteRange(project.fps, 1, 240, 'Frame rate');
  finiteRange(project.width, 1, 32768, 'Canvas width');
  finiteRange(project.height, 1, 32768, 'Canvas height');
  finiteRange(project.duration, 1 / project.fps, MAX_KEYFRAME_TIME, 'Composition duration');
  finiteRange(options.at, 0, project.duration, 'Start time');
  finiteRange(options.duration, 2 / project.fps, 120, 'Duration');
  const strength = options.strength ?? 1,
    stagger = options.stagger ?? 0.12;
  finiteRange(strength, 0.25, 2, 'Strength');
  finiteRange(stagger, 0, 10, 'Stagger');
  const grouping = options.grouping ?? 'groups',
    order = options.order ?? 'forward';
  const direction =
    options.direction ??
    (options.recipeId === 'slide' || options.recipeId === 'carousel' ? 'right' : 'left');
  if (!['groups', 'together', 'individual'].includes(grouping))
    throw new Error('Choose a supported grouping mode.');
  if (!['forward', 'reverse'].includes(order))
    throw new Error('Choose a supported sequence order.');
  if (!['left', 'right', 'up', 'down', 'center'].includes(direction))
    throw new Error('Choose a supported direction.');
  if (options.textMode && !['characters', 'words'].includes(options.textMode))
    throw new Error('Choose characters or words for text reveal.');
  if (options.hideBefore !== undefined && typeof options.hideBefore !== 'boolean')
    throw new Error('Hide until entry must be on or off.');
  const hideBefore =
    options.hideBefore ??
    (recipe.category === 'entrance' ||
      recipe.category === 'reveal' ||
      options.recipeId === 'carousel');
  const { groups, skippedIds, expandedIds } = selectionUnits(
    project,
    selectedIds,
    grouping,
    options.recipeId === 'type-on',
  );
  if (!groups.length)
    throw new Error(
      options.recipeId === 'type-on'
        ? 'Select at least one unlocked text layer.'
        : 'Select at least one unlocked visual layer.',
    );
  if (order === 'reverse') groups.reverse();
  const snap = (value: number) => rounded(Math.round(value * project.fps) / project.fps);
  const duration = snap(options.duration);
  const units: Unit[] = groups.map((layers, index) => {
    const start = snap(options.at + index * stagger),
      end = snap(start + duration);
    if (end > project.duration + EPSILON)
      throw new Error(
        'This sequence extends beyond the composition. Reduce duration or stagger, or extend the composition.',
      );
    for (const layer of layers) {
      if (start < layer.start - EPSILON || end > layer.start + layer.duration + EPSILON)
        throw new Error(
          `${layer.name} is not visible for the whole recipe. Move its start or extend its clip to cover ${start.toFixed(2)}–${end.toFixed(2)} seconds.`,
        );
    }
    return { layers, start, end };
  });
  const updates = new Map<string, Layer>();
  let replacedKeyframes = 0;
  for (const unit of units) {
    const poseTime = options.recipeId === 'float' ? unit.start : unit.end;
    const evaluated = unit.layers.map((layer) =>
      options.recipeId === 'page-tour' ? layer : evaluateKeyframedLayer(layer, poseTime),
    );
    const bounds = groupBounds(evaluated);
    if (![bounds.width, bounds.height].every((value) => Number.isFinite(value) && value > 0))
      throw new Error('The selected component needs positive, finite dimensions.');
    const first = evaluated[0];
    const common = first.transform3d?.enabled
      ? {
          rotateX: getKeyframeBaseValue(first, 'rotateX'),
          rotateY: getKeyframeBaseValue(first, 'rotateY'),
          depth: getKeyframeBaseValue(first, 'depth'),
        }
      : { rotateX: 0, rotateY: 0, depth: 0 };
    const plane = options.recipeId === 'tilt-reveal' || options.recipeId === 'page-tour';
    const originX = options.recipeId === 'page-tour' ? project.width / 2 : bounds.centerX;
    const originY = options.recipeId === 'page-tour' ? project.height / 2 : bounds.centerY;
    const perspectiveDistance = Math.max(project.width, project.height) * 2.5;
    for (let index = 0; index < unit.layers.length; index++) {
      const layer = unit.layers[index],
        current = evaluated[index];
      const spatialTracks = ['rotateX', 'rotateY', 'depth'] as const;
      if (plane) {
        const transform = layer.transform3d;
        const tracks = spatialTracks.flatMap((property) => layer.keyframes?.[property] ?? []);
        const priorOrLater =
          unit.start > layer.start + EPSILON ||
          tracks.some(
            (frame) => frame.time - (layer.keyframeOffset ?? 0) + layer.start > unit.end + EPSILON,
          );
        const posed =
          !!transform?.enabled &&
          (transform.rotateX !== 0 ||
            transform.rotateY !== 0 ||
            transform.z !== 0 ||
            tracks.length > 0);
        const samePlane =
          transform?.originX === originX &&
          transform.originY === originY &&
          transform.perspectiveDistance === perspectiveDistance;
        if (priorOrLater && ((posed && !samePlane) || (tracks.length > 0 && !transform?.enabled)))
          throw new Error(
            `${layer.name}: its existing 3D origin would change outside this recipe. Start at the clip beginning and include its 3D keys, or remove those keys first.`,
          );
      }
      const revealProperty =
        options.recipeId === 'wipe'
          ? 'reveal'
          : options.recipeId === 'type-on'
            ? 'textReveal'
            : undefined;
      if (revealProperty) {
        const modeChanged =
          revealProperty === 'reveal'
            ? direction !== (layer.revealDirection ?? 'left')
            : (options.textMode ?? layer.textRevealMode ?? 'characters') !==
              (layer.textRevealMode ?? 'characters');
        const track = layer.keyframes?.[revealProperty];
        const outsideTracked =
          !!track?.length &&
          (unit.start > layer.start + EPSILON ||
            track.some(
              (frame) =>
                frame.time - (layer.keyframeOffset ?? 0) + layer.start > unit.end + EPSILON,
            ));
        const staticValue = getKeyframeBaseValue(layer, revealProperty);
        const outsidePartial =
          !track?.length &&
          !hideBefore &&
          unit.start > layer.start + EPSILON &&
          staticValue > 0 &&
          staticValue < 1;
        if (modeChanged && (outsideTracked || outsidePartial))
          throw new Error(
            `${layer.name}: changing its reveal direction or text mode would change earlier or later animation. Keep its current mode, or include the whole clip.`,
          );
      }
      const sourceForKeys =
        plane && layer.transform3d && !layer.transform3d.enabled
          ? { ...layer, transform3d: { ...layer.transform3d, rotateX: 0, rotateY: 0, z: 0 } }
          : layer;
      const poses = posesFor(
        project,
        current,
        bounds,
        { recipeId: options.recipeId, strength, direction },
        common,
      );
      const keyframes: LayerKeyframes = { ...layer.keyframes };
      const properties = Object.keys(poses[0].values) as KeyframeProperty[];
      for (const property of properties) {
        const result = applyTrack(
          sourceForKeys,
          property,
          poses,
          unit.start - layer.start,
          unit.end - layer.start,
          project.fps,
          hideBefore,
        );
        keyframes[property] = result.frames;
        replacedKeyframes += result.replaced;
      }
      let offset = layer.keyframeOffset ?? 0;
      const earliest = Math.min(
        0,
        ...Object.values(keyframes).flatMap((frames) => frames!.map((frame) => frame.time)),
      );
      if (earliest < 0) {
        for (const property of Object.keys(keyframes) as KeyframeProperty[])
          keyframes[property] = keyframes[property]!.map((frame) => ({
            ...frame,
            time: rounded(frame.time - earliest),
          }));
        offset -= earliest;
      }
      if (
        Math.abs(offset) > MAX_KEYFRAME_TIME ||
        Object.values(keyframes).some((frames) =>
          frames!.some(
            (frame) =>
              !Number.isFinite(frame.time) || frame.time < 0 || frame.time > MAX_KEYFRAME_TIME,
          ),
        )
      )
        throw new Error('This recipe would put a keyframe outside the supported time range.');
      const next: Layer = {
        ...layer,
        keyframes,
        ...(offset !== (layer.keyframeOffset ?? 0) ? { keyframeOffset: offset } : {}),
        animation: 'none',
        animationDelay: 0,
        exitAnimation: 'none',
        exitDuration: 0,
        loopAnimation: 'none',
        ...(layer.transform3d ? { transform3d: { ...layer.transform3d, motion: 'none' } } : {}),
        ...(plane
          ? {
              transform3d: {
                enabled: true,
                rotateX: common.rotateX,
                rotateY: common.rotateY,
                z: common.depth,
                motion: 'none',
                originX,
                originY,
                perspectiveDistance,
              },
            }
          : {}),
        ...(options.recipeId === 'wipe' ? { revealDirection: direction } : {}),
        ...(options.recipeId === 'type-on'
          ? { textRevealMode: options.textMode ?? layer.textRevealMode ?? 'characters' }
          : {}),
      };
      updates.set(layer.id, next);
    }
  }
  return {
    layers: project.layers.map((layer) => updates.get(layer.id) ?? layer),
    affectedIds: [...updates.keys()],
    skippedIds,
    expandedIds,
    start: units[0].start,
    end: Math.max(...units.map((unit) => unit.end)),
    replacedKeyframes,
  };
}
