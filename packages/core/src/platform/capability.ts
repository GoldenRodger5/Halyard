/**
 * The canonical platform capability model.
 *
 * ## Why this file exists rather than a third vocabulary
 *
 * Two capability words already existed in this repository and both were right
 * about different things:
 *
 * | Existing | Means | Stays |
 * |---|---|---|
 * | `CapabilityState` (`pending_auth`/`draft_only`/`live`/`error`/`disabled`) | **account lifecycle** — where one connected account is in authentication and review | unchanged |
 * | `Capability` (`yes`/`no`/`unknown`) | **transport observation** — what a probe watched a provider do | unchanged |
 *
 * Neither is replaced. What was missing is the thing that reads both, plus the
 * platform's own limits and Halyard's own policy, and answers the only question
 * a caller actually has:
 *
 *   > Can this account do this, right now, and how do we know?
 *
 * So this is a **resolution**, not a new source of truth. `resolveCapability`
 * has no store behind it; it is a pure function over evidence other systems own.
 * That is the same arrangement as P1's `deriveFactStatus`, and for the same
 * reason: the moment a resolver gets its own mutable state, it becomes a fourth
 * opinion that can drift from the three it was meant to reconcile.
 *
 * ## The five dimensions, kept separate on purpose
 *
 * A. **platform** — what the platform supports at all (`PlatformConstraints`)
 * B. **transport** — what this provider/adapter can perform (`PlatformCapability`)
 * C. **account** — what this connected account can do now (`CapabilityState`, review)
 * D. **policy** — what Halyard permits itself to do (`platform/policy.ts`)
 * E. **verification** — whether anything has actually watched it happen
 *
 * Collapsing these into one boolean is what produces capability theatre: a green
 * tick that means "an adapter exists" reads identically to one that means "we
 * saw it work".
 */
import type { PlatformId } from '../adapters/types.js';
import type { CapabilityState, PlatformConstraints } from '../adapters/types.js';
import type { Capability, PlatformCapability } from '../adapters/unified/capabilities.js';
import { adapterDeclares } from './declared.js';

/**
 * The actions capability is resolved for.
 *
 * Deliberately small and publishing-shaped. Engagement actions appear here as
 * **read** capabilities only — see `platform/policy.ts` for why nothing that
 * writes engagement exists in this system at all.
 */
export const CAPABILITY_ACTIONS = [
  'publish',
  'publish_public',
  'carousel',
  'video',
  'short_video',
  'alt_text',
  'scheduling',
  'read_comments',
  'read_mentions',
] as const;

export type CapabilityAction = (typeof CAPABILITY_ACTIONS)[number];

/**
 * One verdict, covering every state the UI must be able to tell apart.
 *
 * `declared` and `verified` are separate and the distinction is the point of
 * the whole model. `declared` means an adapter says it can; `verified` means
 * something watched it happen. A system that renders those the same way will
 * eventually publish on the strength of a sentence in a vendor's documentation.
 */
export type CapabilityVerdict =
  /** A probe observed this working, against a real account. */
  | 'verified'
  /** An adapter declares it. Nothing has confirmed it. Not proof. */
  | 'declared'
  /** Something authoritative says no. */
  | 'unsupported'
  /** Nothing knows. The honest default, and never an implicit yes. */
  | 'unknown'
  /** The account exists but has no usable credential. */
  | 'auth_required'
  /** Blocked behind a platform review, not behind anything Halyard controls. */
  | 'review_required'
  /** The account is errored or switched off. */
  | 'account_unavailable'
  /** Halyard forbids itself this, whatever the platform allows. */
  | 'policy_prohibited';

/** Verdicts a caller may act on. Everything else is a reason to stop. */
export const ACTIONABLE_VERDICTS: ReadonlySet<CapabilityVerdict> = new Set<CapabilityVerdict>([
  'verified',
]);

/**
 * Whether a verdict permits Halyard to actually do the thing.
 *
 * Only `verified`. `declared` deliberately does **not** pass: an adapter's own
 * claim about itself is the weakest evidence in the system, and the existing
 * `canPublish` already refuses to publish on `unknown` for exactly this reason.
 * Callers that legitimately need to proceed on a declaration must say so
 * explicitly rather than getting it by default.
 */
export function isActionable(verdict: CapabilityVerdict): boolean {
  return ACTIONABLE_VERDICTS.has(verdict);
}

export interface CapabilityProvenance {
  /** Which dimension decided this. */
  decidedBy: 'policy' | 'account' | 'platform' | 'transport' | 'none';
  /** How the deciding evidence was obtained. */
  method: 'probe' | 'adapter_declaration' | 'platform_constraint' | 'account_state' | 'product_policy' | 'absent';
  /** When the deciding evidence was observed, when that is knowable. */
  verifiedAt: Date | null;
  /** Provider scope, when a transport decided it. */
  provider: string | null;
  /** Account scope, when an account decided it. */
  accountId: string | null;
}

