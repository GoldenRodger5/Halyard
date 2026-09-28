/**
 * Probe what a transport can actually do, and record what was observed.
 *
 * ## The ignition this never had
 *
 * `scripts/verify-provider.ts` has existed since milestone 49 and
 * `provider_capabilities` has never held a row, because running the probe was
 * something an operator had to remember. That is precisely the shape
 * `explore_product` had before P1: a complete capability with no trigger.
 *
 * So the probe becomes a job. It is **not** scheduled: a live probe spends real
 * API calls and, with `--publish`, real posts. It is enqueued from `/accounts`
 * by a person who meant it — the same reasoning that keeps exploration manual.
 *
 * ## A probe that cannot run is a result, not a failure
 *
 * With no credential this records `unavailable` and returns. It does **not**
 * throw, and it does not write `no` anywhere. A missing API key tells you
 * nothing about what a platform supports, and the one thing this file must
 * never do is let an absent credential harden into "not supported" — which is
 * indistinguishable, downstream, from a platform that genuinely cannot do it.
 *
 * ## Idempotence
 *
 * Every probe appends an observation; the *belief* in `provider_capabilities`
 * is upserted on the provider key. Running it twice against an unchanged
 * provider therefore leaves one belief and two observations, which is correct:
 * the belief has not changed, and both checks really happened.
 */
import {
  unverified,
  type PlatformCapability,
  type PlatformId,
  type ProviderCapabilities,
} from '@halyard/core';
import type { HandlerContext, Job } from '../poller.js';

/** Platforms the unified transport claims, and therefore the ones worth probing. */
export const PROBED_PLATFORMS: PlatformId[] = [
  'x',
  'instagram',
  'threads',
  'pinterest',
  'youtube',
  'tiktok',
  'bluesky',
];

export type ProbeOutcome = 'confirmed' | 'refuted' | 'unavailable' | 'error';

export interface ProbeResult {
  outcome: ProbeOutcome;
  detail: string;
  observed: Record<string, unknown>;
  /** Only set when the probe actually learned something. */
  capabilities?: ProviderCapabilities;
}

/**
 * The live probe, injectable so the whole path is testable without a credential.
 *
 * Production passes nothing and gets the real implementation below. A test
 * passes a deterministic stub. What a test must never do is *become* the
 * ignition path — the job exists so production has one.
 */
export type ProbeRunner = (input: {
  provider: string;
  apiKey: string;
}) => Promise<ProbeResult>;

/**
 * Ask the provider what accounts it has, which is the cheapest honest probe.
 *
 * Reading is enough to establish reachability and authentication. Anything
 * beyond that — carousels, alt text, whether TikTok publishes publicly or to
 * drafts — requires spending a real post, which `scripts/verify-provider.ts`
 * does deliberately and interactively. A background job must not.
 *
 * So this confirms connectivity and leaves every per-platform capability
 * `unknown`, which is the honest result of a read-only probe rather than a
 * thin one pretending to be thorough.
 */
