import type { Layer, LayerKind, Project } from './types';

const KINDS: LayerKind[] = ['video', 'audio', 'image', 'text', 'shape', 'svg', 'drawing'];
const ANIMATIONS = ['none', 'fade', 'rise', 'pop', 'slide'];
const EASINGS = ['linear', 'ease-in', 'ease-out', 'ease-in-out'];
const TIMING_KEYS = [
  'animationDuration',
  'animationDelay',
  'exitDuration',
  'audioFadeIn',
  'audioFadeOut',
] as const;
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_LAYERS = 1_000;
const uid = () => globalThis.crypto.randomUUID();

/** Validate path grammar without executing or injecting imported SVG markup. */
export function validatePathData(path: string): void {
  const invalid = () => {
    throw new Error(
      'Vector paths must contain valid SVG path commands and finite numbers within ±100,000.',
    );
  };
  if (path.length > 1_000_000 || !/^[Mm]/.test(path.trim())) return invalid();
  const arity: Record<string, number> = {
    m: 2,
    l: 2,
    h: 1,
    v: 1,
    c: 6,
    s: 4,
    q: 4,
    t: 2,
    a: 7,
    z: 0,
  };
  const tokens = /[MmZzLlHhVvCcSsQqTtAa]|[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi;
  let previousEnd = 0;
  let command = '';
  let count = 0;
  const finish = () => {
    if (
      command &&
      (arity[command] === 0 ? count !== 0 : count === 0 || count % arity[command] !== 0)
    )
      invalid();
  };
  for (const token of path.matchAll(tokens)) {
    if (!/^[\s,]*$/.test(path.slice(previousEnd, token.index))) invalid();
    previousEnd = token.index! + token[0].length;
    if (/^[a-z]$/i.test(token[0])) {
      finish();
      command = token[0].toLowerCase();
      count = 0;
    } else {
      const value = Number(token[0]);
      if (!command || !arity[command] || !Number.isFinite(value) || Math.abs(value) > 100_000)
        invalid();
      if (
        command === 'a' &&
        ((count % 7 < 2 && value < 0) || ([3, 4].includes(count % 7) && value !== 0 && value !== 1))
      )
        invalid();
      count++;
    }
  }
  if (!/^[\s,]*$/.test(path.slice(previousEnd))) invalid();
  finish();
}

export function createLayer(kind: LayerKind, overrides: Partial<Layer> = {}): Layer {
  return {
    id: uid(),
    kind,
    name: kind.charAt(0).toUpperCase() + kind.slice(1),
    start: 0,
    duration: 12,
    x: 160,
    y: 160,
    width: 320,
    height: 180,
    rotation: 0,
    opacity: 1,
    fill: kind === 'text' ? '#2b2d42' : '#ef233c',
    radius: 20,
    animation: 'none',
    brightness: 1,
    contrast: 1,
    saturation: 1,
    ...(kind === 'text' ? { text: 'Make something yours.', fontSize: 56, fontWeight: 600 } : {}),
    ...(kind === 'audio' || kind === 'video' ? { mediaOffset: 0, volume: 1, muted: false } : {}),
    ...overrides,
  };
}

export function createProject(): Project {
  const cardGroup = uid();
  return {
    version: 1,
    id: uid(),
    name: 'A little idea',
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 12,
    background: '#edf2f4',
    components: [],
    layers: [
      createLayer('text', {
        name: 'Studio label',
        text: 'FRAME STUDIO  /  MADE TO CREATE',
        x: 144,
        y: 118,
        width: 1100,
        height: 45,
        fontSize: 24,
        fontWeight: 600,
        fill: '#8d99ae',
      }),
      createLayer('text', {
        name: 'A little idea',
        text: 'A little idea.\nA lot of possibility.',
        x: 138,
        y: 284,
        width: 1500,
        height: 350,
        fontSize: 128,
        fontWeight: 600,
        fill: '#2b2d42',
        animation: 'rise',
      }),
      createLayer('text', {
        name: 'Caption',
        text: 'A space for your next good thing.',
        x: 146,
        y: 718,
        width: 1050,
        height: 80,
        fontSize: 34,
        fontWeight: 400,
        fill: '#2b2d42',
        animation: 'fade',
      }),
      createLayer('shape', {
        name: 'Red card',
        x: 1408,
        y: 676,
        width: 286,
        height: 286,
        rotation: -13,
        fill: '#ef233c',
        radius: 48,
        groupId: cardGroup,
        animation: 'pop',
      }),
      createLayer('shape', {
        name: 'Slate card',
        x: 1590,
        y: 610,
        width: 206,
        height: 206,
        rotation: 12,
        fill: '#8d99ae',
        radius: 42,
        groupId: cardGroup,
        animation: 'pop',
      }),
      createLayer('text', {
        name: 'Edition',
        text: '01 — YOUR FIRST FRAME',
        x: 146,
        y: 938,
        width: 900,
        height: 42,
        fontSize: 21,
        fontWeight: 500,
        fill: '#8d99ae',
      }),
    ],
  };
}

export function duplicateLayers(layers: Layer[]): Layer[] {
  const groups = new Map<string, string>();
  return layers.map((layer) => {
    if (layer.groupId && !groups.has(layer.groupId)) groups.set(layer.groupId, uid());
    return {
      ...layer,
      id: uid(),
      ...(layer.groupId ? { groupId: groups.get(layer.groupId)! } : {}),
    };
  });
}

/**
 * Keep source time continuous when media is divided. Motion remains clip-relative:
 * each half retains its authored settings, fitted to its new length at render time.
 */
export function splitLayer(layer: Layer, time: number): Layer[] {
  const elapsed = time - layer.start;
  if (!Number.isFinite(time) || elapsed < 0.01 || layer.duration - elapsed < 0.01) return [layer];
  const right = { ...layer, id: uid(), start: time, duration: layer.duration - elapsed };
  if (layer.kind === 'audio' || layer.kind === 'video')
    right.mediaOffset = (layer.mediaOffset ?? 0) + elapsed;
  return [{ ...layer, duration: elapsed }, right];
}

/** Fit the existing composition into a new aspect ratio, preserving proportions. */
export function changeAspectRatio(project: Project, width: number, height: number): Project {
  number(width, 'Canvas width', 16, 16_384);
  number(height, 'Canvas height', 16, 16_384);
  const scale = Math.min(width / project.width, height / project.height);
  const offsetX = (width - project.width * scale) / 2;
  const offsetY = (height - project.height * scale) / 2;
  return {
    ...project,
    width,
    height,
    layers: project.layers.map((layer) => ({
      ...layer,
      x: layer.x * scale + offsetX,
      y: layer.y * scale + offsetY,
      width: layer.width * scale,
      height: layer.height * scale,
      radius: layer.radius * scale,
      ...(layer.fontSize === undefined ? {} : { fontSize: layer.fontSize * scale }),
      // Vector strokes live in viewBox coordinates and scale with the SVG itself.
      ...(layer.strokeWidth === undefined || layer.viewBox
        ? {}
        : { strokeWidth: layer.strokeWidth * scale }),
    })),
  };
}

type RecordValue = Record<string, unknown>;
function object(value: unknown, label: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as RecordValue;
}
function knownKeys(value: RecordValue, keys: string[], label: string) {
  const unknown = Object.keys(value).find((key) => !keys.includes(key));
  if (unknown) throw new Error(`${label} contains an unsupported property: ${unknown}.`);
}
function string(value: unknown, label: string, max = 256, min = 0): string {
  if (typeof value !== 'string' || value.length < min || value.length > max)
    throw new Error(`${label} must be text between ${min} and ${max} characters.`);
  return value;
}
function number(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw new Error(`${label} must be a finite number between ${min} and ${max}.`);
  return value;
}
function color(value: unknown, label: string): string {
  const result = string(value, label, 32, 1);
  if (
    result !== 'transparent' &&
    !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(result)
  )
    throw new Error(`${label} must be a hex color or transparent.`);
  return result;
}
function effectColor(value: unknown, label: string): string {
  const result = string(value, label, 7, 7);
  if (!/^#[\da-f]{6}$/i.test(result)) throw new Error(`${label} must use #rrggbb.`);
  return result;
}
function optionalBoolean(value: RecordValue, key: string): boolean | undefined {
  if (value[key] === undefined) return undefined;
  if (typeof value[key] !== 'boolean') throw new Error(`${key} must be true or false.`);
  return value[key] as boolean;
}
function safeSource(value: unknown, kind: LayerKind): string {
  const result = string(value, 'Media source', MAX_FILE_SIZE, 1);
  const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(result);
  const formats: Partial<Record<LayerKind, string[]>> = {
    image: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/bmp'],
    audio: [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/x-wav',
      'audio/wave',
      'audio/ogg',
      'audio/webm',
      'audio/mp4',
      'audio/aac',
      'audio/flac',
      'audio/x-m4a',
    ],
    video: ['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg', 'video/x-m4v'],
  };
  if (
    !match ||
    !formats[kind]?.includes(match[1].toLowerCase()) ||
    !match[2].length ||
    match[2].length % 4 !== 0
  ) {
    throw new Error(
      'Media must be an embedded base64 image, audio, or video of a supported type. Import SVG artwork through the SVG importer.',
    );
  }
  return result;
}

const LAYER_KEYS = [
  'id',
  'name',
  'kind',
  'start',
  'duration',
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'opacity',
  'fill',
  'radius',
  'text',
  'fontSize',
  'fontWeight',
  'src',
  'mediaOffset',
  'sourceDuration',
  'volume',
  'muted',
  'hidden',
  'locked',
  'groupId',
  'animation',
  'animationEasing',
  ...TIMING_KEYS,
  'brightness',
  'contrast',
  'saturation',
  'mask',
  'maskInset',
  'maskRoundness',
  'flipX',
  'flipY',
  'backgroundRemoval',
  'colorReplace',
  'path',
  'stroke',
  'strokeWidth',
  'viewBox',
];
function parseLayer(value: unknown): Layer {
  const item = object(value, 'Layer');
  knownKeys(item, LAYER_KEYS, 'Layer');
  if (!KINDS.includes(item.kind as LayerKind)) throw new Error('Unsupported layer kind.');
  if (item.animation !== undefined && !ANIMATIONS.includes(item.animation as string))
    throw new Error('Unsupported layer animation.');
  if (item.animationEasing !== undefined && !EASINGS.includes(item.animationEasing as string))
    throw new Error('Unsupported animation easing.');
  const layer: Layer = {
    id: string(item.id, 'Layer ID', 128, 1),
    name: string(item.name, 'Layer name', 256, 1),
    kind: item.kind as LayerKind,
    start: number(item.start, 'Layer start', 0, 86_400),
    duration: number(item.duration, 'Layer duration', 0.01, 86_400),
    x: number(item.x, 'Layer x', -100_000, 100_000),
    y: number(item.y, 'Layer y', -100_000, 100_000),
    width: number(item.width, 'Layer width', 0.01, 32_768),
    height: number(item.height, 'Layer height', 0.01, 32_768),
    rotation: number(item.rotation ?? 0, 'Layer rotation', -360_000, 360_000),
    opacity: number(item.opacity ?? 1, 'Layer opacity', 0, 1),
    fill: color(item.fill, 'Layer fill'),
    radius: number(item.radius ?? 0, 'Corner radius', 0, 16_384),
    animation: (item.animation ?? 'none') as Layer['animation'],
    brightness: number(item.brightness ?? 1, 'Brightness', 0, 10),
    contrast: number(item.contrast ?? 1, 'Contrast', 0, 10),
    saturation: number(item.saturation ?? 1, 'Saturation', 0, 10),
  };
  for (const key of TIMING_KEYS) {
    if (item[key] !== undefined) layer[key] = number(item[key], key, 0, 3600);
  }
  if (item.animationEasing !== undefined)
    layer.animationEasing = item.animationEasing as Layer['animationEasing'];
  if (item.mask !== undefined) {
    if (!['none', 'rectangle', 'rounded', 'ellipse', 'diamond'].includes(item.mask as string))
      throw new Error('Unsupported layer mask.');
    layer.mask = item.mask as Layer['mask'];
  }
  if (item.maskInset !== undefined) layer.maskInset = number(item.maskInset, 'Mask inset', 0, 45);
  if (item.maskRoundness !== undefined)
    layer.maskRoundness = number(item.maskRoundness, 'Mask roundness', 0, 50);
  for (const key of ['flipX', 'flipY'] as const) {
    const result = optionalBoolean(item, key);
    if (result !== undefined) layer[key] = result;
  }
  if (
    layer.kind === 'audio' &&
    ['mask', 'maskInset', 'maskRoundness', 'flipX', 'flipY'].some((key) => item[key] !== undefined)
  )
    throw new Error('Masks and flips require a visual layer.');
  if (item.backgroundRemoval !== undefined) {
    if (layer.kind !== 'image') throw new Error('Background removal is available for images only.');
    const effect = object(item.backgroundRemoval, 'Background removal');
    knownKeys(effect, ['color', 'tolerance', 'softness'], 'Background removal');
    layer.backgroundRemoval = {
      color: effectColor(effect.color, 'Background color'),
      tolerance: number(effect.tolerance, 'Background tolerance', 0, 100),
      softness: number(effect.softness, 'Background softness', 0, 100),
    };
  }
  if (item.colorReplace !== undefined) {
    if (layer.kind !== 'image') throw new Error('Color replacement is available for images only.');
    const effect = object(item.colorReplace, 'Color replacement');
    knownKeys(effect, ['from', 'to', 'tolerance', 'softness', 'strength'], 'Color replacement');
    layer.colorReplace = {
      from: effectColor(effect.from, 'Original color'),
      to: effectColor(effect.to, 'Replacement color'),
      tolerance: number(effect.tolerance, 'Replacement tolerance', 0, 100),
      softness: number(effect.softness, 'Replacement softness', 0, 100),
      strength: number(effect.strength, 'Replacement strength', 0, 100),
    };
  }
  if (item.text !== undefined) layer.text = string(item.text, 'Layer text', 100_000);
  if (item.fontSize !== undefined) layer.fontSize = number(item.fontSize, 'Font size', 1, 2048);
  if (item.fontWeight !== undefined)
    layer.fontWeight = number(item.fontWeight, 'Font weight', 100, 900);
  if (item.src !== undefined) layer.src = safeSource(item.src, layer.kind);
  if (item.mediaOffset !== undefined)
    layer.mediaOffset = number(item.mediaOffset, 'Media offset', 0, 86_400);
  if (item.sourceDuration !== undefined) {
    if (layer.kind !== 'audio' && layer.kind !== 'video')
      throw new Error('Only audio and video layers can have a source duration.');
    layer.sourceDuration = number(item.sourceDuration, 'Source duration', 0.01, 86_400);
    if ((layer.mediaOffset ?? 0) + layer.duration > layer.sourceDuration + 1e-6)
      throw new Error('The clip extends beyond the original media duration.');
  }
  if (item.volume !== undefined) layer.volume = number(item.volume, 'Volume', 0, 1);
  if (item.groupId !== undefined) layer.groupId = string(item.groupId, 'Group ID', 128, 1);
  for (const key of ['muted', 'hidden', 'locked'] as const) {
    const result = optionalBoolean(item, key);
    if (result !== undefined) layer[key] = result;
  }
  if (item.path !== undefined) {
    layer.path = string(item.path, 'Vector path', 1_000_000, 1);
    validatePathData(layer.path);
  }
  if (item.stroke !== undefined) layer.stroke = color(item.stroke, 'Stroke color');
  if (item.strokeWidth !== undefined)
    layer.strokeWidth = number(item.strokeWidth, 'Stroke width', 0, 2048);
  if (item.viewBox !== undefined) {
    layer.viewBox = string(item.viewBox, 'SVG viewBox', 256, 1);
    const box = layer.viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (
      box.length !== 4 ||
      box.some((n) => !Number.isFinite(n) || Math.abs(n) > 100_000) ||
      box[2] <= 0 ||
      box[3] <= 0
    )
      throw new Error('SVG viewBox must contain four finite numbers and positive dimensions.');
  }
  return layer;
}

function parseLayers(value: unknown, label: string): Layer[] {
  if (!Array.isArray(value) || value.length > MAX_LAYERS)
    throw new Error(`${label} must contain at most ${MAX_LAYERS} layers.`);
  const layers = value.map(parseLayer);
  if (new Set(layers.map((layer) => layer.id)).size !== layers.length)
    throw new Error(`${label} contains duplicate layer IDs.`);
  return layers;
}

/** Treat saved project JSON as untrusted input before it reaches the renderer. */
export function parseProject(text: string): Project {
  if (text.length > MAX_FILE_SIZE || new TextEncoder().encode(text).byteLength > MAX_FILE_SIZE)
    throw new Error('Project files must be smaller than 100 MB.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid Frame Studio project JSON.');
  }
  const value = object(raw, 'Project');
  knownKeys(
    value,
    [
      'version',
      'id',
      'name',
      'width',
      'height',
      'fps',
      'duration',
      'background',
      'layers',
      'components',
    ],
    'Project',
  );
  if (value.version !== 1)
    throw new Error('This project version is not supported. Expected version 1.');
  const componentValues = value.components ?? [];
  if (!Array.isArray(componentValues) || componentValues.length > 200)
    throw new Error('A project may contain at most 200 saved components.');
  const components = componentValues.map((entry) => {
    const component = object(entry, 'Component');
    knownKeys(component, ['id', 'name', 'layers'], 'Component');
    return {
      id: string(component.id, 'Component ID', 128, 1),
      name: string(component.name, 'Component name', 256, 1),
      layers: parseLayers(component.layers, 'Component'),
    };
  });
  if (new Set(components.map((component) => component.id)).size !== components.length)
    throw new Error('Project contains duplicate component IDs.');
  return {
    version: 1,
    id: string(value.id, 'Project ID', 128, 1),
    name: string(value.name, 'Project name', 256, 1),
    width: number(value.width, 'Canvas width', 16, 16_384),
    height: number(value.height, 'Canvas height', 16, 16_384),
    fps: number(value.fps, 'Frame rate', 1, 120),
    duration: number(value.duration, 'Project duration', 0.01, 86_400),
    background: color(value.background, 'Canvas background'),
    layers: parseLayers(value.layers, 'Project'),
    components,
  };
}
