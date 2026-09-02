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
import { briefFor, checkDraft, checkOneNamePerThing } from './write.js';
import { POST_FORMAT_CATALOG } from './catalog.js';
import { bandFor, lengthBudgetFor } from '../creative/length.js';
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

/**
 * §458. The word budget is a target, and coming up short is the failure that
 * actually happened.
 *
 * Measured on real renders: 44 words written against a 90-word budget, and a
 * piece budgeted for 40 seconds that rendered at 22.6. `format.slot_too_long`
 * had existed since this file was written; nothing watched the other direction.
 */
describe('writing to the budget rather than under it', () => {
  const history = POST_FORMAT_CATALOG.history;
  const band = bandFor('tiktok', 'short_video', history.pace)!;
  const budget = lengthBudgetFor(history, band);

  it('asks for about N words when a budget decided N', () => {
    const brief = briefFor(history, {
      subject: 'cast iron',
      audience: 'cooks',
      platform: 'tiktok',
      budget,
    });
    expect(brief).toMatch(/Write about \d+ words/);
    expect(brief).toMatch(/a target and not a limit/);
    expect(brief).not.toMatch(/- hook:.*Max \d+ words/);
  });

  it('still calls it a maximum when nothing budgeted it', () => {
    const brief = briefFor(history, {
      subject: 'cast iron',
      audience: 'cooks',
      platform: 'tiktok',
    });
    expect(brief).toMatch(/Max \d+ words/);
    expect(brief).not.toMatch(/Write about \d+ words/);
  });

  it('warns on a slot written at half its budget', () => {
    const draft = {
      formatId: 'history',
      slots: history.slots.map((s) => ({
        key: s.key,
        index: 0,
        /* Four words against budgets of 10 to 25. */
        text: 'Your pan wears oil',
        citation: 'https://example.org/a',
      })),
    };
    const problems = checkDraft(history, draft, budget).problems.filter(
      (p) => p.rule === 'format.slot_too_short',
    );
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]!.severity).toBe('warning');
    expect(problems[0]!.message).toMatch(/that word count is the runtime/i);
  });

  it('says nothing when the piece was written to its budget', () => {
    const draft = {
      formatId: 'history',
      slots: budget.slots.map((s) => ({
        key: s.key,
        index: 0,
        text: Array.from({ length: s.maxWords }, (_, i) => `word${i}`).join(' '),
        citation: 'https://example.org/a',
      })),
    };
    expect(
      checkDraft(history, draft, budget).problems.some(
        (p) => p.rule === 'format.slot_too_short',
      ),
    ).toBe(false);
  });

  /*
   * Without a budget, `maxWords` is a layout constraint nothing reasoned about.
   * Demanding a piece fill it would invent a target from a card's edge.
   */
  it('never judges shortness against a ceiling nobody chose', () => {
    const draft = {
      formatId: 'history',
      slots: [{ key: 'hook', index: 0, text: 'Two words', citation: 'https://example.org/a' }],
    };
    expect(
      checkDraft(history, draft).problems.some((p) => p.rule === 'format.slot_too_short'),
    ).toBe(false);
  });
});

/**
 * §464. One name per thing.
 *
 * The first end-to-end render read "Salting eggplant removes bitterness" and,
 * four seconds later, "Yes, aubergines used to be salted and rinsed." A viewer
 * does not read that as dialect; they read it as carelessness — on a piece
 * whose whole point is correcting somebody else's mistake.
 */
describe('one name per thing', () => {
  const draft = (texts: string[]) => ({
    formatId: 'myth_fact',
    slots: texts.map((text, index) => ({ key: `s${index}`, index: 0, text })),
  });
  const found = (texts: string[]) =>
    checkOneNamePerThing(draft(texts)).map((p) => p.rule);

  it('catches the two the render actually shipped', () => {
    expect(
      found(['Salting eggplant removes bitterness', 'Yes, aubergines used to be salted']),
    ).toContain('format.two_names_one_thing');
  });

  it('matches across plurals, which is how it appeared', () => {
    expect(found(['one courgette', 'two zucchinis'])).toContain('format.two_names_one_thing');
  });

  it('says nothing when the piece picks one and keeps it', () => {
    expect(found(['Salting eggplant removes bitterness', 'Eggplants are less bitter now'])).toEqual(
      [],
    );
    expect(found(['Aubergines used to be salted', 'Modern aubergines are milder'])).toEqual([]);
  });

  /*
   * Not a locale rule. Halyard does not know whether an account is American or
   * British, and "correcting" a British brand into American English would be
   * worse than the problem.
   */
  it('never prefers one dialect over the other', () => {
    expect(found(['A skillet is best here'])).toEqual([]);
    expect(found(['A frying pan is best here'])).toEqual([]);
  });

  it('is a warning, because the fix is one word', () => {
    const problems = checkOneNamePerThing(draft(['eggplant', 'aubergine']));
    expect(problems[0]!.severity).toBe('warning');
    expect(problems[0]!.message).toMatch(/pick one/i);
  });

  it('runs as part of the draft check, not only on its own', () => {
    const check = checkDraft(POST_FORMAT_CATALOG.myth_fact, {
      formatId: 'myth_fact',
      slots: [
        { key: 'myth', index: 0, text: 'Salting eggplant removes bitterness', citation: 'https://example.org/a' },
        { key: 'partly_true', index: 0, text: 'Aubergines were salted for that', citation: 'https://example.org/a' },
      ],
    });
    expect(check.problems.some((p) => p.rule === 'format.two_names_one_thing')).toBe(true);
  });
});

describe('§484 the opening slot is spoken', () => {
  const tips = POST_FORMAT_CATALOG.tips;
  const draftWith = (title: string) => ({
    formatId: 'tips',
    slots: [
      { key: 'title', index: 0, text: title },
      { key: 'tip', index: 0, text: 'Trim the stems and stand them in an inch of water.' },
      { key: 'tip', index: 1, text: 'Cover loosely with a bag and refrigerate upright.' },
      { key: 'tip', index: 2, text: 'Keep basil on the counter, away from cold air.' },
      { key: 'close', index: 0, text: 'Most important: dry the leaves before they go in.' },
    ],
  });

  it('refuses a Title Case title, because nobody says a headline', () => {
    const problem = checkDraft(tips, draftWith('Keep Herbs Alive Two Weeks')).problems.find(
      (p) => p.rule === 'format.headline_case',
    );
    expect(problem?.severity).toBe('error');
    expect(problem?.slot).toBe('title');
  });

  it('accepts sentence case, and a proper noun inside it', () => {
    for (const title of ['Keep herbs alive for two weeks', 'How Parisian bakers keep herbs alive']) {
      expect(
        checkDraft(tips, draftWith(title)).problems.some((p) => p.rule === 'format.headline_case'),
        title,
      ).toBe(false);
    }
  });

  it('tells the tips writer so in the brief', () => {
    expect(tips.slots[0]!.brief).toMatch(/Sentence case/);
  });
});
