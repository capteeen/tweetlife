// The guided first day: a short scripted path that gets a new player to something fun inside a minute.
// Shared by the server (lib/life/firstDay.ts) and the on-screen guide (components/life/FirstDay.tsx); no server imports.

export type FirstDayStepId = 'passport' | 'ride' | 'furniture' | 'shift' | 'coin' | 'finish';

export type FirstDayStepDef = {
  id: FirstDayStepId;
  emoji: string;
  title: string;
  /** one line under the title in the guide */
  hint: string;
  /** bags paid once, the first time the step is done */
  reward: number;
  /** the server checks the player's own records for these (a buy, a shift); the rest are moments the client reports */
  verified: boolean;
};

export const FIRST_DAY: FirstDayStepDef[] = [
  { id: 'passport', emoji: '🛂', title: 'Get your passport stamped', hint: 'You just landed. Show your ID at passport control.', reward: 200, verified: false },
  { id: 'ride', emoji: '🚕', title: 'Take a free ride home', hint: 'Your first cab is on the house.', reward: 200, verified: false },
  { id: 'furniture', emoji: '🛋️', title: 'Buy your first piece of furniture', hint: 'Your room is bare. Pick something from the furniture shop.', reward: 400, verified: true },
  { id: 'shift', emoji: '💼', title: 'Work your first shift', hint: 'Head to work and do one shift for bags.', reward: 400, verified: true },
  { id: 'coin', emoji: '🪙', title: 'Buy your first coin', hint: 'At the Coin Shop. Watch it float on your hand.', reward: 400, verified: true },
  { id: 'finish', emoji: '🎉', title: 'Day one done', hint: 'Your phone runs things from here.', reward: 400, verified: false },
];

export const FIRST_DAY_TOTAL = FIRST_DAY.reduce((a, s) => a + s.reward, 0);

export const firstDayStep = (id: string) => FIRST_DAY.find((s) => s.id === id) ?? null;

/** What the client sees: the state, what is done, and the next step (null when there is nothing left to show). */
export type FirstDayView = {
  state: 'active' | 'done' | 'skipped' | null;
  done: FirstDayStepId[];
  next: FirstDayStepId | null;
  /** bags earned on the path so far */
  earned: number;
};

export function nextStep(done: readonly string[]): FirstDayStepId | null {
  return FIRST_DAY.find((s) => !done.includes(s.id))?.id ?? null;
}
