import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { verifySignedRequest } from '@/lib/metaWebhook';

export const dynamic = 'force-dynamic';

/**
 * Meta's data deletion request callback.
 *
 * §183. Required before App Review. Meta expects a JSON body carrying a `url` a
 * person can visit to check the request, and a `confirmation_code` — not a bare
 * 200 — so this returns both.
 *
 * What it deletes is deliberately narrow: the stored credential, and the
 * identity fields Halyard holds about that account. It does **not** delete
 * publications or metrics, because those describe posts that exist on the
 * platform and are Halyard's own record of what it did. Deleting them on request
 * would destroy the audit trail that makes the rest of the system accountable.
 *
 * The confirmation code is derived from the request, not stored: a hash of the
 * platform user id and the issue time. That makes it reproducible for a
 * follow-up query without adding a table whose only purpose is to be looked up
 * once.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const form = await request.formData().catch(() => null);
  const signed = form?.get('signed_request');

  const verified = verifySignedRequest(typeof signed === 'string' ? signed : null, [
    process.env.INSTAGRAM_APP_SECRET,
    process.env.META_APP_SECRET,
  ]);

  const origin = publicOrigin(request);

  if (!verified?.userId) {
    await record('meta_data_deletion_unverified', {});
    return NextResponse.json(
      { url: `${origin}/data-deletion`, confirmation_code: 'unverified' },
      { status: 200 },
    );
  }

  const code = createHash('sha256')
    .update(`${verified.userId}:${verified.issuedAt ?? 0}`)
    .digest('hex')
    .slice(0, 24);

  const cleared = await query<{ id: string }>(
    `update social_accounts
        set access_token_enc = null,
            refresh_token_enc = null,
            platform_user_id = null,
            display_name = null,
            avatar_url = null,
            follower_count = null,
            identity_confirmed_at = null,
            capability_state = 'pending_auth',
            capability_detail = 'Data deletion requested by the account holder.'
      where platform in ('instagram','threads')
        and platform_user_id = $1
      returning id`,
    [verified.userId],
  );

  await record('meta_data_deletion', { cleared: cleared.length, code });

  return NextResponse.json({ url: `${origin}/data-deletion?code=${code}`, confirmation_code: code });
}

/** The origin Meta should send a person to, preferring the configured one. */
function publicOrigin(request: NextRequest): string {
  const configured = process.env.HALYARD_PUBLIC_URL?.trim();
  if (configured && /^https:\/\//i.test(configured)) return configured.replace(/\/+$/, '');
  return request.nextUrl.origin;
}

async function record(action: string, detail: Record<string, unknown>): Promise<void> {
  await query(
    `insert into audit_log (actor, action, entity_type, detail)
     values ('system', $1, 'webhook', $2)`,
    [action, JSON.stringify(detail)],
  ).catch((err: unknown) => console.error('data deletion audit failed', String(err)));
}
