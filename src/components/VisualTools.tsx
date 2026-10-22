import { useEffect, useRef, useState } from 'react';
import type { Layer } from '../core/types';
import './VisualTools.css';

type Patch = (value: Partial<Layer>, record?: boolean) => void;
const PALETTE = ['#2b2d42', '#8d99ae', '#edf2f4', '#ef233c', '#d90429'];
const MASKS = ['none', 'rectangle', 'rounded', 'ellipse', 'diamond'] as const;

export function elementColorProperty(layer: Layer): 'fill' | 'stroke' {
  const outline =
    layer.kind === 'svg' &&
    ['none', 'transparent'].includes(layer.fill) &&
    layer.stroke &&
    !['none', 'transparent'].includes(layer.stroke);
  return layer.kind === 'drawing' || outline ? 'stroke' : 'fill';
}

/** A range drag is one undo step; keyboard and typed changes stay independent. */
function PercentControl({
  label,
  value,
  max = 100,
  onChange,
}: {
  label: string;
  value: number;
  max?: number;
  onChange: (value: number, record: boolean) => void;
}) {
  const gesture = useRef({ active: false, recorded: false });
  const reset = () => {
    gesture.current = { active: false, recorded: false };
  };
  useEffect(() => {
    window.addEventListener('pointerup', reset);
    window.addEventListener('pointercancel', reset);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('pointerup', reset);
      window.removeEventListener('pointercancel', reset);
      window.removeEventListener('blur', reset);
    };
  }, []);
  const commit = (raw: string, pointer = false) => {
    if (!raw.trim() || !Number.isFinite(Number(raw))) return;
    const next = Math.max(0, Math.min(max, Number(raw)));
    if (next === value) return;
    onChange(next, !pointer || !gesture.current.active || !gesture.current.recorded);
    if (pointer && gesture.current.active) gesture.current.recorded = true;
  };
  return (
    <div className="visual-percent">
      <label className="visual-percent-heading">
        <span>{label}</span>
        <span className="visual-percent-number">
          <input
            aria-label={`${label} value`}
            type="number"
            min={0}
            max={max}
            step={1}
            value={Number(value.toFixed(1))}
            onChange={(event) => commit(event.target.value)}
          />
          <span>%</span>
        </span>
      </label>
      <input
        type="range"
        aria-label={label}
        min={0}
        max={max}
        step={1}
        value={value}
        onPointerDown={() => {
          gesture.current = { active: true, recorded: false };
        }}
        onBlur={reset}
        onKeyDown={reset}
        onChange={(event) => commit(event.target.value, true)}
      />
    </div>
  );
}

function HexColor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  const [draft, setDraft] = useState(value.toUpperCase());
  useEffect(() => setDraft(value.toUpperCase()), [value]);
  const commit = () => {
    const next = draft.trim().replace(/^#?/, '#');
    if (/^#[0-9a-f]{6}$/i.test(next)) {
      setDraft(next.toUpperCase());
      if (next.toLowerCase() !== value.toLowerCase()) onChange(next.toLowerCase());
    } else setDraft(value.toUpperCase());
  };
  return (
    <div className="visual-color-field">
      <span>{label}</span>
      <span className="visual-color-inputs">
        <input
          type="color"
          aria-label={`${label} color`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <input
          type="text"
          aria-label={`${label} hex`}
          value={draft}
          maxLength={7}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      </span>
    </div>
  );
}

function MaskIcon({ kind }: { kind: (typeof MASKS)[number] }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="19"
      height="19"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      {kind === 'ellipse' ? (
        <ellipse cx="12" cy="12" rx="9" ry="7" />
      ) : kind === 'diamond' ? (
        <path d="m12 2 10 10-10 10L2 12Z" />
      ) : (
        <rect
          x="3"
          y="4"
          width="18"
          height="16"
          rx={kind === 'rounded' ? 5 : 1}
          strokeDasharray={kind === 'none' ? '2 2' : undefined}
        />
      )}
      {kind === 'none' && <path d="m5 19 14-14" />}
    </svg>
  );
}

export function MaskControls({ layer, patch }: { layer: Layer; patch: Patch }) {
  const mask = layer.mask ?? 'none';
  return (
    <section className="property-section visual-mask-tools">
      <h4>
        Shape mask <span className="recipe-state">One element</span>
      </h4>
      <div className="mask-choices" role="group" aria-label="Shape mask">
        {MASKS.map((kind) => (
          <button
            key={kind}
            aria-label={`${kind[0].toUpperCase() + kind.slice(1)} mask`}
            aria-pressed={mask === kind}
            onClick={() => patch({ mask: kind })}
          >
            <MaskIcon kind={kind} />
            <span>{kind[0].toUpperCase() + kind.slice(1)}</span>
          </button>
        ))}
      </div>
      {mask !== 'none' && (
        <PercentControl
          label="Mask inset"
          max={45}
          value={layer.maskInset ?? 0}
          onChange={(maskInset, record) => patch({ maskInset }, record)}
        />
      )}
      {mask === 'rounded' && (
        <PercentControl
          label="Mask roundness"
          max={50}
          value={layer.maskRoundness ?? 12}
          onChange={(maskRoundness, record) => patch({ maskRoundness }, record)}
        />
      )}
      <div className="visual-flips" role="group" aria-label="Flip element">
        <button
          aria-label="Flip horizontally"
          aria-pressed={Boolean(layer.flipX)}
          onClick={() => patch({ flipX: !layer.flipX })}
        >
          <svg
            viewBox="0 0 20 20"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            aria-hidden="true"
          >
            <path d="M10 2v16M2 15V5l5 10ZM18 15V5l-5 10Z" />
          </svg>
          Horizontal
        </button>
        <button
          aria-label="Flip vertically"
          aria-pressed={Boolean(layer.flipY)}
          onClick={() => patch({ flipY: !layer.flipY })}
        >
          <svg
            viewBox="0 0 20 20"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            aria-hidden="true"
          >
            <path d="M2 10h16M5 2h10L5 7ZM5 18h10l-10-5Z" />
          </svg>
          Vertical
        </button>
      </div>
    </section>
  );
}

