import fs from 'fs';
import path from 'path';
import { runPowerShell } from './powershell';
import { getDataDir } from './settings.service';
import {
  lockDownDirectory,
  secureUnlink,
  secureWriteFile,
  writeSecureJsonParams,
} from './secure.service';
import { assertSafeThumbprint } from './validation';

export interface ImportedCert {
  thumbprint: string;
  subject: string;
  issuer: string;
  notBefore: string;
  notAfter: string;
  storeName: string;
}

export interface CertLookup {
  thumbprint: string;
  subject: string | null;
  issuer: string | null;
  notBefore: string | null;
  notAfter: string | null;
}

export async function lookupCertificates(
  thumbprints: string[],
): Promise<Record<string, CertLookup>> {
  const unique = Array.from(
    new Set(
      thumbprints
        .map((t) => t.replace(/\s+/g, '').toUpperCase())
        .filter((t) => /^[A-F0-9]{40}$/.test(t)),
    ),
  );
  if (unique.length === 0) return {};

  const paramsPath = writeSecureJsonParams({ thumbprints: unique });
  const escaped = paramsPath.replace(/'/g, "''");

  const script = `
$params = Get-Content -LiteralPath '${escaped}' -Raw | ConvertFrom-Json
$wanted = @($params.thumbprints)
$result = @{}
$stores = @('WebHosting', 'My')
foreach ($storeName in $stores) {
  $store = New-Object System.Security.Cryptography.X509Certificates.X509Store($storeName, 'LocalMachine')
  try {
    $store.Open('ReadOnly')
    foreach ($cert in $store.Certificates) {
      $tp = $cert.Thumbprint.ToUpperInvariant()
      if ($wanted -contains $tp -and -not $result.ContainsKey($tp)) {
        $result[$tp] = [ordered]@{
          thumbprint = $tp
          subject = $cert.Subject
          issuer = $cert.Issuer
          notBefore = $cert.NotBefore.ToUniversalTime().ToString('o')
          notAfter = $cert.NotAfter.ToUniversalTime().ToString('o')
        }
      }
    }
  } finally {
    $store.Close()
  }
}
Remove-Item -LiteralPath '${escaped}' -Force -ErrorAction SilentlyContinue
if ($result.Count -eq 0) { '{}' } else { $result | ConvertTo-Json -Compress -Depth 4 }
`;

  try {
    const parsed = await runPowerShell<Record<string, CertLookup> | CertLookup>(
      script,
    );
    if (!parsed) return {};
    if ((parsed as CertLookup).thumbprint) {
      const one = parsed as CertLookup;
      return { [one.thumbprint]: one };
    }
    return parsed as Record<string, CertLookup>;
  } finally {
    secureUnlink(paramsPath);
  }
}

export async function importPfx(
  pfxBuffer: Buffer,
  password: string,
): Promise<ImportedCert> {
  const tmpDir = path.join(getDataDir(), 'tmp');
  lockDownDirectory(tmpDir);
  const pfxPath = path.join(tmpDir, `import-${Date.now()}.pfx`);
  secureWriteFile(pfxPath, pfxBuffer);

  const paramsPath = writeSecureJsonParams({
    pfxPath,
    password,
  });
  const escapedParams = paramsPath.replace(/'/g, "''");

  // Import without -Exportable so the private key stays non-exportable on the server
  const script = `
$params = Get-Content -LiteralPath '${escapedParams}' -Raw | ConvertFrom-Json
$pfxPath = [string]$params.pfxPath
$password = ConvertTo-SecureString -String ([string]$params.password) -AsPlainText -Force
$imported = $null
$storeName = 'WebHosting'
try {
  $imported = Import-PfxCertificate -FilePath $pfxPath -CertStoreLocation 'Cert:\\LocalMachine\\WebHosting' -Password $password
} catch {
  $storeName = 'My'
  $imported = Import-PfxCertificate -FilePath $pfxPath -CertStoreLocation 'Cert:\\LocalMachine\\My' -Password $password
}

Remove-Item -LiteralPath '${escapedParams}' -Force -ErrorAction SilentlyContinue

[ordered]@{
  thumbprint = $imported.Thumbprint.ToUpperInvariant()
  subject = $imported.Subject
  issuer = $imported.Issuer
  notBefore = $imported.NotBefore.ToUniversalTime().ToString('o')
  notAfter = $imported.NotAfter.ToUniversalTime().ToString('o')
  storeName = $storeName
} | ConvertTo-Json -Compress
`;

  try {
    const result = await runPowerShell<ImportedCert>(script);
    if (!result?.thumbprint) {
      throw new Error('PFX import did not return a thumbprint');
    }
    assertSafeThumbprint(result.thumbprint);
    return result;
  } finally {
    secureUnlink(pfxPath);
    secureUnlink(paramsPath);
  }
}

export async function assertThumbprintsExist(thumbprints: string[]): Promise<void> {
  const map = await lookupCertificates(thumbprints);
  for (const tp of thumbprints) {
    if (!map[assertSafeThumbprint(tp)]) {
      throw new Error(`Certificate not found in Local Machine store: ${tp}`);
    }
  }
}
