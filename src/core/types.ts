export type LayerKind = 'video' | 'audio' | 'image' | 'text' | 'shape' | 'svg' | 'drawing';
export type Animation = 'none' | 'fade' | 'rise' | 'pop' | 'slide';
export type AnimationEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
export type LayerMask = 'none' | 'rectangle' | 'rounded' | 'ellipse' | 'diamond';
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
  exitDuration?: number;
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
