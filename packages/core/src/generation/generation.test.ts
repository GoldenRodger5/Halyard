import { describe, expect, it, vi } from 'vitest';
import fixture from '../connectors/__fixtures__/recipeAdaptation.json' with { type: 'json' };
import { toArtifact, type RecipeFixAdaptation } from '../connectors/recipefix.js';
import { DraftRejectedError, buildFeedback, writeDraft, writeVoScript } from './copywriter.js';
import { AnthropicLlmClient, extractJson, type LlmClient, type LlmResponse } from './llm.js';
import {
  COLD_START_WEIGHTS,
  LEARNING_MIN_POSTS_PER_CATEGORY,
  PRODUCT_CONTENT_CEILING,
  cosineDistance,
  learningStatus,
  mixDebtScore,
  noveltyScore,
  scoreIdeas,
  selectIdeas,
  type IdeaCandidate,
  type MixState,
} from './ideaEngine.js';
import { buildCopywriterPrompt, buildReplyDraftPrompt, HARD_RULES_BLOCK } from './prompts.js';

const artifact = toArtifact(fixture as unknown as RecipeFixAdaptation);

function stubLlm(replies: string[]): LlmClient & { calls: number } {
  let index = 0;
  const client = {
    calls: 0,
    async complete(): Promise<LlmResponse> {
      client.calls++;
      const text = replies[Math.min(index++, replies.length - 1)]!;
      return { text, model: 'stub', inputTokens: 100, outputTokens: 50, costUsd: 0.001 };
    },
  };
  return client;
}

const baseRequest = {
  platform: 'x' as const,
  format: 'text' as const,
  category: 'education',
  persona: 'brand' as const,
  idea: { title: 'Vinegar in gluten-free bread', angle: 'Acid does what gluten cannot.' },
  artifact,
  voice: {
    displayName: 'RecipeFix',
    description: 'Plain, specific, useful.',
    doRules: ['Name the mechanism'],
    dontRules: ['No exclamation marks'],
    examples: [{ text: 'Your loaf is gummy because the starch holds water.' }],
  },
  productBrief: 'RecipeFix adapts any recipe to how you actually eat.',
  contentRules: { forbiddenClaims: [], bannedPhrases: [] },
};

const goodReply = JSON.stringify({
  body: 'Your gluten-free loaf is gummy. The recipe added vinegar nobody asked for. Acid firms the protein network gluten would normally build.',
  alt_text: 'A sliced gluten-free loaf on a board',
  hashtags: [],
  hook_pattern: 'Why your {thing} is {problem}.',
  claims: [
    {
      text: 'acid firms the protein network gluten would normally build',
      source: 'ingredients[4].changeReason',
    },
  ],
});

describe('AnthropicLlmClient construction', () => {
  it('refuses an absent key', () => {
    expect(() => new AnthropicLlmClient('')).toThrow(/not set/);
    expect(() => new AnthropicLlmClient('   ')).toThrow(/not set/);
  });

  it('refuses a placeholder, which is truthy and therefore the dangerous case', () => {
    // The value shipped in .env.example is a comment. A bare falsy check passes
    // it and the failure surfaces as a 401 from the SDK instead of as the one
    // sentence that says what to do.
    expect(() => new AnthropicLlmClient('   # paste yours here')).toThrow(/sk-ant-/);
    expect(() => new AnthropicLlmClient('your-key-here')).toThrow(/console.anthropic.com/);
  });

  it('accepts something shaped like a real key', () => {
    expect(() => new AnthropicLlmClient('sk-ant-api03-notarealkey')).not.toThrow();
  });
});

describe('extractJson', () => {
  it('reads a bare object, a fenced object, and one wrapped in prose', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson('Here you go:\n{"a":3}\nHope that helps.')).toEqual({ a: 3 });
  });

  it('handles braces inside strings', () => {
    expect(extractJson('{"a":"a { brace } inside"}')).toEqual({ a: 'a { brace } inside' });
  });

  it('throws when there is no JSON at all', () => {
    expect(() => extractJson('no json here')).toThrow(/No JSON/);
  });
});

