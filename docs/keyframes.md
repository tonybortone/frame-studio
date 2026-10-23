# Keyframes

Select an element, click **Motion** above the timeline, and choose **Keyframes**.

![Position keyframes and an editable motion curve in the public starter project](images/keyframes.png)

1. Move the playhead to the start of your movement and click the diamond beside Position, Size, Rotation, or Opacity.
2. Move the playhead later. Change the values in that row, or move/resize the element on the canvas. Animated properties add or update a keyframe at the current frame.
3. Play the clip. Drag a diamond left or right to change its timing.

Position groups X and Y; Size groups width and height. A diamond edits the paired values together. Values are absolute canvas pixels, degrees, or opacity percent. Size scales the actual artwork, including text, masks and strokes. Rotation keeps the numeric angle, so 0 → 360 makes a complete turn.

Click a diamond to seek to it and open its time and curve controls below the rows. The arrows beside a property visit its previous or next keyframe. Double-click empty space in a lane to add a keyframe there. The row's filled diamond removes the keyframe at the playhead. A selected diamond accepts Delete/Backspace without deleting the layer; Left/Right moves it one frame, or ten frames with Shift. Each drag is one undoable action. Dragging onto an occupied frame replaces that property's destination key; Undo restores both.

## Curves

A keyframe's curve controls the movement **from that keyframe to the next**. Choose Linear, Smooth, Ease in, Ease out, or Hold. Drag either curve handle to make a custom cubic Bézier curve. The horizontal axis is time, and the vertical axis is progress from the current value to the next. Dragging a handle above/below the endpoint range creates overshoot; opacity and size remain within their valid bounds. Handles also support arrow keys, with Shift for larger steps. Hold keeps the current value until the next keyframe. The final keyframe has no outgoing segment, so its curve is disabled.

These are temporal interpolation curves, not spatial path handles or a speed/value graph with separate tangents per axis. Paired Position/Size channels use the same chosen curve when edited together. Separate imported channel values remain independently evaluated.

## Editing and saving

- Preview, PNG/video export, SVG snapshots and 3D layer previews evaluate the same tracks. SVG export retains its existing limitation on per-element perspective.
- Inspector and canvas geometry follow the current evaluated pose. Edits auto-key only properties that already have tracks; static properties keep their ordinary behavior.
- Existing entrance/loop/exit presets can combine with keyframes. **Reset presets** affects only those presets. Remove individual diamonds to remove authored keys.
- Moving a clip carries its animation. Trimming retains off-clip keys; splitting preserves the exact curve across both halves. Re-extending a trim can reveal retained keys again.
- Duplicates and saved components retain editable tracks. Composition resizing transforms position/size keys along with the artwork.
- Locked layers can be inspected and previewed but not edited. Audio uses its separate sound controls.

There are up to 256 keys per scalar property. Old projects open unchanged. New files with these optional fields require a version of Frame Studio that supports keyframes.
