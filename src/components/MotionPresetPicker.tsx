import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ENTRANCE_OPTIONS,
  EXIT_OPTIONS,
  LOOP_OPTIONS,
  easeProgress,
  getAnimationDistance,
  getLoopTiming,
  getMotionTiming,
} from '../core/motion';
import { createLayer } from '../core/project';
import type { AnimationEasing, Layer, Project } from '../core/types';
import { MediaCache, renderFrame } from '../engine/renderer';
import { ELEMENT_3D_MOTIONS, element3DMotionPatch } from './Element3DControls';
import './MotionPresetPicker.css';

type Phase = 'entrance' | 'loop' | 'exit';
interface Props {
  layer: Layer;
  fps: number;
  edit: (patch: Partial<Layer>, record?: boolean) => void;
  checkpoint: () => void;
  onPhaseChange?: (phase: Phase) => void;
}

const PHASES = [
  { id: 'entrance', label: 'Enter', symbol: '↦' },
  { id: 'loop', label: 'Loop', symbol: '↻' },
  { id: 'exit', label: 'Exit', symbol: '↤' },
] as const;
const durationLabel = (value: number) => `${Number(value.toFixed(2))}s`;

/** A pointer drag or a focused numeric edit creates exactly one undo entry. */
function TimingField({
  label,
  name,
  value,
  min = 0,
  max,
  step = 0.01,
  unit = 's',
  slider = false,
  sliderMax,
  disabled,
  checkpoint,
  change,
}: {
  label: string;
  name: string;
  value: number;
  min?: number;
  max: number;
  step?: number;
  unit?: string;
  slider?: boolean;
  sliderMax?: number;
  disabled?: boolean;
  checkpoint: () => void;
  change: (value: number) => void;
}) {
  const gesture = useRef<{ type: 'pointer' | 'number' | 'key' | null; recorded: boolean }>({
    type: null,
    recorded: false,
  });
  const end = () => {
    gesture.current = { type: null, recorded: false };
  };
  useEffect(() => {
    const endPointer = () => {
      if (gesture.current.type === 'pointer') end();
    };
    window.addEventListener('pointerup', endPointer);
    window.addEventListener('pointercancel', endPointer);
    window.addEventListener('blur', end);
    return () => {
      window.removeEventListener('pointerup', endPointer);
      window.removeEventListener('pointercancel', endPointer);
      window.removeEventListener('blur', end);
    };
  }, []);
  const update = (next: number) => {
    if (disabled || !Number.isFinite(next)) return;
    const bounded = Math.max(min, Math.min(Math.max(min, max), next));
    if (bounded === value) return;
    if (!gesture.current.recorded) {
      checkpoint();
      gesture.current.recorded = true;
    }
    change(bounded);
    if (!gesture.current.type) end();
  };
  return (
    <div className={`motion-picker-field ${slider ? 'has-slider' : ''}`}>
      <span>{label}</span>
      {slider && (
        <input
          type="range"
          aria-label={`${name} slider`}
          min={min}
          max={Math.max(min, value, Math.min(max, sliderMax ?? max))}
          step={step}
          value={value}
          disabled={disabled}
          onPointerDown={() => {
            gesture.current = { type: 'pointer', recorded: false };
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (
              [
                'ArrowLeft',
                'ArrowRight',
                'ArrowUp',
                'ArrowDown',
                'Home',
                'End',
                'PageUp',
                'PageDown',
              ].includes(event.key) &&
              gesture.current.type !== 'key'
            )
              gesture.current = { type: 'key', recorded: false };
          }}
          onKeyUp={() => {
            if (gesture.current.type === 'key') end();
          }}
          onBlur={end}
          onChange={(event) => update(event.currentTarget.valueAsNumber)}
        />
      )}
      <label className="motion-picker-number">
        <input
          type="number"
          aria-label={name}
          min={min}
          max={Math.max(min, max)}
          step={step}
          value={Number(value.toFixed(3))}
          disabled={disabled}
          onFocus={() => {
            gesture.current = { type: 'number', recorded: false };
          }}
          onBlur={end}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          onChange={(event) => update(event.currentTarget.valueAsNumber)}
        />
        <small>{unit}</small>
      </label>
    </div>
  );
}

