/**
 * §205. The acceptance criterion, stated as a test.
 *
 * The brief is explicit: "A static recipe text card with minor movement should
 * FAIL creative QA." The first test is that sentence, and the second is the
 * one that keeps the gate honest — the same card sequence must *pass* when
 * there was no footage to show, because a defect no correction can clear is a
 * gate that gets switched off.
 */
import { describe, expect, it } from 'vitest';
import { MAX_WORDS_PER_BEAT, runCreativeQC, type CreativeQCInput } from './creativeQC.js';

/** Seven cards, a word swapping on each. The thing that was objected to. */
const textCardStack: CreativeQCInput = {
  creativeType: 'before_after',
  platform: 'tiktok',
  footageAvailable: true,
  beats: [
    { role: 'hook', emphasis: 'quick', wordCount: 5 },
    { role: 'change', emphasis: 'hold', wordCount: 8 },
    { role: 'change', emphasis: 'normal', wordCount: 7 },
    { role: 'change', emphasis: 'normal', wordCount: 9 },
    { role: 'change', emphasis: 'normal', wordCount: 6 },
  ],
};

describe('the acceptance criterion', () => {
  it('fails a stack of text cards when a product recording existed', () => {
    const result = runCreativeQC(textCardStack);
    expect(result.passed).toBe(false);
    expect(result.findings.map((f) => f.rule)).toContain('creative.unused_product_footage');
    expect(result.summary).toMatch(/shows none of it/);
  });

  it('names the correction, so the defect is actionable', () => {
    const finding = runCreativeQC(textCardStack).findings.find(
      (f) => f.rule === 'creative.unused_product_footage',
    )!;
    expect(finding.correction).toBe('use_captured_footage');
    expect(finding.severity).toBe('error');
  });

  /**
   * The rule that keeps this gate from being switched off. Card creative is not
   * a defect; card creative *instead of available footage* is.
   */
  it('passes the same cards when there was no footage to use', () => {
    const result = runCreativeQC({ ...textCardStack, footageAvailable: false });
    expect(result.findings.map((f) => f.rule)).not.toContain('creative.unused_product_footage');
    expect(result.unmeasured).toContain('creative.unused_product_footage');
  });

  it('passes once the footage is actually used', () => {
    const withFootage: CreativeQCInput = {
      ...textCardStack,
      beats: [
        { role: 'hook', emphasis: 'quick', wordCount: 5 },
        { role: 'demo', emphasis: 'hold', hasMedia: true },
        { role: 'change', emphasis: 'normal', wordCount: 7 },
        { role: 'proof', emphasis: 'normal', wordCount: 9 },
      ],
    };
    const result = runCreativeQC(withFootage);
    expect(result.passed).toBe(true);
    expect(result.cardShare).toBeLessThan(1);
    expect(result.summary).toMatch(/% footage/);
  });
});

describe('structural defects', () => {
  it('fails a piece whose every beat is the same role', () => {
    const result = runCreativeQC({
      ...textCardStack,
      footageAvailable: false,
    });
    expect(result.findings.map((f) => f.rule)).toContain('creative.single_role');
    expect(result.passed).toBe(false);
  });

  it('does not call a varied piece monotonous', () => {
    const varied = runCreativeQC({
      creativeType: 'how_to',
      platform: 'tiktok',
      footageAvailable: false,
      beats: [
        { role: 'hook', emphasis: 'quick', wordCount: 5 },
        { role: 'step', emphasis: 'normal', wordCount: 10 },
        { role: 'step', emphasis: 'normal', wordCount: 9 },
        { role: 'result', emphasis: 'hold', wordCount: 6 },
      ],
    });
    expect(varied.findings.map((f) => f.rule)).not.toContain('creative.single_role');
    expect(varied.passed).toBe(true);
  });

  it('warns when nothing is held', () => {
    const flat = runCreativeQC({
      creativeType: 'listicle',
      platform: 'tiktok',
      footageAvailable: false,
      beats: [
        { role: 'hook', emphasis: 'quick' },
        { role: 'item', emphasis: 'normal' },
        { role: 'step', emphasis: 'normal' },
      ],
    });
    const payoff = flat.findings.find((f) => f.rule === 'creative.no_payoff')!;
    expect(payoff.severity).toBe('warning');
    // A warning does not block.
    expect(flat.passed).toBe(true);
  });

  it('warns on a beat nobody will read', () => {
    const wordy = runCreativeQC({
      creativeType: 'how_to',
      platform: 'tiktok',
      footageAvailable: false,
      beats: [
        { role: 'hook', emphasis: 'quick', wordCount: 5 },
        { role: 'step', emphasis: 'hold', wordCount: MAX_WORDS_PER_BEAT + 12 },
        { role: 'result', emphasis: 'normal', wordCount: 6 },
      ],
    });
    const dense = wordy.findings.find((f) => f.rule === 'creative.text_density')!;
    expect(dense.beatIndex).toBe(1);
    expect(dense.correction).toBe('reduce_text');
  });

  it('refuses an empty creative outright', () => {
    const empty = runCreativeQC({
      creativeType: 'before_after',
      platform: 'tiktok',
      footageAvailable: false,
      beats: [],
    });
    expect(empty.passed).toBe(false);
    expect(empty.findings[0]!.rule).toBe('creative.no_beats');
  });
});

