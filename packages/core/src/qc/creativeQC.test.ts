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
