import { db } from './db';
import { env } from './env';
import { budgetStatus, monthStart } from './x/budget';
import { limiterStatus } from './x/limiter';
import { queueDepths } from './queue/queues';

// Everything /status and /api/status show. All numbers come from the ledger, the queues and the worlds table.

export async function statusSnapshot() {
  const e = env();
  const [budget, limiter, queues, byEndpoint, recentErrors, worlds, lastRuns, dead, incidents] = await Promise.all([
    budgetStatus(),
    limiterStatus().catch(() => ({ globalTokens: 0, backlogMs: 0, pausedUntil: null as string | null })),
    queueDepths().catch(() => null),
    db.apiCall.groupBy({ by: ['endpoint'], where: { at: { gte: monthStart() } }, _count: { _all: true } }),
    db.apiCall.count({ where: { at: { gte: new Date(Date.now() - 3600 * 1000) }, status: { gte: 400 } } }),
    db.world.groupBy({ by: ['ingestState'], _count: { _all: true } }),
    db.world.findMany({
      where: { lastSyncAt: { not: null } },
      orderBy: { lastSyncAt: 'desc' },
      take: 10,
      select: { handle: true, lastSyncAt: true, ingestState: true, access: true },
    }),
    db.ingestRun.findMany({ where: { status: 'dead' }, orderBy: { startedAt: 'desc' }, take: 20, include: { world: { select: { handle: true } } } }),
    db.incident.findMany({ orderBy: { startedAt: 'desc' }, take: 20 }),
  ]);
  const lastCall = await db.apiCall.findFirst({ orderBy: { at: 'desc' }, select: { at: true, status: true, rateLimitRemaining: true, rateLimitReset: true } });
  return {
    now: new Date().toISOString(),
    tier: e.X_API_TIER,
    budget,
    limiter,
    queues,
    callsByEndpoint: byEndpoint.map((r) => ({ endpoint: r.endpoint, calls: r._count._all })).sort((a, b) => b.calls - a.calls),
    errorsLastHour: recentErrors,
    lastCall: lastCall ? { ...lastCall, at: lastCall.at.toISOString(), rateLimitReset: lastCall.rateLimitReset?.toISOString() ?? null } : null,
    worlds: Object.fromEntries(worlds.map((w) => [w.ingestState, w._count._all])) as Record<string, number>,
    lastSyncs: lastRuns.map((w) => ({ ...w, lastSyncAt: w.lastSyncAt?.toISOString() ?? null })),
    deadLetter: dead.map((r) => ({ id: r.id, handle: r.world.handle, kind: r.kind, error: r.error, startedAt: r.startedAt.toISOString(), attempts: r.attempts })),
    incidents: incidents.map((i) => ({ ...i, startedAt: i.startedAt.toISOString(), resolvedAt: i.resolvedAt?.toISOString() ?? null })),
  };
}

export type StatusSnapshot = Awaited<ReturnType<typeof statusSnapshot>>;
