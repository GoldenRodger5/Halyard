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
  CAPABILITY_ACTIONS,
  CAPABILITY_TTL_DAYS,
  isActionable,
  isCapabilityStale,
  OBSERVATION_INTERVAL_HOURS,
  resolveCapability,
  shouldRecordObservation,
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
import { INSTAGRAM_CONSTRAINTS } from '../adapters/instagram.js';
import { THREADS_CONSTRAINTS } from '../adapters/threads.js';
import { adapterDeclares, declarationEvidence } from './declared.js';
import { allAdapters } from '../adapters/index.js';
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

/**
 * Meta coverage — Instagram and Threads.
 *
 * The point of these is what stays *out* of reach. Meta's dashboard advertises
 * publishing, comment replies, DMs and insights; none of that makes an
 * operation actionable in Halyard. Every assertion below is derived from what
 * the adapters implement, not from provider marketing.
 */
describe('Meta capability coverage', () => {
  const IG = 'instagram' as const;
  const TH = 'threads' as const;

  /** A confirmed, live account, so account state is never the blocker. */
  const live = { accountState: 'live' as const, now: new Date() };

  it('never makes an adapter declaration actionable on its own', () => {
    for (const platform of [IG, TH]) {
      for (const action of ['publish', 'carousel', 'video', 'alt_text', 'read_comments'] as CapabilityAction[]) {
        const r = resolveCapability({ platform, action, ...live });
        expect(r.verdict, `${platform}/${action}`).toBe('declared');
        // The rule the whole model exists for.
        expect(isActionable(r.verdict), `${platform}/${action}`).toBe(false);
      }
    }
  });

  it('declares only what the adapters actually implement', () => {
    // Read out of instagram.ts / threads.ts, not from Meta's documentation.
    for (const platform of [IG, TH]) {
      expect(adapterDeclares(platform, 'read_comments')).toBe(true);
      expect(declarationEvidence(platform, 'read_comments')).toContain('listComments');
      expect(adapterDeclares(platform, 'alt_text')).toBe(true);
    }
  });

  it('leaves operations Halyard has not built as unknown', () => {
    /**
     * Meta's Graph API exposes mentions, and Halyard has no method for them.
     * `unknown` is the honest answer; `unsupported` would blame the platform
     * for our gap, and `declared` would be a lie.
     */
    for (const platform of [IG, TH]) {
      for (const action of ['read_mentions', 'scheduling'] as CapabilityAction[]) {
        const r = resolveCapability({ platform, action, ...live });
        expect(r.verdict, `${platform}/${action}`).toBe('unknown');
        expect(isActionable(r.verdict)).toBe(false);
      }
      expect(adapterDeclares(platform, 'read_mentions')).toBe(false);
    }

    /*
     * §200. `short_video` used to be asserted here for both, and it was wrong
     * for Instagram: every video container it builds is `media_type: 'REELS'`,
     * and has been since the adapter was written. The assertion passed because
     * the declaration was missing, so the test was confirming an omission
     * rather than a fact.
     *
     * Threads is genuinely still absent — it sends `media_type: 'VIDEO'`, which
     * is a video post and not a short-form product.
     */
    expect(adapterDeclares(TH, 'short_video')).toBe(false);
    expect(resolveCapability({ platform: TH, action: 'short_video', ...live }).verdict).toBe(
      'unknown',
    );
    expect(adapterDeclares(IG, 'short_video')).toBe(true);
  });

  it('keeps public posting behind the platform review both platforms require', () => {
    for (const platform of [IG, TH]) {
      const r = resolveCapability({
        platform,
        action: 'publish_public',
        constraints: platform === IG ? INSTAGRAM_CONSTRAINTS : THREADS_CONSTRAINTS,
        accountState: 'draft_only',
      });
      expect(r.verdict, platform).toBe('review_required');
      expect(isActionable(r.verdict)).toBe(false);
    }
  });

  it('still refuses when the account is not usable, whatever the adapter implements', () => {
    for (const [state, expected] of [
      ['pending_auth', 'auth_required'],
      ['error', 'account_unavailable'],
      ['disabled', 'account_unavailable'],
    ] as const) {
      const r = resolveCapability({ platform: IG, action: 'read_comments', accountState: state });
      expect(r.verdict, state).toBe(expected);
    }
  });

  it('becomes actionable only once a probe has observed it', () => {
    const r = resolveCapability({
      platform: IG,
      action: 'publish',
      transport: {
        platform: 'instagram',
        publish: 'yes',
        publishesPublicly: 'unknown',
        carousel: 'unknown',
        video: 'unknown',
        shortVideo: 'unknown',
        altText: 'unknown',
        scheduling: 'unknown',
        metrics: [],
        notes: [],
      },
      provider: 'blotato',
      transportVerifiedAt: new Date(),
      ...live,
    });
    expect(r.verdict).toBe('verified');
    expect(isActionable(r.verdict)).toBe(true);
  });

  it('leaves X behaviour unchanged', () => {
    // Regression guard: the declaration layer must not alter another platform.
    const declared = resolveCapability({
      platform: 'x',
      action: 'publish',
      constraints: X_CONSTRAINTS,
      ...live,
    });
    expect(declared.verdict).toBe('declared');
    /**
     * This line used to read `expect(adapterDeclares('x','read_comments')).toBe(false)`,
     * and it was wrong. `x.ts` has implemented `listComments` all along; the
     * declaration table was written against Instagram and Threads only, so X
     * resolved to `unknown` for something the code plainly does. The assertion
     * was a snapshot of that omission rather than an invariant, and it is what
     * kept the omission from being noticed.
     *
     * The invariant this test actually protects — adding declarations for one
     * platform does not change another platform's verdict — is the assertion
     * above. What X declares is now checked against `x.ts` itself, in
     * "adapter declarations match the adapters".
     */
    expect(adapterDeclares('x', 'read_comments')).toBe(true);
    expect(declarationEvidence('x', 'read_comments')).toMatch(/^x\.ts#listComments/);
  });

  it('models no writing engagement action at all', () => {
    // Meta advertises comment replies and DMs. Neither is a capability action,
    // and policy refuses them outright — asserted so a future pass cannot add
    // one without this failing first.
    for (const forbidden of ['respond_comments', 'read_dms', 'send_dms', 'insights']) {
      expect(CAPABILITY_ACTIONS).not.toContain(forbidden as CapabilityAction);
    }
    expect(policyRefusalFor('auto_reply')).not.toBeNull();
    expect(policyRefusalFor('auto_dm')).not.toBeNull();
  });
});


/**
 * The granted → verified boundary, which is the last one and the easiest to
 * cross by accident.
 *
 * On 2026-08-19 Meta confirmed `instagram_manage_comments` is granted for
 * @recipe.fix, and the adapter implements `listComments`. Neither fact — nor
 * both together — is evidence that reading comments works. Only a probe that
 * watched it happen is, and that probe could not run: the account has no media
 * objects, so there was nothing to read comments from.
 */
describe('a granted scope is not verification', () => {
  it('leaves read_comments non-actionable despite the grant and the implementation', () => {
    const r = resolveCapability({
      platform: 'instagram',
      action: 'read_comments',
      accountState: 'draft_only',
    });
    // The adapter implements listComments, so this is honestly `declared`...
    expect(r.verdict).toBe('declared');
    // ...and `declared` is still not permission to act.
    expect(isActionable(r.verdict)).toBe(false);
  });

  it('only a transport observation promotes it', () => {
    const observed = resolveCapability({
      platform: 'instagram',
      action: 'read_comments',
      transport: {
        platform: 'instagram',
        publish: 'unknown', publishesPublicly: 'unknown', carousel: 'unknown',
        video: 'unknown', shortVideo: 'unknown', altText: 'unknown',
        scheduling: 'unknown', metrics: [], notes: [],
      },
      provider: 'probe',
      transportVerifiedAt: new Date(),
      accountState: 'live',
    });
    /**
     * `read_comments` has no field in `PlatformCapability`, so even a probe
     * result cannot currently promote it — the transport model covers
     * publishing shapes only. Recording that here so the gap is a known
     * limitation rather than a surprise when someone tries to verify it.
     */
    expect(isActionable(observed.verdict)).toBe(false);
  });
});

/**
 * Account-scoped observations, which are how an engagement read reaches
 * `verified` at all.
 *
 * Before these existed, `read_comments` had no field in `TRANSPORT_FIELD` and
 * could never rise above `declared` whatever was observed. Every test here is
 * about a way that could go wrong in the direction of permission.
 */
describe('account-scoped capability observations', () => {
  const observation = (
    over: Partial<import('./capability.js').CapabilityObservation> = {},
  ): import('./capability.js').CapabilityObservation => ({
    platform: 'instagram',
    action: 'read_comments',
    accountId: 'acc-1',
    outcome: 'confirmed',
    observedAt: new Date(),
    ...over,
  });

  const resolve = (
    over: Partial<Parameters<typeof resolveCapability>[0]> = {},
  ): CapabilityResolution =>
    resolveCapability({
      platform: 'instagram',
      action: 'read_comments',
      accountState: 'draft_only',
      accountId: 'acc-1',
      ...over,
    });

  it('lets a confirmed read reach verified, which nothing else could', async () => {
    const before = resolve();
    // The state the gap left it in: implemented, never confirmed.
    expect(before.verdict).toBe('declared');

    const after = resolve({ observation: observation() });
    expect(after.verdict).toBe('verified');
    expect(after.provenance.decidedBy).toBe('account');
    expect(after.provenance.method).toBe('probe');
    expect(after.provenance.accountId).toBe('acc-1');
  });

  it('records a refuted read as unsupported', () => {
    const out = resolve({ observation: observation({ outcome: 'refuted' }) });
    expect(out.verdict).toBe('unsupported');
    expect(isActionable(out.verdict)).toBe(false);
  });

  it('ignores a probe that could not run, in both directions', () => {
    /**
     * The single most important assertion here. `unavailable` and `error` mean
     * the probe proved nothing — they must neither promote the capability nor
     * harden into "not supported", which is indistinguishable downstream from a
     * platform that genuinely cannot do it.
     */
    for (const outcome of ['unavailable', 'error'] as const) {
      const out = resolve({ observation: observation({ outcome }) });
      expect(out.verdict).toBe('declared');
      expect(out.provenance.method).not.toBe('probe');
    }
  });

  it('will not let one account vouch for another', () => {
    // The widening this model exists to prevent: an observation from a
    // different account is evidence about something else, not weaker evidence.
    const out = resolve({
      accountId: 'acc-2',
      observation: observation({ accountId: 'acc-1' }),
    });
    expect(out.verdict).toBe('declared');
  });

  it('will not let a transport-wide observation stand in for an account', () => {
    const out = resolve({ observation: observation({ accountId: null }) });
    expect(out.verdict).toBe('declared');
  });

  it('will not let an observation of one action answer for another', () => {
    const out = resolve({
      action: 'read_mentions',
      observation: observation({ action: 'read_comments' }),
    });
    expect(out.verdict).not.toBe('verified');
  });

  it('will not let an observation of one platform answer for another', () => {
    const out = resolve({
      platform: 'threads',
      observation: observation({ platform: 'instagram' }),
    });
    expect(out.verdict).not.toBe('verified');
  });

  it('does not let a confirmed publish bypass a platform review', () => {
    /**
     * The ordering that matters. A probe watching a *draft* be created is a
     * real confirmed observation of `publish` — and must not promote an account
     * whose public posting is still behind a review the platform has not
     * granted.
     */
    const out = resolve({
      action: 'publish_public',
      accountState: 'draft_only',
      observation: observation({ action: 'publish_public', outcome: 'confirmed' }),
    });
    expect(out.verdict).toBe('review_required');
  });

  it('does not let an observation revive an account with no credential', () => {
    // Account lifecycle outranks any observation: whatever was true last week,
    // an account with no token cannot do it now.
    const out = resolve({
      accountState: 'pending_auth',
      observation: observation({ outcome: 'confirmed' }),
    });
    expect(out.verdict).toBe('auth_required');
  });

  it('does not let an observation outrank a policy refusal', () => {
    const out = resolve({
      observation: observation({ outcome: 'confirmed' }),
      policyRefusal: { reason: 'Halyard never does this.' },
    });
    expect(out.verdict).toBe('policy_prohibited');
  });

  it('reports an ageing observation as stale rather than downgrading it', () => {
    const old = new Date(Date.now() - (CAPABILITY_TTL_DAYS + 1) * DAY);
    const out = resolve({ observation: observation({ observedAt: old }) });
    expect(out.verdict).toBe('verified');
    expect(out.stale).toBe(true);
  });
});

describe('when a steady-state observation is worth recording again', () => {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

  it('records the first one', () => {
    expect(shouldRecordObservation(null, { outcome: 'confirmed' })).toBe(true);
  });

  it('records a change immediately, whatever the interval', () => {
    // The transition is the alert. Delaying it to keep the table tidy would
    // trade the only thing worth having for the thing that does not matter.
    expect(
      shouldRecordObservation(
        { outcome: 'confirmed', observedAt: hoursAgo(0.1) },
        { outcome: 'refuted' },
      ),
    ).toBe(true);
  });

  it('does not repeat an unchanged outcome within the interval', () => {
    // `collect_comments` polls a fresh publication fifteen times in a day.
    expect(
      shouldRecordObservation(
        { outcome: 'confirmed', observedAt: hoursAgo(1) },
        { outcome: 'confirmed' },
      ),
    ).toBe(false);
  });

  it('refreshes an unchanged outcome once the interval has passed', () => {
    expect(
      shouldRecordObservation(
        { outcome: 'confirmed', observedAt: hoursAgo(OBSERVATION_INTERVAL_HOURS + 1) },
        { outcome: 'confirmed' },
      ),
    ).toBe(true);
  });
});

/**
 * The declaration table, checked against the adapters rather than against
 * itself.
 *
 * `ADAPTER_DECLARED` is hand-written, and it was written against two adapters.
 * X, YouTube and Bluesky all implement `listComments` and were missing from it
 * entirely, so `read_comments` resolved to `unknown` on three platforms that
 * plainly have the code — which `declared.ts` opens by warning against, and
 * then did.
 *
 * Nothing caught it because nothing compared the table to the thing it
 * describes. These tests derive the truth from the adapter objects for every
 * action that maps to a method, which is the only class of claim a test can
 * check structurally — `carousel` and `alt_text` live inside `publish` and
 * cannot be seen from outside.
 */
describe('adapter declarations match the adapters', () => {
  const METHOD_FOR: Partial<Record<CapabilityAction, string>> = {
    read_comments: 'listComments',
  };

  for (const adapter of allAdapters()) {
    for (const [action, method] of Object.entries(METHOD_FOR)) {
      it(`${adapter.platform}: read_comments is declared exactly when ${method} exists`, () => {
        const implemented =
          typeof (adapter as unknown as Record<string, unknown>)[method] === 'function';
        expect(
          adapterDeclares(adapter.platform, action as CapabilityAction),
          implemented
            ? `${adapter.platform} implements ${method} but ADAPTER_DECLARED does not say so, so ${action} resolves to unknown`
            : `${adapter.platform} declares ${action} but has no ${method}, which is a claim the code cannot support`,
        ).toBe(implemented);
      });
    }
  }

  it('points every declaration at its own adapter file', () => {
    // A copy-paste that leaves the wrong filename behind makes the evidence
    // trail useless in exactly the way that is hardest to notice.
    for (const adapter of allAdapters()) {
      for (const action of CAPABILITY_ACTIONS) {
        const evidence = declarationEvidence(adapter.platform, action);
        if (!evidence) continue;
        expect(evidence, `${adapter.platform}.${action}`).toMatch(
          new RegExp(`^${adapter.platform}\\.ts#`),
        );
      }
    }
  });

  it('declares nothing that policy forbids', () => {
    // A declaration for a prohibited action would reopen a closed safety
    // decision by the back door: `halyardDeclares` runs after the policy check,
    // but the entry existing at all invites someone to move it.
    for (const adapter of allAdapters()) {
      for (const action of Object.keys(PROHIBITED_ACTIONS)) {
        expect(
          declarationEvidence(adapter.platform, action as unknown as CapabilityAction),
          `${adapter.platform} declares the prohibited action ${action}`,
        ).toBeNull();
      }
    }
  });
});

/**
 * §199/§200. Declarations that no method name can derive.
 *
 * The suite already checks every action that maps one-to-one onto an adapter
 * method, which is how the `read_comments` drift was caught. `short_video` and
 * `scheduling` map to no method — they are properties of what `publish` sends —
 * so nothing compared them to reality, and both were wrong in opposite
 * directions: Instagram builds Reels containers and said it did not, YouTube
 * schedules through the platform and said nothing at all.
 *
 * These assert the specific request shape rather than the declaration, so the
 * test fails if the *code* changes rather than if the table does.
 */
describe('declarations that are not derivable from a method name', () => {
  it('Instagram declares short_video, and sends REELS', async () => {
    const { adapterDeclares } = await import('./declared.js');
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../adapters/instagram.ts', import.meta.url), 'utf8'),
    );
    expect(source).toContain("media_type: 'REELS'");
    expect(adapterDeclares('instagram', 'short_video')).toBe(true);
  });

  it('YouTube declares scheduling, and sets publishAt', async () => {
    const { adapterDeclares } = await import('./declared.js');
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../adapters/youtube.ts', import.meta.url), 'utf8'),
    );
    expect(source).toContain('publishAt');
    expect(adapterDeclares('youtube', 'scheduling')).toBe(true);
    expect(adapterDeclares('youtube', 'short_video')).toBe(true);
  });

  it('does not claim scheduling for platforms Halyard queues itself', async () => {
    const { adapterDeclares } = await import('./declared.js');
    for (const platform of ['x', 'threads', 'instagram', 'tiktok', 'pinterest'] as const) {
      expect(adapterDeclares(platform, 'scheduling')).toBe(false);
    }
  });
});
