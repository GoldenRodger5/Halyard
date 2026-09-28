import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const CR_ORIGIN = 'https://b4e0vdqv6zgqeqj4pfgm.apps.whop.com';
const CR_EXPERIENCE = 'exp_KZckYGtrnbujDg';
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

interface SubmissionJob {
  id: string;
  campaign_id: string;
  campaign_name: string | null;
  story_family: string | null;
  metricool_uuid: string | null;
  platform: string;
  public_url: string;
  published_at: string;
  submission_deadline_minutes: number;
  status: string;
}

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

function campaignPreviewUrl(campaignId: string) {
  return `${CR_ORIGIN}/c/${CR_EXPERIENCE}/campaigns/${campaignId}/preview`;
}

function submissionsUrl() {
  return `${CR_ORIGIN}/c/${CR_EXPERIENCE}/submissions`;
}
function cookieHeader(bundle: CookieBundle) {
  return COOKIE_NAMES
    .map((name) => `${name}=${bundle.cookies[name]}`)
    .join('; ');
}

function parseSetCookies(headers: Headers, bundle: CookieBundle) {
  const h = headers as Headers & { getSetCookie?: () => string[] };
  const values = typeof h.getSetCookie === 'function'
    ? h.getSetCookie()
    : (headers.get('set-cookie') ? [headers.get('set-cookie')!] : []);

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

async function loadCookieBundle() {
  const client = adminClient();
  const { data, error } = await client.rpc('get_momentcircuit_cr_cookie_bundle');
  if (error) throw new Error(`COOKIE_VAULT_READ_FAILED: ${error.message}`);
  if (!data || typeof data !== 'string') throw new Error('CONTENT_REWARDS_CLOUD_AUTH_MISSING');

  const parsed = JSON.parse(data) as CookieBundle;
  for (const name of COOKIE_NAMES) {
    if (!parsed?.cookies?.[name]) throw new Error(`CONTENT_REWARDS_COOKIE_MISSING:${name}`);
  }
  return parsed;
}

async function saveCookieBundle(bundle: CookieBundle) {
  const client = adminClient();
  const { error } = await client.rpc('set_momentcircuit_cr_cookie_bundle', {
    secret_value: JSON.stringify(bundle),
  });
  if (error) throw new Error(`COOKIE_VAULT_WRITE_FAILED: ${error.message}`);
}

async function fetchWithCookies(
  url: string,
  bundle: CookieBundle,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set('cookie', cookieHeader(bundle));
  if (!headers.has('user-agent')) headers.set('user-agent', 'MomentCircuitCloud/1.0');

  const response = await fetch(url, {
    ...init,
    headers,
    redirect: init.redirect ?? 'follow',
    cache: 'no-store',
  });
  const changed = parseSetCookies(response.headers, bundle);
  return { response, changed };
}
function scriptUrls(html: string) {
  const out = new Set<string>();
  const re = /<script[^>]+src="([^"]+)"/g;
  for (let match; (match = re.exec(html)); ) {
    const src = match[1]!;
    try {
      out.add(new URL(src, CR_ORIGIN).toString());
    } catch {
      // ignore malformed script URL
    }
  }
  return [...out];
}

function submissionActionIdFromJs(js: string) {
  const match = js.match(
    /createServerReference\("([a-f0-9]{32,64})"[\s\S]{0,300}?"createSubmissionAction"/i,
  );
  return match?.[1] ?? null;
}

async function discoverSubmissionAction(campaignId: string, bundle: CookieBundle) {
  const pageUrl = campaignPreviewUrl(campaignId);
  const { response: page, changed } = await fetchWithCookies(pageUrl, bundle, {
    headers: { accept: 'text/html' },
  });
  if (!page.ok) throw new Error(`CR_PREVIEW_HTTP_${page.status}`);

  const html = await page.text();
  const direct = submissionActionIdFromJs(html);
  if (direct) {
    if (changed) await saveCookieBundle(bundle);
    return direct;
  }

  const scripts = scriptUrls(html);
  const concurrency = 10;
  for (let i = 0; i < scripts.length; i += concurrency) {
    const batch = scripts.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (src) => {
        try {
          const res = await fetch(src, { cache: 'no-store' });
          if (!res.ok) return null;
          const text = await res.text();
          return submissionActionIdFromJs(text);
        } catch {
          return null;
        }
      }),
    );
    const found = results.find(Boolean);
    if (found) {
      if (changed) await saveCookieBundle(bundle);
      return found;
    }
  }
  throw new Error('CR_SUBMISSION_ACTION_NOT_FOUND');
}
function parseServerActionError(text: string) {
  const successFalse = text.includes('"success":false');
  if (!successFalse) return null;

  const errorMatch = text.match(/"error":"([^"]+)"/);
  const codeMatch = text.match(/"code":"([^"]+)"/);
  const fieldMatch = text.match(/"fields":(\{[\s\S]*?\})[,}]/);
  return {
    code: codeMatch?.[1] ?? 'UNKNOWN',
    error: errorMatch?.[1] ?? 'Submission rejected',
    fields: fieldMatch?.[1] ?? null,
  };
}

