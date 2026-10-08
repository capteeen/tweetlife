'use client';
import { useState } from 'react';
import type { Look } from '@/lib/life/look';
import { CountryStep } from '@/components/citizen/CountryStep';
import { AvatarCreator } from './AvatarCreator';

// Sign-up: nationality first (only if not picked yet), then the avatar creator.
export function CreateFlow(props: { handle: string; name: string; avatarUrl: string | null; initial: Look; next: string; firstTime: boolean; needsCountry: boolean }) {
  const [step, setStep] = useState<'country' | 'look'>(props.needsCountry ? 'country' : 'look');
  if (step === 'country')
    return <CountryStep holder={{ name: props.name, handle: props.handle, avatarUrl: props.avatarUrl, look: props.initial }} onNext={() => setStep('look')} />;
  return <AvatarCreator handle={props.handle} initial={props.initial} next={props.next} firstTime={props.firstTime} />;
}
