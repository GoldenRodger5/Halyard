import { describe, expect, it } from 'vitest';
import fixture from '../connectors/__fixtures__/recipeAdaptation.json' with { type: 'json' };
import {
  disclosureSatisfied,
  gatesAfterEdit,
  isBareHomepage,
  looksUnextracted,
  requiresAiLabel,
  runAllGates,
  runDestinationQC,
  slopFilter,
  suggestedDisclosure,
} from './index.js';
import { runVisualQC, VISION_RUBRIC, type MediaProbe } from './visualQC.js';
import type { GateResult } from './index.js';
import {
  normaliseForSpeech,
  numberToWords,
  runAudioQC,
  wordErrorRate,
} from './audioQC.js';

const artifact = fixture as unknown as Record<string, unknown>;

describe('visual QC — v2 F.3', () => {
  const square: MediaProbe = { kind: 'image', width: 1080, height: 1080 };

  it('passes a correctly-sized square card', () => {
    const result = runVisualQC(square, { aspectRatio: '1:1', platform: 'instagram', format: 'image' });
    expect(result.passed).toBe(true);
  });

  it('rejects an aspect ratio that does not match the target', () => {
    const result = runVisualQC(square, { aspectRatio: '9:16', platform: 'tiktok', format: 'video' });
    expect(result.passed).toBe(false);
    expect(result.findings[0]?.rule).toBe('visual.aspect_ratio');
  });

  it('rejects a carousel whose slides differ in ratio', () => {
    const result = runVisualQC(
      { kind: 'image', width: 1080, height: 1350 },
      {
        aspectRatio: '4:5',
        platform: 'instagram',
        format: 'carousel',
        carouselSiblings: [
          { kind: 'image', width: 1080, height: 1350 },
          { kind: 'image', width: 1080, height: 1350 },
          { kind: 'image', width: 1080, height: 1080 },
        ],
      },
    );
    const finding = result.findings.find((f) => f.rule === 'visual.carousel_consistency');
    expect(finding?.message).toContain('Slides 3');
    expect(finding?.detail).toContain('crops every slide');
  });

  it('rejects text inside the 12% safe area on a vertical format', () => {
    const result = runVisualQC(
      {
        kind: 'image',
        width: 1080,
        height: 1920,
        textBoxes: [{ x: 0.1, y: 0.05, width: 0.8, height: 0.08 }],
      },
      { aspectRatio: '9:16', platform: 'tiktok', format: 'video' },
    );
    expect(result.passed).toBe(false);
    expect(result.findings[0]?.message).toContain('safe area');
  });

  it('warns, without blocking, when text is merely close to the safe area', () => {
    const result = runVisualQC(
      {
        kind: 'image',
        width: 1080,
        height: 1920,
        textBoxes: [{ x: 0.1, y: 0.13, width: 0.8, height: 0.08 }],
      },
      { aspectRatio: '9:16', platform: 'tiktok', format: 'video' },
    );
    expect(result.passed).toBe(true);
    expect(result.findings[0]?.severity).toBe('warning');
  });

  it('rejects text below WCAG AA contrast', () => {
    const result = runVisualQC(
      {
        kind: 'image',
        width: 1080,
        height: 1080,
        textBoxes: [{ x: 0.1, y: 0.4, width: 0.8, height: 0.1, contrastRatio: 2.9 }],
      },
      { aspectRatio: '1:1', platform: 'instagram', format: 'image' },
    );
    expect(result.findings[0]?.rule).toBe('visual.contrast');
  });

  it('applies platform duration bounds', () => {
    const long = runVisualQC(
      { kind: 'video', width: 1080, height: 1920, durationSeconds: 185 },
      { aspectRatio: '9:16', platform: 'instagram', format: 'video' },
    );
    expect(long.findings.some((f) => f.rule === 'visual.duration')).toBe(true);

    const short = runVisualQC(
      { kind: 'video', width: 1080, height: 1920, durationSeconds: 45 },
      { aspectRatio: '9:16', platform: 'youtube', format: 'video' },
    );
    expect(short.findings.some((f) => f.rule === 'visual.duration')).toBe(false);
  });

  /*
   * §438. This case is the correction itself, kept as a test.
   *
   * Both numbers were legal and both were being refused: Reels went from 90
   * seconds to three minutes, Shorts from 60 to 180. The assertion above used
   * to prove the 95-second refusal was *correct*, which is how a stale fact
   * survives a green suite — the test agreed with the constant and neither
   * agreed with the platform.
   *
   * These bounds are legality, not distribution. A 150-second Reel passes here
   * and is still a bad piece; `docs/DIRECTION_SPEC.md` Part 1 is the band that
   * decides that, and it is much tighter.
   */
  it('accepts the lengths the platforms raised their caps to', () => {
    for (const [platform, seconds] of [
      ['instagram', 95],
      ['instagram', 170],
      ['youtube', 95],
      ['youtube', 170],
    ] as const) {
      const result = runVisualQC(
        { kind: 'video', width: 1080, height: 1920, durationSeconds: seconds },
        { aspectRatio: '9:16', platform, format: 'video' },
      );
      expect(
        result.findings.some((f) => f.rule === 'visual.duration'),
        `${seconds}s on ${platform}`,
      ).toBe(false);
    }
  });

  it('rejects loudness outside −14 LUFS ±1 and true peaks above −1 dBTP', () => {
    const result = runVisualQC(
      {
        kind: 'video',
        width: 1080,
        height: 1920,
        durationSeconds: 28,
        loudnessLufs: -9.4,
        truePeakDbtp: 0.4,
      },
      { aspectRatio: '9:16', platform: 'tiktok', format: 'video' },
    );
    expect(result.findings.map((f) => f.rule)).toEqual(
      expect.arrayContaining(['visual.loudness', 'visual.true_peak']),
    );
  });

  it('allows a black opening frame but not a black interior frame', () => {
    const fadeIn = runVisualQC(
      {
        kind: 'video',
        width: 1080,
        height: 1920,
        durationSeconds: 20,
        frameLuminance: [0.01, 0.4, 0.5, 0.45],
      },
      { aspectRatio: '9:16', platform: 'tiktok', format: 'video' },
    );
    expect(fadeIn.findings.some((f) => f.rule === 'visual.black_frames')).toBe(false);

    const dropout = runVisualQC(
      {
        kind: 'video',
        width: 1080,
        height: 1920,
        durationSeconds: 20,
        frameLuminance: [0.4, 0.01, 0.5, 0.45],
      },
      { aspectRatio: '9:16', platform: 'tiktok', format: 'video' },
    );
    expect(dropout.findings.some((f) => f.rule === 'visual.black_frames')).toBe(true);
  });

  it('rejects caption drift over 200ms', () => {
    const result = runVisualQC(
      { kind: 'video', width: 1080, height: 1920, durationSeconds: 20, captionDriftMs: 340 },
      { aspectRatio: '9:16', platform: 'tiktok', format: 'video' },
    );
    expect(result.findings.some((f) => f.rule === 'visual.caption_drift')).toBe(true);
  });

  it('rejects below 3.5 on any vision dimension and reports the average', () => {
    const result = runVisualQC(
      { kind: 'image', width: 1080, height: 1080 },
      { aspectRatio: '1:1', platform: 'instagram', format: 'image' },
      {
        textLegibility: 4.6,
        composition: 3.1,
        brandColors: 4.8,
        feedFit: 4.2,
        machineArtefacts: 4.5,
      },
    );
    expect(result.passed).toBe(false);
    expect(result.summary).toContain('failed');
  });

  it('keeps the rubric versioned with the code', () => {
    expect(VISION_RUBRIC).toContain('machineArtefacts');
    expect(VISION_RUBRIC).toContain('well-produced food account feed');
  });
});

