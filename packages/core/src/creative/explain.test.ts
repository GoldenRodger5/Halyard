/**
 * §369. The account is a reading of the record, and the tests are about what it
 * refuses to do: invent a reason, launder a preference into a rationale, or
 * quietly swallow a decision that recorded nothing about itself.
 */
import { describe, expect, it } from 'vitest';
import { explainPiece, hasAccount, type RecordedEvent } from './explain.js';

const at = '2026-08-30T10:00:00.000Z';
const event = (
  message: string,
  detail: Record<string, unknown> | null = null,
  stage: string | null = null,
): RecordedEvent => ({ message, detail, stage, at });

describe('why the piece is the way it is', () => {
  it('reads the reason each decision recorded for itself', () => {
    const account = explainPiece({
      events: [
        event(
          'photographic subject',
          { subject: 'a sourdough loaf', because: 'the line is about bread, and gluten cannot be photographed' },
          'assets',
        ),
      ],
    });
    expect(account.decisions).toHaveLength(1);
    expect(account.decisions[0]!.about).toBe('What the picture is of');
    expect(account.decisions[0]!.said).toContain('gluten cannot be photographed');
    expect(account.decisions[0]!.stage).toBe('assets');
    expect(account.decisions[0]!.by).toBe('halyard');
  });

  it('cannot produce a sentence nobody logged', () => {
    /*
     * The whole design. A model narrating a finished video would happily write
     * why the bread was chosen; this can only repeat what the decision said.
     */
    const account = explainPiece({ events: [event('photographic subject', { subject: 'bread' })] });
    expect(account.decisions[0]!.said).toBe('subject: bread');
    expect(account.decisions[0]!.said).not.toContain('because');
  });

  it('names a decision that recorded nothing, rather than dropping it', () => {
    /*
     * A hole in the pipeline's own accounting, not in this reading of it. The
     * fix is the director logging a reason, and the operator should see that
     * the gap is in the record.
     */
    const account = explainPiece({ events: [event('post format chosen', null)] });
    expect(account.decisions).toEqual([]);
    expect(account.silent).toEqual(['"post format chosen" was recorded with no reason.']);
  });

  it('separates what you chose from what Halyard chose', () => {
    const account = explainPiece({
      events: [event('format filled', { because: 'every slot filled on the first attempt' })],
      overrides: { template: 'rail', voice: 'on' },
    });
    const mine = account.decisions.filter((d) => d.by === 'operator');
    expect(mine.map((d) => d.about)).toEqual(['How it is drawn', 'The voice']);
    expect(mine[0]!.said).toContain('nothing was decided here');
  });

  it('ignores an override left on auto, which is not a choice', () => {
    const account = explainPiece({ events: [], overrides: { template: 'auto', voice: '' } });
    expect(account.decisions).toEqual([]);
  });

  it('keeps the refusals, which the finished piece cannot show', () => {
    const account = explainPiece({
      events: [
        event('citations did not verify, asking again', { unsupported: 2 }, 'research'),
        event('hero image not generated', { reason: 'no image client configured' }, 'assets'),
        event('format filled', { because: 'filled on the third attempt' }, 'write'),
      ],
    });
    expect(account.refusals.map((r) => r.about)).toEqual([
      'A source did not hold up',
      'There is no picture',
    ]);
    expect(account.decisions).toHaveLength(1);
  });

  it('does not attribute a message it has no entry for', () => {
    /*
     * A map rather than a substring match. "citation checked" fires dozens of
     * times per run and is not a decision about the piece; guessing from the
     * words would fill the account with noise and, worse, would mislabel the
     * moment somebody reused a phrase.
     */
    const account = explainPiece({
      events: [event('citation checked', { because: 'the page says it' }), event('job done')],
    });
    expect(hasAccount(account)).toBe(false);
  });

  it('carries the stages that did not run, with the plan’s own reason', () => {
    const account = explainPiece({
      events: [],
      skipped: [{ stage: 'screenplay', because: 'a caption has no scenes to stage' }],
    });
    expect(account.notDone).toEqual([
      { stage: 'screenplay', because: 'a caption has no scenes to stage' },
    ]);
    expect(hasAccount(account)).toBe(true);
  });

  it('reports having nothing rather than an empty panel', () => {
    expect(hasAccount(explainPiece({ events: [] }))).toBe(false);
  });

  it('prefers the prose reason over the raw fields', () => {
    const account = explainPiece({
      events: [event('research', { kept: 10, rejected: [], because: 'ten facts, each source read' })],
    });
    expect(account.decisions[0]!.said).toBe('ten facts, each source read');
  });

  it('leaves the run’s own bookkeeping out of the facts it restates', () => {
    const account = explainPiece({
      events: [event('research', { kept: 4, contentItemId: 'abc', jobId: 'def', productId: 'x' })],
    });
    expect(account.decisions[0]!.said).toBe('kept: 4');
  });
});
