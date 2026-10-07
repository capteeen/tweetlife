'use client';
import { Suspense, useState } from 'react';
import dynamic from 'next/dynamic';
import { HAIR, HAIR_STYLES, PANTS, SHIRT, SHIRT_ALT, SHOES, SKIN, randomLook, type Look } from '@/lib/life/look';

const Preview = dynamic(() => import('./Preview').then((m) => m.Preview), { ssr: false });

// Sign-up step: pick a body, skin tone, face, hair and clothes, with the figure updating live in 3D.

type Tab = 'body' | 'face' | 'hair' | 'top' | 'bottom';
const TABS: { id: Tab; label: string }[] = [
  { id: 'body', label: 'Body' },
  { id: 'face', label: 'Skin & face' },
  { id: 'hair', label: 'Hair' },
  { id: 'top', label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
];

const HAIR_NAMES: Record<Look['hairStyle'], string> = {
  crop: 'Short',
  buzz: 'Buzz cut',
  afro: 'Afro',
  braids: 'Braids',
  locs: 'Locs',
  bun: 'Bun',
  ponytail: 'Ponytail',
  long: 'Long',
  cap: 'Cap',
  bald: 'Bald',
};

export function AvatarCreator({ handle, initial, next, firstTime }: { handle: string; initial: Look; next: string; firstTime: boolean }) {
  const [look, setLook] = useState<Look>(initial);
  const [tab, setTab] = useState<Tab>('body');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Look>(k: K, v: Look[K]) => setLook((l) => ({ ...l, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/life/look', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ look }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      window.location.href = next;
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <main className="fixed inset-0 flex flex-col bg-base text-white md:flex-row">
      <section className="relative h-[46vh] shrink-0 md:h-auto md:flex-1" style={{ background: 'radial-gradient(ellipse at 50% 35%, #2a3b5c 0%, #141a28 60%, #0B0E14 100%)' }}>
        <Suspense fallback={null}>
          <Preview look={look} focus={tab === 'face' || tab === 'hair' ? 'head' : 'body'} />
        </Suspense>
        <div className="pointer-events-none absolute left-4 top-4">
          <p className="text-xs uppercase tracking-wider text-white/50">{firstTime ? 'Last step · Pick your look' : 'Your look'}</p>
          <h1 className="text-xl font-semibold">@{handle}</h1>
        </div>
        <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-white/40">Drag to turn</p>
      </section>

      <section className="flex min-h-0 flex-1 flex-col md:w-[420px] md:flex-none md:border-l md:border-white/10">
        <nav className="flex gap-1 overflow-x-auto px-3 pt-3" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${tab === t.id ? 'bg-white text-base font-semibold' : 'bg-white/8 text-white/75 hover:bg-white/15'}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {tab === 'body' && (
            <>
              <Group title="Body">
                <Choices
                  value={look.body}
                  options={[
                    { v: 'male', label: 'Male' },
                    { v: 'female', label: 'Female' },
                  ]}
                  onPick={(v) => set('body', v)}
                  wide
                />
              </Group>
              <Group title="Height">
                <Slider value={look.height} min={0.92} max={1.08} onChange={(v) => set('height', v)} left="Shorter" right="Taller" />
              </Group>
              <Group title="Build">
                <Slider value={look.build} min={0.9} max={1.1} onChange={(v) => set('build', v)} left="Slim" right="Broad" />
              </Group>
            </>
          )}
          {tab === 'face' && (
            <>
              <Group title="Skin tone">
                <Swatches colors={SKIN} value={look.skin} onPick={(v) => set('skin', v)} big />
              </Group>
              <Group title="Eye shape">
                <Choices
                  value={look.eyes}
                  options={[
                    { v: 'round', label: 'Round' },
                    { v: 'almond', label: 'Almond' },
                  ]}
                  onPick={(v) => set('eyes', v)}
                  wide
                />
              </Group>
            </>
          )}
          {tab === 'hair' && (
            <>
              <Group title="Style">
                <Choices value={look.hairStyle} options={HAIR_STYLES.map((v) => ({ v, label: HAIR_NAMES[v] }))} onPick={(v) => set('hairStyle', v)} />
              </Group>
              <Group title="Colour">
                <Swatches colors={HAIR} value={look.hair} onPick={(v) => set('hair', v)} />
              </Group>
            </>
          )}
          {tab === 'top' && (
            <>
              <Group title="Colour">
                <Swatches colors={SHIRT} value={look.shirt} onPick={(v) => set('shirt', v)} />
              </Group>
              <Group title="Sleeves">
                <Choices
                  value={look.sleeves}
                  options={[
                    { v: 'short', label: 'Short' },
                    { v: 'long', label: 'Long' },
                  ]}
                  onPick={(v) => set('sleeves', v)}
                  wide
                />
              </Group>
              <Group title="Pattern">
                <Choices
                  value={look.pattern}
                  options={[
                    { v: 'solid', label: 'Plain' },
                    { v: 'stripes', label: 'Stripes' },
                    { v: 'yoke', label: 'Two-tone' },
                  ]}
                  onPick={(v) => set('pattern', v)}
                  wide
                />
              </Group>
              {look.pattern !== 'solid' && (
                <Group title="Accent">
                  <Swatches colors={SHIRT_ALT} value={look.shirtAlt} onPick={(v) => set('shirtAlt', v)} />
                </Group>
              )}
            </>
          )}
          {tab === 'bottom' && (
            <>
              <Group title="Style">
                <Choices
                  value={look.bottom}
                  options={[
                    { v: 'pants', label: 'Trousers' },
                    { v: 'shorts', label: 'Shorts' },
                    { v: 'skirt', label: 'Skirt' },
                  ]}
                  onPick={(v) => set('bottom', v)}
                  wide
                />
              </Group>
              <Group title="Colour">
                <Swatches colors={PANTS} value={look.pants} onPick={(v) => set('pants', v)} />
              </Group>
              <Group title="Shoes">
                <Swatches colors={SHOES} value={look.shoes} onPick={(v) => set('shoes', v)} />
              </Group>
            </>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-white/10 p-3">
          <button
            className="btn-ghost"
            onClick={() => setLook(randomLook())}
            title="Random look"
          >
            🎲 Shuffle
          </button>
          {!firstTime && (
            <a className="btn-ghost" href={next}>
              Cancel
            </a>
          )}
          <button className="btn ml-auto" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : firstTime ? 'Save and enter' : 'Save look'}
          </button>
        </footer>
        {error && <p className="px-4 pb-3 text-sm text-rose-300">{error}</p>}
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

function Choices<T extends string>({ value, options, onPick, wide }: { value: T; options: { v: T; label: string }[]; onPick: (v: T) => void; wide?: boolean }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${wide ? Math.min(options.length, 3) : 3}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.v}
          aria-pressed={value === o.v}
          className={`rounded-xl border px-3 py-2.5 text-sm transition ${value === o.v ? 'border-x bg-x/20 font-semibold' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
          onClick={() => onPick(o.v)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Swatches({ colors, value, onPick, big }: { colors: string[]; value: string; onPick: (v: string) => void; big?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {colors.map((c, i) => (
        <button
          key={c}
          aria-label={`Colour ${i + 1}`}
          aria-pressed={value.toUpperCase() === c.toUpperCase()}
          className={`${big ? 'h-11 w-11' : 'h-9 w-9'} rounded-full border-2 transition ${value.toUpperCase() === c.toUpperCase() ? 'scale-110 border-white ring-2 ring-x' : 'border-white/15 hover:scale-105'}`}
          style={{ background: c }}
          onClick={() => onPick(c)}
        />
      ))}
    </div>
  );
}

function Slider({ value, min, max, onChange, left, right }: { value: number; min: number; max: number; onChange: (v: number) => void; left: string; right: string }) {
  return (
    <div>
      <input type="range" className="w-full accent-[#1D9BF0]" min={min} max={max} step={0.005} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <div className="flex justify-between text-xs text-white/45">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}
