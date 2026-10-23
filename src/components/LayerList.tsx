import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  ArrowUpFromLine,
  ChevronDown,
  Eye,
  EyeOff,
  Group,
  Layers,
  LockKeyhole,
  Search,
  UnlockKeyhole,
  X,
} from '../icons';
import type { Layer } from '../core/types';
import { reorderVisualLayers } from '../core/layerOrder';
import { kindIcons } from './Timeline';
import './LayerList.css';

interface Props {
  layers: Layer[];
  selected: string[];
  select: (ids: string[]) => void;
  change: (id: string, patch: Partial<Layer>, record?: boolean) => void;
  group: () => void;
  reorder?: (direction: number) => void;
}
interface LayerRun {
  id: string;
  groupId?: string;
  layers: Layer[];
}

/** Only adjacent group members are folded together, so the list always reflects stacking order. */
function layerRuns(layers: Layer[]): LayerRun[] {
  return layers.reduce<LayerRun[]>((runs, layer) => {
    const previous = runs.at(-1);
    if (layer.groupId && previous?.groupId === layer.groupId) previous.layers.push(layer);
    else runs.push({ id: layer.id, groupId: layer.groupId, layers: [layer] });
    return runs;
  }, []);
}

export default function LayerList({ layers, selected, select, change, group, reorder }: Props) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const renameCancelled = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const filter = query.trim().toLocaleLowerCase();
  const groupNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const layer of layers) {
      if (layer.groupId && !names.has(layer.groupId))
        names.set(layer.groupId, `Group ${names.size + 1}`);
    }
    return names;
  }, [layers]);
  const chosen = layers.filter((layer) => selected.includes(layer.id));
  const grouped =
    chosen.length > 1 &&
    !!chosen[0].groupId &&
    chosen.every((layer) => layer.groupId === chosen[0].groupId);
  const canGroup = chosen.length > 1 && chosen.every((layer) => !layer.locked);
  const matchCount = layers.filter((layer) =>
    layer.name.toLocaleLowerCase().includes(filter),
  ).length;

  function toggle(set: Set<string>, key: string) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  }
  function choose(ids: string[], additive: boolean) {
    select(additive ? Array.from(new Set([...selected, ...ids])) : ids);
  }
  function startRename(layer: Layer) {
    if (layer.locked) return;
    renameCancelled.current = false;
    setRenaming({ id: layer.id, value: layer.name });
  }
  function focusLayer(id: string) {
    requestAnimationFrame(() => {
      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('.fs-layer-select');
      Array.from(buttons ?? [])
        .find((button) => button.dataset.layerId === id)
        ?.focus();
    });
  }
  function finishRename(restoreFocus = false) {
    if (!renaming) return;
    const layer = layers.find((item) => item.id === renaming.id);
    const value = renaming.value.trim();
    if (!renameCancelled.current && layer && !layer.locked && value && value !== layer.name)
      change(layer.id, { name: value });
    renameCancelled.current = true;
    setRenaming(null);
    if (restoreFocus) focusLayer(renaming.id);
  }
  function navigate(event: KeyboardEvent<HTMLButtonElement>, layer: Layer) {
    if (event.key === 'F2') {
      event.preventDefault();
      startRename(layer);
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const buttons = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>('.fs-layer-select') ?? [],
    );
    const current = buttons.indexOf(event.currentTarget);
    const index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : Math.max(0, Math.min(buttons.length - 1, current + (event.key === 'ArrowUp' ? -1 : 1)));
    buttons[index]?.focus();
  }
  function renderLayer(layer: Layer, inGroup = false) {
    const Icon = kindIcons[layer.kind];
    const active = selected.includes(layer.id);
    return (
      <li
        key={layer.id}
        className={`fs-library-layer ${active ? 'is-selected' : ''} ${layer.hidden ? 'is-hidden' : ''} ${inGroup ? 'is-group-member' : ''}`}
      >
        {renaming?.id === layer.id ? (
          <div className="fs-layer-rename">
            <Icon size={14} aria-hidden="true" />
            <input
              autoFocus
              aria-label={`Rename ${layer.name}`}
              maxLength={120}
              value={renaming.value}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setRenaming({ id: layer.id, value: event.target.value })}
              onBlur={() => finishRename()}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter') {
                  event.preventDefault();
                  finishRename(true);
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  renameCancelled.current = true;
                  setRenaming(null);
                  focusLayer(layer.id);
                }
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            className="fs-layer-select"
            data-layer-id={layer.id}
            aria-label={layer.name}
            aria-pressed={active}
            title={`${layer.name}${layer.locked ? ' · Locked' : ' · Double-click to rename'}`}
            onClick={(event) =>
              choose([layer.id], event.shiftKey || event.metaKey || event.ctrlKey)
            }
            onDoubleClick={() => startRename(layer)}
            onKeyDown={(event) => navigate(event, layer)}
          >
            <Icon size={14} aria-hidden="true" />
            <span>{layer.name}</span>
          </button>
        )}
        <div className="fs-layer-actions">
          <button
            type="button"
            className={layer.hidden ? 'is-set' : ''}
            aria-label={`${layer.hidden ? 'Show' : 'Hide'} ${layer.name}`}
            aria-pressed={!!layer.hidden}
            title={layer.hidden ? 'Show layer' : 'Hide layer'}
            onClick={() => change(layer.id, { hidden: !layer.hidden })}
          >
            {layer.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
          <button
            type="button"
            className={layer.locked ? 'is-set' : ''}
            aria-label={`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`}
            aria-pressed={!!layer.locked}
            title={layer.locked ? 'Unlock layer' : 'Lock layer'}
            onClick={() => change(layer.id, { locked: !layer.locked })}
          >
            {layer.locked ? <LockKeyhole size={12} /> : <UnlockKeyhole size={12} />}
          </button>
        </div>
      </li>
    );
  }

  return (
    <div className="fs-layer-browser" ref={listRef}>
      <div className="fs-layer-search">
        <Search size={13} aria-hidden="true" />
        <input
          aria-label="Search layers"
          placeholder="Find a layer"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button type="button" aria-label="Clear layer search" onClick={() => setQuery('')}>
            <X size={12} />
          </button>
        )}
      </div>
      {layers.length > 0 ? (
        <>
          <div className="fs-layer-browser-tools">
            <span>
              {filter ? `${matchCount} ${matchCount === 1 ? 'match' : 'matches'}` : 'Front to back'}
            </span>
            <div>
              <button
                type="button"
                aria-label="Group selection"
                title={grouped ? 'Ungroup selection' : 'Group selection'}
                disabled={!canGroup}
                onClick={group}
                aria-pressed={grouped}
              >
                <Group size={14} />
              </button>
              {reorder && (
                <>
                  <button
                    type="button"
                    aria-label="Bring selected layers forward"
                    title="Bring forward"
                    disabled={reorderVisualLayers(layers, selected, 1) === layers}
                    onClick={() => reorder(1)}
                  >
                    <ArrowUpFromLine size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="Send selected layers backward"
                    title="Send backward"
                    disabled={reorderVisualLayers(layers, selected, -1) === layers}
                    onClick={() => reorder(-1)}
                  >
                    <ArrowUpFromLine size={14} className="fs-layer-backward" />
                  </button>
                </>
              )}
            </div>
          </div>
          {filter && !matchCount ? (
            <div className="fs-layer-empty">
              <Search size={22} />
              <strong>No matching layers</strong>
              <p>Try another name.</p>
              <button type="button" onClick={() => setQuery('')}>
                Clear search
              </button>
            </div>
          ) : (
            (['visuals', 'audio'] as const).map((section) => {
              const sectionLayers = [...layers]
                .reverse()
                .filter((layer) =>
                  section === 'audio' ? layer.kind === 'audio' : layer.kind !== 'audio',
                );
              const runs = layerRuns(sectionLayers)
                .map((run) => ({
                  ...run,
                  layers: run.layers.filter((layer) =>
                    layer.name.toLocaleLowerCase().includes(filter),
                  ),
                }))
                .filter((run) => run.layers.length);
              if (filter && !runs.length) return null;
              const open = !!filter || !collapsedSections.has(section);
              const name = section === 'audio' ? 'Audio' : 'Visuals';
              const seenGroups = new Set<string>();
              return (
                <section
                  className="fs-library-track-section"
                  key={section}
                  aria-label={`${name} layers`}
                >
                  <button
                    type="button"
                    className="fs-library-section-label"
                    aria-label={`${open ? 'Collapse' : 'Expand'} ${name.toLowerCase()} layers`}
                    aria-expanded={open}
                    disabled={!!filter}
                    onClick={() => setCollapsedSections(toggle(collapsedSections, section))}
                  >
                    <ChevronDown size={12} className={open ? '' : 'is-collapsed'} />
                    <span>{name}</span>
                    <small>{runs.reduce((count, run) => count + run.layers.length, 0)}</small>
                  </button>
                  {open && (
                    <>
                      <ul className="fs-library-layer-list">
                        {runs.map((run) => {
                          if (!run.groupId) return renderLayer(run.layers[0]);
                          const groupId = run.groupId;
                          const continued = seenGroups.has(groupId);
                          seenGroups.add(groupId);
                          const label = `${groupNames.get(groupId)}${continued ? ' · continued' : ''}`;
                          const expanded = !!filter || !collapsed.has(groupId);
                          const members = layers.filter((layer) => layer.groupId === groupId);
                          const active = members.every((layer) => selected.includes(layer.id));
                          return (
                            <li className="fs-layer-group" key={run.id}>
                              <div
                                className={`fs-layer-group-heading ${active ? 'is-selected' : ''}`}
                              >
                                <button
                                  type="button"
                                  className="fs-layer-group-toggle"
                                  aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
                                  aria-expanded={expanded}
                                  disabled={!!filter}
                                  onClick={() => setCollapsed(toggle(collapsed, groupId))}
                                >
                                  <ChevronDown
                                    size={12}
                                    className={expanded ? '' : 'is-collapsed'}
                                  />
                                </button>
                                <button
                                  type="button"
                                  className="fs-layer-group-select"
                                  aria-label={`Select ${label}`}
                                  aria-pressed={active}
                                  title={
                                    continued
                                      ? 'Grouped elements retain their individual stacking order'
                                      : 'Select all elements in this group'
                                  }
                                  onClick={(event) =>
                                    choose(
                                      members.map((layer) => layer.id),
                                      event.shiftKey || event.metaKey || event.ctrlKey,
                                    )
                                  }
                                >
                                  <Group size={13} />
                                  <span>{label}</span>
                                  <small>{run.layers.length}</small>
                                </button>
                              </div>
                              {expanded && (
                                <ul className="fs-layer-group-members">
                                  {run.layers.map((layer) => renderLayer(layer, true))}
                                </ul>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      {!runs.length && (
                        <p className="fs-library-layer-empty">
                          {section === 'audio'
                            ? 'Music and voice appear here.'
                            : 'Add a visual to your scene.'}
                        </p>
                      )}
                    </>
                  )}
                </section>
              );
            })
          )}
        </>
      ) : (
        <div className="fs-layer-empty">
          <Layers size={26} />
          <strong>Your scene starts here</strong>
          <p>Add text, shapes or media using the toolbar. Every element will appear here.</p>
        </div>
      )}
    </div>
  );
}
