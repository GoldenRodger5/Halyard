import { describe, expect, it } from 'vitest';
import {
  HASHTAG_LIMITS,
  countWords,
  slopFilter,
  slopSummary,
  splitSentences, BODY_LIMITS } from './slopFilter.js';
import { KNOWN_BAD_COPY, KNOWN_GOOD_COPY } from './__fixtures__/knownBadCopy.js';
import { allAdapters, type PlatformId } from '../adapters/index.js';
import { PLATFORM_BRIEFS } from '../generation/prompts.js';

/**
 * Every platform with an adapter must be known to the copy gate.
 *
 * This exists because Bluesky was not. It was added in milestone 40 and the QC
 * platform union was not extended, so `HASHTAG_LIMITS.bluesky` was undefined —
 * and because the generate handler asserts the SQL row's platform into that
 * union, nothing failed to compile. The first draft for a connected Bluesky
 * account would have thrown "cannot read properties of undefined" inside the
 * gate that exists to stop bad copy.
 *
 * A type is not a guarantee when there is a cast between the data and the type.
 * This is the runtime check that would have caught it.
 */
describe('platform coverage', () => {
  const platforms: PlatformId[] = allAdapters().map((a) => a.platform);

  it.each(platforms)('%s has hashtag limits', (platform) => {
    const limits = HASHTAG_LIMITS[platform];
    expect(limits, `HASHTAG_LIMITS is missing ${platform}`).toBeDefined();
    expect(limits.max).toBeGreaterThanOrEqual(limits.min);
  });

  it.each(platforms)('%s has a copywriter brief', (platform) => {
    expect(PLATFORM_BRIEFS[platform], `PLATFORM_BRIEFS is missing ${platform}`).toBeTruthy();
  });

  it.each(platforms)('%s can be linted without throwing', (platform) => {
    const result = slopFilter({
      body: 'The loaf collapsed. One teaspoon of acid is the whole difference.',
      platform,
      hashtags: [],
    });
    expect(result.violations).toBeInstanceOf(Array);
  });
});

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
    /* §466. Clean now means it also gives a reader something to do. */
    const clean = slopFilter({
      body: 'Vinegar firms the crumb. One teaspoon. Which loaf do you bake most?',
      platform: 'x',
    });
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

describe('length against the platform ceiling', () => {
  /**
   * `maxChars` is declared on every adapter and was checked nowhere. A draft
   * over the limit passed every gate, sat in the queue looking finished, and
   * would have been rejected by the platform at publish — the first symptom
   * being a failed post rather than a flagged draft.
   */
  it('fails a body over the platform limit', () => {
    const result = slopFilter({ body: 'a'.repeat(300), platform: 'x' });
    expect(result.passed).toBe(false);
    expect(result.errors.map((e) => e.rule)).toContain('length.over_limit');
  });

  it('counts hashtags against the same ceiling, because they are posted together', () => {
    const result = slopFilter({
      body: 'a'.repeat(270),
      platform: 'x',
      hashtags: ['glutenfree', 'baking'],
    });
    expect(result.errors.map((e) => e.rule)).toContain('length.over_limit');
  });

  it('warns before the ceiling, because feeds truncate first', () => {
    const result = slopFilter({ body: 'a'.repeat(260), platform: 'x' });
    expect(result.warnings.map((w) => w.rule)).toContain('length.near_limit');
    // A warning, not a failure: it is still publishable.
    expect(result.errors.map((e) => e.rule)).not.toContain('length.over_limit');
  });

  it('does not apply a character ceiling to a spoken script', () => {
    // A voiceover has no character limit; its length is measured in seconds.
    const result = slopFilter({
      body: 'Vinegar firms the crumb. '.repeat(30),
      platform: 'x',
      spoken: true,
    });
    expect(result.errors.map((e) => e.rule)).not.toContain('length.over_limit');
  });

  it('matches every adapter, which is the only thing making a second copy safe', async () => {
    /**
     * `qc` does not depend on `adapters` — a cycle would be worse than a second
     * copy — so the copies are compared here instead. Two constants of the same
     * fact drift silently; the compiler only ever sees one of them.
     */
    const adapters = await Promise.all([
      import('../adapters/x.js').then((m) => ['x', m.X_CONSTRAINTS] as const),
      import('../adapters/instagram.js').then((m) => ['instagram', m.INSTAGRAM_CONSTRAINTS] as const),
      import('../adapters/tiktok.js').then((m) => ['tiktok', m.TIKTOK_CONSTRAINTS] as const),
      import('../adapters/pinterest.js').then((m) => ['pinterest', m.PINTEREST_CONSTRAINTS] as const),
      import('../adapters/threads.js').then((m) => ['threads', m.THREADS_CONSTRAINTS] as const),
      import('../adapters/youtube.js').then((m) => ['youtube', m.YOUTUBE_CONSTRAINTS] as const),
      import('../adapters/bluesky.js').then((m) => ['bluesky', m.BLUESKY_CONSTRAINTS] as const),
    ]);

    for (const [platform, constraints] of adapters) {
      expect(
        BODY_LIMITS[platform as keyof typeof BODY_LIMITS],
        `${platform} body limit drifted from its adapter`,
      ).toBe(constraints.maxChars);
    }
  });
});

