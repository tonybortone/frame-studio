import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { createLayer } from '../core/project';
import type { Layer, Project } from '../core/types';
import { MediaCache, renderFrame } from '../engine/renderer';

const RESIZE_CORNERS = [
  { name: 'nw', label: 'top left', horizontal: -1, vertical: -1 },
  { name: 'ne', label: 'top right', horizontal: 1, vertical: -1 },
  { name: 'sw', label: 'bottom left', horizontal: -1, vertical: 1 },
  { name: 'se', label: 'bottom right', horizontal: 1, vertical: 1 },
] as const;
type ResizeCorner = (typeof RESIZE_CORNERS)[number];

/** Keep the opposite world-space corner fixed, including on rotated layers. */
function resizePatch(layer: Layer, corner: ResizeCorner, width: number, height: number) {
  const angle = (layer.rotation * Math.PI) / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const nextWidth = Math.min(32768, Math.max(1, width));
  const nextHeight = Math.min(32768, Math.max(1, height));
  const centerShiftX = (corner.horizontal * (nextWidth - layer.width)) / 2;
  const centerShiftY = (corner.vertical * (nextHeight - layer.height)) / 2;
  const x = layer.x + (layer.width - nextWidth) / 2 + cosine * centerShiftX - sine * centerShiftY;
  const y = layer.y + (layer.height - nextHeight) / 2 + sine * centerShiftX + cosine * centerShiftY;
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 100000 || Math.abs(y) > 100000)
    return null;
  return { x, y, width: nextWidth, height: nextHeight };
}

