import { useEffect, useRef, useState } from 'react';
import {
  SlidersHorizontal,
  Sparkles,
  Sliders,
  X,
  MoveHorizontal,
  RotateCw,
  Component,
  LockKeyhole,
  UnlockKeyhole,
  Trash2,
  Copy,
  Volume2,
} from '../icons';
import type { Layer, Project, AnimationEasing } from '../core/types';
import { LAYER_COLORS, LAYER_LABELS } from '../core/types';
import { getAudioTiming, getMotionTiming } from '../core/motion';
import {
  LOOK_PRESETS,
  MOTION_PRESETS,
  getLookPatch,
  getMotionPresetPatch,
  detectSelectionLook,
  detectSelectionMotion,
  getEditableVisualLayers,
  type LookId,
} from '../core/presets';
import { getSelectionBounds, type SelectionTransform } from '../core/selection';
import { kindIcons } from './Timeline';
import { ElementColors, ImageTools, MaskControls, elementColorProperty } from './VisualTools';
import './Inspector.css';
export type InspectorTab = 'design' | 'motion' | 'color';

interface Props {
  tab: InspectorTab;
  close: () => void;
  project: Project;
  selected: string[];
  change: (id: string, patch: Partial<Layer>, record?: boolean) => void;
  updateProject: (patch: Partial<Project>) => void;
  duplicate: () => void;
  remove: () => void;
  group: () => void;
  saveComponent: () => void;
  reorder: (direction: number) => void;
  checkpoint: () => void;
  transformSelection: (transform: SelectionTransform) => void;
  autoRemoveBackground: (layerId: string) => void;
}
function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        value={Number(value.toFixed(2))}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && e.target.value !== '')
            onChange(Math.max(min ?? -100000, Math.min(max ?? 100000, n)));
        }}
      />
    </label>
  );
}

function SoundControls({ layer, patch }: { layer: Layer; patch: (value: Partial<Layer>) => void }) {
  const sound = getAudioTiming(layer);
  return (
    <section className="property-section">
      <h4>
        Sound <Volume2 size={13} />
      </h4>
      <label className="range-label">
        Volume <span>{Math.round((layer.volume ?? 1) * 100)}%</span>
        <input
          aria-label="Volume"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={layer.volume ?? 1}
          onChange={(e) => patch({ volume: Number(e.target.value) })}
        />
      </label>
      <div className="field-grid">
        <NumberField
          label="Fade in (s)"
          value={sound.fadeIn}
          min={0}
          max={Math.min(3600, layer.duration)}
          step={0.1}
          onChange={(audioFadeIn) => patch({ audioFadeIn })}
        />
        <NumberField
          label="Fade out (s)"
          value={sound.fadeOut}
          min={0}
          max={Math.min(3600, layer.duration)}
          step={0.1}
          onChange={(audioFadeOut) => patch({ audioFadeOut })}
        />
      </div>
      <button
        className={`sound-mute ${layer.muted ? 'is-muted' : ''}`}
        aria-pressed={Boolean(layer.muted)}
        onClick={() => patch({ muted: !layer.muted })}
      >
        <Volume2 size={13} />
        {layer.muted ? 'Unmute audio' : 'Mute audio'}
      </button>
      <p className="helper-copy">Fades apply to sound in playback and export.</p>
    </section>
  );
}

