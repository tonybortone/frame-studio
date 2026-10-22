# Resolve workflows, simplified for Frame Studio

Research date: 22 October 2026. Scope: public workflow analysis of Blackmagic Design's documentation, applied to Frame Studio's current editor. No proprietary source code, binaries, internal algorithms, or private assets were examined. Geography does not affect these editing workflows.

The official product pages currently identify DaVinci Resolve 21; the linked training books are for Resolve 20. This analysis uses documented workflows common to those pages, not an assumption that every Resolve feature is available in Frame Studio. [Product and training index](https://www.blackmagicdesign.com/products/davinciresolve/training)

## Recommendation

Use Resolve's ready-made assets and contextual controls as the model: choose a visual result, add it, then edit a short list of properties. Keep one canvas, one timeline, and one inspector. The highest-value additions are editable component packs, named color looks, and motion recipes. Nodes, a curve editor, a separate grading workspace, and professional retiming controls are unnecessary for this first pass.

“Fake components” is interpreted as original, editable mock interfaces and graphics for use inside videos: a browser window, phone screen, conversation, notification, or title. These are composition elements, not screenshots of other applications, working embedded apps, or branded product replicas.

## What the reference actually does

| Verified Resolve behavior                                                                                                                                                                                                                                                                      | Design implication for Frame Studio                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Cut page groups effects by category, previews them on hover, and exposes applied-effect settings in the inspector. Title presets are also previewable and customizable. [Cut page: Transitions and Effects; Titles](https://www.blackmagicdesign.com/products/davinciresolve/cut)          | A searchable visual shelf can combine built-in components with saved components. One click adds an item; selection reveals its editable properties. |
| The Edit page places title generators above video and exposes text, font, size, and color. [Edit page: Titles](https://www.blackmagicdesign.com/products/davinciresolve/edit/)                                                                                                                 | Insert editable text and shapes as one group. Let users ungroup them, change wording, and replace the colors.                                       |
| Transitions attach to cuts, with duration editable in the timeline or inspector. [Edit page: Transitions](https://www.blackmagicdesign.com/products/davinciresolve/edit/)                                                                                                                      | A transition must join two clips. A single-layer fade should keep its accurate name, “Entrance” or “Exit fade.”                                     |
| Dynamic Zoom defines a shot's initial and final framing with two viewer boxes. [Edit page: Dynamic Zoom](https://www.blackmagicdesign.com/products/davinciresolve/edit/)                                                                                                                       | A future “Camera move” control can offer Push in, Pull out, Pan left, and Pan right, with Amount and Ease.                                          |
| Resolve exposes contrast, saturation, temperature, tint, shadows, highlights, and other primary adjustments. [Color page: Primary Adjustment Controls](https://www.blackmagicdesign.com/products/davinciresolve/color)                                                                         | Show named looks first, then only the adjustments Frame Studio actually renders. Avoid exposing controls whose behavior is not implemented.         |
| Smart Insert shifts later clips; Append adds at the end; Place on Top creates an overlay. The Cut page also offers a compact strip of common adjustment tools. [Cut page: Intelligent Editing; Transform, Color, Audio and Text](https://www.blackmagicdesign.com/products/davinciresolve/cut) | Use explicit placement actions and a compact contextual inspector. Avoid automatically shifting unrelated overlays or music.                        |
| Resolve retiming supports variable speed and selectable interpolation methods. [Edit page: Speed Ramps](https://www.blackmagicdesign.com/products/davinciresolve/edit/)                                                                                                                        | A speed slider requires playback, trim, split, audio, and export support. A decorative speed control would be misleading.                           |

## Implemented in alpha 6

Alpha 6 adds a ready-made component catalog, group content editing and proportional resizing, color looks with strength, and motion recipes. These use the existing layer and rendering model. The project schema remains version 1; no node editor, preset-instance system, or grading pipeline was introduced. Source references: `src/core/componentPresets.ts`, `src/core/presets.ts`, `src/core/selection.ts`, and `src/components/Inspector.tsx`.

The next three sections describe implemented source behavior. The final section explicitly marks future functions. Verification outcomes belong in the release notes; this document does not assert test-run results.

### 1. Twelve editable components

Open **Components → Ready-made**. The four categories contain exactly these items:

| Category | Components                                                                     | Editable content                                                                                     |
| -------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Mockups  | Browser window, Phone screen, Notification, Chat conversation, Terminal window | Window/address labels, page blocks, app text, sender and messages, terminal lines, shapes and colors |
| Titles   | Lower third, Quote card                                                        | Speaker name and role, quotation, author, accent shapes                                              |
| Callouts | Keyboard shortcut, Feature callout, Stat card                                  | Separate keycaps, action text, feature number and description, statistic and progress shapes         |
| Social   | Social post, Subscribe card                                                    | Profile name and initials, caption, artwork text, engagement labels, follow button                   |

Insertion and editing behavior:

1. A component is a small authored scene made from ordinary Frame Studio layers. Every instance receives fresh layer IDs and a fresh group ID; inserting it twice creates independent copies.
2. The instance is centered and scaled proportionally to fit within 84% of the canvas width and 76% of its height, with enlargement capped at 1.5×. Geometry, font sizes, and radii scale together. The minimum supported canvas is 16 × 16; at that extreme, text is shortened when needed to fit the minimum 1 px font.
3. Its start is the playhead clamped to `0…project.duration − 0.01`. Its lifetime is up to 5 seconds, bounded by the remaining duration, with a 0.01-second minimum. Insertion leaves the playhead unchanged. New components have no entrance animation or exit fade, so their contents are immediately visible; users choose motion afterward.
4. Insertion preserves the scene, frame size, background, assets, and existing layers. It selects the added group, opens its inspector in the 2D view, and records one undoable insertion. Project validation runs before accepting the added layers.
5. The **Design → Content** section gives each selected text layer its own labeled text field, such as Website headline or Notification message. Editing one field changes that layer only. Locked text fields are disabled.
6. **Position & size** moves the selection by its outer bounds. Changing W or H scales the whole visual selection uniformly, including offsets, font sizes, and corner radii. Center X/Y aligns its bounds to the canvas. If any selected visual member is locked, these group transforms are disabled; audio is excluded.
7. The search matches preset names, descriptions, and categories. Ready-made and **Yours** are separate views, with category chips for the built-in catalog and name search for saved components. The catalog is available without saving anything first.
8. Each preview renders the authored text and shapes. These are editable visual mockups: browser windows do not load websites, terminal lines do not execute commands, and buttons do not perform external actions. Users can ungroup pieces or save a modified composition under Yours.

The flat group remains a set of layer copies, not a linked instance with nested overrides. Resizing writes the resulting absolute layer values; no hidden parent transform is required.

### 2. Color looks and strength

The Color tab exposes these six implemented looks. Values are Frame Studio design choices, not Resolve's algorithms or commercial LUTs:

| Look     | Brightness | Contrast | Saturation |
| -------- | ---------: | -------: | ---------: |
| Original |       1.00 |     1.00 |       1.00 |
| Clean    |       1.06 |     1.08 |       0.96 |
| Vivid    |       1.03 |     1.16 |       1.30 |
| Soft     |       1.08 |     0.85 |       0.84 |
| Noir     |       1.02 |     1.24 |       0.00 |
| Muted    |       0.98 |     0.94 |       0.55 |

Applying a look sets the three values on selected unlocked visual layers in one undoable action. Audio and locked artwork are skipped. Switching looks replaces the prior values instead of multiplying filters. Strength uses `value = 1 + strength × (presetValue − 1)`, where strength is 0–1. At 0%, the result is neutral; at 100%, it is the authored preset. Reset color returns all three values to 1. **Adjust** reveals the three existing sliders, each ranging from 0 to 2.

The active look and strength are derived from the actual values. A manual combination that does not match a recipe is Custom; unequal values across the editable visual selection are Mixed. Strength is disabled for Custom, Mixed, and Original. At 0%, all recipes have identical neutral values, so the inspector temporarily remembers the current recipe for that selection to let the slider move back up. The hint is not saved and is invalidated when the selection or relevant values change. Reopening a neutral project correctly shows Original. No `lookId` or `lookStrength` field is added.

Brightness remains labeled Brightness: these simple display-space filters are not RAW exposure, color-temperature correction, HDR grading, or Resolve-compatible color science. Preview and export consume the stored values through the existing renderer.

### 3. Motion recipes and group behavior

The Motion tab offers these implemented recipes. Every recipe sets entrance delay to zero. Detailed duration, delay, easing, and exit controls are under **Fine-tune**.

| Recipe      | Entrance |         Duration | Easing        | Exit fade |
| ----------- | -------- | ---------------: | ------------- | --------: |
| None        | None     | 0.60 s, inactive | Ease out      |       0 s |
| Gentle fade | Fade     |           0.65 s | Ease in & out |    0.20 s |
| Float       | Rise     |           0.70 s | Ease out      |    0.20 s |
| Slide       | Slide    |           0.55 s | Ease out      |    0.15 s |
| Pop         | Pop      |           0.45 s | Ease out      |    0.15 s |

A recipe changes motion fields only. It preserves layer position, size, text, source, media offset, start, duration, color, and audio. The shared animation engine fits effective timings inside short clips. Applying a recipe to several selected visual layers records one undo action and skips audio and locked layers.

Float uses the same 48 px vertical entrance translation for each element; Slide uses the same 80 px horizontal translation. For component parts with matching clip timing, this preserves their arrangement throughout the movement. Pop scales each element around its own center, so its button is disabled whenever more than one visual layer is selected. Select an individual piece to use Pop. Multi-selection does not create a parent animation pivot or force independently timed clips to share timing.

The inspector reports Custom when motion fields differ from a complete recipe, and Mixed when editable selected layers have different motion settings. Existing entrance recipes do not imply arbitrary keyframes, full-clip camera motion, or true transitions between clips.

## Future functions — not implemented in alpha 6

**Dynamic camera move.** Use full-clip normalized progress with a small amount, such as 5–15%, to interpolate scale and position. Expose direction, amount, and ease. Apply it in the shared renderer so canvas, 3D layer textures, thumbnails, and exports agree. Store its own fields separately from entrance animation. A move starts and ends inside the selected layer's lifetime, even after trimming or splitting. Whether split halves preserve the original continuous move must be specified and tested.

**Additional placement commands.** Add at playhead is implemented for components. Add after selection, sequence Append, and Close gap are future commands. A component is an overlay, so adding it must not shift audio or the base video. A future sequence strip can own ripple semantics; the current stack of overlapping composition layers cannot safely infer a single edit track.

**Simple two-clip transitions.** Start with Cut and Dissolve only after a sequence model exists. Specify the two participating clips, overlap, source handles, duration limits, and audio behavior. Show the transition as its own short region and make its duration editable. Reuse current Exit fade for fades to transparency; do not present it as a complete dissolve implementation.

**Speed.** A real speed change must map timeline time to source time consistently, adjust source-duration bounds and trim/split behavior, define audio pitch handling, and match the export renderer. Keep this out of the immediate preset pass unless those dependencies are all implemented.

## Verification checklist

These are acceptance checks, not a report of completed test runs:

- Insert two instances; edit one and confirm the other remains unchanged.
- Insert into portrait and square projects without changing the project dimensions or obscuring required editing controls.
- Change component text, color, position, duration, and motion; verify the exported frame reflects the edit.
- Undo insertion and preset application once each; restore the exact previous project.
- Save and reopen; retain component independence and rendered appearance.
- Apply looks at neutral and full strength, switch between presets, reset, and compare rendered pixels where practical.
- Apply motion to short clips and multiple selected layers; retain trim positions, timing bounds, and audio behavior.
- Use the library by keyboard and on a small Mac window; keep clear accessible names and visible selection state.

No node graph, copied proprietary code, external brand assets, or Resolve project compatibility is required for these functions.
