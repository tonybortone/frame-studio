# Roadmap

The goal is a polished Mac editor that makes video, vector composition, motion, and reusable layouts feel like one workflow. This roadmap separates the first implementation from larger engineering milestones. It is an intended sequence, not a release-date commitment.

The [Adobe workflow audit](adobe-capability-audit.md) compares the current alpha with Photoshop color, Illustrator vectors, and After Effects animation/masking. It records verified subsets, missing capabilities, reliability findings, and concrete acceptance examples. Professional feature parity is not established.

## 0 — Working alpha foundation

Initial scope: a React/TypeScript editor with an Electron shell; semantic layer colors; canvas text/shapes/drawing; local media import; basic SVG decomposition; timeline move/trim/split; multi-selection and groups; reusable layer collections; starter layouts and aspect ratios; basic motion/color controls; project save/load; and capability-detected real-time video export plus snapshots.

**Exit criteria:** a short composition can be created, edited, saved, reopened, previewed, and exported; automated model checks and the renderer build pass; known import/export limits are documented; a local Mac package can be exercised.

**Current constraints:** embedded media and a 50 MB import limit, a flat layer model, a limited SVG subset, scalar keyframes and baked motion recipes rather than a hierarchical animation system, and real-time capture. This phase does not establish professional editor parity or a signed public download.

## 1 — Reliable everyday editing

- Improve selection, snapping, alignment, keyboard commands, and discoverability.
- Continue checking current-time transforms across rendering, hit-testing, selection outlines and handles, including perspective and animated effects.
- Repair the SVG export/import contract so supported exported artwork can be imported again without losing editable structure.
- Extend the existing numeric clip controls with real audio waveforms and more precise timeline navigation.
- Strengthen undo/redo coverage, validation, error recovery, and project compatibility.
- Introduce managed assets and missing-media relinking; strengthen existing autosave and recovery.
- Establish performance budgets with realistic multi-clip projects and long media.
- Complete accessibility checks, app identity, signing, notarization, and installer validation.

**Exit criteria:** common editing tasks stay responsive; projects recover from interrupted work; saved files reopen reliably; a signed download passes verification on supported Macs.

## 2 — Rich canvas and reusable design

- Expand SVG import with clear support for paths, transforms, strokes, groups, and clipping.
- Add vector point editing, richer text controls, alignment guides, and editable drawing paths.
- Introduce nested groups and a well-defined scene graph.
- Add linked component instances, editable properties, overrides, and shared styles.
- Add user-defined layer colors and an organized personal component library.
- Expand templates: screen left/camera right, presenter overlays, tutorials, and branded titles.

**Exit criteria:** imported vectors can be edited predictably; nested transforms survive save/load; component updates and overrides have clear behavior; templates remain ordinary editable content.

## 3 — Motion authoring

- Shipped in alpha17: editable Position, Size, Rotation and Opacity keyframes, draggable timing diamonds, and temporal Bézier handles. See the [keyframe guide](keyframes.md).
- Alpha18 adds 3D tilt/depth, soft blur, directional/center mask reveal and character/word text reveal tracks: 12 scalar channels in total.
- Alpha18 adds ten recipes that bake editable keys, including grouped spring overshoot, staged entrances and camera-style website tours. Shared perspective origins keep grouped pieces on one plane. Three editable motion templates demonstrate the workflow. See [motion recipes](motion-recipes.md).
- Extend these tools with spatial motion paths, per-character transform animators, editable mask vertices/feathering, track mattes and clip transitions.
- Define hierarchical transforms and scene-camera behavior beyond the current baked pan/zoom/tilt recipes. Temporal motion blur remains separate from Gaussian soft focus.
- Let users save and reuse motion treatments independently of content.
- Explore simple frame-by-frame/pencil animation with onion-skin previews.

**Exit criteria:** timeline scrubbing, playback, and export evaluate the same animation at the same composition time; keyframes are editable and reusable without hidden dependencies.

These are independently designed motion tools inspired by familiar workflows. This does not involve extracting or copying proprietary After Effects implementation code.

## 4 — Audio, color, and rendering depth

- Build deterministic frame rendering and a dedicated encoding pipeline.
- Define explicit codec/container, frame-rate, alpha-channel, and audio-output support.
- Add proxies and hardware-aware decode/render paths for heavier projects.
- Extend the current fade envelopes with metering, mixing, and carefully scoped processing tools.
- Expand color controls to curves, white balance, LUTs, and scopes with defined color management.
- Add render queues, progress, cancellation, and export recovery.

**Exit criteria:** exported output consistently matches preview; timing/audio sync and color behavior are tested; supported formats have clear compatibility requirements; large jobs can be cancelled safely.

## 5 — Assisted layouts and editing

- Create layout constraints for portrait, landscape, square, and alternative output sizes.
- Add guided reframing and reusable layout variants for screen/presenter compositions.
- Explore silence trimming, captions, beat-aware suggestions, and editable rough cuts.
- Let templates adapt text, media, timing, and animation while preserving user control.
- Add batch outputs and export presets for common distribution needs.

**Exit criteria:** suggested edits are understandable, previewable, reversible, and remain editable. Aspect-ratio changes preserve subject placement and readable layouts. Any model/service integration states where media is processed and whether it leaves the device.

## 6 — Sustainable community and distribution

- Publish stable project schemas and extension interfaces once the core is mature.
- Provide a template/component contribution path with asset licensing requirements.
- Add tested update delivery, release channels, and migration coverage.
- Evaluate Intel Mac support and other platforms based on demand and tested performance.

**Exit criteria:** contributors can add capabilities through documented interfaces; releases are reproducible and traceable; updates preserve projects; support promises match tested platforms.