describe('audio QC — v2 F.4', () => {
  it('spells out numbers, temperatures and fractions before synthesis', () => {
    expect(normaliseForSpeech('Bake at 450°F for 35 minutes.')).toBe(
      'Bake at four hundred fifty degrees Fahrenheit for thirty five minutes.',
    );
    expect(normaliseForSpeech('Add 1¾ tsp salt.')).toContain('one and three quarters');
    expect(normaliseForSpeech('Use 1 3/4 cups water.')).toContain('one and three quarters');
    expect(normaliseForSpeech('Add 1/2 teaspoon.')).toContain('one half');
  });

  it('applies the product lexicon before numeric normalisation', () => {
    const out = normaliseForSpeech('Whisk in the ghee and 2 tsp tamari.', [
      { term: 'ghee', phonetic: 'gee' },
      { term: 'tamari', phonetic: 'tuh-MAR-ee' },
    ]);
    expect(out).toContain('gee');
    expect(out).toContain('tuh-MAR-ee');
    expect(out).toContain('two');
  });

  it('converts numbers to words correctly across the range', () => {
    expect(numberToWords(7)).toBe('seven');
    expect(numberToWords(25)).toBe('twenty five');
    expect(numberToWords(450)).toBe('four hundred fifty');
    expect(numberToWords(1000)).toBe('one thousand');
  });

  it('computes word error rate as an edit distance over words', () => {
    expect(wordErrorRate('add the vinegar now', 'add the vinegar now')).toBe(0);
    expect(wordErrorRate('add the vinegar now', 'add the vinegar know')).toBeCloseTo(0.25);
  });

  it('passes clean narration inside the pacing band', () => {
    const script =
      'Your gluten-free loaf is gummy. The starch holds water that wheat would have released. ' +
      'Drop the oven twenty five degrees and bake it longer. Then let it cool completely.';
    const result = runAudioQC({
      script,
      transcript: script,
      durationSeconds: 12,
      trailingSilenceMs: 120,
    });
    expect(result.passed).toBe(true);
    expect(result.wordsPerMinute).toBeGreaterThanOrEqual(140);
    expect(result.wordsPerMinute).toBeLessThanOrEqual(175);
  });

  it('rejects a mispronunciation and names the suspect terms', () => {
    const script = 'Whisk in the tamari and the za atar before the roux sets.';
    const result = runAudioQC({
      script,
      transcript: 'Whisk in the tammery and the zaytar before the rooks sets.',
      durationSeconds: 5,
    });
    expect(result.passed).toBe(false);
    const finding = result.findings.find((f) => f.rule === 'audio.word_error_rate');
    expect(finding?.suggestedLexiconTerms).toEqual(
      expect.arrayContaining(['tamari', 'atar', 'roux']),
    );
  });

  it('rejects pacing outside 140 to 175 wpm', () => {
    const script = 'One two three four five six seven eight nine ten.';
    expect(runAudioQC({ script, transcript: script, durationSeconds: 30 }).passed).toBe(false);
  });

  it('rejects trailing silence over 300ms', () => {
    const script = Array.from({ length: 30 }, () => 'word').join(' ');
    const result = runAudioQC({
      script,
      transcript: script,
      durationSeconds: 12,
      trailingSilenceMs: 900,
    });
    expect(result.findings.some((f) => f.rule === 'audio.trailing_silence')).toBe(true);
  });

  it('rejects a script that still contains numerals', () => {
    const script = Array.from({ length: 29 }, () => 'word').concat('450').join(' ');
    const result = runAudioQC({ script, transcript: script, durationSeconds: 12 });
    expect(result.findings.some((f) => f.rule === 'audio.unnormalised_numerals')).toBe(true);
  });
});