describe('writeDraft', () => {
  it('returns a draft that passed every gate', async () => {
    const llm = stubLlm([goodReply]);
    const draft = await writeDraft(baseRequest, llm);

    expect(draft.qc.passed).toBe(true);
    expect(draft.attempts).toBe(1);
    expect(draft.claims).toHaveLength(1);
    expect(draft.altText).toBeTruthy();
    expect(draft.generationMeta.promptVersion).toBe('copywriter.v1');
    expect(draft.generationMeta.costUsd).toBeGreaterThan(0);
  });

  it('regenerates with the specific violation fed back, and succeeds', async () => {
    const badReply = JSON.stringify({
      body: 'This is a game changer — truly a must-try.',
      hashtags: [],
      claims: [],
    });
    const llm = stubLlm([badReply, goodReply]);
    const draft = await writeDraft(baseRequest, llm);

    expect(draft.attempts).toBe(2);
    expect(llm.calls).toBe(2);
  });

  it('never queues copy that keeps failing', async () => {
    const badReply = JSON.stringify({ body: 'A game changer — truly.', hashtags: [], claims: [] });
    const llm = stubLlm([badReply]);

    await expect(writeDraft({ ...baseRequest, maxAttempts: 2 }, llm)).rejects.toBeInstanceOf(
      DraftRejectedError,
    );
    expect(llm.calls).toBe(2);
  });

  it('rejects a draft whose claim does not trace to the artifact', async () => {
    const fabricated = JSON.stringify({
      body: 'Drop the oven to 375 degrees for a better crumb.',
      hashtags: [],
      claims: [{ text: 'drop the oven to 375 degrees', source: 'steps[2].updated_note' }],
    });
    const llm = stubLlm([fabricated]);
    await expect(writeDraft({ ...baseRequest, maxAttempts: 1 }, llm)).rejects.toBeInstanceOf(
      DraftRejectedError,
    );
  });

  it('recovers when the model returns something that is not JSON', async () => {
    const llm = stubLlm(['I would suggest the following angle...', goodReply]);
    const draft = await writeDraft(baseRequest, llm);
    expect(draft.attempts).toBe(2);
  });

  it('passes the operator regen note into the first call', async () => {
    const complete = vi.fn().mockResolvedValue({
      text: goodReply,
      model: 'stub',
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0,
    });
    await writeDraft({ ...baseRequest, regenNote: 'less salesy, lead with the failure' }, {
      complete,
    });
    expect(complete.mock.calls[0]![0].messages[0].content).toContain('lead with the failure');
  });
});

describe('buildFeedback', () => {
  it('names the rule and the fix rather than saying try again', async () => {
    const llm = stubLlm([JSON.stringify({ body: 'A game changer — truly.', hashtags: [], claims: [] })]);
    let captured = '';
    try {
      await writeDraft({ ...baseRequest, maxAttempts: 1 }, llm);
    } catch (err) {
      captured = buildFeedback((err as DraftRejectedError).lastQc);
    }
    expect(captured).toContain('punctuation.em_dash');
    expect(captured).toContain('phrase.banned');
    expect(captured).toContain('you wrote:');
  });
});

describe('prompts', () => {
  it('always ends the copywriter system prompt with the hard rules', () => {
    const { system } = buildCopywriterPrompt({ ...baseRequest, hooks: [] });
    expect(system).toContain(HARD_RULES_BLOCK);
    expect(system).toContain('No em dashes');
  });

  it('puts the artifact and its source paths in front of the model', () => {
    const { user } = buildCopywriterPrompt({ ...baseRequest, hooks: [] });
    expect(user).toContain('ingredients[4].changeReason');
    expect(user).toContain('the only source of fact');
  });

  it('says explicitly when there is no artifact', () => {
    const { user } = buildCopywriterPrompt({ ...baseRequest, artifact: null, hooks: [] });
    expect(user).toContain('Make no factual claims');
  });

  it('includes proven hooks and the series slot when given', () => {
    const { user } = buildCopywriterPrompt({
      ...baseRequest,
      hooks: ['Why your {dish} is {failure_mode}.'],
      series: { name: 'Fix This Recipe', nextSequence: 47 },
    });
    expect(user).toContain('Why your {dish}');
    expect(user).toContain('#47');
  });

  it('tells the reply drafter that a human sends, not the model', () => {
    const { system } = buildReplyDraftPrompt({
      postBody: 'post',
      comment: 'does this work with oat flour?',
      voiceSummary: 'plain and useful',
    });
    expect(system).toContain('You never send anything');
    expect(system).toContain('is_support_question');
  });
});

