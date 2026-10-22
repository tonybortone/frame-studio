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
