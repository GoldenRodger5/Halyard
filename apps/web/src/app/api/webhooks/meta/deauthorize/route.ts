import { NextResponse, type NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { verifySignedRequest } from '@/lib/metaWebhook';

export const dynamic = 'force-dynamic';

/**
 * Meta's deauthorize callback.
 *
 * §183. Called when someone removes Halyard from their Instagram or Facebook
 * account. Meta requires the URL before App Review, and the honest reason to
 * have it is that without one Halyard keeps a credential the user has revoked
 * and keeps reporting the account as connected until the next token refresh
 * fails — days later, as an error that looks like Halyard's fault.
 *
 * The token is cleared; the row and its history are not deleted. A deauthorize
 * says "stop acting for me", not "forget the posts you already made" — that is
 * the data-deletion callback next door, and conflating them would silently
 * destroy publication history on a routine disconnect.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const form = await request.formData().catch(() => null);
  const signed = form?.get('signed_request');

  const verified = verifySignedRequest(typeof signed === 'string' ? signed : null, [
    process.env.INSTAGRAM_APP_SECRET,
    process.env.META_APP_SECRET,
  ]);

  /*
   * A 200 with no action, not a 401. Meta retries a failed deauthorize and an
   * unverifiable one will never verify; what matters is that nothing was done.
   */
  if (!verified?.userId) {
    await record('meta_deauthorize_unverified', {});
    return NextResponse.json({ ok: true, disconnected: 0 });
  }

  const cleared = await query<{ id: string }>(
    `update social_accounts
        set access_token_enc = null,
            refresh_token_enc = null,
            capability_state = 'pending_auth',
            capability_detail = 'The account holder removed Halyard from this platform.',
            last_error = null
      where platform in ('instagram','threads')
        and platform_user_id = $1
        and access_token_enc is not null
      returning id`,
    [verified.userId],
  );

  await record('meta_deauthorize', { disconnected: cleared.length });
  return NextResponse.json({ ok: true, disconnected: cleared.length });
}

async function record(action: string, detail: Record<string, unknown>): Promise<void> {
  await query(
    `insert into audit_log (actor, action, entity_type, detail)
     values ('system', $1, 'webhook', $2)`,
    [action, JSON.stringify(detail)],
  ).catch((err: unknown) => console.error('deauthorize audit failed', String(err)));
}
