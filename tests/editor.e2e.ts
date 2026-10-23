import { readFile } from 'node:fs/promises';
import { expect, test, type Download, type Page } from '@playwright/test';
import { createLayer, createProject, parseProject } from '../src/core/project';
import type { Layer, LayerKind, Project } from '../src/core/types';
import { projectElementPoint } from '../src/core/element3d';

function editingMenu(page: Page, name: 'Design' | 'Motion' | 'Color' | 'Sound') {
  return page
    .getByRole('navigation', { name: 'Editing menus', exact: true })
    .getByRole('button', { name, exact: true });
}

async function downloadBytes(download: Download): Promise<Buffer> {
  const filename = await download.path();
  expect(filename, 'The browser should finish writing the download').not.toBeNull();
  return readFile(filename!);
}

async function saveProject(page: Page, projectName = 'A little idea') {
  await page.getByRole('banner').getByRole('button', { name: projectName, exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: /Save project/ }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe(`${projectName}.framestudio`);
  return parseProject((await downloadBytes(download)).toString('utf8'));
}

async function openProjectFixture(page: Page, project: Project) {
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'A little idea', exact: true })
    .click();
  const chosen = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open project', exact: true }).click();
  await (
    await chosen
  ).setFiles({
    name: `${project.name}.framestudio`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(
    page.getByRole('banner').getByRole('button', { name: project.name, exact: true }),
  ).toBeVisible();
}

async function exportedPixel(page: Page, x: number, y: number) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export your creation' });
  await dialog.getByRole('button', { name: 'PNG · current frame', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export PNG', exact: true }).click();
  const bytes = await downloadBytes(await downloaded);
  const pixel = await page.evaluate(
    async ({ bytes, x, y }) => {
      const bitmap = await createImageBitmap(
        new Blob([Uint8Array.from(bytes)], { type: 'image/png' }),
      );
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      return Array.from(context.getImageData(x, y, 1, 1).data);
    },
    { bytes: Array.from(bytes), x, y },
  );
  await dialog.getByRole('button', { name: 'Close export', exact: true }).click();
  return pixel;
}

async function jumpToTime(page: Page, value: string) {
  await page.getByRole('button', { name: 'Current timeline time', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Jump to time', exact: true });
  await input.fill(value);
  await input.press('Enter');
}

function depthFixture(): Project {
  return {
    ...createProject(),
    name: 'Layer order study',
    width: 256,
    height: 256,
    duration: 6,
    layers: [
      createLayer('shape', {
        name: 'Red square',
        x: 40,
        y: 40,
        width: 160,
        height: 160,
        radius: 0,
        fill: '#ef233c',
        duration: 6,
      }),
      createLayer('audio', {
        name: 'Sound bed',
        duration: 6,
        sourceDuration: 6,
        src: `data:audio/wav;base64,${toneWav(6).toString('base64')}`,
      }),
      createLayer('shape', {
        name: 'Slate square',
        x: 80,
        y: 80,
        width: 160,
        height: 160,
        radius: 0,
        fill: '#8d99ae',
        duration: 6,
      }),
    ],
    components: [],
  };
}

function toneWav(seconds = 3): Buffer {
  const sampleRate = 8000;
  const samples = Math.round(sampleRate * seconds);
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(samples * 2, 40);
  for (let sample = 0; sample < samples; sample++) {
    bytes.writeInt16LE(
      Math.round(Math.sin((sample / sampleRate) * 440 * Math.PI * 2) * 4000),
      44 + sample * 2,
    );
  }
  return bytes;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // IndexedDB is isolated by Playwright's fresh context for every test.
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
});

test('opens a rendered composition with editable timeline layers', async ({ page }) => {
  const canvas = page.getByLabel('Composition canvas');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('width', '1920');
  await expect(canvas).toHaveAttribute('height', '1080');
  await expect(page.getByRole('button', { name: /^Timeline clip / })).toHaveCount(6);
  await expect(editingMenu(page, 'Design')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByLabel('Project name')).not.toBeVisible();
  await editingMenu(page, 'Design').click();
  await expect(page.getByLabel('Project name')).toHaveValue('A little idea');
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  const alpha = await canvas.evaluate(
    (element) => (element as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 1, 1).data[3],
  );
  expect(alpha, 'The compositor should paint the canvas background').toBe(255);
});

test('edits text, duplicates it, undoes duplication, and saves the edited data', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Add text', exact: true }).click();
  await page.getByLabel('Text content').fill('Hello, Frame Studio.');
  await page.getByRole('spinbutton', { name: 'Size', exact: true }).fill('72');
  await expect(page.getByRole('button', { name: /^Timeline clip / })).toHaveCount(7);

  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Timeline clip / })).toHaveCount(8);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Timeline clip / })).toHaveCount(7);

  const saved = await saveProject(page);
  const titles = saved.layers.filter((layer) => layer.text === 'Hello, Frame Studio.');
  expect(titles).toHaveLength(1);
  expect(titles[0].fontSize).toBe(72);
  expect(saved.layers).toHaveLength(7);
});

test('groups separate layers and inserts an independent reusable component', async ({ page }) => {
  await page.getByRole('tab', { name: 'Layers', exact: true }).click();
  await page.getByRole('button', { name: 'Caption', exact: true }).click();
  await page.getByRole('button', { name: 'Red card', exact: true }).click({ modifiers: ['Shift'] });
  await expect(page.getByText('2 elements', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Group / ungroup selection', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Elements grouped');

  await page.getByRole('button', { name: 'Save component', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Save component' });
  await dialog.getByLabel('Component name').fill('Lower third');
  await dialog.getByRole('button', { name: 'Save component', exact: true }).click();
  await expect(dialog).not.toBeVisible();

  await page.getByRole('tab', { name: 'Files', exact: true }).click();
  await page.getByRole('button', { name: 'Components', exact: true }).click();
  await page.getByRole('button', { name: 'Yours', exact: true }).click();
  await page.getByRole('button', { name: /Lower third.*2 elements/ }).click();
  await expect(page.getByRole('button', { name: /^Timeline clip / })).toHaveCount(8);

  const saved = await saveProject(page);
  expect(saved.components).toHaveLength(1);
  const component = saved.components[0];
  expect(component.name).toBe('Lower third');
  expect(component.layers).toHaveLength(2);
  expect(component.layers[0].groupId).toBeTruthy();
  expect(component.layers[1].groupId).toBe(component.layers[0].groupId);
  const copies = saved.layers.slice(-2);
  expect(copies.map((layer) => layer.name)).toEqual(component.layers.map((layer) => layer.name));
  expect(copies[0].groupId).toBe(copies[1].groupId);
  expect(copies[0].groupId).not.toBe(component.layers[0].groupId);
  for (const layer of copies) {
    expect(component.layers.some((original) => original.id === layer.id)).toBe(false);
  }
});

test('changes aspect ratio and saves the portrait composition dimensions', async ({ page }) => {
  await page.getByRole('button', { name: 'Canvas size', exact: true }).click();
  const size = page.getByRole('dialog', { name: 'Canvas size settings', exact: true });
  await expect(
    size.getByRole('checkbox', { name: 'Fit contents to frame', exact: true }),
  ).toBeChecked();
  await size.getByRole('button', { name: 'Portrait 9:16', exact: true }).click();
  const canvas = page.getByLabel('Composition canvas');
  await expect(canvas).toHaveAttribute('width', '1080');
  await expect(canvas).toHaveAttribute('height', '1920');

  const saved = await saveProject(page);
  expect([saved.width, saved.height]).toEqual([1080, 1920]);
  expect(saved.layers).toHaveLength(6);
  const card = saved.layers.find((layer) => layer.name === 'Red card')!;
  expect(card.width).toBeCloseTo(286 * (1080 / 1920));
  expect(card.width / card.height).toBeCloseTo(1);
});

test('imports SVG pieces and edits one without changing the other', async ({ page }) => {
  const chosen = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await (
    await chosen
  ).setFiles({
    name: 'badge.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 140">' +
        '<g><rect id="Badge background" x="10" y="10" width="200" height="100" fill="#ee7755"/>' +
        '<circle id="Badge dot" cx="180" cy="60" r="20" fill="#225544"/></g></svg>',
    ),
  });
  await expect(page.getByRole('status')).toContainText('1 file imported');
  await expect(page.getByRole('button', { name: /^Timeline clip / })).toHaveCount(8);
  await page.getByRole('tab', { name: 'Layers', exact: true }).click();
  await page.getByRole('button', { name: 'Badge dot', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'X', exact: true }).fill('500');
  await page.getByLabel('Element color', { exact: true }).fill('#112233');

  const saved = await saveProject(page);
  const pieces = saved.layers.filter((layer) => layer.kind === 'svg');
  expect(pieces).toHaveLength(2);
  const background = pieces.find((layer) => layer.name === 'Badge background')!;
  const dot = pieces.find((layer) => layer.name === 'Badge dot')!;
  expect(background.fill).toBe('#ee7755');
  expect(background.x).toBe(10);
  expect(dot.fill).toBe('#112233');
  expect(dot.x).toBe(500);
  expect(dot.groupId).toBe(background.groupId);
  expect(pieces.every((layer) => Boolean(layer.path) && !layer.src)).toBe(true);
});

test('rejects an unsupported project version and keeps the current composition', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'A little idea', exact: true }).click();
  const chosen = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open project', exact: true }).click();
  await (
    await chosen
  ).setFiles({
    name: 'unsupported.framestudio',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 999 })),
  });
  await expect(page.getByRole('status')).toContainText('This project version is not supported');
  await expect(page.getByRole('button', { name: /^Timeline clip / })).toHaveCount(6);
  await editingMenu(page, 'Design').click();
  await expect(page.getByLabel('Project name')).toHaveValue('A little idea');
  expect((await saveProject(page)).version).toBe(1);
});

test('exports a PNG with the actual composition dimensions', async ({ page }) => {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export your creation' });
  await dialog.getByRole('button', { name: 'PNG · current frame', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export PNG', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('A little idea.png');
  const bytes = await downloadBytes(download);
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(bytes.toString('ascii', 12, 16)).toBe('IHDR');
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1920, 1080]);
  expect(bytes.byteLength).toBeGreaterThan(1_000);
  await expect(dialog.getByRole('status')).toHaveText('Your export is ready.');
});

test('loads a paused video at its source offset in both canvas and 3D previews', async ({
  page,
}) => {
  // Synthetic VP8 fixture: the first second is red; the second is blue.
  const video = await readFile(new URL('./fixtures/seek-colors.webm', import.meta.url));
  const fixture: Project = {
    ...createProject(),
    name: 'Paused source offset',
    width: 64,
    height: 64,
    duration: 0.8,
    layers: [
      createLayer('video', {
        name: 'Blue source frame',
        x: 0,
        y: 0,
        width: 64,
        height: 64,
        radius: 0,
        duration: 0.8,
        mediaOffset: 1,
        sourceDuration: 2,
        src: `data:video/webm;base64,${video.toString('base64')}`,
      }),
    ],
    components: [],
  };
  await openProjectFixture(page, fixture);
  const position = page.getByRole('slider', { name: 'Timeline position', exact: true });
  await expect(position).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();

  const canvas = page.getByLabel('Composition canvas');
  await expect(canvas).toHaveAttribute('width', '64');
  const isBlue = (element: HTMLElement | SVGElement) => {
    const context = (element as HTMLCanvasElement).getContext('2d')!;
    const [red, green, blue, alpha] = context.getImageData(32, 32, 1, 1).data;
    return red < 60 && green < 60 && blue > 180 && alpha === 255;
  };
  // Readiness must seek and repaint by itself; do not play or move either playhead.
  await expect.poll(() => canvas.evaluate(isBlue)).toBe(true);
  await page.getByRole('button', { name: '3D layers', exact: true }).click();
  const plane = page
    .getByRole('region', { name: '3D layer view', exact: true })
    .locator('[data-depth-plane] canvas');
  await expect(plane).toHaveCount(1);
  await expect.poll(() => plane.evaluate(isBlue)).toBe(true);
  await expect(position).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});

test('preserves unreadable autosaved work instead of replacing it with the starter scene', async ({
  page,
}) => {
  const unreadable = '{"version":1,"name":"An unfinished saved project';
  await page.evaluate(async (value) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('frame-studio', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('projects', 'readwrite');
        transaction.objectStore('projects').put(value, 'current');
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error);
        };
      };
    });
  }, unreadable);

  await page.reload();
  await expect(
    page.getByText('Autosave paused — existing save preserved; save a project file', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled();
  // Editing the fallback scene must also leave the unreadable stored record intact.
  await page.getByRole('button', { name: 'Add text', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Timeline clip / })).toHaveCount(7);
  // Wait beyond the 800 ms autosave debounce to detect a delayed destructive write.
  await page.waitForTimeout(1_200);
  const stored = await page.evaluate(
    () =>
      new Promise<unknown>((resolve, reject) => {
        const request = indexedDB.open('frame-studio', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('projects');
          const read = transaction.objectStore('projects').get('current');
          read.onsuccess = () => resolve(read.result);
          read.onerror = () => reject(read.error);
          transaction.oncomplete = () => db.close();
        };
      }),
  );
  expect(stored).toBe(unreadable);
  await expect(
    page.getByText('Autosave paused — existing save preserved; save a project file', {
      exact: true,
    }),
  ).toBeVisible();
});

test('grouping stale selection after undo is harmless and selecting a clip preserves redo', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const chosen = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await (
    await chosen
  ).setFiles({
    name: 'undo-regression.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect id="Undo rectangle" width="80" height="80" fill="#aa5500"/><circle id="Undo circle" cx="150" cy="50" r="30" fill="#0055aa"/></svg>',
    ),
  });
  await expect(page.getByRole('button', { name: /^Timeline clip / })).toHaveCount(8);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Timeline clip / })).toHaveCount(6);

  // Undo removed the two imported objects. Keyboard grouping must handle stale IDs
  // and then an empty selection without a crash or an unnecessary history entry.
  await page.keyboard.press('ControlOrMeta+g');
  await expect(
    page.getByRole('toolbar', { name: 'Canvas tools' }).getByRole('button', {
      name: 'Group selection',
      exact: true,
      includeHidden: true,
    }),
  ).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+g');
  await expect(page.getByRole('status')).toContainText('Select two or more layers to group them.');
  await page.getByRole('button', { name: 'Timeline clip Caption', exact: true }).click();
  await expect(page.getByLabel('Text content')).toHaveValue('A space for your next good thing.');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Timeline clip / })).toHaveCount(8);
  await expect(
    page.getByRole('button', { name: 'Timeline clip Undo rectangle', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Timeline clip Undo circle', exact: true }),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('resizes a shape from its canvas handle and undoes the entire gesture', async ({ page }) => {
  await page.getByRole('button', { name: 'Shapes & SVG', exact: true }).click();
  await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
  const width = Number(await page.getByRole('spinbutton', { name: 'W', exact: true }).inputValue());
  const height = Number(
    await page.getByRole('spinbutton', { name: 'H', exact: true }).inputValue(),
  );
  const handle = page.getByRole('button', {
    name: 'Resize Rectangle from bottom right',
    exact: true,
  });
  await expect(handle).toBeVisible();
  const bounds = await handle.boundingBox();
  expect(bounds).not.toBeNull();
  const startX = bounds!.x + bounds!.width / 2;
  const startY = bounds!.y + bounds!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 30, startY + 20, { steps: 5 });
  await page.mouse.up();

  const resized = (await saveProject(page)).layers.find((layer) => layer.name === 'Rectangle')!;
  expect(resized.width).toBeGreaterThan(width);
  expect(resized.height).toBeGreaterThan(height);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const restored = (await saveProject(page)).layers.find((layer) => layer.id === resized.id)!;
  expect(restored.width).toBe(width);
  expect(restored.height).toBe(height);
  await expect(page.getByRole('button', { name: /^Timeline clip / })).toHaveCount(7);
});

test('pans the board without editing the project and fits it back into view', async ({ page }) => {
  const originalProject = await saveProject(page);
  const canvas = page.getByLabel('Composition canvas');
  const originalBounds = await canvas.boundingBox();
  expect(originalBounds).not.toBeNull();
  await page.getByRole('button', { name: 'Hand tool', exact: true }).click();
  const startX = originalBounds!.x + originalBounds!.width / 2;
  const startY = originalBounds!.y + originalBounds!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 90, startY + 55, { steps: 5 });
  await page.mouse.up();

  await expect
    .poll(async () => (await canvas.boundingBox())!.x)
    .toBeCloseTo(originalBounds!.x + 90, 1);
  await expect
    .poll(async () => (await canvas.boundingBox())!.y)
    .toBeCloseTo(originalBounds!.y + 55, 1);
  await expect(editingMenu(page, 'Design')).toHaveAttribute('aria-pressed', 'false');
  expect(await saveProject(page)).toEqual(originalProject);

  await page.getByRole('button', { name: 'Fit canvas', exact: true }).click();
  await expect.poll(async () => (await canvas.boundingBox())!.x).toBeCloseTo(originalBounds!.x, 1);
  await expect.poll(async () => (await canvas.boundingBox())!.y).toBeCloseTo(originalBounds!.y, 1);
  await expect
    .poll(async () => (await canvas.boundingBox())!.width)
    .toBeCloseTo(originalBounds!.width, 1);
});

