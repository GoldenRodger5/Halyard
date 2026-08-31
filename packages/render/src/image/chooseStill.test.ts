/**
 * §395. Four still templates were built and unreachable.
 *
 * The generator named `transformation_diff_4x5` outright, so every
 * product-grounded still was the same card and `chefNoteProps`,
 * `substitutionRatioProps` and `scalingMathProps` were exported code nothing
 * called. These assert the chooser reaches all of them, and never offers one
 * that cannot be filled.
 */
import { describe, expect, it } from 'vitest';
import { chooseStill, type StillCandidate } from './chooseStill.js';

const ALL = [
  'transformation_diff_4x5',
  'substitution_ratio',
  'chef_note_quote',
  'scaling_math',
];

const filled = (templateId: string): StillCandidate => ({ templateId, props: { a: 1 } });
const unfillable = (templateId: string): StillCandidate => ({ templateId, props: null });

describe('choosing a still', () => {
  it('never offers a template the artifact cannot fill', () => {
    /*
     * The failure this prevents: a template with missing props renders a card
     * with empty regions rather than throwing — `substitution_ratio` once
     * shipped a heading above nothing at all.
     */
    const choice = chooseStill({
      candidates: [unfillable('substitution_ratio'), filled('chef_note_quote')],
      enabled: ALL,
    });
    expect(choice?.templateId).toBe('chef_note_quote');
  });

  it('never offers a template the account has switched off', () => {
    const choice = chooseStill({
      candidates: [filled('scaling_math'), filled('chef_note_quote')],
      enabled: ['chef_note_quote'],
    });
    expect(choice?.templateId).toBe('chef_note_quote');
  });

  it('returns nothing when nothing fits, rather than inventing a card', () => {
    /*
     * A real answer. An artifact with no before-and-after, no quotable line, no
     * ratio and no quantities has no card to make.
     */
    expect(chooseStill({ candidates: [unfillable('scaling_math')], enabled: ALL })).toBeNull();
    expect(chooseStill({ candidates: [], enabled: ALL })).toBeNull();
  });

  it('reaches every template before repeating one', () => {
    /* The whole point: four cards existed and one was ever drawn. */
    const candidates = ALL.map(filled);
    const seen: string[] = [];
    const history: string[] = [];
    for (let i = 0; i < ALL.length; i += 1) {
      const choice = chooseStill({ candidates, enabled: ALL, recent: history })!;
      seen.push(choice.templateId);
      history.unshift(choice.templateId);
    }
    expect(new Set(seen).size, 'a card repeated before the pool ran out').toBe(ALL.length);
  });

  it('is a pure function of its inputs, so a re-render is identical', () => {
    const candidates = ALL.map(filled);
    const a = chooseStill({ candidates, enabled: ALL, recent: ['chef_note_quote'] });
    const b = chooseStill({ candidates, enabled: ALL, recent: ['chef_note_quote'] });
    expect(a).toEqual(b);
  });

  it('gives a reason an operator can read', () => {
    const choice = chooseStill({ candidates: [filled('scaling_math')], enabled: ALL });
    expect(choice!.reason).toContain('scaling_math');
    expect(choice!.reason.length).toBeGreaterThan(20);
  });
});
