import type { CSSProperties } from 'react';
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

/** One transport beside the timeline: playback, time, and a visible seek control. */
export default function PlaybackDock({
  time,
  duration,
  fps,
  playing,
  onPlayPause,
  onSeek,
}: PlaybackDockProps) {
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
          title={playing ? 'Pause (Space)' : 'Play (Space)'}
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
      <div className="playback-dock-clock" aria-label="Playback time">
        <span className="playback-dock-time">{timecode(position, frameRate)}</span>
        <span className="playback-dock-slash" aria-hidden="true">
          /
        </span>
        <span className="playback-dock-duration" title="Composition duration">
          {timecode(total, frameRate)}
        </span>
      </div>
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
        style={{ '--playback-progress': `${progress * 100}%` } as CSSProperties}
        onChange={(event) => onSeek(Number(event.currentTarget.value))}
      />
    </div>
  );
}
