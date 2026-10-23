import { createLayer, createProject } from './project';
import { applyMotionRecipe } from './motionRecipes';
import type { Layer, Project } from './types';
import type { ProjectTemplate } from './templates';

function author(name: string, duration: number, background: string) {
  const project: Project = {
    ...createProject(),
    name,
    width: 1920,
    height: 1080,
    duration,
    background,
    layers: [],
  };
  const add = (kind: Layer['kind'], patch: Partial<Layer>) => {
    const layer = createLayer(kind, { duration, animation: 'none', exitDuration: 0, ...patch });
    project.layers.push(layer);
    return layer.id;
  };
  const shape = (
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    patch: Partial<Layer> = {},
  ) => add('shape', { name, x, y, width, height, fill, radius: 0, ...patch });
  const text = (
    name: string,
    value: string,
    x: number,
    y: number,
    width: number,
    size: number,
    fill: string,
    patch: Partial<Layer> = {},
  ) =>
    add('text', {
      name,
      text: value,
      x,
      y,
      width,
      height: size * 1.25 * value.split('\n').length,
      fontSize: size,
      fontWeight: 500,
      fill,
      ...patch,
    });
  const motion = (ids: string[], options: Parameters<typeof applyMotionRecipe>[2]) => {
    project.layers = applyMotionRecipe(project, ids, options).layers;
  };
  return { project, add, shape, text, motion };
}

