import { Footer, Header } from '@/components/ui/Chrome';
import { getSession } from '@/lib/session';
import { isAdmin } from '@/lib/env';
import { statusSnapshot, type StatusSnapshot } from '@/lib/status';
import { fullNumber, relativeTime } from '@/lib/format';
import { RetryButton } from './RetryButton';

export const dynamic = 'force-dynamic';

// Live quota, sync queue, incident notes. Every number is read from the ledger, the queues and the worlds table.
export default async function Status() {
  const user = await getSession();
  let snap: StatusSnapshot | null = null;
  let error: string | null = null;
  try {
    snap = await statusSnapshot();
  } catch (e) {
    error = (e as Error).message;
  }
  const admin = isAdmin(user?.handle);
  return (
    <div className="min-h-screen">
      <Header user={user} />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Status</h1>
        {error && <div className="card mt-6 text-rose-300">Status is unavailable: {error}</div>}
        {snap && (
          <>
            {snap.budget.level !== 'ok' && (
              <div className={`mt-4 rounded-xl px-4 py-3 text-sm ${snap.budget.level === 'exhausted' ? 'border border-rose-400/30 bg-rose-500/10 text-rose-200' : 'border border-amber-400/30 bg-amber-500/10 text-amber-200'}`}>
                {snap.budget.limitedBy === 'day'
                  ? snap.budget.level === 'exhausted'
                    ? `Today's X spend cap is used up (about $${snap.budget.spentToday.toFixed(2)} of $${snap.budget.dailyCap.toFixed(2)}). X calls wait until ${new Date(snap.budget.resetsAt).toUTCString()}; new cities start building then. Existing worlds keep serving from the database.`
                    : `${Math.round((snap.budget.spentToday / snap.budget.dailyCap) * 100)}% of today's X spend cap is used, so optional X calls (metric refreshes, follower lists, automatic post checks) are paused until midnight UTC.${admin ? ' Admin: raise X_DAILY_SPEND_CAP_USD to allow more.' : ''}`
                  : snap.budget.level === 'exhausted'
                  ? `Monthly X API budget is exhausted (${fullNumber(snap.budget.used)} of ${fullNumber(snap.budget.budget)} calls). New world builds are paused until ${new Date(snap.budget.resetsAt).toUTCString()}. Existing worlds keep serving from the database.`
                  : `${Math.round(snap.budget.fraction * 100)}% of the monthly X API budget is used.${admin ? ' Admin: consider raising X_MONTHLY_CALL_BUDGET or the tier.' : ''}`}
              </div>
            )}
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="X spend today (estimate)"
                value={`$${snap.budget.spentToday.toFixed(2)}${snap.budget.dailyCap > 0 ? ` / $${snap.budget.dailyCap.toFixed(2)}` : ''}`}
                sub="$0.005 a post, $0.010 a user read; X bills a repeat read in the same UTC day once"
              />
              <Stat label={`X calls this month (${snap.budget.month})`} value={`${fullNumber(snap.budget.used)} / ${fullNumber(snap.budget.budget)}`} sub={`${Math.round(snap.budget.fraction * 100)}% · tier: ${snap.tier}`} />
              <Stat
                label={`Ingest queue (${snap.queues?.mode ?? 'unknown'} mode)`}
                value={snap.queues ? `${snap.queues.ingest.waiting ?? 0} waiting · ${snap.queues.ingest.active ?? 0} active` : 'unavailable'}
                sub={snap.queues ? `${snap.queues.ingest.delayed ?? 0} delayed · ${snap.queues.ingest.failed ?? 0} failed` : 'queue connection failed'}
              />
              <Stat
                label="Limiter"
                value={snap.limiter.pausedUntil ? `paused until ${new Date(snap.limiter.pausedUntil).toLocaleTimeString()}` : `${snap.limiter.backlogMs ? Math.round(snap.limiter.backlogMs / 1000) + 's backlog' : 'idle'}`}
                sub={`${snap.errorsLastHour} error responses in the last hour`}
              />
              <Stat
                label="Worlds"
                value={`${snap.worlds.live ?? 0} live`}
                sub={`${snap.worlds.building ?? 0} building · ${snap.worlds.queued ?? 0} queued · ${snap.worlds.failed ?? 0} failed`}
              />
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="card">
                <h2 className="font-semibold">Calls by endpoint (this month)</h2>
                <table className="num mt-3 w-full text-sm">
                  <tbody>
                    {snap.callsByEndpoint.length === 0 && (
                      <tr>
                        <td className="text-white/50">No calls yet.</td>
                      </tr>
                    )}
                    {snap.callsByEndpoint.map((r) => (
                      <tr key={r.endpoint} className="border-t border-white/5">
                        <td className="py-1 font-mono text-xs text-white/70">{r.endpoint}</td>
                        <td className="py-1 text-right">{fullNumber(r.calls)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {snap.lastCall && (
                  <p className="mt-3 text-xs text-white/50">
                    Last call {relativeTime(snap.lastCall.at)} → HTTP {snap.lastCall.status}
                    {snap.lastCall.rateLimitRemaining != null ? ` · ${snap.lastCall.rateLimitRemaining} remaining in window` : ''}
                    {snap.lastCall.rateLimitReset ? ` · resets ${relativeTime(snap.lastCall.rateLimitReset)}` : ''}
                  </p>
                )}
              </div>
              <div className="card">
                <h2 className="font-semibold">Last syncs</h2>
                <ul className="mt-3 space-y-1 text-sm">
                  {snap.lastSyncs.length === 0 && <li className="text-white/50">No world has synced yet.</li>}
                  {snap.lastSyncs.map((w) => (
                    <li key={w.handle} className="flex justify-between">
                      <span>@{w.handle}</span>
                      <span className="text-white/55">
                        {w.ingestState} · {relativeTime(w.lastSyncAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="card mt-6">
              <h2 className="font-semibold">Dead-letter ingestions</h2>
              <p className="mt-1 text-xs text-white/50">Runs that exhausted their retries. Owners can retry from /my-world; admins from here.</p>
              <ul className="mt-3 space-y-2 text-sm">
                {snap.deadLetter.length === 0 && <li className="text-white/50">None.</li>}
                {snap.deadLetter.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2">
                    <span>
                      @{r.handle} · {r.kind} · {relativeTime(r.startedAt)} · {r.attempts} attempts
                      <span className="block text-xs text-rose-300">{r.error}</span>
                    </span>
                    {admin && <RetryButton runId={r.id} />}
                  </li>
                ))}
              </ul>
            </div>

            <div className="card mt-6">
              <h2 className="font-semibold">Incidents</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {snap.incidents.length === 0 && <li className="text-white/50">No incidents recorded.</li>}
                {snap.incidents.map((i) => (
                  <li key={i.id}>
                    <span className="font-medium">{i.title}</span>{' '}
                    <span className="text-xs text-white/50">
                      {relativeTime(i.startedAt)} {i.resolvedAt ? `· resolved ${relativeTime(i.resolvedAt)}` : '· ongoing'}
                    </span>
                    <p className="text-white/70">{i.body}</p>
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-4 text-xs text-white/40">Snapshot at {new Date(snap.now).toUTCString()}. JSON at /api/status.</p>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <p className="label">{label}</p>
      <p className="num mt-1 text-lg font-semibold">{value}</p>
      {sub && <p className="num mt-1 text-xs text-white/50">{sub}</p>}
    </div>
  );
}
