import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from '../icons';
import './CompactSelect.css';

interface Option {
  value: string;
  label: string;
  hint?: string;
}
interface Props {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

/** A small, keyboard-accessible picker shared by the animation controls. */
export default function CompactSelect({ label, value, options, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(-1);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const selected = options.findIndex((option) => option.value === value);
  const close = (restore = false) => {
    setOpen(false);
    if (restore) trigger.current?.focus();
  };
  useLayoutEffect(() => {
    if (!open) return;
    const align = () => {
      const box = trigger.current?.getBoundingClientRect();
      const panel = list.current;
      if (!box || !panel) return;
      setPosition({
        left: Math.max(8, Math.min(box.left, window.innerWidth - panel.offsetWidth - 8)),
        top: Math.max(
          8,
          box.bottom + panel.offsetHeight + 8 <= window.innerHeight
            ? box.bottom + 6
            : box.top - panel.offsetHeight - 6,
        ),
      });
    };
    align();
    window.addEventListener('resize', align);
    window.addEventListener('scroll', align, true);
    const observer = new ResizeObserver(align);
    if (list.current) observer.observe(list.current);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', align);
      window.removeEventListener('scroll', align, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const buttons = list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
    buttons?.[Math.max(0, selected)]?.focus();
    const outside = (event: globalThis.PointerEvent) => {
      if (
        !list.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        close();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="compact-select-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }
        }}
      >
        <span>{options[selected]?.label ?? value}</span>
        <ChevronDown size={12} />
      </button>
      {open &&
        createPortal(
          <div
            ref={list}
            id={id}
            role="listbox"
            aria-label={label}
            className="compact-select-menu"
            style={position}
            onKeyDown={(event) => {
              event.stopPropagation();
              const buttons = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'),
              );
              const current = buttons.indexOf(event.target as HTMLButtonElement);
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? buttons.length - 1
                    : event.key === 'ArrowDown'
                      ? (current + 1) % buttons.length
                      : event.key === 'ArrowUp'
                        ? (current - 1 + buttons.length) % buttons.length
                        : -1;
              if (next >= 0) {
                event.preventDefault();
                event.stopPropagation();
                buttons[next]?.focus();
              }
              if (event.key === 'Tab') close(true);
            }}
          >
            <div
              className="compact-select-highlight"
              style={{
                transform: `translateY(${Math.max(0, hover) * 34}px)`,
                opacity: hover < 0 ? 0 : 1,
              }}
              aria-hidden="true"
            />
            {options.map((option, index) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onPointerEnter={() => setHover(index)}
                onFocus={() => setHover(index)}
                onClick={() => {
                  onChange(option.value);
                  close(true);
                }}
              >
                <span>{option.label}</span>
                {option.hint && <small>{option.hint}</small>}
                {option.value === value && <Check size={13} />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
