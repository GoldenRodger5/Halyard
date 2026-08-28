/**
 * Who this account is, and how Halyard comes to know it.
 *
 * §176. The identity check used to require knowing the answer in advance. A
 * `social_accounts` row is seeded for every platform so the Accounts screen can
 * list them, and `expected_handles` was seeded alongside with guesses written
 * before anything was connected — so the very first, correct authorisation of
 * @Recipe_Fix was reported as the wrong account.
 *
 * That does not generalise past the first tenant: a new Halyard user has no
 * handles to seed, so any rule depending on them is a rule that only ever worked
 * once. The platform is the authority. A first connection has nothing to
 * contradict, its returned identity becomes canonical, and every later
 * reconnection is checked against the stored **platform user id** — stable across
 * renames, impossible to mistype.
 *
 * What is deliberately *not* done: widening the handle comparison. @recipefix,
 * @recipe_fix and @recipe.fix are three usernames three different people can own.
 */
import { describe, expect, it } from 'vitest';
import { checkIdentity, establishedIdentity, normaliseHandle } from './identity.js';
import type { PlatformIdentity } from '../adapters/types.js';

const SLOT = 'slot-1';

/** One row of `existing`, widened so placeholders and connected rows share a type. */
type Row = {
  id: string;
  productId: string;
  persona: 'founder' | 'brand';
  platform: 'x';
  platformUserId: string | null;
  handle: string;
  identityConfirmedAt: Date | string | null;
};

const identity = (handle: string, platformUserId = 'x-111'): PlatformIdentity => ({
  handle,
  platformUserId,
  displayName: 'RecipeFix',
  followerCount: 12,
});

/** A slot that exists but has never been connected — how every platform starts. */
const placeholder = (handle: string): Row => ({
  id: SLOT,
  productId: 'p1',
  persona: 'brand' as const,
  platform: 'x' as const,
  platformUserId: null,
  handle,
  identityConfirmedAt: null,
});

/** A slot a human has confirmed, carrying the platform's own id. */
const connected = (handle: string, platformUserId: string | null): Row => ({
  id: SLOT,
  productId: 'p1',
  persona: 'brand' as const,
  platform: 'x' as const,
  platformUserId,
  handle,
  identityConfirmedAt: new Date('2026-08-28T03:35:47Z'),
});

function check(opts: {
  authorised: PlatformIdentity;
  existing?: Row[];
  expectedHandle?: string | null;
  reconnecting?: boolean;
}) {
  return checkIdentity({
    platform: 'x',
    persona: 'brand',
    productId: 'p1',
    expectedHandle: opts.expectedHandle ?? null,
    identity: opts.authorised,
    existing: opts.existing ?? [],
    reconnectingAccountId: opts.reconnecting === false ? null : SLOT,
  });
}

const kinds = (ws: ReturnType<typeof check>) => ws.map((w) => w.kind);
const blocking = (ws: ReturnType<typeof check>) => ws.filter((w) => w.severe).map((w) => w.kind);

describe('a first connection', () => {
  it('accepts whatever the platform says, with nothing configured', () => {
    /* The default for every new Halyard user: no seeds, no expectations. */
    const ws = check({ authorised: identity('@Recipe_Fix'), existing: [placeholder('@recipefix')] });
    expect(kinds(ws)).not.toContain('handle_mismatch');
    expect(blocking(ws)).toEqual([]);
  });

  it('is not blocked when a configured handle disagrees — the reported failure', () => {
    /*
     * The exact production case: seeded @recipefix, authorised @Recipe_Fix. It
     * may say so, and it may not refuse.
     */
    const ws = check({
      authorised: identity('@Recipe_Fix'),
      existing: [placeholder('@recipefix')],
      expectedHandle: 'recipefix',
    });
    expect(kinds(ws)).toContain('handle_mismatch');
    expect(blocking(ws)).toEqual([]);
  });

  it('names both handles exactly as written', () => {
    const w = check({
      authorised: identity('@Recipe_Fix'),
      expectedHandle: 'recipefix',
    }).find((x) => x.kind === 'handle_mismatch')!;
    expect(w.message).toContain('@recipefix');
    expect(w.message).toContain('@Recipe_Fix');
  });

  it('says nothing when the configured handle agrees, whatever its casing', () => {
    for (const configured of ['Recipe_Fix', 'recipe_fix', '@RECIPE_FIX', '  @Recipe_Fix ']) {
      expect(kinds(check({ authorised: identity('@Recipe_Fix'), expectedHandle: configured })))
        .not.toContain('handle_mismatch');
    }
  });

  it('treats a slot with no row at all the same way', () => {
    expect(blocking(check({ authorised: identity('@anything'), reconnecting: false }))).toEqual([]);
  });
});

