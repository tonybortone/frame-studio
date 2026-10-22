import { createLayer } from './project';
import type { Layer, Project } from './types';

export type ComponentCategory = 'Mockups' | 'Titles' | 'Callouts' | 'Social';
type Element = Pick<Layer, 'kind' | 'name' | 'x' | 'y' | 'width' | 'height' | 'fill' | 'radius'> &
  Partial<Pick<Layer, 'text' | 'fontSize' | 'fontWeight'>>;
export interface ComponentPreset {
  id: string;
  name: string;
  description: string;
  category: ComponentCategory;
  width: number;
  height: number;
  layers: readonly Element[];
}

const C = {
  ink: '#2b2d42',
  slate: '#8d99ae',
  paper: '#edf2f4',
  red: '#ef233c',
  crimson: '#d90429',
};
const shape = (
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  radius = 0,
): Element => ({ kind: 'shape', name, x, y, width, height, fill, radius });
const text = (
  name: string,
  value: string,
  x: number,
  y: number,
  width: number,
  size: number,
  fill = C.ink,
  weight = 500,
): Element => ({
  kind: 'text',
  name,
  text: value,
  x,
  y,
  width,
  height: size * 1.2 * value.split('\n').length,
  fill,
  radius: 0,
  fontSize: size,
  fontWeight: weight,
});
const dots = (x: number, y: number) =>
  [C.red, C.slate, C.paper].map((fill, i) =>
    shape(`Window dot ${i + 1}`, x + i * 21, y, 10, 10, fill, 5),
  );

