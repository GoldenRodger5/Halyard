import { describe, expect, it, vi } from 'vitest';
import {
  HOOK_PATTERN_COOLDOWN_DAYS,
  HOOK_TYPES,
  classifyHookType,
  extractHookPattern,
  findHookProblem,
  generateHookVariants,
  isNearDuplicate,
  predictStopRate,
  recencyWeightedScore,
  surfaceBestVariants,
  verifyPayoff,
  type HookHistory,
  type HookVariant,
} from './hooks.js';
import {
  checkCadence,
  cadenceDebt,
  cadenceSummary,
  DEFAULT_CADENCE,
} from '../scheduling/cadence.js';
import { clusterRejections, clusterSummary, shouldSurfaceClusters } from './rejectionClusters.js';
import { FORMAT_SPECS, defaultSubtypeFor, findFormatSpec, formatPromptBlock } from './formatPrompts.js';

function variant(over: Partial<HookVariant> = {}): HookVariant {
  return {
    hookType: 'problem_state',
    textHook: 'Your gluten-free bread is gummy',
    spokenHook: 'There is one reason a gluten-free loaf goes gummy.',
    visualDirection: 'Loaf collapsing, hard cut to the fix',
    captionHook: 'Nobody swaps this correctly.',
    ...over,
  };
}

const emptyHistory: HookHistory = { recentTypes: [], cooledPatterns: [], performance: [] };

describe('hook anti-patterns — I.4', () => {
  it.each([
    ['Want better bread?', 'hook.obvious_question'],
    ['This will change how you cook', 'hook.generic_promise'],
    ['How to bake gluten-free bread', 'hook.how_to_opener'],
    ['5 tips for baking', 'hook.listicle_count'],
    ['Let me show you the trick', 'hook.preamble'],
    ['Your gluten-free sandwich loaf is going to be gummy every single time you bake it', 'hook.too_long'],
  ])('rejects %s', (text, rule) => {
    expect(findHookProblem(variant({ textHook: text }))?.rule).toBe(rule);
  });

  it('rejects a brand name in the first three words', () => {
    const problem = findHookProblem(variant({ textHook: 'RecipeFix fixes gummy bread' }), {
      brandNames: ['RecipeFix'],
    });
    expect(problem?.rule).toBe('hook.brand_first');
    expect(problem?.reason).toMatch(/nobody cares yet/i);
  });

  it('rejects a hook that restates the title', () => {
    const problem = findHookProblem(variant({ textHook: 'Why bread goes gummy' }), {
      title: 'Why bread goes gummy',
    });
    expect(problem?.rule).toBe('hook.restates_title');
  });

  it('accepts a real hook', () => {
    expect(findHookProblem(variant())).toBeNull();
  });
});

describe('the four layers must cohere — I.1', () => {
  it('rejects on-screen text that is the spoken line transcribed', () => {
    const problem = findHookProblem(
      variant({ textHook: 'Your bread is gummy', spokenHook: 'Your bread is gummy.' }),
    );
    expect(problem?.rule).toBe('hook.layers_identical');
    expect(problem?.reason).toMatch(/two channels/i);
  });

  it('rejects a static title card as the visual layer', () => {
    const problem = findHookProblem(variant({ visualDirection: 'Title card with the headline' }));
    expect(problem?.rule).toBe('hook.static_visual');
  });

  it('rejects a video-only type on a still format', () => {
    const problem = findHookProblem(variant({ hookType: 'demonstration' }), { isVideo: false });
    expect(problem?.rule).toBe('hook.type_mismatch');
  });
});

