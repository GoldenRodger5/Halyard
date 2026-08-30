/**
 * §344. Every case here is a way a model confabulates a source. They are not
 * hypothetical: the Kinolog quiz produced several of them on one run.
 */
import { describe, it, expect } from 'vitest';
import { parseFacts, research, screenSource, verifySource, type SourcedFact } from './researcher.js';

const fact = (over: Partial<SourcedFact> = {}): SourcedFact => ({
  claim: 'Gluten was first isolated in 1728 by Jacopo Beccari.',
  sourceUrl: 'https://en.wikipedia.org/wiki/Jacopo_Bartolomeo_Beccari',
  support: 'Beccari isolated gluten from wheat flour in 1728.',
  shape: 'year',
  ...over,
});

function page(body: string, status = 200): typeof fetch {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
    }) as unknown as Response) as typeof fetch;
}

describe('screenSource', () => {
  it('refuses a search page, which resolves and proves nothing', () => {
    /* A 200 that says "look it up". The fetch check would pass it. */
    expect(screenSource('https://www.google.com/search?q=gluten+1728').ok).toBe(false);
    expect(screenSource('https://example.org/results?query=x').ok).toBe(false);
  });

  it('refuses a home page, which cannot support a specific claim', () => {
    /* "According to britannica.com" is the shape of a citation, not one. */
    expect(screenSource('https://www.britannica.com/').ok).toBe(false);
    expect(screenSource('https://www.britannica.com').ok).toBe(false);
  });

  it('refuses the placeholder hosts a model reaches for', () => {
    expect(screenSource('https://example.com/article').ok).toBe(false);
    expect(screenSource('http://localhost:3000/x').ok).toBe(false);
  });

  it('refuses a non-URL and a non-http scheme', () => {
    expect(screenSource('Beccari, 1728').ok).toBe(false);
    expect(screenSource('ftp://files.example.org/x').ok).toBe(false);
  });

  it('accepts a real deep link', () => {
    expect(screenSource('https://en.wikipedia.org/wiki/Gluten').ok).toBe(true);
  });
});

describe('verifySource', () => {
  it('rejects an invented source, which is the commonest failure', async () => {
    /* The Kinolog run produced two of these on a single attempt. */
    const verdict = await verifySource(fact(), page('', 404));
    expect(verdict.ok).toBe(false);
    expect(verdict.status).toBe(404);
    expect(verdict.because).toContain('does not exist as cited');
  });

  it('rejects a real page that does not support the claim', async () => {
    /*
     * Different failure, different meaning: the model remembered a real page
     * and the wrong thing about it. The Kinolog run had one matching 1 of 3.
     */
    const verdict = await verifySource(
      fact(),
      page('<p>An article about nineteenth century Italian chemistry.</p>'),
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.because).toContain('only');
  });

  it('accepts a page that carries the claim', async () => {
    const verdict = await verifySource(
      fact(),
      page('<h1>Beccari</h1><p>Beccari isolated gluten from wheat flour in 1728.</p>'),
    );
    expect(verdict.ok).toBe(true);
    expect(verdict.overlap).toBeGreaterThan(0.5);
  });

  it('ignores script and style content when reading a page', async () => {
    /* A term appearing only in a tracking script is not the page saying it. */
    const verdict = await verifySource(
      fact(),
      page('<script>var beccari="isolated gluten wheat flour 1728";</script><p>Unrelated.</p>'),
    );
    expect(verdict.ok).toBe(false);
  });

  it('survives a network failure without throwing', async () => {
    const failing = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const verdict = await verifySource(fact(), failing);
    expect(verdict.ok).toBe(false);
    expect(verdict.because).toContain('could not be read');
  });

  it('refuses a claim with no distinctive words to check', async () => {
    /* Nothing longer than four letters means any page would "support" it. */
    const verdict = await verifySource(
      fact({ claim: 'It is so.', support: 'Yes it is.' }),
      page('<p>anything at all</p>'),
    );
    expect(verdict.ok).toBe(false);
  });
});

describe('parseFacts', () => {
  it('drops a fact with no URL rather than keeping a bare assertion', () => {
    const facts = parseFacts('{"facts":[{"claim":"Something true.","sourceUrl":"Beccari 1728"}]}');
    expect(facts).toEqual([]);
  });

  it('survives a reply that is not JSON', () => {
    expect(parseFacts('I could not find any sources.')).toEqual([]);
  });

  it('survives malformed JSON rather than throwing mid-pipeline', () => {
    expect(parseFacts('{"facts":[{"claim":')).toEqual([]);
  });

  it('defaults an unknown shape rather than dropping the fact', () => {
    const facts = parseFacts(
      '{"facts":[{"claim":"x is y","sourceUrl":"https://a.org/p","support":"s","shape":"vibes"}]}',
    );
    expect(facts[0]!.shape).toBe('term');
  });
});

describe('research', () => {
  const llm = (facts: unknown[]) =>
    ({
      complete: async () => ({
        text: JSON.stringify({ facts }),
        model: 'test',
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      }),
    }) as never;

  it('returns only what survived verification', async () => {
    const result = await research(
      { subject: 'gluten', productContext: 'a recipe app', want: 2 },
      llm([
        { claim: 'Beccari isolated gluten in 1728.', sourceUrl: 'https://real.org/beccari', support: 'Beccari isolated gluten in 1728.', shape: 'year' },
        { claim: 'Invented.', sourceUrl: 'https://real.org/nope', support: 'Invented.', shape: 'term' },
      ]),
      (async (url: string) =>
        ({
          ok: String(url).includes('beccari'),
          status: String(url).includes('beccari') ? 200 : 404,
          text: async () => 'Beccari isolated gluten in 1728.',
        }) as unknown as Response) as typeof fetch,
    );

    expect(result.facts).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]!.because).toContain('404');
  });

  it('returns fewer than asked rather than padding with unverified facts', async () => {
    /*
     * Four checkable facts is a complete success; six with two invented is a
     * failure. The caller decides whether fewer is enough.
     */
    const result = await research(
      { subject: 'x', productContext: 'y', want: 5 },
      llm([{ claim: 'a claim here', sourceUrl: 'https://a.org/p', support: 'a claim here', shape: 'term' }]),
      page('a claim here'),
    );
    expect(result.facts.length).toBeLessThan(5);
  });

  it('stops fetching once it has what the caller asked for', async () => {
    let calls = 0;
    const counting = (async () => {
      calls += 1;
      return { ok: true, status: 200, text: async () => 'alpha bravo charlie delta' } as unknown as Response;
    }) as typeof fetch;

    await research(
      { subject: 'x', productContext: 'y', want: 1 },
      llm([
        { claim: 'alpha bravo charlie', sourceUrl: 'https://a.org/1', support: 'delta', shape: 'term' },
        { claim: 'alpha bravo charlie', sourceUrl: 'https://a.org/2', support: 'delta', shape: 'term' },
      ]),
      counting,
    );
    expect(calls).toBe(1);
  });

  it('returns nothing rather than throwing when the model finds nothing', async () => {
    const result = await research({ subject: 'x', productContext: 'y', want: 3 }, llm([]), page(''));
    expect(result.facts).toEqual([]);
  });
});
