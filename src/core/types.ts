export type LayerKind = 'video' | 'audio' | 'image' | 'text' | 'shape' | 'svg' | 'drawing';
export type Animation = 'none' | 'fade' | 'rise' | 'pop' | 'slide';
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
  brightness: number;
  contrast: number;
  saturation: number;
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
  video: '#74a5ff',
  audio: '#66c9a3',
  image: '#e7ba79',
  text: '#c7a1f7',
  shape: '#f498ad',
  svg: '#7ad1d2',
  drawing: '#f1cb77',
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
