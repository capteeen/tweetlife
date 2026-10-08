'use client';
import { useEffect, useRef, useState } from 'react';
import { useWorld } from '@/components/world/store';
import { SHIFT_SECONDS, TASKS, jobById, levelOf, taskDueAt, wageFor } from '@/lib/life/jobs';
import { atVenue, jobActions, refreshJobs, workplaceOf, shiftBonus } from './jobs';
import { ConfirmButton } from '@/components/ui/ConfirmButton';

type Result = { emoji: string; title: string; pay: number; tasks: number; leveledUp: boolean; levelTitle: string; level: number };

// On shift: the clock, the three tasks (each pops up as a big button when it's due), and the pay when the time is up.
// Walking off the job ends the shift with no pay. After the shift, the payslip.
export function ShiftHUD() {
  const shift = useWorld((s) => s.shift);
  const jobs = useWorld((s) => s.jobs);
  const pushToast = useWorld((s) => s.pushToast);
  const [, tick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const finishing = useRef(false);
  const meId = useWorld((s) => s.life?.me?.id ?? null);

  // the board (and any shift still running after a reload) loads with the player
  useEffect(() => {
    if (meId) refreshJobs();
  }, [meId]);

  useEffect(() => {
    if (!shift) return;
    const t = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [shift]);

  const job = shift ? jobById(shift.jobId) : null;
  const now = Date.now();
  const elapsed = shift ? (now - shift.startedAt) / 1000 : 0;
  const done = !!shift && now >= shift.endsAt;

  // walked off the job: no pay
  useEffect(() => {
    if (!shift || !job || job.ride) return;
    const st = useWorld.getState();
    if (st.trip) return;
    const v = workplaceOf(job);
    if (v && !atVenue(v, st.playerPos)) {
      jobActions.cancel();
      pushToast(`${job.emoji} You left work, so the shift ended with no pay.`, 'job');
    }
  });

  // at your station: turn the camera round so you can watch yourself work
  const aimed = useRef(0);
  useEffect(() => {
    if (!shift || shift.face == null || aimed.current === shift.startedAt) return;
    if (useWorld.getState().trip) return;
    aimed.current = shift.startedAt;
    useWorld.getState().setFaceAim(shift.face);
    useWorld.getState().setCamAim(shift.cam ?? { yaw: shift.face - 0.5, pitch: 0.6 });
  });

  // time's up: clock out and get paid
  useEffect(() => {
    if (!done || !job || finishing.current) return;
    finishing.current = true;
    setBusy(true);
    jobActions
      .finish()
      .then((r) => {
        setResult({ emoji: job.emoji, title: job.title, pay: r.pay, tasks: r.tasks, leveledUp: r.leveledUp, level: r.level, levelTitle: job.levels[r.level - 1] });
        pushToast(`${job.emoji} Shift done · +${r.pay} bags`, 'job');
      })
      .catch((e) => {
        setErr((e as Error).message);
        useWorld.getState().setShift(null);
      })
      .finally(() => {
        finishing.current = false;
        setBusy(false);
      });
  }, [done, job, pushToast]);

  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setResult(null), 9000);
    return () => clearTimeout(t);
  }, [result]);

  if (result && !shift) {
    return (
      <div className="pointer-events-auto absolute bottom-20 left-1/2 z-30 w-[min(94vw,400px)] -translate-x-1/2 rounded-3xl chrome p-4 text-center" onClick={() => setResult(null)}>
        <div className="text-3xl">{result.leveledUp ? '🎉' : result.emoji}</div>
        <div className="mt-1 text-lg font-bold">{result.leveledUp ? `Promoted: ${result.levelTitle}` : 'Shift done'}</div>
        <div className="num mt-1 text-2xl font-extrabold text-emerald-300">+{result.pay} bags</div>
        <div className="mt-1 text-xs text-white/60">
          {result.title} · {result.tasks}/{TASKS} tasks{result.tasks < TASKS ? ` (missed ${TASKS - result.tasks})` : ''} · level {result.level}
        </div>
        {result.leveledUp && <div className="mt-1 text-xs text-white/70">Every shift from now pays more.</div>}
      </div>
    );
  }
  if (err && !shift) {
    return (
      <div className="pointer-events-auto absolute bottom-20 left-1/2 z-30 w-[min(94vw,400px)] -translate-x-1/2 rounded-2xl chrome px-4 py-3 text-sm" onClick={() => setErr(null)}>
        {err}
      </div>
    );
  }
  if (!shift || !job) return null;

  const rec = jobs?.records.find((r) => r.jobId === job.id);
  const level = levelOf(rec?.shifts ?? 0);
  const left = Math.max(0, Math.ceil((shift.endsAt - now) / 1000));
  const due = shift.tasks < TASKS && elapsed >= taskDueAt(shift.tasks) ? job.tasks[shift.tasks] : null;
  const doTask = async () => {
    setBusy(true);
    try {
      await jobActions.task();
    } catch (e) {
      pushToast((e as Error).message, 'job');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pointer-events-auto absolute bottom-20 left-1/2 z-30 w-[min(94vw,420px)] -translate-x-1/2 rounded-3xl chrome p-3.5 sm:p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl text-xl" style={{ background: job.uniform + '55' }}>
          {job.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">
            On shift · {job.levels[level - 1]}
          </div>
          <div className="text-[11px] text-white/55">
            {wageFor(job, level, shiftBonus())} bags with all {TASKS} tasks · {shift.tasks}/{TASKS} done
          </div>
        </div>
        <span className="num text-lg font-bold">{done ? '✓' : `${left}s`}</span>
        <ConfirmButton ask="Quit, no pay?" className="rounded-full px-2 py-0.5 text-xs text-white/60 hover:bg-white/10" onClick={() => jobActions.cancel()}>
          ✕
        </ConfirmButton>
      </div>
      {/* the clock, with a tick where each task comes up */}
      <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, (elapsed / SHIFT_SECONDS) * 100)}%` }} />
        {job.tasks.map((_, i) => (
          <span key={i} className={`absolute top-0 h-full w-1 ${i < shift.tasks ? 'bg-emerald-200' : 'bg-white/50'}`} style={{ left: `${(taskDueAt(i) / SHIFT_SECONDS) * 100}%` }} />
        ))}
      </div>
      {due ? (
        <button disabled={busy} onClick={doTask} className="relative mt-3 w-full rounded-2xl bg-emerald-400 px-4 py-3 text-[15px] font-extrabold text-[#0B0E14] shadow-lg ring-4 ring-emerald-300/30 hover:bg-emerald-300 disabled:opacity-60">
          <span className="absolute right-3 top-3 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
          </span>
          👆 {due}
        </button>
      ) : (
        <p className="mt-2 text-center text-xs text-white/55">
          {done ? 'Clocking out…' : shift.tasks >= TASKS ? 'All tasks done. Keep at it until the clock runs out.' : `Next up: ${job.tasks[shift.tasks]} in ${Math.max(0, Math.ceil(taskDueAt(shift.tasks) - elapsed))}s`}
        </p>
      )}
    </div>
  );
}