describe('AI disclosure — v2 Part C', () => {
  it('does not label AI-written copy or motion graphics', () => {
    expect(requiresAiLabel(['copy'])).toBe(false);
    expect(requiresAiLabel(['copy', 'motion'])).toBe(false);
  });

  it('labels voiceover and generated imagery', () => {
    expect(requiresAiLabel(['voiceover'])).toBe(true);
    expect(requiresAiLabel(['imagery'])).toBe(true);
  });

  it('suggests a disclosure that names the cloned voice', () => {
    expect(suggestedDisclosure(['voiceover'], 'founder_cloned')).toContain('#AIvoiceover');
    expect(suggestedDisclosure(['copy'], 'text_only')).toBeNull();
  });

  it('refuses to publish when a label is required and the caption lacks it', () => {
    const verdict = disclosureSatisfied({
      aiComponents: ['voiceover'],
      disclosureText: 'Narration is my own voice, synthesised. #AIvoiceover',
      body: 'Gummy crumb, fixed. Here is the change that did it.',
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('does not appear in the caption');
  });

  it('accepts a caption carrying the disclosure', () => {
    expect(
      disclosureSatisfied({
        aiComponents: ['voiceover'],
        disclosureText: '#AIvoiceover',
        body: 'Gummy crumb, fixed. #AIvoiceover',
      }).ok,
    ).toBe(true);
  });

  it('accepts the platform native AI toggle in place of caption text', () => {
    expect(
      disclosureSatisfied({
        aiComponents: ['imagery'],
        disclosureText: null,
        body: 'no disclosure here',
        platformAiToggleSet: true,
      }).ok,
    ).toBe(true);
  });
});

describe('runAllGates — the queue contract, v2 F.5', () => {
  it('produces one line per gate in a fixed order', () => {
    const results = runAllGates({
      copy: {
        body: 'Your gluten-free loaf is gummy. Vinegar fixes the structure.',
        platform: 'x',
      },
      claims: {
        claims: [
          {
            text: 'vinegar strengthens the protein network',
            source: 'ingredients[4].changeReason',
          },
        ],
        artifact,
      },
    });

    expect(results.gates.map((g) => g.gate)).toEqual([
      'copy',
      'claims',
      'visual',
      'audio',
      // Milestone 52. Sits after the media gates because it compares what they
      // measured against what the post claimed.
      'coherence',
      'destination',
      'proof',
    ]);
    expect(results.passed).toBe(true);
    expect(results.gates[1]?.summary).toBe('1/1 verified against artifact');
    /*
     * The three media slots are always skipped at copy time — §119. They are
     * filled by `review_media` and `tts`, which merge into this same array.
     * The order is the contract; the statuses here say only that this stage
     * did not pretend to measure media.
     */
    expect(results.gates.filter((g) => g.status === 'skipped').map((g) => g.gate)).toEqual(
      expect.arrayContaining(['visual', 'audio', 'coherence']),
    );
  });

  it('fails the whole run when any gate fails', () => {
    const results = runAllGates({
      copy: { body: 'This is a game changer — truly.', platform: 'x' },
    });
    expect(results.passed).toBe(false);
    expect(results.gates[0]?.status).toBe('failed');
  });
});

/**
 * Destination QC. Milestone 42.
 *
 * A post about one exact adapted recipe that links to the front page asks the
 * reader to reproduce what they just read. Most will not.
 */
describe('destination gate', () => {
  const base = {
    category: 'transformation' as const,
    webUrl: 'https://recipefix.app',
    hasShareTemplate: true,
  };

  it('warns when a specific transformation points at the bare homepage', () => {
    const result = runDestinationQC({
      ...base,
      destinationType: 'web',
      destinationUrl: 'https://recipefix.app',
    });
    expect(result.passed).toBe(true); // a warning, not a block
    expect(result.findings[0]!.rule).toBe('destination.bare_homepage');
    expect(result.summary).toMatch(/warning/);
  });

  it('recognises the homepage through trailing slashes, www and query strings', () => {
    for (const url of [
      'https://recipefix.app/',
      'https://www.recipefix.app',
      'http://recipefix.app/?utm_source=x',
      'https://RecipeFix.app',
    ]) {
      expect(isBareHomepage(url, 'https://recipefix.app'), url).toBe(true);
    }
    expect(isBareHomepage('https://recipefix.app/recipe/abc', 'https://recipefix.app')).toBe(false);
  });

  it('says what to do when the artifact has a share token available', () => {
    const result = runDestinationQC({
      ...base,
      destinationType: 'web',
      destinationUrl: 'https://recipefix.app',
      hasShareToken: true,
    });
    expect(result.findings[0]!.fix).toMatch(/switch the destination to the share link/);
  });

  it('names the missing product configuration when there is no template', () => {
    const result = runDestinationQC({
      ...base,
      hasShareTemplate: false,
      destinationType: 'web',
      destinationUrl: 'https://recipefix.app',
    });
    expect(result.findings[0]!.fix).toMatch(/share_url_template/);
  });

  it('says nothing about a general post that points at the homepage', () => {
    const result = runDestinationQC({
      ...base,
      category: 'education',
      destinationType: 'web',
      destinationUrl: 'https://recipefix.app',
    });
    expect(result.findings).toEqual([]);
  });

  it('is happy with a specific share link', () => {
    const result = runDestinationQC({
      ...base,
      destinationType: 'share_link',
      destinationUrl: 'https://recipefix.app/recipe/be1b2a5f-5015-4e0c-9194-8bae735e9e01',
    });
    expect(result.findings).toEqual([]);
    expect(result.summary).toBe('points at the specific recipe');
  });

  it('fails outright when there is no destination', () => {
    const result = runDestinationQC({ ...base, destinationType: null, destinationUrl: null });
    expect(result.passed).toBe(false);
  });
});

/**
 * "Never verified" is not "passed".
 *
 * `verify-flows` already draws this line for capture flows: a flow that has
 * never run shows as its own state rather than as green. The same distinction
 * belongs on every QC gate, and it did not exist until `extractQuotes` returned
 * a clean result having examined zero quotes — because its character class
 * contained straight quotes where curly ones were intended, so it matched
 * nothing and every quoted testimonial sailed through unexamined.
 */
describe('a gate that examined nothing never reports a pass', () => {
  it('fails an empty body rather than finding it clean', () => {
    // Every slop rule is a search for something wrong. Run them over an empty
    // string and they all come back clean, which reads exactly like a checked
    // post.
    const result = slopFilter({ body: '', platform: 'x' });
    expect(result.passed).toBe(false);
    expect(result.errors[0]!.rule).toBe('copy.empty');
    expect(slopFilter({ body: '   \n  ', platform: 'x' }).passed).toBe(false);
  });

  it('reports zero extracted claims as skipped, not passed', () => {
    const results = runAllGates({
      copy: { body: 'Vinegar firms the crumb in a gluten-free loaf.', platform: 'x' },
      claims: { claims: [], artifact: {} },
    });
    const claims = results.gates.find((g) => g.gate === 'claims')!;
    expect(claims.status).toBe('skipped');
    expect(claims.status).not.toBe('passed');
    expect(claims.examined).toBe(0);
  });

  it('reports zero extracted quotes as skipped, not passed', () => {
    const results = runAllGates({
      copy: { body: 'Vinegar firms the crumb.', platform: 'x' },
      proof: { body: 'Vinegar firms the crumb.', attached: [] },
    });
    const proof = results.gates.find((g) => g.gate === 'proof')!;
    expect(proof.status).toBe('skipped');
    expect(proof.examined).toBe(0);
  });

  it('counts what it examined when it did examine something', () => {
    const results = runAllGates({
      copy: { body: 'Vinegar firms the crumb.', platform: 'x' },
      claims: {
        claims: [{ text: 'vinegar firms the crumb', source: 'ingredients[4].changeReason' }],
        artifact: { ingredients: [{}, {}, {}, {}, { changeReason: 'vinegar firms the crumb' }] },
      },
    });
    const claims = results.gates.find((g) => g.gate === 'claims')!;
    expect(claims.examined).toBe(1);
    expect(claims.status).toBe('passed');
  });

  it('refuses to score a voiceover it never measured', () => {
    // Word error rate is a comparison. Comparing nothing to nothing is a
    // perfect score, which is the same false pass in a different gate.
    const noTranscript = runAudioQC({ script: 'Vinegar firms the crumb.', transcript: '', durationSeconds: 6 });
    expect(noTranscript.passed).toBe(false);
    expect(noTranscript.summary).toMatch(/never measured/);

    const noScript = runAudioQC({ script: '', transcript: 'vinegar firms the crumb', durationSeconds: 6 });
    expect(noScript.passed).toBe(false);
  });

  it('does not throw on a malformed probe', () => {
    expect(() => runAudioQC({} as never)).not.toThrow();
    expect(runAudioQC({} as never).passed).toBe(false);
  });

  it('leaves the whole run failing when the copy gate found nothing to check', () => {
    const results = runAllGates({ copy: { body: '', platform: 'x' } });
    expect(results.passed).toBe(false);
    // And nothing else claims a pass either.
    expect(results.gates.filter((g) => g.status === 'passed')).toHaveLength(0);
  });
});

describe('looksUnextracted — the extractor-failure signature', () => {
  it('notices a visible quotation that yielded nothing', () => {
    const suspicion = looksUnextracted(
      'A reader told us “the bread actually held together this time”.',
      0,
    );
    expect(suspicion).toMatch(/no quote was extracted/);
  });

  it('notices a number and a mechanism that yielded no claim', () => {
    const suspicion = looksUnextracted(
      'Drop the oven 25 degrees because the starch browns faster than wheat.',
      0,
    );
    expect(suspicion).toMatch(/no claim was extracted/);
  });

  it('says nothing when the extractor did its job', () => {
    expect(looksUnextracted('She said “it worked every single time for me”.', 1)).toBeNull();
  });

  it('says nothing about ordinary prose', () => {
    expect(looksUnextracted('Vinegar firms the crumb.', 0)).toBeNull();
    expect(looksUnextracted('Use the "1:1" blend.', 0)).toBeNull();
  });
});


/**
 * The `requires` mechanism, which P2 added to stop a skipped gate counting as a
 * pass.
 *
 * These exist because the mechanism shipped untested in the first P2 commit —
 * found in acceptance review, which is late but is what the review is for. An
 * untested governance mechanism is indistinguishable from a comment.
 */
describe('a required gate that never ran cannot be called passed', () => {
  const body = 'Your gluten-free loaf is gummy. Vinegar fixes the structure.';

  it('passes a skipped gate when nothing required it', () => {
    // The copy-time default, and correct: at that point no media exists.
    const results = runAllGates({ copy: { body, platform: 'x' } });
    expect(results.gates.find((g) => g.gate === 'visual')!.status).toBe('skipped');
    expect(results.passed).toBe(true);
  });

  it('fails the same gate once the caller declares it required', () => {
    const results = runAllGates({ copy: { body, platform: 'x' }, requires: ['visual'] });
    const visual = results.gates.find((g) => g.gate === 'visual')!;
    expect(visual.status).toBe('failed');
    expect(visual.summary).toContain('never ran');
    // The whole point: an unmeasured dimension can no longer produce a pass.
    expect(results.passed).toBe(false);
  });

  it('leaves a required gate that did run alone', () => {
    const results = runAllGates({ copy: { body, platform: 'x' }, requires: ['copy'] });
    expect(results.gates.find((g) => g.gate === 'copy')!.status).not.toBe('failed');
  });

  it('fails every declared gate that did not run, not just the first', () => {
    const results = runAllGates({
      copy: { body, platform: 'x' },
      requires: ['visual', 'audio'],
    });
    const failed = results.gates.filter((g) => g.status === 'failed').map((g) => g.gate);
    expect(failed.sort()).toEqual(['audio', 'visual']);
  });
});

/**
 * §157. An edit must not leave gates claiming to be about the old text.
 *
 * The queue renders `qc_results.gates`. Before this, an operator could rewrite
 * a post and the screen went on showing `copy: passed (0 flags)` and
 * `claims: 2/2 verified against artifact` for words nothing had examined.
 */
describe('gatesAfterEdit', () => {
  const gates: GateResult[] = [
    { gate: 'copy', status: 'passed', summary: 'passed (0 flags)', detail: null },
    { gate: 'claims', status: 'passed', summary: '2/2 verified against artifact', detail: null },
    { gate: 'visual', status: 'passed', summary: 'passed (0 warnings)', detail: null },
    { gate: 'audio', status: 'warning', summary: 'WER 1.1%', detail: null },
  ];
  const clean = { passed: true, violations: [] };

  it('re-runs the copy gate rather than invalidating it', () => {
    // The slop filter is deterministic and has already run on the new text.
    const out = gatesAfterEdit(gates, clean);
    const copy = out.gates.find((g) => g.gate === 'copy')!;
    expect(copy.status).toBe('passed');
    expect(copy.summary).toMatch(/re-run after a human edit/);
  });

  it('marks the claims gate unverified, because only a re-check can settle it', () => {
    const out = gatesAfterEdit(gates, clean);
    const claims = out.gates.find((g) => g.gate === 'claims')!;
    expect(claims.status).toBe('warning');
    expect(claims.summary).toMatch(/not re-verified/);
    // The old verdict must not survive in any form.
    expect(claims.summary).not.toMatch(/verified against artifact/);
  });

  it('leaves gates the edit could not affect exactly as they were', () => {
    // Editing a caption does not un-measure a render.
    const out = gatesAfterEdit(gates, clean);
    expect(out.gates.find((g) => g.gate === 'visual')).toEqual(gates[2]);
    expect(out.gates.find((g) => g.gate === 'audio')).toEqual(gates[3]);
  });

  it('fails the copy gate when the edit itself is unpublishable', () => {
    const out = gatesAfterEdit(gates, {
      passed: false,
      violations: [{ rule: 'length.over_limit', message: 'too long' }],
    });
    expect(out.gates.find((g) => g.gate === 'copy')!.status).toBe('failed');
    expect(out.passed).toBe(false);
  });

  it('recomputes passed over the whole list', () => {
    const out = gatesAfterEdit(gates, clean);
    expect(out.passed).toBe(true);
  });
});
