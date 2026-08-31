/**
 * §422. A still can stand on a photograph, and the chooser had no history.
 *
 * Two findings, both from rendering the cards and looking at them.
 *
 * The templates were text-only by construction: every product-grounded still
 * Halyard has made is words on cream, on a surface where a text card competes
 * with photographs of food and loses. And rendered side by side, a quote over a
 * photograph is the strongest thing this system makes while the same photograph
 * under `transformation_diff` loses the struck original and the reason line
 * into the crust. Density decides, so density is a declared fit.
 *
 * Separately: `chooseStill`'s recency was read under `templateId: 'still'` — a
 * family name — while the rows carry the actual template. It matched nothing,
 * the list was always empty, and twenty-three stills were the same card.
 */
import { describe, expect, it } from 'vitest';
import { chooseStill, type StillCandidate } from './chooseStill.js';

const fillable = (id: string): StillCandidate => ({ templateId: id, props: { a: 1 } });
const ALL = [
  'transformation_diff_4x5',
  'substitution_ratio',
  'chef_note_quote',
  'scaling_math',
];

describe('what a still stands on', () => {
  it('puts a sparse quote on a photograph', () => {
    const choice = chooseStill({ candidates: [fillable('chef_note_quote')], enabled: ALL });
    expect(choice!.ground).toBe('photo');
  });

  it('keeps an information-dense card on cream', () => {
    /* Rendered and looked at: the struck line and the reason are unreadable. */
    for (const id of ['transformation_diff_4x5', 'substitution_ratio', 'scaling_math']) {
      const choice = chooseStill({ candidates: [fillable(id)], enabled: ALL });
      expect(choice!.ground, `${id} should stay on cream`).toBe('card');
      expect(choice!.reason).toMatch(/too much text/);
    }
  });

  it('alternates cream and photograph for a template that can take both', () => {
    const first = chooseStill({ candidates: [fillable('chef_note_quote')], enabled: ALL })!;
    const second = chooseStill({
      candidates: [fillable('chef_note_quote')],
      enabled: ALL,
      recent: [`chef_note_quote/${first.ground}`],
    })!;
    expect(second.ground).not.toBe(first.ground);
  });

  it('rotates the cards when it has a history to read', () => {
    /*
     * The behaviour the empty recency list was hiding: given real history, the
     * chooser picks something else.
     */
    const choice = chooseStill({
      candidates: ALL.map(fillable),
      enabled: ALL,
      recent: ['transformation_diff_4x5/card'],
    });
    expect(choice!.templateId).not.toBe('transformation_diff_4x5');
  });

  it('says which ground it chose and why', () => {
    const choice = chooseStill({ candidates: [fillable('chef_note_quote')], enabled: ALL })!;
    expect(choice.reason).toMatch(/photograph/);
  });
});
