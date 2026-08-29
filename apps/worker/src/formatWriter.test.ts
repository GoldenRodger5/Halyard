/**
 * §281. Writing to a format, and refusing what does not fill it.
 *
 * A half-filled quiz is not a shorter quiz — it promises five questions and
 * delivers three, or asks one whose answer card never comes. Neither of these
 * formats degrades gracefully, so neither is allowed to degrade.
 */
import { describe, expect, it, vi } from 'vitest';
import { POST_FORMAT_CATALOG } from '@halyard/core';
import { FormatRejectedError, MAX_FORMAT_ATTEMPTS, writeToFormat } from './formatWriter.js';
import type { HandlerContext } from './poller.js';

function ctx(): HandlerContext & { logs: string[] } {
  const logs: string[] = [];
  return { logs, log: (m: string) => logs.push(m) } as unknown as HandlerContext & { logs: string[] };
}

const reply = (slots: unknown) => ({
  text: JSON.stringify({ slots }),
  model: 'stub',
  inputTokens: 1,
  outputTokens: 1,
  costUsd: 0.001,
});

const tips = POST_FORMAT_CATALOG.tips;
const fullTips = [
  { key: 'title', index: 0, text: 'Gluten-free bread that actually rises' },
  ...Array.from({ length: 5 }, (_, i) => ({
    key: 'tip',
    index: i,
    text: `Do the ${i + 1} thing that helps it rise.`,
  })),
  { key: 'close', index: 0, text: 'The hydration one matters most.' },
];

describe('writing to a format', () => {
  it('returns a draft that fills every slot', async () => {
    const complete = vi.fn().mockResolvedValue(reply(fullTips));
    const result = await writeToFormat(
      ctx(),
      tips,
      { subject: 'bread', audience: 'bakers', platform: 'x' },
      { complete } as never,
    );
    expect(result.attempts).toBe(1);
    expect(result.draft.slots).toHaveLength(7);
  });

  it('asks again when slots are missing, naming what was missing', async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce(reply(fullTips.slice(0, 3)))
      .mockResolvedValueOnce(reply(fullTips));
    const result = await writeToFormat(
      ctx(),
      tips,
      { subject: 'bread', audience: 'bakers', platform: 'x' },
      { complete } as never,
    );
    expect(result.attempts).toBe(2);
    /* The retry must say what was wrong, not repeat the brief. */
    const second = complete.mock.calls[1]![0].messages[0].content as string;
    expect(second).toContain('did not fill');
    expect(second).toContain('tip');
  });

  it('refuses after the budget rather than returning a half-filled piece', async () => {
    const complete = vi.fn().mockResolvedValue(reply(fullTips.slice(0, 2)));
    await expect(
      writeToFormat(ctx(), tips, { subject: 'b', audience: 'a', platform: 'x' }, { complete } as never),
    ).rejects.toBeInstanceOf(FormatRejectedError);
    expect(complete).toHaveBeenCalledTimes(MAX_FORMAT_ATTEMPTS);
  });

  it('refuses a sourced format whose claims carry no citation', async () => {
    /*
     * The failure that would actually damage the account. A history post with
     * a confident uncited date is indistinguishable from a true one until
     * somebody checks.
     */
    const history = POST_FORMAT_CATALOG.history;
    const uncited = history.slots.map((s) => ({ key: s.key, index: 0, text: 'Something asserted.' }));
    const complete = vi.fn().mockResolvedValue(reply(uncited));
    await expect(
      writeToFormat(ctx(), history, { subject: 'gluten', audience: 'a', platform: 'x' }, { complete } as never),
    ).rejects.toThrow(/not filled/);
  });

  it('accepts a sourced format when every claim is cited', async () => {
    const history = POST_FORMAT_CATALOG.history;
    const cited = history.slots.map((s) => ({
      key: s.key,
      index: 0,
      text: 'Something asserted.',
      citation: 'Beccari, 1728',
    }));
    const complete = vi.fn().mockResolvedValue(reply(cited));
    const result = await writeToFormat(
      ctx(),
      history,
      { subject: 'gluten', audience: 'a', platform: 'x' },
      { complete } as never,
    );
    expect(result.draft.slots).toHaveLength(history.slots.length);
  });

  it('survives a reply that is not JSON at all', async () => {
    /* Treated as an empty draft, which the checker then reports as unfilled. */
    const complete = vi
      .fn()
      .mockResolvedValueOnce({ text: 'Sorry, I cannot help with that.', model: 's', inputTokens: 1, outputTokens: 1, costUsd: 0 })
      .mockResolvedValueOnce(reply(fullTips));
    const result = await writeToFormat(
      ctx(),
      tips,
      { subject: 'b', audience: 'a', platform: 'x' },
      { complete } as never,
    );
    expect(result.attempts).toBe(2);
  });

  it('accumulates the cost of every attempt, not just the last', async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce(reply(fullTips.slice(0, 2)))
      .mockResolvedValueOnce(reply(fullTips));
    const result = await writeToFormat(
      ctx(),
      tips,
      { subject: 'b', audience: 'a', platform: 'x' },
      { complete } as never,
    );
    expect(result.costUsd).toBeCloseTo(0.002, 5);
  });
});
