# Keyframes

Select an element, click **Motion** above the timeline, and choose **Keyframes**.

![Position keyframes and an editable motion curve in the public starter project](images/keyframes.png)

1. Move the playhead to the start of your movement and click the diamond beside Position, Size, Rotation, or Opacity.
2. Move the playhead later. Change the values in that row, or move/resize the element on the canvas. Animated properties add or update a keyframe at the current frame.
3. Play the clip. Drag a diamond left or right to change its timing.

Position groups X and Y; Size groups width and height. A diamond edits the paired values together. Values are absolute canvas pixels, degrees, or opacity percent. Size scales the actual artwork, including text, masks and strokes. Rotation keeps the numeric angle, so 0 → 360 makes a complete turn.

## Extra properties

Use **+ Add property** to show more lanes. Animated properties appear automatically; **Animated only** hides unused lanes.

| Lane        | Stored channels      | Values                                                |
| ----------- | -------------------- | ----------------------------------------------------- |
| 3D tilt     | `rotateX`, `rotateY` | −180° to 180°, paired X/Y perspective angles          |
| Depth       | `depth`              | −100 farther away to +100 closer                      |
| Soft blur   | `blur`               | 0–80 authored artwork pixels, scaled with the artwork |
| Mask reveal | `reveal`             | 0–100%, from left/right/up/down or the center         |
| Text reveal | `textReveal`         | 0–100%, by character or word; text layers only        |

Together with Position, Size, Rotation and Opacity, these are 12 scalar channels. Reveals preserve the original artwork/text layout and combine with the existing shape mask. Soft blur is a focus effect, not temporal motion blur. 3D tilt and depth change a flat visual plane; layer order still controls stacking.

For a ready-made starting point, choose a recipe in the right-side **Motion** panel, then edit its generated diamonds here. The [motion recipes guide](motion-recipes.md) covers grouped movement, stagger, reveals and three editable motion templates.

## Timing

Click a diamond to seek to it and open its time and curve controls below the rows. The arrows beside a property visit its previous or next keyframe. Double-click empty space in a lane to add a keyframe there. The row's filled diamond removes the keyframe at the playhead. A selected diamond accepts Delete/Backspace without deleting the layer; Left/Right moves it one frame, or ten frames with Shift. Each drag is one undoable action. Dragging onto an occupied frame replaces that property's destination key; Undo restores both.

## Curves

A keyframe's curve controls the movement **from that keyframe to the next**. Choose Linear, Smooth, Ease in, Ease out, or Hold. Drag either curve handle to make a custom cubic Bézier curve. The horizontal axis is time, and the vertical axis is progress from the current value to the next. Dragging a handle above/below the endpoint range creates overshoot; every property remains within its valid bounds. Handles also support arrow keys, with Shift for larger steps. Hold keeps the current value until the next keyframe. The final keyframe has no outgoing segment, so its curve is disabled.

These are temporal interpolation curves, not spatial path handles or a speed/value graph with separate tangents per axis. Paired Position, Size and 3D tilt channels use the same chosen curve when edited together. Separate imported channel values remain independently evaluated.

## Editing and saving

- Preview, PNG/video export, SVG snapshots and 3D layer previews evaluate the same tracks. SVG export retains its existing limitation on per-element perspective.
- Inspector and canvas geometry follow the current evaluated pose. Edits auto-key only properties that already have tracks; static properties keep their ordinary behavior.
- Legacy entrance/loop/exit presets can combine with manually authored keys. **Reset presets** affects only those presets. Applying an alpha18 motion recipe writes keys and clears preset motion on the affected elements. Remove individual diamonds to remove authored keys.
- Moving a clip carries its animation. Trimming retains off-clip keys; splitting preserves the exact curve across both halves. Re-extending a trim can reveal retained keys again.
- Duplicates and saved components retain editable tracks. Composition resizing transforms position/size keys and shared perspective origins along with the artwork.
- Locked layers can be inspected and previewed but not edited. Audio uses its separate sound controls.

There are up to 256 keys per scalar property. Old projects open unchanged. Alpha18 adds the extra channels while preserving old projects. Earlier strict parsers cannot open projects using these new fields. Temporal curves do not provide spatial path editing, per-character transform animators or a full speed/value graph.
