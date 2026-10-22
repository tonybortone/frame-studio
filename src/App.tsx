import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ArrowUpFromLine,
  ChevronDown,
  Check,
  Undo2,
  Redo2,
  Group,
  Component,
  Copy,
  Trash2,
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
  SlidersHorizontal,
} from './icons';
import Sidebar from './components/Sidebar';
import Inspector from './components/Inspector';
import Timeline from './components/Timeline';
import ToolGlyph from './components/ToolGlyph';
import PlaybackDock from './components/PlaybackDock';
import CanvasStage from './components/CanvasStage';
import ExportDialog from './components/ExportDialog';
import CanvasSizePicker from './components/CanvasSizePicker';
import TimelineResizeHandle, { maxTimelineHeight } from './components/TimelineResizeHandle';
import { useEditor } from './hooks/useEditor';
import {
  createLayer,
  parseProject,
  duplicateLayers,
  splitLayer,
  changeAspectRatio,
} from './core/project';
import { importSvg } from './core/svg';
import { type Layer } from './core/types';
import { MediaCache, syncMedia, stopMedia } from './engine/renderer';
import { importMedia } from './engine/assets';
import { saveBlob } from './engine/export';

export default function App() {
  const { project, ready, saveStatus, update, checkpoint, undo, redo } = useEditor();
  const [selected, setSelected] = useState<string[]>([]);
  const [time, setTime] = useState(1.2);
  const [playing, setPlaying] = useState(false);
  const [tool, setTool] = useState<'select' | 'draw' | 'hand'>('select');
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [resetViewKey, setResetViewKey] = useState(0);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [libraryRequest, setLibraryRequest] = useState<{
    tab: 'media' | 'text' | 'elements' | 'templates' | 'components';
    nonce: number;
  } | null>(null);
  const [timelineZoom, setTimelineZoom] = useState(66);
  const [timelineHeight, setTimelineHeight] = useState(() =>
    Math.min(window.innerHeight <= 800 ? 246 : 308, maxTimelineHeight()),
  );
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
  const selectLayers = useCallback((ids: string[]) => {
    setSelected(ids);
    setInspectorOpen(ids.length > 0);
  }, []);
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
  const togglePlayback = useCallback(() => {
    setTime((current) => (current >= project.duration - 1 / project.fps ? 0 : current));
    setPlaying((current) => !current);
  }, [project.duration, project.fps]);
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
        setInspectorOpen(true);
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
      if (event.defaultPrevented) return;
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
        if (
          event.repeat ||
          (event.target instanceof HTMLElement &&
            event.target.closest('button, [role="button"], a'))
        )
          return;
        event.preventDefault();
        togglePlayback();
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        remove();
      } else if (event.key === 'Escape') {
        setSelected([]);
        setTool('select');
        setInspectorOpen(false);
        setProjectMenu(false);
      } else if (event.key.toLowerCase() === 'v') setTool('select');
      else if (event.key.toLowerCase() === 'p') setTool('draw');
      else if (event.key.toLowerCase() === 'h') setTool('hand');
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
    togglePlayback,
  ]);
  useEffect(() => {
    const fit = () => setTimelineHeight((height) => Math.min(height, maxTimelineHeight()));
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div
      className="app-shell"
      style={{ gridTemplateRows: `52px minmax(220px, 1fr) ${timelineHeight}px` }}
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
        </div>
        <div className="project-heading">
          <button className="project-toggle" onClick={() => setProjectMenu((p) => !p)}>
            <span>{project.name}</span>
            <ChevronDown size={12} />
          </button>
          <span
            className={`save-state ${saveStatus.startsWith('Autosave paused') ? 'save-warning' : ''}`}
            title={saveStatus}
          >
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
                  setInspectorOpen(true);
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
      <main
        className={`editor-layout ${inspectorOpen ? 'with-inspector' : ''} ${libraryOpen ? '' : 'without-library'}`}
      >
        {libraryOpen && (
          <Sidebar
            project={project}
            selected={selected}
            select={selectLayers}
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
            libraryRequest={libraryRequest}
          />
        )}
        <section className="canvas-workspace">
          <div className="board-topbar">
            <button
              className={`board-chip ${libraryOpen ? 'active' : ''}`}
              title="Show or hide files"
              aria-label="Toggle files panel"
              aria-pressed={libraryOpen}
              onClick={() => setLibraryOpen((v) => !v)}
            >
              <FolderOpen size={14} /> Files
            </button>
            <div className="board-options">
              <CanvasSizePicker
                width={project.width}
                height={project.height}
                onChange={(width, height, fitContents) => {
                  const resized = fitContents
                    ? changeAspectRatio(project, width, height)
                    : { ...project, width, height };
                  try {
                    parseProject(JSON.stringify(resized));
                  } catch (error) {
                    throw new Error(
                      fitContents
                        ? 'Some elements cannot fit at this size. Turn off “Fit contents to frame” or choose a larger frame.'
                        : error instanceof Error
                          ? error.message
                          : 'This frame size could not be applied.',
                    );
                  }
                  setPlaying(false);
                  update(() => resized);
                  setCanvasZoom(1);
                  setResetViewKey((value) => value + 1);
                }}
              />
              <button
                className={`board-chip ${inspectorOpen ? 'active' : ''}`}
                aria-label="Toggle properties"
                title="Properties"
                aria-pressed={inspectorOpen}
                onClick={() => setInspectorOpen((v) => !v)}
              >
                <SlidersHorizontal size={15} />
              </button>
            </div>
          </div>
          <div className="creation-toolbar" role="toolbar" aria-label="Canvas tools">
            <div className="toolbox-grip" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <button
              title="Select (V)"
              aria-label="Select tool"
              aria-pressed={tool === 'select'}
              className={tool === 'select' ? 'active' : ''}
              onClick={() => setTool('select')}
            >
              <ToolGlyph kind="select" />
            </button>
            <button
              title="Hand (H) · drag to pan"
              aria-label="Hand tool"
              aria-pressed={tool === 'hand'}
              className={tool === 'hand' ? 'active' : ''}
              onClick={() => setTool('hand')}
            >
              <ToolGlyph kind="hand" />
            </button>
            <span className="creation-divider" />
            <button
              title="Add shape"
              aria-label="Add shape"
              onClick={() =>
                add([
                  createLayer('shape', {
                    name: 'Shape',
                    x: project.width * 0.35,
                    y: project.height * 0.35,
                    width: 360,
                    height: 240,
                    fill: '#ef233c',
                    radius: 28,
                    duration: project.duration,
                  }),
                ])
              }
            >
              <ToolGlyph kind="shape" />
            </button>
            <button
              title="Add text"
              aria-label="Add text"
              onClick={() =>
                add([
                  createLayer('text', {
                    text: 'Your next idea.',
                    name: 'Your next idea',
                    x: project.width * 0.15,
                    y: project.height * 0.3,
                    width: Math.min(1000, project.width * 0.7),
                    height: 160,
                    fontSize: 96,
                    fill: '#29292d',
                    duration: project.duration,
                  }),
                ])
              }
            >
              <ToolGlyph kind="text" />
            </button>
            <button
              title="Pencil (P)"
              aria-label="Pencil tool"
              aria-pressed={tool === 'draw'}
              className={tool === 'draw' ? 'active' : ''}
              onClick={() => setTool('draw')}
            >
              <ToolGlyph kind="draw" />
            </button>
            <button
              title="Add media"
              aria-label="Add media"
              disabled={busy || !ready}
              onClick={() => fileInput.current?.click()}
            >
              <ToolGlyph kind="media" />
            </button>
            <span className="creation-divider" />
            <button
              title="Your saved components"
              aria-label="Saved components"
              onClick={() => {
                setLibraryOpen(true);
                setLibraryRequest({ tab: 'components', nonce: Date.now() });
              }}
            >
              <ToolGlyph kind="component" />
            </button>
            {selected.length > 0 && (
              <button
                title="Save selection as component"
                aria-label="Save component"
                onClick={saveComponent}
              >
                <Plus size={18} />
              </button>
            )}
            <button
              className={`group-tool ${selected.length < 2 ? 'is-unavailable' : ''}`}
              title="Group (⌘G)"
              aria-label="Group selection"
              disabled={selected.length < 2}
              onClick={group}
            >
              <Group size={18} />
            </button>
          </div>
          <CanvasStage
            project={project}
            media={media}
            time={time}
            selected={selected}
            tool={tool}
            zoom={canvasZoom}
            onZoomChange={setCanvasZoom}
            resetViewKey={resetViewKey}
            select={selectLayers}
            change={change}
            checkpoint={checkpoint}
            add={add}
            error={notify}
          />
          <PlaybackDock
            time={time}
            duration={project.duration}
            fps={project.fps}
            playing={playing}
            onSeek={seek}
            onPlayPause={togglePlayback}
          />
          <div className="canvas-bottom">
            <div className="canvas-zoom">
              <button
                aria-label="Zoom canvas out"
                onClick={() => setCanvasZoom((z) => Math.max(0.15, z - 0.1))}
              >
                <Minus size={13} />
              </button>
              <span>{Math.round(canvasZoom * 100)}%</span>
              <button
                aria-label="Zoom canvas in"
                onClick={() => setCanvasZoom((z) => Math.min(3, z + 0.1))}
              >
                <Plus size={13} />
              </button>
              <span className="tool-divider" />
              <button
                aria-label="Fit canvas"
                title="Fit canvas"
                onClick={() => {
                  setCanvasZoom(1);
                  setResetViewKey((v) => v + 1);
                }}
              >
                <Maximize size={14} />
              </button>
            </div>
          </div>
        </section>
        {inspectorOpen && (
          <Inspector
            close={() => setInspectorOpen(false)}
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
        )}
      </main>
      <section className="timeline-section">
        <TimelineResizeHandle height={timelineHeight} onChange={setTimelineHeight} />
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
          <div className="timeline-caption">
            <span className="timeline-live-dot" />
            Timeline <span>{project.layers.length} layers</span>
          </div>
          <div className="timeline-zoom">
            <span>Zoom</span>
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
          select={selectLayers}
          change={change}
          checkpoint={checkpoint}
          onExpand={() =>
            setTimelineHeight((height) => Math.min(Math.max(height, 380), maxTimelineHeight()))
          }
        />
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
            <h2 id="component-heading">Save component</h2>
            <p>
              Keep {selected.length} {selected.length === 1 ? 'element' : 'elements'} in your
              Components library.
            </p>
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
            <h2 id="help-heading">Keyboard shortcuts</h2>
            {[
              ['Play / pause (outside board)', 'Space'],
              ['Pan board', 'Space + drag / H'],
              ['Zoom board', '⌘ / Ctrl + scroll'],
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
