import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CR_ORIGIN = 'https://b4e0vdqv6zgqeqj4pfgm.apps.whop.com';
const CR_EXPERIENCE = 'exp_KZckYGtrnbujDg';
const EXPECTED_EMAIL = 'circuitmoment@gmail.com';
const COOKIE_NAMES = [
  '__Host-cr-session',
  '__Host-cr-access-token',
  '__Host-cr-access-token-refresh-at',
  '__Host-cr-whop-id',
] as const;

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false } });
}

function cookieHeader(cookies: Record<string, string>) {
  return COOKIE_NAMES.map((name) => `${name}=${cookies[name]}`).join('; ');
}

export async function POST(request: NextRequest) {
  try {
    const client = adminClient();
    const existing = await client.rpc('get_momentcircuit_cr_cookie_bundle');
    if (existing.error) throw new Error(existing.error.message);
    if (typeof existing.data === 'string' && existing.data.length > 20) {
      return NextResponse.json({ ok: true, already_seeded: true });
    }

    const body = (await request.json()) as { cookies?: Record<string, string> };
    const cookies = body.cookies ?? {};
    for (const name of COOKIE_NAMES) {
      if (!cookies[name]) {
        return NextResponse.json({ error: `missing_cookie:${name}` }, { status: 400 });
      }
    }

    const headers = {
      cookie: cookieHeader(cookies),
      accept: 'text/html',
      'user-agent': 'MomentCircuitBootstrapOnce/1.0',
    };

    const profileUrl = `${CR_ORIGIN}/c/${CR_EXPERIENCE}/settings?tab=profile`;
    const submissionsUrl = `${CR_ORIGIN}/c/${CR_EXPERIENCE}/submissions`;

    const [profileRes, submissionsRes] = await Promise.all([
      fetch(profileUrl, { headers, cache: 'no-store', redirect: 'manual' }),
      fetch(submissionsUrl, { headers, cache: 'no-store', redirect: 'manual' }),
    ]);

    const [profileHtml, submissionsHtml] = await Promise.all([
      profileRes.text(),
      submissionsRes.text(),
    ]);

    const identityOk =
      profileRes.status === 200 &&
      profileHtml.toLowerCase().includes(EXPECTED_EMAIL);

    const submissionsOk =
      submissionsRes.status === 200 &&
      submissionsHtml.includes('Submissions') &&
      !submissionsHtml.includes('Sign in to continue');

    if (!identityOk || !submissionsOk) {
      return NextResponse.json(
        {
          error: 'content_rewards_session_validation_failed',
          identity_ok: identityOk,
          submissions_ok: submissionsOk,
          profile_status: profileRes.status,
          submissions_status: submissionsRes.status,
        },
        { status: 401 },
      );
    }

    const bundle = {
      cookies: Object.fromEntries(COOKIE_NAMES.map((name) => [name, cookies[name]])),
      seeded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expected_email: EXPECTED_EMAIL,
    };

    const stored = await client.rpc('set_momentcircuit_cr_cookie_bundle', {
      secret_value: JSON.stringify(bundle),
    });
    if (stored.error) throw new Error(stored.error.message);

    return NextResponse.json({
      ok: true,
      authenticated: true,
      identity: EXPECTED_EMAIL,
      stored_cookie_names: [...COOKIE_NAMES],
    });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    console.error('MomentCircuit one-time Content Rewards bootstrap failed', {
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
