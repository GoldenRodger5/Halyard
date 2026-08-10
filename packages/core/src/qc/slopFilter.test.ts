import { describe, expect, it } from 'vitest';
import {
  HASHTAG_LIMITS,
  countWords,
  slopFilter,
  slopSummary,
  splitSentences,
} from './slopFilter.js';
import { KNOWN_BAD_COPY, KNOWN_GOOD_COPY } from './__fixtures__/knownBadCopy.js';

describe('slopFilter — the known-bad fixture file', () => {
  it.each(KNOWN_BAD_COPY.map((f) => [f.name, f] as const))(
    'rejects: %s',
    (_name, fixture) => {
      const result = slopFilter({
        body: fixture.body,
        platform: fixture.platform,
        hashtags: fixture.hashtags ?? defaultHashtagsFor(fixture.platform),
      });
      expect(result.passed, `expected a failure, got: ${JSON.stringify(result.violations)}`).toBe(
        false,
      );
      expect(result.errors.map((v) => v.rule)).toContain(fixture.expectRule);
    },
  );

  it('every fixture fails — no exceptions', () => {
    const passers = KNOWN_BAD_COPY.filter(
      (f) =>
        slopFilter({
          body: f.body,
          platform: f.platform,
          hashtags: f.hashtags ?? defaultHashtagsFor(f.platform),
        }).passed,
    );
    expect(passers.map((p) => p.name)).toEqual([]);
  });
});

describe('slopFilter — the known-good fixture file', () => {
  it.each(KNOWN_GOOD_COPY.map((f) => [f.name, f] as const))('accepts: %s', (_name, fixture) => {
    const result = slopFilter({
      body: fixture.body,
      platform: fixture.platform,
      hashtags: fixture.hashtags ?? [],
    });
    expect(result.errors, JSON.stringify(result.errors, null, 2)).toHaveLength(0);
    expect(result.passed).toBe(true);
  });
});

describe('slopFilter — punctuation', () => {
  it('reports the offending span for an em dash, not just the rule', () => {
    const r = slopFilter({ body: 'Bread rises — then it falls.', platform: 'x' });
    const v = r.errors.find((e) => e.rule === 'punctuation.em_dash');
    expect(v?.excerpt).toContain('—');
    expect(v?.index).toBe('Bread rises '.length);
    expect(v?.fix).toBeTruthy();
  });

  it('allows an en dash inside a numeric range', () => {
    const r = slopFilter({ body: 'Bake 45–50 minutes. Rest before slicing.', platform: 'x' });
    expect(r.errors.map((e) => e.rule)).not.toContain('punctuation.en_dash_in_prose');
  });

  it('rejects an en dash used as prose punctuation', () => {
    const r = slopFilter({ body: 'Bake it longer – the centre needs time.', platform: 'x' });
    expect(r.errors.map((e) => e.rule)).toContain('punctuation.en_dash_in_prose');
  });

  it('rejects a curly apostrophe inside a contraction', () => {
    const r = slopFilter({ body: 'Don’t slice it hot.', platform: 'x' });
    expect(r.errors.map((e) => e.rule)).toContain('punctuation.curly_quotes');
  });
});

describe('slopFilter — hashtags per platform', () => {
  it('applies the documented ceiling for each platform', () => {
    expect(HASHTAG_LIMITS.x.max).toBe(2);
    expect(HASHTAG_LIMITS.instagram).toMatchObject({ min: 3, max: 8 });
    expect(HASHTAG_LIMITS.tiktok).toMatchObject({ min: 3, max: 5 });
    expect(HASHTAG_LIMITS.pinterest.max).toBe(0);
  });

  it('counts hashtags written inline in the body as well as the array', () => {
    const r = slopFilter({
      body: 'Vinegar firms the crumb. #glutenfree #baking #bread',
      platform: 'x',
    });
    expect(r.stats.hashtagCount).toBe(3);
    expect(r.errors.map((e) => e.rule)).toContain('hashtags.too_many');
  });

  it('warns rather than blocks when there are too few', () => {
    const r = slopFilter({
      body: 'Vinegar firms a gluten-free crumb. One teaspoon per loaf is enough.',
      platform: 'instagram',
      hashtags: ['glutenfree'],
    });
    expect(r.warnings.map((w) => w.rule)).toContain('hashtags.too_few');
    expect(r.passed).toBe(true);
  });
});

describe('slopFilter — product-level rules', () => {
  it('merges banned phrases from products.content_rules', () => {
    const r = slopFilter({
      body: 'This recipe is chef-approved and ready to cook.',
      platform: 'x',
      extraBannedPhrases: ['chef-approved'],
    });
    expect(r.errors.map((e) => e.rule)).toContain('phrase.banned');
    expect(r.errors[0]?.message).toContain('chef-approved');
  });

  it('applies forbidden_claims as substrings', () => {
    const r = slopFilter({
      body: 'The macros shown are exactly right for this dish.',
      platform: 'x',
      forbiddenClaims: ['macros shown are exactly right'],
    });
    expect(r.errors.map((e) => e.rule)).toContain('hard_block.forbidden_claim');
  });
});

describe('slopFilter — long-form relaxation', () => {
  const longBody =
    'A gluten-free sandwich loaf that actually holds together for a week of packed lunches. ' +
    'The reason most gluten-free loaves collapse is that starch gels and then releases water as it cools, ' +
    'which leaves the centre dense while the crust has already set hard around it.';

  it('rejects on a feed surface', () => {
    expect(slopFilter({ body: longBody, platform: 'x' }).passed).toBe(false);
  });

  it('accepts the same copy on a long-form surface', () => {
    const r = slopFilter({ body: longBody, platform: 'youtube', longForm: true });
    expect(r.errors.map((e) => e.rule)).not.toContain('structure.sentence_length');
  });
});

describe('text utilities', () => {
  it('does not split a sentence on a decimal point', () => {
    expect(splitSentences('Rest 3.5 minutes. Then slice.')).toEqual([
      'Rest 3.5 minutes.',
      'Then slice.',
    ]);
  });

  it('counts hyphenated words once', () => {
    expect(countWords('gluten-free bread needs vinegar')).toBe(4);
  });
});

describe('slopSummary', () => {
  it('reads the way the queue card renders it', () => {
    const clean = slopFilter({ body: 'Vinegar firms the crumb. One teaspoon.', platform: 'x' });
    expect(slopSummary(clean)).toBe('passed (0 flags)');

    const bad = slopFilter({ body: 'A game changer — truly.', platform: 'x' });
    expect(slopSummary(bad)).toMatch(/^failed \(\d+ violations?\)$/);
  });
});

function defaultHashtagsFor(platform: string): string[] {
  if (platform === 'instagram') return ['glutenfree', 'baking', 'bread'];
  if (platform === 'tiktok') return ['glutenfree', 'baking', 'bread'];
  return [];
}
