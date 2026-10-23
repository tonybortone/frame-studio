# Timeline and motion controls

The timeline groups playback, editing, and zoom. Controls and clip rows use larger targets and readable labels; category colors stay consistent with the rest of the editor. Click the current time to enter seconds, minutes:seconds, or minutes:seconds:frames. Enter applies a valid time; Escape cancels. Frame-step buttons move by one project frame and pause playback. Locate brings the current playhead into view; Fit shows the sequence.

Select one layer and click **Motion** in the toolbar, or expand its row. The expanded editor has **Preview clip**, **Reset**, and **Close**. Preview plays the composition over that clip's time span and stops at its last frame. It changes the view only. Reset removes motion in one undoable edit while retaining the element's position and 3D pose. Locked layers remain readable but cannot be changed.

## Three phases

- **Entrance:** Fade, Rise, Fall, Pop, Slide from either side, or Settle in. Start after and Duration are clip-relative seconds. Travel changes movement distance. Feel provides Steady, Gentle start, Gentle stop, and Smooth both, with a curve showing the actual easing function.
- **Loop:** None, Float, or Pulse. It begins after the entrance finishes and repeats until the clip ends. Period is the duration of a cycle; Amount is pixels for Float and a scale percentage for Pulse. Float starts at its resting position; Pulse grows and returns. This is an authored animation, separate from playback looping.
- **Exit:** None, Fade, Reverse entrance, directional travel, or Shrink. It has its own duration and easing. Travel is shared with entrance travel. Reverse entrance returns toward the selected entrance's initial pose. Missing exit settings retain the earlier fade behavior.

The timeline strips show entrance and exit timing and can be moved or resized. The loop strip marks its active interval. They are preset envelopes, not arbitrary property keyframes. Timing remains saved when a clip is shortened; effective values clamp to its current length.

The 3D motion choice applies only to the selected element. Its entrance duration/delay use the same controls as 2D entrances; 3D Float uses that duration as its period. A 2D loop can be combined with the 3D pose. Audio rows have a separate Sound editor with volume, fades, and mute.

All effects use the same motion calculation in preview, hit testing, PNG/video rendering, and supported SVG output. SVG still cannot represent enabled per-element 3D; use PNG or video in that case.

## After Effects workflow study

This is an interaction study of publicly documented behavior. No proprietary implementation or assets are used.

| Adobe workflow                                                                                                                                                                                             | Frame Studio adaptation                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [Previewing](https://helpx.adobe.com/after-effects/desktop/view-and-preview/preview-video-and-audio/previewing.html) documents frame navigation, current time, and preview ranges.                         | Clearly grouped playback, direct time entry, frame steps, and Preview clip.     |
| [Animation basics](https://helpx.adobe.com/after-effects/desktop/animate-in-after-effects/animation-basics/animation-basics.html) separates layer duration from expandable animation properties.           | Readable colored clip rows with an explicit Motion action and closable details. |
| [Speed between keyframes](https://helpx.adobe.com/after-effects/desktop/animate-in-after-effects/speed-between-keyframes/speed.html) describes easing and acceleration.                                    | Four named easing choices with previews of the actual curves.                   |
| [Keyframe operations](https://helpx.adobe.com/after-effects/desktop/animate-in-after-effects/animation-keyframes/setting-selecting-deleting-keyframes.html) include reversing animation.                   | Reverse entrance is an approachable exit preset.                                |
| [Expression reference](https://helpx.adobe.com/after-effects/desktop/work-with-expressions/expression-language-reference/expression-language-reference.html) distinguishes animation cycles from playback. | Simple Float/Pulse loops have explicit period and amount settings.              |

Full property keyframes, Bézier speed graphs, expressions, motion blur, tracking, and animated mask paths remain separate future capabilities. The current controls do not claim After Effects parity.
