/**
 * Which model each agent actually reaches, pinned.
 *
 * The model an agent runs on is a product decision made once and then easy to
 * lose: a call site that omits `model` silently inherits the draft tier, which
 * is how four Product Brain agents came to propose published facts on the
 * volume model. These assertions run the real functions against a recording
 * stub and read back the model the client was asked for.
 *
 * Nothing here calls a provider. The stub answers instantly and records.
 */
import { describe, expect, it } from 'vitest';
import {
  CLASSIFY_MODEL,
  DRAFT_MODEL,
  STRATEGY_MODEL,
  buildMessageParams,
  supportsSampling,
  thinksByDefault,
  type LlmClient,
  type LlmRequest,
} from './llm.js';
import { verifyPayoff } from './hooks.js';
import { proposeIdeas } from './ideaGenerator.js';
import { draftTake, factCheckTake, strengthenTake } from '../founder/dailyTake.js';
import {
  discoverImplementationFacts,
  discoverListingFacts,
  discoverProductFacts,
  discoverVisualFacts,
  explainContradiction,
} from '../brain/agents.js';

/**
 * Records every request.
 *
 * The reply is deliberately minimal: the request is recorded *before* the
 * caller parses anything, so a parse failure downstream does not affect what
 * this asserts. Each call below is wrapped accordingly — the subject is which
 * model was asked for, not whether a stub answer satisfies a schema.
 */
function recorder(reply: string) {
  const seen: LlmRequest[] = [];
  const llm: LlmClient = {
    async complete(request) {
      seen.push(request);
      return {
        text: reply,
        model: request.model ?? DRAFT_MODEL,
        inputTokens: 1,
        outputTokens: 1,
        costUsd: 0,
      };
    },
  };
  return { llm, seen };
}

const EVIDENCE = [
  { id: 'e1', kind: 'web', sourceUrl: 'https://x.test', title: 'Home', body: 'RecipeFix adapts recipes.' },
];

describe('the model each agent runs on', () => {
  it('sends idea generation to the strategy model', async () => {
    const { llm, seen } = recorder('{"ideas":[]}');
    await proposeIdeas(
      {
        productBrief: 'b',
        voiceSummary: 'v',
        signals: [],
        recentTitles: [],
        topPerformers: [],
        mixTargets: {},
        mixActual: {},
        seasonalWindow: [],
      },
      llm,
    );
    expect(seen[0]!.model).toBe(STRATEGY_MODEL);
  });

  it('sends every Daily Take stage to the strategy model', async () => {
    // All three publish under the founder's name; the drafter used to be on
    // the volume tier while the check that gates it was not.
    const story = { rawInput: 'r', storyTitle: 't', storyUrl: 'u' };

    for (const run of [
      async () => {
        const r = recorder('{}');
        await factCheckTake(story, r.llm).catch(() => undefined);
        return r.seen;
      },
      async () => {
        const r = recorder('{}');
        await draftTake(
          { ...story, voiceDescription: 'plain', corrections: [] } as never,
          r.llm,
        ).catch(() => undefined);
        return r.seen;
      },
      async () => {
        const r = recorder('{}');
        await strengthenTake({ ...story, draft: 'd' } as never, r.llm).catch(() => undefined);
        return r.seen;
      },
    ]) {
      const seen = await run();
      expect(seen[0]!.model).toBe(STRATEGY_MODEL);
    }
  });

  it('sends the three fact discoverers and the reconciler to the strategy model', async () => {
    for (const call of [discoverProductFacts, discoverListingFacts, discoverImplementationFacts]) {
      const { llm, seen } = recorder('{"facts":[]}');
      await call({ productName: 'RecipeFix', evidence: EVIDENCE } as never, llm).catch(() => undefined);
      expect(seen[0]!.model, call.name).toBe(STRATEGY_MODEL);
    }

    const { llm, seen } = recorder('{"explanation":"x"}');
    await explainContradiction(
      {
        category: 'positioning',
        key: 'what_it_is',
        left: { value: 'a', source: 'https://a.test', agentId: 'product-discovery' },
        right: { value: 'b', source: 'https://b.test', agentId: 'store-listing' },
      },
      llm,
    ).catch(() => undefined);
    expect(seen[0]!.model).toBe(STRATEGY_MODEL);
  });

  it('leaves the visual discoverer on the draft model', async () => {
    // A design language is description, not a published claim about the product.
    const { llm, seen } = recorder('{"facts":[]}');
    await discoverVisualFacts({ productName: 'RecipeFix', evidence: EVIDENCE } as never, llm).catch(
      () => undefined,
    );
    expect(seen[0]!.model).toBeUndefined();
  });

  it('sends payoff verification to the classification model', async () => {
    const { llm, seen } = recorder('{"paysOff":true,"why":"it does"}');
    await verifyPayoff({ hook: 'h', body: 'b' } as never, llm).catch(() => undefined);
    expect(seen[0]!.model).toBe(CLASSIFY_MODEL);
  });
});

