import { campaignCapture } from "./campaign-capture";
import { responseShape } from "./response-shape";
import { nativeEnrollmentEvidence } from "./native-enrollment";
import crypto from "node:crypto";
import { nativeSubmissionPage } from "./native-submission";
import { nativeReviewPage, type NativeReview } from "./native-review";
import { nativeJson } from "./native-json";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const CR_ORIGIN = "https://b4e0vdqv6zgqeqj4pfgm.apps.whop.com";
const CR_EXPERIENCE = "exp_KZckYGtrnbujDg";

const CR_SUBMISSION_API = `${CR_ORIGIN}/api/submission/submissions`;
const COOKIE_NAMES = [
  "__Host-cr-session",
  "__Host-cr-access-token",
  "__Host-cr-access-token-refresh-at",
  "__Host-cr-whop-id",
] as const;
type CookieName = (typeof COOKIE_NAMES)[number];

interface CookieBundle {
  cookies: Record<CookieName, string>;
  seeded_at?: string;
  updated_at?: string;
}

const MAX_JSON_BYTES = 1_000_000;
const CAMPAIGN_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function secureEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function authorize(request: NextRequest) {
  const expected = process.env.MOMENTCIRCUIT_V2_CR_BRIDGE_SECRET ?? "";
  const actual = request.headers.get("x-momentcircuit-v2-secret") ?? "";
  if (!expected || !actual || !secureEqual(expected, actual))
    throw new Error("UNAUTHORIZED");
}

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_NOT_CONFIGURED");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function campaignPreviewUrl(campaignId: string) {
  return `${CR_ORIGIN}/c/${CR_EXPERIENCE}/campaigns/${encodeURIComponent(campaignId)}/preview`;
}

function cookieHeader(bundle: CookieBundle) {
  return COOKIE_NAMES.map((name) => `${name}=${bundle.cookies[name]}`).join(
    "; ",
  );
}

