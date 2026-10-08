'use client';
import type { LifeMe } from '@/components/world/store';
import type { SocialSend } from './useLife';
import { houseUrl, loveActions } from './loveClient';
import { DATES, KINDS, MAX_PARTNERS, type BondView, type LoveState, type RequestKind } from '@/lib/life/love';
import { TROUBLE_GROUP } from './troubleActions';

// What you can do with someone from a chat: a list of groups of actions, shown by SocialMenu in the player card
// (PeerCard) and the AI resident card (ResidentCard). To add actions, add a group here: each action says who it
// works on, when it is hidden or disabled, and what it does (call your own API route from `run`). The server
// route is where the rules are enforced; these only decide which buttons to show.

export type SocialTarget = { kind: 'player'; handle: string } | { kind: 'resident'; id: string; name: string };

export type SocialCtx = {
  target: SocialTarget;
  me: LifeMe;
  worldId?: string;
  /** deliver a live notice to a player in the same world (no-op elsewhere) */
  sendSocial: SocialSend;
  love: LoveState | null;
  /** put a line into the AI resident chat (resident card only): what you asked, and their answer */
  say?: (text: string, role?: 'user' | 'assistant') => void;
};

/** What happened: a toast line, and optionally somewhere to go now (a house). */
export type SocialOutcome = { toast?: string; go?: { label: string; href: string } } | void;

export type SocialAction = {
  id: string;
  label: string | ((ctx: SocialCtx) => string);
  emoji: string;
  hint?: string | ((ctx: SocialCtx) => string);
  targets: SocialTarget['kind'][];
  hidden?: (ctx: SocialCtx) => boolean;
  /** shown under a disabled button */
  disabledReason?: (ctx: SocialCtx) => string | null;
  run: (ctx: SocialCtx) => Promise<SocialOutcome>;
};

export type SocialGroup = { id: string; title: string; actions: SocialAction[] };

const nameOf = (t: SocialTarget) => (t.kind === 'player' ? `@${t.handle}` : t.name);
const firstName = (t: SocialTarget) => (t.kind === 'player' ? `@${t.handle}` : t.name.replace(/^(Big|Coach|Uncle|DJ|Nurse) /, ''));
const to = (t: SocialTarget) => (t.kind === 'player' ? { handle: t.handle } : { residentId: t.id });

/** Your bond with the target, if any. */
export function bondFor(ctx: Pick<SocialCtx, 'target' | 'love'>): BondView | null {
  const t = ctx.target;
  return (
    ctx.love?.bonds.find((b) => (t.kind === 'player' ? b.who.kind === 'player' && b.who.handle.toLowerCase() === t.handle.toLowerCase() : b.who.kind === 'resident' && b.who.id === t.id)) ?? null
  );
}

const pending = (ctx: SocialCtx, kind: RequestKind) =>
  ctx.target.kind === 'player' &&
  !!ctx.love?.outgoing.some((r) => r.kind === kind && r.who.kind === 'player' && r.who.handle.toLowerCase() === (ctx.target as { handle: string }).handle.toLowerCase());

async function askAndTell(ctx: SocialCtx, kind: RequestKind, detail?: string): Promise<SocialOutcome> {
  const r = await loveActions.ask(kind, to(ctx.target), detail, ctx.sendSocial);
  const who = nameOf(ctx.target);
  if (r.reply) {
    const d = DATES[detail as keyof typeof DATES];
    ctx.say?.(kind === 'invite' ? 'Come over to my place? 🏠' : kind === 'visit' ? 'Can I come over to yours? 🚪' : kind === 'date' ? 'Will you go out with me? 💘' : `Date night? ${d ? d.label : ''} ${d?.emoji ?? ''}`.trim(), 'user');
    ctx.say?.(r.reply, 'assistant');
  }
  if (r.accepted === false) return { toast: `${firstName(ctx.target)} said no${kind === 'date' ? ' 💔' : ''}. Talk more and try again later.` };
  if (r.accepted) {
    const me = { kind: 'player' as const, handle: ctx.me.handle, name: ctx.me.name, avatarUrl: null };
    const them = ctx.target.kind === 'player' ? { kind: 'player' as const, handle: ctx.target.handle, name: ctx.target.handle, avatarUrl: null } : { kind: 'resident' as const, id: ctx.target.id, name: ctx.target.name };
    if (kind === 'invite') return { toast: `🏠 ${who} is coming over to your place`, go: { label: 'Go home', href: houseUrl(me) } };
    if (kind === 'visit') return { toast: `🚪 ${who} said come through`, go: { label: `Go to ${firstName(ctx.target)}'s place`, href: houseUrl(them) } };
    if (kind === 'date') return { toast: `💞 You and ${who} are dating now` };
    return { toast: `${DATES[detail as keyof typeof DATES]?.emoji ?? '💞'} Date with ${who} is on` };
  }
  return { toast: `💌 Sent. ${who} can accept it in their phone.` };
}

export const LOVE_GROUP: SocialGroup = {
  id: 'love',
  title: 'Hang out and date',
  actions: [
    {
      id: 'invite',
      label: KINDS.invite.label,
      emoji: KINDS.invite.emoji,
      hint: 'They can hang out at yours for 2 hours',
      targets: ['player', 'resident'],
      disabledReason: (ctx) => (pending(ctx, 'invite') ? 'Invite sent, waiting on them' : null),
      run: (ctx) => askAndTell(ctx, 'invite'),
    },
    {
      id: 'visit',
      label: KINDS.visit.label,
      emoji: KINDS.visit.emoji,
      hint: (ctx) => `Visit ${firstName(ctx.target)}'s place`,
      targets: ['player', 'resident'],
      disabledReason: (ctx) => (pending(ctx, 'visit') ? 'Asked, waiting on them' : null),
      run: (ctx) => askAndTell(ctx, 'visit'),
    },
    {
      id: 'date',
      label: KINDS.date.label,
      emoji: KINDS.date.emoji,
      hint: (ctx) => `Start dating · you date ${ctx.love?.dating ?? 0} of ${MAX_PARTNERS}`,
      targets: ['player', 'resident'],
      hidden: (ctx) => bondFor(ctx)?.status === 'dating',
      disabledReason: (ctx) =>
        (ctx.love?.dating ?? 0) >= MAX_PARTNERS ? `You're dating ${MAX_PARTNERS} people, the most allowed` : pending(ctx, 'date') ? 'Asked, waiting on their answer' : null,
      run: (ctx) => askAndTell(ctx, 'date'),
    },
    ...Object.values(DATES).map(
      (d): SocialAction => ({
        id: `outing-${d.id}`,
        label: d.label,
        emoji: d.emoji,
        hint: `Date night · ${d.bags ? `${d.bags} bags · ` : ''}+${d.me.vibes} vibes each`,
        targets: ['player', 'resident'],
        hidden: (ctx) => bondFor(ctx)?.status !== 'dating',
        disabledReason: (ctx) => {
          const b = bondFor(ctx);
          if (b?.nextDateAt && b.nextDateAt > Date.now()) return `Next date in ${Math.ceil((b.nextDateAt - Date.now()) / 60000)} min`;
          if (d.bags > ctx.me.bags) return `Needs ${d.bags} bags`;
          if (pending(ctx, 'outing')) return 'Asked, waiting on them';
          return null;
        },
        run: (ctx) => askAndTell(ctx, 'outing', d.id),
      }),
    ),
  ],
};

/** Every group of actions, in the order they show. Add yours here. */
export const SOCIAL_GROUPS: SocialGroup[] = [LOVE_GROUP, TROUBLE_GROUP];