describe('repetition across the account', () => {
  const base: CreativeQCInput = {
    creativeType: 'how_to',
    platform: 'tiktok',
    footageAvailable: false,
    beats: [
      { role: 'hook', emphasis: 'quick', wordCount: 5 },
      { role: 'step', emphasis: 'normal', wordCount: 8 },
      { role: 'result', emphasis: 'hold', wordCount: 6 },
    ],
  };

  it('says nothing on a first use', () => {
    const r = runCreativeQC({ ...base, recentTypes: ['listicle', 'comparison'] });
    expect(r.findings.map((f) => f.rule)).not.toContain('creative.repeated_treatment');
  });

  it('warns at two in a row', () => {
    const r = runCreativeQC({ ...base, recentTypes: ['how_to', 'how_to', 'listicle'] });
    const rep = r.findings.find((f) => f.rule === 'creative.repeated_treatment')!;
    expect(rep.severity).toBe('warning');
    expect(r.passed).toBe(true);
  });

  it('fails at three, because by then it is the only format', () => {
    const r = runCreativeQC({ ...base, recentTypes: ['how_to', 'how_to', 'how_to'] });
    const rep = r.findings.find((f) => f.rule === 'creative.repeated_treatment')!;
    expect(rep.severity).toBe('error');
    expect(rep.correction).toBe('vary_treatment');
    expect(r.passed).toBe(false);
  });

  it('reports repetition as unmeasured when no history was supplied', () => {
    expect(runCreativeQC(base).unmeasured).toContain('creative.repeated_treatment');
  });
});

