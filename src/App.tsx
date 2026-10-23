import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ArrowUpFromLine,
  ChevronDown,
  Check,
  Undo2,
  Redo2,
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
  Layers3,
  Eye,
  EyeOff,
  LockKeyhole,
  UnlockKeyhole,
  Grid3X3,
} from './icons';
import Sidebar from './components/Sidebar';
import Inspector, { type InspectorTab } from './components/Inspector';
import InspectorRail from './components/InspectorRail';
import Timeline from './components/Timeline';
import TimelineTransport from './components/TimelineTransport';
import CanvasToolbar from './components/CanvasToolbar';
import { createShapePreset, DEFAULT_DRAWING_STYLE, type CanvasTool } from './core/creation';
import CanvasStage from './components/CanvasStage';
import LayerDepthStage from './components/LayerDepthStage';
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
import { reorderVisualLayers } from './core/layerOrder';
import { transformSelection as transformLayers, type SelectionTransform } from './core/selection';
import { MediaCache, syncMedia, stopMedia } from './engine/renderer';
import { importMedia } from './engine/assets';
import { saveBlob } from './engine/export';
import { sampleBackgroundColor } from './engine/imageEffects';
import {
  evaluateKeyframedLayer,
  transformKeyframeGeometry,
  GEOMETRY_KEYFRAME_PROPERTIES,
} from './core/keyframes';
import { geometryEditPatch } from './core/geometryEditing';

