import { Prisma } from '@prisma/client';
import { db } from '../db';
import { FIRST_DAY, firstDayStep, nextStep, type FirstDayStepId, type FirstDayView } from './firstDaySteps';

export * from './firstDaySteps';

// The guided first day, server side. New players start it ("active"); each step pays its bags once (one
// FirstDayStep row per step, so a double tap or a second tab can never pay twice). Steps that leave a record
// (a furniture buy, a shift, a coin) are checked against that record; the arrival and the ride are moments
// the client reports.

/** Has the player already done this, by their own records? (Out of order counts: buy a coin early and it is ticked.) */
async function evidence(playerId: string, step: FirstDayStepId): Promise<boolean> {
  switch (step) {
    case 'furniture':
      return (await db.asset.count({ where: { playerId, slot: { not: null }, paid: { gt: 0 } } })) > 0;
    case 'shift':
      // a paid job shift (kind 'wage', from the Jobs app) or paid work at the Hustle Hub (lib/life/venues.ts)
      return (await db.bagTx.count({ where: { playerId, OR: [{ kind: 'wage' }, { note: { startsWith: '🏢 Hustle Hub:' }, amount: { gt: 0 } }] } })) > 0;
    case 'coin':
      return (await db.bagTx.count({ where: { playerId, kind: 'buy', note: { startsWith: '🪙 Bought' } } })) > 0;
    default:
      return false;
  }
}

export async function firstDayView(playerId: string, state?: string | null): Promise<FirstDayView> {
  const s = state === undefined ? (await db.player.findUnique({ where: { id: playerId }, select: { firstDay: true } }))?.firstDay ?? null : state;
  const rows = await db.firstDayStep.findMany({ where: { playerId } });
  const done = rows.map((r) => r.step as FirstDayStepId);
  const st = s === 'active' || s === 'done' || s === 'skipped' ? s : null;
  return { state: st, done, next: st === 'active' ? nextStep(done) : null, earned: rows.reduce((a, r) => a + r.reward, 0) };
}

/** Mark a step done and pay it, once. Returns the bags paid (0 if it was already done). */
async function pay(playerId: string, step: FirstDayStepId): Promise<number> {
  const def = firstDayStep(step)!;
  try {
    await db.$transaction([
      db.firstDayStep.create({ data: { playerId, step, reward: def.reward } }),
      db.player.update({ where: { id: playerId }, data: { bags: { increment: def.reward } } }),
      db.bagTx.create({ data: { playerId, kind: 'quest', amount: def.reward, note: `${def.emoji} First day: ${def.title}` } }),
    ]);
    return def.reward;
  } catch (e) {
    // the primary key says it was already paid
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return 0;
    throw e;
  }
}

/**
 * Finish a step. Verified steps need their record; "finish" needs every other step done or the path skipped
 * past. Finishing the last step ends the first day for good.
 */
export async function completeStep(playerId: string, step: FirstDayStepId): Promise<{ paid: number; view: FirstDayView }> {
  const p = await db.player.findUnique({ where: { id: playerId }, select: { firstDay: true } });
  if (p?.firstDay !== 'active') throw new Error('Your first day is already over.');
  const def = firstDayStep(step);
  if (!def) throw new Error('No such step.');
  if (def.verified && !(await evidence(playerId, step))) throw new Error('Not done yet.');
  if (step === 'finish') {
    const view = await firstDayView(playerId, p.firstDay);
    const missing = FIRST_DAY.filter((s) => s.id !== 'finish' && !view.done.includes(s.id));
    if (missing.length) throw new Error(`Still to do: ${missing.map((s) => s.title.toLowerCase()).join(', ')}.`);
  }
  const paid = await pay(playerId, step);
  if (step === 'finish') await db.player.update({ where: { id: playerId }, data: { firstDay: 'done' } });
  return { paid, view: await firstDayView(playerId) };
}

/** Tick and pay every verified step the player has already done (called after a buy or a shift). */
export async function checkSteps(playerId: string): Promise<{ paid: number; steps: FirstDayStepId[]; view: FirstDayView }> {
  const view = await firstDayView(playerId);
  if (view.state !== 'active') return { paid: 0, steps: [], view };
  let paid = 0;
  const steps: FirstDayStepId[] = [];
  for (const s of FIRST_DAY) {
    if (!s.verified || view.done.includes(s.id)) continue;
    if (!(await evidence(playerId, s.id))) continue;
    const n = await pay(playerId, s.id);
    if (n) {
      paid += n;
      steps.push(s.id);
    }
  }
  return { paid, steps, view: steps.length ? await firstDayView(playerId) : view };
}

/** Skip the rest: never shown again. Rewards already paid stay paid. */
export async function skipFirstDay(playerId: string) {
  await db.player.update({ where: { id: playerId }, data: { firstDay: 'skipped' } });
  return firstDayView(playerId);
}

/** From Settings, for players who never had it or skipped it: start the tour. Steps already paid stay ticked. */
export async function startFirstDay(playerId: string) {
  const p = await db.player.findUnique({ where: { id: playerId }, select: { firstDay: true } });
  if (p?.firstDay === 'done') throw new Error('You already finished your first day.');
  await db.player.update({ where: { id: playerId }, data: { firstDay: 'active' } });
  return firstDayView(playerId);
}
