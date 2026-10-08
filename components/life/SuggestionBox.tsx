'use client';
import { useCallback, useEffect, useState } from 'react';
import { useWorld } from '@/components/world/store';
import { COUNTRIES, type CountryId } from '@/lib/world/countries';
import { citizenOf } from '@/lib/life/government';
import { presidentOf } from '@/lib/life/residents';
import { AGENDA, MAX_LEN, MIN_LEN, PER_DAY, TOPICS, topicOf, type SuggestionView, type TopicId } from '@/lib/life/suggestions-shared';

// The suggestion box at a government house: file a suggestion with your president (who answers it), see your
// own and what happened to them, and back other citizens' on the country's board. Used on the president's
// card (Suggest tab) and on the government house sheet (`compact`: the board first, the form one tap away).

type Board = { top: SuggestionView[]; mine: SuggestionView[]; total: number; agenda: number };

export function SuggestionBox({ country, compact = false }: { country: CountryId; compact?: boolean }) {
  const me = useWorld((s) => s.life?.me ?? null);
  const c = COUNTRIES[country];
  const citizen = me ? citizenOf(me) === country : false;
  const [data, setData] = useState<Board | null>(null);
  const [open, setOpen] = useState(!compact);
  const [topic, setTopic] = useState<TopicId>('economy');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [answer, setAnswer] = useState<SuggestionView | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/life/government/suggestions?country=${country}`).catch(() => null);
    if (r?.ok) setData(await r.json());
  }, [country]);
  useEffect(() => {
    setData(null);
    setAnswer(null);
    load();
  }, [load]);

  const submit = async () => {
    const t = text.trim();
    if (t.length < MIN_LEN || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch('/api/life/government/suggestions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'file', country, topic, text: t }) });
      const j = (await r.json().catch(() => ({}))) as { suggestion?: SuggestionView; error?: string };
      if (!r.ok || !j.suggestion) throw new Error(j.error ?? 'The box is jammed. Try again.');
      setAnswer(j.suggestion);
      setText('');
      const pres = presidentOf(country);
      if (pres && j.suggestion.reply) useWorld.getState().residentSay(pres.id, j.suggestion.reply.length > 90 ? j.suggestion.reply.slice(0, 87).replace(/\s+\S*$/, '') + '…' : j.suggestion.reply);
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const backIt = async (id: string) => {
    setErr(null);
    const r = await fetch('/api/life/government/suggestions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'back', id }) });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) setErr(j.error ?? 'Could not back that.');
    load();
  };

  const mine = data?.mine ?? [];
  const board = (data?.top ?? []).slice(0, compact ? 3 : 8);
  return (
    <div className="flex flex-col gap-3">
      {compact && (
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-white/60">💡 Suggestion box{data ? ` · ${data.total} filed` : ''}</div>
          {!open && me && citizen && (
            <button onClick={() => setOpen(true)} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/15">
              Suggest something
            </button>
          )}
        </div>
      )}

      {!me ? (
        <p className="text-xs text-white/60">Sign in with X to file a suggestion with President {c.president}.</p>
      ) : !citizen ? (
        <p className="text-xs text-white/60">
          Only {c.demonym}s can file suggestions here. Yours go to President {COUNTRIES[citizenOf(me)].president} in {COUNTRIES[citizenOf(me)].capital}. You can still read the board.
        </p>
      ) : (
        open && (
          <div className="flex flex-col gap-2">
            {!compact && <p className="text-xs text-white/60">Tell President {c.president} what {c.name} should do. Every suggestion is kept, answered, and goes on the board for {c.demonym}s to back; {AGENDA} backers put it on the cabinet agenda.</p>}
            <div className="flex flex-wrap gap-1.5">
              {TOPICS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTopic(t.id)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${topic === t.id ? 'text-[#0B0E14]' : 'bg-white/5 hover:bg-white/10'}`}
                  style={topic === t.id ? { background: c.theme.accent } : undefined}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={MAX_LEN}
              rows={compact ? 2 : 3}
              placeholder={`e.g. "Cut the Coin Shop tax for first-time traders"`}
              className="w-full resize-none rounded-2xl bg-white/10 px-3 py-2 text-sm outline-none placeholder:text-white/35 focus:bg-white/15"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-white/40">
                {text.trim().length}/{MAX_LEN} · {PER_DAY} a day
              </span>
              <button onClick={submit} disabled={busy || text.trim().length < MIN_LEN} className="rounded-full px-4 py-1.5 text-sm font-semibold text-[#0B0E14] disabled:opacity-40" style={{ background: c.theme.accent }}>
                {busy ? 'Filing…' : 'File suggestion'}
              </button>
            </div>
          </div>
        )
      )}

      {answer?.reply && (
        <div className="rounded-2xl bg-white/10 p-3 text-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-white/50">President {c.president} answered</div>
          <p className="mt-1 leading-snug">{answer.reply}</p>
          <p className="mt-1.5 text-[11px] text-white/45">Filed and under review. It&apos;s on the board now.</p>
        </div>
      )}
      {err && <p className="text-xs text-rose-300">{err}</p>}

      {!compact && mine.length > 0 && (
        <Section title="Your suggestions">
          {mine.map((s) => (
            <Item key={s.id} s={s} country={country} showReply />
          ))}
        </Section>
      )}

      {board.length > 0 ? (
        <Section title={compact ? 'Most backed' : `${c.name}'s board · ${data?.total ?? 0} filed · ${data?.agenda ?? 0} on the agenda`}>
          {board.map((s) => (
            <Item key={s.id} s={s} country={country} canBack={citizen && !s.mine && !s.backed} onBack={() => backIt(s.id)} />
          ))}
        </Section>
      ) : (
        data && <p className="text-xs text-white/45">No suggestions yet. Be the first {c.demonym} to file one.</p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/50">{title}</div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Item({ s, country, showReply, canBack, onBack }: { s: SuggestionView; country: CountryId; showReply?: boolean; canBack?: boolean; onBack?: () => void }) {
  const c = COUNTRIES[country];
  const t = topicOf(s.topic);
  return (
    <div className="rounded-xl bg-white/5 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm leading-snug">
          <span className="mr-1">{t.emoji}</span>
          {s.text}
        </p>
        {onBack && (
          <button
            onClick={onBack}
            disabled={!canBack}
            title={s.mine ? 'Your suggestion' : s.backed ? 'You backed this' : `Back it (${c.demonym}s only)`}
            className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold hover:bg-white/15 disabled:opacity-60"
          >
            {s.backed ? '✓' : '▲'} {s.backers}
          </button>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-white/45">
        <span className={`rounded-full px-1.5 py-px font-semibold ${s.status === 'agenda' ? 'bg-emerald-400/20 text-emerald-200' : 'bg-amber-300/15 text-amber-200'}`}>{s.status === 'agenda' ? 'On the cabinet agenda' : 'Under review'}</span>
        <span>@{s.by}</span>
        {!onBack && <span>{s.backers} backer{s.backers === 1 ? '' : 's'}</span>}
      </div>
      {showReply && s.reply && <p className="mt-1.5 border-l-2 border-white/20 pl-2 text-xs italic leading-snug text-white/70">{c.president}: {s.reply}</p>}
    </div>
  );
}