describe('reconnecting an account that already has an identity', () => {
  it('allows a rename: same platform id, different handle', () => {
    /*
     * The id is the account. Someone renaming @Recipe_Fix to @RecipeFixHQ has not
     * become a different person, and reporting it as one would train the operator
     * to click through the warning that matters.
     */
    const ws = check({
      authorised: identity('@RecipeFixHQ', 'x-111'),
      existing: [connected('@Recipe_Fix', 'x-111')],
    });
    expect(kinds(ws)).not.toContain('reconnect_changed_identity');
    expect(blocking(ws)).toEqual([]);
  });

  it('refuses a genuinely different account, even with an identical handle', () => {
    /* A handle can be released and re-registered by someone else. The id cannot. */
    const ws = check({
      authorised: identity('@Recipe_Fix', 'x-999'),
      existing: [connected('@Recipe_Fix', 'x-111')],
    });
    expect(blocking(ws)).toContain('reconnect_changed_identity');
  });

  it.each([
    ['an underscore that is not there', '@recipefix'],
    ['a dot instead of an underscore', '@recipe.fix'],
    ['a hyphen', '@recipe-fix'],
    ['a suffix', '@Recipe_Fix2'],
    ['a different account entirely', '@someone_else'],
  ])('refuses a lookalike when the provider returns no id: %s', (_why, authorised) => {
    /*
     * Without an id the confirmed handle is the only continuity signal there is,
     * so it is compared exactly. Folding `_` or `.` here would make these five
     * indistinguishable from the real account.
     */
    const ws = check({
      authorised: identity(authorised, null as unknown as string),
      existing: [connected('@Recipe_Fix', null)],
    });
    expect(blocking(ws)).toContain('reconnect_changed_identity');
  });

  it('allows the same handle back when the provider returns no id', () => {
    const ws = check({
      authorised: identity('@recipe_fix', null as unknown as string),
      existing: [connected('@Recipe_Fix', null)],
    });
    expect(kinds(ws)).not.toContain('reconnect_changed_identity');
  });

  it('does not re-apply a configured handle once an identity is established', () => {
    /* The platform's id has superseded it; repeating the hint would be noise. */
    const ws = check({
      authorised: identity('@Recipe_Fix', 'x-111'),
      existing: [connected('@Recipe_Fix', 'x-111')],
      expectedHandle: 'something-else-entirely',
    });
    expect(kinds(ws)).not.toContain('handle_mismatch');
  });
});

describe('establishedIdentity', () => {
  it('is null for a seeded slot nobody has connected', () => {
    expect(establishedIdentity({ existing: [placeholder('@recipefix')], reconnectingAccountId: SLOT }))
      .toBeNull();
  });

  it('is null when there is no row for the slot', () => {
    expect(establishedIdentity({ existing: [], reconnectingAccountId: SLOT })).toBeNull();
  });

  it('is set once a platform id is stored', () => {
    expect(establishedIdentity({ existing: [connected('@Recipe_Fix', 'x-111')], reconnectingAccountId: SLOT }))
      .toEqual({ platformUserId: 'x-111', handle: '@Recipe_Fix' });
  });

  it('is set for a confirmed account even where the provider exposes no id', () => {
    expect(establishedIdentity({ existing: [connected('@Recipe_Fix', null)], reconnectingAccountId: SLOT }))
      .toEqual({ platformUserId: null, handle: '@Recipe_Fix' });
  });
});

describe('ownership rules are untouched', () => {
  it('still refuses an identity already connected elsewhere in this product', () => {
    const ws = checkIdentity({
      platform: 'x',
      persona: 'brand',
      productId: 'p1',
      identity: identity('@Recipe_Fix', 'x-111'),
      existing: [
        {
          id: 'other-slot',
          productId: 'p1',
          persona: 'founder',
          platform: 'x',
          platformUserId: 'x-111',
          handle: '@Recipe_Fix',
          identityConfirmedAt: new Date(),
        },
      ],
      reconnectingAccountId: SLOT,
    });
    expect(ws.filter((w) => w.severe).map((w) => w.kind)).toContain('duplicate_identity');
  });
});

describe('normaliseHandle folds case and nothing that identifies an account', () => {
  it('folds case, @ and surrounding space', () => {
    expect(normaliseHandle('  @Recipe_Fix ')).toBe('recipe_fix');
  });

  it('keeps the characters that distinguish real usernames', () => {
    expect(normaliseHandle('@recipe_fix')).not.toBe(normaliseHandle('@recipefix'));
    expect(normaliseHandle('@recipe.fix')).not.toBe(normaliseHandle('@recipefix'));
    expect(normaliseHandle('@recipe-fix')).not.toBe(normaliseHandle('@recipefix'));
  });
});
