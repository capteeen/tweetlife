// Player stats: Vibes (fun), Clout (social), Gas (energy). 0..100. They drift down with time and move with
// what you do. Mood is derived, never stored.

export type Stats = { vibes: number; clout: number; gas: number };

export const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Drift per hour away from the keyboard. */
const DRIFT_PER_HOUR: Stats = { vibes: -3, clout: -1, gas: -4 };

export function applyDrift(s: Stats, lastTickAt: Date, now = new Date()): Stats {
  const hours = Math.min(48, Math.max(0, (now.getTime() - lastTickAt.getTime()) / 3600000));
  return {
    vibes: clamp(s.vibes + DRIFT_PER_HOUR.vibes * hours),
    clout: clamp(s.clout + DRIFT_PER_HOUR.clout * hours),
    gas: clamp(s.gas + DRIFT_PER_HOUR.gas * hours),
  };
}

export type Mood = 'Rekt' | 'Coping' | 'Comfy' | 'Mooning';

export function moodOf(s: Stats): { mood: Mood; emoji: string } {
  const avg = (s.vibes + s.clout + s.gas) / 3;
  if (avg < 30) return { mood: 'Rekt', emoji: '😩' };
  if (avg < 55) return { mood: 'Coping', emoji: '😐' };
  if (avg < 78) return { mood: 'Comfy', emoji: '😎' };
  return { mood: 'Mooning', emoji: '🚀' };
}

/** What each social action does. `me` applies to the actor, `them` to the target. */
export const INTERACTIONS = {
  gm: { label: 'Say GM', emoji: '👋', me: { clout: +2 }, them: { clout: +2, vibes: +1 }, bags: 0, line: 'gm ☀️' },
  gist: { label: 'Gist', emoji: '💬', me: { clout: +2, vibes: +2 }, them: { clout: +2, vibes: +2 }, bags: 0, line: 'wants to gist' },
  shill: { label: 'Shill your bag', emoji: '📣', me: { clout: +3, gas: -3 }, them: { vibes: +1 }, bags: 0, line: 'is shilling' },
  ape: { label: 'Ape together', emoji: '🦍', me: { vibes: +4, gas: -5 }, them: { vibes: +4 }, bags: 0, line: 'wants to ape together' },
  tip: { label: 'Send 100 bags', emoji: '💸', me: { clout: +5, vibes: +2 }, them: { vibes: +5, clout: +1 }, bags: 100, line: 'sent you 100 bags' },
  compliment: { label: 'Compliment their fit', emoji: '✨', me: { clout: +2 }, them: { vibes: +4, clout: +2 }, bags: 0, line: 'likes your fit' },
  dance: { label: 'Dance together', emoji: '💃', me: { vibes: +5, gas: -6 }, them: { vibes: +5, gas: -3 }, bags: 0, line: 'is dancing with you' },
} as const;

export type InteractionKind = keyof typeof INTERACTIONS;

export function applyDelta(s: Stats, d: Partial<Stats>): Stats {
  return { vibes: clamp(s.vibes + (d.vibes ?? 0)), clout: clamp(s.clout + (d.clout ?? 0)), gas: clamp(s.gas + (d.gas ?? 0)) };
}
