# Architecture

Frame Studio is a local-first editor with a shared TypeScript project model, a canvas compositor, a React interface, and a narrow Electron shell. The initial architecture favors understandable modules over a plugin framework before there are stable extension contracts.

## Repository layout

```text
frame-studio/
├── src/
│   ├── core/                 Project types, validation, editing operations, templates
│   │   └── types.ts          Serialized model and semantic layer metadata
│   ├── engine/               Media import/cache, composition rendering, export
│   ├── components/           Canvas and timeline interface components
│   ├── hooks/                Editor state and commands
│   └── …                     Editor application, entry point, and styling
├── electron/                Desktop process and restricted renderer bridge
├── docs/                    Design, development, format, and roadmap documentation
├── .github/workflows/       Build and test checks
├── package.json             Commands and desktop packaging configuration
└── vite.config.ts           Renderer build configuration
```

The source files are the authority for behavior. This guide describes boundaries rather than promising a stable public API during the alpha.

## Data flow

```text
User action → project operation → updated Project
                                      ├── React panels and timeline
                                      ├── canvas composition preview
                                      └── project serialization / export
```

The `Project` is serializable editor content. Selection, hover, open panels, playback position, transient drag state, depth-view camera settings, and decode caches belong to the editor/runtime rather than the saved model.

Time values are seconds. A layer occupies a span beginning at `start` for `duration`; its media source can begin at a separate `mediaOffset`. Keep these concepts separate when trimming or splitting: changing where a clip appears in the composition must not accidentally change which part of its source plays.

The initial model is a flat ordered layer collection. `groupId` associates layers for editing; it is not a nested scene graph or an independent group transform. Saved components contain layer copies. They do not have live instance propagation, override resolution, or dependency graphs.

The CSS 3D layer-inspection view projects the active visual layers into separated planes. Its orbit, pan, zoom, and spacing are temporary view state, not a persistent Z coordinate or a new 3D scene model. Audio stays in the timeline. At most 64 planes are drawn at once, with a bounded preview texture budget; selecting another layer changes the inspected window. These preview limits do not change export resolution. Moving a layer forward or backward updates the shared ordered layer collection, preserving audio slots; the existing Canvas 2D renderer and exports then use that order. This operation participates in the editor's undo history.

## Module boundaries

| Responsibility               | Owns                                                           | Should avoid                                                    |
| ---------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------- |
| Project model and operations | Schema, IDs, time/geometry calculations, validation            | DOM, React state, Electron APIs                                 |
| Import                       | Supported file parsing and conversion into layers              | Executing SVG scripts or loading arbitrary remote resources     |
| Renderer                     | Layer ordering, composition at a given time, visual transforms | Mutating the project while drawing                              |
| Editor UI                    | Selection, gestures, commands, panels, playback controls       | Reimplementing model math in every control                      |
| Export                       | Capturing output, supported format detection, progress/errors  | Claiming unsupported codecs are available                       |
| Desktop shell                | App lifecycle, file dialogs, narrowly scoped IPC               | Exposing Node or unrestricted filesystem access to the renderer |

Video and audio elements require asynchronous decoding and playback synchronization. Canvas capture uses the browser's recording pipeline, so its output can depend on runtime capability and load. A deterministic offline renderer is a later architecture milestone.

## Extension paths

**A new layer kind:** extend `LayerKind` and its typed data; add a semantic label/color; implement render, import, inspector, serialization validation, and export behavior together. Verify it at timeline boundaries and in saved projects.

**A new animation preset:** extend the animation type and time-based evaluation, then expose it in the UI. Keep animation based on composition time so scrubbing and playback agree. A future keyframe system should replace preset-specific branching with typed property tracks and easing evaluation.

**A new template:** construct ordinary project layers and reusable compositions. Template content should remain editable after insertion and should not depend on proprietary media.

**A new export backend:** put it behind an explicit capability contract: supported codecs/containers, resolution, audio, frame timing, progress, cancellation, and error reporting. Keep backend choice separate from the project model.

**Larger media projects:** replace embedded data URLs with a managed asset store and references. Add migration, missing-file relinking, proxy generation, cache limits, and recovery before changing the project storage contract.

**Advanced vector editing:** introduce a richer scene graph only when transforms, paths, nested groups, and instances have defined behavior. Preserve versioned migration from flat layers.
