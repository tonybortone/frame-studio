import type { LayerKind } from './types';

export type AssetFolderId = 'videos' | 'audio' | 'images' | 'vectors' | 'fonts' | 'personalised';

/** Folder artwork supplied by the project's creator; everything stays local. */
export const ASSET_FOLDERS: {
  id: AssetFolderId;
  label: string;
  icon: string;
  kinds: LayerKind[];
}[] = [
  { id: 'videos', label: 'Videos', icon: '/library-icons/videos.png', kinds: ['video'] },
  { id: 'audio', label: 'Audio', icon: '/library-icons/audio.png', kinds: ['audio'] },
  { id: 'images', label: 'Images', icon: '/library-icons/images.png', kinds: ['image'] },
  {
    id: 'vectors',
    label: 'Vectors',
    icon: '/library-icons/vectors.png',
    kinds: ['svg', 'shape', 'drawing'],
  },
  { id: 'fonts', label: 'Fonts', icon: '/library-icons/fonts.png', kinds: ['text'] },
  { id: 'personalised', label: 'Personalised', icon: '/library-icons/personalised.png', kinds: [] },
];
