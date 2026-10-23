import { useEffect, useMemo, useRef, useState } from 'react';
import type { Layer, Project } from '../core/types';
import { createLayer, createProject } from '../core/project';
import {
  applyMotionRecipe,
  MOTION_RECIPES,
  type MotionRecipeId,
  type MotionRecipeDirection,
} from '../core/motionRecipes';
import { MediaCache, renderFrame } from '../engine/renderer';
import './MotionRecipes.css';

interface Props {
  project: Project;
  selected: string[];
  time: number;
  apply: (layers: Layer[]) => void;
  editKeys: (id: string) => void;
}

function previewScene(
  recipeId: MotionRecipeId,
  duration: number,
  strength: number,
  direction: MotionRecipeDirection,
  stagger: number,
  textMode: 'characters' | 'words',
  hideBefore: boolean,
): Project {
  const tour = recipeId === 'page-tour';
  const project: Project = {
    ...createProject(),
    width: 480,
    height: 280,
    background: '#17191d',
    name: 'Motion preview',
    duration: Math.max(5, duration + stagger * 3 + 1),
    layers: [],
  };
  const group = 'preview-card';
  const add = (kind: Layer['kind'], patch: Partial<Layer>) => {
    project.layers.push(
      createLayer(kind, {
        duration: project.duration,
        animation: 'none',
        exitDuration: 0,
        ...patch,
      }),
    );
  };
  if (tour) {
    add('shape', {
      x: 110,
      y: 20,
      width: 260,
      height: 850,
      fill: '#f0f2f5',
      radius: 12,
      groupId: group,
    });
    add('shape', {
      x: 124,
      y: 53,
      width: 232,
      height: 160,
      fill: '#a8c9fb',
      radius: 12,
      groupId: group,
    });
    add('text', {
      x: 142,
      y: 100,
      width: 204,
      height: 78,
      text: 'A little\npossibility.',
      fontSize: 27,
      fill: '#172438',
      groupId: group,
    });
    for (let i = 0; i < 3; i++) {
      add('shape', {
        x: 130,
        y: 252 + i * 176,
        width: 220,
        height: 142,
        fill: ['#e0e5ec', '#c4d8f5', '#ced5df'][i],
        radius: 10,
        groupId: group,
      });
      add('text', {
        x: 149,
        y: 278 + i * 176,
        width: 186,
        height: 40,
        text: ['Made for you.', 'Room to grow.', 'Start something.'][i],
        fontSize: 20,
        fill: '#253244',
        groupId: group,
      });
    }
  } else {
    for (let i = 0; i < 3; i++) {
      const id = `preview-${i}`;
      add('shape', {
        x: 44 + i * 135,
        y: 85,
        width: 120,
        height: 120,
        fill: ['#edf0f5', '#a8c9fb', '#d8c8ee'][i],
        radius: 20,
        groupId: id,
      });
      add('text', {
        x: 63 + i * 135,
        y: 122,
        width: 94,
        height: 44,
        text: ['Make', 'it', 'move.'][i],
        fontSize: 27,
        fill: '#20242b',
        groupId: id,
      });
    }
  }
  try {
    const result = applyMotionRecipe(
      project,
      project.layers.map((layer) => layer.id),
      {
        recipeId,
        at: 0.3,
        duration,
        strength,
        direction,
        stagger,
        grouping: tour ? 'together' : 'groups',
        order: 'forward',
        textMode,
        hideBefore,
      },
    );
    return { ...project, layers: result.layers, duration: result.end + 0.6 };
  } catch {
    return project;
  }
}

