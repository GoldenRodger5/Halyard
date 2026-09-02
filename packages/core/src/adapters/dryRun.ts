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
import { createVirtualClock } from './clock.js';
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
  /**
   * Did the adapter get far enough to build a request?
   *
   * Structural, rather than left to the caller to infer from the prose in
   * `wouldHave`. A rehearsal that threw before sending anything has proved
   * nothing, and a caller that renders it as a tick is the same failure shape as
   * a QC gate passing on empty input.
   */
  failed: boolean;
  /** The reason it failed, if it did. */
  error?: string;
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

/** Query parameters whose value is a credential. */
const SENSITIVE_PARAMS = /^(access_token|client_secret|refresh_token|token|api_key|key|password|code)$/i;

/**
 * Redact credentials carried in the URL itself. §200.
 *
 * Headers and bodies were redacted from the first version of this file; URLs
 * were not, because the adapters written at the time carried their token in an
 * `authorization` header. The Meta family does not — Instagram and Threads put
 * `access_token` in the query string, so every recorded GET held a live token
 * in plain text, in a log with seven-day retention that the accounts screen
 * renders. Found by asserting the absence rather than by reading the code.
 *
 * Non-URL strings are returned unchanged: this runs on whatever `fetch` was
 * handed, and a malformed input should not throw inside a recorder.
 */
