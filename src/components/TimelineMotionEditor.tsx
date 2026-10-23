import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import {
  getAudioTiming,
  getMotionTiming,
  getLoopTiming,
  easeProgress,
  resetMotionPatch,
} from '../core/motion';
import type { Layer, Project } from '../core/types';
import { LockKeyhole, Play, RotateCw, X } from '../icons';
import MotionPresetPicker from './MotionPresetPicker';
import './TimelineMotionEditor.css';
import TimelineKeyframeEditor from './TimelineKeyframeEditor';

interface Props {
  project: Project;
  layer: Layer;
  fps: number;
  pixels: number;
  laneWidth: number;
  time: number;
  compositionDuration: number;
  seek: (time: number, reveal?: boolean) => void;
  onKeyframesOpen: () => void;
  onPresetsOpen: () => void;
  initialKeyframes?: boolean;
  modeRequest?: { id: number; keyframes: boolean };
  change: (id: string, patch: Partial<Layer>, record?: boolean) => void;
  checkpoint: () => void;
  onClose: () => void;
  onPreview: (layer: Layer) => void;
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
  minimum = 0,
  unit = 's',
  disabled,
  onChange,
}: {
  label: string;
  name: string;
  value: number;
  maximum: number;
  minimum?: number;
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
          min={minimum}
          max={maximum}
          step={unit === '%' || unit === 'px' ? 1 : 0.1}
          value={Number(value.toFixed(3))}
          disabled={disabled}
          onChange={(event) => {
            const next = event.currentTarget.valueAsNumber;
            if (Number.isFinite(next)) onChange(Math.max(minimum, clamp(next, maximum)));
          }}
        />
        <small>{unit}</small>
      </div>
    </label>
  );
}

