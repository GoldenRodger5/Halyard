import { describe, expect, it } from 'vitest';
import {
  buildProductMarketingContext,
  lexicalClaimSupport,
  verifyClaimsAgainstProductBrain,
  type Queryable,
} from './productContext.js';

const FACTS = [
  {
    category: 'workflows',
    key: 'recipe_adaptation_inputs',
    value: 'RecipeFix adapts recipes from a URL, pasted text, photos or PDFs.',
    detail: null,
    status: 'verified' as const,
    confidence: 0.75,
  },
  {
    category: 'workflows',
    key: 'dietary_adaptation_profiles',
    value: 'Recipe adaptation supports nine combinable dietary profiles.',
    detail: null,
    status: 'verified' as const,
    confidence: 0.75,
  },
];

function db(): Queryable {
  return {
    async query<T>(sql: string) {
      if (sql.includes('from product_facts')) return { rows: FACTS as unknown as T[] };
      if (sql.includes('from feature_claims')) return { rows: [] as T[] };
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}

describe('Product Brain claim provenance', () => {
  it('prints stable FACT tokens into the writer context', async () => {
    const context = await buildProductMarketingContext(db(), 'recipefix');
    expect(context).toContain(
      '[FACT:workflows:recipe_adaptation_inputs] RecipeFix adapts recipes from a URL, pasted text, photos or PDFs.',
    );
    expect(context).toContain('[FACT:workflows:dietary_adaptation_profiles]');
  });

  it('resolves a supported claim through a fresh verified FACT token', async () => {
    const result = await verifyClaimsAgainstProductBrain(db(), 'recipefix', [
      {
        text: 'RecipeFix can start from a URL, pasted text, a photo, or a PDF.',
        source: 'FACT:workflows:recipe_adaptation_inputs',
      },
    ]);
    expect(result.passed).toBe(true);
    expect(result.checks[0]).toMatchObject({ verdict: 'verified' });
  });

  it('refuses the pseudo-path shape the old writer invented', async () => {
    const result = await verifyClaimsAgainstProductBrain(db(), 'recipefix', [
      {
        text: 'RecipeFix supports nine combinable diet profiles.',
        source: 'CURRENT_PRODUCT_INTELLIGENCE.verified.workflows[2]',
      },
    ]);
    expect(result.passed).toBe(false);
    expect(result.checks[0]).toMatchObject({ verdict: 'unsupported' });
  });

  it('does not accept an unrelated sentence merely because its FACT token exists', async () => {
    const result = await verifyClaimsAgainstProductBrain(db(), 'recipefix', [
      {
        text: 'RecipeFix has one million paying customers.',
        source: 'FACT:workflows:recipe_adaptation_inputs',
      },
    ]);
    expect(result.passed).toBe(false);
    expect(result.checks[0]).toMatchObject({ verdict: 'unsupported' });
  });

  it('surfaces editorial promises for review rather than pretending they are evidence', async () => {
    const result = await verifyClaimsAgainstProductBrain(db(), 'recipefix', [
      { text: 'We will explain the tradeoff.', source: 'user.idea' },
    ]);
    expect(result.passed).toBe(true);
    expect(result.checks[0]).toMatchObject({ verdict: 'needs_review' });
  });

  it('has useful lexical tolerance for a normal paraphrase', () => {
    expect(
      lexicalClaimSupport(
        'RecipeFix supports nine combinable diet profiles.',
        'Recipe adaptation supports nine combinable dietary profiles.',
      ),
    ).toBeGreaterThanOrEqual(0.2);
  });
});
