import { describe, expect, it } from 'vitest';
import { chooseOpening, isQuestion, leadingFragment, OPENING_COMPOSITIONS } from './openings.js';
import { VISUAL_LANGUAGES } from './motion.js';

const base = {
  text: 'Most gluten-free bread fails for one reason',
  visualLanguage: 'kinetic',
  hasMedia: false,
};

describe('isQuestion', () => {
  it('needs both an interrogative opening and a mark', () => {
    // Punctuating a statement with a question mark is the cheapest trick in
    // the format, and the layout should not reward it.
    expect(isQuestion('Why does gluten-free bread crumble?')).toBe(true);
    expect(isQuestion('This is the reason it crumbles?')).toBe(false);
    expect(isQuestion('Why does gluten-free bread crumble')).toBe(false);
  });
});

describe('leadingFragment', () => {
  it('refuses a break that lands on a weak word', () => {
    /*
     * §229. "Everyone blames the" is a line broken badly, not a withheld
     * opening. The hold has to end on a word that means something alone.
     */
    expect(leadingFragment('Everyone blames the flour and they are wrong')).not.toBe(3);
  });

  it('finds a real fragment when there is one', () => {
    const n = leadingFragment('Nobody warns you about the second rise');
    expect(n).not.toBeNull();
    const words = 'Nobody warns you about the second rise'.split(' ');
    expect(['you', 'warns', 'about']).toContain(words[n! - 1]);
  });

  it('gives up on a line too short to hold anything back', () => {
    expect(leadingFragment('It was the flour')).toBeNull();
  });
});

describe('chooseOpening', () => {
  it('refuses numeral without a real figure, and says why', () => {
    /*
     * The rule that matters most here. A number on a frame is a claim, and
     * synthesising one to unlock a nicer layout would be fabricating evidence
     * for a design reason.
     */
    const r = chooseOpening(base);
    expect(r.composition).not.toBe('numeral');
    expect(r.unavailable.find((u) => u.composition === 'numeral')?.because).toContain('fabricate');
  });

  it('allows numeral once the artifact carries one', () => {
    const r = chooseOpening({ ...base, visualLanguage: 'bold_social', numeral: '73%' });
    expect(r.unavailable.map((u) => u.composition)).not.toContain('numeral');
  });

  it('refuses over_media without media', () => {
    const r = chooseOpening({ ...base, visualLanguage: 'cinematic' });
    expect(r.composition).not.toBe('over_media');
  });

  it('varies the opening across consecutive pieces', () => {
    /*
     * The failure this exists to end: six typography systems all still opened
     * with the same kicker over the same headline at the same height.
     *
     * Given a piece with real assets, so there are genuinely several layouts
     * to rotate through. Availability is content-dependent by design — a
     * text-only piece cannot open over media — so this measures the rotation
     * and not the availability.
     */
    const rich = { ...base, hasMedia: true, numeral: '73%', beforeState: '3 cups bread flour' };
    const used: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      used.unshift(chooseOpening({ ...rich, recent: used }).composition);
    }
    expect(new Set(used).size).toBe(used.length);
  });

  it('still does not repeat back-to-back when the piece is bare', () => {
    // Two available layouts is a real state for a text-only piece. It must at
    // least alternate rather than pick the same one twice running.
    const first = chooseOpening(base).composition;
    const second = chooseOpening({ ...base, recent: [first] }).composition;
    expect(second).not.toBe(first);
  });

  it('always returns something drawable for every language', () => {
    // A language with no preference list falls back to the two that need
    // nothing but words, rather than to an undefined layout.
    for (const language of VISUAL_LANGUAGES) {
      const r = chooseOpening({ ...base, visualLanguage: language });
      expect(OPENING_COMPOSITIONS).toContain(r.composition);
    }
  });

  it('carries the hold length when it chooses a fragment', () => {
    const r = chooseOpening({
      text: 'Nobody warns you about the second rise at all',
      visualLanguage: 'typographic',
      hasMedia: false,
      recent: ['statement', 'question'],
    });
    if (r.composition === 'fragment') expect(r.holdWords).toBeGreaterThanOrEqual(2);
  });

  it('will not let a pin invent a figure that does not exist', () => {
    // A pin is an operator's preference, not a licence to fabricate.
    const r = chooseOpening({ ...base, pinned: 'numeral' });
    expect(r.composition).not.toBe('numeral');
  });

  it('honours a pin that is actually available', () => {
    const r = chooseOpening({ ...base, pinned: 'statement' });
    expect(r.composition).toBe('statement');
    expect(r.reason).toContain('Pinned');
  });
});