/** These strips edit the same clip-relative envelopes used by preview and export. */
export default function TimelineMotionEditor({
  project,
  layer,
  fps,
  pixels,
  laneWidth,
  time,
  compositionDuration,
  seek,
  onKeyframesOpen,
  onPresetsOpen,
  initialKeyframes = false,
  modeRequest,
  change,
  checkpoint,
  onClose,
  onPreview,
}: Props) {
  const gesture = useRef<(() => void) | null>(null);
  useEffect(() => () => gesture.current?.(), []);
  const audio = layer.kind === 'audio';
  const [mode, setMode] = useState<'presets' | 'keyframes'>(() =>
    initialKeyframes ? 'keyframes' : 'presets',
  );
  const previousModeRequest = useRef(modeRequest?.id);
  useEffect(() => {
    if (!modeRequest || modeRequest.id === previousModeRequest.current) return;
    previousModeRequest.current = modeRequest.id;
    setMode(modeRequest.keyframes ? 'keyframes' : 'presets');
  }, [modeRequest]);
  const [phase, setPhase] = useState<'entrance' | 'loop' | 'exit'>('entrance');
  const timing = getMotionTiming(layer);
  const motion3d = layer.transform3d?.enabled ? layer.transform3d.motion : 'none';
  const hasEntrance = layer.animation !== 'none' || motion3d !== 'none';
  const floatOnly = motion3d === 'float' && layer.animation === 'none';
  const period = Math.max(0.4, layer.animationDuration ?? 0.6);
  const entranceDuration = floatOnly ? period : timing.duration;
  const fades = getAudioTiming(layer);
  const maximum = Math.min(3600, layer.duration);
  const easing = layer.animationEasing ?? 'ease-out';
  const exitEasing = layer.exitEasing ?? easing;
  const exitStyle = timing.exitDuration > 0 ? (layer.exitAnimation ?? 'fade') : 'none';
  const loop = getLoopTiming(layer);
  const loopStyle = layer.loopAnimation ?? 'none';
  const hasMotion = hasEntrance || timing.exitDuration > 0 || loopStyle !== 'none';
  const edit = (patch: Partial<Layer>, record?: boolean) => {
    if (!layer.locked) change(layer.id, patch, record);
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
          Math.min(3600, layer.duration - (floatOnly ? 0 : timing.duration)),
        ),
        animationDuration: entranceDuration,
      };
    if (action === 'end')
      return {
        animationDuration: floatOnly
          ? Math.max(0.4, clamp(period + delta, 3600))
          : clamp(timing.duration + delta, Math.min(3600, layer.duration - timing.delay)),
      };
    const end = timing.delay + entranceDuration;
    const delay = Math.max(
      end - 3600,
      clamp(
        timing.delay + delta,
        Math.min(3600, floatOnly ? Math.min(layer.duration, end - 0.4) : end),
      ),
    );
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
    const loop = entrance && floatOnly;
    const visibleDuration = loop
      ? Math.min(duration, Math.max(0, layer.duration - timing.delay))
      : duration;
    const curve = Array.from({ length: 21 }, (_, index) => {
      const progress = index / 20;
      const value = loop
        ? 0.5 + 0.5 * Math.sin(((progress * visibleDuration) / period) * Math.PI * 2)
        : entrance || kind === 'exit'
          ? easeProgress(progress, kind === 'exit' ? exitEasing : easing)
          : progress;
      return `${index === 0 ? 'M' : 'L'}${progress * 100},${outgoing ? 2 + value * 14 : 16 - value * 14}`;
    }).join(' ');
    const add = () => {
      const duration = Math.min(0.6, maximum);
      edit(
        kind === 'entrance'
          ? { animation: 'fade', animationDelay: 0, animationDuration: duration }
          : kind === 'exit'
            ? { exitAnimation: 'fade', exitDuration: duration }
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
                {
                  left: start * pixels,
                  width: Math.max(12, visibleDuration * pixels),
                } as CSSProperties
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
                title={`${label}: ${seconds(duration)}${loop ? ' · repeats to clip end' : ''}${entrance ? ' · drag to change delay' : ' · drag to resize'}. Hold Shift for frame steps.`}
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

  const modeSwitch = (
    <div
      className="timeline-motion-mode"
      role="tablist"
      aria-label={`Motion editing mode for ${layer.name}`}
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'presets'}
        onClick={() => {
          setMode('presets');
          onPresetsOpen();
        }}
      >
        Presets
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'keyframes'}
        onClick={() => {
          setMode('keyframes');
          onKeyframesOpen();
        }}
      >
        Keyframes <span aria-hidden="true">◇</span>
      </button>
    </div>
  );

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
      ) : mode === 'presets' ? (
        <>
          {phase === 'entrance' &&
            renderSegment(
              'entrance',
              layer.animation !== 'none'
                ? 'Entrance'
                : motion3d === 'float'
                  ? '3D float period'
                  : motion3d === 'tilt-in'
                    ? '3D tilt in'
                    : motion3d === 'flip-in'
                      ? '3D flip in'
                      : 'Entrance',
              layer.start + timing.delay,
              entranceDuration,
              hasEntrance,
            )}
          {phase === 'exit' &&
            renderSegment(
              'exit',
              exitStyle === 'fade' || exitStyle === 'none' ? 'Exit fade' : 'Exit',
              layer.start + layer.duration - timing.exitDuration,
              timing.exitDuration,
              timing.exitDuration > 0,
            )}
        </>
      ) : null}
      {(audio || mode === 'presets') && (
        <div className="timeline-motion-heading">
          <div>
            {audio && <strong>Sound</strong>}
            <span>{layer.name}</span>
            {layer.locked && (
              <small>
                <LockKeyhole size={12} /> Locked
              </small>
            )}
          </div>
          {!audio && modeSwitch}
          <div className="timeline-motion-actions">
            <button
              type="button"
              aria-label={`Preview clip ${layer.name}`}
              onClick={() => onPreview(layer)}
            >
              <Play size={13} /> Preview
            </button>
            {!audio && mode === 'presets' && (
              <button
                type="button"
                aria-label={`Reset motion for ${layer.name}`}
                disabled={layer.locked || !hasMotion}
                onClick={() => edit(resetMotionPatch(layer))}
              >
                <RotateCw size={13} /> <span>Reset</span>
              </button>
            )}
            <button
              type="button"
              className="timeline-motion-close"
              aria-label={`Close ${audio ? 'audio' : 'motion'} editor for ${layer.name}`}
              onClick={onClose}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
      {!audio && mode === 'keyframes' ? (
        <TimelineKeyframeEditor
          key={layer.id}
          project={project}
          modeSwitch={modeSwitch}
          onClose={onClose}
          layer={layer}
          fps={fps}
          time={time}
          compositionDuration={compositionDuration}
          pixels={pixels}
          laneWidth={laneWidth}
          seek={seek}
          change={change}
          checkpoint={checkpoint}
        />
      ) : (
        <div className={`timeline-inline-controls ${audio ? 'is-audio' : 'is-visual'}`}>
          {audio ? (
            <section
              className="timeline-motion-phase timeline-sound-controls"
              aria-label={`Sound settings for ${layer.name}`}
            >
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
            </section>
          ) : (
            <MotionPresetPicker
              layer={layer}
              fps={fps}
              edit={edit}
              checkpoint={checkpoint}
              onPhaseChange={setPhase}
            />
          )}
        </div>
      )}
      {!audio &&
        mode === 'presets' &&
        phase === 'loop' &&
        loopStyle !== 'none' &&
        loop.delay < layer.duration && (
          <div className="timeline-effect-row timeline-loop-row">
            <div className="timeline-effect-label">
              <span>{loopStyle === 'float' ? 'Float loop' : 'Pulse loop'}</span>
              <small>{seconds(loop.period)}</small>
            </div>
            <div className="track-lane timeline-effect-lane" style={{ width: laneWidth }}>
              <div
                className="timeline-loop-range"
                style={{
                  left: (layer.start + loop.delay) * pixels,
                  width: Math.max(1, (layer.duration - loop.delay) * pixels),
                }}
                title={`Repeats every ${seconds(loop.period)} after the entrance`}
              >
                ↔ Repeats · {seconds(loop.period)}
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
