import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { bad, requirePlayer } from '@/lib/life/auth';
import { COUNTRY_IDS, DEFAULT_COUNTRY } from '@/lib/world/countries';
import { citizenship } from '@/lib/life/citizen';

export const dynamic = 'force-dynamic';

/**
 * Pick your nationality: { country } or { skip: true } (which makes you Solanan).
 * Only once: after that, moving country is a matter for the flights and governments.
 */
export async function PUT(req: NextRequest) {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  const parsed = z
    .union([z.object({ country: z.enum(COUNTRY_IDS) }), z.object({ skip: z.literal(true) })])
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('That country does not exist.');
  if (r.player.nationality) return bad('You already have a nationality.', 409);
  const nationality = 'country' in parsed.data ? parsed.data.country : DEFAULT_COUNTRY;
  const p = await db.player.update({ where: { id: r.player.id }, data: { nationality } });
  return NextResponse.json({ ok: true, citizen: citizenship(p) });
}