describe('the selected model ids', () => {
  it('names the models this activation chose', () => {
    // Pinned deliberately: changing a model is a decision, not a refactor.
    expect(STRATEGY_MODEL).toBe('claude-opus-5');
    expect(DRAFT_MODEL).toBe('claude-sonnet-5');
    expect(CLASSIFY_MODEL).toBe('claude-haiku-4-5');
  });

  it('knows which of them accept sampling parameters', () => {
    // Opus 5 and Sonnet 5 removed temperature — sending one is a 400.
    expect(supportsSampling(STRATEGY_MODEL)).toBe(false);
    expect(supportsSampling(DRAFT_MODEL)).toBe(false);
    expect(supportsSampling(CLASSIFY_MODEL)).toBe(true);
  });
});

describe('the outgoing Anthropic request', () => {
  const base = { system: 's', messages: [{ role: 'user' as const, content: 'c' }], promptVersion: 'v1' };

  it('sends no temperature to a model that rejects sampling', () => {
    // The blocker this activation existed to clear: Opus 5 and Sonnet 5 return
    // 400 on `temperature`, and the client used to send it on every call.
    for (const model of [STRATEGY_MODEL, DRAFT_MODEL]) {
      expect(buildMessageParams({ ...base, temperature: 0.8 }, model)).not.toHaveProperty(
        'temperature',
      );
    }
  });

  it('still sends an explicit temperature to a model that accepts one', () => {
    // `generateProfileCopy` asks for 0.8. The guard must drop it only where it
    // cannot be honoured, not everywhere.
    expect(buildMessageParams({ ...base, temperature: 0.8 }, CLASSIFY_MODEL).temperature).toBe(0.8);
  });

  it('sends no temperature when no caller asked for one', () => {
    // The old `?? 1` supplied the API's own default on every request — a
    // parameter nobody wanted, which is what made the 400 unavoidable.
    expect(buildMessageParams(base, CLASSIFY_MODEL)).not.toHaveProperty('temperature');
  });

  it('always carries the model and a token ceiling', () => {
    const params = buildMessageParams(base, STRATEGY_MODEL);
    expect(params.model).toBe(STRATEGY_MODEL);
    expect(params.max_tokens).toBeGreaterThan(0);
  });
});

describe('token ceiling on thinking models', () => {
  const base = { system: 's', messages: [{ role: 'user' as const, content: 'c' }], promptVersion: 'v1' };

  it('gives a thinking model room to think and still answer', () => {
    /*
     * The first live Opus 5 call asked for 2000 and came back cut off
     * mid-JSON: thinking is billed as output and spends the ceiling before
     * the answer starts. A ceiling is not a spend — only generated tokens are
     * billed — so the headroom costs nothing when unused.
     */
    expect(buildMessageParams({ ...base, maxTokens: 2000 }, STRATEGY_MODEL).max_tokens).toBeGreaterThan(2000);
    expect(buildMessageParams({ ...base, maxTokens: 300 }, DRAFT_MODEL).max_tokens).toBeGreaterThan(300);
  });

  it('honours the caller exactly on a model that does not think', () => {
    expect(buildMessageParams({ ...base, maxTokens: 300 }, CLASSIFY_MODEL).max_tokens).toBe(300);
  });

  it('never lowers a ceiling the caller asked for', () => {
    // A caller wanting a long answer must not be capped by the headroom floor.
    expect(buildMessageParams({ ...base, maxTokens: 60000 }, STRATEGY_MODEL).max_tokens).toBe(60000);
  });

  it('knows which models think by default', () => {
    expect(thinksByDefault(STRATEGY_MODEL)).toBe(true);
    expect(thinksByDefault(DRAFT_MODEL)).toBe(true);
    expect(thinksByDefault(CLASSIFY_MODEL)).toBe(false);
  });
});
