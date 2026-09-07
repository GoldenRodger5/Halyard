/**
 * §558. The critic was an opinion nobody acted on.
 *
 * `readPiece` asks three readers what is wrong with a written piece and is good
 * at it — a Kinolog piece came back with *"'play the highest overlap' sounds
 * assembled rather than spoken"*, which is exactly right. The verdict went into
 * `generation_meta` and nowhere else, so a piece flagged
 * `text.reads_as_written_by_a_machine` reached the approval queue unchanged.
 *
 * §533's objection one layer up — and the finding type has carried the answer
 * in a comment since it was written: *"which slot it is about, so a rewrite
 * knows what to replace."* Nothing replaced anything.
 */
import { describe, expect, it, vi } from 'vitest';
import { POST_FORMAT_CATALOG, type LlmClient } from '@halyard/core';

import { reviseFlaggedSlots } from './formatWriter.js';
import { testContext } from './testContext.js';

const format = POST_FORMAT_CATALOG.tips;

const draft = {
  /* `tips` wants five tips; a short fixture fails `format.incomplete` and the
     revision is correctly discarded, which is the guard rather than a bug. */
  slots: [
    { key: 'title', index: 0, text: 'Set a timer and play the highest overlap' },
    { key: 'tip', index: 0, text: 'Open one watchlist and read only the first three lines.' },
    { key: 'tip', index: 1, text: 'Remove anything you would not restart tomorrow.' },
    { key: 'tip', index: 2, text: 'Give the first ten minutes and then decide.' },
    { key: 'tip', index: 3, text: 'Keep three candidates at the top and hide the rest.' },
    { key: 'tip', index: 4, text: 'Write one line saying why you saved it.' },
    { key: 'close', index: 0, text: 'A shorter list gets opened again.' },
  ],
  body: 'A caption that says something real.',
  altText: 'Alt text.',
} as never;

const finding = {
  rule: 'text.reads_as_written_by_a_machine',
  message: '"play the highest overlap" sounds assembled rather than spoken.',
  slot: 'title',
  persona: 'scroller',
};

/** An LLM that replies with whatever JSON the test hands it. */
const llmReplying = (text: string): LlmClient =>
  ({ complete: vi.fn(async () => ({ text, costUsd: 0.001 })) }) as unknown as LlmClient;

describe('§558 the lines readers objected to get rewritten', () => {
  it('replaces only the slot the finding named', async () => {
    const llm = llmReplying('{"title":"Set a ten minute timer, then pick the closest match"}');
    const out = await reviseFlaggedSlots(testContext({}), format, draft, [finding], llm);

    expect(out).not.toBeNull();
    expect(out!.revised).toEqual(['title']);
    expect(out!.draft.slots.find((s) => s.key === 'title')!.text).toContain('closest match');
    /* Everything else is untouched — a good line is not at risk for a bad one. */
    expect(out!.draft.slots.find((s) => s.key === 'close')!.text).toBe('A shorter list gets opened again.');
  });

  it('does nothing when no finding names a slot', async () => {
    const llm = llmReplying('{}');
    const out = await reviseFlaggedSlots(
      testContext({}),
      format,
      draft,
      [{ ...finding, slot: null }],
      llm,
    );
    expect(out).toBeNull();
    expect(vi.mocked(llm.complete), 'no findings, no call').not.toHaveBeenCalled();
  });

  it('drops a revision that fails the gate the original passed', async () => {
    /* §275. The critic may not fail a piece, so a bad rewrite is discarded. */
    const llm = llmReplying('{"title":"Set A Ten Minute Timer And Pick The Closest Match"}');
    const out = await reviseFlaggedSlots(testContext({}), format, draft, [finding], llm);
    expect(out, 'Title Case fails format.headline_case and must not ship').toBeNull();
  });

  it('survives a reply that is not JSON', async () => {
    const llm = llmReplying('I would rewrite it as: something better.');
    const out = await reviseFlaggedSlots(testContext({}), format, draft, [finding], llm);
    expect(out).toBeNull();
  });

  it('ignores a replacement for a slot nobody objected to', async () => {
    const llm = llmReplying('{"title":"Set a timer, then pick the closest match","close":"Injected."}');
    const out = await reviseFlaggedSlots(testContext({}), format, draft, [finding], llm);
    expect(out!.revised).toEqual(['title']);
    expect(out!.draft.slots.find((s) => s.key === 'close')!.text).toBe('A shorter list gets opened again.');
  });
});
