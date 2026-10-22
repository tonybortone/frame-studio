import { describe, expect, it } from 'vitest';
import { createLayer, createProject, parseProject, validatePathData } from '../src/core/project';
import {
  appendStrokePoint,
  MAX_STROKE_POINTS,
  vectorGeometry,
  vectorPathData,
  type VectorAnchor,
  type VectorPoint,
} from '../src/core/vector';

describe('vector drawing geometry', () => {
  it('pads horizontal and vertical strokes, including their round ends', () => {
    const horizontal = vectorGeometry(
      [
        { x: -20, y: 40 },
        { x: 80, y: 40 },
      ],
      false,
      12,
    )!;
    expect(horizontal).toMatchObject({ x: -27, y: 33, width: 114, height: 14 });
    expect(horizontal.path).toBe('M7 7 L107 7');
    expect(horizontal.viewBox).toBe('0 0 114 14');
    const vertical = vectorGeometry(
      [
        { x: 20, y: 10 },
        { x: 20, y: 70 },
      ],
      false,
      4,
    )!;
    expect(vertical).toMatchObject({ x: 17, y: 7, width: 6, height: 66 });
  });

  it('bounds the actual cubic curve and preserves mirrored handles in SVG commands', () => {
    const anchors = [
      { x: 0, y: 0, handle: { x: 0, y: 100 } },
      { x: 100, y: 0, handle: { x: 0, y: -100 } },
    ];
    expect(vectorPathData(anchors)).toBe('M0 0 C0 100 100 100 100 0');
    const result = vectorGeometry(anchors, false, 4)!;
    expect(result.x).toBe(-3);
    expect(result.y).toBe(-3);
    expect(result.width).toBe(106);
    expect(result.height).toBeCloseTo(81); // Cubic's peak is 75, not the handle's 100.
    expect(result.path).toBe('M3 3 C3 103 103 103 103 3');
    validatePathData(result.path);
  });

  it('closes through the first incoming handle and includes the closing curve in its bounds', () => {
    const anchors: VectorAnchor[] = [
      { x: 40, y: 30, handle: { x: 30, y: -90 } },
      { x: 170, y: 110, handle: { x: 100, y: 20 } },
      { x: 20, y: 220, handle: { x: -30, y: -80 } },
    ];
    const path = vectorPathData(anchors, true);
    expect(path).toBe(
      'M40 30 C70 -60 70 90 170 110 C270 130 50 300 20 220 C-10 140 10 120 40 30 Z',
    );
    const geometry = vectorGeometry(anchors, true, 8)!;
    for (let i = 0; i < anchors.length; i++) {
      const from = anchors[i];
      const to = anchors[(i + 1) % anchors.length];
      for (let step = 0; step <= 100; step++) {
        const t = step / 100;
        const u = 1 - t;
        for (const axis of ['x', 'y'] as const) {
          const value =
            u ** 3 * from[axis] +
            3 * u ** 2 * t * (from[axis] + from.handle![axis]) +
            3 * u * t ** 2 * (to[axis] - to.handle![axis]) +
            t ** 3 * to[axis];
          expect(value).toBeGreaterThanOrEqual(geometry[axis] + 4.999);
          expect(value).toBeLessThanOrEqual(
            geometry[axis] + geometry[axis === 'x' ? 'width' : 'height'] - 4.999,
          );
        }
      }
    }
    const project = {
      ...createProject(),
      layers: [
        createLayer('svg', { ...geometry, fill: '#ef233c', stroke: '#ef233c', strokeWidth: 8 }),
      ],
    };
    const loaded = parseProject(JSON.stringify(project));
    expect(loaded.layers[0]).toEqual(project.layers[0]);
    expect(loaded.layers[0].path).toMatch(/ Z$/);
  });

  it('rejects invalid coordinates, sizes and degenerate drafts before they reach the project', () => {
    expect(vectorGeometry([{ x: 0, y: 0 }], false, 4)).toBeNull();
    expect(
      vectorGeometry(
        [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ],
        true,
        4,
      ),
    ).toBeNull();
    for (const value of [NaN, Infinity, -Infinity, 100_001]) {
      expect(
        vectorGeometry(
          [
            { x: 0, y: 0 },
            { x: value, y: 10 },
          ],
          false,
          4,
        ),
      ).toBeNull();
      expect(vectorPathData([{ x: 0, y: 0, handle: { x: value, y: 0 } }])).toBe('');
    }
    for (const width of [NaN, Infinity, -1, 2049])
      expect(
        vectorGeometry(
          [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
          ],
          false,
          width,
        ),
      ).toBeNull();
    expect(
      vectorGeometry(
        [
          { x: -20_000, y: 0 },
          { x: 20_000, y: 0 },
        ],
        false,
        4,
      ),
    ).toBeNull();
    expect(
      vectorGeometry(
        [
          { x: 99_999, y: 0, handle: { x: 2, y: 0 } },
          { x: 10, y: 10 },
        ],
        false,
        4,
      ),
    ).toBeNull();
    expect(vectorPathData([{ x: 100_000, y: 0 }], false, { x: -100_000, y: 0 })).toBe('');
  });

  it('samples long strokes to a bounded point count while preserving first and latest points', () => {
    const first = { x: 0, y: 0 };
    const initial = [first];
    expect(appendStrokePoint(initial, { x: 0.2, y: 0.2 }, 1)).toBe(initial);
    expect(appendStrokePoint(initial, { x: NaN, y: 2 }, 0)).toBe(initial);
    let points: VectorPoint[] = initial;
    for (let index = 1; index < MAX_STROKE_POINTS * 3; index++) {
      points = appendStrokePoint(points, { x: index * 2, y: Math.sin(index) * 100 }, 1);
      expect(points.length).toBeLessThanOrEqual(MAX_STROKE_POINTS);
    }
    expect(points[0]).toEqual(first);
    expect(points.at(-1)?.x).toBe((MAX_STROKE_POINTS * 3 - 1) * 2);
    const geometry = vectorGeometry(points, false, 6)!;
    expect(geometry).not.toBeNull();
    validatePathData(geometry.path);
    expect(geometry.path).not.toMatch(/NaN|Infinity/);
  });
});
