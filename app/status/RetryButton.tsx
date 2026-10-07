'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function RetryButton({ runId }: { runId: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="flex items-center gap-2">
      {err && <span className="text-xs text-rose-300">{err}</span>}
      <button
        className="btn-ghost !px-3 !py-1 text-xs"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          const res = await fetch('/api/my-world/retry', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId }) });
          if (!res.ok) setErr((await res.json().catch(() => ({}))).error ?? 'failed');
          else router.refresh();
          setBusy(false);
        }}
      >
        Retry
      </button>
    </span>
  );
}
