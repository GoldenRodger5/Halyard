/**
 * The capability model, tested where it decides.
 *
 * The most important tests here are the ones asserting what does **not**
 * happen: an adapter's declaration does not become a green light, a missing
 * probe does not become "unsupported", and a strategy cannot recommend
 * something the account cannot do.
 */
import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_TTL_DAYS,
  isActionable,
  isCapabilityStale,
  resolveCapability,
  VERDICT_LABEL,
  type CapabilityAction,
  type CapabilityResolution,
  type CapabilityVerdict,
} from './capability.js';
import { engagementCapability, policyRefusalFor, PROHIBITED_ACTIONS } from './policy.js';
import {
  basisBreakdown,
  claimsFor,
  PLATFORM_STRATEGIES,
  strategyFor,
  type NormBasis,
} from './strategy.js';
import { X_CONSTRAINTS } from '../adapters/x.js';
import type { PlatformCapability } from '../adapters/unified/capabilities.js';

const DAY = 86_400_000;

function transport(over: Partial<PlatformCapability> = {}): PlatformCapability {
  return {
    platform: 'x',
    publish: 'unknown',
    publishesPublicly: 'unknown',
    carousel: 'unknown',
    video: 'unknown',
    shortVideo: 'unknown',
    altText: 'unknown',
    scheduling: 'unknown',
    metrics: [],
    notes: [],
    ...over,
  };
}

describe('unknown stays unknown', () => {
  it('does not become supported because an adapter exists', () => {
    const r = resolveCapability({
      platform: 'x',
      action: 'scheduling',
      transport: transport({ scheduling: 'unknown' }),
      accountState: 'live',
    });
    expect(r.verdict).toBe('unknown');
    expect(isActionable(r.verdict)).toBe(false);
  });

  it('never turns a missing probe into unsupported', () => {
    // A probe that has not run and a platform that cannot do it are different
    // facts. Collapsing them is how an absent credential becomes a permanent no.
    const r = resolveCapability({ platform: 'x', action: 'carousel', accountState: 'live' });
    expect(r.verdict).not.toBe('unsupported');
  });

  it('reports a declaration as declared, never as verified', () => {
    const r = resolveCapability({
      platform: 'x',
      action: 'publish',
      constraints: X_CONSTRAINTS,
      accountState: 'live',
    });
    expect(r.verdict).toBe('declared');
    // The whole point: a declaration is not permission to act.
    expect(isActionable(r.verdict)).toBe(false);
    expect(r.provenance.method).toBe('adapter_declaration');
  });

  it('only a probe produces verified', () => {
    const r = resolveCapability({
      platform: 'x',
      action: 'publish',
      transport: transport({ publish: 'yes' }),
      provider: 'blotato',
      transportVerifiedAt: new Date(),
      accountState: 'live',
    });
    expect(r.verdict).toBe('verified');
    expect(r.provenance.method).toBe('probe');
    expect(isActionable(r.verdict)).toBe(true);
  });
});

describe('the dimensions resolve in the right order', () => {
  it('policy outranks everything, including a verified probe', () => {
    const r = resolveCapability({
      platform: 'x',
      action: 'publish',
      transport: transport({ publish: 'yes' }),
      accountState: 'live',
      policyRefusal: { reason: 'Halyard never does this.' },
    });
    expect(r.verdict).toBe('policy_prohibited');
    expect(r.provenance.decidedBy).toBe('policy');
  });

  it('an unusable account outranks a working transport', () => {
    for (const [state, expected] of [
      ['error', 'account_unavailable'],
      ['disabled', 'account_unavailable'],
      ['pending_auth', 'auth_required'],
    ] as const) {
      const r = resolveCapability({
        platform: 'x',
        action: 'publish',
        transport: transport({ publish: 'yes' }),
        accountState: state,
      });
      expect(r.verdict, state).toBe(expected);
    }
  });

  it('separates awaiting review from unsupported', () => {
    /**
     * The distinction that has cost this project the most time: every platform
     * except X and Bluesky gates public posting behind a review. That is not
     * the same as being unable to do it.
     */
    const r = resolveCapability({
      platform: 'instagram',
      action: 'publish_public',
      transport: transport({ platform: 'instagram', publishesPublicly: 'unknown' }),
      accountState: 'draft_only',
    });
    expect(r.verdict).toBe('review_required');
    expect(r.verdict).not.toBe('unsupported');
  });

  it('lets a definitive no beat a review gate', () => {
    // Observed failing is stronger information than "awaiting review".
    const r = resolveCapability({
      platform: 'instagram',
      action: 'publish',
      transport: transport({ platform: 'instagram', publish: 'no' }),
      accountState: 'draft_only',
    });
    expect(r.verdict).toBe('unsupported');
  });
});

describe('staleness is reported, never converted', () => {
  it('marks an ageing probe stale without changing the verdict', () => {
    const now = new Date('2026-08-18T00:00:00Z');
    const r = resolveCapability({
      platform: 'x',
      action: 'publish',
      transport: transport({ publish: 'yes' }),
      transportVerifiedAt: new Date(now.getTime() - (CAPABILITY_TTL_DAYS + 1) * DAY),
      accountState: 'live',
      now,
    });
    // Still verified — an ageing yes is not a no.
    expect(r.verdict).toBe('verified');
    expect(r.stale).toBe(true);
  });

  it('treats never-verified as not stale, because there is nothing to age', () => {
    expect(isCapabilityStale(null)).toBe(false);
  });
});

