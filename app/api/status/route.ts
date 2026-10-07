import { NextResponse } from 'next/server';
import { statusSnapshot } from '@/lib/status';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snap = await statusSnapshot();
    return NextResponse.json(snap, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}