export function ElementColors({
  layers,
  apply,
}: {
  layers: Layer[];
  apply: (color: string) => void;
}) {
  const values = layers.map((layer) => layer[elementColorProperty(layer)]);
  const mixed = values.some((value) => value !== values[0]);
  const color = /^#[0-9a-f]{6}$/i.test(values[0] ?? '') ? values[0]! : '#2b2d42';
  return (
    <section className="property-section">
      <h4>
        Element color <span className="recipe-state">{mixed ? 'Mixed' : 'Fill & stroke'}</span>
      </h4>
      <HexColor label="Element" value={color} onChange={apply} />
      <div className="element-palette" role="group" aria-label="Element palette">
        {PALETTE.map((value) => (
          <button
            key={value}
            aria-label={`Set element color ${value}`}
            title={value.toUpperCase()}
            aria-pressed={!mixed && color.toLowerCase() === value}
            style={{ backgroundColor: value }}
            onClick={() => apply(value)}
          />
        ))}
      </div>
    </section>
  );
}

export function ImageTools({
  layer,
  patch,
  autoRemoveBackground,
}: {
  layer: Layer;
  patch: Patch;
  autoRemoveBackground: () => void;
}) {
  const removal = layer.backgroundRemoval;
  const replacement = layer.colorReplace;
  const changeBackground = (
    values: Partial<NonNullable<Layer['backgroundRemoval']>>,
    record = true,
  ) =>
    patch(
      {
        backgroundRemoval: { color: '#ffffff', tolerance: 18, softness: 10, ...removal, ...values },
      },
      record,
    );
  const changeReplacement = (values: Partial<NonNullable<Layer['colorReplace']>>, record = true) =>
    patch(
      {
        colorReplace: {
          from: '#ef233c',
          to: '#8d99ae',
          tolerance: 18,
          softness: 10,
          strength: 100,
          ...replacement,
          ...values,
        },
      },
      record,
    );
  return (
    <>
      <section className="property-section image-background-tools">
        <h4>
          Background <span className="recipe-state">{removal ? 'Removed' : 'Original'}</span>
        </h4>
        <button
          className="visual-primary-action"
          aria-label="Remove solid background"
          onClick={autoRemoveBackground}
        >
          <svg
            viewBox="0 0 20 20"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            aria-hidden="true"
          >
            <path
              d="M4 3h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
              strokeDasharray="2 2"
            />
            <path d="m6 13 7-7m-1-2 4 4M5 14l1-3 3 3-3 1Z" />
          </svg>
          Remove solid background
        </button>
        <p className="helper-copy">Remove a flat background color from logos and graphics.</p>
        <div
          className="background-color-presets"
          role="group"
          aria-label="Background color presets"
        >
          <button
            aria-pressed={removal?.color === '#ffffff'}
            onClick={() => changeBackground({ color: '#ffffff' })}
          >
            <i style={{ background: '#ffffff' }} />
            White
          </button>
          <button
            aria-pressed={removal?.color === '#00ff00'}
            onClick={() => changeBackground({ color: '#00ff00' })}
          >
            <i style={{ background: '#00ff00' }} />
            Green
          </button>
          <label className="background-custom-color" title="Choose background color">
            <input
              type="color"
              aria-label="Background color"
              value={removal?.color ?? '#ffffff'}
              onChange={(event) => changeBackground({ color: event.target.value })}
            />
            <span>Custom</span>
          </label>
        </div>
        {removal && (
          <div className="image-effect-controls">
            <HexColor
              label="Remove"
              value={removal.color}
              onChange={(color) => changeBackground({ color })}
            />
            <PercentControl
              label="Background tolerance"
              value={removal.tolerance}
              onChange={(tolerance, record) => changeBackground({ tolerance }, record)}
            />
            <PercentControl
              label="Background edge softness"
              value={removal.softness}
              onChange={(softness, record) => changeBackground({ softness }, record)}
            />
            <button
              className="secondary wide"
              onClick={() => patch({ backgroundRemoval: undefined })}
            >
              Restore background
            </button>
          </div>
        )}
      </section>
      <section className="property-section image-replace-tools">
        <details className="recipe-details">
          <summary aria-label="Replace color">
            Replace color <span>{replacement ? 'On' : 'Off'}</span>
          </summary>
          <p className="helper-copy">
            Change a color inside this image. Original pixels stay available.
          </p>
          {!replacement ? (
            <button className="secondary wide" onClick={() => changeReplacement({})}>
              Enable color replacement
            </button>
          ) : (
            <div className="image-effect-controls">
              <HexColor
                label="From"
                value={replacement.from}
                onChange={(from) => changeReplacement({ from })}
              />
              <HexColor
                label="To"
                value={replacement.to}
                onChange={(to) => changeReplacement({ to })}
              />
              <PercentControl
                label="Color replacement tolerance"
                value={replacement.tolerance}
                onChange={(tolerance, record) => changeReplacement({ tolerance }, record)}
              />
              <PercentControl
                label="Color replacement strength"
                value={replacement.strength}
                onChange={(strength, record) => changeReplacement({ strength }, record)}
              />
              <button className="secondary wide" onClick={() => patch({ colorReplace: undefined })}>
                Restore original colors
              </button>
            </div>
          )}
        </details>
      </section>
    </>
  );
}