function productFlyThrough(): Project {
  const s = author('Product fly-through', 14, '#e4eaf0');
  const page = crypto.randomUUID();
  const group = { groupId: page };
  s.shape('Page shadow', 485, 104, 980, 2440, '#b8c6d5', { radius: 32, ...group });
  s.shape('Page surface', 470, 80, 980, 2440, '#fbfcff', { radius: 30, ...group });
  s.shape('Brand symbol', 511, 121, 30, 30, '#3981e5', { radius: 8, ...group });
  s.text('Brand name', 'postbox', 551, 121, 230, 25, '#243044', { fontWeight: 700, ...group });
  s.text('Navigation', 'Product    Stories    Pricing', 945, 127, 385, 16, '#667385', group);
  s.shape('Navigation action', 1330, 120, 83, 32, '#253146', { radius: 16, ...group });
  s.text('Navigation action label', 'Try it', 1350, 128, 70, 13, '#ffffff', group);
  s.shape('Hero blue', 500, 184, 920, 570, '#77aeea', { radius: 28, ...group });
  s.shape('Hero light', 540, 224, 840, 490, '#9ac8f4', { radius: 40, ...group });
  s.shape('Hero inner light', 612, 267, 695, 397, '#b3d8f7', { radius: 60, ...group });
  s.shape('Announcement pill', 796, 260, 330, 35, '#f9fcff', { radius: 18, ...group });
  s.text('Announcement', 'A quieter place for your ideas', 816, 271, 300, 14, '#42618b', group);
  s.text('Hero title', 'Less inbox.\nMore possibility.', 635, 337, 735, 68, '#234a7d', {
    fontWeight: 700,
    ...group,
  });
  s.text(
    'Hero description',
    'Make room for the conversations that matter.',
    663,
    535,
    700,
    21,
    '#486b98',
    group,
  );
  s.shape('Hero primary action', 791, 601, 160, 47, '#263d5d', { radius: 23, ...group });
  s.text('Hero primary label', 'Get started', 823, 615, 140, 17, '#ffffff', group);
  s.shape('Hero secondary action', 971, 601, 160, 47, '#edf5ff', { radius: 23, ...group });
  s.text('Hero secondary label', 'Take a look', 1003, 615, 140, 17, '#365578', group);
  for (const [index, x, y, angle] of [
    [0, 511, 314, -14],
    [1, 1238, 298, 17],
    [2, 1261, 606, -10],
  ] as const) {
    s.add('svg', {
      name: `Envelope ${index + 1}`,
      x,
      y,
      width: 105,
      height: 72,
      viewBox: '0 0 105 72',
      path: 'M4 5H101V67H4Z M4 5L52 39L101 5 M4 67L36 34 M101 67L69 34',
      fill: '#f7fbff',
      stroke: '#7397bb',
      strokeWidth: 2,
      rotation: angle,
      ...group,
    });
  }
  s.text('Category heading', 'A little order. A lot of headspace.', 545, 826, 850, 39, '#263349', {
    fontWeight: 650,
    ...group,
  });
  ['Ideas', 'People', 'Projects'].forEach((label, index) => {
    const x = 550 + index * 286;
    s.shape(`${label} card`, x, 913, 260, 223, ['#ddebdc', '#e8e0f6', '#e2eaf7'][index], {
      radius: 23,
      ...group,
    });
    s.shape(`${label} mark`, x + 25, 941, 46, 46, ['#a9c59f', '#bba7d6', '#a8beda'][index], {
      radius: 14,
      ...group,
    });
    s.text(`${label} title`, label, x + 25, 1010, 220, 27, '#344052', {
      fontWeight: 650,
      ...group,
    });
    s.text(
      `${label} copy`,
      ['Keep the good ones.', 'Your favorite voices.', 'One clear next step.'][index],
      x + 25,
      1062,
      225,
      16,
      '#647183',
      group,
    );
  });
  s.text('Workflow heading', 'Everything finds its place.', 550, 1240, 840, 43, '#263349', {
    fontWeight: 650,
    ...group,
  });
  s.text(
    'Workflow description',
    'A calmer workflow, from the first hello to the next big thing.',
    552,
    1312,
    810,
    20,
    '#6b788b',
    group,
  );
  for (let i = 0; i < 3; i++) {
    s.shape(`Inbox row ${i + 1}`, 550, 1392 + i * 105, 820, 86, '#edf1f7', {
      radius: 17,
      ...group,
    });
    s.shape(`Avatar ${i + 1}`, 574, 1412 + i * 105, 45, 45, ['#b1ccef', '#d6badd', '#bed7c4'][i], {
      radius: 23,
      ...group,
    });
    s.text(
      `Message ${i + 1}`,
      ['A fresh idea for Friday', 'Your next chapter is ready', 'Good things are happening'][i],
      645,
      1411 + i * 105,
      620,
      20,
      '#3a475d',
      group,
    );
    s.text(
      `Message preview ${i + 1}`,
      'A little less noise. A little more focus.',
      645,
      1443 + i * 105,
      620,
      14,
      '#8692a3',
      group,
    );
  }
  s.text('Pricing heading', 'Simple plans. More possibilities.', 550, 1790, 850, 39, '#263349', {
    fontWeight: 650,
    ...group,
  });
  ['Personal', 'Studio', 'Together'].forEach((label, index) => {
    const x = 550 + index * 286;
    s.shape(`${label} plan`, x, 1885, 260, 330, index === 1 ? '#c5ddf7' : '#eef2f7', {
      radius: 22,
      ...group,
    });
    s.text(`${label} plan title`, label, x + 24, 1912, 220, 24, '#3b4b63', {
      fontWeight: 650,
      ...group,
    });
    s.text(`${label} price`, ['Free', '€12', '€24'][index], x + 24, 1975, 210, 48, '#2d4463', {
      fontWeight: 700,
      ...group,
    });
    s.text(
      `${label} benefit`,
      'Room for your ideas.\nSpace to do your best.',
      x + 24,
      2062,
      215,
      17,
      '#687a90',
      group,
    );
    s.shape(`${label} button`, x + 24, 2142, 210, 38, '#f9fbff', { radius: 19, ...group });
    s.text(`${label} button label`, 'Find your space', x + 66, 2154, 170, 14, '#4c6484', group);
  });
  s.shape('Footer blue', 500, 2275, 920, 212, '#83b4ed', { radius: 24, ...group });
  s.text('Footer wordmark', 'postbox.', 677, 2316, 730, 105, '#eff7ff', {
    fontWeight: 700,
    ...group,
  });
  s.motion(
    s.project.layers.map((layer) => layer.id),
    {
      recipeId: 'page-tour',
      at: 0,
      duration: 12.5,
      strength: 0.85,
      grouping: 'together',
      stagger: 0,
    },
  );
  return s.project;
}

