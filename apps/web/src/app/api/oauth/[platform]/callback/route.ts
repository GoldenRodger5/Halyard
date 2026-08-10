import { NextResponse, type NextRequest } from 'next/server';
import {
  PLATFORM_CLIENT_ENV,
  getAdapter,
  redactToken,
  sealToken,
  verifyState,
  type PlatformId,
} from '@halyard/core';
import { query } from '@/lib/db';
import { requireOperator } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Finish an OAuth round trip.
 *
 * Tokens are sealed before they touch Postgres, and nothing in this handler logs
 * a token whole — a Sentry breadcrumb is the most common way a credential
 * escapes a server.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ platform: string }> },
) {
  await requireOperator();
  const { platform } = await context.params;
  const url = request.nextUrl;

  const error = url.searchParams.get('error');
  if (error) {
    return redirectWithMessage(request, `${platform} returned '${error}'.`);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return redirectWithMessage(request, 'Callback was missing code or state.');

  let payload;
  try {
    payload = verifyState(state);
  } catch (err) {
    return redirectWithMessage(request, (err as Error).message);
  }

  const adapter = getAdapter(platform as PlatformId);
  const env = PLATFORM_CLIENT_ENV[platform as PlatformId];
  const clientId = process.env[env.id]!;
  const clientSecret = process.env[env.secret]!;
  const base = process.env.OAUTH_REDIRECT_BASE_URL ?? url.origin;
  const redirectUri = `${base.replace(/\/$/, '')}/api/oauth/${platform}/callback`;
  const codeVerifier = request.cookies.get(`halyard_pkce_${platform}`)?.value;

  let tokens;
  try {
    tokens = await adapter.exchangeCode(code, {
      clientId,
      clientSecret,
      redirectUri,
      codeVerifier,
    });
  } catch (err) {
    return redirectWithMessage(request, `Token exchange failed: ${(err as Error).message}`);
  }

  const accountRows = await query<{ id: string }>(
    `insert into social_accounts (product_id, platform, persona, handle, capability_state,
                                  access_token_enc, refresh_token_enc, token_expires_at, scopes)
     values ($1,$2,$3,$4,'pending_auth',$5,$6,$7,$8)
     on conflict (product_id, platform, persona) do update
       set access_token_enc = excluded.access_token_enc,
           refresh_token_enc = excluded.refresh_token_enc,
           token_expires_at = excluded.token_expires_at,
           scopes = excluded.scopes,
           last_error = null
     returning id`,
    [
      payload.productId,
      platform,
      payload.persona,
      `@${payload.productId}`,
      sealToken(tokens.accessToken),
      tokens.refreshToken ? sealToken(tokens.refreshToken) : null,
      tokens.expiresAt ?? null,
      tokens.scopes ?? [],
    ],
  );

  const accountId = accountRows[0]!.id;

  // Ask the platform what this connection can actually do, and record it in the
  // operator's language rather than the API's.
  try {
    const report = await adapter.verifyCapabilities({
      id: accountId,
      platform: platform as PlatformId,
      handle: `@${payload.productId}`,
      capabilityState: 'pending_auth',
      tokens,
      meta: tokens.meta,
    });

    await query(
      `update social_accounts
          set capability_state = $2, capability_detail = $3, supported_formats = $4,
              last_verified_at = now(), platform_user_id = $5
        where id = $1`,
      [
        accountId,
        report.state,
        report.detail,
        report.supportedFormats,
        (tokens.meta?.igUserId as string | undefined) ??
          (tokens.meta?.threadsUserId as string | undefined) ??
          (tokens.meta?.openId as string | undefined) ??
          null,
      ],
    );
  } catch (err) {
    await query(`update social_accounts set last_error = $2 where id = $1`, [
      accountId,
      (err as Error).message.slice(0, 500),
    ]);
  }

  await query(
    `insert into audit_log (actor, action, entity_type, entity_id, detail)
     values ('human', 'oauth_connected', 'social_account', $1, $2)`,
    [accountId, { platform, persona: payload.persona, token: redactToken(tokens.accessToken) }],
  );

  const response = NextResponse.redirect(new URL('/accounts', request.nextUrl.origin));
  response.cookies.delete(`halyard_pkce_${platform}`);
  return response;
}

function redirectWithMessage(request: NextRequest, message: string): NextResponse {
  const target = new URL('/accounts', request.nextUrl.origin);
  target.searchParams.set('error', message.slice(0, 300));
  return NextResponse.redirect(target);
}
