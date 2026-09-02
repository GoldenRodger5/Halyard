/**
 * §474. The critic that reads the piece before it is made.
 *
 * Every defect found by reading real output this session — a myth that was
 * true, a concession that conceded nothing, a hook that answered itself,
 * "eggplant" and "aubergines" four seconds apart, a caption ending on
 * "Wikipedia, Sourdough" — was visible in the **text**. None needed a frame.
 * All of them were found after a render, because that is where the only critic
 * lived.
 */
import { describe, expect, it } from 'vitest';
import { CRITIC_PERSONAS } from './critic.js';
import {
  TEXT_CRITIC_QUESTIONS,
  parseTextCriticReply,
  renderTextPiece,
  textCriticSystemPrompt,
  type TextPiece,
} from './textCritic.js';

const piece: TextPiece = {
  format: 'myth_fact',
  platform: 'tiktok',
  lines: [
    { key: 'myth', text: 'Salting eggplant removes bitterness' },
    { key: 'partly_true', text: 'Yes, aubergines used to be salted and rinsed.' },
    { key: 'correction', text: 'Modern varieties are much less bitter.' },
  ],
  caption: 'Salt is not for bitterness',
};

describe('what the text critic is asked', () => {
  it('asks every question as somebody who exists', () => {
    for (const q of TEXT_CRITIC_QUESTIONS) {
      expect(CRITIC_PERSONAS[q.persona], q.rule).toBeDefined();
    }
  });

  it('asks the questions that were only ever found by hand', () => {
    const rules = TEXT_CRITIC_QUESTIONS.map((q) => q.rule);
    expect(rules).toContain('text.not_a_misconception');
    expect(rules).toContain('text.concession_concedes_nothing');
    expect(rules).toContain('text.hook_closes_the_gap');
  });

  /*
   * The boundary that keeps this from becoming a second copy gate. Anything
   * that can be stated as a rule belongs in slopFilter, where it runs every
   * time and costs nothing.
   */
  it('refuses the work the deterministic gate already does', () => {
    const prompt = textCriticSystemPrompt();
    expect(prompt).toMatch(/NOT checking spelling, punctuation, banned phrases/);
    expect(prompt).toMatch(/do not average them/i);
  });

  it('shows the piece as words in order, with its caption', () => {
    const shown = renderTextPiece(piece);
    expect(shown).toContain('[myth] Salting eggplant removes bitterness');
    expect(shown).toContain('Caption underneath:');
    /* The order is the piece, so it must survive. */
    expect(shown.indexOf('[myth]')).toBeLessThan(shown.indexOf('[correction]'));
  });
});

describe('reading the reply', () => {
  const parse = (findings: unknown) => parseTextCriticReply({ findings }, piece);

  it('keeps a finding that quotes a line and names a real slot', () => {
    const v = parse([
      { rule: 'text.not_a_misconception', slot: 'myth', message: 'Salting really was standard practice; this is not wrong.' },
    ]);
    expect(v.findings).toHaveLength(1);
    expect(v.findings[0]!.persona).toBe('cook');
    expect(v.findings[0]!.slot).toBe('myth');
  });

  it('drops a rule it never asked about', () => {
    expect(parse([{ rule: 'text.invented', slot: 'myth', message: 'Something is wrong here.' }]).findings).toEqual([]);
  });

  /*
   * A wrong slot name sends a rewrite at the wrong line, which is worse than
   * no slot at all.
   */
  it('drops a slot the piece does not have rather than trusting it', () => {
    const v = parse([
      { rule: 'text.overstated', slot: 'nonexistent', message: 'This claim is far too strong to stand.' },
    ]);
    expect(v.findings[0]!.slot).toBeNull();
  });

  it('never repeats a rule, because a critic repeating itself reads as noise', () => {
    const v = parse([
      { rule: 'text.overstated', slot: 'myth', message: 'The first objection, stated clearly.' },
      { rule: 'text.overstated', slot: 'correction', message: 'The same objection again, restated.' },
    ]);
    expect(v.findings).toHaveLength(1);
  });

  it('discards a finding too short to be worth reading', () => {
    expect(parse([{ rule: 'text.overstated', slot: 'myth', message: 'bad' }]).findings).toEqual([]);
  });

  /* Fails closed: a malformed reply yields nothing, never an invention. */
  it('yields nothing from a reply it cannot read', () => {
    expect(parseTextCriticReply(null, piece).findings).toEqual([]);
    expect(parseTextCriticReply({ findings: 'no' }, piece).findings).toEqual([]);
  });

  /**
   * Silence is not approval. `examined` is what separates "read it and found
   * nothing" from "never ran", and the summary says which.
   */
  it('reports how much it read, so silence can be told from absence', () => {
    expect(parse([]).examined).toBe(3);
    expect(parse([]).summary).toMatch(/found nothing worth saying/);
    const empty = parseTextCriticReply({ findings: [] }, { ...piece, lines: [] });
    expect(empty.examined).toBe(0);
    expect(empty.summary).toMatch(/no lines to read/);
  });
});
