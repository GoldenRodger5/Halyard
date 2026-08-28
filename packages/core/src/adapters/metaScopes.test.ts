/**
 * Every requested Meta scope, against the code that would exercise it.
 *
 * The audit that produced this found `pages_read_engagement` sitting beside
 * `business_management` with exactly the same status — requested, granted, and
 * reachable from no code at all — after months in which only one of the two had
 * been noticed. A scope list is easy to add to and nothing ever removes from it.
 *
 * This is not a policy test. It does not say which scopes Halyard *should*
 * request; that is an operator decision with App Review consequences. It says
 * that a scope with no call site must be **named as such**, so adding one is a
 * deliberate act rather than a line in an array.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PLATFORM_SCOPES } from './oauth.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const adapterSource = readFileSync(path.join(HERE, 'instagram.ts'), 'utf8');
const threadsSource = readFileSync(path.join(HERE, 'threads.ts'), 'utf8');

/**
 * The Graph endpoint each scope authorises, and where the adapter calls it.
 *
 * The pattern is matched against the adapter source, so deleting a call site
 * without removing its scope fails here rather than going unnoticed.
 */
const EXERCISED_BY: Record<string, { endpoint: RegExp; why: string }> = {
  instagram_business_basic: {
    endpoint: /fields=user_id,username/,
    why: 'reads the connected account’s own profile',
  },
  instagram_business_content_publish: {
    endpoint: /\/media_publish/,
    why: 'creates and publishes a media container',
  },
  instagram_business_manage_comments: {
    endpoint: /\/comments\?fields=/,
    why: 'reads comments on the account’s own posts',
  },
  instagram_business_manage_insights: {
    endpoint: /\/insights\?metric=/,
    why: 'reads insights on the account’s own posts',
  },
};

/**
 * Scopes that are requested and reach no code.
 *
 * Listed rather than removed: changing a requested scope has App Review
 * consequences and is the operator's call (`DECISIONS.md` §98). Listing them
 * makes the gap explicit and keeps a third one from joining quietly.
 */
const KNOWN_UNEXERCISED: Record<string, string> = {
  /*
   * §184. Empty, for the first time.
   *
   * The Facebook Login set carried three passengers: `pages_show_list` and
   * `pages_read_engagement` existed only to walk `/me/accounts` to a Page, and
   * `business_management` never had a call site at all — this audit had been
   * naming it as unexercised for months. Instagram Login has no Page, so the
   * first two are gone with the flow, and the third went with them.
   *
   * Meta's setup page also lists `instagram_business_manage_messages`, which is
   * deliberately not requested: Halyard implements no direct messaging.
   */
};

describe('every requested Meta scope is accounted for', () => {
  const requested = PLATFORM_SCOPES.instagram ?? [];

  it('requests the scopes this audit was written against', () => {
    // Non-vacuity: an empty or renamed list would satisfy every loop below.
    expect(requested.length).toBe(4);
    expect(requested).toContain('instagram_business_content_publish');
    /* The Facebook Login scopes must not creep back with the flow removed. */
    expect(requested).not.toContain('pages_show_list');
    expect(requested).not.toContain('instagram_content_publish');
  });

  for (const scope of Object.keys(EXERCISED_BY)) {
    it(`${scope} has a live call site`, () => {
      const { endpoint, why } = EXERCISED_BY[scope]!;
      expect(requested, `${scope} is mapped but no longer requested`).toContain(scope);
      expect(
        endpoint.test(adapterSource),
        `${scope} is requested for "${why}" and that call site is gone from instagram.ts`,
      ).toBe(true);
    });
  }

  it('names every scope that reaches no code', () => {
    /**
     * The assertion that would have caught `pages_read_engagement` on the day it
     * was added. Any scope that is neither mapped to a call site nor explicitly
     * recorded as unexercised fails here.
     */
    const unaccounted = requested.filter(
      (scope) => !(scope in EXERCISED_BY) && !(scope in KNOWN_UNEXERCISED),
    );
    expect(
      unaccounted,
      'a requested scope with no call site must be recorded in KNOWN_UNEXERCISED with a reason',
    ).toEqual([]);
  });

  it('does not carry a stale entry for a scope no longer requested', () => {
    // The other direction: removing a scope should remove its bookkeeping too,
    // or this file starts describing a permission set that no longer exists.
    for (const scope of [...Object.keys(EXERCISED_BY), ...Object.keys(KNOWN_UNEXERCISED)]) {
      expect(requested, `${scope} is documented here but no longer requested`).toContain(scope);
    }
  });

  it('requests nothing without a call site', () => {
    /*
     * §184. With the Facebook Login flow gone, every requested scope is
     * exercised and `KNOWN_UNEXERCISED` is empty — so this asserts the stronger
     * property directly rather than looping over an empty object, which would
     * pass whatever the scope list said.
     */
    expect(Object.keys(KNOWN_UNEXERCISED)).toEqual([]);
    expect(requested.every((scope) => scope in EXERCISED_BY)).toBe(true);
  });

  it('does not ask for messaging, which Halyard does not implement', () => {
    expect(requested).not.toContain('instagram_business_manage_messages');
    expect(adapterSource).not.toMatch(/\/conversations|\/messages\b/);
  });
});

/**
 * Threads is a Meta product with its own permission set, reviewed through the
 * same App Review, and this file audited only Instagram — so four requested
 * Meta scopes had no coverage at all. They all turn out to have call sites,
 * which is the good outcome; what was missing was anything that would notice if
 * one stopped.
 */
const THREADS_EXERCISED_BY: Record<string, { endpoint: RegExp; why: string }> = {
  threads_basic: {
    endpoint: /\/me\?fields=id,username/,
    why: 'reads the connected account’s own profile and handle',
  },
  threads_content_publish: {
    endpoint: /\/threads_publish/,
    why: 'publishes the container it created with /{user}/threads',
  },
  threads_manage_replies: {
    endpoint: /\/replies\?fields=/,
    why: 'reads replies on the account’s own posts, for the inbox',
  },
  threads_manage_insights: {
    endpoint: /\/insights\?metric=/,
    why: 'reads insights on the account’s own posts',
  },
};

describe('every requested Threads scope is accounted for', () => {
  const requested = PLATFORM_SCOPES.threads ?? [];

  it('requests the scopes this audit was written against', () => {
    // Non-vacuity, as above: an empty list would satisfy every loop below.
    expect(requested.length).toBeGreaterThanOrEqual(4);
    expect(requested).toContain('threads_content_publish');
  });

  for (const scope of Object.keys(THREADS_EXERCISED_BY)) {
    it(`${scope} has a live call site`, () => {
      const { endpoint, why } = THREADS_EXERCISED_BY[scope]!;
      expect(requested, `${scope} is mapped but no longer requested`).toContain(scope);
      expect(
        endpoint.test(threadsSource),
        `${scope} is requested for "${why}" and that call site is gone from threads.ts`,
      ).toBe(true);
    });
  }

  it('names every scope that reaches no code', () => {
    // Unlike Instagram, Threads currently has no unexercised scope. If one
    // appears, it must be named here deliberately rather than drift in.
    const unaccounted = requested.filter((scope) => !(scope in THREADS_EXERCISED_BY));
    expect(
      unaccounted,
      'a requested Threads scope with no call site must be recorded with a reason',
    ).toEqual([]);
  });

  it('does not carry a stale entry for a scope no longer requested', () => {
    for (const scope of Object.keys(THREADS_EXERCISED_BY)) {
      expect(requested, `${scope} is documented here but no longer requested`).toContain(scope);
    }
  });
});
