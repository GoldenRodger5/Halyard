/**
 * §352. One production, several finishes. Every threshold is a number a
 * platform imposes, so every test is about a piece being wrong *there*.
 */
import { describe, it, expect } from 'vitest';
import { PLATFORM_FINISHES, checkFinish, finishFor } from './platformFinish.js';

describe('checkFinish', () => {
  it('passes a piece on Shorts and fails the same piece on TikTok', () => {
    /*
     * The case that makes this worth having: publish.ts sends the identical
     * file to both, and one of them is too slow to open.
     */
    const piece = { openingLandsAtSeconds: 1.2 };
    expect(checkFinish(piece, PLATFORM_FINISHES.youtube!)).toEqual([]);
    expect(checkFinish(piece, PLATFORM_FINISHES.tiktok!).map((p) => p.rule)).toContain(
      'finish.slow_opening',
    );
  });

  it('says where a caption is cut rather than calling length an error', () => {
    /* A long caption is normal; the question is whether the point survives. */
    const caption = 'x'.repeat(400);
    const problems = checkFinish({ caption }, PLATFORM_FINISHES.tiktok!);
    expect(problems[0]!.rule).toBe('finish.caption_truncated');
    expect(problems[0]!.detail).toContain('cut after');
  });

  it('allows a long caption where the platform shows it', () => {
    expect(checkFinish({ caption: 'x'.repeat(400) }, PLATFORM_FINISHES.threads!)).toEqual([]);
  });

  it('catches a link in the body where the platform wants it elsewhere', () => {
    expect(
      checkFinish({ captionHasLink: true }, PLATFORM_FINISHES.x!).map((p) => p.rule),
    ).toContain('finish.link_misplaced');
    /* Threads is the one feed platform here that takes a body link. */
    expect(checkFinish({ captionHasLink: true }, PLATFORM_FINISHES.threads!)).toEqual([]);
  });

  it('catches text sitting under the platform’s own buttons', () => {
    /*
     * Different from a safe-area check: this is where the *platform* draws its
     * caption and follow button, so a piece can pass safe area and still have
     * its last line covered.
     */
    const problems = checkFinish({ lowestTextFraction: 0.85 }, PLATFORM_FINISHES.tiktok!);
    expect(problems.map((p) => p.rule)).toContain('finish.under_platform_ui');
    /* The same position is fine on X, which draws far less over the frame. */
    expect(checkFinish({ lowestTextFraction: 0.85 }, PLATFORM_FINISHES.x!)).toEqual([]);
  });

  it('passes a piece that fits everywhere', () => {
    const piece = { openingLandsAtSeconds: 0.4, caption: 'Short.', lowestTextFraction: 0.6 };
    for (const finish of Object.values(PLATFORM_FINISHES)) {
      expect(checkFinish(piece, finish), finish.platform).toEqual([]);
    }
  });

  it('explains every problem with the reason the platform imposes it', () => {
    const problems = checkFinish({ openingLandsAtSeconds: 3 }, PLATFORM_FINISHES.tiktok!);
    expect(problems[0]!.detail).toContain('recommendation feed');
  });
});

describe('the finishes', () => {
  it('orders opening budgets the way the surfaces actually behave', () => {
    /* A cold recommendation feed decides fastest; a search surface slowest. */
    expect(PLATFORM_FINISHES.tiktok!.openingSeconds).toBeLessThan(
      PLATFORM_FINISHES.instagram!.openingSeconds,
    );
    expect(PLATFORM_FINISHES.instagram!.openingSeconds).toBeLessThan(
      PLATFORM_FINISHES.youtube!.openingSeconds,
    );
    expect(PLATFORM_FINISHES.pinterest!.openingSeconds).toBeGreaterThan(
      PLATFORM_FINISHES.youtube!.openingSeconds,
    );
  });

  it('agrees with each adapter about where a link goes', () => {
    /* A second list that could disagree with the adapters is what §349 removed;
       this asserts they match rather than trusting they do. */
    expect(PLATFORM_FINISHES.x!.linkStrategy).toBe('first_reply');
    expect(PLATFORM_FINISHES.threads!.linkStrategy).toBe('in_body');
    expect(PLATFORM_FINISHES.tiktok!.linkStrategy).toBe('bio_only');
    expect(PLATFORM_FINISHES.pinterest!.linkStrategy).toBe('pin_destination');
  });

  it('returns null for a platform with no finish rather than a default', () => {
    /* A silent default would publish a piece against thresholds nobody set. */
    expect(finishFor('bluesky')).toBeNull();
  });
});
