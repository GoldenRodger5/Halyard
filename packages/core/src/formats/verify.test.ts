/**
 * §282. Checking a citation rather than checking that one was offered.
 *
 * `looksCitable` catches "studies show". The failure that actually damages an
 * account is a confident, well-formed, **invented** citation — so these assert
 * that a real page about the right subject passes and everything else does not.
 */
import { describe, expect, it } from 'vitest';
import {
  MIN_TERM_COVERAGE,
  citationUrl,
  distinctiveTerms,
  judgeCitation,
  textFromHtml,
} from './verify.js';

const CLAIM = 'Gluten was first identified in 1728 by Jacopo Beccari.';

describe('picking the terms that prove a page is about the claim', () => {
  it('keeps years and names, which is what a factual claim turns on', () => {
    const terms = distinctiveTerms(CLAIM);
    expect(terms).toContain('1728');
    expect(terms).toContain('beccari');
  });

  it('drops words that would match any page at all', () => {
    const terms = distinctiveTerms('The thing that was in the other one.');
    for (const stop of ['the', 'that', 'was', 'other']) expect(terms).not.toContain(stop);
  });

  it('keeps a long technical noun', () => {
    expect(distinctiveTerms('It contains gliadin and glutenin.')).toContain('gliadin');
  });
});

describe('judging a fetched source', () => {
  const page = (text: string) => judgeCitation({ claim: CLAIM, status: 200, sourceText: text });

  it('supports a page that mentions the claim', () => {
    const check = page('In 1728 Jacopo Beccari separated wheat flour into starch and gluten.');
    expect(check.verdict).toBe('supported');
    expect(check.evidence.matched).toContain('1728');
  });

  it('rejects a real page that is about something else', () => {
    /* The second failure mode: a working URL attached to the wrong thing. */
    const check = page('A guide to choosing running shoes for beginners in the city.');
    expect(check.verdict).toBe('unsupported');
    expect(check.reason).toContain('does not appear to be about this claim');
  });

  it('rejects a source that does not resolve', () => {
    /* The first and most common: a hallucinated URL. */
    expect(judgeCitation({ claim: CLAIM, status: 404, sourceText: 'Not found' }).verdict).toBe(
      'unreachable',
    );
    expect(judgeCitation({ claim: CLAIM, status: null, sourceText: null }).verdict).toBe(
      'unreachable',
    );
  });

  it('refuses a claim with nothing distinctive to check', () => {
    /* Unverifiable is a refusal in a format that requires verification. */
    const check = judgeCitation({ claim: 'It is what it is.', status: 200, sourceText: 'anything' });
    expect(check.verdict).toBe('unsupported');
    expect(check.reason).toContain('no distinctive terms');
  });

  it('tolerates paraphrase, which is what honest citation looks like', () => {
    /*
     * A source need not repeat every noun written about it. Half the terms is
     * enough to establish subject and low enough not to punish good writing.
     *
     * The first version of this test used a paraphrase that dropped the word
     * "gluten" entirely and expected it to pass. The judge was right to refuse
     * it: a page that never names the subject is not evidence about the
     * subject, however many other terms it shares.
     */
    const check = page(
      'Working in 1728, Beccari was the first to separate gluten from wheat flour.',
    );
    expect(check.verdict).toBe('supported');
    expect(check.evidence.matched.length / distinctiveTerms(CLAIM).length).toBeGreaterThanOrEqual(
      MIN_TERM_COVERAGE,
    );
  });
});

describe('reading a citation', () => {
  it('finds a URL wherever it sits in the citation', () => {
    expect(citationUrl('Beccari 1728, https://example.org/gluten')).toBe(
      'https://example.org/gluten',
    );
    expect(citationUrl('see https://example.org/a?b=1 for detail')).toContain('example.org/a');
  });

  it('refuses anything that is not a fetchable web page', () => {
    for (const bad of ['Beccari, 1728', 'file:///etc/passwd', 'data:text/html,hi', '']) {
      expect(citationUrl(bad), bad).toBeNull();
    }
  });

  it('reads a page the way a person would', () => {
    const html = '<html><head><style>p{color:red}</style></head><body><script>x=1</script><p>In&nbsp;1728, Beccari.</p></body></html>';
    const text = textFromHtml(html);
    expect(text).toContain('1728');
    expect(text).toContain('Beccari');
    expect(text).not.toContain('color:red');
    expect(text).not.toContain('x=1');
  });
});
