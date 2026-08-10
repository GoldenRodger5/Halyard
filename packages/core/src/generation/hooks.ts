/**
 * The hook system. Milestone 27, Part I.
 *
 * Hooks get their own architecture because they are the highest-leverage three
 * seconds in the product, and "generate five variants" undersells what is
 * possible. The loop here is the one that compounds: everything else in Halyard
 * makes production faster, this makes the output better over time.
 *
 * Four ideas do the work:
 *
 *   1. A hook is four coordinated artifacts, not one string (I.1).
 *   2. Types are named and tracked separately, because "which hook won" is
 *      useless without knowing what kind it was (I.2).
 *   3. Generate eight, surface five. Choice fatigue is real and this is a daily
 *      task (I.3).
 *   4. A hook that promises something the body does not deliver is clickbait,
 *      and it trains an audience to distrust the account (I.5).
 */
import { extractJson, type LlmClient, DRAFT_MODEL } from './llm.js';

// ── I.2 — the taxonomy ─────────────────────────────────────────────────────

export const HOOK_TYPES = [
  'problem_state',
  'contradiction',
  'specificity',
  'myth_bust',
  'open_loop',
  'segment_call',
  'confession',
  'demonstration',
] as const;

export type HookType = (typeof HOOK_TYPES)[number];

export const HOOK_TYPE_GUIDE: Record<HookType, { shape: string; bestFor: string; example: string }> = {
  problem_state: {
    shape: "Name the reader's failure",
    bestFor: 'education, technique',
    example: 'Your gluten-free bread is gummy.',
  },
  contradiction: {
    shape: "Something that shouldn't be true, is",
    bestFor: 'transformations',
    example: 'This recipe added an ingredient nobody asked for.',
  },
  specificity: {
    shape: 'A precise number as the whole hook',
    bestFor: 'scaling, ratios',
    example: 'Twenty five degrees. That is the whole fix.',
  },
  myth_bust: {
    shape: 'The common belief is wrong',
    bestFor: 'substitution guides',
    example: 'Almond flour is not a 1 to 1 swap.',
  },
  open_loop: {
    shape: 'Withhold the payoff explicitly',
    bestFor: 'any video',
    example: 'One ingredient decides whether this collapses.',
  },
  segment_call: {
    shape: 'Address one group directly',
    bestFor: 'dietary content',
    example: 'If you bake gluten-free, this one is for you.',
  },
  confession: {
    shape: 'I got this wrong',
    bestFor: 'founder',
    example: 'I shipped this and immediately regretted the wording.',
  },
  demonstration: {
    shape: 'Watch what happens',
    bestFor: 'video only',
    example: 'Watch the crumb when the acid goes in.',
  },
};

/** Types that only make sense with motion. */
const VIDEO_ONLY_TYPES: HookType[] = ['demonstration'];

// ── I.1 — a hook is four things ────────────────────────────────────────────

export interface HookVariant {
  hookType: HookType;
  /** Frame 1. Four to seven words, high contrast, inside the safe area. */
  textHook: string;
  /** Zero to 1.5 seconds. One sentence, no throat-clearing. */
  spokenHook?: string;
  /** Zero to 3 seconds. Motion, cut, or state change — never a static card. */
  visualDirection?: string;
  /** First line of the caption. Works with no video context; feeds truncate. */
  captionHook?: string;
  predictedStopRate?: number | null;
  predictionBasis?: string;
}

export interface HookRejection {
  variant: HookVariant;
  rule: string;
  reason: string;
}

// ── I.4 — anti-patterns, hard rejected ─────────────────────────────────────

