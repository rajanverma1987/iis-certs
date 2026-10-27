import { spawn } from 'child_process';
import os from 'os';

export class PowerShellError extends Error {
  constructor(
    message: string,
    public readonly stderr: string,
    public readonly code: number | null,
  ) {
    super(message);
    this.name = 'PowerShellError';
  }
}

export async function runPowerShell<T = unknown>(
  script: string,
  timeoutMs = 120_000,
): Promise<T> {
  if (os.platform() !== 'win32') {
    throw new PowerShellError(
      'PowerShell IIS operations require Windows.',
      '',
      null,
    );
  }

  const wrapped = `
$ErrorActionPreference = 'Stop'
try {
${script}
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
`.trim();

  // Prefer EncodedCommand to avoid shell metacharacter issues on the command line
  const encoded = Buffer.from(wrapped, 'utf16le').toString('base64');

  return new Promise<T>((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        encoded,
      ],
      {
        windowsHide: true,
        env: {
          ...process.env,
          // Reduce accidental leakage via child env customization later
        },
      },
    );

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new PowerShellError('PowerShell timed out', stderr, null));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new PowerShellError(
            stderr.trim() || `PowerShell exited with code ${code}`,
            stderr,
            code,
          ),
        );
        return;
      }

      const trimmed = stdout.trim();
      if (!trimmed) {
        resolve(undefined as T);
        return;
      }

      try {
        resolve(JSON.parse(trimmed) as T);
      } catch {
        resolve(trimmed as T);
      }
    });
  });
}
