import { useEffect, useRef, type PointerEvent } from 'react';
import type { PropertyKeyframe } from '../core/types';
import { getKeyframeCurve } from '../core/keyframes';

type Curve = [number, number, number, number];
interface Props {
  frame: PropertyKeyframe;
  name: string;
  disabled: boolean;
  change: (patch: Pick<PropertyKeyframe, 'easing' | 'curve'>, record?: boolean) => void;
  checkpoint: () => void;
}
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const px = (value: number) => 22 + value * 176;
const py = (value: number) => 116 - value * 72;

/** An outgoing segment's normalized time/value curve, shared by both paired channels. */
export default function KeyframeCurveEditor({ frame, name, disabled, change, checkpoint }: Props) {
  const chart = useRef<HTMLDivElement>(null);
  const gesture = useRef<(() => void) | null>(null);
  const curve = getKeyframeCurve(frame);
  useEffect(() => () => gesture.current?.(), []);
  const moveHandle = (index: 0 | 2, x: number, y: number): Curve => {
    const next: Curve = [...curve];
    next[index] = Math.round(clamp(x, 0, 1) * 1000) / 1000;
    next[index + 1] = Math.round(clamp(y, -0.5, 1.5) * 1000) / 1000;
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
        curve[index + 1] - (((next.clientY - origin.y) / box.height) * 160) / 72,
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
  const held = frame.easing === 'hold';
  return (
    <div className={`keyframe-curve-editor ${disabled ? 'is-disabled' : ''}`}>
      <div className="keyframe-curve-chart" ref={chart}>
        <svg
          viewBox="0 0 220 160"
          role="img"
          aria-label={`${frame.easing} time and progress curve`}
        >
          <path
            className="keyframe-curve-grid"
            d="M22 44H198M22 80H198M22 116H198M22 44V116M110 44V116M198 44V116"
          />
          {!held && (
            <path
              className="keyframe-curve-arms"
              d={`M22 116L${px(curve[0])} ${py(curve[1])}M198 44L${px(curve[2])} ${py(curve[3])}`}
            />
          )}
          <path
            className="keyframe-curve-path"
            d={
              held
                ? 'M22 116H198V44'
                : `M22 116C${px(curve[0])} ${py(curve[1])} ${px(curve[2])} ${py(curve[3])} 198 44`
            }
          />
          <circle cx="22" cy="116" r="3" />
          <circle cx="198" cy="44" r="3" />
          <text x="22" y="148">
            Start
          </text>
          <text x="198" y="148" textAnchor="end">
            Next keyframe
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
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key))
                  return;
                event.preventDefault();
                event.stopPropagation();
                const step = event.shiftKey ? 0.1 : 0.02;
                change({
                  easing: 'custom',
                  curve: moveHandle(
                    index,
                    curve[index] +
                      (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
                    curve[index + 1] +
                      (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0),
                  ),
                });
              }}
            />
          ))}
      </div>
      <div className="keyframe-curve-copy">
        <label>
          <span>Motion curve</span>
          <select
            aria-label={`Keyframe curve for ${name}`}
            value={frame.easing}
            disabled={disabled}
            onChange={(event) =>
              change({
                easing: event.target.value as PropertyKeyframe['easing'],
                curve: event.target.value === 'custom' ? curve : undefined,
              })
            }
          >
            <option value="linear">Linear</option>
            <option value="ease-in-out">Smooth</option>
            <option value="ease-in">Ease in</option>
            <option value="ease-out">Ease out</option>
            <option value="hold">Hold</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <p>
          {disabled
            ? 'Add a later keyframe to shape the movement between them.'
            : held
              ? 'Keep this value until the next keyframe.'
              : 'Drag the handles to adjust how this keyframe moves to the next.'}
        </p>
      </div>
    </div>
  );
}
