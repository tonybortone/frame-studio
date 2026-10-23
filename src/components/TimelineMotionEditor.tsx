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
  easeProgress,
  getLoopTiming,
  getAnimationDistance,
  resetMotionPatch,
  ENTRANCE_OPTIONS,
  EXIT_OPTIONS,
  LOOP_OPTIONS,
} from '../core/motion';
import type { Animation, AnimationEasing, Layer } from '../core/types';
import { LockKeyhole, Play, RotateCw, X } from '../icons';
import { ELEMENT_3D_MOTIONS, element3DMotionPatch } from './Element3DControls';
import './TimelineMotionEditor.css';
import TimelineKeyframeEditor from './TimelineKeyframeEditor';

interface Props {
  layer: Layer;
  fps: number;
  pixels: number;
  laneWidth: number;
  time: number;
  compositionDuration: number;
  seek: (time: number) => void;
  onKeyframesOpen: () => void;
  keyframesRequest?: number;
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

function EasingControl({
  name,
  value,
  disabled,
  onChange,
}: {
  name: string;
  value: AnimationEasing;
  disabled: boolean | undefined;
  onChange: (value: AnimationEasing) => void;
}) {
  const curve = Array.from(
    { length: 25 },
    (_, index) =>
      `${index ? 'L' : 'M'}${2 + (index / 24) * 42},${24 - easeProgress(index / 24, value) * 20}`,
  ).join(' ');
  return (
    <label className="timeline-easing-control">
      <span>Feel</span>
      <svg role="img" aria-label={`${value} easing curve`} viewBox="0 0 46 28">
        <path className="easing-guide" d="M2 4V24H44" />
        <path d={curve} />
      </svg>
      <select
        aria-label={name}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value as AnimationEasing)}
      >
        <option value="linear">Steady</option>
        <option value="ease-in">Gentle start</option>
        <option value="ease-out">Gentle stop</option>
        <option value="ease-in-out">Smooth both</option>
      </select>
    </label>
  );
}

