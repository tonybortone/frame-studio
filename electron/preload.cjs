'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// No filesystem, shell, arbitrary IPC, or network primitive crosses this boundary.
contextBridge.exposeInMainWorld(
  'frameDesktop',
  Object.freeze({
    platform: process.platform,
    saveFile: (name, bytes) => ipcRenderer.invoke('frame:save-file', name, bytes),
    openProject: () => ipcRenderer.invoke('frame:open-project'),
  }),
);
