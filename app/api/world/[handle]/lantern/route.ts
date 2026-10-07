import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { resolveEntry } from '@/lib/world/entry';

export const dynamic = 'force-dynamic';

// Light (or snuff) a lantern at a structure — an on-world like. One per visitor per structure.
// lanternsLit on the structure is a real count kept in step inside the transaction.

const Body = z.object({ structureId: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: { handle: string } }) {
  const { world, visitor, decision } = await resolveEntry(params.handle);
  if (!world || !decision) return NextResponse.json({ error: 'No world.' }, { status: 404 });
  if (!visitor) return NextResponse.json({ error: 'Sign in to light a lantern.' }, { status: 401 });
  if (!decision.admit) return NextResponse.json({ error: decision.message }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'structureId required' }, { status: 400 });

  const structure = await db.structure.findFirst({ where: { id: parsed.data.structureId, worldId: world.id, hidden: false } });
  if (!structure) return NextResponse.json({ error: 'No such structure.' }, { status: 404 });

  const result = await db.$transaction(async (tx) => {
    const existing = await tx.lantern.findUnique({ where: { structureId_byUserId: { structureId: structure.id, byUserId: visitor.id } } });
    if (existing) {
      await tx.lantern.delete({ where: { id: existing.id } });
      const s = await tx.structure.update({ where: { id: structure.id }, data: { lanternsLit: { decrement: 1 } } });
      return { lit: false, lanternsLit: Math.max(0, s.lanternsLit) };
    }
    await tx.lantern.create({ data: { worldId: world.id, structureId: structure.id, byUserId: visitor.id } });
    const s = await tx.structure.update({ where: { id: structure.id }, data: { lanternsLit: { increment: 1 } } });
    return { lit: true, lanternsLit: s.lanternsLit };
  });
  return NextResponse.json(result);
}

/** Which structures the current visitor has lit here. */
export async function GET(_: Request, { params }: { params: { handle: string } }) {
  const { world, visitor } = await resolveEntry(params.handle);
  if (!world) return NextResponse.json({ error: 'No world.' }, { status: 404 });
  if (!visitor) return NextResponse.json({ lit: [] });
  const rows = await db.lantern.findMany({ where: { worldId: world.id, byUserId: visitor.id }, select: { structureId: true } });
  return NextResponse.json({ lit: rows.map((r) => r.structureId) });
}