export interface CapabilityResolution {
  platform: PlatformId;
  action: CapabilityAction;
  verdict: CapabilityVerdict;
  /** One sentence an operator can act on. Never a bare colour. */
  reason: string;
  provenance: CapabilityProvenance;
  /** True when the deciding evidence is old enough to distrust. */
  stale: boolean;
}

export interface CapabilityInputs {
  platform: PlatformId;
  action: CapabilityAction;
  /** A — what the platform itself allows. */
  constraints?: PlatformConstraints | null;
  /** B/E — what a probe observed for this transport, if any. */
  transport?: PlatformCapability | null;
  /** Which provider the transport observation belongs to. */
  provider?: string | null;
  /** When that transport observation was made. */
  transportVerifiedAt?: Date | null;
  /** C — the connected account's lifecycle state. */
  accountState?: CapabilityState | null;
  accountId?: string | null;
  /**
   * B/E — the latest observation scoped to *this account*, if any.
   *
   * Stronger evidence than the transport observation for this account, and the
   * only route by which an engagement read can reach `verified`. Discarded
   * unless it matches platform, action and account exactly.
   */
  observation?: CapabilityObservation | null;
  /** D — a product-policy refusal, when one applies. */
  policyRefusal?: { reason: string } | null;
  now?: Date;
}

/**
 * One observation, scoped to the account it was made on.
 *
 * ## Why this is separate from `transport`
 *
 * `PlatformCapability` describes what a **transport** can do — a fact about a
 * provider, equally true for everyone using it. Engagement reads are not that
 * shape. Whether Halyard can read the comments on a post depends on which
 * permissions *that account* granted, whether its token still carries them, and
 * whether the platform approved this app for it. @recipe.fix succeeding proves
 * nothing about any other account.
 *
 * Before this existed, `read_comments` and `read_mentions` had no field in
 * `TRANSPORT_FIELD` at all, so they could never rise above `declared` no matter
 * what was observed. The gap was recorded rather than hidden; this is the
 * smallest extension that closes it, and it adds no new vocabulary — `outcome`
 * is the same four words `capability_probes.outcome` already stores.
 */
export interface CapabilityObservation {
  platform: PlatformId;
  action: CapabilityAction;
  /** Null for a transport-wide observation. Never treated as a wildcard. */
  accountId: string | null;
  /** What happened to the probe, not what the capability is. */
  outcome: 'confirmed' | 'refuted' | 'unavailable' | 'error';
  observedAt: Date | null;
  detail?: string;
}

/**
 * Whether an observation is evidence about *this* question.
 *
 * Strict on every axis, including the account. An observation carrying a
 * different account id, or none when one was asked about, is discarded rather
 * than generalised — the widening it would otherwise perform ("one account
 * could, so the platform can") is the exact failure this model exists to
 * prevent, and it fails silently in the direction of permission.
 */
export function observationApplies(
  observation: CapabilityObservation,
  input: { platform: PlatformId; action: CapabilityAction; accountId?: string | null },
): boolean {
  if (observation.platform !== input.platform) return false;
  if (observation.action !== input.action) return false;
  return (observation.accountId ?? null) === (input.accountId ?? null);
}

/**
 * Outcomes that carry information about the capability.
 *
 * `unavailable` and `error` are deliberately absent. A probe that could not run
 * proves nothing, and letting either one participate is how a missing
 * credential hardens into "not supported" — or, worse in the other direction,
 * how a failed probe gets counted as an attempt that must have worked.
 */
const INFORMATIVE_OUTCOMES: ReadonlySet<CapabilityObservation['outcome']> = new Set([
  'confirmed',
  'refuted',
]);

export function observationIsInformative(observation: CapabilityObservation): boolean {
  return INFORMATIVE_OUTCOMES.has(observation.outcome);
}

/**
 * How long between recording the same steady-state observation again.
 *
 * `collect_comments` polls a fresh publication fifteen times in its first day.
 * Recording an observation on every poll would bury a genuine change in
 * hundreds of identical rows, and append-only evidence is only useful if you
 * can still read it. Six hours keeps roughly four rows a day per account.
 *
 * A *changed* outcome is always recorded immediately, whatever the interval —
 * the transition is the alert, and delaying it to keep the table tidy would
 * trade the only thing worth having for the thing that does not matter.
 */
export const OBSERVATION_INTERVAL_HOURS = 6;

/**
 * Whether a new observation is worth storing.
 *
 * Returns true when nothing has been observed before, when the outcome differs
 * from the last one, or when the last one is old enough to be worth refreshing.
 */
