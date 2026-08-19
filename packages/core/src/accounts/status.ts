/**
 * What an operator needs to know about one account, in their language.
 *
 * ## Why this exists
 *
 * The Accounts page showed four independent badges — `live`, `identity
 * unconfirmed`, `draft only`, `not connected` — and left the operator to
 * combine them. Those words are accurate about the *implementation* and say
 * nothing about the only questions being asked: is it connected, can Halyard
 * publish, and if not, whose move is it?
 *
 * `live` was the worst of them. It is the name of a `capability_state` value
 * meaning "an operator marked this account as past its platform review". It
 * does **not** mean connected, it does not mean a token exists, and it does not
 * mean anything can be published — an account can read `live` while having no
 * credential at all, which is exactly the state the seeded X accounts are in.
 *
 * ## This changes no rule
 *
 * Every value here is derived from existing state. Nothing new is stored, no
 * gate is added or removed, and the order below mirrors the order the backend
 * already enforces. If the backend blocks publishing, this says so and says
 * why; it cannot say publishing is possible when it is not, because it never
 * decides that — it reports it.
 */
import type { CapabilityState } from '../adapters/types.js';

/**
 * The states an operator is actually in.
 *
 * Deliberately fewer than the combinations the backend can express, because
 * several distinct internal states have the same answer to "what do I do now",
 * and a status list longer than the action list is a quiz.
 */
export type AccountStatus =
  | 'not_connected'
  | 'reconnect_required'
  | 'identity_required'
  | 'awaiting_platform_approval'
  | 'publishing_paused'
  | 'ready'
  | 'switched_off';

export type NextAction =
  | 'connect'
  | 'reconnect'
  | 'confirm_identity'
  | 'complete_platform_approval'
  | 'enable_publishing'
  | 'manage'
  | 'none';

export interface AccountStatusView {
  status: AccountStatus;
  /** Short label for the badge. Plain English, no internal vocabulary. */
  label: string;
  /** One or two sentences saying what is true and what it means. */
  explanation: string;
  /** The single thing worth doing next, or `none` when nothing is. */
  nextAction: NextAction;
  /** Button text for that action. */
  actionLabel: string | null;
  /** Can Halyard publish to this account right now? */
  canPublish: boolean;
  /** Can Halyard read from it — metrics, comments? */
  canRead: boolean;
  /** Where this account stands with the platform's own review process. */
  approval: 'not_required' | 'required' | 'approved';
  tone: 'good' | 'warn' | 'bad' | 'neutral' | 'info';
}

export interface AccountStatusInput {
  /** Absent when no account row exists for this platform and persona. */
  account?: {
    capabilityState: CapabilityState | string;
    hasToken: boolean;
    identityConfirmedAt: Date | string | null;
    handle: string;
  } | null;
  /** Whether this platform gates public posting behind its own review. */
  requiresPlatformReview: boolean;
  /** The global kill switch, which outranks everything account-specific. */
  publishingEnabled: boolean;
  /** A token that has expired or is about to, from `tokenExpiryState`. */
  tokenExpired?: boolean;
}

/**
 * Derive the operator-facing view.
 *
 * Order matters and mirrors the backend's own precedence: something switched
 * off outranks something unconnected, an absent credential outranks a review,
 * and the global pause outranks an otherwise-ready account. The first branch
 * that matches is the one the operator can actually act on.
 */