function RecipePreview({
  recipeId,
  duration,
  strength,
  direction,
  stagger,
  textMode,
  hideBefore,
}: {
  recipeId: MotionRecipeId;
  duration: number;
  strength: number;
  direction: MotionRecipeDirection;
  stagger: number;
  textMode: 'characters' | 'words';
  hideBefore: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(false);
  const preview = useMemo(
    () =>
      previewScene(
        recipeId,
        Math.min(duration, 8),
        strength,
        direction,
        stagger,
        textMode,
        hideBefore,
      ),
    [recipeId, duration, strength, direction, stagger, textMode, hideBefore],
  );
  useEffect(() => {
    setPlaying(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, [preview]);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    const media = new MediaCache();
    let raf = 0;
    const started = performance.now();
    let last = -Infinity;
    const draw = (now: number) => {
      const elapsed = playing ? (now - started) / 1000 : Math.min(1.4, preview.duration * 0.5);
      if (now - last >= 32) {
        renderFrame(context, preview, Math.min(elapsed, preview.duration - 1 / preview.fps), media);
        last = now;
      }
      if (playing && elapsed < preview.duration) raf = requestAnimationFrame(draw);
      else if (playing) setPlaying(false);
    };
    draw(started);
    return () => {
      cancelAnimationFrame(raf);
      media.dispose();
    };
  }, [preview, playing]);
  return (
    <div className="motion-recipe-preview">
      <canvas
        ref={canvas}
        width={480}
        height={280}
        role="img"
        aria-label="Example of the selected motion recipe"
      />
      <div>
        <span>Motion preview</span>
        <button
          type="button"
          onClick={() => setPlaying((value) => !value)}
          aria-label={playing ? 'Pause motion preview' : 'Play motion preview'}
        >
          {playing ? 'Pause' : 'Replay'} <span aria-hidden="true">{playing ? 'Ⅱ' : '▷'}</span>
        </button>
      </div>
    </div>
  );
}

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'entrance', label: 'Enter' },
  { id: 'motion', label: 'Move' },
  { id: 'reveal', label: 'Reveal' },
  { id: 'showcase', label: 'Scenes' },
] as const;