export function shouldRecordObservation(
  last: { outcome: CapabilityObservation['outcome']; observedAt: Date } | null,
  next: Pick<CapabilityObservation, 'outcome'>,
  now: Date = new Date(),
): boolean {
  if (!last) return true;
  if (last.outcome !== next.outcome) return true;
  return (now.getTime() - last.observedAt.getTime()) / 3_600_000 >= OBSERVATION_INTERVAL_HOURS;
}

/**
 * How long a probe result is trusted before it is treated as ageing.
 *
 * The same fourteen days the feature inventory uses, and for the same reason:
 * platforms change their APIs without announcing it, and a capability confirmed
 * a month ago is a guess wearing a timestamp. Staleness is *reported*, never
 * silently converted into `unsupported` — an ageing yes and a no are different
 * facts.
 */
export const CAPABILITY_TTL_DAYS = 14;

export function isCapabilityStale(verifiedAt: Date | null, now: Date = new Date()): boolean {
  if (!verifiedAt) return false;
  return (now.getTime() - verifiedAt.getTime()) / 86_400_000 >= CAPABILITY_TTL_DAYS;
}

/** Which `PlatformCapability` field answers each action, where one does. */
const TRANSPORT_FIELD: Partial<Record<CapabilityAction, keyof PlatformCapability>> = {
  publish: 'publish',
  publish_public: 'publishesPublicly',
  carousel: 'carousel',
  video: 'video',
  short_video: 'shortVideo',
  alt_text: 'altText',
  scheduling: 'scheduling',
};

/**
 * Whether the action is supported, from the platform's constraints.
 *
 * `null` means the constraints say nothing — which is not a no, and is why the
 * caller falls through to the adapter declaration rather than to `unsupported`.
 */
function platformSupports(
  action: CapabilityAction,
  constraints: PlatformConstraints,
): boolean | null {
  switch (action) {
    case 'carousel':
      return constraints.carousel !== undefined;
    case 'video':
      return constraints.video !== undefined;
    case 'publish':
    case 'publish_public':
      return constraints.supportedFormats.length > 0;
    default:
      // The constraints file says nothing about this action. That is not a no.
      return null;
  }
}

/**
 * Whether anything in Halyard claims this action for this platform.
 *
 * Constraints answer for content shape; `ADAPTER_DECLARED` answers for the
 * operations an adapter actually implements — reading comments, carrying alt
 * text. Neither is verification, and both only ever produce `declared`.
 *
 * `short_video` deliberately no longer follows `video`: a platform accepting
 * video says nothing about whether Halyard can publish a Reel or a Short, which
 * are separate container types nothing here builds.
 */
function halyardDeclares(
  platform: PlatformId,
  action: CapabilityAction,
  constraints: PlatformConstraints | null | undefined,
): boolean {
  if (constraints && platformSupports(action, constraints) === true) return true;
  return adapterDeclares(platform, action);
}

/**
 * Resolve one capability, from every dimension, in priority order.
 *
 * The order is the argument. Policy first because a product rule outranks a
 * technical possibility; account state next because a working adapter is
 * irrelevant on an account with no token; and verification last, so that
 * "nothing has checked" can never be reached by a path that had a real answer
 * available.
 */
