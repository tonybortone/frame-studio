import { readFile } from 'node:fs/promises';
import { expect, test, type Download, type Page } from '@playwright/test';
import { parseProject } from '../src/core/project';

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
  await expect(
    page.getByRole('button', { name: 'Toggle properties', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByLabel('Project name')).not.toBeVisible();
  await page.getByRole('button', { name: 'Toggle properties', exact: true }).click();
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
  await page.getByLabel('Element color').fill('#112233');

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
  await page.getByRole('button', { name: 'Toggle properties', exact: true }).click();
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
  ).toBeDisabled();
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
  await expect(
    page.getByRole('button', { name: 'Toggle properties', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
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
    ['Components', '0'],
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

test('preview dock seeks, advances during playback, and pauses without editing the project', async ({
  page,
}) => {
  const original = await saveProject(page);
  const dock = page.getByRole('group', { name: 'Preview playback', exact: true });
  const position = dock.getByRole('slider', { name: 'Preview position', exact: true });
  const currentTime = async () => Number(await position.inputValue());
  const lastFrame = original.duration - 1 / original.fps;

  // Native range keyboard controls exercise the same seeking path as the dot display.
  await position.focus();
  await position.press('Home');
  for (let step = 0; step < 5; step++) await position.press('PageUp');
  await expect.poll(currentTime).toBeCloseTo(original.duration / 2, 1);
  const seekedTime = await currentTime();

  await dock.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(dock.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect.poll(currentTime).toBeGreaterThan(seekedTime + 0.15);
  await dock.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(dock.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  const pausedTime = await currentTime();
  // Observe several animation frames after pausing to catch a clock that keeps running.
  await page.waitForTimeout(300);
  expect(await currentTime()).toBeCloseTo(pausedTime, 4);

  // Space must activate focused transport buttons, rather than the global play shortcut.
  await dock.getByRole('button', { name: 'Go to start', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect.poll(currentTime).toBe(0);
  await expect(dock.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await dock.getByRole('button', { name: 'Go to end', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect.poll(currentTime).toBeCloseTo(lastFrame, 2);
  await expect(dock.getByRole('button', { name: 'Play', exact: true })).toBeVisible();

  // A global Space press at the last frame must restart playback like the Play button.
  await page.getByRole('region', { name: 'Canvas board', exact: true }).focus();
  await page.mouse.move(10, 10); // Space over the board is reserved for panning.
  await page.keyboard.press('Space');
  await expect(dock.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect.poll(currentTime).toBeGreaterThan(0.05);
  expect(await currentTime()).toBeLessThan(original.duration / 2);
  await page.keyboard.press('Space');
  await expect(dock.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  const keyboardPausedTime = await currentTime();
  await page.waitForTimeout(150);
  expect(await currentTime()).toBeCloseTo(keyboardPausedTime, 4);

  await dock.getByRole('button', { name: 'Go to start', exact: true }).click();
  const meter = await position.boundingBox();
  expect(meter).not.toBeNull();
  await position.click({ position: { x: meter!.width - 2, y: meter!.height / 2 } });
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
