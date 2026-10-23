# Project format

The alpha serializes a `Project` as JSON. Its current schema version is **1**. Type definitions in `src/core/types.ts` are the source of truth; this document explains their meaning.

## Project

| Field             | Meaning                                       |
| ----------------- | --------------------------------------------- |
| `version`         | Schema version, currently `1`                 |
| `id`, `name`      | Project identity and display name             |
| `width`, `height` | Composition dimensions in pixels              |
| `fps`             | Intended output frame rate                    |
| `duration`        | Composition duration in seconds               |
| `background`      | Composition background color                  |
| `layers`          | Ordered collection of timeline/canvas objects |
| `components`      | Saved reusable layer collections              |

## Layers

Every layer has an ID, display name, kind, timeline span, transform, opacity, fill, animation preset, and basic color adjustments. Additional fields carry text, embedded media, SVG paths, strokes, media offsets, volume, mute/visibility/lock state, or a group association.

The supported kinds are `video`, `audio`, `image`, `text`, `shape`, `svg`, and `drawing`. The legacy entrance presets are `none`, `fade`, `rise`, `fall`, `pop`, `slide`, `slide-right`, and `zoom-out`.

`start` and `duration` describe composition time. `mediaOffset` describes the corresponding starting point inside a source file. `x`, `y`, `width`, and `height` describe placement in composition pixels; `rotation` describes the object's rotation. Validate values at load time rather than trusting JSON to satisfy TypeScript types.

`groupId` links flat layers for selection and manipulation. Recipes may bake a common scale pivot and shared perspective plane into member layers; there is still no parent coordinate system or transform hierarchy. `SavedComponent.layers` stores copies for reinsertion; changes to the saved component do not update previously inserted layers.

Alpha 6 keeps schema version **1** unchanged. Its 12 ready-made components are a built-in application catalog, not an extra project field. Once inserted, a component becomes ordinary `text` and `shape` layers with fresh IDs and one fresh `groupId`. The project stores their editable geometry and content, not the catalog preset ID. Saved user compositions continue to use `components`.

Group content editing changes individual `text` values. Proportional group resizing changes each member's absolute coordinates, dimensions, corner radius, and font size where present. A separate scale, group bounding box, or parent transform is not serialized. Editing either W or H preserves the selection's proportions. Groups containing a locked visual member cannot be moved or resized as a whole.

Visual layers render in array order, from back to front. The timeline and depth-view list show the frontmost visual layer first. Reordering through the depth view changes the visual entries in this array while preserving audio positions. The depth view's camera angle, pan, zoom, and layer spacing are not saved. Per-element perspective is stored independently in the optional `transform3d` field described below.

## Looks and recipes

Color looks use only `brightness`, `contrast`, and `saturation`. At strength `s` from 0 to 1, each authored value is `1 + s × (presetValue − 1)`. Applying another look replaces those values; it does not add another filter layer. Reset writes 1 to all three fields.

The selected preset name and strength are inferred from the stored values. Matching values restore the look after reopening; manually altered values show Custom, and differing values across selected editable visual layers show Mixed. At 0% every look is mathematically Original. The inspector keeps only a temporary hint for the current selection to let that same strength control move back above zero. Reopening a neutral project reports Original; this changes no rendered appearance. There is no `lookId`, `lookStrength`, LUT, or filter-stack field in version 1.

Legacy motion presets in `core/presets.ts` write `animation`, entrance/exit timing, easing and loop fields. They remain distinct from alpha18 recipes in `core/motionRecipes.ts`, which bake ordinary property keys and optional reveal/shared-plane settings. Recipe IDs, strength, stagger, and template IDs are not serialized. Applying a recipe leaves base artwork, source media and clip timing intact, and clears legacy entrance, loop, exit and 3D preset motion on affected layers.

Recipe windows replace only affected channel keys inside their interval. Compatible crossing Bézier segments are subdivided to preserve surrounding animation; incompatible boundaries, changed outside-window reveal modes/3D origins, out-of-range values and key-count overflow reject the entire operation. By default, new entrances anchor untracked visibility/reveal channels hidden until entry; existing animated channels are preserved. Group scale is baked into member coordinates/dimensions around a common pivot; perspective recipes additionally store the common plane described below. See [motion recipes](motion-recipes.md).

## Optional visual-tool fields (alpha 7)

| Field               | Values / meaning                                                             |
| ------------------- | ---------------------------------------------------------------------------- |
| `mask`              | `none`, `rectangle`, `rounded`, `ellipse`, or `diamond`                      |
| `maskInset`         | Symmetric percentage inset, 0–45; default 0                                  |
| `maskRoundness`     | Corner radius as a percentage of the shortest masked edge, 0–50; default 12  |
| `flipX`, `flipY`    | Horizontal/vertical reflection about the layer center; default false         |
| `backgroundRemoval` | Image-only object with `color`, `tolerance`, and `softness`                  |
| `colorReplace`      | Image-only object with `from`, `to`, `tolerance`, `softness`, and `strength` |

