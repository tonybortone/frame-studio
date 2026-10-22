import type { LayerKind } from './types';

export type AssetFolderId = 'videos' | 'audio' | 'images' | 'vectors' | 'fonts' | 'personalised';
export interface AssetFolder {
  id: AssetFolderId;
  label: string;
  description: string;
  section: 'media' | 'create';
  kinds: LayerKind[];
  color: string;
}

/** Media categories contain imported files; creation tools stay in their own group. */
export const ASSET_FOLDERS: AssetFolder[] = [
  {
    id: 'videos',
    label: 'Videos',
    description: 'Clips & recordings',
    section: 'media',
    kinds: ['video'],
    color: '#ef233c',
  },
  {
    id: 'audio',
    label: 'Audio',
    description: 'Voice, music & sound',
    section: 'media',
    kinds: ['audio'],
    color: '#8d99ae',
  },
  {
    id: 'images',
    label: 'Images',
    description: 'Photos & graphics',
    section: 'media',
    kinds: ['image'],
    color: '#edf2f4',
  },
  {
    id: 'fonts',
    label: 'Text',
    description: 'Titles & captions',
    section: 'create',
    kinds: ['text'],
    color: '#edf2f4',
  },
  {
    id: 'vectors',
    label: 'Shapes & SVG',
    description: 'Editable graphic elements',
    section: 'create',
    kinds: ['svg', 'shape', 'drawing'],
    color: '#8d99ae',
  },
  {
    id: 'personalised',
    label: 'Components',
    description: 'Your reusable designs',
    section: 'create',
    kinds: [],
    color: '#ef233c',
  },
];
