/**
 * §387. The floor's poll.
 *
 * One indexed read of the running production, returned as the same shape the
 * page rendered on the server — so the client component's state can simply be
 * replaced rather than merged.
 *
 * **Authenticated.** `readLive` returns job payloads and everything the crew
 * logged, which is operational detail about what this account is making and
 * why. `/api/health` is deliberately unauthenticated because it reveals only
 * whether the database answered; this is the opposite kind of endpoint.
 */
import { NextResponse } from 'next/server';
import { getOperator } from '@/lib/auth';
import { readLive } from '@/lib/studio/live';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const operator = await getOperator();
  if (!operator) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  }
  return NextResponse.json(await readLive(), {
    /* Never cached anywhere: it is a description of *now*. */
    headers: { 'cache-control': 'no-store' },
  });
}
