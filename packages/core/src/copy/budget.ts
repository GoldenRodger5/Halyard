/**
 * What a caption may cost, as distinct from what a platform allows. §214.
 *
 * Every adapter declares `maxChars` and it is the *platform's* ceiling: 2200 on
 * TikTok and Instagram, 5000 on YouTube. Halyard's TikTok captions average 472
 * characters and reach 783, so they pass — and nobody reads them, because TikTok
 * shows roughly the first line and hides the rest behind "more".
 *
 * X's captions are the best in the system at an average of 205 characters, and
 * that is not a stylistic achievement. It is the only platform whose hard limit
 * happens to sit near its effective one, so the constraint did the editing.
 * This file gives every other platform the same discipline deliberately.
 *
 * ## Three numbers, not one
 *
 * `visible` — what shows before the fold. The only text most people read, and
 * the number the first sentence has to survive inside.
 * `target` — what the whole caption should aim for.
 * `max` — the platform's ceiling, restated from the adapter so a caller reads
 * one budget rather than assembling it from two places.
 *
 * ## Where the long version goes
 *
 * The essay is not the problem; putting it in the caption is. Halyard's writing
 * is genuinely good — "any number I gave you would be a guess wearing a lab
 * coat" is a real sentence — and it belongs somewhere people are reading rather
 * than scrolling. `overflowHome` says where: a first comment, a description, or
 * nowhere at all.
 *
 * Pure. Numbers about platforms, no product vocabulary, no model.
 */

export type OverflowHome = 'first_comment' | 'description' | 'reply' | 'none';

export interface CopyBudget {
  /** Characters visible before the platform truncates. */
  visible: number;
  /** What the caption should aim for. */
  target: number;
  /** The platform's own ceiling. */
  max: number;
  /** Where the longer version belongs instead of the caption. */
  overflowHome: OverflowHome;
  /** Hashtags that help here, as [min, max]. */
  hashtags: [number, number];
  /** Words the opening line should survive inside. */
  hookWords: number;
}

/**
 * Per platform, and the numbers are about how the surface behaves rather than
 * about taste.
 *
 * TikTok and Instagram truncate hard and early, so the visible budget is small
 * and the essay moves to a first comment — which is also where a question gets
 * replies. X and Threads have no fold worth speaking of, so the ceiling *is*
 * the budget and the overflow is a reply in the same thread. YouTube's
 * description is a genuine long-form surface and the only one where the essay
 * belongs in place.
 */
export const COPY_BUDGETS: Record<string, CopyBudget> = {
  tiktok: {
    visible: 90,
    target: 150,
    max: 2200,
    overflowHome: 'first_comment',
    hashtags: [3, 5],
    hookWords: 8,
  },
  instagram: {
    visible: 125,
    target: 220,
    max: 2200,
    overflowHome: 'first_comment',
    hashtags: [3, 8],
    hookWords: 8,
  },
  x: {
    visible: 280,
    target: 240,
    max: 280,
    overflowHome: 'reply',
    /* Hashtags do nothing for reach here and read as marketing. */
    hashtags: [0, 2],
    hookWords: 10,
  },
  threads: {
    visible: 500,
    target: 300,
    max: 500,
    overflowHome: 'reply',
    hashtags: [0, 3],
    hookWords: 10,
  },
  bluesky: {
    visible: 300,
    target: 260,
    max: 300,
    overflowHome: 'reply',
    hashtags: [0, 3],
    hookWords: 10,
  },
  youtube: {
    /* Two lines above the fold on a Short; the rest is opt-in. */
    visible: 100,
    target: 350,
    max: 5000,
    overflowHome: 'description',
    hashtags: [3, 5],
    hookWords: 9,
  },
  pinterest: {
    /* A pin is read deliberately, and the description is a search surface. */
    visible: 200,
    target: 400,
    max: 500,
    overflowHome: 'none',
    hashtags: [0, 5],
    hookWords: 12,
  },
};

/** A platform with no entry gets the tightest sensible budget rather than none. */
export const DEFAULT_BUDGET: CopyBudget = {
  visible: 100,
  target: 200,
  max: 500,
  overflowHome: 'none',
  hashtags: [0, 3],
  hookWords: 8,
};

