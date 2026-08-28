/**
 * Identity confirmation. Milestone 40.
 *
 * The failure this exists for: you are signed into your personal X account in
 * the browser, you click "connect brand account", the consent screen looks
 * right because it always looks right, and three days later the product's
 * marketing is going out under your own name. Nothing in the OAuth response
 * tells you this happened.
 *
 * So the sequence is: exchange the code, fetch the identity, show it to a human,
 * and only then write the token. An unconfirmed connection holds its token in
 * `pending_connections` and expires.
 */
import type { PlatformId, PlatformIdentity } from '../adapters/types.js';

export type IdentityWarningKind =
  | 'handle_mismatch'
  | 'duplicate_identity'
  | 'persona_mismatch'
  | 'multiple_identities'
  | 'zero_followers'
  | 'reconnect_changed_identity';

export interface IdentityWarning {
  kind: IdentityWarningKind;
  /** What is wrong, in the operator's language. */
  message: string;
  /** What to do about it. */
  fix: string;
  /** True when confirming anyway is very likely a mistake. */
  severe: boolean;
}

export interface IdentityCheckInput {
  platform: PlatformId;
  persona: 'founder' | 'brand';
  productId: string;
  /** What the operator says this account should be, from product or persona config. */
  expectedHandle?: string | null;
  identity: PlatformIdentity;
  /** Identities already connected, so a second connection of the same one is caught. */
  existing: Array<{
    id: string;
    productId: string;
    persona: 'founder' | 'brand';
    platform: PlatformId;
    platformUserId: string | null;
    handle: string;
  }>;
  /** Set when this is a reconnect of a specific account rather than a new one. */
  reconnectingAccountId?: string | null;
}

/**
 * The handle this product expects on one platform, most specific first.
 *
 * §175. `expected_handles` was keyed by persona alone — `{"brand":"recipefix"}`,
 * seeded by migration 0014 before any account existed. But a brand's handle is
 * **per platform**, not per persona: the same product is `@Recipe_Fix` on X,
 * `@recipe.fix` on Instagram and Threads, and `@recipefix` on TikTok. One string
 * cannot be right for all of them, and it was wrong for three.
 *
 * The lookup is `"<persona>:<platform>"` and then `"<persona>"`, so the general
 * value keeps working everywhere it is still correct and a platform overrides it
 * only where the handle genuinely differs.
 */
export function expectedHandleFor(
  expectedHandles: Record<string, unknown> | null | undefined,
  persona: 'founder' | 'brand',
  platform: PlatformId,
): string | null {
  const read = (key: string): string | null => {
    const v = expectedHandles?.[key];
    return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
  };
  return read(`${persona}:${platform}`) ?? read(persona);
}

/**
 * Compare handles the way a human would: case- and @-insensitively.
 *
 * §175. Case only, plus the `@` and the Bluesky domain suffix. It deliberately
 * does **not** fold anything that distinguishes two real accounts: `@recipefix`
 * and `@recipe_fix` are separate X usernames that different people can own, as
 * are `@recipefix` and `@recipe.fix`. Folding `_` or `.` here would make the
 * identity check unable to tell the product's account from a lookalike, which is
 * the single failure this whole module exists to prevent.
 */
export function normaliseHandle(handle: string | null | undefined): string {
  return (handle ?? '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    // bsky handles carry a domain; recipefix.bsky.social and recipefix should match
    .replace(/\.(bsky\.social|com|app|net|io)$/, '');
}

export function checkIdentity(input: IdentityCheckInput): IdentityWarning[] {
  const warnings: IdentityWarning[] = [];
  const { identity, existing, expectedHandle, persona, platform, productId } = input;

  if (expectedHandle && normaliseHandle(expectedHandle) !== normaliseHandle(identity.handle)) {
    warnings.push({
      kind: 'handle_mismatch',
      /*
       * Both handles exactly as they are written. This printed the expected one
       * lower-cased, so an operator comparing it against their own configuration
       * saw a third spelling that appears nowhere — noise in the one message that
       * has to be read carefully.
       */
      message: `You expected @${expectedHandle.replace(/^@/, '')} but authorised @${identity.handle.replace(/^@/, '')}.`,
      fix: `Sign out of ${platform} in this browser, or open the connect link in a private window, then reconnect.`,
      severe: true,
    });
  }

  const clash = existing.find(
    (a) =>
      a.platform === platform &&
      a.platformUserId &&
      a.platformUserId === identity.platformUserId &&
      a.id !== input.reconnectingAccountId,
  );
  if (clash) {
    warnings.push({
      kind: 'duplicate_identity',
      message:
        clash.productId === productId
          ? `@${identity.handle} is already connected to this product as the ${clash.persona} account.`
          : `@${identity.handle} is already connected to "${clash.productId}" as its ${clash.persona} account.`,
      fix:
        clash.productId === productId && clash.persona !== persona
          ? 'The founder and brand accounts should be different identities, or the persona split does no work. Connect the other account, or confirm anyway if one person genuinely runs both.'
          : 'Disconnect it there first, or confirm anyway if the same identity really does serve both.',
      severe: clash.productId === productId,
    });
  }

  if (input.reconnectingAccountId) {
    const previous = existing.find((a) => a.id === input.reconnectingAccountId);
    if (
      previous?.platformUserId &&
      previous.platformUserId !== identity.platformUserId
    ) {
      warnings.push({
        kind: 'reconnect_changed_identity',
        message: `This slot was @${previous.handle}; the new token is @${identity.handle}.`,
        fix: 'Reconnecting with a different identity orphans the existing post history and metrics. Connect the original account, or create a new account row instead.',
        severe: true,
      });
    }
  }

  if ((identity.alternatives?.length ?? 0) > 0) {
    warnings.push({
      kind: 'multiple_identities',
      message: `This authorisation reaches ${(identity.alternatives!.length + 1).toString()} accounts. @${identity.handle} was selected.`,
      fix: 'Pick the right one below before confirming.',
      severe: false,
    });
  }

  if (identity.followerCount === 0) {
    warnings.push({
      kind: 'zero_followers',
      message: `@${identity.handle} has no followers.`,
      fix: 'That is normal for a new account, and a strong signal you connected the wrong one if it should not be.',
      severe: false,
    });
  }

  return warnings;
}

/**
 * Founder accounts are one identity shared across every product; brand accounts
 * belong to exactly one. This is the rule the routing constraint enforces in the
 * database, restated here so the UI can explain it before the insert fails.
 */
export function describePersona(persona: 'founder' | 'brand'): string {
  return persona === 'founder'
    ? 'One founder account, shared across every product. Opinion and build-in-public content only.'
    : 'One brand account per product. Its posts can never be routed to another product.';
}
