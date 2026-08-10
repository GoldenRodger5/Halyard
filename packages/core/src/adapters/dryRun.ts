/**
 * Dry-run and self-test. Milestone 32.
 *
 * Every adapter is contract-tested and none has met a real API. Two things make
 * first contact survivable:
 *
 *   · **Dry run** — build the exact request, log it, do not send. Lets the
 *     operator inspect what X or Instagram would receive before spending money
 *     or, worse, posting something.
 *   · **Self-test** — verify a token, its scopes, and one trivial read, on
 *     demand and daily, so a dead credential is found before a publish job finds
 *     it.
 *
 * Requests are logged with tokens redacted and a seven-day retention.
 */
import { redactToken } from '../crypto/tokenCrypto.js';
import type { PlatformAdapter, PublishAccount, PublishAsset, PublishItem, PublishResult } from './types.js';

export interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  at: Date;
}

export interface DryRunResult {
  platform: string;
  requests: RecordedRequest[];
  /** What would have happened, in the operator's language. */
  wouldHave: string;
  estimatedCostUsd?: number;
}

/** Header names whose value must never be written down. */
const SENSITIVE_HEADERS = ['authorization', 'cookie', 'x-api-key', 'proxy-authorization'];

export function redactHeaders(headers: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    out[key] = SENSITIVE_HEADERS.includes(key.toLowerCase()) ? redactToken(value) : value;
  });
  return out;
}

function redactBody(body: unknown): unknown {
  if (typeof body !== 'string') {
    if (body instanceof URLSearchParams) return redactBody(Object.fromEntries(body));
    if (body && typeof body === 'object') {
      return Object.fromEntries(
        Object.entries(body as Record<string, unknown>).map(([key, value]) => [
          key,
          /token|secret|password|key$/i.test(key) ? redactToken(String(value)) : value,
        ]),
      );
    }
    return body;
  }
  try {
    return redactBody(JSON.parse(body));
  } catch {
    return body.length > 500 ? `${body.slice(0, 500)}…` : body;
  }
}

/**
 * A fetch that records and refuses.
 *
 * Returns a plausible-shaped success so the adapter runs its full code path —
 * the point is to see the request the adapter *would* build, including the
 * second call in a two-step flow.
 */
export function createDryRunFetch(): { fetchImpl: typeof fetch; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push({
      method: init?.method ?? 'GET',
      url,
      headers: redactHeaders(init?.headers),
      body: redactBody(init?.body),
      at: new Date(),
    });

    // Shapes chosen to satisfy each adapter's parsing so the whole flow runs.
    const body = url.includes('graph.facebook') || url.includes('graph.threads')
      ? { id: 'dry-run-id', permalink: 'https://example.invalid/dry-run', status_code: 'FINISHED' }
      : url.includes('api.x.com')
        ? { data: { id: 'dry-run-id' } }
        : url.includes('pinterest')
          ? { id: 'dry-run-id' }
          : url.includes('tiktokapis')
            ? { data: { publish_id: 'dry-run-id', creator_username: 'dry-run' } }
            : { id: 'dry-run-id' };

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json', location: 'https://example.invalid/upload' },
    });
  }) as unknown as typeof fetch;

  return { fetchImpl, requests };
}

/**
 * Build the exact request an adapter would send, without sending it.
 *
 * The account is cloned with a dry-run fetch rather than the adapter being asked
 * to behave differently, so there is no "dry run mode" branch inside publish()
 * that could drift from the real path.
 */
export async function dryRunPublish(
  adapter: PlatformAdapter,
  item: PublishItem,
  assets: PublishAsset[],
  account: PublishAccount,
): Promise<DryRunResult> {
  const { fetchImpl, requests } = createDryRunFetch();

  let result: PublishResult | null = null;
  let error: string | null = null;

  try {
    result = await adapter.publish(item, assets, {
      ...account,
      meta: { ...account.meta, fetchImpl, sleep: async () => undefined },
    });
  } catch (err) {
    error = (err as Error).message;
  }

  const writes = requests.filter((r) => r.method === 'POST' || r.method === 'PUT');
  const cost = adapter.constraints.costPerPostUsd
    ? item.finalLinkUrl && adapter.constraints.linkStrategy === 'in_body'
      ? adapter.constraints.costPerPostUsd.withLink
      : adapter.constraints.costPerPostUsd.withoutLink
    : undefined;

  return {
    platform: adapter.platform,
    requests,
    estimatedCostUsd: cost,
    wouldHave: error
      ? `Failed before sending anything: ${error}`
      : `${writes.length} write${writes.length === 1 ? '' : 's'} to ${adapter.platform}, ` +
        `publishing as ${result?.mode ?? 'unknown'}` +
        (cost !== undefined ? `, costing about $${cost.toFixed(3)}` : '') +
        '.',
  };
}

// ── Self-test ──────────────────────────────────────────────────────────────

export interface SelfTestResult {
  platform: string;
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; detail: string }>;
  /** The plain-language summary the accounts page shows. */
  summary: string;
}

/**
 * Verify a credential without publishing: token valid, scopes sufficient, one
 * trivial read succeeds.
 *
 * Runs on demand and daily. A dead token found by a self-test is an
 * inconvenience; found by a publish job it is a missed slot and a paused queue.
 */
export async function selfTest(
  adapter: PlatformAdapter,
  account: PublishAccount,
  requiredScopes: string[] = [],
): Promise<SelfTestResult> {
  const checks: SelfTestResult['checks'] = [];

  checks.push({
    name: 'token present',
    ok: Boolean(account.tokens.accessToken),
    detail: account.tokens.accessToken
      ? `stored, ${redactToken(account.tokens.accessToken)}`
      : 'no access token stored. Reconnect the account.',
  });

  const expiresAt = account.tokens.expiresAt;
  checks.push({
    name: 'token not expired',
    ok: !expiresAt || expiresAt.getTime() > Date.now(),
    detail: expiresAt
      ? expiresAt.getTime() > Date.now()
        ? `expires ${expiresAt.toISOString()}`
        : `expired ${expiresAt.toISOString()}`
      : 'no expiry recorded',
  });

  const granted = new Set(account.tokens.scopes ?? []);
  const missing = requiredScopes.filter((scope) => !granted.has(scope));
  if (requiredScopes.length > 0) {
    checks.push({
      name: 'scopes granted',
      ok: missing.length === 0,
      detail: missing.length === 0 ? `${granted.size} scopes` : `missing ${missing.join(', ')}`,
    });
  }

  // The trivial read. This is the check that actually proves the credential.
  try {
    const report = await adapter.verifyCapabilities(account);
    checks.push({
      name: 'live read',
      ok: report.state !== 'error' && report.state !== 'pending_auth',
      detail: report.detail,
    });
  } catch (err) {
    checks.push({ name: 'live read', ok: false, detail: (err as Error).message });
  }

  const failed = checks.filter((c) => !c.ok);

  return {
    platform: adapter.platform,
    ok: failed.length === 0,
    checks,
    summary:
      failed.length === 0
        ? `${adapter.platform} credential is good.`
        : `${adapter.platform}: ${failed.map((c) => c.name).join(', ')} failed. ${failed[0]!.detail}`,
  };
}

/** build pack §8 — request logs are kept for seven days and no longer. */
export const REQUEST_LOG_RETENTION_DAYS = 7;
