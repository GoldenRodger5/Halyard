/**
 * §322. The Kinolog case, which is the reason this exists.
 *
 * Eight pages, six slots, sliced by collection time — and the brain came back
 * with no pricing facts while `/pricing` sat in the database with 6,027
 * characters of prices and limits in it.
 */
import { describe, it, expect } from 'vitest';
import { canonicalUrl, selectEvidence, type EvidenceCandidate } from './selectEvidence.js';

/* Distinct text per page: identical filler would be deduplicated as one page,
   which is the behaviour under test rather than a property of the fixture. */
const page = (url: string, chars = 3000, body?: string): EvidenceCandidate => ({
  id: url,
  sourceUrl: url,
  title: url,
  body: body ?? `${url} `.repeat(Math.max(1, Math.round(chars / (url.length + 1)))),
  collectedAt: new Date(),
});

/* The eight pages actually collected from kinolog.app. */
const KINOLOG = [
  page('https://kinolog.app', 4074, 'landing page body '.repeat(200)),
  page('https://kinolog.app/', 4074, 'landing page body '.repeat(200)),
  page('https://kinolog.app/blog', 1995),
  page('https://kinolog.app/blog/letterboxd-alternatives', 9274),
  page('https://kinolog.app/login', 326),
  page('https://kinolog.app/pricing', 6027),
  page('https://kinolog.app/privacy', 6263),
  page('https://kinolog.app/try', 3436),
];

describe('selectEvidence', () => {
  it('keeps the pricing page, which is what it failed to do', () => {
    const chosen = selectEvidence(KINOLOG, 6).map((c) => c.candidate.sourceUrl);
    expect(chosen).toContain('https://kinolog.app/pricing');
  });

  it('treats a trailing slash as the same page', () => {
    /* One of six slots went to the landing page twice. */
    const chosen = selectEvidence(KINOLOG, 6).map((c) => c.candidate.sourceUrl);
    const landings = chosen.filter((u) => u === 'https://kinolog.app' || u === 'https://kinolog.app/');
    expect(landings).toHaveLength(1);
  });

  it('drops a login form, which cannot contain a product fact', () => {
    const chosen = selectEvidence(KINOLOG, 6).map((c) => c.candidate.sourceUrl);
    expect(chosen).not.toContain('https://kinolog.app/login');
  });

  it('drops legal text rather than drawing product claims from it', () => {
    /* A fact from a privacy policy is a compliance claim in a marketing post. */
    const chosen = selectEvidence(KINOLOG, 6).map((c) => c.candidate.sourceUrl);
    expect(chosen).not.toContain('https://kinolog.app/privacy');
  });

  it('ranks a pricing page above a longer blog post', () => {
    /* 6,027 chars about the product beats 9,274 about a topic. */
    const order = selectEvidence(KINOLOG, 8).map((c) => c.candidate.sourceUrl);
    expect(order.indexOf('https://kinolog.app/pricing')).toBeLessThan(
      order.indexOf('https://kinolog.app/blog/letterboxd-alternatives'),
    );
  });

  it('explains every choice', () => {
    for (const choice of selectEvidence(KINOLOG, 6)) {
      expect(choice.why.length).toBeGreaterThan(8);
    }
  });

  it('collapses two URLs serving identical text', () => {
    const same = 'the very same rendered shell '.repeat(50);
    const chosen = selectEvidence(
      [page('https://x.app/a', 0, same), page('https://x.app/b', 0, same)],
      6,
    );
    expect(chosen).toHaveLength(1);
  });
});

describe('canonicalUrl', () => {
  it('collapses the differences that cannot change what a page says', () => {
    const forms = [
      'https://kinolog.app/pricing',
      'https://kinolog.app/pricing/',
      'https://www.kinolog.app/pricing',
      'https://kinolog.app/pricing#plans',
      'https://kinolog.app/pricing?utm_source=x',
    ];
    expect(new Set(forms.map(canonicalUrl)).size).toBe(1);
  });

  it('does not collapse genuinely different pages', () => {
    expect(canonicalUrl('https://a.app/x')).not.toBe(canonicalUrl('https://a.app/y'));
  });
});