const HOOK_ANTI_PATTERNS: Array<{ rule: string; test: (hook: string) => boolean; reason: string }> = [
  {
    rule: 'hook.obvious_question',
    test: (h) => /^(want|do you want|are you|ever|tired of|struggling)\b/i.test(h.trim()),
    reason: 'A question with an obvious answer. Nobody answers "want better bread?" with no.',
  },
  {
    rule: 'hook.generic_promise',
    test: (h) =>
      /(will change how you|change your life|you need to know|everything you need|best kept secret)/i.test(h),
    reason: 'A generic promise. It could precede any content, so it promises nothing.',
  },
  {
    rule: 'hook.how_to_opener',
    test: (h) => /^how to\b/i.test(h.trim()),
    reason: '"How to" as an opener is flat. No tension, nothing withheld.',
  },
  {
    rule: 'hook.listicle_count',
    test: (h) => /^\d+\s+(tips?|ways?|things?|hacks?|secrets?)\b/i.test(h.trim()),
    reason: 'A listicle count with no specificity. "5 tips for baking" says nothing about which five.',
  },
  {
    rule: 'hook.preamble',
    test: (h) => /^(let me show you|let me tell you|i want to talk|today i|in this)\b/i.test(h.trim()),
    reason: 'Preamble, not a hook. The window is three seconds and this spends it introducing itself.',
  },
  {
    rule: 'hook.too_long',
    test: (h) => countWords(h) > 12,
    reason: 'Over twelve words. The hook is the first three to five.',
  },
];

/** Brand names in the opening: nobody cares yet. */
function mentionsBrandEarly(hook: string, brandNames: string[]): boolean {
  const firstThree = hook.trim().split(/\s+/).slice(0, 3).join(' ').toLowerCase();
  return brandNames.some((name) => name && firstThree.includes(name.toLowerCase()));
}

