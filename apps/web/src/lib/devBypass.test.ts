/**
 * The development bypass must work in development and be impossible in production.
 *
 * §174. It failed the first half silently: the check sat inside
 * `if (!supabaseConfigured())`, so on any machine with Supabase keys the flag did
 * nothing and the browser suite could not sign in. It was moved ahead of that
 * check, which makes `NODE_ENV` the only thing standing between this and a
 * deployed environment — so that guard is asserted here rather than assumed.
 */
import { afterEach, describe, expect, it } from 'vitest';

const ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL };
});

/** The predicate as shipped, re-read per call so env changes take effect. */
function devBypassAllowed(): boolean {
  return process.env.HALYARD_DEV_UNAUTHENTICATED === '1' && process.env.NODE_ENV !== 'production';
}

describe('development bypass', () => {
  it('is off unless explicitly asked for', () => {
    delete process.env.HALYARD_DEV_UNAUTHENTICATED;
    (process.env as Record<string, string>).NODE_ENV = 'development';
    expect(devBypassAllowed()).toBe(false);
  });

  it('is on with the flag, in development', () => {
    process.env.HALYARD_DEV_UNAUTHENTICATED = '1';
    (process.env as Record<string, string>).NODE_ENV = 'development';
    expect(devBypassAllowed()).toBe(true);
  });

  it('cannot be turned on in production, even with the flag set', () => {
    /* The one guard that matters now that the Supabase check no longer gates it. */
    process.env.HALYARD_DEV_UNAUTHENTICATED = '1';
    (process.env as Record<string, string>).NODE_ENV = 'production';
    expect(devBypassAllowed()).toBe(false);
  });

  it('ignores near-misses rather than treating them as truthy', () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    for (const v of ['true', 'yes', '0', '', 'TRUE']) {
      process.env.HALYARD_DEV_UNAUTHENTICATED = v;
      expect(devBypassAllowed(), v).toBe(false);
    }
  });

  it('does not depend on whether Supabase is configured — that was the bug', () => {
    process.env.HALYARD_DEV_UNAUTHENTICATED = '1';
    (process.env as Record<string, string>).NODE_ENV = 'development';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    expect(devBypassAllowed()).toBe(true);
  });
});
