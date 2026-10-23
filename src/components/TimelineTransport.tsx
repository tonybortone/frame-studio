import { Pause, Play, SkipBack, SkipForward } from '../icons';
import { timecode } from './Timeline';

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
  return (
    <div className="timeline-transport" role="group" aria-label="Timeline playback">
      <div className="timeline-transport-buttons">
        <button type="button" aria-label="Go to start" title="Go to start" onClick={() => seek(0)}>
          <SkipBack size={13} />
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
            <Pause size={13} fill="currentColor" />
          ) : (
            <Play size={13} fill="currentColor" />
          )}
        </button>
        <button
          type="button"
          aria-label="Go to end"
          title="Go to end"
          onClick={() => seek(duration)}
        >
          <SkipForward size={13} />
        </button>
      </div>
      <div className="timeline-clock" title={`Minutes : seconds : frames · ${fps} fps`}>
        <span role="timer" aria-live="off" aria-label="Current timeline time">
          {timecode(time, fps)}
        </span>
        <small aria-label="Composition duration">/ {timecode(duration, fps)}</small>
      </div>
      <span className="timeline-fps" title="Composition frame rate">
        {fps} fps
      </span>
    </div>
  );
}
