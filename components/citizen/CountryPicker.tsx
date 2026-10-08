'use client';
import { useState } from 'react';
import { COUNTRY_LIST, COUNTRIES, type CountryId } from '@/lib/world/countries';
import type { Citizenship } from '@/lib/life/citizen';

// Sign-up step: choose your nationality. Each country is one city in its coin's colours, with its own
// president. You can visit the others later (by flight), but this one is home and issues your ID card.

export function CountryPicker({ onDone, compact = false }: { onDone: (c: Citizenship) => void; compact?: boolean }) {
  const [pick, setPick] = useState<CountryId>('solana');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = COUNTRIES[pick];

  const send = async (body: object) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/life/nationality', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onDone(data.citizen);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`grid gap-3 ${compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-3'}`} role="radiogroup" aria-label="Nationality">
        {COUNTRY_LIST.map((c) => {
          const on = c.id === pick;
          const [g1, g2] = c.theme.gradient;
          return (
            <button
              key={c.id}
              role="radio"
              aria-checked={on}
              onClick={() => setPick(c.id)}
              className={`relative overflow-hidden rounded-2xl p-[2px] text-left transition ${on ? 'scale-[1.01] shadow-xl' : 'opacity-75 hover:opacity-100'}`}
              style={{ background: on ? `linear-gradient(135deg, ${g1}, ${g2})` : 'rgba(255,255,255,0.12)', boxShadow: on ? `0 10px 40px -10px ${c.theme.primary}` : undefined }}
            >
              <div className="relative h-full rounded-[14px] p-4" style={{ background: `radial-gradient(circle at 85% 0%, ${c.theme.primary}33, transparent 60%), ${c.theme.ink}` }}>
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl font-bold"
                    style={{ background: `linear-gradient(135deg, ${g1}, ${g2})`, color: c.theme.ink }}
                  >
                    {c.flag}
                  </span>
                  <div className="min-w-0">
                    <p className="text-lg font-semibold leading-tight">{c.name}</p>
                    <p className="text-xs text-white/55">
                      {c.capital} · ${c.ticker}
                    </p>
                  </div>
                  {on && (
                    <span className="ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: c.theme.primary, color: c.theme.ink }}>
                      ✓
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm italic" style={{ color: c.theme.accent }}>
                  “{c.motto}”
                </p>
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                  <span className="text-lg">🏛️</span>
                  <div className="min-w-0 text-xs">
                    <p className="text-white/50">President</p>
                    <p className="truncate text-sm font-medium">
                      {c.president} <span className="text-white/45">@{c.presidentHandle}</span>
                    </p>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="btn-ghost text-sm" disabled={busy} onClick={() => send({ skip: true })}>
          Skip, stay Solanan
        </button>
        <button
          className="ml-auto rounded-full px-5 py-2.5 text-sm font-semibold transition hover:brightness-110 disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${chosen.theme.gradient[0]}, ${chosen.theme.gradient[1]})`, color: chosen.theme.ink }}
          disabled={busy}
          onClick={() => send({ country: pick })}
        >
          {busy ? 'Issuing your ID…' : `Become ${/^[AEIOU]/.test(chosen.demonym) ? 'an' : 'a'} ${chosen.demonym}`}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
    </div>
  );
}
