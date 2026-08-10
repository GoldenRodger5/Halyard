import { describe, expect, it } from 'vitest';
import fixture from '../connectors/__fixtures__/recipeAdaptation.json' with { type: 'json' };
import { resolvePath, supportScore, verifyClaims } from './claimVerifier.js';

const artifact = fixture as unknown as Record<string, unknown>;

describe('resolvePath', () => {
  it('resolves array indices and nested keys', () => {
    expect(resolvePath(artifact, 'ingredients[4].adapted')).toBe('1 teaspoon apple cider vinegar');
    expect(resolvePath(artifact, 'steps[2].updated_note')).toContain('450');
    expect(resolvePath(artifact, 'explanations[0]')).toContain('structural work');
  });

  it('returns undefined rather than throwing for a path that does not exist', () => {
    expect(resolvePath(artifact, 'ingredients[99].changeReason')).toBeUndefined();
    expect(resolvePath(artifact, 'nope.at.all')).toBeUndefined();
    expect(resolvePath(artifact, '')).toBeUndefined();
    expect(resolvePath(null, 'a.b')).toBeUndefined();
  });
});

describe('supportScore', () => {
  it('scores a faithful paraphrase highly', () => {
    const source = artifact.ingredients as Array<{ changeReason: string }>;
    expect(
      supportScore('vinegar strengthens the protein network', source[4]!.changeReason),
    ).toBeGreaterThan(0.34);
  });

  it('returns zero when the claim invents a number the source does not contain', () => {
    expect(
      supportScore(
        'drop the oven by 75 degrees',
        'Drop the oven to 450°F and bake 35 to 40 minutes.',
      ),
    ).toBe(0);
  });

  it('accepts a numeral that the source spells out in words', () => {
    expect(
      supportScore('450 degrees', 'Bake at four hundred fifty degrees until set.'),
    ).toBeGreaterThan(0);
  });
});

describe('verifyClaims — v2 F.2', () => {
  it('verifies claims that trace to a real artifact field', () => {
    const result = verifyClaims(
      [
        {
          text: 'vinegar strengthens the protein network gluten would normally build',
          source: 'ingredients[4].changeReason',
        },
        {
          text: 'drop the oven to 450 and bake 35 to 40 minutes',
          source: 'steps[2].updated_note',
        },
      ],
      artifact,
    );
    expect(result.passed).toBe(true);
    expect(result.summary).toBe('2/2 verified against artifact');
  });

  it('rejects an unresolvable path', () => {
    const result = verifyClaims(
      [{ text: 'anything at all', source: 'ingredients[99].changeReason' }],
      artifact,
    );
    expect(result.passed).toBe(false);
    expect(result.results[0]?.verdict).toBe('unresolvable_path');
    expect(result.results[0]?.message).toContain('does not resolve');
  });

  it('rejects a claim with no source path at all', () => {
    const result = verifyClaims([{ text: 'gluten-free bread is easy', source: '' }], artifact);
    expect(result.passed).toBe(false);
    expect(result.results[0]?.verdict).toBe('unresolvable_path');
  });

  it('rejects a claim whose path resolves but does not support it', () => {
    const result = verifyClaims(
      [{ text: 'this recipe uses browned butter and toasted hazelnuts', source: 'explanations[0]' }],
      artifact,
    );
    expect(result.passed).toBe(false);
    expect(result.results[0]?.verdict).toBe('unsupported');
  });

  it('rejects a fabricated temperature even when the path is right', () => {
    const result = verifyClaims(
      [{ text: 'drop the oven to 375 degrees', source: 'steps[2].updated_note' }],
      artifact,
    );
    expect(result.passed).toBe(false);
    expect(result.results[0]?.support).toBe(0);
  });

  it('hard-blocks a nutrition accuracy claim regardless of source', () => {
    const result = verifyClaims(
      [{ text: 'the nutrition figures are verified', source: 'nutrition.per_serving' }],
      artifact,
    );
    expect(result.passed).toBe(false);
    expect(result.results[0]?.verdict).toBe('hard_blocked');
    expect(result.results[0]?.message).toContain('nutrition accuracy');
  });

  it('hard-blocks a perfect 1:1 claim', () => {
    const result = verifyClaims(
      [{ text: 'a perfect 1:1 swap for wheat flour', source: 'ingredients[0].changeReason' }],
      artifact,
    );
    expect(result.results[0]?.verdict).toBe('hard_blocked');
  });

  it('hard-blocks an allergy-safety guarantee', () => {
    const result = verifyClaims(
      [{ text: 'this loaf is safe for celiacs', source: 'warnings[0]' }],
      artifact,
    );
    expect(result.results[0]?.verdict).toBe('hard_blocked');
  });

  it('hard-blocks a competitor comparison', () => {
    const result = verifyClaims(
      [{ text: 'handles swaps better than Paprika', source: 'explanations[0]' }],
      artifact,
    );
    expect(result.results[0]?.verdict).toBe('hard_blocked');
  });

  it('flags a borderline claim for review without blocking', () => {
    const result = verifyClaims(
      [{ text: 'gluten-free bread stales', source: 'explanations[2]' }],
      artifact,
    );
    expect(['verified', 'needs_review']).toContain(result.results[0]?.verdict);
    expect(result.passed).toBe(true);
  });

  it('passes trivially when there are no claims', () => {
    const result = verifyClaims([], artifact);
    expect(result.passed).toBe(true);
    expect(result.summary).toBe('no claims');
  });
});
