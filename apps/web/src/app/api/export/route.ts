import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireOperator } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * build pack §9 — data ownership.
 *
 * "Platform data comes and goes; your content history should not depend on any
 * vendor." Deliberately omits social_accounts entirely, so an export can never
 * carry token ciphertext off the server.
 */
export async function GET() {
  await requireOperator();

  const [contentItems, publications, metrics, attribution, comments, ideas, series, hooks] =
    await Promise.all([
      query('select * from content_items order by created_at'),
      query('select * from publications order by created_at'),
      query('select * from post_metrics order by collected_at'),
      query('select * from attribution order by collected_at'),
      query('select * from comments order by first_seen_at'),
      query('select * from ideas order by created_at'),
      query('select * from series'),
      query('select * from hooks'),
    ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    note:
      'Social accounts and platform tokens are deliberately excluded. This file is your content history, not your credentials.',
    contentItems,
    publications,
    metrics,
    attribution,
    comments,
    ideas,
    series,
    hooks,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="halyard-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
