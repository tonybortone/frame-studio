export interface VectorPoint {
  x: number;
  y: number;
}

/** A handle is an outgoing offset; the incoming handle is its mirror. */
export interface VectorAnchor extends VectorPoint {
  handle?: VectorPoint;
}

export const MAX_STROKE_POINTS = 2048;
export const MAX_PEN_ANCHORS = 256;
const COORDINATE_LIMIT = 100_000;

export function isVectorPoint(point: VectorPoint): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Math.abs(point.x) <= COORDINATE_LIMIT &&
    Math.abs(point.y) <= COORDINATE_LIMIT
  );
}

/** Sample tiny pointer movements and progressively thin very long strokes. */
export function appendStrokePoint(
  points: VectorPoint[],
  next: VectorPoint,
  minimumDistance = 1,
): VectorPoint[] {
  if (!isVectorPoint(next)) return points;
  const last = points.at(-1);
  if (last && Math.hypot(next.x - last.x, next.y - last.y) <= Math.max(0, minimumDistance))
    return points;
  const sampled =
    points.length >= MAX_STROKE_POINTS
      ? points.filter((_, index) => index % 2 === 0 || index === points.length - 1)
      : points;
  return [...sampled, { x: next.x, y: next.y }];
}

function validAnchors(anchors: VectorAnchor[]) {
  return (
    anchors.length > 0 &&
    anchors.length <= MAX_STROKE_POINTS &&
    anchors.every(
      (anchor) =>
        isVectorPoint(anchor) &&
        (!anchor.handle ||
          (isVectorPoint(anchor.handle) &&
            isVectorPoint({ x: anchor.x + anchor.handle.x, y: anchor.y + anchor.handle.y }) &&
            isVectorPoint({ x: anchor.x - anchor.handle.x, y: anchor.y - anchor.handle.y }))),
    )
  );
}

function controls(from: VectorAnchor, to: VectorAnchor): [VectorPoint, VectorPoint] {
  return [
    { x: from.x + (from.handle?.x ?? 0), y: from.y + (from.handle?.y ?? 0) },
    { x: to.x - (to.handle?.x ?? 0), y: to.y - (to.handle?.y ?? 0) },
  ];
}

const coordinate = (value: number) => String(Math.round(value * 1000) / 1000);

/** Ordinary SVG commands are shared by the live draft, renderer and exported project. */
export function vectorPathData(
  anchors: VectorAnchor[],
  closed = false,
  offset: VectorPoint = { x: 0, y: 0 },
): string {
  if (!validAnchors(anchors) || !isVectorPoint(offset)) return '';
  if (!isVectorPoint({ x: anchors[0].x - offset.x, y: anchors[0].y - offset.y })) return '';
  const point = (p: VectorPoint) => `${coordinate(p.x - offset.x)} ${coordinate(p.y - offset.y)}`;
  const commands = [`M${point(anchors[0])}`];
  const segmentCount = closed && anchors.length > 1 ? anchors.length : anchors.length - 1;
  for (let i = 0; i < segmentCount; i++) {
    const from = anchors[i];
    const to = anchors[(i + 1) % anchors.length];
    const [a, b] = controls(from, to);
    if (![from, to, a, b].every((p) => isVectorPoint({ x: p.x - offset.x, y: p.y - offset.y })))
      return '';
    commands.push(
      from.handle || to.handle ? `C${point(a)} ${point(b)} ${point(to)}` : `L${point(to)}`,
    );
  }
  if (closed && anchors.length > 2) commands.push('Z');
  return commands.join(' ');
}

function cubicValue(a: number, b: number, c: number, d: number, t: number) {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

/** Interior extrema keep the frame tight without clipping bowed Bézier segments. */
function extrema(a: number, b: number, c: number, d: number): number[] {
  const quadratic = -a + 3 * b - 3 * c + d;
  const linear = 2 * (a - 2 * b + c);
  const constant = b - a;
  if (Math.abs(quadratic) < 1e-10)
    return Math.abs(linear) < 1e-10 ? [] : [-constant / linear].filter((t) => t > 0 && t < 1);
  const discriminant = linear * linear - 4 * quadratic * constant;
  if (discriminant < 0) return [];
  const root = Math.sqrt(discriminant);
  return [(-linear + root) / (2 * quadratic), (-linear - root) / (2 * quadratic)].filter(
    (t) => t > 0 && t < 1,
  );
}

export interface VectorGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  path: string;
  viewBox: string;
}

/** Stroke padding includes round caps, joins and an antialiasing pixel. */
export function vectorGeometry(
  anchors: VectorAnchor[],
  closed: boolean,
  strokeWidth: number,
): VectorGeometry | null {
  if (
    anchors.length < (closed ? 3 : 2) ||
    !validAnchors(anchors) ||
    !Number.isFinite(strokeWidth) ||
    strokeWidth < 0 ||
    strokeWidth > 2048
  )
    return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const include = (point: VectorPoint) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  };
  anchors.forEach(include);
  const segmentCount = closed ? anchors.length : anchors.length - 1;
  for (let i = 0; i < segmentCount; i++) {
    const from = anchors[i];
    const to = anchors[(i + 1) % anchors.length];
    if (!from.handle && !to.handle) continue;
    const [a, b] = controls(from, to);
    const times = [...extrema(from.x, a.x, b.x, to.x), ...extrema(from.y, a.y, b.y, to.y)];
    times.forEach((t) =>
      include({
        x: cubicValue(from.x, a.x, b.x, to.x, t),
        y: cubicValue(from.y, a.y, b.y, to.y, t),
      }),
    );
  }
  const padding = strokeWidth / 2 + 1;
  const x = minX - padding;
  const y = minY - padding;
  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;
  if (!isVectorPoint({ x, y }) || width > 32768 || height > 32768) return null;
  const path = vectorPathData(anchors, closed, { x, y });
  if (!path) return null;
  return { x, y, width, height, path, viewBox: `0 0 ${width} ${height}` };
}
