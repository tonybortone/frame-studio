import { createLayer } from './project';
import type { Layer, Project } from './types';

export type CanvasTool = 'select' | 'hand' | 'draw' | 'brush' | 'pen';
export interface DrawingStyle {
  color: string;
  width: number;
}
export const DEFAULT_DRAWING_STYLE: DrawingStyle = { color: '#ef233c', width: 4 };
export const SHAPE_PRESETS = [
  { id: 'rectangle', name: 'Rectangle', path: 'M4 4H28V24H4Z' },
  {
    id: 'rounded',
    name: 'Rounded rectangle',
    path: 'M9 4H23Q28 4 28 9V19Q28 24 23 24H9Q4 24 4 19V9Q4 4 9 4Z',
  },
  { id: 'ellipse', name: 'Ellipse', path: 'M28 14A12 10 0 1 0 4 14A12 10 0 1 0 28 14Z' },
  { id: 'triangle', name: 'Triangle', path: 'M16 3L29 25H3Z' },
  { id: 'star', name: 'Star', path: 'M16 2L20 10L29 11L22 18L24 27L16 23L8 27L10 18L3 11L12 10Z' },
  { id: 'line', name: 'Line', path: 'M4 22L28 6' },
  { id: 'arrow', name: 'Arrow', path: 'M3 14H29M21 6L29 14L21 22' },
] as const;
export type ShapePresetId = (typeof SHAPE_PRESETS)[number]['id'];

/** Ordinary editable layers, centered in the frame and starting at the playhead. */
export function createShapePreset(id: ShapePresetId, project: Project, time: number): Layer {
  const preset = SHAPE_PRESETS.find((item) => item.id === id)!;
  const dimensions = id === 'line' ? [320, 16] : id === 'arrow' ? [320, 56] : [320, 240];
  const scale = Math.min(
    1,
    (project.width * 0.6) / dimensions[0],
    (project.height * 0.6) / dimensions[1],
  );
  const width = Math.max(1, dimensions[0] * scale);
  const height = Math.max(1, dimensions[1] * scale);
  const start = Math.max(
    0,
    Math.min(project.duration - 1 / project.fps, Math.round(time * project.fps) / project.fps),
  );
  const base = {
    name: preset.name,
    x: (project.width - width) / 2,
    y: (project.height - height) / 2,
    width,
    height,
    start,
    duration: Math.max(1 / project.fps, project.duration - start),
    fill: '#ef233c',
  };
  if (id === 'rectangle' || id === 'rounded') {
    return createLayer('shape', {
      ...base,
      radius: id === 'rounded' ? Math.min(width, height) * 0.16 : 0,
    });
  }
  const paths = {
    ellipse: 'M320 120A160 120 0 1 0 0 120A160 120 0 1 0 320 120Z',
    triangle: 'M160 0L320 240H0Z',
    star: 'M160 0L200 80L310 90L230 155L255 240L160 192L65 240L90 155L10 90L120 80Z',
    line: 'M8 8H312',
    arrow: 'M8 28H304M280 8L304 28L280 48',
  };
  const outline = id === 'line' || id === 'arrow';
  return createLayer('svg', {
    ...base,
    fill: outline ? 'transparent' : base.fill,
    path: paths[id],
    viewBox: `0 0 ${dimensions[0]} ${dimensions[1]}`,
    stroke: outline ? base.fill : undefined,
    strokeWidth: outline ? 4 : 0,
  });
}
