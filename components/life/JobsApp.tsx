'use client';
import { useEffect, useState } from 'react';
import { useWorld } from '@/components/world/store';
import { relativeTime } from '@/lib/format';
import { APPLY_ANSWERS, APPLY_QUESTION, MAX_LEVEL, SHIFTS_PER_DAY, SHIFTS_PER_LEVEL, SHIFT_COST, SHIFT_SECONDS, TASKS, jobById, levelOf, toNextLevel, wageFor, type Job, type JobId } from '@/lib/life/jobs';
import { venueById } from '@/lib/life/venues';
import { ConfirmButton } from '@/components/ui/ConfirmButton';
import { statDelta } from '@/lib/life/statNames';
import { jobActions, refreshJobs, workplaceOf } from './jobs';

// The Jobs app (and the board at the Hustle Hub): your job and level, today's shifts, and every job in town with
// its pay and what it takes to get hired. Tap one to apply.

const placeOf = (job: Job) => venueById(job.venueId)?.name ?? job.venueId;
const needs = (job: Job) =>
  job.minClout || job.minShifts ? [job.minClout ? `${job.minClout} clout` : null, job.minShifts ? `${job.minShifts} shifts worked` : null].filter(Boolean).join(' · ') : 'Open to everyone';

export function JobsApp({ preselect }: { preselect?: string | null }) {
  const board = useWorld((s) => s.jobs);
  const [applying, setApplying] = useState<Job | null>(() => jobById(preselect));
  useEffect(() => {
    refreshJobs();
  }, []);
  if (!board) return <p className="py-10 text-center text-sm text-white/60">Loading the job board…</p>;
  if (applying) return <Apply job={applying} onBack={() => setApplying(null)} />;

  const cur = board.current ? jobById(board.current) : null;
  const rec = cur ? board.records.find((r) => r.jobId === cur.id) : null;
  return (
    <div>
      {cur && rec ? <MyJob job={cur} shifts={rec.shifts} today={board.shiftsToday} resetsAt={board.resetsAt} /> : (
        <div className="mt-3 rounded-2xl bg-white/5 p-3 text-sm text-white/75">
          No job yet. Pick one below and apply. Each shift is {SHIFT_SECONDS} seconds at the workplace with {TASKS} quick tasks, and pays in bags.
        </div>
      )}
      <p className="label mb-2 mt-4">Job board</p>
      <ul className="space-y-2">
        {board.jobs.map((j) => {
          const mine = board.current === j.id;
          const r = board.records.find((x) => x.jobId === j.id);
          return (
            <li key={j.id}>
              <button
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${mine ? 'bg-emerald-400/15 ring-1 ring-emerald-300/40' : 'bg-white/5 hover:bg-white/10'}`}
                onClick={() => !mine && setApplying(j)}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl" style={{ background: j.uniform + '44' }}>
                  {j.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{j.title}</span>
                  <span className="block truncate text-[11px] text-white/55">
                    {placeOf(j)} · {needs(j)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="num block text-sm font-bold text-emerald-300">{wageFor(j, levelOf(r?.shifts ?? 0))}</span>
                  <span className="block text-[10px] text-white/45">bags a shift</span>
                </span>
                <span className="w-14 shrink-0 text-right text-[11px] font-semibold">
                  {mine ? <span className="text-emerald-300">Your job</span> : j.open ? <span className="rounded-full bg-white/15 px-2 py-1">Apply</span> : <span className="text-white/40">🔒</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] text-white/45">
        Up to {SHIFTS_PER_DAY} shifts a day. Every {SHIFTS_PER_LEVEL} shifts in a job moves you up a level (max {MAX_LEVEL}) and pays 20% more. A shift costs {statDelta(SHIFT_COST)}.
      </p>
    </div>
  );
}

function MyJob({ job, shifts, today, resetsAt }: { job: Job; shifts: number; today: number; resetsAt: string }) {
  const [err, setErr] = useState<string | null>(null);
  const level = levelOf(shifts);
  const next = toNextLevel(shifts);
  const goToWork = () => {
    const v = workplaceOf(job);
    const s = useWorld.getState();
    s.closePhone();
    if (v) s.selectVenue(v);
  };
  return (
    <div className="mt-3 rounded-2xl p-3" style={{ background: `linear-gradient(135deg, ${job.uniform}55, rgba(255,255,255,0.04))` }}>
      <div className="flex items-center gap-3">
        <span className="text-3xl">{job.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-white/60">Your job</div>
          <div className="truncate text-[15px] font-bold">{job.levels[level - 1]}</div>
          <div className="truncate text-[11px] text-white/60">
            {job.title} at {placeOf(job)}
          </div>
        </div>
        <div className="text-right">
          <div className="num text-lg font-bold text-emerald-300">{wageFor(job, level)}</div>
          <div className="text-[10px] text-white/50">bags a shift</div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-white/60">
        <span className="shrink-0">Level {level}/{MAX_LEVEL}</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-emerald-400" style={{ width: `${next ? ((SHIFTS_PER_LEVEL - next) / SHIFTS_PER_LEVEL) * 100 : 100}%` }} />
        </div>
        <span className="shrink-0">{next ? `${next} shift${next === 1 ? '' : 's'} to ${job.levels[level]}` : 'Top level'}</span>
      </div>
      <div className="mt-2 text-[11px] text-white/60">
        Shifts today: <span className="num font-semibold text-white">{today}/{SHIFTS_PER_DAY}</span>
        {today >= SHIFTS_PER_DAY ? ` · back ${relativeTime(resetsAt)}` : ''}
      </div>
      <div className="mt-3 flex gap-2">
        <button className="btn flex-1 !justify-center" onClick={goToWork}>
          🏃 Go to work
        </button>
        <ConfirmButton
          ask="Quit?"
          className="btn-ghost !px-3 text-xs"
          onClick={() => jobActions.quit().catch((e) => setErr((e as Error).message))}
        >
          Quit
        </ConfirmButton>
      </div>
      {err && <p className="mt-2 text-xs text-amber-300">{err}</p>}
    </div>
  );
}

function Apply({ job, onBack }: { job: Job; onBack: () => void }) {
  const board = useWorld((s) => s.jobs);
  const [answer, setAnswer] = useState(0);
  const [stage, setStage] = useState<'form' | 'reviewing' | 'hired'>('form');
  const [err, setErr] = useState<string | null>(null);
  const row = board?.jobs.find((j) => j.id === job.id);
  const rec = board?.records.find((r) => r.jobId === job.id);
  const level = levelOf(rec?.shifts ?? 0);
  const me = useWorld((s) => s.life?.me ?? null);
  const switching = board?.current && board.current !== job.id ? jobById(board.current) : null;

  const send = async () => {
    setErr(null);
    setStage('reviewing');
    // a beat for the hiring manager to read it
    await new Promise((r) => setTimeout(r, 1200));
    try {
      await jobActions.apply(job.id as JobId, answer);
      setStage('hired');
    } catch (e) {
      setErr((e as Error).message);
      setStage('form');
    }
  };

  if (stage === 'hired') {
    return (
      <div className="py-6 text-center">
        <div className="text-5xl">🎉</div>
        <div className="mt-3 text-xl font-bold">You’re hired!</div>
        <p className="mt-1 text-sm text-white/70">
          {job.levels[level - 1]} at {placeOf(job)}. Your first shift pays {wageFor(job, level)} bags.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            className="btn !justify-center"
            onClick={() => {
              const v = workplaceOf(job);
              const s = useWorld.getState();
              s.closePhone();
              if (v) s.selectVenue(v);
            }}
          >
            🏃 Go to work
          </button>
          <button className="btn-ghost !justify-center" onClick={onBack}>
            Back to the job board
          </button>
        </div>
      </div>
    );
  }

  const checks = [
    job.minClout ? { ok: (me?.clout ?? 0) >= job.minClout, text: `${job.minClout} clout`, have: `you have ${me?.clout ?? 0}` } : null,
    job.minShifts ? { ok: (board?.totalShifts ?? 0) >= job.minShifts, text: `${job.minShifts} shifts worked anywhere`, have: `you have ${board?.totalShifts ?? 0}` } : null,
  ].filter(Boolean) as { ok: boolean; text: string; have: string }[];

  return (
    <div>
      <button className="mt-2 text-xs text-white/60 hover:text-white" onClick={onBack}>
        ‹ All jobs
      </button>
      <div className="mt-2 flex items-center gap-3">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl text-3xl" style={{ background: job.uniform + '55' }}>
          {job.emoji}
        </span>
        <div>
          <div className="text-lg font-bold leading-tight">{job.title}</div>
          <div className="text-xs text-white/55">{placeOf(job)}</div>
        </div>
      </div>
      <p className="mt-3 text-sm text-white/75">{job.blurb}</p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="a shift" value={`${wageFor(job, level)}`} />
        <Stat label="at the top" value={`${wageFor(job, MAX_LEVEL)}`} />
        <Stat label="shift" value={`${SHIFT_SECONDS}s`} />
      </div>
      <p className="label mb-1.5 mt-4">On the job</p>
      <p className="text-xs text-white/65">{job.tasks.join(' · ')}</p>
      <p className="label mb-1.5 mt-4">Requirements</p>
      {checks.length ? (
        <ul className="space-y-1 text-xs">
          {checks.map((c) => (
            <li key={c.text} className={c.ok ? 'text-emerald-300' : 'text-amber-300'}>
              {c.ok ? '✓' : '✗'} {c.text} <span className="text-white/45">({c.have})</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-emerald-300">✓ Open to everyone</p>
      )}
      <div className="mt-4 rounded-2xl bg-white/5 p-3">
        <p className="text-sm font-semibold">{APPLY_QUESTION}</p>
        <div className="mt-2 space-y-1.5">
          {APPLY_ANSWERS.map((a, i) => (
            <button
              key={a}
              onClick={() => setAnswer(i)}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${answer === i ? 'bg-x/30 ring-1 ring-x' : 'bg-white/5 hover:bg-white/10'}`}
            >
              <span className={`h-3.5 w-3.5 shrink-0 rounded-full border ${answer === i ? 'border-x bg-x' : 'border-white/40'}`} />
              {a}
            </button>
          ))}
        </div>
      </div>
      {switching && <p className="mt-3 text-[11px] text-white/55">This replaces your job as a {switching.title.toLowerCase()}. Your level there is kept if you ever go back.</p>}
      {err && <p className="mt-3 text-xs text-amber-300">{err}</p>}
      <button className="btn mt-4 w-full !justify-center !py-3" disabled={stage === 'reviewing' || row?.open === false} onClick={send}>
        {stage === 'reviewing' ? 'Reading your application…' : row?.open === false ? '🔒 Not yet' : 'Send application'}
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 px-2 py-2">
      <div className="num text-[15px] font-bold">{value}</div>
      <div className="text-[10px] text-white/50">{label}</div>
    </div>
  );
}