/**
 * §450. A caption that transcribes the video wastes one of two channels.
 *
 * The screenwriter has enforced this rule between spoken and on-screen since
 * §335 — *"never put the same sentence in both… the single clearest sign a
 * machine made the video"* — and nothing applied it between the caption and the
 * video. Measured on real pieces: 88.9% of one caption's distinctive words were
 * also on screen.
 */
describe('a caption is not a transcript', () => {
  const ON_SCREEN = [
    'Searing meat seals in juices',
    'The crust forms from the Maillard reaction, not from sealing',
    'Moisture leaves a steak throughout cooking whatever you do first',
  ];
  const check = (body: string, onScreen = ON_SCREEN) =>
    slopFilter({ body, platform: 'tiktok', hashtags: [], onScreen });

  const echoed = (r: ReturnType<typeof slopFilter>) =>
    [...r.errors, ...r.warnings].some((v) => v.rule === 'structure.caption_echoes_screen');

  it('catches a caption that repeats the piece back', () => {
    const result = check(
      'Searing meat seals in juices is wrong. The crust forms from the Maillard reaction, not from sealing, and moisture leaves a steak throughout cooking.',
    );
    expect(echoed(result)).toBe(true);
  });

  it('leaves a caption that does its own job alone', () => {
    const result = check(
      'Sixty years of kitchen advice traced back to one chemist who never tested it. Which one did you believe longest?',
    );
    expect(echoed(result)).toBe(false);
  });

  /*
   * A caption naming its own subject is correct writing. If sharing a noun were
   * enough to trip this, every caption would read as an echo of every video.
   */
  it('allows a caption to name the same subject', () => {
    const result = check(
      'Everything you were told about searing came from a chemist who never ran the experiment. The comments are going to be a war.',
    );
    expect(echoed(result)).toBe(false);
  });

  it('says nothing when there is no second channel', () => {
    expect(echoed(slopFilter({ body: ON_SCREEN.join(' '), platform: 'x', hashtags: [] }))).toBe(
      false,
    );
    expect(echoed(check(ON_SCREEN.join(' '), []))).toBe(false);
  });

  it('does not judge a caption too short to measure', () => {
    expect(echoed(check('Searing seals juices'))).toBe(false);
  });

  /*
   * §449's lesson: a whole researched piece was binned because its caption
   * failed three times. This rule must never be the reason a piece is lost.
   */
  it('is a warning and never fails a piece', () => {
    const result = check(
      'Searing meat seals in juices is wrong. The crust forms from the Maillard reaction, not from sealing, and moisture leaves a steak throughout cooking.',
    );
    expect(result.errors.some((v) => v.rule === 'structure.caption_echoes_screen')).toBe(false);
    expect(result.warnings.some((v) => v.rule === 'structure.caption_echoes_screen')).toBe(true);
  });

  it('says what to write instead, not only what is wrong', () => {
    const violation = check(
      'Searing meat seals in juices is wrong. The crust forms from the Maillard reaction, not from sealing, and moisture leaves a steak throughout cooking.',
    ).warnings.find((v) => v.rule === 'structure.caption_echoes_screen')!;
    expect(violation.fix).toMatch(/did not fit|question/);
    expect(violation.message).toMatch(/%/);
  });
});

/**
 * §466. A post that asks nothing gets nothing back.
 *
 * Measured across twelve real captions: not one contained a question, an
 * invitation, or any ask. Every piece ended on a statement and stopped, while
 * every platform here ranks on the *return* — a reply, a save, a comment after
 * the watch, a rewatch.
 */
