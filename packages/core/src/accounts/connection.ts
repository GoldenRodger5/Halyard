/**
 * §497. One row per account, in words an operator can act on.
 *
 * Connecting an account was spread over three screens and said none of the
 * things somebody actually asks. `/master` showed full cards for accounts that
 * had a credential and collapsed the rest into a list with no button on it, so
 * the five platforms that were *not* connected — the whole point of the screen —
 * offered nothing to click. The reason most of them could not be connected was
 * never stated anywhere: no developer app is registered, so there is no client
 * id to start an OAuth flow with, and a Connect button would have failed with a
 * JSON error.
 *
 * This decides, from facts the caller supplies, what one row says and what it
 * offers. Pure, so the states are tested rather than discovered by clicking:
 * a connected account, an expired one, one whose app was never registered, one
 * marked past review with no credential at all (gotcha 5).
 */
import { accountStatus, type AccountStatusView } from './status.js';

export type ConnectionAction = 'connect' | 'reconnect' | 'register_app' | 'app_password';

export interface ConnectionInput {
  platform: string;
  handle: string;
  capabilityState: string;
  hasToken: boolean;
  identityConfirmedAt: string | Date | null;
  tokenExpiresAt: string | Date | null;
  lastError: string | null;
  /** Whether a developer app's client id and secret are configured for this platform. */
  credentialsConfigured: boolean;
  /** The env var names that would supply them, for a row that has none. */
  credentialEnvNames: readonly string[];
  /** Whether this platform gates public posting behind a manual review. */
  requiresPlatformReview: boolean;
  /** Bluesky takes an app password rather than an OAuth round trip. */
  usesAppPassword?: boolean;
  publishingEnabled: boolean;
}

export interface ConnectionView {
  /** The one word an operator scans for. */
  state: 'connected' | 'limited' | 'broken' | 'not_connected' | 'unavailable';
  /** What is true, in one sentence. */
  headline: string;
  /** What follows from it, or what to do. One sentence, or null when obvious. */
  detail: string | null;
  /** The primary button, or null when there is nothing honest to offer. */
  action: ConnectionAction | null;
  /** What that button should say. */
  actionLabel: string | null;
  canTest: boolean;
  canDisconnect: boolean;
  status: AccountStatusView;
}

/** "A", "A and B", "A, B and C" — a sentence, not a join. */
function nameList(names: readonly string[]): string {
  if (names.length === 0) return 'its client credentials';
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

function expired(at: string | Date | null): boolean {
  if (!at) return false;
  return new Date(at).getTime() < Date.now();
}

export function connectionView(input: ConnectionInput): ConnectionView {
  const status = accountStatus({
    account: {
      capabilityState: input.capabilityState,
      hasToken: input.hasToken,
      identityConfirmedAt: input.identityConfirmedAt,
      handle: input.handle,
    },
    requiresPlatformReview: input.requiresPlatformReview,
    publishingEnabled: input.publishingEnabled,
    tokenExpired: expired(input.tokenExpiresAt),
  });

  const connectLabel = input.usesAppPassword ? 'Add an app password' : 'Connect';
  const connectAction: ConnectionAction = input.usesAppPassword ? 'app_password' : 'connect';

  /*
   * No developer app, no flow. Said plainly and with the variable names,
   * because "Connect" that answers with a JSON error is worse than a sentence
   * explaining that the app has to be registered first.
   */
  if (!input.credentialsConfigured && !input.usesAppPassword) {
    return {
      state: input.hasToken ? 'broken' : 'unavailable',
      headline: input.hasToken
        ? 'Connected, but this deployment has lost the developer app.'
        : 'No developer app registered.',
      detail:
        `Nothing can start an OAuth flow until ${nameList(input.credentialEnvNames)} ` +
        `${input.credentialEnvNames.length === 1 ? 'is' : 'are'} set on the web app and the ` +
        'worker. Registering the developer app comes first, and its review is wall-clock time ' +
        'you cannot compress.',
      action: 'register_app',
      actionLabel: 'What this needs',
      canTest: input.hasToken,
      canDisconnect: input.hasToken,
      status,
    };
  }

  if (!input.hasToken) {
    /*
     * Gotcha 5, stated where it misleads. `capability_state = 'live'` means an
     * operator marked the platform review passed; it says nothing about a
     * credential, and this row is the one place that difference is visible.
     */
    const marked = input.capabilityState === 'live';
    return {
      state: 'not_connected',
      headline: 'Not connected.',
      detail: marked
        ? 'Marked as past platform review, but no credential is held — a review is not a connection.'
        : null,
      action: connectAction,
      actionLabel: connectLabel,
      canTest: false,
      canDisconnect: false,
      status,
    };
  }

  if (expired(input.tokenExpiresAt)) {
    return {
      state: 'broken',
      headline: 'The credential has expired.',
      detail: 'Nothing can be read or published until it is reconnected. This takes one round trip.',
      action: 'reconnect',
      actionLabel: 'Reconnect',
      canTest: true,
      canDisconnect: true,
      status,
    };
  }

  if (input.lastError) {
    return {
      state: 'broken',
      headline: 'Connected, and the last attempt failed.',
      detail: input.lastError,
      action: 'reconnect',
      actionLabel: 'Reconnect',
      canTest: true,
      canDisconnect: true,
      status,
    };
  }

  const publicly =
    status.canPublish && (status.approval === 'not_required' || status.approval === 'approved');

  return {
    state: publicly ? 'connected' : 'limited',
    headline: publicly ? 'Connected. Can post publicly.' : 'Connected. Drafts only.',
    detail: publicly
      ? null
      : status.approval === 'required'
        ? `${input.platform} gates public posting behind a manual app review, which has not been granted.`
        : status.explanation,
    action: 'reconnect',
    actionLabel: 'Reconnect',
    canTest: true,
    canDisconnect: true,
    status,
  };
}
