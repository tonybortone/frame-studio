import {
  createElementProjector,
  getElement3DQuad,
  getQuadBounds,
  type Element2DMotion,
  type ElementPoint,
} from '../core/element3d';
import type { Layer } from '../core/types';

const MAX_EDGE = 2048;
const MAX_PIXELS = 4_000_000;
const MAX_SUBDIVISIONS = 12;
const MESH_ERROR_PIXELS = 0.6;

interface Buffers {
  texture: HTMLCanvasElement;
  composite: HTMLCanvasElement;
}
// Keep at most two preview/export destinations (under 64 MB total). In particular,
// inspecting hundreds of layer textures cannot retain hundreds of raster buffers.
const buffers = new Map<CanvasRenderingContext2D, Buffers>();

function resize(canvas: HTMLCanvasElement, width: number, height: number): void {
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

function fitScale(width: number, height: number, requested: number): number {
  return Math.min(
    requested,
    MAX_EDGE / Math.max(width, height),
    Math.sqrt(MAX_PIXELS / (width * height)),
  );
}

type Triangle = [ElementPoint, ElementPoint, ElementPoint];

type LocalBounds = { x: number; y: number; width: number; height: number };

/** Estimate actual affine-triangle error, including the diagonal's cross-axis error. */
function projectionError(
  project: (point: ElementPoint) => ElementPoint,
  bounds: LocalBounds,
  columns: number,
  rows: number,
): number {
  let worst = 0;
  const at = (u: number, v: number) =>
    project({ x: bounds.x + u * bounds.width, y: bounds.y + v * bounds.height });
  const error = (u: number, v: number, points: ElementPoint[]) => {
    const actual = at(u, v);
    const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    worst = Math.max(worst, Math.hypot(actual.x - x, actual.y - y));
  };
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const u = column / columns,
        v = row / rows,
        du = 1 / columns,
        dv = 1 / rows;
      const tl = at(u, v),
        tr = at(u + du, v),
        bl = at(u, v + dv),
        br = at(u + du, v + dv);
      error(u + du / 2, v, [tl, tr]);
      error(u + du / 2, v + dv, [bl, br]);
      error(u, v + dv / 2, [tl, bl]);
      error(u + du, v + dv / 2, [tr, br]);
      error(u + du / 2, v + dv / 2, [tl, br]);
      error(u + (du * 2) / 3, v + dv / 3, [tl, tr, br]);
      error(u + du / 3, v + (dv * 2) / 3, [tl, br, bl]);
    }
  }
  return worst;
}

/** Small near-affine labels use one cell; large tilted plates gain detail only where needed. */
export function chooseProjectionMesh(
  project: (point: ElementPoint) => ElementPoint,
  bounds: LocalBounds,
  pixelScale: number,
): { columns: number; rows: number } {
  const tolerance = MESH_ERROR_PIXELS / Math.max(0.001, pixelScale);
  let columns = 1,
    rows = 1;
  let error = projectionError(project, bounds, columns, rows);
  while (error > tolerance && (columns < MAX_SUBDIVISIONS || rows < MAX_SUBDIVISIONS)) {
    const nextColumns = Math.min(MAX_SUBDIVISIONS, columns * 2);
    const nextRows = Math.min(MAX_SUBDIVISIONS, rows * 2);
    const horizontal =
      columns < MAX_SUBDIVISIONS ? projectionError(project, bounds, nextColumns, rows) : Infinity;
    const vertical =
      rows < MAX_SUBDIVISIONS ? projectionError(project, bounds, columns, nextRows) : Infinity;
    if (horizontal < vertical || (horizontal === vertical && bounds.width >= bounds.height)) {
      columns = nextColumns;
      error = horizontal;
    } else {
      rows = nextRows;
      error = vertical;
    }
  }
  return { columns, rows };
}

