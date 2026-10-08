import type { Stats } from './stats';

// One set of names for the three stats, used everywhere the player reads them.

export type StatKey = keyof Stats;

export const STATS: Record<StatKey, { name: string; emoji: string; color: string; what: string }> = {
  vibes: { name: 'Vibes', emoji: '🎉', color: '#FF5D8F', what: 'How much fun you are having. Dance, party at Club Moon, play at home.' },
  clout: { name: 'Clout', emoji: '💬', color: '#1D9BF0', what: 'How social you are. Say GM, gist, take selfies, buy rounds.' },
  gas: { name: 'Gas', emoji: '⚡', color: '#FFD166', what: 'Your energy. Walking burns it. Sleep at home or rest to refill.' },
};

export const STAT_ORDER: StatKey[] = ['vibes', 'clout', 'gas'];

/** "+8 Vibes · −5 Gas" for a stat change. */
export function statDelta(d: Partial<Stats>, sep = ' · ') {
  return STAT_ORDER.filter((k) => d[k])
    .map((k) => `${d[k]! > 0 ? '+' : '−'}${Math.abs(d[k]!)} ${STATS[k].name}`)
    .join(sep);
}

/** What the status line says when you are not doing anything in particular. */
export const IDLE_STATUS = 'Out and about';
