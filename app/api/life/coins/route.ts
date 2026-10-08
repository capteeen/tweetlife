import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { bad, requirePlayer } from '@/lib/life/auth';
import { buyCoin, holdingsFor, sellCoin } from '@/lib/life/coins';
import { MAX_BUY, MIN_BUY } from '@/lib/life/coinRules';
import { countryParam } from '@/lib/life/government';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// The Coin Shop. GET: your paper coins at live prices. POST: buy with bags, or sell back to bags.
export async function GET() {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  return NextResponse.json({ holdings: await holdingsFor(r.user.id) }, { headers: { 'cache-control': 'private, no-store' } });
}

const Body = z.discriminatedUnion('op', [
  z.object({ op: z.literal('buy'), chain: z.string().min(1).max(40), mint: z.string().min(20).max(80), bags: z.number().int().min(MIN_BUY).max(MAX_BUY) }),
  z.object({ op: z.literal('sell'), mint: z.string().min(20).max(80), fraction: z.number().gt(0).max(1), country: z.string().max(20).optional() }),
]);

export async function POST(req: NextRequest) {
  const r = await requirePlayer();
  if ('error' in r) return r.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(`Buy between ${MIN_BUY} and ${MAX_BUY} bags, or sell part of a coin you hold.`);
  try {
    const d = parsed.data;
    const out = d.op === 'buy' ? await buyCoin(r.user.id, d.chain, d.mint, d.bags) : await sellCoin(r.user.id, d.mint, d.fraction, countryParam(d.country));
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return bad((e as Error).message);
  }
}
