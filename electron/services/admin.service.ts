import os from 'os';
import { execFileSync } from 'child_process';
import type { AdminStatus } from '../shared/types';

function isProcessElevated(): boolean {
  if (os.platform() !== 'win32') return false;

  // Prefer token group check — `net session` false-negatives when the Server service is disabled.
  try {
    const out = execFileSync('whoami', ['/groups'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000,
    });
    const adminSidLine = out
      .split(/\r?\n/)
      .find((line) => line.includes('S-1-5-32-544'));
    if (adminSidLine) {
      // Unelevated admins show "deny only"; elevated show "Enabled group".
      if (/deny only/i.test(adminSidLine)) return false;
      if (/Enabled group/i.test(adminSidLine)) return true;
      if (/Mandatory group/i.test(adminSidLine) && !/deny only/i.test(adminSidLine)) {
        return true;
      }
    }
  } catch {
    // fall through
  }

  try {
    execFileSync('net', ['session'], {
      stdio: 'ignore',
      windowsHide: true,
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

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

  const isElevated = isProcessElevated();

  return {
    isWindows: true,
    isElevated,
    platform,
    message: isElevated
      ? 'Running with Administrator privileges.'
      : 'Administrator privileges are required to manage IIS bindings and the Local Machine certificate store. Right-click the app and choose Run as administrator.',
  };
}
