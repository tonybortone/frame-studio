import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, RotateCw, X } from '../icons';
import './CanvasSizePicker.css';

const SIZES = [
  { name: 'Landscape', ratio: '16:9', width: 1920, height: 1080, note: 'YouTube · presentations' },
  { name: 'Portrait', ratio: '9:16', width: 1080, height: 1920, note: 'Reels · stories · shorts' },
  { name: 'Square', ratio: '1:1', width: 1080, height: 1080, note: 'Posts · announcements' },
  { name: 'Social', ratio: '4:5', width: 1080, height: 1350, note: 'Feed · product stories' },
];

interface Props {
  width: number;
  height: number;
  onChange: (width: number, height: number, scaleContents: boolean) => void;
}

export default function CanvasSizePicker({ width, height, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draftWidth, setDraftWidth] = useState(String(width));
  const [draftHeight, setDraftHeight] = useState(String(height));
  const [scaleContents, setScaleContents] = useState(true);
  const [error, setError] = useState('');
  const container = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const current = SIZES.find((size) => Math.abs(size.width / size.height - width / height) < 0.001);
  const valid = [draftWidth, draftHeight].every(
    (value) => Number.isInteger(Number(value)) && Number(value) >= 16 && Number(value) <= 16384,
  );

  useEffect(() => {
    setDraftWidth(String(width));
    setDraftHeight(String(height));
    setError('');
  }, [width, height, open]);

  useLayoutEffect(() => {
    if (!open) return;
    const align = () => {
      const bounds = trigger.current?.getBoundingClientRect();
      if (bounds)
        setPosition({
          top: bounds.bottom + 8,
          right: Math.max(12, window.innerWidth - bounds.right),
        });
    };
    align();
    popover.current?.querySelector<HTMLButtonElement>('.canvas-size-presets button')?.focus();
    window.addEventListener('resize', align);
    return () => window.removeEventListener('resize', align);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !container.current?.contains(event.target) &&
        !popover.current?.contains(event.target)
      )
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open]);

  function apply(nextWidth: number, nextHeight: number) {
    try {
      setError('');
      onChange(nextWidth, nextHeight, scaleContents);
      setOpen(false);
      trigger.current?.focus();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'This frame size could not be applied.');
    }
  }

  return (
    <div className="canvas-size-picker" ref={container}>
      <button
        ref={trigger}
        className={`canvas-size-trigger ${open ? 'is-open' : ''}`}
        aria-label="Canvas size"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span
          className="frame-mini"
          style={{
            width: (18 * width) / Math.max(width, height),
            height: (18 * height) / Math.max(width, height),
          }}
          aria-hidden="true"
        />
        <span>
          {current?.ratio ?? 'Custom'}{' '}
          <span className="canvas-size-name">{current?.name ?? 'Frame'}</span>
        </span>
        <ChevronDown size={12} />
      </button>
      {open &&
        createPortal(
          <div
            ref={popover}
            style={position}
            className="canvas-size-popover"
            role="dialog"
            aria-label="Canvas size settings"
            onKeyDown={(event) => event.stopPropagation()}
          >
            <div className="canvas-size-heading">
              <strong>Frame size</strong>
              <button
                aria-label="Close canvas size"
                onClick={() => {
                  setOpen(false);
                  trigger.current?.focus();
                }}
              >
                <X size={14} />
              </button>
            </div>
            <div className="canvas-size-presets">
              {SIZES.map((size) => {
                const active = width === size.width && height === size.height;
                return (
                  <button
                    key={size.name}
                    aria-label={`${size.name} ${size.ratio}`}
                    aria-pressed={active}
                    className={active ? 'is-active' : ''}
                    onClick={() => apply(size.width, size.height)}
                  >
                    <span className="frame-preview-holder">
                      <i
                        style={{
                          width: (26 * size.width) / Math.max(size.width, size.height),
                          height: (26 * size.height) / Math.max(size.width, size.height),
                        }}
                      />
                    </span>
                    <span className="frame-size-description">
                      <strong>
                        {size.name}
                        <small>{size.ratio}</small>
                      </strong>
                      <span>{size.note}</span>
                    </span>
                    {active ? (
                      <Check size={13} />
                    ) : (
                      <span className="frame-size-pixels">
                        {size.width}
                        <br />
                        {size.height}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="canvas-size-custom">
              <div className="canvas-size-dimensions">
                <label>
                  <span>W</span>
                  <input
                    aria-label="Canvas width"
                    type="number"
                    min="16"
                    max="16384"
                    step="1"
                    value={draftWidth}
                    onChange={(event) => setDraftWidth(event.target.value)}
                  />
                  <small>px</small>
                </label>
                <button
                  aria-label="Swap canvas width and height"
                  title="Swap dimensions"
                  onClick={() => {
                    setDraftWidth(draftHeight);
                    setDraftHeight(draftWidth);
                  }}
                >
                  <RotateCw size={13} />
                </button>
                <label>
                  <span>H</span>
                  <input
                    aria-label="Canvas height"
                    type="number"
                    min="16"
                    max="16384"
                    step="1"
                    value={draftHeight}
                    onChange={(event) => setDraftHeight(event.target.value)}
                  />
                  <small>px</small>
                </label>
              </div>
              <label className="canvas-size-scale">
                <input
                  type="checkbox"
                  checked={scaleContents}
                  onChange={(event) => setScaleContents(event.target.checked)}
                />
                Fit contents to frame
              </label>
              <button
                className="canvas-size-apply"
                disabled={!valid}
                onClick={() => apply(Number(draftWidth), Number(draftHeight))}
              >
                Apply size{' '}
                <span>
                  {draftWidth} × {draftHeight}
                </span>
              </button>
              {!valid && <p role="alert">Use whole pixels between 16 and 16,384.</p>}
              {valid && error && <p role="alert">{error}</p>}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
