# Design language

Frame Studio keeps the board at the center of a compact editing workspace. The library explains what can be added, the board shows the composition, and the timeline separates visual layers from sound. A restrained navy, slate, paper, and red palette gives those areas a consistent hierarchy.

## Interface principles

1. **Edit the object directly.** Select, move, and resize on the board. Selection is shared with the library and timeline.
2. **Keep files separate from creation tools.** Video, audio, and image imports are media. Text, vector shapes, and reusable components have a dedicated Create group.
3. **Keep controls close to their effect.** Expand a timeline track to adjust its motion or sound. Use properties for the selected element's other details.
4. **Make previews truthful.** Template thumbnails use the same composition renderer as preview and export. Audio waveforms, analysis, or arbitrary keyframe capabilities must not be implied when unavailable.
5. **Keep changes reversible.** Applying a template and changing frame size remain undoable. View navigation and timeline height do not alter project content.

## Palette

The base palette is:

| Token   | Color     | Use                                      |
| ------- | --------- | ---------------------------------------- |
| Navy    | `#2B2D42` | Raised surfaces and composition text     |
| Slate   | `#8D99AE` | Secondary labels, sound, subtle borders  |
| Paper   | `#EDF2F4` | Primary text, light compositions, focus  |
| Red     | `#EF233C` | Active controls and visual accents       |
| Crimson | `#D90429` | Strong actions and secondary red accents |

Darker navy surfaces and transparent variants provide depth without adding unrelated hues. A fine outline, quiet hover surface, and clear active state are more useful than decorative chrome. Every interactive icon keeps a descriptive accessible name.

`LAYER_COLORS` and `LAYER_LABELS` in `src/core/types.ts` define category colors. These identify layers independently of their rendered fill:

| Kind      | Label   | Color     |
| --------- | ------- | --------- |
| `video`   | Video   | `#EF233C` |
| `audio`   | Audio   | `#8D99AE` |
| `image`   | Image   | `#D90429` |
| `text`    | Text    | `#EDF2F4` |
| `shape`   | Shape   | `#8D99AE` |
| `svg`     | Vector  | `#EF233C` |
| `drawing` | Drawing | `#EDF2F4` |

Categories share a small palette, so icons and labels always accompany color. The user's imported media retains its original appearance.

## Library and templates

The library has three tabs: Files, Layers, and Templates. Files opens two concise groups:

- **Media:** Videos, Audio, and Images. Each row shows the current project count and opens its files and import action.
- **Create:** Text, Shapes & SVG, and Components. Text offers heading, subheading, and body presets; Shapes & SVG adds editable graphics; Components saves and reuses selections.

Small original vector icons identify categories. Large decorative folder thumbnails are no longer part of navigation. The previously supplied PNG artwork remains in the repository. Empty states describe what belongs in each category. The Layers tab separates Visuals and Audio while preserving the relative visual stacking order.

Seven editable templates are provided: Blank canvas, Portrait title, Screen + camera, Speaker lower third, Tutorial chapter, Product spotlight, and Square announcement. Each uses the five-color palette and ordinary project layers. The template card renders its actual composition, identifies its ratio and duration, and provides a clearly labeled Use template action. Footage and product-image spaces are labeled placeholders, not bundled stock media. Templates replace the current scene; Undo restores it.

## Board and frame size

The board supports direct selection and resizing, hand-tool or Space-drag panning, and pointer-centered zoom. Panning and zooming affect the workspace view, not the exported composition. Properties float over the workspace without shifting the board during a drag.

The frame-size picker offers landscape, portrait, square, and social presets, plus custom pixel dimensions. Fit contents to frame scales existing objects uniformly; turning it off changes frame dimensions while preserving object coordinates and sizes. The same operation can be undone.

Playback controls and exact time readouts share a compact dock. The dot display reflects project time and duration; it does not simulate an audio meter.

## Timeline, motion, and sound

Visual and audio tracks have separate labeled sections. Each layer keeps its own editable clip, and the relative order of visual layers remains unchanged. The ruler displays time against the project frame rate. Trim edges are visible on interaction, and image clips use their real imported thumbnails. The timeline height can be changed by dragging its separator or using its arrow-key controls.

Expanding a visual track exposes entrance and exit timing. Entrance presets are None, Fade, Rise, Pop, and Slide. Duration, delay, easing, and exit fade are editable through the inline controls and properties. The entrance and exit strips represent those actual timing settings and can be adjusted directly. This is preset-based motion editing, not an arbitrary keyframe graph editor.

Expanding an audio track exposes volume, mute, and fade-in/fade-out duration. Audio-only properties omit visual transforms and opacity. Sound fades affect gain independently of visual opacity. Shared timing calculations keep preview and export consistent; shortening a clip clamps its effective timing without discarding authored values.

## Accessibility and motion

Do not encode category, mute, lock, or selection through color alone. Provide descriptive labels and tooltips, visible focus, keyboard access to controls, and readable contrast. Empty categories remain usable through their import or creation action.

Interface motion respects reduced-motion preferences. That preference governs the interface; it does not alter animation intentionally authored into a video.

## Inspiration and originality

The brief draws on CapCut's approachable editing, Figma's direct object manipulation, and iOS clarity. Reference screenshots inform the spacious board and differentiated tracks. The earlier [Flask](https://flask.do/) study informed compact control surfaces, while the current palette and library organization simplify them for editing. All controls, template compositions, and application code are developed for Frame Studio.
