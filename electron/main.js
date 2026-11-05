// PixelBoy — Electron main process.
// Creates the window, handles native file dialogs, and auto-updates from GitHub Releases.
const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch (e) { /* not installed in dev */ }

let win = null;
let pendingOpenPath = null;

function fileArg(argv) {
  return argv.slice(1).find(a => /\.(pixelboy|psd|png|jpe?g|gif|webp)$/i.test(a) && fs.existsSync(a)) || null;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1f1f1f',
    title: 'PixelBoy',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  Menu.setApplicationMenu(null); // the app draws its own Photoshop-style menu bar
  win.loadFile(path.join(__dirname, '..', 'app', 'index.html'));
  win.once('ready-to-show', () => { win.maximize(); win.show(); });

  // Unsaved-changes prompt (renderer sets window.onbeforeunload when dirty)
  win.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Close without saving', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Unsaved changes',
      message: 'You have unsaved changes. Close anyway?',
    });
    if (choice === 0) event.preventDefault();
  });

  // Open external links in the default browser
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// ---------- Auto update (GitHub Releases) ----------
function setupUpdater() {
  if (!autoUpdater) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => send('update-status', { state: 'checking' }));
  autoUpdater.on('update-available', (info) => send('update-status', { state: 'available', version: info.version }));
  autoUpdater.on('update-not-available', (info) => send('update-status', { state: 'none', version: info && info.version }));
  autoUpdater.on('download-progress', (p) => send('update-status', { state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => send('update-status', { state: 'downloaded', version: info.version }));
  autoUpdater.on('error', (err) => send('update-status', { state: 'error', message: String(err && err.message || err) }));
}

ipcMain.handle('update:check', async () => {
  if (!autoUpdater || !app.isPackaged) return { state: 'dev', message: 'Updates are only checked in the installed app.' };
  try { await autoUpdater.checkForUpdates(); return { state: 'checking' }; }
  catch (e) { return { state: 'error', message: String(e.message || e) }; }
});
ipcMain.handle('update:install', () => { if (autoUpdater) autoUpdater.quitAndInstall(false, true); });
ipcMain.handle('app:version', () => app.getVersion());

// ---------- File system ----------
ipcMain.handle('file:open', async (_e, opts = {}) => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: opts.filters || [] });
  if (r.canceled || !r.filePaths.length) return null;
  const p = r.filePaths[0];
  return { path: p, name: path.basename(p), data: fs.readFileSync(p) };
});
ipcMain.handle('file:read', async (_e, p) => {
  if (!p || !fs.existsSync(p)) return null;
  return { path: p, name: path.basename(p), data: fs.readFileSync(p) };
});
ipcMain.handle('file:save', async (_e, opts) => {
  let p = opts.path;
  if (!p) {
    const r = await dialog.showSaveDialog(win, { defaultPath: opts.defaultName, filters: opts.filters || [] });
    if (r.canceled || !r.filePath) return null;
    p = r.filePath;
  }
  fs.writeFileSync(p, Buffer.from(opts.data));
  return { path: p, name: path.basename(p) };
});
ipcMain.handle('app:pending-open', () => { const p = pendingOpenPath; pendingOpenPath = null; return p; });
ipcMain.on('app:set-title', (_e, t) => { if (win) win.setTitle(t); });

// ---------- Lifecycle ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const f = fileArg(argv);
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); if (f) send('open-path', f); }
  });
  app.whenReady().then(() => {
    pendingOpenPath = fileArg(process.argv);
    createWindow();
    setupUpdater();
    if (autoUpdater && app.isPackaged) setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 4000);
  });
  app.on('window-all-closed', () => app.quit());
}
