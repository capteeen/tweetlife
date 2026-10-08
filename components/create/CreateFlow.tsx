'use client';
import { useState } from 'react';
import type { Look } from '@/lib/life/look';
import type { CountryId } from '@/lib/world/countries';
import { CountryStep } from '@/components/citizen/CountryStep';
import { AvatarCreator } from './AvatarCreator';
import { QuickCreator } from './QuickCreator';

// Sign-up: a new player gets the one-screen creator (country, body, skin, hair, Randomise) and goes straight in.
// Everyone else, and the Wardrobe in the phone, gets the full creator; nationality first if it was never picked.
export function CreateFlow(props: {
  handle: string; name: string; avatarUrl: string | null; initial: Look; next: string; firstTime: boolean; needsCountry: boolean; country: CountryId; wardrobe: boolean;
}) {
  const quick = props.firstTime && !props.wardrobe;
  const [step, setStep] = useState<'country' | 'look'>(props.needsCountry && !quick ? 'country' : 'look');
  if (quick) return <QuickCreator handle={props.handle} initial={props.initial} next={props.next} needsCountry={props.needsCountry} country={props.country} />;
  if (step === 'country')
    return <CountryStep holder={{ name: props.name, handle: props.handle, avatarUrl: props.avatarUrl, look: props.initial }} onNext={() => setStep('look')} />;
  return <AvatarCreator handle={props.handle} initial={props.initial} next={props.next} firstTime={props.firstTime} />;
}
