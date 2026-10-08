import type { StructureRow } from './geometry';
import { seededFor } from './seed';

// Plain buildings around a player's real posts. Tweetlife reads only each player's newest few posts from X (every
// post read is billed), so the lots their posts leave empty get these instead: the same for a handle on every load,
// with no post behind them and nothing to open.

const PREFIX = 'filler:';

export const isFiller = (postId: string) => postId.startsWith(PREFIX);

/** Rows that take a lot of their own (reposts and replies to others attach to a neighbour's lot). */
const takesLot = (r: StructureRow) => r.kind !== 'lantern' && r.kind !== 'outbuilding';

/**
 * `rows` plus plain buildings until `lots` lots are filled. They are dated just after the newest post, so the real
 * posts keep the first lots (the centre block of a plot) and the fillers wrap around them.
 */
export function withFillers(rows: StructureRow[], handle: string, lots: number): StructureRow[] {
  const missing = lots - rows.filter((r) => !r.hidden && takesLot(r)).length;
  if (missing <= 0) return rows;
  const rand = seededFor(handle, 'filler');
  const newest = rows.reduce((t, r) => Math.max(t, Date.parse(r.postedAt) || 0), 0) || Date.UTC(2020, 0, 1);
  const out = [...rows];
  for (let n = 0; n < missing; n++) {
    // modest, varied sizes: a few dozen to a few hundred "likes" of height, never taller than a real hit
    const likes = Math.round(10 ** (1 + rand() * 1.6));
    out.push({
      id: `${PREFIX}${handle}:${n}`,
      postId: `${PREFIX}${handle}:${n}`,
      kind: 'pillar',
      conversationId: null,
      referencedId: null,
      text: '',
      mediaUrl: null,
      mediaKind: null,
      likes,
      reposts: Math.round(likes * rand() * 0.2),
      replies: Math.round(likes * rand() * 0.1),
      impressions: likes * 40,
      postedAt: new Date(newest + (n + 1) * 1000).toISOString(),
      hidden: false,
      lanternsLit: 0,
    });
  }
  return out;
}
