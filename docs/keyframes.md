# Keyframes

Select an element, click **Motion** above the timeline, and choose **Keyframes**.

![Focused position keyframes, visual curves and composition preview in an original demo project](images/keyframes.png)

1. Choose **Position**, **Size**, **Rotation**, or **Opacity**. Only that property's points are shown.
2. Click **Add point**, move the playhead later, then move or resize the element on the canvas. Animated properties record the change at that time.
3. Drag the larger points left or right to retime the movement. Click a point—or the connection between two points—to shape its curve.

Exact values and selected-point time are available under **Adjust**. The main view stays visual. **More** adds 3D tilt, depth, blur, and reveals. Property buttons show how many points they contain.

Position groups X and Y; Size groups width and height. A diamond edits the paired values together. Values are absolute canvas pixels, degrees, or opacity percent. Size scales the actual artwork, including text, masks and strokes. Rotation keeps the numeric angle, so 0 → 360 makes a complete turn.

## Extra properties

Use **More → Choose a property** to add another property button. Animated properties appear automatically. Select a button to focus its lane; unused numerical fields stay hidden. Reveal direction and character/word mode live under **Adjust** for the selected property.

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

Click a point to seek to it and see its outgoing curve. Open **Adjust** for its exact time. The arrows beside a property visit its previous or next keyframe. Double-click empty space in a lane to add a keyframe there. **Remove point** removes the keyframe at the playhead. The trash button removes the selected point. A selected diamond accepts Delete/Backspace without deleting the layer; Left/Right moves it one frame, or ten frames with Shift. Each drag is one undoable action. Dragging onto an occupied frame replaces that property's destination key; Undo restores both.

## Curves

A keyframe's curve controls the movement **from that keyframe to the next**. Choose a visual curve tile: **Steady**, **Smooth**, **Speed up**, **Slow down**, or **Hold**. Drag either curve handle to make a custom cubic Bézier curve. The horizontal axis is time, and the vertical axis is progress from the current value to the next. Dragging a handle above/below the endpoint range creates overshoot; every property remains within its valid bounds. Handles also support arrow keys, with Shift for larger steps. Hold keeps the current value until the next keyframe. The final point shows the incoming curve for reference; select the previous point to edit that move.

The **This move** preview renders the actual composition between the selected point and its next point. It starts at the halfway pose; **Start** and **End** show the endpoint poses (at a clip boundary, End shows the last visible video frame), and **Play** loops that move silently. The white dot on the curve follows the same progress. Preview controls never move the main playhead or alter the project. The final point previews the movement into it and shows its incoming curve read-only. With no point selected, the preview spans the active property's keys (or the clip when no keys exist). Preview is static until explicitly played, including with reduced motion enabled.

These are temporal interpolation curves, not spatial path handles or a speed/value graph with separate tangents per axis. Paired Position, Size and 3D tilt channels use the same chosen curve when edited together. Separate imported channel values remain independently evaluated.

## Editing and saving

- Preview, PNG/video export, SVG snapshots and 3D layer previews evaluate the same tracks. SVG export retains its existing limitation on per-element perspective.
- Inspector and canvas geometry follow the current evaluated pose. Edits auto-key only properties that already have tracks; static properties keep their ordinary behavior.
- Legacy entrance/loop/exit presets can combine with manually authored keys. **Reset** affects only those presets. Applying an alpha18 motion recipe writes keys and clears preset motion on the affected elements. Remove individual diamonds to remove authored keys.
- Moving a clip carries its animation. Trimming retains off-clip keys; splitting preserves the exact curve across both halves. Re-extending a trim can reveal retained keys again.
- Duplicates and saved components retain editable tracks. Composition resizing transforms position/size keys and shared perspective origins along with the artwork.
- Locked layers can be inspected and previewed but not edited. Audio uses its separate sound controls.

There are up to 256 keys per scalar property. Old projects open unchanged. Alpha18 adds the extra channels while preserving old projects. Earlier strict parsers cannot open projects using these new fields. Temporal curves do not provide spatial path editing, per-character transform animators or a full speed/value graph.
