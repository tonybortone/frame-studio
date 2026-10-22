import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowUpFromLine, Plus, Component, Group, EyeOff, LockKeyhole } from '../icons';
import { LAYER_COLORS, LAYER_LABELS, type Layer, type Project } from '../core/types';
import { ASSET_FOLDERS, type AssetFolder, type AssetFolderId } from '../core/libraryAssets';
import { createLayer } from '../core/project';
import { TEMPLATES } from '../core/templates';
import { kindIcons } from './Timeline';
import TemplatePreview from './TemplatePreview';
import './Sidebar.css';

export type LibraryTab = 'media' | 'text' | 'elements' | 'templates' | 'components';
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
  libraryRequest?: { tab: LibraryTab; nonce: number } | null;
}

function FolderIcon({ folder }: { folder: AssetFolder }) {
  const Icon = folder.kinds[0] ? kindIcons[folder.kinds[0]] : Component;
  return (
    <span
      className={`fs-library-folder-icon ${folder.section === 'create' ? 'is-tool' : ''}`}
      style={{ '--folder-color': folder.color } as CSSProperties}
    >
      {folder.section === 'media' && (
        <svg className="fs-folder-outline" viewBox="0 0 32 28" aria-hidden="true">
          <path d="M3 6.5c0-1.1.9-2 2-2h7l3 3h12c1.1 0 2 .9 2 2v13c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2z" />
          <path d="M3 10.5h26" />
        </svg>
      )}
      <Icon size={folder.section === 'media' ? 12 : 16} strokeWidth={1.6} />
    </span>
  );
}

