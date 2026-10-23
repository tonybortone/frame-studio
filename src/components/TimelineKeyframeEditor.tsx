import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import type { KeyframeProperty, Layer, Project, PropertyKeyframe } from '../core/types';
import {
  evaluateKeyframeProperty,
  evaluateKeyframeProgress,
  getLocalKeyframeTime,
  upsertKeyframe,
  removeKeyframe,
  moveKeyframe,
  KEYFRAME_LIMITS,
} from '../core/keyframes';
import KeyframeCurveEditor from './KeyframeCurveEditor';
import KeyframeMotionPreview from './KeyframeMotionPreview';
import { SlidersHorizontal, Trash2, X } from '../icons';
import CompactSelect from './CompactSelect';
import './TimelineKeyframeEditor.css';

const GROUPS = [
  { id: 'position', name: 'Position', properties: ['x', 'y'], labels: ['X', 'Y'], unit: 'px' },
  { id: 'size', name: 'Size', properties: ['width', 'height'], labels: ['W', 'H'], unit: 'px' },
  { id: 'rotation', name: 'Rotation', properties: ['rotation'], labels: ['value'], unit: '°' },
  { id: 'opacity', name: 'Opacity', properties: ['opacity'], labels: ['value'], unit: '%' },
  {
    id: 'tilt',
    name: '3D tilt',
    properties: ['rotateX', 'rotateY'],
    labels: ['X', 'Y'],
    unit: '°',
  },
  { id: 'depth', name: 'Depth', properties: ['depth'], labels: ['value'], unit: '%' },
  { id: 'blur', name: 'Soft blur', properties: ['blur'], labels: ['value'], unit: 'px' },
  { id: 'reveal', name: 'Mask reveal', properties: ['reveal'], labels: ['value'], unit: '%' },
  { id: 'text', name: 'Text reveal', properties: ['textReveal'], labels: ['value'], unit: '%' },
] as const;
type Group = (typeof GROUPS)[number];
const displayScale = (property: KeyframeProperty) =>
  ['opacity', 'reveal', 'textReveal'].includes(property) ? 100 : 1;
