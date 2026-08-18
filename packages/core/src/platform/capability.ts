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
  /** D — a product-policy refusal, when one applies. */
  policyRefusal?: { reason: string } | null;
  now?: Date;
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

/** Whether the platform itself supports the action, from its declared constraints. */
function platformSupports(
  action: CapabilityAction,
  constraints: PlatformConstraints,
): boolean | null {
  switch (action) {
    case 'carousel':
      return constraints.carousel !== undefined;
    case 'video':
    case 'short_video':
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

  // ── B/E. Transport observation ───────────────────────────────────────────
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
  if (input.constraints && platformSupports(input.action, input.constraints) === true) {
    return make(
      'declared',
      `The ${input.platform} adapter declares this, and nothing has verified it against a real account.`,
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
