# Adobe workflow and capability audit

**23 October 2026 · Frame Studio 0.1.0-alpha.11**

> Historical audit of alpha11. Alpha17 adds editable Position, Size, Rotation and Opacity tracks, temporal Bézier curves, and selection geometry that follows animated poses. See the [current keyframe guide](keyframes.md). The findings below describe the audited version, not the current feature set.

Frame Studio does not currently offer the editing freedom of Photoshop, Illustrator, or After Effects. It implements useful subsets of their workflows. More controls alone will not close the gap: editable paths, reusable masks, property animation, nested transforms, and a defined color pipeline are the underlying requirements.

The target remains a simple creator interface. Advanced capabilities should appear next to the selected object, with progressive disclosure rather than a permanently crowded workspace.

## Scope and evidence

This is functional reverse engineering of documented workflows and an audit of Frame Studio's source and behavior. Adobe's side is based on official documentation; no Adobe desktop session or proprietary binary was inspected. No claims of internal algorithm equivalence or complete product parity are made.

- Source reviewed: `bf75f2e9466de622962e4e0a358c51fcaa2c21b5`.
- Executed application: alpha11, built from `c4ebc0bb3c57c79a3dc145210d80bb94a4dab282`; subsequent commits only changed documentation and test setup.
- Ten existing focused browser workflows were rerun and passed: SVG pieces, Pen paths, color looks, recoloring, background removal, masks, timeline motion, grouped motion, and 3D X/Y movement.
- Additional isolated probes checked SVG export/re-import and selection during animation. Results are recorded below and in [audit evidence](audits/adobe-alpha11-evidence.json).
- Tests used fresh public starter/generated projects. The user's open composition was not used or changed.

“Working” below means the specified subset exists. It does not imply unrestricted file compatibility, professional color accuracy, or parity with an entire Adobe feature.

## Photoshop: color and local adjustments

| Workflow                       | Frame Studio now                                                                                     | Missing freedom                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Basic whole-element correction | Brightness, contrast and saturation; six built-in looks including Original; adjustable look strength | Exposure, white balance, highlights/shadows, whites/blacks, vibrance, per-hue HSL and RGB/master curves                    |
| Reversible editing             | Original image data is retained; settings save and undo                                              | Ordered adjustment layers, clipping adjustments to a group, separate local corrections, reusable independent grade presets |
| Recoloring                     | Still-image RGB-distance replacement with From/To, tolerance and strength                            | Hue-family/tonal selection, object selection and limiting a correction to a spatial region                                 |
| Background removal             | Reversible solid-color key, with border-color estimation and color-distance softness                 | Subject/hair segmentation, brush refinement and video subject isolation                                                    |
| Color fidelity                 | Browser-decoded media, Canvas filters and shared preview/video rendering                             | Explicit working profiles, precision/bit-depth policy, RAW development, HDR/linear workflow and imported LUTs              |