export function resolveCapability(input: CapabilityInputs): CapabilityResolution {
  const now = input.now ?? new Date();
  const base = { platform: input.platform, action: input.action };

  const make = (
    verdict: CapabilityVerdict,
    reason: string,
    provenance: Partial<CapabilityProvenance>,
    verifiedAt: Date | null = null,
  ): CapabilityResolution => ({
    ...base,
    verdict,
    reason,
    provenance: {
      decidedBy: 'none',
      method: 'absent',
      verifiedAt,
      provider: input.provider ?? null,
      accountId: input.accountId ?? null,
      ...provenance,
    },
    stale: isCapabilityStale(verifiedAt, now),
  });

  // ── D. Product policy ────────────────────────────────────────────────────
  // First, because what Halyard forbids itself does not become permitted by a
  // platform supporting it.
  if (input.policyRefusal) {
    return make('policy_prohibited', input.policyRefusal.reason, {
      decidedBy: 'policy',
      method: 'product_policy',
    });
  }

  // ── C. Account lifecycle ─────────────────────────────────────────────────
  const state = input.accountState;
  if (state === 'disabled' || state === 'error') {
    return make(
      'account_unavailable',
      state === 'error'
        ? 'The account is in an error state — usually a credential that stopped working. Reconnect it on /accounts.'
        : 'The account is switched off.',
      { decidedBy: 'account', method: 'account_state' },
    );
  }
  if (state === 'pending_auth') {
    return make('auth_required', 'The account has no usable credential yet.', {
      decidedBy: 'account',
      method: 'account_state',
    });
  }

  // ── A. Platform limits ───────────────────────────────────────────────────
  if (input.constraints) {
    const supported = platformSupports(input.action, input.constraints);
    if (supported === false) {
      return make('unsupported', `${input.platform} does not support ${input.action}.`, {
        decidedBy: 'platform',
        method: 'platform_constraint',
      });
    }
  }

  // ── B/E. Observations ────────────────────────────────────────────────────
  /**
   * The account-scoped observation, kept only if it is about this exact
   * question. A mismatch is not weaker evidence, it is evidence about something
   * else, and treating it as a fallback is how one account's success becomes
   * every account's permission.
   */
  const accountObservation =
    input.observation &&
    observationApplies(input.observation, input) &&
    observationIsInformative(input.observation)
      ? input.observation
      : null;

  if (accountObservation?.outcome === 'refuted') {
    return make(
      'unsupported',
      accountObservation.detail ??
        `Observed failing on this account: ${input.platform} refused ${input.action}.`,
      { decidedBy: 'account', method: 'probe' },
      accountObservation.observedAt,
    );
  }

  const field = TRANSPORT_FIELD[input.action];
  const observed: Capability | undefined =
    field && input.transport ? (input.transport[field] as Capability) : undefined;

  if (observed === 'no') {
    return make(
      'unsupported',
      `Verified against a real account: this transport cannot ${input.action} on ${input.platform}.`,
      { decidedBy: 'transport', method: 'probe' },
      input.transportVerifiedAt ?? null,
    );
  }

  /**
   * Review gating sits *after* an outright no and *before* a yes.
   *
   * `draft_only` means the credential works and the platform will not publish
   * publicly until a human review lands. That is a different fact from
   * "unsupported", and conflating them has cost this project real time before —
   * every platform except X and Bluesky is in this state.
   */
  if (state === 'draft_only' && (input.action === 'publish_public' || input.action === 'publish')) {
    return make(
      'review_required',
      'The credential works, but the platform gates public posting behind a review that has not landed. Drafts only until then.',
      { decidedBy: 'account', method: 'account_state' },
    );
  }
  if (
    input.constraints?.requiresReviewForPublicPosting &&
    input.action === 'publish_public' &&
    state !== 'live'
  ) {
    return make(
      'review_required',
      `${input.platform} gates public posting behind a platform review.`,
      { decidedBy: 'platform', method: 'platform_constraint' },
    );
  }

  /**
   * A confirmed observation on this account.
   *
   * Placed after the review gate on purpose: a probe that watched a *draft* be
   * created must not promote `publish_public` past a review that has not
   * landed. Placed before the transport's `yes` because an observation made on
   * this account is more specific evidence than one made on the provider.
   */
  if (accountObservation?.outcome === 'confirmed') {
    return make(
      'verified',
      accountObservation.detail ??
        `Observed working on this account against ${input.platform}.`,
      { decidedBy: 'account', method: 'probe' },
      accountObservation.observedAt,
    );
  }

  if (observed === 'yes') {
    return make(
      'verified',
      `Observed working against a real account through ${input.provider ?? 'this transport'}.`,
      { decidedBy: 'transport', method: 'probe' },
      input.transportVerifiedAt ?? null,
    );
  }

  /**
   * An adapter's own declaration, which is the weakest evidence here.
   *
   * Reported as `declared` and never as `verified`, and `isActionable` refuses
   * it. A direct adapter declaring a format is a statement of intent by the
   * person who wrote the adapter, not an observation of a platform.
   */
  if (halyardDeclares(input.platform, input.action, input.constraints)) {
    return make(
      'declared',
      `The ${input.platform} adapter implements this, and nothing has verified it against a real account.`,
      { decidedBy: 'platform', method: 'adapter_declaration' },
    );
  }

  // ── Nothing knows ────────────────────────────────────────────────────────
  return make(
    'unknown',
    observed === 'unknown'
      ? `No probe has checked whether ${input.platform} can ${input.action} through this transport.`
      : `Nothing in Halyard knows whether ${input.platform} can ${input.action}.`,
    { decidedBy: 'none', method: 'absent' },
  );
}

/** Operator-facing labels. Kept beside the type so one cannot outlive the other. */
export const VERDICT_LABEL: Record<CapabilityVerdict, string> = {
  verified: 'verified',
  declared: 'declared, unverified',
  unsupported: 'not supported',
  unknown: 'unknown',
  auth_required: 'needs authentication',
  review_required: 'awaiting platform review',
  account_unavailable: 'account unavailable',
  policy_prohibited: 'not permitted by policy',
};

export const VERDICT_TONE: Record<CapabilityVerdict, 'good' | 'warn' | 'bad' | 'neutral' | 'info'> =
  {
    verified: 'good',
    declared: 'info',
    unsupported: 'bad',
    unknown: 'neutral',
    auth_required: 'warn',
    review_required: 'warn',
    account_unavailable: 'bad',
    policy_prohibited: 'neutral',
  };
