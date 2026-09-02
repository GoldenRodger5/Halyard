/**
 * §411. The rules the writing is judged by, stated before it is written.
 *
 * `checkDraft` runs `slopFilter` over every slot and the brief never said so,
 * so the writer discovered the house style one refusal at a time. Live, a
 * `history` piece spent two of its three attempts on citations and the third on
 * a hype comparative it had never been told to avoid, and was abandoned. The
 * attempt budget exists for genuine misses, not for teaching the rules.
 */
import { describe, expect, it } from 'vitest';
import { briefFor, checkDraft } from './write.js';
import { POST_FORMAT_CATALOG } from './catalog.js';
import { BANNED_PHRASES } from '../qc/slopFilter.js';

const brief = briefFor(POST_FORMAT_CATALOG.history, {
  platform: 'tiktok',
  subject: 'Where did sourdough come from?',
  audience: 'home cooks',
} as never);

describe('the brief states the rules the writing is judged by', () => {
  it('names the constructions slopFilter refuses outright', () => {
    expect(brief).toContain('more than just');
    expect(brief).toContain('not just');
    expect(brief).toContain("that's where");
  });

  it('warns off the punctuation repairDraft would otherwise have to repair', () => {
    expect(brief.toLowerCase()).toContain('em dash');
    expect(brief.toLowerCase()).toContain('emoji');
  });

  it('does not paste the whole banned list', () => {
    /*
     * Forty-five phrases is a wall a model skims, and it refuses only the rows
     * somebody happened to list. Naming the shape refuses the family.
     */
    const pasted = BANNED_PHRASES.filter((p) => p.length > 12 && brief.includes(p));
    expect(pasted).toEqual([]);
  });

  it('still asks for every slot, which is the brief’s actual job', () => {
    for (const slot of POST_FORMAT_CATALOG.history.slots) {
      expect(brief).toContain(slot.key);
    }
  });
});

/**
 * §448. The thumbnail, briefed and checked while it is still cheap to change.
 *
 * `retention.first_frame_words` has reported `unmeasured` on every video this
 * system has ever made, because it was only ever asked *after* the render, of a
 * gate with no way to answer. The words are the opening slot's text and they
 * are known before anything is drawn.
 */
describe('the opening slot is the thumbnail', () => {
  const history = POST_FORMAT_CATALOG.history;

  it('tells the writer that frame one is the thumbnail, and what that costs', () => {
    const brief = briefFor(history, {
      subject: 'gluten',
      audience: 'bakers',
      platform: 'tiktok',
    });
    expect(brief).toMatch(/hook is frame one, which is the thumbnail/);
    expect(brief).toMatch(/4 to 7 words/);
    /* And says why a question is the wrong shape here specifically. */
    expect(brief).toMatch(/answered by scrolling past/);
  });

  it('says nothing about a thumbnail for a format that has no opening frame', () => {
    const recipe = POST_FORMAT_CATALOG.recipe;
    expect(recipe.slots.some((s) => s.opensThePiece)).toBe(false);
    expect(
      briefFor(recipe, { subject: 'x', audience: 'y', platform: 'pinterest' }),
    ).not.toMatch(/thumbnail/);
  });

  it('warns on an opening that will not read at a glance', () => {
    const draft = {
      formatId: 'history',
      slots: [
        {
          key: 'hook',
          index: 0,
          /* Nine words: a real length from a real render, and over the bar. */
          text: 'Baking powder began as a shortcut for rising bread',
          citation: 'https://example.org/a',
        },
      ],
    };
    const problem = checkDraft(history, draft).problems.find(
      (p) => p.rule === 'format.thumbnail_too_long',
    );
    expect(problem?.severity).toBe('warning');
    expect(problem?.message).toMatch(/runs 9 words/);
  });

  it('says nothing about an opening that reads at a glance', () => {
    const draft = {
      formatId: 'history',
      slots: [
        {
          key: 'hook',
          index: 0,
          text: 'Salt slows yeast on purpose',
          citation: 'https://example.org/a',
        },
      ],
    };
    expect(
      checkDraft(history, draft).problems.some((p) => p.rule === 'format.thumbnail_too_long'),
    ).toBe(false);
  });

  /*
   * A warning and not an error, deliberately: the ceiling is a craft judgement
   * and a nine-word opening is not a defect. Failing the piece for it would
   * spend a rewrite attempt the content might need.
   */
  it('never fails a piece for its thumbnail alone', () => {
    const draft = {
      formatId: 'history',
      slots: history.slots.map((s) => ({
        key: s.key,
        index: 0,
        text:
          s.key === 'hook'
            ? 'Baking powder began as a shortcut for rising bread'
            : 'A perfectly ordinary line of the right sort of length',
        citation: 'https://example.org/a',
      })),
    };
    const check = checkDraft(history, draft);
    expect(check.problems.some((p) => p.rule === 'format.thumbnail_too_long')).toBe(true);
    expect(check.problems.filter((p) => p.severity === 'error')).toEqual([]);
  });
});