function parseSetCookies(headers: Headers, bundle: CookieBundle) {
  const h = headers as Headers & { getSetCookie?: () => string[] };
  const values =
    typeof h.getSetCookie === "function"
      ? h.getSetCookie()
      : headers.get("set-cookie")
        ? [headers.get("set-cookie")!]
        : [];
  let changed = false;
  for (const raw of values) {
    const first = raw.split(";", 1)[0] ?? "";
    const eq = first.indexOf("=");
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
  const { data, error } = await client.rpc(
    "get_momentcircuit_cr_cookie_bundle",
  );
  if (error) throw new Error("COOKIE_VAULT_READ_FAILED");
  if (!data || typeof data !== "string")
    throw new Error("CONTENT_REWARDS_CLOUD_AUTH_MISSING");
  const parsed = JSON.parse(data) as CookieBundle;
  for (const name of COOKIE_NAMES)
    if (!parsed?.cookies?.[name])
      throw new Error(`CONTENT_REWARDS_COOKIE_MISSING_${name}`);
  return parsed;
}

async function saveCookieBundle(bundle: CookieBundle) {
  const client = adminClient();
  const { error } = await client.rpc("set_momentcircuit_cr_cookie_bundle", {
    secret_value: JSON.stringify(bundle),
  });
  if (error) throw new Error("COOKIE_VAULT_WRITE_FAILED");
}

async function fetchWithCookies(
  url: string,
  bundle: CookieBundle,
  init: RequestInit = {},
) {
  const origin = new URL(CR_ORIGIN).origin;
  const start = new URL(url);
  if (start.origin !== origin) throw new Error("CONTENT_REWARDS_HOST_REFUSED");

  const method = (init.method ?? "GET").toUpperCase();
  let current = start;
  const requestSignal = init.signal
    ? AbortSignal.any([init.signal, AbortSignal.timeout(20_000)])
    : AbortSignal.timeout(20_000);
  for (let hop = 0; hop <= 3; hop++) {
    const headers = new Headers(init.headers);
    headers.set("cookie", cookieHeader(bundle));
    headers.set("user-agent", "MomentCircuitV2Bridge/1.0");
    const response = await fetch(current, {
      ...init,
      headers,
      redirect: "manual",
      cache: "no-store",
      signal: requestSignal,
    });
    if (parseSetCookies(response.headers, bundle))
      await saveCookieBundle(bundle);

    const redirect =
      response.status >= 300 && response.status < 400
        ? response.headers.get("location")
        : null;
    if (redirect === null) return response;

    // Mutating calls are never replayed across redirects. The read performed before submit refreshes the session first.
    if (method !== "GET" && method !== "HEAD") return response;
    if (hop === 3) throw new Error("CONTENT_REWARDS_REDIRECT_LIMIT");

    await response.body?.cancel();
    const next = new URL(redirect, current);
    if (next.origin !== origin)
      throw new Error("CONTENT_REWARDS_REDIRECT_HOST_REFUSED");
    current = next;
  }
  throw new Error("CONTENT_REWARDS_REDIRECT_LIMIT");
}

async function boundedText(response: Response, maxBytes: number) {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes)
    throw new Error("CONTENT_REWARDS_RESPONSE_TOO_LARGE");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("CONTENT_REWARDS_BODY_MISSING");
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("CONTENT_REWARDS_RESPONSE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks);
  return new TextDecoder().decode(bytes);
}

function extractApiError(text: string) {
  try {
    const parsed = JSON.parse(text) as {
      error?: string | { code?: string; message?: string };
      success?: boolean;
    };
    if (typeof parsed.error === "string")
      return { code: "UNKNOWN", message: parsed.error };
    if (parsed.error && typeof parsed.error === "object")
      return {
        code: parsed.error.code ?? "UNKNOWN",
        message: parsed.error.message ?? "submission rejected",
      };
    if (parsed.success === false)
      return { code: "UNKNOWN", message: "submission rejected" };
  } catch {
    return null;
  }
  return null;
}

async function lookup(
  campaignId: string,
  publicUrl: string,
  bundle: CookieBundle,
) {
  const signal = AbortSignal.timeout(16_000);
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < 5; page++) {
    const raw = await nativeGet(
      `/api/submission/submissions${cursor === null ? "" : "?cursor=" + encodeURIComponent(cursor)}`,
      bundle,
      signal,
      campaignId,
    );
    const result = nativeSubmissionPage(raw, campaignId, publicUrl);
    if (result.status !== "NEXT_PAGE") return result;
    if (seen.has(result.cursor))
      return {
        status: "UNKNOWN" as const,
        reason: "CONTENT_REWARDS_PAGINATION_REPEATED",
      };
    seen.add(result.cursor);
    cursor = result.cursor;
  }
  return {
    status: "UNKNOWN" as const,
    reason: "CONTENT_REWARDS_PAGINATION_LIMIT",
  };
}

async function submit(
  campaignId: string,
  publicUrl: string,
  bundle: CookieBundle,
) {
  const before = await lookup(campaignId, publicUrl, bundle);
  if (before.status === "FOUND")
    return { status: "ALREADY_SUBMITTED" as const, remote_id: null };
  if (before.status === "UNKNOWN") return before;

  const response = await fetchWithCookies(CR_SUBMISSION_API, bundle, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      origin: CR_ORIGIN,
      referer: campaignPreviewUrl(campaignId),
    },
    body: JSON.stringify({ campaignId, url: publicUrl }),
  });
  const body = await boundedText(response, MAX_JSON_BYTES);
  const parsed = extractApiError(body);
  if (response.status === 409) {
    const after = await lookup(campaignId, publicUrl, bundle);
    return after.status === "FOUND"
      ? { status: "ALREADY_SUBMITTED" as const, remote_id: after.remote_id }
      : {
          status: "UNKNOWN" as const,
          reason: "CONTENT_REWARDS_CONFLICT_UNVERIFIED",
        };
  }
  if (response.status === 401 || response.status === 403)
    return {
      status: "UNKNOWN" as const,
      reason: "CONTENT_REWARDS_AUTH_REQUIRED",
    };
  if (response.status >= 500)
    return {
      status: "UNKNOWN" as const,
      reason: `CONTENT_REWARDS_HTTP_${response.status}`,
    };
  if (!response.ok)
    return {
      status: "REJECTED" as const,
      reason: `CONTENT_REWARDS_HTTP_${response.status}:${parsed?.code ?? "UNKNOWN"}`,
    };
  if (parsed)
    return {
      status: "REJECTED" as const,
      reason: `CONTENT_REWARDS_REJECTED:${parsed.code}`,
    };
  const after = await lookup(campaignId, publicUrl, bundle);
  return after.status === "FOUND"
    ? { status: "ACCEPTED" as const, remote_id: after.remote_id }
    : {
        status: "UNKNOWN" as const,
        reason: "CONTENT_REWARDS_SUBMIT_READBACK_UNCERTAIN",
      };
}