describe('the creative acceptance suite', () => {
  /*
   * §234. Everything the gate judges beyond beat structure. Each rule here is
   * a way a piece can be technically fine and creatively bad, which is the
   * only class of defect that survives every other check.
   */
  const sound: CreativeQCInput = {
    creativeType: 'before_after',
    platform: 'tiktok',
    footageAvailable: false,
    durationSeconds: 30,
    beats: [
      { role: 'hook', emphasis: 'hold', wordCount: 6 },
      { role: 'change', emphasis: 'normal', wordCount: 8 },
      { role: 'proof', emphasis: 'normal', wordCount: 7 },
      { role: 'cta', emphasis: 'quick', wordCount: 4 },
    ],
    motions: [
      { entrance: 'pop', camera: 'still', transitionOut: 'cut' },
      { entrance: 'slide', camera: 'push', transitionOut: 'cut' },
      { entrance: 'none', camera: 'still', transitionOut: 'cut' },
      { entrance: 'rise', camera: 'still', transitionOut: 'cut' },
    ],
    visualLanguage: 'kinetic',
    typography: 'grotesque_punch',
    opening: 'statement',
    recentLanguages: ['documentary'],
    recentOpenings: ['question'],
    recentTypography: ['editorial_serif'],
    hasMusic: true,
    lufs: -14,
    altText: 'A before and after of a bread flour swap',
    targetCutsPerMinute: 8,
  };

  it('passes a piece with nothing wrong with it', () => {
    const r = runCreativeQC(sound);
    expect(r.findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(r.passed).toBe(true);
  });

  it('fails a slideshow against the pacing this platform expects', () => {
    // Three beats over 30s is correct on YouTube and a slideshow on TikTok.
    // The number judged against is the variant's, not a constant.
    const r = runCreativeQC({ ...sound, targetCutsPerMinute: 30 });
    expect(r.findings.map((f) => f.rule)).toContain('creative.pacing_too_slow');
    expect(r.passed).toBe(false);
  });

  it('fails a piece where nothing moves', () => {
    const r = runCreativeQC({
      ...sound,
      motions: sound.motions!.map(() => ({ entrance: 'none', camera: 'still', transitionOut: 'cut' })),
    });
    expect(r.findings.map((f) => f.rule)).toContain('creative.no_motion');
    expect(r.passed).toBe(false);
  });

  it('warns when everything moves, because then no move means anything', () => {
    const r = runCreativeQC({
      ...sound,
      motions: sound.motions!.map(() => ({ entrance: 'pop', camera: 'push', transitionOut: 'crossfade' })),
    });
    expect(r.findings.map((f) => f.rule)).toContain('creative.constant_motion');
  });

  it('does not warn about uniform motion in a language built on it', () => {
    /*
     * Found by running the gate on a real production render. A
     * `premium_instructional` piece was warned for constant motion, and that
     * language deliberately slides every beat in from the same side so the
     * sequence reads as a sequence. A rule that fires on every piece in a
     * language is noise, and noise is how a warning stops being read.
     */
    const uniform = sound.motions!.map(() => ({
      entrance: 'slide',
      camera: 'push',
      transitionOut: 'push_through',
    }));
    expect(
      runCreativeQC({ ...sound, visualLanguage: 'premium_instructional', motions: uniform })
        .findings.map((f) => f.rule),
    ).not.toContain('creative.constant_motion');
    /* And still fires for a language where it is an accident. */
    expect(
      runCreativeQC({ ...sound, visualLanguage: 'kinetic', motions: uniform })
        .findings.map((f) => f.rule),
    ).toContain('creative.constant_motion');
  });

  it('catches repetition the treatment rule cannot see', () => {
    /*
     * The hole the original repetition rule left. Two posts can use different
     * treatments and still be set in the same type, open the same way and cut
     * in the same language — which is what a viewer actually notices.
     */
    const r = runCreativeQC({
      ...sound,
      recentLanguages: ['kinetic'],
      recentOpenings: ['statement'],
      recentTypography: ['grotesque_punch'],
    });
    const rules = r.findings.map((f) => f.rule);
    expect(rules).toContain('creative.repeated_language');
    expect(rules).toContain('creative.repeated_opening');
    expect(rules).toContain('creative.repeated_typography');
  });

  it('distinguishes chosen silence from silence nobody noticed', () => {
    // §221's argument, enforced: narration alone is a normal style, and an
    // unexplained silence is indistinguishable from a bed that failed to mix.
    expect(
      runCreativeQC({ ...sound, hasMusic: false, musicSkippedReason: 'library is empty' })
        .findings.map((f) => f.rule),
    ).not.toContain('creative.unexplained_silence');

    expect(
      runCreativeQC({ ...sound, hasMusic: false, musicSkippedReason: null })
        .findings.map((f) => f.rule),
    ).toContain('creative.unexplained_silence');
  });

  it('flags a mix far from what platforms normalise to', () => {
    expect(runCreativeQC({ ...sound, lufs: -28 }).findings.map((f) => f.rule))
      .toContain('creative.loudness_off_target');
    expect(runCreativeQC({ ...sound, lufs: -14 }).findings.map((f) => f.rule))
      .not.toContain('creative.loudness_off_target');
  });

  it('flags a rendered asset with no alt text', () => {
    expect(runCreativeQC({ ...sound, altText: '' }).findings.map((f) => f.rule))
      .toContain('creative.missing_alt_text');
  });

  it('names every rule it could not run rather than passing it', () => {
    /*
     * Gotcha 6, and the reason each new field is optional. A gate given no
     * motion data has not judged the motion, and reporting a pass would be
     * the exact failure `unmeasured` exists to prevent.
     */
    const bare: CreativeQCInput = {
      creativeType: 'before_after',
      platform: 'tiktok',
      footageAvailable: false,
      beats: sound.beats,
    };
    const r = runCreativeQC(bare);
    for (const rule of [
      'creative.pacing_too_slow',
      'creative.no_motion',
      'creative.repeated_language',
      'creative.repeated_opening',
      'creative.repeated_typography',
      'creative.loudness_off_target',
      'creative.missing_alt_text',
    ]) {
      expect(r.unmeasured, `${rule} must be reported unmeasured`).toContain(rule);
    }
  });
});

describe('§478 licensed footage', () => {
  const withClips: CreativeQCInput = {
    ...textCardStack,
    beats: textCardStack.beats.map((b, i) => (i === 1 || i === 2 ? { ...b, hasFootage: true } : b)),
  };

  it('is not a card, so it lowers the card share', () => {
    expect(runCreativeQC(withClips).cardShare).toBeLessThan(runCreativeQC(textCardStack).cardShare);
  });

  it('is not the product, so a capture that went unused still fails the piece', () => {
    const result = runCreativeQC(withClips);
    expect(result.findings.map((f) => f.rule)).toContain('creative.unused_product_footage');
  });

  it('standing where proof belongs is fabricated evidence, named as a clip', () => {
    const result = runCreativeQC({
      ...textCardStack,
      footageAvailable: false,
      beats: [
        { role: 'hook', emphasis: 'quick', wordCount: 5 },
        { role: 'proof', emphasis: 'hold', wordCount: 6, imageProvenance: 'licensed', hasFootage: true },
        { role: 'cta', emphasis: 'normal', wordCount: 4 },
      ],
    });
    const finding = result.findings.find((f) => f.rule === 'creative.fabricated_evidence');
    expect(finding?.message).toMatch(/licensed clip/);
    expect(finding?.beatIndex).toBe(1);
  });
});
