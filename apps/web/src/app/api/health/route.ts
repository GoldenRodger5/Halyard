/**
 * Is this deployment actually working?
 *
 * §174. Every deploy in this project has been verified by reasoning about what
 * *should* have changed, because there was nothing to ask. "Production contains
 * the commit" and "production can reach its database" are different claims, and
 * only the second one matters to an operator.
 *
 * Deliberately unauthenticated, because a health check that requires a session
 * cannot tell you the session store is down — and deliberately thin, because an
 * unauthenticated endpoint should reveal operational state, not topology. It
 * reports *whether* the database answered and *which pooler mode* is configured;
 * it never reports the host, the port, the user, or the driver's error text,
 * which routinely contains all three.
 */
import { NextResponse } from 'next/server';
import { describePooler } from '@halyard/core';
import { databaseReachable } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = await databaseReachable();
  const pooler = describePooler(process.env.DATABASE_URL, 'web');

  return NextResponse.json(
    {
      ok: db.ok && pooler.ok,
      database: db.ok ? 'reachable' : 'unreachable',
      /*
       * Mode only. The host and port would name the project and the pooler, and
       * the driver's error message usually contains the connection string.
       */
      pooler: pooler.mode,
      poolerCorrectForTier: pooler.ok,
    },
    { status: db.ok ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}
