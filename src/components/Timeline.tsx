import {
  Eye,
  EyeOff,
  LockKeyhole,
  Video,
  Image,
  Type,
  Shapes,
  Music2,
  PenTool,
  Spline,
} from '../icons';
import type { CSSProperties, PointerEvent } from 'react';
import { LAYER_COLORS, type Layer, type Project } from '../core/types';
export const kindIcons = {
  video: Video,
  audio: Music2,
  image: Image,
  text: Type,
  shape: Shapes,
  svg: Spline,
  drawing: PenTool,
};
export function timecode(time: number, fps = 30) {
  const frames = Math.max(0, Math.round(time * fps));
  const seconds = Math.floor(frames / fps);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}:${String(frames % fps).padStart(2, '0')}`;
}

interface Props {
  project: Project;
  selected: string[];
  time: number;
  zoom: number;
  seek: (time: number) => void;
  select: (ids: string[]) => void;
  change: (id: string, patch: Partial<Layer>, record?: boolean) => void;
  checkpoint: () => void;
}
export default function Timeline({
  project,
  selected,
  time,
  zoom,
  seek,
  select,
  change,
  checkpoint,
}: Props) {
  const pixels = zoom;
  const width = Math.max(640, project.duration * pixels + 100);
  const startDrag = (
    event: PointerEvent<HTMLDivElement>,
    layer: Layer,
    action: 'move' | 'left' | 'right',
  ) => {
    event.stopPropagation();
    if (layer.locked) return;
    const ids =
      action === 'move' && selected.includes(layer.id)
        ? selected
        : layer.groupId && action === 'move'
          ? project.layers.filter((l) => l.groupId === layer.groupId).map((l) => l.id)
          : [layer.id];
    select(ids);
    let moved = false;
    const startX = event.clientX;
    const initial = project.layers.filter((l) => ids.includes(l.id) && !l.locked);
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (next: globalThis.PointerEvent) => {
      const step = next.shiftKey ? 1 / project.fps : 0.1;
      const delta = Math.round((next.clientX - startX) / pixels / step) * step;
      if (!moved) {
        if (delta === 0) return;
        checkpoint();
        moved = true;
      }
      if (action === 'move') {
        const safe = Math.max(
          -Math.min(...initial.map((l) => l.start)),
          Math.min(delta, project.duration - Math.max(...initial.map((l) => l.start + l.duration))),
        );
        initial.forEach((l) => change(l.id, { start: Math.max(0, l.start + safe) }, false));
      } else if (action === 'right') {
        change(
          layer.id,
          {
            duration: Math.max(
              1 / project.fps,
              Math.min(
                project.duration - layer.start,
                (layer.sourceDuration ?? Infinity) - (layer.mediaOffset ?? 0),
                layer.duration + delta,
              ),
            ),
          },
          false,
        );
      } else {
        const offset = layer.mediaOffset ?? 0;
        const safe = Math.max(
          -layer.start,
          layer.kind === 'video' || layer.kind === 'audio' ? -offset : -layer.start,
          Math.min(delta, layer.duration - 1 / project.fps),
        );
        change(
          layer.id,
          {
            start: layer.start + safe,
            duration: layer.duration - safe,
            mediaOffset: Math.max(0, offset + safe),
          },
          false,
        );
      }
    };
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  };
  return (
    <div className="timeline-scroller" aria-label="Editing timeline">
      <div className="timeline-content" style={{ width: width + 174 }}>
        <div className="timeline-ruler">
          <div className="track-heading">
            TRACKS <span>{project.layers.length}</span>
          </div>
          <div
            className="ruler-scale"
            style={{ width }}
            onPointerDown={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              seek(Math.max(0, Math.min(project.duration, (event.clientX - rect.left) / pixels)));
            }}
          >
            {Array.from({ length: Math.ceil(project.duration) + 1 }, (_, i) => (
              <div key={i} className="ruler-tick" style={{ left: i * pixels }}>
                <span>{i === 0 ? '00:00' : `00:${String(i).padStart(2, '0')}`}</span>
              </div>
            ))}
          </div>
        </div>
        {[...project.layers].reverse().map((layer) => {
          const Icon = kindIcons[layer.kind];
          const active = selected.includes(layer.id);
          return (
            <div className={`timeline-track ${active ? 'active' : ''}`} key={layer.id}>
              <div
                className="track-label"
                onClick={() => select([layer.id])}
                style={{ '--track-color': LAYER_COLORS[layer.kind] } as CSSProperties}
              >
                <Icon size={13} />
                <span>{layer.name}</span>
                <button
                  aria-label={`${layer.hidden ? 'Show' : 'Hide'} ${layer.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    change(layer.id, { hidden: !layer.hidden });
                  }}
                >
                  {layer.hidden ? <EyeOff size={11} /> : <Eye size={11} />}
                </button>
                {layer.locked && <LockKeyhole size={10} />}
              </div>
              <div className="track-lane" style={{ width, backgroundSize: `${pixels}px 100%` }}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`Timeline clip ${layer.name}`}
                  className={`timeline-clip ${active ? 'selected' : ''} ${layer.hidden ? 'is-hidden' : ''}`}
                  style={
                    {
                      left: layer.start * pixels,
                      width: Math.max(7, layer.duration * pixels),
                      '--clip-color': LAYER_COLORS[layer.kind],
                    } as CSSProperties
                  }
                  onPointerDown={(e) => startDrag(e, layer, 'move')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') select([layer.id]);
                  }}
                >
                  <div
                    className="trim-handle left"
                    title="Trim start"
                    onPointerDown={(e) => startDrag(e, layer, 'left')}
                  />
                  <Icon size={12} />
                  <span>{layer.name}</span>
                  {layer.kind === 'audio' && (
                    <div className="waveform">
                      <span>Audio clip</span>
                    </div>
                  )}
                  {layer.groupId && <span className="group-mark">G</span>}
                  {layer.animation !== 'none' && <span className="animation-mark">◈</span>}
                  <div
                    className="trim-handle right"
                    title="Trim end"
                    onPointerDown={(e) => startDrag(e, layer, 'right')}
                  />
                </div>
              </div>
            </div>
          );
        })}
        <div className="playhead" style={{ left: 174 + time * pixels }}>
          <div className="playhead-cap" />
        </div>
      </div>
      {project.layers.length === 0 && (
        <div className="timeline-empty">
          Add a video, a shape, or your first words. Your story starts here.
        </div>
      )}
    </div>
  );
}