export function budgetFor(platform: string, formatSubtype?: string | null): CopyBudget {
  const base = COPY_BUDGETS[platform] ?? DEFAULT_BUDGET;
  /* A long-form YouTube description is a different job from a Short's. */
  if (platform === 'youtube' && formatSubtype === 'long_form') {
    return { ...base, target: 1200, visible: 150 };
  }
  return base;
}

export interface CopySplit {
  /** The caption as published. */
  caption: string;
  /** What did not fit, for `overflowHome`. Empty when everything fitted. */
  overflow: string;
  /** Where the overflow should go. */
  overflowHome: OverflowHome;
  /** The first line, which is what most people actually read. */
  visibleLine: string;
  withinVisible: boolean;
  withinTarget: boolean;
}

/**
 * Split a long body into the caption and the part that belongs elsewhere.
 *
 * Splits on paragraphs, never mid-sentence: a caption cut at a character count
 * reads as broken, and the whole point is that both halves are publishable
 * prose. A body whose *first paragraph* already exceeds the target is returned
 * whole with `withinTarget: false` — trimming it would be editing, and editing
 * is the copywriter's job, which is why `creativeQC` reports it as a defect
 * rather than this function silently fixing it.
 */
export function splitForBudget(body: string, budget: CopyBudget): CopySplit {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const first = paragraphs[0] ?? '';
  const visibleLine = (first.split(/(?<=[.!?])\s/)[0] ?? first).trim();

  if (paragraphs.length <= 1 || body.length <= budget.target) {
    return {
      caption: body.trim(),
      overflow: '',
      overflowHome: budget.overflowHome,
      visibleLine,
      withinVisible: visibleLine.length <= budget.visible,
      withinTarget: body.trim().length <= budget.target,
    };
  }

  /* Take whole paragraphs while they fit. */
  const kept: string[] = [];
  let length = 0;
  for (const paragraph of paragraphs) {
    const next = length === 0 ? paragraph.length : length + 2 + paragraph.length;
    if (kept.length > 0 && next > budget.target) break;
    kept.push(paragraph);
    length = next;
  }

  const caption = kept.join('\n\n');
  const overflow = paragraphs.slice(kept.length).join('\n\n');

  return {
    caption,
    overflow,
    overflowHome: budget.overflowHome,
    visibleLine,
    withinVisible: visibleLine.length <= budget.visible,
    withinTarget: caption.length <= budget.target,
  };
}

export interface CopyBudgetFinding {
  rule: string;
  severity: 'error' | 'warning';
  message: string;
}

/**
 * What is wrong with this caption's length, said in words a writer can act on.
 *
 * Warnings rather than errors throughout, with one exception: over the
 * platform's own ceiling is a rejected post, not a stylistic note. Everything
 * else is a judgement about engagement, and a judgement should not block a
 * human who disagrees with it.
 */
export function checkCopyBudget(
  body: string,
  hashtags: string[],
  budget: CopyBudget,
): CopyBudgetFinding[] {
  const findings: CopyBudgetFinding[] = [];
  const split = splitForBudget(body, budget);
  const text = body.trim();

  if (text.length > budget.max) {
    findings.push({
      rule: 'budget.over_platform_limit',
      severity: 'error',
      message: `${text.length} characters against the platform's ${budget.max}. This will be rejected.`,
    });
  } else if (text.length > budget.target * 1.5) {
    findings.push({
      rule: 'budget.caption_too_long',
      severity: 'warning',
      message:
        `${text.length} characters where ${budget.target} is the budget. ` +
        (budget.overflowHome === 'none'
          ? 'Cut it.'
          : `Keep the first ${split.caption.length} and move the rest to the ${budget.overflowHome.replace('_', ' ')}.`),
    });
  }

  if (!split.withinVisible) {
    findings.push({
      rule: 'budget.opening_truncated',
      severity: 'warning',
      message: `The opening line is ${split.visibleLine.length} characters; about ${budget.visible} show before the fold. Most people will read only part of it.`,
    });
  }

  const [minTags, maxTags] = budget.hashtags;
  if (hashtags.length > maxTags) {
    findings.push({
      rule: 'budget.too_many_hashtags',
      severity: 'warning',
      message: `${hashtags.length} hashtags; ${maxTags} is the ceiling here.`,
    });
  } else if (hashtags.length < minTags) {
    findings.push({
      rule: 'budget.too_few_hashtags',
      severity: 'warning',
      message: `${hashtags.length} hashtags; ${minTags} is the floor on this platform.`,
    });
  }

  return findings;
}