Effect colors are six-digit hex values. Tolerance, softness, and strength are finite percentages from 0 to 100. An absent image-effect object disables that operation; restoring removes its settings without modifying `src`. Removal and replacement match the original decoded colors before the existing display-space grading filters. Existing transparency is preserved.

An absent `mask` preserves older image/video corner-radius clipping. Explicit `none` removes the mask; an explicit shape replaces that legacy clip. Other visual kinds support the same masks and flips. Audio does not accept visual-effect fields. New fields survive duplication, saved components, and splitting through the ordinary layer model.

Schema version remains 1 because older projects need no migration. Alpha 7 can read older files; older app versions with strict unknown-field validation cannot open projects using these new fields.

## Assets and portability

Imported media is embedded as data URLs, and the initial import limit is **50 MB per file**. Project loading has a **100 MB total file limit**. This makes a saved project self-contained for the supported media, at the cost of larger JSON files and higher memory use. Base64 encoding adds approximately one-third to binary media size before other project overhead. Duplicate layers and saved components may repeat media data in serialized JSON, so the project limit can be reached with fewer than 100 MB of original media.

The parser also limits the main composition to 1,000 layers and the component library to 200 components, with at most 1,000 layers in each component. It rejects unsupported schema versions, unknown fields, duplicate IDs within a collection, non-finite or out-of-range values, and unsupported media-source schemes.

The alpha does not provide managed external assets, media relinking, proxies, incremental saves, cloud synchronization, or a complete SVG document model. Avoid treating it as an interchange format for other editors.

## Compatibility rules

- Preserve existing project meaning when editing the schema.
- Increment the schema version when existing data requires migration.
- Validate IDs, finite numbers, dimensions, timing, supported kinds, and safe media sources on import.
- Keep runtime-only state and media decoder objects out of serialized projects.
- Document migration and recovery behavior before introducing a new persistent asset format.

`sourceDuration`, when present on audio/video layers, records the original media length in seconds. Trimming is bounded by this value and `mediaOffset`. Older files without it remain supported.

## Clip-relative motion and sound

Optional version-one fields are backward-compatible; absent values retain the original behavior.

| Field                         | Meaning / default                                           |
| ----------------------------- | ----------------------------------------------------------- |
| `animationDuration`           | Entrance length in seconds, default `0.6`                   |
| `animationDelay`              | Entrance delay after the layer starts, default `0`          |
| `animationEasing`             | `linear`, `ease-in`, `ease-out` (default), or `ease-in-out` |
| `exitDuration`                | Exit length in seconds, default `0` (off)                   |
| `audioFadeIn`, `audioFadeOut` | Linear sound gain ramps in seconds, default `0` (off)       |

Alpha 16 adds optional fields:

| Field               | Values and defaults                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| `animation`         | Existing values plus `fall`, `slide-right`, `zoom-out`                                                  |
| `animationDistance` | Shared entrance/exit travel, `0–2000` pixels; absent defaults to 48 vertical or 80 horizontal           |
| `exitAnimation`     | `none`, `fade`, `reverse`, `rise`, `fall`, `slide-left`, `slide-right`, `shrink`; absent preserves fade |
| `exitEasing`        | Same easing values; absent uses `animationEasing`                                                       |
| `loopAnimation`     | `none`, `float`, `pulse`; absent disables looping                                                       |
| `loopDuration`      | `0.4–3600` seconds, default 2                                                                           |
| `loopAmount`        | `0–100`; Float uses pixels (default 12), Pulse percent growth (default 8)                               |

Loops begin after the effective 2D or 3D entrance, or at the delay when there is no entrance. These values are clip-relative, so splitting restarts them. Reset removes motion while preserving the element's authored 3D pose. Older projects leave new fields absent.

Timing values must be finite, nonnegative, and at most 3,600 seconds. Authored settings are retained when trimming; effective timings fit inside the current clip. Entrance delay and duration fit together, while overlapping entrance/end fades multiply. Sound fades multiply the layer volume independently of its visual opacity.

Moving a clip carries its motion. Splitting retains the same clip-relative settings in each half, so an entrance restarts for the new clip; these preset envelopes restart after splitting. Property keyframes below instead preserve continuous evaluated motion. Saved components preserve these settings. Preview, PNG/SVG snapshots, and real-time video export use the same motion evaluation; preview and video export share the sound envelope.

## Per-element and shared-plane 3D (alpha 14/18)

Visual layers may have `transform3d: { enabled, rotateX, rotateY, z, motion }`. All five fields are required when the object is present. `enabled` is a boolean; X/Y angles are finite degrees from −180 to 180; `z` is normalized depth from −100 to 100 (positive is closer); `motion` is `none`, `tilt-in`, `flip-in`, or `float`. Audio rejects this field. An absent or disabled transform preserves the flat layer; disabling keeps its authored settings for later reuse. Existing `rotation` remains the in-plane Z rotation.