export default function MotionRecipes({ project, selected, time, apply, editKeys }: Props) {
  const [recipeId, setRecipeId] = useState<MotionRecipeId>('soft-rise');
  const picker = useRef<HTMLDetailsElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [category, setCategory] = useState<string>('all');
  const [duration, setDuration] = useState(0.8);
  const [strength, setStrength] = useState(1);
  const [sequence, setSequence] = useState(false);
  const [stagger, setStagger] = useState(0.12);
  const [separate, setSeparate] = useState(false);
  const [reverse, setReverse] = useState(false);
  const [direction, setDirection] = useState<MotionRecipeDirection>('up');
  const [textMode, setTextMode] = useState<'characters' | 'words'>('characters');
  const [hideBefore, setHideBefore] = useState(true);
  const [startAt, setStartAt] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [lastApplied, setLastApplied] = useState<string | null>(null);
  const recipe = MOTION_RECIPES.find((item) => item.id === recipeId)!;
  const targets = project.layers.filter(
    (layer) => selected.includes(layer.id) && layer.kind !== 'audio' && !layer.locked,
  );
  const at = startAt ?? time;
  const available = Math.max(
    0,
    Math.min(project.duration, ...targets.map((layer) => layer.start + layer.duration)) - at,
  );
  const canUse =
    targets.length > 0 &&
    (recipeId !== 'type-on' || targets.some((layer) => layer.kind === 'text'));
  const signature = `${project.id}:${selected.join(',')}`;
  useEffect(() => {
    setNotice('');
    setError('');
    setLastApplied(null);
    setStartAt(null);
  }, [signature]);
  const choose = (id: MotionRecipeId) => {
    const next = MOTION_RECIPES.find((item) => item.id === id)!;
    setRecipeId(id);
    if (picker.current) picker.current.open = false;
    setDuration(Math.max(2 / project.fps, Math.min(next.defaultDuration, available)));
    setNotice('');
    setError('');
  };
  const applyRecipe = () => {
    try {
      const result = applyMotionRecipe(project, selected, {
        recipeId,
        at,
        duration,
        strength,
        stagger: sequence ? stagger : 0,
        grouping: separate ? 'individual' : sequence ? 'groups' : 'together',
        order: reverse ? 'reverse' : 'forward',
        direction,
        textMode,
        hideBefore,
      });
      if (!result.affectedIds.length)
        throw new Error('Select an unlocked visual element for this motion.');
      apply(result.layers);
      setLastApplied(result.affectedIds[0]);
      setNotice(
        `${result.affectedIds.length} element${result.affectedIds.length === 1 ? '' : 's'} animated · ${result.start.toFixed(1)}–${result.end.toFixed(1)}s${result.skippedIds.length ? ` · ${result.skippedIds.length} skipped` : ''}`,
      );
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not apply this motion.');
      setNotice('');
    }
  };
  return (
    <section className="motion-recipes" aria-label="Motion recipes">
      <details className="motion-recipe-picker" ref={picker}>
        <summary aria-label="Choose a motion">
          <span>{recipe.title}</span>
          <span>Change⌄</span>
        </summary>
        <div className="motion-recipe-categories" role="group" aria-label="Motion categories">
          {CATEGORIES.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={category === item.id}
              onClick={() => setCategory(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="motion-recipe-list">
          {MOTION_RECIPES.filter((item) => category === 'all' || item.category === category).map(
            (item) => (
              <button
                type="button"
                key={item.id}
                className={recipeId === item.id ? 'is-selected' : ''}
                aria-label={`Choose motion: ${item.title}`}
                title={item.description}
                aria-pressed={recipeId === item.id}
                onClick={() => choose(item.id)}
              >
                <span className={`recipe-glyph recipe-glyph-${item.category}`} aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span>{item.title}</span>
              </button>
            ),
          )}
        </div>
      </details>
      <details
        className="motion-recipe-preview-disclosure"
        onToggle={(event) => setPreviewOpen(event.currentTarget.open)}
      >
        <summary>
          Preview motion <span aria-hidden="true">▷</span>
        </summary>
        <p className="motion-recipe-description">{recipe.description}</p>
        {previewOpen && (
          <RecipePreview
            recipeId={recipeId}
            duration={duration}
            strength={strength}
            direction={direction}
            stagger={sequence ? stagger : 0}
            textMode={textMode}
            hideBefore={hideBefore}
          />
        )}
      </details>
      <div className="motion-recipe-fields">
        <label>
          <span>Duration</span>
          <div>
            <input
              type="number"
              aria-label="Recipe duration (s)"
              min={2 / project.fps}
              max={120}
              step={0.1}
              value={duration}
              onChange={(event) => {
                const value = event.currentTarget.valueAsNumber;
                if (Number.isFinite(value))
                  setDuration(Math.max(2 / project.fps, Math.min(120, value)));
              }}
            />
            <small>s</small>
          </div>
        </label>
        {recipeId !== 'wipe' && recipeId !== 'type-on' && (
          <label>
            <span>Strength</span>
            <div>
              <input
                type="range"
                aria-label="Recipe strength"
                min={0.25}
                max={2}
                step={0.05}
                value={strength}
                onChange={(event) => setStrength(event.currentTarget.valueAsNumber)}
              />
              <small>{Math.round(strength * 100)}%</small>
            </div>
          </label>
        )}
        {recipeId === 'type-on' && (
          <label>
            <span>Reveal by</span>
            <select
              aria-label="Recipe text mode"
              value={textMode}
              onChange={(event) => setTextMode(event.currentTarget.value as 'characters' | 'words')}
            >
              <option value="characters">Character</option>
              <option value="words">Word</option>
            </select>
          </label>
        )}
      </div>
      <div className="motion-recipe-sequence" role="group" aria-label="Motion sequence">
        <button type="button" aria-pressed={!sequence} onClick={() => setSequence(false)}>
          Together
        </button>
        <button type="button" aria-pressed={sequence} onClick={() => setSequence(true)}>
          One after another
        </button>
      </div>
      <details className="motion-recipe-options">
        <summary>
          Timing & direction <span>{at.toFixed(2)}s</span>
        </summary>
        <label>
          <span>Start</span>
          <select
            aria-label="Recipe start mode"
            value={startAt === null ? 'playhead' : 'custom'}
            onChange={(event) => setStartAt(event.currentTarget.value === 'playhead' ? null : time)}
          >
            <option value="playhead">At playhead</option>
            <option value="custom">At a specific time</option>
          </select>
        </label>
        {startAt !== null && (
          <label>
            <span>Time (s)</span>
            <input
              type="number"
              aria-label="Recipe start time (s)"
              min={0}
              max={project.duration}
              step={1 / project.fps}
              value={startAt}
              onChange={(event) => {
                const value = event.currentTarget.valueAsNumber;
                if (Number.isFinite(value))
                  setStartAt(Math.max(0, Math.min(project.duration, value)));
              }}
            />
          </label>
        )}
        {(recipeId === 'slide' || recipeId === 'wipe' || recipeId === 'carousel') && (
          <label>
            <span>{recipeId === 'wipe' ? 'Reveal from' : 'Direction'}</span>
            <select
              aria-label="Recipe direction"
              value={direction}
              onChange={(event) => setDirection(event.currentTarget.value as MotionRecipeDirection)}
            >
              <option value="up">{recipeId === 'wipe' ? 'Top' : 'Up'}</option>
              <option value="down">{recipeId === 'wipe' ? 'Bottom' : 'Down'}</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
              {recipeId === 'wipe' && <option value="center">Center</option>}
            </select>
          </label>
        )}
        {sequence && (
          <>
            <label>
              <span>Between elements</span>
              <div>
                <input
                  type="number"
                  aria-label="Recipe stagger (s)"
                  min={0}
                  max={10}
                  step={0.05}
                  value={stagger}
                  onChange={(event) => {
                    const value = event.currentTarget.valueAsNumber;
                    if (Number.isFinite(value)) setStagger(Math.max(0, Math.min(10, value)));
                  }}
                />
                <small>s</small>
              </div>
            </label>
            <label className="motion-recipe-check">
              <input
                type="checkbox"
                checked={reverse}
                onChange={(event) => setReverse(event.currentTarget.checked)}
              />
              Reverse order
            </label>
          </>
        )}
        <label className="motion-recipe-check">
          <input
            type="checkbox"
            checked={separate}
            onChange={(event) => setSeparate(event.currentTarget.checked)}
          />
          Animate grouped parts separately
        </label>
        {recipeId !== 'float' && recipeId !== 'page-tour' && (
          <label className="motion-recipe-check">
            <input
              type="checkbox"
              checked={hideBefore}
              onChange={(event) => setHideBefore(event.currentTarget.checked)}
            />
            Hide until entry
          </label>
        )}
        <p>
          Replaces affected keys in this time range and clears preset motion on the animated
          elements. Undo restores the previous motion.
        </p>
      </details>
      <div className="motion-recipe-actions">
        <button
          type="button"
          className="motion-recipe-apply"
          disabled={!canUse}
          onClick={applyRecipe}
        >
          Apply {recipe.title.toLowerCase()} <span aria-hidden="true">↗</span>
        </button>
        {!canUse && (
          <p className="motion-recipe-status">
            {recipeId === 'type-on'
              ? 'Select a text element for this recipe.'
              : 'Select an unlocked visual element.'}
          </p>
        )}
        {error && (
          <p className="motion-recipe-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="motion-recipe-status" role="status">
            {notice}
          </p>
        )}
        <button
          type="button"
          className="motion-recipe-edit"
          disabled={!targets.length}
          onClick={() => editKeys(lastApplied ?? targets[0].id)}
        >
          Edit keyframes in timeline <span aria-hidden="true">◇</span>
        </button>
      </div>
    </section>
  );
}
