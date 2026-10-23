import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { KeyframeProperty, Layer, PropertyKeyframe } from '../core/types';
import {
  evaluateKeyframeProperty,
  getLocalKeyframeTime,
  upsertKeyframe,
  removeKeyframe,
  moveKeyframe,
} from '../core/keyframes';
import KeyframeCurveEditor from './KeyframeCurveEditor';
import './TimelineKeyframeEditor.css';

const GROUPS = [
  { id: 'position', name: 'Position', properties: ['x', 'y'], labels: ['X', 'Y'], unit: 'px' },
  { id: 'size', name: 'Size', properties: ['width', 'height'], labels: ['W', 'H'], unit: 'px' },
  { id: 'rotation', name: 'Rotation', properties: ['rotation'], labels: ['value'], unit: '°' },
  { id: 'opacity', name: 'Opacity', properties: ['opacity'], labels: ['value'], unit: '%' },
] as const;
type Group = (typeof GROUPS)[number];
interface GroupKey {
  id: string;
  time: number;
  frames: Partial<Record<KeyframeProperty, PropertyKeyframe>>;
}
interface Props {
  layer: Layer;
  fps: number;
  time: number;
  compositionDuration: number;
  pixels: number;
  laneWidth: number;
  seek: (time: number) => void;
  change: (id: string, patch: Partial<Layer>, record?: boolean) => void;
  checkpoint: () => void;
}
const near = (a: number, b: number) => Math.abs(a - b) < 0.000001;
const snap = (time: number, fps: number, duration: number) =>
  Math.max(0, Math.min(duration, Math.round(time * fps) / fps));
function groupKeys(layer: Layer, group: Group): GroupKey[] {
  const result: GroupKey[] = [];
  for (const property of group.properties)
    for (const frame of layer.keyframes?.[property] ?? []) {
      const time = getLocalKeyframeTime(layer, frame);
      if (time < -0.000001 || time > layer.duration + 0.000001) continue;
      let entry = result.find((item) => near(item.time, time));
      if (!entry) {
        entry = { id: frame.id, time, frames: {} };
        result.push(entry);
      }
      entry.frames[property] = frame;
    }
  return result.sort((a, b) => a.time - b.time);
}
const firstFrame = (key: GroupKey) => Object.values(key.frames)[0]!;