test('organizes media and creation tools with accurate counts without changing the scene', async ({
  page,
}) => {
  const original = await saveProject(page);
  const library = page.getByRole('complementary', { name: 'Library' });
  const media = library.getByRole('region', { name: 'Media files', exact: true });
  const create = library.getByRole('region', { name: 'Create', exact: true });
  for (const name of ['Videos', 'Audio', 'Images']) {
    const folder = media.getByRole('button', { name, exact: true });
    await expect(folder).toBeVisible();
    await expect(folder.locator('.fs-library-count')).toHaveText('0');
    await expect(create.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  for (const [name, count] of [
    ['Text', '4'],
    ['Shapes & SVG', '2'],
    ['Components', '12'],
  ]) {
    const folder = create.getByRole('button', { name, exact: true });
    await expect(folder).toBeVisible();
    await expect(folder.locator('.fs-library-count')).toHaveText(count);
    await expect(media.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  await media.getByRole('button', { name: 'Videos', exact: true }).click();
  await expect(library.getByRole('button', { name: 'Import videos', exact: true })).toBeVisible();
  await expect(
    library.getByText('Import video clips or screen recordings to start editing.', { exact: true }),
  ).toBeVisible();
  await library.getByRole('button', { name: 'Back to files', exact: true }).click();
  await library.getByRole('button', { name: 'Shapes & SVG', exact: true }).click();
  await expect(library.getByRole('button', { name: 'Rectangle', exact: true })).toBeVisible();
  await library.getByRole('button', { name: 'Back to files', exact: true }).click();
  await library.getByRole('button', { name: 'Text', exact: true }).click();
  await expect(library.getByRole('button', { name: 'Add a heading', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Timeline clip / })).toHaveCount(6);
  expect(await saveProject(page)).toEqual(original);
});

test('opening properties keeps the board stable during a direct layer drag', async ({ page }) => {
  const original = await saveProject(page);
  const caption = original.layers.find((layer) => layer.name === 'Caption')!;
  const canvas = page.getByLabel('Composition canvas');
  const before = (await canvas.boundingBox())!;
  const scale = before.width / original.width;
  const x = before.x + (caption.x + 100) * scale;
  const y = before.y + (caption.y + 30) * scale;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await expect(page.getByLabel('Text content')).toHaveValue(caption.text!);
  const during = (await canvas.boundingBox())!;
  expect(during).toEqual(before);
  await page.mouse.move(x + 36, y + 18, { steps: 5 });
  await page.mouse.up();
  const moved = (await saveProject(page)).layers.find((layer) => layer.id === caption.id)!;
  expect(moved.x).toBe(Math.round(caption.x + 36 / scale));
  expect(moved.y).toBe(Math.round(caption.y + 18 / scale));
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const restored = (await saveProject(page)).layers.find((layer) => layer.id === caption.id)!;
  expect([restored.x, restored.y]).toEqual([caption.x, caption.y]);
});

test('timeline transport seeks, advances during playback, and pauses without editing the project', async ({
  page,
}) => {
  const original = await saveProject(page);
  const transport = page
    .getByRole('toolbar', { name: 'Timeline controls', exact: true })
    .getByRole('group', { name: 'Timeline playback', exact: true });
  await expect(transport).toBeVisible();
  const position = page.getByRole('slider', { name: 'Timeline position', exact: true });
  const currentTime = async () => Number(await position.getAttribute('aria-valuenow'));
  await expect(page.getByRole('slider', { name: 'Preview position', exact: true })).toHaveCount(0);
  const lastFrame = original.duration - 1 / original.fps;

  // The ruler is the single seek control; Shift steps seconds, arrows step frames.
  await position.focus();
  await position.press('Home');
  for (let step = 0; step < 6; step++) await position.press('Shift+ArrowRight');
  await expect.poll(currentTime).toBeCloseTo(original.duration / 2, 1);
  await position.press('ArrowRight');
  await expect.poll(currentTime).toBeCloseTo(original.duration / 2 + 1 / original.fps, 4);
  const seekedTime = await currentTime();

  await transport.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(transport.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect.poll(currentTime).toBeGreaterThan(seekedTime + 0.15);
  await transport.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(transport.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  const pausedTime = await currentTime();
  // Observe several animation frames after pausing to catch a clock that keeps running.
  await page.waitForTimeout(300);
  expect(await currentTime()).toBeCloseTo(pausedTime, 4);

  // Space must activate focused transport buttons, rather than the global play shortcut.
  await transport.getByRole('button', { name: 'Go to start', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect.poll(currentTime).toBe(0);
  await expect(transport.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await transport.getByRole('button', { name: 'Go to end', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect.poll(currentTime).toBeCloseTo(lastFrame, 2);
  await expect(transport.getByRole('button', { name: 'Play', exact: true })).toBeVisible();

  // A global Space press at the last frame must restart playback like the Play button.
  await page.getByRole('region', { name: 'Canvas board', exact: true }).focus();
  await page.mouse.move(10, 10); // Space over the board is reserved for panning.
  await page.keyboard.press('Space');
  await expect(transport.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect.poll(currentTime).toBeGreaterThan(0.05);
  expect(await currentTime()).toBeLessThan(original.duration / 2);
  await page.keyboard.press('Space');
  await expect(transport.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  const keyboardPausedTime = await currentTime();
  await page.waitForTimeout(150);
  expect(await currentTime()).toBeCloseTo(keyboardPausedTime, 4);

  await transport.getByRole('button', { name: 'Go to start', exact: true }).click();
  const rulerBounds = await position.boundingBox();
  expect(rulerBounds).not.toBeNull();
  await position.click({ position: { x: rulerBounds!.width - 2, y: rulerBounds!.height / 2 } });
  await expect.poll(currentTime).toBeCloseTo(lastFrame, 2);
  expect(await saveProject(page)).toEqual(original);
});

test('keeps the Files button clear of the creation toolbar in a small window with multiple selections', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.getByRole('tab', { name: 'Layers', exact: true }).click();
  await page.getByRole('button', { name: 'Caption', exact: true }).click();
  await page.getByRole('button', { name: 'Red card', exact: true }).click({ modifiers: ['Shift'] });
  await expect(page.getByText('2 elements', { exact: true })).toBeVisible();

  const files = page.getByRole('button', { name: 'Toggle files panel', exact: true });
  const toolbar = page.getByRole('toolbar', { name: 'Canvas tools', exact: true });
  const filesBounds = await files.boundingBox();
  const toolbarBounds = await toolbar.boundingBox();
  expect(filesBounds).not.toBeNull();
  expect(toolbarBounds).not.toBeNull();
  expect(toolbarBounds!.y).toBeGreaterThanOrEqual(filesBounds!.y + filesBounds!.height);

  // Verify the visible control remains directly clickable, without forcing past an overlay.
  await files.click();
  await expect(page.getByRole('complementary', { name: 'Library', exact: true })).not.toBeVisible();
});

test('applies custom canvas dimensions without moving contents and restores everything with undo', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  const original = await saveProject(page);
  await page.getByRole('button', { name: 'Canvas size', exact: true }).click();
  const size = page.getByRole('dialog', { name: 'Canvas size settings', exact: true });
  await size.getByRole('spinbutton', { name: 'Canvas width', exact: true }).fill('1440');
  await size.getByRole('spinbutton', { name: 'Canvas height', exact: true }).fill('900');
  await size.getByRole('checkbox', { name: 'Fit contents to frame', exact: true }).uncheck();
  await expect(size.getByRole('button', { name: /^Apply size/ })).toBeInViewport();
  await size.getByRole('button', { name: /^Apply size/ }).click();
  await expect(size).not.toBeVisible();
  await expect(page.getByLabel('Composition canvas')).toHaveAttribute('width', '1440');
  await expect(page.getByLabel('Composition canvas')).toHaveAttribute('height', '900');
  const resized = await saveProject(page);
  expect([resized.width, resized.height]).toEqual([1440, 900]);
  expect(resized.layers).toEqual(original.layers);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page)).toEqual(original);
});

test('previews editable templates, applies a chapter layout, and restores the original scene', async ({
  page,
}) => {
  const original = await saveProject(page);
  await page.getByRole('tab', { name: 'Templates', exact: true }).click();
  const library = page.getByRole('complementary', { name: 'Library' });
  await expect(library.getByRole('button', { name: /^Use template:/ })).toHaveCount(7);
  const preview = library.getByRole('img', { name: 'Preview of Tutorial chapter', exact: true });
  await expect(preview).toBeAttached();
  const colors = await preview.evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext('2d')!;
    return {
      left: Array.from(context.getImageData(3, 3, 1, 1).data),
      right: Array.from(context.getImageData(canvas.width - 4, 3, 1, 1).data),
    };
  });
  // The real template has a red chapter panel and a light composition background.
  expect(colors.left).toEqual([239, 35, 60, 255]);
  expect(colors.right).toEqual([237, 242, 244, 255]);
  await library
    .getByRole('button', { name: 'Use template: Tutorial chapter', exact: true })
    .click();
  const chapter = await saveProject(page, 'Tutorial chapter');
  expect(chapter.duration).toBe(5);
  expect([chapter.width, chapter.height]).toEqual([1920, 1080]);
  expect(chapter.layers.find((layer) => layer.name === 'Chapter title')?.text).toBe(
    'Start with\na clear idea.',
  );
  expect(chapter.layers.some((layer) => (layer.animationDelay ?? 0) > 0)).toBe(true);
  expect(chapter.layers.some((layer) => (layer.exitDuration ?? 0) > 0)).toBe(true);
  expect(chapter.layers.every((layer) => ['shape', 'text'].includes(layer.kind))).toBe(true);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page)).toEqual(original);
});

test('edits motion in the timeline, undoes a change, and saves the timing controls', async ({
  page,
}) => {
  const original = await saveProject(page);
  const caption = original.layers.find((layer) => layer.name === 'Caption')!;
  await page.getByRole('button', { name: 'Edit motion for Caption', exact: true }).click();
  const motion = page.getByRole('group', { name: 'Motion editor for Caption', exact: true });
  const duration = motion.getByRole('spinbutton', {
    name: 'Animation duration for Caption',
    exact: true,
  });
  await duration.fill('1.2');
  expect(
    (await saveProject(page)).layers.find((layer) => layer.id === caption.id)?.animationDuration,
  ).toBe(1.2);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page)).toEqual(original);
  await motion
    .getByRole('combobox', { name: 'Motion preset for Caption', exact: true })
    .selectOption('slide');
  await motion
    .getByRole('spinbutton', { name: 'Animation delay for Caption', exact: true })
    .fill('0.4');
  await duration.fill('1.2');
  await motion
    .getByRole('combobox', { name: 'Animation easing for Caption', exact: true })
    .selectOption('linear');
  await motion.getByRole('spinbutton', { name: 'Exit fade for Caption', exact: true }).fill('0.5');
  const saved = await saveProject(page);
  expect(saved.layers.find((layer) => layer.id === caption.id)).toMatchObject({
    animation: 'slide',
    animationDelay: 0.4,
    animationDuration: 1.2,
    animationEasing: 'linear',
    exitDuration: 0.5,
  });
  expect(saved.layers.filter((layer) => layer.id !== caption.id)).toEqual(
    original.layers.filter((layer) => layer.id !== caption.id),
  );
  await expect(
    motion.getByRole('button', { name: 'Move entrance for Caption', exact: true }),
  ).toBeAttached();
  await expect(
    motion.getByRole('button', { name: 'Resize exit fade for Caption', exact: true }),
  ).toBeAttached();
});

test('separates imported audio from visuals and saves real volume, fade, and mute edits', async ({
  page,
}) => {
  const original = await saveProject(page);
  const chosen = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await (await chosen).setFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: toneWav() });
  await expect(page.getByRole('status')).toContainText('1 file imported');
  const visuals = page.getByRole('group', { name: 'Visual tracks', exact: true });
  const audio = page.getByRole('group', { name: 'Audio tracks', exact: true });
  await expect(visuals.getByRole('button', { name: /^Timeline clip / })).toHaveCount(6);
  await expect(audio.getByRole('button', { name: /^Timeline clip / })).toHaveCount(1);
  await expect(
    audio.getByRole('button', { name: 'Timeline clip tone', exact: true }),
  ).toBeAttached();
  await page.getByRole('button', { name: 'Edit audio for tone', exact: true }).click();
  const sound = page.getByRole('group', { name: 'Audio editor for tone', exact: true });
  await sound.getByRole('spinbutton', { name: 'Audio volume for tone', exact: true }).fill('35');
  await sound.getByRole('spinbutton', { name: 'Audio fade in for tone', exact: true }).fill('0.4');
  await sound.getByRole('spinbutton', { name: 'Audio fade out for tone', exact: true }).fill('0.6');
  const mute = sound.getByRole('button', { name: 'Mute audio for tone', exact: true });
  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  const saved = await saveProject(page);
  const clip = saved.layers.find((layer) => layer.name === 'tone')!;
  expect(clip).toMatchObject({
    kind: 'audio',
    volume: 0.35,
    audioFadeIn: 0.4,
    audioFadeOut: 0.6,
    muted: true,
  });
  expect(clip.duration).toBeCloseTo(3, 2);
  expect(clip.sourceDuration).toBeCloseTo(3, 2);
  expect(clip.src).toMatch(/^data:audio\/wav;base64,/);
  expect(saved.layers.filter((layer) => layer.kind !== 'audio')).toEqual(original.layers);
  const inspector = page.getByRole('complementary', { name: 'Properties', exact: true });
  await expect(inspector.getByRole('spinbutton', { name: 'X', exact: true })).toHaveCount(0);
  await expect(inspector.getByRole('slider', { name: 'Opacity', exact: true })).toHaveCount(0);
  await expect(editingMenu(page, 'Color')).toBeDisabled();
  await editingMenu(page, 'Sound').click();
  await expect(editingMenu(page, 'Sound')).toHaveAttribute('aria-pressed', 'true');
  await expect(
    inspector.getByRole('heading', { name: 'Sound', exact: true, level: 2 }),
  ).toBeVisible();
  await expect(inspector.getByRole('slider', { name: 'Volume', exact: true })).toHaveValue('0.35');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const unmuted = (await saveProject(page)).layers.find((layer) => layer.id === clip.id)!;
  expect(unmuted.muted).toBe(false);
  expect([unmuted.audioFadeIn, unmuted.audioFadeOut, unmuted.volume]).toEqual([0.4, 0.6, 0.35]);
});

test('resizes the timeline with keyboard and pointer without editing the project', async ({
  page,
}) => {
  const original = await saveProject(page);
  const separator = page.getByRole('separator', { name: 'Timeline height', exact: true });
  const initial = Number(await separator.getAttribute('aria-valuenow'));
  const section = page.locator('.timeline-section');
  const originalBounds = (await section.boundingBox())!;
  await separator.focus();
  await separator.press('ArrowUp');
  await expect(separator).toHaveAttribute('aria-valuenow', String(initial + 20));
  await expect
    .poll(async () => (await section.boundingBox())!.height)
    .toBeCloseTo(originalBounds.height + 20, 1);
  const grip = (await separator.boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 - 40, { steps: 4 });
  await page.mouse.up();
  await expect(separator).toHaveAttribute('aria-valuenow', String(initial + 60));
  expect(await saveProject(page)).toEqual(original);
});

test('rejects a frame that would invalidate fitted elements and allows an unscaled tiny frame', async ({
  page,
}) => {
  const original = await saveProject(page);
  const canvas = page.getByLabel('Composition canvas');
  await page.getByRole('button', { name: 'Canvas size', exact: true }).click();
  const size = page.getByRole('dialog', { name: 'Canvas size settings', exact: true });
  await size.getByRole('spinbutton', { name: 'Canvas width', exact: true }).fill('16');
  await size.getByRole('spinbutton', { name: 'Canvas height', exact: true }).fill('16');
  await size.getByRole('checkbox', { name: 'Fit contents to frame', exact: true }).check();
  await size.getByRole('button', { name: /^Apply size/ }).click();
  await expect(size).toBeVisible();
  await expect(size.getByRole('alert')).toContainText('Some elements cannot fit');
  await expect(canvas).toHaveAttribute('width', '1920');
  await expect(canvas).toHaveAttribute('height', '1080');
  // Saving through the normal menu closes the popover and verifies the unchanged project data.
  expect(await saveProject(page)).toEqual(original);

  await page.getByRole('button', { name: 'Canvas size', exact: true }).click();
  await size.getByRole('spinbutton', { name: 'Canvas width', exact: true }).fill('16');
  await size.getByRole('spinbutton', { name: 'Canvas height', exact: true }).fill('16');
  await size.getByRole('checkbox', { name: 'Fit contents to frame', exact: true }).uncheck();
  await size.getByRole('button', { name: /^Apply size/ }).click();
  await expect(size).not.toBeVisible();
  await expect(canvas).toHaveAttribute('width', '16');
  await expect(canvas).toHaveAttribute('height', '16');
  const tiny = await saveProject(page);
  expect([tiny.width, tiny.height]).toEqual([16, 16]);
  expect(tiny.layers).toEqual(original.layers);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page)).toEqual(original);
});

test('keeps locked audio mute unchanged until the layer is unlocked', async ({ page }) => {
  const chosen = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await (await chosen).setFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: toneWav() });
  await expect(page.getByRole('status')).toContainText('1 file imported');
  await page.getByRole('button', { name: 'Edit audio for tone', exact: true }).click();
  const sound = page.getByRole('group', { name: 'Audio editor for tone', exact: true });
  const mute = sound.getByRole('button', { name: 'Mute audio for tone', exact: true });
  const inspector = page.getByRole('complementary', { name: 'Properties', exact: true });
  const lock = inspector.getByRole('button', { name: 'Lock selection', exact: true });
  await lock.click();
  await expect(mute).toBeDisabled();
  const locked = await saveProject(page);
  const clip = locked.layers.find((layer) => layer.name === 'tone')!;
  expect(clip).toMatchObject({ locked: true, muted: false });
  // Disabled controls must not mutate saved state, including a dispatched click.
  await mute.dispatchEvent('click');
  expect(await saveProject(page)).toEqual(locked);
  await lock.click();
  await expect(mute).toBeEnabled();
  await mute.click();
  expect((await saveProject(page)).layers.find((layer) => layer.id === clip.id)).toMatchObject({
    locked: false,
    muted: true,
  });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await saveProject(page)).layers.find((layer) => layer.id === clip.id)).toMatchObject({
    locked: false,
    muted: false,
  });
});

test('moves a clamped entrance without stretching it and undoes the whole drag once', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Edit motion for Caption', exact: true }).click();
  const inspector = page.getByRole('complementary', { name: 'Properties', exact: true });
  await inspector.getByRole('spinbutton', { name: 'Length (s)', exact: true }).fill('2');
  const motion = page.getByRole('group', { name: 'Motion editor for Caption', exact: true });
  const duration = motion.getByRole('spinbutton', {
    name: 'Animation duration for Caption',
    exact: true,
  });
  const delay = motion.getByRole('spinbutton', {
    name: 'Animation delay for Caption',
    exact: true,
  });
  await duration.fill('1');
  await delay.fill('1.5');
  await expect(duration).toHaveValue('0.5');
  const before = await saveProject(page);
  const original = before.layers.find((layer) => layer.name === 'Caption')!;
  expect(original.animationDuration).toBe(1);
  const entrance = motion.getByRole('button', { name: 'Move entrance for Caption', exact: true });
  await entrance.hover();
  const bounds = (await entrance.boundingBox())!;
  const pixels = Number(
    await page.getByRole('slider', { name: 'Timeline zoom', exact: true }).inputValue(),
  );
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - pixels * 0.5, y, { steps: 4 });
  await page.mouse.up();
  await expect(delay).toHaveValue('1');
  await expect(duration).toHaveValue('0.5');
  expect((await entrance.boundingBox())!.width).toBeCloseTo(bounds.width, 1);
  const moved = await saveProject(page);
  expect(moved.layers.find((layer) => layer.id === original.id)).toMatchObject({
    animationDelay: 1,
    animationDuration: 0.5,
  });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page)).toEqual(before);
});

