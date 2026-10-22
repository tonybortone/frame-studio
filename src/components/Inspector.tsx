import { useState } from 'react';
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
import type { Layer, Project, Animation, AnimationEasing } from '../core/types';
import { LAYER_COLORS, LAYER_LABELS } from '../core/types';
import { getAudioTiming, getMotionTiming } from '../core/motion';
import { kindIcons } from './Timeline';
import './Inspector.css';
interface Props {
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
}: Props) {
  const [tab, setTab] = useState('design');
  const layer = project.layers.find((l) => l.id === selected[0]);
  const isAudio = layer?.kind === 'audio';
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
  const Icon = layer ? kindIcons[layer.kind] : SlidersHorizontal;
  return (
    <aside className="inspector" aria-label="Properties">
      <div className="inspector-tabs">
        {[
          { id: 'design', label: 'Design', icon: SlidersHorizontal },
          { id: 'motion', label: isAudio ? 'Sound' : 'Motion', icon: isAudio ? Volume2 : Sparkles },
          { id: 'color', label: 'Color', icon: Sliders },
        ]
          .filter((t) => !isAudio || t.id !== 'color')
          .map((t) => (
            <button
              key={t.id}
              className={activeTab === t.id ? 'active' : ''}
              aria-pressed={activeTab === t.id}
              onClick={() => setTab(t.id)}
            >
              <t.icon size={13} />
              {t.label}
            </button>
          ))}
      </div>
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
          <button aria-label="Close properties" title="Close properties" onClick={close}>
            <X size={14} />
          </button>
        </div>
        {!layer ? (
          <>
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
            </section>
          </>
        ) : (
          <>
            {layer.locked && (
              <p className="locked-notice">
                <LockKeyhole size={12} /> Unlock this layer to edit its properties.
              </p>
            )}
            <fieldset className="inspector-fields" disabled={Boolean(layer.locked)}>
              {activeTab === 'design' && (
                <>
                  {!isAudio && (
                    <section className="property-section">
                      <h4>
                        Transform <MoveHorizontal size={13} />
                      </h4>
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
                        <button onClick={() => patch({ y: (project.height - layer.height) / 2 })}>
                          Center Y
                        </button>
                      </div>
                    </section>
                  )}
                  {layer.kind === 'text' && (
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
                  {['shape', 'text', 'svg', 'drawing'].includes(layer.kind) && (
                    <section className="property-section">
                      <h4>{layer.kind === 'drawing' ? 'Stroke' : 'Fill'}</h4>
                      <label className="color-field">
                        <input
                          type="color"
                          aria-label="Element color"
                          value={
                            (layer.kind === 'drawing' ? layer.stroke : layer.fill) === 'transparent'
                              ? '#2b2d42'
                              : ((layer.kind === 'drawing' ? layer.stroke : layer.fill) ??
                                '#2b2d42')
                          }
                          onChange={(e) =>
                            patch(
                              layer.kind === 'drawing'
                                ? { stroke: e.target.value }
                                : { fill: e.target.value },
                            )
                          }
                        />
                        <span>
                          {(layer.kind === 'drawing' ? layer.stroke : layer.fill)?.toUpperCase()}
                        </span>
                        <span>Solid</span>
                      </label>
                    </section>
                  )}
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
                        Entrance animation <Sparkles size={13} />
                      </h4>
                      <div className="motion-grid">
                        {(['none', 'fade', 'rise', 'pop', 'slide'] as Animation[]).map((a) => (
                          <button
                            key={a}
                            onClick={() => patch({ animation: a })}
                            className={layer.animation === a ? 'active' : ''}
                            aria-pressed={layer.animation === a}
                          >
                            <div className={`motion-preview ${a}`}>
                              <div />
                            </div>
                            <span>{a === 'none' ? 'None' : a[0].toUpperCase() + a.slice(1)}</span>
                          </button>
                        ))}
                      </div>
                      {layer.animation !== 'none' && (
                        <>
                          <div className="field-grid motion-timing">
                            <NumberField
                              label="Delay (s)"
                              value={motion!.delay}
                              min={0}
                              max={Math.min(3600, layer.duration)}
                              step={0.1}
                              onChange={(animationDelay) => patch({ animationDelay })}
                            />
                            <NumberField
                              label="Duration (s)"
                              value={motion!.duration}
                              min={0}
                              max={Math.min(3600, layer.duration - motion!.delay)}
                              step={0.1}
                              onChange={(animationDuration) => patch({ animationDuration })}
                            />
                          </div>
                        </>
                      )}
                      <label className="property-select">
                        <span>Easing</span>
                        <select
                          aria-label="Animation easing"
                          value={layer.animationEasing ?? 'ease-out'}
                          onChange={(e) =>
                            patch({ animationEasing: e.target.value as AnimationEasing })
                          }
                        >
                          <option value="linear">Linear</option>
                          <option value="ease-in">Ease in</option>
                          <option value="ease-out">Ease out</option>
                          <option value="ease-in-out">Ease in & out</option>
                        </select>
                      </label>
                      <p className="helper-copy">
                        Edit these same timings directly in the timeline.
                      </p>
                    </section>
                    <section className="property-section">
                      <h4>Exit fade</h4>
                      <NumberField
                        label="Exit fade (s)"
                        value={motion!.exitDuration}
                        min={0}
                        max={Math.min(3600, layer.duration)}
                        step={0.1}
                        onChange={(exitDuration) => patch({ exitDuration })}
                      />
                      <p className="helper-copy">
                        Fade at the end of this clip. Set to 0 to turn off.
                      </p>
                    </section>
                    {layer.kind === 'video' && <SoundControls layer={layer} patch={patch} />}
                  </>
                ))}
              {activeTab === 'color' && (
                <section className="property-section">
                  <h4>
                    Color adjustments{' '}
                    <button
                      title="Reset color"
                      onClick={() => patch({ brightness: 1, contrast: 1, saturation: 1 })}
                    >
                      <RotateCw size={12} />
                    </button>
                  </h4>
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
                        onChange={(e) => patch({ [key]: Number(e.target.value) })}
                      />
                    </label>
                  ))}
                  <p className="helper-copy">
                    These adjustments are included in preview and export.
                  </p>
                </section>
              )}
            </fieldset>
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
          </>
        )}
      </div>
    </aside>
  );
}
