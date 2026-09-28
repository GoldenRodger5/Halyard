import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CR_ORIGIN = 'https://b4e0vdqv6zgqeqj4pfgm.apps.whop.com';
const CR_EXPERIENCE = 'exp_KZckYGtrnbujDg';
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

function secureEqual(a: string, b: string) {
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function authorize(request: NextRequest) {
  const expected = process.env.MOMENTCIRCUIT_RENDER_SECRET ?? '';
  const actual = request.headers.get('x-momentcircuit-render-secret') ?? '';
  if (!expected || !actual || !secureEqual(expected, actual)) throw new Error('UNAUTHORIZED');
}

function cookieHeader(cookies: Record<string, string>) {
  return COOKIE_NAMES.map((name) => `${name}=${cookies[name]}`).join('; ');
}

export async function POST(request: NextRequest) {
  try {
    authorize(request);
    const body = (await request.json()) as { cookies?: Record<string, string> };
    const cookies = body.cookies ?? {};
    for (const name of COOKIE_NAMES) {
      if (!cookies[name]) {
        return NextResponse.json({ error: `missing_cookie:${name}` }, { status: 400 });
      }
    }

    const submissions = `${CR_ORIGIN}/c/${CR_EXPERIENCE}/submissions`;
    const test = await fetch(submissions, {
      headers: {
        cookie: cookieHeader(cookies),
        accept: 'text/html',
        'user-agent': 'MomentCircuitBootstrap/1.0',
      },
      cache: 'no-store',
      redirect: 'manual',
    });

    const html = await test.text();
    const authenticated =
      test.status === 200 &&
      html.includes('Submissions') &&
      !html.includes('Sign in to continue');

    if (!authenticated) {
      return NextResponse.json(
        { error: 'content_rewards_session_not_authenticated', status: test.status },
        { status: 401 },
      );
    }

    const bundle = {
      cookies: Object.fromEntries(COOKIE_NAMES.map((name) => [name, cookies[name]])),
      seeded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const client = adminClient();
    const { error } = await client.rpc('set_momentcircuit_cr_cookie_bundle', {
      secret_value: JSON.stringify(bundle),
    });
    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      authenticated: true,
      stored_cookie_names: [...COOKIE_NAMES],
    });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    const status = message === 'UNAUTHORIZED' ? 401 : 500;
    console.error('MomentCircuit Content Rewards bootstrap failed', { error: message });
    return NextResponse.json({ error: message }, { status });
  }
}
