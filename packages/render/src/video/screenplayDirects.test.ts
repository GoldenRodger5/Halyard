/**
 * §441. The test that would have caught §132.
 *
 * `content_items.screenplay` was written, validated against what the machinery
 * can execute, stored, and rendered in the Gallery under "what it was staged
 * as" — and not one of its fields reached a frame. Every type checked. Every
 * test passed. The screenplay simply had no way to say *which rendered beat a
 * scene was about*, so the renderer built the video from slots and the staging
 * sat in a column.
 *
 * The check that catches that class is not a type check and not a unit test of
 * either side. It is a **connectivity** test: change a scene's value, and
 * assert the render props change. A field that can be changed with no effect on
 * the output is not connected, whatever its type says.
 *
 * `handlerCoverage.test.ts` is the precedent — the only reason gotcha 1 stopped
 * costing a migration every few months.
 */
import { describe, expect, it } from 'vitest';
import { splitLongLine, videoForFormat, type SceneDirection } from './formatVideo.js';
import { MOVE_GRAMMAR, SCENE_MOVES, type NarrativeBeat } from './narrative.js';

const HISTORY = [
  { key: 'hook', index: 0, text: 'Baking soda was sold as a medicine before it was sold as a leavener' },
  { key: 'setup', index: 0, text: 'Everyone assumes it was always a baking ingredient in the cupboard' },
  { key: 'turn', index: 0, text: 'It reached kitchens through pharmacies, which is why the boxes looked medical' },
  { key: 'why_it_matters', index: 0, text: 'The dosage language on the box is a leftover from that, and it still confuses people', citation: 'https://example.org/x' },
];

const beatsOf = (direction?: Record<string, SceneDirection>) =>
  (videoForFormat('history', HISTORY, direction)!.props.beats as NarrativeBeat[]);

