/**
 * Campaign planning and the mix override. Milestone 44.
 */
import { describe, expect, it } from 'vitest';
import { PRODUCT_CONTENT_CEILING } from '../generation/ideaEngine.js';
import { effectiveProductCeiling, planCampaign, type CampaignBrief } from './planner.js';

const SIX_PLATFORMS: CampaignBrief['platforms'] = [
  { platform: 'x', persona: 'brand' },
  { platform: 'instagram', persona: 'brand' },
  { platform: 'threads', persona: 'brand' },
  { platform: 'pinterest', persona: 'brand' },
  { platform: 'youtube', persona: 'brand' },
  { platform: 'tiktok', persona: 'brand' },
  { platform: 'x', persona: 'founder' },
];

const PRODUCT_HUNT: CampaignBrief = {
  description:
    'Launching RecipeFix on Product Hunt on the 18th, aiming for top 5 and a thousand adaptations that week.',
  kind: 'launch',
  startsAt: new Date('2026-09-18T00:00:00Z'),
  endsAt: new Date('2026-09-23T00:00:00Z'),
  goal: 'Top 5 on the day, a thousand adaptations that week.',
  platforms: SIX_PLATFORMS,
};

describe('planCampaign', () => {
  it('turns a sentence into a five-day, six-platform sequence', () => {
    // Milestone 44's definition of done, stated as a test.
    const plan = planCampaign(PRODUCT_HUNT);

    const days = new Set(plan.slots.map((s) => s.dayOffset));
    const platforms = new Set(plan.slots.map((s) => s.platform));

    expect(days.size).toBeGreaterThanOrEqual(5);
    expect(platforms.size).toBe(6);
    expect(plan.slots.length).toBeGreaterThanOrEqual(12);
  });

  it('opens with teasers before the window, not on launch day', () => {
    const plan = planCampaign(PRODUCT_HUNT);
    const teasers = plan.slots.filter((s) => s.purpose === 'teaser');
    expect(teasers.length).toBeGreaterThan(0);
    // A launch that starts on launch day is talking to nobody.
    for (const teaser of teasers) expect(teaser.dayOffset).toBeLessThan(0);
  });

  it('staggers the launch-morning burst rather than firing it at one minute', () => {
    const plan = planCampaign(PRODUCT_HUNT);
    const morning = plan.slots
      .filter((s) => s.dayOffset === 0 && s.purpose.startsWith('launch'))
      .map((s) => s.scheduledAt.getTime())
      .sort((a, b) => a - b);

    expect(morning.length).toBe(SIX_PLATFORMS.length);
    for (let i = 1; i < morning.length; i++) {
      // Simultaneous posting to six platforms reads as automation on all six.
      expect(morning[i]! - morning[i - 1]!).toBeGreaterThanOrEqual(20 * 60_000);
    }
  });

  it('makes exactly one post the announcement and the rest platform-native support', () => {
    const plan = planCampaign(PRODUCT_HUNT);
    expect(plan.slots.filter((s) => s.purpose === 'launch_announcement')).toHaveLength(1);
    expect(plan.slots.filter((s) => s.purpose === 'launch_support').length).toBeGreaterThan(0);
  });

  it('puts the results post after the window closes, because it is about the campaign', () => {
    const plan = planCampaign(PRODUCT_HUNT);
    const results = plan.slots.find((s) => s.purpose === 'results')!;
    expect(results.scheduledAt.getTime()).toBeGreaterThan(PRODUCT_HUNT.endsAt.getTime());
  });

  it('does not repeat the same purpose through the middle days', () => {
    const plan = planCampaign(PRODUCT_HUNT);
    const middle = plan.slots.filter((s) => s.dayOffset >= 1 && s.dayOffset < 5);
    expect(new Set(middle.map((s) => s.purpose)).size).toBeGreaterThan(1);
  });

  it('chooses a platform-native format for each slot', () => {
    const plan = planCampaign(PRODUCT_HUNT);
    for (const slot of plan.slots) {
      if (slot.platform === 'youtube' || slot.platform === 'tiktok') {
        expect(slot.format, slot.platform).toBe('video');
      }
      if (slot.platform === 'pinterest') expect(slot.format).toBe('pin');
    }
  });

  it('warns rather than inventing when a slot would need a testimonial', () => {
    const plan = planCampaign(PRODUCT_HUNT);
    if (plan.slots.some((s) => s.purpose === 'social_proof')) {
      expect(plan.warnings.join(' ')).toMatch(/invent a testimonial/);
    }
  });

  it('says so instead of planning when nothing can carry a post', () => {
    const plan = planCampaign({ ...PRODUCT_HUNT, platforms: [] });
    expect(plan.slots).toEqual([]);
    expect(plan.warnings[0]).toMatch(/Connect at least one account/);
  });

  it('warns when there is no founder account for the first-person posts', () => {
    const plan = planCampaign({
      ...PRODUCT_HUNT,
      platforms: SIX_PLATFORMS.filter((p) => p.persona === 'brand'),
    });
    expect(plan.warnings.join(' ')).toMatch(/thank-you and results posts/);
  });

  it('is stable: planning twice from the same brief gives the same timeline', () => {
    const a = planCampaign(PRODUCT_HUNT);
    const b = planCampaign(PRODUCT_HUNT);
    expect(a.slots.map((s) => `${s.key}@${s.scheduledAt.toISOString()}`)).toEqual(
      b.slots.map((s) => `${s.key}@${s.scheduledAt.toISOString()}`),
    );
  });
});

