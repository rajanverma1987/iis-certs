import type { CertStatus } from '@shared/types';

export function statusLabel(status: CertStatus): string {
  switch (status) {
    case 'NoCertificate':
      return 'No certificate';
    case 'Valid':
      return 'Valid';
    case 'Expiring':
      return 'Expiring soon';
    case 'Expired':
      return 'Expired';
    case 'Error':
      return 'Error';
    case 'Unsupported':
      return 'No hostnames';
    default:
      return status;
  }
}

export function statusClass(status: CertStatus): string {
  switch (status) {
    case 'Valid':
      return 'bg-ok/15 text-ok border-ok/30';
    case 'Expiring':
      return 'bg-warn/15 text-warn border-warn/30';
    case 'Expired':
    case 'Error':
      return 'bg-danger/15 text-danger border-danger/30';
    case 'NoCertificate':
      return 'bg-accent/15 text-accent-soft border-accent/30';
    default:
      return 'bg-ink-800 text-ink-300 border-ink-700';
  }
}

export function actionLabel(status: CertStatus): string {
  return status === 'NoCertificate' || status === 'Error' ? 'Request' : 'Renew';
}