describe('a screenplay scene changes the frames', () => {
  it('renders identically to before when no screenplay is supplied', () => {
    const beats = beatsOf();
    expect(beats.every((b) => b.move === undefined)).toBe(true);
    expect(beats.every((b) => b.wantsFlatGround === undefined)).toBe(true);
  });

  it('move reaches the beat, and every legal move is distinguishable', () => {
    const seen = new Set<string>();
    for (const move of SCENE_MOVES) {
      const beats = beatsOf({ 'setup:0': { move } });
      expect(beats.find((b) => b.text === HISTORY[1]!.text)!.move).toBe(move);
      const g = MOVE_GRAMMAR[move];
      seen.add(`${g.from}/${g.to}/${g.panX}`);
    }
    /*
     * Five names that all render the same camera move would be five names for
     * one move, which is the shape of a direction that is technically wired and
     * practically inert.
     */
    expect(seen.size).toBe(SCENE_MOVES.length);
  });

  it('weight reaches the beat as emphasis, and the three weights differ', () => {
    const emphasisFor = (weight: 'lead' | 'support' | 'aside') =>
      beatsOf({ 'setup:0': { weight } }).find((b) => b.text === HISTORY[1]!.text)!.emphasis;
    expect(emphasisFor('lead')).toBe('hold');
    expect(emphasisFor('support')).toBe('normal');
    expect(emphasisFor('aside')).toBe('quick');
  });

  it('seconds reaches the beat', () => {
    const plain = beatsOf().find((b) => b.text === HISTORY[1]!.text)!.seconds;
    const stretched = beatsOf({ 'setup:0': { seconds: plain + 2 } }).find(
      (b) => b.text === HISTORY[1]!.text,
    )!.seconds;
    expect(stretched).toBeGreaterThan(plain);
  });

  it('never lets a direction cut the voice off mid-word', () => {
    const plain = beatsOf().find((b) => b.text === HISTORY[1]!.text)!.seconds;
    /* A screenplay asking for one second over a nineteen-word line. */
    const squeezed = beatsOf({ 'setup:0': { seconds: 1 } }).find(
      (b) => b.text === HISTORY[1]!.text,
    )!.seconds;
    expect(squeezed).toBe(plain);
  });

  /**
   * §470. Twice the read is a stall, not a held moment.
   *
   * Measured in a finished render: a beat held 12.86 seconds — exactly the old
   * 2× cap — on a single line, with two frames eight seconds apart identical.
   * That breaches TikTok's own pattern-interrupt ceiling of twelve seconds by
   * itself.
   */
  it('never lets a direction leave dead air', () => {
    const plain = beatsOf().find((b) => b.text === HISTORY[1]!.text)!.seconds;
    const bloated = beatsOf({ 'setup:0': { seconds: 90 } }).find(
      (b) => b.text === HISTORY[1]!.text,
    )!.seconds;
    expect(bloated).toBeLessThanOrEqual(plain * 1.4 + 0.01);
    /* And no beat may reach the interrupt ceiling on its own. */
    expect(bloated).toBeLessThan(12);
  });

  it('§478: a scene asking for footage carries the request and its subject onto the beat', () => {
    const beats = beatsOf({ 'setup:0': { ground: 'footage', groundSubject: 'hands kneading dough' } });
    const setup = beats.find((b) => b.text === HISTORY[1]!.text)!;
    expect(setup.wantsFootage).toBe(true);
    expect(setup.footageSubject).toBe('hands kneading dough');
    expect(setup.wantsFlatGround).toBeUndefined();
    expect(beats.find((b) => b.text === HISTORY[0]!.text)!.wantsFootage).toBeUndefined();
  });

  it('a scene asking for colour marks the beat as wanting no photograph', () => {
    const beats = beatsOf({ 'setup:0': { ground: 'colour' } });
    expect(beats.find((b) => b.text === HISTORY[1]!.text)!.wantsFlatGround).toBe(true);
    expect(beats.find((b) => b.text === HISTORY[0]!.text)!.wantsFlatGround).toBeUndefined();
  });

  it('directs only the scene it names, never its neighbours', () => {
    const directed = beatsOf({ 'turn:0': { move: 'cut', weight: 'lead' } });
    const plain = beatsOf();
    /*
     * A long line becomes two visual beats over one continuous piece of audio
     * (§417), and both belong to the directed scene — the picture holds while
     * the sentence completes. So "the scene it names" is a group, not a beat,
     * and `photographGroup` is already the identifier for exactly that.
     */
    const directedGroup = directed.find((b) => HISTORY[2]!.text.includes(b.text))!.photographGroup;
    for (const [i, beat] of directed.entries()) {
      if (beat.photographGroup === directedGroup) continue;
      expect(beat.move, beat.text.slice(0, 30)).toBe(plain[i]!.move);
      expect(beat.emphasis, beat.text.slice(0, 30)).toBe(plain[i]!.emphasis);
    }
    /* And every part of the directed group did receive it. */
    expect(
      directed.filter((b) => b.photographGroup === directedGroup).every((b) => b.move === 'cut'),
    ).toBe(true);
  });

  it('ignores a key that names no line, rather than directing the wrong beat', () => {
    const beats = beatsOf({ 'nonexistent:7': { move: 'drift' } });
    expect(beats.every((b) => b.move === undefined)).toBe(true);
  });

  /**
   * The payoff still holds however the screenplay weights it.
   *
   * `creative.no_payoff` is an *error* — "a plan where every beat carries equal
   * weight lands on nothing" — so a screenplay that made every scene an aside
   * must fail the piece rather than quietly flatten it. The held beat is
   * therefore not the screenplay's to give away.
   */
  it('keeps the payoff held even when the screenplay flattens everything', () => {
    const beats = beatsOf({
      'hook:0': { weight: 'aside' },
      'setup:0': { weight: 'aside' },
      'turn:0': { weight: 'aside' },
      'why_it_matters:0': { weight: 'aside' },
    });
    expect(beats.some((b) => b.emphasis === 'hold')).toBe(true);
  });

  /**
   * Every narrative format carries slot keys, or its screenplay directs nothing.
   *
   * A builder that forgot to label its lines would pass every other test here
   * and silently ignore its screenplay — which is precisely §132, one format at
   * a time instead of all of them.
   */
  it('every narrative format labels its lines', () => {
    const CASES: Record<string, Array<{ key: string; index: number; text: string; citation?: string }>> = {
      history: HISTORY,
      tips: [
        { key: 'title', index: 0, text: 'Three ways to keep bread from going stale' },
        { key: 'tip', index: 0, text: 'Keep the cut face down on the board, not in a bag' },
        { key: 'tip', index: 1, text: 'Never refrigerate it, which stales bread faster than the counter' },
        { key: 'close', index: 0, text: 'The second one is the one people get wrong' },
      ],
      comparison: [
        { key: 'question', index: 0, text: 'Should you proof in the fridge or on the counter' },
        { key: 'option_a', index: 0, text: 'The counter is faster and gives you less flavour' },
        { key: 'option_b', index: 0, text: 'The fridge is slower and develops much more of it' },
        { key: 'verdict', index: 0, text: 'Use the fridge whenever you can wait until tomorrow' },
      ],
      myth_fact: [
        { key: 'myth', index: 0, text: 'Oats are naturally full of gluten and always have been' },
        { key: 'partly_true', index: 0, text: 'They are usually milled beside wheat, so contamination is real' },
        { key: 'correction', index: 0, text: 'The oat itself has no gluten, which is why certified oats exist', citation: 'https://example.org/y' },
      ],
      origin: [
        { key: 'hook', index: 0, text: 'The bagel was boiled long before anybody thought to bake it' },
        { key: 'before', index: 0, text: 'It began as a boiled ring sold on the street in Krakow' },
        { key: 'change', index: 0, text: 'Steam ovens arrived and the boil became a thirty second dip' },
        { key: 'now', index: 0, text: 'What we buy now is mostly baked, and the crust is what was lost', citation: 'https://example.org/z' },
      ],
      poll: [
        { key: 'question', index: 0, text: 'Do you salt the water before or after it boils' },
        { key: 'option_a', index: 0, text: 'Before' },
        { key: 'option_b', index: 0, text: 'After' },
      ],
      behind: [
        { key: 'moment', index: 0, text: 'This is the fourth loaf today and the third one that failed' },
        { key: 'aside', index: 0, text: 'Nobody posts these, which is why everyone thinks it works first time' },
      ],
    };

    for (const [format, slots] of Object.entries(CASES)) {
      const first = slots[0]!;
      const key = `${first.key}:${first.index}`;
      const beats = videoForFormat(format, slots, { [key]: { move: 'drift' } })!.props
        .beats as NarrativeBeat[];
      expect(
        beats.some((b) => b.move === 'drift'),
        `${format} did not carry a slotKey, so its screenplay directs nothing`,
      ).toBe(true);
    }
  });
});

