'use client';
import { useState } from 'react';
import { useWorld } from '@/components/world/store';
import { countryOf } from '@/lib/world/countries';
import type { Citizenship } from '@/lib/life/citizen';
import { CountryPicker } from './CountryPicker';
import { IdCard } from './IdCard';

// Players from before countries existed (or who left sign-up early) get asked once, in the world.
// Skipping makes them Solanan, the country the original city became. Then they see their new ID.

export function CountryPrompt() {
  const me = useWorld((s) => s.life?.me ?? null);
  const patchMe = useWorld((s) => s.patchMe);
  const [issued, setIssued] = useState<Citizenship | null>(null);
  if (!me?.citizen) return null;
  if (me.citizen.nationality && !issued) return null;
  const done = (c: Citizenship) => setIssued(c);
  const close = () => {
    if (issued) patchMe({ citizen: issued });
    setIssued(null);
  };
  return (
    <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm">
      <div className="flex max-h-[94vh] w-[min(96vw,920px)] flex-col overflow-y-auto rounded-3xl border border-white/10 bg-base p-4 text-white shadow-2xl md:p-6">
        {issued ? (
          <div className="mx-auto w-full max-w-md text-center">
            <p className="text-xs uppercase tracking-wider text-white/50">Welcome, citizen</p>
            <h2 className="mb-4 text-xl font-semibold">You are {countryOf(issued.country).demonym}</h2>
            <IdCard holder={{ name: me.name, handle: me.handle, avatarUrl: me.avatarUrl, look: me.look }} citizen={issued} />
            <p className="mt-3 text-sm text-white/60">Your ID card lives in your phone. Fly to the other countries any time.</p>
            <button className="btn mt-4 w-full" onClick={close}>
              Back to the city
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs uppercase tracking-wider text-white/50">One question, once</p>
            <h2 className="text-xl font-semibold">Which country are you from?</h2>
            <p className="mb-4 mt-1 text-sm text-white/60">Tweetlife is three countries now. Pick your nationality and get your national ID card. You can still fly to the others.</p>
            <CountryPicker onDone={done} />
          </>
        )}
      </div>
    </div>
  );
}
