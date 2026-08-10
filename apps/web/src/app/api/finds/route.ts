import { NextResponse, type NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { getOperator } from '@/lib/auth';
import { safeEqual } from '@halyard/core';

export const dynamic = 'force-dynamic';

/**
 * Capture endpoint for the bookmarklet and the iOS Shortcut. Milestone 28,
 * Part C.
 *
 * Accepts either a signed-in session or the cron secret as a bearer token, so a
 * Shortcut on a phone can post to it without a browser session.
 */
export async function POST(request: NextRequest) {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const secret = process.env.CRON_SECRET;
  const viaToken = Boolean(secret) && safeEqual(bearer, secret!);

  if (!viaToken && !(await getOperator())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    url?: string;
    title?: string;
    why?: string;
  } | null;

  if (!body?.url) return NextResponse.json({ error: 'url is required' }, { status: 400 });

  const rows = await query<{ id: string }>(
    `insert into finds (product_id, url, title, why_useful, source)
     values ('founder', $1, $2, $3, $4)
     on conflict (product_id, url) do update set title = coalesce(excluded.title, finds.title)
     returning id`,
    [body.url, body.title ?? null, body.why ?? null, viaToken ? 'shortcut' : 'bookmarklet'],
  );

  return NextResponse.json({ id: rows[0]?.id, saved: true });
}
