'use client';
import { create } from 'zustand';

// Sound settings: one mute switch and a volume per bus. Saved in localStorage so the choice sticks between
// visits. Shared by the title screen and the game.

export type Bus = 'master' | 'music' | 'sfx' | 'ambience';

export type SoundSettings = {
  muted: boolean;
  master: number;
  music: number;
  sfx: number;
  ambience: number;
};

const KEY = 'tl-sound';
const DEFAULTS: SoundSettings = { muted: false, master: 0.8, music: 0.7, sfx: 0.8, ambience: 0.6 };

function load(): SoundSettings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<SoundSettings> | null;
    // the old venue-music mute switch carries over
    const legacyMuted = localStorage.getItem('tl-music-muted') === '1';
    return { ...DEFAULTS, ...(legacyMuted ? { muted: true } : {}), ...(saved ?? {}) };
  } catch {
    return DEFAULTS;
  }
}

function save(s: SoundSettings) {
  try {
    const { muted, master, music, sfx, ambience } = s;
    localStorage.setItem(KEY, JSON.stringify({ muted, master, music, sfx, ambience }));
    localStorage.removeItem('tl-music-muted');
  } catch {}
}

type Store = SoundSettings & {
  setMuted: (m: boolean) => void;
  toggleMuted: () => void;
  setVolume: (bus: Bus, v: number) => void;
};

export const useSoundSettings = create<Store>((set, get) => ({
  ...load(),
  setMuted: (muted) => {
    set({ muted });
    save(get());
  },
  toggleMuted: () => get().setMuted(!get().muted),
  setVolume: (bus, v) => {
    set({ [bus]: Math.max(0, Math.min(1, v)) } as Partial<SoundSettings>);
    save(get());
  },
}));
