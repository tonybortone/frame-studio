import {
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { getAudioTiming, getMotionTiming, easeProgress } from '../core/motion';
import type { Animation, AnimationEasing, Layer } from '../core/types';
import { LockKeyhole } from '../icons';
import './TimelineMotionEditor.css';

interface Props {
  layer: Layer;
  fps: number;
  pixels: number;
  laneWidth: number;
  change: (id: string, patch: Partial<Layer>, record?: boolean) => void;
  checkpoint: () => void;
}
type SegmentKind = 'entrance' | 'exit' | 'fade-in' | 'fade-out';
type SegmentAction = 'move' | 'start' | 'end';
const clamp = (value: number, maximum: number) =>
  Math.max(0, Math.min(Math.max(0, maximum), value));
const seconds = (value: number) => `${value.toFixed(2)}s`;

function NumberControl({
  label,
  name,
  value,
  maximum,
  unit = 's',
  disabled,
  onChange,
}: {
  label: string;
  name: string;
  value: number;
  maximum: number;
  unit?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="timeline-number-control">
      <span>{label}</span>
      <div>
        <input
          type="number"
          aria-label={name}
          min={0}
          max={maximum}
          step={unit === '%' ? 1 : 0.1}
          value={Number(value.toFixed(3))}
          disabled={disabled}
          onChange={(event) => {
            const next = event.currentTarget.valueAsNumber;
            if (Number.isFinite(next)) onChange(clamp(next, maximum));
          }}
        />
        <small>{unit}</small>
      </div>
    </label>
  );
}

/** These strips edit the same clip-relative envelopes used by preview and export. */
export default function TimelineMotionEditor({
  layer,
  fps,
  pixels,
  laneWidth,
  change,
  checkpoint,
}: Props) {
  const gesture = useRef<(() => void) | null>(null);
  useEffect(() => () => gesture.current?.(), []);
  const audio = layer.kind === 'audio';
  const timing = getMotionTiming(layer);
  const fades = getAudioTiming(layer);
  const maximum = Math.min(3600, layer.duration);
  const easing = layer.animationEasing ?? 'ease-out';
  const edit = (patch: Partial<Layer>) => {
    if (!layer.locked) change(layer.id, patch);
  };

  const segmentPatch = (
    kind: SegmentKind,
    action: SegmentAction,
    delta: number,
  ): Partial<Layer> => {
    if (kind === 'fade-in') return { audioFadeIn: clamp(fades.fadeIn + delta, maximum) };
    if (kind === 'fade-out') return { audioFadeOut: clamp(fades.fadeOut - delta, maximum) };
    if (kind === 'exit') return { exitDuration: clamp(timing.exitDuration - delta, maximum) };
    if (action === 'move')
      return {
        animationDelay: clamp(
          timing.delay + delta,
          Math.min(3600, layer.duration - timing.duration),
        ),
        animationDuration: timing.duration,
      };
    if (action === 'end')
      return {
        animationDuration: clamp(
          timing.duration + delta,
          Math.min(3600, layer.duration - timing.delay),
        ),
      };
    const end = timing.delay + timing.duration;
    const delay = Math.max(end - 3600, clamp(timing.delay + delta, Math.min(3600, end)));
    return { animationDelay: delay, animationDuration: end - delay };
  };

  const startSegmentDrag = (
    event: PointerEvent<HTMLButtonElement>,
    kind: SegmentKind,
    action: SegmentAction,
  ) => {
    if (event.button !== 0 || layer.locked) return;
    event.preventDefault();
    event.stopPropagation();
    gesture.current?.();
    const target = event.currentTarget;
    const initialX = event.clientX;
    const initialPatch = segmentPatch(kind, action, 0);
    let previousPatch = initialPatch;
    let recorded = false;
    target.setPointerCapture(event.pointerId);
    const move = (next: globalThis.PointerEvent) => {
      const step = next.shiftKey ? 1 / fps : 0.1;
      const delta = Math.round((next.clientX - initialX) / pixels / step) * step;
      const patch = segmentPatch(kind, action, delta);
      if (
        Object.keys(patch).every(
          (key) => patch[key as keyof Layer] === previousPatch[key as keyof Layer],
        )
      )
        return;
      if (!recorded) {
        checkpoint();
        recorded = true;
      }
      previousPatch = patch;
      change(layer.id, patch, false);
    };
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
      target.removeEventListener('lostpointercapture', end);
      if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
      gesture.current = null;
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
    target.addEventListener('lostpointercapture', end);
    gesture.current = end;
  };

  const keySegment = (
    event: KeyboardEvent<HTMLButtonElement>,
    kind: SegmentKind,
    action: SegmentAction,
  ) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || layer.locked) return;
    event.preventDefault();
    event.stopPropagation();
    const delta = (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 0.1 : 1 / fps);
    edit(segmentPatch(kind, action, delta));
  };

  const renderSegment = (
    kind: SegmentKind,
    label: string,
    start: number,
    duration: number,
    active: boolean,
  ) => {
    const entrance = kind === 'entrance';
    const outgoing = kind === 'exit' || kind === 'fade-out';
    const action: SegmentAction = entrance ? 'move' : outgoing ? 'start' : 'end';
    const curve = Array.from({ length: 21 }, (_, index) => {
      const progress = index / 20;
      const value = entrance || kind === 'exit' ? easeProgress(progress, easing) : progress;
      return `${index === 0 ? 'M' : 'L'}${progress * 100},${outgoing ? 2 + value * 14 : 16 - value * 14}`;
    }).join(' ');
    const add = () => {
      const duration = Math.min(0.6, maximum);
      edit(
        kind === 'entrance'
          ? { animation: 'fade', animationDelay: 0, animationDuration: duration }
          : kind === 'exit'
            ? { exitDuration: duration }
            : kind === 'fade-in'
              ? { audioFadeIn: duration }
              : { audioFadeOut: duration },
      );
    };
    return (
      <div className="timeline-effect-row" key={kind}>
        <div className="timeline-effect-label">
          <span>{label}</span>
          <small>{active ? seconds(duration) : '—'}</small>
        </div>
        <div className="track-lane timeline-effect-lane" style={{ width: laneWidth }}>
          <div
            className="timeline-effect-range"
            style={{ left: layer.start * pixels, width: layer.duration * pixels }}
          />
          {active ? (
            <div
              className={`timeline-effect-segment ${outgoing ? 'is-outgoing' : ''}`}
              style={
                { left: start * pixels, width: Math.max(12, duration * pixels) } as CSSProperties
              }
            >
              <svg viewBox="0 0 100 18" preserveAspectRatio="none" aria-hidden="true">
                <path d={curve} />
              </svg>
              <button
                type="button"
                className="timeline-effect-body"
                disabled={layer.locked}
                aria-label={`${entrance ? 'Move' : 'Resize'} ${label.toLowerCase()} for ${layer.name}`}
                title={`${label}: ${seconds(duration)}${entrance ? ' · drag to change delay' : ' · drag to resize'}. Hold Shift for frame steps.`}
                onPointerDown={(event) => startSegmentDrag(event, kind, action)}
                onKeyDown={(event) => keySegment(event, kind, action)}
              >
                {duration === 0 ? 'Instant' : label}
              </button>
              {(entrance || outgoing) && (
                <button
                  type="button"
                  className="timeline-effect-handle at-start"
                  disabled={layer.locked}
                  aria-label={`Resize ${label.toLowerCase()} start for ${layer.name}`}
                  title={`Adjust ${label.toLowerCase()} start`}
                  onPointerDown={(event) => startSegmentDrag(event, kind, 'start')}
                  onKeyDown={(event) => keySegment(event, kind, 'start')}
                />
              )}
              {(entrance || kind === 'fade-in') && (
                <button
                  type="button"
                  className="timeline-effect-handle at-end"
                  disabled={layer.locked}
                  aria-label={`Resize ${label.toLowerCase()} end for ${layer.name}`}
                  title={`Adjust ${label.toLowerCase()} duration`}
                  onPointerDown={(event) => startSegmentDrag(event, kind, 'end')}
                  onKeyDown={(event) => keySegment(event, kind, 'end')}
                />
              )}
            </div>
          ) : (
            <button
              type="button"
              className="timeline-add-effect"
              disabled={layer.locked}
              style={{
                left: outgoing
                  ? Math.max(layer.start * pixels, (layer.start + layer.duration) * pixels - 100)
                  : layer.start * pixels,
              }}
              aria-label={`Add ${label.toLowerCase()} for ${layer.name}`}
              onClick={add}
            >
              + {label}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className="timeline-inline-editor"
      id={`timeline-editor-${layer.id}`}
      role="group"
      aria-label={`${audio ? 'Audio' : 'Motion'} editor for ${layer.name}`}
    >
      {audio ? (
        <>
          {renderSegment('fade-in', 'Fade in', layer.start, fades.fadeIn, fades.fadeIn > 0)}
          {renderSegment(
            'fade-out',
            'Fade out',
            layer.start + layer.duration - fades.fadeOut,
            fades.fadeOut,
            fades.fadeOut > 0,
          )}
        </>
      ) : (
        <>
          {renderSegment(
            'entrance',
            'Entrance',
            layer.start + timing.delay,
            timing.duration,
            layer.animation !== 'none',
          )}
          {renderSegment(
            'exit',
            'Exit fade',
            layer.start + layer.duration - timing.exitDuration,
            timing.exitDuration,
            timing.exitDuration > 0,
          )}
        </>
      )}
      <div className="timeline-inline-controls">
        <span className="timeline-editor-caption">
          {layer.locked ? (
            <>
              <LockKeyhole size={11} />
              Locked
            </>
          ) : audio ? (
            'Audio controls'
          ) : (
            'Motion controls'
          )}
        </span>
        {audio ? (
          <>
            <NumberControl
              label="Volume"
              name={`Audio volume for ${layer.name}`}
              value={(layer.volume ?? 1) * 100}
              maximum={100}
              unit="%"
              disabled={layer.locked}
              onChange={(value) => edit({ volume: value / 100 })}
            />
            <NumberControl
              label="Fade in"
              name={`Audio fade in for ${layer.name}`}
              value={fades.fadeIn}
              maximum={maximum}
              disabled={layer.locked}
              onChange={(value) => edit({ audioFadeIn: value })}
            />
            <NumberControl
              label="Fade out"
              name={`Audio fade out for ${layer.name}`}
              value={fades.fadeOut}
              maximum={maximum}
              disabled={layer.locked}
              onChange={(value) => edit({ audioFadeOut: value })}
            />
            <button
              type="button"
              className={`timeline-mute-control ${layer.muted ? 'is-muted' : ''}`}
              aria-label={`Mute audio for ${layer.name}`}
              aria-pressed={Boolean(layer.muted)}
              disabled={layer.locked}
              onClick={() => edit({ muted: !layer.muted })}
            >
              {layer.muted ? 'Muted' : 'Mute'}
            </button>
          </>
        ) : (
          <>
            <label className="timeline-select-control">
              <span>Entrance</span>
              <select
                aria-label={`Motion preset for ${layer.name}`}
                value={layer.animation}
                disabled={layer.locked}
                onChange={(event) => edit({ animation: event.currentTarget.value as Animation })}
              >
                <option value="none">None</option>
                <option value="fade">Fade</option>
                <option value="rise">Rise</option>
                <option value="pop">Pop</option>
                <option value="slide">Slide</option>
              </select>
            </label>
            <NumberControl
              label="Delay"
              name={`Animation delay for ${layer.name}`}
              value={timing.delay}
              maximum={maximum}
              disabled={layer.locked || layer.animation === 'none'}
              onChange={(value) => edit({ animationDelay: value })}
            />
            <NumberControl
              label="Duration"
              name={`Animation duration for ${layer.name}`}
              value={timing.duration}
              maximum={Math.min(3600, layer.duration - timing.delay)}
              disabled={layer.locked || layer.animation === 'none'}
              onChange={(value) => edit({ animationDuration: value })}
            />
            <label className="timeline-select-control">
              <span>Easing</span>
              <select
                aria-label={`Animation easing for ${layer.name}`}
                value={easing}
                disabled={layer.locked || (layer.animation === 'none' && timing.exitDuration <= 0)}
                onChange={(event) =>
                  edit({ animationEasing: event.currentTarget.value as AnimationEasing })
                }
              >
                <option value="linear">Linear</option>
                <option value="ease-in">Ease in</option>
                <option value="ease-out">Ease out</option>
                <option value="ease-in-out">Ease in / out</option>
              </select>
            </label>
            <NumberControl
              label="Exit fade"
              name={`Exit fade for ${layer.name}`}
              value={timing.exitDuration}
              maximum={maximum}
              disabled={layer.locked}
              onChange={(value) => edit({ exitDuration: value })}
            />
          </>
        )}
      </div>
    </div>
  );
}
