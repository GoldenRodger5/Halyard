/**
 * Reads for the platform capability layer.
 *
 * Every read here returns a capability *with its provenance*, because a
 * capability shown without how it was learned is indistinguishable from an
 * assumption — which is the whole failure this phase exists to prevent.
 */
import 'server-only';
import {
  resolveCapability,
  policyRefusalFor,
  PLATFORM_STRATEGIES,
  basisBreakdown,
  claimsFor,
  type CapabilityAction,
  type CapabilityObservation,
  type CapabilityResolution,
  type CapabilityState,
  type PlatformCapability,
  type PlatformId,
  type ProviderCapabilities,
} from '@halyard/core';
import { query } from './db';

export interface ProbeRow {
  id: string;
  provider: string;
  outcome: 'confirmed' | 'refuted' | 'unavailable' | 'error';
  detail: string;
  startedAt: Date;
  triggeredBy: string;
}

/**
 * The most recent **transport** probes, so an operator can see the check
 * actually happened.
 *
 * `account_id is null` is the whole point of the filter. Since account-scoped
 * observations exist (`DECISIONS.md` §65), `capability_probes` holds two
 * different kinds of row, and the panel this feeds is headed "Probe the
 * provider" and says "Last probe: …". Without the filter, a comment read on one
 * Instagram account would render as the unified provider's latest result — a
 * scope confusion presented as a fact, which is the failure this whole model
 * exists to prevent.
 *
 * Account-scoped observations are not hidden: they are what each capability
 * row's own verdict and reason are computed from, which is where they belong.
 */
export async function getRecentProbes(limit = 5): Promise<ProbeRow[]> {
  const rows = await query<{
    id: string;
    provider: string;
    outcome: ProbeRow['outcome'];
    detail: string;
    started_at: Date;
    triggered_by: string;
  }>(
    `select id, provider, outcome, detail, started_at, triggered_by
       from capability_probes
      where account_id is null
      order by started_at desc limit $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    outcome: r.outcome,
    detail: r.detail,
    startedAt: new Date(r.started_at),
    triggeredBy: r.triggered_by,
  }));
}

export interface ProviderBelief {
  provider: string;
  capabilities: ProviderCapabilities;
  verifiedAt: Date;
  method: string | null;
  probeId: string | null;
}

export async function getProviderCapabilities(): Promise<ProviderBelief[]> {
  const rows = await query<{
    provider: string;
    capabilities: ProviderCapabilities;
    verified_at: Date;
    method: string | null;
    probe_id: string | null;
  }>(
    `select provider, capabilities, verified_at, method, probe_id
       from provider_capabilities order by provider`,
  );
  return rows.map((r) => ({
    provider: r.provider,
    capabilities: r.capabilities,
    verifiedAt: new Date(r.verified_at),
    method: r.method,
    probeId: r.probe_id,
  }));
}

/**
 * The latest *informative* observation per account and action.
 *
 * `unavailable` and `error` are excluded in the query rather than filtered
 * afterwards, and the distinction matters: a rate limit this morning must not
 * erase a confirmation from last week. It is not counter-evidence, it is the
 * absence of evidence, and the confirmation stands (ageing, and reported as
 * stale once it does) until something actually contradicts it.
 *
 * `distinct on` keyed by account *and* action, because an observation is only
 * ever evidence about the exact question it was made on.
 */
export async function getAccountObservations(
  accountIds: string[],
): Promise<Map<string, CapabilityObservation[]>> {
  const byAccount = new Map<string, CapabilityObservation[]>();
  if (accountIds.length === 0) return byAccount;

  const rows = await query<{
    account_id: string;
    platform: PlatformId;
    action: CapabilityAction;
    outcome: 'confirmed' | 'refuted';
    detail: string;
    started_at: Date;
  }>(
    `select distinct on (account_id, action)
            account_id, platform, action, outcome, detail, started_at
       from capability_probes
      where account_id = any($1)
        and action is not null
        and outcome in ('confirmed', 'refuted')
      order by account_id, action, started_at desc`,
    [accountIds],
  );

  for (const row of rows) {
    const list = byAccount.get(row.account_id) ?? [];
    list.push({
      platform: row.platform,
      action: row.action,
      accountId: row.account_id,
      outcome: row.outcome,
      observedAt: new Date(row.started_at),
      detail: row.detail,
    });
    byAccount.set(row.account_id, list);
  }
  return byAccount;
}

/**
 * The actions surfaced per platform.
 *
 * `read_comments` is here now that an account-scoped observation can actually
 * confirm it. Before that it could only ever have rendered as `declared`, which
 * is a row that tells an operator nothing they can act on.
 */
export const SURFACED_ACTIONS: CapabilityAction[] = [
  'publish',
  'publish_public',
  'video',
  'carousel',
  'alt_text',
  'read_comments',
];

export interface AccountCapabilityView {
  platform: PlatformId;
  accountId: string | null;
  resolutions: CapabilityResolution[];
}

/**
 * Resolve every surfaced action for one account.
 *
 * The resolution is computed here rather than stored, so it cannot drift from
 * the account state, the probe and the policy it is derived from. That is the
 * same reasoning as P1: a stored verdict is a fourth opinion.
 */
export function resolveForAccount(input: {
  platform: PlatformId;
  accountId: string | null;
  accountState: CapabilityState | null;
  transport: PlatformCapability | null;
  provider: string | null;
  transportVerifiedAt: Date | null;
  constraints?: Parameters<typeof resolveCapability>[0]['constraints'];
  /** Account-scoped observations, from `getAccountObservations`. */
  observations?: CapabilityObservation[];
}): AccountCapabilityView {
  return {
    platform: input.platform,
    accountId: input.accountId,
    resolutions: SURFACED_ACTIONS.map((action) =>
      resolveCapability({
        platform: input.platform,
        action,
        constraints: input.constraints ?? null,
        transport: input.transport,
        provider: input.provider,
        transportVerifiedAt: input.transportVerifiedAt,
        accountState: input.accountState,
        accountId: input.accountId,
        // Matched on action here and re-checked inside `resolveCapability`,
        // which discards anything whose platform, action or account differs.
        observation: (input.observations ?? []).find((o) => o.action === action) ?? null,
        policyRefusal: policyRefusalFor(action),
      }),
    ),
  };
}

export interface StrategyView {
  platform: PlatformId;
  discovery: string;
  claims: ReturnType<typeof claimsFor>;
  breakdown: ReturnType<typeof basisBreakdown>;
  preferredFormats: string[];
}

export function strategyView(platform: PlatformId): StrategyView {
  const s = PLATFORM_STRATEGIES[platform];
  return {
    platform,
    discovery: s.discovery,
    claims: claimsFor(platform),
    breakdown: basisBreakdown(platform),
    preferredFormats: s.preferredFormats,
  };
}
