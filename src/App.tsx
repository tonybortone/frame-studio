import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ArrowUpFromLine,
  ChevronDown,
  Check,
  Undo2,
  Redo2,
  MousePointer2,
  PenTool,
  Type,
  Square,
  Group,
  Component,
  Copy,
  Trash2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Scissors,
  Minus,
  Plus,
  Maximize,
  Save,
  FolderOpen,
  X,
  Keyboard,
  Command,
  Film,
  CheckCheck,
} from './icons';
import Sidebar from './components/Sidebar';
import Inspector from './components/Inspector';
import Timeline, { timecode } from './components/Timeline';
import CanvasStage from './components/CanvasStage';
import ExportDialog from './components/ExportDialog';
import { useEditor } from './hooks/useEditor';
import {
  createLayer,
  parseProject,
  duplicateLayers,
  splitLayer,
  changeAspectRatio,
} from './core/project';
import { importSvg } from './core/svg';
import { LAYER_COLORS, LAYER_LABELS, type Layer } from './core/types';
import { MediaCache, syncMedia, stopMedia } from './engine/renderer';
import { importMedia } from './engine/assets';
import { saveBlob } from './engine/export';

const ASPECTS = [
  { label: '16:9', name: 'Landscape', w: 1920, h: 1080 },
  { label: '9:16', name: 'Portrait', w: 1080, h: 1920 },
  { label: '1:1', name: 'Square', w: 1080, h: 1080 },
  { label: '4:5', name: 'Social', w: 1080, h: 1350 },
];
export default function App() {
  const { project, ready, saveStatus, update, checkpoint, undo, redo } = useEditor();
  const [selected, setSelected] = useState<string[]>([]);
  const [time, setTime] = useState(1.2);
  const [playing, setPlaying] = useState(false);
  const [tool, setTool] = useState<'select' | 'draw'>('select');
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [timelineZoom, setTimelineZoom] = useState(66);
  const [exportOpen, setExportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [projectMenu, setProjectMenu] = useState(false);
  const [toast, setToast] = useState('');
  const [componentName, setComponentName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const media = useRef(new MediaCache()).current;
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 5500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => () => media.dispose(), [media]);
  useEffect(() => {
    setSelected((ids) => {
      const next = ids.filter((id) => project.layers.some((l) => l.id === id));
      return next.length === ids.length ? ids : next;
    });
  }, [project.layers]);
  useEffect(() => {
    if (!playing || exportOpen) return;
    const started = performance.now(),
      initial = time;
    let frame = 0;
    const tick = () => {
      const next = initial + (performance.now() - started) / 1000;
      if (next >= project.duration) {
        setTime(Math.max(0, project.duration - 1 / project.fps));
        setPlaying(false);
        return;
      }
      setTime(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // The playback clock deliberately captures the initial playhead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, project.duration, project.fps, exportOpen]);
  useEffect(() => {
    if (exportOpen) return;
    syncMedia(project, time, playing, media);
    if (media.playbackError) {
      notify(media.playbackError.message);
      media.playbackError = null;
      setPlaying(false);
    }
  }, [project, time, playing, media, exportOpen, notify]);
  const seek = useCallback(
    (value: number) => {
      setPlaying(false);
      setTime(Math.max(0, Math.min(project.duration - 1 / project.fps, value)));
    },
    [project.duration, project.fps],
  );
  const change = useCallback(
    (id: string, patch: Partial<Layer>, record = true) =>
      update(
        (p) => ({ ...p, layers: p.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }),
        record,
      ),
    [update],
  );
  const add = useCallback(
    (layers: Layer[]) => {
      if (!layers.length) return;
      try {
        const next = {
          ...project,
          layers: [...project.layers, ...layers],
          duration: Math.max(project.duration, ...layers.map((l) => l.start + l.duration)),
        };
        parseProject(JSON.stringify(next));
        update(() => next);
        setSelected(layers.map((l) => l.id));
        setTool('select');
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Could not add elements');
      }
    },
    [project, update, notify],
  );
  const remove = useCallback(() => {
    if (!selected.length) return;
    update((p) => ({ ...p, layers: p.layers.filter((l) => !selected.includes(l.id)) }));
    setSelected([]);
  }, [selected, update]);
  const duplicate = useCallback(() => {
    const copies = duplicateLayers(project.layers.filter((l) => selected.includes(l.id))).map(
      (l) => ({ ...l, x: l.x + 24, y: l.y + 24 }),
    );
    if (copies.length) add(copies);
  }, [project.layers, selected, add]);
  const group = useCallback(() => {
    if (selected.length < 2) {
      notify('Select two or more layers to group them.');
      return;
    }
    const layers = project.layers.filter((l) => selected.includes(l.id));
    if (layers.length < 2) {
      setSelected(layers.map((l) => l.id));
      return;
    }
    const existing = layers[0].groupId;
    const grouped = !!existing && layers.every((l) => l.groupId === existing);
    const groupId = grouped ? undefined : crypto.randomUUID();
    update((p) => ({
      ...p,
      layers: p.layers.map((l) => (selected.includes(l.id) ? { ...l, groupId } : l)),
    }));
    notify(grouped ? 'Selection ungrouped' : 'Elements grouped. Move them together on the canvas.');
  }, [selected, project.layers, update, notify]);
  const saveComponent = useCallback(() => {
    if (!selected.length) {
      notify('Select one or more layers to save a component.');
      return;
    }
    setComponentName(
      selected.length === 1
        ? (project.layers.find((l) => l.id === selected[0])?.name ?? 'My component')
        : 'My component',
    );
  }, [selected, project.layers, notify]);
  const confirmComponent = () => {
    if (!componentName?.trim()) return;
    try {
      const next = {
        ...project,
        components: [
          ...project.components,
          {
            id: crypto.randomUUID(),
            name: componentName.trim(),
            layers: project.layers.filter((l) => selected.includes(l.id)).map((l) => ({ ...l })),
          },
        ],
      };
      parseProject(JSON.stringify(next));
      update(() => next);
      setComponentName(null);
      notify('Component saved to your library.');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not save component');
    }
  };
  const insertComponent = (id: string) => {
    const component = project.components.find((c) => c.id === id);
    if (!component) return;
    const groupId = crypto.randomUUID();
    const layers = duplicateLayers(component.layers);
    const first = Math.min(...layers.map((l) => l.start));
    add(layers.map((l) => ({ ...l, groupId, start: l.start - first })));
    notify(`${component.name} added. Every element is editable.`);
  };
  const split = () => {
    const targets = project.layers.filter((l) => selected.includes(l.id));
    if (!targets.some((l) => time > l.start && time < l.start + l.duration)) {
      notify('Move the playhead inside a selected clip to split it.');
      return;
    }
    update((p) => ({
      ...p,
      layers: p.layers.flatMap((l) => (selected.includes(l.id) ? splitLayer(l, time) : [l])),
    }));
  };
  const reorder = (direction: number) => {
    update((p) => {
      const layers = [...p.layers];
      const ids = direction > 0 ? [...selected].reverse() : selected;
      ids.forEach((id) => {
        const index = layers.findIndex((l) => l.id === id),
          next = Math.max(0, Math.min(layers.length - 1, index + direction));
        if (index >= 0) [layers[index], layers[next]] = [layers[next], layers[index]];
      });
      return { ...p, layers };
    });
  };
  const save = useCallback(async () => {
    try {
      const json = JSON.stringify(project);
      parseProject(json);
      const saved = await saveBlob(
        new Blob([json], { type: 'application/json' }),
        `${project.name.replace(/[^\w\s-]/g, '') || 'Untitled'}.framestudio`,
      );
      if (saved) notify('Project saved with its media and reusable components.');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not save project');
    }
  }, [project, notify]);
  const loadText = useCallback(
    (text: string) => {
      try {
        const next = parseProject(text);
        update(() => next);
        setSelected([]);
        setTime(0);
        setPlaying(false);
        notify(`Opened ${next.name}`);
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Invalid project file');
      }
    },
    [update, notify],
  );
  const open = async () => {
    setProjectMenu(false);
    if (window.frameDesktop) {
      try {
        const text = await window.frameDesktop.openProject();
        if (text) loadText(text);
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Could not open project');
      }
    } else projectInput.current?.click();
  };
  const importFiles = async (files: File[]) => {
    setBusy(true);
    try {
      const layers: Layer[] = [];
      for (const file of files) {
        if (file.size > 50 * 1024 * 1024)
          throw new Error(`${file.name} exceeds the 50 MB alpha import limit.`);
        if (file.name.toLowerCase().endsWith('.svg')) layers.push(...importSvg(await file.text()));
        else {
          const l = await importMedia(file);
          if (l.kind !== 'audio') {
            const scale = Math.min(
              (project.width * 0.8) / l.width,
              (project.height * 0.8) / l.height,
            );
            l.width *= scale;
            l.height *= scale;
            l.x = (project.width - l.width) / 2;
            l.y = (project.height - l.height) / 2;
          }
          if (l.kind === 'image') l.duration = project.duration;
          layers.push(l);
        }
      }
      const proposed = {
        ...project,
        layers: [...project.layers, ...layers],
        duration: Math.max(project.duration, ...layers.map((l) => l.start + l.duration)),
      };
      parseProject(JSON.stringify(proposed));
      add(layers);
      notify(
        `${files.length} file${files.length === 1 ? '' : 's'} imported. Select a layer to start editing.`,
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not import file');
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        (event.target.matches('input,textarea,select') || event.target.isContentEditable)
      )
        return;
      if (exportOpen || componentName !== null || helpOpen) return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      } else if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      } else if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicate();
      } else if (mod && event.key.toLowerCase() === 'g') {
        event.preventDefault();
        group();
      } else if (mod && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setSelected(project.layers.map((l) => l.id));
      } else if (event.code === 'Space') {
        event.preventDefault();
        setPlaying((p) => !p);
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        remove();
      } else if (event.key === 'Escape') {
        setSelected([]);
        setTool('select');
      } else if (event.key.toLowerCase() === 'v') setTool('select');
      else if (event.key.toLowerCase() === 'p') setTool('draw');
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [
    save,
    undo,
    redo,
    duplicate,
    group,
    project.layers,
    remove,
    exportOpen,
    componentName,
    helpOpen,
  ]);
  const aspect =
    ASPECTS.find((a) => a.w === project.width && a.h === project.height)?.label ?? 'Custom';
  return (
    <div
      className="app-shell"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) void importFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <input
        ref={fileInput}
        type="file"
        accept="video/*,audio/*,image/*,.svg"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          void importFiles(files);
        }}
      />
      <input
        ref={projectInput}
        type="file"
        accept=".framestudio,.json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file)
            void file
              .text()
              .then(loadText)
              .catch(() => notify('Could not read this file'));
          e.target.value = '';
        }}
      />
      <header className="app-header">
        <div className="brand">
          <div className="brand-symbol">
            <span />
            <span />
            <span />
          </div>
          <span>
            frame<span className="brand-light">studio</span>
          </span>
          <span className="alpha-label">ALPHA</span>
        </div>
        <div className="project-heading">
          <button className="project-toggle" onClick={() => setProjectMenu((p) => !p)}>
            <span>{project.name}</span>
            <ChevronDown size={12} />
          </button>
          <span className="header-divider" />
          <span className="save-state">
            <CheckCheck size={13} />
            {saveStatus}
          </span>
          {projectMenu && (
            <div className="project-menu">
              <button
                onClick={() => {
                  void save();
                  setProjectMenu(false);
                }}
              >
                <Save size={14} />
                Save project <kbd>⌘ S</kbd>
              </button>
              <button onClick={() => void open()}>
                <FolderOpen size={14} />
                Open project
              </button>
              <button
                onClick={() => {
                  setSelected([]);
                  setProjectMenu(false);
                }}
              >
                <Film size={14} />
                Project settings
              </button>
            </div>
          )}
        </div>
        <div className="header-actions">
          <button
            className="icon-button"
            title="Keyboard shortcuts"
            aria-label="Keyboard shortcuts"
            onClick={() => setHelpOpen(true)}
          >
            <Keyboard size={16} />
          </button>
          <button
            className="secondary import-button"
            disabled={busy || !ready}
            onClick={() => fileInput.current?.click()}
          >
            <ArrowUpFromLine size={14} />
            {busy ? 'Importing…' : 'Import'}
          </button>
          <button
            className="primary"
            disabled={!ready}
            onClick={() => {
              setPlaying(false);
              stopMedia(media);
              setExportOpen(true);
            }}
          >
            Export <ArrowUpRight size={15} />
          </button>
        </div>
      </header>
      <main className="editor-layout">
        <Sidebar
          project={project}
          selected={selected}
          select={setSelected}
          add={add}
          importFiles={() => fileInput.current?.click()}
          applyTemplate={(p) => {
            setPlaying(false);
            setTime(1.2);
            update((prev) => ({ ...p, components: prev.components }));
            setSelected([]);
            notify('Template applied. All elements are editable. Undo to restore your scene.');
          }}
          insertComponent={insertComponent}
          saveComponent={saveComponent}
          group={group}
        />
        <section className="canvas-workspace">
          <div className="canvas-toolbar">
            <div className="tool-group">
              <button
                title="Select (V)"
                aria-label="Select tool"
                className={tool === 'select' ? 'active' : ''}
                onClick={() => setTool('select')}
              >
                <MousePointer2 size={16} />
              </button>
              <button
                title="Pencil (P)"
                aria-label="Pencil tool"
                className={tool === 'draw' ? 'active' : ''}
                onClick={() => setTool('draw')}
              >
                <PenTool size={16} />
              </button>
              <span className="tool-divider" />
              <button
                title="Add text"
                aria-label="Add text"
                onClick={() =>
                  add([
                    createLayer('text', {
                      text: 'Your next idea.',
                      name: 'Your next idea',
                      x: 200,
                      y: 240,
                      width: 1000,
                      height: 160,
                      fontSize: 96,
                      fill: '#28372f',
                      duration: project.duration,
                    }),
                  ])
                }
              >
                <Type size={17} />
              </button>
              <button
                title="Add shape"
                aria-label="Add shape"
                onClick={() =>
                  add([
                    createLayer('shape', {
                      name: 'Shape',
                      x: 600,
                      y: 360,
                      width: 360,
                      height: 240,
                      fill: '#d5ad80',
                      radius: 24,
                      duration: project.duration,
                    }),
                  ])
                }
              >
                <Square size={16} />
              </button>
              <span className="tool-divider" />
              <button
                title="Group (⌘G)"
                aria-label="Group selection"
                onClick={group}
                disabled={selected.length < 2}
              >
                <Group size={17} />
              </button>
              <button
                title="Save as component"
                aria-label="Save component"
                disabled={!selected.length}
                onClick={saveComponent}
              >
                <Component size={17} />
              </button>
            </div>
            <div className="canvas-format">
              <span className="format-label">CANVAS</span>
              <select
                aria-label="Canvas aspect ratio"
                value={aspect}
                onChange={(e) => {
                  const a = ASPECTS.find((a) => a.label === e.target.value);
                  if (a) update((p) => changeAspectRatio(p, a.w, a.h));
                }}
              >
                {aspect === 'Custom' && <option value="Custom">Custom</option>}
                {ASPECTS.map((a) => (
                  <option key={a.label} value={a.label}>
                    {a.label} · {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <CanvasStage
            project={project}
            media={media}
            time={time}
            selected={selected}
            tool={tool}
            zoom={canvasZoom}
            select={setSelected}
            change={change}
            checkpoint={checkpoint}
            add={add}
            error={notify}
          />
          <div className="canvas-bottom">
            <div className="canvas-breadcrumb">
              <LayersIcon />
              Scene 01 <span>/</span> {project.name}
            </div>
            <div className="canvas-zoom">
              <button
                aria-label="Zoom canvas out"
                onClick={() => setCanvasZoom((z) => Math.max(0.25, z - 0.1))}
              >
                <Minus size={12} />
              </button>
              <span>{Math.round(canvasZoom * 100)}%</span>
              <button
                aria-label="Zoom canvas in"
                onClick={() => setCanvasZoom((z) => Math.min(2, z + 0.1))}
              >
                <Plus size={12} />
              </button>
              <span className="tool-divider" />
              <button aria-label="Fit canvas" onClick={() => setCanvasZoom(1)}>
                <Maximize size={13} />
              </button>
            </div>
          </div>
        </section>
        <Inspector
          project={project}
          selected={selected}
          change={change}
          updateProject={(patch) => update((p) => ({ ...p, ...patch }))}
          duplicate={duplicate}
          remove={remove}
          group={group}
          saveComponent={saveComponent}
          reorder={reorder}
          checkpoint={checkpoint}
        />
      </main>
      <section className="timeline-section">
        <div className="timeline-toolbar">
          <div className="timeline-edit-tools">
            <button title="Undo (⌘Z)" aria-label="Undo" onClick={undo}>
              <Undo2 size={16} />
            </button>
            <button title="Redo (⇧⌘Z)" aria-label="Redo" onClick={redo}>
              <Redo2 size={16} />
            </button>
            <span className="tool-divider" />
            <button
              title="Split at playhead"
              aria-label="Split clip"
              disabled={!selected.length}
              onClick={split}
            >
              <Scissors size={16} />
            </button>
            <button
              title="Duplicate selection"
              aria-label="Duplicate"
              disabled={!selected.length}
              onClick={duplicate}
            >
              <Copy size={14} />
            </button>
            <button
              title="Delete selection"
              aria-label="Delete"
              disabled={!selected.length}
              onClick={remove}
            >
              <Trash2 size={14} />
            </button>
          </div>
          <div className="playback-controls">
            <button title="Go to start" aria-label="Go to start" onClick={() => seek(0)}>
              <SkipBack size={14} />
            </button>
            <button
              className="play-button"
              aria-label={playing ? 'Pause' : 'Play'}
              onClick={() => {
                if (time >= project.duration - 1 / project.fps) setTime(0);
                setPlaying((p) => !p);
              }}
            >
              {playing ? (
                <Pause size={15} fill="currentColor" />
              ) : (
                <Play size={15} fill="currentColor" />
              )}
            </button>
            <button title="Go to end" aria-label="Go to end" onClick={() => seek(project.duration)}>
              <SkipForward size={14} />
            </button>
            <span className="current-time">{timecode(time, project.fps)}</span>
            <span className="total-time">/ {timecode(project.duration, project.fps)}</span>
          </div>
          <div className="timeline-zoom">
            <span>Timeline</span>
            <Minus size={12} />
            <input
              aria-label="Timeline zoom"
              type="range"
              min="25"
              max="140"
              value={timelineZoom}
              onChange={(e) => setTimelineZoom(Number(e.target.value))}
            />
            <Plus size={12} />
          </div>
        </div>
        <Timeline
          project={project}
          selected={selected}
          time={time}
          zoom={timelineZoom}
          seek={seek}
          select={setSelected}
          change={change}
          checkpoint={checkpoint}
        />
        <div className="statusbar">
          <div className="layer-legend">
            {Object.entries(LAYER_COLORS).map(([kind, color]) => (
              <span key={kind}>
                <i style={{ background: color }} />
                {LAYER_LABELS[kind as keyof typeof LAYER_LABELS]}
              </span>
            ))}
            <span>
              <i className="component-dot" />
              Component
            </span>
          </div>
          <span>
            {project.fps} fps <b>·</b> {project.width} × {project.height} <b>·</b> v0.1 alpha
          </span>
        </div>
      </section>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{toast}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast('')}>
            <X size={14} />
          </button>
        </div>
      )}
      {exportOpen && (
        <ExportDialog
          project={project}
          time={time}
          media={media}
          close={() => {
            setExportOpen(false);
            setTime(0);
          }}
        />
      )}
      {componentName !== null && (
        <div className="modal-backdrop">
          <section
            className="small-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="component-heading"
          >
            <div className="modal-header">
              <Component size={24} />
              <button aria-label="Close component dialog" onClick={() => setComponentName(null)}>
                <X size={18} />
              </button>
            </div>
            <h2 id="component-heading">Keep a good thing.</h2>
            <p>Save these {selected.length} elements to your reusable library.</p>
            <label className="field-label">
              Component name
              <input
                autoFocus
                value={componentName}
                onChange={(e) => setComponentName(e.target.value)}
                maxLength={80}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmComponent();
                  if (e.key === 'Escape') setComponentName(null);
                }}
              />
            </label>
            <button className="primary wide" onClick={confirmComponent}>
              Save component <ArrowUpRight size={15} />
            </button>
          </section>
        </div>
      )}
      {helpOpen && (
        <div className="modal-backdrop">
          <section
            className="small-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-heading"
          >
            <div className="modal-header">
              <Command size={24} />
              <button aria-label="Close shortcuts" onClick={() => setHelpOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <h2 id="help-heading">A little faster.</h2>
            {[
              ['Play / pause', 'Space'],
              ['Select tool', 'V'],
              ['Pencil tool', 'P'],
              ['Save project', '⌘ S'],
              ['Undo / redo', '⌘ Z / ⇧ ⌘ Z'],
              ['Duplicate', '⌘ D'],
              ['Group / ungroup', '⌘ G'],
              ['Select all', '⌘ A'],
              ['Delete', '⌫'],
              ['Precise timeline drag', 'Hold Shift'],
            ].map(([action, key]) => (
              <div className="shortcut" key={action}>
                <span>{action}</span>
                <kbd>{key}</kbd>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
function LayersIcon() {
  return <Square size={11} />;
}
