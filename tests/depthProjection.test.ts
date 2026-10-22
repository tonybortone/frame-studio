import { describe, expect, it } from 'vitest';
import {
  canMoveOnDepthPlane,
  projectDepthPoint,
  unprojectDepthPoint,
  type DepthProjection,
} from '../src/core/depthProjection';

const view: DepthProjection = {
  viewportWidth: 800,
  viewportHeight: 600,
  projectWidth: 1000,
  projectHeight: 600,
  fit: 0.5,
  zoom: 1.25,
  pitch: 0,
  yaw: 0,
  pan: { x: 30, y: -20 },
};

describe('depth board pointer projection', () => {
  it('includes depth perspective, camera pan and uniform zoom in the front and back views', () => {
    const point = { x: 700, y: 200 };
    const front = projectDepthPoint(point, 80, view)!;
    expect(front.x).toBeCloseTo(570.5);
    expect(front.y).toBeCloseTo(209.25);
    const back = projectDepthPoint(point, 80, { ...view, yaw: 180 })!;
    expect(back.x).toBeCloseTo(400 - (95 * 1100) / 1200);
    expect(back.y).toBeCloseTo(300 - (82.5 * 1100) / 1200);
    const frontMove = unprojectDepthPoint({ x: front.x + 50, y: front.y + 30 }, 80, view)!;
    const backMove = unprojectDepthPoint({ x: back.x + 50, y: back.y + 30 }, 80, {
      ...view,
      yaw: 180,
    })!;
    expect(frontMove.x).toBeGreaterThan(point.x);
    expect(backMove.x).toBeLessThan(point.x);
    expect(frontMove.y).toBeGreaterThan(point.y);
    expect(backMove.y).toBeGreaterThan(point.y);
  });

  it('recovers world positions through orbit, pan, zoom and different depth planes', () => {
    for (const pitch of [-65, -25, 0, 48, 70]) {
      for (const yaw of [-155, -40, 0, 38, 180]) {
        for (const zoom of [0.35, 1, 2]) {
          for (const depth of [-120, 0, 120]) {
            const camera = { ...view, pitch, yaw, zoom, pan: { x: 61, y: -46 } };
            for (const point of [
              { x: 70, y: 120 },
              { x: 500, y: 300 },
              { x: 820, y: 470 },
            ]) {
              const screen = projectDepthPoint(point, depth, camera)!;
              const restored = unprojectDepthPoint(screen, depth, camera)!;
              expect(restored.x).toBeCloseTo(point.x, 7);
              expect(restored.y).toBeCloseTo(point.y, 7);
            }
          }
        }
      }
    }
  });

  it('keeps the grabbed point under the cursor in an oblique, panned view', () => {
    const camera = { ...view, pitch: 48, yaw: -28, pan: { x: -80, y: 33 }, zoom: 1.6 };
    const original = { x: 180, y: 225 };
    const screen = projectDepthPoint(original, -70, camera)!;
    const cursor = { x: screen.x + 58, y: screen.y - 36 };
    const moved = unprojectDepthPoint(cursor, -70, camera)!;
    const rendered = projectDepthPoint(moved, -70, camera)!;
    expect(rendered.x).toBeCloseTo(cursor.x, 8);
    expect(rendered.y).toBeCloseTo(cursor.y, 8);
    // A screen delta is not a simple scale at an oblique camera angle.
    expect(moved.x - original.x).not.toBeCloseTo(58 / (camera.fit * camera.zoom), 1);
  });

  it('rejects edge-on, invalid and behind-camera intersections instead of producing huge jumps', () => {
    for (const angles of [
      { pitch: 90, yaw: 0 },
      { pitch: 0, yaw: 90 },
      { pitch: 88, yaw: 12 },
    ]) {
      const camera = { ...view, ...angles };
      expect(canMoveOnDepthPlane(camera)).toBe(false);
      expect(unprojectDepthPoint({ x: 300, y: 300 }, 0, camera)).toBeNull();
    }
    for (const camera of [
      { ...view, zoom: 0 },
      { ...view, fit: NaN },
      { ...view, pan: { x: Infinity, y: 0 } },
    ]) {
      expect(unprojectDepthPoint({ x: 400, y: 300 }, 0, camera)).toBeNull();
      expect(projectDepthPoint({ x: 400, y: 300 }, 0, camera)).toBeNull();
    }
    expect(unprojectDepthPoint({ x: NaN, y: 300 }, 0, view)).toBeNull();
    expect(projectDepthPoint({ x: 500, y: 300 }, 900, view)).toBeNull();
    expect(unprojectDepthPoint({ x: 400, y: 300 }, 900, view)).toBeNull();
    expect(unprojectDepthPoint({ x: 400, y: 300 }, Infinity, view)).toBeNull();
  });
});
