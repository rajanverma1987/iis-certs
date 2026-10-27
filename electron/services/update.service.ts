import { BrowserWindow, app } from 'electron';
import { autoUpdater } from 'electron-updater';
import { UPDATE_FEED } from '../config/update.config';
import type { UpdateStatus } from '../shared/types';

let current: UpdateStatus = { status: 'idle' };
let initialized = false;

function applyFeedUrl(): void {
  autoUpdater.setFeedURL({
    provider: UPDATE_FEED.provider,
    owner: UPDATE_FEED.owner,
    repo: UPDATE_FEED.repo,
  });
}

function broadcast(win: BrowserWindow | null, status: UpdateStatus): void {
  current = status;
  win?.webContents.send('update:status', status);
}

export function getUpdateStatus(): UpdateStatus {
  return current;
}

export function initAutoUpdater(getWindow: () => BrowserWindow | null): void {
  if (initialized) return;
  initialized = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  applyFeedUrl();

  autoUpdater.on('checking-for-update', () => {
    broadcast(getWindow(), { status: 'checking', message: 'Checking for updates…' });
  });

  autoUpdater.on('update-available', (info) => {
    broadcast(getWindow(), {
      status: 'available',
      version: info.version,
      message: `Update ${info.version} available. Downloading…`,
    });
  });

  autoUpdater.on('update-not-available', () => {
    broadcast(getWindow(), {
      status: 'not-available',
      version: app.getVersion(),
      message: `You are on the latest version (${app.getVersion()}).`,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    broadcast(getWindow(), {
      status: 'downloading',
      percent: Math.round(progress.percent),
      message: `Downloading update… ${Math.round(progress.percent)}%`,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    broadcast(getWindow(), {
      status: 'downloaded',
      version: info.version,
      message: `Update ${info.version} ready. Restart to install.`,
    });
  });

  autoUpdater.on('error', (err) => {
    broadcast(getWindow(), {
      status: 'error',
      message: err.message || 'Update check failed',
    });
  });
}

export async function checkForUpdates(
  getWindow: () => BrowserWindow | null,
): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    const status: UpdateStatus = {
      status: 'not-available',
      message: 'Auto-update runs only in packaged builds. Publish a GitHub Release to test.',
    };
    broadcast(getWindow(), status);
    return status;
  }

  applyFeedUrl();

  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    broadcast(getWindow(), { status: 'error', message });
  }
  return current;
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall(false, true);
}
