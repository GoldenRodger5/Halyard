/**
 * Which account the operator meant, and which ones are merely similar.
 *
 * §175. A real connection of @Recipe_Fix was flagged as the wrong account,
 * because `expected_handles` held `{"brand":"recipefix"}` — seeded by migration
 * 0014 before any account existed — and a brand's handle is per *platform*, not
 * per persona. The same product is @Recipe_Fix on X, @recipe.fix on Instagram
 * and Threads, @recipefix on TikTok.
 *
 * The comparison was never the bug: it has always folded case. The tempting
 * "fix" is to fold `_` and `.` as well, and that is the one change that must not
 * be made — @recipefix, @recipe_fix and @recipe.fix are three usernames three
 * different people can own, and telling them apart is the entire job here.
 */
import { describe, expect, it } from 'vitest';
import { checkIdentity, expectedHandleFor, normaliseHandle } from './identity.js';
import type { PlatformIdentity } from '../adapters/types.js';

const identity = (handle: string): PlatformIdentity => ({
  handle,
  platformUserId: 'x-1',
  displayName: 'RecipeFix',
  followerCount: 0,
});

function mismatch(expectedHandle: string | null, authorised: string) {
  return checkIdentity({
    platform: 'x',
    persona: 'brand',
    productId: 'recipefix',
    expectedHandle,
    identity: identity(authorised),
    existing: [],
  }).find((w) => w.kind === 'handle_mismatch');
}

describe('the account the operator meant', () => {
  it('accepts the real account whatever its casing — the reported failure', () => {
    expect(mismatch('Recipe_Fix', '@Recipe_Fix')).toBeUndefined();
    expect(mismatch('recipe_fix', 'RECIPE_FIX')).toBeUndefined();
    expect(mismatch('@RECIPE_FIX', 'recipe_fix')).toBeUndefined();
  });

  it('ignores a leading @ on either side', () => {
    expect(mismatch('@Recipe_Fix', 'Recipe_Fix')).toBeUndefined();
    expect(mismatch('Recipe_Fix', '@Recipe_Fix')).toBeUndefined();
  });

  it('ignores surrounding whitespace, which a pasted handle carries', () => {
    expect(mismatch('  Recipe_Fix  ', '@Recipe_Fix')).toBeUndefined();
  });
});

describe('accounts that merely look alike still fail', () => {
  /*
   * Each of these is a username someone else can register. If any of them stops
   * failing, the check can no longer tell the product's account from a
   * lookalike, and every later safeguard is downstream of this one.
   */
  it.each([
    ['an underscore that is not there', 'Recipe_Fix', '@recipefix'],
    ['an underscore that should not be', 'recipefix', '@recipe_fix'],
    ['a dot instead of an underscore', 'Recipe_Fix', '@recipe.fix'],
    ['a dot that is not there', 'recipe.fix', '@recipefix'],
    ['a hyphen', 'Recipe_Fix', '@recipe-fix'],
    ['a different account entirely', 'Recipe_Fix', '@someone_else'],
    ['a prefix of the real handle', 'Recipe_Fix', '@recipe'],
    ['the real handle plus a suffix', 'Recipe_Fix', '@Recipe_Fix2'],
    ['a homoglyph-ish padding', 'Recipe_Fix', '@RecipeFix_'],
  ])('%s', (_why, expected, authorised) => {
    const w = mismatch(expected, authorised);
    expect(w, `${authorised} must not be accepted as ${expected}`).toBeDefined();
    expect(w!.severe).toBe(true);
  });

  it('names both handles exactly as written, so the operator can compare them', () => {
    const w = mismatch('Recipe_Fix', '@recipefix');
    expect(w!.message).toContain('@Recipe_Fix');
    expect(w!.message).toContain('@recipefix');
  });
});

describe('expectedHandleFor', () => {
  const handles = {
    brand: 'recipefix',
    'brand:x': 'Recipe_Fix',
    'brand:instagram': 'recipe.fix',
  };

  it('prefers the platform-specific handle', () => {
    expect(expectedHandleFor(handles, 'brand', 'x')).toBe('Recipe_Fix');
    expect(expectedHandleFor(handles, 'brand', 'instagram')).toBe('recipe.fix');
  });

  it('falls back to the persona handle where no platform overrides it', () => {
    expect(expectedHandleFor(handles, 'brand', 'tiktok')).toBe('recipefix');
  });

  it('returns null when nothing is configured, which disables the check', () => {
    /* No expectation is not the same as a failed expectation. */
    expect(expectedHandleFor({}, 'brand', 'x')).toBeNull();
    expect(expectedHandleFor(null, 'brand', 'x')).toBeNull();
    expect(expectedHandleFor({ founder: 'isaacmineo' }, 'brand', 'x')).toBeNull();
  });

  it('treats blank and non-string values as unset', () => {
    expect(expectedHandleFor({ brand: '   ' }, 'brand', 'x')).toBeNull();
    expect(expectedHandleFor({ brand: 42 } as Record<string, unknown>, 'brand', 'x')).toBeNull();
  });

  it('keeps personas apart', () => {
    const both = { brand: 'recipefix', founder: 'isaacmineo' };
    expect(expectedHandleFor(both, 'founder', 'x')).toBe('isaacmineo');
    expect(expectedHandleFor(both, 'brand', 'x')).toBe('recipefix');
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

  it('still folds the Bluesky domain suffix, which is not part of the identity', () => {
    expect(normaliseHandle('recipefix.bsky.social')).toBe(normaliseHandle('@RecipeFix'));
  });
});
