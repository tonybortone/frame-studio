/** The CSS camera used by the depth board: perspective · pan · rotateX · rotateY · scale3d. */
export interface DepthProjection {
  viewportWidth: number;
  viewportHeight: number;
  projectWidth: number;
  projectHeight: number;
  fit: number;
  zoom: number;
  pitch: number;
  yaw: number;
  pan: { x: number; y: number };
  perspective?: number;
}
export interface DepthPoint {
  x: number;
  y: number;
}
export const DEPTH_PERSPECTIVE = 1100;

function camera(view: DepthProjection) {
  const perspective = view.perspective ?? DEPTH_PERSPECTIVE;
  if (
    ![
      view.viewportWidth,
      view.viewportHeight,
      view.projectWidth,
      view.projectHeight,
      view.fit,
      view.zoom,
      view.pitch,
      view.yaw,
      view.pan.x,
      view.pan.y,
      perspective,
    ].every(Number.isFinite) ||
    [
      view.viewportWidth,
      view.viewportHeight,
      view.projectWidth,
      view.projectHeight,
      view.fit,
      view.zoom,
      perspective,
    ].some((value) => value <= 0)
  )
    return null;
  const pitch = (view.pitch * Math.PI) / 180;
  const yaw = (view.yaw * Math.PI) / 180;
  return {
    cp: Math.cos(pitch),
    sp: Math.sin(pitch),
    cy: Math.cos(yaw),
    sy: Math.sin(yaw),
    perspective,
  };
}

/** Near an edge-on view, tiny cursor moves cannot give a useful XY position. */
export function canMoveOnDepthPlane(view: DepthProjection): boolean {
  const value = camera(view);
  return !!value && Math.abs(value.cp * value.cy) >= 0.08;
}

/** Project a composition point onto viewport pixels; depth is the plane's displayed CSS distance. */
export function projectDepthPoint(
  point: DepthPoint,
  depth: number,
  view: DepthProjection,
): DepthPoint | null {
  const value = camera(view);
  if (!value || ![point.x, point.y, depth].every(Number.isFinite)) return null;
  const { cp, sp, cy, sy, perspective } = value;
  const x = (point.x - view.projectWidth / 2) * view.fit;
  const y = (point.y - view.projectHeight / 2) * view.fit;
  const rotatedX = view.zoom * (cy * x + sy * depth) + view.pan.x;
  const rotatedY = view.zoom * (sp * sy * x + cp * y - sp * cy * depth) + view.pan.y;
  const rotatedZ = view.zoom * (-cp * sy * x + sp * y + cp * cy * depth);
  const distance = perspective - rotatedZ;
  if (distance <= 1) return null;
  return {
    x: view.viewportWidth / 2 + (perspective * rotatedX) / distance,
    y: view.viewportHeight / 2 + (perspective * rotatedY) / distance,
  };
}

/** Intersect a screen ray with a fixed depth plane, undoing perspective, orbit, zoom, fit and pan. */
export function unprojectDepthPoint(
  point: DepthPoint,
  depth: number,
  view: DepthProjection,
): DepthPoint | null {
  const value = camera(view);
  if (!value || !canMoveOnDepthPlane(view) || ![point.x, point.y, depth].every(Number.isFinite))
    return null;
  const { cp, sp, cy, sy, perspective: p } = value;
  const u = point.x - view.viewportWidth / 2;
  const v = point.y - view.viewportHeight / 2;
  // Solve the two homogeneous perspective equations for the plane-local X and Y.
  const a = view.zoom * (p * cy - u * cp * sy);
  const b = view.zoom * u * sp;
  const c = u * p - p * view.pan.x - view.zoom * depth * (p * sy + u * cp * cy);
  const d = view.zoom * (p * sp * sy - v * cp * sy);
  const e = view.zoom * (p * cp + v * sp);
  const f = v * p - p * view.pan.y - view.zoom * depth * (-p * sp * cy + v * cp * cy);
  const determinant = a * e - b * d;
  const magnitude = Math.max(1, Math.hypot(a, b) * Math.hypot(d, e));
  if (Math.abs(determinant) / magnitude < 0.0001) return null;
  const x = (c * e - b * f) / determinant;
  const y = (a * f - c * d) / determinant;
  const distance = p - view.zoom * (-cp * sy * x + sp * y + cp * cy * depth);
  const result = {
    x: x / view.fit + view.projectWidth / 2,
    y: y / view.fit + view.projectHeight / 2,
  };
  return distance > 1 && Number.isFinite(result.x) && Number.isFinite(result.y) ? result : null;
}
