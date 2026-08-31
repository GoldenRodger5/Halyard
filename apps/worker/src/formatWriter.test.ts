/**
 * §281. Writing to a format, and refusing what does not fill it.
 *
 * A half-filled quiz is not a shorter quiz — it promises five questions and
 * delivers three, or asks one whose answer card never comes. Neither of these
 * formats degrades gracefully, so neither is allowed to degrade.
 */
import { describe, expect, it, vi } from 'vitest';
import { POST_FORMAT_CATALOG } from '@halyard/core';
import {
  FormatRejectedError,
  MAX_FORMAT_ATTEMPTS,
  matchesResearchedFact,
  writeToFormat,
} from './formatWriter.js';

/**
 * A source that says whatever the test needs, without touching the network.
 * §282 fetches every citation, and a test that reaches the internet fails when
 * somebody else edits a page.
 */
const sourceSaying = (text: string) =>
  (async () => new Response(`<html><body>${text}</body></html>`, { status: 200 })) as unknown as typeof fetch;

const sourceMissing = (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch;
import { testContext, type TestContext } from './testContext.js';

function ctx(): TestContext {
  return testContext();
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

  it('refuses a citation that is not a link, because nothing could be read', async () => {
    /*
     * §282. "Beccari, 1728" has the shape of a citation and cannot be checked.
     * In a format that requires verification, unverifiable is a refusal.
     */
    const history = POST_FORMAT_CATALOG.history;
    const named = history.slots.map((s) => ({
      key: s.key,
      index: 0,
      text: 'Beccari isolated gluten in 1728.',
      citation: 'Beccari, 1728',
    }));
    const complete = vi.fn().mockResolvedValue(reply(named));
    await expect(
      writeToFormat(
        ctx(),
        history,
        { subject: 'gluten', audience: 'a', platform: 'x' },
        { complete } as never,
        sourceSaying('anything'),
      ),
    ).rejects.toThrow(/not filled/);
  });

  it('refuses a cited URL that does not resolve', async () => {
    /* The dominant failure: a plausible, invented link. */
    const history = POST_FORMAT_CATALOG.history;
    const cited = history.slots.map((s) => ({
      key: s.key,
      index: 0,
      text: 'Beccari isolated gluten in 1728.',
      citation: 'https://example.org/beccari',
    }));
    const complete = vi.fn().mockResolvedValue(reply(cited));
    await expect(
      writeToFormat(
        ctx(),
        history,
        { subject: 'gluten', audience: 'a', platform: 'x' },
        { complete } as never,
        sourceMissing,
      ),
    ).rejects.toThrow(/not filled/);
  });

  it('refuses a real link that is about something else entirely', async () => {
    const history = POST_FORMAT_CATALOG.history;
    const cited = history.slots.map((s) => ({
      key: s.key,
      index: 0,
      text: 'Beccari isolated gluten in 1728.',
      citation: 'https://example.org/football',
    }));
    const complete = vi.fn().mockResolvedValue(reply(cited));
    await expect(
      writeToFormat(
        ctx(),
        history,
        { subject: 'gluten', audience: 'a', platform: 'x' },
        { complete } as never,
        sourceSaying('A guide to choosing running shoes for beginners.'),
      ),
    ).rejects.toThrow(/not filled/);
  });

  it('accepts a sourced format when every link resolves and mentions the claim', async () => {
    const history = POST_FORMAT_CATALOG.history;
    const cited = history.slots.map((s) => ({
      key: s.key,
      index: 0,
      text: 'Beccari isolated gluten in 1728.',
      citation: 'https://example.org/beccari',
    }));
    const complete = vi.fn().mockResolvedValue(reply(cited));
    const result = await writeToFormat(
      ctx(),
      history,
      { subject: 'gluten', audience: 'a', platform: 'x' },
      { complete } as never,
      sourceSaying('In 1728 Beccari isolated gluten from wheat flour.'),
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

describe('§410 a specific is sufficient, not necessary', () => {
  /* Carries a specific — 1728 — as `specificsOf` detects them: digits, or a
     capitalised word mid-sentence. */
  const dated =
    'Gluten was first isolated by Beccari in 1728, separating it from wheat flour.';
  const fact =
    'Staling is caused by starch retrogradation, in which amylopectin recrystallises over time.';

  it('accepts a line carrying the fact’s specific and nothing else', () => {
    expect(matchesResearchedFact('It was 1728.', dated)).toBe(true);
  });

  it('now also accepts a paraphrase of a fact that has a specific', () => {
    /*
     * The old rule returned false the moment a fact carried any number or name
     * and the citing line did not repeat one — so this exact sentence, which is
     * the fact written for a viewer, was refused.
     */
    expect(
      matchesResearchedFact('Gluten was first isolated from wheat flour.', dated),
    ).toBe(true);
  });

  it('accepts an accurate paraphrase that carries no specific', () => {
    /*
     * Found live: a `history` piece on why bread goes stale was refused three
     * times and abandoned on a line that was true and sourced, because the rule
     * required a number or proper noun to appear verbatim.
     */
    expect(
      matchesResearchedFact('Staling is caused by starch slowly recrystallising over time.', fact),
    ).toBe(true);
  });

  it('still refuses a line that says something else entirely', () => {
    expect(matchesResearchedFact('Keep bread in a paper bag on the counter.', fact)).toBe(false);
  });

  it('still refuses a line that merely shares grammar', () => {
    expect(matchesResearchedFact('This is caused by something that happens over time.', fact)).toBe(
      false,
    );
  });
});