interface GroupKey {
  id: string;
  time: number;
  frames: Partial<Record<KeyframeProperty, PropertyKeyframe>>;
}
interface Props {
  project: Project;
  modeSwitch: ReactNode;
  onClose: () => void;
  layer: Layer;
  fps: number;
  time: number;
  compositionDuration: number;
  pixels: number;
  laneWidth: number;
  seek: (time: number, reveal?: boolean) => void;
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

/** One property at a time; the same authored keys power canvas, preview and export. */
export default function TimelineKeyframeEditor({
  project,
  modeSwitch,
  onClose,
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
  const initialGroup = () =>
    GROUPS.find((item) => item.properties.some((property) => layer.keyframes?.[property]?.length))
      ?.id ?? 'position';
  const [activeGroup, setActiveGroup] = useState<Group['id']>(initialGroup);
  const [adjust, setAdjust] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0.5);
  const gesture = useRef<(() => void) | null>(null);
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
    setActiveGroup(initialGroup());
    setAdjust(false);
    gesture.current?.();
  }, [layer.id]);
  useEffect(() => {
    if (expectedSeek.current !== null && !near(time, expectedSeek.current)) setSelected(null);
  }, [time]);
  const seekKeyTime = (at: number, reveal = true) => {
    expectedSeek.current = Math.max(0, Math.min(layer.start + at, compositionDuration - 1 / fps));
    seek(layer.start + at, reveal);
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
        // Numeric edits touch only the field being edited; diamond insertion remains paired.
        if (values && values[property] === undefined) continue;
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
    edit(
      {
        keyframes: draft.keyframes,
        keyframeOffset: draft.keyframeOffset,
        transform3d: draft.transform3d,
      },
      record,
    );
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
    return {
      keyframes: draft.keyframes,
      keyframeOffset: draft.keyframeOffset,
      transform3d: draft.transform3d,
    };
  };
  const moveTo = (target: Group, entry: GroupKey, at: number, record = true) => {
    const next = snap(at, fps, layer.duration);
    if (near(next, entry.time)) return;
    edit(movePatch(target, entry, next), record);
    seekKeyTime(next);
  };
  const selectKey = (target: Group, entry: GroupKey, reveal = true) => {
    setActiveGroup(target.id);
    setSelected({ group: target.id, id: entry.id });
    seekKeyTime(entry.time, reveal);
  };
  const startDrag = (
    event: PointerEvent<HTMLButtonElement>,
    targetGroup: Group,
    entry: GroupKey,
  ) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    selectKey(targetGroup, entry, false);
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
      seekKeyTime(nextTime, false);
    };
    const end = (endingEvent?: globalThis.Event) => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
      target.removeEventListener('lostpointercapture', end);
      if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
      gesture.current = null;
      if (endingEvent?.type === 'pointerup') seekKeyTime(previous);
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
  const target = GROUPS.find((item) => item.id === activeGroup)!;
  const entries = groupKeys(layer, target);
  const editingTime = key && selected?.group === target.id ? key.time : localTime;
  const current = entries.find((entry) => near(entry.time, editingTime));
  const previous = entries.filter((entry) => entry.time < localTime - 0.000001).at(-1);
  const next = entries.find((entry) => entry.time > localTime + 0.000001);
  const beforeSelected = key ? entries.filter((entry) => entry.time < key.time).at(-1) : undefined;
  const previewFrom = key
    ? !nextKey && beforeSelected
      ? beforeSelected.time
      : key.time
    : (entries[0]?.time ?? 0);
  const previewTo = key ? (nextKey?.time ?? key.time) : (entries.at(-1)?.time ?? layer.duration);
  const curveKey = key ? (nextKey ? key : beforeSelected) : undefined;
  const curveEnd = curveKey
    ? entries.find((entry) => entry.time > curveKey.time + 0.000001)
    : undefined;
  const samePose =
    curveKey &&
    curveEnd &&
    target.properties.every((property) =>
      near(
        evaluateKeyframeProperty(layer, property, curveKey.time),
        evaluateKeyframeProperty(layer, property, curveEnd.time),
      ),
    );
  const editInstruction =
    target.id === 'position'
      ? 'move the element'
      : target.id === 'size'
        ? 'resize the element'
        : target.id === 'rotation'
          ? 'rotate the element'
          : 'change its value in Adjust';
  // Crowded points get separate rows instead of hiding underneath each other.
  const rowEnds: number[] = [];
  const pointRows = entries.map((entry) => {
    const x = Math.max(16, Math.min(laneWidth - 16, (layer.start + entry.time) * pixels));
    let row = rowEnds.findIndex((end) => x - end >= 34);
    if (row < 0) row = rowEnds.length;
    rowEnds[row] = x;
    return row;
  });
  const crowded = rowEnds.length > 1;
  const laneHeight = crowded ? 8 + rowEnds.length * 28 : 40;
  const addNextPoint = () => {
    const from = key?.time ?? entries.at(-1)?.time ?? localTime;
    const step = Math.max(1 / fps, Math.min(1, layer.duration / 3));
    const end = Math.max(0, layer.duration - 1 / fps);
    const at = snap(
      from + step <= end ? from + step : Math.max(0, from - step),
      fps,
      layer.duration,
    );
    if (!near(at, from)) applyGroup(target, at);
  };
  const activate = (id: Group['id']) => {
    setActiveGroup(id);
    setSelected(null);
    expectedSeek.current = null;
    setAdjust(false);
  };
  return (
    <div
      className="timeline-keyframes"
      role="group"
      aria-label={`Keyframes for ${layer.name}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          setSelected(null);
        }
        if (event.key === 'Delete' || event.key === 'Backspace') event.stopPropagation();
      }}
    >
      <div className="keyframe-property-bar">
        {modeSwitch}
        <span className="keyframe-target-name" title={layer.name}>
          {layer.name}
        </span>
        <CompactSelect
          label={`Animated property for ${layer.name}`}
          value={activeGroup}
          options={GROUPS.filter((item) => item.id !== 'text' || layer.kind === 'text').map(
            (item) => ({
              value: item.id,
              label: item.name,
              hint: `${groupKeys(layer, item).length} points`,
            }),
          )}
          onChange={(id) => activate(id as Group['id'])}
        />
        <span className="keyframe-count" aria-live="polite">
          {entries.length} {entries.length === 1 ? 'point' : 'points'}
        </span>
        <button
          type="button"
          className="keyframe-adjust-toggle"
          aria-label={`Adjust keyframe values for ${layer.name}`}
          aria-expanded={adjust}
          aria-controls={`keyframe-values-${layer.id}`}
          onClick={() => setAdjust(!adjust)}
        >
          <SlidersHorizontal size={12} /> Adjust
        </button>
        <button
          type="button"
          className="keyframe-close"
          aria-label={`Close motion editor for ${layer.name}`}
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </div>
      {error && (
        <div className="keyframe-message" role="alert">
          {error}
        </div>
      )}
      {!inside && (
        <div className="keyframe-message">Move the playhead inside this clip to add a point.</div>
      )}
      <div
        className={`keyframe-row ${key ? 'is-selected' : ''} ${crowded ? 'is-crowded' : ''}`}
        style={{ height: laneHeight }}
        role="group"
        aria-label={`${target.name} keyframes for ${layer.name}`}
      >
        <div className="keyframe-row-label">
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
              title={current ? 'Remove point at playhead' : 'Add point at playhead'}
              disabled={locked || !inside}
              onClick={() => (current ? remove(target, current) : applyGroup(target, editingTime))}
            >
              <span aria-hidden="true">{current ? '◆' : '◇'}</span>{' '}
              {current ? 'Remove point' : 'Add point'}
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
        <div
          className="track-lane keyframe-lane"
          style={{ width: laneWidth, height: laneHeight }}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('.keyframe-diamond')) return;
            const at =
              (event.clientX - event.currentTarget.getBoundingClientRect().left) / pixels -
              layer.start;
            setSelected(null);
            seekKeyTime(snap(at, fps, layer.duration));
          }}
          onDoubleClick={(event) => {
            if (locked || (event.target as HTMLElement).closest('.keyframe-diamond')) return;
            const at =
              (event.clientX - event.currentTarget.getBoundingClientRect().left) / pixels -
              layer.start;
            if (at >= 0 && at <= layer.duration) applyGroup(target, snap(at, fps, layer.duration));
          }}
        >
          <div
            className={`keyframe-track-line ${entries.length ? 'is-animated' : ''}`}
            style={{ left: layer.start * pixels, width: layer.duration * pixels }}
          />
          {!entries.length && (
            <span className="keyframe-empty" style={{ left: layer.start * pixels + 14 }}>
              Click here to move time
            </span>
          )}
          {entries.slice(0, -1).map((entry, index) => {
            const end = entries[index + 1];
            const width = (end.time - entry.time) * pixels;
            const path = Array.from(
              { length: 25 },
              (_, i) =>
                `${i ? 'L' : 'M'}${(i / 24) * 100},${14 - evaluateKeyframeProgress(firstFrame(entry), i / 24) * 10}`,
            ).join(' ');
            return (
              <div
                key={`segment-${entry.id}`}
                className={`keyframe-segment ${key?.id === entry.id ? 'is-selected' : ''}`}
                aria-hidden="true"
                style={{
                  left: (layer.start + entry.time) * pixels + 14,
                  width: Math.max(0, width - 28),
                }}
              >
                <svg viewBox="0 0 100 18" preserveAspectRatio="none" aria-hidden="true">
                  <path d={path} />
                </svg>
              </div>
            );
          })}
          {entries.map((entry, index) => {
            const chosen = Object.values(entry.frames).some((frame) => frame.id === selected?.id);
            return (
              <button
                type="button"
                key={chosen ? selected!.id : entry.id}
                data-keyframe-id={entry.id}
                className={`keyframe-diamond ${chosen ? 'is-selected' : ''} ${firstFrame(entry).easing === 'hold' ? 'is-hold' : ''}`}
                aria-label={`${target.name} keyframe at ${entry.time.toFixed(2)} seconds for ${layer.name}`}
                aria-pressed={chosen}
                title={`${target.name} · ${entry.time.toFixed(2)}s · Drag to move · Delete to remove`}
                style={{
                  top: 4 + pointRows[index] * 28,
                  left: Math.max(16, Math.min(laneWidth - 16, (layer.start + entry.time) * pixels)),
                }}
                onPointerDown={(event) => startDrag(event, target, entry)}
                onKeyDown={(event) => keyDown(event, target, entry)}
                onClick={(event) => {
                  event.stopPropagation();
                  if (event.detail === 0) selectKey(target, entry);
                }}
              >
                <span />
                <small>{entry.time.toFixed(2)}s</small>
              </button>
            );
          })}
        </div>
      </div>
      {adjust && (
        <div className="keyframe-value-drawer" id={`keyframe-values-${layer.id}`}>
          <span>{key ? 'Selected point' : 'At playhead'}</span>
          <div className="keyframe-values">
            {target.properties.map((property, index) => (
              <label key={property}>
                <span>{target.labels[index] === 'value' ? target.unit : target.labels[index]}</span>
                <input
                  type="number"
                  aria-label={`${target.name} ${target.labels[index]} for ${layer.name}`}
                  value={Number(
                    (
                      evaluateKeyframeProperty(layer, property, editingTime) *
                      displayScale(property)
                    ).toFixed(2),
                  )}
                  step={displayScale(property) === 100 ? 1 : 0.1}
                  disabled={locked || !inside}
                  min={KEYFRAME_LIMITS[property][0] * displayScale(property)}
                  max={KEYFRAME_LIMITS[property][1] * displayScale(property)}
                  onFocus={() => {
                    numberGesture.current = false;
                  }}
                  onBlur={() => {
                    numberGesture.current = false;
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    const value = event.currentTarget.valueAsNumber;
                    if (Number.isFinite(value))
                      applyGroup(
                        target,
                        editingTime,
                        { [property]: value / displayScale(property) },
                        false,
                      );
                  }}
                />
              </label>
            ))}
          </div>
          {key && (
            <label className="keyframe-time-detail">
              <span>Time</span>
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
                  onKeyDown={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    const value = event.currentTarget.valueAsNumber;
                    if (
                      Number.isFinite(value) &&
                      !near(snap(value, fps, layer.duration), key.time)
                    ) {
                      beginNumberEdit();
                      moveTo(target, key, value, false);
                    }
                  }}
                />
                <small>s</small>
              </div>
            </label>
          )}
          {target.id === 'reveal' && (
            <label className="keyframe-effect-detail">
              <span>Direction</span>
              <select
                aria-label={`Mask reveal direction for ${layer.name}`}
                value={layer.revealDirection ?? 'left'}
                disabled={locked}
                onChange={(event) =>
                  edit({ revealDirection: event.currentTarget.value as Layer['revealDirection'] })
                }
              >
                <option value="left">From left</option>
                <option value="right">From right</option>
                <option value="up">From top</option>
                <option value="down">From bottom</option>
                <option value="center">From center</option>
              </select>
            </label>
          )}
          {target.id === 'text' && (
            <label className="keyframe-effect-detail">
              <span>Reveal by</span>
              <select
                aria-label={`Text reveal mode for ${layer.name}`}
                value={layer.textRevealMode ?? 'characters'}
                disabled={locked}
                onChange={(event) =>
                  edit({ textRevealMode: event.currentTarget.value as Layer['textRevealMode'] })
                }
              >
                <option value="characters">Character</option>
                <option value="words">Word</option>
              </select>
            </label>
          )}
        </div>
      )}
      <div className="keyframe-selection-panel">
        {key && group && curveKey ? (
          <KeyframeCurveEditor
            key={curveKey.id}
            frame={firstFrame(curveKey)}
            name={layer.name}
            disabled={locked}
            hint={samePose ? `These points match — ${editInstruction} to make a move.` : undefined}
            disabledReason={locked ? 'Unlock this element to change its curve.' : undefined}
            progress={previewTo > previewFrom ? previewProgress : undefined}
            checkpoint={checkpoint}
            change={(patch, record = true) => {
              let draft = layer;
              for (const property of group.properties) {
                const frame = curveKey.frames[property];
                if (frame)
                  draft = {
                    ...draft,
                    ...upsertKeyframe(draft, property, curveKey.time, frame.value, {
                      id: frame.id,
                      ...patch,
                    }),
                  };
              }
              edit(
                {
                  keyframes: draft.keyframes,
                  keyframeOffset: draft.keyframeOffset,
                  transform3d: draft.transform3d,
                },
                record,
              );
            }}
          />
        ) : (
          <div className="keyframe-selection-hint">
            <svg viewBox="0 0 140 50" aria-hidden="true">
              <path d="M12 36C52 36 60 12 128 12" />
              <circle cx="12" cy="36" r="5" />
              <circle cx="128" cy="12" r="5" />
            </svg>
            <div>
              <strong>
                {entries.length > 1 ? 'Shape the move between points' : 'Two points make a move'}
              </strong>
              <p>
                {entries.length > 1
                  ? 'Choose either point to change the curve.'
                  : entries.length === 1
                    ? `Click later in the row, then ${editInstruction}.`
                    : `Add a first point to animate ${target.name.toLowerCase()}.`}
              </p>
              {entries.length === 1 && (
                <button
                  type="button"
                  aria-label={`Add next ${target.name} point for ${layer.name}`}
                  disabled={locked || layer.duration <= 1 / fps}
                  onClick={addNextPoint}
                >
                  Add next point →
                </button>
              )}
              {entries.length > 1 && (
                <button type="button" onClick={() => selectKey(target, entries[0])}>
                  Edit first curve →
                </button>
              )}
            </div>
          </div>
        )}
        <KeyframeMotionPreview
          project={project}
          layer={layer}
          from={previewFrom}
          to={previewTo}
          onProgress={setPreviewProgress}
        />
        {key && (
          <button
            type="button"
            className="keyframe-delete"
            aria-label={`Delete selected keyframe for ${layer.name}`}
            title="Delete this point"
            disabled={locked}
            onClick={() => remove(target, key)}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