test('orbits and spaces the 3D layer view without editing the saved composition', async ({
  page,
}) => {
  const fixture = depthFixture();
  await openProjectFixture(page, fixture);
  const original = await saveProject(page, fixture.name);
  await page.getByRole('button', { name: '3D layers', exact: true }).click();
  const view = page.getByRole('region', { name: '3D layer view', exact: true });
  await expect(view).toBeVisible();
  await expect(view.locator('[data-depth-plane]')).toHaveCount(2);
  const plane = view.locator(`[data-depth-plane][data-layer-id="${fixture.layers[0].id}"]`);
  await page.getByRole('button', { name: 'Front view', exact: true }).click();
  const front = (await plane.boundingBox())!;

  // Alt-drag orbits even over content; ordinary layer drags now edit position.
  await page.mouse.move(front.x + front.width / 2, front.y + front.height / 2);
  await page.keyboard.down('Alt');
  await page.mouse.down();
  await page.mouse.move(front.x + front.width / 2 + 65, front.y + front.height / 2 - 35, {
    steps: 5,
  });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect.poll(async () => (await plane.boundingBox())!.x).not.toBeCloseTo(front.x, 0);
  await view.focus();
  await view.press('ArrowRight');
  const orbited = (await plane.boundingBox())!;

  const spacing = page.getByRole('slider', { name: 'Layer spacing', exact: true });
  await spacing.focus();
  await spacing.press('End');
  await expect.poll(async () => (await plane.boundingBox())!.x).not.toBeCloseTo(orbited.x, 0);
  const spaced = (await plane.boundingBox())!;
  const zoom = page.getByRole('slider', { name: '3D zoom', exact: true });
  await zoom.focus();
  await zoom.press('Home');
  await expect.poll(async () => (await plane.boundingBox())!.width).toBeLessThan(spaced.width);

  for (const [preset, mode] of [
    ['Back view', 'back'],
    ['Top view', 'top'],
    ['Perspective view', 'perspective'],
    ['Front view', 'front'],
    ['Reset 3D view', 'perspective'],
  ]) {
    await page.getByRole('button', { name: preset, exact: true }).click();
    await expect(view).toHaveAttribute('data-view', mode);
  }
  expect(await saveProject(page, fixture.name)).toEqual(original);
  await page.getByRole('button', { name: '2D canvas', exact: true }).click();
  await expect(page.getByLabel('Composition canvas')).toHaveAttribute('width', '256');
  expect(await saveProject(page, fixture.name)).toEqual(original);
});

test('reorders selected 3D layers in the project and PNG export, with one-step undo', async ({
  page,
}) => {
  const fixture = depthFixture();
  await openProjectFixture(page, fixture);
  const original = await saveProject(page, fixture.name);
  expect(await exportedPixel(page, 100, 100)).toEqual([141, 153, 174, 255]);

  await page.getByRole('button', { name: '3D layers', exact: true }).click();
  const red = page.getByRole('button', { name: 'Select 3D layer Red square', exact: true });
  await page.getByRole('button', { name: 'Select 3D layer Slate square', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Inspect Slate square', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Front view', exact: true }).click();
  // The red square's exposed top-left corner selects the underlying object directly.
  await page
    .getByRole('button', { name: 'Inspect Red square', exact: true })
    .click({ position: { x: 8, y: 8 } });
  await expect(red).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Move layer forward', exact: true }).click();
  const reordered = await saveProject(page, fixture.name);
  expect(reordered.layers.map((layer) => layer.id)).toEqual([
    original.layers[2].id,
    original.layers[1].id,
    original.layers[0].id,
  ]);
  // Ordering changes neither the objects nor the audio slot in the serialized sequence.
  for (const layer of original.layers) {
    expect(reordered.layers.find((candidate) => candidate.id === layer.id)).toEqual(layer);
  }
  await page.getByRole('button', { name: '2D canvas', exact: true }).click();
  expect(await exportedPixel(page, 100, 100)).toEqual([239, 35, 60, 255]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(original);
  expect(await exportedPixel(page, 100, 100)).toEqual([141, 153, 174, 255]);
});

test('drags a layer in 3D, saves its position, exports that position, and undoes the whole gesture', async ({
  page,
}) => {
  const fixture = depthFixture();
  await openProjectFixture(page, fixture);
  const original = await saveProject(page, fixture.name);
  expect(await exportedPixel(page, 44, 44)).toEqual([239, 35, 60, 255]);
  await page.getByRole('button', { name: '3D layers', exact: true }).click();
  await page.getByRole('button', { name: 'Front view', exact: true }).click();
  const hit = page.getByRole('button', { name: 'Inspect Red square', exact: true });
  const before = (await hit.boundingBox())!;
  await page.mouse.move(before.x + 10, before.y + 10);
  await page.mouse.down();
  await page.mouse.move(before.x + 50, before.y + 30, { steps: 8 });
  await page.mouse.up();
  const moved = await saveProject(page, fixture.name);
  expect(moved.layers[0].x).toBeCloseTo(original.layers[0].x + 40 / (before.width / 160), 0);
  expect(moved.layers[0].y).toBeCloseTo(original.layers[0].y + 20 / (before.height / 160), 0);
  expect(moved.layers.slice(1)).toEqual(original.layers.slice(1));
  await expect(page.getByRole('region', { name: '3D layer view', exact: true })).toHaveAttribute(
    'data-view',
    'front',
  );
  await page.getByRole('button', { name: '2D canvas', exact: true }).click();
  expect(await exportedPixel(page, 44, 44)).toEqual([237, 242, 244, 255]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(original);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(moved);
});

test('drags a selection correctly from the back, keeps locks fixed, and positions precisely from top', async ({
  page,
}) => {
  const fixture = depthFixture();
  fixture.layers.push(
    createLayer('shape', {
      name: 'Locked marker',
      x: 12,
      y: 12,
      width: 12,
      height: 12,
      duration: 6,
      locked: true,
    }),
  );
  await openProjectFixture(page, fixture);
  const original = await saveProject(page, fixture.name);
  await page.getByRole('button', { name: '3D layers', exact: true }).click();
  await page.getByRole('button', { name: 'Back view', exact: true }).click();
  await page.getByRole('button', { name: 'Select 3D layer Red square', exact: true }).click();
  await page
    .getByRole('button', { name: 'Select 3D layer Slate square', exact: true })
    .click({ modifiers: ['Meta'] });
  await page
    .getByRole('button', { name: 'Select 3D layer Locked marker', exact: true })
    .click({ modifiers: ['Meta'] });
  const hit = page.getByRole('button', { name: 'Inspect Red square', exact: true });
  const box = (await hit.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20, { steps: 6 });
  await page.mouse.up();
  const moved = await saveProject(page, fixture.name);
  const dx = moved.layers[0].x - original.layers[0].x;
  const dy = moved.layers[0].y - original.layers[0].y;
  expect(dx).toBeLessThan(-5);
  expect(dy).toBeGreaterThan(5);
  expect(moved.layers[2].x - original.layers[2].x).toBeCloseTo(dx, 4);
  expect(moved.layers[2].y - original.layers[2].y).toBeCloseTo(dy, 4);
  expect(moved.layers[1]).toEqual(original.layers[1]);
  expect(moved.layers[3]).toEqual(original.layers[3]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(original);
  await page.getByRole('button', { name: 'Select 3D layer Slate square', exact: true }).click();
  await page.getByRole('button', { name: 'Top view', exact: true }).click();
  const x = page.getByRole('spinbutton', { name: '3D position X', exact: true });
  await x.fill('123');
  await x.press('Enter');
  expect((await saveProject(page, fixture.name)).layers[2].x).toBe(123);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(original);
});

test('changes depth with a continuous slider gesture and restores the entire stack in one undo', async ({
  page,
}) => {
  const fixture = depthFixture();
  fixture.layers.push(
    createLayer('shape', { name: 'Third plane', x: 220, y: 0, width: 20, height: 20, duration: 6 }),
  );
  await openProjectFixture(page, fixture);
  const original = await saveProject(page, fixture.name);
  await page.getByRole('button', { name: '3D layers', exact: true }).click();
  await page.getByRole('button', { name: 'Select 3D layer Red square', exact: true }).click();
  const slider = page.getByRole('slider', { name: 'Layer depth', exact: true });
  await expect(slider).toBeEnabled();
  const bounds = (await slider.boundingBox())!;
  await page.mouse.move(bounds.x + 5, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width - 5, bounds.y + bounds.height / 2, { steps: 12 });
  await page.mouse.up();
  const reordered = await saveProject(page, fixture.name);
  expect(reordered.layers.map((layer) => layer.id)).toEqual([
    original.layers[2].id,
    original.layers[1].id,
    original.layers[3].id,
    original.layers[0].id,
  ]);
  for (const layer of original.layers) {
    expect(reordered.layers.find((candidate) => candidate.id === layer.id)).toEqual(layer);
  }
  await page.getByRole('button', { name: '2D canvas', exact: true }).click();
  expect(await exportedPixel(page, 100, 100)).toEqual([239, 35, 60, 255]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(original);
});

test('keeps a dragged element under the pointer in a zoomed and panned perspective view', async ({
  page,
}) => {
  const fixture = depthFixture();
  fixture.layers = [
    createLayer('shape', { name: 'Back plane', x: 0, y: 0, width: 8, height: 8, duration: 6 }),
    createLayer('shape', {
      name: 'Small plane',
      x: 112,
      y: 112,
      width: 32,
      height: 32,
      radius: 0,
      duration: 6,
    }),
  ];
  await openProjectFixture(page, fixture);
  const original = await saveProject(page, fixture.name);
  await page.getByRole('button', { name: '3D layers', exact: true }).click();
  const zoom = page.getByRole('slider', { name: '3D zoom', exact: true });
  await zoom.focus();
  for (let step = 0; step < 4; step++) await zoom.press('ArrowRight');
  const hit = page.getByRole('button', { name: 'Inspect Small plane', exact: true });
  const start = (await hit.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.keyboard.down('Shift');
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 20, start.y + start.height / 2 - 12, {
    steps: 4,
  });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  expect(await saveProject(page, fixture.name)).toEqual(original);
  const before = (await hit.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 24, before.y + before.height / 2 + 16, {
    steps: 5,
  });
  await page.mouse.up();
  const after = (await hit.boundingBox())!;
  expect(Math.abs(after.x + after.width / 2 - before.x - before.width / 2 - 24)).toBeLessThan(2);
  expect(Math.abs(after.y + after.height / 2 - before.y - before.height / 2 - 16)).toBeLessThan(2);
  await expect(page.getByRole('region', { name: '3D layer view', exact: true })).toHaveAttribute(
    'data-view',
    'perspective',
  );
  const moved = await saveProject(page, fixture.name);
  expect(moved.layers[0]).toEqual(original.layers[0]);
  expect(moved.layers[1].x).not.toBe(original.layers[1].x);
  expect(moved.layers[1].y).not.toBe(original.layers[1].y);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(original);
});

test('3D inspection respects visibility, clip time, audio separation, and locked ordering', async ({
  page,
}) => {
  const fixture = depthFixture();
  fixture.layers[0].locked = true;
  fixture.layers[2].duration = 2;
  fixture.layers.push(
    createLayer('shape', { name: 'Hidden square', hidden: true, duration: 6 }),
    createLayer('shape', { name: 'Later square', start: 3, duration: 3 }),
  );
  await openProjectFixture(page, fixture);
  const original = await saveProject(page, fixture.name);
  await page.getByRole('button', { name: '3D layers', exact: true }).click();
  const view = page.getByRole('region', { name: '3D layer view', exact: true });
  await expect(view.locator('[data-depth-plane]')).toHaveCount(2);
  await expect(
    page.getByRole('button', { name: 'Select 3D layer Sound bed', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Select 3D layer Hidden square', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Select 3D layer Later square', exact: true }),
  ).toHaveCount(0);

  await page.getByRole('button', { name: 'Select 3D layer Red square', exact: true }).click();
  const forward = page.getByRole('button', { name: 'Move layer forward', exact: true });
  const backward = page.getByRole('button', { name: 'Move layer backward', exact: true });
  await expect(forward).toBeDisabled();
  await expect(backward).toBeDisabled();
  await expect(page.getByRole('slider', { name: 'Layer depth', exact: true })).toBeDisabled();
  await expect(page.getByRole('spinbutton', { name: '3D position X', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Front view', exact: true }).click();
  const lockedHit = (await page
    .getByRole('button', { name: 'Inspect Red square', exact: true })
    .boundingBox())!;
  await page.mouse.move(lockedHit.x + 10, lockedHit.y + 10);
  await page.mouse.down();
  await page.mouse.move(lockedHit.x + 40, lockedHit.y + 30, { steps: 4 });
  await page.mouse.up();
  await forward.dispatchEvent('click');
  expect(await saveProject(page, fixture.name)).toEqual(original);

  const position = page.getByRole('slider', { name: 'Timeline position', exact: true });
  await position.focus();
  await position.press('Home');
  for (let second = 0; second < 4; second++) await position.press('Shift+ArrowRight');
  await expect(position).toHaveAttribute('aria-valuenow', '4');
  await expect(
    page.getByRole('button', { name: 'Select 3D layer Later square', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Select 3D layer Slate square', exact: true }),
  ).toHaveCount(0);
  await expect(view.locator('[data-depth-plane]')).toHaveCount(2);
  expect(await saveProject(page, fixture.name)).toEqual(original);
});

test('fits a long timeline into view and seeks its final clip without editing content', async ({
  page,
}) => {
  const fixture: Project = {
    ...createProject(),
    name: 'Long sequence',
    duration: 180,
    layers: [
      createLayer('shape', { name: 'Full sequence', duration: 180 }),
      createLayer('text', { name: 'Final title', start: 175, duration: 5 }),
    ],
  };
  await openProjectFixture(page, fixture);
  const original = await saveProject(page, fixture.name);
  const zoom = page.getByRole('slider', { name: 'Timeline zoom', exact: true });
  await zoom.focus();
  await zoom.press('End');
  const viewport = page.locator('.timeline-visual-scroll');
  const longClip = page.getByRole('button', { name: 'Timeline clip Full sequence', exact: true });
  const available = (await viewport.boundingBox())!;
  expect((await longClip.boundingBox())!.width).toBeGreaterThan(available.width);
  await viewport.hover();
  await page.mouse.wheel(10_000, 0);
  await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Fit timeline', exact: true }).click();
  await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBe(0);
  const finalClip = page.getByRole('button', { name: 'Timeline clip Final title', exact: true });
  await expect(finalClip).toBeInViewport();
  const fitted = (await longClip.boundingBox())!;
  expect(fitted.x).toBeGreaterThanOrEqual(available.x);
  expect(fitted.x + fitted.width).toBeLessThanOrEqual(available.x + available.width);
  const ending = (await finalClip.boundingBox())!;
  expect(ending.x + ending.width).toBeLessThanOrEqual(available.x + available.width);
  // Seek the real ruler above the middle of the final clip, now reachable without scrolling.
  const ruler = page.getByRole('slider', { name: 'Timeline position', exact: true });
  const rulerBounds = (await ruler.boundingBox())!;
  await page.mouse.click(ending.x + ending.width / 2, rulerBounds.y + rulerBounds.height / 2);
  await expect
    .poll(async () => Number(await ruler.getAttribute('aria-valuenow')))
    .toBeGreaterThanOrEqual(175);
  expect(Number(await ruler.getAttribute('aria-valuenow'))).toBeLessThan(180);
  const transport = page.getByRole('group', { name: 'Timeline playback', exact: true });
  await expect(transport).toBeVisible();
  await expect(
    transport.getByRole('button', { name: 'Current timeline time', exact: true }),
  ).toHaveText((await ruler.getAttribute('aria-valuetext'))!);
  expect(await saveProject(page, fixture.name)).toEqual(original);
});

test('adds an editable browser component at the playhead and scales its parts together', async ({
  page,
}) => {
  const original = await saveProject(page);
  const playhead = Number(
    await page
      .getByRole('slider', { name: 'Timeline position', exact: true })
      .getAttribute('aria-valuenow'),
  );
  await page.getByRole('button', { name: 'Components', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search components', exact: true }).fill('browser');
  await expect(page.getByRole('button', { name: /^Add component:/ })).toHaveCount(1);
  await page.getByRole('button', { name: 'Add component: Browser window', exact: true }).click();
  const inserted = await saveProject(page);
  expect(inserted.layers.slice(0, original.layers.length)).toEqual(original.layers);
  const parts = inserted.layers.slice(original.layers.length);
  expect(parts.length).toBeGreaterThan(4);
  expect(new Set(parts.map((l) => l.groupId)).size).toBe(1);
  expect(parts.every((l) => Math.abs(l.start - playhead) < 0.001)).toBe(true);

  const properties = page.getByRole('complementary', { name: 'Properties', exact: true });
  await properties
    .getByRole('textbox', { name: /^Content:/ })
    .first()
    .fill('my-project.example');
  const edited = await saveProject(page);
  expect(edited.layers.filter((l) => l.text === 'my-project.example')).toHaveLength(1);
  expect(edited.layers.slice(0, original.layers.length)).toEqual(original.layers);
  const width = properties.getByRole('spinbutton', { name: 'W', exact: true });
  const originalWidth = Number(await width.inputValue());
  const requestedWidth = Math.round(originalWidth * 0.8);
  const factor = requestedWidth / originalWidth;
  await width.fill(String(requestedWidth));
  const resized = await saveProject(page);
  const beforeResize = edited.layers.slice(original.layers.length);
  const afterResize = resized.layers.slice(original.layers.length);
  afterResize.forEach((layer, index) => {
    expect(layer.width).toBeCloseTo(beforeResize[index].width * factor, 1);
    expect(layer.height).toBeCloseTo(beforeResize[index].height * factor, 1);
    if (layer.fontSize !== undefined)
      expect(layer.fontSize).toBeCloseTo(beforeResize[index].fontSize! * factor, 1);
    expect(layer.start).toBe(beforeResize[index].start);
    expect(layer.duration).toBe(beforeResize[index].duration);
  });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page)).toEqual(edited);
  // Reveal the selection corner beneath the floating inspector before dragging it.
  await properties.getByRole('button', { name: 'Close properties', exact: true }).click();
  await expect(page.locator('.selection-box')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^Resize selection from / })).toHaveCount(4);
  const handle = page.getByRole('button', {
    name: 'Resize selection from bottom right',
    exact: true,
  });
  const corner = (await handle.boundingBox())!;
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.x + 29, corner.y + 21, { steps: 6 });
  await page.mouse.up();
  const dragged = (await saveProject(page)).layers.slice(original.layers.length);
  const gestureScale = dragged[0].width / beforeResize[0].width;
  expect(gestureScale).toBeGreaterThan(1);
  dragged.forEach((layer, index) => {
    expect(layer.width).toBeCloseTo(beforeResize[index].width * gestureScale, 4);
    expect(layer.height).toBeCloseTo(beforeResize[index].height * gestureScale, 4);
    if (layer.fontSize !== undefined)
      expect(layer.fontSize).toBeCloseTo(beforeResize[index].fontSize! * gestureScale, 4);
  });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page)).toEqual(edited);
});

test('applies a group-safe motion recipe in one undo step without changing component geometry', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Components', exact: true }).click();
  await page.getByRole('button', { name: 'Add component: Notification', exact: true }).click();
  const before = await saveProject(page);
  const parts = before.layers.slice(6);
  const properties = page.getByRole('complementary', { name: 'Properties', exact: true });
  await editingMenu(page, 'Motion').click();
  await expect(properties.getByRole('button', { name: 'Pop', exact: true })).toBeDisabled();
  await properties.getByRole('button', { name: 'Rise', exact: true }).click();
  const after = await saveProject(page);
  after.layers.slice(6).forEach((layer, index) => {
    expect(layer.animation).toBe('rise');
    for (const key of ['x', 'y', 'width', 'height', 'start', 'duration', 'groupId'] as const)
      expect(layer[key]).toBe(parts[index][key]);
  });
  expect(after.layers.slice(0, 6)).toEqual(before.layers.slice(0, 6));
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page)).toEqual(before);
});

test('color looks persist, render in exports, and recover from zero strength', async ({ page }) => {
  const fixture: Project = {
    ...createProject(),
    name: 'Look study',
    width: 128,
    height: 128,
    duration: 4,
    layers: [
      createLayer('shape', {
        name: 'Color swatch',
        x: 0,
        y: 0,
        width: 128,
        height: 128,
        radius: 0,
        fill: '#ef233c',
        duration: 4,
      }),
    ],
    components: [],
  };
  await openProjectFixture(page, fixture);
  await page.getByRole('button', { name: 'Timeline clip Color swatch', exact: true }).click();
  const properties = page.getByRole('complementary', { name: 'Properties', exact: true });
  await editingMenu(page, 'Color').click();
  await properties.getByRole('button', { name: 'Noir look', exact: true }).click();
  const noir = await saveProject(page, fixture.name);
  expect(noir.layers[0].saturation).toBe(0);
  const pixel = await exportedPixel(page, 64, 64);
  expect(Math.max(...pixel.slice(0, 3)) - Math.min(...pixel.slice(0, 3))).toBeLessThanOrEqual(1);
  const strength = properties.getByRole('slider', { name: 'Look strength', exact: true });
  await strength.focus();
  await strength.press('Home');
  const neutral = await saveProject(page, fixture.name);
  expect(neutral.layers[0]).toMatchObject({ brightness: 1, contrast: 1, saturation: 1 });
  await strength.focus();
  await strength.press('End');
  expect((await saveProject(page, fixture.name)).layers[0]).toEqual(noir.layers[0]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await saveProject(page, fixture.name)).layers[0]).toEqual(neutral.layers[0]);
  await properties.getByRole('button', { name: 'Vivid look', exact: true }).click();
  const vivid = await saveProject(page, fixture.name);
  const slider = (await strength.boundingBox())!;
  await page.mouse.move(slider.x + slider.width - 8, slider.y + slider.height / 2);
  await page.mouse.down();
  await page.mouse.move(slider.x + slider.width * 0.7, slider.y + slider.height / 2, { steps: 8 });
  await page.mouse.move(slider.x + slider.width * 0.3, slider.y + slider.height / 2, { steps: 8 });
  await page.mouse.up();
  expect((await saveProject(page, fixture.name)).layers[0].saturation).toBeLessThan(
    vivid.layers[0].saturation,
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await saveProject(page, fixture.name)).layers[0]).toEqual(vivid.layers[0]);
  await properties.getByRole('button', { name: 'Reset color', exact: true }).click();
  expect((await saveProject(page, fixture.name)).layers[0]).toMatchObject({
    brightness: 1,
    contrast: 1,
    saturation: 1,
  });
});

