import crypto from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const CR_ORIGIN = 'https://b4e0vdqv6zgqeqj4pfgm.apps.whop.com';
const CR_EXPERIENCE = 'exp_KZckYGtrnbujDg';
const CR_SUBMISSIONS = `${CR_ORIGIN}/c/${CR_EXPERIENCE}/submissions`;
const CR_SUBMISSION_API = `${CR_ORIGIN}/api/submission/submissions`;
const COOKIE_NAMES = [
  '__Host-cr-session',
  '__Host-cr-access-token',
  '__Host-cr-access-token-refresh-at',
  '__Host-cr-whop-id',
] as const;
type CookieName = (typeof COOKIE_NAMES)[number];

interface CookieBundle {
  cookies: Record<CookieName, string>;
  seeded_at?: string;
  updated_at?: string;
}

const MAX_HTML_BYTES = 6_000_000;
const MAX_JSON_BYTES = 1_000_000;
const CAMPAIGN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function secureEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function authorize(request: NextRequest) {
  const expected = process.env.MOMENTCIRCUIT_V2_CR_BRIDGE_SECRET ?? '';
  const actual = request.headers.get('x-momentcircuit-v2-secret') ?? '';
  if (!expected || !actual || !secureEqual(expected, actual)) throw new Error('UNAUTHORIZED');
}

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function campaignPreviewUrl(campaignId: string) {
  return `${CR_ORIGIN}/c/${CR_EXPERIENCE}/campaigns/${encodeURIComponent(campaignId)}/preview`;
}

function cookieHeader(bundle: CookieBundle) {
  return COOKIE_NAMES.map((name) => `${name}=${bundle.cookies[name]}`).join('; ');
}

function parseSetCookies(headers: Headers, bundle: CookieBundle) {
  const h = headers as Headers & { getSetCookie?: () => string[] };
  const values =
    typeof h.getSetCookie === 'function'
      ? h.getSetCookie()
      : headers.get('set-cookie')
        ? [headers.get('set-cookie')!]
        : [];
  let changed = false;
  for (const raw of values) {
    const first = raw.split(';', 1)[0] ?? '';
    const eq = first.indexOf('=');
    if (eq <= 0) continue;
    const name = first.slice(0, eq).trim() as CookieName;
    if (!COOKIE_NAMES.includes(name)) continue;
    const value = first.slice(eq + 1);
    if (value && bundle.cookies[name] !== value) {
      bundle.cookies[name] = value;
      changed = true;
    }
  }
  if (changed) bundle.updated_at = new Date().toISOString();
  return changed;
}

async function loadCookieBundle(): Promise<CookieBundle> {
  const client = adminClient();
  const { data, error } = await client.rpc('get_momentcircuit_cr_cookie_bundle');
  if (error) throw new Error('COOKIE_VAULT_READ_FAILED');
  if (!data || typeof data !== 'string') throw new Error('CONTENT_REWARDS_CLOUD_AUTH_MISSING');
  const parsed = JSON.parse(data) as CookieBundle;
  for (const name of COOKIE_NAMES)
    if (!parsed?.cookies?.[name]) throw new Error(`CONTENT_REWARDS_COOKIE_MISSING_${name}`);
  return parsed;
}

async function saveCookieBundle(bundle: CookieBundle) {
  const client = adminClient();
  const { error } = await client.rpc('set_momentcircuit_cr_cookie_bundle', {
    secret_value: JSON.stringify(bundle),
  });
  if (error) throw new Error('COOKIE_VAULT_WRITE_FAILED');
}

async function fetchWithCookies(url: string, bundle: CookieBundle, init: RequestInit = {}) {
  if (!url.startsWith(`${CR_ORIGIN}/`)) throw new Error('CONTENT_REWARDS_HOST_REFUSED');
  const headers = new Headers(init.headers);
  headers.set('cookie', cookieHeader(bundle));
  headers.set('user-agent', 'MomentCircuitV2Bridge/1.0');
  const response = await fetch(url, {
    ...init,
    headers,
    redirect: 'error',
    cache: 'no-store',
  });
  if (parseSetCookies(response.headers, bundle)) await saveCookieBundle(bundle);
  return response;
}

async function boundedText(response: Response, maxBytes: number) {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('CONTENT_REWARDS_RESPONSE_TOO_LARGE');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new Error('CONTENT_REWARDS_RESPONSE_TOO_LARGE');
  return new TextDecoder().decode(bytes);
}

function visibleText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractApiError(text: string) {
  try {
    const parsed = JSON.parse(text) as {
      error?: string | { code?: string; message?: string };
      success?: boolean;
    };
    if (typeof parsed.error === 'string') return { code: 'UNKNOWN', message: parsed.error };
    if (parsed.error && typeof parsed.error === 'object')
      return {
        code: parsed.error.code ?? 'UNKNOWN',
        message: parsed.error.message ?? 'submission rejected',
      };
    if (parsed.success === false) return { code: 'UNKNOWN', message: 'submission rejected' };
  } catch {
    return null;
  }
  return null;
}

