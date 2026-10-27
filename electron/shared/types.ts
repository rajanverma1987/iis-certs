export type CertStatus =
  | 'NoCertificate'
  | 'Valid'
  | 'Expiring'
  | 'Expired'
  | 'Error'
  | 'Unsupported';

export interface SiteBinding {
  protocol: string;
  ipAddress: string;
  port: number;
  hostname: string;
  sslFlags: number;
  certificateHash: string | null;
}

export interface SiteCertInfo {
  thumbprint: string | null;
  subject: string | null;
  issuer: string | null;
  notBefore: string | null;
  notAfter: string | null;
  daysRemaining: number | null;
}

export interface ManagedSite {
  id: string;
  name: string;
  state: string;
  physicalPath: string;
  bindings: SiteBinding[];
  hostnames: string[];
  cert: SiteCertInfo;
  status: CertStatus;
  lastError: string | null;
  lastRunAt: string | null;
}

export interface AppSettings {
  contactEmail: string;
}

export interface JobProgressEvent {
  jobId: string;
  siteId: string | null;
  siteName: string | null;
  phase: string;
  message: string;
  percent: number;
  level: 'info' | 'warn' | 'error' | 'success';
  done?: boolean;
  success?: boolean;
}

export interface RenewResult {
  siteId: string;
  siteName: string;
  success: boolean;
  message: string;
  thumbprint?: string;
}

export interface UpdateStatus {
  status:
    | 'idle'
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'error';
  version?: string;
  percent?: number;
  message?: string;
}

export interface AdminStatus {
  isWindows: boolean;
  isElevated: boolean;
  platform: string;
  message: string;
}

/** Days remaining at or below which a cert is marked Expiring. */
export const EXPIRY_WARNING_DAYS = 90;

export const DEFAULT_SETTINGS: AppSettings = {
  contactEmail: '',
};