By default, the projection pivot is the element center, with camera distance 2.5 times its longest dimension and depth offset `z / 100 × distance × 0.5`. It changes only that element's perspective; array order still determines compositing. Normalized depth and angles survive resizing, duplication, splitting, and saved components. It is not a scene camera or geometry/model format.

Alpha18 optionally adds `originX`, `originY`, and `perspectiveDistance` inside `transform3d`. Supply all three together: origin coordinates are composition pixels within ±100,000; distance is 0.01–1,000,000 pixels. Matching values let editable member layers share a perspective plane. Their ordinary geometry and in-plane rotation are projected around this origin; the layer array still controls compositing. Composition aspect-ratio fitting transforms the shared origin and distance; duplicate offsets translate the origin. This is not a parent/group object, lighting model or saved inspection camera.

Tilt in and Flip in use the shared clip-relative delay, fitted duration, and easing, ending at the authored pose. Float holds the authored pose until the delay, then loops sinusoidal tilt/depth with `animationDuration` as its period (minimum 0.4 seconds, default 0.6); Float does not use easing. Existing 2D entrance and exit motion can combine with it. Splitting restarts the clip-relative effect.

Preview, depth inspection textures, PNG and video share the same projection renderer. SVG explicitly rejects active, visible, enabled 3D layers rather than exporting them flat. Older version-one files remain readable; older strict app versions cannot read the new field.

## Property keyframes (alpha 17/18)

Visual layers optionally store `keyframes`, a map from the 12 channels below to an ordered array of `{id, time, value, easing, curve?}`. Each scalar track has up to 256 keys; IDs are unique within a track and times strictly increase. Easing is `linear`, `hold`, `ease-in`, `ease-out`, `ease-in-out`, or `custom` and belongs to the outgoing segment. Custom `curve` has four finite Bézier control coordinates: X in 0–1, Y in −4–4. The UI constrains dragged Y handles to −0.5–1.5. Standard easings use canonical cubic Bézier curves; interpolation solves curve X before sampling Y.

| Channel              | Stored value / bounds                 | Missing-track source                         |
| -------------------- | ------------------------------------- | -------------------------------------------- |
| `x`, `y`             | Absolute composition pixels, ±100,000 | Layer `x` / `y`                              |
| `width`, `height`    | 0.01–32,768 pixels                    | Layer dimensions                             |
| `rotation`           | −360,000° to 360,000°                 | Layer in-plane rotation                      |
| `opacity`            | 0–1                                   | Layer opacity                                |
| `rotateX`, `rotateY` | −180° to 180°                         | `transform3d.rotateX` / `rotateY`, default 0 |
| `depth`              | −100 to 100                           | `transform3d.z`, default 0                   |
| `blur`               | 0–80 authored artwork pixels          | `blur`, default 0                            |
| `reveal`             | 0 hidden to 1 fully visible           | `reveal`, default 1                          |
| `textReveal`         | 0 hidden to 1 fully visible           | `textReveal`, default 1; text only           |

All outputs are bounded after interpolation. Rotation interpolates authored numbers, allowing full spins. Values before/after a keyed interval hold the first/last key. X/Y tilt and depth tracks evaluate into `transform3d`; they are not top-level static layer fields. Editing a spatial key enables perspective through the normal keyframe helper.

`keyframeOffset` is an optional finite offset within ±172,800s. Evaluation samples `projectTime - layer.start + keyframeOffset`. Stored key times remain 0–172,800s; helper edits rebase tracks when an extended-left clip requires negative local time. Splitting increments the right clip's offset instead of approximating its curves. Trimming left changes the offset by the trim amount; trimming right does not alter tracks. Off-clip keys are retained. Normal clip moves only change start.

Audio rejects these visual tracks, and `textReveal` tracks require text layers. Parsing validates all fields, finite numbers and bounds. Duplication deep-copies tracks and curve tuples. Aspect-ratio fitting transforms position/size keys and shared-plane origins/distances; ordinary duplicate offsets translate position keys and shared origins. Saved components preserve keyframes and offsets. Existing files remain compatible with schema version 1; older strict parsers cannot read these optional fields.

## Blur and reveal fields (alpha 18)

Visual layers may store `blur` (0–80, default 0), `reveal` (0–1, default 1), and `revealDirection` (`left` by default, or `right`, `up`, `down`, `center`). The directional/center reveal clips local artwork in addition to its existing shape mask. Blur is Gaussian soft focus in authored artwork pixels and scales with size; it does not sample neighboring animation frames.

Text layers additionally accept `textReveal` (0–1, default 1) and `textRevealMode` (`characters` by default, or `words`). Revealing preserves full-text positions and line breaks. This is visibility progression, not independent character transforms or text reflow.

The parser rejects these effects on audio, text-only fields/tracks on other kinds, unknown modes, and non-finite/out-of-range values. Static effect fields and their tracks survive duplication, saved components and splitting. Canvas, PNG/video and supported SVG snapshots evaluate them; SVG still rejects active video and enabled perspective layers. Schema version stays 1; older projects retain their defaults, while older strict app versions cannot read the alpha18 fields.