test('component categories and search only filter the library and preserve the project', async ({
  page,
}) => {
  const before = await saveProject(page);
  await page.getByRole('button', { name: 'Components', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Add component:/ })).toHaveCount(12);
  await page.getByRole('button', { name: 'Mockups', exact: true }).click();
  const count = await page.getByRole('button', { name: /^Add component:/ }).count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThan(12);
  await page
    .getByRole('searchbox', { name: 'Search components', exact: true })
    .fill('no-such-component');
  await expect(page.getByRole('button', { name: /^Add component:/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Yours', exact: true }).click();
  expect(await saveProject(page)).toEqual(before);
});

async function imageToolsFixture(page: Page, locked = false): Promise<Project> {
  const src = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 128, 128);
    context.fillStyle = '#ef233c';
    context.fillRect(16, 32, 32, 64);
    context.fillStyle = '#8d99ae';
    context.fillRect(80, 32, 32, 64);
    return canvas.toDataURL('image/png');
  });
  return {
    ...createProject(),
    name: 'Image tools study',
    width: 128,
    height: 128,
    duration: 4,
    background: '#2b2d42',
    layers: [
      createLayer('image', {
        name: 'Two colors',
        src,
        x: 0,
        y: 0,
        width: 128,
        height: 128,
        radius: 0,
        duration: 4,
        locked,
      }),
    ],
    components: [],
  };
}

async function exportedSvgPixels(page: Page, points: number[][]) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export your creation' });
  await dialog.getByRole('button', { name: 'SVG · editable frame', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export SVG', exact: true }).click();
  const bytes = await downloadBytes(await downloaded);
  const pixels = await page.evaluate(
    async ({ svg, points }) => {
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        return points.map(([x, y]) => Array.from(context.getImageData(x, y, 1, 1).data));
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    { svg: bytes.toString('utf8'), points },
  );
  await dialog.getByRole('button', { name: 'Close export', exact: true }).click();
  return pixels;
}

test('masks and flips match PNG, SVG, and 3D previews and survive reopening', async ({ page }) => {
  const fixture = await imageToolsFixture(page);
  await openProjectFixture(page, fixture);
  await page.getByRole('button', { name: 'Timeline clip Two colors', exact: true }).click();
  const properties = page.getByRole('complementary', { name: 'Properties', exact: true });
  await properties.getByRole('button', { name: 'Ellipse mask', exact: true }).click();
  expect(await exportedPixel(page, 2, 2)).toEqual([43, 45, 66, 255]);
  expect(await exportedPixel(page, 32, 64)).toEqual([239, 35, 60, 255]);
  await properties.getByRole('button', { name: 'Flip horizontally', exact: true }).click();
  expect(await exportedPixel(page, 32, 64)).toEqual([141, 153, 174, 255]);
  expect(
    await exportedSvgPixels(page, [
      [2, 2],
      [32, 64],
      [96, 64],
    ]),
  ).toEqual([
    [43, 45, 66, 255],
    [141, 153, 174, 255],
    [239, 35, 60, 255],
  ]);
  const saved = await saveProject(page, fixture.name);
  expect(saved.layers[0]).toMatchObject({
    mask: 'ellipse',
    flipX: true,
    src: fixture.layers[0].src,
  });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await saveProject(page, fixture.name)).layers[0].flipX).toBeFalsy();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('banner').getByRole('button', { name: fixture.name, exact: true }),
  ).toBeVisible();
  expect(await saveProject(page, fixture.name)).toEqual(saved);
  await page.getByRole('button', { name: '3D layers', exact: true }).click();
  const plane = page.locator('.depth-plane canvas');
  await expect(plane).toHaveCount(1);
  await expect
    .poll(() =>
      plane.evaluate((element) => {
        const canvas = element as HTMLCanvasElement;
        const context = canvas.getContext('2d')!;
        return Array.from(
          context.getImageData(Math.round(canvas.width / 4), Math.round(canvas.height / 2), 1, 1)
            .data,
        );
      }),
    )
    .toEqual([141, 153, 174, 255]);
  expect(
    await plane.evaluate((element) =>
      Array.from((element as HTMLCanvasElement).getContext('2d')!.getImageData(1, 1, 1, 1).data),
    ),
  ).toEqual([0, 0, 0, 0]);
});

test('solid background removal is reversible and exports the same keyed image in PNG and SVG', async ({
  page,
}) => {
  const fixture = await imageToolsFixture(page);
  await openProjectFixture(page, fixture);
  await page.getByRole('button', { name: 'Timeline clip Two colors', exact: true }).click();
  const properties = page.getByRole('complementary', { name: 'Properties', exact: true });
  await editingMenu(page, 'Color').click();
  await properties.getByRole('button', { name: 'Remove solid background', exact: true }).click();
  const keyed = await saveProject(page, fixture.name);
  expect(keyed.layers[0]).toMatchObject({
    src: fixture.layers[0].src,
    backgroundRemoval: { color: '#ffffff', tolerance: 18, softness: 10 },
  });
  expect(await exportedPixel(page, 2, 2)).toEqual([43, 45, 66, 255]);
  expect(
    await exportedSvgPixels(page, [
      [2, 2],
      [32, 64],
    ]),
  ).toEqual([
    [43, 45, 66, 255],
    [239, 35, 60, 255],
  ]);
  const tolerance = properties.getByRole('slider', { name: 'Background tolerance', exact: true });
  await tolerance.scrollIntoViewIfNeeded();
  const slider = (await tolerance.boundingBox())!;
  await page.mouse.move(slider.x + slider.width * 0.18, slider.y + slider.height / 2);
  await page.mouse.down();
  await page.mouse.move(slider.x + slider.width * 0.45, slider.y + slider.height / 2, { steps: 8 });
  await page.mouse.up();
  expect(
    (await saveProject(page, fixture.name)).layers[0].backgroundRemoval!.tolerance,
  ).toBeGreaterThan(30);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(keyed);
  await properties.getByRole('button', { name: 'Restore background', exact: true }).click();
  expect((await saveProject(page, fixture.name)).layers[0].backgroundRemoval).toBeUndefined();
  expect(await exportedPixel(page, 2, 2)).toEqual([255, 255, 255, 255]);
});

test('image color replacement preserves source and unrelated pixels with exact hex editing', async ({
  page,
}) => {
  const fixture = await imageToolsFixture(page);
  await openProjectFixture(page, fixture);
  await page.getByRole('button', { name: 'Timeline clip Two colors', exact: true }).click();
  const properties = page.getByRole('complementary', { name: 'Properties', exact: true });
  await editingMenu(page, 'Color').click();
  await properties.locator('summary[aria-label="Replace color"]').click();
  await properties.getByRole('button', { name: 'Enable color replacement', exact: true }).click();
  const target = properties.getByRole('textbox', { name: 'To hex', exact: true });
  await target.fill('#0088ff');
  await target.press('Enter');
  const saved = await saveProject(page, fixture.name);
  expect(saved.layers[0]).toMatchObject({
    src: fixture.layers[0].src,
    colorReplace: { from: '#ef233c', to: '#0088ff', strength: 100 },
  });
  expect(await exportedPixel(page, 32, 64)).toEqual([0, 136, 255, 255]);
  expect(
    await exportedSvgPixels(page, [
      [32, 64],
      [96, 64],
      [2, 2],
    ]),
  ).toEqual([
    [0, 136, 255, 255],
    [141, 153, 174, 255],
    [255, 255, 255, 255],
  ]);
  await target.fill('invalid');
  await target.press('Enter');
  expect(await saveProject(page, fixture.name)).toEqual(saved);
  await properties.getByRole('button', { name: 'Restore original colors', exact: true }).click();
  expect((await saveProject(page, fixture.name)).layers[0].colorReplace).toBeUndefined();
  expect(await exportedPixel(page, 32, 64)).toEqual([239, 35, 60, 255]);
});

test('locked image tools cannot modify the image', async ({ page }) => {
  const fixture = await imageToolsFixture(page, true);
  await openProjectFixture(page, fixture);
  await page.getByRole('tab', { name: 'Layers', exact: true }).click();
  await page.getByRole('button', { name: 'Two colors', exact: true }).click();
  const properties = page.getByRole('complementary', { name: 'Properties', exact: true });
  await expect(
    properties.getByRole('button', { name: 'Ellipse mask', exact: true }),
  ).toBeDisabled();
  await expect(
    properties.getByRole('button', { name: 'Flip horizontally', exact: true }),
  ).toBeDisabled();
  await editingMenu(page, 'Color').click();
  await expect(
    properties.getByRole('button', { name: 'Remove solid background', exact: true }),
  ).toBeDisabled();
  expect(await saveProject(page, fixture.name)).toEqual(parseProject(JSON.stringify(fixture)));
});

test('palette recolors shapes and outline strokes together without filling transparent SVGs', async ({
  page,
}) => {
  const groupId = 'palette-group';
  const fixture: Project = {
    ...createProject(),
    name: 'Palette study',
    width: 256,
    height: 256,
    duration: 4,
    layers: [
      createLayer('shape', {
        name: 'Filled square',
        groupId,
        x: 20,
        y: 20,
        width: 60,
        height: 60,
        radius: 0,
        fill: '#2b2d42',
        duration: 4,
      }),
      createLayer('drawing', {
        name: 'Pencil line',
        groupId,
        x: 100,
        y: 20,
        width: 60,
        height: 60,
        path: 'M0 0 L60 60',
        viewBox: '0 0 60 60',
        fill: 'transparent',
        stroke: '#2b2d42',
        strokeWidth: 5,
        duration: 4,
      }),
      createLayer('svg', {
        name: 'Outline square',
        groupId,
        x: 20,
        y: 100,
        width: 60,
        height: 60,
        path: 'M0 0 H60 V60 H0 Z',
        viewBox: '0 0 60 60',
        fill: 'transparent',
        stroke: '#2b2d42',
        strokeWidth: 5,
        duration: 4,
      }),
    ],
    components: [],
  };
  await openProjectFixture(page, fixture);
  await page.getByRole('button', { name: 'Timeline clip Filled square', exact: true }).click();
  const properties = page.getByRole('complementary', { name: 'Properties', exact: true });
  await expect(properties.getByRole('button', { name: 'Ellipse mask', exact: true })).toHaveCount(
    0,
  );
  await properties.getByRole('button', { name: 'Set element color #ef233c', exact: true }).click();
  const after = await saveProject(page, fixture.name);
  expect(after.layers[0].fill).toBe('#ef233c');
  for (const layer of after.layers.slice(1))
    expect(layer).toMatchObject({ fill: 'transparent', stroke: '#ef233c' });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(parseProject(JSON.stringify(fixture)));
});

test('toolbar menus dismiss without edits and panels can stay hidden while selecting', async ({
  page,
}) => {
  const original = await saveProject(page);
  await page.getByRole('button', { name: 'Timeline clip Caption', exact: true }).click();
  await page.getByRole('button', { name: 'Add shape', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Shapes', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Shapes', exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Timeline clip Caption', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Add shape', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Drawing tools', exact: true }).click();
  await page.getByRole('button', { name: 'Close drawing tools', exact: true }).click();
  await page.getByRole('button', { name: 'Masks and effects', exact: true }).click();
  await page.getByRole('button', { name: 'Go to start', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Masks & adjustments', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Templates', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Templates', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('button', { name: 'Close library', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Library' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Templates', exact: true }).click();
  await page.getByRole('button', { name: 'Hide panels', exact: true }).click();
  await page.getByRole('button', { name: 'Timeline clip Edition', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Library' })).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Properties' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show panels', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Library' })).toBeVisible();
  expect(await saveProject(page)).toEqual(original);
});

test('adds a vector shape from the toolbar and edits its mask with independent undo', async ({
  page,
}) => {
  const original = await saveProject(page);
  const playhead = Number(
    await page
      .getByRole('slider', { name: 'Timeline position', exact: true })
      .getAttribute('aria-valuenow'),
  );
  await page.getByRole('button', { name: 'Add shape', exact: true }).click();
  await page.getByRole('button', { name: 'Add star', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Shapes', exact: true })).toHaveCount(0);
  const added = await saveProject(page);
  const star = added.layers.at(-1)!;
  expect(star).toMatchObject({ name: 'Star', kind: 'svg', start: playhead });
  expect(star.path).toContain('Z');
  await page.getByRole('button', { name: 'Masks and effects', exact: true }).click();
  const masks = page.getByRole('dialog', { name: 'Masks & adjustments', exact: true });
  await masks.getByRole('button', { name: 'Ellipse mask', exact: true }).click();
  await masks.getByRole('spinbutton', { name: 'Mask inset value', exact: true }).fill('12');
  await page.keyboard.press('Escape');
  expect((await saveProject(page)).layers.at(-1)).toMatchObject({
    id: star.id,
    mask: 'ellipse',
    maskInset: 12,
  });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await saveProject(page)).layers.at(-1)).toEqual(star);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page)).toEqual(original);
});

test('creates a curved Pen path that survives SVG export, undo, redo, and reopening', async ({
  page,
}) => {
  const original = await saveProject(page);
  await page.getByRole('button', { name: 'Drawing tools', exact: true }).click();
  await page.getByRole('button', { name: 'Pen tool', exact: true }).click();
  const canvas = await page.getByLabel('Composition canvas').boundingBox();
  expect(canvas).not.toBeNull();
  const x = canvas!.x,
    y = canvas!.y,
    w = canvas!.width,
    h = canvas!.height;
  await page.mouse.move(x + w * 0.2, y + h * 0.4);
  await page.mouse.down();
  await page.mouse.move(x + w * 0.27, y + h * 0.22, { steps: 5 });
  await page.mouse.up();
  await page.mouse.click(x + w * 0.6, y + h * 0.6);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /^Timeline clip / })).toHaveCount(
    original.layers.length + 1,
  );
  const authored = await saveProject(page);
  const path = authored.layers.at(-1)!;
  expect(path.kind).toBe('svg');
  expect(path.path).toContain('C');
  expect(path.strokeWidth).toBe(3);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export your creation' });
  await dialog.getByRole('button', { name: 'SVG · editable frame', exact: true }).click();
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export SVG', exact: true }).click();
  expect((await downloadBytes(await download)).toString('utf8')).toContain(path.path);
  await dialog.getByRole('button', { name: 'Close export', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page)).toEqual(original);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect((await saveProject(page)).layers.at(-1)).toEqual(path);
  await openProjectFixture(page, authored);
  expect((await saveProject(page)).layers.at(-1)).toEqual(path);
});