describe('writeVoScript', () => {
  it('asks for a word count matched to the target duration', async () => {
    const complete = vi.fn().mockResolvedValue({
      text: 'Your loaf is gummy. The starch holds water.',
      model: 'stub',
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0,
    });
    await writeVoScript(
      { body: 'copy', artifact, targetSeconds: 30, platform: 'tiktok' },
      { complete },
    );
    const system = complete.mock.calls[0]![0].system as string;
    expect(system).toContain('79 words'); // 30s at 158 wpm
    expect(system).toContain('Spell every number as words');
  });

  it('refuses a script that would be unspeakable, rather than returning it', async () => {
    /**
     * The post body has always been gated by the slop filter and the claim
     * verifier on a retry loop. The voiceover — the half the viewer actually
     * hears — was returned from a single call, unchecked.
     *
     * A hashtag is read aloud as "hash tag". A fraction reaches the synthesiser
     * as a symbol. Neither is recoverable by a listener.
     */
    const complete = vi.fn().mockResolvedValue({
      text: 'Use 3/4 cup of the blend #baking (it matters).',
      model: 'stub',
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0,
    });

    await expect(
      writeVoScript(
        { body: 'copy', artifact, targetSeconds: 20, platform: 'tiktok', maxAttempts: 2 },
        { complete },
      ),
    ).rejects.toThrow(/failed QC/);

    // It retried with feedback rather than giving up on the first reply.
    expect(complete).toHaveBeenCalledTimes(2);
    expect(String(complete.mock.calls[1]![0].messages[0].content)).toContain('Revision notes');
  });

  it('enforces the product forbidden-claims list on what is spoken', async () => {
    // The list reached the caption and never the narration.
    const complete = vi.fn().mockResolvedValue({
      text: 'This will cure your gluten intolerance for good.',
      model: 'stub',
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0,
    });

    await expect(
      writeVoScript(
        {
          body: 'copy',
          artifact,
          targetSeconds: 20,
          platform: 'tiktok',
          maxAttempts: 1,
          contentRules: { forbiddenClaims: ['cure'] },
        },
        { complete },
      ),
    ).rejects.toThrow(/failed QC/);
  });

  it('returns a clean script with its verdict attached', async () => {
    const complete = vi.fn().mockResolvedValue({
      text: 'Your loaf is gummy. The starch holds water. Give it time to set.',
      model: 'stub',
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0,
    });

    const result = await writeVoScript(
      { body: 'copy', artifact, targetSeconds: 20, platform: 'tiktok' },
      { complete },
    );
    expect(result.qc.passed).toBe(true);
    expect(result.attempts).toBe(1);
  });
});

// ── the decision engine ─────────────────────────────────────────────────────

const mix: MixState = {
  targets: { transformation: 0.4, education: 0.25, community: 0.2, product: 0.15 },
  actual: { transformation: 0.55, education: 0.08, community: 0.25, product: 0.12 },
  productShare14d: 0.12,
  postsPerCategory: { transformation: 11, education: 2, community: 5, product: 2 },
};

function candidate(over: Partial<IdeaCandidate> = {}): IdeaCandidate {
  return {
    id: 'idea-1',
    title: 'Why gluten-free bread needs vinegar',
    angle: 'Acid does the structural work gluten would.',
    category: 'education',
    availableTemplates: ['carousel_6', 'TransformationDiff'],
    ...over,
  };
}