describe('generate eight, surface five — I.3', () => {
  it('surfaces at most five and reports why the rest were dropped', () => {
    const variants: HookVariant[] = [
      variant({ textHook: 'Your gluten-free bread is gummy', hookType: 'problem_state' }),
      variant({ textHook: 'Gluten-free bread goes gummy for you', hookType: 'problem_state' }),
      variant({ textHook: 'Want better bread?', hookType: 'problem_state' }),
      variant({ textHook: 'This recipe added vinegar unprompted', hookType: 'contradiction' }),
      variant({ textHook: 'Twenty five degrees is the whole fix', hookType: 'specificity' }),
      variant({ textHook: 'Almond flour is not a swap', hookType: 'myth_bust' }),
      variant({ textHook: 'One ingredient decides this loaf', hookType: 'open_loop' }),
      variant({ textHook: 'If you bake gluten-free, read this', hookType: 'segment_call' }),
    ];

    const { surfaced, rejected } = surfaceBestVariants(variants, emptyHistory);

    expect(surfaced).toHaveLength(5);
    expect(rejected.some((r) => r.rule === 'hook.obvious_question')).toBe(true);
    expect(rejected.some((r) => r.rule === 'hook.near_duplicate')).toBe(true);
  });

  it('spans multiple hook types rather than five of one', () => {
    // Genuinely different sentences: near-duplicate filtering would otherwise
    // collapse six variants that only differ by an index.
    const texts = [
      'Your gluten-free loaf is gummy',
      'This recipe added vinegar unprompted',
      'Twenty five degrees is the whole fix',
      'Almond flour is not a swap',
      'One ingredient decides whether this collapses',
      'If you bake without gluten, read this',
    ];
    const variants = HOOK_TYPES.slice(0, 6).map((hookType, i) =>
      variant({ hookType, textHook: texts[i]! }),
    );
    const { surfaced } = surfaceBestVariants(variants, emptyHistory, { isVideo: true });
    expect(new Set(surfaced.map((s) => s.hookType)).size).toBeGreaterThanOrEqual(4);
  });

  it('catches near-duplicates that differ only in wording', () => {
    expect(isNearDuplicate('Your gluten-free bread is gummy', 'Gluten-free bread is gummy')).toBe(true);
    expect(isNearDuplicate('Your bread is gummy', 'Doubling is not multiplication')).toBe(false);
  });
});

describe('fatigue and rotation — I.6', () => {
  it('refuses the same hook type twice in a row', () => {
    const { surfaced, rejected } = surfaceBestVariants(
      [variant({ hookType: 'contradiction', textHook: 'This recipe added vinegar unprompted' })],
      { ...emptyHistory, recentTypes: ['contradiction'] },
    );
    expect(surfaced).toHaveLength(0);
    expect(rejected[0]?.rule).toBe('hook.type_repeat');
  });

  it('cools a pattern down for 30 days', () => {
    expect(HOOK_PATTERN_COOLDOWN_DAYS).toBe(30);
    const { rejected } = surfaceBestVariants([variant()], {
      ...emptyHistory,
      cooledPatterns: ['Your gluten-free bread is gummy'],
    });
    expect(rejected[0]?.rule).toBe('hook.pattern_cooldown');
  });

  it('weights recent performance above old performance', () => {
    const now = new Date('2026-08-10T00:00:00Z');
    const recentWin = recencyWeightedScore(
      [
        { score: 0.2, at: new Date('2026-02-01T00:00:00Z') },
        { score: 0.8, at: new Date('2026-08-05T00:00:00Z') },
      ],
      now,
    );
    expect(recentWin).toBeGreaterThan(0.6);
    expect(recencyWeightedScore([], now)).toBeNull();
  });
});

describe('predicted stop rate — I.8', () => {
  const measured = (over: Record<string, unknown> = {}) => ({
    hookType: 'problem_state' as const,
    format: 'reel_script',
    platform: 'instagram',
    viewThroughRate: 0.71,
    samples: 9,
    ...over,
  });

  it('returns null rather than a fabricated number at cold start', () => {
    const prediction = predictStopRate(variant(), emptyHistory, 'reel_script', 'instagram');
    expect(prediction.predictedStopRate).toBeNull();
    expect(prediction.predictionBasis).toMatch(/needs at least 3/);
  });

  it('never predicts over n=2', () => {
    const history: HookHistory = { ...emptyHistory, performance: [measured({ samples: 2 })] };
    expect(
      predictStopRate(variant(), history, 'reel_script', 'instagram').predictedStopRate,
    ).toBeNull();
  });

  it('predicts once there is enough data, and says what it is based on', () => {
    const history: HookHistory = { ...emptyHistory, performance: [measured()] };
    const prediction = predictStopRate(variant(), history, 'reel_script', 'instagram');
    expect(prediction.predictedStopRate).toBeCloseTo(0.71);
    expect(prediction.predictionBasis).toContain('9 problem_state reel_script posts on instagram');
  });

  it('names the measure it actually has rather than the one it resembles', () => {
    /**
     * Halyard collects no three-second retention figure; no platform reports
     * one to it. The basis sentence used to say "average 3s retention", which
     * is a measurement claim nothing in the system supports.
     */
    const history: HookHistory = { ...emptyHistory, performance: [measured()] };
    const basis = predictStopRate(variant(), history, 'reel_script', 'instagram').predictionBasis;
    expect(basis).toContain('view-through');
    expect(basis).not.toMatch(/3s retention/);
  });

  it('will not let one platform’s numbers predict another’s', () => {
    /**
     * Platforms do not agree on what a view is — Instagram counts at about
     * three seconds, TikTok at almost none, YouTube at thirty. Borrowing across
     * them produces a confident number that means nothing anywhere.
     */
    const history: HookHistory = { ...emptyHistory, performance: [measured()] };
    expect(
      predictStopRate(variant(), history, 'reel_script', 'tiktok').predictedStopRate,
    ).toBeNull();
  });

  it('predicts nothing at all when the platform is unknown', () => {
    // Fails closed: no platform, no borrowed evidence, neutral prior.
    const history: HookHistory = { ...emptyHistory, performance: [measured()] };
    const prediction = predictStopRate(variant(), history, 'reel_script');
    expect(prediction.predictedStopRate).toBeNull();
    expect(prediction.predictionBasis).toMatch(/not comparable across them/);
  });
});

