import { execFileSync } from 'child_process';
import { randomBytes, createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runPowerShell } from './powershell';

/** Restrict a directory to Administrators + SYSTEM on Windows. */
export function lockDownDirectory(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  if (os.platform() !== 'win32') {
    try {
      fs.chmodSync(dir, 0o700);
    } catch {
      // ignore
    }
    return;
  }

  try {
    execFileSync(
      'icacls',
      [
        dir,
        '/inheritance:r',
        '/grant:r',
        'Administrators:(OI)(CI)F',
        '/grant:r',
        'SYSTEM:(OI)(CI)F',
      ],
      { windowsHide: true, stdio: 'ignore' },
    );
  } catch {
    // Best-effort; app may still run without ACL hardening
  }
}

export function secureWriteFile(filePath: string, data: Buffer | string): void {
  const dir = path.dirname(filePath);
  lockDownDirectory(dir);
  fs.writeFileSync(filePath, data, { mode: 0o600 });
  if (os.platform() === 'win32') {
    try {
      execFileSync(
        'icacls',
        [filePath, '/inheritance:r', '/grant:r', 'Administrators:F', '/grant:r', 'SYSTEM:F'],
        { windowsHide: true, stdio: 'ignore' },
      );
    } catch {
      // ignore
    }
  }
}

/** Overwrite then delete sensitive temp files. */
export function secureUnlink(filePath: string): void {
  try {
    if (!fs.existsSync(filePath)) return;
    const size = fs.statSync(filePath).size;
    if (size > 0 && size < 50 * 1024 * 1024) {
      fs.writeFileSync(filePath, randomBytes(size));
    }
    fs.unlinkSync(filePath);
  } catch {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // ignore
    }
  }
}

export function generateStrongPassword(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Protect secret bytes with Windows DPAPI (LocalMachine scope). */
export async function dpapiProtect(plain: Buffer): Promise<Buffer> {
  if (os.platform() !== 'win32') {
    return plain;
  }

  const b64 = plain.toString('base64');
  const script = `
Add-Type -AssemblyName System.Security
$plain = [Convert]::FromBase64String('${b64}')
$protected = [System.Security.Cryptography.ProtectedData]::Protect(
  $plain, $null, [System.Security.Cryptography.DataProtectionScope]::LocalMachine
)
[Convert]::ToBase64String($protected)
`;
  const result = await runPowerShell<string>(script);
  if (typeof result !== 'string' || !result.trim()) {
    throw new Error('DPAPI protect failed');
  }
  return Buffer.from(result.trim(), 'base64');
}

export async function dpapiUnprotect(protectedData: Buffer): Promise<Buffer> {
  if (os.platform() !== 'win32') {
    return protectedData;
  }

  const b64 = protectedData.toString('base64');
  const script = `
Add-Type -AssemblyName System.Security
$protected = [Convert]::FromBase64String('${b64}')
$plain = [System.Security.Cryptography.ProtectedData]::Unprotect(
  $protected, $null, [System.Security.Cryptography.DataProtectionScope]::LocalMachine
)
[Convert]::ToBase64String($plain)
`;
  const result = await runPowerShell<string>(script);
  if (typeof result !== 'string' || !result.trim()) {
    throw new Error('DPAPI unprotect failed');
  }
  return Buffer.from(result.trim(), 'base64');
}

/** Write JSON params to a locked temp file for PowerShell to read (avoids injection). */
export function writeSecureJsonParams(payload: unknown): string {
  const tmpDir = path.join(os.tmpdir(), 'iis-cert-manager');
  lockDownDirectory(tmpDir);
  const file = path.join(
    tmpDir,
    `params-${Date.now()}-${createHash('sha256').update(randomBytes(16)).digest('hex').slice(0, 12)}.json`,
  );
  secureWriteFile(file, JSON.stringify(payload));
  return file;
}
