import { Pause, Play } from '../icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Layer, Project } from '../core/types';
import { MediaCache, renderFrame, syncMedia } from '../engine/renderer';
import './KeyframeMotionPreview.css';

interface Props {
  project: Project;
  layer: Layer;
  /** Times relative to the selected clip, after any trim offset. */
  from: number;
  to: number;
  onProgress?: (progress: number) => void;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

/** Clip/project ends are exclusive; use the final frame that can actually appear. */
function lastVisibleTime(project: Project, layer: Layer) {
  const fps = Number.isFinite(project.fps) && project.fps > 0 ? project.fps : 30;
  const end = Math.min(layer.start + layer.duration, project.duration);
  const lastFrame = (Math.ceil(end * fps - 1e-7) - 1) / fps;
  // A sub-frame clip still has a valid initial pose even without an interior grid frame.
  const beforeEnd = end - Math.min(1e-7, Math.max(0, end - layer.start) / 2);
  return Math.max(0, Math.min(beforeEnd, Math.max(layer.start, lastFrame)));
}

/** A silent, isolated view of the actual composition between two keyframes. */
export default function KeyframeMotionPreview({ project, layer, from, to, onProgress }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [still, setStill] = useState(0.5);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const requestDraw = useRef<() => void>(() => undefined);
  const revision = useRef(0);
  const startTime = useRef(0);
  const displayedProgress = useRef(0.5);
  const callback = useRef(onProgress);
  callback.current = onProgress;
  const begin = clamp(Number.isFinite(from) ? from : 0, 0, layer.duration);
  const finish = clamp(Number.isFinite(to) ? to : begin, begin, layer.duration);
  const previewProject = useMemo(() => {
    const visibleEnd = lastVisibleTime(project, layer);
    const intervalStart = Math.min(layer.start + begin, visibleEnd);
    const intervalEnd = Math.min(layer.start + finish, visibleEnd);
    return {
      ...project,
      // An asset outside this interval cannot affect any rendered preview pose.
      // Keep inclusive starts and exclusive ends, matching the shared renderer.
      layers: project.layers.filter(
        (item) =>
          !item.hidden &&
          item.kind !== 'audio' &&
          item.duration > 0 &&
          item.start <= intervalEnd &&
          item.start + item.duration > intervalStart,
      ),
    };
  }, [project, layer.start, layer.duration, begin, finish]);
  const current = useRef({ project: previewProject, layer, begin, finish, playing, still });
  current.current = { project: previewProject, layer, begin, finish, playing, still };
  // Editing values or curves must not repeatedly decode the same imported media.
  const sources = previewProject.layers.filter(
    (item) => item.src && (item.kind === 'image' || item.kind === 'video'),
  );
  const sourceRevision = useRef({ layers: sources, value: 0 });
  if (
    sources.length !== sourceRevision.current.layers.length ||
    sources.some((item, index) => {
      const previous = sourceRevision.current.layers[index];
      return item.id !== previous?.id || item.kind !== previous.kind || item.src !== previous.src;
    })
  ) {
    sourceRevision.current = { layers: sources, value: sourceRevision.current.value + 1 };
  }
  const mediaKey = sourceRevision.current.value;

  useEffect(() => {
    setPlaying(false);
    setStill(0.5);
  }, [layer, begin, finish]);

  useEffect(() => {
    revision.current += 1;
    if (playing) startTime.current = performance.now();
    requestDraw.current();
  }, [previewProject, layer, begin, finish, playing, still]);

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.hidden) {
        setStill(displayedProgress.current);
        setPlaying(false);
      } else requestDraw.current();
    };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden);
  }, []);

  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) {
      setStatus('error');
      setError('This browser cannot display the animation preview.');
      return;
    }
    const media = new MediaCache();
    let disposed = false;
    let ready = false;
    let failed = false;
    let raf = 0;
    let lastDraw = -Infinity;
    let seekTimer: ReturnType<typeof setTimeout> | undefined;
    let pending: { project: Project; time: number; progress: number; revision: number } | null =
      null;
    const mediaErrorCleanups: Array<() => void> = [];
    setStatus('loading');
    setError('');
    const fail = (message: string) => {
      if (disposed) return;
      failed = true;
      clearTimeout(seekTimer);
      cancelAnimationFrame(raf);
      raf = 0;
      pending = null;
      setError(message);
      setStatus('error');
      setPlaying(false);
    };
    const queue = () => {
      if (!disposed && !failed && !raf) raf = requestAnimationFrame(draw);
    };
    const present = (frame: NonNullable<typeof pending>) => {
      if (frame.revision !== revision.current) return;
      renderFrame(context, frame.project, frame.time, media);
      displayedProgress.current = frame.progress;
      if (panel.current) panel.current.dataset.previewProgress = String(frame.progress);
      callback.current?.(frame.progress);
      lastDraw = performance.now();
    };
    const seeking = () =>
      media.mediaEntries().some(([, entry]) => (entry.element as HTMLMediaElement).seeking);
    function draw(now: number) {
      raf = 0;
      if (disposed || failed || !ready || document.hidden) return;
      try {
        // Finish the requested decoded video frame before advancing the clock again.
        if (pending) {
          if (seeking()) return;
          clearTimeout(seekTimer);
          const frame = pending;
          pending = null;
          present(frame);
          if (current.current.playing || frame.revision !== revision.current) queue();
          return;
        }
        const snapshot = current.current;
        if (snapshot.playing && now - lastDraw < 1000 / 30) {
          queue();
          return;
        }
        const duration = snapshot.finish - snapshot.begin;
        const progress =
          snapshot.playing && duration > 0
            ? (((now - startTime.current) / 1000) % duration) / duration
            : snapshot.still;
        // The curve bead reports this sampled pose, including a clip-end frame clamp.
        const time = Math.min(
          snapshot.layer.start + snapshot.begin + progress * duration,
          lastVisibleTime(snapshot.project, snapshot.layer),
        );
        const effectiveProgress =
          duration > 0 ? clamp((time - snapshot.layer.start - snapshot.begin) / duration, 0, 1) : 0;
        const frame = {
          project: snapshot.project,
          time,
          progress: effectiveProgress,
          revision: revision.current,
        };
        // This never calls media.play(), creates an audio mix, or changes the editor playhead.
        syncMedia(snapshot.project, time, false, media);
        if (seeking()) {
          pending = frame;
          seekTimer = setTimeout(
            () => fail('This video could not seek to the preview frame.'),
            10_000,
          );
          return;
        }
        present(frame);
        if (snapshot.playing) queue();
      } catch (reason) {
        fail(reason instanceof Error ? reason.message : 'The animation preview is unavailable.');
      }
    }
    const unsubscribe = media.subscribe(queue);
    requestDraw.current = queue;
    void media
      .prepare(current.current.project.layers)
      .then(() => {
        if (disposed) return;
        for (const [, entry] of media.mediaEntries()) {
          const element = entry.element as HTMLMediaElement;
          element.muted = true;
          const onError = () => fail('This video could not be decoded for the preview.');
          element.addEventListener('error', onError);
          mediaErrorCleanups.push(() => element.removeEventListener('error', onError));
        }
        ready = true;
        setStatus('ready');
        queue();
      })
      .catch((reason: unknown) =>
        fail(reason instanceof Error ? reason.message : 'Preview media could not be loaded.'),
      );
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      clearTimeout(seekTimer);
      unsubscribe();
      mediaErrorCleanups.forEach((cleanup) => cleanup());
      media.dispose();
      if (requestDraw.current === queue) requestDraw.current = () => undefined;
    };
  }, [project.id, mediaKey]);

  const showPose = (progress: number) => {
    setPlaying(false);
    setStill(progress);
  };
  const scale = Math.min(256 / project.width, 144 / project.height);
  return (
    <div className="keyframe-motion-preview" ref={panel} data-preview-progress="0.5">
      <div className="keyframe-motion-preview-heading">
        <span>This move</span>
        <button
          type="button"
          aria-label={`${playing ? 'Pause animation preview' : 'Preview animation'} for ${layer.name}`}
          aria-pressed={playing}
          disabled={status !== 'ready' || finish <= begin}
          onClick={() => {
            if (playing) setStill(displayedProgress.current);
            setPlaying((value) => !value);
          }}
        >
          {playing ? <Pause size={11} /> : <Play size={11} />}
          {playing ? 'Pause' : 'Play'}
        </button>
      </div>
      <div className="keyframe-motion-preview-artwork">
        <canvas
          ref={canvas}
          width={Math.max(1, Math.round(project.width * scale))}
          height={Math.max(1, Math.round(project.height * scale))}
          role="img"
          aria-label={`Animation preview for ${layer.name}`}
          style={{ aspectRatio: `${project.width} / ${project.height}` }}
        />
        {status !== 'ready' && (
          <span className="keyframe-motion-preview-status" role="status" title={error || undefined}>
            {status === 'loading' ? 'Loading preview…' : error}
          </span>
        )}
      </div>
      <div className="keyframe-motion-preview-poses">
        <button
          type="button"
          aria-label={`Preview start for ${layer.name}`}
          aria-pressed={!playing && still === 0}
          disabled={status !== 'ready'}
          onClick={() => showPose(0)}
        >
          Start
        </button>
        <span aria-hidden="true">→</span>
        <button
          type="button"
          aria-label={`Preview end for ${layer.name}`}
          title={
            layer.start + finish > lastVisibleTime(project, layer)
              ? 'Last visible frame'
              : 'End pose'
          }
          aria-pressed={!playing && still === 1}
          disabled={status !== 'ready'}
          onClick={() => showPose(1)}
        >
          End
        </button>
      </div>
    </div>
  );
}
