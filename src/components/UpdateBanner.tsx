import type { UpdateStatus } from '@shared/types';

interface Props {
  status: UpdateStatus;
  onInstall: () => void;
  onCheck: () => void;
}

export function UpdateBanner({ status, onInstall, onCheck }: Props) {
  if (status.status === 'idle' || status.status === 'not-available') {
    return null;
  }

  const showInstall = status.status === 'downloaded';
  const showProgress = status.status === 'downloading';

  return (
    <div className="border-b border-accent/30 bg-accent/10 px-6 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-accent-soft">
            {status.message || 'Update status'}
          </p>
          {showProgress && (
            <div className="mt-2 h-1.5 w-64 overflow-hidden rounded-full bg-ink-800">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${status.percent ?? 0}%` }}
              />
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {status.status === 'error' && (
            <button
              type="button"
              onClick={onCheck}
              className="rounded-md border border-ink-600 bg-ink-900 px-3 py-1.5 text-sm hover:bg-ink-800"
            >
              Retry check
            </button>
          )}
          {showInstall && (
            <button
              type="button"
              onClick={onInstall}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dark"
            >
              Restart & install
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
