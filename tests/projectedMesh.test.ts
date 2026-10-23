import { describe, expect, it } from 'vitest';
import { createLayer } from '../src/core/project';
import { createElementProjector, type ElementPoint } from '../src/core/element3d';
import { chooseProjectionMesh } from '../src/engine/projectedLayer';

/** Independent dense sampling inside the actual two affine triangles per cell. */
function denseMeshError(
  project: (point: ElementPoint) => ElementPoint,
  width: number,
  height: number,
  columns: number,
  rows: number,
): number {
  let maximum = 0;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = (column * width) / columns,
        y = (row * height) / rows;
      const dx = width / columns,
        dy = height / rows;
      const tl = project({ x, y }),
        tr = project({ x: x + dx, y });
      const bl = project({ x, y: y + dy }),
        br = project({ x: x + dx, y: y + dy });
      for (let i = 1; i < 10; i++) {
        for (let j = 1; j < 10; j++) {
          const u = i / 10,
            v = j / 10;
          const weights = u >= v ? [1 - u, u - v, v, 0] : [1 - v, 0, u, v - u];
          const vertices = [tl, tr, br, bl];
          const approximate = {
            x: vertices.reduce((sum, point, index) => sum + point.x * weights[index], 0),
            y: vertices.reduce((sum, point, index) => sum + point.y * weights[index], 0),
          };
          const exact = project({ x: x + u * dx, y: y + v * dy });
          maximum = Math.max(maximum, Math.hypot(approximate.x - exact.x, approximate.y - exact.y));
        }
      }
    }
  }
  return maximum;
}

const shared = {
  enabled: true,
  rotateX: 18,
  rotateY: -24,
  z: 0,
  motion: 'none' as const,
  originX: 600,
  originY: 400,
  perspectiveDistance: 2800,
};

describe('adaptive perspective mesh', () => {
  it('draws every affine projection with one cell, including a rotated and scaled neutral 3D plane', () => {
    const layer = createLayer('shape', {
      width: 1000,
      height: 600,
      rotation: 37,
      transform3d: { ...shared, rotateX: 0, rotateY: 0, z: 25 },
    });
    const project = createElementProjector(layer, 0, { x: 50, y: -20, scale: 1.4 });
    const mesh = chooseProjectionMesh(
      project,
      { x: 0, y: 0, width: layer.width, height: layer.height },
      2,
    );
    expect(mesh).toEqual({ columns: 1, rows: 1 });
    expect(
      denseMeshError(project, layer.width, layer.height, mesh.columns, mesh.rows),
    ).toBeLessThan(1e-9);
  });

  it('keeps independently sampled triangle error below one pixel on UI labels and perspective cards', () => {
    for (const [x, y, width, height, pixelScale] of [
      [130, 100, 240, 30, 1],
      [100, 80, 1000, 680, 1],
      [850, 200, 160, 50, 2],
      [200, 380, 500, 80, 0.5],
    ]) {
      const layer = createLayer('shape', { x, y, width, height, transform3d: shared });
      const project = createElementProjector(layer, 0);
      const mesh = chooseProjectionMesh(project, { x: 0, y: 0, width, height }, pixelScale);
      expect(mesh.columns).toBeLessThanOrEqual(12);
      expect(mesh.rows).toBeLessThanOrEqual(12);
      expect(
        denseMeshError(project, width, height, mesh.columns, mesh.rows) * pixelScale,
      ).toBeLessThan(0.85);
    }
  });

  it('reduces a representative eighty-layer UI from 23,040 triangles to fewer than 1,500', () => {
    let triangles = 0;
    for (let index = 0; index < 80; index++) {
      const layer = createLayer(index ? 'text' : 'shape', {
        x: index ? 150 + (index % 4) * 220 : 100,
        y: index ? 100 + (index % 20) * 28 : 80,
        width: index ? 200 : 1000,
        height: index ? 24 : 680,
        transform3d: shared,
      });
      const mesh = chooseProjectionMesh(
        createElementProjector(layer, 0),
        { x: 0, y: 0, width: layer.width, height: layer.height },
        1,
      );
      triangles += mesh.columns * mesh.rows * 2;
    }
    expect(triangles).toBeLessThan(1500);
    expect(triangles).toBeLessThan((80 * 12 * 12 * 2) / 15);
  });

  it('caps extreme near-plane views and allocates no larger grid than the prior renderer', () => {
    const layer = createLayer('shape', {
      x: 0,
      y: 0,
      width: 8000,
      height: 8000,
      transform3d: { ...shared, rotateX: 75, rotateY: 70, z: 100, perspectiveDistance: 1000 },
    });
    const mesh = chooseProjectionMesh(
      createElementProjector(layer, 0),
      { x: -240, y: -240, width: 8480, height: 8480 },
      4,
    );
    expect(mesh.columns).toBeGreaterThanOrEqual(1);
    expect(mesh.rows).toBeGreaterThanOrEqual(1);
    expect(mesh.columns * mesh.rows).toBeLessThanOrEqual(144);
  });
});