/** Original, application-neutral designs. Every visible piece remains an ordinary editable layer. */
export const COMPONENT_PRESETS: readonly ComponentPreset[] = [
  {
    id: 'browser-window',
    name: 'Browser window',
    category: 'Mockups',
    description: 'A window, address bar, and editable page.',
    width: 840,
    height: 540,
    layers: [
      shape('Browser frame', 0, 0, 840, 540, C.slate, 26),
      shape('Browser page', 4, 64, 832, 472, C.paper, 22),
      shape('Browser toolbar', 4, 4, 832, 58, C.ink, 22),
      ...dots(26, 27),
      shape('Address field', 190, 17, 470, 32, C.paper, 10),
      text('Website address', 'your-website.com', 219, 24, 410, 16),
      text('Website label', 'YOUR SPACE ON THE INTERNET', 58, 111, 715, 15, C.slate, 600),
      text('Website headline', 'Make room for\nyour next big idea.', 54, 165, 735, 53, C.ink, 600),
      text(
        'Website description',
        'Something good starts with a little curiosity.',
        58,
        320,
        720,
        20,
      ),
      shape('Website button', 58, 392, 205, 60, C.red, 16),
      text('Website button label', 'Explore more', 83, 410, 168, 22, C.paper, 600),
      shape('Website accent', 659, 386, 91, 91, C.slate, 25),
    ],
  },
  {
    id: 'phone-screen',
    name: 'Phone screen',
    category: 'Mockups',
    description: 'A phone shell with a little app inside.',
    width: 350,
    height: 660,
    layers: [
      shape('Phone body', 0, 0, 350, 660, C.ink, 49),
      shape('Phone screen', 11, 11, 328, 638, C.paper, 40),
      shape('Phone camera island', 119, 23, 112, 27, C.ink, 14),
      text('Phone time', '9:41', 33, 29, 60, 14, C.ink, 600),
      text('App greeting', 'Hello, creator.', 31, 98, 290, 30, C.ink, 600),
      text('App subtitle', 'A little inspiration for today.', 33, 144, 287, 17, C.slate),
      shape('App feature card', 27, 204, 296, 255, C.red, 25),
      text('App feature label', 'YOUR NEXT CHAPTER', 47, 234, 261, 13, C.paper, 600),
      text('App feature title', 'Make\nsomething\nyours.', 45, 290, 264, 39, C.paper, 600),
      shape('App button', 27, 492, 296, 56, C.ink, 16),
      text('App button label', 'Start creating', 112, 509, 192, 18, C.paper, 600),
      text('App navigation', 'HOME       LIBRARY       YOU', 50, 587, 274, 12, C.slate, 600),
      shape('Home indicator', 121, 628, 108, 5, C.ink, 3),
    ],
  },
  {
    id: 'notification',
    name: 'Notification',
    category: 'Mockups',
    description: 'A friendly message for any moment.',
    width: 680,
    height: 174,
    layers: [
      shape('Notification border', 0, 0, 680, 174, C.slate, 28),
      shape('Notification card', 2, 2, 676, 170, C.paper, 26),
      shape('Notification app icon', 24, 28, 58, 58, C.red, 16),
      text('App monogram', 'F', 43, 41, 30, 32, C.paper, 600),
      text('Notification app', 'FRAME', 105, 28, 408, 15, C.slate, 600),
      text('Notification time', 'now', 603, 29, 58, 14, C.slate),
      text('Notification title', 'Your next idea is ready.', 105, 60, 543, 28, C.ink, 600),
      text('Notification message', 'A small reminder to make something good.', 105, 108, 548, 20),
    ],
  },
  {
    id: 'chat-conversation',
    name: 'Chat conversation',
    category: 'Mockups',
    description: 'Two messages, one simple conversation.',
    width: 680,
    height: 410,
    layers: [
      shape('Conversation card', 0, 0, 680, 410, C.paper, 30),
      shape('Chat avatar', 28, 25, 48, 48, C.slate, 24),
      text('Chat avatar initial', 'A', 43, 37, 26, 25, C.paper, 600),
      text('Chat name', 'Alex', 94, 29, 450, 23, C.ink, 600),
      text('Chat presence', 'A conversation worth sharing', 95, 60, 520, 15, C.slate),
      shape('Message divider', 28, 103, 624, 1, C.slate),
      shape('Incoming bubble', 28, 132, 461, 85, C.slate, 22),
      text('Incoming message', 'What if we kept it simple?', 51, 161, 426, 24, C.ink, 500),
      shape('Outgoing bubble', 162, 240, 490, 94, C.red, 22),
      text(
        'Outgoing message',
        'That is where the good stuff starts.',
        184,
        271,
        452,
        23,
        C.paper,
        500,
      ),
      text('Message receipt', 'Delivered', 565, 359, 94, 14, C.slate),
    ],
  },
  {
    id: 'terminal-window',
    name: 'Terminal window',
    category: 'Mockups',
    description: 'Editable code-style lines in a window.',
    width: 840,
    height: 440,
    layers: [
      shape('Terminal border', 0, 0, 840, 440, C.slate, 24),
      shape('Terminal body', 2, 2, 836, 436, C.ink, 22),
      ...dots(27, 26),
      text('Terminal title', 'A little experiment', 313, 22, 425, 17, C.paper),
      shape('Terminal rule', 2, 65, 836, 1, C.slate),
      text('Terminal command', '> make something-good', 34, 106, 760, 30, C.paper),
      text('Terminal progress', 'Creating a space for your ideas…', 34, 170, 768, 24, C.slate),
      text('Terminal success', 'Ready. Your story starts here.', 34, 237, 768, 28, C.paper),
      shape('Terminal cursor', 34, 325, 15, 29, C.red, 2),
    ],
  },
  {
    id: 'social-post',
    name: 'Social post',
    category: 'Social',
    description: 'An original post card for your story.',
    width: 600,
    height: 636,
    layers: [
      shape('Social post card', 0, 0, 600, 636, C.paper, 27),
      shape('Profile avatar', 28, 25, 52, 52, C.red, 26),
      text('Profile initial', 'A', 44, 39, 30, 27, C.paper, 600),
      text('Profile name', 'Alex Morgan', 96, 28, 462, 22, C.ink, 600),
      text('Profile handle', '@yourstory', 97, 59, 457, 15, C.slate),
      shape('Social artwork', 20, 100, 560, 348, C.ink, 18),
      shape('Artwork accent', 451, 125, 92, 92, C.red, 26),
      text('Artwork title', 'A little\nprogress,\nevery day.', 49, 163, 496, 52, C.paper, 600),
      text('Post caption', 'Small steps. Good things.', 30, 477, 540, 24, C.ink, 600),
      text('Post description', 'Make something worth sharing.', 30, 520, 540, 20),
      text('Post engagement', '128 likes     ·     12 conversations', 30, 579, 541, 16, C.slate),
    ],
  },
  {
    id: 'lower-third',
    name: 'Lower third',
    category: 'Titles',
    description: 'A name and role, ready to personalise.',
    width: 760,
    height: 186,
    layers: [
      shape('Name card', 0, 0, 760, 186, C.paper, 25),
      shape('Name accent', 0, 0, 13, 186, C.red, 6),
      text('Speaker name', 'Alex Morgan', 44, 37, 666, 46, C.ink, 600),
      text('Speaker role', 'Designer & storyteller', 47, 110, 664, 25, C.slate),
    ],
  },
  {
    id: 'quote-card',
    name: 'Quote card',
    category: 'Titles',
    description: 'Give a good thought a little space.',
    width: 800,
    height: 450,
    layers: [
      shape('Quote card', 0, 0, 800, 450, C.paper, 28),
      text('Quote mark', '“', 35, 18, 175, 118, C.red, 600),
      text(
        'Quote words',
        'Great things begin\nwith a little curiosity.',
        47,
        148,
        711,
        45,
        C.ink,
        600,
      ),
      shape('Quote rule', 50, 319, 54, 5, C.red, 2),
      text('Quote author', 'Alex Morgan', 50, 360, 698, 23, C.slate),
    ],
  },
  {
    id: 'keyboard-shortcut',
    name: 'Keyboard shortcut',
    category: 'Callouts',
    description: 'Teach a shortcut with separate keycaps.',
    width: 680,
    height: 176,
    layers: [
      shape('Shortcut card', 0, 0, 680, 176, C.ink, 28),
      text('Shortcut action', 'Make a copy', 30, 52, 355, 31, C.paper, 600),
      text('Shortcut description', 'A little faster, every time.', 31, 105, 364, 17, C.slate),
      shape('Command key shadow', 423, 39, 86, 101, C.slate, 17),
      shape('Command key', 423, 32, 86, 101, C.paper, 17),
      text('Command symbol', '⌘', 447, 62, 54, 38, C.ink, 500),
      text('Shortcut separator', '+', 526, 68, 26, 27, C.slate),
      shape('Letter key shadow', 566, 39, 86, 101, C.slate, 17),
      shape('Letter key', 566, 32, 86, 101, C.paper, 17),
      text('Letter key label', 'D', 592, 62, 50, 39, C.ink, 500),
    ],
  },
  {
    id: 'feature-callout',
    name: 'Feature callout',
    category: 'Callouts',
    description: 'Spotlight one thing that matters.',
    width: 680,
    height: 266,
    layers: [
      shape('Feature card', 0, 0, 680, 266, C.paper, 28),
      shape('Feature badge', 29, 28, 68, 68, C.red, 20),
      text('Feature number', '01', 43, 49, 49, 26, C.paper, 600),
      text('Feature label', 'A SMALL DETAIL', 120, 37, 527, 14, C.slate, 600),
      text('Feature title', 'A big difference.', 117, 68, 530, 36, C.ink, 600),
      text(
        'Feature description',
        'Keep the good stuff.\nMake everything else a little simpler.',
        31,
        147,
        616,
        24,
        C.ink,
        400,
      ),
      shape('Feature underline', 31, 230, 94, 5, C.red, 3),
    ],
  },
  {
    id: 'subscribe-card',
    name: 'Subscribe card',
    category: 'Social',
    description: 'A gentle invitation to follow along.',
    width: 760,
    height: 220,
    layers: [
      shape('Subscribe card', 0, 0, 760, 220, C.paper, 30),
      shape('Creator avatar', 28, 42, 89, 89, C.slate, 45),
      text('Creator initial', 'A', 57, 65, 51, 43, C.paper, 600),
      text('Creator name', 'Alex Morgan', 141, 48, 430, 30, C.ink, 600),
      text('Creator description', 'Ideas worth sticking around for.', 143, 99, 568, 21),
      text('Follow encouragement', 'Join the next chapter.', 29, 169, 420, 18, C.slate),
      shape('Subscribe button', 527, 148, 203, 49, C.red, 14),
      text('Subscribe button label', 'Follow along', 553, 163, 169, 19, C.paper, 600),
    ],
  },
  {
    id: 'stat-card',
    name: 'Stat card',
    category: 'Callouts',
    description: 'Make one useful number stand out.',
    width: 520,
    height: 400,
    layers: [
      shape('Statistic card', 0, 0, 520, 400, C.ink, 30),
      text('Statistic label', 'A LITTLE MOMENTUM', 33, 35, 459, 17, C.slate, 600),
      text('Statistic number', '84%', 26, 109, 462, 116, C.paper, 600),
      shape('Statistic progress track', 34, 274, 452, 8, C.slate, 4),
      shape('Statistic progress', 34, 274, 380, 8, C.red, 4),
      text('Statistic description', 'Closer to something good.', 34, 319, 454, 25, C.paper),
    ],
  },
];

