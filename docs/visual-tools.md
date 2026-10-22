# Masks, color, and background tools

These tools edit the selected layer and participate in Undo/Redo. They run locally and keep the original imported image intact.

![Background removal and color replacement in Frame Studio](images/image-tools.png)

## Mask and flip

Select one unlocked visual element, then open **Design**. Choose None, Rectangle, Rounded, Ellipse, or Diamond. Inset brings the mask inward equally from each edge; Roundness adjusts the Rounded mask. These are local bounds, so the mask follows the element when it moves, rotates, or animates. Horizontal and vertical flips use its center and leave its placement and clip timing unchanged.

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

## Preview, save, and export

The 2D canvas, 3D layer inspection, PNG, and video output use the same processed image. SVG embeds that processed image while keeping other vector content editable. SVG still requires hiding visible video layers. The composition background remains visible through removed pixels; removing an image's background does not make the composition itself transparent.

Cleanup raster processing is capped at a 4,096-pixel longest side and 8 megapixels. Smaller sources retain their dimensions. The original embedded image is unchanged, so removing the cleanup restores the original resolution. Processing caches are bounded and are not written into project JSON.

New effects are optional fields in version-one project files. Older projects open without migration. Projects using the new fields require alpha 7 or later.