/** Only the hovered/focused tile runs a preview, through the actual export renderer. */
function PresetTile({
  phase,
  id,
  label,
  selected,
  disabled,
  name,
  entrance,
  easing,
  active,
  onPreview,
  onSelect,
}: {
  phase: Phase;
  id: string;
  label: string;
  selected: boolean;
  disabled?: boolean;
  name: string;
  entrance: Layer['animation'];
  easing: AnimationEasing;
  active: boolean;
  onPreview: (active: boolean) => void;
  onSelect: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const project = useMemo<Project>(
    () => ({
      version: 1,
      id: 'motion-tile',
      name: label,
      width: 96,
      height: 48,
      fps: 30,
      duration: 1.6,
      background: '#222222',
      components: [],
      layers: [
        createLayer('shape', {
          id: 'motion-tile-shape',
          x: 36,
          y: 12,
          width: 24,
          height: 24,
          radius: 6,
          duration: 1.6,
          fill: '#eeeeee',
          animation:
            phase === 'entrance'
              ? (id as Layer['animation'])
              : phase === 'exit' && id === 'reverse'
                ? entrance
                : 'none',
          animationDuration: phase === 'exit' ? 0 : 1.1,
          animationEasing: easing,
          animationDistance: 27,
          loopAnimation: phase === 'loop' ? (id as Layer['loopAnimation']) : 'none',
          loopDuration: 1.5,
          loopAmount: id === 'pulse' ? 35 : 8,
          exitAnimation: phase === 'exit' ? (id as Layer['exitAnimation']) : 'none',
          exitDuration: phase === 'exit' && id !== 'none' ? 1.35 : 0,
          exitEasing: easing,
        }),
      ],
    }),
    [phase, id, label, entrance, easing],
  );
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    const media = new MediaCache();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let previous = -Infinity;
    const start = performance.now();
    const draw = (now: number) => {
      const animate = active && !reduce.matches;
      if (now - previous >= 40) {
        renderFrame(context, project, animate ? ((now - start) / 1000) % 1.6 : 0.65, media);
        previous = now;
      }
      if (animate) frame = requestAnimationFrame(draw);
    };
    draw(start);
    return () => {
      cancelAnimationFrame(frame);
      media.dispose();
    };
  }, [project, active]);
  const symbol =
    id === 'none'
      ? '—'
      : id === 'fade'
        ? '◌'
        : id === 'rise'
          ? '↑'
          : id === 'fall'
            ? '↓'
            : id === 'slide' || id === 'slide-left'
              ? '←'
              : id === 'slide-right'
                ? '→'
                : id === 'pop' || id === 'pulse'
                  ? '↗'
                  : id === 'zoom-out' || id === 'shrink'
                    ? '↙'
                    : id === 'reverse'
                      ? '↶'
                      : '↕';
  const phaseLabel = PHASES.find((item) => item.id === phase)!.label;
  return (
    <button
      type="button"
      className={`motion-picker-tile ${selected ? 'is-selected' : ''}`}
      aria-label={`${phaseLabel} animation: ${label} for ${name}`}
      aria-pressed={selected}
      title={`${label} · Hover to preview, click to apply`}
      disabled={disabled}
      onPointerEnter={() => onPreview(true)}
      onPointerLeave={() => onPreview(false)}
      onFocus={() => onPreview(true)}
      onBlur={() => onPreview(false)}
      onClick={onSelect}
    >
      <span className="motion-picker-art" aria-hidden="true">
        <canvas ref={canvas} width={96} height={48} />
        <i>{symbol}</i>
      </span>
      <span>{label === 'Reverse entrance' ? 'Reverse' : label}</span>
    </button>
  );
}

