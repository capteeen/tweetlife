'use client';
import { useState } from 'react';
import { useWorld } from '@/components/world/store';
import { useLove } from './loveClient';
import { SOCIAL_GROUPS, bondFor, type SocialCtx, type SocialOutcome, type SocialTarget } from './socialActions';
import { KINDS } from '@/lib/life/love';
import type { SocialSend } from './useLife';

// The actions you can take with someone you're chatting with, from SOCIAL_GROUPS (components/life/socialActions.ts),
// plus where the two of you stand: talking, dating, and for AI residents how well you get on.

export function SocialMenu({ target, worldId, sendSocial, say }: { target: SocialTarget; worldId?: string; sendSocial: SocialSend; say?: (t: string) => void }) {
  const me = useWorld((s) => s.life?.me ?? null);
  const love = useLove((s) => s.state);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<SocialOutcome>(undefined);
  if (!me) return null;
  const ctx: SocialCtx = { target, me, worldId, sendSocial, love, say };
  const bond = bondFor(ctx);

  const run = async (id: string, fn: () => Promise<SocialOutcome>) => {
    setBusy(id);
    setErr(null);
    setDone(undefined);
    try {
      const out = await fn();
      setDone(out);
      if (out?.toast) useWorld.getState().pushToast(out.toast, 'love');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-3">
      <Standing bond={bond} target={target} />
      {SOCIAL_GROUPS.map((g) => {
        const actions = g.actions.filter((a) => a.targets.includes(target.kind) && !a.hidden?.(ctx));
        if (!actions.length) return null;
        return (
          <div key={g.id} className="mt-2">
            <p className="label mb-1.5">{g.title}</p>
            <div className="grid grid-cols-2 gap-2">
              {actions.map((a) => {
                const why = a.disabledReason?.(ctx) ?? null;
                const label = typeof a.label === 'function' ? a.label(ctx) : a.label;
                const hint = why ?? (typeof a.hint === 'function' ? a.hint(ctx) : a.hint);
                return (
                  <button
                    key={a.id}
                    data-action={a.id}
                    disabled={busy !== null || !!why}
                    onClick={() => run(a.id, () => a.run(ctx))}
                    className="flex items-start gap-2.5 rounded-2xl bg-[#FF5D8F]/10 px-3 py-2.5 text-left transition hover:bg-[#FF5D8F]/20 disabled:opacity-55"
                  >
                    <span className="text-xl leading-none">{a.emoji}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{busy === a.id ? `${label}…` : label}</span>
                      {hint && <span className={`block text-[11px] ${why ? 'text-amber-200/80' : 'text-white/55'}`}>{hint}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {done?.go && (
        <a href={done.go.href} className="btn mt-2 w-full !py-2 text-sm">
          {done.go.label} →
        </a>
      )}
      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
    </div>
  );
}

function Standing({ bond, target }: { bond: ReturnType<typeof bondFor>; target: SocialTarget }) {
  const resident = target.kind === 'resident';
  const affinity = bond?.affinity ?? 0;
  if (!bond && !resident) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {bond?.status === 'dating' && (
        <span className="rounded-full bg-[#FF5D8F]/25 px-2.5 py-1 font-semibold text-[#FFB3C8]">
          💞 Dating since {new Date(bond.datingSince ?? bond.since).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
          {bond.dates ? ` · ${bond.dates} date${bond.dates === 1 ? '' : 's'}` : ''}
        </span>
      )}
      {bond?.status === 'talking' && <span className="rounded-full bg-white/10 px-2.5 py-1 font-semibold text-white/75">💬 Talking</span>}
      {resident && (
        <span className="flex min-w-[10rem] flex-1 items-center gap-2" title="Affinity grows as you chat, visit and go on dates">
          <span className="text-white/55">Affinity</span>
          <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#FF5D8F] to-[#FFD089]" style={{ width: `${affinity}%` }} />
            {/* the marks where a visit and a date become possible */}
            <span className="absolute inset-y-0 w-px bg-white/50" style={{ left: `${KINDS.visit.residentNeeds}%` }} />
            <span className="absolute inset-y-0 w-px bg-white/50" style={{ left: `${KINDS.date.residentNeeds}%` }} />
          </span>
          <span className="num font-semibold">{affinity}</span>
        </span>
      )}
    </div>
  );
}