describe('a caption gives a reader something to do', () => {
  const asks = (body: string) =>
    slopFilter({ body, platform: 'tiktok', hashtags: [] }).warnings.some(
      (v) => v.rule === 'structure.invites_nothing',
    );

  it('flags the captions that were actually generated', () => {
    /* Real output, verbatim. */
    expect(asks('Side splits look random. Scoring gives oven spring a weaker seam to open.')).toBe(
      true,
    );
    expect(asks('Cold onions cry less. Cut cells release fumes. Cold slows the release.')).toBe(
      true,
    );
  });

  it('accepts a question', () => {
    expect(asks('Scoring gives oven spring a seam to open. Which way do you slash yours?')).toBe(
      false,
    );
  });

  /*
   * The point of being broad. This earns a reply without asking for one, and is
   * better writing than "which do you do?" — a rule that demanded a question
   * mark would push the writer toward the worse line.
   */
  it('accepts an invitation that is not a question', () => {
    expect(asks('Three ways to stop the sting. The second one is the one people get wrong.')).toBe(
      false,
    );
    expect(asks('Worth a save before your next loaf.')).toBe(false);
  });

  it('says nothing about a voiceover, which is a different craft', () => {
    const spokenResult = slopFilter({
      body: 'Scoring gives oven spring a weaker seam to open.',
      platform: 'tiktok',
      hashtags: [],
      spoken: true,
    });
    expect(spokenResult.warnings.some((v) => v.rule === 'structure.invites_nothing')).toBe(false);
  });

  it('is a warning, and names what to do instead of what not to', () => {
    const v = slopFilter({
      body: 'Scoring gives oven spring a weaker seam to open.',
      platform: 'tiktok',
      hashtags: [],
    }).warnings.find((x) => x.rule === 'structure.invites_nothing')!;
    expect(v.fix).toMatch(/earns a reply/);
    /* And explicitly refuses the lazy version. */
    expect(v.fix).toMatch(/not "comment below"/i);
  });
});

/**
 * §466. One question is not a density.
 *
 * The rule refuses a post *made* of questions. Expressed purely as a ratio it
 * also refused any question in a short caption — one mark in twelve words is
 * over a 1-per-40 ceiling — which collided head-on with the rule that refuses a
 * caption asking for nothing. Between them a short caption had no legal form.
 */
describe('question density is about a pattern, not a single question', () => {
  const density = (body: string) =>
    slopFilter({ body, platform: 'x' }).errors.some(
      (v) => v.rule === 'structure.question_density',
    );

  it('allows the one question a short caption needs', () => {
    expect(density('Vinegar firms the crumb. One teaspoon. Which loaf do you bake most?')).toBe(
      false,
    );
  });

  it('still refuses a post made of questions', () => {
    expect(density('Struggling with bread? Want better crust? Ready to level up?')).toBe(true);
  });

  it('leaves a short caption with a single legal form', () => {
    /* The collision itself: this must pass both rules at once. */
    const result = slopFilter({
      body: 'Vinegar firms the crumb. One teaspoon. Which loaf do you bake most?',
      platform: 'x',
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((v) => v.rule === 'structure.invites_nothing')).toBe(false);
  });
});

/**
 * §467. Authority-shaped phrasing with nothing behind it.
 *
 * Two real captions: "Established by BBC Good Food" and "2021 salinity testing
 * points to absorption, not heat." Both borrow the cadence of a citation
 * without being one — and an account whose pitch is "we know what is in your
 * food" cannot be caught sounding more certain than its evidence.
 */
describe('borrowed authority', () => {
  const vague = (body: string) =>
    slopFilter({ body, platform: 'x' }).warnings.find(
      (v) => v.rule === 'claim.vague_authority',
    );

  it('catches the two that actually shipped', () => {
    expect(vague('Salt is not for bitterness. Established by BBC Good Food.')).toBeDefined();
    expect(
      vague('Underseasoned noodles need timing: 2021 salinity testing points to absorption.'),
    ).toBeDefined();
  });

  it('catches the classic hedges', () => {
    expect(vague('Studies show that resting matters. Which do you do?')).toBeDefined();
    expect(vague('According to science, salt is the key. Try it?')).toBeDefined();
  });

  it('leaves a real citation alone', () => {
    expect(
      vague('Beccari separated gluten from wheat flour in 1728. Which loaf do you bake?'),
    ).toBeUndefined();
    expect(
      vague('Serious Eats measured this across twelve steaks. Worth a save?'),
    ).toBeUndefined();
  });

  it('leaves a plain statement alone', () => {
    expect(vague('Scoring gives oven spring a seam to open. Which way do you slash?')).toBeUndefined();
  });

  /*
   * The fact may be perfectly sourced — `claims` and `format.uncited_claim`
   * check that separately. What is wrong here is the wording.
   */
  it('is a warning, and says how to fix the wording', () => {
    const v = vague('Established by BBC Good Food.')!;
    expect(v.severity).toBe('warning');
    expect(v.fix).toMatch(/name who/i);
  });

  it('flags once, not once per phrase', () => {
    const all = slopFilter({
      body: 'Studies show it. Experts agree. According to research, it is known.',
      platform: 'x',
    }).warnings.filter((v) => v.rule === 'claim.vague_authority');
    expect(all).toHaveLength(1);
  });
});
