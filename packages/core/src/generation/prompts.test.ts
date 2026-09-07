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

/**
 * §533. A warning nobody acts on changes nothing.
 *
 * `buildFeedback` walked only `detail.errors`, on gates whose status was
 * `failed`. Every warning the copy gate raises — "this caption asks for
 * nothing", §523's topic-label opening, an adjective stack — was computed,
 * stored, shown to the operator, and never said to the writer. Now they ride
 * along on a retry that an error has already forced, so they cost no extra
 * call, and they are kept separate so they are not argued with as failures.
 */
describe('§533 warnings ride along on a retry', () => {
  const copyGate = (errors: unknown[], warnings: unknown[]) => ({
    passed: false,
    gates: [
      {
        gate: 'copy' as const,
        status: 'failed' as const,
        detail: { errors, warnings, violations: [...errors, ...warnings] },
      },
    ],
  });

  it('names the error as a failure and the warning as optional', async () => {
    const { buildFeedback } = await import('./copywriter.js');
    const text = buildFeedback(
      copyGate(
        [{ rule: 'punctuation.em_dash', message: 'An em dash.', fix: 'Use a full stop.' }],
        [{ rule: 'structure.invites_nothing', message: 'This caption asks for nothing.' }],
      ) as never,
    );

    expect(text).toContain('Fix every item below');
    expect(text).toContain('punctuation.em_dash');
    expect(text).toContain('Not failures, but worth fixing in the same pass');
    expect(text).toContain('structure.invites_nothing');
    /* The warning must sit after the failures, not among them. */
    expect(text.indexOf('punctuation.em_dash')).toBeLessThan(
      text.indexOf('structure.invites_nothing'),
    );
  });

  it('says nothing about warnings when there are none', async () => {
    const { buildFeedback } = await import('./copywriter.js');
    const text = buildFeedback(
      copyGate([{ rule: 'punctuation.em_dash', message: 'An em dash.' }], []) as never,
    );
    expect(text).not.toContain('Not failures');
  });

  it('does not turn a warning into a reason to retry', async () => {
    /*
     * The cost rule. A draft that only warns is still accepted; warnings are
     * carried by a rewrite that was happening anyway, never one they caused.
     */
    const { buildFeedback } = await import('./copywriter.js');
    const passing = {
      passed: true,
      gates: [
        {
          gate: 'copy' as const,
          status: 'passed' as const,
          detail: { errors: [], warnings: [{ rule: 'structure.invites_nothing', message: 'x' }], violations: [] },
        },
      ],
    };
    const text = buildFeedback(passing as never);
    expect(text).not.toContain('structure.invites_nothing');
  });
});
