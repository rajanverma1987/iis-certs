import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { getAdminStatus } from '../services/admin.service';
import { getSettings, saveSettings } from '../services/settings.service';
import { getManagedSites } from '../services/status.service';
import { renewAllEligible, requestOrRenewSite } from '../services/renew.service';
import {
  checkForUpdates,
  getUpdateStatus,
  installUpdate,
} from '../services/update.service';
import type { AppSettings } from '../shared/types';
import { assertSafeEmail, assertSafeSiteId } from '../services/validation';

let busy = false;
let getMainWindow: () => BrowserWindow | null = () => null;

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const win = getMainWindow();
  // Prefer webContents identity — senderFrame.url is unreliable with sandbox/packaged builds
  if (win && !win.isDestroyed() && event.sender.id === win.webContents.id) {
    return;
  }

  const url = event.senderFrame?.url ?? event.sender.getURL?.() ?? '';
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  const ok =
    url.startsWith('file://') ||
    url.startsWith('app://') ||
    (typeof devUrl === 'string' && url.startsWith(devUrl));
  if (!ok) {
    throw new Error('Blocked IPC call from untrusted renderer.');
  }
}

function requireAdminWindows(): void {
  const admin = getAdminStatus();
  if (!admin.isWindows) {
    throw new Error('Certificate operations require Windows.');
  }
  if (!admin.isElevated) {
    throw new Error('Run the app as Administrator to manage certificates.');
  }
}

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  getMainWindow = getWindow;

  ipcMain.handle('admin:getStatus', async (event) => {
    assertTrustedSender(event);
    return getAdminStatus();
  });

  ipcMain.handle('settings:get', async (event) => {
    assertTrustedSender(event);
    return getSettings();
  });

  ipcMain.handle(
    'settings:set',
    async (event, partial: Partial<AppSettings>) => {
      assertTrustedSender(event);
      if (!partial || typeof partial !== 'object') {
        throw new Error('Invalid settings payload.');
      }
      const next: Partial<AppSettings> = {};
      if (partial.contactEmail !== undefined) {
        next.contactEmail = assertSafeEmail(String(partial.contactEmail));
      }
      return saveSettings(next);
    },
  );

  ipcMain.handle('sites:list', async (event) => {
    assertTrustedSender(event);
    const admin = getAdminStatus();
    if (!admin.isWindows) {
      return [];
    }
    if (!admin.isElevated) {
      throw new Error(
        'Run as Administrator to read IIS sites and certificate bindings.',
      );
    }
    return getManagedSites();
  });

  ipcMain.handle('certs:requestOrRenew', async (event, siteId: unknown) => {
    assertTrustedSender(event);
    requireAdminWindows();
    const id = assertSafeSiteId(siteId);
    if (busy) {
      throw new Error('Another certificate job is already running.');
    }

    busy = true;
    try {
      return await requestOrRenewSite(id, getWindow());
    } finally {
      busy = false;
    }
  });

  ipcMain.handle('certs:renewAll', async (event) => {
    assertTrustedSender(event);
    requireAdminWindows();
    if (busy) {
      throw new Error('Another certificate job is already running.');
    }

    busy = true;
    try {
      return await renewAllEligible(getWindow());
    } finally {
      busy = false;
    }
  });

  ipcMain.handle('update:getStatus', async (event) => {
    assertTrustedSender(event);
    return getUpdateStatus();
  });

  ipcMain.handle('update:check', async (event) => {
    assertTrustedSender(event);
    return checkForUpdates(getWindow);
  });

  ipcMain.handle('update:install', async (event) => {
    assertTrustedSender(event);
    installUpdate();
    return true;
  });
}
