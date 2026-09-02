import { describe, expect, it } from 'vitest';
import { buildCopywriterPrompt } from './prompts.js';

/**
 * §370. The caption used to be written two hundred and fifty lines before the
 * piece it introduces. These are about the prompt actually carrying it.
 */
describe('the caption knows what it is captioning', () => {
  const base = {
    platform: 'tiktok' as const,
    format: 'video',
    category: 'education',
    persona: 'brand' as const,
    idea: { title: 'How well do you know gluten?', angle: 'a quiz' },
    voice: {
      displayName: 'RecipeFix',
      description: 'plain',
      doRules: [],
      dontRules: [],
      examples: [],
    },
    productBrief: 'RecipeFix adapts recipes.',
    contentRules: {},
    hooks: [],
  };

  it('puts the piece’s own lines in the prompt', () => {
    const { user } = buildCopywriterPrompt({
      ...base,
      piece: [
        { key: 'q1', text: 'What year was gluten first identified?' },
        { key: 'a1', text: '1728, by Jacopo Beccari.' },
      ],
    });
    expect(user).toContain('The piece this caption goes under');
    expect(user).toContain('What year was gluten first identified?');
    expect(user).toContain('1728, by Jacopo Beccari.');
  });

  it('tells it not to restate the piece — any of it, not only the opening', () => {
    /*
     * §450. This asserted "Do not restate the first line", which is what the
     * prompt used to say and is why the writer restated all the others: 88.9%
     * of one real caption's distinctive words were also on screen.
     *
     * The rule the piece itself is written to — never the same sentence in two
     * channels — now applies to the caption as well, and says what to write
     * instead, because "do not do X" without an alternative produces a caption
     * that avoids X and says nothing.
     */
    const { user } = buildCopywriterPrompt({
      ...base,
      piece: [{ key: 'q1', text: 'What year was gluten first identified?' }],
    });
    expect(user).toContain('Do not restate these lines');
    expect(user).toContain('any of them');
    expect(user).toMatch(/did not fit|ask the question/);
  });

  it('says nothing at all when there is no piece', () => {
    /*
     * A transformation is about the artifact and has no slots, and a text post
     * *is* the caption. An empty heading would invite the writer to invent
     * lines to sit under.
     */
    for (const piece of [null, undefined, []]) {
      const { user } = buildCopywriterPrompt({ ...base, piece });
      expect(user).not.toContain('The piece this caption goes under');
    }
  });
});