/** These strips edit the same clip-relative envelopes used by preview and export. */
export default function TimelineMotionEditor({
  layer,
  fps,
  pixels,
  laneWidth,
  time,
  compositionDuration,
  seek,
  onKeyframesOpen,
  keyframesRequest = 0,
  change,
  checkpoint,
  onClose,
  onPreview,
}: Props) {
  const gesture = useRef<(() => void) | null>(null);
  useEffect(() => () => gesture.current?.(), []);
  const audio = layer.kind === 'audio';
  const [mode, setMode] = useState<'presets' | 'keyframes'>(() =>
    keyframesRequest > 0 || Object.values(layer.keyframes ?? {}).some((track) => track?.length)
      ? 'keyframes'
      : 'presets',
  );
  useEffect(() => {
    if (keyframesRequest > 0) setMode('keyframes');
  }, [keyframesRequest]);
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
          {renderSegment(
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
          {renderSegment(
            'exit',
            exitStyle === 'fade' || exitStyle === 'none' ? 'Exit fade' : 'Exit',
            layer.start + layer.duration - timing.exitDuration,
            timing.exitDuration,
            timing.exitDuration > 0,
          )}
        </>
      ) : null}
      <div className="timeline-motion-heading">
        <div>
          <strong>{audio ? 'Sound' : 'Motion'}</strong>
          <span>{layer.name}</span>
          {layer.locked && (
            <small>
              <LockKeyhole size={12} /> Locked
            </small>
          )}
        </div>
        <div className="timeline-motion-actions">
          <button
            type="button"
            aria-label={`Preview clip ${layer.name}`}
            onClick={() => onPreview(layer)}
          >
            <Play size={13} /> Preview clip
          </button>
          {!audio && mode === 'presets' && (
            <button
              type="button"
              aria-label={`Reset motion for ${layer.name}`}
              disabled={layer.locked || !hasMotion}
              onClick={() => edit(resetMotionPatch(layer))}
            >
              <RotateCw size={13} /> Reset presets
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
      {!audio && (
        <div
          className="timeline-motion-mode"
          role="tablist"
          aria-label={`Motion editing mode for ${layer.name}`}
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'presets'}
            onClick={() => setMode('presets')}
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
      )}
      {!audio && mode === 'keyframes' ? (
        <TimelineKeyframeEditor
          key={layer.id}
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
            <>
              <section
                className="timeline-motion-phase"
                aria-label={`Entrance settings for ${layer.name}`}
              >
                <h4>
                  <span>01</span> Entrance <small>Come into frame</small>
                </h4>
                <label className="timeline-select-control">
                  <span>Style</span>
                  <select
                    aria-label={`Motion preset for ${layer.name}`}
                    value={layer.animation}
                    disabled={layer.locked}
                    onChange={(event) =>
                      edit({ animation: event.currentTarget.value as Animation })
                    }
                  >
                    {ENTRANCE_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="timeline-phase-fields">
                  <NumberControl
                    label="Start after"
                    name={`Animation delay for ${layer.name}`}
                    value={timing.delay}
                    maximum={maximum}
                    disabled={layer.locked || !hasEntrance}
                    onChange={(value) => edit({ animationDelay: value })}
                  />
                  <NumberControl
                    label={motion3d === 'float' ? '3D period' : 'Duration'}
                    name={`Animation ${motion3d === 'float' ? 'period' : 'duration'} for ${layer.name}`}
                    value={motion3d === 'float' ? period : timing.duration}
                    minimum={motion3d === 'float' ? 0.4 : 0}
                    maximum={
                      motion3d === 'float' ? 3600 : Math.min(3600, layer.duration - timing.delay)
                    }
                    disabled={layer.locked || !hasEntrance}
                    onChange={(value) => edit({ animationDuration: value })}
                  />
                  <NumberControl
                    label="Travel"
                    name={`Motion travel for ${layer.name}`}
                    value={getAnimationDistance(layer)}
                    maximum={2000}
                    unit="px"
                    disabled={
                      layer.locked ||
                      !['rise', 'fall', 'slide', 'slide-right'].includes(layer.animation)
                    }
                    onChange={(value) => edit({ animationDistance: value })}
                  />
                </div>
                <EasingControl
                  name={`Animation easing for ${layer.name}`}
                  value={easing}
                  disabled={layer.locked || !hasEntrance || floatOnly}
                  onChange={(value) => edit({ animationEasing: value })}
                />
              </section>
              <section
                className="timeline-motion-phase"
                aria-label={`Loop settings for ${layer.name}`}
              >
                <h4>
                  <span>02</span> Loop <small>After the entrance</small>
                </h4>
                <label className="timeline-select-control">
                  <span>Style</span>
                  <select
                    aria-label={`Loop motion for ${layer.name}`}
                    value={loopStyle}
                    disabled={layer.locked}
                    onChange={(event) =>
                      edit({ loopAnimation: event.currentTarget.value as Layer['loopAnimation'] })
                    }
                  >
                    {LOOP_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="timeline-phase-fields">
                  <NumberControl
                    label="Period"
                    name={`Loop period for ${layer.name}`}
                    value={loop.period}
                    minimum={0.4}
                    maximum={3600}
                    disabled={layer.locked || loopStyle === 'none'}
                    onChange={(value) => edit({ loopDuration: value })}
                  />
                  <NumberControl
                    label="Amount"
                    name={`Loop amount for ${layer.name}`}
                    value={loop.amount}
                    maximum={100}
                    unit={loopStyle === 'pulse' ? '%' : 'px'}
                    disabled={layer.locked || loopStyle === 'none'}
                    onChange={(value) => edit({ loopAmount: value })}
                  />
                </div>
                <label className="timeline-select-control timeline-3d-choice">
                  <span>3D motion</span>
                  <select
                    aria-label={`3D motion for ${layer.name}`}
                    value={motion3d}
                    disabled={layer.locked}
                    onChange={(event) => {
                      const next = event.currentTarget.value as NonNullable<
                        Layer['transform3d']
                      >['motion'];
                      if (next !== motion3d) edit(element3DMotionPatch(layer, next));
                    }}
                  >
                    {ELEMENT_3D_MOTIONS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>
              </section>
              <section
                className="timeline-motion-phase"
                aria-label={`Exit settings for ${layer.name}`}
              >
                <h4>
                  <span>03</span> Exit <small>Leave the frame</small>
                </h4>
                <label className="timeline-select-control">
                  <span>Style</span>
                  <select
                    aria-label={`Exit motion for ${layer.name}`}
                    value={exitStyle}
                    disabled={layer.locked}
                    onChange={(event) =>
                      edit({
                        exitAnimation: event.currentTarget.value as Layer['exitAnimation'],
                        exitDuration:
                          layer.exitDuration && layer.exitDuration > 0
                            ? layer.exitDuration
                            : Math.min(0.5, maximum),
                      })
                    }
                  >
                    {EXIT_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="timeline-phase-fields">
                  <NumberControl
                    label="Duration"
                    name={`${exitStyle === 'fade' || exitStyle === 'none' ? 'Exit fade' : 'Exit duration'} for ${layer.name}`}
                    value={timing.exitDuration}
                    maximum={maximum}
                    disabled={layer.locked}
                    onChange={(value) =>
                      edit({
                        exitDuration: value,
                        ...(exitStyle === 'none' && value > 0
                          ? { exitAnimation: 'fade' as const }
                          : {}),
                      })
                    }
                  />
                  <NumberControl
                    label="Shared travel"
                    name={`Exit travel for ${layer.name}`}
                    value={getAnimationDistance(
                      layer,
                      exitStyle === 'reverse' ? layer.animation : exitStyle,
                    )}
                    maximum={2000}
                    unit="px"
                    disabled={
                      layer.locked ||
                      !['rise', 'fall', 'slide-left', 'slide-right', 'reverse'].includes(exitStyle)
                    }
                    onChange={(value) => edit({ animationDistance: value })}
                  />
                </div>
                <EasingControl
                  name={`Exit easing for ${layer.name}`}
                  value={exitEasing}
                  disabled={layer.locked || exitStyle === 'none'}
                  onChange={(value) => edit({ exitEasing: value })}
                />
              </section>
            </>
          )}
        </div>
      )}
      {!audio && mode === 'presets' && loopStyle !== 'none' && loop.delay < layer.duration && (
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
