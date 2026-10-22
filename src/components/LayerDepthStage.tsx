import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { Layer, Project } from '../core/types';
import { LAYER_COLORS } from '../core/types';
import { reorderVisualLayers } from '../core/layerOrder';
import { animationState, isLayerActive, MediaCache, renderFrame } from '../engine/renderer';
import './LayerDepthStage.css';

interface Props {
  project: Project;
  media: MediaCache;
  time: number;
  selected: string[];
  select: (ids: string[]) => void;
  reorder: (direction: number) => void;
  error: (message: string) => void;
}
type View = 'front' | 'back' | 'top' | 'perspective' | 'custom';
const PRESETS = {
  front: { pitch: 0, yaw: 0 },
  back: { pitch: 0, yaw: 180 },
  top: { pitch: 90, yaw: 0 },
  perspective: { pitch: 48, yaw: -28 },
} as const;
const MAX_PLANES = 64;
const PIXEL_BUDGET = 6 * 1024 * 1024;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const wrapYaw = (value: number) => ((((value + 180) % 360) + 360) % 360) - 180;

export default function LayerDepthStage({
  project,
  media,
  time,
  selected,
  select,
  reorder,
  error,
}: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const canvases = useRef(new Map<string, HTMLCanvasElement>());
  const cleanupGesture = useRef<(() => void) | null>(null);
  const [camera, setCamera] = useState<{ pitch: number; yaw: number }>({ ...PRESETS.perspective });
  const [view, setView] = useState<View>('perspective');
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [spacing, setSpacing] = useState(65);
  const [size, setSize] = useState({ width: 600, height: 400 });
  const [revision, setRevision] = useState(0);
  const [dragging, setDragging] = useState(false);
  const visuals = useMemo(
    () => project.layers.filter((layer) => layer.kind !== 'audio'),
    [project.layers],
  );
  const active = useMemo(
    () => visuals.filter((layer) => isLayerActive(layer, time)),
    [visuals, time],
  );
  const rank = useMemo(
    () => new Map(visuals.map((layer, index) => [layer.id, index + 1])),
    [visuals],
  );
  const selectedIndex = active.findIndex((layer) => selected.includes(layer.id));
  const planeStart =
    active.length > MAX_PLANES
      ? clamp(
          (selectedIndex >= 0 ? selectedIndex : active.length - 1) - Math.floor(MAX_PLANES / 2),
          0,
          active.length - MAX_PLANES,
        )
      : 0;
  const planes = useMemo(
    () => active.slice(planeStart, planeStart + MAX_PLANES),
    [active, planeStart],
  );
  const textureScale = Math.min(
    1,
    768 / Math.max(project.width, project.height),
    Math.sqrt(PIXEL_BUDGET / Math.max(1, planes.length * project.width * project.height)),
  );
  const textureWidth = Math.max(1, Math.floor(project.width * textureScale));
  const textureHeight = Math.max(1, Math.floor(project.height * textureScale));
  const fit = Math.max(
    0.001,
    Math.min(
      Math.max(1, size.width - 28) / project.width,
      Math.max(1, size.height - 40) / project.height,
    ) * 0.7,
  );
  const frameWidth = project.width * fit;
  const frameHeight = project.height * fit;
  const depth =
    planes.length > 1 ? (spacing / 100) * Math.min(size.width * 0.48, size.height * 0.85, 360) : 0;
  const backward = reorderVisualLayers(project.layers, selected, -1) !== project.layers;
  const forward = reorderVisualLayers(project.layers, selected, 1) !== project.layers;
  const selectedLayers = visuals.filter((layer) => selected.includes(layer.id));
  const orientation =
    camera.pitch >= 80
      ? 'Top'
      : camera.pitch <= -80
        ? 'Bottom'
        : Math.cos((camera.yaw * Math.PI) / 180) < 0
          ? 'Back'
          : 'Front';

  useEffect(() => {
    cleanupGesture.current?.();
    setCamera({ ...PRESETS.perspective });
    setView('perspective');
    setPan({ x: 0, y: 0 });
    setZoom(1);
    setSpacing(65);
  }, [project.id]);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const measure = () => setSize({ width: node.clientWidth, height: node.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let stopped = false;
    void media
      .prepare(project.layers)
      .then(() => {
        if (!stopped) setRevision((value) => value + 1);
      })
      .catch((reason) => {
        if (!stopped)
          error(reason instanceof Error ? reason.message : 'Could not load layer media.');
      });
    return () => {
      stopped = true;
    };
  }, [project.layers, media, error]);
  useEffect(() => {
    let reported = false;
    const draw = () => {
      try {
        for (const layer of planes) {
          const canvas = canvases.current.get(layer.id);
          const context = canvas?.getContext('2d');
          if (!context) continue;
          renderFrame(
            context,
            { ...project, background: 'transparent', layers: [layer] },
            time,
            media,
          );
        }
      } catch (reason) {
        if (!reported)
          error(reason instanceof Error ? reason.message : 'Could not draw the layer preview.');
        reported = true;
      }
    };
    draw();
    return media.subscribe(draw);
  }, [project, planes, time, media, revision, textureWidth, textureHeight, error]);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta =
        event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1);
      setZoom((value) => clamp(value * Math.exp(-delta * 0.002), 0.35, 2.5));
    };
    node.addEventListener('wheel', wheel, { passive: false });
    const cancel = () => cleanupGesture.current?.();
    window.addEventListener('blur', cancel);
    return () => {
      node.removeEventListener('wheel', wheel);
      window.removeEventListener('blur', cancel);
      cleanupGesture.current?.();
    };
  }, []);
  const choose = useCallback(
    (layer: Layer, additive = false) => {
      select(
        additive
          ? selected.includes(layer.id)
            ? selected.filter((id) => id !== layer.id)
            : [...selected, layer.id]
          : [layer.id],
      );
    },
    [select, selected],
  );
  const preset = (next: Exclude<View, 'custom'>) => {
    setCamera({ ...PRESETS[next] });
    setPan({ x: 0, y: 0 });
    setView(next);
  };
  const reset = () => {
    preset('perspective');
    setZoom(1);
    setSpacing(65);
  };
  const startOrbit = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    cleanupGesture.current?.();
    const target = event.currentTarget;
    target.focus({ preventScroll: true });
    const origin = { x: event.clientX, y: event.clientY };
    const initialCamera = camera;
    const initialPan = pan;
    const panning = event.shiftKey || event.button === 1;
    const hit =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-inspect-layer]')?.dataset.inspectLayer
        : undefined;
    let moved = false;
    target.setPointerCapture(event.pointerId);
    const move = (next: globalThis.PointerEvent) => {
      const dx = next.clientX - origin.x,
        dy = next.clientY - origin.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      setDragging(true);
      if (panning) setPan({ x: initialPan.x + dx, y: initialPan.y + dy });
      else {
        setCamera({
          pitch: clamp(initialCamera.pitch - dy * 0.4, -90, 90),
          yaw: wrapYaw(initialCamera.yaw + dx * 0.4),
        });
        setView('custom');
      }
    };
    const finish = (next?: globalThis.PointerEvent) => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', finish);
      target.removeEventListener('pointercancel', cancel);
      target.removeEventListener('lostpointercapture', cancel);
      if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
      cleanupGesture.current = null;
      setDragging(false);
      if (!moved && !panning && next?.type === 'pointerup' && hit) {
        const layer = active.find((item) => item.id === hit);
        if (layer) choose(layer, next.metaKey || next.ctrlKey);
      }
    };
    const cancel = () => finish();
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', finish);
    target.addEventListener('pointercancel', cancel);
    target.addEventListener('lostpointercapture', cancel);
    cleanupGesture.current = cancel;
  };

  return (
    <div className="layer-depth-stage">
      <div className="depth-topline">
        <div>
          <strong>Layer depth preview</strong>
          <span>See how your layers stack.</span>
        </div>
        <button type="button" onClick={reset} aria-label="Reset 3D view">
          Reset view
        </button>
      </div>
      <div
        ref={viewport}
        role="region"
        aria-label="3D layer view"
        tabIndex={0}
        data-view={view}
        className={`depth-viewport ${dragging ? 'is-dragging' : ''}`}
        onPointerDown={startOrbit}
        onKeyDown={(event) => {
          if (
            event.target !== event.currentTarget ||
            !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          const step = event.shiftKey ? 15 : 5;
          setCamera((value) => ({
            pitch: clamp(
              value.pitch +
                (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0),
              -90,
              90,
            ),
            yaw: wrapYaw(
              value.yaw +
                (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
            ),
          }));
          setView('custom');
        }}
      >
        <div className="depth-orientation">
          <i />
          {orientation}
          <span>
            {Math.round(camera.yaw)}° / {Math.round(camera.pitch)}°
          </span>
        </div>
        <div
          className="depth-scene"
          style={{
            width: frameWidth,
            height: frameHeight,
            left: `calc(50% + ${pan.x}px)`,
            top: `calc(50% + ${pan.y}px)`,
            transform: `translate(-50%, -50%) rotateX(${camera.pitch}deg) rotateY(${camera.yaw}deg) scale(${zoom})`,
          }}
        >
          <div
            className="depth-background-plane"
            style={{ transform: `translateZ(${-depth / 2 - 18}px)` }}
          >
            <div style={{ background: project.background }} />
            <span>
              {project.width} × {project.height}
            </span>
          </div>
          {planes.map((layer, index) => {
            const motion = animationState(layer, time);
            const chosen = selected.includes(layer.id);
            return (
              <div
                key={layer.id}
                data-depth-plane
                data-layer-id={layer.id}
                data-depth-rank={rank.get(layer.id)}
                className={`depth-plane ${chosen ? 'is-selected' : ''}`}
                style={{
                  transform: `translateZ(${planes.length > 1 ? (index / (planes.length - 1)) * depth - depth / 2 : 0}px)`,
                }}
              >
                <canvas
                  ref={(node) => {
                    if (node) canvases.current.set(layer.id, node);
                    else canvases.current.delete(layer.id);
                  }}
                  width={textureWidth}
                  height={textureHeight}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  className="depth-layer-hit"
                  data-inspect-layer={layer.id}
                  aria-label={`Inspect ${layer.name}`}
                  aria-pressed={chosen}
                  style={{
                    left: (layer.x + motion.x) * fit,
                    top: (layer.y + motion.y) * fit,
                    width: layer.width * fit,
                    height: layer.height * fit,
                    transform: `rotate(${layer.rotation}deg) scale(${motion.scale})`,
                  }}
                  onClick={(event) => {
                    if (event.detail === 0) choose(layer, event.metaKey || event.ctrlKey);
                  }}
                >
                  <span className="depth-plane-label">
                    <b>{rank.get(layer.id)}</b>
                    {layer.name}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
        {!active.length && (
          <div className="depth-empty">
            No visible layers at this time.<span>Move the playhead or add an element.</span>
          </div>
        )}
        <div className="depth-gesture-hint">
          Drag to orbit <span>·</span> Shift-drag to pan <span>·</span> Scroll to zoom
        </div>
      </div>
      <aside className="depth-layer-panel" aria-label="3D layer stack">
        <div className="depth-stack-heading">
          <strong>Front to back</strong>
          <span>{active.length}</span>
        </div>
        <div className="depth-layer-list">
          {[...active].reverse().map((layer) => (
            <button
              type="button"
              key={layer.id}
              aria-label={`Select 3D layer ${layer.name}`}
              aria-pressed={selected.includes(layer.id)}
              className={selected.includes(layer.id) ? 'is-selected' : ''}
              onClick={(event) => choose(layer, event.metaKey || event.ctrlKey || event.shiftKey)}
            >
              <span className="depth-rank">{rank.get(layer.id)}</span>
              <i style={{ background: LAYER_COLORS[layer.kind] }} />
              <span>{layer.name}</span>
              {layer.locked && <small>Locked</small>}
            </button>
          ))}
        </div>
        <div className="depth-order-controls">
          <span>
            {selectedLayers.length === 1
              ? selectedLayers[0].name
              : selectedLayers.length
                ? `${selectedLayers.length} selected`
                : 'Select a layer to arrange'}
          </span>
          <div>
            <button
              type="button"
              aria-label="Move layer backward"
              disabled={!backward}
              onClick={() => reorder(-1)}
            >
              ← Back
            </button>
            <button
              type="button"
              aria-label="Move layer forward"
              disabled={!forward}
              onClick={() => reorder(1)}
            >
              Front →
            </button>
          </div>
        </div>
      </aside>
      <div className="depth-bottom-controls">
        <div className="depth-presets">
          {(['front', 'back', 'top', 'perspective'] as const).map((item) => (
            <button
              type="button"
              key={item}
              aria-label={`${item[0].toUpperCase() + item.slice(1)} view`}
              aria-pressed={view === item}
              onClick={() => preset(item)}
            >
              {item === 'perspective' ? 'Angle' : item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
        <label>
          Spacing
          <input
            type="range"
            aria-label="Layer spacing"
            min={0}
            max={100}
            value={spacing}
            onChange={(event) => setSpacing(Number(event.target.value))}
          />
          <span className="depth-control-value" aria-hidden="true">
            {spacing}%
          </span>
        </label>
        <label>
          Zoom
          <input
            type="range"
            aria-label="3D zoom"
            min={35}
            max={250}
            value={Math.round(zoom * 100)}
            onChange={(event) => setZoom(Number(event.target.value) / 100)}
          />
          <span className="depth-control-value" aria-hidden="true">
            {Math.round(zoom * 100)}%
          </span>
        </label>
      </div>
      <p className="depth-export-note">
        View controls do not change your video. Exports use the 2D composition.
        {active.length > MAX_PLANES && (
          <span>
            Showing {planes.length} of {active.length} planes. Select any layer to inspect it.
          </span>
        )}
      </p>
    </div>
  );
}