describe('idea engine — v2 Part G', () => {
  it('weights mix debt highest at cold start', () => {
    expect(COLD_START_WEIGHTS.mixDebt).toBe(0.25);
    expect(COLD_START_WEIGHTS.historical).toBe(0.1);
    expect(
      Object.values(COLD_START_WEIGHTS).reduce((a, b) => a + b, 0),
    ).toBeCloseTo(1);
  });

  it('scores an under-served pillar above an over-served one', () => {
    expect(mixDebtScore('education', mix)).toBeGreaterThan(0.5);
    expect(mixDebtScore('transformation', mix)).toBe(0);
  });

  it('ranks the under-served category first, all else equal', () => {
    const scored = scoreIdeas(
      [
        candidate({ id: 'edu', category: 'education' }),
        candidate({ id: 'trans', category: 'transformation' }),
      ],
      mix,
    ).sort((a, b) => b.score - a.score);
    expect(scored[0]?.id).toBe('edu');
    expect(scored[0]?.explanation).toContain('mix debt');
  });

  it('measures novelty as distance from the last 60 days', () => {
    expect(cosineDistance([1, 0, 0], [1, 0, 0])).toBeCloseTo(0);
    expect(cosineDistance([1, 0, 0], [0, 1, 0])).toBeCloseTo(1);
    expect(noveltyScore([1, 0, 0], [[1, 0, 0]])).toBeCloseTo(0);
    expect(noveltyScore([1, 0, 0], [[0, 1, 0]])).toBeCloseTo(1);
    expect(noveltyScore(undefined, [[1, 0, 0]])).toBe(1);
  });

  it('blocks an idea too close to something posted recently', () => {
    const { selected, rejected } = selectIdeas(
      [candidate({ id: 'dupe', embedding: [1, 0, 0] })],
      mix,
      { recentEmbeddings: [[1, 0, 0.02]] },
    );
    expect(selected).toHaveLength(0);
    expect(rejected[0]?.blockedReason).toMatch(/last 60 days/);
  });

  it('refuses an idea no enabled template can render', () => {
    const { selected, rejected } = selectIdeas(
      [candidate({ id: 'unrenderable', availableTemplates: [] })],
      mix,
    );
    expect(selected).toHaveLength(0);
    expect(rejected[0]?.blockedReason).toMatch(/template/);
  });

  it('enforces the 15% product-content ceiling regardless of score', () => {
    const saturated: MixState = { ...mix, productShare14d: 0.15, postsPerCategory: { product: 3 } };
    const { selected, rejected } = selectIdeas(
      [candidate({ id: 'promo', category: 'product', daysUntilSeasonalPeak: 1 })],
      saturated,
    );
    expect(selected).toHaveLength(0);
    expect(rejected[0]?.blockedReason).toContain(`${PRODUCT_CONTENT_CEILING * 100}%`);
  });

  it('allows product content when the trailing window has room', () => {
    const roomy: MixState = { ...mix, productShare14d: 0.02, postsPerCategory: { product: 1, education: 40 } };
    const { selected } = selectIdeas([candidate({ id: 'promo', category: 'product' })], roomy);
    expect(selected.map((s) => s.id)).toContain('promo');
  });

  it('never selects two ideas in the same category on one day', () => {
    const { selected, rejected } = selectIdeas(
      [
        candidate({ id: 'a', category: 'education' }),
        candidate({ id: 'b', category: 'education' }),
        candidate({ id: 'c', category: 'community' }),
      ],
      mix,
      { limit: 3 },
    );
    expect(selected.map((s) => s.category)).toEqual([...new Set(selected.map((s) => s.category))]);
    expect(rejected.some((r) => r.blockedReason?.includes('already selected'))).toBe(true);
  });

  it('honours a category cooldown', () => {
    const { rejected } = selectIdeas([candidate({ id: 'a' })], mix, {
      cooldownCategories: ['education'],
    });
    expect(rejected[0]?.blockedReason).toMatch(/cooldown/);
  });

  it('boosts a seasonal idea inside its window and drops one that has passed', () => {
    const soon = scoreIdeas([candidate({ daysUntilSeasonalPeak: 3 })], mix)[0]!;
    const passed = scoreIdeas([candidate({ daysUntilSeasonalPeak: -2 })], mix)[0]!;
    expect(soon.breakdown.seasonal).toBe(1);
    expect(passed.breakdown.seasonal).toBe(0);
    expect(soon.score).toBeGreaterThan(passed.score);
  });

  it('reports honestly that learning is not active yet', () => {
    const status = learningStatus(mix);
    expect(status.active).toBe(false);
    expect(status.message).toContain(String(LEARNING_MIN_POSTS_PER_CATEGORY));
    expect(status.message).toContain('hand-set');
  });

  it('reports which categories learning is live for once there is volume', () => {
    const status = learningStatus({ ...mix, postsPerCategory: { transformation: 34, education: 4 } });
    expect(status.active).toBe(true);
    expect(status.categoriesReady).toEqual(['transformation']);
  });
});
