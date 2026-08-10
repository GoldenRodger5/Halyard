import { NextResponse, type NextRequest } from 'next/server';
import {
  PLATFORM_CLIENT_ENV,
  PLATFORM_SCOPES,
  createPkcePair,
  getAdapter,
  signState,
  type PlatformId,
} from '@halyard/core';
import { requireOperator } from '@/lib/auth';
import { query } from '@/lib/db';

async function personalProductId(): Promise<string | null> {
  const rows = await query<{ id: string }>(
    `select id from products where kind = 'personal' order by created_at limit 1`,
  );
  return rows[0]?.id ?? null;
}

export const dynamic = 'force-dynamic';

/**
 * Begin an OAuth round trip.
 *
 * The PKCE verifier goes into an httpOnly cookie rather than the database: it is
 * short-lived, single-use, and belongs to this browser session. `state` is an
 * HMAC-signed envelope so the callback can verify it even if the cookie is lost.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ platform: string }> },
) {
  await requireOperator();
  const { platform } = await context.params;

  let adapter;
  try {
    adapter = getAdapter(platform as PlatformId);
  } catch {
    return NextResponse.json({ error: `Unknown platform '${platform}'` }, { status: 404 });
  }

  const env = PLATFORM_CLIENT_ENV[platform as PlatformId];
  const clientId = process.env[env.id];
  const clientSecret = process.env[env.secret];

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        error: `${env.id} and ${env.secret} are not set.`,
        hint: 'Register the developer app first. Reviews are wall-clock time you cannot compress, so start them on day two.',
      },
      { status: 428 },
    );
  }

  const base = process.env.OAUTH_REDIRECT_BASE_URL ?? request.nextUrl.origin;
  const redirectUri = `${base.replace(/\/$/, '')}/api/oauth/${platform}/callback`;

  const persona = (request.nextUrl.searchParams.get('persona') ?? 'brand') as 'brand' | 'founder';

  // The founder account is one identity shared across every product, so it is
  // always connected against the personal product regardless of which product
  // page the operator started from.
  const productId =
    persona === 'founder'
      ? (await personalProductId()) ??
        request.nextUrl.searchParams.get('product') ??
        'recipefix'
      : (request.nextUrl.searchParams.get('product') ?? 'recipefix');

  const state = signState({ productId, platform, persona });
  const pkce = createPkcePair();

  const authUrl = adapter.getAuthUrl(state, {
    clientId,
    clientSecret,
    redirectUri,
    codeChallenge: pkce.challenge,
    scopes: PLATFORM_SCOPES[platform],
  });

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(`halyard_pkce_${platform}`, pkce.verifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/oauth',
    maxAge: 900,
  });
  return response;
}
