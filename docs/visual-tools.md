# Masks, color, and background tools

These tools edit the selected layer and participate in Undo/Redo. They run locally and keep the original imported image intact.

![Background removal and color replacement in Frame Studio](images/image-tools.png)

## Shapes and drawing

**Shapes** opens seven choices: rectangle, rounded rectangle, ellipse, triangle, star, line, and arrow. Each inserts an editable layer at the current playhead. Resize and recolor it on the board or in Properties.

**Drawing tools** contains Pencil, Brush, and Pen, with stroke color and width settings. Pencil and Brush create freehand vector strokes; Brush starts with a wider stroke. **Pen (B)** builds a path point by point: click for a corner, drag for a smooth Bézier handle. **Enter / Finish** completes an open path. Click the first point or use **Close path** to make a filled closed shape. **Backspace** removes the last draft point; **Escape / Cancel** discards the draft. Completing the path is one undo step.

Paths stay vector data in project files and SVG snapshots. They can be moved, resized, colored, grouped, masked, and animated like other layers. This creates new paths; reopening imported paths for anchor-by-anchor editing is not yet supported.

Tool menus close with their X, Escape, or a click elsewhere. **Templates** and **Components** have visible toolbar shortcuts. The library has its own close button. **Hide panels** clears both side panels and keeps them hidden while selecting or drawing; **Show panels** restores them. These view changes do not alter the project.

## Mask and flip

Select one unlocked visual element, then open **Masks and effects** in the canvas toolbar, or **Design** in Properties. Choose None, Rectangle, Rounded, Ellipse, or Diamond. Inset brings the mask inward equally from each edge; Roundness adjusts the Rounded mask. These are local bounds, so the mask follows the element when it moves, rotates, or animates. Horizontal and vertical flips use its center and leave its placement and clip timing unchanged.

An ellipse fills the element's bounds; use equal width and height for a circle. An explicit mask replaces the legacy rounded corners of an image or video. None removes clipping. The original geometry stays editable, and changing the mask does not crop pixels out of the source file.

Masks and flips apply to individual visual layers. Ungroup a component to work on one piece. Whole-group masks, arbitrary drawn masks, track mattes, feathered masks, and animated mask paths are not implemented.

## Change a color

Text and shape colors use Fill; drawings use Stroke. Quick swatches use the Frame Studio palette. Mixed selections apply the corresponding fill or stroke to each editable element.

For an image, open **Color → Replace color**. Set From and To colors, then refine Tolerance and Strength. A six-digit hex field lets you enter an exact color. The operation changes matching source colors throughout the image. It does not identify an object or select a spatial region. Existing alpha is retained.

Color replacement is separate from the six looks. Looks still adjust brightness, contrast, and saturation after image cleanup. Restoring the replacement leaves those grading values unchanged.

## Remove a solid background

Select a still image and open **Color → Background**. **Remove solid background** estimates the dominant opaque color along the image border. White, green, and a custom color provide explicit alternatives. Tolerance includes nearby shades; Edge softness blends the boundary between removed and retained colors. Restore background removes the key settings immediately.

This works best for logos, product cutouts, screenshots, and graphics against a plain background. It removes the selected color wherever it occurs, including inside the foreground. It is not AI subject segmentation or a hair-detail tool for complex scenes. Already-transparent borders may not provide a color to estimate; choose a color explicitly in that case.

Background removal and image color replacement currently support still images. Video can use masks, flips, and the existing color adjustments, but does not use these pixel-cleanup effects.

## Arrange layers in 3D

Open **3D layers** and drag an element to change its X/Y position. Multiple selected unlocked elements move together; use Command/Ctrl-click on layer rows to change the selection. The X/Y fields offer precise placement, including in the edge-on Top view. Use **Layer depth** for a single selected layer, or the forward/back buttons for a selection, to change which elements sit in front. A movement gesture takes one Undo step.

Drag empty space or Alt-drag to orbit. Shift-drag or middle-drag pans, and scrolling zooms. Camera angle, spacing, and zoom only change your workspace view. Position and layer order affect the saved project, 2D canvas, and exports; depth is the stacking order of 2D artwork rather than an independent Z coordinate.

## Preview, save, and export

The 2D canvas, 3D layer inspection, PNG, and video output use the same processed image. SVG embeds that processed image while keeping other vector content editable. SVG still requires hiding visible video layers. The composition background remains visible through removed pixels; removing an image's background does not make the composition itself transparent.

Cleanup raster processing is capped at a 4,096-pixel longest side and 8 megapixels. Smaller sources retain their dimensions. The original embedded image is unchanged, so removing the cleanup restores the original resolution. Processing caches are bounded and are not written into project JSON.

New effects are optional fields in version-one project files. Older projects open without migration. Projects using the new fields require alpha 7 or later.
