import { createLayer, validatePathData } from './project';
import type { Layer } from './types';

type Matrix = [number, number, number, number, number, number];
type Bounds = [number, number, number, number];
interface Paint {
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  fontSize: number;
  fontWeight: number;
}
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const SIMPLE_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  orange: '#ffa500',
  yellow: '#ffff00',
  purple: '#800080',
  pink: '#ffc0cb',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  maroon: '#800000',
  olive: '#808000',
  lime: '#00ff00',
  aqua: '#00ffff',
  cyan: '#00ffff',
  teal: '#008080',
  navy: '#000080',
  fuchsia: '#ff00ff',
  magenta: '#ff00ff',
};
const fail = (reason: string): never => {
  throw new Error(`SVG import: ${reason}`);
};

function numeric(value: string | null, fallback = 0): number {
  if (value === null || value.trim() === '') return fallback;
  if (!/^[+-]?(?:\d*\.\d+|\d+\.?\d*)(?:e[+-]?\d+)?(?:px)?$/i.test(value.trim()))
    return fail(`“${value}” is not a supported numeric value. Use pixels or plain numbers.`);
  const parsed = Number(value.replace(/px$/i, ''));
  if (!Number.isFinite(parsed) || Math.abs(parsed) > 100_000)
    return fail('Coordinates must be finite and within ±100,000.');
  return parsed;
}
function numbers(value: string): number[] {
  const tokens = value
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  return tokens.map((token) => numeric(token));
}
function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
function transform(value: string | null): Matrix {
  if (!value?.trim()) return IDENTITY;
  let result: Matrix = IDENTITY;
  const matcher = /([A-Za-z]+)\s*\(([^)]*)\)/g;
  let previousEnd = 0;
  for (const match of value.matchAll(matcher)) {
    if (value.slice(previousEnd, match.index).trim().replace(/,/g, ''))
      return fail('Malformed transform.');
    previousEnd = match.index! + match[0].length;
    const args = numbers(match[2]);
    let next: Matrix;
    if (match[1] === 'translate' && (args.length === 1 || args.length === 2))
      next = [1, 0, 0, 1, args[0], args[1] ?? 0];
    else if (match[1] === 'scale' && (args.length === 1 || args.length === 2))
      next = [args[0], 0, 0, args[1] ?? args[0], 0, 0];
    else if (match[1] === 'matrix' && args.length === 6) next = args as Matrix;
    else if (match[1] === 'rotate' && (args.length === 1 || args.length === 3)) {
      const angle = (args[0] * Math.PI) / 180;
      const [cx, cy] = [args[1] ?? 0, args[2] ?? 0];
      next = multiply(
        multiply(
          [1, 0, 0, 1, cx, cy],
          [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0],
        ),
        [1, 0, 0, 1, -cx, -cy],
      );
    } else
      return fail(
        'Use translate, scale, rotate, or a matrix transform. Skew transforms are not supported yet.',
      );
    result = multiply(result, next);
  }
  if (value.slice(previousEnd).trim()) return fail('Malformed transform.');
  return result;
}
function svgColor(value: string | null, fallback: string): string {
  if (value === null || value === 'inherit') return fallback;
  const clean = value.trim().toLowerCase();
  if (clean === 'none' || clean === 'transparent') return 'transparent';
  if (/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(clean)) return clean;
  if (SIMPLE_COLORS[clean]) return SIMPLE_COLORS[clean];
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/.exec(clean);
  if (rgb) {
    const channels = rgb.slice(1, 4).map(Number);
    if (channels.some((channel) => channel > 255))
      return fail('RGB color channels must be between 0 and 255.');
    if (rgb[4] !== undefined) channels.push(Math.round(Number(rgb[4]) * 255));
    return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  }
  return fail(`Color “${value}” is unsupported. Convert colors to hex and expand gradients first.`);
}
function properties(element: Element): (name: string) => string | null {
  const styles = new Map<string, string>();
  const allowed = ['fill', 'stroke', 'stroke-width', 'opacity', 'font-size', 'font-weight'];
  for (const declaration of (element.getAttribute('style') ?? '').split(';')) {
    if (!declaration.trim()) continue;
    const colon = declaration.indexOf(':');
    const key = declaration.slice(0, colon).trim();
    if (colon < 0 || !allowed.includes(key))
      return fail(
        `Inline style “${key}” is unsupported. Expand styles to simple paths before importing.`,
      );
    styles.set(key, declaration.slice(colon + 1).trim());
  }
  return (name) => styles.get(name) ?? element.getAttribute(name);
}
function placement(box: Bounds, matrix: Matrix) {
  const [a, b, c, d, e, f] = matrix;
  const sx = Math.hypot(a, b);
  const sy = Math.hypot(c, d);
  if (!sx || !sy || a * d - b * c <= 0 || Math.abs(a * c + b * d) > 0.00001 * sx * sy)
    return fail(
      'Mirrored, skewed, or collapsed geometry is unsupported. Expand the transform before importing.',
    );
  const [left, top, width, height] = box;
  const cx = left + width / 2;
  const cy = top + height / 2;
  const result = {
    x: a * cx + c * cy + e - (width * sx) / 2,
    y: b * cx + d * cy + f - (height * sy) / 2,
    width: width * sx,
    height: height * sy,
    rotation: (Math.atan2(b, a) * 180) / Math.PI,
  };
  if (
    Object.values(result).some((number) => !Number.isFinite(number)) ||
    Math.abs(result.x) > 100_000 ||
    Math.abs(result.y) > 100_000 ||
    result.width > 32_768 ||
    result.height > 32_768
  )
    return fail('Transformed artwork is too large. Scale it down before importing.');
  return result;
}