describe('swipe-file extraction — I.7', () => {
  it('stores the pattern, not the literal text', () => {
    const { template, type } = extractHookPattern('Your gluten-free bread is gummy');
    expect(template).toBe('Your {diet} {dish} is {problem}');
    expect(type).toBe('problem_state');
  });

  it('classifies the eight types from the text', () => {
    expect(classifyHookType('Watch what happens when the acid goes in')).toBe('demonstration');
    expect(classifyHookType('I shipped this and regretted it')).toBe('confession');
    expect(classifyHookType('Almond flour is not a swap')).toBe('myth_bust');
    expect(classifyHookType('If you bake gluten-free, this is for you')).toBe('segment_call');
    expect(classifyHookType('450 degrees is wrong')).toBe('specificity');
    expect(classifyHookType('This recipe added vinegar nobody asked for')).toBe('contradiction');
  });
});

describe('generateHookVariants', () => {
  it('asks for eight spanning at least four types, and drops video-only types on stills', async () => {
    const complete = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        variants: [
          { hook_type: 'problem_state', text_hook: 'Your loaf is gummy', spoken_hook: 'One reason.' },
        ],
      }),
      model: 'stub',
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0,
    });

    const variants = await generateHookVariants(
      {
        body: 'Vinegar firms the crumb.',
        format: 'carousel',
        category: 'education',
        platform: 'instagram',
        isVideo: false,
      },
      { complete },
    );

    const system = complete.mock.calls[0]![0].system as string;
    expect(system).toContain('Exactly eight variants');
    expect(system).toContain('at least four different ones');
    expect(system).not.toContain('- demonstration:');
    expect(variants[0]?.hookType).toBe('problem_state');
  });

  it('classifies a variant the model failed to type', async () => {
    const complete = vi.fn().mockResolvedValue({
      text: JSON.stringify({ variants: [{ text_hook: 'Watch the crumb collapse' }] }),
      model: 'stub',
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0,
    });
    const variants = await generateHookVariants(
      { body: 'x', format: 'reel_script', category: 'education', platform: 'tiktok', isVideo: true },
      { complete },
    );
    expect(variants[0]?.hookType).toBe('demonstration');
  });
});

describe('payoff verification — I.5', () => {
  it('accepts a hook the body delivers', async () => {
    const complete = vi.fn().mockResolvedValue({
      text: JSON.stringify({ delivered: true, where: 'the vinegar sentence', reason: 'named and explained' }),
      model: 'stub',
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0,
    });
    const verdict = await verifyPayoff({ hook: 'One ingredient decides this', body: '...' }, { complete });
    expect(verdict.delivered).toBe(true);
    expect(verdict.where).toBe('the vinegar sentence');
  });

  it('fails closed when the check itself fails', async () => {
    const complete = vi.fn().mockRejectedValue(new Error('model unavailable'));
    const verdict = await verifyPayoff({ hook: 'h', body: 'b' }, { complete });
    expect(verdict.delivered).toBe(false);
    expect(verdict.reason).toMatch(/could not be verified/i);
  });
});

// ── Part E ─────────────────────────────────────────────────────────────────

