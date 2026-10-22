import { createLayer, createProject } from './project';
import type { Animation, Layer, Project } from './types';

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  project: () => Project;
}

const PALETTE = {
  ink: '#2b2d42',
  slate: '#8d99ae',
  paper: '#edf2f4',
  red: '#ef233c',
  crimson: '#d90429',
};

function entrance(animation: Animation, delay = 0): Partial<Layer> {
  return {
    animation,
    animationDuration: 0.55,
    animationDelay: delay,
    animationEasing: 'ease-out',
    exitDuration: 0.35,
  };
}

/** A small authoring helper keeps each template readable and every element editable. */
function scene(
  name: string,
  width: number,
  height: number,
  duration: number,
  background = PALETTE.paper,
) {
  const project: Project = {
    ...createProject(),
    name,
    width,
    height,
    duration,
    background,
    layers: [],
  };
  return {
    project,
    shape(
      name: string,
      x: number,
      y: number,
      width: number,
      height: number,
      fill: string,
      patch: Partial<Layer> = {},
    ) {
      project.layers.push(
        createLayer('shape', { name, x, y, width, height, fill, radius: 0, duration, ...patch }),
      );
    },
    text(
      name: string,
      text: string,
      x: number,
      y: number,
      width: number,
      size: number,
      fill = PALETTE.ink,
      patch: Partial<Layer> = {},
    ) {
      project.layers.push(
        createLayer('text', {
          name,
          text,
          x,
          y,
          width,
          height: size * 1.2 * text.split('\n').length,
          fontSize: size,
          fontWeight: 600,
          fill,
          duration,
          ...patch,
        }),
      );
    },
  };
}