async function nativeGet(
  path: string,
  bundle: CookieBundle,
  signal: AbortSignal,
  refreshCampaignId?: string,
  strictJson = false,
): Promise<unknown> {
  let response = await fetchWithCookies(`${CR_ORIGIN}${path}`, bundle, {
    headers: { accept: "application/json" },
    signal,
  });
  if (response.status === 401 && refreshCampaignId !== undefined) {
    await response.body?.cancel();
    // API routes can return 401 without performing the page's session-refresh redirect.
    // One safe, campaign-bound page read may rotate the existing vault session. It proves nothing;
    // only a fresh structured API response below can establish identity or submission evidence.
    const refresh = await fetchWithCookies(
      campaignPreviewUrl(refreshCampaignId),
      bundle,
      { signal },
    );
    await refresh.body?.cancel();
    response = await fetchWithCookies(`${CR_ORIGIN}${path}`, bundle, {
      headers: { accept: "application/json" },
      signal,
    });
  }
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("application/json")
  ) {
    await response.body?.cancel();
    return null;
  }
  try {
    const raw = await boundedText(response, MAX_JSON_BYTES);
    return strictJson ? nativeJson(raw) : JSON.parse(raw);
  } catch {
    return null;
  }
}
async function probe(
  campaignId: string,
  accountKey: string,
  platform: string,
  bundle: CookieBundle,
  signal: AbortSignal = AbortSignal.timeout(16_000),
  scopeOut?: { userId: string | null },
) {
  const identity = await nativeGet(
    "/api/user/users/me",
    bundle,
    signal,
    campaignId,
    scopeOut !== undefined,
  );
  const me = identity as { success?: unknown; data?: { id?: unknown } } | null;
  const userId =
    me?.success === true &&
    typeof me.data?.id === "string" &&
    /^[a-zA-Z0-9_-]{1,128}$/.test(me.data.id)
      ? me.data.id
      : null;
  if (userId === null)
    return nativeEnrollmentEvidence({
      campaignId,
      accountKey,
      platform,
      identity,
      accounts: null,
      campaign: null,
      applications: null,
    });
  const accounts = await nativeGet(
    `/api/user/social-media-accounts?userId=${encodeURIComponent(userId)}`,
    bundle,
    signal,
    undefined,
    scopeOut !== undefined,
  );
  const campaign = await nativeGet(
    `/api/campaign/campaigns/${campaignId}`,
    bundle,
    signal,
    undefined,
    scopeOut !== undefined,
  );
  const applications = await nativeGet(
    "/api/campaign/campaigns/applications/me",
    bundle,
    signal,
    undefined,
    scopeOut !== undefined,
  );
  const result = nativeEnrollmentEvidence({
    campaignId,
    accountKey,
    platform,
    identity,
    accounts,
    campaign,
    applications,
  });
  // Contract capability is distinct from permission to execute it now. A killed action never proves enrollment.
  result.facts.join_contract_supported =
    result.facts.public_campaign === true &&
    result.facts.requires_application === false &&
    result.account_connected === true &&
    result.submit_available === true;
  result.facts.join_action_supported =
    process.env.MOMENTCIRCUIT_V2_CR_MUTATIONS_ENABLED === "true" &&
    result.facts.join_contract_supported === true;
  if (scopeOut && result.account_connected === true) scopeOut.userId = userId;
  return result;
}