describe('cadence ceilings — Part E', () => {
  it('caps video at five a week, not at a daily number', () => {
    const rule = DEFAULT_CADENCE.find((r) => r.format === 'video')!;
    expect(rule.weeklyFloor).toBe(3);
    expect(rule.weeklyCeiling).toBe(5);
    expect(checkCadence('video', { thisWeek: { video: 5 } }).allowed).toBe(false);
  });

  it('explains the ceiling rather than just enforcing it', () => {
    const verdict = checkCadence('video', { thisWeek: { video: 6 } });
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toMatch(/retention degrades/);
  });

  it('flags a format that is under its floor', () => {
    const verdict = checkCadence('video', { thisWeek: { video: 1 } });
    expect(verdict.allowed).toBe(true);
    if (verdict.allowed) expect(verdict.note).toMatch(/weekly floor/);
  });

  it('ranks cadence debt worst first', () => {
    const debt = cadenceDebt({ thisWeek: { video: 0, carousel: 1, text: 3 } });
    expect(debt[0]?.format).toBe('pin');
    expect(debt.map((d) => d.format)).toContain('video');
  });

  it('summarises in a sentence the operator can act on', () => {
    expect(cadenceSummary({ thisWeek: { video: 0 } })).toMatch(/Behind on/);
    expect(
      cadenceSummary({ thisWeek: { video: 4, carousel: 3, image: 3, text: 5, pin: 10 } }),
    ).toBe('Every format is inside its weekly band.');
  });
});

// ── Part A ─────────────────────────────────────────────────────────────────

describe('format-split prompts — Part A and B', () => {
  it('has a spec per format, not per platform', () => {
    const instagram = FORMAT_SPECS.filter((s) => s.platform === 'instagram');
    expect(instagram.map((s) => s.subtype).sort()).toEqual(['carousel', 'reel_script', 'single']);
  });

  it('states the caption architecture in every format prompt', () => {
    for (const spec of FORMAT_SPECS) {
      const block = formatPromptBlock(spec);
      expect(block).toContain('HOOK');
      expect(block).toContain('TURN');
      expect(block).toMatch(/no call to action|no CTA/i);
    }
  });

  it('gives video formats their own beat structure', () => {
    const tiktok = findFormatSpec('tiktok', 'script')!;
    expect(tiktok.isVideo).toBe(true);
    expect(tiktok.extraOutput?.beats).toBeTruthy();
    expect(formatPromptBlock(tiktok)).toMatch(/1\.5 seconds/);
    expect(formatPromptBlock(tiktok)).toMatch(/loop-ready/i);
  });

  it('never lets the founder take be neutralised', () => {
    const take = findFormatSpec('x', 'take')!;
    expect(formatPromptBlock(take)).toMatch(/Sand nothing/);
    expect(formatPromptBlock(take)).toMatch(/Never invent a position/);
  });

  it('routes a platform and format to the right subtype', () => {
    expect(defaultSubtypeFor('instagram', 'carousel')).toBe('carousel');
    expect(defaultSubtypeFor('instagram', 'video')).toBe('reel_script');
    expect(defaultSubtypeFor('pinterest', 'pin')).toBe('pin');
    expect(defaultSubtypeFor('x', 'text')).toBe('insight');
  });
});

// ── Part G ─────────────────────────────────────────────────────────────────

describe('rejection clustering — Part G', () => {
  const rejections = [
    'reads like an ad, no specific claim',
    'too salesy',
    'this is just marketing',
    'generic, could be any product',
    'nothing specific in it',
  ].map((reason, i) => ({
    contentItemId: `item-${i}`,
    category: 'product',
    reason,
    rejectedAt: new Date(),
  }));

  it('finds the recurring complaint without a model call', () => {
    const clusters = clusterRejections(rejections);
    expect(clusters[0]?.pattern).toBe('reads like an ad');
    expect(clusters[0]?.occurrences).toBe(3);
    expect(clusters[0]?.suggestedRule).toMatch(/mechanism or a number/);
  });

  it('stays quiet below the threshold', () => {
    expect(shouldSurfaceClusters(rejections, 'product')).toBe(false);
    const many = Array.from({ length: 10 }, (_, i) => ({ ...rejections[0]!, contentItemId: `x${i}` }));
    expect(shouldSurfaceClusters(many, 'product')).toBe(true);
  });

  it('reads as a sentence rather than a table', () => {
    const cluster = clusterRejections(rejections)[0]!;
    expect(clusterSummary(cluster)).toMatch(/cluster around one thing/);
  });
});
