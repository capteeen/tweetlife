'use client';
import { Suspense, useState } from 'react';
import dynamic from 'next/dynamic';
import { HAIR, HAIR_STYLES, SKIN, randomLook, type Look } from '@/lib/life/look';
import { COUNTRY_LIST, COUNTRIES, type CountryId } from '@/lib/world/countries';

const Preview = dynamic(() => import('./Preview').then((m) => m.Preview), { ssr: false });

// Sign-up in one screen: where you are from, body, skin and hair, with a Randomise button for everything else.
// Outfits are changed later at the Wardrobe in the phone (the full creator), so nothing here stands between a
// new player and the game. The ID card is not shown here: it is stamped at passport control when you land.

const HAIR_NAMES: Partial<Record<Look['hairStyle'], string>> = {
  crop: 'Short', buzz: 'Buzz', afro: 'Afro', braids: 'Braids', locs: 'Locs', bun: 'Bun', ponytail: 'Ponytail', long: 'Long', cap: 'Cap', bald: 'Bald',
};

export function QuickCreator({ handle, initial, next, needsCountry, country: fixedCountry }: { handle: string; initial: Look; next: string; needsCountry: boolean; country: CountryId }) {
  const [look, setLook] = useState<Look>(initial);
  const [country, setCountry] = useState<CountryId>(fixedCountry);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Look>(k: K, v: Look[K]) => setLook((l) => ({ ...l, [k]: v }));
  const c = COUNTRIES[country];

  const put = async (url: string, body: object, okStatus: number[] = []) => {
    const res = await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok || okStatus.includes(res.status)) return;
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `HTTP ${res.status}`);
  };

  const play = async () => {
    setSaving(true);
    setError(null);
    try {
      // 409 = already has a nationality (a second tab, or a back button): fine, carry on
      if (needsCountry) await put('/api/life/nationality', { country }, [409]);
      await put('/api/life/look', { look });
      window.location.href = next;
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const randomise = () => setLook(randomLook());

  return (
    <main className="fixed inset-0 flex flex-col bg-base text-white md:flex-row">
      <section
        className="relative h-[38vh] shrink-0 md:h-auto md:flex-1"
        style={{ background: `radial-gradient(ellipse at 50% 35%, ${c.theme.primary}40 0%, #141a28 60%, #0B0E14 100%)` }}
      >
        <Suspense fallback={null}>
          <Preview look={look} focus="body" />
        </Suspense>
        <div className="pointer-events-none absolute left-4 top-4">
          <p className="text-xs uppercase tracking-wider text-white/50">Make your character</p>
          <h1 className="text-xl font-semibold">@{handle}</h1>
        </div>
        <button
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-base shadow-xl transition hover:scale-105 active:scale-95"
          onClick={randomise}
        >
          🎲 Randomise
        </button>
      </section>

      <section className="flex min-h-0 flex-1 flex-col md:w-[420px] md:flex-none md:border-l md:border-white/10">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <Group title={needsCountry ? 'Where are you from?' : 'Citizen of'}>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Nationality">
              {COUNTRY_LIST.map((x) => {
                const on = x.id === country;
                return (
                  <button
                    key={x.id}
                    role="radio"
                    aria-checked={on}
                    disabled={!needsCountry && !on}
                    onClick={() => setCountry(x.id)}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs transition disabled:opacity-30 ${on ? 'font-semibold' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                    style={on ? { borderColor: x.theme.primary, background: `${x.theme.primary}26` } : undefined}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={x.logo} alt="" className="h-6 w-6" />
                    {x.name}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-white/45">
              You land in {c.capital}. President {c.president}. You can fly to the others.
            </p>
          </Group>

          <Group title="Body">
            <div className="grid grid-cols-2 gap-2">
              {(['male', 'female'] as const).map((b) => (
                <button
                  key={b}
                  aria-pressed={look.body === b}
                  className={`rounded-xl border px-3 py-2 text-sm transition ${look.body === b ? 'border-x bg-x/20 font-semibold' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                  onClick={() => set('body', b)}
                >
                  {b === 'male' ? 'Male' : 'Female'}
                </button>
              ))}
            </div>
          </Group>

          <Group title="Skin tone">
            <Swatches colors={SKIN} value={look.skin} onPick={(v) => set('skin', v)} />
          </Group>

          <Group title="Hair">
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {HAIR_STYLES.map((h) => (
                <button
                  key={h}
                  aria-pressed={look.hairStyle === h}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition ${look.hairStyle === h ? 'border-x bg-x/20 font-semibold' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                  onClick={() => set('hairStyle', h)}
                >
                  {HAIR_NAMES[h] ?? h}
                </button>
              ))}
            </div>
            <div className="mt-2.5">
              <Swatches colors={HAIR} value={look.hair} onPick={(v) => set('hair', v)} small />
            </div>
          </Group>

          <p className="text-xs text-white/45">👕 Your outfit is picked for you. Change it any time at the Wardrobe in your phone.</p>
        </div>

        <footer className="border-t border-white/10 p-3">
          <button className="btn w-full !py-3 text-base" onClick={play} disabled={saving}>
            {saving ? 'Boarding…' : `✈️ Fly to ${c.name}`}
          </button>
          {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
        </footer>
      </section>
    </main>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 text-xs uppercase tracking-wider text-white/50">{title}</h2>
      {children}
    </div>
  );
}

function Swatches({ colors, value, onPick, small }: { colors: string[]; value: string; onPick: (v: string) => void; small?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((col, i) => {
        const on = value.toUpperCase() === col.toUpperCase();
        return (
          <button
            key={col}
            aria-label={`Colour ${i + 1}`}
            aria-pressed={on}
            className={`${small ? 'h-7 w-7' : 'h-9 w-9'} rounded-full border-2 transition ${on ? 'scale-110 border-white ring-2 ring-x' : 'border-white/15 hover:scale-105'}`}
            style={{ background: col }}
            onClick={() => onPick(col)}
          />
        );
      })}
    </div>
  );
}
