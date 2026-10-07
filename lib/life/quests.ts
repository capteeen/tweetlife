import { db } from '../db';

// Daily quests ("Hustle"). Progress is counted from real activity rows; only the claim is stored.

export type Quest = { id: string; title: string; emoji: string; target: number; reward: number; progress: (userId: string, since: Date) => Promise<number> };

export const QUESTS: Quest[] = [
  { id: 'gm3', title: 'Say GM to 3 people', emoji: '👋', target: 3, reward: 300, progress: (u, s) => db.interaction.count({ where: { fromUserId: u, kind: 'gm', at: { gte: s } } }) },
  { id: 'lantern3', title: 'Light 3 lanterns', emoji: '✦', target: 3, reward: 300, progress: (u, s) => db.lantern.count({ where: { byUserId: u, at: { gte: s } } }) },
  { id: 'stone1', title: 'Leave a guestbook stone', emoji: '🪨', target: 1, reward: 200, progress: (u, s) => db.mark.count({ where: { byUserId: u, at: { gte: s } } }) },
  { id: 'ape1', title: 'Ape into a coin', emoji: '🦍', target: 1, reward: 250, progress: (u, s) => db.bagTx.count({ where: { playerId: u, kind: 'buy', at: { gte: s } } }) },
  { id: 'worlds2', title: 'Visit 2 worlds', emoji: '🌆', target: 2, reward: 400, progress: async (u, s) => (await db.visitorSession.groupBy({ by: ['worldId'], where: { visitorId: u, joinedAt: { gte: s } } })).length },
  { id: 'social5', title: '5 social interactions', emoji: '💬', target: 5, reward: 350, progress: (u, s) => db.interaction.count({ where: { fromUserId: u, at: { gte: s } } }) },
];

export function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
export function dayStart(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function questBoard(userId: string) {
  const since = dayStart();
  const day = todayKey();
  const row = await db.questDay.findUnique({ where: { playerId_day: { playerId: userId, day } } });
  const claimed = new Set<string>((row?.claimed as string[]) ?? []);
  const items = await Promise.all(
    QUESTS.map(async (q) => {
      const p = Math.min(q.target, await q.progress(userId, since));
      return { id: q.id, title: q.title, emoji: q.emoji, target: q.target, reward: q.reward, progress: p, done: p >= q.target, claimed: claimed.has(q.id) };
    }),
  );
  return { day, quests: items, resetsAt: new Date(since.getTime() + 86400000).toISOString() };
}

export async function claimQuest(userId: string, questId: string) {
  const q = QUESTS.find((x) => x.id === questId);
  if (!q) throw new Error('No such quest');
  const since = dayStart();
  const day = todayKey();
  const progress = await q.progress(userId, since);
  if (progress < q.target) throw new Error('Not done yet');
  return db.$transaction(async (tx) => {
    const row = await tx.questDay.upsert({ where: { playerId_day: { playerId: userId, day } }, create: { playerId: userId, day, claimed: [] }, update: {} });
    const claimed = (row.claimed as string[]) ?? [];
    if (claimed.includes(questId)) throw new Error('Already claimed');
    await tx.questDay.update({ where: { id: row.id }, data: { claimed: [...claimed, questId] } });
    await tx.player.update({ where: { id: userId }, data: { bags: { increment: q.reward } } });
    await tx.bagTx.create({ data: { playerId: userId, kind: 'quest', amount: q.reward, note: `Quest: ${q.title}` } });
    return q.reward;
  });
}
