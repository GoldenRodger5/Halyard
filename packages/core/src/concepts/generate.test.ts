/**
 * §218. The generator, and the contract it is held to.
 *
 * A model returning free text is the easy part. What these assert is the
 * narrowing: a concept that names an unknown treatment, an unknown objective,
 * or invents an evidence kind does not become a Concept — it is counted as
 * malformed and dropped, because a batch containing a concept nothing
 * downstream can act on is worse than a smaller batch.
 */
import { describe, expect, it } from 'vitest';
import { buildConceptPrompt, generateConcepts, type ConceptRequest } from './generate.js';
import type { LlmClient } from '../generation/llm.js';

const request: ConceptRequest = {
  intent: 'adapting recipes for gluten-free cooking',
  productName: 'RecipeFix',
  productBrief: 'Adapts any recipe to a dietary need.',
  verifiedFacts: ['Includes Cook Mode, a guided step-by-step cooking view.'],
  platforms: ['tiktok', 'instagram'],
  recentTreatments: ['listicle'],
  hasProductCapture: false,
};

function llmReturning(payload: unknown): LlmClient {
  return {
    complete: async () => ({
      text: JSON.stringify(payload),
      model: 'test',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    }),
  };
}

const good = {
  title: 'Halving is not math',
  premise: 'Salt does not scale linearly when a recipe is halved.',
  hook: 'Halving a recipe is not math',
  audience: 'home cooks',
  objective: 'education',
  emotional_angle: 'surprise',
  treatment: 'myth_fact',
  platform_intent: ['tiktok'],
  differentiation: 'The only one that opens on a correction.',
  retention_strategy: 'The correction lands in the first three seconds.',
  evidence_requirements: [{ kind: 'none', detail: 'Nothing external needed.' }],
};

describe('the prompt', () => {
  it('names the sameness failure explicitly', () => {
    const { system } = buildConceptPrompt(request);
    expect(system).toMatch(/rewordings of the same idea/);
    expect(system).toMatch(/Use a different treatment for each concept/);
  });

  it('tells the model when no capture exists, rather than letting it assume', () => {
    const { system } = buildConceptPrompt(request);
    expect(system).toMatch(/NO product capture exists/);
    const withCapture = buildConceptPrompt({ ...request, hasProductCapture: true });
    expect(withCapture.system).toMatch(/A usable product capture exists/);
  });

  it('lists only verified capabilities as buildable-on', () => {
    const { user } = buildConceptPrompt(request);
    expect(user).toMatch(/Cook Mode/);
    expect(user).toMatch(/the only product behaviour you may reference/);
  });

  it('says so plainly when nothing is verified', () => {
    const { user } = buildConceptPrompt({ ...request, verifiedFacts: [] });
    expect(user).toMatch(/do not describe product behaviour/);
  });

  it('passes the recently used treatments so they can be avoided', () => {
    expect(buildConceptPrompt(request).user).toMatch(/avoid these\nlisticle/);
  });
});

describe('narrowing what comes back', () => {
  it('accepts a well-formed concept', async () => {
    const batch = await generateConcepts(request, llmReturning({ concepts: [good] }));
    expect(batch.concepts).toHaveLength(1);
    expect(batch.malformed).toBe(0);
    expect(batch.concepts[0]!.treatment).toBe('myth_fact');
    expect(batch.concepts[0]!.evidenceRequirements[0]!.kind).toBe('none');
  });

  it('drops a concept naming a treatment nothing can render', async () => {
    const batch = await generateConcepts(
      request,
      llmReturning({ concepts: [{ ...good, treatment: 'interpretive_dance' }] }),
    );
    expect(batch.concepts).toHaveLength(0);
    expect(batch.malformed).toBe(1);
  });

  it('drops a concept naming an objective the strategy layer does not have', async () => {
    const batch = await generateConcepts(
      request,
      llmReturning({ concepts: [{ ...good, objective: 'vibes' }] }),
    );
    expect(batch.malformed).toBe(1);
  });

  it('drops an invented evidence kind rather than trusting it', async () => {
    const batch = await generateConcepts(
      request,
      llmReturning({
        concepts: [{ ...good, evidence_requirements: [{ kind: 'vibes', detail: 'x' }] }],
      }),
    );
    /* The concept survives; the unusable requirement does not, and it falls
       back to the explicit "needs nothing" rather than an empty claim. */
    expect(batch.concepts).toHaveLength(1);
    expect(batch.concepts[0]!.evidenceRequirements).toEqual([
      { kind: 'none', detail: 'Nothing external needed.' },
    ]);
  });

  it('states "needs nothing" rather than leaving it unsaid', async () => {
    const { evidence_requirements: _omitted, ...withoutRequirements } = good;
    const batch = await generateConcepts(
      request,
      llmReturning({ concepts: [withoutRequirements] }),
    );
    expect(batch.concepts[0]!.evidenceRequirements).toEqual([
      { kind: 'none', detail: 'Nothing external needed.' },
    ]);
  });

  it('survives a model that returns nothing usable', async () => {
    const batch = await generateConcepts(request, llmReturning({ concepts: [] }));
    expect(batch.concepts).toEqual([]);
    expect(batch.malformed).toBe(0);
  });

  it('records the prompt version, so a regression is traceable', async () => {
    const batch = await generateConcepts(request, llmReturning({ concepts: [good] }));
    expect(batch.promptVersion).toBe('concept_generator.v1');
  });
});