export function accountStatus(input: AccountStatusInput): AccountStatusView {
  const { account } = input;

  // ── No account at all ────────────────────────────────────────────────────
  if (!account) {
    return {
      status: 'not_connected',
      label: 'Not connected',
      explanation:
        'Halyard has no access to this account. Connect it to let Halyard read and publish here.',
      nextAction: 'connect',
      actionLabel: 'Connect',
      canPublish: false,
      canRead: false,
      approval: input.requiresPlatformReview ? 'required' : 'not_required',
      tone: 'neutral',
    };
  }

  const state = account.capabilityState;

  if (state === 'disabled') {
    return {
      status: 'switched_off',
      label: 'Switched off',
      explanation:
        'This account has been turned off in Halyard. Nothing will be published or collected here until it is turned back on.',
      nextAction: 'manage',
      actionLabel: 'Manage',
      canPublish: false,
      canRead: false,
      approval: input.requiresPlatformReview ? 'required' : 'not_required',
      tone: 'neutral',
    };
  }

  /**
   * A credential that is missing, broken or expired.
   *
   * All three mean the same thing to an operator — Halyard cannot use this
   * account until they reconnect it — so they share a state rather than making
   * the operator distinguish an error from an expiry.
   */
  if (state === 'error' || !account.hasToken || input.tokenExpired) {
    /**
     * "Connected" means a credential relationship exists to repair, so a token
     * is the test — not the absence of an error. An errored account with a
     * token needs *reconnecting*; offering it "Connect", as though it had never
     * been set up, sends the operator down the wrong path.
     */
    const connected = account.hasToken;
    return {
      status: connected ? 'reconnect_required' : 'not_connected',
      label: connected ? 'Reconnection needed' : 'Not connected',
      explanation: !account.hasToken
        ? 'This account is set up in Halyard but has no working credential yet, so nothing can be read or published. Connecting it completes the setup.'
        : state === 'error'
          ? 'The saved credential stopped working. Halyard has held back anything queued for this account rather than sending it against a dead credential.'
          : 'The saved credential has expired. Reconnect to restore access.',
      nextAction: connected ? 'reconnect' : 'connect',
      actionLabel: connected ? 'Reconnect' : 'Connect',
      canPublish: false,
      canRead: false,
      approval: input.requiresPlatformReview ? 'required' : 'not_required',
      tone: state === 'error' ? 'bad' : 'neutral',
    };
  }

  /**
   * Connected, but nobody has confirmed whose account it is.
   *
   * The rule this reflects is deliberate and not negotiable in the UI: a token
   * is not an account until a person has looked at whose it is. Publishing to
   * the wrong account is not recoverable by an apology.
   */
  if (!account.identityConfirmedAt) {
    return {
      status: 'identity_required',
      label: 'Confirm this is the right account',
      explanation: `Halyard connected to ${account.handle}, and is holding off until you confirm that is the account you meant. Nothing will be published until you do.`,
      nextAction: 'confirm_identity',
      actionLabel: 'Confirm identity',
      canPublish: false,
      canRead: true,
      approval: input.requiresPlatformReview ? 'required' : 'not_required',
      tone: 'warn',
    };
  }

  /**
   * Connected and confirmed, waiting on the platform rather than on Halyard.
   *
   * `draft_only` is the platform's answer, not Halyard's, and the distinction
   * matters: there is nothing the operator can do here except wait, and telling
   * them that is more useful than a badge they might try to clear.
   */
  if (state === 'draft_only') {
    return {
      status: 'awaiting_platform_approval',
      label: 'Waiting on platform approval',
      explanation:
        'This account works, but the platform has not yet approved public posting. Halyard will prepare posts and hand them to you to publish by hand until approval lands.',
      nextAction: 'complete_platform_approval',
      actionLabel: 'View approval status',
      canPublish: false,
      canRead: true,
      approval: 'required',
      tone: 'warn',
    };
  }

  // ── The global pause, which outranks an otherwise-ready account ──────────
  if (!input.publishingEnabled) {
    return {
      status: 'publishing_paused',
      label: 'Publishing paused',
      explanation:
        'This account is ready, but publishing is paused across all of Halyard. Nothing will go out anywhere until it is switched back on.',
      nextAction: 'enable_publishing',
      actionLabel: 'Review publishing settings',
      canPublish: false,
      canRead: true,
      approval: input.requiresPlatformReview ? 'approved' : 'not_required',
      tone: 'warn',
    };
  }

  return {
    status: 'ready',
    label: 'Ready to publish',
    explanation: `Halyard can publish to ${account.handle} and collect results from it.`,
    nextAction: 'manage',
    actionLabel: 'Manage',
    canPublish: true,
    canRead: true,
    approval: input.requiresPlatformReview ? 'approved' : 'not_required',
    tone: 'good',
  };
}

/** Plain-English wording for the approval line. */
export const APPROVAL_LABEL: Record<AccountStatusView['approval'], string> = {
  not_required: 'Not required',
  required: 'Required',
  approved: 'Approved',
};