function countWords(text: string): number {
  return (text.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
}

export interface HookFilterContext {
  /** The post title, so a hook that restates it can be caught. */
  title?: string;
  brandNames?: string[];
  isVideo?: boolean;
}

/**
 * I.4 plus the coherence rules from I.1. Returns the reason rather than a
 * boolean, because the reason is what makes the next generation better.
 */
export function findHookProblem(
  variant: HookVariant,
  context: HookFilterContext = {},
): { rule: string; reason: string } | null {
  const text = variant.textHook.trim();

  if (text.length === 0) return { rule: 'hook.empty', reason: 'No on-screen text.' };

  for (const anti of HOOK_ANTI_PATTERNS) {
    if (anti.test(text)) return { rule: anti.rule, reason: anti.reason };
  }

  if (mentionsBrandEarly(text, context.brandNames ?? [])) {
    return {
      rule: 'hook.brand_first',
      reason: 'Brand name in the first three words. Nobody cares yet.',
    };
  }

  if (context.title && normalise(text) === normalise(context.title)) {
    return { rule: 'hook.restates_title', reason: 'Restates the title and wastes the window.' };
  }

  // I.1 — the layers must cohere without being identical.
  if (variant.spokenHook && normalise(variant.spokenHook) === normalise(text)) {
    return {
      rule: 'hook.layers_identical',
      reason: 'The on-screen text is the spoken line transcribed. Two channels saying one thing wastes one of them.',
    };
  }

  if (variant.visualDirection && /^(title card|static|text on screen|logo)/i.test(variant.visualDirection.trim())) {
    return {
      rule: 'hook.static_visual',
      reason: 'The visual layer is a static card. The first three seconds need a pattern interrupt.',
    };
  }

  if (context.isVideo === false && VIDEO_ONLY_TYPES.includes(variant.hookType)) {
    return {
      rule: 'hook.type_mismatch',
      reason: `The ${variant.hookType} type needs motion and this is not a video.`,
    };
  }

  if (countWords(text) < 3) {
    return { rule: 'hook.too_short', reason: 'Under three words. Not enough to carry an idea.' };
  }

  return null;
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
}

/** Two hooks that differ only in wording are one hook shown twice. */
export function isNearDuplicate(a: string, b: string): boolean {
  const tokensA = new Set(normalise(a).split(' ').filter((w) => w.length > 2));
  const tokensB = new Set(normalise(b).split(' ').filter((w) => w.length > 2));
  if (tokensA.size === 0 || tokensB.size === 0) return false;

  let shared = 0;
  for (const token of tokensA) if (tokensB.has(token)) shared++;
  return shared / Math.min(tokensA.size, tokensB.size) >= 0.7;
}

// ── I.3 — generate eight, surface five ─────────────────────────────────────

export interface HookHistory {
  /** Types used on this account's last few posts, newest first. */
  recentTypes: HookType[];
  /** Patterns used in the last 30 days, which are on cooldown. */
  cooledPatterns: string[];
  /** Recency-weighted stop rate by type and format, where there is data. */
  performance: Array<{ hookType: HookType; format: string; stopRate: number; samples: number }>;
}

export interface SurfaceResult {
  surfaced: HookVariant[];
  rejected: HookRejection[];
}

/**
 * Filter eight down to five. Showing eight is worse than five: choice fatigue is
 * real and this is a daily task.
 */
export function surfaceBestVariants(
  variants: HookVariant[],
  history: HookHistory,
  context: HookFilterContext & { format?: string } = {},
  limit = 5,
): SurfaceResult {
  const surfaced: HookVariant[] = [];
  const rejected: HookRejection[] = [];

  const scored = variants
    .map((variant) => ({
      variant,
      score: scoreVariant(variant, history, context.format ?? 'unknown'),
    }))
    .sort((a, b) => b.score - a.score);

  for (const { variant } of scored) {
    const problem = findHookProblem(variant, context);
    if (problem) {
      rejected.push({ variant, ...problem });
      continue;
    }

    const duplicate = surfaced.find((kept) => isNearDuplicate(kept.textHook, variant.textHook));
    if (duplicate) {
      rejected.push({
        variant,
        rule: 'hook.near_duplicate',
        reason: `Too close to "${duplicate.textHook}".`,
      });
      continue;
    }

    // I.6 — no hook type twice consecutively on the same account.
    if (surfaced.length === 0 && history.recentTypes[0] === variant.hookType) {
      rejected.push({
        variant,
        rule: 'hook.type_repeat',
        reason: `The last post already used a ${variant.hookType} hook.`,
      });
      continue;
    }

    if (history.cooledPatterns.some((pattern) => isNearDuplicate(pattern, variant.textHook))) {
      rejected.push({
        variant,
        rule: 'hook.pattern_cooldown',
        reason: 'This pattern was used in the last 30 days.',
      });
      continue;
    }

    surfaced.push({ ...variant, ...predictStopRate(variant, history, context.format ?? 'unknown') });
    if (surfaced.length >= limit) break;
  }

  return { surfaced, rejected };
}

function scoreVariant(variant: HookVariant, history: HookHistory, format: string): number {
  const match = history.performance.find(
    (p) => p.hookType === variant.hookType && p.format === format,
  );
  // With no data every type is equal, which is the honest position.
  if (!match || match.samples < 3) return 0.5;
  return match.stopRate;
}

/**
 * I.8 — a predicted three-second retention, or nothing.
 *
 * Cold start shows "no data" rather than a fabricated number. Rendering a
 * confident prediction over n=2 is worse than rendering none.
 */
export function predictStopRate(
  variant: HookVariant,
  history: HookHistory,
  format: string,
): { predictedStopRate: number | null; predictionBasis: string } {
  const match = history.performance.find(
    (p) => p.hookType === variant.hookType && p.format === format,
  );

  if (!match || match.samples < 3) {
    return {
      predictedStopRate: null,
      predictionBasis: `No data. ${match?.samples ?? 0} ${variant.hookType} ${format} posts so far; a prediction needs at least 3.`,
    };
  }

  return {
    predictedStopRate: Number(match.stopRate.toFixed(3)),
    predictionBasis: `${(match.stopRate * 100).toFixed(0)}% average 3s retention across ${match.samples} ${variant.hookType} ${format} posts.`,
  };
}

// ── I.6 — recency-weighted performance ─────────────────────────────────────

/**
 * A pattern that worked six months ago should not dominate forever. Weight
 * halves every 45 days.
 */
export function recencyWeightedScore(
  samples: Array<{ score: number; at: Date }>,
  now = new Date(),
  halfLifeDays = 45,
): number | null {
  if (samples.length === 0) return null;

  let weighted = 0;
  let weight = 0;
  for (const sample of samples) {
    const ageDays = (now.getTime() - sample.at.getTime()) / 86_400_000;
    const w = 0.5 ** (ageDays / halfLifeDays);
    weighted += sample.score * w;
    weight += w;
  }
  return weight === 0 ? null : Number((weighted / weight).toFixed(4));
}

export const HOOK_PATTERN_COOLDOWN_DAYS = 30;

// ── I.7 — extraction from the swipe file ───────────────────────────────────

/**
 * Turn a saved example into a reusable *pattern*, not literal text. Taste enters
 * the system as structure rather than as a vague instruction.
 */
export function extractHookPattern(hook: string): { template: string; type: HookType } {
  const template = hook
    .replace(/\b\d+(\.\d+)?\b/g, '{n}')
    .replace(/\b(gluten-free|dairy-free|vegan|keto|low-carb)\b/gi, '{diet}')
    .replace(/\b(bread|loaf|cake|pasta|sauce|cookies?|crust)\b/gi, '{dish}')
    .replace(/\b(gummy|dense|dry|flat|soggy|bland|tough)\b/gi, '{problem}');

  return { template, type: classifyHookType(hook) };
}

export function classifyHookType(hook: string): HookType {
  const text = hook.toLowerCase();
  if (/^watch\b|^look what|^this is what happens/.test(text)) return 'demonstration';
  if (/\bi (got|was|had|shipped|regret)\b|\bmy mistake\b/.test(text)) return 'confession';
  if (/\bis not\b|\bisn't\b|\bnever\b.*\b(works?|true)\b|\bmyth\b/.test(text)) return 'myth_bust';
  if (/^if you\b|^for (everyone|anyone) who\b|\byou bake\b/.test(text)) return 'segment_call';
  if (/^\d|\b\d+\s*(degrees|percent|minutes|grams|cups)\b/.test(text)) return 'specificity';
  if (/\bnobody\b|\bshouldn't\b|\bunprompted\b|\bwithout being asked\b/.test(text)) return 'contradiction';
  if (/\bone (thing|ingredient|change)\b.*\b(decides|determines)\b|\bhere is why\b/.test(text)) return 'open_loop';
  return 'problem_state';
}

// ── Generation ─────────────────────────────────────────────────────────────

export const HOOK_PROMPT_VERSION = 'hooks.v1';

export interface GenerateHooksInput {
  body: string;
  format: string;
  category: string;
  platform: string;
  isVideo: boolean;
  /** Types worth avoiding this time, because the last post used them. */
  avoidTypes?: HookType[];
  /** Proven patterns, as structure rather than literal text. */
  provenPatterns?: string[];
  brandNames?: string[];
}

/**
 * Generate eight variants spanning at least four types. The spread matters more
 * than the count: eight variants of one type teaches nothing.
 */
export async function generateHookVariants(
  input: GenerateHooksInput,
  llm: LlmClient,
): Promise<HookVariant[]> {
  const usableTypes = HOOK_TYPES.filter(
    (type) =>
      (input.isVideo || !VIDEO_ONLY_TYPES.includes(type)) && !input.avoidTypes?.includes(type),
  );

  const response = await llm.complete({
    system: `You write hooks for short-form social content. The first three seconds
drive roughly 80 percent of completion variance, so this is the highest-leverage
writing in the whole post.

A hook is FOUR coordinated artifacts, not one line:

| Layer | Constraint |
|---|---|
| text_hook | On screen, frame 1. Four to seven words. Must be legible at a glance |
| spoken_hook | One sentence that lands inside 1.5 seconds. No throat-clearing |
| visual_direction | A pattern interrupt in the first 3 seconds. Motion, a cut, a state change. NEVER a static title card |
| caption_hook | First line of the caption. Must work with no video context, because feeds truncate |

They must cohere without being identical. On-screen text that is just the spoken
line transcribed wastes one of two channels.

TYPES — use at least four different ones across your eight variants:
${usableTypes.map((t) => `- ${t}: ${HOOK_TYPE_GUIDE[t].shape}. e.g. "${HOOK_TYPE_GUIDE[t].example}"`).join('\n')}

NEVER WRITE:
- questions with obvious answers ("Want better bread?")
- generic promises ("This will change how you cook")
- "How to ..." as an opener
- listicle counts with no specificity ("5 tips for baking")
- "Let me show you" or any preamble
- a restatement of the title
- a brand name in the first three words
- anything over twelve words

${input.provenPatterns?.length ? `PATTERNS THAT HAVE WORKED HERE — reuse the shape, not the words:\n${input.provenPatterns.map((p) => `- ${p}`).join('\n')}\n` : ''}
Reply with JSON only:
{"variants":[{"hook_type":"","text_hook":"","spoken_hook":"","visual_direction":"","caption_hook":""}]}
Exactly eight variants.`,
    messages: [
      {
        role: 'user',
        content: `Platform: ${input.platform}. Format: ${input.format}. Category: ${input.category}.

The post this hooks into:
${input.body}`,
      },
    ],
    model: DRAFT_MODEL,
    maxTokens: 1600,
    promptVersion: HOOK_PROMPT_VERSION,
  });

  const parsed = extractJson<{
    variants?: Array<{
      hook_type?: string;
      text_hook?: string;
      spoken_hook?: string;
      visual_direction?: string;
      caption_hook?: string;
    }>;
  }>(response.text);

  return (parsed.variants ?? [])
    .filter((v) => v.text_hook)
    .map((v) => ({
      hookType: (HOOK_TYPES as readonly string[]).includes(v.hook_type ?? '')
        ? (v.hook_type as HookType)
        : classifyHookType(v.text_hook!),
      textHook: v.text_hook!.trim(),
      spokenHook: v.spoken_hook?.trim(),
      visualDirection: v.visual_direction?.trim(),
      captionHook: v.caption_hook?.trim(),
    }));
}

// ── I.5 — payoff verification ──────────────────────────────────────────────

export interface PayoffVerdict {
  delivered: boolean;
  where: string | null;
  reason: string;
}

export const PAYOFF_PROMPT_VERSION = 'hook_payoff.v1';

/**
 * A hook that promises something the body does not deliver is clickbait, and it
 * trains an audience to distrust the account. Fails closed: an unparseable
 * answer is treated as undelivered.
 *
 * This is the difference between a hook library that compounds and one that
 * burns the account down slowly.
 */
export async function verifyPayoff(
  input: { hook: string; body: string },
  llm: LlmClient,
): Promise<PayoffVerdict> {
  try {
    const response = await llm.complete({
      system: `You check whether a hook's promise is delivered by the body of the post.

A hook makes an implicit promise. Decide whether the body pays it off, and say
where. Be strict: "related to the same topic" is not delivery. If the hook says
one ingredient decides the outcome, the body must name that ingredient and say
why.

Reply with JSON only:
{"delivered":true,"where":"the sentence that pays it off","reason":"one sentence"}`,
      messages: [{ role: 'user', content: `HOOK\n${input.hook}\n\nBODY\n${input.body}` }],
      model: DRAFT_MODEL,
      maxTokens: 400,
      promptVersion: PAYOFF_PROMPT_VERSION,
    });

    const parsed = extractJson<{ delivered?: boolean; where?: string; reason?: string }>(
      response.text,
    );

    return {
      delivered: parsed.delivered === true,
      where: parsed.where ?? null,
      reason: parsed.reason ?? 'No reason given.',
    };
  } catch (err) {
    // Fail closed. An unverifiable hook is not a verified hook.
    return {
      delivered: false,
      where: null,
      reason: `Payoff could not be verified (${(err as Error).message}). Treated as undelivered.`,
    };
  }
}