function ratio(project: Project): string {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const divisor = gcd(project.width, project.height);
  return `${project.width / divisor}:${project.height / divisor}`;
}

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
  libraryRequest,
}: Props) {
  const [panel, setPanel] = useState<'files' | 'layers' | 'templates'>('files');
  const [folder, setFolder] = useState<AssetFolderId | null>(null);
  const previews = useMemo(
    () => TEMPLATES.map((template) => ({ ...template, preview: template.project() })),
    [],
  );
  useEffect(() => {
    if (!libraryRequest) return;
    setPanel(libraryRequest.tab === 'templates' ? 'templates' : 'files');
    setFolder(
      libraryRequest.tab === 'text'
        ? 'fonts'
        : libraryRequest.tab === 'elements'
          ? 'vectors'
          : libraryRequest.tab === 'components'
            ? 'personalised'
            : null,
    );
  }, [libraryRequest]);
  const activeFolder = ASSET_FOLDERS.find((item) => item.id === folder);
  const folderLayers = activeFolder
    ? project.layers.filter((layer) => activeFolder.kinds.includes(layer.kind))
    : [];
  const importedLayers = project.layers.filter(
    (layer) => layer.src && ['video', 'audio', 'image'].includes(layer.kind),
  );
  const count = (item: AssetFolder) =>
    item.id === 'personalised'
      ? project.components.length
      : project.layers.filter((layer) => item.kinds.includes(layer.kind)).length;

  function addShape(shape: 'square' | 'circle' | 'pill') {
    add([
      createLayer('shape', {
        name: shape === 'circle' ? 'Circle' : shape === 'pill' ? 'Rounded label' : 'Rectangle',
        fill: shape === 'circle' ? '#8d99ae' : '#ef233c',
        width: shape === 'pill' ? 420 : 280,
        height: shape === 'pill' ? 110 : 280,
        radius: shape === 'circle' ? 140 : shape === 'pill' ? 55 : 12,
        x: project.width * 0.35,
        y: project.height * 0.3,
        duration: project.duration,
      }),
    ]);
  }
  function renderFile(layer: Layer) {
    const Icon = kindIcons[layer.kind];
    return (
      <button
        key={layer.id}
        className={`fs-library-file ${selected.includes(layer.id) ? 'is-selected' : ''}`}
        onClick={(event) =>
          select(event.shiftKey ? Array.from(new Set([...selected, layer.id])) : [layer.id])
        }
        style={{ '--file-color': LAYER_COLORS[layer.kind] } as CSSProperties}
        title={layer.name}
      >
        <div className="fs-library-file-preview">
          {layer.kind === 'image' && layer.src ? (
            <img src={layer.src} alt="" />
          ) : layer.kind === 'video' && layer.src ? (
            <video
              src={`${layer.src}#t=0.1`}
              muted
              playsInline
              preload="metadata"
              aria-hidden="true"
            />
          ) : (
            <Icon size={22} strokeWidth={1.5} />
          )}
          {(layer.kind === 'audio' || layer.kind === 'video') && (
            <small>{layer.duration.toFixed(1)}s</small>
          )}
        </div>
        <span>{layer.name}</span>
        <small>{LAYER_LABELS[layer.kind]}</small>
      </button>
    );
  }
  function renderLayer(layer: Layer) {
    const Icon = kindIcons[layer.kind];
    return (
      <button
        key={layer.id}
        className={`fs-library-layer ${selected.includes(layer.id) ? 'is-selected' : ''}`}
        style={{ '--file-color': LAYER_COLORS[layer.kind] } as CSSProperties}
        title={layer.name}
        onClick={(event) =>
          select(event.shiftKey ? Array.from(new Set([...selected, layer.id])) : [layer.id])
        }
      >
        <Icon size={14} />
        <span>{layer.name}</span>
        {layer.groupId && <Group size={11} />}
        {layer.hidden && <EyeOff size={11} />}
        {layer.locked && <LockKeyhole size={11} />}
      </button>
    );
  }

  return (
    <aside className="sidebar fs-library" aria-label="Library">
      <div className="fs-library-tabs" role="tablist" aria-label="Sidebar">
        {(['files', 'layers', 'templates'] as const).map((item) => (
          <button
            key={item}
            role="tab"
            aria-selected={panel === item}
            className={panel === item ? 'is-active' : ''}
            onClick={() => {
              setPanel(item);
              if (item === 'files') setFolder(null);
            }}
          >
            {item === 'files' ? 'Files' : item === 'layers' ? 'Layers' : 'Templates'}
          </button>
        ))}
      </div>
      <div className="fs-library-scroll">
        {panel === 'files' && !folder && (
          <>
            {(['media', 'create'] as const).map((section) => (
              <section
                className="fs-library-category"
                key={section}
                aria-label={section === 'media' ? 'Media files' : 'Create'}
              >
                <div className="fs-library-heading">
                  <span>{section === 'media' ? 'Media' : 'Create'}</span>
                  {section === 'media' && (
                    <button title="Import files" aria-label="Import files" onClick={importFiles}>
                      <Plus size={14} />
                    </button>
                  )}
                </div>
                <div className="fs-library-folders">
                  {ASSET_FOLDERS.filter((item) => item.section === section).map((item) => (
                    <button
                      key={item.id}
                      className="fs-library-folder"
                      onClick={() => setFolder(item.id)}
                      aria-label={item.label}
                    >
                      <FolderIcon folder={item} />
                      <span className="fs-library-folder-copy">
                        <strong>{item.label}</strong>
                        <small>{item.description}</small>
                      </span>
                      <span className="fs-library-count">{count(item)}</span>
                    </button>
                  ))}
                </div>
                {section === 'media' && (
                  <button className="fs-library-import" onClick={importFiles}>
                    <ArrowUpFromLine size={14} />
                    Import files
                  </button>
                )}
              </section>
            ))}
            {importedLayers.length > 0 && (
              <>
                <div className="fs-library-heading fs-library-heading-spaced">
                  <span>In this project</span>
                  <small>{importedLayers.length}</small>
                </div>
                <div className="fs-library-file-grid">{importedLayers.map(renderFile)}</div>
              </>
            )}
          </>
        )}

        {panel === 'files' && activeFolder && (
          <>
            <div className="fs-library-folder-heading">
              <button
                className="fs-library-back"
                aria-label="Back to files"
                title="Back to files"
                onClick={() => setFolder(null)}
              >
                ‹
              </button>
              <FolderIcon folder={activeFolder} />
              <strong>{activeFolder.label}</strong>
              <span className="fs-library-count">{count(activeFolder)}</span>
            </div>
            {folder === 'fonts' ? (
              <>
                <p className="fs-library-hint">Add text, then edit it on the board.</p>
                {[
                  { label: 'Add a heading', text: 'Your heading', size: 100, weight: 700 },
                  { label: 'Add a subheading', text: 'Your subheading', size: 56, weight: 500 },
                  { label: 'Add body text', text: 'Your text', size: 32, weight: 400 },
                ].map((item, index) => (
                  <button
                    className={`fs-library-text fs-library-text-${index}`}
                    key={item.label}
                    onClick={() =>
                      add([
                        createLayer('text', {
                          name: item.label.replace('Add a ', '').replace('Add ', ''),
                          text: item.text,
                          fontSize: item.size,
                          fontWeight: item.weight,
                          width: Math.max(120, Math.min(1100, project.width - 160)),
                          height: item.size * 2,
                          x: 80,
                          y: 160,
                          duration: project.duration,
                          fill: ['#2b2d42', '#d90429', '#ef233c'].includes(
                            project.background.toLowerCase(),
                          )
                            ? '#edf2f4'
                            : '#2b2d42',
                        }),
                      ])
                    }
                  >
                    <span>{item.label}</span>
                    <Plus size={13} />
                  </button>
                ))}
              </>
            ) : folder === 'personalised' ? (
              <>
                <button
                  className="fs-library-import"
                  disabled={!selected.length}
                  onClick={saveComponent}
                >
                  <Plus size={14} />
                  Save selection
                </button>
                <div className="fs-library-components">
                  {project.components.map((component) => (
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
                {project.components.length === 0 && (
                  <p className="fs-library-empty">
                    Select elements on the board and save them here to reuse.
                  </p>
                )}
              </>
            ) : (
              <>
                {folder === 'vectors' && (
                  <>
                    <p className="fs-library-hint">Add a shape or import an editable SVG.</p>
                    <div className="fs-library-shapes">
                      {(['square', 'circle', 'pill'] as const).map((shape) => (
                        <button
                          key={shape}
                          onClick={() => addShape(shape)}
                          aria-label={
                            shape === 'square'
                              ? 'Rectangle'
                              : shape === 'circle'
                                ? 'Circle'
                                : 'Pill'
                          }
                        >
                          <span className={`fs-library-shape ${shape}`} />
                          <small>
                            {shape === 'square'
                              ? 'Rectangle'
                              : shape === 'circle'
                                ? 'Circle'
                                : 'Pill'}
                          </small>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <button className="fs-library-import" onClick={importFiles}>
                  <ArrowUpFromLine size={14} />
                  {folder === 'vectors'
                    ? 'Import SVG'
                    : `Import ${activeFolder.label.toLowerCase()}`}
                </button>
              </>
            )}
            {folder !== 'personalised' && (
              <>
                {folderLayers.length > 0 && (
                  <>
                    <div className="fs-library-heading fs-library-heading-spaced">
                      <span>On this board</span>
                    </div>
                    <div className="fs-library-file-grid">{folderLayers.map(renderFile)}</div>
                  </>
                )}
                {folderLayers.length === 0 && activeFolder.section === 'media' && (
                  <p className="fs-library-empty">
                    {folder === 'videos'
                      ? 'Import video clips or screen recordings to start editing.'
                      : folder === 'audio'
                        ? 'Add a voice recording, music, or a sound effect.'
                        : 'Import photos and graphics for your composition.'}
                  </p>
                )}
              </>
            )}
          </>
        )}

        {panel === 'layers' && (
          <>
            <div className="fs-library-heading">
              <span>Board layers</span>
              <button
                title="Group selection"
                aria-label="Group selection"
                onClick={group}
                disabled={selected.length < 2}
              >
                <Group size={15} />
              </button>
            </div>
            {(['visuals', 'audio'] as const).map((section) => {
              const layers = [...project.layers]
                .reverse()
                .filter((layer) =>
                  section === 'audio' ? layer.kind === 'audio' : layer.kind !== 'audio',
                );
              return (
                <section className="fs-library-track-section" key={section}>
                  <div className="fs-library-section-label">
                    <span>{section === 'audio' ? 'Audio' : 'Visuals'}</span>
                    <span>{layers.length}</span>
                  </div>
                  <div className="fs-library-layer-list">{layers.map(renderLayer)}</div>
                  {!layers.length && (
                    <p className="fs-library-layer-empty">
                      {section === 'audio' ? 'No audio clips' : 'No visual layers'}
                    </p>
                  )}
                </section>
              );
            })}
          </>
        )}

        {panel === 'templates' && (
          <>
            <div className="fs-library-heading">
              <span>Editable layouts</span>
              <small>{previews.length}</small>
            </div>
            <div className="fs-library-templates">
              {previews.map((template) => (
                <article className="fs-library-template" key={template.id}>
                  <TemplatePreview project={template.preview} />
                  <div className="fs-template-info">
                    <strong>{template.name}</strong>
                    <p>{template.description}</p>
                    <div className="fs-template-meta">
                      <span>{ratio(template.preview)}</span>
                      <span>{template.preview.duration}s</span>
                    </div>
                    <button
                      aria-label={`Use template: ${template.name}`}
                      onClick={() => applyTemplate(template.project())}
                    >
                      Use template <Plus size={12} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <p className="fs-library-hint fs-library-template-hint">
              Replaces your scene. Undo restores it.
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
