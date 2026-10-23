import {
  Eye,
  EyeOff,
  LockKeyhole,
  UnlockKeyhole,
  Video,
  Image,
  Type,
  Shapes,
  Music2,
  PenTool,
  Spline,
  ChevronDown,
  Volume2,
  MousePointer2,
} from '../icons';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import { LAYER_COLORS, type Layer, type Project } from '../core/types';
import { timecode } from '../core/timecode';
export { timecode } from '../core/timecode';
import TimelineMotionEditor from './TimelineMotionEditor';
import './Timeline.css';

const LABEL_WIDTH = 212;
export const kindIcons = {
  video: Video,
  audio: Music2,
  image: Image,
  text: Type,
  shape: Shapes,
  svg: Spline,
  drawing: PenTool,
};
function rulerTimeLabel(time: number) {
  const seconds = Math.floor(time);
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
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
  onExpand?: (keyframes?: boolean) => void;
  onCollapse?: () => void;
  resetScrollKey?: number;
  motionRequest?: { id: number; keyframes: boolean };
  onPreviewLayer: (layer: Layer) => void;
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
  onExpand,
  onCollapse,
  resetScrollKey = 0,
  motionRequest = { id: 0, keyframes: false },
  onPreviewLayer,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const rulerScroll = useRef<HTMLDivElement>(null);
  const visualScroll = useRef<HTMLDivElement>(null);
  const audioScroll = useRef<HTMLDivElement>(null);
  const horizontalScroll = useRef<HTMLDivElement>(null);
  const expandedTrack = useRef<HTMLDivElement>(null);
  const horizontalPosition = useRef(0);
  const [horizontalOffset, setHorizontalOffset] = useState(0);
  const syncHorizontal = useCallback((left: number) => {
    const master = horizontalScroll.current;
    if (!master) return;
    const position = Math.max(0, Math.min(master.scrollWidth - master.clientWidth, left));
    horizontalPosition.current = position;
    setHorizontalOffset(position);
    [rulerScroll, visualScroll, audioScroll, horizontalScroll].forEach((reference) => {
      if (reference.current && reference.current.scrollLeft !== position)
        reference.current.scrollLeft = position;
    });
  }, []);
  const activeGesture = useRef<(() => void) | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const previousMotionRequest = useRef(motionRequest.id);
  const [viewportWidth, setViewportWidth] = useState(1000);
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setViewportWidth(node.clientWidth));
    observer.observe(node);
    setViewportWidth(node.clientWidth);
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => activeGesture.current?.(), []);
  useEffect(() => {
    const nodes = [rulerScroll.current, visualScroll.current, audioScroll.current];
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;
      const delta = event.shiftKey ? event.deltaX || event.deltaY : event.deltaX;
      if (Math.abs(delta) < 0.01) return;
      event.preventDefault();
      const multiplier =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? (scroller.current?.clientWidth ?? 1000)
            : 1;
      syncHorizontal(horizontalPosition.current + delta * multiplier);
    };
    nodes.forEach((node) => node?.addEventListener('wheel', wheel, { passive: false }));
    return () => nodes.forEach((node) => node?.removeEventListener('wheel', wheel));
  }, [syncHorizontal]);
  useEffect(() => {
    if (expandedId && !project.layers.some((layer) => layer.id === expandedId)) setExpandedId(null);
  }, [expandedId, project.layers]);
  useEffect(() => {
    if (motionRequest.id === previousMotionRequest.current) return;
    previousMotionRequest.current = motionRequest.id;
    if (selected.length !== 1) return;
    const layer = project.layers.find((item) => item.id === selected[0]);
    if (!layer || layer.kind === 'audio') return;
    setExpandedId(layer.id);
    onExpand?.(
      motionRequest.keyframes ||
        Object.values(layer.keyframes ?? {}).some((track) => track?.length),
    );
  }, [motionRequest, selected, project.layers, onExpand]);
  useLayoutEffect(() => {
    if (!expandedId) return;
    const row = expandedTrack.current;
    const layer = project.layers.find((item) => item.id === expandedId);
    const viewport = layer?.kind === 'audio' ? audioScroll.current : visualScroll.current;
    if (!row || !viewport) return;
    const rowBounds = row.getBoundingClientRect();
    const viewportBounds = viewport.getBoundingClientRect();
    const headingHeight =
      viewport.querySelector('.timeline-section-heading')?.getBoundingClientRect().height ?? 0;
    const top = viewportBounds.top + headingHeight;
    const bottom = viewportBounds.bottom;
    // Scroll only this pane vertically, leaving its synchronized horizontal position intact.
    if (rowBounds.top < top || rowBounds.height > bottom - top)
      viewport.scrollTop += rowBounds.top - top;
    else if (rowBounds.bottom > bottom) viewport.scrollTop += rowBounds.bottom - bottom;
  }, [expandedId]);
  const pixels = Math.max(0.001, Math.min(140, Number.isFinite(zoom) ? zoom : 66));
  const width = Math.max(640, viewportWidth - LABEL_WIDTH, project.duration * pixels + 24);
  const minimumTickInterval = Math.max(1, 56 / pixels);
  const tickMagnitude = 10 ** Math.floor(Math.log10(minimumTickInterval));
  const tickInterval =
    tickMagnitude *
    ([1, 2, 5, 10].find((step) => step * tickMagnitude >= minimumTickInterval) ?? 10);
  // Only build tick labels for the visible time range, even in a long, zoomed-in project.
  const firstTick = Math.max(0, Math.floor(horizontalOffset / pixels / tickInterval) - 1);
  const lastTick = Math.min(
    Math.floor(project.duration / tickInterval),
    Math.ceil((horizontalOffset + viewportWidth - LABEL_WIDTH) / pixels / tickInterval) + 1,
  );
  useEffect(
    () => syncHorizontal(horizontalPosition.current),
    [width, viewportWidth, syncHorizontal],
  );
  useLayoutEffect(() => syncHorizontal(0), [resetScrollKey, syncHorizontal]);
  const startDrag = (
    event: PointerEvent<HTMLDivElement>,
    layer: Layer,
    action: 'move' | 'left' | 'right',
  ) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    const ids =
      action === 'move' && selected.includes(layer.id)
        ? selected
        : layer.groupId && action === 'move'
          ? project.layers.filter((l) => l.groupId === layer.groupId).map((l) => l.id)
          : [layer.id];
    if (action === 'move') select(ids);
    if (layer.locked) return;
    if (action !== 'move') select(ids);
    activeGesture.current?.();
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
            ...(layer.keyframes ? { keyframeOffset: (layer.keyframeOffset ?? 0) + safe } : {}),
          },
          false,
        );
      }
    };
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
      target.removeEventListener('lostpointercapture', end);
      if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
      activeGesture.current = null;
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
    target.addEventListener('lostpointercapture', end);
    activeGesture.current = end;
  };
  const startSeek = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    activeGesture.current?.();
    const target = event.currentTarget;
    target.focus({ preventScroll: true });
    const position = (clientX: number) => {
      const value = (clientX - target.getBoundingClientRect().left) / pixels;
      seek(Math.max(0, Math.min(project.duration, Math.round(value * project.fps) / project.fps)));
    };
    position(event.clientX);
    target.setPointerCapture(event.pointerId);
    const move = (next: globalThis.PointerEvent) => position(next.clientX);
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
      target.removeEventListener('lostpointercapture', end);
      if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
      activeGesture.current = null;
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
    target.addEventListener('lostpointercapture', end);
    activeGesture.current = end;
  };

  const renderTrack = (layer: Layer) => {
    const Icon = kindIcons[layer.kind];
    const active = selected.includes(layer.id);
    const expanded = expandedId === layer.id;
    const audio = layer.kind === 'audio';
    const animated =
      !audio &&
      (layer.animation !== 'none' ||
        Object.values(layer.keyframes ?? {}).some((track) => track?.length) ||
        ((layer.exitDuration ?? 0) > 0 && layer.exitAnimation !== 'none') ||
        (layer.loopAnimation && layer.loopAnimation !== 'none') ||
        (layer.transform3d?.enabled && layer.transform3d.motion !== 'none'));
    return (
      <div
        className={`timeline-track-group ${expanded ? 'is-expanded' : ''}`}
        key={layer.id}
        ref={expanded ? expandedTrack : undefined}
        style={{ '--track-color': LAYER_COLORS[layer.kind] } as CSSProperties}
      >
        <div className={`timeline-track ${active ? 'active' : ''} ${audio ? 'audio-track' : ''}`}>
          <div className="track-label" onClick={() => select([layer.id])} title={layer.name}>
            <button
              className="track-expand"
              aria-label={`Edit ${audio ? 'audio' : 'motion'} for ${layer.name}`}
              aria-expanded={expanded}
              aria-controls={`timeline-editor-${layer.id}`}
              title={audio ? 'Audio controls and fades' : 'Animation controls and timing'}
              onClick={(event) => {
                event.stopPropagation();
                select([layer.id]);
                if (!expanded)
                  onExpand?.(Object.values(layer.keyframes ?? {}).some((track) => track?.length));
                if (expanded) onCollapse?.();
                setExpandedId(expanded ? null : layer.id);
              }}
            >
              <ChevronDown size={12} />
            </button>
            <Icon size={13} className="track-kind" />
            <span>{layer.name}</span>
            <button
              className={`track-visibility ${audio && layer.muted ? 'is-muted' : ''}`}
              aria-label={
                audio
                  ? `${layer.muted ? 'Unmute' : 'Mute'} ${layer.name}`
                  : `${layer.hidden ? 'Show' : 'Hide'} ${layer.name}`
              }
              aria-pressed={audio ? Boolean(layer.muted) : undefined}
              disabled={audio && layer.locked}
              onClick={(event) => {
                event.stopPropagation();
                if (audio && layer.locked) return;
                change(layer.id, audio ? { muted: !layer.muted } : { hidden: !layer.hidden });
              }}
            >
              {audio ? (
                <Volume2 size={12} />
              ) : layer.hidden ? (
                <EyeOff size={12} />
              ) : (
                <Eye size={12} />
              )}
            </button>
            <button
              type="button"
              className={`track-lock ${layer.locked ? 'is-locked' : ''}`}
              aria-label={`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`}
              aria-pressed={Boolean(layer.locked)}
              title={`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`}
              onClick={(event) => {
                event.stopPropagation();
                change(layer.id, { locked: !layer.locked });
              }}
            >
              {layer.locked ? <LockKeyhole size={12} /> : <UnlockKeyhole size={12} />}
            </button>
          </div>
          <div className="track-lane" style={{ width }}>
            <div
              role="button"
              tabIndex={0}
              aria-label={`Timeline clip ${layer.name}`}
              aria-pressed={active}
              title={`${layer.name}${layer.locked ? ' · Locked' : ''}${audio && layer.muted ? ' · Muted' : ''}${layer.groupId ? ' · Grouped' : ''}${animated ? ' · Motion applied' : ''}`}
              className={`timeline-clip ${active ? 'selected' : ''} ${layer.hidden ? 'is-hidden' : ''} ${layer.locked ? 'is-locked' : ''} ${audio && layer.muted ? 'is-muted' : ''}`}
              style={
                {
                  left: layer.start * pixels,
                  width: Math.max(7, layer.duration * pixels),
                  '--clip-color': LAYER_COLORS[layer.kind],
                } as CSSProperties
              }
              onPointerDown={(event) => startDrag(event, layer, 'move')}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  select([layer.id]);
                }
              }}
            >
              <div
                className="trim-handle left"
                title="Trim start"
                onPointerDown={(event) => startDrag(event, layer, 'left')}
              />
              {layer.kind === 'image' && layer.src ? (
                <img
                  className="clip-thumbnail"
                  src={layer.src}
                  alt=""
                  loading="lazy"
                  draggable={false}
                />
              ) : (
                <Icon size={12} aria-hidden="true" />
              )}
              <span className="clip-name">{layer.name}</span>
              {animated && layer.duration * pixels > 180 && (
                <span className="clip-status clip-motion-status">Motion</span>
              )}
              {audio && layer.muted && <span className="clip-status">Muted</span>}
              <div
                className="trim-handle right"
                title="Trim end"
                onPointerDown={(event) => startDrag(event, layer, 'right')}
              />
            </div>
          </div>
        </div>
        {expanded && (
          <TimelineMotionEditor
            key={layer.id}
            layer={layer}
            fps={project.fps}
            pixels={pixels}
            laneWidth={width}
            time={time}
            compositionDuration={project.duration}
            seek={seek}
            keyframesRequest={
              motionRequest.keyframes && selected.includes(layer.id) ? motionRequest.id : 0
            }
            onKeyframesOpen={() => onExpand?.(true)}
            onPresetsOpen={() => onExpand?.(false)}
            change={change}
            checkpoint={checkpoint}
            onClose={() => {
              setExpandedId(null);
              onCollapse?.();
            }}
            onPreview={onPreviewLayer}
          />
        )}
      </div>
    );
  };
  const visualLayers = [...project.layers].reverse().filter((layer) => layer.kind !== 'audio');
  const audioLayers = [...project.layers].reverse().filter((layer) => layer.kind === 'audio');
  const audioExpanded = audioLayers.some((layer) => layer.id === expandedId);
  const contentWidth = width + LABEL_WIDTH;
  const playhead = <div className="playhead" style={{ left: LABEL_WIDTH + time * pixels }} />;
  return (
    <div
      ref={scroller}
      className={`timeline-scroller timeline-simple ${audioExpanded ? 'audio-editor-open' : ''}`}
      aria-label="Editing timeline"
      style={
        {
          '--label-width': `${LABEL_WIDTH}px`,
          '--timeline-viewport-width': `${viewportWidth}px`,
          '--grid-step': `${tickInterval * pixels}px`,
          '--grid-width': `${project.duration * pixels}px`,
          '--audio-band-height': `${Math.min(2, audioLayers.length) * 32 + 28}px`,
        } as CSSProperties
      }
    >
      <div
        className="timeline-ruler-viewport"
        ref={rulerScroll}
        onScroll={(event) => syncHorizontal(event.currentTarget.scrollLeft)}
      >
        <div className="timeline-ruler" style={{ width: contentWidth }}>
          <div className="track-heading">
            <span>Layers</span>
            <small>{project.layers.length}</small>
            <button
              type="button"
              aria-label="Reveal playhead"
              title="Bring the current time into view"
              onClick={() =>
                syncHorizontal(time * pixels - Math.max(0, viewportWidth - LABEL_WIDTH) / 2)
              }
            >
              <MousePointer2 size={13} />
              <span>Locate</span>
            </button>
          </div>
          <div
            className="ruler-scale"
            style={{ width }}
            role="slider"
            tabIndex={0}
            aria-label="Timeline position"
            title="Drag to seek · Arrow keys: one frame · Shift + arrow: one second"
            aria-valuemin={0}
            aria-valuemax={Math.max(0, project.duration - 1 / project.fps)}
            aria-valuenow={time}
            aria-valuetext={timecode(time, project.fps)}
            onPointerDown={startSeek}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              event.stopPropagation();
              const step = event.shiftKey ? 1 : 1 / project.fps;
              seek(
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? project.duration
                    : time + (event.key === 'ArrowRight' ? step : -step),
              );
            }}
          >
            <div
              className="ruler-minor-ticks"
              style={
                {
                  width: project.duration * pixels,
                  '--minor-step': `${(tickInterval * pixels) / 10}px`,
                } as CSSProperties
              }
            />
            {Array.from({ length: Math.max(0, lastTick - firstTick + 1) }, (_, offset) => (
              <div
                key={firstTick + offset}
                className="ruler-tick"
                style={{ left: (firstTick + offset) * tickInterval * pixels }}
              >
                <span>{rulerTimeLabel((firstTick + offset) * tickInterval)}</span>
              </div>
            ))}
            <div className="ruler-playhead" aria-hidden="true" style={{ left: time * pixels }} />
          </div>
        </div>
      </div>
      <div
        className="timeline-visual-scroll"
        ref={visualScroll}
        onScroll={(event) => syncHorizontal(event.currentTarget.scrollLeft)}
      >
        <div className="timeline-content" style={{ width: contentWidth }}>
          <div className="timeline-track-section" role="group" aria-label="Visual tracks">
            <div className="timeline-section-heading" role="heading" aria-level={3}>
              <Video size={12} />
              <span>Visuals</span>
              <small>{visualLayers.length}</small>
              <span className="timeline-stack-hint">Front at top</span>
            </div>
            {visualLayers.map((layer) => renderTrack(layer))}
            {visualLayers.length === 0 && (
              <div className="timeline-section-empty">Add a video, image, or element.</div>
            )}
          </div>
          {playhead}
        </div>
      </div>
      <div
        className={`timeline-audio-scroll ${audioLayers.length === 0 ? 'is-empty' : ''}`}
        ref={audioScroll}
        onScroll={(event) => syncHorizontal(event.currentTarget.scrollLeft)}
      >
        <div className="timeline-content" style={{ width: contentWidth }}>
          <div
            className="timeline-track-section timeline-audio-section"
            role="group"
            aria-label="Audio tracks"
          >
            <div className="timeline-section-heading" role="heading" aria-level={3}>
              <Music2 size={12} />
              <span>Audio</span>
              <small>{audioLayers.length}</small>
              {audioLayers.length === 0 && (
                <span className="timeline-empty-audio-hint">
                  Your audio tracks will appear here.
                </span>
              )}
            </div>
            {audioLayers.map((layer) => renderTrack(layer))}
          </div>
          {playhead}
        </div>
      </div>
      <div
        className="timeline-horizontal-scroll"
        ref={horizontalScroll}
        role="region"
        aria-label="Timeline horizontal scroll"
        tabIndex={0}
        onScroll={(event) => syncHorizontal(event.currentTarget.scrollLeft)}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          syncHorizontal(
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? contentWidth
                : horizontalPosition.current + (event.key === 'ArrowRight' ? pixels : -pixels),
          );
        }}
      >
        <div style={{ width: contentWidth }} />
      </div>
    </div>
  );
}
