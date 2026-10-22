'use strict';

const { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ORIGIN = 'frame://studio';
const MAX_PROJECT_BYTES = 100 * 1024 * 1024;
const MAX_SAVE_BYTES = 512 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  '.json',
  '.frame',
  '.framestudio',
  '.mp4',
  '.webm',
  '.png',
  '.svg',
]);
const DIST_PATH = path.resolve(__dirname, '..', 'dist');
const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'";
let mainWindow;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'frame',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

function isInside(root, filename) {
  const relative = path.relative(root, filename);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

/** Only compiled app assets are served; paths and symlinks cannot escape dist. */
async function serveAsset(request) {
  try {
    const url = new URL(request.url);
    if (
      url.protocol !== 'frame:' ||
      url.hostname !== 'studio' ||
      url.port ||
      url.username ||
      url.password ||
      !['GET', 'HEAD'].includes(request.method)
    )
      return new Response('Forbidden', { status: 403 });
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.includes('\0') || pathname.includes('\\'))
      return new Response('Forbidden', { status: 403 });
    const filename = path.resolve(DIST_PATH, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!isInside(DIST_PATH, filename)) return new Response('Forbidden', { status: 403 });
    const [realRoot, realFile] = await Promise.all([fs.realpath(DIST_PATH), fs.realpath(filename)]);
    if (!isInside(realRoot, realFile) || !(await fs.stat(realFile)).isFile())
      return new Response('Forbidden', { status: 403 });
    const result = await net.fetch(pathToFileURL(realFile).href, { method: request.method });
    const headers = new Headers(result.headers);
    headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(result.body, { status: result.status, headers });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

function validateSender(event) {
  if (
    !mainWindow ||
    event.sender !== mainWindow.webContents ||
    event.senderFrame !== event.sender.mainFrame
  )
    throw new Error('Untrusted sender.');
  const url = new URL(event.senderFrame.url);
  if (
    url.protocol !== 'frame:' ||
    url.hostname !== 'studio' ||
    url.port ||
    url.username ||
    url.password
  )
    throw new Error('Untrusted sender.');
}

function installIpc() {
  ipcMain.handle('frame:save-file', async (event, name, bytes) => {
    validateSender(event);
    if (
      typeof name !== 'string' ||
      name.length < 1 ||
      name.length > 180 ||
      path.basename(name) !== name ||
      /[\0\\/:]/.test(name) ||
      !ALLOWED_EXTENSIONS.has(path.extname(name).toLowerCase())
    )
      throw new Error('Unsupported output filename.');
    if (
      !(bytes instanceof ArrayBuffer) ||
      bytes.byteLength === 0 ||
      bytes.byteLength > MAX_SAVE_BYTES
    )
      throw new Error('Output must be between 1 byte and 512 MB.');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save from Frame Studio',
      defaultPath: name,
      filters: [{ name: 'Export', extensions: [path.extname(name).slice(1)] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await fs.writeFile(result.filePath, Buffer.from(bytes));
    return { canceled: false, path: result.filePath };
  });
  ipcMain.handle('frame:open-project', async (event) => {
    validateSender(event);
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open a Frame Studio project',
      properties: ['openFile'],
      filters: [{ name: 'Frame Studio project', extensions: ['framestudio', 'frame', 'json'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const handle = await fs.open(result.filePaths[0], 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > MAX_PROJECT_BYTES)
        throw new Error('Project files must be smaller than 100 MB.');
      const bytes = await handle.readFile();
      if (bytes.byteLength > MAX_PROJECT_BYTES) throw new Error('Project file is too large.');
      return bytes.toString('utf8');
    } finally {
      await handle.close();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#101113',
    title: 'Frame Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.on('closed', () => {
    mainWindow = undefined;
  });
  void mainWindow.loadURL(`${ORIGIN}/index.html`);
}

app.whenReady().then(() => {
  protocol.handle('frame', serveAsset);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  installIpc();
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin'
        ? [
            {
              label: 'Frame Studio',
              submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' },
              ],
            },
          ]
        : []),
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: 'View',
        submenu: [
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
      { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }] },
    ]),
  );
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
