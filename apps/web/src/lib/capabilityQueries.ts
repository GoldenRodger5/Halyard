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

/** The most recent probes, so an operator can see the check actually happened. */
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
       from capability_probes order by started_at desc limit $1`,
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

/** The actions surfaced per platform. Publishing-shaped; engagement is read-only. */
export const SURFACED_ACTIONS: CapabilityAction[] = [
  'publish',
  'publish_public',
  'video',
  'carousel',
  'alt_text',
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