/**
 * §463. A card does not end on the punctuation that split it.
 *
 * Seen in the first end-to-end render: a four-second card reading "Modern
 * varieties are much less bitter;" — a sentence that looks cut off, on the beat
 * carrying the piece's turn.
 */
describe('splitting a line for two cards', () => {
  const split = (text: string) => splitLongLine(text, 6);

  it('does not leave a semicolon hanging at the end of a card', () => {
    const [head] = split(
      'Modern varieties are much less bitter; salt mainly helps frying by reducing oil absorption.',
    );
    expect(head).toBe('Modern varieties are much less bitter');
  });

  it('does not leave a comma hanging either', () => {
    const [head] = split(
      'Heat changes fat from liquid into a slick, and that hardened surface is the seasoning.',
    );
    expect(head).toBe('Heat changes fat from liquid into a slick');
  });

  /* A colon still means something: it introduces the card that follows. */
  it('keeps a colon, which is doing a job', () => {
    const [head] = split('There is one rule that matters: stir the pasta in the first two minutes.');
    expect(head).toBe('There is one rule that matters:');
  });

  it('never changes a line it did not split', () => {
    const line = 'Salting eggplant removes bitterness';
    expect(split(line)).toEqual([line]);
  });

  it('leaves the second card exactly as written', () => {
    const [, tail] = split(
      'Modern varieties are much less bitter; salt mainly helps frying by reducing oil absorption.',
    );
    expect(tail).toBe('salt mainly helps frying by reducing oil absorption.');
  });
});
