import { extractHostnames, listIisSites } from './iis.service';
import { lookupCertificates } from './certStore.service';
import { loadManagedMeta } from './settings.service';
import {
  EXPIRY_WARNING_DAYS,
  type CertStatus,
  type ManagedSite,
  type SiteCertInfo,
} from '../shared/types';

function emptyCert(): SiteCertInfo {
  return {
    thumbprint: null,
    subject: null,
    issuer: null,
    notBefore: null,
    notAfter: null,
    daysRemaining: null,
  };
}

function computeStatus(
  cert: SiteCertInfo,
  hostnames: string[],
  expiryDays: number,
  lastError: string | null,
): CertStatus {
  if (lastError && !cert.thumbprint) return 'Error';
  if (!hostnames.length) return 'Unsupported';
  if (!cert.thumbprint || !cert.notAfter) return 'NoCertificate';

  const days = cert.daysRemaining ?? 0;
  if (days < 0) return 'Expired';
  if (days <= expiryDays) return 'Expiring';
  return 'Valid';
}

export async function getManagedSites(): Promise<ManagedSite[]> {
  const meta = loadManagedMeta();
  const sites = await listIisSites();

  const thumbprints = sites
    .flatMap((s) => s.bindings.map((b) => b.certificateHash))
    .filter((t): t is string => Boolean(t));

  const certMap = await lookupCertificates(thumbprints);

  return sites.map((site) => {
    const hostnames = extractHostnames(site.bindings);
    const httpsWithCert = site.bindings.find(
      (b) => b.protocol === 'https' && b.certificateHash,
    );
    const tp = httpsWithCert?.certificateHash?.toUpperCase() ?? null;
    const looked = tp ? certMap[tp] : undefined;

    let cert = emptyCert();
    if (looked?.notAfter) {
      const notAfter = new Date(looked.notAfter);
      const daysRemaining = Math.floor(
        (notAfter.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      cert = {
        thumbprint: looked.thumbprint,
        subject: looked.subject,
        issuer: looked.issuer,
        notBefore: looked.notBefore,
        notAfter: looked.notAfter,
        daysRemaining,
      };
    } else if (tp) {
      cert = {
        ...emptyCert(),
        thumbprint: tp,
      };
    }

    const siteMeta = meta[site.id];
    const status = computeStatus(
      cert,
      hostnames,
      EXPIRY_WARNING_DAYS,
      siteMeta?.lastError ?? null,
    );

    return {
      id: site.id,
      name: site.name,
      state: site.state,
      physicalPath: site.physicalPath,
      bindings: site.bindings,
      hostnames,
      cert,
      status,
      lastError: siteMeta?.lastError ?? null,
      lastRunAt: siteMeta?.lastRunAt ?? null,
    };
  });
}
