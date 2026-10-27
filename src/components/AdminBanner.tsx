import type { AdminStatus } from '@shared/types';

export function AdminBanner({ status }: { status: AdminStatus | null }) {
  if (!status) return null;
  if (status.isWindows && status.isElevated) return null;

  return (
    <div className="border-b border-warn/40 bg-warn/10 px-6 py-3 text-sm text-warn">
      {status.message}
    </div>
  );
}