/** Read-only postpublication review, never inferred acceptance or cash. No mutation switch is changed. */
async function readReview(
  campaignId: string,
  publicUrl: string,
  accountKey: string,
  platform: string,
  bundle: CookieBundle,
) {
  const unknown = (reason: string) => ({ status: "UNKNOWN" as const, reason });
  const url = new URL(publicUrl);
  const handle = accountKey.startsWith("@") ? accountKey.slice(1) : accountKey;
  if (
    platform !== "tiktok" ||
    !["www.tiktok.com", "tiktok.com"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    !/^\/@[A-Za-z0-9_.]+\/video\/\d+$/.test(url.pathname) ||
    url.pathname.split("/")[1] !== `@${handle}`
  )
    return unknown("CONTENT_REWARDS_REVIEW_ACCOUNT_URL_MISMATCH");
  const signal = AbortSignal.timeout(16_000);
  const scope = { userId: null as string | null };
  const current = await probe(
    campaignId,
    accountKey,
    platform,
    bundle,
    signal,
    scope,
  );
  if (current.account_connected !== true || scope.userId === null)
    return unknown("CONTENT_REWARDS_REVIEW_ACCOUNT_UNPROVEN");
  const seen = new Set<string>(),
    matched = new Map<string, NativeReview>();
  let cursor: string | null = null;
  for (let page = 0; page < 5; page++) {
    const raw = await nativeGet(
      `/api/submission/submissions${cursor === null ? "" : "?cursor=" + encodeURIComponent(cursor)}`,
      bundle,
      signal,
      campaignId,
      true,
    );
    const result = nativeReviewPage(raw, campaignId, publicUrl, scope.userId);
    if (result.status === "UNKNOWN") return result;
    for (const row of result.matched) {
      const old = matched.get(row.remote_id);
      if (
        old &&
        (old.native_review_status !== row.native_review_status ||
          old.native_status !== row.native_status ||
          old.flagged !== row.flagged)
      )
        return unknown("CONTENT_REWARDS_REVIEW_CONFLICT");
      matched.set(row.remote_id, row);
    }
    if (matched.size > 1)
      return unknown("CONTENT_REWARDS_REVIEW_MULTIPLE_RECORDS");
    if (result.next_cursor === null) {
      const record = [...matched.values()][0];
      if (!record) return { status: "NOT_FOUND" as const };
      return {
        status: "COMPLETE" as const,
        campaign_id: campaignId,
        public_url: publicUrl,
        account_key: accountKey,
        platform,
        captured_at: new Date().toISOString(),
        ...record,
      };
    }
    if (seen.has(result.next_cursor))
      return unknown("CONTENT_REWARDS_PAGINATION_REPEATED");
    seen.add(result.next_cursor);
    cursor = result.next_cursor;
  }
  return unknown("CONTENT_REWARDS_PAGINATION_LIMIT");
}

/** Read only; enrollment and submission mutations remain separate. */
async function readCampaign(
  campaignId: string,
  accountKey: string,
  platform: string,
  bundle: CookieBundle,
) {
  const signal = AbortSignal.timeout(16_000);
  const scope = await probe(campaignId, accountKey, platform, bundle, signal);
  const unknown = (reason: string) => ({ status: "UNKNOWN", reason });
  if (scope.account_connected !== true)
    return unknown("CAMPAIGN_ACCOUNT_READ_UNPROVEN");
  const response = await fetchWithCookies(
    `${CR_ORIGIN}/api/campaign/campaigns/${campaignId}`,
    bundle,
    { headers: { accept: "application/json" }, signal },
  );
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("application/json")
  ) {
    await response.body?.cancel();
    return unknown("CAMPAIGN_READ_UNAVAILABLE");
  }
  const raw = campaignCapture(await boundedText(response, 200_000), campaignId);
  if (raw === null) return unknown("CAMPAIGN_CAPTURE_INCOMPLETE_OR_AMBIGUOUS");
  return {
    status: "COMPLETE",
    campaign_id: campaignId,
    account_key: accountKey,
    platform,
    captured_at: new Date().toISOString(),
    raw,
  };
}