async function lookup(publicUrl: string, bundle: CookieBundle) {
  const response = await fetchWithCookies(CR_SUBMISSIONS, bundle, {
    headers: { accept: 'text/html' },
  });
  if (response.status === 401 || response.status === 403)
    return { status: 'UNKNOWN' as const, reason: 'CONTENT_REWARDS_AUTH_REQUIRED' };
  if (!response.ok)
    return { status: 'UNKNOWN' as const, reason: `CONTENT_REWARDS_HTTP_${response.status}` };
  const body = await boundedText(response, MAX_HTML_BYTES);
  return body.includes(publicUrl)
    ? { status: 'FOUND' as const, remote_id: null }
    : { status: 'NOT_FOUND' as const };
}

async function submit(campaignId: string, publicUrl: string, bundle: CookieBundle) {
  const before = await lookup(publicUrl, bundle);
  if (before.status === 'FOUND') return { status: 'ALREADY_SUBMITTED' as const, remote_id: null };
  if (before.status === 'UNKNOWN') return before;

  const response = await fetchWithCookies(CR_SUBMISSION_API, bundle, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      origin: CR_ORIGIN,
      referer: campaignPreviewUrl(campaignId),
    },
    body: JSON.stringify({ campaignId, url: publicUrl }),
  });
  const body = await boundedText(response, MAX_JSON_BYTES);
  const parsed = extractApiError(body);
  if (response.status === 409 && /already been submitted/i.test(body))
    return { status: 'ALREADY_SUBMITTED' as const, remote_id: null };
  if (response.status === 401 || response.status === 403)
    return { status: 'UNKNOWN' as const, reason: 'CONTENT_REWARDS_AUTH_REQUIRED' };
  if (response.status >= 500)
    return { status: 'UNKNOWN' as const, reason: `CONTENT_REWARDS_HTTP_${response.status}` };
  if (!response.ok)
    return {
      status: 'REJECTED' as const,
      reason: `CONTENT_REWARDS_HTTP_${response.status}:${parsed?.code ?? 'UNKNOWN'}`,
    };
  if (parsed)
    return { status: 'REJECTED' as const, reason: `CONTENT_REWARDS_REJECTED:${parsed.code}` };
  return { status: 'ACCEPTED' as const, remote_id: null };
}

async function probe(campaignId: string, bundle: CookieBundle) {
  const response = await fetchWithCookies(campaignPreviewUrl(campaignId), bundle, {
    headers: { accept: 'text/html,application/xhtml+xml' },
  });
  if (response.status === 401 || response.status === 403)
    return {
      status: 'UNKNOWN' as const,
      submit_available: false,
      account_connected: null,
      application_state: 'UNKNOWN' as const,
      facts: { http_status: response.status },
    };
  if (!response.ok)
    return {
      status: 'UNKNOWN' as const,
      submit_available: false,
      account_connected: null,
      application_state: 'UNKNOWN' as const,
      facts: { http_status: response.status },
    };
  const text = visibleText(await boundedText(response, MAX_HTML_BYTES));
  const submitAvailable = /\bSubmit clip\b/i.test(text);
  const disconnected = /account is not linked|Link your accounts/i.test(text);
  const pending = /application pending|pending application/i.test(text);
  const rejected = /application rejected|application denied|not approved/i.test(text);
  const applicationState = rejected
    ? 'REJECTED'
    : pending
      ? 'PENDING'
      : submitAvailable
        ? 'ACCEPTED'
        : 'UNKNOWN';
  return {
    status: submitAvailable && !disconnected ? ('READY' as const) : ('NOT_READY' as const),
    submit_available: submitAvailable,
    account_connected: !disconnected,
    application_state: applicationState,
    facts: {
      http_status: response.status,
      submit_available: submitAvailable,
      disconnected,
      application_state: applicationState,
    },
  };
}

function validHttps(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    authorize(request);
    const body = (await request.json().catch(() => null)) as
      | { action?: unknown; campaign_id?: unknown; public_url?: unknown }
      | null;
    if (!body || typeof body.action !== 'string')
      return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });

    const bundle = await loadCookieBundle();

    if (body.action === 'probe') {
      if (typeof body.campaign_id !== 'string' || !CAMPAIGN_ID.test(body.campaign_id))
        return NextResponse.json({ error: 'INVALID_CAMPAIGN_ID' }, { status: 400 });
      return NextResponse.json({ ok: true, result: await probe(body.campaign_id, bundle) });
    }

    if (body.action === 'lookup') {
      if (!validHttps(body.public_url))
        return NextResponse.json({ error: 'INVALID_PUBLIC_URL' }, { status: 400 });
      return NextResponse.json({ ok: true, result: await lookup(body.public_url, bundle) });
    }

    if (body.action === 'submit') {
      if (typeof body.campaign_id !== 'string' || !CAMPAIGN_ID.test(body.campaign_id))
        return NextResponse.json({ error: 'INVALID_CAMPAIGN_ID' }, { status: 400 });
      if (!validHttps(body.public_url))
        return NextResponse.json({ error: 'INVALID_PUBLIC_URL' }, { status: 400 });
      return NextResponse.json({
        ok: true,
        result: await submit(body.campaign_id, body.public_url, bundle),
      });
    }

    return NextResponse.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    const code = message.split(':', 1)[0] ?? 'BRIDGE_ERROR';
    const status = code === 'UNAUTHORIZED' ? 401 : 500;
    console.error('MomentCircuitV2 Content Rewards bridge failed', { code });
    return NextResponse.json({ error: code }, { status });
  }
}