Photoshop has stackable adjustment layers and Curves, while Camera Raw adds local selections and corrections. Its mask tools include brush/gradient/range operations and combining selections. These are materially different from changing three values on the entire layer. Sources: [adjustment layers](https://helpx.adobe.com/photoshop/desktop/adjust-color/color-corrections/apply-color-adjustments-with-adjustments-panel.html), [Curves](https://helpx.adobe.com/photoshop/desktop/adjust-color/color-corrections/adjust-color-and-tone-with-curves.html), [color adjustment commands](https://helpx.adobe.com/photoshop/desktop/adjust-color/color-corrections/color-adjustment-commands.html), [Camera Raw masks](https://helpx.adobe.com/camera-raw/desktop/edit-and-enhance-images/masking-and-local-adjustments/masking.html), [color-management policies](https://helpx.adobe.com/photoshop/desktop/adjust-color/color-profiles/color-management-policy-options.html).

**Important distinction:** current mask clipping hides part of an element. It cannot preserve an entire photo while warming only the person's face. Background-removal “softness” is a transition in color matching, not spatial feathering around a drawn mask. Matching colors inside the foreground can also be removed.

Implementation evidence: [layer schema](../src/core/types.ts), [look recipes](../src/core/presets.ts), [pixel operations](../src/core/visualEffects.ts), [processed-image pipeline](../src/engine/imageEffects.ts), [renderer](../src/engine/renderer.ts). Processed still-image effects are bounded to 4096 pixels per dimension and 8 megapixels; the current path should not promise full-resolution Photoshop-style processing for larger sources.

## Illustrator: SVG flexibility

| Workflow            | Frame Studio now                                                                               | Missing freedom                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Import/edit pieces  | Supported primitives become individual vector layers; simple text becomes text layers          | Broad SVG compatibility and faithful nested document structure                                                           |
| Pen drawing         | Corners and mirrored Bézier handles during creation; open/closed paths; undo and vector export | Reopening paths for point editing, independent handles, inserting/deleting arbitrary anchors, joining/splitting segments |
| Object manipulation | Move, scale, rotate, recolor, group, edit individual component text                            | Nested groups, isolation mode, parent-local transforms and linked component instances                                    |
| Construct shapes    | Shape presets and raw paths                                                                    | Unite, subtract, intersect, exclude, compound-path authoring and explicit fill rules                                     |
| SVG interchange     | Vector snapshot export; native `.framestudio` project roundtrip                                | Re-importing the application's own SVG output, editable mask structure and robust typography interchange                 |

Illustrator's Direct Selection/Anchor Point tools edit existing geometry; Pathfinder constructs new geometry from overlapping shapes; isolation and nested groups preserve structure. Sources: [Direct Selection](https://helpx.adobe.com/illustrator/using/tool-techniques/direct-selection-tool.html), [Anchor Point](https://helpx.adobe.com/illustrator/using/tool-techniques/anchor-point-tool.html), [Pathfinder](https://helpx.adobe.com/illustrator/desktop/manage-objects/reshape-transform-objects/pathfinder-panel-overview.html), [nested groups](https://helpx.adobe.com/illustrator/desktop/manage-objects/select-objects/select-object-groups-and-nested-object-groups.html).

Current import accepts `svg`, `g`, basic geometric primitives, `path`, simple `text`, `title` and `desc`. It rejects unsupported content instead of silently dropping it. Important exclusions include gradients/defs, images, symbols/use, text spans, clipping paths, masks, filters, explicit fill rules and richer stroke styles. Reflections and shear are rejected even where an SVG matrix can express them. Nested groups flatten into one group association; font and text layout fidelity is limited. Imported paths use conservative viewBox bounds, which can make small details difficult to select.

The Pen tool commits a path string. Its draft anchors do not become a persistent editable point structure. This is why adding more shape presets will not provide Illustrator's flexibility. Evidence: [SVG importer](../src/core/svg.ts), [vector path creation](../src/core/vector.ts), [canvas interaction](../src/components/CanvasStage.tsx), [SVG export](../src/engine/export.ts).

Illustrator's option to preserve its editing capabilities embeds Illustrator-specific data. Generic SVG alone should not be treated as a guarantee of complete Illustrator editability. [Adobe SVG saving options](https://helpx.adobe.com/illustrator/using/saving-artwork.html).

## After Effects: animation and movement

| Workflow              | Frame Studio now                                                                       | Missing freedom                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Entrance/exit motion  | None, Fade/Float/Slide/Pop recipes, duration, delay, four easing choices and exit fade | Values authored at arbitrary times for position, scale, rotation, opacity, color and effects           |
| Timeline editing      | Move/trim/split clips and drag entrance/exit timing strips                             | Property keyframes, Hold interpolation, editable speed/value curves, motion paths and repeatable loops |
| Group motion          | Group-safe translation recipes; independent reusable copies                            | Parent transforms, shared anchor points, nested animation and synchronized group scale/rotation        |
| Layer-depth workspace | Orbit/pan the inspection view; move actual X/Y; reorder front/back with undo           | Saved Z positions, X/Y/Z rotation, animated camera, lights or a 3D scene used by export                |

The timing strips visualize preset envelopes. They are not a Graph Editor. Slide distance is fixed at 80 pixels, Float/rise at 48 pixels, and Pop scales from 0.72 to 1. The saved model contains preset timing fields, not keyframe tracks. Source evidence: [motion timing](../src/core/motion.ts), [animation evaluation](../src/engine/renderer.ts), [timeline controls](../src/components/TimelineMotionEditor.tsx), [depth workspace](../src/components/LayerDepthStage.tsx).

After Effects provides temporal/spatial keyframe interpolation and editable paths. Its 3D layer model includes additional position/rotation axes and cameras that influence the rendered composition. Sources: [keyframe interpolation](https://helpx.adobe.com/after-effects/desktop/animate-in-after-effects/animation-keyframes/keyframe-interpolation.html), [3D layers](https://helpx.adobe.com/after-effects/desktop/work-with-layers/3d-layers/3d-layers.html), [cameras](https://helpx.adobe.com/after-effects/desktop/work-with-layers/camera-layer/cameras-lights-points-interest.html).

## Masking: the shared foundation

Current masks are **one hard rectangle, rounded rectangle, ellipse or diamond on one visual layer**, with symmetric inset and roundness. They follow the element transform and are verified across supported preview/export paths.

The following are absent:

- Freeform Pen masks and point editing after creation.
- Independent mask/content movement, invert, opacity, feather and signed expansion.
- Multiple masks with add/subtract/intersect operations.
- Masks applied to a whole nested group or only to an adjustment.
- Using another layer's alpha/luminance as a matte, such as video revealed through animated text.
- Mask-path keyframes, tracking and temporally consistent subject segmentation.

These are distinct operations, not variations of the current Inset slider. Sources: [Illustrator clipping masks](https://helpx.adobe.com/illustrator/desktop/manage-objects/edit-objects/about-clipping-masks.html), [opacity masks](https://helpx.adobe.com/illustrator/desktop/manage-colors/apply-transparency-and-blending/create-transparency-using-opacity-masks.html), [After Effects masks and mattes](https://helpx.adobe.com/after-effects/desktop/work-with-transparency-and-compositing/work-with-alpha-channels-and-masks/alpha-channels-masks-mattes.html), [animated mask paths](https://helpx.adobe.com/after-effects/desktop/animate-in-after-effects/animate-shape-paths-and-masks/animating-shape-paths-masks.html), [track mattes](https://helpx.adobe.com/after-effects/desktop/work-with-transparency-and-compositing/work-with-track-mattes-and-traveling-mattes/track-mattes-and-traveling-mattes.html), [Roto Brush](https://helpx.adobe.com/after-effects/desktop/roto-brush-and-refine-matte/roto-brush/roto-brush-refine-matte.html).

## Reliability findings

### Exported SVG cannot currently be re-imported

A fresh public starter exported successfully to SVG. Importing that exact file failed with:

> SVG import: The &lt;tspan&gt; element is unsupported. Expand it to simple vector paths first.

The six original layers remained unchanged. Source inspection identifies further incompatibilities: percentage background dimensions, per-layer filter styles, stroke caps/joins and optional clip-path/image definitions. Native `.framestudio` saving remains the supported project roundtrip. Fix the export/import contract before claiming reliable editable SVG exchange.

### Animated object interaction

The renderer evaluates motion at the playhead, while the 2D selection/hit-test code uses base object bounds. This was reproduced with a 40-pixel square at base X=300, sliding linearly for two seconds. At time 1 second, the visible square starts at X=260. Clicking its visible center at X=280 did not select it. Selecting it from the timeline showed the outline at X=300, 40 composition pixels away from the rendered position. A single evaluated-transform API should drive drawing, selection outlines, hit-testing and handles.

### Further fidelity checks needed

Source review indicates that multiplying group opacity into children can differ from compositing the group once where children overlap. Imported strokes also use round caps/joins. These are source-derived risks, not pixel-verified findings in this audit; add comparison fixtures before claiming appearance fidelity.

Video export currently uses real-time Canvas capture and browser-supported MP4/WebM encoding. PNG is a rendered frame; SVG is a snapshot and rejects active video layers. Shared rendering code helps consistency, but it is not evidence of frame-exact offline rendering, application-level color management, or identical SVG rendering in every external editor.

## Recommended implementation order

| Priority | Deliverable                                     | Simple interaction                                                                   | Acceptance example                                                                                                                                           |
| -------- | ----------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1        | Fix SVG roundtrip and current-time selection    | Import summary; truthful supported-format feedback                                   | Export a supported composition, re-import, and preserve geometry, appearance and editability. Click the visible animated object at any tested playhead time. |
| 2        | Persistent editable paths and nested transforms | Double-click **Edit points**; **Edit contents** for groups                           | Edit a card's Bézier corner after saving/reopening; move a phone mockup and keep its contents aligned.                                                       |
| 3        | Reusable mask model and shared compositing      | **Use as mask**, **Edit mask**, Feather, Invert; advanced combine controls collapsed | Put footage inside a custom phone screen; move content without moving its mask; undo and export identically.                                                 |
| 4        | Property animation tracks                       | Diamond beside a value; only animated properties shown in the timeline               | Move, rotate and fade one object across three authored moments; edit easing and preserve the result after reopening.                                         |
| 5        | Ordered color adjustments and local grades      | Light, Color, Color mix; Curves under **Fine tune**; **Limit to mask**               | Warm a person while keeping the sky unchanged, soften the boundary, revise it later and export the same result.                                              |
| 6        | Advanced production capabilities                | Optional curve editor, saved looks/motion, camera controls                           | Add mask-path animation and mattes, then tracking/subject refinement, explicit color management and deterministic encoding.                                  |

Color-pipeline design should start alongside the mask model so masking an adjustment and masking visibility remain distinct. Real 3D requires its own persisted scene/camera model; it should not be implied by the existing layer-depth inspection view.

The next practical milestone is **editable paths + reliable SVG exchange + custom masks + basic property keyframes**. That unlocks the requested cards, phone mockups and custom animations while retaining the simple right-side menu structure.
