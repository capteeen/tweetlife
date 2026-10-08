// Seeds a fresh "new player" for the daily playtest, plus an existing public world to visit.
// Run from the repo root: npx tsx /mnt/project-files/playtest/harness/seed.ts
// Resets @playtester every run (no Player row = brand-new player, like right after X sign-in).
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const TEXTS = [
  'gm to everyone except people who sold the bottom', 'just aped into a coin named after my cat', 'NEPA took light again, generator fuel is my new bag',
  'thread: how I turned 10k bags into 400 in one afternoon 🧵', 'wagmi', 'the trenches are quiet today, too quiet', 'built different',
  'who is coming to Club Moon tonight', 'my portfolio is a museum of rugs', 'touch grass? in this economy?', 'I am once again asking for gas',
  'buying the dip, the dip keeps dipping', 'lfg', 'new desk setup just dropped', 'ct is a beautiful place sometimes', 'ngmi if you still do not have a sofa',
];

async function seedWorld(id: string, handle: string, name: string, posts: number, opts: { listed: boolean; access: 'public' | 'followers' }) {
  await db.user.deleteMany({ where: { id } });
  await db.user.create({ data: { id, handle, name, avatarUrl: null, accessTokenEnc: 'x', tokenExpiresAt: new Date(Date.now() + 864e5), scopes: 'tweet.read users.read offline.access' } });
  const now = Date.now();
  const world = await db.world.create({
    data: {
      handle, xUserId: id, accountCreatedAt: new Date('2019-03-14'), ingestState: 'live', access: opts.access, listedOnExplore: opts.listed,
      followersCount: 1234, followingCount: 321, postCount: posts, lastSyncAt: new Date(), nextSyncAt: new Date(now + 36e5),
    },
  });
  const kinds = ['pillar', 'pillar', 'pillar', 'spire', 'monolith', 'outbuilding', 'lantern', 'obelisk'] as const;
  await db.structure.createMany({
    data: Array.from({ length: posts }, (_, i) => ({
      worldId: world.id, postId: `${id}${String(i).padStart(6, '0')}`, kind: kinds[i % kinds.length],
      conversationId: i % kinds.length === 3 ? `${id}c${Math.floor(i / 8)}` : null,
      text: TEXTS[i % TEXTS.length], likes: (i * 37) % 900, reposts: (i * 7) % 120, replies: (i * 3) % 60, impressions: (i * 911) % 40000,
      postedAt: new Date(now - (posts - i) * 86400e3 * 3),
    })),
  });
  return world;
}

async function main() {
  // brand-new player: User + live World, no Player yet (ensurePlayer creates it on first load)
  await seedWorld('900000001', 'playtester', 'Play Tester', 60, { listed: false, access: 'followers' });
  // an existing public world to find under "Enter a world" / Explore
  await seedWorld('900000002', 'degenqueen', 'Degen Queen', 90, { listed: true, access: 'public' });
  console.log('seeded @playtester (new player) and @degenqueen (public world)');
}
main().finally(() => db.$disconnect());
