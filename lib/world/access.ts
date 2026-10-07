import type { User, World } from '@prisma/client';
import { doesFollow } from '../x/relationship';

// Entry decision for a world. Fails closed: anything short of a verified follow (or public access,
// or the owner themself) is the outside view.

export type AccessDecision =
  | { admit: true; reason: 'owner' | 'public' | 'follows' }
  | { admit: false; reason: 'signed_out' | 'not_following' | 'invite_only' | 'unverified'; message: string };

export async function decideAccess(world: Pick<World, 'id' | 'xUserId' | 'access' | 'handle'>, visitor: User | null): Promise<AccessDecision> {
  if (visitor && visitor.id === world.xUserId) return { admit: true, reason: 'owner' };
  if (world.access === 'public') return { admit: true, reason: 'public' };
  if (world.access === 'invite') {
    return { admit: false, reason: 'invite_only', message: `@${world.handle}'s world is invite-only.` };
  }
  if (!visitor) return { admit: false, reason: 'signed_out', message: `Sign in with X to enter. Followers of @${world.handle} can walk in.` };

  const rel = await doesFollow(visitor, world.xUserId);
  if (rel.state === 'follows') return { admit: true, reason: 'follows' };
  if (rel.state === 'not_following') {
    return { admit: false, reason: 'not_following', message: `Follow @${world.handle} to enter.` };
  }
  return { admit: false, reason: 'unverified', message: rel.reason ?? "Can't verify the follow right now — try again shortly." };
}
