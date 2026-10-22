# Design language

Frame Studio combines a focused desktop editing workspace with the clarity and tactile controls of an iOS interface. The canvas is the primary workspace; the timeline communicates time, and the inspector reveals controls relevant to the current selection.

## Interface principles

1. **Make the object directly editable.** Select on the canvas, see its bounds, and change its position without navigating a deep panel tree.
2. **Keep the common path short.** Import, trim, add text, adjust sound, and export should be obvious. Advanced controls can unfold when needed.
3. **Use color to orient.** Asset kind has a stable color in the library, layers, and timeline. Color is paired with an icon or label.
4. **Preserve calm.** Use neutral surfaces, precise spacing, rounded controls, legible type, and restrained motion. Let the work remain visually dominant.
5. **Keep compositions reusable.** A title with a shape, a presenter layout, or a motion treatment should be saveable and editable after reuse.

## Semantic layer palette

The source of truth is `LAYER_COLORS` and `LAYER_LABELS` in `src/core/types.ts`.

| Kind      | Label   | Color     | Intent    |
| --------- | ------- | --------- | --------- |
| `video`   | Video   | `#74A5FF` | Blue      |
| `audio`   | Audio   | `#66C9A3` | Mint      |
| `image`   | Image   | `#E7BA79` | Warm sand |
| `text`    | Text    | `#C7A1F7` | Lavender  |
| `shape`   | Shape   | `#F498AD` | Rose      |
| `svg`     | Vector  | `#7AD1D2` | Aqua      |
| `drawing` | Drawing | `#F1CB77` | Gold      |

These are identification colors, not the object's rendered fill. An image clip stays identifiable as an image even when its content or color adjustment changes. User-assigned layer colors and themes are planned; they should preserve a visible asset-kind indicator.

## Workspace behavior

- A persistent library holds media, elements, templates, and saved components.
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

The product brief draws on CapCut's editing accessibility, Figma's object manipulation and reusable compositions, and iOS visual polish. The reference screenshots suggest a spacious dark canvas and differentiated timeline tracks. Use these as interaction references, while designing original controls, assets, code, and templates.
