import { createLayer, createProject } from './project';
import type { Project } from './types';

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  project: () => Project;
}

/** Templates are editable project data: no network, hidden footage, or magic rendering. */
export const TEMPLATES: ProjectTemplate[] = [
  {
    id: 'blank',
    name: 'A clean slate',
    description: 'A blank widescreen canvas for your next idea.',
    project: () => ({ ...createProject(), name: 'Untitled project', layers: [] }),
  },
  {
    id: 'story',
    name: 'A little story',
    description: 'A portrait title sequence. Make the words your own.',
    project: () => {
      const groupId = crypto.randomUUID();
      return {
        ...createProject(),
        name: 'A little story',
        width: 1080,
        height: 1920,
        layers: [
          createLayer('text', {
            name: 'Story label',
            text: 'SMALL MOMENTS / BIG IDEAS',
            x: 88,
            y: 130,
            width: 900,
            height: 60,
            fontSize: 26,
            fill: '#666b60',
          }),
          createLayer('shape', {
            name: 'Mint backdrop',
            x: 388,
            y: 400,
            width: 560,
            height: 560,
            fill: '#a6bfad',
            radius: 100,
            rotation: 11,
            groupId,
            animation: 'pop',
          }),
          createLayer('shape', {
            name: 'Orange circle',
            x: 105,
            y: 601,
            width: 425,
            height: 425,
            fill: '#e99165',
            radius: 215,
            groupId,
            animation: 'rise',
          }),
          createLayer('text', {
            name: 'Story title',
            text: 'Make room\nfor a little\npossibility.',
            x: 82,
            y: 1108,
            width: 930,
            height: 440,
            fontSize: 116,
            fontWeight: 600,
            fill: '#252725',
            animation: 'rise',
          }),
          createLayer('text', {
            name: 'Story footer',
            text: 'Your story starts here.',
            x: 88,
            y: 1730,
            width: 900,
            height: 72,
            fontSize: 34,
            fontWeight: 400,
            fill: '#666b60',
            animation: 'fade',
          }),
        ],
      };
    },
  },
  {
    id: 'presenter',
    name: 'Screen + storyteller',
    description: 'Screen on the left, camera on the right. Add your footage.',
    project: () => {
      const screenGroup = crypto.randomUUID();
      const cameraGroup = crypto.randomUUID();
      return {
        ...createProject(),
        name: 'Screen + storyteller',
        background: '#e9e6df',
        layers: [
          createLayer('text', {
            name: 'Episode label',
            text: 'A GOOD IDEA, EXPLAINED.',
            x: 112,
            y: 86,
            width: 1500,
            height: 60,
            fontSize: 36,
            fontWeight: 600,
            fill: '#252725',
          }),
          createLayer('shape', {
            name: 'Screen placeholder',
            x: 112,
            y: 238,
            width: 1120,
            height: 630,
            fill: '#d3d6ce',
            radius: 30,
            groupId: screenGroup,
          }),
          createLayer('text', {
            name: 'Screen placeholder label',
            text: 'Your screen recording',
            x: 182,
            y: 488,
            width: 980,
            height: 65,
            fontSize: 47,
            fontWeight: 500,
            fill: '#535c51',
            groupId: screenGroup,
          }),
          createLayer('text', {
            name: 'Screen placeholder instruction',
            text: 'Import a video and place it here.',
            x: 185,
            y: 570,
            width: 980,
            height: 55,
            fontSize: 29,
            fontWeight: 400,
            fill: '#697164',
            groupId: screenGroup,
          }),
          createLayer('shape', {
            name: 'Camera placeholder',
            x: 1282,
            y: 238,
            width: 526,
            height: 630,
            fill: '#c2d1c4',
            radius: 30,
            groupId: cameraGroup,
          }),
          createLayer('text', {
            name: 'Camera placeholder label',
            text: 'Your camera',
            x: 1330,
            y: 500,
            width: 430,
            height: 65,
            fontSize: 43,
            fontWeight: 500,
            fill: '#495c4b',
            groupId: cameraGroup,
          }),
          createLayer('text', {
            name: 'Camera placeholder instruction',
            text: 'Add your footage here.',
            x: 1331,
            y: 581,
            width: 430,
            height: 60,
            fontSize: 27,
            fontWeight: 400,
            fill: '#617365',
            groupId: cameraGroup,
          }),
          createLayer('text', {
            name: 'Episode footer',
            text: '01 / START WITH SOMETHING WORTH SHARING',
            x: 116,
            y: 945,
            width: 1600,
            height: 50,
            fontSize: 23,
            fontWeight: 500,
            fill: '#6b7165',
          }),
        ],
      };
    },
  },
];
