import { useRef, useState } from 'react';
import { ArrowUpRight, X, Film, Image, FileCode2, Check, LoaderCircle } from '../icons';
import type { Project } from '../core/types';
import { MediaCache } from '../engine/renderer';
import { exportPng, exportSvg, exportVideo, getVideoFormats, saveBlob } from '../engine/export';
interface Props {
  project: Project;
  time: number;
  media: MediaCache;
  close: () => void;
}
export default function ExportDialog({ project, time, media, close }: Props) {
  const formats = getVideoFormats();
  const [format, setFormat] = useState(formats[0]?.id ?? 'png');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const exporting = progress !== null && !done;
  const run = async () => {
    setError('');
    setDone(false);
    setProgress(0);
    controller.current = new AbortController();
    try {
      const video = formats.find((f) => f.id === format);
      const blob = video
        ? await exportVideo(project, media, video, setProgress, controller.current.signal)
        : format === 'png'
          ? await exportPng(project, media, time)
          : exportSvg(project, time);
      if (controller.current.signal.aborted) {
        setProgress(null);
        return;
      }
      const name = project.name.replace(/[^\w\s-]/g, '').trim() || 'Frame Studio';
      const saved = await saveBlob(blob, `${name}.${video?.extension ?? format}`);
      setDone(saved);
      if (!saved) setProgress(null);
      else setProgress(1);
    } catch (e) {
      setProgress(null);
      if (!(e instanceof DOMException && e.name === 'AbortError'))
        setError(e instanceof Error ? e.message : 'Export failed. Please try again.');
    }
  };
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !exporting) close();
      }}
    >
      <section
        className="export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-heading"
      >
        <div className="modal-header">
          <div className="export-icon">
            <ArrowUpRight size={24} />
          </div>
          <button
            aria-label="Close export"
            onClick={() => {
              controller.current?.abort();
              close();
            }}
          >
            <X size={18} />
          </button>
        </div>
        <p className="eyebrow">SAVE A COPY</p>
        <h2 id="export-heading">Export your creation</h2>
        <p className="modal-copy">Choose a format. Your export is rendered on this device.</p>
        <div className="export-formats">
          {[
            ...formats.map((f) => ({ id: f.id, label: f.label, icon: Film })),
            { id: 'png', label: 'PNG · current frame', icon: Image },
            { id: 'svg', label: 'SVG · editable frame', icon: FileCode2 },
          ].map((f) => (
            <button
              disabled={exporting}
              key={f.id}
              className={format === f.id ? 'active' : ''}
              aria-pressed={format === f.id}
              onClick={() => {
                setFormat(f.id);
                setDone(false);
                setProgress(null);
                setError('');
              }}
            >
              <f.icon size={18} />
              <span>{f.label}</span>
              {format === f.id && <Check size={16} />}
            </button>
          ))}
        </div>
        <div className="export-details">
          <div>
            <span>Resolution</span>
            <strong>
              {project.width} × {project.height}
            </strong>
          </div>
          <div>
            <span>Frame rate</span>
            <strong>{project.fps} fps</strong>
          </div>
          <div>
            <span>Duration</span>
            <strong>{project.duration.toFixed(1)} sec</strong>
          </div>
        </div>
        {formats.some((f) => f.id === format) && (
          <p className="helper-copy">
            Video exports in real time. Keep this window open for about{' '}
            {Math.ceil(project.duration)} seconds. MP4 is shown when supported by your device.
          </p>
        )}
        {format === 'svg' && (
          <p className="helper-copy">
            Exports editable vector layers and embedded images. Hide video layers first, or choose
            PNG for a complete frame.
          </p>
        )}
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        {progress !== null && (
          <div className="export-progress">
            <div style={{ width: `${progress * 100}%` }} />
          </div>
        )}
        <button className="primary export-submit" disabled={exporting} onClick={() => void run()}>
          {exporting ? (
            <LoaderCircle size={16} className="spin" />
          ) : done ? (
            <Check size={16} />
          ) : (
            <ArrowUpRight size={17} />
          )}{' '}
          {exporting
            ? `Rendering ${Math.round((progress ?? 0) * 100)}%`
            : done
              ? 'Export again'
              : 'Export ' +
                (formats.find((f) => f.id === format)?.extension.toUpperCase() ??
                  format.toUpperCase())}
        </button>
        {done && (
          <p className="export-success" role="status">
            Your export is ready.
          </p>
        )}
        {exporting && (
          <button className="text-button" onClick={() => controller.current?.abort()}>
            Cancel export
          </button>
        )}
      </section>
    </div>
  );
}
