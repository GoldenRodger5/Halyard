import { describe, expect, it } from 'vitest';
import { auditionHooks, scoreHookCraft } from './hookCraft.js';
import { surfaceBestVariants, type HookVariant } from './hooks.js';

const craft = (text: string) => scoreHookCraft(text).score;
const rules = (text: string) => scoreHookCraft(text).notes.map((n) => n.rule);

describe('hook craft', () => {
  it('prefers a concrete hook to an abstract one saying the same thing', () => {
    expect(craft('Baking soda was sold as medicine')).toBeGreaterThan(
      craft('This ingredient has a surprising history'),
    );
  });

  it('prefers the specific thing early', () => {
    expect(craft('Beccari separated gluten in 1728')).toBeGreaterThan(
      craft('There is a reason we know about Beccari'),
    );
  });

  it('marks down an opener that now reads as filler', () => {
    expect(rules('Did you know baking soda was medicine')).toContain('craft.tired_opener');
    expect(craft('Did you know baking soda was medicine')).toBeLessThan(
      craft('Baking soda was medicine first'),
    );
  });

  it('marks down a question a viewer answers by scrolling', () => {
    expect(rules('Do you know what gluten is')).toContain('craft.scrollable_question');
  });

  it('marks down a hedge, because a hook asserts', () => {
    expect(rules('Sourdough might be easier to digest')).toContain('craft.hedged');
  });

  it('rewards a line that reads at a glance and penalises one that does not', () => {
    expect(rules('Baking soda was a medicine')).toContain('craft.glanceable');
    expect(
      rules(
        'Baking soda was originally sold in pharmacies as a medicine for indigestion before anyone baked with it',
      ),
    ).toContain('craft.too_long_to_glance');
  });

  it('stays inside 0 and 1 however bad the line is', () => {
    const worst = 'Did you know that you might possibly want to know about this thing we have here today';
    expect(craft(worst)).toBeGreaterThanOrEqual(0);
    expect(craft(worst)).toBeLessThanOrEqual(1);
  });

  it('gives a reason for every adjustment it makes', () => {
    for (const note of scoreHookCraft('Did you know gluten might be fine').notes) {
      expect(note.because.length).toBeGreaterThan(20);
      expect(note.delta).not.toBe(0);
    }
  });

  it('ranks a set and puts the best-built first', () => {
    const ranked = auditionHooks([
      { textHook: 'This ingredient has a surprising past' },
      { textHook: 'Baking soda was sold as medicine' },
      { textHook: 'Did you know about baking soda' },
    ]);
    expect(ranked[0]!.textHook).toBe('Baking soda was sold as medicine');
  });
});

/**
 * §443. The point of the change, asserted where it actually matters.
 *
 * Craft scoring is worth nothing if the surfacing still returns the model's
 * emission order. This is the behaviour that changed.
 */
describe('surfacing uses craft when there is nothing measured', () => {
  const variant = (textHook: string, hookType: HookVariant['hookType']): HookVariant => ({
    hookType,
    textHook,
    spokenHook: `Spoken: ${textHook.toLowerCase()} and a little more besides`,
    visualDirection: 'The loaf fills the frame and a hand enters',
    captionHook: textHook,
  });

  it('surfaces the best-built hook first even when the model emitted it last', () => {
    const { surfaced } = surfaceBestVariants(
      [
        variant('This ingredient has a surprising history', 'open_loop'),
        variant('An everyday item with an unexpected past', 'contradiction'),
        variant('Baking soda was sold as medicine', 'specificity'),
      ],
      { recentTypes: [], cooledPatterns: [], performance: [] },
      { platform: 'tiktok', format: 'video', isVideo: true },
    );
    expect(surfaced[0]!.textHook).toBe('Baking soda was sold as medicine');
  });

  it('still defers to a real measurement the moment one exists', () => {
    const { surfaced } = surfaceBestVariants(
      [
        variant('This ingredient has a surprising history', 'open_loop'),
        variant('Baking soda was sold as medicine', 'specificity'),
      ],
      {
        recentTypes: [],
        cooledPatterns: [],
        /* Measured, and it disagrees with the craft ranking. Measurement wins. */
        performance: [
          {
            hookType: 'open_loop',
            format: 'video',
            platform: 'tiktok',
            viewThroughRate: 0.94,
            samples: 12,
          },
        ],
      },
      { platform: 'tiktok', format: 'video', isVideo: true },
    );
    expect(surfaced[0]!.textHook).toBe('This ingredient has a surprising history');
  });
});
