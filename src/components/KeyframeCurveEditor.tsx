import { useEffect, useRef, type PointerEvent } from 'react';
import type { PropertyKeyframe } from '../core/types';
import { evaluateKeyframeProgress, getKeyframeCurve } from '../core/keyframes';
import CompactSelect from './CompactSelect';
import './KeyframeCurveEditor.css';

type Curve = [number, number, number, number];
interface Props {
  frame: PropertyKeyframe;
  name: string;
  disabled: boolean;
  disabledReason?: string;
  hint?: string;
  /** Normalized time within this keyframe's outgoing segment. */
  progress?: number;
  change: (patch: Pick<PropertyKeyframe, 'easing' | 'curve'>, record?: boolean) => void;
  checkpoint: () => void;
}
const CHOICES = [
  { easing: 'linear', label: 'Steady' },
  { easing: 'ease-in-out', label: 'Smooth' },
  { easing: 'ease-in', label: 'Speed up' },
  { easing: 'ease-out', label: 'Slow down' },
  { easing: 'hold', label: 'Hold' },
] as const;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const px = (value: number) => 22 + value * 176;

/** Presets and directly draggable handles edit the same outgoing curve. */
export default function KeyframeCurveEditor({
  frame,
  name,
  disabled,
  disabledReason,
  hint,
  progress,
  change,
  checkpoint,
}: Props) {
  const chart = useRef<HTMLDivElement>(null);
  const gesture = useRef<(() => void) | null>(null);
  const keyboardRecorded = useRef(false);
  const curve = getKeyframeCurve(frame);
  const domain = useRef({ id: frame.id, low: -0.5, high: 1.5 });
  // Expand the view for imported overshoot without rewriting authored data.
  // Retain that range while dragging so a control can move away from its edge.
  if (domain.current.id !== frame.id || frame.easing !== 'custom')
    domain.current = { id: frame.id, low: -0.5, high: 1.5 };
  domain.current.low = Math.min(domain.current.low, curve[1], curve[3]);
  domain.current.high = Math.max(domain.current.high, curve[1], curve[3]);
  const { low, high } = domain.current;
  const py = (value: number) => 122 - ((value - low) / (high - low)) * 104;
  const held = frame.easing === 'hold';
  const activeProgress =
    progress === undefined || !Number.isFinite(progress) ? undefined : clamp(progress, 0, 1);
  useEffect(
    () => () => {
      gesture.current?.();
      keyboardRecorded.current = false;
    },
    [frame.id, disabled],
  );
  const moveHandle = (index: 0 | 2, x: number, y: number): Curve => {
    const next: Curve = [...curve];
    next[index] = x === curve[index] ? curve[index] : Math.round(clamp(x, 0, 1) * 1000) / 1000;
    next[index + 1] =
      y === curve[index + 1] ? curve[index + 1] : Math.round(clamp(y, low, high) * 1000) / 1000;
    return next;
  };
  const startDrag = (event: PointerEvent<HTMLButtonElement>, index: 0 | 2) => {
    if (disabled || event.button !== 0 || !chart.current) return;
    event.preventDefault();
    event.stopPropagation();
    gesture.current?.();
    const target = event.currentTarget;
    const box = chart.current.getBoundingClientRect();
    const origin = { x: event.clientX, y: event.clientY };
    let recorded = false;
    let previous: Curve = curve;
    target.setPointerCapture(event.pointerId);
    const move = (next: globalThis.PointerEvent) => {
      const nextCurve = moveHandle(
        index,
        curve[index] + (((next.clientX - origin.x) / box.width) * 220) / 176,
        curve[index + 1] - (((next.clientY - origin.y) / box.height) * 160 * (high - low)) / 104,
      );
      if (nextCurve.every((value, i) => value === previous[i])) return;
      if (!recorded) {
        checkpoint();
        recorded = true;
      }
      previous = nextCurve;
      change({ easing: 'custom', curve: nextCurve }, false);
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
  return (
    <div className={`keyframe-curve-editor ${disabled ? 'is-disabled' : ''}`}>
      <div className="keyframe-curve-chart" ref={chart}>
        <svg
          viewBox="0 0 220 160"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${frame.easing} time and progress curve`}
        >
          <path
            className="keyframe-curve-grid"
            d={`M22 ${py(1)}H198M22 ${py(0.5)}H198M22 ${py(0)}H198M22 ${py(1)}V${py(0)}M110 ${py(1)}V${py(0)}M198 ${py(1)}V${py(0)}`}
          />
          {!held && (
            <path
              className="keyframe-curve-arms"
              d={`M22 ${py(0)}L${px(curve[0])} ${py(curve[1])}M198 ${py(1)}L${px(curve[2])} ${py(curve[3])}`}
            />
          )}
          <path
            className="keyframe-curve-path"
            d={
              held
                ? `M22 ${py(0)}H198V${py(1)}`
                : `M22 ${py(0)}C${px(curve[0])} ${py(curve[1])} ${px(curve[2])} ${py(curve[3])} 198 ${py(1)}`
            }
          />
          <circle className="keyframe-curve-endpoint" cx="22" cy={py(0)} r="3" />
          <circle className="keyframe-curve-endpoint" cx="198" cy={py(1)} r="3" />
          {activeProgress !== undefined && (
            <circle
              className="keyframe-curve-progress"
              cx={px(activeProgress)}
              cy={py(evaluateKeyframeProgress(frame, activeProgress))}
              r="5"
            />
          )}
          <text x="22" y="148">
            Start
          </text>
          <text x="198" y="148" textAnchor="end">
            Next point
          </text>
        </svg>
        {!held &&
          ([0, 2] as const).map((index) => (
            <button
              key={index}
              type="button"
              className="keyframe-curve-handle"
              aria-label={`Curve ${index === 0 ? 'start' : 'end'} handle for ${name}`}
              title="Drag to shape the curve · Arrow keys to fine-tune"
              disabled={disabled}
              style={{
                left: `${(px(curve[index]) / 220) * 100}%`,
                top: `${(py(curve[index + 1]) / 160) * 100}%`,
              }}
              onPointerDown={(event) => startDrag(event, index)}
              onBlur={() => {
                keyboardRecorded.current = false;
              }}
              onKeyUp={() => {
                keyboardRecorded.current = false;
              }}
              onKeyDown={(event) => {
                if (
                  disabled ||
                  !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
                )
                  return;
                event.preventDefault();
                event.stopPropagation();
                const step = event.shiftKey ? 0.1 : 0.02;
                const next = moveHandle(
                  index,
                  curve[index] +
                    (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
                  curve[index + 1] +
                    (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0),
                );
                if (next.every((value, i) => value === curve[i])) return;
                if (!keyboardRecorded.current) {
                  checkpoint();
                  keyboardRecorded.current = true;
                }
                change({ easing: 'custom', curve: next }, false);
              }}
            />
          ))}
      </div>
      <div className="keyframe-curve-choices">
        <span className="keyframe-curve-caption">Movement</span>
        <CompactSelect
          label={`Curve style for ${name}`}
          value={frame.easing}
          disabled={disabled}
          options={[
            ...CHOICES.map(({ easing, label }) => ({ value: easing, label })),
            ...(frame.easing === 'custom' ? [{ value: 'custom', label: 'Custom curve' }] : []),
          ]}
          onChange={(easing) => {
            if (!disabled && easing !== frame.easing && easing !== 'custom')
              change({ easing: easing as PropertyKeyframe['easing'], curve: undefined });
          }}
        />
        <p className="keyframe-curve-help">
          {disabled
            ? (disabledReason ?? 'Add a later point to shape the movement.')
            : hint
              ? hint
              : held
                ? 'Keep still, then jump at the next point.'
                : 'Drag the dots to fine-tune the movement.'}
        </p>
      </div>
    </div>
  );
}