async function submitUrl(
  job: SubmissionJob,
  bundle: CookieBundle,
  actionId: string,
) {
  const url = campaignPreviewUrl(job.campaign_id);
  const { response, changed } = await fetchWithCookies(url, bundle, {
    method: 'POST',
    headers: {
      accept: 'text/x-component',
      'content-type': 'text/plain;charset=UTF-8',
      'next-action': actionId,
      origin: CR_ORIGIN,
      referer: url,
    },
    body: JSON.stringify([{ campaignId: job.campaign_id, url: job.public_url }]),
  });

  const text = await response.text();
  if (changed) await saveCookieBundle(bundle);
  if (!response.ok) throw new Error(`CR_SUBMIT_HTTP_${response.status}`);

  const rejected = parseServerActionError(text);
  if (rejected) {
    throw new Error(`CR_SUBMIT_REJECTED:${rejected.code}:${rejected.error}`);
  }

  return { raw: text.slice(0, 2000) };
}

async function verifyReadback(publicUrl: string, bundle: CookieBundle) {
  const { response, changed } = await fetchWithCookies(submissionsUrl(), bundle, {
    headers: { accept: 'text/html' },
  });
  const text = await response.text();
  if (changed) await saveCookieBundle(bundle);
  if (!response.ok) throw new Error(`CR_READBACK_HTTP_${response.status}`);
  return text.includes(publicUrl);
}

function deadline(job: SubmissionJob) {
  return new Date(
    new Date(job.published_at).getTime() +
      Number(job.submission_deadline_minutes) * 60_000,
  );
}
async function claimJob(id: string) {
  const client = adminClient();
  const { data, error } = await client
    .from('momentcircuit_submission_jobs')
    .update({
      status: 'submitting',
      started_at: new Date().toISOString(),
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'queued')
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`SUBMISSION_JOB_CLAIM_FAILED: ${error.message}`);
  return data as SubmissionJob | null;
}

async function markJob(id: string, patch: Record<string, unknown>) {
  const client = adminClient();
  const { error } = await client
    .from('momentcircuit_submission_jobs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`SUBMISSION_JOB_UPDATE_FAILED: ${error.message}`);
}

async function execute(id: string) {
  const job = await claimJob(id);
  if (!job) {
    const client = adminClient();
    const { data } = await client
      .from('momentcircuit_submission_jobs')
      .select('id,status,result,error')
      .eq('id', id)
      .maybeSingle();
    return { duplicate: true, job: data };
  }

  if (Date.now() > deadline(job).getTime()) {
    await markJob(job.id, {
      status: 'expired',
      error: 'SUBMISSION_WINDOW_EXPIRED',
      completed_at: new Date().toISOString(),
    });
    return { duplicate: false, expired: true, job_id: job.id };
  }

  try {
    const bundle = await loadCookieBundle();
    const actionId = await discoverSubmissionAction(job.campaign_id, bundle);
    await submitUrl(job, bundle, actionId);

    let verified = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, 1200));
      verified = await verifyReadback(job.public_url, bundle);
      if (verified) break;
    }
    if (!verified) throw new Error('CR_SUBMISSION_READBACK_NOT_CONFIRMED');

    const submittedAt = new Date().toISOString();
    const result = {
      submitted_at: submittedAt,
      verified: true,
      action_discovered_live: true,
      platform: job.platform,
      public_url: job.public_url,
    };
    await markJob(job.id, {
      status: 'submitted',
      result,
      completed_at: submittedAt,
      error: null,
    });
    return { duplicate: false, submitted: true, job_id: job.id, result };
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error).slice(0, 4000);
    await markJob(job.id, {
      status: 'failed',
      error: message,
      completed_at: new Date().toISOString(),
    });
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    authorize(request);
    const body = (await request.json()) as { id?: string };
    if (!body.id) return NextResponse.json({ error: 'id_required' }, { status: 400 });
    return NextResponse.json({ ok: true, ...(await execute(body.id)) });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    const status = message === 'UNAUTHORIZED' ? 401 : 500;
    console.error('MomentCircuit Content Rewards cloud submit failed', { error: message });
    return NextResponse.json({ error: message }, { status });
  }
}
