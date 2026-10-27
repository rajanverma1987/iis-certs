import { runPowerShell } from './powershell';
import { secureUnlink, writeSecureJsonParams } from './secure.service';
import {
  assertSafeDomains,
  assertSafeSiteName,
  assertSafeStoreName,
  assertSafeThumbprint,
} from './validation';

export interface DeployBindingResult {
  siteName: string;
  actions: Array<{ action: string; binding: string }>;
}

export async function deployCertificateToSite(options: {
  siteName: string;
  hostnames: string[];
  thumbprint: string;
  storeName: string;
}): Promise<DeployBindingResult> {
  const siteName = assertSafeSiteName(options.siteName);
  const hostnames = assertSafeDomains(options.hostnames);
  const thumbprint = assertSafeThumbprint(options.thumbprint);
  const storeName = assertSafeStoreName(options.storeName);

  const paramsPath = writeSecureJsonParams({
    siteName,
    hostnames,
    thumbprint,
    storeName,
  });
  const escapedParams = paramsPath.replace(/'/g, "''");

  const script = `
Import-Module WebAdministration -ErrorAction Stop

$params = Get-Content -LiteralPath '${escapedParams}' -Raw | ConvertFrom-Json
$siteName = [string]$params.siteName
$thumbprint = [string]$params.thumbprint
$storeName = [string]$params.storeName
$hostnames = @($params.hostnames)
$actions = @()

$site = Get-Website -Name $siteName -ErrorAction Stop
$existing = @($site.Bindings.Collection)

function Find-HttpsBinding([string]$hostname) {
  foreach ($b in $existing) {
    if ($b.protocol -ne 'https') { continue }
    $parts = $b.bindingInformation -split ':', 3
    $h = if ($parts.Count -gt 2) { $parts[2] } else { '' }
    if ($h.ToLowerInvariant() -eq $hostname.ToLowerInvariant()) {
      return $b
    }
  }
  return $null
}

foreach ($hostname in $hostnames) {
  if (-not $hostname) { continue }
  $bindingInfo = "*:443:$hostname"
  $current = Find-HttpsBinding $hostname
  if ($null -eq $current) {
    New-WebBinding -Name $siteName -Protocol https -IPAddress '*' -Port 443 -HostHeader $hostname -SslFlags 1 | Out-Null
    $actions += [ordered]@{ action = 'Create'; binding = $bindingInfo }
  } else {
    $actions += [ordered]@{ action = 'Update'; binding = $bindingInfo }
  }

  $binding = Get-WebBinding -Name $siteName -Protocol https | Where-Object {
    ($_.bindingInformation -split ':', 3)[2].ToLowerInvariant() -eq $hostname.ToLowerInvariant()
  } | Select-Object -First 1

  if ($null -eq $binding) {
    throw "Failed to locate https binding for $hostname on site $siteName"
  }

  $binding.AddSslCertificate($thumbprint, $storeName)
}

Remove-Item -LiteralPath '${escapedParams}' -Force -ErrorAction SilentlyContinue

[ordered]@{
  siteName = $siteName
  actions = $actions
} | ConvertTo-Json -Compress -Depth 5
`;

  try {
    const result = await runPowerShell<DeployBindingResult>(script);
    if (!result) {
      return { siteName, actions: [] };
    }
    return result;
  } finally {
    secureUnlink(paramsPath);
  }
}
