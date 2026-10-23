import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
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
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const validationId = useId();
  const current = SIZES.find((size) => Math.abs(size.width / size.height - width / height) < 0.001);
  const validDimension = (value: string) =>
    Number.isInteger(Number(value)) && Number(value) >= 16 && Number(value) <= 16384;
  const valid = [draftWidth, draftHeight].every(validDimension);

  useEffect(() => {
    setDraftWidth(String(width));
    setDraftHeight(String(height));
    setError('');
  }, [width, height, open]);

  useLayoutEffect(() => {
    if (!open) return;
    const align = () => {
      const bounds = trigger.current?.getBoundingClientRect();
      const panel = popover.current;
      if (!bounds || !panel) return;
      const panelWidth = panel.offsetWidth;
      const panelHeight = panel.offsetHeight;
      const below = bounds.bottom + 8;
      const top =
        below + panelHeight <= window.innerHeight - 12
          ? below
          : bounds.top - panelHeight - 8 >= 12
            ? bounds.top - panelHeight - 8
            : Math.max(12, window.innerHeight - panelHeight - 12);
      setPosition({
        top,
        left: Math.max(
          12,
          Math.min(bounds.right - panelWidth, window.innerWidth - panelWidth - 12),
        ),
      });
    };
    align();
    const first =
      popover.current?.querySelector<HTMLButtonElement>(
        '.canvas-size-presets button[aria-pressed="true"]',
      ) ?? popover.current?.querySelector<HTMLButtonElement>('.canvas-size-presets button');
    first?.focus({ preventScroll: true });
    const observer = new ResizeObserver(align);
    if (popover.current) observer.observe(popover.current);
    window.addEventListener('resize', align);
    window.addEventListener('scroll', align, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', align);
      window.removeEventListener('scroll', align, true);
    };
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
      if (nextWidth !== width || nextHeight !== height)
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
        type="button"
        ref={trigger}
        className={`canvas-size-trigger ${open ? 'is-open' : ''}`}
        aria-label="Canvas size"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={`Canvas size · ${width} × ${height} px`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="frame-mini-holder" aria-hidden="true">
          <i
            className="frame-mini"
            style={{
              width: Math.max(2, (18 * width) / Math.max(width, height)),
              height: Math.max(2, (18 * height) / Math.max(width, height)),
            }}
          />
        </span>
        <span className="canvas-size-trigger-label">
          <strong>{current?.ratio ?? 'Custom'}</strong>
          <span className="canvas-size-name">
            {width} × {height}
          </span>
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
              <div>
                <strong>Canvas size</strong>
                <span>Choose the frame for your story.</span>
              </div>
              <button
                type="button"
                aria-label="Close canvas size"
                onClick={() => {
                  setOpen(false);
                  trigger.current?.focus();
                }}
              >
                <X size={14} />
              </button>
            </div>
            <div className="canvas-size-presets" role="group" aria-label="Canvas formats">
              {SIZES.map((size) => {
                const active = width === size.width && height === size.height;
                return (
                  <button
                    type="button"
                    key={size.name}
                    aria-label={`${size.name} ${size.ratio}`}
                    aria-pressed={active}
                    className={active ? 'is-active' : ''}
                    title={size.note}
                    onClick={() => apply(size.width, size.height)}
                  >
                    <span className="frame-preset-top" aria-hidden="true">
                      <span className="frame-preview-holder">
                        <i
                          style={{
                            width: (34 * size.width) / Math.max(size.width, size.height),
                            height: (34 * size.height) / Math.max(size.width, size.height),
                          }}
                        />
                      </span>
                      <span className="frame-preset-ratio">{size.ratio}</span>
                    </span>
                    <span className="frame-size-description">
                      <strong>{size.name}</strong>
                      <span>
                        {size.width} × {size.height} px
                      </span>
                    </span>
                    {active && (
                      <span className="frame-preset-check">
                        <Check size={10} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <form
              className="canvas-size-custom"
              onSubmit={(event) => {
                event.preventDefault();
                if (valid) apply(Number(draftWidth), Number(draftHeight));
              }}
            >
              <div className="canvas-size-section-label">
                <strong>Custom size</strong>
                <span>Pixels</span>
              </div>
              <div className="canvas-size-dimensions">
                <label>
                  <span>W</span>
                  <input
                    aria-label="Canvas width"
                    aria-invalid={!validDimension(draftWidth)}
                    aria-describedby={!valid ? validationId : undefined}
                    type="number"
                    min="16"
                    max="16384"
                    step="1"
                    value={draftWidth}
                    onChange={(event) => {
                      setDraftWidth(event.target.value);
                      setError('');
                    }}
                  />
                  <small>px</small>
                </label>
                <button
                  type="button"
                  aria-label="Swap canvas width and height"
                  title="Swap dimensions"
                  onClick={() => {
                    setDraftWidth(draftHeight);
                    setDraftHeight(draftWidth);
                    setError('');
                  }}
                >
                  <RotateCw size={13} />
                </button>
                <label>
                  <span>H</span>
                  <input
                    aria-label="Canvas height"
                    aria-invalid={!validDimension(draftHeight)}
                    aria-describedby={!valid ? validationId : undefined}
                    type="number"
                    min="16"
                    max="16384"
                    step="1"
                    value={draftHeight}
                    onChange={(event) => {
                      setDraftHeight(event.target.value);
                      setError('');
                    }}
                  />
                  <small>px</small>
                </label>
              </div>
              <label className="canvas-size-scale">
                <input
                  type="checkbox"
                  checked={scaleContents}
                  aria-label="Fit contents to frame"
                  onChange={(event) => {
                    setScaleContents(event.target.checked);
                    setError('');
                  }}
                />
                <span>
                  <strong>Fit contents to frame</strong>
                  <small>Resize elements proportionally</small>
                </span>
              </label>
              <button className="canvas-size-apply" type="submit" disabled={!valid}>
                Apply size{' '}
                <span>
                  {draftWidth} × {draftHeight}
                </span>
              </button>
              {!valid && (
                <p id={validationId} role="alert">
                  Use whole pixels between 16 and 16,384.
                </p>
              )}
              {valid && error && <p role="alert">{error}</p>}
            </form>
          </div>,
          document.body,
        )}
    </div>
  );
}