export default function App() {
  const { project, ready, saveStatus, update, checkpoint, undo, redo } = useEditor();
  const [selected, setSelected] = useState<string[]>([]);
  const [time, setTime] = useState(1.2);
  const [playing, setPlaying] = useState(false);
  const [tool, setTool] = useState<CanvasTool>('select');
  const [drawingStyle, setDrawingStyle] = useState(DEFAULT_DRAWING_STYLE);
  const [panelsHidden, setPanelsHidden] = useState(false);
  const [toolsExpanded, setToolsExpanded] = useState(true);
  const [showBoardGrid, setShowBoardGrid] = useState(true);
  const expandedTools = toolsExpanded;
  const panelsBeforeFocus = useRef({ library: true, inspector: false, tools: true });
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('design');
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [viewMode, setViewMode] = useState<'canvas' | 'depth'>('canvas');
  const [resetViewKey, setResetViewKey] = useState(0);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const selectedLayers = project.layers.filter((layer) => selected.includes(layer.id));
  const hasEditableSelection = selectedLayers.some((layer) => !layer.locked);
  const selectionLocked =
    selectedLayers.length > 0 && selectedLayers.every((layer) => layer.locked);
  const toggleSelectionLock = () => {
    if (!selectedLayers.length) return;
    update((p) => ({
      ...p,
      layers: p.layers.map((layer) =>
        selected.includes(layer.id) ? { ...layer, locked: !selectionLocked } : layer,
      ),
    }));
  };
  const inspectorRailVisible = viewMode === 'canvas' && !panelsHidden;
  const audioSelection =
    project.layers.some((layer) => selected.includes(layer.id) && layer.kind === 'audio') &&
    !project.layers.some((layer) => selected.includes(layer.id) && layer.kind !== 'audio');
  const activeInspectorTab = audioSelection && inspectorTab === 'color' ? 'design' : inspectorTab;
  const closeInspector = () => {
    setInspectorOpen(false);
    document.getElementById(`inspector-menu-${activeInspectorTab}`)?.focus();
  };
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [libraryRequest, setLibraryRequest] = useState<{
    tab: 'media' | 'text' | 'elements' | 'templates' | 'components';
    nonce: number;
  } | null>(null);
  const [timelineZoom, setTimelineZoom] = useState(66);
  const [timelineResetKey, setTimelineResetKey] = useState(0);
  const [timelineMotionRequest, setTimelineMotionRequest] = useState({ id: 0, keyframes: false });
  const [playbackSession, setPlaybackSession] = useState(0);
  const previewEnd = useRef<number | null>(null);
  const [timelineHeight, setTimelineHeight] = useState(() =>
    Math.min(window.innerHeight <= 800 ? 246 : 308, maxTimelineHeight()),
  );
  const timelineAutoSize = useRef<{ rest: number; expanded: number; target: number } | null>(null);
  const expandTimeline = (keyframes = false) => {
    setTimelineHeight((height) => {
      const rest = timelineAutoSize.current?.rest ?? height;
      const target = keyframes ? 440 : 400;
      const expanded = Math.min(Math.max(rest, target), maxTimelineHeight());
      timelineAutoSize.current = { rest, expanded, target };
      return expanded;
    });
  };
  const collapseTimeline = () => {
    const automatic = timelineAutoSize.current;
    timelineAutoSize.current = null;
    if (automatic) setTimelineHeight(Math.min(automatic.rest, maxTimelineHeight()));
  };
  const [exportOpen, setExportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [projectMenu, setProjectMenu] = useState(false);
  const [toast, setToast] = useState('');
  const [componentName, setComponentName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const timelineSection = useRef<HTMLElement>(null);
  const media = useRef(new MediaCache()).current;
  const notify = useCallback((message: string) => setToast(message), []);
  const selectLayers = useCallback(
    (ids: string[]) => {
      setSelected(ids);
      if (viewMode === 'canvas' && !panelsHidden) setInspectorOpen(ids.length > 0);
    },
    [viewMode, panelsHidden],
  );
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
    const end = Math.min(project.duration, previewEnd.current ?? project.duration);
    let frame = 0;
    const tick = () => {
      const next = initial + (performance.now() - started) / 1000;
      if (next >= end) {
        setTime(Math.max(initial, end - 1 / project.fps));
        previewEnd.current = null;
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
  }, [playing, project.duration, project.fps, exportOpen, playbackSession]);
  useEffect(() => {
    if (exportOpen) return;
    const sync = () => {
      syncMedia(project, time, playing, media);
      if (media.playbackError) {
        notify(media.playbackError.message);
        media.playbackError = null;
        setPlaying(false);
      }
    };
    sync();
    return media.subscribe(sync);
  }, [project, time, playing, media, exportOpen, notify]);
  const seek = useCallback(
    (value: number) => {
      previewEnd.current = null;
      setPlaying(false);
      setTime(Math.max(0, Math.min(project.duration - 1 / project.fps, value)));
    },
    [project.duration, project.fps],
  );
  const togglePlayback = useCallback(() => {
    previewEnd.current = null;
    setTime((current) => (current >= project.duration - 1 / project.fps ? 0 : current));
    setPlaying((current) => !current);
  }, [project.duration, project.fps]);
  const previewLayerMotion = (layer: Layer) => {
    previewEnd.current = Math.min(project.duration, layer.start + layer.duration);
    setTime(layer.start);
    setPlaying(true);
    setPlaybackSession((session) => session + 1);
  };
  const change = useCallback(
    (id: string, patch: Partial<Layer>, record = true) => {
      if (
        GEOMETRY_KEYFRAME_PROPERTIES.some((property) => patch[property] !== undefined) ||
        ['transform3d', 'blur', 'reveal', 'textReveal'].some((property) => property in patch) ||
        'keyframes' in patch
      )
        setPlaying(false);
      try {
        update((p) => {
          const layers = p.layers.map((l) =>
            l.id === id
              ? {
                  ...l,
                  ...('keyframes' in patch ? patch : geometryEditPatch(l, patch, time, p.fps)),
                }
              : l,
          );
          // A rejected key (for example, a full property track) must not consume
          // an undo step or clear redo before the edit has been computed.
          if (record) checkpoint();
          return { ...p, layers };
        }, false);
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Could not edit this element.');
      }
    },
    [update, checkpoint, time, notify],
  );
  const autoRemoveBackground = (layerId: string) => {
    const layer = project.layers.find((item) => item.id === layerId);
    if (!layer || layer.kind !== 'image' || layer.locked) return;
    const image = media.get(layerId);
    if (!(image instanceof HTMLImageElement) || !image.complete || !image.naturalWidth) {
      notify('This image is still loading. Try again in a moment.');
      return;
    }
    try {
      const color = sampleBackgroundColor(image);
      change(layerId, { backgroundRemoval: { color, tolerance: 18, softness: 10 } });
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not read the image background.');
    }
  };
  const add = useCallback(
    (layers: Layer[]) => {
      if (!layers.length) return false;
      try {
        const next = {
          ...project,
          layers: [...project.layers, ...layers],
          duration: Math.max(project.duration, ...layers.map((l) => l.start + l.duration)),
        };
        parseProject(JSON.stringify(next));
        update(() => next);
        setSelected(layers.map((l) => l.id));
        if (viewMode === 'canvas' && !panelsHidden) setInspectorOpen(true);
        setTool('select');
        return true;
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Could not add elements');
        return false;
      }
    },
    [project, update, notify, viewMode, panelsHidden],
  );
  const transformSelected = (transform: SelectionTransform) => {
    try {
      const evaluated = project.layers.map((layer) => evaluateKeyframedLayer(layer, time));
      const transformed = transformLayers(evaluated, selected, transform);
      if (transformed === evaluated) return;
      const layers = project.layers.map((layer, index) => {
        if (transformed[index] === evaluated[index]) return layer;
        const next = transformed[index];
        const patch: Partial<Layer> = {};
        for (const property of GEOMETRY_KEYFRAME_PROPERTIES) {
          if (next[property] !== evaluated[index][property]) patch[property] = next[property];
        }
        // Keyed Size scales local content at render time. Static objects retain their style scaling.
        if (!layer.keyframes?.width?.length && !layer.keyframes?.height?.length) {
          patch.fontSize = next.fontSize;
          patch.radius = next.radius;
          patch.strokeWidth = next.strokeWidth;
        }
        return { ...layer, ...geometryEditPatch(layer, patch, time, project.fps) };
      });
      const next = { ...project, layers };
      parseProject(JSON.stringify(next));
      setPlaying(false);
      update(() => next);
    } catch (error) {
      notify(
        `Could not resize or move this selection. ${error instanceof Error ? error.message : 'Choose a different size.'}`,
      );
    }
  };
  const remove = useCallback(() => {
    const removable = new Set(
      project.layers
        .filter((layer) => selected.includes(layer.id) && !layer.locked)
        .map((layer) => layer.id),
    );
    if (!removable.size) return;
    update((p) => ({ ...p, layers: p.layers.filter((layer) => !removable.has(layer.id)) }));
    setSelected((ids) => ids.filter((id) => !removable.has(id)));
  }, [selected, project.layers, update]);
  const duplicate = useCallback(() => {
    const copies = duplicateLayers(project.layers.filter((l) => selected.includes(l.id))).map(
      (l) => ({
        ...l,
        x: l.x + 24,
        y: l.y + 24,
        ...transformKeyframeGeometry(l, { translateX: 24, translateY: 24 }),
      }),
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
    if (add(layers.map((l) => ({ ...l, groupId, start: l.start - first + time }))))
      notify(`${component.name} added. Every element is editable.`);
  };
  const split = () => {
    const targets = project.layers.filter((l) => selected.includes(l.id) && !l.locked);
    if (!targets.some((l) => time > l.start && time < l.start + l.duration)) {
      notify('Move the playhead inside a selected clip to split it.');
      return;
    }
    update((p) => ({
      ...p,
      layers: p.layers.flatMap((l) =>
        selected.includes(l.id) && !l.locked ? splitLayer(l, time) : [l],
      ),
    }));
  };
  const reorder = (direction: number) => {
    const layers = reorderVisualLayers(project.layers, selected, direction);
    if (layers !== project.layers) update((p) => ({ ...p, layers }));
  };
  const setLayerOrder = useCallback(
    (layers: Layer[], record = true) => update((p) => ({ ...p, layers }), record),
    [update],
  );
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
        (event.target.matches('input,textarea,select') ||
          event.target.isContentEditable ||
          event.target.closest('[role="dialog"]'))
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
      else if (event.key.toLowerCase() === 'p') {
        setPlaying(false);
        setTool('draw');
        setDrawingStyle((style) => ({ ...style, width: 4 }));
      } else if (event.key.toLowerCase() === 'b') {
        setPlaying(false);
        setTool('pen');
        setDrawingStyle((style) => ({ ...style, width: 3 }));
      } else if (event.key.toLowerCase() === 'h') setTool('hand');
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
    const fit = () =>
      setTimelineHeight((height) => {
        const automatic = timelineAutoSize.current;
        if (!automatic) return Math.min(height, maxTimelineHeight());
        const expanded = Math.min(Math.max(automatic.rest, automatic.target), maxTimelineHeight());
        timelineAutoSize.current = { ...automatic, expanded };
        return expanded;
      });
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
                  setInspectorTab('design');
                  setViewMode('canvas');
                  setPanelsHidden(false);
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
        className={`editor-layout ${inspectorRailVisible ? 'with-inspector-rail' : ''} ${libraryOpen ? '' : 'without-library'}`}
      >
        {libraryOpen && (
          <Sidebar
            project={project}
            time={time}
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
            close={() => setLibraryOpen(false)}
          />
        )}
        <section
          className={`canvas-workspace ${viewMode === 'depth' ? 'is-depth-view' : ''} ${expandedTools ? 'tools-expanded' : ''} ${showBoardGrid ? 'has-board-grid' : ''}`}
        >
          <div className="board-topbar">
            <div className="board-view-controls">
              <button
                className={`board-chip ${libraryOpen ? 'active' : ''}`}
                title="Show or hide files"
                aria-label="Toggle files panel"
                aria-pressed={libraryOpen}
                onClick={() => {
                  setPanelsHidden(false);
                  setLibraryOpen((v) => !v);
                }}
              >
                <FolderOpen size={14} />
                {!libraryOpen && 'Library'}
              </button>
              <div className="board-view-switch" role="group" aria-label="Canvas view">
                <button
                  aria-label="2D canvas"
                  aria-pressed={viewMode === 'canvas'}
                  onClick={() => setViewMode('canvas')}
                >
                  2D
                </button>
                <button
                  aria-label="3D layers"
                  aria-pressed={viewMode === 'depth'}
                  title="Orbit and arrange layer depth"
                  onClick={() => {
                    setViewMode('depth');
                    setInspectorOpen(false);
                  }}
                >
                  <Layers3 size={13} /> 3D layers
                </button>
              </div>
            </div>
            <div className="board-options">
              <button
                className={`board-chip ${showBoardGrid ? 'active' : ''}`}
                aria-label="Canvas grid"
                aria-pressed={showBoardGrid}
                title={showBoardGrid ? 'Hide canvas grid' : 'Show canvas grid'}
                onClick={() => setShowBoardGrid((shown) => !shown)}
              >
                <Grid3X3 size={15} />
              </button>
              <button
                className={`board-chip ${panelsHidden ? 'active' : ''}`}
                aria-label={panelsHidden ? 'Show panels' : 'Hide panels'}
                title={panelsHidden ? 'Show panels' : 'Hide panels to focus on the canvas'}
                aria-pressed={panelsHidden}
                onClick={() => {
                  if (panelsHidden) {
                    setLibraryOpen(panelsBeforeFocus.current.library);
                    setInspectorOpen(panelsBeforeFocus.current.inspector);
                    setToolsExpanded(panelsBeforeFocus.current.tools);
                    setPanelsHidden(false);
                  } else {
                    panelsBeforeFocus.current = {
                      library: libraryOpen,
                      inspector: inspectorOpen,
                      tools: toolsExpanded,
                    };
                    setLibraryOpen(false);
                    setInspectorOpen(false);
                    setToolsExpanded(false);
                    setPanelsHidden(true);
                  }
                }}
              >
                {panelsHidden ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
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
            </div>
          </div>
          <CanvasToolbar
            expanded={expandedTools}
            onExpandedChange={setToolsExpanded}
            tool={tool}
            drawingStyle={drawingStyle}
            onToolChange={(next) => {
              if (['draw', 'brush', 'pen'].includes(next)) setPlaying(false);
              setTool(next);
            }}
            onDrawingStyleChange={setDrawingStyle}
            onAddShape={(id) => add([createShapePreset(id, project, time)])}
            onAddText={() =>
              add([
                createLayer('text', {
                  text: 'Your next idea.',
                  name: 'Your next idea',
                  x: project.width * 0.15,
                  y: project.height * 0.3,
                  width: Math.min(1000, project.width * 0.7),
                  height: 160,
                  fontSize: 96,
                  fill: '#2b2d42',
                  duration: project.duration,
                }),
              ])
            }
            onTemplates={() => {
              setPanelsHidden(false);
              setLibraryOpen(true);
              setLibraryRequest({ tab: 'templates', nonce: Date.now() });
            }}
            onComponents={() => {
              setPanelsHidden(false);
              setLibraryOpen(true);
              setLibraryRequest({ tab: 'components', nonce: Date.now() });
            }}
            onSaveComponent={saveComponent}
            onGroup={group}
            selectedLayers={project.layers.filter((layer) => selected.includes(layer.id))}
            onLayerChange={change}
            onMenuOpen={() => setInspectorOpen(false)}
            onAdjustColor={() => {
              if (
                !project.layers.some(
                  (layer) => selected.includes(layer.id) && layer.kind !== 'audio',
                )
              ) {
                notify('Select an image, video, or graphic to adjust its color.');
                return;
              }
              setPanelsHidden(false);
              setViewMode('canvas');
              setInspectorOpen(true);
              setInspectorTab('color');
            }}
            busy={busy || !ready}
            depthView={viewMode === 'depth'}
          />
          {viewMode === 'canvas' ? (
            <CanvasStage
              project={project}
              media={media}
              time={time}
              selected={selected}
              tool={tool}
              drawingStyle={drawingStyle}
              zoom={canvasZoom}
              leftInset={expandedTools ? 166 : 88}
              onZoomChange={setCanvasZoom}
              resetViewKey={resetViewKey}
              select={selectLayers}
              change={change}
              checkpoint={checkpoint}
              add={add}
              error={notify}
            />
          ) : (
            <LayerDepthStage
              project={project}
              media={media}
              time={time}
              selected={selected}
              select={(ids) => {
                setPlaying(false);
                setSelected(ids);
              }}
              reorder={reorder}
              change={change}
              checkpoint={() => {
                setPlaying(false);
                checkpoint();
              }}
              setLayerOrder={setLayerOrder}
              error={notify}
            />
          )}
          {viewMode === 'canvas' && (
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
          )}
        </section>
        {inspectorRailVisible && (
          <InspectorRail
            tab={activeInspectorTab}
            open={inspectorOpen}
            audioSelection={audioSelection}
            onClose={closeInspector}
            onSelect={(tab) => {
              setInspectorTab(tab);
              setInspectorOpen(!inspectorOpen || activeInspectorTab !== tab);
            }}
          />
        )}
        {inspectorOpen && inspectorRailVisible && (
          <Inspector
            close={closeInspector}
            tab={activeInspectorTab}
            project={project}
            time={time}
            selected={selected}
            change={change}
            updateProject={(patch) => {
              if (patch.layers) setPlaying(false);
              update((p) => ({ ...p, ...patch }));
            }}
            editKeys={(id) => {
              setPlaying(false);
              setSelected([id]);
              setTimelineMotionRequest((request) => ({ id: request.id + 1, keyframes: true }));
            }}
            duplicate={duplicate}
            remove={remove}
            group={group}
            saveComponent={saveComponent}
            reorder={reorder}
            checkpoint={checkpoint}
            transformSelection={transformSelected}
            autoRemoveBackground={autoRemoveBackground}
          />
        )}
      </main>
      <section className="timeline-section" ref={timelineSection} aria-label="Timeline">
        <TimelineResizeHandle
          height={timelineHeight}
          onChange={(height) => {
            timelineAutoSize.current = null;
            setTimelineHeight(height);
          }}
        />
        <div className="timeline-toolbar" role="toolbar" aria-label="Timeline controls">
          <TimelineTransport
            time={time}
            duration={project.duration}
            fps={project.fps}
            playing={playing}
            seek={seek}
            togglePlayback={togglePlayback}
          />
          <div className="timeline-edit-tools" role="group" aria-label="Timeline editing">
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
              className="timeline-labeled-action"
              disabled={!hasEditableSelection}
              onClick={split}
            >
              <Scissors size={16} />
              <span>Split</span>
            </button>
            <button
              title="Edit animation for the selected element"
              aria-label="Edit selected motion"
              className="timeline-labeled-action timeline-motion-action"
              disabled={selectedLayers.length !== 1 || selectedLayers[0]?.kind === 'audio'}
              onClick={() =>
                setTimelineMotionRequest((value) => ({ id: value.id + 1, keyframes: false }))
              }
            >
              <Layers3 size={16} />
              <span>Motion</span>
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
              disabled={!hasEditableSelection}
              onClick={remove}
            >
              <Trash2 size={14} />
            </button>
            <span className="tool-divider" />
            <button
              title={selectionLocked ? 'Unlock selected layers' : 'Lock selected layers'}
              aria-label={selectionLocked ? 'Unlock selected layers' : 'Lock selected layers'}
              aria-pressed={selectionLocked}
              disabled={!selectedLayers.length}
              onClick={toggleSelectionLock}
            >
              {selectionLocked ? <LockKeyhole size={14} /> : <UnlockKeyhole size={14} />}
            </button>
          </div>
          <div className="timeline-zoom">
            <span>Zoom</span>
            <button
              type="button"
              className="timeline-zoom-step"
              aria-label="Zoom timeline out"
              title="Zoom out"
              onClick={() => setTimelineZoom((value) => Math.max(0.001, value / 1.25))}
            >
              <Minus size={14} />
            </button>
            <input
              aria-label="Timeline zoom"
              type="range"
              min="0.001"
              max="140"
              step="any"
              value={timelineZoom}
              onChange={(e) => setTimelineZoom(Number(e.target.value))}
            />
            <button
              type="button"
              className="timeline-zoom-step"
              aria-label="Zoom timeline in"
              title="Zoom in"
              onClick={() => setTimelineZoom((value) => Math.min(140, value * 1.25))}
            >
              <Plus size={14} />
            </button>
            <button
              aria-label="Fit timeline"
              title="Fit the whole sequence"
              onClick={() => {
                const available = Math.max(1, (timelineSection.current?.clientWidth ?? 900) - 252);
                setTimelineZoom(Math.max(0.001, Math.min(140, available / project.duration)));
                setTimelineResetKey((value) => value + 1);
              }}
            >
              <Maximize size={13} /> Fit
            </button>
          </div>
        </div>
        <Timeline
          project={project}
          selected={selected}
          time={time}
          zoom={timelineZoom}
          resetScrollKey={timelineResetKey}
          motionRequest={timelineMotionRequest}
          onPreviewLayer={previewLayerMotion}
          seek={seek}
          select={selectLayers}
          change={change}
          checkpoint={checkpoint}
          onExpand={expandTimeline}
          onCollapse={collapseTimeline}
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
              ['Vector Pen tool', 'B'],
              ['Finish / cancel a path', 'Enter / Esc'],
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
