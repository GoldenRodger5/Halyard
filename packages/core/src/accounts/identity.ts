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
    /**
     * When a human last confirmed this row's identity, or null if never.
     *
     * §176. The distinguishing fact between a slot that has an identity and one
     * that is merely reserved. Rows are seeded per platform before anything is
     * connected, so "a row exists" says nothing; "a person confirmed who it is"
     * says everything.
     */
    identityConfirmedAt?: Date | string | null;
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

/**
 * The identity this slot already has, or null if it has never had one.
 *
 * §176. A first connection has nothing to be checked against — that is what
 * makes it first. Halyard seeds a `social_accounts` row for every platform so
 * the Accounts screen can list them, so the existence of a row is not evidence
 * of an identity; a confirmed `platform_user_id` (or, for providers that expose
 * no id, a confirmed handle) is.
 */
export function establishedIdentity(
  input: Pick<IdentityCheckInput, 'existing' | 'reconnectingAccountId'>,
): { platformUserId: string | null; handle: string } | null {
  const row = input.existing.find((a) => a.id === input.reconnectingAccountId);
  if (!row) return null;
  const everConfirmed = Boolean(row.platformUserId) || Boolean(row.identityConfirmedAt);
  return everConfirmed ? { platformUserId: row.platformUserId, handle: row.handle } : null;
}

export function checkIdentity(input: IdentityCheckInput): IdentityWarning[] {
  const warnings: IdentityWarning[] = [];
  const { identity, existing, expectedHandle, persona, platform, productId } = input;

  const established = establishedIdentity(input);

  /*
   * §176. A configured handle is a hint, never a gate.
   *
   * This was severe, and it rejected the very first connection of a correct
   * account: the expectation had been *seeded* — guessed before any account
   * existed — and a guess cannot outrank what the platform just told us. A
   * first-time connection has no prior identity by definition, so there is
   * nothing to contradict; the platform's answer becomes the canonical identity
   * and `confirmConnection` writes it.
   *
   * The real protection against connecting the wrong account on first setup is
   * unchanged and is the reason this module exists: the identity is fetched,
   * shown to a person, and written only after they confirm it.
   *
   * Continuity for an account that *does* have an identity is enforced below,
   * against the platform's own id rather than against a name a human typed.
   */
  if (
    !established &&
    expectedHandle &&
    normaliseHandle(expectedHandle) !== normaliseHandle(identity.handle)
  ) {
    warnings.push({
      kind: 'handle_mismatch',
      message: `Halyard had @${expectedHandle.replace(/^@/, '')} noted for this slot; you authorised @${identity.handle.replace(/^@/, '')}.`,
      fix: 'If this is the right account, confirm — Halyard will remember this identity from now on. If it is not, open the connect link in a private window and try again.',
      severe: false,
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

  /*
   * §176. Continuity, checked against the platform's own identifier.
   *
   * A platform user id is stable across renames and cannot be typed wrong, so it
   * is authoritative whenever the provider returns one — a handle never
   * outranks it. Someone renaming @old to @new is a rename, not a different
   * account, and must not be reported as one.
   *
   * Where a provider exposes no stable id, the confirmed handle is the only
   * continuity signal there is, so it is used — compared exactly, never fuzzily.
   */
  if (established) {
    if (established.platformUserId && identity.platformUserId) {
      if (established.platformUserId !== identity.platformUserId) {
        warnings.push({
          kind: 'reconnect_changed_identity',
          message: `This slot is @${established.handle.replace(/^@/, '')}; the new token is a different account, @${identity.handle.replace(/^@/, '')}.`,
          fix: 'Reconnecting with a different identity orphans the existing post history and metrics. Connect the original account, or disconnect this one first.',
          severe: true,
        });
      }
    } else if (normaliseHandle(established.handle) !== normaliseHandle(identity.handle)) {
      warnings.push({
        kind: 'reconnect_changed_identity',
        message: `This slot is @${established.handle.replace(/^@/, '')}; the new token is @${identity.handle.replace(/^@/, '')}, and ${platform} returned no account id to tell a rename from a different account.`,
        fix: 'Confirm only if you renamed this account. Otherwise connect the original one.',
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
