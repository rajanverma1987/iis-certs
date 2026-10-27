import { runPowerShell } from './powershell';
import type { SiteBinding } from '../shared/types';

export interface RawIisSite {
  id: string;
  name: string;
  state: string;
  physicalPath: string;
  bindings: SiteBinding[];
}

const LIST_SITES_SCRIPT = `
Import-Module WebAdministration -ErrorAction Stop

function Get-BindingParts([string]$bindingInformation) {
  $parts = $bindingInformation -split ':', 3
  return @{
    Ip = if ($parts.Count -gt 0 -and $parts[0]) { $parts[0] } else { '*' }
    Port = if ($parts.Count -gt 1) { [int]$parts[1] } else { 0 }
    Host = if ($parts.Count -gt 2) { $parts[2] } else { '' }
  }
}

$sites = @()
Get-Website | ForEach-Object {
  $site = $_
  $bindings = @()
  foreach ($b in $site.Bindings.Collection) {
    $parts = Get-BindingParts $b.bindingInformation
    $hash = $null
    if ($b.certificateHash) {
      $hash = ($b.certificateHash -replace ' ', '').ToUpperInvariant()
    }
    $bindings += [ordered]@{
      protocol = $b.protocol
      ipAddress = $parts.Ip
      port = $parts.Port
      hostname = $parts.Host
      sslFlags = [int]$b.sslFlags
      certificateHash = $hash
    }
  }

  $phys = $site.physicalPath
  if ($phys -match '%[^%]+%') {
    $phys = [Environment]::ExpandEnvironmentVariables($phys)
  }

  $sites += [ordered]@{
    id = [string]$site.id
    name = $site.name
    state = [string]$site.state
    physicalPath = $phys
    bindings = $bindings
  }
}

$sites | ConvertTo-Json -Depth 6 -Compress
`;

export async function listIisSites(): Promise<RawIisSite[]> {
  const result = await runPowerShell<RawIisSite[] | RawIisSite>(LIST_SITES_SCRIPT);
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

export function extractHostnames(bindings: SiteBinding[]): string[] {
  const set = new Set<string>();
  for (const b of bindings) {
    const host = (b.hostname || '').trim().toLowerCase();
    if (!host) continue;
    if (host === 'localhost' || host.endsWith('.localhost')) continue;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) continue;
    set.add(host);
  }
  return Array.from(set).sort();
}
