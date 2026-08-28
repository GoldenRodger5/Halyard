/**
 * §214. Effective length, as distinct from what the platform allows.
 *
 * The first test uses a real TikTok caption this system generated. It passes
 * every existing check — 472 characters against a 2200 ceiling — and nobody
 * reads it, which is the whole point of the file.
 */
import { describe, expect, it } from 'vitest';
import {
  COPY_BUDGETS,
  budgetFor,
  checkCopyBudget,
  splitForBudget,
} from './budget.js';

/** Verbatim from `content_items`. 472 characters. */
const REAL_TIKTOK_CAPTION = `Twenty two minutes. Not thirty five.

This vegan baked oatmeal bakes in an 8x8 pan, which keeps the batter deep enough for that soft, creamy center. Drop it into a bigger pan and it spreads thin, sets fast on the edges, and overbakes before the middle catches up.

The fix isn't more flour or a different milk. It's checking doneness at twenty-two minutes instead of the full thirty-five the original recipe calls for, because a smaller batch in a shallower pan finishes faster.`;

describe('the real caption this was built for', () => {
  const budget = budgetFor('tiktok');

  it('is inside the platform ceiling, which is why nothing caught it', () => {
    expect(REAL_TIKTOK_CAPTION.length).toBeLessThan(budget.max);
  });

  it('is far outside the budget anyone actually reads', () => {
    expect(REAL_TIKTOK_CAPTION.length).toBeGreaterThan(budget.target * 1.5);
    const findings = checkCopyBudget(REAL_TIKTOK_CAPTION, ['a', 'b', 'c'], budget);
    expect(findings.some((f) => f.rule === 'budget.caption_too_long')).toBe(true);
  });

  it('tells the writer where the rest belongs', () => {
    const finding = checkCopyBudget(REAL_TIKTOK_CAPTION, ['a', 'b', 'c'], budget).find(
      (f) => f.rule === 'budget.caption_too_long',
    )!;
    expect(finding.message).toMatch(/first comment/);
  });

  it('keeps the strong opening and moves the essay', () => {
    const split = splitForBudget(REAL_TIKTOK_CAPTION, budget);
    expect(split.caption).toBe('Twenty two minutes. Not thirty five.');
    expect(split.overflow).toMatch(/vegan baked oatmeal/);
    expect(split.overflowHome).toBe('first_comment');
    expect(split.withinVisible).toBe(true);
  });
});

describe('splitForBudget', () => {
  const budget = budgetFor('tiktok');

  it('leaves a caption that already fits alone', () => {
    const short = 'Halving a recipe is not math.';
    const split = splitForBudget(short, budget);
    expect(split.caption).toBe(short);
    expect(split.overflow).toBe('');
  });

  it('never cuts mid-sentence', () => {
    const split = splitForBudget(REAL_TIKTOK_CAPTION, budget);
    expect(split.caption.endsWith('.')).toBe(true);
    expect(split.overflow.startsWith('This')).toBe(true);
  });

  it('returns a single over-long paragraph whole rather than editing it', () => {
    const oneBlock = 'x'.repeat(600);
    const split = splitForBudget(oneBlock, budget);
    expect(split.caption).toBe(oneBlock);
    expect(split.overflow).toBe('');
    // Reported as a defect instead, because trimming would be editing.
    expect(split.withinTarget).toBe(false);
  });

  it('flags an opening that will be truncated before the fold', () => {
    const longOpener = `${'word '.repeat(40)}.\n\nSecond paragraph.`;
    const split = splitForBudget(longOpener, budget);
    expect(split.withinVisible).toBe(false);
  });
});

describe('budgets differ because the surfaces differ', () => {
  it('gives X no fold and therefore no overflow-to-comment', () => {
    expect(budgetFor('x').overflowHome).toBe('reply');
    expect(budgetFor('x').target).toBeLessThanOrEqual(budgetFor('x').max);
  });

  it('lets a YouTube description be long, because it is read deliberately', () => {
    expect(budgetFor('youtube').target).toBeGreaterThan(budgetFor('tiktok').target);
    expect(budgetFor('youtube', 'long_form').target).toBeGreaterThan(budgetFor('youtube').target);
  });

  it('wants no hashtags on X and several on TikTok', () => {
    expect(budgetFor('x').hashtags[1]).toBeLessThanOrEqual(2);
    expect(budgetFor('tiktok').hashtags[0]).toBeGreaterThanOrEqual(3);
  });

  it('gives an unknown platform a tight budget rather than none', () => {
    const unknown = budgetFor('some_new_network');
    expect(unknown.target).toBeLessThanOrEqual(200);
  });

  it('has a budget for every platform with an adapter', () => {
    for (const platform of ['tiktok', 'instagram', 'x', 'threads', 'bluesky', 'youtube', 'pinterest']) {
      expect(COPY_BUDGETS[platform], platform).toBeDefined();
    }
  });
});

describe('checkCopyBudget', () => {
  it('errors only on the platform ceiling, warns on everything else', () => {
    const x = budgetFor('x');
    const overLimit = checkCopyBudget('y'.repeat(400), [], x);
    expect(overLimit.find((f) => f.rule === 'budget.over_platform_limit')!.severity).toBe('error');

    const longIsh = checkCopyBudget('y'.repeat(370), [], budgetFor('tiktok'));
    expect(longIsh.every((f) => f.severity === 'warning')).toBe(true);
  });

  it('objects to hashtag stuffing', () => {
    const findings = checkCopyBudget(
      'Short caption.',
      Array.from({ length: 15 }, (_, i) => `tag${i}`),
      budgetFor('tiktok'),
    );
    expect(findings.some((f) => f.rule === 'budget.too_many_hashtags')).toBe(true);
  });

  it('objects to none where they are load-bearing', () => {
    const findings = checkCopyBudget('Short caption.', [], budgetFor('tiktok'));
    expect(findings.some((f) => f.rule === 'budget.too_few_hashtags')).toBe(true);
  });

  it('says nothing about hashtags on X, where they do not help', () => {
    const findings = checkCopyBudget('Short caption.', [], budgetFor('x'));
    expect(findings.some((f) => f.rule.includes('hashtag'))).toBe(false);
  });

  it('passes a caption that is doing its job', () => {
    const good = 'Halving a recipe is not math. The salt does not scale with everything else.';
    expect(checkCopyBudget(good, ['baking', 'cookingtips', 'foodscience'], budgetFor('tiktok'))).toEqual([]);
  });
});
