import { BrowserWindow } from 'electron';
import { randomUUID } from 'crypto';
import { issueCertificate } from './acme.service';
import { importPfx } from './certStore.service';
import { deployCertificateToSite } from './deploy.service';
import { extractHostnames, listIisSites } from './iis.service';
import { getManagedSites } from './status.service';
import { upsertManagedMeta } from './settings.service';
import type { JobProgressEvent, ManagedSite, RenewResult } from '../shared/types';

function sendProgress(win: BrowserWindow | null, event: JobProgressEvent): void {
  win?.webContents.send('job:progress', event);
}

export async function requestOrRenewSite(
  siteId: string,
  win: BrowserWindow | null,
): Promise<RenewResult> {
  const jobId = randomUUID();
  const sites = await listIisSites();
  const site = sites.find((s) => s.id === siteId);
  if (!site) {
    throw new Error(`IIS site not found: ${siteId}`);
  }

  const hostnames = extractHostnames(site.bindings);
  const emit = (
    phase: string,
    message: string,
    percent: number,
    level: JobProgressEvent['level'] = 'info',
    extra?: Partial<JobProgressEvent>,
  ) => {
    sendProgress(win, {
      jobId,
      siteId: site.id,
      siteName: site.name,
      phase,
      message,
      percent,
      level,
      ...extra,
    });
  };

  try {
    if (!hostnames.length) {
      throw new Error(
        'No usable hostnames on this site. Add http/https hostname bindings in IIS (not blank or localhost).',
      );
    }

    emit('start', `Starting certificate request for ${site.name}`, 1);

    const issued = await issueCertificate({
      domains: hostnames,
      sitePhysicalPath: site.physicalPath,
      onProgress: (phase, message, percent) => emit(phase, message, percent),
    });

    emit('import', 'Importing certificate into Windows certificate store', 92);
    let imported;
    try {
      imported = await importPfx(issued.pfx, issued.pfxPassword);
    } finally {
      // Avoid lingering passphrase / PFX bytes in the issued object
      issued.pfx.fill(0);
      issued.pfxPassword = '';
    }

    emit('deploy', 'Updating IIS HTTPS bindings', 96);
    await deployCertificateToSite({
      siteName: site.name,
      hostnames,
      thumbprint: imported.thumbprint,
      storeName: imported.storeName,
    });

    upsertManagedMeta({
      siteId: site.id,
      siteName: site.name,
      domains: hostnames,
      thumbprint: imported.thumbprint,
      notAfter: imported.notAfter,
      lastError: null,
      lastRunAt: new Date().toISOString(),
    });

    emit('done', `Certificate deployed (${imported.thumbprint})`, 100, 'success', {
      done: true,
      success: true,
    });

    return {
      siteId: site.id,
      siteName: site.name,
      success: true,
      message: `Certificate installed: ${imported.thumbprint}`,
      thumbprint: imported.thumbprint,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    upsertManagedMeta({
      siteId: site.id,
      siteName: site.name,
      domains: hostnames,
      thumbprint: null,
      notAfter: null,
      lastError: message,
      lastRunAt: new Date().toISOString(),
    });
    emit('error', message, 100, 'error', { done: true, success: false });
    return {
      siteId: site.id,
      siteName: site.name,
      success: false,
      message,
    };
  }
}

export async function renewAllEligible(
  win: BrowserWindow | null,
): Promise<RenewResult[]> {
  const managed = await getManagedSites();
  const eligible: ManagedSite[] = managed.filter((s) =>
    ['NoCertificate', 'Expiring', 'Expired', 'Error'].includes(s.status),
  );

  if (!eligible.length) {
    sendProgress(win, {
      jobId: randomUUID(),
      siteId: null,
      siteName: null,
      phase: 'done',
      message: 'No sites need a certificate request or renewal.',
      percent: 100,
      level: 'info',
      done: true,
      success: true,
    });
    return [];
  }

  const results: RenewResult[] = [];
  for (const site of eligible) {
    const result = await requestOrRenewSite(site.id, win);
    results.push(result);
  }
  return results;
}
