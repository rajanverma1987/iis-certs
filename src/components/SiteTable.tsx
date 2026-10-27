import type { ManagedSite } from '@shared/types';
import { actionLabel, statusClass, statusLabel } from '../lib/statusStyles';

interface Props {
  sites: ManagedSite[];
  selectedId: string | null;
  busy: boolean;
  onSelect: (site: ManagedSite) => void;
  onAction: (site: ManagedSite) => void;
}

function formatExpiry(site: ManagedSite): string {
  if (!site.cert.notAfter) return '—';
  const date = new Date(site.cert.notAfter).toLocaleDateString();
  const days = site.cert.daysRemaining;
  if (days === null) return date;
  if (days < 0) return `${date} (${Math.abs(days)}d ago)`;
  return `${date} (${days}d)`;
}

export function SiteTable({ sites, selectedId, busy, onSelect, onAction }: Props) {
  if (sites.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-ink-700 bg-ink-900/40 px-6 py-16 text-center">
        <p className="text-lg font-medium text-ink-100">No IIS sites found</p>
        <p className="mt-2 text-sm text-ink-400">
          Install IIS and create websites with hostname bindings, then refresh.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-ink-700/80 bg-ink-900/70 shadow-panel">
      <div className="overflow-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-ink-950/80 text-xs uppercase tracking-wider text-ink-400">
            <tr>
              <th className="px-4 py-3 font-medium">Site</th>
              <th className="px-4 py-3 font-medium">Hostnames</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Expires</th>
              <th className="px-4 py-3 font-medium">Thumbprint</th>
              <th className="px-4 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((site) => {
              const canAct =
                site.status !== 'Unsupported' &&
                ['NoCertificate', 'Valid', 'Expiring', 'Expired', 'Error'].includes(
                  site.status,
                );
              return (
                <tr
                  key={site.id}
                  onClick={() => onSelect(site)}
                  className={`cursor-pointer border-t border-ink-800/80 transition-colors hover:bg-ink-800/40 ${
                    selectedId === site.id ? 'bg-ink-800/60' : ''
                  }`}
                >
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium text-ink-50">{site.name}</div>
                    <div className="mt-0.5 text-xs text-ink-400">
                      {site.state} · {site.physicalPath}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {site.hostnames.length ? (
                      <div className="flex max-w-xs flex-wrap gap-1">
                        {site.hostnames.map((h) => (
                          <span
                            key={h}
                            className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[11px] text-ink-200"
                          >
                            {h}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-ink-500">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span
                      className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${statusClass(site.status)}`}
                    >
                      {statusLabel(site.status)}
                    </span>
                    {site.lastError && (
                      <div className="mt-1 max-w-[220px] truncate text-xs text-danger" title={site.lastError}>
                        {site.lastError}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top font-mono text-xs text-ink-300">
                    {formatExpiry(site)}
                  </td>
                  <td className="px-4 py-3 align-top font-mono text-[11px] text-ink-400">
                    {site.cert.thumbprint
                      ? `${site.cert.thumbprint.slice(0, 8)}…${site.cert.thumbprint.slice(-6)}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    <button
                      type="button"
                      disabled={busy || !canAct}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAction(site);
                      }}
                      className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {actionLabel(site.status)}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