/** Fit a fresh grouped copy at the playhead without changing the existing scene. */
export function instantiateComponent(
  preset: ComponentPreset,
  project: Project,
  time: number,
): Layer[] {
  if (!Number.isFinite(time) || !Number.isFinite(project.duration) || project.duration < 0.01)
    throw new Error('Choose a valid position on the timeline before adding a component.');
  if (project.layers.length + preset.layers.length > 1000)
    throw new Error(
      'This component would exceed the 1,000-layer limit. Remove a few layers first.',
    );
  if (
    !Number.isFinite(project.width) ||
    !Number.isFinite(project.height) ||
    project.width < 16 ||
    project.height < 16
  )
    throw new Error('Choose a canvas size of at least 16 × 16 before adding a component.');
  if (!Number.isFinite(project.fps) || project.fps < 1 || project.fps > 120)
    throw new Error('Choose a frame rate between 1 and 120 before adding a component.');
  const frame = Math.min(project.duration, Math.max(0.01, 1 / project.fps));
  const start = Math.min(Math.max(0, time), Math.max(0, project.duration - frame));
  const duration = Math.max(0.01, Math.min(5, project.duration - start));
  const scale = Math.min(
    1.5,
    (project.width * 0.84) / preset.width,
    (project.height * 0.76) / preset.height,
  );
  const x = (project.width - preset.width * scale) / 2;
  const y = (project.height - preset.height * scale) / 2;
  const groupId = crypto.randomUUID();
  return preset.layers.map((element) => {
    const width = Math.max(0.01, element.width * scale);
    const height = Math.max(0.01, element.height * scale);
    const fontSize =
      element.fontSize === undefined ? undefined : Math.max(1, element.fontSize * scale);
    let content = element.text;
    // At the 16px canvas minimum, keep the minimum 1px font inside its tiny editable box.
    if (fontSize && element.fontSize! * scale < 1 && content) {
      const columns = Math.max(1, Math.floor(width / fontSize));
      const rows = Math.max(1, Math.floor(height / (fontSize * 1.2)));
      content = content
        .split('\n')
        .slice(0, rows)
        .map((line) => line.slice(0, columns))
        .join('\n');
    }
    return createLayer(element.kind, {
      ...element,
      id: crypto.randomUUID(),
      groupId,
      x: x + element.x * scale,
      y: y + element.y * scale,
      width,
      height: Math.max(height, fontSize ? fontSize * 1.2 : 0),
      radius: element.radius * scale,
      ...(fontSize === undefined ? {} : { fontSize, text: content }),
      start,
      duration,
      animation: 'none',
      animationDuration: 0,
      animationDelay: 0,
      animationEasing: 'ease-out',
      exitDuration: 0,
    });
  });
}

/** Build previews once, with stable IDs, instead of generating new projects on every render. */
export const COMPONENT_PREVIEWS = COMPONENT_PRESETS.map((preset) => {
  const project: Project = {
    version: 1,
    id: `preview-${preset.id}`,
    name: preset.name,
    width: preset.width + 72,
    height: preset.height + 72,
    fps: 30,
    duration: 5,
    background: '#8d99ae',
    components: [],
    layers: preset.layers.map((element, index) =>
      createLayer(element.kind, {
        ...element,
        id: `preview-${preset.id}-${index}`,
        x: element.x + 36,
        y: element.y + 36,
        duration: 5,
      }),
    ),
  };
  return { preset, project };
});
