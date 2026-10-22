# Design language

Frame Studio is a simple board for making videos. A spacious, dotted workspace surrounds the editable video frame, a small vertical tool bar puts creation tools beside it, and compact tracks keep the timeline readable. The interface uses neutral charcoal surfaces and a few soft corners. Color belongs primarily to the creator's work and the file categories.

## Interface principles

1. **Make the object directly editable.** Select on the canvas, see its bounds, and change its position without navigating a deep panel tree.
2. **Keep the common path short.** Import, trim, add text, adjust sound, and export should be obvious. Advanced controls can unfold when needed.
3. **Use color to orient.** Asset kind has a stable color in the library, layers, and timeline. Color is paired with an icon or label.
4. **Preserve calm.** Use neutral surfaces, precise spacing, rounded controls, legible type, and restrained motion. Let the work remain visually dominant.
5. **Keep compositions reusable.** A title with a shape, a presenter layout, or a motion treatment should be saveable and editable after reuse.

## Semantic layer palette

The source of truth is `LAYER_COLORS` and `LAYER_LABELS` in `src/core/types.ts`.

| Kind      | Label   | Color     | Intent        |
| --------- | ------- | --------- | ------------- |
| `video`   | Video   | `#9985ED` | Violet        |
| `audio`   | Audio   | `#BB98EF` | Soft lavender |
| `image`   | Image   | `#FFA568` | Orange        |
| `text`    | Text    | `#FFB27B` | Peach         |
| `shape`   | Shape   | `#ED9BC1` | Pink          |
| `svg`     | Vector  | `#B18AEF` | Purple        |
| `drawing` | Drawing | `#74D8BE` | Mint          |

These are identification colors, not the object's rendered fill. An image clip stays identifiable as an image even when its content or color adjustment changes. User-assigned layer colors and themes are planned; they should preserve a visible asset-kind indicator.

## Workspace behavior

- The compact library has three tabs: Files, Layers, and Templates. Files opens a two-column folder grid using the creator's supplied artwork in `public/library-icons`. Videos, Audio, Images, Vectors, Fonts, and Personalised lead directly to the relevant files or creation controls.
- Fonts holds heading, subheading, and body-text presets. Vectors holds shapes and SVG import. Personalised holds reusable saved components. Folder navigation uses a simple back button; there is no second row of categories or promotional content.
- The board supports direct selection and resizing, hand-tool or Space-drag panning, and pointer-centered zoom. Panning and zooming affect the workspace view, not the video composition.
- Canvas selection and timeline selection refer to the same objects.
- The inspector shows shared controls for multiple selection and type-specific controls for a single layer.
- Timeline edits expose clear clip edges, a visible playhead, and unambiguous active selection.
- Playback controls and time readouts stay close to the timeline.
- Export makes aspect ratio, output dimensions, and supported formats understandable before rendering begins.

These are design targets. Not every advanced behavior is implemented in the alpha.

## Accessibility and motion

Do not encode asset kind, mute, lock, or selection through color alone. Provide labels/tooltips for icon buttons, visible keyboard focus, generous pointer targets, and legible text contrast. Keep keyboard navigation predictable and avoid trapping focus in the canvas.

Interface animation should explain selection and state changes, and should respect reduced-motion preferences. This preference governs interface motion; it should not silently alter animation intentionally authored into a video.

## Inspiration and originality

The product brief draws on CapCut's editing accessibility, Figma's object manipulation and reusable compositions, and iOS visual polish. The reference screenshots guide the spacious dark board, vertical creation tools, and differentiated timeline tracks. The folder artwork was supplied by the creator; all other interface controls, code, and templates are developed for Frame Studio.
