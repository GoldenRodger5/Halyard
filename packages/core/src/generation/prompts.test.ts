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

  it('tells it not to restate the opening', () => {
    /*
     * A caption that repeats the first card spends the one line a scroller
     * reads on something they are about to see anyway.
     */
    const { user } = buildCopywriterPrompt({
      ...base,
      piece: [{ key: 'q1', text: 'What year was gluten first identified?' }],
    });
    expect(user).toContain('Do not restate the first line');
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
