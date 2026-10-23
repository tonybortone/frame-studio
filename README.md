# Frame Studio

A local-first canvas and video editor for Mac. Arrange video, audio, images, text, and vectors on one canvas, then bring them together on a color-coded timeline.

Frame Studio is an early, open-source alpha. The aim is the directness of a design tool with an approachable video-editing workflow: reusable compositions, clear controls, and an interface that feels at home on a Mac.

The canvas keeps creation tools on the left and Design, Motion, and Color on the right. Tool labels collapse to icons, menus close with Escape or an outside click, and Hide panels makes more room for the composition. A subtle dot grid follows pan and zoom.

**Create and reuse.** Add nine shapes, draw with Pencil or Brush, or make curved SVG paths with the Pen. Templates, Components, and Masks have visible shortcuts. Ten editable templates cover common layouts and motion examples; 12 editable components include browser windows, phones, notifications, chats, and titles. Save your own selections as reusable components.

**Edit and animate.** A color-coded timeline separates visual layers from sound. Its toolbar groups playback, exact time, editing, locking, and zoom. Click Motion or expand a layer for editable Position, Size, Rotation and Opacity keyframes, with one focused property lane, larger draggable points, visual curve choices, and a live composition preview. Exact values stay under Adjust. Add extra lanes for 3D tilt, depth, soft blur, mask reveals and text reveals. The Presets tab uses compact Enter, Loop and Exit choices with visual previews, a duration slider, and optional Adjust controls; audio has separate levels and fades. See the [keyframe guide](docs/keyframes.md). Click the current time to jump precisely, step frame by frame, or preview one clip. See the [timeline and motion guide](docs/timeline-motion.md). Apply shape masks, flips, six color looks, or still-image color replacement and solid-background removal. See the [visual tools guide](docs/visual-tools.md).

**Start with motion.** The right-side Motion panel offers ten recipes, from soft entrances and staggered cards to a tilted website tour. Recipes create ordinary editable keys, keep grouped pieces together, and expose duration, intensity and sequence controls. Product fly-through, Card choreography and Words in motion are three editable examples in Templates. See the [motion recipes guide](docs/motion-recipes.md).

**Give one element depth.** Select a visual layer, enable **Design → 3D element**, then adjust X/Y tilt and depth. **Motion → 3D motion** adds Tilt in, Flip in, or Float. These transforms save and render in PNG/video without changing the rest of the composition. Grouped perspective recipes can share an origin and perspective distance so their pieces tilt as one plane. **3D layers** provides a separate orbiting workspace for inspection and X/Y positioning; Layer order controls stacking. These are flat visual planes, not imported 3D models or lighting effects.

![Frame Studio creation tools](docs/images/toolbar.png)

## Run locally

Use **Node.js 22.20+ or 24+** and npm. Node 24 is used in CI.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. To run the desktop app on a Mac:

```sh
npm run desktop
```

To check and package the app:

```sh
npm test
npm run build
npm run package:mac
```

Packaging currently targets **Apple Silicon Macs (arm64)** and writes DMG and ZIP artifacts to `release/`. These are unsigned development builds unless signing is configured. Public distribution needs the signing and notarization work described in [Distribution](docs/distribution.md). The repository does not automatically publish releases.

## Alpha scope

| Area             | First implementation                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| Canvas           | Select and arrange layers; text, shapes, freehand drawing, and editable common SVG primitives          |
| Timeline         | Move, trim, and split clips; preview a composition                                                     |
| Media            | Import local video, audio, and images; volume, mute, and audio fade controls                           |
| Organization     | 12 editable components; saved compositions; group text editing and proportional resize; depth ordering |
| Motion and color | 12 scalar keyframe channels; ten editable motion recipes; shared-plane perspective; six color looks    |
| Visual tools     | Shape masks and flips; image color replacement and solid-background removal                            |
| Layout           | Common aspect ratios and starter layouts for screen recordings and presenters                          |
| Projects         | Device-local autosave; save and reopen projects with embedded media                                    |
| Export           | PNG/SVG snapshots and real-time video recording using supported runtime formats                        |

Video export uses the runtime's `MediaRecorder` capabilities. **WebM is the primary target; MP4 is only available when supported by the current runtime.** Export runs in real time. This is not yet a deterministic frame-by-frame render engine.

Imports are limited to **50 MB per file**, and project loading is limited to **100 MB total**. Media is embedded as data URLs in project files, so saved projects can grow quickly. SVG editing supports a subset of SVG rather than complete Illustrator compatibility. SVG snapshots require hiding active video and enabled 3D layers; use PNG or video for a complete perspective composition. Saved components are reusable copies, not linked instances with nested overrides.

Background removal targets a chosen solid color; it is not subject segmentation for complex photographs. Color replacement and background removal currently apply to still images. Their processed raster is capped at a 4,096-pixel longest side and 8 megapixels, consistently across preview and export; the original embedded image is preserved. Masks and flips apply to individual visual layers, not whole groups or track mattes. Perspective uses bounded raster surfaces (2,048-pixel longest side / 4 megapixels), so enlarged 3D artwork can soften at high export resolutions.

Website tour provides camera-style pan, zoom and tilt by animating flat artwork. A scene-camera hierarchy, spatial path editing, per-character transform animators, temporal motion blur, transitions between clips, playback-speed changes, professional audio processing, advanced color grading, automatic editing/reframing, and a signed public installer remain future work. See the [roadmap](docs/roadmap.md) for the intended sequence and acceptance criteria.

## Built to extend

- **React + TypeScript** for the editor and project model.
- **Canvas 2D** for composition rendering.
- **Electron** for the Mac app and local file dialogs.
- **Vite, Vitest, and Playwright** for development and verification.

Start with the [architecture](docs/architecture.md), [development guide](docs/development.md), and [project format](docs/project-format.md). The [design language](docs/design-language.md) explains the visual system and layer colors.

## Contribute

Frame Studio is designed to improve incrementally. Small, focused changes with a clear user outcome are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request and [SECURITY.md](SECURITY.md) for vulnerability reporting.

Product references are inspiration for interaction and capability. Frame Studio does not include source code or proprietary assets from CapCut, Figma, Adobe, Canva, Apple, Flask, or DaVinci Resolve, and is not affiliated with those products.

Licensed under the [MIT License](LICENSE).
