import { useEffect, useRef } from 'react';
import type { Project } from '../core/types';
import { MediaCache, renderFrame } from '../engine/renderer';

/** A snapshot of the real editable composition, using the same renderer as export. */
export default function TemplatePreview({ project }: { project: Project }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    const media = new MediaCache();
    renderFrame(context, project, Math.min(2, project.duration * 0.45), media);
    return () => media.dispose();
  }, [project]);
  const scale = Math.min(400 / project.width, 240 / project.height);
  return (
    <div className="fs-template-preview">
      <canvas
        ref={canvas}
        width={Math.round(project.width * scale)}
        height={Math.round(project.height * scale)}
        role="img"
        aria-label={`Preview of ${project.name}`}
      />
    </div>
  );
}