/** V2's durable reward_join_attempt owns at-most-once sending. The bridge always re-reads exact current scope. */
async function join(
  campaignId: string,
  accountKey: string,
  platform: string,
  bundle: CookieBundle,
) {
  const signal = AbortSignal.timeout(16_000);
  const before = await probe(campaignId, accountKey, platform, bundle, signal);
  if (before.facts.joined === true) return before;
  if (process.env.MOMENTCIRCUIT_V2_CR_MUTATIONS_ENABLED !== "true")
    return {
      ...before,
      facts: { ...before.facts, reason: "ENROLLMENT_MUTATIONS_KILLED" },
    };
  if (
    before.facts.join_action_supported !== true ||
    before.facts.joined !== false ||
    !before.submit_available
  )
    return {
      ...before,
      facts: { ...before.facts, reason: "AUTONOMOUS_JOIN_NOT_SUPPORTED" },
    };
  const response = await fetchWithCookies(
    `${CR_ORIGIN}/api/campaign/campaigns/${campaignId}/join`,
    bundle,
    {
      method: "POST",
      headers: { accept: "application/json", origin: CR_ORIGIN },
      signal,
    },
  );
  await response.body?.cancel(); // Neither 200 nor any response body proves enrollment.
  const after = await probe(campaignId, accountKey, platform, bundle, signal);
  return after.facts.joined === true
    ? after
    : {
        ...after,
        status: "UNKNOWN",
        facts: { ...after.facts, reason: "JOIN_OUTCOME_UNCERTAIN" },
      };
}

/** Read-only contract inspection. Fixed first-party routes from the current public client bundle;
 * response field names/types are diagnostics, never enrollment or authentication proof. */