/** Original, media-free layouts. Preview thumbnails render these exact project objects. */
export const TEMPLATES: ProjectTemplate[] = [
  {
    id: 'blank',
    name: 'Blank canvas',
    description: 'A clean widescreen frame.',
    project: () => scene('Untitled project', 1920, 1080, 12).project,
  },
  {
    id: 'story',
    name: 'Portrait title',
    description: 'A bold opening for a reel or story.',
    project: () => {
      const s = scene('Portrait title', 1080, 1920, 8);
      const mark = crypto.randomUUID();
      s.shape('Red upper panel', 0, 0, 1080, 760, PALETTE.red, entrance('fade'));
      s.shape('Offset circle', 625, 258, 510, 510, PALETTE.crimson, {
        radius: 255,
        groupId: mark,
        ...entrance('pop', 0.1),
      });
      s.shape('Light circle', 650, 176, 290, 290, PALETTE.paper, {
        radius: 145,
        groupId: mark,
        ...entrance('pop', 0.2),
      });
      s.text(
        'Series label',
        'YOUR NEXT CHAPTER',
        80,
        92,
        900,
        27,
        PALETTE.paper,
        entrance('fade', 0.1),
      );
      s.text(
        'Main title',
        'MAKE\nIT MATTER.',
        76,
        890,
        940,
        132,
        PALETTE.ink,
        entrance('rise', 0.25),
      );
      s.shape('Title underline', 82, 1248, 164, 10, PALETTE.red, entrance('slide', 0.35));
      s.text('Subtitle', 'One idea. A fresh perspective.', 82, 1338, 900, 39, PALETTE.ink, {
        fontWeight: 400,
        ...entrance('fade', 0.45),
      });
      s.text(
        'Footer',
        '01 / FRAME STUDIO',
        82,
        1750,
        900,
        24,
        PALETTE.slate,
        entrance('fade', 0.55),
      );
      return s.project;
    },
  },
  {
    id: 'presenter',
    name: 'Screen + camera',
    description: 'Two labeled spaces for your footage.',
    project: () => {
      const s = scene('Screen + camera', 1920, 1080, 12, PALETTE.ink);
      const screen = crypto.randomUUID();
      const camera = crypto.randomUUID();
      s.shape('Episode accent', 96, 88, 9, 66, PALETTE.red, entrance('rise'));
      s.text(
        'Episode title',
        'A clear idea, explained.',
        132,
        83,
        1540,
        56,
        PALETTE.paper,
        entrance('rise', 0.1),
      );
      s.shape('Screen placeholder', 96, 242, 1140, 640, PALETTE.paper, {
        radius: 24,
        groupId: screen,
        ...entrance('fade'),
      });
      s.text('Screen label', 'SCREEN RECORDING', 154, 492, 1030, 40, PALETTE.ink, {
        groupId: screen,
        ...entrance('fade', 0.15),
      });
      s.text(
        'Screen instruction',
        'Import a clip and place it here',
        154,
        562,
        1030,
        29,
        PALETTE.slate,
        { groupId: screen, fontWeight: 400, ...entrance('fade', 0.2) },
      );
      s.shape('Camera placeholder', 1280, 242, 544, 640, PALETTE.slate, {
        radius: 24,
        groupId: camera,
        ...entrance('fade', 0.1),
      });
      s.text('Camera label', 'CAMERA', 1342, 492, 430, 40, PALETTE.ink, {
        groupId: camera,
        ...entrance('fade', 0.2),
      });
      s.text('Camera instruction', 'Add your footage', 1342, 562, 430, 27, PALETTE.ink, {
        groupId: camera,
        fontWeight: 400,
        ...entrance('fade', 0.25),
      });
      s.text(
        'Episode number',
        '01 / THE EXPLAINER',
        99,
        966,
        1560,
        24,
        PALETTE.slate,
        entrance('fade', 0.3),
      );
      return s.project;
    },
  },
  {
    id: 'lower-third',
    name: 'Speaker lower third',
    description: 'An animated name and role over your clip.',
    project: () => {
      const s = scene('Speaker lower third', 1920, 1080, 8, PALETTE.ink);
      const nameplate = crypto.randomUUID();
      s.text('Footage placeholder', 'PLACE YOUR VIDEO HERE', 625, 440, 1100, 34, PALETTE.slate, {
        fontWeight: 400,
      });
      s.shape('Nameplate', 104, 786, 1040, 176, PALETTE.paper, {
        radius: 18,
        groupId: nameplate,
        start: 0.4,
        duration: 6.8,
        ...entrance('slide'),
      });
      s.shape('Nameplate accent', 104, 786, 14, 176, PALETTE.red, {
        groupId: nameplate,
        start: 0.4,
        duration: 6.8,
        ...entrance('slide'),
      });
      s.text('Speaker name', 'Alex Morgan', 155, 818, 890, 55, PALETTE.ink, {
        groupId: nameplate,
        start: 0.4,
        duration: 6.8,
        ...entrance('rise', 0.1),
      });
      s.text('Speaker role', 'Designer & storyteller', 158, 896, 890, 28, PALETTE.ink, {
        groupId: nameplate,
        fontWeight: 400,
        start: 0.4,
        duration: 6.8,
        ...entrance('fade', 0.2),
      });
      return s.project;
    },
  },
  {
    id: 'chapter',
    name: 'Tutorial chapter',
    description: 'A short divider between ideas.',
    project: () => {
      const s = scene('Tutorial chapter', 1920, 1080, 5);
      s.shape('Number panel', 0, 0, 580, 1080, PALETTE.red, entrance('slide'));
      s.text('Chapter number', '01', 100, 349, 450, 240, PALETTE.paper, entrance('pop', 0.1));
      s.text(
        'Chapter label',
        'THE FIRST STEP',
        702,
        298,
        1090,
        28,
        PALETTE.slate,
        entrance('fade', 0.15),
      );
      s.text(
        'Chapter title',
        'Start with\na clear idea.',
        696,
        390,
        1110,
        102,
        PALETTE.ink,
        entrance('rise', 0.2),
      );
      s.shape('Chapter rule', 704, 690, 86, 8, PALETTE.red, entrance('slide', 0.3));
      s.text(
        'Chapter subtitle',
        'A simple guide to getting started.',
        702,
        752,
        1110,
        32,
        PALETTE.ink,
        { fontWeight: 400, ...entrance('fade', 0.4) },
      );
      return s.project;
    },
  },
  {
    id: 'product',
    name: 'Product spotlight',
    description: 'A product space, headline, and call to action.',
    project: () => {
      const s = scene('Product spotlight', 1920, 1080, 10);
      const product = crypto.randomUUID();
      const cta = crypto.randomUUID();
      s.shape('Product panel', 1080, 0, 840, 1080, PALETTE.ink, entrance('fade'));
      s.shape('Product image placeholder', 1208, 232, 580, 580, PALETTE.slate, {
        radius: 42,
        groupId: product,
        ...entrance('pop', 0.2),
      });
      s.text('Product placeholder label', 'PRODUCT IMAGE', 1290, 471, 490, 32, PALETTE.ink, {
        groupId: product,
        ...entrance('fade', 0.35),
      });
      s.text('Product placeholder hint', 'Drop your image here', 1290, 530, 490, 25, PALETTE.ink, {
        fontWeight: 400,
        groupId: product,
        ...entrance('fade', 0.4),
      });
      s.text(
        'Launch label',
        'INTRODUCING / YOUR BRAND',
        112,
        143,
        890,
        25,
        PALETTE.slate,
        entrance('fade'),
      );
      s.text(
        'Product headline',
        'A little less.\nA lot better.',
        105,
        292,
        940,
        108,
        PALETTE.ink,
        entrance('rise', 0.15),
      );
      s.text('Product description', 'Made for the way you work.', 112, 602, 890, 34, PALETTE.ink, {
        fontWeight: 400,
        ...entrance('fade', 0.3),
      });
      s.shape('Call to action', 112, 754, 382, 86, PALETTE.red, {
        radius: 43,
        groupId: cta,
        ...entrance('rise', 0.4),
      });
      s.text('Call to action text', 'MEET THE NEW', 157, 782, 330, 27, PALETTE.paper, {
        groupId: cta,
        ...entrance('rise', 0.4),
      });
      return s.project;
    },
  },
  {
    id: 'announcement',
    name: 'Square announcement',
    description: 'A ready-to-edit launch or event post.',
    project: () => {
      const s = scene('Square announcement', 1080, 1080, 6, PALETTE.red);
      s.shape('Corner disc', 750, -210, 550, 550, PALETTE.crimson, {
        radius: 275,
        ...entrance('pop'),
      });
      s.text(
        'Announcement label',
        'SAVE THE DATE',
        80,
        90,
        900,
        26,
        PALETTE.paper,
        entrance('fade'),
      );
      s.text(
        'Announcement title',
        'SOMETHING\nGOOD IS\nCOMING.',
        74,
        247,
        940,
        112,
        PALETTE.paper,
        entrance('rise', 0.15),
      );
      s.shape('Date card', 80, 812, 920, 170, PALETTE.paper, {
        radius: 18,
        ...entrance('rise', 0.25),
      });
      s.text(
        'Announcement date',
        '24 OCT / 18:00',
        117,
        842,
        850,
        44,
        PALETTE.ink,
        entrance('fade', 0.4),
      );
      s.text('Announcement location', 'Your place. Your people.', 120, 914, 850, 25, PALETTE.ink, {
        fontWeight: 400,
        ...entrance('fade', 0.45),
      });
      return s.project;
    },
  },
];
