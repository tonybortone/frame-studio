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
  await page
    .getByRole('button', { name: 'Orange card', exact: true })
    .click({ modifiers: ['Shift'] });
  await expect(page.getByText('2 elements', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Group / ungroup selection', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Elements grouped');

  await page.getByRole('button', { name: 'Save component', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Keep a good thing.' });
  await dialog.getByLabel('Component name').fill('Lower third');
  await dialog.getByRole('button', { name: 'Save component', exact: true }).click();
  await expect(dialog).not.toBeVisible();

  await page.getByRole('tab', { name: 'Files', exact: true }).click();
  await page.getByRole('button', { name: 'Personalised', exact: true }).click();
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
  await page.getByLabel('Canvas aspect ratio').selectOption('9:16');
  const canvas = page.getByLabel('Composition canvas');
  await expect(canvas).toHaveAttribute('width', '1080');
  await expect(canvas).toHaveAttribute('height', '1920');

  const saved = await saveProject(page);
  expect([saved.width, saved.height]).toEqual([1080, 1920]);
  expect(saved.layers).toHaveLength(6);
  const card = saved.layers.find((layer) => layer.name === 'Orange card')!;
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
  const dialog = page.getByRole('dialog', { name: 'Ready for its next frame.' });
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
  await page.getByRole('button', { name: 'Vectors', exact: true }).click();
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

test('loads the supplied folder artwork and browses files without changing the scene', async ({
  page,
}) => {
  const library = page.getByRole('complementary', { name: 'Library' });
  for (const name of ['Videos', 'Audio', 'Images', 'Vectors', 'Fonts', 'Personalised']) {
    const folder = library.getByRole('button', { name, exact: true });
    await expect(folder).toBeVisible();
    await expect
      .poll(() =>
        folder.locator('img').evaluate((image) => {
          const artwork = image as HTMLImageElement;
          return artwork.complete && artwork.naturalWidth > 0;
        }),
      )
      .toBe(true);
  }
  await library.getByRole('button', { name: 'Videos', exact: true }).click();
  await expect(library.getByText('No videos yet.', { exact: true })).toBeVisible();
  await library.getByRole('button', { name: 'Back to files', exact: true }).click();
  await library.getByRole('button', { name: 'Vectors', exact: true }).click();
  await expect(library.getByRole('button', { name: 'Rectangle', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Timeline clip / })).toHaveCount(6);
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