export default function Inspector({
  tab,
  close,
  project,
  selected,
  change,
  updateProject,
  duplicate,
  remove,
  group,
  saveComponent,
  reorder,
  checkpoint,
  transformSelection,
  autoRemoveBackground,
}: Props) {
  const lookStrengthGesture = useRef({ active: false, recorded: false });
  const resetLookStrengthGesture = () => {
    lookStrengthGesture.current = { active: false, recorded: false };
  };
  useEffect(() => {
    window.addEventListener('pointerup', resetLookStrengthGesture);
    window.addEventListener('pointercancel', resetLookStrengthGesture);
    window.addEventListener('blur', resetLookStrengthGesture);
    return () => {
      window.removeEventListener('pointerup', resetLookStrengthGesture);
      window.removeEventListener('pointercancel', resetLookStrengthGesture);
      window.removeEventListener('blur', resetLookStrengthGesture);
    };
  }, []);
  const [lookHint, setLookHint] = useState<{
    id: LookId;
    selection: string;
    values: string;
  } | null>(null);
  const selectedLayers = project.layers.filter((item) => selected.includes(item.id));
  const visualSelection = selectedLayers.filter((item) => item.kind !== 'audio');
  const visualTargets = getEditableVisualLayers(project.layers, selected);
  const firstSelected = project.layers.find((item) => item.id === selected[0]);
  const layer =
    firstSelected?.kind === 'audio' && visualSelection.length ? visualSelection[0] : firstSelected;
  const isAudio = layer?.kind === 'audio';
  const isGroup = visualSelection.length > 1;
  const bounds = isGroup ? getSelectionBounds(visualSelection) : null;
  const lockedVisual = visualSelection.some((item) => item.locked);
  const lockedCount = selectedLayers.filter((item) => item.locked).length;
  const selectionKey = `${project.id}:${[...selected].sort().join(',')}`;
  const lookSignature = (layers: Layer[]) =>
    JSON.stringify(
      layers.map(({ id, brightness, contrast, saturation }) => [
        id,
        brightness,
        contrast,
        saturation,
      ]),
    );
  const currentLookValues = lookSignature(visualTargets);
  const detectedLook = detectSelectionLook(visualTargets);
  // A neutral blend is identical to Original in the file. Keep only this local
  // gesture's recipe so the strength slider can move from 0 back up again.
  const look =
    detectedLook.id === 'original' &&
    lookHint?.selection === selectionKey &&
    lookHint.values === currentLookValues
      ? { id: lookHint.id, strength: 0 }
      : detectedLook;
  useEffect(() => {
    if (lookHint && (lookHint.selection !== selectionKey || lookHint.values !== currentLookValues))
      setLookHint(null);
  }, [lookHint, selectionKey, currentLookValues]);
  const motionPreset = detectSelectionMotion(visualTargets);
  const activeTab = isAudio && tab === 'color' ? 'design' : tab;
  const motion = layer ? getMotionTiming(layer) : undefined;
  const patch = (value: Partial<Layer>) => {
    const targets = project.layers.filter(
      (item) => selected.includes(item.id) && (!item.locked || value.locked !== undefined),
    );
    if (!targets.length) return;
    checkpoint();
    targets.forEach((item) => change(item.id, value, false));
  };
  const patchVisual = (value: Partial<Layer>, record = true) => {
    if (!visualTargets.length) return;
    if (record) checkpoint();
    visualTargets.forEach((item) => change(item.id, value, false));
  };
  const applyLook = (id: LookId, strength = 100, record = true) => {
    const value = getLookPatch(id, strength);
    setLookHint(
      id === 'original'
        ? null
        : {
            id,
            selection: selectionKey,
            values: lookSignature(visualTargets.map((item) => ({ ...item, ...value }))),
          },
    );
    patchVisual(value, record);
  };
  const patchOne = (value: Partial<Layer>, record = true) => {
    if (!layer || layer.locked || layer.kind === 'audio') return;
    if (record) checkpoint();
    change(layer.id, value, false);
  };
  const colorLayers = visualSelection.filter((item) =>
    ['shape', 'text', 'svg', 'drawing'].includes(item.kind),
  );
  const colorTargets = colorLayers.filter((item) => !item.locked);
  const colorEditor =
    colorLayers.length > 0 ? (
      <fieldset className="inspector-fields" disabled={!colorTargets.length}>
        <ElementColors
          layers={colorTargets.length ? colorTargets : colorLayers}
          apply={(color) => {
            if (!colorTargets.length) return;
            checkpoint();
            colorTargets.forEach((item) =>
              change(item.id, { [elementColorProperty(item)]: color }, false),
            );
          }}
        />
      </fieldset>
    ) : null;
  const Icon = layer ? kindIcons[layer.kind] : SlidersHorizontal;
  const category = {
    design: { label: 'Design', icon: SlidersHorizontal },
    motion: { label: isAudio ? 'Sound' : 'Motion', icon: isAudio ? Volume2 : Sparkles },
    color: { label: 'Color', icon: Sliders },
  }[activeTab];
  return (
    <aside
      id="inspector-panel"
      className="inspector"
      aria-label="Properties"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        close();
      }}
    >
      <header className="inspector-header">
        <category.icon size={15} />
        <h2>{category.label}</h2>
        <button aria-label="Close properties" title="Close properties" onClick={close}>
          <X size={15} />
        </button>
      </header>
      <div className="inspector-body">
        <div className="inspector-title">
          <div style={{ color: layer ? LAYER_COLORS[layer.kind] : 'var(--muted)' }}>
            <Icon size={17} />
          </div>
          <div>
            <strong>
              {selected.length > 1 ? `${selected.length} elements` : (layer?.name ?? 'Your canvas')}
            </strong>
            <span>
              {selected.length > 1
                ? 'Multiple selection'
                : layer
                  ? LAYER_LABELS[layer.kind]
                  : 'Project settings'}
            </span>
          </div>
        </div>
        {!layer ? (
          <>
            {activeTab === 'design' && (
              <section className="property-section">
                <h4>Composition</h4>
                <label className="field-label">
                  Project name
                  <input
                    value={project.name}
                    maxLength={100}
                    onBlur={(e) => {
                      if (!e.target.value.trim()) updateProject({ name: 'Untitled project' });
                    }}
                    onChange={(e) => updateProject({ name: e.target.value })}
                  />
                </label>
                <div className="field-grid">
                  <NumberField
                    label="Duration (s)"
                    value={project.duration}
                    min={Math.max(1, ...project.layers.map((l) => l.start + l.duration))}
                    max={3600}
                    onChange={(duration) => updateProject({ duration })}
                  />
                  <NumberField
                    label="Frame rate"
                    value={project.fps}
                    min={1}
                    max={60}
                    onChange={(fps) => updateProject({ fps: Math.round(fps) })}
                  />
                </div>
              </section>
            )}
            {activeTab === 'motion' ? (
              <section className="inspector-empty">
                <div>
                  <Sparkles size={22} />
                </div>
                <h3>Select an element to animate</h3>
                <p>
                  Choose an element on the canvas or timeline to add motion and adjust its timing.
                </p>
              </section>
            ) : (
              <section className="property-section">
                <h4>Canvas color</h4>
                <label className="color-field">
                  <input
                    type="color"
                    aria-label="Canvas color"
                    value={project.background}
                    onChange={(e) => updateProject({ background: e.target.value })}
                  />
                  <span>{project.background.toUpperCase()}</span>
                  <span>100%</span>
                </label>
                {activeTab === 'color' && (
                  <p className="helper-copy">
                    Set the background of your canvas. Select an element to adjust its colors and
                    look.
                  </p>
                )}
              </section>
            )}
          </>
        ) : (
          <>
            {lockedCount > 0 && (
              <p className="locked-notice">
                <LockKeyhole size={12} />{' '}
                {selectedLayers.length === 1
                  ? 'Unlock this layer to edit its properties.'
                  : `${lockedCount} locked ${lockedCount === 1 ? 'element stays' : 'elements stay'} unchanged.`}
              </p>
            )}
            <fieldset
              className="inspector-fields"
              disabled={selectedLayers.every((item) => item.locked)}
            >
              {activeTab === 'design' && (
                <>
                  {selected.length > 1 && selectedLayers.some((item) => item.kind === 'text') && (
                    <section className="property-section component-content">
                      <h4>
                        Content <span>Edit each part</span>
                      </h4>
                      {selectedLayers
                        .filter((item) => item.kind === 'text')
                        .map((item) => (
                          <label className="field-label" key={item.id}>
                            {item.name}
                            <textarea
                              aria-label={`Content: ${item.name}`}
                              value={item.text ?? ''}
                              disabled={Boolean(item.locked)}
                              rows={2}
                              onChange={(event) => {
                                checkpoint();
                                change(item.id, { text: event.target.value }, false);
                              }}
                            />
                          </label>
                        ))}
                    </section>
                  )}
                  {!isAudio && (
                    <section className="property-section">
                      <h4>
                        {isGroup ? 'Position & size' : 'Transform'} <MoveHorizontal size={13} />
                      </h4>
                      {isGroup && bounds ? (
                        <>
                          <fieldset className="group-transform-fields" disabled={lockedVisual}>
                            <div className="field-grid">
                              <NumberField
                                label="X"
                                value={bounds.x}
                                onChange={(x) => transformSelection({ x })}
                              />
                              <NumberField
                                label="Y"
                                value={bounds.y}
                                onChange={(y) => transformSelection({ y })}
                              />
                              <NumberField
                                label="W"
                                value={bounds.width}
                                min={1}
                                max={32768}
                                onChange={(width) =>
                                  transformSelection({ scale: width / bounds.width })
                                }
                              />
                              <NumberField
                                label="H"
                                value={bounds.height}
                                min={1}
                                max={32768}
                                onChange={(height) =>
                                  transformSelection({ scale: height / bounds.height })
                                }
                              />
                            </div>
                            <div className="align-actions">
                              <button
                                onClick={() =>
                                  transformSelection({ x: (project.width - bounds.width) / 2 })
                                }
                              >
                                Center X
                              </button>
                              <button
                                onClick={() =>
                                  transformSelection({ y: (project.height - bounds.height) / 2 })
                                }
                              >
                                Center Y
                              </button>
                            </div>
                          </fieldset>
                          <p className="helper-copy">
                            {lockedVisual
                              ? 'Unlock every visual element to move or resize this selection.'
                              : 'Resize together. Spacing and proportions stay in place.'}
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="field-grid">
                            <NumberField label="X" value={layer.x} onChange={(x) => patch({ x })} />
                            <NumberField label="Y" value={layer.y} onChange={(y) => patch({ y })} />
                            <NumberField
                              label="W"
                              value={layer.width}
                              min={1}
                              max={32768}
                              onChange={(width) => patch({ width })}
                            />
                            <NumberField
                              label="H"
                              value={layer.height}
                              min={1}
                              max={32768}
                              onChange={(height) => patch({ height })}
                            />
                            <NumberField
                              label="Rotation"
                              value={layer.rotation}
                              min={-360}
                              max={360}
                              onChange={(rotation) => patch({ rotation })}
                            />
                            <NumberField
                              label="Radius"
                              value={layer.radius}
                              min={0}
                              max={10000}
                              onChange={(radius) => patch({ radius })}
                            />
                          </div>
                          <div className="align-actions">
                            <button onClick={() => patch({ x: (project.width - layer.width) / 2 })}>
                              Center X
                            </button>
                            <button
                              onClick={() => patch({ y: (project.height - layer.height) / 2 })}
                            >
                              Center Y
                            </button>
                          </div>
                        </>
                      )}
                    </section>
                  )}
                  {layer.kind === 'text' && selected.length === 1 && (
                    <section className="property-section">
                      <h4>Typography</h4>
                      <textarea
                        aria-label="Text content"
                        value={layer.text ?? ''}
                        onChange={(e) => patch({ text: e.target.value })}
                        rows={3}
                      />
                      <div className="field-grid">
                        <NumberField
                          label="Size"
                          value={layer.fontSize ?? 64}
                          min={8}
                          max={1000}
                          onChange={(fontSize) => patch({ fontSize })}
                        />
                        <label className="number-field">
                          <span>Weight</span>
                          <select
                            aria-label="Font weight"
                            value={layer.fontWeight ?? 400}
                            onChange={(e) => patch({ fontWeight: Number(e.target.value) })}
                          >
                            <option value="400">Regular</option>
                            <option value="500">Medium</option>
                            <option value="600">Semibold</option>
                            <option value="700">Bold</option>
                          </select>
                        </label>
                      </div>
                    </section>
                  )}
                  {visualSelection.length === 1 && (
                    <fieldset className="inspector-fields" disabled={Boolean(layer.locked)}>
                      <MaskControls key={layer.id} layer={layer} patch={patchOne} />
                    </fieldset>
                  )}
                  {colorEditor}
                  {!isAudio && (
                    <section className="property-section">
                      <h4>Appearance</h4>
                      <label className="range-label">
                        Opacity <span>{Math.round(layer.opacity * 100)}%</span>
                        <input
                          aria-label="Opacity"
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={layer.opacity}
                          onChange={(e) => patch({ opacity: Number(e.target.value) })}
                        />
                      </label>
                    </section>
                  )}
                  {(layer.kind === 'audio' || layer.kind === 'video') && (
                    <SoundControls layer={layer} patch={patch} />
                  )}
                  <section className="property-section">
                    <h4>Timing</h4>
                    <div className="field-grid">
                      <NumberField
                        label="Start (s)"
                        value={layer.start}
                        min={0}
                        max={Math.max(0, project.duration - layer.duration)}
                        step={0.1}
                        onChange={(start) => patch({ start })}
                      />
                      <NumberField
                        label="Length (s)"
                        value={layer.duration}
                        min={1 / project.fps}
                        max={Math.min(
                          project.duration - layer.start,
                          (layer.sourceDuration ?? Infinity) - (layer.mediaOffset ?? 0),
                        )}
                        step={0.1}
                        onChange={(duration) => patch({ duration })}
                      />
                    </div>
                  </section>
                </>
              )}
              {activeTab === 'motion' &&
                (isAudio ? (
                  <SoundControls layer={layer} patch={patch} />
                ) : (
                  <>
                    <section className="property-section">
                      <h4>
                        Motion{' '}
                        <span className="recipe-state">
                          {motionPreset === 'custom'
                            ? 'Custom'
                            : motionPreset === 'mixed'
                              ? 'Mixed'
                              : 'One click'}
                        </span>
                      </h4>
                      <div className="motion-grid">
                        {MOTION_PRESETS.map((recipe) => (
                          <button
                            key={recipe.id}
                            onClick={() => patchVisual(getMotionPresetPatch(recipe.id))}
                            className={motionPreset === recipe.id ? 'active' : ''}
                            aria-pressed={motionPreset === recipe.id}
                            disabled={!visualTargets.length || (recipe.id === 'pop' && isGroup)}
                            title={
                              recipe.id === 'pop' && isGroup
                                ? 'Pop is for a single element. Choose Float or Slide to keep a component together.'
                                : undefined
                            }
                          >
                            <div className={`motion-preview ${recipe.id}`}>
                              <div />
                            </div>
                            <span>{recipe.name}</span>
                          </button>
                        ))}
                      </div>
                      <p className="helper-copy">
                        {isGroup
                          ? 'Float and Slide move the parts together. Pop is available for a single element.'
                          : 'Entrance, easing and exit, ready together.'}
                      </p>
                      <details className="recipe-details">
                        <summary>Fine-tune</summary>
                        {layer.animation !== 'none' && (
                          <div className="field-grid motion-timing">
                            <NumberField
                              label="Delay (s)"
                              value={motion!.delay}
                              min={0}
                              max={Math.min(3600, layer.duration)}
                              step={0.1}
                              onChange={(animationDelay) => patchVisual({ animationDelay })}
                            />
                            <NumberField
                              label="Duration (s)"
                              value={motion!.duration}
                              min={0}
                              max={Math.min(3600, layer.duration - motion!.delay)}
                              step={0.1}
                              onChange={(animationDuration) => patchVisual({ animationDuration })}
                            />
                          </div>
                        )}
                        <label className="property-select">
                          <span>Easing</span>
                          <select
                            aria-label="Animation easing"
                            value={layer.animationEasing ?? 'ease-out'}
                            onChange={(e) =>
                              patchVisual({ animationEasing: e.target.value as AnimationEasing })
                            }
                          >
                            <option value="linear">Linear</option>
                            <option value="ease-in">Ease in</option>
                            <option value="ease-out">Ease out</option>
                            <option value="ease-in-out">Ease in & out</option>
                          </select>
                        </label>
                        <div className="motion-exit-field">
                          <NumberField
                            label="Exit fade (s)"
                            value={motion!.exitDuration}
                            min={0}
                            max={Math.min(3600, layer.duration)}
                            step={0.1}
                            onChange={(exitDuration) => patchVisual({ exitDuration })}
                          />
                        </div>
                        <p className="helper-copy">
                          Timing can also be edited on each timeline track. Set exit fade to 0 to
                          turn it off.
                        </p>
                      </details>
                    </section>
                    {layer.kind === 'video' && <SoundControls layer={layer} patch={patch} />}
                  </>
                ))}
              {activeTab === 'color' && (
                <>
                  {colorEditor}
                  {layer.kind === 'image' && visualSelection.length === 1 && (
                    <fieldset className="inspector-fields" disabled={Boolean(layer.locked)}>
                      <ImageTools
                        key={layer.id}
                        layer={layer}
                        patch={patchOne}
                        autoRemoveBackground={() => autoRemoveBackground(layer.id)}
                      />
                    </fieldset>
                  )}
                  <section className="property-section">
                    <h4>
                      Looks{' '}
                      <span className="recipe-state">
                        {look.id === 'custom'
                          ? 'Custom'
                          : look.id === 'mixed'
                            ? 'Mixed'
                            : 'One click'}
                      </span>
                    </h4>
                    <div className="look-grid">
                      {LOOK_PRESETS.map((recipe) => (
                        <button
                          key={recipe.id}
                          onClick={() => applyLook(recipe.id)}
                          className={look.id === recipe.id ? 'active' : ''}
                          aria-pressed={look.id === recipe.id}
                          aria-label={`${recipe.name} look`}
                          disabled={!visualTargets.length}
                        >
                          <span
                            className="look-swatch"
                            style={{
                              filter: `brightness(${recipe.brightness}) contrast(${recipe.contrast}) saturate(${recipe.saturation})`,
                            }}
                            aria-hidden="true"
                          >
                            <i />
                            <b />
                          </span>
                          <span>{recipe.name}</span>
                        </button>
                      ))}
                    </div>
                    <label className="range-label look-strength">
                      Strength <span>{'strength' in look ? `${look.strength}%` : '—'}</span>
                      <input
                        aria-label="Look strength"
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        disabled={!('strength' in look) || look.id === 'original'}
                        value={'strength' in look ? look.strength : 100}
                        onPointerDown={() => {
                          lookStrengthGesture.current = { active: true, recorded: false };
                        }}
                        onBlur={resetLookStrengthGesture}
                        onKeyDown={resetLookStrengthGesture}
                        onChange={(e) => {
                          if ('strength' in look) {
                            const strength = Number(e.target.value);
                            if (strength === look.strength) return;
                            const gesture = lookStrengthGesture.current;
                            applyLook(look.id, strength, !gesture.active || !gesture.recorded);
                            if (gesture.active) gesture.recorded = true;
                          }
                        }}
                      />
                    </label>
                    <details className="recipe-details">
                      <summary>Adjust</summary>
                      {(['brightness', 'contrast', 'saturation'] as const).map((key) => (
                        <label className="range-label" key={key}>
                          {key[0].toUpperCase() + key.slice(1)}
                          <span>{Math.round(layer[key] * 100)}%</span>
                          <input
                            type="range"
                            aria-label={key}
                            min="0"
                            max="2"
                            step=".01"
                            value={layer[key]}
                            onChange={(e) => patchVisual({ [key]: Number(e.target.value) })}
                          />
                        </label>
                      ))}
                    </details>
                    <button
                      className="secondary wide"
                      title="Reset color"
                      aria-label="Reset color"
                      onClick={() => applyLook('original')}
                    >
                      <RotateCw size={12} />
                      Reset color
                    </button>
                    <p className="helper-copy">
                      Looks replace the current adjustments. Preview and export use the same values.
                    </p>
                  </section>
                </>
              )}
            </fieldset>
            {activeTab === 'design' && (
              <section className="property-section">
                <h4>Organize</h4>
                <div className="align-actions">
                  <button onClick={() => reorder(-1)}>Send back</button>
                  <button onClick={() => reorder(1)}>Bring forward</button>
                </div>
                {selected.length > 1 && (
                  <button className="secondary wide" onClick={group}>
                    Group / ungroup selection
                  </button>
                )}
                <button className="save-component" onClick={saveComponent}>
                  <Component size={15} />
                  Save as component <span>↗</span>
                </button>
                <div className="object-actions">
                  <button title="Duplicate" aria-label="Duplicate selection" onClick={duplicate}>
                    <Copy size={14} />
                  </button>
                  <button
                    title="Lock or unlock"
                    aria-label="Lock selection"
                    onClick={() => patch({ locked: !layer.locked })}
                  >
                    {layer.locked ? <LockKeyhole size={14} /> : <UnlockKeyhole size={14} />}
                  </button>
                  <button title="Delete" aria-label="Delete selection" onClick={remove}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
