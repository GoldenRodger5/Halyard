/**
 * The Idea Generator, which had no caller.
 *
 * `ideas` is the entry point of the generation pipeline and its only writer in
 * the repository was `supabase/seed-demo.sql`. These cover the proposer that
 * replaces it — and specifically every way a model's answer can be unusable,
 * because an unusable proposal that reaches `ideas` becomes a draft, and a draft
 * becomes something an operator has to read and reject.
 */
import { describe, expect, it } from 'vitest';
import { proposeIdeas, type ProposeIdeasInput } from './ideaGenerator.js';
import { IDEA_CATEGORIES } from './ideaEngine.js';
import {
  SIGNAL_SUMMARY_CHARS,
  TITLE_CHARS,
  buildIdeaGeneratorPrompt,
} from './prompts.js';
import type { LlmClient, LlmResponse } from './llm.js';

function stub(text: string): LlmClient & { calls: number } {
  const client = {
    calls: 0,
    async complete(): Promise<LlmResponse> {
      client.calls++;
      return { text, model: 'stub', inputTokens: 10, outputTokens: 20, costUsd: 0.002 };
    },
  };
  return client;
}

const input: ProposeIdeasInput = {
  productBrief: 'RecipeFix adapts any recipe to how you actually eat.',
  voiceSummary: 'Plain, specific, useful.',
  signals: [
    { id: 'sig-1', source: 'editorial', summary: 'Asked 9 times: why is my GF loaf gummy' },
    { id: 'sig-2', source: 'editorial', summary: 'Asked 4 times: can I halve the yeast' },
  ],
  recentTitles: [],
  topPerformers: [],
  mixTargets: { education: 0.4 },
  mixActual: { education: 0.1 },
  seasonalWindow: [],
};

const idea = (over: Record<string, unknown> = {}) => ({
  title: 'Why your gluten-free loaf is gummy',
  angle: 'Starch holds water gluten would have held. Vinegar firms the network.',
  category: 'education',
  rationale: 'asked nine times this month',
  ...over,
});

describe('proposing ideas from signals', () => {
  it('returns usable proposals and carries the signals that were in front of it', async () => {
    const result = await proposeIdeas(input, stub(JSON.stringify({ ideas: [idea()] })));

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]!.title).toBe('Why your gluten-free loaf is gummy');
    // Provenance: `ideas.source_signals` exists for exactly this.
    expect(result.proposals[0]!.sourceSignalIds).toEqual(['sig-1', 'sig-2']);
    expect(result.promptVersion).toMatch(/idea_generator/);
  });

  it('does not ask the model which signals it used', async () => {
    /**
     * A model asked which of its inputs it relied on gives a confident answer
     * and no evidence. What is actually true is that these were in the prompt,
     * so that is what is recorded — even if the model names others.
     */
    const result = await proposeIdeas(
      input,
      stub(JSON.stringify({ ideas: [idea({ source_signals: ['sig-invented'] })] })),
    );
    expect(result.proposals[0]!.sourceSignalIds).toEqual(['sig-1', 'sig-2']);
  });

  it('drops a proposal with no angle rather than drafting from a headline', async () => {
    // `generate` builds the copywriter prompt from the angle. Without one the
    // draft is written from a title, which is how slop happens.
    const result = await proposeIdeas(
      input,
      stub(JSON.stringify({ ideas: [idea({ angle: '' }), idea({ title: 'Second' })] })),
    );
    expect(result.proposals.map((p) => p.title)).toEqual(['Second']);
    expect(result.rejected[0]!.reason).toMatch(/no angle/);
  });

  it('drops a category the database would refuse', async () => {
    /**
     * `ideas_category_check` allows five values. A sixth would fail on insert,
     * inside a loop, after other rows had been written — rejected here, where
     * the reason is still legible.
     */
    const result = await proposeIdeas(
      input,
      stub(JSON.stringify({ ideas: [idea({ category: 'thought_leadership' })] })),
    );
    expect(result.proposals).toHaveLength(0);
    expect(result.rejected[0]!.reason).toMatch(/unknown category/);
  });

  it('accepts every category the pipeline actually allows', async () => {
    // The other direction: over-strict validation would silently narrow the
    // content mix, and the mix is the primary driver of what gets made.
    for (const category of IDEA_CATEGORIES) {
      const result = await proposeIdeas(input, stub(JSON.stringify({ ideas: [idea({ category })] })));
      expect(result.proposals, category).toHaveLength(1);
    }
  });

  it('drops a duplicate within one response', async () => {
    // Models produce these readily when asked for eight of something. The
    // cross-run novelty check is `scoreIdeas` over embeddings; this is the
    // cheap exact case it should not have to see.
    const result = await proposeIdeas(
      input,
      stub(JSON.stringify({ ideas: [idea(), idea({ title: 'why your Gluten-Free loaf IS gummy' })] })),
    );
    expect(result.proposals).toHaveLength(1);
    expect(result.rejected[0]!.reason).toMatch(/duplicate/);
  });

  it('survives a malformed answer without throwing', async () => {
    /**
     * §75's lesson applied at a second boundary: parseable is not well-formed.
     * Every one of these is JSON, and none of them is what was asked for.
     */
    for (const text of [
      'not json at all',
      JSON.stringify({ ideas: 'a string' }),
      JSON.stringify({ ideas: [null, 42, 'x'] }),
      JSON.stringify({ ideas: [{ title: 123, angle: [] }] }),
      JSON.stringify({}),
    ]) {
      const result = await proposeIdeas(input, stub(text));
      expect(result.proposals).toEqual([]);
      expect(result.costUsd).toBeGreaterThan(0);
    }
  });

  it('reads a non-numeric seasonal peak as absent rather than NaN', async () => {
    const result = await proposeIdeas(
      input,
      stub(JSON.stringify({ ideas: [idea({ days_until_seasonal_peak: 'soon' })] })),
    );
    expect(result.proposals[0]!.daysUntilSeasonalPeak).toBeNull();
  });

  it('proposes from mix state alone when there are no signals', async () => {
    // Mix debt is a real input. An idea citing no signal is honest, not empty —
    // it just says so instead of borrowing credit from one.
    const result = await proposeIdeas(
      { ...input, signals: [] },
      stub(JSON.stringify({ ideas: [idea()] })),
    );
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]!.sourceSignalIds).toEqual([]);
  });
});

