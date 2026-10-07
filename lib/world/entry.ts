import { getUser } from '../session';
import { findWorldByHandle } from './load';
import { decideAccess, type AccessDecision } from './access';

/** Resolve world + visitor + entry decision for a request. Shared by every world API route. */
export async function resolveEntry(handle: string) {
  const world = await findWorldByHandle(handle);
  if (!world) return { world: null, visitor: null, decision: null as AccessDecision | null };
  const visitor = await getUser();
  const decision = await decideAccess(world, visitor);
  return { world, visitor, decision };
}