export function redactUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  let touched = false;
  for (const [key, value] of [...url.searchParams]) {
    if (SENSITIVE_PARAMS.test(key) && value) {
      url.searchParams.set(key, redactToken(value));
      touched = true;
    }
  }
  return touched ? url.toString() : raw;
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
      // §200. The Meta family carries its token here, not in a header.
      url: redactUrl(url),
      headers: redactHeaders(init?.headers),
      body: redactBody(init?.body),
      at: new Date(),
    });

    /*
     * Shapes chosen to satisfy each adapter's parsing so the whole flow runs.
     *
     * §200. This list is matched by hostname, and it silently went stale.
     * §184 moved Instagram from `graph.facebook.com` to `graph.instagram.com`,
     * and nothing here followed — so an Instagram rehearsal fell through to the
     * bare `{ id }` default, its Reel container never reported `FINISHED`, and
     * `waitForContainer` polled to its five-minute ceiling. A dry run that
     * cannot answer the adapter's own status check is not a rehearsal of it.
     *
     * The Threads host is `graph.threads.net`; Instagram's is
     * `graph.instagram.com`. Both need `status_code`, because both poll.
     */
    const body =
      url.includes('graph.instagram.com') ||
      url.includes('graph.threads') ||
      url.includes('graph.facebook')
        ? {
            id: 'dry-run-id',
            permalink: 'https://example.invalid/dry-run',
            status_code: 'FINISHED',
            // Instagram Login identity and code exchange run through this host too.
            user_id: 'dry-run-user',
            username: 'dry-run',
          }
        : url.includes('api.instagram.com')
          ? { access_token: 'dry-run-token', user_id: 'dry-run-user', permissions: [] }
          : url.includes('api.x.com')
            ? { data: { id: 'dry-run-id' } }
            : url.includes('pinterest')
              ? { id: 'dry-run-id' }
              : url.includes('tiktokapis')
                ? {
                    data: {
                      publish_id: 'dry-run-id',
                      creator_username: 'dry-run',
                      // `/status/fetch/` polls this until it is terminal.
                      status: 'PUBLISH_COMPLETE',
                    },
                  }
                : url.includes('googleapis.com')
                  ? { id: 'dry-run-id', items: [{ id: 'dry-run-id' }] }
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

  /*
   * §200. A virtual clock, not a no-op sleep.
   *
   * The previous `sleep: async () => undefined` stopped the waiting and left
   * the deadline where it was, on the real clock — so a container that never
   * reported FINISHED span for five wall-clock minutes recording a request per
   * pass until the heap died. Advancing time on sleep makes the adapter's own
   * ceiling terminate the loop in a bounded number of iterations, immediately,
   * with no branch inside `publish()` that could drift from the real path.
   */
  const clock = createVirtualClock();

  try {
    result = await adapter.publish(item, assets, {
      ...account,
      meta: { ...account.meta, fetchImpl, clock, sleep: clock.sleep },
    });
  } catch (err) {
    error = (err as Error).message;
  }

  const writes = requests.filter((r) => r.method === 'POST' || r.method === 'PUT');

  /**
   * Price the writes that actually happened, not the one we assumed. §200.
   *
   * This charged for a single post and picked the rate from `linkStrategy`:
   * `withLink` only when the strategy was `in_body`, `withoutLink` otherwise.
   * X's strategy is `first_reply` — it posts the tweet, then a *second* tweet
   * carrying the link. Both are billed. So an X rehearsal with a link reported
   * $0.015 against two chargeable calls, one of which carries a link and bills
   * at the higher rate.
   *
   * Rehearsal exists to replace assumptions with the recorded request, and the
   * estimate is the one number an operator reads before deciding to spend. It
   * now counts the writes and prices each on whether that request carries the
   * link — evidence rather than inference.
   */
  const rates = adapter.constraints.costPerPostUsd;
  const cost = rates
    ? writes.reduce((sum, request) => {
        const carriesLink =
          Boolean(item.finalLinkUrl) && JSON.stringify(request.body ?? '').includes(item.finalLinkUrl!);
        return sum + (carriesLink ? rates.withLink : rates.withoutLink);
      }, 0)
    : undefined;

  return {
    platform: adapter.platform,
    requests,
    estimatedCostUsd: cost,
    // No writes is also a failure: the adapter returned without attempting the
    // thing being rehearsed, and there is nothing to inspect.
    failed: error !== null || writes.length === 0,
    error: error ?? undefined,
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
  checks: Array<{
    name: string;
    ok: boolean;
    detail: string;
    /**
     * §500. True when the check could not be made at all, rather than made and
     * passed. A provider that does not report granted scopes leaves this one
     * unmeasurable, and reporting that as a pass would be the inverse of
     * gotcha 6 — an unrun check reading as a good one.
     */
    unmeasured?: boolean;
  }>;
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

  /*
   * §500. An empty scope list is silence, not a refusal.
   *
   * Threads' token responses carry no `scope` field at all — neither the
   * authorization-code exchange nor the long-lived upgrade — so a fully
   * authorised account stores `scopes: []`. This check read that as *every*
   * required scope missing and failed a credential that works, on an account
   * whose developer dashboard showed all four permissions granted. The
   * operator saw "missing threads_basic, threads_content_publish, …" and had
   * nothing to fix, because there was nothing wrong.
   *
   * A provider that reports a set can be checked against it; a provider that
   * reports nothing cannot be checked at all. The live read below is what
   * proves the grant either way, which is what it was always for.
   */
  const granted = new Set(account.tokens.scopes ?? []);
  const missing = requiredScopes.filter((scope) => !granted.has(scope));
  if (requiredScopes.length > 0) {
    const reported = granted.size > 0;
    checks.push({
      name: 'scopes granted',
      ok: reported ? missing.length === 0 : true,
      unmeasured: !reported,
      detail: !reported
        ? `${adapter.platform} does not report granted scopes on its tokens, so this cannot be checked. ` +
          `Halyard asked for ${requiredScopes.join(', ')}; the live read is the proof.`
        : missing.length === 0
          ? `${granted.size} scopes`
          : `missing ${missing.join(', ')}`,
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
  const unmeasured = checks.filter((c) => c.unmeasured);

  /*
   * §500. What could not be measured is said, never implied. A summary that
   * reported only "credential is good" would let an unmeasurable check pass
   * for a passing one — the shape gotcha 6 exists to refuse.
   */
  const caveat =
    unmeasured.length > 0
      ? ` ${unmeasured.length} check${unmeasured.length === 1 ? '' : 's'} not measured: ${unmeasured
          .map((c) => c.name)
          .join(', ')}.`
      : '';

  return {
    platform: adapter.platform,
    ok: failed.length === 0,
    checks,
    summary:
      failed.length === 0
        ? `${adapter.platform} credential is good.${caveat}`
        : `${adapter.platform}: ${failed.map((c) => c.name).join(', ')} failed. ${failed[0]!.detail}${caveat}`,
  };
}

/** build pack §8 — request logs are kept for seven days and no longer. */
export const REQUEST_LOG_RETENTION_DAYS = 7;
