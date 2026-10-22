# Design language

Frame Studio is a simple board for making videos. A spacious, dotted workspace surrounds the editable video frame, a small vertical tool bar puts creation tools beside it, and compact tracks keep the timeline readable. Restrained black surfaces, subtle silver highlights, and clearly separated controls give the workspace depth without competing with the composition. Color belongs primarily to the creator's work and the file categories.

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

## Control surface direction

The Flask reference suggests a compact, carefully drawn control surface: dark translucent panels, small pill tabs, original illustrated tool glyphs, silver control edges, and a dot-matrix display. Frame Studio adapts those visual qualities to editing rather than adding decorative instruments.

- **Keep surfaces quiet.** Use near-black panels with a fine border and restrained translucency. Separate the library, tools, properties, and timeline through spacing and rounded outlines rather than a large grid of boxes.
- **Draw the primary tools consistently.** Creation glyphs use original silver material illustrations with consistent lighting, soft edge highlights, and a restrained shadow. Active tools need a visible surface change, and every icon keeps a descriptive accessible name.
- **Reserve metallic highlights for controls.** A soft silver edge on a playback button or playhead makes the interaction visible. It should not become a bright frame around every panel.
- **Make the dot matrix truthful.** Playback progress comes from the current project time and duration. Dots must not simulate an audio meter or imply analysis that has not happened. Exact time remains available as text.
- **Keep semantic clips rich and legible.** Each clip has a saturated two-pixel type-color edge and a subtle vertical tint over near-black. The body blends approximately 27–36% of the category color; selection raises that tint and adds a fine pale outline. This preserves identification without filling the whole timeline with flat pastel blocks.

## Workspace behavior

- The compact library has three tabs: Files, Layers, and Templates. Files opens a two-column folder grid using the creator's supplied artwork in `public/library-icons`. Videos, Audio, Images, Vectors, Fonts, and Personalised lead directly to the relevant files or creation controls.
- Fonts holds heading, subheading, and body-text presets. Vectors holds shapes and SVG import. Personalised holds reusable saved components. Folder navigation uses a simple back button; there is no second row of categories or promotional content.
- The board supports direct selection and resizing, hand-tool or Space-drag panning, and pointer-centered zoom. Panning and zooming affect the workspace view, not the video composition.
- Canvas selection and timeline selection refer to the same objects.
- The inspector shows shared controls for multiple selection and type-specific controls for a single layer.
- Timeline lanes are 32 pixels tall, with 24-pixel clips. Fine grid lines stop at the project duration. A small silver playhead grip, coral position point, and pale vertical line make the current frame easy to find.
- Clip edges show trim grips on hover, keyboard focus, or selection. Image clips display their actual imported thumbnail. Audio keeps a type icon until a real waveform is available; decorative waveform data is never substituted.
- Playback controls and exact time readouts share one floating dock in the board, close to the timeline. Repeated playback controls should not appear in multiple toolbars.
- Export makes aspect ratio, output dimensions, and supported formats understandable before rendering begins.

These are design targets. Not every advanced behavior is implemented in the alpha.

## Accessibility and motion

Do not encode asset kind, mute, lock, or selection through color alone. Provide labels/tooltips for icon buttons, visible keyboard focus, generous pointer targets, and legible text contrast. Keep keyboard navigation predictable and avoid trapping focus in the canvas.

Interface animation should explain selection and state changes, and should respect reduced-motion preferences. This preference governs interface motion; it should not silently alter animation intentionally authored into a video.

## Inspiration and originality

The product brief draws on CapCut's editing accessibility, Figma's object manipulation and reusable compositions, and iOS visual polish. The reference screenshots guide the spacious dark board, vertical creation tools, and differentiated timeline tracks. The later [Flask](https://flask.do/) direction informs the restrained control surfaces and display treatment. The folder artwork was supplied by the creator; other controls and compositions are developed for Frame Studio, with original primary tool glyphs rather than copied reference artwork.