/** Map one texture triangle to a projected triangle with a local affine transform. */
function drawTriangle(
  ctx: CanvasRenderingContext2D,
  texture: HTMLCanvasElement,
  source: Triangle,
  target: Triangle,
): void {
  const [s0, s1, s2] = source;
  const [d0, d1, d2] = target;
  const ux = s1.x - s0.x;
  const uy = s1.y - s0.y;
  const vx = s2.x - s0.x;
  const vy = s2.y - s0.y;
  const determinant = ux * vy - uy * vx;
  const area = (d1.x - d0.x) * (d2.y - d0.y) - (d1.y - d0.y) * (d2.x - d0.x);
  if (Math.abs(determinant) < 1e-8 || Math.abs(area) < 1e-8) return;
  const a = ((d1.x - d0.x) * vy - (d2.x - d0.x) * uy) / determinant;
  const b = ((d1.y - d0.y) * vy - (d2.y - d0.y) * uy) / determinant;
  const c = ((d2.x - d0.x) * ux - (d1.x - d0.x) * vx) / determinant;
  const d = ((d2.y - d0.y) * ux - (d1.y - d0.y) * vx) / determinant;
  const center = { x: (d0.x + d1.x + d2.x) / 3, y: (d0.y + d1.y + d2.y) / 3 };
  ctx.save();
  ctx.beginPath();
  // Subpixel overlap closes antialiased mesh cracks. Replacement compositing
  // below prevents translucent pixels from accumulating at shared edges.
  target.forEach((point, index) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const length = Math.hypot(dx, dy) || 1;
    const x = point.x + (dx / length) * 0.75;
    const y = point.y + (dy / length) * 0.75;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(a, b, c, d, d0.x - a * s0.x - c * s0.y, d0.y - b * s0.x - d * s0.y);
  ctx.globalCompositeOperation = 'copy';
  ctx.drawImage(texture, 0, 0);
  ctx.restore();
}

/** Perspective is rasterized locally; opacity is composited exactly once. */
export function drawProjectedLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  time: number,
  animation: Element2DMotion & { opacity: number },
  viewport: { width: number; height: number; pixelScale: number; padding?: number },
  paint: (context: CanvasRenderingContext2D) => void,
): void {
  const padding = Math.max(0, viewport.padding ?? 0);
  const project = createElementProjector(layer, time, animation);
  const bounds = getQuadBounds(
    padding
      ? [
          project({ x: -padding, y: -padding }),
          project({ x: layer.width + padding, y: -padding }),
          project({ x: layer.width + padding, y: layer.height + padding }),
          project({ x: -padding, y: layer.height + padding }),
        ]
      : getElement3DQuad(layer, time, animation),
  );
  const left = Math.max(0, Math.floor(bounds.x) - 1);
  const top = Math.max(0, Math.floor(bounds.y) - 1);
  const right = Math.min(viewport.width, Math.ceil(bounds.x + bounds.width) + 1);
  const bottom = Math.min(viewport.height, Math.ceil(bounds.y + bounds.height) + 1);
  const width = right - left;
  const height = bottom - top;
  if (
    width <= 0 ||
    height <= 0 ||
    bounds.width < 1e-7 ||
    bounds.height < 1e-7 ||
    animation.opacity <= 0
  )
    return;
  let pair = buffers.get(ctx);
  if (!pair) {
    if (buffers.size >= 2) {
      const oldest = buffers.keys().next().value!;
      pair = buffers.get(oldest)!;
      buffers.delete(oldest);
    }
    pair ??= {
      texture: document.createElement('canvas'),
      composite: document.createElement('canvas'),
    };
  }
  buffers.delete(ctx);
  buffers.set(ctx, pair);
  // Match thumbnail resolution while retaining detail when perspective brings the
  // element closer. The same calculation preserves full-resolution export quality.
  const magnification = Math.max(1, bounds.width / layer.width, bounds.height / layer.height);
  const localWidth = layer.width + padding * 2;
  const localHeight = layer.height + padding * 2;
  const textureScale = fitScale(localWidth, localHeight, viewport.pixelScale * magnification);
  const textureWidth = Math.max(1, Math.floor(localWidth * textureScale));
  const textureHeight = Math.max(1, Math.floor(localHeight * textureScale));
  resize(pair.texture, textureWidth, textureHeight);
  const texture = pair.texture.getContext('2d');
  const composite = pair.composite.getContext('2d');
  if (!texture || !composite)
    throw new Error('3D element rendering is unavailable on this device.');
  texture.setTransform(1, 0, 0, 1, 0, 0);
  texture.clearRect(0, 0, textureWidth, textureHeight);
  texture.save();
  texture.scale(textureWidth / localWidth, textureHeight / localHeight);
  if (padding) texture.translate(padding, padding);
  texture.translate(layer.flipX ? layer.width : 0, layer.flipY ? layer.height : 0);
  texture.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1);
  paint(texture);
  texture.restore();

  const outputScale = fitScale(width, height, viewport.pixelScale);
  const { columns, rows } = chooseProjectionMesh(
    project,
    { x: -padding, y: -padding, width: localWidth, height: localHeight },
    outputScale,
  );
  const compositeWidth = Math.max(1, Math.floor(width * outputScale));
  const compositeHeight = Math.max(1, Math.floor(height * outputScale));
  resize(pair.composite, compositeWidth, compositeHeight);
  composite.setTransform(1, 0, 0, 1, 0, 0);
  composite.clearRect(0, 0, compositeWidth, compositeHeight);
  const nodes: Array<{ source: ElementPoint; target: ElementPoint }> = [];
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      const u = column / columns;
      const v = row / rows;
      const point = project({ x: u * localWidth - padding, y: v * localHeight - padding });
      nodes.push({
        source: { x: u * textureWidth, y: v * textureHeight },
        target: {
          x: ((point.x - left) / width) * compositeWidth,
          y: ((point.y - top) / height) * compositeHeight,
        },
      });
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const tl = row * (columns + 1) + column;
      const tr = tl + 1;
      const bl = tl + columns + 1;
      const br = bl + 1;
      for (const indices of [
        [tl, tr, br],
        [tl, br, bl],
      ]) {
        drawTriangle(
          composite,
          pair.texture,
          indices.map((index) => nodes[index].source) as Triangle,
          indices.map((index) => nodes[index].target) as Triangle,
        );
      }
    }
  }
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, animation.opacity));
  ctx.drawImage(pair.composite, left, top, width, height);
  ctx.restore();
}
