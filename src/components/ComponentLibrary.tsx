import { useMemo, useState } from 'react';
import { Component, Plus } from '../icons';
import {
  COMPONENT_PREVIEWS,
  instantiateComponent,
  type ComponentCategory,
  type ComponentPreset,
} from '../core/componentPresets';
import type { Layer, Project } from '../core/types';
import TemplatePreview from './TemplatePreview';
import './ComponentLibrary.css';

interface Props {
  project: Project;
  time: number;
  selectedCount: number;
  add: (layers: Layer[]) => void;
  insertComponent: (id: string) => void;
  saveComponent: () => void;
}
const CATEGORIES: Array<'All' | ComponentCategory> = [
  'All',
  'Mockups',
  'Titles',
  'Callouts',
  'Social',
];

export default function ComponentLibrary({
  project,
  time,
  selectedCount,
  add,
  insertComponent,
  saveComponent,
}: Props) {
  const [source, setSource] = useState<'ready' | 'yours'>('ready');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All');
  const [error, setError] = useState<string | null>(null);
  const needle = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      COMPONENT_PREVIEWS.filter(
        ({ preset }) =>
          (category === 'All' || preset.category === category) &&
          `${preset.name} ${preset.description} ${preset.category}`.toLowerCase().includes(needle),
      ),
    [category, needle],
  );
  const saved = project.components.filter((component) =>
    component.name.toLowerCase().includes(needle),
  );
  const insert = (preset: ComponentPreset) => {
    try {
      const layers = instantiateComponent(preset, project, time);
      setError(null);
      add(layers);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'This component could not be added.');
    }
  };

  return (
    <div className="fs-component-library">
      <div className="fs-component-source" role="group" aria-label="Component source">
        <button
          aria-pressed={source === 'ready'}
          onClick={() => {
            setSource('ready');
            setError(null);
          }}
        >
          Ready-made
        </button>
        <button
          aria-label="Yours"
          aria-pressed={source === 'yours'}
          onClick={() => {
            setSource('yours');
            setError(null);
          }}
        >
          Yours <span>{project.components.length}</span>
        </button>
      </div>
      <input
        className="fs-component-search"
        type="search"
        aria-label="Search components"
        placeholder="Search components…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {source === 'ready' ? (
        <>
          <div className="fs-component-categories" role="group" aria-label="Component categories">
            {CATEGORIES.map((item) => (
              <button key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>
                {item}
              </button>
            ))}
          </div>
          <p className="fs-component-hint">Add at the playhead. Edit every piece.</p>
          {error && (
            <p className="fs-component-error" role="alert">
              {error}
            </p>
          )}
          <div className="fs-component-presets">
            {matches.map(({ preset, project: preview }) => (
              <button
                key={preset.id}
                className="fs-component-preset"
                aria-label={`Add component: ${preset.name}`}
                title={preset.description}
                onClick={() => insert(preset)}
              >
                <TemplatePreview project={preview} interactive={false} />
                <span className="fs-component-preset-caption">
                  <span>
                    <strong>{preset.name}</strong>
                    <small>{preset.layers.length} editable pieces</small>
                  </span>
                  <Plus size={14} />
                </span>
              </button>
            ))}
          </div>
          {matches.length === 0 && (
            <p className="fs-library-empty">
              No components found. Try a different name or category.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="fs-component-hint">Your saved designs, ready to use again.</p>
          <button className="fs-library-import" disabled={!selectedCount} onClick={saveComponent}>
            <Plus size={14} />
            Save selection
          </button>
          <div className="fs-library-components">
            {saved.map((component) => (
              <button
                className="fs-library-component"
                key={component.id}
                onClick={() => insertComponent(component.id)}
              >
                <Component size={18} />
                <span>
                  <strong>{component.name}</strong>
                  <small>{component.layers.length} elements</small>
                </span>
                <Plus size={13} />
              </button>
            ))}
          </div>
          {saved.length === 0 && (
            <p className="fs-library-empty">
              {project.components.length
                ? 'No saved components match your search.'
                : 'Select elements on the board and save them here to reuse.'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