export const liveBlotatoProbe: ProbeRunner = async ({ provider, apiKey }) => {
  const started = Date.now();
  try {
    const response = await fetch('https://backend.blotato.com/v2/users/me/accounts', {
      headers: { 'blotato-api-key': apiKey },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return {
        outcome: response.status === 401 || response.status === 403 ? 'unavailable' : 'error',
        detail: `Provider returned ${response.status}. ${body.slice(0, 200)}`,
        observed: { status: response.status },
      };
    }

    const payload = (await response.json()) as {
      items?: Array<{ id?: string; platform?: string; username?: string; fullname?: string }>;
    };
    const providerToHalyard: Record<string, PlatformId> = {
      twitter: 'x',
      x: 'x',
      instagram: 'instagram',
      threads: 'threads',
      pinterest: 'pinterest',
      youtube: 'youtube',
      tiktok: 'tiktok',
      bluesky: 'bluesky',
    };
    const seen = new Set<PlatformId>();
    for (const item of payload.items ?? []) {
      const platform = providerToHalyard[String(item.platform ?? '').toLowerCase()];
      if (platform) seen.add(platform);
    }

    const capabilities = unverified(provider, PROBED_PLATFORMS);
    capabilities.verifiedAt = new Date().toISOString();

    for (const platform of PROBED_PLATFORMS) {
      const connected = seen.has(platform);
      const capability = capabilities.platforms[platform] as PlatformCapability;
      /**
       * A connected account proves the transport can *reach* the platform. It
       * does not prove it can publish, so `publish` stays `unknown` rather than
       * becoming `yes` — the exact substitution this model exists to prevent.
       */
      capability.notes = connected
        ? [
            'The provider reports a connected account for this platform. Reachability only — publishing is still unverified.',
          ]
        : ['The provider reports no connected account for this platform.'];
      // No connected account is an account-state observation, not evidence that
      // the provider lacks the capability. Publish therefore stays unknown.
    }

    return {
      outcome: 'confirmed',
      detail: `Reached the provider and read ${(payload.items ?? []).length} connected account(s) across ${seen.size} supported platform(s).`,
      observed: {
        platforms: [...seen],
        accounts: (payload.items ?? []).map((item) => ({
          id: String(item.id ?? ''),
          platform: String(item.platform ?? '').toLowerCase(),
          username: item.username ?? null,
          fullname: item.fullname ?? null,
        })),
        durationMs: Date.now() - started,
      },
      capabilities,
    };
  } catch (err) {
    return {
      outcome: 'error',
      detail: `Probe could not complete: ${(err as Error).message}`,
      observed: {},
    };
  }
};

interface ObservedProviderAccount {
  id: string;
  platform: string;
  username?: string | null;
  fullname?: string | null;
}

const providerPlatform = (value: string): PlatformId | null => {
  const mapped: Record<string, PlatformId> = {
    twitter: 'x', x: 'x', instagram: 'instagram', threads: 'threads',
    pinterest: 'pinterest', youtube: 'youtube', tiktok: 'tiktok', bluesky: 'bluesky',
  };
  return mapped[value.toLowerCase()] ?? null;
};

const normaliseIdentity = (value: string | null | undefined): string =>
  String(value ?? '').toLowerCase().replace(/^@/, '').replace(/[^a-z0-9]/g, '');

/**
 * Match provider ids without changing transport. Unique-platform accounts are
 * unambiguous; when several accounts share a platform (usually X), handles must
 * match. A failed match stays null rather than guessing which real account will
 * receive a future post.
 */
export function matchProviderAccount(
  account: { platform: string; handle: string },
  providerAccounts: ObservedProviderAccount[],
  options: { allowSolePlatformFallback?: boolean } = {},
): ObservedProviderAccount | null {
  const candidates = providerAccounts.filter((candidate) => providerPlatform(candidate.platform) === account.platform);
  if (candidates.length === 0) return null;

  const wanted = normaliseIdentity(account.handle);
  const byIdentity =
    candidates.find((candidate) => normaliseIdentity(candidate.username) === wanted) ??
    candidates.find((candidate) => normaliseIdentity(candidate.fullname) === wanted) ??
    candidates.find((candidate) => normaliseIdentity(candidate.fullname).includes(wanted) && wanted.length >= 4) ??
    null;
  if (byIdentity) return byIdentity;

  /*
   * A sole-platform fallback is safe only when the caller also knows Halyard
   * has one account on that platform. Otherwise a future second product would
   * silently inherit the first product's real Instagram/Pinterest account.
   */
  return options.allowSolePlatformFallback && candidates.length === 1 ? candidates[0]! : null;
}

async function syncProviderAccountIds(
  ctx: HandlerContext,
  providerAccounts: ObservedProviderAccount[],
): Promise<{ mapped: number; unmatched: string[] }> {
  const { rows } = await ctx.pool.query<{ id: string; platform: string; handle: string }>(
    `select id, platform, handle from social_accounts`,
  );
  let mapped = 0;
  const unmatched: string[] = [];
  const halyardPlatformCounts = new Map<string, number>();
  for (const account of rows) {
    halyardPlatformCounts.set(account.platform, (halyardPlatformCounts.get(account.platform) ?? 0) + 1);
  }

  for (const account of rows) {
    const match = matchProviderAccount(account, providerAccounts, {
      allowSolePlatformFallback: halyardPlatformCounts.get(account.platform) === 1,
    });
    if (!match?.id) {
      unmatched.push(`${account.platform}:${account.handle}`);
      continue;
    }
    const result = await ctx.pool.query(
      `update social_accounts set provider_account_id = $2 where id = $1 and provider_account_id is distinct from $2`,
      [account.id, match.id],
    );
    mapped += result.rowCount ?? 0;
  }

  return { mapped, unmatched };
}

async function syncBlotatoPinterestBoards(
  ctx: HandlerContext,
  apiKey: string,
  providerAccounts: ObservedProviderAccount[],
): Promise<{ accounts: number; boards: number; errors: string[] }> {
  const pinterest = providerAccounts.filter((account) => providerPlatform(account.platform) === 'pinterest');
  if (pinterest.length === 0) return { accounts: 0, boards: 0, errors: [] };

  let accounts = 0;
  let boards = 0;
  const errors: string[] = [];

  for (const providerAccount of pinterest) {
    const { rows: localRows } = await ctx.pool.query<{ id: string }>(
      `select id from social_accounts where platform = 'pinterest' and provider_account_id = $1`,
      [providerAccount.id],
    );
    const local = localRows[0];
    if (!local) continue;

    try {
      const response = await fetch(
        `https://backend.blotato.com/v2/social/pinterest/boards?accountId=${encodeURIComponent(providerAccount.id)}`,
        { headers: { 'blotato-api-key': apiKey } },
      );
      if (!response.ok) {
        errors.push(`${providerAccount.id}: HTTP ${response.status}`);
        continue;
      }
      const payload = (await response.json()) as { items?: Array<{ id?: string; name?: string }> };
      const items = (payload.items ?? []).filter((item) => item.id && item.name);

      // Preserve an operator-selected default if it still exists. If the old
      // default disappeared, leave the account with no default rather than
      // silently choosing a new destination.
      const { rows: defaultRows } = await ctx.pool.query<{ board_id: string }>(
        `select board_id from pinterest_boards where account_id = $1 and is_default`,
        [local.id],
      );
      const previousDefault = defaultRows[0]?.board_id ?? null;
      const stillExists = previousDefault && items.some((item) => item.id === previousDefault);

      await ctx.pool.query('begin');
      try {
        for (const item of items) {
          await ctx.pool.query(
            `insert into pinterest_boards (account_id, board_id, name, is_default, synced_at)
             values ($1,$2,$3,$4,now())
             on conflict (account_id, board_id) do update
               set name = excluded.name,
                   is_default = excluded.is_default,
                   synced_at = excluded.synced_at`,
            [local.id, item.id, item.name, Boolean(stillExists && item.id === previousDefault)],
          );
        }
        await ctx.pool.query(
          `delete from pinterest_boards
            where account_id = $1
              and not (board_id = any($2::text[]))`,
          [local.id, items.map((item) => item.id as string)],
        );
        await ctx.pool.query('commit');
      } catch (err) {
        await ctx.pool.query('rollback');
        throw err;
      }

      accounts += 1;
      boards += items.length;
    } catch (err) {
      errors.push(`${providerAccount.id}: ${(err as Error).message}`);
    }
  }

  return { accounts, boards, errors };
}

/**
 * A cheaper probe must never erase a stronger observation.
 *
 * `verify-provider` and a real publication can settle individual capabilities;
 * the background/UI probe only proves the API key and connected-account surface.
 * Merge unknowns into what is already known rather than replacing the record.
 */
export function mergeProviderCapabilities(
  existing: ProviderCapabilities | null | undefined,
  incoming: ProviderCapabilities,
): ProviderCapabilities {
  if (!existing) return incoming;
  const merged: ProviderCapabilities = {
    provider: incoming.provider,
    verifiedAt: incoming.verifiedAt ?? existing.verifiedAt,
    platforms: { ...existing.platforms },
  };

  for (const [platform, next] of Object.entries(incoming.platforms) as Array<[PlatformId, PlatformCapability]>) {
    const current = existing.platforms[platform];
    if (!current) {
      merged.platforms[platform] = next;
      continue;
    }
    const keep = (value: 'yes' | 'no' | 'unknown', old: 'yes' | 'no' | 'unknown') =>
      value === 'unknown' ? old : value;
    merged.platforms[platform] = {
      ...next,
      publish: keep(next.publish, current.publish),
      publishesPublicly: keep(next.publishesPublicly, current.publishesPublicly),
      carousel: keep(next.carousel, current.carousel),
      video: keep(next.video, current.video),
      shortVideo: keep(next.shortVideo, current.shortVideo),
      altText: keep(next.altText, current.altText),
      scheduling: keep(next.scheduling, current.scheduling),
      metrics: next.metrics.length > 0 ? next.metrics : current.metrics,
      notes: [...new Set([...current.notes, ...next.notes])],
      verifiedAt: next.verifiedAt ?? current.verifiedAt,
    };
  }
  return merged;
}

export interface VerifyCapabilityDeps {
  probe?: ProbeRunner;
  apiKey?: string | null;
}

export async function verifyCapabilityHandler(
  job: Job,
  ctx: HandlerContext,
  deps: VerifyCapabilityDeps = {},
): Promise<void> {
  const provider = String(job.payload.provider ?? 'blotato');
  const startedAt = new Date();
  const apiKey = deps.apiKey ?? process.env.BLOTATO_API_KEY ?? null;

  const record = async (result: ProbeResult): Promise<string> => {
    const { rows } = await ctx.pool.query<{ id: string }>(
      `insert into capability_probes
         (provider, method, outcome, detail, observed, started_at, completed_at,
          duration_ms, triggered_by, job_id)
       values ($1,'live_api',$2,$3,$4,$5, now(), $6, 'job', $7)
       returning id`,
      [
        provider,
        result.outcome,
        result.detail,
        JSON.stringify(result.observed),
        startedAt,
        Date.now() - startedAt.getTime(),
        job.id,
      ],
    );
    return rows[0]!.id;
  };

  if (!apiKey) {
    /**
     * The credential is absent. This is recorded as a real observation with
     * outcome `unavailable`, and nothing is written to `provider_capabilities`.
     *
     * Writing an all-`no` capability row here would be the single worst thing
     * this handler could do: it would look exactly like a thorough probe that
     * found a limited provider.
     */
    const probeId = await record({
      outcome: 'unavailable',
      detail:
        'BLOTATO_API_KEY is not set, so nothing could be probed. Capability remains unknown rather than unsupported.',
      observed: {},
    });
    ctx.log('capability probe unavailable', { provider, probeId, why: 'no BLOTATO_API_KEY' });
    return;
  }

  const probe = deps.probe ?? liveBlotatoProbe;
  const result = await probe({ provider, apiKey });
  const probeId = await record(result);

  if (result.outcome !== 'confirmed' || !result.capabilities) {
    // Ran and learned nothing. The observation is kept; the belief is untouched,
    // so a failed probe never downgrades a capability verified earlier.
    ctx.log('capability probe learned nothing', {
      provider,
      probeId,
      outcome: result.outcome,
      detail: result.detail,
    });
    return;
  }

  const { rows: existingRows } = await ctx.pool.query<{ capabilities: ProviderCapabilities }>(
    `select capabilities from provider_capabilities where provider = $1`,
    [provider],
  );
  const mergedCapabilities = mergeProviderCapabilities(
    existingRows[0]?.capabilities ?? null,
    result.capabilities,
  );

  const observedAccounts = Array.isArray(result.observed.accounts)
    ? (result.observed.accounts as ObservedProviderAccount[]).filter((account) => account.id)
    : [];
  const accountSync =
    provider === 'blotato' && observedAccounts.length > 0
      ? await syncProviderAccountIds(ctx, observedAccounts)
      : { mapped: 0, unmatched: [] as string[] };

  const pinterestSync =
    provider === 'blotato' && observedAccounts.length > 0
      ? await syncBlotatoPinterestBoards(ctx, apiKey, observedAccounts)
      : { accounts: 0, boards: 0, errors: [] as string[] };

  await ctx.pool.query(
    `insert into provider_capabilities (provider, capabilities, verified_at, probe_id, method)
     values ($1, $2, now(), $3, 'live_api')
     on conflict (provider) do update
       set capabilities = excluded.capabilities,
           verified_at = excluded.verified_at,
           probe_id = excluded.probe_id,
           method = case
             when provider_capabilities.method = 'real_publication' then provider_capabilities.method
             else excluded.method
           end`,
    [provider, JSON.stringify(mergedCapabilities), probeId],
  );

  ctx.log('capability probe recorded', {
    provider,
    probeId,
    outcome: result.outcome,
    detail: result.detail,
    providerAccountsMapped: accountSync.mapped,
    unmatchedAccounts: accountSync.unmatched,
    pinterestAccountsSynced: pinterestSync.accounts,
    pinterestBoardsSynced: pinterestSync.boards,
    pinterestBoardErrors: pinterestSync.errors,
  });
}
