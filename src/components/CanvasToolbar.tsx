import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Group, LayoutTemplate, PenTool, Plus, SlidersHorizontal, X } from '../icons';
import {
  SHAPE_PRESETS,
  type CanvasTool,
  type DrawingStyle,
  type ShapePresetId,
} from '../core/creation';
import type { Layer } from '../core/types';
import ToolGlyph from './ToolGlyph';
import { MaskControls } from './VisualTools';
import './CanvasToolbar.css';

interface Props {
  tool: CanvasTool;
  drawingStyle: DrawingStyle;
  onToolChange: (tool: CanvasTool) => void;
  onDrawingStyleChange: (style: DrawingStyle) => void;
  onAddShape: (shape: ShapePresetId) => void;
  onAddText: () => void;
  onTemplates: () => void;
  onComponents: () => void;
  onSaveComponent: () => void;
  onGroup: () => void;
  selectedLayers: Layer[];
  onLayerChange: (id: string, patch: Partial<Layer>, record?: boolean) => void;
  onAdjustColor: () => void;
  onMenuOpen: () => void;
  busy: boolean;
  depthView: boolean;
}

type Menu = 'shapes' | 'drawing' | 'masks';
const TITLES: Record<Menu, string> = {
  shapes: 'Shapes',
  drawing: 'Drawing tools',
  masks: 'Masks & adjustments',
};
const PALETTE = ['#2b2d42', '#8d99ae', '#edf2f4', '#ef233c', '#d90429'];
const DRAWING_TOOLS = [
  { tool: 'draw', name: 'Pencil', shortcut: 'P', description: 'Draw a freehand line', width: 4 },
  { tool: 'brush', name: 'Brush', shortcut: '', description: 'Paint a bolder stroke', width: 14 },
  {
    tool: 'pen',
    name: 'Pen',
    shortcut: 'B',
    description: 'Build a path, point by point',
    width: 3,
  },
] as const;

function DrawingIcon({ kind }: { kind: 'draw' | 'brush' | 'pen' }) {
  if (kind === 'pen') return <PenTool size={19} strokeWidth={1.5} aria-hidden="true" />;
  return (
    <svg
      viewBox="0 0 24 24"
      width="19"
      height="19"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === 'draw' ? (
        <path d="m4 16 11-11 4 4L8 20l-5 1 1-5Zm9-9 4 4M4 16l4 4M16 4l1-1a2 2 0 0 1 3 0l1 1a2 2 0 0 1 0 3l-1 1" />
      ) : (
        <>
          <path d="m11 14 8-11a2 2 0 0 1 3 3L12 16M10 12l4 3" />
          <path d="M11 14c-4-3-7 0-7 3 0 2-1 3-2 4 5 1 10-1 10-5Z" />
        </>
      )}
    </svg>
  );
}

function MaskGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" strokeDasharray="2 2" />
      <path d="M12 5v14a7 7 0 0 0 0-14Z" fill="currentColor" fillOpacity=".25" />
      <circle cx="12" cy="12" r="7" />
    </svg>
  );
}

