'use client';
import { useState } from 'react';
import { countryOf } from '@/lib/world/countries';
import type { Citizenship } from '@/lib/life/citizen';
import { CountryPicker } from './CountryPicker';
import { IdCard, type IdHolder } from './IdCard';

// The nationality step of sign-up, before the avatar creator: pick a country, see your ID card, go on.

export function CountryStep({ holder, onNext }: { holder: IdHolder; onNext: () => void }) {
  const [issued, setIssued] = useState<Citizenship | null>(null);
  return (
    <main className="fixed inset-0 overflow-y-auto bg-base text-white" style={{ background: 'radial-gradient(ellipse at 50% 0%, #2a3b5c 0%, #141a28 55%, #0B0E14 100%)' }}>
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-4 py-6 md:py-12">
        <p className="text-xs uppercase tracking-wider text-white/50">Step 1 of 2 · Nationality</p>
        {issued ? (
          <div className="mx-auto mt-2 w-full max-w-md">
            <h1 className="text-2xl font-semibold">Welcome, {countryOf(issued.country).demonym}</h1>
            <p className="mb-5 mt-1 text-white/60">Here is your national ID card. It lives in your phone.</p>
            <IdCard holder={holder} citizen={issued} />
            <button className="btn mt-6 w-full" onClick={onNext}>
              Next: pick your look
            </button>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">Where are you from, @{holder.handle}?</h1>
            <p className="mb-6 mt-1 max-w-2xl text-white/60">
              Each country is its own city in its coin&apos;s colours, with its own president. This one is home: you live here and it issues your ID card. You can fly to the others.
            </p>
            <CountryPicker onDone={setIssued} />
          </>
        )}
      </div>
    </main>
  );
}
