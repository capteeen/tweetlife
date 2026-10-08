// Sound is always on: there is no mute switch and no volume slider anywhere in the app (jafar's call,
// 2026-10-08). These are the fixed levels of the four buses. Settings saved by older versions
// ('tl-sound', 'tl-music-muted') are no longer read, so nobody stays muted from before.

export type Bus = 'master' | 'music' | 'sfx' | 'ambience';

export const LEVELS: Record<Bus, number> = { master: 0.8, music: 0.7, sfx: 0.8, ambience: 0.6 };
