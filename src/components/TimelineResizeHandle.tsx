import { useRef } from 'react';

export function maxTimelineHeight() {
  return Math.max(190, Math.min(window.innerHeight * 0.6, window.innerHeight - 300));
}

export default function TimelineResizeHandle({
  height,
  onChange,
}: {
  height: number;
  onChange: (height: number) => void;
}) {
  const drag = useRef<{ y: number; height: number } | null>(null);
  const resize = (value: number) => onChange(Math.max(190, Math.min(maxTimelineHeight(), value)));
  return (
    <div
      className="timeline-resize-handle"
      role="separator"
      aria-label="Timeline height"
      aria-orientation="horizontal"
      aria-valuemin={190}
      aria-valuemax={Math.round(maxTimelineHeight())}
      aria-valuenow={Math.round(height)}
      tabIndex={0}
      title="Drag to resize the timeline"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        drag.current = { y: event.clientY, height };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (drag.current) resize(drag.current.height + drag.current.y - event.clientY);
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          event.stopPropagation();
          resize(height + (event.key === 'ArrowUp' ? 20 : -20));
        }
      }}
    >
      <span />
    </div>
  );
}
