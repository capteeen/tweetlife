'use client';
import { useWorld } from '@/components/world/store';
import { FIGHT_MIN_GAS, REACH_PLAYER, STEAL_BASE_CHANCE, STEAL_MAX, STEAL_RESIDENT_MAX, stealChance } from '@/lib/life/crimeRules';
import { crimeActions } from './crime';
import type { SocialAction, SocialCtx, SocialGroup } from './socialActions';

// Trouble: pickpocket or start a fight, from the same menu as everything else you can do with someone
// (SocialMenu). The buttons only say why something is off right now; app/api/life/crime re-checks it all,
// including how close you are, and rolls the dice. crimeActions plays the result and toasts it.

function blocked(ctx: SocialCtx, kind: 'steal' | 'fight'): string | null {
  const rec = ctx.me.record;
  if (rec?.peaceful) return "You're in Peaceful mode";
  if (rec?.jailedUntil && Date.parse(rec.jailedUntil) > Date.now()) return "You're in a cell";
  if (rec?.dazedUntil && Date.parse(rec.dazedUntil) > Date.now()) return 'Still seeing stars';
  if (kind === 'fight' && ctx.me.gas < FIGHT_MIN_GAS) return `Needs ${FIGHT_MIN_GAS} gas`;
  return null;
}

const close = (ctx: SocialCtx) => {
  // get the card out of the way so you can watch it play out
  const st = useWorld.getState();
  if (ctx.target.kind === 'player') st.selectPeer(null);
  else st.selectResident(null);
};

const near = (ctx: SocialCtx) => (ctx.target.kind === 'player' ? ` · stand within ${REACH_PLAYER}m` : '');

const STEAL: SocialAction = {
  id: 'steal',
  label: 'Pickpocket',
  emoji: '🫳',
  hint: (ctx) => {
    const odds = stealChance(ctx.me.record?.wanted ?? 0);
    const cap = ctx.target.kind === 'resident' ? STEAL_RESIDENT_MAX : STEAL_MAX;
    return `${Math.round(odds * 100)}% · 5% of their bags, up to ${cap}${odds < STEAL_BASE_CHANCE ? ' · your stars make you easy to spot' : ''}${near(ctx)}`;
  },
  targets: ['player', 'resident'],
  disabledReason: (ctx) => blocked(ctx, 'steal'),
  run: async (ctx) => {
    await crimeActions.steal(ctx.target, ctx.sendSocial);
    close(ctx);
  },
};

const FIGHT: SocialAction = {
  id: 'fight',
  label: 'Start a fight',
  emoji: '🥊',
  hint: (ctx) => `−10 gas each · winner +5 clout · loser dazed 30s${near(ctx)}`,
  targets: ['player', 'resident'],
  disabledReason: (ctx) => blocked(ctx, 'fight'),
  run: async (ctx) => {
    await crimeActions.fight(ctx.target, ctx.sendSocial);
    close(ctx);
  },
};

export const TROUBLE_GROUP: SocialGroup = { id: 'trouble', title: 'Trouble', actions: [STEAL, FIGHT] };
