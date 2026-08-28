import { describe, expect, it } from 'vitest';
import { PLATFORM_PROFILES, cutsPerMinuteFor, planVariants } from './variants.js';

const base = {
  primaryPlatform: 'tiktok',
  platforms: ['tiktok', 'instagram', 'youtube', 'pinterest', 'x', 'threads'],
  treatment: 'before_after',
};

describe('planVariants', () => {
  it('gives the primary platform the original', () => {
    const v = planVariants(base).find((x) => x.platform === 'tiktok')!;
    expect(v.decision).toBe('original');
    expect(v.spacingHours).toBe(0);
  });

  it('refuses a concept that does not belong on a surface', () => {
    /*
     * §231. The decision that makes the others honest. A system that always
     * finds a way to post everywhere is a system that posts things it should
     * not — a montage is motion, and Pinterest is a still surface.
     */
    const v = planVariants({ ...base, treatment: 'process_montage' });
    const pin = v.find((x) => x.platform === 'pinterest')!;
    expect(pin.decision).toBe('skip');
    expect(pin.decisionReason).toContain('still surface');
  });

  it('reuses only where the canvas and the feed genuinely match', () => {
    const v = planVariants(base);
    expect(v.find((x) => x.platform === 'instagram')!.decision).toBe('reuse');
    // 2:3 and 16:9 are not 9:16, whatever else is true.
    expect(v.find((x) => x.platform === 'pinterest')!.decision).not.toBe('reuse');
    expect(v.find((x) => x.platform === 'x')!.decision).not.toBe('reuse');
  });

  it('never reuses the hook wording off-platform', () => {
    /*
     * Two accounts posting the identical hook a day apart is the clearest
     * tell that a feed is automated, and the cheapest thing to vary. A reused
     * *edit* still needs its own words.
     */
    for (const v of planVariants(base)) {
      if (v.decision === 'skip') continue;
      expect(v.needsOwnHook, v.platform).toBe(v.platform !== 'tiktok');
    }
  });

  it('separates variants in time rather than posting them together', () => {
    const v = planVariants(base).filter((x) => x.decision !== 'skip' && x.platform !== 'tiktok');
    expect(v.length).toBeGreaterThan(0);
    for (const variant of v) expect(variant.spacingHours, variant.platform).toBeGreaterThan(0);
  });

  it('remixes when the piece depends on narration and the surface is muted', () => {
    const v = planVariants({ ...base, voiceCarriesMeaning: true, treatment: 'comparison' });
    const x = v.find((p) => p.platform === 'x')!;
    expect(x.decision).toBe('remix');
    expect(x.decisionReason).toContain('muted');
  });

  it('skips a platform whose account cannot take video', () => {
    const v = planVariants({ ...base, unsupported: { threads: ['video'] } });
    expect(v.find((x) => x.platform === 'threads')!.decision).toBe('skip');
  });

  it('skips when the concept needs footage that does not exist', () => {
    const v = planVariants({ ...base, needsFootage: true, hasFootage: false });
    expect(v.filter((x) => x.decision === 'skip').length).toBeGreaterThan(0);
  });

  it('gives every platform a materially different creative spec', () => {
    /*
     * The point of the whole module. If every variant resolves to the same
     * pacing, density and hook treatment then "platform-specific" is a column
     * in a table and nothing else.
     */
    const specs = planVariants(base)
      .filter((v) => v.decision !== 'skip')
      .map((v) => `${v.aspectRatio}/${v.pacing}/${v.textDensity}/${v.hookTreatment}/${v.audioTreatment}`);
    expect(new Set(specs).size).toBeGreaterThan(specs.length / 2);
  });

  it('ignores a platform it knows nothing about rather than guessing', () => {
    const v = planVariants({ ...base, platforms: [...base.platforms, 'mastodon'] });
    expect(v.map((x) => x.platform)).not.toContain('mastodon');
  });

  it('gives every profile a runtime consistent with its pacing', () => {
    for (const [platform, p] of Object.entries(PLATFORM_PROFILES)) {
      if (p.seconds[1] === 0) continue; // a still surface
      expect(p.seconds[0], platform).toBeLessThan(p.seconds[1]);
      expect(cutsPerMinuteFor(p.pacing), platform).toBeGreaterThan(0);
    }
  });
});
