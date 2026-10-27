import os from 'os';
import { execSync } from 'child_process';
import type { AdminStatus } from '../shared/types';

export function getAdminStatus(): AdminStatus {
  const platform = os.platform();
  const isWindows = platform === 'win32';

  if (!isWindows) {
    return {
      isWindows: false,
      isElevated: false,
      platform,
      message:
        'IIS Cert Manager requires Windows with IIS installed. You can browse the UI, but certificate operations are disabled on this OS.',
    };
  }

  let isElevated = false;
  try {
    // Returns non-zero when not elevated
    execSync('net session', { stdio: 'ignore', windowsHide: true });
    isElevated = true;
  } catch {
    isElevated = false;
  }

  return {
    isWindows: true,
    isElevated,
    platform,
    message: isElevated
      ? 'Running with Administrator privileges.'
      : 'Administrator privileges are required to manage IIS bindings and the Local Machine certificate store. Right-click the app and choose Run as administrator.',
  };
}
