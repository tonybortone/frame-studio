import { useEffect, useRef } from 'react';
import type { Layer } from '../core/types';
import { DEFAULT_ELEMENT_3D } from '../core/element3d';
import { getMotionTiming } from '../core/motion';
import './Element3DControls.css';

type Transform3D = NonNullable<Layer['transform3d']>;
type Motion3D = Transform3D['motion'];
export interface Element3DControlsProps {
  layer?: Layer;
  onChange: (id: string, patch: Partial<Layer>, record?: boolean) => void;
  checkpoint?: () => void;
  emptyMessage?: string;
  compact?: boolean;
  timing?: boolean;
}

export const ELEMENT_3D_MOTIONS: { id: Motion3D; label: string }[] = [
  { id: 'none', label: 'Still' },
  { id: 'tilt-in', label: 'Tilt in' },
  { id: 'flip-in', label: 'Flip in' },
  { id: 'float', label: 'Float' },
];

/** A preset affects the chosen element only and retains its authored timing. */
export function element3DMotionPatch(layer: Layer, motion: Motion3D): Partial<Layer> {
  return { transform3d: { ...(layer.transform3d ?? DEFAULT_ELEMENT_3D), enabled: true, motion } };
}

function TransformField({
  label,
  value,
  min,
  max,
  unit,
  disabled,
  checkpoint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  disabled: boolean;
  checkpoint?: () => void;
  onChange: (value: number, record: boolean) => void;
}) {
  const gesture = useRef<{ active: 'pointer' | 'number' | null; recorded: boolean }>({
    active: null,
    recorded: false,
  });
  const end = () => {
    gesture.current = { active: null, recorded: false };
  };
  const endPointer = () => {
    if (gesture.current.active === 'pointer') end();
  };
  useEffect(() => {
    window.addEventListener('pointerup', endPointer);
    window.addEventListener('pointercancel', endPointer);
    window.addEventListener('blur', end);
    return () => {
      window.removeEventListener('pointerup', endPointer);
      window.removeEventListener('pointercancel', endPointer);
      window.removeEventListener('blur', end);
    };
  }, []);
  const edit = (next: number) => {
    if (disabled || !Number.isFinite(next)) return;
    const clamped = Math.max(min, Math.min(max, next));
    if (clamped === value) return;
    let record = true;
    if (gesture.current.active) {
      record = !gesture.current.recorded;
      gesture.current.recorded = true;
    }
    if (record && checkpoint) {
      checkpoint();
      record = false;
    }
    onChange(clamped, record);
  };
  return (
    <div className="element-3d-field">
      <span>{label}</span>
      <input
        type="range"
        aria-label={`3D ${label}`}
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        onPointerDown={() => {
          gesture.current = { active: 'pointer', recorded: false };
        }}
        onChange={(event) => edit(event.currentTarget.valueAsNumber)}
      />
      <label className="element-3d-number">
        <input
          type="number"
          aria-label={`3D ${label} value`}
          min={min}
          max={max}
          step={1}
          value={Number(value.toFixed(1))}
          disabled={disabled}
          onFocus={() => {
            gesture.current = { active: 'number', recorded: false };
          }}
          onBlur={end}
          onChange={(event) => edit(event.currentTarget.valueAsNumber)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <small>{unit}</small>
      </label>
    </div>
  );
}

export function Element3DControls({
  layer,
  onChange,
  checkpoint,
  emptyMessage = 'Select one visual element to give it depth.',
}: Element3DControlsProps) {
  const visual = layer?.kind !== 'audio' ? layer : undefined;
  const transform = visual?.transform3d ?? { ...DEFAULT_ELEMENT_3D, enabled: false };
  const enabled = Boolean(visual?.transform3d?.enabled);
  const locked = Boolean(visual?.locked);
  const setTransform = (patch: Partial<Transform3D>, record = true) => {
    if (!visual || locked) return;
    const next = { ...transform, ...patch };
    if (
      Object.keys(next).every(
        (key) => next[key as keyof Transform3D] === transform[key as keyof Transform3D],
      )
    )
      return;
    onChange(visual.id, { transform3d: next }, record);
  };
  return (
    <section className="element-3d-controls" aria-label="3D element">
      <header>
        <h4>3D element</h4>
        {visual && (
          <button
            type="button"
            className="element-3d-toggle"
            role="switch"
            aria-label="Enable 3D for this element"
            aria-checked={enabled}
            disabled={locked}
            onClick={() => setTransform({ enabled: !enabled })}
          >
            <span />
          </button>
        )}
      </header>
      {!visual ? (
        <p>{emptyMessage}</p>
      ) : enabled ? (
        <>
          <div className="element-3d-poses" aria-label="3D poses">
            <button disabled={locked} onClick={() => setTransform({ rotateX: 0, rotateY: 0 })}>
              Flat
            </button>
            <button disabled={locked} onClick={() => setTransform({ rotateX: 12, rotateY: -24 })}>
              Tilt left
            </button>
            <button disabled={locked} onClick={() => setTransform({ rotateX: 12, rotateY: 24 })}>
              Tilt right
            </button>
          </div>
          <TransformField
            label="Tilt X"
            value={transform.rotateX}
            min={-180}
            max={180}
            unit="°"
            disabled={locked}
            checkpoint={checkpoint}
            onChange={(rotateX, record) => setTransform({ rotateX }, record)}
          />
          <TransformField
            label="Tilt Y"
            value={transform.rotateY}
            min={-180}
            max={180}
            unit="°"
            disabled={locked}
            checkpoint={checkpoint}
            onChange={(rotateY, record) => setTransform({ rotateY }, record)}
          />
          <TransformField
            label="Depth"
            value={transform.z}
            min={-100}
            max={100}
            unit=""
            disabled={locked}
            checkpoint={checkpoint}
            onChange={(z, record) => setTransform({ z }, record)}
          />
          <div className="element-3d-footer">
            <span>Farther − · + Closer</span>
            <button
              disabled={locked}
              onClick={() => setTransform({ rotateX: 0, rotateY: 0, z: 0, motion: 'none' })}
            >
              Reset 3D
            </button>
          </div>
        </>
      ) : (
        <p>Tilt and animate just this element.</p>
      )}
    </section>
  );
}

function MotionTimingField({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (value: number, record: boolean) => void;
}) {
  const recorded = useRef(false);
  return (
    <label className="element-3d-timing-field">
      <span>{label}</span>
      <div>
        <input
          type="number"
          aria-label={`3D motion ${label.toLowerCase()} (s)`}
          min={min}
          max={max}
          step={0.1}
          value={Number(value.toFixed(2))}
          disabled={disabled}
          onFocus={() => {
            recorded.current = false;
          }}
          onBlur={() => {
            recorded.current = false;
          }}
          onChange={(event) => {
            const next = event.currentTarget.valueAsNumber;
            if (disabled || !Number.isFinite(next)) return;
            const clamped = Math.max(min, Math.min(max, next));
            if (clamped === value) return;
            onChange(clamped, !recorded.current);
            recorded.current = true;
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <small>s</small>
      </div>
    </label>
  );
}

export function Element3DMotionControls({
  layer,
  onChange,
  emptyMessage = 'Select one visual element for 3D motion.',
  compact = false,
  timing = false,
}: Element3DControlsProps) {
  const visual = layer?.kind !== 'audio' ? layer : undefined;
  const current = visual?.transform3d?.enabled ? visual.transform3d.motion : 'none';
  const envelope = visual ? getMotionTiming(visual) : undefined;
  const editTiming = (patch: Partial<Layer>, record = true) => {
    if (!visual || visual.locked) return;
    onChange(visual.id, patch, record);
  };
  return (
    <section
      className={`element-3d-controls element-3d-motion ${compact ? 'is-compact' : ''}`}
      aria-label="3D motion"
    >
      <header>
        <h4>3D motion</h4>
        <span>One element</span>
      </header>
      {!visual ? (
        <p>{emptyMessage}</p>
      ) : (
        <>
          <div className="element-3d-motion-presets">
            {ELEMENT_3D_MOTIONS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                aria-label={`3D ${preset.label}`}
                aria-pressed={current === preset.id}
                disabled={visual.locked}
                onClick={() => {
                  if (visual.locked || current === preset.id) return;
                  onChange(visual.id, element3DMotionPatch(visual, preset.id));
                }}
              >
                <i className={`element-3d-preview is-${preset.id}`} aria-hidden="true">
                  <b />
                </i>
                <span>{preset.label}</span>
              </button>
            ))}
          </div>
          {timing && current !== 'none' && envelope && (
            <div className="element-3d-timing">
              <MotionTimingField
                label="Delay"
                value={envelope.delay}
                min={0}
                max={Math.min(3600, visual.duration)}
                disabled={Boolean(visual.locked)}
                onChange={(animationDelay, record) => editTiming({ animationDelay }, record)}
              />
              <MotionTimingField
                label={current === 'float' ? 'Period' : 'Duration'}
                value={
                  current === 'float'
                    ? Math.max(0.4, visual.animationDuration ?? 0.6)
                    : envelope.duration
                }
                min={current === 'float' ? 0.4 : 0}
                max={current === 'float' ? 3600 : Math.min(3600, visual.duration - envelope.delay)}
                disabled={Boolean(visual.locked)}
                onChange={(animationDuration, record) => editTiming({ animationDuration }, record)}
              />
              {current !== 'float' && (
                <label className="element-3d-easing">
                  <span>Easing</span>
                  <select
                    aria-label="3D motion easing"
                    value={visual.animationEasing ?? 'ease-out'}
                    disabled={Boolean(visual.locked)}
                    onChange={(event) => {
                      const animationEasing = event.currentTarget.value as Layer['animationEasing'];
                      if (animationEasing !== (visual.animationEasing ?? 'ease-out'))
                        editTiming({ animationEasing });
                    }}
                  >
                    <option value="linear">Linear</option>
                    <option value="ease-in">Ease in</option>
                    <option value="ease-out">Ease out</option>
                    <option value="ease-in-out">Ease in / out</option>
                  </select>
                </label>
              )}
            </div>
          )}
          <p>
            {timing
              ? current === 'float'
                ? 'A smooth loop after the delay.'
                : current === 'none'
                  ? 'Choose a motion for this element.'
                  : 'Settles into your chosen 3D pose.'
              : current === 'float'
                ? 'Loops after the delay. Set its period in Fine-tune below.'
                : 'Uses the delay, duration and easing in Fine-tune below.'}
          </p>
        </>
      )}
    </section>
  );
}
