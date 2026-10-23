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

Alpha 6's ready-made components use that same model. `core/componentPresets.ts` authors 12 original collections of text and shapes, and creates grouped instances with fresh IDs. Insertion fits the design to the current canvas and gives it a clip span at the playhead; it does not replace the project or change its schema. `ComponentLibrary.tsx` separates Ready-made from Yours, filters the catalog by category and search, and renders thumbnails through `TemplatePreview` using ordinary project data.

`core/selection.ts` calculates rotation-aware bounds and applies proportional movement/resizing to selected visual layers. Changing group W or H scales both dimensions, offsets, font sizes, and corner radii; stroke widths scale unless they are already in an SVG viewBox coordinate system. No parent transform is serialized. If any selected visual layer is locked, the group transform is blocked so the arrangement cannot partially move. Group Content fields update each selected text layer separately; locked fields remain disabled.

`core/presets.ts` owns the color and motion recipes and their selection-state detection. Color looks write the existing brightness, contrast, and saturation values, blending from neutral rather than accumulating filters. The inspector derives the active look and strength from those values, or shows Custom/Mixed. A temporary local hint remembers a chosen look at 0% so the slider can move upward again; it is not project data. Motion recipes write the shared animation fields and reset custom loop/exit settings and skip audio and locked artwork. Rise and Slide use the renderer's shared translation distances; Pop is disabled for a multiple-visual-layer selection because each layer currently scales around its own center.

The CSS 3D layer-inspection view projects the active visual layers into separated planes. Its orbit, pan, zoom, and spacing are temporary view state, not a persistent Z coordinate or a new 3D scene model. Audio stays in the timeline. At most 64 planes are drawn at once, with a bounded preview texture budget; selecting another layer changes the inspected window. These preview limits do not change export resolution. Moving a layer forward or backward updates the shared ordered layer collection, preserving audio slots; the existing Canvas 2D renderer and exports then use that order. This operation participates in the editor's undo history.

## Per-element perspective

`core/element3d.ts` evaluates clip-relative 3D motion and projects local points into composition coordinates. Canvas selection and depth-view hit targets use the same projected quadrilateral as the renderer. Selection handles for perspective artwork are hidden; size remains editable in Design. Its optional serialized `transform3d` belongs to one visual layer and is separate from the inspection camera and stacking order.

`engine/projectedLayer.ts` paints existing masks, flips, filters, text, vectors and media to a local texture, then projects a subdivided triangle mesh. Standard [Canvas 2D transforms are affine](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/transform); triangulation supplies perspective without depending on experimental browser APIs. Layer opacity is composited once after the warp. Neutral or disabled poses retain the existing fast path. Two destination caches each hold two surfaces, capped at a 2,048-pixel longest side and 4 megapixels per surface. This bounds memory but can soften large 3D artwork; output composition dimensions are unchanged.

`renderFrame` is still the single path for canvas preview, depth-plane textures, PNG, and video. SVG export refuses active enabled 3D layers with an explicit alternative. These are textured flat planes; model import, lighting, global depth sorting, group pivots and animated scene cameras are not implemented.

## Module boundaries

Alpha 7 keeps visual-tool geometry and pixel math in `core/visualEffects.ts`. Mask geometry is shared between Canvas clipping and SVG clip paths. Flips are signed scales about the existing layer-center pivot, so they preserve layout and animation timing. A group is still a set of flat layers; the interface only offers masks and flips for one visual layer at a time.

`engine/imageEffects.ts` handles decoded-image sampling and bounded processed-raster caching. Background removal keys the original pixels by color, then color replacement mixes matching colors while preserving alpha. Brightness, contrast, and saturation remain the later rendering adjustments. The source data URL is never overwritten. Cache entries are runtime data, not saved project content; settings survive through the ordinary validated layer schema.

Image cleanup is shared by Canvas previews, depth-view planes, PNG, and real-time video capture. SVG export awaits media decoding and embeds the same processed PNG for affected images; vector masks and flips stay SVG geometry. Processing is limited to a 4,096-pixel longest side and 8 megapixels to bound work on large photos. This limit affects cleaned images consistently across outputs, not the original source or composition dimensions.

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

**A new motion recipe:** add a combination of supported animation fields in `core/presets.ts`. A genuinely new animation behavior also needs an animation type, shared time-based evaluation, validation, and UI support. Keep motion based on composition time so scrubbing and playback agree. The keyframe system in `core/keyframes.ts` evaluates typed scalar tracks before preset envelopes. Keep interpolation pure, clip-relative and identical across render and selection paths.

**A new color look:** author brightness, contrast, and saturation values in `core/presets.ts`. If a look needs a different visual operation, implement it consistently in rendering, snapshots, exports, and validation before exposing the control. Current looks are display-space adjustments, not LUTs or a color-managed grading pipeline.

**A new ready-made component:** add ordinary text/shape geometry and a category to `core/componentPresets.ts`. Keep each visible piece editable, preserve meaningful names, and check insertion on portrait, square, and minimum-sized canvases. A component is an overlay added to the current scene; a project template is a starting composition.

**A new template:** construct ordinary project layers and reusable compositions. Template content should remain editable after insertion and should not depend on proprietary media.

**A new export backend:** put it behind an explicit capability contract: supported codecs/containers, resolution, audio, frame timing, progress, cancellation, and error reporting. Keep backend choice separate from the project model.

**Larger media projects:** replace embedded data URLs with a managed asset store and references. Add migration, missing-file relinking, proxy generation, cache limits, and recovery before changing the project storage contract.

**Advanced vector editing:** introduce a richer scene graph only when transforms, paths, nested groups, and instances have defined behavior. Preserve versioned migration from flat layers.

## Property keyframes

`core/keyframes.ts` owns immutable track editing, cubic Bézier interpolation and evaluated geometry. Rendering keeps authored local artwork separate from its evaluated pose so size animation scales text and masks. Canvas/Inspector edits route through `App.change` to auto-key already animated properties. Whole-composition transforms update both static geometry and key values. `TimelineKeyframeEditor` groups six scalar channels into four rows, while `KeyframeCurveEditor` edits the outgoing temporal curve. Gesture checkpoints preserve one-step undo. A clip-local evaluation offset retains exact curves through trims and splits without baking samples or changing existing project meaning.