/**
 * Imports independent primitives and paths; top-level SVG groups remain editable groups.
 * Arbitrary paths retain their source viewBox as conservative selection bounds.
 * Nested groups flatten to their outer group. Text uses the app font, with an approximate
 * baseline. Gradients, masks, filters, images, CSS classes, and skew/reflection need expansion.
 * Original markup is never injected into the document.
 */
export function importSvg(source: string): Layer[] {
  if (source.length > 2 * 1024 * 1024) return fail('SVG files must be smaller than 2 MB.');
  if (/<!DOCTYPE|<!ENTITY/i.test(source))
    return fail('Document types and XML entities are not allowed.');
  const document = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (document.querySelector('parsererror')) return fail('This file is not valid SVG XML.');
  const root = document.documentElement;
  if (root.localName !== 'svg') return fail('The document must have an SVG root element.');
  const allowedTags = new Set([
    'svg',
    'g',
    'rect',
    'circle',
    'ellipse',
    'line',
    'polyline',
    'polygon',
    'path',
    'text',
    'title',
    'desc',
  ]);
  const elements = [root, ...root.querySelectorAll('*')];
  if (elements.length > 2000)
    return fail('This SVG has too many elements. Simplify it to fewer than 2,000 nodes.');
  for (const element of elements) {
    if (!allowedTags.has(element.localName) || (element !== root && element.localName === 'svg'))
      return fail(
        `The <${element.localName}> element is unsupported. Expand it to simple vector paths first.`,
      );
    for (const attribute of element.attributes) {
      if (
        /^on/i.test(attribute.name) ||
        /(?:^|:)href$/i.test(attribute.name) ||
        /url\s*\(/i.test(attribute.value)
      )
        return fail('Scripts, event handlers, and external references are not allowed.');
      if (
        [
          'filter',
          'mask',
          'clip-path',
          'class',
          'stroke-dasharray',
          'stroke-linecap',
          'stroke-linejoin',
          'fill-rule',
          'fill-opacity',
          'stroke-opacity',
          'vector-effect',
          'text-anchor',
        ].includes(attribute.name)
      )
        return fail(
          `“${attribute.name}” is unsupported. Expand appearance to paths before importing.`,
        );
    }
  }
  const rootBox = root.hasAttribute('viewBox')
    ? numbers(root.getAttribute('viewBox')!)
    : [0, 0, numeric(root.getAttribute('width'), 1920), numeric(root.getAttribute('height'), 1080)];
  if (rootBox.length !== 4 || rootBox[2] <= 0 || rootBox[3] <= 0)
    return fail('The viewBox needs four numbers and positive dimensions.');
  const viewBox = rootBox as Bounds;
  const width = numeric(root.getAttribute('width'), viewBox[2]);
  const height = numeric(root.getAttribute('height'), viewBox[3]);
  if (width <= 0 || height <= 0 || width > 16_384 || height > 16_384)
    return fail('SVG dimensions must be positive and no greater than 16,384 pixels.');
  const preserve = root.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet';
  if (!['none', 'xMidYMid', 'xMidYMid meet'].includes(preserve))
    return fail('Use the default centered aspect ratio or preserveAspectRatio="none".');
  const fit = Math.min(width / viewBox[2], height / viewBox[3]);
  const sx = preserve === 'none' ? width / viewBox[2] : fit;
  const sy = preserve === 'none' ? height / viewBox[3] : fit;
  const rootMatrix: Matrix = [
    sx,
    0,
    0,
    sy,
    (width - viewBox[2] * sx) / 2 - viewBox[0] * sx,
    (height - viewBox[3] * sy) / 2 - viewBox[1] * sy,
  ];
  const layers: Layer[] = [];

  function visit(
    element: Element,
    parentMatrix: Matrix,
    inherited: Paint,
    groupId?: string,
    depth = 0,
  ) {
    if (depth > 100)
      return fail('Groups are nested too deeply. Flatten the group hierarchy before importing.');
    if (['title', 'desc'].includes(element.localName)) return;
    const property = properties(element);
    const alpha = numeric(property('opacity'), 1);
    if (alpha < 0 || alpha > 1) return fail('Opacity must be between 0 and 1.');
    const paint: Paint = {
      fill: svgColor(property('fill'), inherited.fill),
      stroke: svgColor(property('stroke'), inherited.stroke),
      strokeWidth: numeric(property('stroke-width'), inherited.strokeWidth),
      opacity: inherited.opacity * alpha,
      fontSize: numeric(property('font-size'), inherited.fontSize),
      fontWeight:
        property('font-weight') === 'bold'
          ? 700
          : property('font-weight') === 'normal'
            ? 400
            : numeric(property('font-weight'), inherited.fontWeight),
    };
    if (
      paint.strokeWidth < 0 ||
      paint.strokeWidth > 2048 ||
      paint.fontSize < 1 ||
      paint.fontSize > 2048 ||
      paint.fontWeight < 100 ||
      paint.fontWeight > 900
    )
      return fail('Stroke or font size is outside supported limits.');
    const matrix = multiply(parentMatrix, transform(element.getAttribute('transform')));
    if (element.localName === 'g' || element.localName === 'svg') {
      const nextGroup = groupId ?? (element.localName === 'g' ? crypto.randomUUID() : undefined);
      for (const child of element.children) visit(child, matrix, paint, nextGroup, depth + 1);
      return;
    }
    if (layers.length >= 1000) return fail('An SVG may contain at most 1,000 editable elements.');
    const get = (name: string, fallback = 0) => numeric(element.getAttribute(name), fallback);
    const name =
      element.getAttribute('id')?.slice(0, 256) || `SVG ${element.localName} ${layers.length + 1}`;
    if (element.localName === 'text') {
      const text = element.textContent?.trim() ?? '';
      if (!text) return;
      const box: Bounds = [
        get('x'),
        get('y') - paint.fontSize * 0.8,
        Math.max(paint.fontSize, text.length * paint.fontSize * 0.62),
        paint.fontSize * 1.3,
      ];
      const placed = placement(box, matrix);
      const textScale = placed.height / box[3];
      if (Math.abs(placed.width / box[2] - textScale) > 0.00001)
        return fail(
          'Text requires uniform scaling. Convert stretched text to outlines before importing.',
        );
      if (paint.fontSize * textScale < 1 || paint.fontSize * textScale > 2048)
        return fail('Scaled text must have a font size between 1 and 2,048 pixels.');
      layers.push(
        createLayer('text', {
          name,
          text,
          ...placed,
          fontSize: paint.fontSize * textScale,
          fontWeight: paint.fontWeight,
          fill: paint.fill,
          opacity: paint.opacity,
          groupId,
          radius: 0,
        }),
      );
      return;
    }
    let box: Bounds;
    let path: string;
    if (element.localName === 'rect') {
      const [x, y, w, h] = [get('x'), get('y'), get('width'), get('height')];
      if (w <= 0 || h <= 0) return fail('Rectangles need positive width and height.');
      const rx = Math.min(Math.max(get('rx', get('ry')), 0), w / 2);
      const ry = Math.min(Math.max(get('ry', rx), 0), h / 2);
      box = [x, y, w, h];
      path =
        rx && ry
          ? `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`
          : `M${x} ${y}h${w}v${h}h${-w}Z`;
    } else if (element.localName === 'circle' || element.localName === 'ellipse') {
      const [cx, cy] = [get('cx'), get('cy')];
      const rx = element.localName === 'circle' ? get('r') : get('rx');
      const ry = element.localName === 'circle' ? rx : get('ry');
      if (rx <= 0 || ry <= 0) return fail('Circles and ellipses need positive radii.');
      box = [cx - rx, cy - ry, 2 * rx, 2 * ry];
      path = `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
    } else if (['line', 'polyline', 'polygon'].includes(element.localName)) {
      const points =
        element.localName === 'line'
          ? [get('x1'), get('y1'), get('x2'), get('y2')]
          : numbers(element.getAttribute('points') ?? '');
      if (points.length < 4 || points.length % 2)
        return fail('Lines and polygons need coordinate pairs.');
      const xs = points.filter((_, index) => index % 2 === 0);
      const ys = points.filter((_, index) => index % 2 === 1);
      box = [
        Math.min(...xs),
        Math.min(...ys),
        Math.max(0.01, Math.max(...xs) - Math.min(...xs)),
        Math.max(0.01, Math.max(...ys) - Math.min(...ys)),
      ];
      path =
        points
          .map((point, index) => `${index === 0 ? 'M' : index % 2 === 0 ? 'L' : ' '}${point}`)
          .join('') + (element.localName === 'polygon' ? 'Z' : '');
    } else {
      path = element.getAttribute('d')?.trim() ?? '';
      try {
        validatePathData(path);
      } catch {
        return fail(
          'Path data must contain valid SVG commands and finite numbers within ±100,000.',
        );
      }
      box = [...viewBox];
    }
    // Include the full stroke in both geometry and selection bounds.
    if (paint.stroke !== 'transparent' && paint.strokeWidth > 0)
      box = [
        box[0] - paint.strokeWidth / 2,
        box[1] - paint.strokeWidth / 2,
        box[2] + paint.strokeWidth,
        box[3] + paint.strokeWidth,
      ];
    layers.push(
      createLayer('svg', {
        name,
        ...placement(box, matrix),
        fill: paint.fill,
        stroke: paint.stroke,
        strokeWidth: paint.strokeWidth,
        opacity: paint.opacity,
        groupId,
        radius: 0,
        path,
        viewBox: box.join(' '),
      }),
    );
  }
  visit(root, rootMatrix, {
    fill: '#000000',
    stroke: 'transparent',
    strokeWidth: 1,
    opacity: 1,
    fontSize: 32,
    fontWeight: 400,
  });
  if (!layers.length) return fail('No editable elements were found.');
  return layers;
}
