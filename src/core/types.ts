export type LayerKind = 'video' | 'audio' | 'image' | 'text' | 'shape' | 'svg' | 'drawing';
export type Animation =
  'none' | 'fade' | 'rise' | 'fall' | 'pop' | 'slide' | 'slide-right' | 'zoom-out';
export type AnimationEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
export type ExitAnimation =
  'none' | 'fade' | 'reverse' | 'rise' | 'fall' | 'slide-left' | 'slide-right' | 'shrink';
export type LoopAnimation = 'none' | 'float' | 'pulse';
export type KeyframeProperty =
  | 'x'
  | 'y'
  | 'width'
  | 'height'
  | 'rotation'
  | 'opacity'
  | 'rotateX'
  | 'rotateY'
  | 'depth'
  | 'blur'
  | 'reveal'
  | 'textReveal';
export type KeyframeEasing = AnimationEasing | 'hold' | 'custom';
export type KeyframeCurve = [number, number, number, number];
export interface PropertyKeyframe {
  id: string;
  /** Authored clip time. Subtract keyframeOffset to locate a retained key after a split/trim. */
  time: number;
  value: number;
  /** Controls the segment leaving this key. */
  easing: KeyframeEasing;
  curve?: KeyframeCurve;
}
export type LayerKeyframes = Partial<Record<KeyframeProperty, PropertyKeyframe[]>>;
export type LayerMask = 'none' | 'rectangle' | 'rounded' | 'ellipse' | 'diamond';
export type Element3DMotion = 'none' | 'tilt-in' | 'flip-in' | 'float';
export type RevealDirection = 'left' | 'right' | 'up' | 'down' | 'center';
export type TextRevealMode = 'characters' | 'words';
/** Perspective of one visual plane, independent of the inspection camera. */
export interface Element3DTransform {
  enabled: boolean;
  rotateX: number;
  rotateY: number;
  /** Normalized depth, -100 (farther) to 100 (closer). */
  z: number;
  motion: Element3DMotion;
  /** Supply these three values together to tilt several editable layers as one plane. */
  originX?: number;
  originY?: number;
  perspectiveDistance?: number;
}
export interface BackgroundRemoval {
  color: string;
  tolerance: number;
  softness: number;
}
export interface ColorReplace {
  from: string;
  to: string;
  tolerance: number;
  softness: number;
  strength: number;
}
export interface Layer {
  id: string;
  name: string;
  kind: LayerKind;
  start: number;
  duration: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  fill: string;
  radius: number;
  text?: string;
  fontSize?: number;
  fontWeight?: number;
  src?: string;
  mediaOffset?: number;
  /** Original media length in seconds; preserved when trimming or splitting. */
  sourceDuration?: number;
  volume?: number;
  muted?: boolean;
  hidden?: boolean;
  locked?: boolean;
  groupId?: string;
  animation: Animation;
  /** Motion timings are seconds relative to this clip, including after a split or trim. */
  animationDuration?: number;
  animationDelay?: number;
  animationEasing?: AnimationEasing;
  /** Travel in canvas pixels; absent preserves the original preset distance. */
  animationDistance?: number;
  exitDuration?: number;
  /** Absent retains the original fade-out behavior when exitDuration is positive. */
  exitAnimation?: ExitAnimation;
  exitEasing?: AnimationEasing;
  loopAnimation?: LoopAnimation;
  loopDuration?: number;
  /** Pixels for Float; percentage growth for Pulse. */
  loopAmount?: number;
  keyframes?: LayerKeyframes;
  /** Sampling origin retained by split/trim so Bézier segments remain exact. */
  keyframeOffset?: number;
  transform3d?: Element3DTransform;
  /** Soft Gaussian blur in authored artwork pixels, not temporal motion blur. */
  blur?: number;
  /** Local wipe progress: 0 is hidden, 1 is fully visible. */
  reveal?: number;
  revealDirection?: RevealDirection;
  /** Text reveal preserves the full text's original positions and line breaks. */
  textReveal?: number;
  textRevealMode?: TextRevealMode;
  /** Linear gain ramps applied to audio and video sound in preview and export. */
  audioFadeIn?: number;
  audioFadeOut?: number;
  brightness: number;
  contrast: number;
  saturation: number;
  /** Local bounds clipping; inset and roundness are percentages. */
  mask?: LayerMask;
  maskInset?: number;
  maskRoundness?: number;
  flipX?: boolean;
  flipY?: boolean;
  /** Non-destructive flat-color image edits; the original src is never replaced. */
  backgroundRemoval?: BackgroundRemoval;
  colorReplace?: ColorReplace;
  path?: string;
  stroke?: string;
  strokeWidth?: number;
  viewBox?: string;
}
export interface SavedComponent {
  id: string;
  name: string;
  layers: Layer[];
}
export interface Project {
  version: 1;
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  background: string;
  layers: Layer[];
  components: SavedComponent[];
}
export const LAYER_COLORS: Record<LayerKind, string> = {
  video: '#7fb8f6',
  audio: '#65d5b0',
  image: '#d799e6',
  text: '#e9cc82',
  shape: '#f0a06d',
  svg: '#b2a2ef',
  drawing: '#75cdd7',
};
export const LAYER_LABELS: Record<LayerKind, string> = {
  video: 'Video',
  audio: 'Audio',
  image: 'Image',
  text: 'Text',
  shape: 'Shape',
  svg: 'Vector',
  drawing: 'Drawing',
};
export interface DesktopAPI {
  saveFile: (name: string, bytes: ArrayBuffer) => Promise<{ canceled: boolean; path?: string }>;
  openProject: () => Promise<string | null>;
  platform: string;
}
declare global {
  interface Window {
    frameDesktop?: DesktopAPI;
  }
}
