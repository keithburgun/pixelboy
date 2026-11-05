// Exposes a small, safe desktop API to the app as window.pixelboyDesktop.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pixelboyDesktop', {
  openFile: (filters) => ipcRenderer.invoke('file:open', { filters }),
  readFile: (path) => ipcRenderer.invoke('file:read', path),
  saveFile: (opts) => ipcRenderer.invoke('file:save', opts), // {path?, defaultName, filters, data: Uint8Array}
  pendingOpenPath: () => ipcRenderer.invoke('app:pending-open'),
  onOpenPath: (cb) => ipcRenderer.on('open-path', (_e, p) => cb(p)),
  setTitle: (t) => ipcRenderer.send('app:set-title', t),
  version: () => ipcRenderer.invoke('app:version'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (_e, s) => cb(s)),
});
