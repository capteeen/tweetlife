import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/session';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function POST() {
  clearSession();
  return NextResponse.redirect(`${env().NEXT_PUBLIC_APP_URL}/`, { status: 303 });
}