/** Four approachable lanes backed by six independent, persisted property tracks. */
export default function TimelineKeyframeEditor({
  layer,
  fps,
  time,
  compositionDuration,
  pixels,
  laneWidth,
  seek,
  change,
  checkpoint,
}: Props) {
  const [selected, setSelected] = useState<{ group: Group['id']; id: string } | null>(null);
  const [error, setError] = useState('');
  const gesture = useRef<(() => void) | null>(null);
  const selectionPanel = useRef<HTMLDivElement>(null);
  const expectedSeek = useRef<number | null>(null);
  const numberGesture = useRef(false);
  const localTime = snap(time - layer.start, fps, layer.duration);
  const inside = time >= layer.start - 0.000001 && time <= layer.start + layer.duration + 0.000001;
  const locked = Boolean(layer.locked);
  const group = GROUPS.find((item) => item.id === selected?.group);
  const selectedKeys = group ? groupKeys(layer, group) : [];
  const key = selectedKeys.find((item) =>
    Object.values(item.frames).some((frame) => frame.id === selected?.id),
  );
  const nextKey = key ? selectedKeys.find((item) => item.time > key.time + 0.000001) : undefined;
  useEffect(() => () => gesture.current?.(), []);
  useEffect(() => {
    setSelected(null);
    setError('');
    gesture.current?.();
  }, [layer.id]);
  useEffect(() => {
    if (expectedSeek.current !== null && !near(time, expectedSeek.current)) setSelected(null);
  }, [time]);
  const seekKeyTime = (at: number) => {
    expectedSeek.current = Math.max(0, Math.min(layer.start + at, compositionDuration - 1 / fps));
    seek(layer.start + at);
  };
  const beginNumberEdit = () => {
    if (!numberGesture.current) {
      checkpoint();
      numberGesture.current = true;
    }
  };
  const edit = (patch: Partial<Layer>, record = true) => {
    if (!locked) change(layer.id, patch, record);
  };
  const applyGroup = (
    target: Group,
    at: number,
    values?: Partial<Record<KeyframeProperty, number>>,
    record = true,
  ) => {
    let draft = layer;
    try {
      for (const property of target.properties) {
        draft = {
          ...draft,
          ...upsertKeyframe(
            draft,
            property,
            at,
            values?.[property] ?? evaluateKeyframeProperty(layer, property, at),
          ),
        };
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add this keyframe.');
      return;
    }
    setError('');
    if (!record) beginNumberEdit();
    edit({ keyframes: draft.keyframes, keyframeOffset: draft.keyframeOffset }, record);
    const added = groupKeys(draft, target).find((entry) => near(entry.time, at));
    if (added) setSelected({ group: target.id, id: added.id });
    seekKeyTime(at);
  };
  const remove = (target: Group, entry: GroupKey) => {
    let draft = layer;
    for (const property of target.properties) {
      const frame = entry.frames[property];
      if (frame) draft = { ...draft, ...removeKeyframe(draft, property, frame.id) };
    }
    edit({ keyframes: draft.keyframes, keyframeOffset: draft.keyframeOffset });
    setSelected(null);
  };
  const movePatch = (target: Group, entry: GroupKey, at: number) => {
    let draft = layer;
    for (const property of target.properties) {
      const frame = entry.frames[property];
      if (frame) draft = { ...draft, ...moveKeyframe(draft, property, frame.id, at) };
    }
    return { keyframes: draft.keyframes, keyframeOffset: draft.keyframeOffset };
  };
  const moveTo = (target: Group, entry: GroupKey, at: number, record = true) => {
    const next = snap(at, fps, layer.duration);
    if (near(next, entry.time)) return;
    edit(movePatch(target, entry, next), record);
    seekKeyTime(next);
  };
  const selectKey = (target: Group, entry: GroupKey) => {
    setSelected({ group: target.id, id: entry.id });
    seekKeyTime(entry.time);
  };
  const startDrag = (
    event: PointerEvent<HTMLButtonElement>,
    targetGroup: Group,
    entry: GroupKey,
  ) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    selectKey(targetGroup, entry);
    if (locked) return;
    gesture.current?.();
    const target = event.currentTarget;
    const initialX = event.clientX;
    let previous = entry.time;
    let recorded = false;
    target.setPointerCapture(event.pointerId);
    const move = (next: globalThis.PointerEvent) => {
      const nextTime = snap(entry.time + (next.clientX - initialX) / pixels, fps, layer.duration);
      if (near(nextTime, previous)) return;
      if (!recorded) {
        checkpoint();
        recorded = true;
      }
      previous = nextTime;
      edit(movePatch(targetGroup, entry, nextTime), false);
      seekKeyTime(nextTime);
    };
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
      target.removeEventListener('lostpointercapture', end);
      if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
      gesture.current = null;
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
    target.addEventListener('lostpointercapture', end);
    gesture.current = end;
  };
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>, target: Group, entry: GroupKey) => {
    if (['Delete', 'Backspace', 'ArrowLeft', 'ArrowRight', 'Escape'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setSelected(null);
        return;
      }
      if (locked) return;
      if (event.key === 'Delete' || event.key === 'Backspace') remove(target, entry);
      else
        moveTo(
          target,
          entry,
          entry.time + ((event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 10 : 1)) / fps,
        );
    }
  };
  return (
    <div
      className="timeline-keyframes"
      role="group"
      aria-label={`Keyframes for ${layer.name}`}
      onKeyDown={(event) => {
        // Field editing and frame deletion must never fall through to the global layer shortcuts.
        if (event.key === 'Escape') {
          event.stopPropagation();
          setSelected(null);
        }
        if (event.key === 'Delete' || event.key === 'Backspace') event.stopPropagation();
      }}
    >
      <div className="keyframe-guide">
        <span>
          <span className="keyframe-guide-diamond">◇</span> Add a keyframe. Move the playhead.
          Change a value.
        </span>
        <small role={error ? 'alert' : undefined}>
          {error ||
            (inside
              ? 'Animated properties follow your canvas edits.'
              : 'Move the playhead inside this clip to add a keyframe.')}
        </small>
      </div>
      {GROUPS.map((target) => {
        const entries = groupKeys(layer, target);
        // A selected endpoint may be beyond the last displayable composition frame.
        const editingTime = key && selected?.group === target.id ? key.time : localTime;
        const current = entries.find((entry) => near(entry.time, editingTime));
        const previous = entries.filter((entry) => entry.time < localTime - 0.000001).at(-1);
        const next = entries.find((entry) => entry.time > localTime + 0.000001);
        const active = target.properties.some(
          (property) => (layer.keyframes?.[property]?.length ?? 0) > 0,
        );
        return (
          <div
            className={`keyframe-row ${selected?.group === target.id ? 'is-selected' : ''}`}
            key={target.id}
            role="group"
            aria-label={`${target.name} keyframes for ${layer.name}`}
          >
            <div className="keyframe-row-label">
              <div className="keyframe-property-title">
                <span>{target.name}</span>
                <div className="keyframe-navigation">
                  <button
                    type="button"
                    aria-label={`Previous ${target.name} keyframe for ${layer.name}`}
                    disabled={!previous}
                    onClick={() => previous && selectKey(target, previous)}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className={`keyframe-add ${current ? 'is-active' : ''}`}
                    aria-label={`${current ? 'Remove' : 'Add'} ${target.name} keyframe for ${layer.name}`}
                    title={current ? 'Remove keyframe at playhead' : 'Add keyframe at playhead'}
                    disabled={locked || !inside}
                    onClick={() =>
                      current ? remove(target, current) : applyGroup(target, editingTime)
                    }
                  >
                    {current ? '◆' : '◇'}
                  </button>
                  <button
                    type="button"
                    aria-label={`Next ${target.name} keyframe for ${layer.name}`}
                    disabled={!next}
                    onClick={() => next && selectKey(target, next)}
                  >
                    ›
                  </button>
                </div>
              </div>
              <div className="keyframe-values">
                {target.properties.map((property, index) => {
                  const value =
                    evaluateKeyframeProperty(layer, property, editingTime) *
                    (property === 'opacity' ? 100 : 1);
                  return (
                    <label key={property}>
                      <span>
                        {target.labels[index] === 'value' ? target.unit : target.labels[index]}
                      </span>
                      <input
                        type="number"
                        aria-label={`${target.name} ${target.labels[index]} for ${layer.name}`}
                        value={Number(value.toFixed(2))}
                        step={property === 'opacity' ? 1 : 0.1}
                        disabled={locked || !inside}
                        min={
                          property === 'opacity'
                            ? 0
                            : property === 'width' || property === 'height'
                              ? 0.01
                              : undefined
                        }
                        max={property === 'opacity' ? 100 : undefined}
                        onFocus={() => {
                          numberGesture.current = false;
                        }}
                        onBlur={() => {
                          numberGesture.current = false;
                        }}
                        onChange={(event) => {
                          const value = event.currentTarget.valueAsNumber;
                          if (Number.isFinite(value)) {
                            applyGroup(
                              target,
                              editingTime,
                              {
                                [property]: value / (property === 'opacity' ? 100 : 1),
                              },
                              false,
                            );
                          }
                        }}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
            <div
              className="track-lane keyframe-lane"
              style={{ width: laneWidth }}
              onDoubleClick={(event) => {
                if (locked || event.target !== event.currentTarget) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                const at = (event.clientX - bounds.left) / pixels - layer.start;
                if (at >= 0 && at <= layer.duration)
                  applyGroup(target, snap(at, fps, layer.duration));
              }}
            >
              <div
                className={`keyframe-track-line ${active ? 'is-animated' : ''}`}
                style={{ left: layer.start * pixels, width: layer.duration * pixels }}
              />
              {!active && (
                <span className="keyframe-empty" style={{ left: layer.start * pixels + 14 }}>
                  Add ◇ to animate
                </span>
              )}
              {entries.map((entry) => (
                <button
                  type="button"
                  key={
                    Object.values(entry.frames).some((frame) => frame.id === selected?.id)
                      ? selected!.id
                      : entry.id
                  }
                  data-keyframe-id={entry.id}
                  className={`keyframe-diamond ${Object.values(entry.frames).some((frame) => frame.id === selected?.id) ? 'is-selected' : ''} ${firstFrame(entry).easing === 'hold' ? 'is-hold' : ''}`}
                  aria-label={`${target.name} keyframe at ${entry.time.toFixed(2)} seconds for ${layer.name}`}
                  aria-pressed={Object.values(entry.frames).some(
                    (frame) => frame.id === selected?.id,
                  )}
                  title={`${target.name} · ${entry.time.toFixed(2)}s · Drag to move · Delete to remove`}
                  style={{ left: (layer.start + entry.time) * pixels }}
                  onPointerDown={(event) => startDrag(event, target, entry)}
                  onKeyDown={(event) => keyDown(event, target, entry)}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (event.detail === 0) selectKey(target, entry);
                  }}
                >
                  <span />
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <div className="keyframe-selection-panel" ref={selectionPanel}>
        {key && group ? (
          <>
            <div className="keyframe-selection-details">
              <strong>{group.name} keyframe</strong>
              <label>
                <span>Time in clip</span>
                <div className="keyframe-time-field">
                  <input
                    type="number"
                    aria-label={`Selected keyframe time for ${layer.name}`}
                    value={Number(key.time.toFixed(3))}
                    min="0"
                    max={layer.duration}
                    step={1 / fps}
                    disabled={locked}
                    onFocus={() => {
                      numberGesture.current = false;
                    }}
                    onBlur={() => {
                      numberGesture.current = false;
                    }}
                    onChange={(event) => {
                      const value = event.currentTarget.valueAsNumber;
                      if (
                        Number.isFinite(value) &&
                        !near(snap(value, fps, layer.duration), key.time)
                      ) {
                        beginNumberEdit();
                        moveTo(group, key, value, false);
                      }
                    }}
                  />
                  <small>s</small>
                </div>
              </label>
              <button
                type="button"
                className="keyframe-delete"
                aria-label={`Delete selected keyframe for ${layer.name}`}
                disabled={locked}
                onClick={() => remove(group, key)}
              >
                Remove keyframe
              </button>
            </div>
            <KeyframeCurveEditor
              key={key.id}
              frame={firstFrame(key)}
              name={layer.name}
              disabled={locked || !nextKey}
              checkpoint={checkpoint}
              change={(patch, record = true) => {
                let draft = layer;
                for (const property of group.properties) {
                  const frame = key.frames[property];
                  if (frame)
                    draft = {
                      ...draft,
                      ...upsertKeyframe(draft, property, key.time, frame.value, {
                        id: frame.id,
                        ...patch,
                      }),
                    };
                }
                edit({ keyframes: draft.keyframes, keyframeOffset: draft.keyframeOffset }, record);
              }}
            />
          </>
        ) : (
          <p className="keyframe-selection-hint">
            Select a diamond to adjust its time and curve. Drag diamonds to retime your animation.
          </p>
        )}
      </div>
    </div>
  );
}
