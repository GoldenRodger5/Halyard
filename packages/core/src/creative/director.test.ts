import { describe, expect, it } from 'vitest';
import { directCreative, type DirectionInput } from './director.js';
import { TYPOGRAPHY_FOR_LANGUAGE } from './typography.js';

const base: DirectionInput = {
  platform: 'tiktok',
  treatment: 'before_after',
  targetSeconds: 30,
  hasImagery: true,
};

describe('directCreative', () => {
  it('produces a language every downstream module can consume', () => {
    /*
     * §228. The director exists so the downstream choices agree. A language
     * with no typography would leave `selectTypography` falling back across
     * all systems, which is the compatibility rule silently switched off.
     */
    for (const platform of ['tiktok', 'instagram', 'youtube', 'pinterest', 'x', 'threads']) {
      const { language } = directCreative({ ...base, platform });
      expect(TYPOGRAPHY_FOR_LANGUAGE[language], `${platform} -> ${language}`).toBeDefined();
    }
  });

  it('chooses differently for different platforms', () => {
    // The whole point of a platform-aware director. TikTok and Pinterest are
    // not the same surface and should not get the same film.
    const tiktok = directCreative({ ...base, platform: 'tiktok' }).language;
    const pinterest = directCreative({ ...base, platform: 'pinterest' }).language;
    expect(tiktok).not.toBe(pinterest);
  });

  it('refuses product_led when there is no product footage', () => {
    /*
     * Not a penalty — a refusal. `product_led` means the footage leads, and
     * without footage there is nothing leading; the language would resolve to
     * "restrained motion around nothing".
     */
    const r = directCreative({ ...base, treatment: 'feature_demo', hasProductFootage: false });
    expect(r.language).not.toBe('product_led');
    expect(r.considered.map((c) => c.language)).not.toContain('product_led');
  });

  it('allows product_led once footage exists', () => {
    const r = directCreative({
      ...base,
      platform: 'youtube',
      treatment: 'feature_demo',
      hasProductFootage: true,
    });
    expect(r.language).toBe('product_led');
  });

  it('will not make a 10-second piece cinematic', () => {
    const r = directCreative({ ...base, targetSeconds: 10 });
    expect(r.considered.map((c) => c.language)).not.toContain('cinematic');
  });

  it('will not make a three-minute piece a fast-cut creator edit', () => {
    const r = directCreative({ ...base, targetSeconds: 180 });
    expect(r.considered.map((c) => c.language)).not.toContain('fast_cut_creator');
  });

  it('moves on from what the account just did', () => {
    /*
     * The failure this director exists to prevent. Without recency a strong
     * default wins forever and every video on the account looks the same,
     * which is the original complaint.
     */
    const first = directCreative(base).language;
    const second = directCreative({ ...base, recentLanguages: [first] }).language;
    expect(second).not.toBe(first);
  });

  it('rotates across a run rather than alternating', () => {
    const used: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      used.unshift(directCreative({ ...base, recentLanguages: used }).language);
    }
    expect(new Set(used).size).toBe(used.length);
  });

  it('lets the emotional angle argue', () => {
    const craving = directCreative({
      ...base,
      platform: 'instagram',
      emotionalAngle: 'craving something rich',
    });
    expect(craving.language).toBe('editorial_food');
    expect(craving.reason).toContain('emotional angle');
  });

  it('lets measurement tilt the decision without deciding it', () => {
    /*
     * An insight is a belief with a confidence, not a fact. A single strong
     * result should move a decision, and a weak one should not overturn
     * platform fit.
     */
    const insight = {
      feature: 'visual_language',
      featureValue: 'playful',
      lift: 0.9,
      confidence: 0.9,
    } as never;
    const without = directCreative({ ...base, platform: 'instagram' });
    const with_ = directCreative({ ...base, platform: 'instagram', insights: [insight] });
    const scoreOf = (r: typeof without, l: string) =>
      r.considered.find((c) => c.language === l)?.score ?? 0;
    expect(scoreOf(with_, 'playful')).toBeGreaterThan(scoreOf(without, 'playful'));
  });

  it('explains itself against the alternatives', () => {
    const r = directCreative(base);
    expect(r.considered.length).toBeGreaterThan(3);
    expect(r.considered[0]!.language).toBe(r.language);
    expect(r.reason).toContain(r.language);
  });

  it('honours a pin, and says so when the pin was a bad idea', () => {
    const r = directCreative({ ...base, treatment: 'feature_demo', hasProductFootage: false, pinned: 'product_led' });
    expect(r.language).toBe('product_led');
    expect(r.reason).toContain('over an objection');
  });

  it('falls back to something that needs only words when everything is refused', () => {
    // A real state: a very short, text-only piece with no assets at all.
    const r = directCreative({
      platform: 'unknown_platform',
      treatment: 'unknown',
      targetSeconds: 8,
      hasImagery: false,
      hasProductFootage: false,
    });
    expect(r.language).toBeDefined();
    expect(TYPOGRAPHY_FOR_LANGUAGE[r.language]).toBeDefined();
  });
});
