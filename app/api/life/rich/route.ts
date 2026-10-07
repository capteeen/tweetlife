import { NextResponse } from 'next/server';
import { richList } from '@/lib/life/player';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  return NextResponse.json({ list: await richList(25), at: new Date().toISOString() }, { headers: { 'cache-control': 'no-store' } });
}
