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

The supported kinds are `video`, `audio`, `image`, `text`, `shape`, `svg`, and `drawing`. Animation presets are `none`, `fade`, `rise`, `pop`, and `slide`.

`start` and `duration` describe composition time. `mediaOffset` describes the corresponding starting point inside a source file. `x`, `y`, `width`, and `height` describe placement in composition pixels; `rotation` describes the object's rotation. Validate values at load time rather than trusting JSON to satisfy TypeScript types.

`groupId` links flat layers for selection and manipulation. It does not create a parent coordinate system. `SavedComponent.layers` stores copies for reinsertion; changes to the saved component do not update previously inserted layers.

Alpha 6 keeps schema version **1** unchanged. Its 12 ready-made components are a built-in application catalog, not an extra project field. Once inserted, a component becomes ordinary `text` and `shape` layers with fresh IDs and one fresh `groupId`. The project stores their editable geometry and content, not the catalog preset ID. Saved user compositions continue to use `components`.

Group content editing changes individual `text` values. Proportional group resizing changes each member's absolute coordinates, dimensions, corner radius, and font size where present. A separate scale, group bounding box, or parent transform is not serialized. Editing either W or H preserves the selection's proportions. Groups containing a locked visual member cannot be moved or resized as a whole.

Visual layers render in array order, from back to front. The timeline and depth-view list show the frontmost visual layer first. Reordering through the depth view changes the visual entries in this array while preserving audio positions. The depth view's camera angle, pan, zoom, and layer spacing are not saved; there is no persistent 3D transform or model format.

## Looks and recipes

Color looks use only `brightness`, `contrast`, and `saturation`. At strength `s` from 0 to 1, each authored value is `1 + s × (presetValue − 1)`. Applying another look replaces those values; it does not add another filter layer. Reset writes 1 to all three fields.

The selected preset name and strength are inferred from the stored values. Matching values restore the look after reopening; manually altered values show Custom, and differing values across selected editable visual layers show Mixed. At 0% every look is mathematically Original. The inspector keeps only a temporary hint for the current selection to let that same strength control move back above zero. Reopening a neutral project reports Original; this changes no rendered appearance. There is no `lookId`, `lookStrength`, LUT, or filter-stack field in version 1.

Motion recipe names likewise do not add fields. None, Gentle fade, Float, Slide, and Pop set `animation`, `animationDuration`, `animationDelay`, `animationEasing`, and `exitDuration`. Float is the UI recipe for the existing `rise` animation. A recipe replaces these motion settings without changing layer start, duration, media offset, source, geometry, color, or audio. Pop is restricted to a single selected visual element in the inspector; the flat model has no shared group-scale pivot.

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
| `exitDuration`                | End fade length in seconds, default `0` (off)               |
| `audioFadeIn`, `audioFadeOut` | Linear sound gain ramps in seconds, default `0` (off)       |

Timing values must be finite, nonnegative, and at most 3,600 seconds. Authored settings are retained when trimming; effective timings fit inside the current clip. Entrance delay and duration fit together, while overlapping entrance/end fades multiply. Sound fades multiply the layer volume independently of its visual opacity.

Moving a clip carries its motion. Splitting retains the same clip-relative settings in each half, so an entrance restarts for the new clip; continuous source-relative motion across a split is not implemented. Saved components preserve these settings. Preview, PNG/SVG snapshots, and real-time video export use the same motion evaluation; preview and video export share the sound envelope.
