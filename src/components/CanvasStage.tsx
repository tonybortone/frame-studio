import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { createLayer } from '../core/project';
import { getSelectionBounds, transformSelection, type SelectionBounds } from '../core/selection';
import type { Layer, Project } from '../core/types';
import { MediaCache, renderFrame } from '../engine/renderer';
import './CanvasStage.css';

// Keep the creation tools, view switch, and canvas zoom clear at Fit zoom.
const BOARD_INSETS = { left: 88, right: 32, top: 72, bottom: 56 } as const;
function boardGeometry(size: { width: number; height: number }) {
  return {
    centerX: (size.width + BOARD_INSETS.left - BOARD_INSETS.right) / 2,
    centerY: (size.height + BOARD_INSETS.top - BOARD_INSETS.bottom) / 2,
    width: Math.max(1, size.width - BOARD_INSETS.left - BOARD_INSETS.right),
    height: Math.max(1, size.height - BOARD_INSETS.top - BOARD_INSETS.bottom),
  };
}

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
  tool: 'select' | 'draw' | 'hand';
  zoom: number;
  onZoomChange?: (zoom: number) => void;
  resetViewKey?: number;
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
  onZoomChange,
  resetViewKey,
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
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const pointerInside = useRef(false);
  const spacePressed = useRef(false);
  const activePanCleanup = useRef<(() => void) | null>(null);
  const activeGroupResizeCleanup = useRef<(() => void) | null>(null);
  const keyboardGroupResize = useRef(false);
  const viewport = useRef({ zoom, pan, size, onZoomChange });
  viewport.current = { zoom, pan, size, onZoomChange };
  useEffect(() => {
    setPan({ x: 0, y: 0 });
    activeGroupResizeCleanup.current?.();
    keyboardGroupResize.current = false;
  }, [resetViewKey, project.id]);
  useEffect(() => {
    const isEditing = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        !!target.closest('input, textarea, select, button, a, [role="dialog"]'));
    const keyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || isEditing(event.target)) return;
      if (!pointerInside.current && !spacePressed.current) return;
      event.preventDefault();
      event.stopPropagation();
      spacePressed.current = true;
      setSpaceHeld(true);
    };
    const releaseSpace = () => {
      spacePressed.current = false;
      setSpaceHeld(false);
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') releaseSpace();
    };
    const blur = () => {
      releaseSpace();
      activePanCleanup.current?.();
      activeGroupResizeCleanup.current?.();
      keyboardGroupResize.current = false;
    };
    window.addEventListener('keydown', keyDown, true);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', keyDown, true);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
      activePanCleanup.current?.();
      activeGroupResizeCleanup.current?.();
    };
  }, []);
  useEffect(() => {
    const node = surface.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      // A non-passive listener keeps trackpad gestures inside the board.
      event.preventDefault();
      if (activePanCleanup.current) return;
      const current = viewport.current;
      const multiplier =
        event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? current.size.height : 1;
      const deltaX = event.deltaX * multiplier;
      const deltaY = event.deltaY * multiplier;
      if (event.ctrlKey || event.metaKey) {
        if (!current.onZoomChange) return;
        const nextZoom = Math.max(0.15, Math.min(3, current.zoom * Math.exp(-deltaY * 0.008)));
        const ratio = nextZoom / current.zoom;
        const bounds = node.getBoundingClientRect();
        const board = boardGeometry(current.size);
        const cursorX = event.clientX - bounds.left - board.centerX;
        const cursorY = event.clientY - bounds.top - board.centerY;
        const nextPan = {
          x: cursorX - (cursorX - current.pan.x) * ratio,
          y: cursorY - (cursorY - current.pan.y) * ratio,
        };
        viewport.current = { ...current, zoom: nextZoom, pan: nextPan };
        setPan(nextPan);
        current.onZoomChange(nextZoom);
      } else {
        const nextPan = { x: current.pan.x - deltaX, y: current.pan.y - deltaY };
        viewport.current = { ...current, pan: nextPan };
        setPan(nextPan);
      }
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, []);
  const beginPan = (event: PointerEvent<HTMLDivElement>) => {
    if (
      (event.button === 0 || event.button === 1) &&
      !(event.target instanceof Element && event.target.closest('button'))
    ) {
      event.currentTarget.focus({ preventScroll: true });
    }
    if (event.button !== 1 && !(event.button === 0 && (tool === 'hand' || spacePressed.current)))
      return;
    event.preventDefault();
    event.stopPropagation();
    activePanCleanup.current?.();
    const target = event.currentTarget;
    const origin = { x: event.clientX, y: event.clientY };
    const initialPan = viewport.current.pan;
    target.setPointerCapture(event.pointerId);
    setPanning(true);
    const move = (next: globalThis.PointerEvent) => {
      const nextPan = {
        x: initialPan.x + next.clientX - origin.x,
        y: initialPan.y + next.clientY - origin.y,
      };
      viewport.current = { ...viewport.current, pan: nextPan };
      setPan(nextPan);
    };
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
      target.removeEventListener('lostpointercapture', end);
      if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
      activePanCleanup.current = null;
      setPanning(false);
    };
    activePanCleanup.current = end;
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
    target.addEventListener('lostpointercapture', end);
  };
  useEffect(() => {
    const node = surface.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) =>
      setSize({ width: entries[0].contentRect.width, height: entries[0].contentRect.height }),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const safeZoom = Number.isFinite(zoom) ? Math.max(0.15, Math.min(3, zoom)) : 1;
  const board = boardGeometry(size);
  const scale =
    Math.max(0.001, Math.min(board.width / project.width, board.height / project.height)) *
    safeZoom;
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
  const visibleSelection = project.layers.filter(
    (layer) =>
      selected.includes(layer.id) &&
      layer.kind !== 'audio' &&
      !layer.hidden &&
      time >= layer.start &&
      time < layer.start + layer.duration,
  );
  const groupBounds = visibleSelection.length > 1 ? getSelectionBounds(visibleSelection) : null;
  const groupLocked = project.layers.some(
    (layer) => selected.includes(layer.id) && layer.kind !== 'audio' && layer.locked,
  );
  const resizedSelection = (
    layers: Layer[],
    bounds: SelectionBounds,
    corner: ResizeCorner,
    factor: number,
  ) => {
    try {
      return transformSelection(
        layers,
        layers.map((layer) => layer.id),
        {
          scale: factor,
          x: bounds.x + (corner.horizontal < 0 ? bounds.width * (1 - factor) : 0),
          y: bounds.y + (corner.vertical < 0 ? bounds.height * (1 - factor) : 0),
        },
      );
    } catch {
      // A gesture outside valid project limits leaves the last valid size intact.
      return layers;
    }
  };
  const startGroupResize = (event: PointerEvent<HTMLButtonElement>, corner: ResizeCorner) => {
    event.stopPropagation();
    if (event.button !== 0 || groupLocked || tool !== 'select' || !groupBounds) return;
    event.preventDefault();
    activeGroupResizeCleanup.current?.();
    const origin = point(event);
    const originals = visibleSelection;
    const bounds = groupBounds;
    const target = event.currentTarget;
    const pointerId = event.pointerId;
    let resized = false;
    target.setPointerCapture(pointerId);
    const move = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      const position = point(next);
      const widthFactor = 1 + (corner.horizontal * (position.x - origin.x)) / bounds.width;
      const heightFactor = 1 + (corner.vertical * (position.y - origin.y)) / bounds.height;
      const factor =
        Math.abs(widthFactor - 1) > Math.abs(heightFactor - 1) ? widthFactor : heightFactor;
      if (!Number.isFinite(factor) || factor <= 0) return;
      const layers = resizedSelection(originals, bounds, corner, factor);
      if (layers === originals && !(resized && factor === 1)) return;
      if (!resized) {
        if (Math.abs(factor - 1) * Math.max(bounds.width, bounds.height) < 0.5) return;
        checkpoint();
        resized = true;
      }
      layers.forEach((layer) => change(layer.id, layer, false));
    };
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
      target.removeEventListener('lostpointercapture', end);
      activeGroupResizeCleanup.current = null;
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
    };
    activeGroupResizeCleanup.current = end;
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
    target.addEventListener('lostpointercapture', end);
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
    if (event.button !== 0 || tool === 'hand' || spacePressed.current) return;
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
    <div
      className={`canvas-surface board-surface ${tool === 'draw' ? 'draw-mode' : ''} ${tool === 'hand' || spaceHeld ? 'hand-mode' : ''} ${panning ? 'is-panning' : ''}`}
      ref={surface}
      tabIndex={0}
      role="region"
      aria-label="Canvas board"
      onPointerEnter={() => {
        pointerInside.current = true;
      }}
      onPointerLeave={() => {
        pointerInside.current = false;
      }}
      onPointerDownCapture={beginPan}
      onPointerDown={(event) => {
        if (event.button === 0 && event.target === event.currentTarget) select([]);
      }}
      style={{ backgroundPosition: `${pan.x}px ${pan.y}px` }}
    >
      <div
        className="artboard"
        style={{
          width: project.width * scale,
          height: project.height * scale,
          left: board.centerX + pan.x,
          top: board.centerY + pan.y,
        }}
        onPointerDown={onPointerDown}
      >
        <div className="artboard-name">
          {project.name}
          <span>
            {project.width} × {project.height}
          </span>
        </div>
        <canvas
          aria-label="Composition canvas"
          ref={canvas}
          width={project.width}
          height={project.height}
        />
        {groupBounds && (
          <div
            className="selection-box selection-box-group"
            style={{
              left: groupBounds.x * scale,
              top: groupBounds.y * scale,
              width: groupBounds.width * scale,
              height: groupBounds.height * scale,
            }}
          >
            {!groupLocked &&
              tool === 'select' &&
              RESIZE_CORNERS.map((corner) => (
                <button
                  key={corner.name}
                  type="button"
                  className={`resize-handle resize-handle-${corner.name}`}
                  aria-label={`Resize selection from ${corner.label}`}
                  title={`Resize all selected pieces from ${corner.label}. Proportions stay together; arrow keys also resize.`}
                  onPointerDown={(event) => startGroupResize(event, corner)}
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
                    const factor =
                      1 +
                      (horizontal
                        ? (corner.horizontal * horizontal) / groupBounds.width
                        : (corner.vertical * vertical) / groupBounds.height);
                    const layers = resizedSelection(visibleSelection, groupBounds, corner, factor);
                    if (layers === visibleSelection) return;
                    if (!keyboardGroupResize.current) {
                      checkpoint();
                      keyboardGroupResize.current = true;
                    }
                    layers.forEach((layer) => change(layer.id, layer, false));
                  }}
                  onKeyUp={(event) => {
                    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
                      event.stopPropagation();
                      keyboardGroupResize.current = false;
                    }
                  }}
                  onBlur={() => {
                    keyboardGroupResize.current = false;
                  }}
                />
              ))}
            <span>
              {Math.round(groupBounds.width)} × {Math.round(groupBounds.height)}
            </span>
          </div>
        )}
        {!groupBounds &&
          visibleSelection.map((l) => (
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
    </div>
  );
}