test('cancels Pen drafts safely and closes a filled path by its first anchor', async ({ page }) => {
  const original = await saveProject(page);
  await page.getByRole('button', { name: 'Timeline clip Caption', exact: true }).click();
  await page.getByRole('button', { name: 'Drawing tools', exact: true }).click();
  await page.getByRole('button', { name: 'Pen tool', exact: true }).click();
  const bounds = (await page.getByLabel('Composition canvas').boundingBox())!;
  const points = [
    [0.24, 0.25],
    [0.6, 0.4],
    [0.35, 0.72],
  ].map(([x, y]) => ({ x: bounds.x + x * bounds.width, y: bounds.y + y * bounds.height }));
  for (const point of points) await page.mouse.click(point.x, point.y);
  await page.keyboard.press('Backspace');
  await page.getByRole('button', { name: 'Drawing tools', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Drawing tools', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  expect(await saveProject(page)).toEqual(original);
  await page.getByRole('button', { name: 'Drawing tools', exact: true }).click();
  await page.getByRole('button', { name: 'Pen tool', exact: true }).click();
  for (const point of points) await page.mouse.click(point.x, point.y);
  await page.mouse.click(points[0].x, points[0].y);
  const authored = await saveProject(page);
  expect(authored.layers).toHaveLength(original.layers.length + 1);
  expect(authored.layers.at(-1)).toMatchObject({ kind: 'svg', fill: '#ef233c' });
  expect(authored.layers.at(-1)!.path).toMatch(/Z$/i);
});

test('brush strokes use the chosen width and color and save as vector data', async ({ page }) => {
  const original = await saveProject(page);
  await page.getByRole('button', { name: 'Drawing tools', exact: true }).click();
  await page.getByRole('button', { name: 'Brush tool', exact: true }).click();
  await page.getByRole('button', { name: 'Drawing tools', exact: true }).click();
  await page.getByRole('button', { name: 'Drawing color #d90429', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Drawing stroke width', exact: true }).fill('18');
  await page.getByRole('button', { name: 'Close drawing tools', exact: true }).click();
  const bounds = (await page.getByLabel('Composition canvas').boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.6, bounds.y + bounds.height * 0.7, {
    steps: 12,
  });
  await page.mouse.up();
  const authored = await saveProject(page);
  expect(authored.layers).toHaveLength(original.layers.length + 1);
  expect(authored.layers.at(-1)).toMatchObject({
    kind: 'drawing',
    strokeWidth: 18,
    stroke: '#d90429',
  });
  expect(authored.layers.at(-1)!.path).toContain('L');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page)).toEqual(original);
});

test('canvas size menu preserves redo for the current size and applies valid custom dimensions with Enter', async ({
  page,
}) => {
  const original = await saveProject(page);
  const trigger = page.getByRole('button', { name: 'Canvas size', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Canvas size settings', exact: true });
  await trigger.click();
  await expect(dialog.getByRole('button', { name: 'Landscape 16:9', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Portrait 9:16', exact: true }).click();
  await trigger.click();
  await expect(dialog.getByRole('button', { name: 'Portrait 9:16', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const redo = page.getByRole('button', { name: 'Redo', exact: true });
  await expect(redo).toBeEnabled();
  await trigger.click();
  await dialog.getByRole('button', { name: 'Landscape 16:9', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(redo).toBeEnabled();
  expect(await saveProject(page)).toEqual(original);
  await trigger.click();
  const width = dialog.getByRole('spinbutton', { name: 'Canvas width', exact: true });
  const height = dialog.getByRole('spinbutton', { name: 'Canvas height', exact: true });
  await width.fill('15');
  await expect(width).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByRole('button', { name: /^Apply size/ })).toBeDisabled();
  await expect(dialog.getByRole('alert')).toContainText('between 16 and 16,384');
  await width.fill('1280');
  await height.fill('720');
  await dialog.getByRole('checkbox', { name: 'Fit contents to frame', exact: true }).uncheck();
  await height.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(trigger).toContainText('1280 × 720');
  const resized = await saveProject(page);
  expect([resized.width, resized.height]).toEqual([1280, 720]);
  expect(resized.layers).toEqual(original.layers);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page)).toEqual(original);
});

test('canvas size menu fits a short window and discards swapped dimensions when closed', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 520 });
  const original = await saveProject(page);
  const trigger = page.getByRole('button', { name: 'Canvas size', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Canvas size settings', exact: true });
  await trigger.click();
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(12);
  expect(bounds.y).toBeGreaterThanOrEqual(12);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(988);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(508);
  const width = dialog.getByRole('spinbutton', { name: 'Canvas width', exact: true });
  const height = dialog.getByRole('spinbutton', { name: 'Canvas height', exact: true });
  await dialog.getByRole('button', { name: 'Swap canvas width and height', exact: true }).click();
  await expect(width).toHaveValue('1080');
  await expect(height).toHaveValue('1920');
  await expect(page.getByLabel('Composition canvas')).toHaveAttribute('width', '1920');
  await dialog.getByRole('button', { name: 'Close canvas size', exact: true }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(width).toHaveValue('1920');
  await expect(height).toHaveValue('1080');
  await page.keyboard.press('Escape');
  expect(await saveProject(page)).toEqual(original);
});

test('right-side editing menus open dedicated categories and retain selection and focus when closed', async ({
  page,
}) => {
  const rail = page.getByRole('navigation', { name: 'Editing menus', exact: true });
  const properties = page.getByRole('complementary', { name: 'Properties', exact: true });
  const design = editingMenu(page, 'Design');
  const motion = editingMenu(page, 'Motion');
  const color = editingMenu(page, 'Color');
  await expect(rail).toBeVisible();
  await expect(properties).toHaveCount(0);
  for (const button of [design, motion, color]) {
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).not.toHaveAttribute('aria-controls');
  }

  await motion.click();
  await expect(motion).toHaveAttribute('aria-pressed', 'true');
  await expect(motion).toHaveAttribute('aria-expanded', 'true');
  await expect(motion).toHaveAttribute('aria-controls', 'inspector-panel');
  await expect(
    properties.getByRole('heading', { name: 'Motion', exact: true, level: 2 }),
  ).toBeVisible();
  await expect(
    properties.getByRole('heading', { name: 'Select an element to animate', exact: true }),
  ).toBeVisible();
  await expect(properties.getByLabel('Project name', { exact: true })).toHaveCount(0);
  await expect(properties.getByLabel('Canvas color', { exact: true })).toHaveCount(0);

  await color.click();
  await expect(
    properties.getByRole('heading', { name: 'Color', exact: true, level: 2 }),
  ).toBeVisible();
  await expect(properties.getByLabel('Canvas color', { exact: true })).toBeVisible();
  await expect(properties.getByLabel('Project name', { exact: true })).toHaveCount(0);
  await expect(motion).toHaveAttribute('aria-pressed', 'false');
  await design.click();
  await expect(
    properties.getByRole('heading', { name: 'Design', exact: true, level: 2 }),
  ).toBeVisible();
  await expect(properties.getByLabel('Project name', { exact: true })).toHaveValue('A little idea');
  await design.click();
  await expect(properties).toHaveCount(0);
  await expect(design).toHaveAttribute('aria-expanded', 'false');

  await motion.click();
  await page.getByRole('button', { name: 'Timeline clip Caption', exact: true }).click();
  await expect(motion).toHaveAttribute('aria-pressed', 'true');
  await expect(properties.getByRole('button', { name: 'Rise', exact: true })).toBeVisible();
  await motion.focus();
  await page.keyboard.press('Escape');
  await expect(properties).toHaveCount(0);
  await expect(motion).toBeFocused();
  await expect(
    page.getByRole('button', { name: 'Timeline clip Caption', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await motion.click();
  await properties.getByRole('button', { name: 'Close properties', exact: true }).click();
  await expect(properties).toHaveCount(0);
  await expect(motion).toBeFocused();
  await expect(motion).toHaveAttribute('aria-pressed', 'false');
  // Selecting another layer recalls the category, rather than silently returning to Design.
  await page.getByRole('button', { name: 'Timeline clip Edition', exact: true }).click();
  await expect(
    properties.getByRole('heading', { name: 'Motion', exact: true, level: 2 }),
  ).toBeVisible();
  await properties.getByRole('button', { name: 'Rise', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(properties).toHaveCount(0);
  await expect(motion).toBeFocused();
  await expect(
    page.getByRole('button', { name: 'Timeline clip Edition', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await motion.click();
  await expect(
    properties.getByRole('heading', { name: 'Motion', exact: true, level: 2 }),
  ).toBeVisible();
});

test('right-side editing menus leave canvas placement and redo history unchanged and hide in focused views', async ({
  page,
}) => {
  const original = await saveProject(page);
  await page.getByRole('button', { name: 'Add text', exact: true }).click();
  const added = await saveProject(page);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const canvas = page.getByLabel('Composition canvas');
  const before = (await canvas.boundingBox())!;
  const properties = page.getByRole('complementary', { name: 'Properties', exact: true });
  const redo = page.getByRole('button', { name: 'Redo', exact: true });
  await expect(redo).toBeEnabled();
  for (const name of ['Motion', 'Color', 'Design', 'Design', 'Motion'] as const) {
    await editingMenu(page, name).click();
    await expect.poll(async () => canvas.boundingBox()).toEqual(before);
  }
  expect(await saveProject(page)).toEqual(original);
  await expect(redo).toBeEnabled();
  await redo.click();
  expect(await saveProject(page)).toEqual(added);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page)).toEqual(original);

  const rail = page.getByRole('navigation', { name: 'Editing menus', exact: true });
  await page.getByRole('button', { name: 'Hide panels', exact: true }).click();
  await expect(rail).toBeHidden();
  await expect(properties).toHaveCount(0);
  await page.getByRole('button', { name: 'Timeline clip Caption', exact: true }).click();
  await expect(properties).toHaveCount(0);
  await page.getByRole('button', { name: 'Show panels', exact: true }).click();
  await expect(rail).toBeVisible();
  await expect(
    properties.getByRole('heading', { name: 'Motion', exact: true, level: 2 }),
  ).toBeVisible();
  await page.getByRole('button', { name: '3D layers', exact: true }).click();
  await expect(rail).toBeHidden();
  await expect(properties).toHaveCount(0);
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'A little idea', exact: true })
    .click();
  await page.getByRole('button', { name: 'Project settings', exact: true }).click();
  await expect(rail).toBeVisible();
  await expect(editingMenu(page, 'Design')).toHaveAttribute('aria-pressed', 'true');
  await expect(properties.getByLabel('Project name', { exact: true })).toHaveValue('A little idea');
  await expect(canvas).toBeVisible();

  await editingMenu(page, 'Motion').click();
  await page.getByRole('button', { name: 'Hide panels', exact: true }).click();
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'A little idea', exact: true })
    .click();
  await page.getByRole('button', { name: 'Project settings', exact: true }).click();
  await expect(rail).toBeVisible();
  await expect(editingMenu(page, 'Design')).toHaveAttribute('aria-pressed', 'true');
  await expect(properties.getByLabel('Project name', { exact: true })).toHaveValue('A little idea');
  expect(await saveProject(page)).toEqual(original);
  await expect(redo).toBeEnabled();
});

test('timeline locks mixed selections and individual rows without moving locked clips or adding drag history', async ({
  page,
}) => {
  const fixture: Project = {
    ...createProject(),
    name: 'Timeline locks',
    layers: [
      createLayer('shape', { name: 'First card', start: 1, duration: 4 }),
      createLayer('shape', { name: 'Second card', start: 2, duration: 4, locked: true }),
      createLayer('shape', { name: 'Unrelated card', start: 3, duration: 4 }),
    ],
    components: [],
  };
  await openProjectFixture(page, fixture);
  const original = await saveProject(page, fixture.name);
  const controls = page.getByRole('toolbar', { name: 'Timeline controls', exact: true });
  const timeline = page.getByRole('region', { name: 'Timeline', exact: true });
  const lockSelection = controls.getByRole('button', { name: 'Lock selected layers', exact: true });
  await expect(lockSelection).toBeDisabled();
  await page.getByRole('tab', { name: 'Layers', exact: true }).click();
  const library = page.getByRole('complementary', { name: 'Library', exact: true });
  await library.getByRole('button', { name: 'First card', exact: true }).click();
  await library
    .getByRole('button', { name: 'Second card', exact: true })
    .click({ modifiers: ['Shift'] });
  await expect(lockSelection).toBeEnabled();
  await lockSelection.click();
  const allLocked = await saveProject(page, fixture.name);
  expect(allLocked.layers.map((layer) => Boolean(layer.locked))).toEqual([true, true, false]);
  expect(allLocked.layers[2]).toEqual(original.layers[2]);
  await controls.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(original);
  await controls.getByRole('button', { name: 'Redo', exact: true }).click();
  const unlockSelection = controls.getByRole('button', {
    name: 'Unlock selected layers',
    exact: true,
  });
  await expect(unlockSelection).toBeEnabled();
  await unlockSelection.click();
  const unlocked = await saveProject(page, fixture.name);
  expect(unlocked.layers.map((layer) => Boolean(layer.locked))).toEqual([false, false, false]);
  expect(unlocked.layers[2]).toEqual(original.layers[2]);
  await controls.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(allLocked);

  await timeline.getByRole('button', { name: 'Unlock First card', exact: true }).click();
  const rowUnlocked = await saveProject(page, fixture.name);
  expect(rowUnlocked.layers.map((layer) => Boolean(layer.locked))).toEqual([false, true, false]);
  expect(rowUnlocked.layers.slice(1)).toEqual(allLocked.layers.slice(1));
  await controls.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(allLocked);
  await timeline.getByRole('button', { name: 'Timeline clip Unrelated card', exact: true }).click();
  const lockedClip = timeline.getByRole('button', {
    name: 'Timeline clip First card',
    exact: true,
  });
  const bounds = (await lockedClip.boundingBox())!;
  await page.mouse.move(bounds.x + 40, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 130, bounds.y + bounds.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(lockedClip).toHaveAttribute('aria-pressed', 'true');
  await expect(
    timeline.getByRole('button', { name: 'Timeline clip Unrelated card', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
  await expect(controls.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
  await expect(controls.getByRole('button', { name: 'Split clip', exact: true })).toBeDisabled();
  await lockedClip.focus();
  await page.keyboard.press('Delete');
  expect(await saveProject(page, fixture.name)).toEqual(allLocked);
  // Locked drag and Delete must not insert history before the previous real edit.
  await controls.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(original);
  await timeline.getByRole('button', { name: 'Lock First card', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(allLocked);
});

test('timeline gives all seven layer kinds distinct readable clip colors', async ({ page }) => {
  const kinds: LayerKind[] = ['video', 'audio', 'image', 'text', 'shape', 'svg', 'drawing'];
  const fixture: Project = {
    ...createProject(),
    name: 'Timeline colors',
    layers: kinds.map((kind) =>
      createLayer(kind, { name: `${kind} track`, start: 1, duration: 4 }),
    ),
    components: [],
  };
  await openProjectFixture(page, fixture);
  const backgrounds: string[] = [];
  for (const kind of kinds) {
    const clip = page.getByRole('button', { name: `Timeline clip ${kind} track`, exact: true });
    await clip.scrollIntoViewIfNeeded();
    await expect(clip).toBeVisible();
    const colors = await clip.evaluate((node) => {
      const style = getComputedStyle(node);
      const label = node.querySelector('.clip-name')!;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d')!;
      const luminance = (value: string) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);
        const channels = Array.from(context.getImageData(0, 0, 1, 1).data)
          .slice(0, 3)
          .map((channel) => {
            const normalized = channel / 255;
            return normalized <= 0.04045
              ? normalized / 12.92
              : ((normalized + 0.055) / 1.055) ** 2.4;
          });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      const stops = style.backgroundImage.match(
        /color\(srgb [^)]+\)|rgba?\([^)]+\)|#[0-9a-f]{3,8}/gi,
      ) ?? [style.backgroundColor];
      const foreground = luminance(getComputedStyle(label).color);
      return {
        background:
          style.backgroundImage === 'none' ? style.backgroundColor : style.backgroundImage,
        contrast: stops.map((stop) => {
          const background = luminance(stop);
          return (
            (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
          );
        }),
      };
    });
    backgrounds.push(colors.background);
    for (const contrast of colors.contrast)
      expect(contrast, `${kind} label contrast`).toBeGreaterThanOrEqual(4.5);
  }
  expect(new Set(backgrounds).size).toBe(kinds.length);
});

test('timeline controls stay in one toolbar above readable seconds in a small window', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  const controls = page.getByRole('toolbar', { name: 'Timeline controls', exact: true });
  await expect(controls).toBeVisible();
  const transport = controls.getByRole('group', { name: 'Timeline playback', exact: true });
  await expect(transport).toBeVisible();
  await expect(page.getByRole('group', { name: 'Timeline playback', exact: true })).toHaveCount(1);
  const ruler = page.getByRole('slider', { name: 'Timeline position', exact: true });
  const toolbarBounds = (await controls.boundingBox())!;
  const rulerBounds = (await ruler.boundingBox())!;
  expect(toolbarBounds.y + toolbarBounds.height).toBeLessThanOrEqual(rulerBounds.y);
  const boxes = await controls.locator('button, input').evaluateAll((nodes) =>
    nodes
      .map((node) => {
        const bounds = node.getBoundingClientRect();
        return {
          label: node.getAttribute('aria-label') ?? node.textContent,
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        };
      })
      .filter((box) => box.width > 0 && box.height > 0),
  );
  for (const box of boxes) {
    expect(box.x, `${box.label} left edge`).toBeGreaterThanOrEqual(toolbarBounds.x);
    expect(box.x + box.width, `${box.label} right edge`).toBeLessThanOrEqual(
      toolbarBounds.x + toolbarBounds.width,
    );
    expect(box.y, `${box.label} top edge`).toBeGreaterThanOrEqual(toolbarBounds.y);
    expect(box.y + box.height, `${box.label} bottom edge`).toBeLessThanOrEqual(
      toolbarBounds.y + toolbarBounds.height,
    );
  }
  for (let index = 0; index < boxes.length; index++) {
    for (const next of boxes.slice(index + 1)) {
      const box = boxes[index];
      const overlapX = Math.min(box.x + box.width, next.x + next.width) - Math.max(box.x, next.x);
      const overlapY = Math.min(box.y + box.height, next.y + next.height) - Math.max(box.y, next.y);
      expect(overlapX > 0 && overlapY > 0, `${box.label} overlaps ${next.label}`).toBe(false);
    }
  }
  const ticks = await ruler.locator('.ruler-tick span').evaluateAll((nodes) =>
    nodes.map((node) => {
      const bounds = node.getBoundingClientRect();
      return { x: bounds.x, right: bounds.right };
    }),
  );
  for (let index = 1; index < ticks.length; index++)
    expect(ticks[index].x).toBeGreaterThanOrEqual(ticks[index - 1].right);
  await transport.getByRole('button', { name: 'Go to start', exact: true }).click();
  await transport.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(async () => Number(await ruler.getAttribute('aria-valuenow')))
    .toBeGreaterThan(0.1);
  const pause = transport.getByRole('button', { name: 'Pause', exact: true });
  await pause.hover();
  const contrast = await pause.evaluate((button) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    const luminance = (color: string) => {
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const channels = Array.from(context.getImageData(0, 0, 1, 1).data)
        .slice(0, 3)
        .map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const foreground = luminance(getComputedStyle(button.querySelector('svg')!).color);
    const background = luminance(getComputedStyle(button).backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  expect(contrast, 'Hovered Pause icon contrast').toBeGreaterThanOrEqual(3);
  await pause.click();
});

function element3dFixture(): Project {
  return {
    ...createProject(),
    name: 'Element perspective',
    width: 640,
    height: 480,
    duration: 4,
    background: '#ffffff',
    layers: [
      createLayer('shape', {
        name: 'Perspective card',
        x: 120,
        y: 100,
        width: 280,
        height: 200,
        radius: 0,
        fill: '#ff0000',
        duration: 4,
      }),
      createLayer('shape', {
        name: 'Other card',
        x: 450,
        y: 350,
        width: 80,
        height: 70,
        radius: 0,
        fill: '#00ff00',
        duration: 4,
      }),
      createLayer('audio', { name: 'Sound layer', duration: 4 }),
    ],
    components: [],
  };
}

async function previewPixels(page: Page, points: number[][]): Promise<number[][]> {
  return page.getByLabel('Composition canvas').evaluate((element, points) => {
    const context = (element as HTMLCanvasElement).getContext('2d')!;
    return points.map(([x, y]) => Array.from(context.getImageData(x, y, 1, 1).data));
  }, points);
}

async function exportedPngPixels(page: Page, points: number[][]): Promise<number[][]> {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export your creation' });
  await dialog.getByRole('button', { name: 'PNG · current frame', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export PNG', exact: true }).click();
  const bytes = await downloadBytes(await downloaded);
  const pixels = await page.evaluate(
    async ({ bytes, points }) => {
      const bitmap = await createImageBitmap(
        new Blob([Uint8Array.from(bytes)], { type: 'image/png' }),
      );
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      return points.map(([x, y]) => Array.from(context.getImageData(x, y, 1, 1).data));
    },
    { bytes: Array.from(bytes), points },
  );
  await dialog.getByRole('button', { name: 'Close export', exact: true }).click();
  return pixels;
}

function projectedPoints(layer: Layer, local: number[][], time = 1.2): number[][] {
  return local.map(([x, y]) => {
    const point = projectElementPoint(layer, time, { x, y });
    return [Math.round(point.x), Math.round(point.y)];
  });
}

function expectUniformPixels(pixels: number[][], expected: number[], label: string, tolerance = 1) {
  const failures = pixels
    .map((pixel, index) => ({ pixel, index }))
    .filter(({ pixel }) =>
      pixel.some((channel, index) => Math.abs(channel - expected[index]) > tolerance),
    );
  expect(
    failures.slice(0, 10),
    `${label}: ${failures.length}/${pixels.length} pixels differ`,
  ).toEqual([]);
}

test('element 3D edits only the selected layer and persists its pose after reopening', async ({
  page,
}) => {
  const fixture = element3dFixture();
  await openProjectFixture(page, fixture);
  const before = await saveProject(page, fixture.name);
  await page.getByRole('button', { name: 'Timeline clip Perspective card', exact: true }).click();
  const inspector = page.getByRole('complementary', { name: 'Properties', exact: true });
  const toggle = inspector.getByRole('switch', { name: 'Enable 3D for this element', exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  for (const [label, value] of [
    ['Tilt X', '28'],
    ['Tilt Y', '-40'],
    ['Depth', '10'],
  ]) {
    const input = inspector.getByRole('spinbutton', { name: `3D ${label} value`, exact: true });
    await input.fill(value);
    await input.press('Enter');
  }
  const after = await saveProject(page, fixture.name);
  expect(after.layers[0].transform3d).toEqual({
    enabled: true,
    rotateX: 28,
    rotateY: -40,
    z: 10,
    motion: 'none',
  });
  expect(after.layers.slice(1)).toEqual(before.layers.slice(1));
  expect({ ...after.layers[0], transform3d: undefined }).toEqual({
    ...before.layers[0],
    transform3d: undefined,
  });
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('banner').getByRole('button', { name: fixture.name, exact: true }),
  ).toBeVisible();
  expect(await saveProject(page, fixture.name)).toEqual(after);
  await page.getByRole('button', { name: 'Timeline clip Perspective card', exact: true }).click();
  await expect(
    inspector.getByRole('spinbutton', { name: '3D Tilt Y value', exact: true }),
  ).toHaveValue('-40');
  await toggle.click();
  expect((await saveProject(page, fixture.name)).layers[0].transform3d?.enabled).toBe(false);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(after);
});

test('element 3D slider gestures undo once and unchanged input preserves redo', async ({
  page,
}) => {
  const fixture = element3dFixture();
  fixture.layers[0].transform3d = {
    enabled: true,
    rotateX: 12,
    rotateY: -18,
    z: 0,
    motion: 'none',
  };
  await openProjectFixture(page, fixture);
  const before = await saveProject(page, fixture.name);
  await page.getByRole('button', { name: 'Timeline clip Perspective card', exact: true }).click();
  const inspector = page.getByRole('complementary', { name: 'Properties', exact: true });
  const slider = inspector.getByRole('slider', { name: '3D Tilt Y', exact: true });
  await slider.scrollIntoViewIfNeeded();
  const bounds = (await slider.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * 0.45, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.8, bounds.y + bounds.height / 2, { steps: 8 });
  await page.mouse.move(bounds.x + bounds.width * 0.65, bounds.y + bounds.height / 2, { steps: 8 });
  await page.mouse.up();
  const after = await saveProject(page, fixture.name);
  expect(after.layers[0].transform3d!.rotateY).toBeGreaterThan(20);
  expect(after.layers.slice(1)).toEqual(before.layers.slice(1));
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(before);
  const input = inspector.getByRole('spinbutton', { name: '3D Tilt Y value', exact: true });
  await input.fill('-18');
  await input.press('Enter');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(after);
  await inspector.getByRole('button', { name: 'Reset 3D', exact: true }).click();
  expect((await saveProject(page, fixture.name)).layers[0].transform3d).toEqual({
    enabled: true,
    rotateX: 0,
    rotateY: 0,
    z: 0,
    motion: 'none',
  });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(after);
});

test('element 3D controls guard locked layers, audio, and multiple selection', async ({ page }) => {
  const fixture = element3dFixture();
  fixture.layers[0].locked = true;
  fixture.layers[0].transform3d = {
    enabled: true,
    rotateX: 12,
    rotateY: -18,
    z: 0,
    motion: 'none',
  };
  await openProjectFixture(page, fixture);
  const before = await saveProject(page, fixture.name);
  await page.getByRole('button', { name: 'Timeline clip Perspective card', exact: true }).click();
  const inspector = page.getByRole('complementary', { name: 'Properties', exact: true });
  const toggle = inspector.getByRole('switch', { name: 'Enable 3D for this element', exact: true });
  await expect(toggle).toBeDisabled();
  await expect(inspector.getByRole('slider', { name: '3D Tilt Y', exact: true })).toBeDisabled();
  await toggle.dispatchEvent('click');
  await editingMenu(page, 'Motion').click();
  await expect(inspector.getByRole('button', { name: '3D Tilt in', exact: true })).toBeDisabled();
  await inspector.getByRole('button', { name: '3D Tilt in', exact: true }).dispatchEvent('click');
  await editingMenu(page, 'Design').click();
  await page.getByRole('tab', { name: 'Layers', exact: true }).click();
  const library = page.getByRole('complementary', { name: 'Library', exact: true });
  await library
    .getByRole('button', { name: 'Other card', exact: true })
    .click({ modifiers: ['Shift'] });
  await expect(toggle).toHaveCount(0);
  await expect(
    inspector.getByText('Select one element to edit its 3D pose.', { exact: true }),
  ).toBeVisible();
  await library.getByRole('button', { name: 'Sound layer', exact: true }).click();
  await expect(toggle).toHaveCount(0);
  await editingMenu(page, 'Sound').click();
  await expect(inspector.getByRole('button', { name: /^3D / })).toHaveCount(0);
  expect(await saveProject(page, fixture.name)).toEqual(before);
});

test('element 3D projected pixels can be selected and dragged outside the original flat bounds', async ({
  page,
}) => {
  const fixture = element3dFixture();
  fixture.layers[0].transform3d = {
    enabled: true,
    rotateX: 18,
    rotateY: 40,
    z: 65,
    motion: 'none',
  };
  await openProjectFixture(page, fixture);
  const before = await saveProject(page, fixture.name);
  const canvas = page.getByLabel('Composition canvas');
  const hit = await canvas.evaluate((element) => {
    const context = (element as HTMLCanvasElement).getContext('2d')!;
    const red = (x: number, y: number) => {
      const pixel = context.getImageData(x, y, 1, 1).data;
      return pixel[0] === 255 && pixel[1] === 0 && pixel[2] === 0;
    };
    for (let y = 30; y < 450; y += 4) {
      for (let x = 30; x < 105; x += 4) {
        if (red(x, y) && red(x - 4, y) && red(x + 4, y) && red(x, y - 4) && red(x, y + 4))
          return { x, y };
      }
    }
    return null;
  });
  expect(hit, 'The tilted surface should extend visibly beyond x=120').not.toBeNull();
  const bounds = (await canvas.boundingBox())!;
  const scale = bounds.width / fixture.width;
  const x = bounds.x + hit!.x * scale;
  const y = bounds.y + hit!.y * scale;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await expect(
    page.getByRole('button', { name: 'Timeline clip Perspective card', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(x + 36, y + 20, { steps: 8 });
  await page.mouse.up();
  const after = await saveProject(page, fixture.name);
  expect(after.layers[0].x).toBeCloseTo(Math.round(before.layers[0].x + 36 / scale), 0);
  expect(after.layers[0].y).toBeCloseTo(Math.round(before.layers[0].y + 20 / scale), 0);
  expect(after.layers[0].transform3d).toEqual(before.layers[0].transform3d);
  expect(after.layers.slice(1)).toEqual(before.layers.slice(1));
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(before);
});

test('element 3D motion follows seeking and PNG output while SVG refuses active perspective', async ({
  page,
}) => {
  const fixture = element3dFixture();
  await openProjectFixture(page, fixture);
  await page.getByRole('button', { name: 'Timeline clip Perspective card', exact: true }).click();
  await editingMenu(page, 'Motion').click();
  const inspector = page.getByRole('complementary', { name: 'Properties', exact: true });
  await inspector.getByRole('button', { name: '3D Tilt in', exact: true }).click();
  await editingMenu(page, 'Design').click();
  await inspector.getByRole('button', { name: 'Flat', exact: true }).click();
  await editingMenu(page, 'Motion').click();
  await inspector.locator('summary').filter({ hasText: 'Fine-tune' }).click();
  await inspector.getByRole('spinbutton', { name: 'Delay (s)', exact: true }).fill('1');
  await inspector.getByRole('spinbutton', { name: 'Duration (s)', exact: true }).fill('1');
  const ruler = page.getByRole('slider', { name: 'Timeline position', exact: true });
  await ruler.focus();
  await ruler.press('Home');
  const point = [[125, 105]];
  await expect.poll(() => previewPixels(page, point)).toEqual([[255, 255, 255, 255]]);
  expect(await exportedPngPixels(page, point)).toEqual([[255, 255, 255, 255]]);
  await ruler.focus();
  await ruler.press('Home');
  await ruler.press('Shift+ArrowRight');
  await ruler.press('Shift+ArrowRight');
  await expect.poll(() => previewPixels(page, point)).toEqual([[255, 0, 0, 255]]);
  expect(await exportedPngPixels(page, point)).toEqual([[255, 0, 0, 255]]);
  const saved = await saveProject(page, fixture.name);
  expect(saved.layers[0].transform3d?.motion).toBe('tilt-in');
  expect(saved.layers.slice(1)).toEqual(parseProject(JSON.stringify(fixture)).layers.slice(1));
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export your creation' });
  await dialog.getByRole('button', { name: 'SVG · editable frame', exact: true }).click();
  await dialog.getByRole('button', { name: 'Export SVG', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('3D elements');
  await dialog.getByRole('button', { name: 'Close export', exact: true }).click();
  await editingMenu(page, 'Design').click();
  await inspector.getByRole('switch', { name: 'Enable 3D for this element', exact: true }).click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await dialog.getByRole('button', { name: 'SVG · editable frame', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export SVG', exact: true }).click();
  expect((await downloadBytes(await downloaded)).toString('utf8')).toContain('<svg');
});

test('element 3D translucent surfaces stay uniform without triangle seams in preview and PNG', async ({
  page,
}) => {
  const layer = createLayer('shape', {
    name: 'Translucent plane',
    x: 140,
    y: 120,
    width: 480,
    height: 320,
    radius: 0,
    fill: '#ff0000',
    opacity: 0.5,
    duration: 4,
    transform3d: { enabled: true, rotateX: 28, rotateY: -34, z: 8, motion: 'none' },
  });
  const fixture: Project = {
    ...createProject(),
    name: 'Perspective alpha',
    width: 800,
    height: 600,
    duration: 4,
    background: '#ffffff',
    layers: [layer],
    components: [],
  };
  await openProjectFixture(page, fixture);
  const local: number[][] = [];
  for (let y = 24; y < layer.height - 24; y += 6)
    for (let x = 24; x < layer.width - 24; x += 6) local.push([x, y]);
  const points = projectedPoints(layer, local);
  await expect
    .poll(async () => (await previewPixels(page, points.slice(0, 1)))[0][1])
    .toBeLessThan(200);
  expectUniformPixels(
    await previewPixels(page, points),
    [255, 127, 127, 255],
    'Preview translucent plane',
  );
  expectUniformPixels(
    await exportedPngPixels(page, points),
    [255, 127, 127, 255],
    'PNG translucent plane',
  );
});

test('element 3D preserves image transparency and masks at tilt without mesh darkening', async ({
  page,
}) => {
  const src = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d')!;
    context.fillStyle = 'rgba(255, 0, 0, 0.5)';
    context.fillRect(0, 0, 256, 256);
    context.clearRect(96, 96, 64, 64);
    return canvas.toDataURL('image/png');
  });
  const layer = createLayer('image', {
    name: 'Transparent masked image',
    src,
    x: 100,
    y: 60,
    width: 256,
    height: 256,
    opacity: 0.6,
    radius: 0,
    mask: 'ellipse',
    duration: 4,
    transform3d: { enabled: true, rotateX: 32, rotateY: -25, z: 0, motion: 'none' },
  });
  const fixture: Project = {
    ...createProject(),
    name: 'Perspective image alpha',
    width: 512,
    height: 400,
    duration: 4,
    background: '#ffffff',
    layers: [layer],
    components: [],
  };
  await openProjectFixture(page, fixture);
  const solid: number[][] = [];
  for (let y = 56; y <= 200; y += 8)
    for (let x = 56; x <= 200; x += 8) {
      if (x < 84 || x > 172 || y < 84 || y > 172) solid.push([x, y]);
    }
  const clear = [
    [112, 112],
    [128, 128],
    [144, 144],
    [20, 20],
    [236, 20],
    [20, 236],
    [236, 236],
  ];
  const points = projectedPoints(layer, [...solid, ...clear]);
  await expect
    .poll(async () => (await previewPixels(page, points.slice(0, 1)))[0][1])
    .toBeLessThan(200);
  for (const [label, pixels] of [
    ['Preview', await previewPixels(page, points)],
    ['PNG', await exportedPngPixels(page, points)],
  ] as const) {
    expectUniformPixels(
      pixels.slice(0, solid.length),
      [255, 178, 178, 255],
      `${label} source alpha and layer opacity`,
      2,
    );
    expectUniformPixels(
      pixels.slice(solid.length),
      [255, 255, 255, 255],
      `${label} transparent hole and ellipse mask`,
    );
  }
});

test('element 3D layer view edits one pose and looping motion without changing the viewing camera', async ({
  page,
}) => {
  const fixture = element3dFixture();
  await openProjectFixture(page, fixture);
  const before = await saveProject(page, fixture.name);
  await page.getByRole('button', { name: '3D layers', exact: true }).click();
  const stage = page.getByRole('region', { name: '3D layer view', exact: true });
  const originalView = await stage.getAttribute('data-view');
  const zoom = await page.getByRole('slider', { name: '3D zoom', exact: true }).inputValue();
  const spacing = await page
    .getByRole('slider', { name: 'Layer spacing', exact: true })
    .inputValue();
  const panel = page.getByRole('complementary', { name: '3D layer stack', exact: true });
  await panel
    .getByRole('button', { name: 'Select 3D layer Perspective card', exact: true })
    .click();
  await panel.getByRole('switch', { name: 'Enable 3D for this element', exact: true }).click();
  for (const [label, value] of [
    ['Tilt X', '30'],
    ['Tilt Y', '-45'],
    ['Depth', '20'],
  ]) {
    const field = panel.getByRole('spinbutton', { name: `3D ${label} value`, exact: true });
    await field.fill(value);
    await field.press('Enter');
  }
  await panel.getByRole('button', { name: '3D Float', exact: true }).click();
  await panel.getByRole('spinbutton', { name: '3D motion period (s)', exact: true }).fill('4');
  await panel.getByRole('spinbutton', { name: '3D motion delay (s)', exact: true }).fill('1');
  const after = await saveProject(page, fixture.name);
  expect(after.layers[0].transform3d).toEqual({
    enabled: true,
    rotateX: 30,
    rotateY: -45,
    z: 20,
    motion: 'float',
  });
  expect(after.layers[0].animationDuration).toBe(4);
  expect(after.layers[0].animationDelay).toBe(1);
  expect(after.layers.map((layer) => layer.id)).toEqual(before.layers.map((layer) => layer.id));
  expect(after.layers.slice(1)).toEqual(before.layers.slice(1));
  await expect(stage).toHaveAttribute('data-view', originalView!);
  await expect(page.getByRole('slider', { name: '3D zoom', exact: true })).toHaveValue(zoom);
  await expect(page.getByRole('slider', { name: 'Layer spacing', exact: true })).toHaveValue(
    spacing,
  );
});

test('tool labels and the board grid collapse without changing project content', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  const original = await saveProject(page);
  const toolbar = page.getByRole('toolbar', { name: 'Canvas tools', exact: true });
  await expect(
    toolbar.locator('.creation-tool-label').filter({ hasText: /^Templates$/ }),
  ).toBeVisible();
  const expanded = (await toolbar.boundingBox())!;
  const canvas = (await page.getByLabel('Composition canvas', { exact: true }).boundingBox())!;
  expect(canvas.x).toBeGreaterThanOrEqual(expanded.x + expanded.width + 8);
  await page.getByRole('button', { name: 'Collapse tools', exact: true }).click();
  expect((await toolbar.boundingBox())!.width).toBeLessThan(expanded.width / 2);
  await page.getByRole('button', { name: 'Show tool labels', exact: true }).click();
  await page.getByRole('button', { name: 'Hide panels', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show tool labels', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show tool labels', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Collapse tools', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show panels', exact: true }).click();
  const board = page.getByRole('region', { name: 'Canvas board', exact: true });
  expect(await board.evaluate((node) => getComputedStyle(node).backgroundImage)).toContain(
    'radial-gradient',
  );
  const grid = page.getByRole('button', { name: 'Canvas grid', exact: true });
  await grid.click();
  expect(await board.evaluate((node) => getComputedStyle(node).backgroundImage)).toBe('none');
  await grid.click();
  expect(await saveProject(page)).toEqual(original);
});

test('shape keyboard choices, mask discovery and menu focus dismissal work together', async ({
  page,
}) => {
  const original = await saveProject(page);
  await page.getByRole('button', { name: 'Masks and effects', exact: true }).click();
  const masks = page.getByRole('dialog', { name: 'Masks & adjustments', exact: true });
  await expect(masks.getByLabel('Available mask shapes')).toBeVisible();
  await expect(masks.getByText('Diamond', { exact: true })).toBeVisible();
  await masks.getByRole('button', { name: 'Choose an element', exact: true }).click();
  await expect(masks).toHaveCount(0);
  await page.getByRole('button', { name: 'Add shape', exact: true }).click();
  const shapes = page.getByRole('dialog', { name: 'Shapes', exact: true });
  await expect(shapes.locator('.canvas-shape-grid button')).toHaveCount(9);
  await shapes.getByRole('button', { name: 'Add rectangle', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(shapes.getByRole('button', { name: 'Add diamond', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  const authored = await saveProject(page);
  expect(authored.layers.at(-1)).toMatchObject({
    name: 'Diamond',
    kind: 'svg',
    path: 'M160 0L320 120L160 240L0 120Z',
  });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page)).toEqual(original);
  await page.getByRole('button', { name: 'Drawing tools', exact: true }).click();
  const drawing = page.getByRole('dialog', { name: 'Drawing tools', exact: true });
  await expect(
    drawing.getByRole('img', { name: 'Drawing stroke preview', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Import', exact: true }).focus();
  await expect(drawing).toHaveCount(0);
});

test('color and background action from the 3D view opens the selected image color menu', async ({
  page,
}) => {
  const fixture = await imageToolsFixture(page);
  await openProjectFixture(page, fixture);
  const before = await saveProject(page, fixture.name);
  await page.getByRole('button', { name: '3D layers', exact: true }).click();
  await page.getByRole('button', { name: 'Select 3D layer Two colors', exact: true }).click();
  await page.getByRole('button', { name: 'Masks and effects', exact: true }).click();
  const masks = page.getByRole('dialog', { name: 'Masks & adjustments', exact: true });
  await masks.getByRole('button', { name: /^Color & background/ }).click();
  await expect(masks).toHaveCount(0);
  await expect(page.getByRole('region', { name: '3D layer view', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Composition canvas', { exact: true })).toBeVisible();
  await expect(editingMenu(page, 'Color')).toHaveAttribute('aria-pressed', 'true');
  const inspector = page.getByRole('complementary', { name: 'Properties', exact: true });
  await expect(
    inspector.getByRole('heading', { name: 'Color', exact: true, level: 2 }),
  ).toBeVisible();
  await expect(
    inspector.getByRole('button', { name: 'Remove solid background', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Timeline clip Two colors', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(await saveProject(page, fixture.name)).toEqual(before);
});

test('timeline time entry validates frames, locates the playhead and leaves project content unchanged', async ({
  page,
}) => {
  const fixture: Project = {
    ...createProject(),
    name: 'Timecode navigation',
    duration: 120,
    fps: 30,
    layers: [createLayer('shape', { name: 'Long card', duration: 120 })],
  };
  await openProjectFixture(page, fixture);
  const original = await saveProject(page, fixture.name);
  const clock = page.getByRole('button', { name: 'Current timeline time', exact: true });
  const ruler = page.getByRole('slider', { name: 'Timeline position', exact: true });
  const currentTime = async () => Number(await ruler.getAttribute('aria-valuenow'));
  await jumpToTime(page, '01:02:15');
  await expect.poll(currentTime).toBe(62.5);
  await expect(clock).toHaveText('01:02:15');
  await expect(clock).toBeFocused();
  await page.getByRole('button', { name: 'Reveal playhead', exact: true }).click();
  await expect(page.locator('.ruler-playhead')).toBeInViewport();
  await page.getByRole('button', { name: 'Next frame', exact: true }).click();
  await expect.poll(currentTime).toBeCloseTo(62.5 + 1 / 30, 3);
  await page.getByRole('button', { name: 'Previous frame', exact: true }).click();
  await expect.poll(currentTime).toBeCloseTo(62.5, 3);
  await clock.click();
  const input = page.getByRole('textbox', { name: 'Jump to time', exact: true });
  await input.fill('00:00:30');
  await input.press('Enter');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('alert')).toContainText('frames 0–29');
  expect(await currentTime()).toBeCloseTo(62.5, 3);
  await input.press('Escape');
  await expect(input).toHaveCount(0);
  await expect(clock).toBeFocused();
  expect(await currentTime()).toBeCloseTo(62.5, 3);
  await jumpToTime(page, '2.5');
  await expect.poll(currentTime).toBe(2.5);
  await jumpToTime(page, '999');
  await expect.poll(currentTime).toBeCloseTo(120 - 1 / 30, 3);
  await expect(page.getByRole('button', { name: 'Next frame', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Go to start', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Previous frame', exact: true })).toBeDisabled();
  expect(await saveProject(page, fixture.name)).toEqual(original);
});

test('selected motion opens readable entrance loop and exit controls at both editor sizes', async ({
  page,
}) => {
  const original = await saveProject(page);
  const action = page.getByRole('button', { name: 'Edit selected motion', exact: true });
  await expect(action).toBeDisabled();
  await page.getByRole('button', { name: 'Timeline clip Caption', exact: true }).click();
  for (const viewport of [
    { width: 1000, height: 700 },
    { width: 1500, height: 980 },
  ]) {
    await page.setViewportSize(viewport);
    await action.click();
    const editor = page.getByRole('group', { name: 'Motion editor for Caption', exact: true });
    await expect(editor).toBeVisible();
    const phases = await editor.locator('.timeline-motion-phase').evaluateAll((nodes) =>
      nodes.map((node) => {
        const bounds = node.getBoundingClientRect();
        return { x: bounds.x, right: bounds.right, width: bounds.width };
      }),
    );
    expect(phases).toHaveLength(3);
    for (const [index, phase] of phases.entries()) {
      expect(phase.x).toBeGreaterThanOrEqual(0);
      expect(phase.right).toBeLessThanOrEqual(viewport.width);
      expect(phase.width).toBeGreaterThan(200);
      if (index) expect(phase.x).toBeGreaterThanOrEqual(phases[index - 1].right);
    }
    const fields = editor.locator('.timeline-motion-phase input, .timeline-motion-phase select');
    for (const field of await fields.all()) {
      const box = (await field.boundingBox())!;
      expect(box.width, (await field.getAttribute('aria-label')) ?? '').toBeGreaterThanOrEqual(48);
      expect(box.height).toBeGreaterThanOrEqual(28);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    }
    await editor
      .getByRole('combobox', { name: 'Exit easing for Caption', exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      editor.getByRole('combobox', { name: 'Exit easing for Caption', exact: true }),
    ).toBeInViewport();
    await editor
      .getByRole('button', { name: 'Close motion editor for Caption', exact: true })
      .click();
    await expect(editor).toHaveCount(0);
  }
  expect(await saveProject(page)).toEqual(original);
});

test('advanced motion persists and resets in one undo while preserving element pose and other layers', async ({
  page,
}) => {
  const fixture = element3dFixture();
  fixture.layers[0].transform3d = {
    enabled: true,
    rotateX: 12,
    rotateY: -18,
    z: 22,
    motion: 'tilt-in',
  };
  await openProjectFixture(page, fixture);
  const original = await saveProject(page, fixture.name);
  await page.getByRole('button', { name: 'Timeline clip Perspective card', exact: true }).click();
  await page.getByRole('button', { name: 'Edit selected motion', exact: true }).click();
  const editor = page.getByRole('group', {
    name: 'Motion editor for Perspective card',
    exact: true,
  });
  await editor
    .getByRole('combobox', { name: 'Motion preset for Perspective card', exact: true })
    .selectOption('fall');
  for (const [name, value] of [
    ['Animation delay', '0.2'],
    ['Animation duration', '0.7'],
    ['Motion travel', '120'],
  ])
    await editor
      .getByRole('spinbutton', { name: `${name} for Perspective card`, exact: true })
      .fill(value);
  await editor
    .getByRole('combobox', { name: 'Animation easing for Perspective card', exact: true })
    .selectOption('linear');
  await editor
    .getByRole('combobox', { name: 'Loop motion for Perspective card', exact: true })
    .selectOption('float');
  await editor
    .getByRole('spinbutton', { name: 'Loop period for Perspective card', exact: true })
    .fill('1.6');
  await editor
    .getByRole('spinbutton', { name: 'Loop amount for Perspective card', exact: true })
    .fill('18');
  await editor
    .getByRole('combobox', { name: 'Exit motion for Perspective card', exact: true })
    .selectOption('slide-right');
  await editor
    .getByRole('spinbutton', { name: 'Exit duration for Perspective card', exact: true })
    .fill('0.6');
  await editor
    .getByRole('combobox', { name: 'Exit easing for Perspective card', exact: true })
    .selectOption('ease-in');
  const authored = await saveProject(page, fixture.name);
  expect(authored.layers[0]).toMatchObject({
    animation: 'fall',
    animationDelay: 0.2,
    animationDuration: 0.7,
    animationDistance: 120,
    animationEasing: 'linear',
    loopAnimation: 'float',
    loopDuration: 1.6,
    loopAmount: 18,
    exitAnimation: 'slide-right',
    exitDuration: 0.6,
    exitEasing: 'ease-in',
    transform3d: original.layers[0].transform3d,
  });
  expect(authored.layers.slice(1)).toEqual(original.layers.slice(1));
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await saveProject(page, fixture.name)).layers[0].exitEasing).not.toBe('ease-in');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(authored);
  await editor
    .getByRole('button', { name: 'Reset motion for Perspective card', exact: true })
    .click();
  const reset = await saveProject(page, fixture.name);
  expect(reset.layers[0]).toMatchObject({
    animation: 'none',
    animationDelay: 0,
    animationDuration: 0.6,
    exitAnimation: 'none',
    exitDuration: 0,
    loopAnimation: 'none',
    transform3d: { ...original.layers[0].transform3d, motion: 'none' },
    x: original.layers[0].x,
    y: original.layers[0].y,
    width: original.layers[0].width,
    height: original.layers[0].height,
  });
  expect(reset.layers.slice(1)).toEqual(original.layers.slice(1));
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(authored);
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled();
  expect(await saveProject(page, fixture.name)).toEqual(authored);
});

test('clip preview restarts at its own in point and stops on its final visible frame', async ({
  page,
}) => {
  const fixture: Project = {
    ...createProject(),
    name: 'Short motion preview',
    duration: 4,
    fps: 30,
    layers: [
      createLayer('shape', {
        name: 'Brief card',
        start: 1,
        duration: 0.4,
        animation: 'fade',
        animationDuration: 0.2,
      }),
    ],
  };
  await openProjectFixture(page, fixture);
  const original = await saveProject(page, fixture.name);
  await page.getByRole('button', { name: 'Timeline clip Brief card', exact: true }).click();
  await page.getByRole('button', { name: 'Edit selected motion', exact: true }).click();
  const ruler = page.getByRole('slider', { name: 'Timeline position', exact: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole('button', { name: 'Preview clip Brief card', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await expect
      .poll(async () => Number(await ruler.getAttribute('aria-valuenow')))
      .toBeCloseTo(1.4 - 1 / 30, 3);
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await page.waitForTimeout(120);
    expect(Number(await ruler.getAttribute('aria-valuenow'))).toBeCloseTo(1.4 - 1 / 30, 3);
  }
  expect(await saveProject(page, fixture.name)).toEqual(original);
});

test('directional exits and float pulse loops agree between preview and exported pixels', async ({
  page,
}) => {
  const fixture: Project = {
    ...createProject(),
    name: 'Motion pixels',
    width: 600,
    height: 400,
    duration: 4,
    background: '#ffffff',
    layers: [
      createLayer('shape', {
        name: 'Floating red card',
        x: 100,
        y: 120,
        width: 100,
        height: 80,
        radius: 0,
        fill: '#ff0000',
        duration: 4,
        animation: 'none',
        loopAnimation: 'float',
        loopDuration: 2,
        loopAmount: 20,
        exitAnimation: 'slide-right',
        exitDuration: 1,
        exitEasing: 'linear',
        animationDistance: 100,
      }),
      createLayer('shape', {
        name: 'Pulsing blue card',
        x: 320,
        y: 120,
        width: 100,
        height: 80,
        radius: 0,
        fill: '#0000ff',
        duration: 4,
        animation: 'none',
        loopAnimation: 'pulse',
        loopDuration: 2,
        loopAmount: 40,
      }),
    ],
  };
  await openProjectFixture(page, fixture);
  const original = await saveProject(page, fixture.name);
  const points = [
    [110, 125],
    [110, 145],
    [170, 130],
    [305, 130],
  ];
  const white = [255, 255, 255, 255],
    red = [255, 0, 0, 255],
    blue = [0, 0, 255, 255];
  for (const [time, expected] of [
    ['0.5', [white, red, white, white]],
    ['1', [red, red, red, blue]],
    ['3.5', [white, white, [255, 128, 128, 255], white]],
  ] as [string, number[][]][]) {
    await jumpToTime(page, time);
    await expect
      .poll(
        async () => {
          const pixels = await previewPixels(page, points);
          return pixels.every((pixel, index) =>
            pixel.every((value, channel) => Math.abs(value - expected[index][channel]) <= 1),
          );
        },
        { message: `Preview pixels at ${time}s` },
      )
      .toBe(true);
    for (const [index, pixel] of (await exportedPngPixels(page, points)).entries())
      expectUniformPixels([pixel], expected[index], `PNG sample ${index} at ${time}s`);
  }
  expect(await saveProject(page, fixture.name)).toEqual(original);
});

function keyframeFixture(tracked = true): Project {
  const frame = (id: string, time: number, value: number) => ({
    id,
    time,
    value,
    easing: 'linear' as const,
  });
  return {
    ...createProject(),
    name: 'Keyframe study',
    width: 640,
    height: 480,
    duration: 6,
    fps: 30,
    background: '#ffffff',
    components: [],
    layers: [
      createLayer('shape', {
        name: 'Keyframe card',
        start: 1,
        duration: 4,
        x: 20,
        y: 20,
        width: 40,
        height: 30,
        fill: '#ff0000',
        radius: 0,
        ...(tracked
          ? {
              keyframes: {
                x: [frame('position-x-a', 0, 80), frame('position-x-b', 2, 240)],
                y: [frame('position-y-a', 0, 80), frame('position-y-b', 2, 160)],
                width: [frame('size-w-a', 0, 80), frame('size-w-b', 2, 160)],
                height: [frame('size-h-a', 0, 40), frame('size-h-b', 2, 80)],
                rotation: [frame('rotation-a', 0, 0), frame('rotation-b', 2, 90)],
                opacity: [frame('opacity-a', 0, 1), frame('opacity-b', 2, 0.5)],
              },
            }
          : {}),
      }),
      createLayer('shape', {
        name: 'Unchanged card',
        x: 500,
        y: 360,
        width: 50,
        height: 40,
        fill: '#00ff00',
        duration: 6,
      }),
      createLayer('audio', { name: 'Keyframe sound', duration: 6 }),
    ],
  };
}

async function openKeyframes(page: Page, name = 'Keyframe card') {
  await page.getByRole('button', { name: `Edit motion for ${name}`, exact: true }).click();
  const motion = page.getByRole('group', { name: `Motion editor for ${name}`, exact: true });
  await motion.getByRole('tab', { name: 'Keyframes', exact: true }).click();
  return motion.getByRole('group', { name: `Keyframes for ${name}`, exact: true });
}

test('property keyframes author all four controls at clip-local times and persist without changing sibling layers', async ({
  page,
}) => {
  const fixture = keyframeFixture(false);
  await openProjectFixture(page, fixture);
  const original = await saveProject(page, fixture.name);
  const keys = await openKeyframes(page);
  await jumpToTime(page, '1.5');
  for (const property of ['Position', 'Size', 'Rotation', 'Opacity'])
    await keys
      .getByRole('button', { name: `Add ${property} keyframe for Keyframe card`, exact: true })
      .click();
  for (const [label, value] of [
    ['Position X', '80'],
    ['Position Y', '90'],
    ['Size W', '100'],
    ['Size H', '60'],
    ['Rotation value', '0'],
    ['Opacity value', '100'],
  ])
    await keys
      .getByRole('spinbutton', { name: `${label} for Keyframe card`, exact: true })
      .fill(value);
  await jumpToTime(page, '3.5');
  for (const [label, value] of [
    ['Position X', '240'],
    ['Position Y', '170'],
    ['Size W', '200'],
    ['Size H', '140'],
    ['Rotation value', '90'],
    ['Opacity value', '50'],
  ])
    await keys
      .getByRole('spinbutton', { name: `${label} for Keyframe card`, exact: true })
      .fill(value);
  const authored = await saveProject(page, fixture.name);
  const tracks = authored.layers[0].keyframes!;
  for (const [property, values] of Object.entries({
    x: [80, 240],
    y: [90, 170],
    width: [100, 200],
    height: [60, 140],
    rotation: [0, 90],
    opacity: [1, 0.5],
  })) {
    const frames = tracks[property as keyof typeof tracks]!;
    expect(frames.map(({ time }) => time)).toEqual([0.5, 2.5]);
    expect(frames.map(({ value }) => value)).toEqual(values);
    expect(new Set(frames.map(({ id }) => id)).size).toBe(2);
  }
  expect(authored.layers.slice(1)).toEqual(original.layers.slice(1));
  for (const field of ['x', 'y', 'width', 'height', 'rotation', 'opacity'] as const)
    expect(authored.layers[0][field]).toBe(original.layers[0][field]);
  await jumpToTime(page, '2.5');
  for (const [label, value] of [
    ['Position X', '160'],
    ['Position Y', '130'],
    ['Size W', '150'],
    ['Size H', '100'],
    ['Rotation value', '45'],
    ['Opacity value', '75'],
  ])
    await expect(
      keys.getByRole('spinbutton', { name: `${label} for Keyframe card`, exact: true }),
    ).toHaveValue(value);
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled();
  expect(await saveProject(page, fixture.name)).toEqual(authored);
});

test('keyframe diamonds snap paired properties to frames and preserve single gesture undo and redo', async ({
  page,
}) => {
  const fixture = keyframeFixture();
  await openProjectFixture(page, fixture);
  const keys = await openKeyframes(page);
  const before = await saveProject(page, fixture.name);
  const diamond = keys.getByRole('button', {
    name: 'Position keyframe at 2.00 seconds for Keyframe card',
    exact: true,
  });
  await diamond.scrollIntoViewIfNeeded();
  const box = (await diamond.boundingBox())!;
  const pixels = Number(
    await page.getByRole('slider', { name: 'Timeline zoom', exact: true }).inputValue(),
  );
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + pixels * 0.51, box.y + box.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  const moved = await saveProject(page, fixture.name);
  expect(moved.layers[0].keyframes!.x!.map(({ time }) => time)).toEqual([0, 2.5]);
  expect(moved.layers[0].keyframes!.y!.map(({ time }) => time)).toEqual([0, 2.5]);
  expect(moved.layers[0].keyframes!.rotation).toEqual(before.layers[0].keyframes!.rotation);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(before);
  await keys
    .getByRole('button', {
      name: 'Position keyframe at 2.00 seconds for Keyframe card',
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(moved);
  const movedDiamond = keys.getByRole('button', {
    name: 'Position keyframe at 2.50 seconds for Keyframe card',
    exact: true,
  });
  await movedDiamond.focus();
  await movedDiamond.press('ArrowRight');
  const stepped = await saveProject(page, fixture.name);
  expect(stepped.layers[0].keyframes!.x![1].time).toBeCloseTo(2.5 + 1 / 30, 6);
  expect(stepped.layers[0].keyframes!.y![1].time).toBeCloseTo(2.5 + 1 / 30, 6);
  await keys
    .getByRole('spinbutton', { name: 'Selected keyframe time for Keyframe card', exact: true })
    .fill('0');
  const collided = await saveProject(page, fixture.name);
  expect(collided.layers[0].keyframes!.x).toHaveLength(1);
  expect(collided.layers[0].keyframes!.y).toHaveLength(1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(stepped);
});

test('keyframe curves edit the outgoing segment with pointer and keyboard undo while keeping the last key disabled', async ({
  page,
}) => {
  const fixture = keyframeFixture();
  await openProjectFixture(page, fixture);
  const keys = await openKeyframes(page);
  await keys
    .getByRole('button', {
      name: 'Rotation keyframe at 0.00 seconds for Keyframe card',
      exact: true,
    })
    .click();
  const curve = keys.getByRole('combobox', {
    name: 'Keyframe curve for Keyframe card',
    exact: true,
  });
  await curve.selectOption('ease-in');
  await jumpToTime(page, '2');
  const easedRotation = Number(
    await keys
      .getByRole('spinbutton', { name: 'Rotation value for Keyframe card', exact: true })
      .inputValue(),
  );
  expect(easedRotation).toBeGreaterThan(0);
  expect(easedRotation).toBeLessThan(45);
  await keys
    .getByRole('button', {
      name: 'Rotation keyframe at 0.00 seconds for Keyframe card',
      exact: true,
    })
    .click();
  await curve.selectOption('hold');
  await jumpToTime(page, '2');
  await expect(
    keys.getByRole('spinbutton', { name: 'Rotation value for Keyframe card', exact: true }),
  ).toHaveValue('0');
  await keys
    .getByRole('button', {
      name: 'Rotation keyframe at 0.00 seconds for Keyframe card',
      exact: true,
    })
    .click();
  await curve.selectOption('custom');
  const custom = await saveProject(page, fixture.name);
  const start = keys.getByRole('button', {
    name: 'Curve start handle for Keyframe card',
    exact: true,
  });
  await start.press('ArrowRight');
  const keyboard = await saveProject(page, fixture.name);
  expect(keyboard.layers[0].keyframes!.rotation![0].curve![0]).toBeCloseTo(
    custom.layers[0].keyframes!.rotation![0].curve![0] + 0.02,
    6,
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(custom);
  const end = keys.getByRole('button', { name: 'Curve end handle for Keyframe card', exact: true });
  await end.scrollIntoViewIfNeeded();
  const bounds = (await end.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 18, bounds.y + bounds.height / 2 - 12, {
    steps: 8,
  });
  await page.mouse.up();
  const dragged = await saveProject(page, fixture.name);
  expect(dragged.layers[0].keyframes!.rotation![0].curve).not.toEqual(
    custom.layers[0].keyframes!.rotation![0].curve,
  );
  expect(dragged.layers[0].keyframes!.x).toEqual(custom.layers[0].keyframes!.x);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(custom);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(dragged);
  await keys
    .getByRole('button', {
      name: 'Rotation keyframe at 2.00 seconds for Keyframe card',
      exact: true,
    })
    .click();
  await expect(curve).toBeDisabled();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled();
  expect(await saveProject(page, fixture.name)).toEqual(dragged);
});

test('keyframe delete is isolated from layer deletion and locked or audio layers cannot change tracks', async ({
  page,
}) => {
  const fixture = keyframeFixture();
  await openProjectFixture(page, fixture);
  const keys = await openKeyframes(page);
  const before = await saveProject(page, fixture.name);
  const key = keys.getByRole('button', {
    name: 'Rotation keyframe at 2.00 seconds for Keyframe card',
    exact: true,
  });
  await key.click();
  await key.press('Delete');
  const deleted = await saveProject(page, fixture.name);
  expect(deleted.layers).toHaveLength(before.layers.length);
  expect(deleted.layers[0].keyframes!.rotation).toHaveLength(1);
  expect(deleted.layers[0].keyframes!.x).toEqual(before.layers[0].keyframes!.x);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(before);
  await keys
    .getByRole('button', {
      name: 'Rotation keyframe at 0.00 seconds for Keyframe card',
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Lock Keyframe card', exact: true }).click();
  const locked = await saveProject(page, fixture.name);
  await expect(
    keys.getByRole('spinbutton', { name: 'Position X for Keyframe card', exact: true }),
  ).toBeDisabled();
  await expect(
    keys.getByRole('button', { name: 'Delete selected keyframe for Keyframe card', exact: true }),
  ).toBeDisabled();
  await expect(
    keys.getByRole('combobox', { name: 'Keyframe curve for Keyframe card', exact: true }),
  ).toBeDisabled();
  expect(await saveProject(page, fixture.name)).toEqual(locked);
  await page.getByRole('button', { name: 'Edit audio for Keyframe sound', exact: true }).click();
  const audio = page.getByRole('group', { name: 'Audio editor for Keyframe sound', exact: true });
  await expect(audio.getByRole('tab', { name: 'Keyframes', exact: true })).toHaveCount(0);
  expect(await saveProject(page, fixture.name)).toEqual(locked);
});

test('keyframed geometry and opacity match PNG and evaluated canvas picking in flat and tilted views', async ({
  page,
}) => {
  const fixture = keyframeFixture();
  await openProjectFixture(page, fixture);
  const before = await saveProject(page, fixture.name);
  await jumpToTime(page, '2');
  const points = [
    [220, 150],
    [255, 185],
    [30, 30],
  ];
  const expected = [
    [255, 64, 64, 255],
    [255, 64, 64, 255],
    [255, 255, 255, 255],
  ];
  await expect.poll(async () => (await previewPixels(page, points))[0][1]).toBe(64);
  for (const [index, pixel] of (await previewPixels(page, points)).entries())
    expectUniformPixels([pixel], expected[index], `Flat preview ${index}`);
  for (const [index, pixel] of (await exportedPngPixels(page, points)).entries())
    expectUniformPixels([pixel], expected[index], `Flat PNG ${index}`);
  // Closing export currently returns the transport to the composition start.
  await jumpToTime(page, '2');
  const canvas = page.getByLabel('Composition canvas');
  const bounds = (await canvas.boundingBox())!;
  const scale = bounds.width / fixture.width;
  await page.mouse.click(bounds.x + 220 * scale, bounds.y + 150 * scale);
  await expect(
    page.getByRole('button', { name: 'Timeline clip Keyframe card', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  const selected = page.locator('.selection-box').last();
  const outline = await selected.evaluate((element) => ({
    width: parseFloat((element as HTMLElement).style.width),
    height: parseFloat((element as HTMLElement).style.height),
    transform: (element as HTMLElement).style.transform,
  }));
  expect(outline.width).toBeCloseTo(120 * scale, 1);
  expect(outline.height).toBeCloseTo(60 * scale, 1);
  expect(outline.transform).toContain('45deg');
  const inspector = page.getByRole('complementary', { name: 'Properties', exact: true });
  await inspector.getByRole('switch', { name: 'Enable 3D for this element', exact: true }).click();
  await inspector.getByRole('button', { name: 'Tilt left', exact: true }).click();
  await inspector.getByRole('button', { name: 'Close properties', exact: true }).click();
  await jumpToTime(page, '2');
  await expect.poll(async () => (await previewPixels(page, [[220, 150]]))[0][1]).toBe(64);
  const tiltedPixels = await previewPixels(page, [[220, 150]]);
  expect(await exportedPngPixels(page, [[220, 150]])).toEqual(tiltedPixels);
  const authored = await saveProject(page, fixture.name);
  expect(authored.layers[0].keyframes).toEqual(before.layers[0].keyframes);
  expect(authored.layers.slice(1)).toEqual(before.layers.slice(1));
});

test('dragging an evaluated keyed element inserts keys at the playhead with one undo and preserves base geometry', async ({
  page,
}) => {
  const fixture = keyframeFixture();
  fixture.layers[0].keyframes = {
    x: fixture.layers[0].keyframes!.x,
    y: fixture.layers[0].keyframes!.y,
  };
  fixture.layers[0].width = 100;
  fixture.layers[0].height = 60;
  await openProjectFixture(page, fixture);
  await jumpToTime(page, '2');
  const before = await saveProject(page, fixture.name);
  const canvas = (await page.getByLabel('Composition canvas').boundingBox())!;
  const scale = canvas.width / fixture.width;
  const x = canvas.x + 200 * scale,
    y = canvas.y + 150 * scale;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 30 * scale, y + 20 * scale, { steps: 8 });
  await page.mouse.up();
  const moved = await saveProject(page, fixture.name);
  expect(moved.layers[0].x).toBe(before.layers[0].x);
  expect(moved.layers[0].y).toBe(before.layers[0].y);
  expect(moved.layers[0].keyframes!.x!.map(({ time }) => time)).toEqual([0, 1, 2]);
  expect(moved.layers[0].keyframes!.y!.map(({ time }) => time)).toEqual([0, 1, 2]);
  expect(moved.layers[0].keyframes!.x![1].value).toBeCloseTo(190, 0);
  expect(moved.layers[0].keyframes!.y![1].value).toBeCloseTo(140, 0);
  expect(moved.layers.slice(1)).toEqual(before.layers.slice(1));
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(before);
  const inspector = page.getByRole('complementary', { name: 'Properties', exact: true });
  const position = inspector.getByRole('spinbutton', { name: 'X', exact: true });
  await expect(position).toHaveValue('160');
  await position.fill('205');
  const precise = await saveProject(page, fixture.name);
  expect(precise.layers[0].x).toBe(before.layers[0].x);
  expect(precise.layers[0].keyframes!.x![1]).toMatchObject({ time: 1, value: 205 });
  expect(precise.layers[0].keyframes!.y).toEqual(before.layers[0].keyframes!.y);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(before);
});

test('splitting a custom keyed clip retains exact sampled frames on both sides and exports the same image', async ({
  page,
}) => {
  const fixture = keyframeFixture();
  fixture.layers[0].keyframes!.x![0] = {
    ...fixture.layers[0].keyframes!.x![0],
    easing: 'custom',
    curve: [0.2, 0.1, 0.7, 0.8],
  };
  await openProjectFixture(page, fixture);
  const original = await saveProject(page, fixture.name);
  const points = Array.from({ length: 48 }, (_, row) =>
    Array.from({ length: 64 }, (_, column) => [column * 10 + 5, row * 10 + 5]),
  ).flat();
  const samples: { points: number[][]; pixels: number[][] }[] = [];
  for (const time of ['1.5', '2.5']) {
    await jumpToTime(page, time);
    const pixels = await previewPixels(page, points);
    // Chromium can switch canvas raster backends after readback. Compare interiors,
    // excluding a 10px ring around all antialiased edges, including unchanged layers.
    const stable = pixels
      .map((pixel, index) => ({ pixel, index }))
      .filter(
        ({ pixel, index }) =>
          index >= 65 &&
          index < pixels.length - 65 &&
          index % 64 > 0 &&
          index % 64 < 63 &&
          [-65, -64, -63, -1, 1, 63, 64, 65].every((offset) =>
            pixels[index + offset].every((channel, i) => channel === pixel[i]),
          ),
      );
    expect(stable.filter(({ pixel }) => pixel[0] === 255 && pixel[1] < 200).length).toBeGreaterThan(
      5,
    );
    samples.push({
      points: stable.map(({ index }) => points[index]),
      pixels: stable.map(({ pixel }) => pixel),
    });
  }
  await page.getByRole('button', { name: 'Timeline clip Keyframe card', exact: true }).click();
  await jumpToTime(page, '2');
  await page.getByRole('button', { name: 'Split clip', exact: true }).click();
  const split = await saveProject(page, fixture.name);
  const clips = split.layers.filter(
    (layer) => layer.kind === 'shape' && layer.name.startsWith('Keyframe card'),
  );
  expect(clips).toHaveLength(2);
  expect(clips.find((layer) => layer.start === 2)?.keyframeOffset).toBe(1);
  for (const [index, time] of ['1.5', '2.5'].entries()) {
    await jumpToTime(page, time);
    await expect
      .poll(() => previewPixels(page, samples[index].points))
      .toEqual(samples[index].pixels);
    expect(await exportedPngPixels(page, samples[index].points)).toEqual(samples[index].pixels);
  }
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(original);
});

test('keyframe lanes and selected curve controls remain reachable in small and large editor windows', async ({
  page,
}) => {
  const fixture = keyframeFixture();
  await openProjectFixture(page, fixture);
  const before = await saveProject(page, fixture.name);
  const keys = await openKeyframes(page);
  for (const viewport of [
    { width: 1000, height: 700 },
    { width: 1500, height: 980 },
  ]) {
    await page.setViewportSize(viewport);
    for (const property of ['Position', 'Size', 'Rotation', 'Opacity']) {
      const row = keys.getByRole('group', {
        name: `${property} keyframes for Keyframe card`,
        exact: true,
      });
      await row
        .getByRole('button', {
          name: `${property} keyframe at 0.00 seconds for Keyframe card`,
          exact: true,
        })
        .click();
      const label = row.locator('.keyframe-row-label');
      await label.scrollIntoViewIfNeeded();
      await expect(label).toBeInViewport();
      for (const input of await row.getByRole('spinbutton').all()) {
        const box = (await input.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(45);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      }
    }
    const curve = keys.getByRole('combobox', {
      name: 'Keyframe curve for Keyframe card',
      exact: true,
    });
    await curve.scrollIntoViewIfNeeded();
    await expect(curve).toBeInViewport();
    for (const handleName of [
      'Curve start handle for Keyframe card',
      'Curve end handle for Keyframe card',
    ]) {
      const handle = keys.getByRole('button', { name: handleName, exact: true });
      await handle.scrollIntoViewIfNeeded();
      await expect(handle).toBeInViewport();
      const box = (await handle.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    }
  }
  expect(await saveProject(page, fixture.name)).toEqual(before);
});

test('invalid property keyframe imports leave the current composition and redo history intact', async ({
  page,
}) => {
  const original = await saveProject(page);
  await page.getByRole('button', { name: 'Add text', exact: true }).click();
  const authored = await saveProject(page);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const malformed = keyframeFixture();
  malformed.layers[0].keyframes!.x![1].time = 0;
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'A little idea', exact: true })
    .click();
  const chosen = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open project', exact: true }).click();
  await (
    await chosen
  ).setFiles({
    name: 'invalid-keyframes.framestudio',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(malformed)),
  });
  await expect(page.getByRole('status')).toContainText(
    'Keyframes must be sorted with unique times',
  );
  expect(await saveProject(page)).toEqual(original);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await saveProject(page)).toEqual(authored);
});

test('endpoint keyframe typing edits the selected final key and undoes the whole field gesture once', async ({
  page,
}) => {
  const fixture = keyframeFixture();
  fixture.duration = 5;
  fixture.layers[0].keyframes!.x![1].time = 4;
  fixture.layers[0].keyframes!.y![1].time = 4;
  fixture.layers[1].duration = 5;
  fixture.layers[2].duration = 5;
  await openProjectFixture(page, fixture);
  const keys = await openKeyframes(page);
  await keys
    .getByRole('button', {
      name: 'Position keyframe at 4.00 seconds for Keyframe card',
      exact: true,
    })
    .click();
  const before = await saveProject(page, fixture.name);
  const x = keys.getByRole('spinbutton', { name: 'Position X for Keyframe card', exact: true });
  await expect(x).toHaveValue('240');
  await x.focus();
  await x.press('ControlOrMeta+A');
  await x.pressSequentially('320');
  await x.press('Enter');
  const authored = await saveProject(page, fixture.name);
  expect(authored.layers[0].keyframes!.x!.map(({ time }) => time)).toEqual([0, 4]);
  expect(authored.layers[0].keyframes!.x![1].value).toBe(320);
  expect(authored.layers[0].keyframes!.y).toEqual(before.layers[0].keyframes!.y);
  expect(authored.layers[0].x).toBe(before.layers[0].x);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(before);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await saveProject(page, fixture.name)).toEqual(authored);
});
