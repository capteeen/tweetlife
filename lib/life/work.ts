import type { Player } from '@prisma/client';
import { db } from '../db';
import { applyDelta } from './stats';
import { governmentOf } from './government';
import { whereIs } from './flights';
import { dayStart } from './quests';
import {
  JOBS, SHIFTS_PER_DAY, SHIFT_COST, SHIFT_SECONDS, SHIFT_STALE_SECONDS, TASKS, hireBlocker, jobById, levelOf, payFor, taskDueAt,
  type JobBoard, type JobId,
} from './jobs';

// Server side of jobs (lib/life/jobs.ts): hiring, quitting, and shifts that pay only when their time is up.
// Every money move is a conditional update inside a transaction, so a double tap can never pay twice.

export class WorkError extends Error {
  constructor(msg: string, public status = 400) {
    super(msg);
  }
}

const staleBefore = () => new Date(Date.now() - SHIFT_STALE_SECONDS * 1000);
const shiftsToday = (playerId: string) => db.bagTx.count({ where: { playerId, kind: 'wage', at: { gte: dayStart() } } });

export async function jobBoard(p: Player): Promise<JobBoard> {
  const [records, today] = await Promise.all([db.jobRecord.findMany({ where: { playerId: p.id } }), shiftsToday(p.id)]);
  const total = records.reduce((a, r) => a + r.shifts, 0);
  const cur = records.find((r) => r.active) ?? null;
  const live = cur?.shiftStartedAt && cur.shiftStartedAt > staleBefore() ? cur : null;
  return {
    jobs: JOBS.map((j) => {
      const blocker = hireBlocker(j, p, total);
      return { ...j, open: !blocker, blocker };
    }),
    current: (cur?.jobId as JobId) ?? null,
    records: records.map((r) => ({ jobId: r.jobId as JobId, shifts: r.shifts, level: levelOf(r.shifts), active: r.active })),
    totalShifts: total,
    shiftsToday: today,
    shift: live
      ? { jobId: live.jobId as JobId, startedAt: live.shiftStartedAt!.toISOString(), tasks: live.shiftTasks, endsAt: new Date(live.shiftStartedAt!.getTime() + SHIFT_SECONDS * 1000).toISOString() }
      : null,
    resetsAt: new Date(dayStart().getTime() + 86400000).toISOString(),
  };
}

async function activeRecord(playerId: string) {
  const r = await db.jobRecord.findFirst({ where: { playerId, active: true } });
  if (!r) throw new WorkError('You don’t have a job yet. Apply at the job centre or in the Jobs app.');
  return r;
}

const onShift = (r: { shiftStartedAt: Date | null }) => !!r.shiftStartedAt && r.shiftStartedAt > staleBefore();

export async function apply(p: Player, jobId: string) {
  const job = jobById(jobId);
  if (!job) throw new WorkError('No such job');
  const records = await db.jobRecord.findMany({ where: { playerId: p.id } });
  if (records.some((r) => r.active && onShift(r))) throw new WorkError('Finish your shift first.', 409);
  if (records.some((r) => r.active && r.jobId === job.id)) throw new WorkError(`You already work as a ${job.title.toLowerCase()}.`, 409);
  const blocker = hireBlocker(job, p, records.reduce((a, r) => a + r.shifts, 0));
  if (blocker) throw new WorkError(blocker, 403);
  // one job at a time; your shifts (and level) at an old job are kept if you come back to it
  await db.$transaction([
    db.jobRecord.updateMany({ where: { playerId: p.id, active: true }, data: { active: false, shiftStartedAt: null, shiftTasks: 0 } }),
    db.jobRecord.upsert({
      where: { playerId_jobId: { playerId: p.id, jobId: job.id } },
      create: { playerId: p.id, jobId: job.id, active: true },
      update: { active: true, hiredAt: new Date(), shiftStartedAt: null, shiftTasks: 0 },
    }),
  ]);
  return job;
}

/**
 * The new-player tutorial's first shift: hires you for `jobId` without its clout or experience bar and clocks you
 * in. Only for someone who has never worked a shift, so it can't be used to skip the bar later. Finish it with
 * `finishShift` like any other; if you didn't really qualify, you're let go after that one shift is paid.
 */
export async function startTutorialShift(p: Player, jobId: string) {
  const job = jobById(jobId);
  if (!job) throw new WorkError('No such job');
  const records = await db.jobRecord.findMany({ where: { playerId: p.id } });
  if (records.some((r) => r.shifts > 0)) throw new WorkError('The tutorial shift is for your very first shift.', 409);
  const cur = records.find((r) => r.active);
  if (cur && onShift(cur)) return startShift(p);
  if (cur?.jobId !== job.id) {
    await db.$transaction([
      db.jobRecord.updateMany({ where: { playerId: p.id, active: true }, data: { active: false, shiftStartedAt: null, shiftTasks: 0 } }),
      db.jobRecord.upsert({
        where: { playerId_jobId: { playerId: p.id, jobId: job.id } },
        create: { playerId: p.id, jobId: job.id, active: true },
        update: { active: true, hiredAt: new Date(), shiftStartedAt: null, shiftTasks: 0 },
      }),
    ]);
  }
  return startShift(p);
}

