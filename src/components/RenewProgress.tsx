import type { JobProgressEvent } from '@shared/types';

interface Props {
  events: JobProgressEvent[];
  busy: boolean;
}

export function RenewProgress({ events, busy }: Props) {
  const latest = events[events.length - 1];

  return (
    <section className="flex h-full min-h-[220px] flex-col rounded-xl border border-ink-700/80 bg-ink-900/70 shadow-panel">
      <header className="flex items-center justify-between border-b border-ink-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-ink-100">Activity</h2>
          <p className="text-xs text-ink-400">
            {busy ? 'Certificate job in progress…' : 'Request / renew logs'}
          </p>
        </div>
        {latest && (
          <span className="font-mono text-xs text-ink-400">{latest.percent}%</span>
        )}
      </header>
      <div className="flex-1 space-y-2 overflow-auto p-4 font-mono text-xs">
        {events.length === 0 && (
          <p className="text-ink-500">No activity yet. Select a site and click Request or Renew.</p>
        )}
        {events.map((event, index) => (
          <div
            key={`${event.jobId}-${index}`}
            className={
              event.level === 'error'
                ? 'text-danger'
                : event.level === 'success'
                  ? 'text-ok'
                  : event.level === 'warn'
                    ? 'text-warn'
                    : 'text-ink-200'
            }
          >
            <span className="text-ink-500">
              [{event.siteName || 'app'} · {event.phase}]
            </span>{' '}
            {event.message}
          </div>
        ))}
      </div>
    </section>
  );
}