async function inspectContract(
  campaignId: string,
  accountKey: string,
  platform: string,
  bundle: CookieBundle,
) {
  const started = Date.now();
  const signal = AbortSignal.timeout(30_000);
  const routes = {
    identity: "/api/user/users/me",
    accounts: "/api/user/social-media-accounts",
    campaign: `/api/campaign/campaigns/${campaignId}`,
    applications: "/api/campaign/campaigns/applications/me",
    features: `/api/campaign/campaigns/${campaignId}/feature-flags`,
    submissions: "/api/submission/submissions",
  };
  const evidence: Record<string, unknown> = {};
  let userId: string | null = null;
  for (const [name, path] of Object.entries(routes)) {
    if (Date.now() - started > 30_000) {
      evidence[name] = { incomplete: true };
      break;
    }
    const url = `${CR_ORIGIN}${path}${name === "accounts" && userId !== null ? "?userId=" + encodeURIComponent(userId) : ""}`;
    let response = await fetchWithCookies(url, bundle, {
      headers: { accept: "application/json" },
      signal,
    });
    if (name === "identity" && response.status === 401) {
      await response.body?.cancel();
      const refresh = await fetchWithCookies(
        campaignPreviewUrl(campaignId),
        bundle,
        { signal },
      );
      await refresh.body?.cancel();
      response = await fetchWithCookies(url, bundle, {
        headers: { accept: "application/json" },
        signal,
      });
    }
    const raw = await boundedText(response, MAX_JSON_BYTES);
    let observed: Record<string, unknown> = {};
    try {
      const envelope = JSON.parse(raw) as {
        success?: unknown;
        data?: Record<string, unknown>;
      };
      const data = envelope.success === true ? envelope.data : undefined;
      if (
        name === "identity" &&
        typeof data?.id === "string" &&
        /^[a-zA-Z0-9_-]{1,128}$/.test(data.id)
      ) {
        userId = data.id;
        observed = { identity_record_present: true };
      }
      if (name === "campaign" && data?.id === campaignId)
        observed = {
          campaign_bound: true,
          joined: typeof data.joined === "boolean" ? data.joined : null,
          requires_application:
            typeof data.requiresApplication === "boolean"
              ? data.requiresApplication
              : null,
          can_submit:
            typeof (data.access as { canSubmit?: unknown } | undefined)
              ?.canSubmit === "boolean"
              ? (data.access as { canSubmit: boolean }).canSubmit
              : null,
        };
      if (name === "accounts" && Array.isArray(data?.socialMediaAccounts)) {
        const matches = data.socialMediaAccounts.filter((value: unknown) => {
          const row = value as {
            username?: unknown;
            userId?: unknown;
            platform?: unknown;
            attempt_id?: unknown;
          };
          return (
            row?.username === accountKey &&
            row.userId === userId &&
            row.platform === platform
          );
        }) as {
          status?: unknown;
          verificationSource?: unknown;
          revokedAt?: unknown;
        }[];
        observed = {
          exact_target_matches: matches.length,
          target_status:
            matches.length === 1 &&
            typeof matches[0]?.status === "string" &&
            /^[A-Z_]{1,30}$/i.test(matches[0].status)
              ? matches[0].status
              : null,
          verification_source:
            matches.length === 1 &&
            typeof matches[0]?.verificationSource === "string" &&
            /^[A-Z_]{1,30}$/i.test(matches[0].verificationSource)
              ? matches[0].verificationSource
              : null,
          target_revoked:
            matches.length === 1 ? Boolean(matches[0]?.revokedAt) : null,
        };
      }
      if (name === "applications")
        observed = {
          partial_failure: data?.partialFailure === true,
          applications: Array.isArray(data?.applications)
            ? data.applications.length
            : null,
        };
      if (name === "submissions") {
        const review = nativeJson(raw) as {
          success?: unknown;
          data?: unknown;
        } | null;
        const counts: Record<string, number> = {
          pending: 0,
          approved: 0,
          rejected: 0,
          flagged: 0,
          unknown: 0,
        };
        if (
          review?.success === true &&
          Array.isArray(review.data) &&
          review.data.length <= 100
        ) {
          for (const value of review.data) {
            const row = value as {
              reviewStatus?: unknown;
              flagged?: unknown;
            } | null;
            const key =
              typeof row?.reviewStatus === "string" &&
              ["pending", "approved", "rejected", "flagged"].includes(
                row.reviewStatus,
              )
                ? row.reviewStatus
                : "unknown";
            counts[key]! += 1;
          }
          const vocabulary: Record<string, number> = {};
          const nativeStates: Record<string, number> = {};
          const statePairs: Record<string, number> = {};
          for (const value of review.data) {
            const status = (value as { reviewStatus?: unknown } | null)
              ?.reviewStatus;
            // Only this provider-owned enum field; never URLs, user identifiers, arbitrary bodies or credentials.
            if (typeof status === "string" && /^[A-Za-z_]{1,32}$/.test(status))
              vocabulary[status] = (vocabulary[status] ?? 0) + 1;
            const nativeStatus = (value as { status?: unknown } | null)?.status;
            if (
              typeof nativeStatus === "string" &&
              /^[A-Za-z_-]{1,32}$/.test(nativeStatus)
            ) {
              nativeStates[nativeStatus] =
                (nativeStates[nativeStatus] ?? 0) + 1;
              if (
                typeof status === "string" &&
                /^[A-Za-z_-]{1,32}$/.test(status)
              ) {
                const pair = nativeStatus + "|" + status;
                statePairs[pair] = (statePairs[pair] ?? 0) + 1;
              }
            }
          }
          observed = {
            ...observed,
            review_status_counts: counts,
            native_review_vocabulary: vocabulary,
            native_submission_vocabulary: nativeStates,
            native_submission_review_pairs: statePairs,
          };
        }
      }
    } catch {
      /* Unparseable data provides no record evidence. */
    }
    evidence[name] = {
      http_status: response.status,
      json:
        response.headers.get("content-type")?.includes("application/json") ??
        false,
      shape: responseShape(raw, campaignId, accountKey),
      observed,
    };
  }
  return { status: "UNKNOWN", reason: "CONTRACT_INSPECTION_ONLY", evidence };
}

