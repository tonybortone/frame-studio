import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { createLayer } from '../core/project';
import { DEFAULT_DRAWING_STYLE, type CanvasTool, type DrawingStyle } from '../core/creation';
import { getSelectionBounds, transformSelection, type SelectionBounds } from '../core/selection';
import { getElement3DQuad, getQuadBounds, hasElement3D, pointInQuad } from '../core/element3d';
import { evaluateKeyframedLayer } from '../core/keyframes';
import {
  appendStrokePoint,
  isVectorPoint,
  MAX_PEN_ANCHORS,
  vectorGeometry,
  vectorPathData,
  type VectorAnchor,
  type VectorPoint,
} from '../core/vector';
import type { Layer, Project } from '../core/types';
import { animationState, MediaCache, renderFrame } from '../engine/renderer';
import './CanvasStage.css';

// Keep the creation tools, view switch, and canvas zoom clear at Fit zoom.
const BOARD_INSETS = { left: 32, right: 32, top: 72, bottom: 72 } as const;
function boardGeometry(
  size: { width: number; height: number },
  leftInset: number = BOARD_INSETS.left,
) {
  const bottomInset = size.width <= 680 ? 112 : BOARD_INSETS.bottom;
  return {
    centerX: (size.width + leftInset - BOARD_INSETS.right) / 2,
    centerY: (size.height + BOARD_INSETS.top - bottomInset) / 2,
    width: Math.max(1, size.width - leftInset - BOARD_INSETS.right),
    height: Math.max(1, size.height - BOARD_INSETS.top - bottomInset),
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
function resizePatch(
  layer: Layer,
  corner: ResizeCorner,
  width: number,
  height: number,
  visualScale = 1,
) {
  const angle = (layer.rotation * Math.PI) / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const nextWidth = Math.min(32768, Math.max(1, width));
  const nextHeight = Math.min(32768, Math.max(1, height));
  const centerShiftX = (corner.horizontal * (nextWidth - layer.width) * visualScale) / 2;
  const centerShiftY = (corner.vertical * (nextHeight - layer.height) * visualScale) / 2;
  const x = layer.x + (layer.width - nextWidth) / 2 + cosine * centerShiftX - sine * centerShiftY;
  const y = layer.y + (layer.height - nextHeight) / 2 + sine * centerShiftX + cosine * centerShiftY;
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 100000 || Math.abs(y) > 100000)
    return null;
  return { x, y, width: nextWidth, height: nextHeight };
}

/** Never write an evaluated layer back wholesale when resizing a selection. */
function groupResizePatch(layer: Layer): Partial<Layer> {
  const geometry = { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
  // Animated size already scales the original artwork in the renderer. Scaling
  // the font/radius here as well would grow that content a second time.
  if (layer.keyframes?.width?.length || layer.keyframes?.height?.length) return geometry;
  return {
    ...geometry,
    radius: layer.radius,
    ...(layer.fontSize === undefined ? {} : { fontSize: layer.fontSize }),
    ...(layer.strokeWidth === undefined ? {} : { strokeWidth: layer.strokeWidth }),
  };
}

interface Props {
  project: Project;
  media: MediaCache;
  time: number;
  selected: string[];
  tool: CanvasTool;
  drawingStyle?: DrawingStyle;
  zoom: number;
  leftInset?: number;
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
  drawingStyle = DEFAULT_DRAWING_STYLE,
  zoom,
  leftInset = BOARD_INSETS.left,
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
  const [drawing, setDrawing] = useState<VectorPoint[]>([]);
  const [penAnchors, setPenAnchors] = useState<VectorAnchor[]>([]);
  const [penCursor, setPenCursor] = useState<VectorPoint | null>(null);
  const penDraft = useRef<VectorAnchor[]>([]);
  const draftStyle = useRef(drawingStyle);
  const activeVectorCleanup = useRef<(() => void) | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const pointerInside = useRef(false);
  const spacePressed = useRef(false);
  const activePanCleanup = useRef<(() => void) | null>(null);
  const activeGroupResizeCleanup = useRef<(() => void) | null>(null);
  const keyboardGroupResize = useRef(false);
  const viewport = useRef({ zoom, pan, size, onZoomChange, leftInset });
  viewport.current = { zoom, pan, size, onZoomChange, leftInset };
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
      if (activePanCleanup.current || activeVectorCleanup.current) return;
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
        const board = boardGeometry(current.size, current.leftInset);
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
  const board = boardGeometry(size, leftInset);
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
  const evaluatedLayers = useMemo(
    () => project.layers.map((layer) => evaluateKeyframedLayer(layer, time)),
    [project.layers, time],
  );
  const visibleSelection = evaluatedLayers.filter(
    (layer) =>
      selected.includes(layer.id) &&
      layer.kind !== 'audio' &&
      !layer.hidden &&
      time >= layer.start &&
      time < layer.start + layer.duration,
  );
  const selectionHas3D = visibleSelection.some(hasElement3D);
  const projectedBounds = visibleSelection.map((layer) =>
    getQuadBounds(getElement3DQuad(layer, time, animationState(layer, time))),
  );
  const groupBounds =
    visibleSelection.length > 1
      ? selectionHas3D
        ? (() => {
            const x = Math.min(...projectedBounds.map((bounds) => bounds.x));
            const y = Math.min(...projectedBounds.map((bounds) => bounds.y));
            return {
              x,
              y,
              width: Math.max(...projectedBounds.map((bounds) => bounds.x + bounds.width)) - x,
              height: Math.max(...projectedBounds.map((bounds) => bounds.y + bounds.height)) - y,
            };
          })()
        : getSelectionBounds(visibleSelection)
      : null;
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
      layers.forEach((layer) => change(layer.id, groupResizePatch(layer), false));
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
    const visualScale = animationState(layer, time).scale;
    let resized = false;
    target.setPointerCapture(event.pointerId);
    const move = (next: globalThis.PointerEvent) => {
      const position = point(next);
      const dx = (position.x - origin.x) / visualScale;
      const dy = (position.y - origin.y) / visualScale;
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
      const patch = resizePatch(layer, corner, width, height, visualScale);
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
  const ink: DrawingStyle = {
    color: /^#[0-9a-f]{6}$/i.test(drawingStyle.color)
      ? drawingStyle.color
      : DEFAULT_DRAWING_STYLE.color,
    width: Number.isFinite(drawingStyle.width)
      ? Math.max(1, Math.min(128, drawingStyle.width))
      : DEFAULT_DRAWING_STYLE.width,
  };
  const updatePen = (anchors: VectorAnchor[]) => {
    penDraft.current = anchors;
    setPenAnchors(anchors);
  };
  const resetVectorDraft = () => {
    activeVectorCleanup.current?.();
    updatePen([]);
    setPenCursor(null);
    setDrawing([]);
  };
  const addVector = (
    anchors: VectorAnchor[],
    closed: boolean,
    style: DrawingStyle,
    pen: boolean,
  ) => {
    const geometry = vectorGeometry(anchors, closed, style.width);
    if (!geometry) {
      error('This path is too large. Draw a smaller path inside the canvas.');
      return;
    }
    const start = Math.max(
      0,
      Math.min(project.duration - 1 / project.fps, Math.round(time * project.fps) / project.fps),
    );
    add([
      createLayer(pen ? 'svg' : 'drawing', {
        ...geometry,
        name: pen
          ? closed
            ? 'Pen shape'
            : 'Pen path'
          : tool === 'brush'
            ? 'Brush stroke'
            : 'Pencil stroke',
        fill: closed ? style.color : 'transparent',
        stroke: style.color,
        strokeWidth: style.width,
        start,
        duration: Math.max(1 / project.fps, project.duration - start),
      }),
    ]);
  };
  const finishPen = (closed: boolean) => {
    const anchors = penDraft.current;
    if (anchors.length < (closed ? 3 : 2)) return;
    resetVectorDraft();
    addVector(anchors, closed, ink, true);
  };
  const vectorActions = useRef({
    cancel: resetVectorDraft,
    finish: finishPen,
    removeAnchor: () => {},
    penActive: tool === 'pen',
  });
  vectorActions.current = {
    cancel: resetVectorDraft,
    finish: finishPen,
    penActive: tool === 'pen',
    removeAnchor: () => {
      // Removing an anchor also ends a handle drag, without committing the path.
      const remaining = penDraft.current.slice(0, -1);
      activeVectorCleanup.current?.();
      updatePen(remaining);
      setPenCursor(null);
    },
  };
  useEffect(() => {
    vectorActions.current.cancel();
    return () => activeVectorCleanup.current?.();
  }, [tool, project.id, project.width, project.height, resetViewKey]);
  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (
        !penDraft.current.length &&
        !activeVectorCleanup.current &&
        !(vectorActions.current.penActive && ['Backspace', 'Delete'].includes(event.key))
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input, textarea, select, [role="dialog"]'))
      )
        return;
      const isDraftKey = ['Escape', 'Backspace', 'Delete', 'Enter'].includes(event.key);
      if (
        !isDraftKey ||
        (event.key === 'Enter' && target instanceof Element && target.closest('button'))
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') vectorActions.current.cancel();
      else if (event.key === 'Enter') vectorActions.current.finish(false);
      else vectorActions.current.removeAnchor();
    };
    const cancel = () => vectorActions.current.cancel();
    window.addEventListener('keydown', keyDown, true);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('keydown', keyDown, true);
      window.removeEventListener('blur', cancel);
    };
  }, []);
  const captureVectorPointer = (
    event: PointerEvent<HTMLDivElement>,
    onMove: (next: globalThis.PointerEvent) => void,
    onFinish: (next: globalThis.PointerEvent) => void,
    onCancel: () => void,
  ) => {
    const target = event.currentTarget;
    const pointerId = event.pointerId;
    const cleanup = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', finish);
      target.removeEventListener('pointercancel', cancel);
      target.removeEventListener('lostpointercapture', cancel);
      activeVectorCleanup.current = null;
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
    };
    const move = (next: globalThis.PointerEvent) => {
      if (next.pointerId === pointerId) onMove(next);
    };
    const finish = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      cleanup();
      onFinish(next);
    };
    const cancel = (next?: globalThis.PointerEvent) => {
      if (next && next.pointerId !== pointerId) return;
      cleanup();
      onCancel();
    };
    try {
      target.setPointerCapture(pointerId);
    } catch {
      onCancel();
      return;
    }
    activeVectorCleanup.current = cancel;
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', finish);
    target.addEventListener('pointercancel', cancel);
    target.addEventListener('lostpointercapture', cancel);
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || tool === 'hand' || spacePressed.current) return;
    const origin = point(event);
    if (!isVectorPoint(origin)) return;
    const target = event.currentTarget;
    if (tool === 'draw' || tool === 'brush' || tool === 'pen') {
      event.preventDefault();
      if (activeVectorCleanup.current) return;
      if (tool === 'pen') {
        const anchors = penDraft.current;
        const first = anchors[0];
        if (
          anchors.length >= 3 &&
          Math.hypot(origin.x - first.x, origin.y - first.y) * scale <= 9
        ) {
          finishPen(true);
          return;
        }
        if (anchors.length >= MAX_PEN_ANCHORS) {
          error('Finish this path before adding more points.');
          return;
        }
        updatePen([...anchors, origin]);
        setPenCursor(null);
        const dragHandle = (next: globalThis.PointerEvent) => {
          const position = point(next);
          if (!isVectorPoint(position)) return;
          const handle = { x: position.x - origin.x, y: position.y - origin.y };
          const anchor =
            Math.hypot(handle.x, handle.y) * scale < 3 ? origin : { ...origin, handle };
          updatePen([...anchors, anchor]);
        };
        captureVectorPointer(event, dragHandle, dragHandle, resetVectorDraft);
      } else {
        let points = [origin];
        const style = { ...ink };
        draftStyle.current = style;
        setDrawing(points);
        const sample = (next: globalThis.PointerEvent, minimumDistance = 0.75 / scale) => {
          const sampled = appendStrokePoint(points, point(next), minimumDistance);
          if (sampled !== points) {
            points = sampled;
            setDrawing(points);
          }
        };
        captureVectorPointer(
          event,
          sample,
          (next) => {
            sample(next, 0);
            setDrawing([]);
            if (points.length > 1) addVector(points, false, style, false);
          },
          () => setDrawing([]),
        );
      }
      return;
    }
    target.setPointerCapture(event.pointerId);
    const hit = [...evaluatedLayers].reverse().find((l) => {
      if (
        l.hidden ||
        l.locked ||
        l.kind === 'audio' ||
        time < l.start ||
        time >= l.start + l.duration
      )
        return false;
      return pointInQuad(origin, getElement3DQuad(l, time, animationState(l, time)));
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
    const originals = evaluatedLayers.filter((l) => ids.includes(l.id) && !l.locked);
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
      className={`canvas-surface board-surface ${tool === 'draw' || tool === 'brush' || tool === 'pen' ? 'draw-mode' : ''} ${tool === 'hand' || spaceHeld ? 'hand-mode' : ''} ${panning ? 'is-panning' : ''}`}
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
      style={{
        backgroundPosition: `${pan.x}px ${pan.y}px`,
        backgroundSize: `${100 * safeZoom}px ${100 * safeZoom}px, ${20 * safeZoom}px ${20 * safeZoom}px`,
      }}
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
        onPointerMove={(event) => {
          if (tool !== 'pen' || !penDraft.current.length || activeVectorCleanup.current) return;
          const position = point(event);
          if (isVectorPoint(position)) setPenCursor(position);
        }}
        onPointerLeave={() => setPenCursor(null)}
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
              !selectionHas3D &&
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
                    layers.forEach((layer) => change(layer.id, groupResizePatch(layer), false));
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
          visibleSelection
            .filter((layer) => !hasElement3D(layer))
            .map((l) => (
              <div
                className="selection-box"
                key={l.id}
                style={{
                  left: (l.x + animationState(l, time).x) * scale,
                  top: (l.y + animationState(l, time).y) * scale,
                  width: l.width * scale,
                  height: l.height * scale,
                  transform: `rotate(${l.rotation}deg) scale(${animationState(l, time).scale})`,
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
                        if (
                          !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
                        )
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
                          animationState(l, time).scale,
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
        {selectionHas3D && (
          <svg
            className="element-3d-selection"
            aria-hidden="true"
            viewBox={`0 0 ${project.width} ${project.height}`}
          >
            {visibleSelection.filter(hasElement3D).map((layer) => {
              const points = getElement3DQuad(layer, time, animationState(layer, time))
                .map((point) => `${point.x},${point.y}`)
                .join(' ');
              return (
                <g key={layer.id} data-element-3d-selection={layer.id}>
                  <polygon points={points} className="element-3d-outline-shadow" />
                  <polygon points={points} className="element-3d-outline" />
                </g>
              );
            })}
          </svg>
        )}
        {drawing.length > 1 && (
          <svg
            className="drawing-preview"
            aria-hidden="true"
            viewBox={`0 0 ${project.width} ${project.height}`}
          >
            <path
              d={vectorPathData(drawing)}
              fill="none"
              stroke={draftStyle.current.color}
              strokeWidth={draftStyle.current.width}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {penAnchors.length > 0 && (
          <svg
            className="drawing-preview pen-preview"
            aria-hidden="true"
            viewBox={`0 0 ${project.width} ${project.height}`}
          >
            <path
              d={vectorPathData(penAnchors)}
              fill="none"
              stroke={ink.color}
              strokeWidth={ink.width}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {penCursor && (
              <path
                d={vectorPathData([penAnchors[penAnchors.length - 1], penCursor])}
                fill="none"
                stroke={ink.color}
                strokeWidth={1 / scale}
                strokeDasharray={`${4 / scale} ${4 / scale}`}
                opacity="0.6"
              />
            )}
            {penAnchors.map((anchor, index) => (
              <g key={index}>
                {anchor.handle && (
                  <>
                    <line
                      x1={anchor.x - anchor.handle.x}
                      y1={anchor.y - anchor.handle.y}
                      x2={anchor.x + anchor.handle.x}
                      y2={anchor.y + anchor.handle.y}
                      stroke="#999999"
                      strokeWidth={1 / scale}
                    />
                    {[-1, 1].map((direction) => (
                      <circle
                        key={direction}
                        cx={anchor.x + anchor.handle!.x * direction}
                        cy={anchor.y + anchor.handle!.y * direction}
                        r={2.5 / scale}
                        fill="#f4f4f4"
                        stroke="#252525"
                        strokeWidth={1 / scale}
                      />
                    ))}
                  </>
                )}
                <rect
                  x={anchor.x - 3.5 / scale}
                  y={anchor.y - 3.5 / scale}
                  width={7 / scale}
                  height={7 / scale}
                  rx={index === 0 ? 3.5 / scale : 1 / scale}
                  fill={index === penAnchors.length - 1 ? '#252525' : '#f4f4f4'}
                  stroke={index === penAnchors.length - 1 ? '#f4f4f4' : '#252525'}
                  strokeWidth={1.5 / scale}
                />
              </g>
            ))}
          </svg>
        )}
      </div>
      {tool === 'pen' && (
        <div className="vector-tool-hint" role="group" aria-label="Pen path controls">
          <span>
            {penAnchors.length
              ? `${penAnchors.length} points · Drag for curves`
              : 'Click points · Drag for curves'}
          </span>
          {penAnchors.length > 0 && (
            <>
              <button
                type="button"
                disabled={penAnchors.length < 2}
                title="Finish an open path (Enter)"
                onClick={() => finishPen(false)}
              >
                Finish
              </button>
              <button
                type="button"
                disabled={penAnchors.length < 3}
                title="Close and fill the path, or click its first point"
                onClick={() => finishPen(true)}
              >
                Close path
              </button>
              <button type="button" title="Discard this path (Escape)" onClick={resetVectorDraft}>
                Cancel
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
