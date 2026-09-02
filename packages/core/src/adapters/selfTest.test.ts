import { describe, expect, it } from 'vitest';
import { selfTest } from './dryRun.js';
import type { PlatformAdapter, PublishAccount } from './types.js';

/** An adapter whose live read succeeds — the check that actually proves a credential. */
const adapter = (platform: string, readOk = true): PlatformAdapter =>
  ({
    platform,
    verifyCapabilities: async () => ({
      state: readOk ? 'live' : 'error',
      detail: readOk ? `Connected as @recipe.fix.` : 'The platform refused the read.',
    }),
  }) as unknown as PlatformAdapter;

const account = (scopes: string[]): PublishAccount =>
  ({
    tokens: {
      accessToken: 'tok_abcdefghijklmnop',
      expiresAt: new Date(Date.now() + 86_400_000),
      scopes,
    },
  }) as unknown as PublishAccount;

const REQUIRED = ['threads_basic', 'threads_content_publish'];

describe('§500 a scope check that cannot be made', () => {
  it('does not fail a working credential when the provider reports no scopes', async () => {
    const result = await selfTest(adapter('threads'), account([]), REQUIRED);
    const check = result.checks.find((c) => c.name === 'scopes granted')!;

    expect(check.ok).toBe(true);
    expect(check.unmeasured).toBe(true);
    expect(result.ok).toBe(true);
    /* It says what was asked for, so the operator can check the dashboard themselves. */
    expect(check.detail).toMatch(/does not report granted scopes/);
    expect(check.detail).toMatch(/threads_basic, threads_content_publish/);
  });

  it('says out loud that a check was not measured, rather than reporting a clean pass', async () => {
    const result = await selfTest(adapter('threads'), account([]), REQUIRED);
    expect(result.summary).toMatch(/credential is good/);
    expect(result.summary).toMatch(/1 check not measured: scopes granted/);
  });

  it('still fails a provider that reports a set and is short of one', async () => {
    const result = await selfTest(adapter('x'), account(['threads_basic']), REQUIRED);
    const check = result.checks.find((c) => c.name === 'scopes granted')!;

    expect(check.ok).toBe(false);
    expect(check.unmeasured).toBeFalsy();
    expect(result.ok).toBe(false);
    expect(check.detail).toBe('missing threads_content_publish');
  });

  it('passes cleanly, with no caveat, when the provider reports everything', async () => {
    const result = await selfTest(adapter('x'), account(REQUIRED), REQUIRED);
    expect(result.ok).toBe(true);
    expect(result.summary).toBe('x credential is good.');
  });

  it('an unmeasurable scope check never rescues a failed live read', async () => {
    const result = await selfTest(adapter('threads', false), account([]), REQUIRED);
    expect(result.ok).toBe(false);
    expect(result.summary).toMatch(/live read failed/);
    expect(result.summary).toMatch(/not measured/);
  });
});