export async function quit(p: Player) {
  const r = await activeRecord(p.id);
  if (onShift(r)) throw new WorkError('Finish your shift first.', 409);
  await db.jobRecord.update({ where: { id: r.id }, data: { active: false } });
  return jobById(r.jobId)!;
}

export async function startShift(p: Player) {
  const r = await activeRecord(p.id);
  const job = jobById(r.jobId)!;
  if (onShift(r)) return { job, startedAt: r.shiftStartedAt!, tasks: r.shiftTasks };
  if ((await shiftsToday(p.id)) >= SHIFTS_PER_DAY) throw new WorkError(`That’s ${SHIFTS_PER_DAY} shifts today. Come back tomorrow.`, 429);
  if (p.gas + (SHIFT_COST.gas ?? 0) < 0) throw new WorkError('Too tired to work. Eat, rest or sleep first.', 409);
  const startedAt = new Date();
  await db.$transaction([
    db.jobRecord.update({ where: { id: r.id }, data: { shiftStartedAt: startedAt, shiftTasks: 0 } }),
    db.player.update({ where: { id: p.id }, data: { status: job.line, statusUntil: new Date(startedAt.getTime() + SHIFT_SECONDS * 1000) } }),
  ]);
  return { job, startedAt, tasks: 0 };
}

export async function doTask(p: Player) {
  const r = await activeRecord(p.id);
  if (!onShift(r)) throw new WorkError('You’re not on shift.', 409);
  if (r.shiftTasks >= TASKS) throw new WorkError('All tasks done. Finish the shift.', 409);
  const elapsed = (Date.now() - r.shiftStartedAt!.getTime()) / 1000;
  if (elapsed < taskDueAt(r.shiftTasks) - 1) throw new WorkError('Nothing to do yet.', 425);
  const n = await db.jobRecord.updateMany({ where: { id: r.id, shiftStartedAt: r.shiftStartedAt, shiftTasks: r.shiftTasks }, data: { shiftTasks: { increment: 1 } } });
  return { tasks: n.count ? r.shiftTasks + 1 : r.shiftTasks };
}

export async function cancelShift(p: Player) {
  const r = await activeRecord(p.id);
  await db.$transaction([
    db.jobRecord.update({ where: { id: r.id }, data: { shiftStartedAt: null, shiftTasks: 0 } }),
    db.player.update({ where: { id: p.id }, data: { statusUntil: new Date() } }),
  ]);
}

export async function finishShift(p: Player) {
  const r = await activeRecord(p.id);
  if (!onShift(r)) throw new WorkError('You’re not on shift.', 409);
  const left = SHIFT_SECONDS - (Date.now() - r.shiftStartedAt!.getTime()) / 1000;
  if (left > 1) throw new WorkError(`Keep going: ${Math.ceil(left)}s left.`, 425);
  const job = jobById(r.jobId)!;
  const level = levelOf(r.shifts);
  // national rules: some countries pay more for a shift (BNB: +20%), wherever you are working now
  const pay = payFor(job, level, r.shiftTasks, governmentOf(whereIs(p)).rules.shiftBonus);
  const next = applyDelta(p, SHIFT_COST);
  const out = await db.$transaction(async (tx) => {
    // claim the shift: only one finish can clear this exact start time
    const n = await tx.jobRecord.updateMany({ where: { id: r.id, shiftStartedAt: r.shiftStartedAt }, data: { shiftStartedAt: null, shiftTasks: 0, shifts: { increment: 1 } } });
    if (!n.count) throw new WorkError('That shift was already paid.', 409);
    if ((await tx.bagTx.count({ where: { playerId: p.id, kind: 'wage', at: { gte: dayStart() } } })) >= SHIFTS_PER_DAY) {
      throw new WorkError(`That’s ${SHIFTS_PER_DAY} shifts today. Come back tomorrow.`, 429);
    }
    const pl = await tx.player.update({ where: { id: p.id }, data: { bags: { increment: pay }, ...next, lastTickAt: new Date(), statusUntil: new Date() } });
    await tx.bagTx.create({ data: { playerId: p.id, kind: 'wage', amount: pay, note: `${job.emoji} ${job.title} shift (${r.shiftTasks}/${TASKS} tasks)` } });
    return pl;
  });
  const shifts = r.shifts + 1;
  // a tutorial trial shift (startTutorialShift) at a job you don't qualify for yet ends there
  let letGo = false;
  const total = (await db.jobRecord.aggregate({ where: { playerId: p.id }, _sum: { shifts: true } }))._sum.shifts ?? 0;
  if (total === 1 && hireBlocker(job, out, 0)) {
    await db.jobRecord.update({ where: { id: r.id }, data: { active: false } });
    letGo = true;
  }
  return { job, pay, tasks: r.shiftTasks, shifts, level: levelOf(shifts), leveledUp: levelOf(shifts) > level, letGo, me: { vibes: out.vibes, clout: out.clout, gas: out.gas, bags: out.bags } };
}