describe('every verdict is renderable and explained', () => {
  it('has a label for each', () => {
    const verdicts: CapabilityVerdict[] = [
      'verified',
      'declared',
      'unsupported',
      'unknown',
      'auth_required',
      'review_required',
      'account_unavailable',
      'policy_prohibited',
    ];
    for (const v of verdicts) expect(VERDICT_LABEL[v], v).toBeTruthy();
  });

  it('never returns a verdict without a reason', () => {
    const r = resolveCapability({ platform: 'x', action: 'publish' });
    expect(r.reason.length).toBeGreaterThan(10);
  });
});

describe('policy, and the engagement rule', () => {
  it('refuses the write-shaped engagement actions permanently', () => {
    for (const action of ['auto_reply', 'auto_dm', 'auto_follow', 'engagement_automation']) {
      expect(policyRefusalFor(action), action).not.toBeNull();
    }
    expect(Object.keys(PROHIBITED_ACTIONS).length).toBeGreaterThanOrEqual(4);
  });

  it('models engagement as read-only, with no write field to find', () => {
    const capability = engagementCapability({
      readsComments: true,
      readsMentions: false,
      readsThreads: false,
      notes: [],
    });
    expect(capability.writesDisabledBy).toBe('product_policy');
    // The absence is the assertion: nothing here can send anything.
    expect(Object.keys(capability)).not.toContain('canReply');
    expect(Object.keys(capability)).not.toContain('canSend');
  });

  it('does not refuse ordinary publishing capabilities', () => {
    for (const action of ['publish', 'video', 'carousel'] as CapabilityAction[]) {
      expect(policyRefusalFor(action), action).toBeNull();
    }
  });
});

describe('strategy consumes capability and cannot route around it', () => {
  const caps = (entries: Array<[CapabilityAction, CapabilityVerdict]>) =>
    new Map<CapabilityAction, CapabilityResolution>(
      entries.map(([action, verdict]) => [
        action,
        {
          platform: 'tiktok',
          action,
          verdict,
          reason: `stubbed ${verdict}`,
          stale: false,
          provenance: {
            decidedBy: 'none',
            method: 'absent',
            verifiedAt: null,
            provider: null,
            accountId: null,
          },
        },
      ]),
    );

  it('withholds a format whose capability is only declared', () => {
    const result = strategyFor('tiktok', caps([['video', 'declared']]));
    expect(result.recommended).toEqual([]);
    expect(result.withheld[0]!.format).toBe('video');
  });

  it('withholds on unknown rather than recommending optimistically', () => {
    const result = strategyFor('tiktok', caps([['video', 'unknown']]));
    expect(result.recommended).toEqual([]);
  });

  it('withholds when no capability was resolved at all', () => {
    // A missing entry must fail closed, like everything else here.
    const result = strategyFor('tiktok', new Map());
    expect(result.recommended).toEqual([]);
    expect(result.withheld[0]!.reason).toContain('No capability has been resolved');
  });

  it('recommends only what was verified', () => {
    const result = strategyFor('tiktok', caps([['video', 'verified']]));
    expect(result.recommended.map((r) => r.format)).toEqual(['video']);
  });

  it('carries the capability reason through, so a gap is explained', () => {
    const result = strategyFor('tiktok', caps([['video', 'review_required']]));
    expect(result.withheld[0]!.reason).toBe('stubbed review_required');
  });
});

describe('strategic claims never masquerade as measurements', () => {
  it('has a basis on every claim', () => {
    for (const platform of Object.keys(PLATFORM_STRATEGIES) as Array<
      keyof typeof PLATFORM_STRATEGIES
    >) {
      for (const claim of claimsFor(platform)) {
        expect(['platform_fact', 'industry_heuristic', 'halyard_empirical']).toContain(claim.basis);
        expect(claim.why.length, `${platform}/${claim.claim}`).toBeGreaterThan(10);
      }
    }
  });

  it('claims nothing as measured by Halyard, because nothing has been published', () => {
    /**
     * The implementation plan forbids inventing best practices as measured
     * facts. Halyard has published zero posts, so a `halyard_empirical` claim
     * would be a fabrication by definition. When one legitimately appears it
     * will be because a scorer produced it, and this test will need changing
     * deliberately.
     */
    for (const platform of Object.keys(PLATFORM_STRATEGIES) as Array<
      keyof typeof PLATFORM_STRATEGIES
    >) {
      const breakdown: Record<NormBasis, number> = basisBreakdown(platform);
      expect(breakdown.halyard_empirical, platform).toBe(0);
    }
  });

  it('covers every platform that has an adapter', () => {
    // Reddit is named in the architecture and deliberately absent: no adapter,
    // no account, no route to publish. A strategy for an unreachable platform
    // would be advice nothing can act on.
    expect(Object.keys(PLATFORM_STRATEGIES).sort()).toEqual(
      ['bluesky', 'instagram', 'pinterest', 'threads', 'tiktok', 'x', 'youtube'].sort(),
    );
  });
});