interface Props {
  project: Project;
  media: MediaCache;
  time: number;
  selected: string[];
  tool: 'select' | 'draw';
  zoom: number;
  select: (ids: string[]) => void;
  change: (id: string, patch: Partial<Layer>, record?: boolean) => void;
  checkpoint: () => void;
  add: (layers: Layer[]) => void;
  error: (message: string) => void;
}
export default function CanvasStage({
  project,
  media,
  time,
  selected,
  tool,
  zoom,
  select,
  change,
  checkpoint,
  add,
  error,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 700, height: 450 });
  const [revision, setRevision] = useState(0);
  const [drawing, setDrawing] = useState<{ x: number; y: number }[]>([]);
  useEffect(() => {
    const node = surface.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) =>
      setSize({ width: entries[0].contentRect.width, height: entries[0].contentRect.height }),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const scale =
    Math.min((size.width - 72) / project.width, (size.height - 65) / project.height) * zoom;
  useEffect(() => {
    let stopped = false;
    void media
      .prepare(project.layers)
      .then(() => {
        if (!stopped) setRevision((v) => v + 1);
      })
      .catch((e) => error(e instanceof Error ? e.message : 'Could not load media'));
    return () => {
      stopped = true;
    };
  }, [project.layers, media, error]);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const draw = () => renderFrame(ctx, project, time, media);
    draw();
    return media.subscribe(draw);
  }, [project, time, media, revision]);
  const point = (event: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - r.left) / r.width) * project.width,
      y: ((event.clientY - r.top) / r.height) * project.height,
    };
  };
  const startResize = (
    event: PointerEvent<HTMLButtonElement>,
    layer: Layer,
    corner: ResizeCorner,
  ) => {
    event.stopPropagation();
    if (event.button !== 0 || layer.locked || tool !== 'select') return;
    event.preventDefault();
    const origin = point(event);
    const target = event.currentTarget;
    const angle = (layer.rotation * Math.PI) / 180;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    let resized = false;
    target.setPointerCapture(event.pointerId);
    const move = (next: globalThis.PointerEvent) => {
      const position = point(next);
      const dx = position.x - origin.x;
      const dy = position.y - origin.y;
      let width = layer.width + corner.horizontal * (dx * cosine + dy * sine);
      let height = layer.height + corner.vertical * (-dx * sine + dy * cosine);
      if (next.shiftKey) {
        const widthFactor = width / layer.width;
        const heightFactor = height / layer.height;
        const requested =
          Math.abs(widthFactor - 1) > Math.abs(heightFactor - 1) ? widthFactor : heightFactor;
        const factor = Math.max(
          1 / Math.min(layer.width, layer.height),
          Math.min(32768 / Math.max(layer.width, layer.height), requested),
        );
        width = layer.width * factor;
        height = layer.height * factor;
      }
      const patch = resizePatch(layer, corner, width, height);
      if (!patch) return;
      if (!resized) {
        if (Math.abs(patch.width - layer.width) + Math.abs(patch.height - layer.height) < 0.5)
          return;
        checkpoint();
        resized = true;
      }
      change(layer.id, patch, false);
    };
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
      target.removeEventListener('lostpointercapture', end);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
    target.addEventListener('lostpointercapture', end);
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const origin = point(event);
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    if (tool === 'draw') {
      const points = [origin];
      setDrawing([...points]);
      const move = (e: globalThis.PointerEvent) => {
        points.push(point(e));
        setDrawing([...points]);
      };
      const end = () => {
        target.removeEventListener('pointermove', move);
        target.removeEventListener('pointerup', end);
        target.removeEventListener('pointercancel', cancel);
        setDrawing([]);
        if (points.length < 2) return;
        const minX = Math.min(...points.map((p) => p.x)),
          minY = Math.min(...points.map((p) => p.y));
        const width = Math.max(1, Math.max(...points.map((p) => p.x)) - minX),
          height = Math.max(1, Math.max(...points.map((p) => p.y)) - minY);
        add([
          createLayer('drawing', {
            name: 'Pencil stroke',
            x: minX,
            y: minY,
            width,
            height,
            viewBox: `0 0 ${width} ${height}`,
            path: points
              .map(
                (p, i) => `${i ? 'L' : 'M'}${(p.x - minX).toFixed(2)} ${(p.y - minY).toFixed(2)}`,
              )
              .join(' '),
            fill: 'transparent',
            stroke: '#e88a57',
            strokeWidth: 6,
            duration: project.duration,
          }),
        ]);
      };
      const cancel = () => {
        target.removeEventListener('pointermove', move);
        target.removeEventListener('pointerup', end);
        target.removeEventListener('pointercancel', cancel);
        setDrawing([]);
      };
      target.addEventListener('pointermove', move);
      target.addEventListener('pointerup', end);
      target.addEventListener('pointercancel', cancel);
      return;
    }
    const hit = [...project.layers].reverse().find((l) => {
      if (
        l.hidden ||
        l.locked ||
        l.kind === 'audio' ||
        time < l.start ||
        time >= l.start + l.duration
      )
        return false;
      const r = (-l.rotation * Math.PI) / 180,
        dx = origin.x - l.x - l.width / 2,
        dy = origin.y - l.y - l.height / 2;
      return (
        Math.abs(dx * Math.cos(r) - dy * Math.sin(r)) <= l.width / 2 &&
        Math.abs(dx * Math.sin(r) + dy * Math.cos(r)) <= l.height / 2
      );
    });
    if (!hit) {
      select([]);
      return;
    }
    const group = hit.groupId
      ? project.layers.filter((l) => l.groupId === hit.groupId).map((l) => l.id)
      : [hit.id];
    const ids = event.shiftKey
      ? Array.from(new Set([...selected, ...group]))
      : selected.includes(hit.id)
        ? selected
        : group;
    select(ids);
    let moved = false;
    const originals = project.layers.filter((l) => ids.includes(l.id) && !l.locked);
    const move = (e: globalThis.PointerEvent) => {
      const p = point(e);
      if (!moved) {
        if (Math.abs(p.x - origin.x) + Math.abs(p.y - origin.y) < 1) return;
        checkpoint();
        moved = true;
      }
      originals.forEach((l) =>
        change(
          l.id,
          { x: Math.round(l.x + p.x - origin.x), y: Math.round(l.y + p.y - origin.y) },
          false,
        ),
      );
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
    <div className={`canvas-surface ${tool === 'draw' ? 'draw-mode' : ''}`} ref={surface}>
      <div className="artboard-name">
        {project.name}{' '}
        <span>
          {project.width} × {project.height}
        </span>
      </div>
      <div
        className="artboard"
        style={{ width: project.width * scale, height: project.height * scale }}
        onPointerDown={onPointerDown}
      >
        <canvas
          aria-label="Composition canvas"
          ref={canvas}
          width={project.width}
          height={project.height}
        />
        {project.layers
          .filter(
            (l) =>
              selected.includes(l.id) &&
              l.kind !== 'audio' &&
              !l.hidden &&
              time >= l.start &&
              time < l.start + l.duration,
          )
          .map((l) => (
            <div
              className="selection-box"
              key={l.id}
              style={{
                left: l.x * scale,
                top: l.y * scale,
                width: l.width * scale,
                height: l.height * scale,
                transform: `rotate(${l.rotation}deg)`,
              }}
            >
              {!l.locked &&
                tool === 'select' &&
                RESIZE_CORNERS.map((corner) => (
                  <button
                    key={corner.name}
                    type="button"
                    className={`resize-handle resize-handle-${corner.name}`}
                    aria-label={`Resize ${l.name} from ${corner.label}`}
                    title={`Resize from ${corner.label}. Hold Shift to keep proportions; arrow keys also resize.`}
                    onPointerDown={(event) => startResize(event, l, corner)}
                    onKeyDown={(event) => {
                      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key))
                        return;
                      event.preventDefault();
                      event.stopPropagation();
                      const step = event.shiftKey ? 10 : 1;
                      const horizontal =
                        event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0;
                      const vertical =
                        event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0;
                      const patch = resizePatch(
                        l,
                        corner,
                        l.width + corner.horizontal * horizontal,
                        l.height + corner.vertical * vertical,
                      );
                      if (patch && (patch.width !== l.width || patch.height !== l.height))
                        change(l.id, patch);
                    }}
                  />
                ))}
              <span>
                {Math.round(l.width)} × {Math.round(l.height)}
              </span>
            </div>
          ))}
        {drawing.length > 1 && (
          <svg className="drawing-preview" viewBox={`0 0 ${project.width} ${project.height}`}>
            <path
              d={drawing.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')}
              fill="none"
              stroke="#e88a57"
              strokeWidth="6"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>
      <div className="canvas-hint">
        {tool === 'draw'
          ? 'Draw directly on your canvas'
          : 'Shift + click to select more · Drag to move'}
      </div>
    </div>
  );
}
