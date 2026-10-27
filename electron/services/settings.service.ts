import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { DEFAULT_SETTINGS, type AppSettings } from '../shared/types';
import { lockDownDirectory, secureWriteFile } from './secure.service';
import { assertSafeEmail } from './validation';

function dataDir(): string {
  const dir = path.join(app.getPath('userData'), 'data');
  lockDownDirectory(dir);
  return dir;
}

function settingsPath(): string {
  return path.join(dataDir(), 'settings.json');
}

export function getDataDir(): string {
  return dataDir();
}

function normalizeSettings(raw: Partial<AppSettings> | Record<string, unknown>): AppSettings {
  const email =
    typeof raw.contactEmail === 'string' ? raw.contactEmail.trim() : DEFAULT_SETTINGS.contactEmail;
  return {
    contactEmail: email,
  };
}

export function getSettings(): AppSettings {
  const file = settingsPath();
  if (!fs.existsSync(file)) {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    return normalizeSettings(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(partial: Partial<AppSettings>): AppSettings {
  const merged = normalizeSettings({ ...getSettings(), ...partial });
  if (merged.contactEmail) {
    merged.contactEmail = assertSafeEmail(merged.contactEmail);
  }
  secureWriteFile(settingsPath(), JSON.stringify(merged, null, 2));
  return merged;
}

export function getManagedMetaPath(): string {
  return path.join(dataDir(), 'managed-certs.json');
}

export interface ManagedCertMeta {
  siteId: string;
  siteName: string;
  domains: string[];
  thumbprint: string | null;
  notAfter: string | null;
  lastError: string | null;
  lastRunAt: string | null;
}

export function loadManagedMeta(): Record<string, ManagedCertMeta> {
  const file = getManagedMetaPath();
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<
      string,
      ManagedCertMeta
    >;
  } catch {
    return {};
  }
}

export function saveManagedMeta(meta: Record<string, ManagedCertMeta>): void {
  secureWriteFile(getManagedMetaPath(), JSON.stringify(meta, null, 2));
}

export function upsertManagedMeta(entry: ManagedCertMeta): void {
  const all = loadManagedMeta();
  all[entry.siteId] = entry;
  saveManagedMeta(all);
}

export function ensureSecureDataLayout(): void {
  lockDownDirectory(dataDir());
  lockDownDirectory(path.join(dataDir(), 'acme'));
  lockDownDirectory(path.join(dataDir(), 'tmp'));
}