export default function CanvasToolbar({
  tool,
  drawingStyle,
  onToolChange,
  onDrawingStyleChange,
  onAddShape,
  onAddText,
  onTemplates,
  onComponents,
  onSaveComponent,
  onGroup,
  selectedLayers,
  onLayerChange,
  onAdjustColor,
  onMenuOpen,
  busy,
  depthView,
}: Props) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const rail = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const triggers = useRef<Partial<Record<Menu, HTMLButtonElement | null>>>({});
  const dialogId = useId();
  const drawing = tool === 'draw' || tool === 'brush' || tool === 'pen';
  const layer = selectedLayers.length === 1 ? selectedLayers[0] : undefined;
  const maskLayer = layer && !layer.locked && layer.kind !== 'audio' ? layer : undefined;
  const maskHint =
    selectedLayers.length > 1
      ? 'Select one element to shape its edges or flip it.'
      : layer?.locked
        ? 'Unlock this layer in Layers to edit its mask.'
        : layer?.kind === 'audio'
          ? 'Select an image, video, text, or shape to add a mask.'
          : 'Select an element on the canvas, then choose its mask here.';

  const dismiss = (restoreFocus = true) => {
    if (restoreFocus && menu) triggers.current[menu]?.focus();
    setMenu(null);
  };
  const toggle = (next: Menu) => {
    if (menu === next) dismiss();
    else {
      onMenuOpen();
      setMenu(next);
    }
  };
  const run = (action: () => void) => {
    setMenu(null);
    action();
  };

  useLayoutEffect(() => {
    if (!menu) return;
    const align = () => {
      const anchor = triggers.current[menu]?.getBoundingClientRect();
      const panel = popover.current;
      if (!anchor || !panel) return;
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const desiredLeft = anchor.right + 13;
      setPosition({
        left: Math.max(10, Math.min(desiredLeft, window.innerWidth - width - 10)),
        top: Math.max(10, Math.min(anchor.top - 12, window.innerHeight - height - 10)),
      });
    };
    align();
    (
      popover.current?.querySelector<HTMLElement>('[data-autofocus]:not(:disabled)') ??
      popover.current?.querySelector<HTMLElement>('button:not(:disabled)')
    )?.focus();
    const observer = new ResizeObserver(align);
    if (popover.current) observer.observe(popover.current);
    if (rail.current) observer.observe(rail.current);
    window.addEventListener('resize', align);
    window.addEventListener('scroll', align, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', align);
      window.removeEventListener('scroll', align, true);
    };
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rail.current?.contains(event.target) &&
        !popover.current?.contains(event.target)
      )
        setMenu(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      triggers.current[menu]?.focus();
      setMenu(null);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [menu]);

  useEffect(() => {
    if (depthView && menu === 'drawing') setMenu(null);
  }, [depthView, menu]);

  const menuProps = (name: Menu) => ({
    ref: (element: HTMLButtonElement | null) => {
      triggers.current[name] = element;
    },
    'aria-haspopup': 'dialog' as const,
    'aria-expanded': menu === name,
    'aria-controls': menu === name ? dialogId : undefined,
    onClick: () => toggle(name),
  });

  return (
    <>
      <div
        ref={rail}
        className="creation-toolbar"
        role="toolbar"
        aria-label="Canvas tools"
        aria-orientation="vertical"
      >
        {!depthView && (
          <>
            <button
              type="button"
              title="Select (V)"
              aria-label="Select tool"
              aria-pressed={tool === 'select'}
              className={tool === 'select' ? 'active' : ''}
              onClick={() => run(() => onToolChange('select'))}
            >
              <ToolGlyph kind="select" />
            </button>
            <button
              type="button"
              title="Hand (H) · drag to pan"
              aria-label="Hand tool"
              aria-pressed={tool === 'hand'}
              className={tool === 'hand' ? 'active' : ''}
              onClick={() => run(() => onToolChange('hand'))}
            >
              <ToolGlyph kind="hand" />
            </button>
            <span className="creation-divider" aria-hidden="true" />
          </>
        )}
        <button
          type="button"
          title="Shapes"
          aria-label="Add shape"
          disabled={busy}
          className={menu === 'shapes' ? 'is-open' : ''}
          {...menuProps('shapes')}
        >
          <ToolGlyph kind="shape" />
          <ChevronDown className="creation-menu-caret" size={8} aria-hidden="true" />
        </button>
        <button
          type="button"
          title="Add text"
          aria-label="Add text"
          disabled={busy}
          onClick={() => run(onAddText)}
        >
          <ToolGlyph kind="text" />
        </button>
        {!depthView && (
          <button
            type="button"
            title="Pencil, brush & pen"
            aria-label="Drawing tools"
            disabled={busy}
            className={drawing ? 'active' : menu === 'drawing' ? 'is-open' : ''}
            {...menuProps('drawing')}
          >
            <DrawingIcon kind={drawing ? tool : 'pen'} />
            <ChevronDown className="creation-menu-caret" size={8} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          title="Masks, flips & color"
          aria-label="Masks and effects"
          className={menu === 'masks' ? 'is-open' : ''}
          {...menuProps('masks')}
        >
          <MaskGlyph />
          <ChevronDown className="creation-menu-caret" size={8} aria-hidden="true" />
        </button>
        <span className="creation-divider" aria-hidden="true" />
        <button
          type="button"
          title="Templates"
          aria-label="Templates"
          onClick={() => run(onTemplates)}
        >
          <LayoutTemplate size={20} strokeWidth={1.7} aria-hidden="true" />
        </button>
        <button
          type="button"
          title="Components & mockups"
          aria-label="Saved components"
          onClick={() => run(onComponents)}
        >
          <ToolGlyph kind="component" />
        </button>
        {selectedLayers.length > 0 && (
          <button
            type="button"
            title="Save selection as component"
            aria-label="Save component"
            disabled={busy}
            onClick={() => run(onSaveComponent)}
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        )}
        {selectedLayers.length > 1 && (
          <button
            type="button"
            title="Group (⌘G)"
            aria-label="Group selection"
            disabled={busy || selectedLayers.some((item) => item.locked)}
            onClick={() => run(onGroup)}
          >
            <Group size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      {menu &&
        createPortal(
          <div
            ref={popover}
            id={dialogId}
            style={position}
            className={`canvas-tool-popover canvas-tool-${menu}`}
            role="dialog"
            aria-label={TITLES[menu]}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <div className="canvas-tool-heading">
              <strong>{TITLES[menu]}</strong>
              <button
                type="button"
                aria-label={`Close ${TITLES[menu].toLowerCase()}`}
                onClick={() => dismiss()}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
            {menu === 'shapes' && (
              <>
                <div className="canvas-shape-grid">
                  {SHAPE_PRESETS.map((shape, index) => (
                    <button
                      key={shape.id}
                      type="button"
                      data-autofocus={index === 0 ? '' : undefined}
                      aria-label={`Add ${shape.name.toLowerCase()}`}
                      onClick={() => {
                        dismiss();
                        onAddShape(shape.id);
                      }}
                    >
                      <svg
                        viewBox="0 0 32 28"
                        width="32"
                        height="28"
                        fill={shape.id === 'line' || shape.id === 'arrow' ? 'none' : 'currentColor'}
                        fillOpacity=".12"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d={shape.path} />
                      </svg>
                      <span>{shape.name}</span>
                    </button>
                  ))}
                </div>
                <p className="canvas-tool-hint">
                  Add a shape, then resize and style it on the canvas.
                </p>
              </>
            )}
            {menu === 'drawing' && (
              <>
                <div className="canvas-drawing-options">
                  {DRAWING_TOOLS.map((item, index) => (
                    <button
                      key={item.tool}
                      type="button"
                      data-autofocus={index === 0 ? '' : undefined}
                      aria-label={`${item.name} tool`}
                      aria-pressed={tool === item.tool}
                      onClick={() => {
                        onDrawingStyleChange({
                          color: drawingStyle.color,
                          width: tool === item.tool ? drawingStyle.width : item.width,
                        });
                        onToolChange(item.tool);
                        dismiss();
                      }}
                    >
                      <DrawingIcon kind={item.tool} />
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.description}</small>
                      </span>
                      {item.shortcut && <kbd>{item.shortcut}</kbd>}
                    </button>
                  ))}
                </div>
                <div className="canvas-drawing-style">
                  <label className="canvas-stroke-field">
                    <span>Stroke</span>
                    <span className="canvas-stroke-input">
                      <input
                        type="color"
                        aria-label="Drawing color"
                        value={drawingStyle.color}
                        onChange={(event) =>
                          onDrawingStyleChange({ ...drawingStyle, color: event.target.value })
                        }
                      />
                      <span>{drawingStyle.color.toUpperCase()}</span>
                    </span>
                  </label>
                  <div
                    className="canvas-drawing-palette"
                    role="group"
                    aria-label="Drawing color palette"
                  >
                    {PALETTE.map((color) => (
                      <button
                        key={color}
                        type="button"
                        aria-label={`Drawing color ${color}`}
                        aria-pressed={drawingStyle.color.toLowerCase() === color}
                        style={{ background: color }}
                        onClick={() => onDrawingStyleChange({ ...drawingStyle, color })}
                      />
                    ))}
                  </div>
                  <label className="canvas-stroke-field">
                    <span>Width</span>
                    <span className="canvas-stroke-width">
                      <input
                        type="number"
                        aria-label="Drawing stroke width"
                        min="1"
                        max="64"
                        step="1"
                        value={drawingStyle.width}
                        onChange={(event) => {
                          const width = Number(event.target.value);
                          if (Number.isFinite(width) && width >= 1 && width <= 64)
                            onDrawingStyleChange({ ...drawingStyle, width });
                        }}
                      />
                      <span>px</span>
                    </span>
                  </label>
                  <input
                    type="range"
                    aria-label="Drawing width"
                    min="1"
                    max="64"
                    step="1"
                    value={drawingStyle.width}
                    onChange={(event) =>
                      onDrawingStyleChange({ ...drawingStyle, width: Number(event.target.value) })
                    }
                  />
                </div>
                <p className="canvas-tool-hint">
                  Pen: click for corners, drag for curves. Enter to finish; click the first point to
                  close.
                </p>
              </>
            )}
            {menu === 'masks' && (
              <>
                {maskLayer ? (
                  <fieldset className="canvas-mask-controls" disabled={busy}>
                    <MaskControls
                      layer={maskLayer}
                      patch={(patch, record) => onLayerChange(maskLayer.id, patch, record)}
                    />
                  </fieldset>
                ) : (
                  <div className="canvas-mask-empty">
                    <MaskGlyph />
                    <p>{maskHint}</p>
                  </div>
                )}
                <button
                  type="button"
                  data-autofocus=""
                  className="canvas-tool-color-action"
                  disabled={!maskLayer || busy}
                  onClick={() => run(onAdjustColor)}
                >
                  <SlidersHorizontal size={16} aria-hidden="true" />
                  <span>
                    Color & background<small>Adjust color and image backgrounds</small>
                  </span>
                  <span aria-hidden="true">↗</span>
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