export default function MotionPresetPicker({ layer, fps, edit, checkpoint, onPhaseChange }: Props) {
  const [phase, setPhase] = useState<Phase>('entrance');
  const [adjust, setAdjust] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  useEffect(() => {
    setPhase('entrance');
    setAdjust(false);
    setPreviewId(null);
    onPhaseChange?.('entrance');
  }, [layer.id]);
  const timing = getMotionTiming(layer);
  const loop = getLoopTiming(layer);
  const maximum = Math.min(3600, layer.duration);
  const motion3d = layer.transform3d?.enabled ? layer.transform3d.motion : 'none';
  const floatOnly = motion3d === 'float' && layer.animation === 'none';
  const entranceOn = layer.animation !== 'none' || motion3d !== 'none';
  const loopStyle = layer.loopAnimation ?? 'none';
  const exitStyle = timing.exitDuration > 0 ? (layer.exitAnimation ?? 'fade') : 'none';
  const easing =
    (phase === 'exit' ? layer.exitEasing : undefined) ?? layer.animationEasing ?? 'ease-out';
  const current = phase === 'entrance' ? layer.animation : phase === 'loop' ? loopStyle : exitStyle;
  const options =
    phase === 'entrance' ? ENTRANCE_OPTIONS : phase === 'loop' ? LOOP_OPTIONS : EXIT_OPTIONS;
  const enabled =
    phase === 'entrance'
      ? entranceOn
      : phase === 'loop'
        ? loopStyle !== 'none'
        : exitStyle !== 'none';
  const write = (patch: Partial<Layer>, record = true) => {
    if (!layer.locked) edit(patch, record);
  };
  const select = (id: string) => {
    if (phase === 'exit' && id === 'none') {
      if (layer.exitAnimation !== 'none' || layer.exitDuration !== 0)
        write({ exitAnimation: 'none', exitDuration: 0 });
      return;
    }
    if (current === id) return;
    if (phase === 'entrance')
      write({
        animation: id as Layer['animation'],
        ...(id !== 'none' && timing.duration === 0
          ? { animationDuration: Math.min(0.5, Math.max(0, maximum - timing.delay)) }
          : {}),
      });
    else if (phase === 'loop') write({ loopAnimation: id as Layer['loopAnimation'] });
    else
      write({
        exitAnimation: id as Layer['exitAnimation'],
        exitDuration: id === 'none' ? 0 : timing.exitDuration || Math.min(0.5, maximum),
      });
  };
  const summaries: Record<Phase, string> = {
    entrance: entranceOn
      ? `${layer.animation === 'none' ? (ELEMENT_3D_MOTIONS.find((item) => item.id === motion3d)?.label ?? 'None') : ENTRANCE_OPTIONS.find((item) => item.id === layer.animation)?.label} · ${durationLabel(floatOnly ? Math.max(0.4, layer.animationDuration ?? 0.6) : timing.duration)}`
      : 'None',
    loop:
      loopStyle === 'none'
        ? 'None'
        : `${LOOP_OPTIONS.find((item) => item.id === loopStyle)?.label} · ${durationLabel(loop.period)}`,
    exit:
      exitStyle === 'none'
        ? 'None'
        : `${EXIT_OPTIONS.find((item) => item.id === exitStyle)?.label} · ${durationLabel(timing.exitDuration)}`,
  };
  const timingName =
    phase === 'entrance'
      ? `Animation ${floatOnly ? 'period' : 'duration'} for ${layer.name}`
      : phase === 'loop'
        ? `Loop period for ${layer.name}`
        : `${exitStyle === 'fade' || exitStyle === 'none' ? 'Exit fade' : 'Exit duration'} for ${layer.name}`;
  const timingValue =
    phase === 'entrance'
      ? floatOnly
        ? Math.max(0.4, layer.animationDuration ?? 0.6)
        : timing.duration
      : phase === 'loop'
        ? loop.period
        : timing.exitDuration;
  const timingMaximum =
    phase === 'loop' || (phase === 'entrance' && floatOnly)
      ? 3600
      : phase === 'entrance'
        ? Math.min(3600, layer.duration - timing.delay)
        : maximum;
  const periodControl = phase === 'loop' || (phase === 'entrance' && floatOnly);
  const timingChange = (value: number) =>
    write(
      phase === 'entrance'
        ? { animationDuration: value }
        : phase === 'loop'
          ? { loopDuration: value }
          : { exitDuration: value },
      false,
    );
  const hasTravel =
    phase === 'entrance'
      ? ['rise', 'fall', 'slide', 'slide-right'].includes(layer.animation)
      : phase === 'exit' &&
        (['rise', 'fall', 'slide-left', 'slide-right'].includes(exitStyle) ||
          (exitStyle === 'reverse' &&
            ['rise', 'fall', 'slide', 'slide-right'].includes(layer.animation)));
  const curve = Array.from(
    { length: 21 },
    (_, index) =>
      `${index ? 'L' : 'M'}${2 + index * 1.6},${22 - easeProgress(index / 20, easing) * 19}`,
  ).join(' ');
  return (
    <div className="motion-preset-picker" aria-label={`Animation presets for ${layer.name}`}>
      <div
        className="motion-picker-phases"
        role="group"
        aria-label={`Animation phases for ${layer.name}`}
      >
        {PHASES.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-label={`${item.label} animation settings for ${layer.name}`}
            aria-pressed={phase === item.id}
            className={phase === item.id ? 'is-active' : ''}
            onClick={() => {
              setPhase(item.id);
              setAdjust(false);
              setPreviewId(null);
              onPhaseChange?.(item.id);
            }}
          >
            <i aria-hidden="true">{item.symbol}</i>
            <strong>{item.label}</strong>
            <span>{summaries[item.id]}</span>
          </button>
        ))}
        <small className="motion-picker-hint">Hover to preview</small>
      </div>
      <div
        className="motion-picker-options"
        role="group"
        aria-label={`${PHASES.find((item) => item.id === phase)!.label} presets`}
      >
        {options.map((option) => (
          <PresetTile
            key={`${phase}-${option.id}`}
            phase={phase}
            id={option.id}
            label={option.label}
            selected={current === option.id}
            disabled={layer.locked}
            name={layer.name}
            entrance={layer.animation}
            easing={easing}
            active={previewId === `${phase}-${option.id}`}
            onPreview={(active) =>
              setPreviewId((previous) =>
                active
                  ? `${phase}-${option.id}`
                  : previous === `${phase}-${option.id}`
                    ? null
                    : previous,
              )
            }
            onSelect={() => select(option.id)}
          />
        ))}
      </div>
      <div className="motion-picker-basics">
        {enabled ? (
          <>
            <TimingField
              label={periodControl ? 'Period' : 'Duration'}
              name={timingName}
              value={timingValue}
              min={periodControl ? 0.4 : 0}
              max={timingMaximum}
              sliderMax={periodControl ? 10 : 5}
              step={1 / fps}
              slider
              disabled={layer.locked}
              checkpoint={checkpoint}
              change={timingChange}
            />
            {phase === 'entrance' && (
              <TimingField
                label="Start after"
                name={`Animation delay for ${layer.name}`}
                value={timing.delay}
                max={maximum}
                disabled={layer.locked}
                checkpoint={checkpoint}
                change={(value) => write({ animationDelay: value }, false)}
              />
            )}
            <span className="motion-picker-context">
              {phase === 'entrance'
                ? 'From clip start'
                : phase === 'loop'
                  ? 'Repeats after Enter'
                  : 'At clip end'}
            </span>
          </>
        ) : (
          <span className="motion-picker-empty">
            Choose a style to{' '}
            {phase === 'entrance'
              ? 'bring your element in'
              : phase === 'loop'
                ? 'keep your element moving'
                : 'animate your element out'}
            .
          </span>
        )}
        <button
          type="button"
          className="motion-picker-adjust"
          aria-expanded={adjust}
          aria-controls={`motion-adjust-${layer.id}`}
          onClick={() => setAdjust(!adjust)}
        >
          Adjust <span aria-hidden="true">{adjust ? '⌃' : '⌄'}</span>
        </button>
      </div>
      {adjust && (
        <div className="motion-picker-advanced" id={`motion-adjust-${layer.id}`}>
          {enabled && phase !== 'loop' && !(phase === 'entrance' && floatOnly) && (
            <label className="motion-picker-easing">
              <span>Feel</span>
              <svg viewBox="0 0 38 26" role="img" aria-label={`${easing} easing curve`}>
                <path className="motion-picker-curve-guide" d="M2 2V22H36" />
                <path d={curve} />
              </svg>
              <select
                aria-label={`${phase === 'exit' ? 'Exit' : 'Animation'} easing for ${layer.name}`}
                value={easing}
                disabled={layer.locked}
                onChange={(event) =>
                  write(
                    phase === 'exit'
                      ? { exitEasing: event.currentTarget.value as AnimationEasing }
                      : { animationEasing: event.currentTarget.value as AnimationEasing },
                  )
                }
              >
                <option value="linear">Steady</option>
                <option value="ease-in">Gentle start</option>
                <option value="ease-out">Gentle stop</option>
                <option value="ease-in-out">Smooth both</option>
              </select>
            </label>
          )}
          {hasTravel && (
            <TimingField
              label="Travel"
              name={`${phase === 'exit' ? 'Exit' : 'Motion'} travel for ${layer.name}`}
              value={getAnimationDistance(
                layer,
                phase === 'exit' && exitStyle !== 'reverse' ? exitStyle : layer.animation,
              )}
              max={2000}
              step={1}
              unit="px"
              disabled={layer.locked}
              checkpoint={checkpoint}
              change={(value) => write({ animationDistance: value }, false)}
            />
          )}
          {phase === 'loop' && enabled && (
            <TimingField
              label="Amount"
              name={`Loop amount for ${layer.name}`}
              value={loop.amount}
              max={100}
              step={1}
              unit={loopStyle === 'pulse' ? '%' : 'px'}
              disabled={layer.locked}
              checkpoint={checkpoint}
              change={(value) => write({ loopAmount: value }, false)}
            />
          )}
          <label className="motion-picker-3d">
            <span>3D motion</span>
            <select
              aria-label={`3D motion for ${layer.name}`}
              value={motion3d}
              disabled={layer.locked}
              onChange={(event) =>
                write(
                  element3DMotionPatch(
                    layer,
                    event.currentTarget.value as NonNullable<Layer['transform3d']>['motion'],
                  ),
                )
              }
            >
              {ELEMENT_3D_MOTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
