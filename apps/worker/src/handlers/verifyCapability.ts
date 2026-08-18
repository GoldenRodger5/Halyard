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
  type Capability,
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
    const response = await fetch('https://backend.blotato.com/v2/accounts', {
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

    const payload = (await response.json()) as { items?: Array<{ platform?: string }> };
    const seen = new Set(
      (payload.items ?? []).map((item) => String(item.platform ?? '').toLowerCase()),
    );

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
      if (!connected) {
        // No account is a real, checked negative for *this provider*.
        capability.publish = 'no' satisfies Capability;
      }
    }

    return {
      outcome: 'confirmed',
      detail: `Reached the provider and read ${seen.size} connected account(s).`,
      observed: { platforms: [...seen], durationMs: Date.now() - started },
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

  await ctx.pool.query(
    `insert into provider_capabilities (provider, capabilities, verified_at, probe_id, method)
     values ($1, $2, now(), $3, 'live_api')
     on conflict (provider) do update
       set capabilities = excluded.capabilities,
           verified_at = excluded.verified_at,
           probe_id = excluded.probe_id,
           method = excluded.method`,
    [provider, JSON.stringify(result.capabilities), probeId],
  );

  ctx.log('capability probe recorded', {
    provider,
    probeId,
    outcome: result.outcome,
    detail: result.detail,
  });
}
