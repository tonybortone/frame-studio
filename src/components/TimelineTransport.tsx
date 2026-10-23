import { useRef, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward } from '../icons';
import { parseTimecode, timecode } from '../core/timecode';

interface Props {
  time: number;
  duration: number;
  fps: number;
  playing: boolean;
  seek: (time: number) => void;
  togglePlayback: () => void;
}

export default function TimelineTransport({
  time,
  duration,
  fps,
  playing,
  seek,
  togglePlayback,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);
  const cancelled = useRef(false);
  const clock = useRef<HTMLButtonElement>(null);
  const lastFrame = Math.max(0, duration - 1 / fps);
  const commit = (blur = false) => {
    if (cancelled.current) return;
    const next = parseTimecode(draft, fps);
    if (next === null) {
      if (blur) {
        setEditing(false);
        setInvalid(false);
      } else setInvalid(true);
      return;
    }
    seek(Math.min(next, lastFrame));
    setEditing(false);
    setInvalid(false);
    if (!blur) requestAnimationFrame(() => clock.current?.focus());
  };
  return (
    <div className="timeline-transport" role="group" aria-label="Timeline playback">
      <div className="timeline-transport-buttons">
        <button type="button" aria-label="Go to start" title="Go to start" onClick={() => seek(0)}>
          <SkipBack size={15} />
        </button>
        <button
          type="button"
          aria-label="Previous frame"
          title="Previous frame"
          disabled={time <= 0}
          onClick={() => seek(Math.max(0, Math.round(time * fps) - 1) / fps)}
        >
          <FrameStep backward />
        </button>
        <button
          type="button"
          className="timeline-play"
          aria-label={playing ? 'Pause' : 'Play'}
          title={playing ? 'Pause (Space)' : 'Play (Space)'}
          aria-pressed={playing}
          onClick={togglePlayback}
        >
          {playing ? (
            <Pause size={16} fill="currentColor" />
          ) : (
            <Play size={16} fill="currentColor" />
          )}
        </button>
        <button
          type="button"
          aria-label="Next frame"
          title="Next frame"
          disabled={time >= lastFrame}
          onClick={() => seek(Math.min(lastFrame, (Math.round(time * fps) + 1) / fps))}
        >
          <FrameStep />
        </button>
        <button
          type="button"
          aria-label="Go to end"
          title="Go to end"
          onClick={() => seek(duration)}
        >
          <SkipForward size={15} />
        </button>
      </div>
      <div className="timeline-clock">
        <div className="timeline-clock-values">
          {editing ? (
            <div className="timeline-time-entry">
              <input
                autoFocus
                type="text"
                aria-label="Jump to time"
                aria-describedby="timeline-time-hint"
                aria-invalid={invalid || undefined}
                value={draft}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setInvalid(false);
                }}
                onBlur={() => commit(true)}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commit();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelled.current = true;
                    setEditing(false);
                    setInvalid(false);
                    requestAnimationFrame(() => clock.current?.focus());
                  }
                }}
              />
              <span
                id="timeline-time-hint"
                className="timeline-time-hint"
                role={invalid ? 'alert' : undefined}
              >
                {invalid
                  ? `Use seconds or mm:ss:ff (frames 0–${Math.round(fps) - 1}).`
                  : 'Seconds or mm:ss:ff · Enter to jump'}
              </span>
            </div>
          ) : (
            <button
              ref={clock}
              type="button"
              aria-label="Current timeline time"
              title="Click to jump to a time · minutes : seconds : frames"
              className="timeline-time-button"
              onClick={() => {
                cancelled.current = false;
                setDraft(timecode(time, fps));
                setEditing(true);
              }}
            >
              {timecode(time, fps)}
            </button>
          )}
          <small aria-label="Composition duration">/ {timecode(duration, fps)}</small>
        </div>
      </div>
      <span className="timeline-fps" title="Composition frame rate">
        {fps} fps
      </span>
    </div>
  );
}

function FrameStep({ backward = false }: { backward?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={backward ? { transform: 'rotate(180deg)' } : undefined}
    >
      <path
        d="m5 4 4 4-4 4M11 3v10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