describe('effectiveProductCeiling', () => {
  const window = {
    productMixCeiling: 0.6,
    startsAt: new Date('2026-09-18T00:00:00Z'),
    endsAt: new Date('2026-09-23T00:00:00Z'),
    status: 'running',
  };

  it('lifts the ceiling inside the window', () => {
    const override = effectiveProductCeiling({
      baseCeiling: PRODUCT_CONTENT_CEILING,
      campaign: window,
      now: new Date('2026-09-19T12:00:00Z'),
    });
    expect(override.ceiling).toBe(0.6);
    expect(override.active).toBe(true);
    expect(override.reason).toMatch(/reverts on its own/);
  });

  it('reverts at ends_at without anyone turning it off', () => {
    // The comparison is against the window, not against a flag. A campaign left
    // in `running` past its end date does not keep the ceiling raised.
    const override = effectiveProductCeiling({
      baseCeiling: PRODUCT_CONTENT_CEILING,
      campaign: window,
      now: new Date('2026-09-24T00:00:00Z'),
    });
    expect(override.ceiling).toBe(PRODUCT_CONTENT_CEILING);
    expect(override.active).toBe(false);
    expect(override.reason).toMatch(/window closed/);
  });

  it('does not lift the ceiling before the campaign starts', () => {
    const override = effectiveProductCeiling({
      baseCeiling: PRODUCT_CONTENT_CEILING,
      campaign: window,
      now: new Date('2026-09-17T23:00:00Z'),
    });
    expect(override.ceiling).toBe(PRODUCT_CONTENT_CEILING);
    expect(override.reason).toMatch(/not started/);
  });

  it('ignores an abandoned campaign even inside its dates', () => {
    const override = effectiveProductCeiling({
      baseCeiling: PRODUCT_CONTENT_CEILING,
      campaign: { ...window, status: 'abandoned' },
      now: new Date('2026-09-19T12:00:00Z'),
    });
    expect(override.ceiling).toBe(PRODUCT_CONTENT_CEILING);
  });

  it('applies the normal ceiling when no campaign exists', () => {
    const override = effectiveProductCeiling({
      baseCeiling: PRODUCT_CONTENT_CEILING,
      campaign: null,
    });
    expect(override.ceiling).toBe(PRODUCT_CONTENT_CEILING);
    expect(override.active).toBe(false);
  });
});
