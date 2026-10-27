import { FormEvent, useEffect, useState } from 'react';
import type { AppSettings } from '@shared/types';

interface Props {
  open: boolean;
  initial: AppSettings;
  onClose: () => void;
  onSave: (settings: AppSettings) => Promise<void>;
  onCheckUpdates: () => void;
}

export function SettingsForm({
  open,
  initial,
  onClose,
  onSave,
  onCheckUpdates,
}: Props) {
  const [form, setForm] = useState<AppSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(initial);
  }, [initial, open]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (!form.contactEmail.includes('@')) {
        throw new Error('Enter a valid contact email for Let\'s Encrypt.');
      }
      await onSave(form);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-2xl border border-ink-700 bg-ink-900 shadow-panel"
      >
        <header className="flex items-center justify-between border-b border-ink-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Settings</h2>
            <p className="text-xs text-ink-400">ACME account settings</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-ink-400 hover:bg-ink-800 hover:text-ink-100"
          >
            Close
          </button>
        </header>

        <div className="space-y-4 px-5 py-5">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-400">
              Let&apos;s Encrypt contact email
            </span>
            <input
              type="email"
              required
              value={form.contactEmail}
              onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
              className="w-full rounded-md border border-ink-700 bg-ink-950 px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
              placeholder="admin@example.com"
            />
          </label>

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-800 px-5 py-4">
          <button
            type="button"
            onClick={onCheckUpdates}
            className="rounded-md border border-ink-600 px-3 py-2 text-sm hover:bg-ink-800"
          >
            Check for updates
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-2 text-sm text-ink-300 hover:bg-ink-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
