import { app, BrowserWindow, shell, session } from 'electron';
import path from 'path';
import { registerIpcHandlers } from './ipc/handlers';
import { initAutoUpdater, checkForUpdates } from './services/update.service';
import { ensureSecureDataLayout } from './services/settings.service';

let mainWindow: BrowserWindow | null = null;

function getWindow(): BrowserWindow | null {
  return mainWindow;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0b121a',
    title: 'IIS Cert Manager',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      spellcheck: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:') {
        void shell.openExternal(url);
      }
    } catch {
      // ignore
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    const allowed =
      (devUrl && url.startsWith(devUrl)) ||
      url.startsWith('file://');
    if (!allowed) {
      event.preventDefault();
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  ensureSecureDataLayout();

  // Harden default session: block unexpected permissions / navigations
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });

  registerIpcHandlers(getWindow);
  initAutoUpdater(getWindow);
  createWindow();

  setTimeout(() => {
    void checkForUpdates(getWindow);
  }, 2500);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
