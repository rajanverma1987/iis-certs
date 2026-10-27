import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AdminStatus,
  AppSettings,
  JobProgressEvent,
  ManagedSite,
  UpdateStatus,
} from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/types';
import { AdminBanner } from '../components/AdminBanner';
import { RenewProgress } from '../components/RenewProgress';
import { SettingsForm } from '../components/SettingsForm';
import { SiteTable } from '../components/SiteTable';
import { UpdateBanner } from '../components/UpdateBanner';

export function SitesPage() {
  const [sites, setSites] = useState<ManagedSite[]>([]);
  const [selected, setSelected] = useState<ManagedSite | null>(null);
  const [admin, setAdmin] = useState<AdminStatus | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<JobProgressEvent[]>([]);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ status: 'idle' });
  const [searchQuery, setSearchQuery] = useState('');

  const needsSetup = !settings.contactEmail;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [adminStatus, appSettings] = await Promise.all([
        window.iisCert.getAdminStatus(),
        window.iisCert.getSettings(),
      ]);
      setAdmin(adminStatus);
      setSettings(appSettings);
      if (!appSettings.contactEmail) {
        setSettingsOpen(true);
      }

      try {
        const list = await window.iisCert.listSites();
        setSites(list);
        setSelected((prev) => list.find((s) => s.id === prev?.id) ?? list[0] ?? null);
      } catch (listErr) {
        setSites([]);
        setError(listErr instanceof Error ? listErr.message : String(listErr));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSites([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const offProgress = window.iisCert.onJobProgress((event) => {
      setEvents((prev) => [...prev.slice(-200), event]);
    });
    const offUpdate = window.iisCert.onUpdateStatus((status) => {
      setUpdateStatus(status);
    });
    void window.iisCert.getUpdateStatus().then(setUpdateStatus);
    return () => {
      offProgress();
      offUpdate();
    };
  }, [load]);

  const eligibleCount = useMemo(
    () =>
      sites.filter((s) =>
        ['NoCertificate', 'Expiring', 'Expired', 'Error'].includes(s.status),
      ).length,
    [sites],
  );

  const filteredSites = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sites;
    return sites.filter((site) => {
      if (site.name.toLowerCase().includes(q)) return true;
      if (site.physicalPath.toLowerCase().includes(q)) return true;
      if (site.hostnames.some((h) => h.toLowerCase().includes(q))) return true;
      if (site.status.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [sites, searchQuery]);

  async function handleAction(site: ManagedSite) {
    setBusy(true);
    setError(null);
    try {
      await window.iisCert.requestOrRenew(site.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRenewAll() {
    setBusy(true);
    setError(null);
    try {
      await window.iisCert.renewAll();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <UpdateBanner
        status={updateStatus}
        onInstall={() => void window.iisCert.installUpdate()}
        onCheck={() => void window.iisCert.checkForUpdates()}
      />
      <AdminBanner status={admin} />

      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-ink-800/80 px-6 py-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-soft">
            IIS Cert Manager
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-50">
            Let&apos;s Encrypt for IIS
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-400">
            List sites, spot expiring certificates, and manually request or renew with HTTP-01
            challenge files in each site root.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void window.iisCert.checkForUpdates()}
            className="rounded-md border border-ink-600 px-3 py-2 text-sm hover:bg-ink-800"
          >
            Check for update
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-md border border-ink-600 px-3 py-2 text-sm hover:bg-ink-800"
          >
            Settings
          </button>
          <button
            type="button"
            disabled={loading || busy}
            onClick={() => void load()}
            className="rounded-md border border-ink-600 px-3 py-2 text-sm hover:bg-ink-800 disabled:opacity-40"
          >
            Refresh
          </button>
          <button
            type="button"
            disabled={busy || loading || eligibleCount === 0 || needsSetup}
            onClick={() => void handleRenewAll()}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            Renew all ({eligibleCount})
          </button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 gap-4 overflow-hidden p-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.9fr)]">
        <div className="flex min-h-0 flex-col gap-3">
          {error && (
            <div className="shrink-0 rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
              {error}
            </div>
          )}
          {needsSetup && (
            <div className="shrink-0 rounded-lg border border-warn/40 bg-warn/10 px-4 py-2 text-sm text-warn">
              Add your Let&apos;s Encrypt contact email in Settings before requesting certificates.
            </div>
          )}
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="shrink-0">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search websites by name, hostname, or path…"
                className="w-full rounded-md border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-50 outline-none ring-accent placeholder:text-ink-500 focus:ring-2"
                disabled={loading}
              />
            </div>
            <div className="min-h-0 flex-1">
              {loading ? (
                <div className="flex h-full items-center justify-center rounded-xl border border-ink-700 bg-ink-900/50 text-ink-400">
                  Loading IIS sites…
                </div>
              ) : (
                <SiteTable
                  sites={filteredSites}
                  selectedId={selected?.id ?? null}
                  busy={busy || needsSetup}
                  onSelect={setSelected}
                  onAction={(site) => void handleAction(site)}
                  emptyTitle={
                    searchQuery.trim() ? 'No matching websites' : 'No IIS sites found'
                  }
                  emptyHint={
                    searchQuery.trim()
                      ? 'Try a different name, hostname, or path.'
                      : 'Install IIS and create websites with hostname bindings, then refresh.'
                  }
                />
              )}
            </div>
          </div>
        </div>

        <div className="min-h-0">
          <RenewProgress events={events} busy={busy} />
        </div>
      </main>

      <SettingsForm
        open={settingsOpen}
        initial={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={async (next) => {
          const saved = await window.iisCert.setSettings(next);
          setSettings(saved);
          // Refresh sites separately — a list/admin error must not undo a successful save
          try {
            await load();
          } catch {
            // load() already records UI errors
          }
        }}
        onCheckUpdates={() => void window.iisCert.checkForUpdates()}
      />
    </div>
  );
}
