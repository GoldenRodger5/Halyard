import { NextResponse, type NextRequest } from 'next/server';
import {
  getAdapter,
  redactToken,
  resolvePlatformClient,
  verifyState,
  type PlatformId,
} from '@halyard/core';
import { query } from '@/lib/db';
import { stagePendingConnection } from '@/lib/connections';
import { operatorOrSignIn } from '@/lib/auth';
import { callbackUrl } from '@/lib/oauthRedirect';

export const dynamic = 'force-dynamic';

/**
 * Finish an OAuth round trip — as far as a pending connection, and no further.
 *
 * Milestone 40: the token is not written to `social_accounts` here. It is sealed
 * into `pending_connections`, the identity it belongs to is fetched and checked,
 * and the operator confirms on /accounts/confirm. Connecting the wrong account
 * because the browser was already signed in as someone else is the most common
 * failure in this flow, and it is invisible until the first post lands.
 *
 * Tokens are sealed before they touch Postgres, and nothing in this handler logs
 * one whole — a breadcrumb is the most common way a credential escapes a server.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ platform: string }> },
) {
  const auth = await operatorOrSignIn(request);
  if ('response' in auth) return auth.response;
  const { platform } = await context.params;
  const url = request.nextUrl;

  const error = url.searchParams.get('error');
  if (error) {
    const description = url.searchParams.get('error_description');
    return redirectWithMessage(
      request,
      `${platform} returned '${error}'${description ? `: ${description}` : ''}.`,
    );
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
  const client = resolvePlatformClient(platform as PlatformId);
  if (!client.clientId || !client.clientSecret) {
    return redirectWithMessage(
      request,
      `${client.tried.join(' / ')} are no longer set, so the code cannot be exchanged. Restore them and reconnect.`,
    );
  }
  const { clientId, clientSecret } = client;

  const redirectUri = callbackUrl(process.env.OAUTH_REDIRECT_BASE_URL, url.origin, platform);
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

  // Who does this token actually belong to? Asked before anything is saved.
  let identity;
  try {
    identity = await adapter.fetchIdentity({
      id: 'pending',
      platform: platform as PlatformId,
      handle: '',
      platformUserId: (tokens.meta?.did as string | undefined) ?? null,
      capabilityState: 'pending_auth',
      tokens,
      meta: tokens.meta,
    });
  } catch (err) {
    return redirectWithMessage(
      request,
      `Authorised, but ${platform} would not say which account this is: ${(err as Error).message}`,
    );
  }

  const pendingId = await stagePendingConnection({
    productId: payload.productId,
    platform: platform as PlatformId,
    persona: payload.persona,
    tokens,
    identity,
  });

  await query(
    `insert into audit_log (actor, action, entity_type, entity_id, detail)
     values ('human', 'oauth_authorised', 'pending_connection', $1, $2)`,
    [
      pendingId,
      {
        platform,
        persona: payload.persona,
        handle: identity.handle,
        token: redactToken(tokens.accessToken),
      },
    ],
  );

  const response = NextResponse.redirect(
    new URL(`/accounts/confirm/${pendingId}`, request.nextUrl.origin),
  );
  response.cookies.delete(`halyard_pkce_${platform}`);
  return response;
}

function redirectWithMessage(request: NextRequest, message: string): NextResponse {
  const target = new URL('/accounts', request.nextUrl.origin);
  target.searchParams.set('error', message.slice(0, 300));
  return NextResponse.redirect(target);
}