function cardChoreography(): Project {
  const s = author('Card choreography', 8, '#e8edf3');
  s.text('Eyebrow', 'A BETTER KIND OF WORKFLOW', 150, 99, 1500, 24, '#718099', { fontWeight: 550 });
  const title = s.text('Headline', 'Good ideas travel together.', 145, 178, 1680, 82, '#27384e', {
    fontWeight: 650,
  });
  s.motion([title], { recipeId: 'type-on', at: 0.1, duration: 1, grouping: 'individual' });
  const groups: string[][] = [];
  ['Collect', 'Create', 'Share'].forEach((label, index) => {
    const groupId = crypto.randomUUID();
    const before = s.project.layers.length;
    const x = 150 + index * 550;
    s.shape(`${label} card shadow`, x + 8, 400, 510, 460, '#c6d0df', { radius: 34, groupId });
    s.shape(`${label} card`, x, 388, 510, 460, ['#d8e9d2', '#d9d5ef', '#cbdff5'][index], {
      radius: 34,
      groupId,
    });
    s.shape(`${label} symbol`, x + 40, 432, 90, 90, ['#a8c79c', '#b5abd7', '#a0bee2'][index], {
      radius: 26,
      groupId,
    });
    s.text(`${label} number`, `0${index + 1}`, x + 60, 454, 90, 35, '#ffffff', {
      groupId,
      fontWeight: 650,
    });
    s.text(`${label} heading`, label, x + 40, 582, 430, 50, '#34455c', {
      groupId,
      fontWeight: 650,
    });
    s.text(
      `${label} description`,
      [
        'Keep the spark.\nSave what inspires you.',
        'Give it a little space.\nMake something yours.',
        'Send it into the world.\nStart a conversation.',
      ][index],
      x + 40,
      669,
      430,
      26,
      '#64738a',
      { groupId, fontWeight: 400 },
    );
    groups.push(s.project.layers.slice(before).map((layer) => layer.id));
  });
  s.motion(groups.flat(), {
    recipeId: 'spring-pop',
    at: 0.5,
    duration: 1.25,
    stagger: 0.2,
    grouping: 'groups',
    strength: 0.75,
  });
  s.text(
    'Footer',
    'Every piece stays editable. Every move is a keyframe.',
    150,
    956,
    1500,
    23,
    '#7d8ba0',
    { fontWeight: 400 },
  );
  return s.project;
}

function kineticType(): Project {
  const s = author('Words in motion', 7, '#17191c');
  s.text('Series', 'FRAME / MOTION STUDIES', 132, 104, 1500, 23, '#a8afb9', { fontWeight: 500 });
  const first = s.text('First thought', 'Start with', 125, 330, 1600, 140, '#f0f1f4', {
    fontWeight: 650,
  });
  const second = s.text('Main thought', 'a little curiosity.', 125, 510, 1700, 140, '#b5cff2', {
    fontWeight: 650,
    textRevealMode: 'words',
  });
  s.motion([first], { recipeId: 'soft-rise', at: 0, duration: 1, strength: 0.8 });
  s.motion([second], { recipeId: 'type-on', at: 0.7, duration: 1.5, textMode: 'words' });
  const underline = s.shape('Underline', 140, 720, 920, 9, '#b5cff2', { radius: 4 });
  s.motion([underline], { recipeId: 'wipe', at: 1.4, duration: 1, direction: 'left' });
  s.text('Caption', 'Choose a recipe. Make it your own.', 138, 905, 1500, 27, '#858e9b', {
    fontWeight: 400,
  });
  return s.project;
}

/** Original media-free motion examples; all content remains ordinary editable layers. */
export const MOTION_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'product-fly-through',
    name: 'Product fly-through',
    description: 'A tilted page tour, a smooth pan, and a pull-back. Every piece is editable.',
    project: productFlyThrough,
  },
  {
    id: 'card-choreography',
    name: 'Card choreography',
    description: 'Three cards arrive in sequence with a soft overshoot.',
    project: cardChoreography,
  },
  {
    id: 'words-in-motion',
    name: 'Words in motion',
    description: 'Clean kinetic type, a word reveal, and an animated underline.',
    project: kineticType,
  },
];
