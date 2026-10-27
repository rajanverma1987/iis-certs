import type { ManagedSite } from '@shared/types';
import { actionLabel, statusClass, statusLabel } from '../lib/statusStyles';

interface Props {
  sites: ManagedSite[];
  selectedId: string | null;
  busy: boolean;
  onSelect: (site: ManagedSite) => void;
  onAction: (site: ManagedSite) => void;
  emptyTitle?: string;
  emptyHint?: string;
}

function formatExpiry(site: ManagedSite): string {
  if (!site.cert.notAfter) return '—';
  const date = new Date(site.cert.notAfter).toLocaleDateString();
  const days = site.cert.daysRemaining;
  if (days === null) return date;
  if (days < 0) return `${date} (${Math.abs(days)}d ago)`;
  return `${date} (${days}d)`;
}

export function SiteTable({
  sites,
  selectedId,
  busy,
  onSelect,
  onAction,
  emptyTitle = 'No IIS sites found',
  emptyHint = 'Install IIS and create websites with hostname bindings, then refresh.',
}: Props) {
  if (sites.length === 0) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center rounded-xl border border-dashed border-ink-700 bg-ink-900/40 px-6 py-10 text-center">
        <div>
          <p className="text-lg font-medium text-ink-100">{emptyTitle}</p>
          <p className="mt-2 text-sm text-ink-400">{emptyHint}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-ink-700/80 bg-ink-900/70 shadow-panel">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-ink-950 text-[11px] uppercase tracking-wider text-ink-400">
            <tr>
              <th className="px-3 py-2 font-medium">Site</th>
              <th className="px-3 py-2 font-medium">Hostnames</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Expires</th>
              <th className="px-3 py-2 font-medium">Thumbprint</th>
              <th className="px-3 py-2 font-medium text-right">Action</th>
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
                  <td className="px-3 py-1.5 align-middle">
                    <div className="truncate font-medium leading-tight text-ink-50">
                      {site.name}
                    </div>
                    <div className="truncate text-[11px] leading-tight text-ink-500" title={site.physicalPath}>
                      {site.state} · {site.physicalPath}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 align-middle">
                    {site.hostnames.length ? (
                      <div className="flex max-w-xs flex-wrap gap-0.5">
                        {site.hostnames.map((h) => (
                          <span
                            key={h}
                            className="rounded bg-ink-800 px-1 py-0 font-mono text-[10px] leading-5 text-ink-200"
                          >
                            {h}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-ink-500">None</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 align-middle">
                    <span
                      className={`inline-flex rounded border px-1.5 py-0 text-[11px] font-medium leading-5 ${statusClass(site.status)}`}
                    >
                      {statusLabel(site.status)}
                    </span>
                    {site.lastError && (
                      <div
                        className="mt-0.5 max-w-[200px] truncate text-[10px] text-danger"
                        title={site.lastError}
                      >
                        {site.lastError}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-1.5 align-middle font-mono text-[11px] text-ink-300">
                    {formatExpiry(site)}
                  </td>
                  <td className="px-3 py-1.5 align-middle font-mono text-[10px] text-ink-400">
                    {site.cert.thumbprint
                      ? `${site.cert.thumbprint.slice(0, 8)}…${site.cert.thumbprint.slice(-6)}`
                      : '—'}
                  </td>
                  <td className="px-3 py-1.5 align-middle text-right">
                    <button
                      type="button"
                      disabled={busy || !canAct}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAction(site);
                      }}
                      className="rounded bg-accent px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-40"
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
