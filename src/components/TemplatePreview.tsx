import { useEffect, useRef, useState } from 'react';
import type { Project } from '../core/types';
import { MediaCache, renderFrame } from '../engine/renderer';

/** A snapshot of the real editable composition, using the same renderer as export. */
export default function TemplatePreview({
  project,
  interactive = true,
}: {
  project: Project;
  interactive?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(false);
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    const media = new MediaCache();
    let raf = 0;
    const start = performance.now();
    let previous = -Infinity;
    const draw = (now: number) => {
      if (now - previous > 40) {
        const time = playing
          ? ((now - start) / 1000) % project.duration
          : Math.min(2, project.duration * 0.45);
        renderFrame(context, project, time, media);
        previous = now;
      }
      if (playing) raf = requestAnimationFrame(draw);
    };
    draw(start);
    return () => {
      cancelAnimationFrame(raf);
      media.dispose();
    };
  }, [project, playing]);
  const scale = Math.min(400 / project.width, 240 / project.height);
  const artwork = (
    <canvas
      ref={canvas}
      width={Math.round(project.width * scale)}
      height={Math.round(project.height * scale)}
      role="img"
      aria-label={`Preview of ${project.name}`}
    />
  );
  if (!interactive) return <div className="fs-template-preview">{artwork}</div>;
  return (
    <button
      type="button"
      className="fs-template-preview"
      aria-label={`${playing ? 'Pause' : 'Play'} preview: ${project.name}`}
      aria-pressed={playing}
      onPointerEnter={() => {
        if (!reducedMotion()) setPlaying(true);
      }}
      onPointerLeave={() => setPlaying(false)}
      onFocus={() => {
        if (!reducedMotion()) setPlaying(true);
      }}
      onBlur={() => setPlaying(false)}
      onClick={() => setPlaying((value) => !value)}
    >
      {artwork}
      <span className="fs-template-play-badge" aria-hidden="true">
        {playing ? 'Ⅱ Preview' : '▷ Preview'}
      </span>
    </button>
  );
}
