/**
 * One honest badge for an account, everywhere it appears.
 *
 * `capability_state` is a *record of an operator's decision*, not a statement
 * that the account works — CLAUDE.md gotcha 5, and the reason `accountStatus`
 * exists. The accounts screen has used it since §64; the dashboard and the
 * health screen were still badging the raw column, so an account whose token
 * has been erased rendered as **live** on the two screens an operator checks
 * first. `@isaacmineo` is exactly that row today: `capability_state = 'live'`,
 * no token, no identity confirmation.
 *
 * This adds no status logic. It is a single call into the one tested helper, so
 * the three screens cannot drift apart again.
 */
import { accountStatus, getAdapter } from '@halyard/core';
import type { AccountRow } from './queries';

export interface AccountBadge {
  label: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral' | 'info';
  /** The sentence explaining what is actually true, for a title attribute. */
  explanation: string;
}

/**
 * `publishingEnabled` is deliberately not a parameter.
 *
 * These two surfaces show what is true about the *account*; the kill switch is
 * a property of the system and is displayed separately on both screens. Passing
 * `true` here keeps the badge answering the question it is being asked — "is
 * this account usable" — rather than folding in a global setting and reporting
 * every account as unusable the moment publishing is paused.
 */
export function accountBadge(account: AccountRow): AccountBadge {
  const view = accountStatus({
    account: {
      capabilityState: account.capability_state,
      hasToken: account.has_token,
      identityConfirmedAt: account.identity_confirmed_at,
      handle: account.handle,
    },
    /*
     * The same input the accounts screen supplies, read from the adapter rather
     * than restated, so a platform whose review status changes changes here too.
     */
    requiresPlatformReview: getAdapter(account.platform as never).constraints
      .requiresReviewForPublicPosting,
    publishingEnabled: true,
    tokenExpired: account.token_expires_at
      ? new Date(account.token_expires_at).getTime() < Date.now()
      : false,
  });

  return { label: view.label, tone: view.tone, explanation: view.explanation };
}
