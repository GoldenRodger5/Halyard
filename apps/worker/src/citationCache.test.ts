/**
 * §360. What the first real quiz generation cost, in fetches and in time.
 *
 * Eight reads of one Wikipedia page, five of another, and then a dead job on
 * the handler's 300s timeout. These three are the parts that were wrong.
 */
import { describe, it, expect } from 'vitest';
import { judgeCitation } from '@halyard/core';
import { checkCitation, newSourceCache } from './citationCheck.js';
import { testContext } from './testContext.js';

const ctx = testContext();

describe('a source is read once per run', () => {
  it('fetches one URL once however many claims cite it', async () => {
    let reads = 0;
    const fetchImpl = (async () => {
      reads += 1;
      return new Response('<p>Tortilla soup is a Mexican soup made with tortilla strips.</p>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }) as unknown as typeof fetch;

    const cache = newSourceCache();
    const url = 'https://en.wikipedia.org/wiki/Tortilla_soup';
    for (let i = 0; i < 8; i += 1) {
      await checkCitation(ctx, { claim: 'Tortilla soup is Mexican', citation: url }, fetchImpl, cache);
    }
    expect(reads).toBe(1);
  });

  it('judges each claim separately against the shared reading', async () => {
    const fetchImpl = (async () =>
      new Response('<p>Tortilla soup is a Mexican soup made with tortilla strips.</p>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })) as unknown as typeof fetch;

    const cache = newSourceCache();
    const url = 'https://en.wikipedia.org/wiki/Tortilla_soup';
    const about = await checkCitation(
      ctx,
      { claim: 'Tortilla soup is a Mexican soup with tortilla strips', citation: url },
      fetchImpl,
      cache,
    );
    const unrelated = await checkCitation(
      ctx,
      { claim: 'Neapolitan pizza dough ferments seventy hours in Naples', citation: url },
      fetchImpl,
      cache,
    );
    expect(about.verdict).toBe('supported');
    /* A cached page is not a cached verdict. */
    expect(unrelated.verdict).toBe('unsupported');
  });

  it('caches a failure, so a dead host costs one timeout and not five', async () => {
    let reads = 0;
    const fetchImpl = (async () => {
      reads += 1;
      throw new Error('timed out');
    }) as unknown as typeof fetch;

    const cache = newSourceCache();
    for (let i = 0; i < 5; i += 1) {
      await checkCitation(
        ctx,
        { claim: 'anything at all here', citation: 'https://slow.example.org/a' },
        fetchImpl,
        cache,
      );
    }
    expect(reads).toBe(1);
  });
});

describe('a source this cannot read is not a source that disagrees', () => {
  it('calls a PDF unreadable rather than unsupported', () => {
    /*
     * `dietaryguidelines.gov/...pdf` answered 200 with no extractable text, and
     * the old code reported "the source does not mention this claim" — a
     * statement about the page, and a false one.
     */
    const check = judgeCitation({
      claim: 'The 2020 guidelines recommend under ten percent of calories from added sugar',
      status: 200,
      sourceText: '',
      contentType: 'application/pdf',
    });
    expect(check.verdict).toBe('unreadable');
    expect(check.reason).toContain('cite a page rather than a file');
  });

  it('still reads HTML, and an absent content-type is assumed readable', () => {
    const html = judgeCitation({
      claim: 'gluten identified by Beccari',
      status: 200,
      sourceText: 'Beccari identified gluten in wheat flour.',
      contentType: 'text/html; charset=utf-8',
    });
    expect(html.verdict).toBe('supported');

    const none = judgeCitation({
      claim: 'gluten identified by Beccari',
      status: 200,
      sourceText: 'Beccari identified gluten in wheat flour.',
    });
    expect(none.verdict).toBe('supported');
  });
});
