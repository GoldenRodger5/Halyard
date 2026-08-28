/**
 * Rehearsal across every connected platform, sending nothing. §200.
 *
 * The point of these is that they are *fast*. Before the clock was injectable,
 * an Instagram rehearsal ran for five wall-clock minutes and then died of heap
 * exhaustion, so this file could not have existed. Each test carries an
 * explicit timeout: a regression that reintroduces real waiting fails here
 * loudly instead of hanging a CI run.
 */
import { describe, expect, it } from 'vitest';
import { getAdapter } from './index.js';
import { dryRunPublish } from './dryRun.js';
import { createVirtualClock, clockFor, maxPollsFor, systemClock } from './clock.js';
import type { PublishAccount, PublishAsset, PublishItem } from './types.js';

function account(platform: string, overrides: Partial<PublishAccount> = {}): PublishAccount {
  return {
    id: `${platform}-acct`,
    platform: platform as PublishAccount['platform'],
    handle: `@rehearsal`,
    platformUserId: 'rehearsal-user',
    capabilityState: 'live',
    tokens: {
      accessToken: 'rehearsal-token',
      refreshToken: null,
      expiresAt: null,
      scopes: [],
    },
    ...overrides,
  } as PublishAccount;
}

function item(platform: string, overrides: Partial<PublishItem> = {}): PublishItem {
  return {
    id: 'item-1',
    platform: platform as PublishItem['platform'],
    format: 'video',
    body: 'Five mistakes people make when cooking salmon.',
    title: 'Five salmon mistakes',
    hashtags: ['salmon', 'cooking'],
    finalLinkUrl: 'https://recipefix.app/?utm_source=rehearsal',
    ...overrides,
  } as PublishItem;
}

const video: PublishAsset = {
  id: 'asset-1',
  publicUrl: 'https://halyard.invalid/media/asset-1',
  mimeType: 'video/mp4',
  kind: 'video',
  width: 1080,
  height: 1920,
  durationSeconds: 30,
};

describe('the virtual clock', () => {
  it('advances only when something sleeps', async () => {
    const clock = createVirtualClock();
    const start = clock.now();
    await clock.sleep(5_000);
    await clock.sleep(5_000);
    expect(clock.now() - start).toBe(10_000);
    expect(clock.sleeps()).toBe(2);
  });

  it('reaches a five-minute deadline in sixty five-second sleeps', async () => {
    const clock = createVirtualClock();
    const deadline = clock.now() + 5 * 60_000;
    let polls = 0;
    while (clock.now() <= deadline) {
      polls += 1;
      await clock.sleep(5_000);
    }
    expect(polls).toBe(61);
  });

  it('prefers an injected clock, then a bare sleep, then the system one', () => {
    const clock = createVirtualClock();
    expect(clockFor({ clock })).toBe(clock);

    const sleep = async () => undefined;
    const wrapped = clockFor({ sleep });
    expect(wrapped).not.toBe(systemClock);
    expect(wrapped.sleep).toBe(sleep);

    expect(clockFor(undefined)).toBe(systemClock);
    expect(clockFor({})).toBe(systemClock);
  });

  it('bounds polls independently of the clock', () => {
    expect(maxPollsFor(5 * 60_000, 5_000)).toBe(61);
    expect(maxPollsFor(1000, 0)).toBe(1);
  });
});

describe('dryRunPublish sends nothing and finishes fast', () => {
  /**
   * The regression this file exists for. Instagram polls a Reel container, and
   * §184 moved it to a host the dry-run stub did not answer — so the container
   * never reported FINISHED and the loop ran to its ceiling recording a request
   * every pass.
   */
  it('rehearses an Instagram Reel without spinning', { timeout: 5_000 }, async () => {
    const result = await dryRunPublish(
      getAdapter('instagram'),
      item('instagram'),
      [video],
      account('instagram'),
    );
    expect(result.failed).toBe(false);
    expect(result.requests.length).toBeLessThan(20);
    expect(result.requests.some((r) => r.method === 'POST')).toBe(true);
  });

  it('rehearses X and reports the cost before anything is spent', { timeout: 5_000 }, async () => {
    const result = await dryRunPublish(
      getAdapter('x'),
      item('x', { format: 'text' }),
      [],
      account('x'),
    );
    expect(result.failed).toBe(false);
    expect(result.estimatedCostUsd).toBeGreaterThan(0);
    expect(result.wouldHave).toMatch(/costing about/);
  });

  it('rehearses Threads', { timeout: 5_000 }, async () => {
    const result = await dryRunPublish(
      getAdapter('threads'),
      item('threads', { format: 'text' }),
      [],
      account('threads'),
    );
    expect(result.failed).toBe(false);
  });

  it('rehearses a YouTube upload', { timeout: 5_000 }, async () => {
    const result = await dryRunPublish(
      getAdapter('youtube'),
      item('youtube', { formatSubtype: 'short' }),
      [video],
      account('youtube'),
    );
    expect(result.failed).toBe(false);
    expect(result.requests.some((r) => r.url.includes('googleapis.com'))).toBe(true);
  });

  it('never records an unredacted bearer token', { timeout: 10_000 }, async () => {
    for (const platform of ['x', 'threads', 'instagram', 'youtube'] as const) {
      const result = await dryRunPublish(
        getAdapter(platform),
        item(platform, platform === 'x' || platform === 'threads' ? { format: 'text' } : {}),
        platform === 'x' || platform === 'threads' ? [] : [video],
        account(platform),
      );
      const dump = JSON.stringify(result.requests);
      expect(dump).not.toContain('rehearsal-token');
    }
  });
});
