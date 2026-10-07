import { NextResponse } from 'next/server';
import { trenchesBoard } from '@/lib/life/trenches';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  return NextResponse.json(await trenchesBoard(), { headers: { 'cache-control': 'no-store' } });
}
