import { useId } from 'react';
import { Pause, Play, SkipBack, SkipForward } from '../icons';
import { timecode } from './Timeline';
import './PlaybackDock.css';

interface PlaybackDockProps {
  time: number;
  duration: number;
  fps: number;
  playing: boolean;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
}

/** A compact transport; the illuminated dots show actual composition progress. */
export default function PlaybackDock({
  time,
  duration,
  fps,
  playing,
  onPlayPause,
  onSeek,
}: PlaybackDockProps) {
  const id = useId().replace(/:/g, '');
  const total = Math.max(0, Number.isFinite(duration) ? duration : 0);
  const position = Math.max(0, Math.min(total, Number.isFinite(time) ? time : 0));
  const frameRate = Math.max(1, Number.isFinite(fps) ? fps : 30);
  const progress = total > 0 ? position / total : 0;
  return (
    <div
      className={`playback-dock ${playing ? 'is-playing' : ''}`}
      role="group"
      aria-label="Preview playback"
    >
      <div className="playback-dock-display">
        <div className="playback-dock-meter">
          <svg
            className="playback-dot-display"
            viewBox="0 0 175 20"
            preserveAspectRatio="none"
            fill="none"
            aria-hidden="true"
          >
            <defs>
              <pattern id={`${id}-idle-dots`} width="5" height="5" patternUnits="userSpaceOnUse">
                <circle cx="2.5" cy="2.5" r=".85" fill="#41465e" />
              </pattern>
              <pattern id={`${id}-played-dots`} width="5" height="5" patternUnits="userSpaceOnUse">
                <circle cx="2.5" cy="2.5" r=".85" fill="#edf2f4" />
              </pattern>
            </defs>
            <rect width="175" height="20" fill={`url(#${id}-idle-dots)`} />
            <rect width={175 * progress} height="20" fill={`url(#${id}-played-dots)`} />
          </svg>
          <input
            className="playback-seek"
            aria-label="Preview position"
            aria-valuetext={`${timecode(position, frameRate)} of ${timecode(total, frameRate)}`}
            type="range"
            min="0"
            max={total}
            step={1 / frameRate}
            value={position}
            disabled={total === 0}
            onChange={(event) => onSeek(Number(event.currentTarget.value))}
          />
        </div>
        <span className="playback-dock-time">{timecode(position, frameRate)}</span>
      </div>
      <div className="playback-dock-controls">
        <span className="playback-dock-caption">
          <i aria-hidden="true" />
          Preview
        </span>
        <div className="playback-dock-buttons">
          <button
            type="button"
            aria-label="Go to start"
            title="Go to start"
            onClick={() => onSeek(0)}
            disabled={total === 0}
          >
            <SkipBack size={13} />
          </button>
          <button
            type="button"
            className="playback-dock-play"
            aria-label={playing ? 'Pause' : 'Play'}
            title={playing ? 'Pause' : 'Play'}
            onClick={onPlayPause}
            disabled={total === 0}
          >
            {playing ? (
              <Pause size={13} fill="currentColor" />
            ) : (
              <Play size={13} fill="currentColor" />
            )}
          </button>
          <button
            type="button"
            aria-label="Go to end"
            title="Go to end"
            onClick={() => onSeek(total)}
            disabled={total === 0}
          >
            <SkipForward size={13} />
          </button>
        </div>
        <span className="playback-dock-duration" title="Composition duration">
          {timecode(total, frameRate)}
        </span>
      </div>
    </div>
  );
}
