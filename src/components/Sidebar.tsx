import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowUpFromLine, Plus, Component, Group, EyeOff, LockKeyhole } from '../icons';
import { LAYER_COLORS, LAYER_LABELS, type Layer, type Project } from '../core/types';
import { ASSET_FOLDERS, type AssetFolderId } from '../core/libraryAssets';
import { createLayer } from '../core/project';
import { TEMPLATES } from '../core/templates';
import { kindIcons } from './Timeline';
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
  const importedLayers = project.layers.filter((layer) => layer.src);

  function addShape(shape: 'square' | 'circle' | 'pill') {
    add([
      createLayer('shape', {
        name: shape === 'circle' ? 'Circle' : shape === 'pill' ? 'Rounded label' : 'Rectangle',
        fill: shape === 'circle' ? '#a9d5b4' : '#ffab78',
        width: shape === 'pill' ? 420 : 280,
        height: shape === 'pill' ? 110 : 280,
        radius: shape === 'circle' ? 140 : shape === 'pill' ? 55 : 24,
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
            <Icon size={23} strokeWidth={1.5} />
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
            <div className="fs-library-heading">
              <span>Your files</span>
              <button title="Import files" aria-label="Import files" onClick={importFiles}>
                <Plus size={15} />
              </button>
            </div>
            <div className="fs-library-folders">
              {ASSET_FOLDERS.map((item) => (
                <button
                  key={item.id}
                  className="fs-library-folder"
                  onClick={() => setFolder(item.id)}
                  aria-label={item.label}
                >
                  <img src={item.icon} alt="" draggable={false} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
            <button className="fs-library-import" onClick={importFiles}>
              <ArrowUpFromLine size={14} />
              Import files
            </button>
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
              <img src={activeFolder.icon} alt="" />
              <strong>{activeFolder.label}</strong>
            </div>

            {folder === 'fonts' ? (
              <>
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
                          fill: '#26352f',
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
                      <Component size={19} />
                      <span>
                        <strong>{component.name}</strong>
                        <small>{component.layers.length} elements</small>
                      </span>
                      <Plus size={13} />
                    </button>
                  ))}
                </div>
                {project.components.length === 0 && (
                  <p className="fs-library-empty">Your saved components will appear here.</p>
                )}
              </>
            ) : (
              <>
                {folder === 'vectors' && (
                  <div className="fs-library-shapes">
                    {(['square', 'circle', 'pill'] as const).map((shape) => (
                      <button
                        key={shape}
                        onClick={() => addShape(shape)}
                        aria-label={
                          shape === 'square' ? 'Rectangle' : shape === 'circle' ? 'Circle' : 'Pill'
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
                  <div className="fs-library-file-grid fs-library-file-grid-spaced">
                    {folderLayers.map(renderFile)}
                  </div>
                )}
                {folderLayers.length === 0 && !['fonts', 'vectors'].includes(folder!) && (
                  <p className="fs-library-empty">No {activeFolder.label.toLowerCase()} yet.</p>
                )}
              </>
            )}
          </>
        )}

        {panel === 'layers' && (
          <>
            <div className="fs-library-heading">
              <span>Layers</span>
              <button
                title="Group selection"
                aria-label="Group selection"
                onClick={group}
                disabled={selected.length < 2}
              >
                <Group size={15} />
              </button>
            </div>
            <div className="fs-library-layer-list">
              {[...project.layers].reverse().map((layer) => {
                const Icon = kindIcons[layer.kind];
                return (
                  <button
                    key={layer.id}
                    className={`fs-library-layer ${selected.includes(layer.id) ? 'is-selected' : ''}`}
                    style={{ '--file-color': LAYER_COLORS[layer.kind] } as CSSProperties}
                    onClick={(event) =>
                      select(
                        event.shiftKey ? Array.from(new Set([...selected, layer.id])) : [layer.id],
                      )
                    }
                    title={layer.name}
                  >
                    <Icon size={14} />
                    <span>{layer.name}</span>
                    {layer.groupId && <Group size={11} />}
                    {layer.hidden && <EyeOff size={11} />}
                    {layer.locked && <LockKeyhole size={11} />}
                  </button>
                );
              })}
            </div>
            {!project.layers.length && (
              <p className="fs-library-empty">Your layers will appear here.</p>
            )}
          </>
        )}

        {panel === 'templates' && (
          <>
            <div className="fs-library-heading">
              <span>Start with a layout</span>
            </div>
            {TEMPLATES.map((template, index) => (
              <button
                className="fs-library-template"
                key={template.id}
                onClick={() => applyTemplate(template.project())}
              >
                <div className={`fs-library-template-preview fs-library-template-${index}`}>
                  <span />
                  <span />
                </div>
                <strong>{template.name}</strong>
              </button>
            ))}
            <p className="fs-library-empty">Replaces your scene. Undo brings it back.</p>
          </>
        )}
      </div>
    </aside>
  );
}
