import type { Stats } from './stats';
import type { ActivityId } from './activities';
import { FURNITURE, type Slot } from './home';

// Relationships: inviting people over, visiting them, asking them out and going on dates. Shared by the server
// (app/api/life/love, lib/life/loveServer.ts) and the client (the chat buttons and the Relationships app).
//
// - A request goes to a player as something they accept or decline in their phone; an AI resident answers on
//   the spot, in character, based on affinity (how well you get on).
// - An accepted invite or visit is a pass: the guest may be in the host's house, using the furniture, for two
//   hours. Partners can drop by any time.
// - An accepted ask-out makes you partners (dating). You can date at most six people at once, AI residents
//   included. Dating is open: your partners are on your profile for everyone to see, so there is no cheating
//   mechanic. The cap is the rule.

export const MAX_PARTNERS = 6;

export type RequestKind = 'invite' | 'visit' | 'date' | 'outing';
export type BondStatus = 'talking' | 'dating' | 'ended';

export const KINDS: Record<RequestKind, { label: string; emoji: string; ask: string; /** minutes before a pending request lapses */ ttl: number; /** resident affinity needed for a yes */ residentNeeds: number }> = {
  invite: { label: 'Invite to my place', emoji: '🏠', ask: 'wants you to come over to their place', ttl: 30, residentNeeds: 15 },
  visit: { label: 'Ask to come over', emoji: '🚪', ask: 'wants to come over to your place', ttl: 30, residentNeeds: 15 },
  date: { label: 'Ask out', emoji: '💘', ask: 'is asking you out', ttl: 24 * 60, residentNeeds: 40 },
  outing: { label: 'Go on a date', emoji: '🍷', ask: 'wants to take you on a date', ttl: 120, residentNeeds: 0 },
};

/** How long an accepted visit lasts. */
export const PASS_MINUTES = 120;
/** After a no, you cannot ask that player the same thing again for this long. */
export const DECLINE_COOLDOWN_H = 24;
/** Requests you can have waiting at once, and send per day. */
export const PENDING_MAX = 10;
export const SEND_PER_DAY = 25;
/** One date per partner per this many hours. */
export const DATE_COOLDOWN_H = 3;

/** Affinity with an AI resident, 0..100: what builds it. */
export const AFFINITY = { chat: 2, chatPerDay: 20, visit: 5, date: 8, askedOut: 10, breakup: -25 } as const;
/** After a resident says no you can ask them again sooner than a player, once you've talked more. */
export const RESIDENT_RETRY_H = 1;

/** A small daily lift from each partner, counted for up to this many partners. */
export const DAILY_BONUS = { vibes: 2, clout: 1, maxPartners: 5 } as const;

export type DateId = 'dinner' | 'dance';
export type DateDef = {
  id: DateId;
  label: string;
  emoji: string;
  /** the venue it happens at (lib/life/venues.ts) */
  venue: string;
  venueName: string;
  /** paid by whoever asks */
  bags: number;
  seconds: number;
  /** applied to both of you */
  me: Partial<Stats>;
  /** the move both avatars play */
  act?: ActivityId;
  line: string;
};

export const DATES: Record<DateId, DateDef> = {
  dinner: { id: 'dinner', label: 'Dinner at Degen Lounge', emoji: '🍷', venue: 'bar', venueName: 'Degen Lounge', bags: 400, seconds: 90, me: { vibes: +12, gas: +8, clout: +3 }, line: 'is on a dinner date' },
  dance: { id: 'dance', label: 'Dancing at Club Moon', emoji: '💃', venue: 'club', venueName: 'Club Moon', bags: 0, seconds: 60, me: { vibes: +14, clout: +4, gas: -6 }, act: 'dance', line: 'is dancing with their date' },
};
export const dateById = (id: string | null | undefined) => (id && id in DATES ? DATES[id as DateId] : null);

/** Who hosts an invite or a visit: an invite is to the sender's house, a visit to the receiver's. */
export function hostSide(kind: RequestKind): 'from' | 'to' {
  return kind === 'invite' ? 'from' : 'to';
}

/** Words for the other side of a request, from the receiver's point of view. */
export function askLine(kind: RequestKind, detail?: string | null) {
  if (kind === 'outing') {
    const d = dateById(detail);
    return d ? `wants to take you ${d.id === 'dinner' ? 'to dinner at' : 'dancing at'} ${d.venueName}` : KINDS.outing.ask;
  }
  return KINDS[kind].ask;
}

/** An AI resident's house: a furnished room picked from the catalogue, the same for everyone. */
export function residentHome(residentId: string): { itemId: string; slot: Slot }[] {
  let h = 2166136261;
  for (const c of residentId) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const bySlot = new Map<Slot, string[]>();
  for (const f of FURNITURE) if (f.tier > 0 && !f.powerSeconds) bySlot.set(f.slot, [...(bySlot.get(f.slot) ?? []), f.id]);
  const out: { itemId: string; slot: Slot }[] = [];
  let i = 0;
  for (const [slot, ids] of bySlot) {
    i++;
    // about two in three slots are filled; seating, a bed, a kitchen and something to watch always are
    const always = slot === 'seat' || slot === 'bed' || slot === 'kitchen' || slot === 'wall';
    if (!always && (h >>> (i % 24)) % 3 === 0) continue;
    out.push({ itemId: ids[(h + i * 7919) % ids.length], slot });
  }
  return out;
}

// ----- what the client shows (GET /api/life/love) -----

export type PersonRef =
  | { kind: 'player'; handle: string; name: string; avatarUrl: string | null }
  | { kind: 'resident'; id: string; name: string };

export type BondView = {
  id: string;
  who: PersonRef;
  status: BondStatus;
  affinity: number | null;
  since: string;
  datingSince: string | null;
  lastDateAt: string | null;
  dates: number;
  /** epoch ms when the next date is allowed (null = now) */
  nextDateAt: number | null;
};

export type RequestView = {
  id: string;
  kind: RequestKind;
  detail: string | null;
  /** the other side */
  who: PersonRef;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  createdAt: string;
  expiresAt: string;
  respondedAt: string | null;
  passUntil: string | null;
};

export type VisitView = {
  id: string;
  /** whose house */
  host: PersonRef;
  guest: PersonRef;
  mineToHost: boolean;
  until: string;
};

export type LoveState = {
  bonds: BondView[];
  incoming: RequestView[];
  outgoing: RequestView[];
  /** my requests answered in the last half hour (so the asker hears the answer) */
  answered: RequestView[];
  visits: VisitView[];
  dating: number;
  max: number;
  bonus: { vibes: number; clout: number; partners: number } | null;
};

/** The public side: who someone is dating, for their profile. */
export type ProfileLove = { handle: string; partners: PersonRef[]; dating: number };