function validHttps(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    authorize(request);
    const body = (await request.json().catch(() => null)) as {
      action?: unknown;
      campaign_id?: unknown;
      public_url?: unknown;
      account_key?: unknown;
      platform?: unknown;
      attempt_id?: unknown;
    } | null;
    if (!body || typeof body.action !== "string")
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

    const bundle = await loadCookieBundle();

    if (
      body.action === "probe" ||
      body.action === "inspect_contract" ||
      body.action === "read_campaign" ||
      body.action === "read_review" ||
      body.action === "join"
    ) {
      if (
        typeof body.account_key !== "string" ||
        !body.account_key.trim() ||
        !["tiktok", "youtube", "instagram"].includes(String(body.platform))
      )
        return NextResponse.json(
          { error: "INVALID_ACCOUNT_SCOPE" },
          { status: 400 },
        );
      if (
        typeof body.campaign_id !== "string" ||
        !CAMPAIGN_ID.test(body.campaign_id)
      )
        return NextResponse.json(
          { error: "INVALID_CAMPAIGN_ID" },
          { status: 400 },
        );
      if (body.action === "read_review") {
        if (!validHttps(body.public_url))
          return NextResponse.json(
            { error: "INVALID_PUBLIC_URL" },
            { status: 400 },
          );
        return NextResponse.json({
          ok: true,
          result: await readReview(
            body.campaign_id,
            body.public_url,
            body.account_key,
            String(body.platform),
            bundle,
          ),
        });
      }
      if (body.action === "read_campaign")
        return NextResponse.json({
          ok: true,
          result: await readCampaign(
            body.campaign_id,
            String(body.account_key),
            String(body.platform),
            bundle,
          ),
        });
      if (body.action === "join") {
        if (
          typeof body.attempt_id !== "string" ||
          !CAMPAIGN_ID.test(body.attempt_id)
        )
          return NextResponse.json(
            { error: "DURABLE_JOIN_ATTEMPT_REQUIRED" },
            { status: 400 },
          );
        return NextResponse.json({
          ok: true,
          result: await join(
            body.campaign_id,
            String(body.account_key),
            String(body.platform),
            bundle,
          ),
        });
      }
      return NextResponse.json({
        ok: true,
        result:
          body.action === "inspect_contract"
            ? await inspectContract(
                body.campaign_id,
                String(body.account_key),
                String(body.platform),
                bundle,
              )
            : await probe(
                body.campaign_id,
                String(body.account_key ?? ""),
                String(body.platform ?? ""),
                bundle,
              ),
      });
    }

    if (body.action === "lookup") {
      if (
        typeof body.campaign_id !== "string" ||
        !CAMPAIGN_ID.test(body.campaign_id)
      )
        return NextResponse.json(
          { error: "INVALID_CAMPAIGN_ID" },
          { status: 400 },
        );
      if (!validHttps(body.public_url))
        return NextResponse.json(
          { error: "INVALID_PUBLIC_URL" },
          { status: 400 },
        );
      return NextResponse.json({
        ok: true,
        result: await lookup(body.campaign_id, body.public_url, bundle),
      });
    }

    if (body.action === "submit") {
      if (process.env.MOMENTCIRCUIT_V2_CR_MUTATIONS_ENABLED !== "true")
        return NextResponse.json({
          ok: true,
          result: { status: "REJECTED", reason: "REWARD_MUTATIONS_KILLED" },
        });
      if (
        typeof body.campaign_id !== "string" ||
        !CAMPAIGN_ID.test(body.campaign_id)
      )
        return NextResponse.json(
          { error: "INVALID_CAMPAIGN_ID" },
          { status: 400 },
        );
      if (!validHttps(body.public_url))
        return NextResponse.json(
          { error: "INVALID_PUBLIC_URL" },
          { status: 400 },
        );
      return NextResponse.json({
        ok: true,
        result: await submit(body.campaign_id, body.public_url, bundle),
      });
    }

    return NextResponse.json({ error: "UNKNOWN_ACTION" }, { status: 400 });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    const code = message.split(":", 1)[0] ?? "BRIDGE_ERROR";
    const status = code === "UNAUTHORIZED" ? 401 : 500;
    console.error("MomentCircuitV2 Content Rewards bridge failed", { code });
    return NextResponse.json({ error: code }, { status });
  }
}
