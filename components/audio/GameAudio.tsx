'use client';
import { useEffect } from 'react';
import { useWorld, type WorldState } from '@/components/world/store';
import { installAudioUnlock } from '@/lib/audio/engine';
import { sfx } from '@/lib/audio/sfx';

// The sounds of the interface and of things happening to you, for any page with the game's HUD (the city and
// the house): button clicks, the phone opening and closing, app taps, the map unfolding, bags coming in and
// going out, purchases, quest rewards, notifications, and the everyday moves (selfie shutter, push-up breaths).
// It also arms the audio unlock: the first tap or key anywhere starts sound (browsers allow nothing before).

let lastUi = 0;
const ui = (name: Parameters<typeof sfx>[0], o?: Parameters<typeof sfx>[1]) => {
  lastUi = performance.now();
  sfx(name, o);
};

export function GameAudio() {
  useEffect(() => {
    installAudioUnlock();

    // a soft click on every button and link, unless the click already made its own sound (phone, map...)
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('button, a, [role="button"], select');
      if (!el || (el as HTMLButtonElement).disabled) return;
      const at = performance.now();
      setTimeout(() => {
        if (lastUi < at) sfx('click');
      }, 0);
    };
    window.addEventListener('click', onClick, { capture: true });

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (ms: number, f: () => void) => {
      const t = setTimeout(() => {
        timers.delete(t);
        f();
      }, ms);
      timers.add(t);
    };

    const unsub = useWorld.subscribe((s: WorldState, prev: WorldState) => {
      // phone
      if (s.phone.open !== prev.phone.open) ui(s.phone.open ? 'phoneOpen' : 'phoneClose');
      else if (s.phone.open && s.phone.app !== prev.phone.app) ui('tap');
      if (s.mapOpen && !prev.mapOpen) ui('mapOpen');
      // tapping things in the 3D world (a post, a person, a venue, a resident) opens a card
      if ((s.selected && s.selected !== prev.selected) || (s.selectedPeer && s.selectedPeer !== prev.selectedPeer) || (s.selectedVenue && s.selectedVenue !== prev.selectedVenue) || (s.selectedResident && s.selectedResident !== prev.selectedResident)) ui('tap');

      // bags in and out (only changes, not the first load)
      const was = prev.life?.me?.bags, now = s.life?.me?.bags;
      if (was != null && now != null && now !== was) {
        const d = now - was;
        if (d > 0) ui('coins', { v: Math.log10(d + 1) * 1.5 });
        else ui('spend', { gain: 0.8 });
      }

      // things that happened, announced as toasts
      if (s.toasts.length && s.toasts[s.toasts.length - 1] !== prev.toasts[prev.toasts.length - 1]) {
        const t = s.toasts[s.toasts.length - 1];
        if (t.kind === 'quest') ui('quest');
        else if (t.kind === 'market' && /own|house|Bought/.test(t.text)) later(180, () => sfx('unbox'));
        else if (t.kind === 'send') ui('send');
        else if (t.kind === 'balloon' && /2x/.test(t.text)) ui('gold');
        else if (t.kind === 'wallet' || t.kind === 'social' || t.kind === 'info' || t.kind === 'chat' || t.kind === 'mention') ui('notify');
      }

      // everyday moves
      if (s.doing?.id !== prev.doing?.id && s.doing) {
        const id = s.doing.id, until = s.doing.until;
        const still = () => useWorld.getState().doing?.id === id && useWorld.getState().doing?.until === until;
        if (id === 'selfie') [900, 2600].forEach((ms) => later(ms, () => still() && sfx('shutter')));
        if (id === 'pushups') for (let k = 0; k < 8; k++) later(600 + k * 1150, () => still() && sfx('exhale', { v: 1.4 }));
        if (id === 'rest') later(400, () => still() && sfx('sigh'));
        if (id === 'stretch') later(1500, () => still() && sfx('sigh'));
        if (id === 'dance') for (let k = 0; k < 8; k++) later(300 + k * 1070, () => still() && sfx('clap', { gain: 0.6 }));
      }
    });

    return () => {
      window.removeEventListener('click', onClick, { capture: true });
      unsub();
      timers.forEach(clearTimeout);
    };
  }, []);
  return null;
}
