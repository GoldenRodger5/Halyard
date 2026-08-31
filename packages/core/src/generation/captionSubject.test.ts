/**
 * §405. The caption must be about the piece it sits under.
 *
 * Found live. A `history` piece about the origins of sourdough — correctly
 * written, correctly cited to Britannica — was captioned *"Watery tofu sauce
 * happens. Press 2 lbs extra-firm tofu dry…"*, because the connector had
 * generated Baked Pineapple Teriyaki Tofu as that run's artifact and the prompt
 * called it "the only source of fact" in six thousand characters, against a
 * three-hundred-character block of the actual piece.
 *
 * §291 had already decided a non-product format is not about the artifact. That
 * decision governed claim *verification* and never reached the prompt.
 */
import { describe, expect, it } from 'vitest';
import { buildCopywriterPrompt, type CopywriterContext } from './prompts.js';

const artifact = {
  headline: 'Baked Pineapple Teriyaki Tofu',
  highlights: [{ sourcePath: 'a', text: 'Press the tofu dry' }],
  raw: { recipeName: 'Baked Pineapple Teriyaki Tofu' },
};

function context(over: Partial<CopywriterContext> = {}): CopywriterContext {
  return {
    platform: 'tiktok',
    format: 'history',
    category: 'education',
    persona: 'brand',
    productBrief: 'RecipeFix adapts recipes to dietary needs.',
    contentRules: {},
    hooks: [],
    idea: { title: 'Where did sourdough come from?', angle: 'Its origins' },
    voice: {
      displayName: 'RecipeFix',
      description: 'plain',
      doRules: [],
      dontRules: [],
      examples: [],
      antiExamples: [],
    },
    piece: [
      { key: 'hook', text: 'Sourdough may have originated in ancient Egypt.' },
      { key: 'source', text: 'Encyclopaedia Britannica.' },
    ],
    ...over,
  } as CopywriterContext;
}

describe('what the caption writer is told to write about', () => {
  it('keeps the artifact out when the format is not about the artifact', () => {
    const { user } = buildCopywriterPrompt(
      context({ artifact, verifyClaimsAgainstArtifact: false } as Partial<CopywriterContext>),
    );
    expect(user).not.toContain('Teriyaki');
    expect(user).not.toContain('only source of fact');
    /* And it still has the piece to write about. */
    expect(user).toContain('ancient Egypt');
  });

  it('keeps the artifact when the format is about the artifact', () => {
    const { user } = buildCopywriterPrompt(
      context({
        format: 'transformation',
        artifact,
        verifyClaimsAgainstArtifact: true,
      } as Partial<CopywriterContext>),
    );
    expect(user).toContain('Teriyaki');
    expect(user).toContain('only source of fact');
  });

  it('defaults to including it, so an unset flag does not silently drop grounding', () => {
    /*
     * `verifyClaimsAgainstArtifact` is optional. Undefined must behave as it
     * always has — the flag removes the artifact only when a caller says so.
     */
    const { user } = buildCopywriterPrompt(context({ artifact } as Partial<CopywriterContext>));
    expect(user).toContain('Teriyaki');
  });

  it('tells a piece-grounded caption what it is grounded in', () => {
    const { user } = buildCopywriterPrompt(
      context({ artifact, verifyClaimsAgainstArtifact: false } as Partial<CopywriterContext>),
    );
    expect(user).toMatch(/grounded in the\s+lines above/);
  });
});