/**
 * Prompt input that Halyard did not write.
 *
 * A signal summary is assembled from a Reddit post title or from the sentence
 * an operator typed into `/finds`. Neither is length-bounded at the source, and
 * both land verbatim in a prompt paid for by the token — so twenty signals is
 * an input-cost explosion driven by whatever somebody else wrote.
 */
describe('the prompt is bounded by more than trust', () => {
  it('truncates an enormous signal summary rather than sending it', () => {
    const prompt = buildIdeaGeneratorPrompt({
      productBrief: 'x',
      voiceSummary: 'y',
      signals: [{ source: 'editorial', summary: 'A'.repeat(50_000) }],
      recentTitles: [],
      topPerformers: [],
      mixTargets: {},
      mixActual: {},
      seasonalWindow: [],
      count: 8,
    });

    expect(prompt.user).not.toContain('A'.repeat(SIGNAL_SUMMARY_CHARS + 1));
    // Truncated, not dropped — the first 300 characters of a question carry it.
    expect(prompt.user).toContain('A'.repeat(SIGNAL_SUMMARY_CHARS));
    expect(prompt.user.length).toBeLessThan(10_000);
  });

  it('truncates a past title too', () => {
    const prompt = buildIdeaGeneratorPrompt({
      productBrief: 'x',
      voiceSummary: 'y',
      signals: [],
      recentTitles: ['B'.repeat(5_000)],
      topPerformers: [],
      mixTargets: {},
      mixActual: {},
      seasonalWindow: [],
      count: 8,
    });
    expect(prompt.user).not.toContain('B'.repeat(TITLE_CHARS + 1));
  });

  it('stays small with a full set of signals and titles', () => {
    // Twenty signals is what `proposeFromSignals` selects, and sixty titles is
    // what it looks back over. Together they must not become a five-figure
    // token bill on a daily job.
    const prompt = buildIdeaGeneratorPrompt({
      productBrief: 'x'.repeat(10_000),
      voiceSummary: 'y'.repeat(5_000),
      signals: Array.from({ length: 20 }, (_, i) => ({
        source: 'editorial',
        summary: `${i} `.repeat(1_000),
      })),
      recentTitles: Array.from({ length: 60 }, () => 'C'.repeat(1_000)),
      topPerformers: [],
      mixTargets: {},
      mixActual: {},
      seasonalWindow: [],
      count: 8,
    });
    expect(prompt.user.length).toBeLessThan(30_000);
  });
});
