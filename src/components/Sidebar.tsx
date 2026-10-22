import { useState } from 'react';
import {
  ArrowUpFromLine,
  Search,
  Plus,
  Type,
  Layers3,
  LayoutTemplate,
  Component,
  FolderOpen,
  ImagePlus,
  ChevronDown,
  LockKeyhole,
  Group,
  EyeOff,
} from '../icons';
import type { CSSProperties } from 'react';
import { LAYER_COLORS, LAYER_LABELS, type Layer, type Project } from '../core/types';
import { createLayer } from '../core/project';
import { TEMPLATES } from '../core/templates';
import { kindIcons } from './Timeline';
type LibraryTab = 'media' | 'text' | 'elements' | 'templates' | 'components';
interface Props {
  project: Project;
  selected: string[];
  select: (ids: string[]) => void;
  add: (layers: Layer[]) => void;
  importFiles: () => void;
  applyTemplate: (project: Project) => void;
  insertComponent: (id: string) => void;
  saveComponent: () => void;
  group: () => void;
}
const tabs: { id: LibraryTab; label: string; icon: typeof FolderOpen }[] = [
  { id: 'media', label: 'Media', icon: FolderOpen },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'elements', label: 'Elements', icon: Layers3 },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate },
  { id: 'components', label: 'Saved', icon: Component },
];
export default function Sidebar({
  project,
  selected,
  select,
  add,
  importFiles,
  applyTemplate,
  insertComponent,
  saveComponent,
  group,
}: Props) {
  const [tab, setTab] = useState<LibraryTab>('elements');
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState<'library' | 'layers'>('library');
  const addShape = (shape: 'square' | 'circle' | 'pill') =>
    add([
      createLayer('shape', {
        name: shape === 'circle' ? 'Circle' : shape === 'pill' ? 'Rounded label' : 'Rectangle',
        fill: shape === 'circle' ? '#8fb7a8' : '#e98d68',
        width: shape === 'pill' ? 420 : 280,
        height: shape === 'pill' ? 110 : 280,
        radius: shape === 'circle' ? 140 : shape === 'pill' ? 55 : 24,
        x: project.width * 0.35,
        y: project.height * 0.3,
        duration: project.duration,
      }),
    ]);
  return (
    <aside className="sidebar">
      <div className="sidebar-switch">
        <button className={panel === 'library' ? 'active' : ''} onClick={() => setPanel('library')}>
          Library
        </button>
        <button className={panel === 'layers' ? 'active' : ''} onClick={() => setPanel('layers')}>
          Layers <span>{project.layers.length}</span>
        </button>
      </div>
      {panel === 'library' ? (
        <>
          <div className="library-tabs">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={tab === id ? 'active' : ''}
                aria-label={label}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="sidebar-body">
            <div className="search-field">
              <Search size={14} />
              <input
                aria-label="Search library"
                placeholder={`Search ${tab === 'components' ? 'components' : tab}`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd>⌕</kbd>
            </div>
            {tab === 'elements' && (
              <>
                <div className="section-label">
                  THE BUILDING BLOCKS <span>06</span>
                </div>
                <div className="element-grid">
                  {[
                    ['Rectangle', 'square'],
                    ['Circle', 'circle'],
                    ['Pill', 'pill'],
                  ]
                    .filter(([name]) => name.toLowerCase().includes(query.toLowerCase()))
                    .map(([name, shape]) => (
                      <button
                        className="element-card"
                        key={name}
                        onClick={() => addShape(shape as 'square' | 'circle' | 'pill')}
                      >
                        <div className={`shape-preview ${shape}`} />
                        <span>{name}</span>
                      </button>
                    ))}
                  {'heading'.includes(query.toLowerCase()) && (
                    <button
                      className="element-card"
                      onClick={() => {
                        setTab('text');
                        add([
                          createLayer('text', {
                            name: 'Heading',
                            text: 'Make it yours.',
                            fontSize: 100,
                            fontWeight: 700,
                            width: 1100,
                            height: 150,
                            x: 200,
                            y: 200,
                            duration: project.duration,
                            fill: '#242724',
                          }),
                        ]);
                      }}
                    >
                      <div className="type-preview">Aa</div>
                      <span>Heading</span>
                    </button>
                  )}
                  {'label'.includes(query.toLowerCase()) && (
                    <button
                      className="element-card"
                      onClick={() =>
                        add([
                          createLayer('text', {
                            name: 'Label',
                            text: 'SOMETHING GOOD IS COMING',
                            fontSize: 24,
                            fontWeight: 600,
                            width: 650,
                            height: 50,
                            x: 200,
                            y: 160,
                            duration: project.duration,
                            fill: '#66746b',
                          }),
                        ])
                      }
                    >
                      <div className="label-preview">LABEL</div>
                      <span>Label</span>
                    </button>
                  )}
                  {'svg'.includes(query.toLowerCase()) && (
                    <button className="element-card" onClick={importFiles}>
                      <ImagePlus size={34} strokeWidth={1} />
                      <span>Import SVG</span>
                    </button>
                  )}
                </div>
                <div className="library-note">
                  <div className="note-icon">
                    <Component size={18} />
                  </div>
                  <strong>Good ideas are reusable.</strong>
                  <p>Group your elements and save them as a component.</p>
                  <button onClick={() => setTab('components')}>
                    Explore your components <span>↗</span>
                  </button>
                </div>
              </>
            )}
            {tab === 'text' && (
              <>
                <div className="section-label">START WITH A FEW WORDS</div>
                {[
                  { label: 'Add a heading', size: 100, weight: 700 },
                  { label: 'Add a subheading', size: 56, weight: 500 },
                  { label: 'Add body text', size: 32, weight: 400 },
                ]
                  .filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
                  .map((item) => (
                    <button
                      className="text-preset"
                      key={item.label}
                      style={{ fontSize: item.size / 4 + 8, fontWeight: item.weight }}
                      onClick={() =>
                        add([
                          createLayer('text', {
                            name: item.label.replace('Add a ', ''),
                            text: item.label.replace('Add a ', 'Your '),
                            fontSize: item.size,
                            fontWeight: item.weight,
                            width: 1100,
                            height: item.size * 2,
                            x: 180,
                            y: 200,
                            duration: project.duration,
                            fill: '#26352f',
                          }),
                        ])
                      }
                    >
                      {item.label}
                      <Plus size={14} />
                    </button>
                  ))}
                <p className="helper-copy">
                  Select your text on the canvas to change its words, color, and size.
                </p>
              </>
            )}
            {tab === 'media' && (
              <>
                <button className="import-zone" onClick={importFiles}>
                  <ArrowUpFromLine size={26} strokeWidth={1.3} />
                  <strong>Bring your story in</strong>
                  <span>Video, audio, images & SVG</span>
                  <small>Choose files · up to 50 MB each</small>
                </button>
                <div className="section-label">IN THIS PROJECT</div>
                <div className="media-grid">
                  {project.layers
                    .filter(
                      (l) =>
                        ['image', 'video', 'audio'].includes(l.kind) &&
                        l.name.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((l) => {
                      const Icon = kindIcons[l.kind];
                      return (
                        <button className="media-item" key={l.id} onClick={() => select([l.id])}>
                          {l.kind === 'image' && l.src ? (
                            <img src={l.src} alt="" />
                          ) : (
                            <div style={{ color: LAYER_COLORS[l.kind] }}>
                              <Icon size={28} />
                            </div>
                          )}
                          <span>{l.name}</span>
                          <small>
                            {LAYER_LABELS[l.kind]} · {l.duration.toFixed(1)}s
                          </small>
                        </button>
                      );
                    })}
                </div>
                {!project.layers.some((l) => l.src) && (
                  <p className="helper-copy">
                    Your files stay on your device. Start with a clip, or build a scene from
                    scratch.
                  </p>
                )}
              </>
            )}
            {tab === 'templates' && (
              <>
                <div className="section-label">A LITTLE HEAD START</div>
                {TEMPLATES.filter((t) => t.name.toLowerCase().includes(query.toLowerCase())).map(
                  (t, i) => (
                    <button
                      className="template-card"
                      key={t.id}
                      onClick={() => applyTemplate(t.project())}
                    >
                      <div className={`template-preview template-${i}`}>
                        <div />
                        <div />
                        <span>
                          {i === 0
                            ? 'A blank canvas'
                            : i === 1
                              ? 'Your next story.'
                              : 'Screen + you'}
                        </span>
                      </div>
                      <strong>{t.name}</strong>
                      <p>{t.description}</p>
                    </button>
                  ),
                )}
                <p className="helper-copy">
                  Applying a template replaces the current scene. Undo brings it back.
                </p>
              </>
            )}
            {tab === 'components' && (
              <>
                <div className="section-label">YOUR PERSONAL TOOLKIT</div>
                <button
                  className="secondary wide"
                  disabled={!selected.length}
                  onClick={saveComponent}
                >
                  <Plus size={14} />
                  Save selection
                </button>
                {project.components
                  .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
                  .map((c) => (
                    <button
                      className="component-card"
                      key={c.id}
                      onClick={() => insertComponent(c.id)}
                    >
                      <Component size={24} />
                      <div>
                        <strong>{c.name}</strong>
                        <span>{c.layers.length} editable elements</span>
                      </div>
                      <Plus size={14} />
                    </button>
                  ))}
                {project.components.length === 0 && (
                  <div className="empty-library">
                    <Component size={32} strokeWidth={1} />
                    <h3>
                      Make it once.
                      <br />
                      Use it everywhere.
                    </h3>
                    <p>
                      Select a title, a shape, or a whole group. Save it here for your next scene.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        <div className="sidebar-body layer-list">
          <div className="section-label">
            SCENE LAYERS{' '}
            <button title="Group selection" onClick={group} disabled={selected.length < 2}>
              <Group size={14} />
            </button>
          </div>
          {[...project.layers].reverse().map((l) => {
            const Icon = kindIcons[l.kind];
            return (
              <button
                className={`layer-row ${selected.includes(l.id) ? 'active' : ''}`}
                key={l.id}
                onClick={(e) =>
                  select(e.shiftKey ? Array.from(new Set([...selected, l.id])) : [l.id])
                }
                style={{ '--layer-color': LAYER_COLORS[l.kind] } as CSSProperties}
              >
                <Icon size={15} />
                <span>{l.name}</span>
                {l.groupId && <Group size={12} />} {l.hidden && <EyeOff size={12} />}{' '}
                {l.locked && <LockKeyhole size={12} />}
              </button>
            );
          })}
          <p className="helper-copy">
            Shift + click to select multiple layers. Group them to move together.
          </p>
        </div>
      )}
      <div className="sidebar-footer">
        <div className="project-avatar">F</div>
        <div>
          <strong>Your workspace</strong>
          <span>Local · no uploads</span>
        </div>
        <ChevronDown size={13} />
      </div>
    </aside>
  );
}
