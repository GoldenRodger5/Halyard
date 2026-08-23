/**
 * Social proof and the newsletter. Milestone 45.
 *
 * Fabricated social proof is the one unrecoverable content failure, so these
 * are the strictest tests in the system: every ambiguity must fail closed.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  composeNewsletter,
  extractQuotes,
  isMarkedTrim,
  renderNewsletter,
  runProofQC,
  sendNewsletter,
  UNSUBSCRIBE_PLACEHOLDER,
  verifyTestimonial,
  type StoredProof,
} from './index.js';

const REVIEW: StoredProof = {
  id: 'proof-1',
  source: 'app_store',
  sourceId: '900012',
  authorDisplay: 'gfbaker22',
  rating: 5,
  title: 'Finally something that explains why',
  body: 'I have been baking gluten free for four years and this is the first app that told me why the vinegar matters. The bread actually held together.',
  consentState: 'public_by_default',
};

const PRIVATE_EMAIL: StoredProof = {
  id: 'proof-2',
  source: 'email',
  sourceId: 'msg-77',
  authorDisplay: 'Marianne Delacroix',
  body: 'Honestly this saved my daughter’s birthday cake.',
  consentState: 'not_asked',
};

describe('verifyTestimonial', () => {
  it('accepts an exact quote from a stored review', () => {
    const verdict = verifyTestimonial(
      { quote: 'this is the first app that told me why the vinegar matters' },
      [REVIEW],
    );
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.trimmed).toBe(false);
  });

  it('tolerates typography, which is not an edit', () => {
    const verdict = verifyTestimonial(
      { quote: 'Honestly this saved my daughter\'s birthday cake' },
      [{ ...PRIVATE_EMAIL, consentState: 'granted' }],
    );
    expect(verdict.ok).toBe(true);
  });

  it('rejects a quote that was tidied up, however slightly', () => {
    // "actually held together" → "held together perfectly" is a fabrication.
    const verdict = verifyTestimonial(
      { quote: 'The bread held together perfectly.' },
      [REVIEW],
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.rule).toBe('proof.not_verbatim');
      expect(verdict.message).toMatch(/small rewrite/);
    }
  });

  it('accepts a trim only when it is marked', () => {
    const marked = verifyTestimonial(
      { quote: 'I have been baking gluten free for four years ... The bread actually held together.' },
      [REVIEW],
    );
    expect(marked.ok).toBe(true);
    if (marked.ok) expect(marked.trimmed).toBe(true);

    const unmarked = verifyTestimonial(
      { quote: 'I have been baking gluten free for four years The bread actually held together.' },
      [REVIEW],
    );
    expect(unmarked.ok).toBe(false);
  });

  it('rejects a trim that reorders the source', () => {
    // Cutting is allowed; rearranging someone's sentence is not.
    const verdict = verifyTestimonial(
      { quote: 'The bread actually held together ... I have been baking gluten free' },
      [REVIEW],
    );
    expect(verdict.ok).toBe(false);
  });

  it('refuses a quote with no stored row at all', () => {
    const verdict = verifyTestimonial({ quote: 'Best app I have ever used!' }, []);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.rule).toBe('proof.no_source');
      expect(verdict.fix).toMatch(/never publishes/);
    }
  });

  it('refuses to name someone who has not consented', () => {
    const verdict = verifyTestimonial(
      {
        quote: 'Honestly this saved my daughter’s birthday cake.',
        attribution: '— Marianne Delacroix',
      },
      [PRIVATE_EMAIL],
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.rule).toBe('proof.no_consent');
      expect(verdict.fix).toMatch(/private message is not a public quote/);
    }
  });

  it('allows the same quote unattributed', () => {
    const verdict = verifyTestimonial(
      { quote: 'Honestly this saved my daughter’s birthday cake.' },
      [PRIVATE_EMAIL],
    );
    expect(verdict.ok).toBe(true);
  });

  it('allows naming a public App Store handle, which is already published', () => {
    const verdict = verifyTestimonial(
      {
        quote: 'The bread actually held together.',
        attribution: 'gfbaker22 on the App Store',
      },
      [REVIEW],
    );
    expect(verdict.ok).toBe(true);
  });

  it('refuses when the named row does not exist', () => {
    const verdict = verifyTestimonial(
      { quote: 'The bread actually held together.', proofId: 'proof-missing' },
      [REVIEW],
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.rule).toBe('proof.no_source');
  });
});

describe('isMarkedTrim', () => {
  it('accepts both ellipsis forms', () => {
    expect(isMarkedTrim('four years ... held together', REVIEW.body)).toBe(true);
    expect(isMarkedTrim('four years … held together', REVIEW.body)).toBe(true);
  });

  it('rejects an unmarked join', () => {
    expect(isMarkedTrim('four years held together', REVIEW.body)).toBe(false);
  });
});

describe('extractQuotes', () => {
  it('finds straight and curly quotations', () => {
    const quotes = extractQuotes(
      'One reader said “the bread actually held together” and another said "it finally made sense".',
    );
    expect(quotes).toContain('the bread actually held together');
    expect(quotes).toContain('it finally made sense');
  });

  it('ignores short fragments that are not testimonials', () => {
    expect(extractQuotes('Use the "1:1" blend.')).toEqual([]);
  });
});

describe('runProofQC', () => {
  it('passes a post with no quotes at all', () => {
    const result = runProofQC({ body: 'Vinegar firms the crumb.', attached: [] });
    expect(result.passed).toBe(true);
    expect(result.summary).toBe('no quoted testimonial');
  });

  it('fails — not warns — on a quote that matches no stored review', () => {
    // Every other gate has warnings. This one does not, on purpose.
    const result = runProofQC({
      body: 'One reader wrote “this app changed my life completely”.',
      attached: [],
      available: [REVIEW],
    });
    expect(result.passed).toBe(false);
    // A row exists but the quote is not in it, which is the more precise
    // complaint than "no source".
    expect(result.findings[0]!.rule).toBe('proof.not_verbatim');
  });

  it('says no source when there is genuinely nothing stored', () => {
    const result = runProofQC({
      body: 'One reader wrote “this app changed my life completely”.',
      attached: [],
    });
    expect(result.passed).toBe(false);
    expect(result.findings[0]!.rule).toBe('proof.no_source');
  });

  it('passes a quote that resolves to an attached row', () => {
    const result = runProofQC({
      body: 'A reader on the App Store: “The bread actually held together.”',
      attached: [REVIEW],
    });
    expect(result.passed).toBe(true);
    expect(result.verified).toBe(1);
  });
});

// ── Newsletter ─────────────────────────────────────────────────────────────

const POSTS = [
  {
    contentItemId: 'ci-1',
    title: 'Why your gluten-free loaf is gummy',
    body: 'Why your gluten-free loaf is gummy. The starch holds water that wheat would have released. Drop the oven 25 degrees and bake it twelve minutes longer.',
    category: 'education',
    publishedAt: new Date('2026-09-15T12:00:00Z'),
    destinationUrl: 'https://recipefix.app/recipe/abc',
  },
  {
    contentItemId: 'ci-2',
    title: 'Doubling a recipe is not multiplication',
    body: 'Doubling a recipe is not multiplication. Salt and yeast scale to about 85 percent of linear.',
    category: 'education',
    publishedAt: new Date('2026-09-17T12:00:00Z'),
  },
];

describe('composeNewsletter', () => {
  it('builds an issue from what actually published', () => {
    const draft = composeNewsletter({
      productName: 'RecipeFix',
      periodStart: new Date('2026-09-14T00:00:00Z'),
      periodEnd: new Date('2026-09-21T00:00:00Z'),
      posts: POSTS,
      leadMagnet: {
        title: 'The 39 substitution guides',
        url: 'https://recipefix.app/guides',
        description: 'Every swap, with the ratio and what it costs you.',
      },
    });

    expect(draft).not.toBeNull();
    expect(draft!.subject).toBe('Why your gluten-free loaf is gummy');
    expect(draft!.sourceItemIds).toEqual(['ci-1', 'ci-2']);
    expect(draft!.bodyMarkdown).toContain('### Doubling a recipe is not multiplication');
    expect(draft!.bodyMarkdown).toContain('https://recipefix.app/guides');
    // The headline must not be repeated immediately underneath itself.
    expect(draft!.bodyMarkdown).not.toContain(
      '### Why your gluten-free loaf is gummy\n\nWhy your gluten-free loaf is gummy.',
    );
  });

  it('returns null rather than an empty issue', () => {
    expect(
      composeNewsletter({
        productName: 'RecipeFix',
        periodStart: new Date(),
        periodEnd: new Date(),
        posts: [],
      }),
    ).toBeNull();
  });

  it('truncates a subject that would be cut off by an inbox anyway', () => {
    const draft = composeNewsletter({
      productName: 'RecipeFix',
      periodStart: new Date(),
      periodEnd: new Date(),
      posts: [{ ...POSTS[0]!, title: 'x'.repeat(120) }],
    });
    expect(draft!.subject.length).toBeLessThanOrEqual(68);
  });
});

describe('renderNewsletter', () => {
  it('produces both bodies, with an unsubscribe link in each', () => {
    const { html, text } = renderNewsletter('## Hi\n\nA [link](https://example.com).', {
      unsubscribeUrl: 'https://recipefix.app/u/abc',
      productName: 'RecipeFix',
    });
    expect(html).toContain('<h2');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('https://recipefix.app/u/abc');
    expect(text).toContain('Unsubscribe: https://recipefix.app/u/abc');
    expect(text).not.toContain('<h2');
  });

  it('escapes markup that arrives inside content', () => {
    const { html } = renderNewsletter('A <script>alert(1)</script> tag.', {
      unsubscribeUrl: 'https://example.com/u',
      productName: 'RecipeFix',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('sendNewsletter', () => {
  /**
   * These replaced a pair of tests that asserted BCC batching. The batching was
   * not wrong so much as incompatible with the thing it made impossible: one
   * body cannot carry a different unsubscribe link for each recipient, and an
   * unsubscribe link that is the same for everyone identifies nobody.
   */
  const recipients = [
    { email: 'a@example.com', unsubscribeUrl: 'https://recipefix.app/u/tok-a' },
    { email: 'b@example.com', unsubscribeUrl: 'https://recipefix.app/u/tok-b' },
  ];

  function recorder() {
    const calls: Array<Record<string, unknown>> = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ id: `resend-${calls.length}` }), { status: 200 });
    }) as unknown as typeof fetch;
    return { calls, fetchImpl };
  }

  it('sends one message per recipient, so no subscriber sees another', async () => {
    const { calls, fetchImpl } = recorder();
    const result = await sendNewsletter({
      subject: 'Issue 1',
      html: '<p>hi</p>',
      text: 'hi',
      recipients,
      from: 'RecipeFix <hello@recipefix.app>',
      apiKey: 're_test',
      fetchImpl,
    });

    expect(result.recipientCount).toBe(2);
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c.to)).toEqual(['a@example.com', 'b@example.com']);
    // The old design hid the list behind bcc. This one has no list to hide.
    expect(calls.every((c) => c.bcc === undefined)).toBe(true);
  });

  it('gives each recipient their own unsubscribe link, not a shared one', async () => {
    const { calls, fetchImpl } = recorder();
    await sendNewsletter({
      subject: 'Issue 1',
      html: `<p>hi</p><a href="https://recipefix.app/u/${UNSUBSCRIBE_PLACEHOLDER}">out</a>`,
      text: `hi\nUnsubscribe: https://recipefix.app/u/${UNSUBSCRIBE_PLACEHOLDER}`,
      recipients,
      from: 'hello@recipefix.app',
      apiKey: 're_test',
      fetchImpl,
    });

    expect(calls[0]!.html).toContain('/u/tok-a');
    expect(calls[1]!.html).toContain('/u/tok-b');
    expect(calls[0]!.html).not.toContain('tok-b');
    // The placeholder must never survive into a delivered message.
    expect(calls.every((c) => !String(c.html).includes(UNSUBSCRIBE_PLACEHOLDER))).toBe(true);
    expect(calls.every((c) => !String(c.text).includes(UNSUBSCRIBE_PLACEHOLDER))).toBe(true);
  });

  it('sets the one-click headers a mail client needs to show its own control', async () => {
    const { calls, fetchImpl } = recorder();
    await sendNewsletter({
      subject: 's', html: 'h', text: 't', recipients,
      from: 'hello@recipefix.app', apiKey: 're_test', fetchImpl,
    });
    const headers = calls[0]!.headers as Record<string, string>;
    expect(headers['List-Unsubscribe']).toBe('<https://recipefix.app/u/tok-a>');
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('refuses to mail a recipient it has no unsubscribe link for', async () => {
    const { calls, fetchImpl } = recorder();
    const result = await sendNewsletter({
      subject: 's', html: 'h', text: 't',
      recipients: [recipients[0]!, { email: 'c@example.com', unsubscribeUrl: '  ' }],
      from: 'hello@recipefix.app', apiKey: 're_test', fetchImpl,
    });
    // Not sent at all. A message with no way out is the one failure that cannot
    // be corrected afterwards.
    expect(calls.map((c) => c.to)).toEqual(['a@example.com']);
    expect(result.recipientCount).toBe(1);
    expect(result.failures).toEqual(['c@example.com: no unsubscribe URL']);
  });

  it('counts what was delivered, never what was attempted', async () => {
    let n = 0;
    const fetchImpl = (async () => {
      n++;
      return n === 1
        ? new Response(JSON.stringify({ message: 'bounced' }), { status: 422 })
        : new Response(JSON.stringify({ id: 'resend-2' }), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await sendNewsletter({
      subject: 's', html: 'h', text: 't', recipients,
      from: 'hello@recipefix.app', apiKey: 're_test', fetchImpl,
    });

    // One bad address must not cost every other subscriber their issue, and a
    // mostly-failed send must not report as a clean one.
    expect(result.recipientCount).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain('a@example.com');
  });

  it('explains an unverified sending domain rather than repeating the status code', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ message: 'domain not verified' }), {
        status: 403,
      })) as unknown as typeof fetch;

    await expect(
      sendNewsletter({
        subject: 's',
        html: 'h',
        text: 't',
        recipients: [{ email: 'a@example.com', unsubscribeUrl: 'https://x/u/t' }],
        from: 'hello@recipefix.app',
        apiKey: 're_test',
        fetchImpl,
      }),
    ).rejects.toThrow(/unverified sending domain/);
  });

  it('refuses to send to nobody', async () => {
    await expect(
      sendNewsletter({
        subject: 's',
        html: 'h',
        text: 't',
        recipients: [],
        from: 'hello@recipefix.app',
        apiKey: 're_test',
      }),
    ).rejects.toThrow(/No confirmed subscribers/);
  });
});

/**
 * The regression fixture.
 *
 * `extractQuotes` had a character class written with literal curly quotes that
 * had been normalised to straight ones somewhere between writing and saving. It
 * matched nothing, `runProofQC` reported "no quoted testimonial", and every
 * quoted testimonial passed the gate unexamined.
 *
 * The fixture lives on disk rather than inline precisely so no editor or
 * formatter touching this file can silently repeat that: the bytes are the
 * authority, and the first assertion checks the code points before anything
 * else runs.
 */
describe('extractQuotes against real curly quotes', () => {
  const fixture = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__/curlyQuotes.txt'),
    'utf8',
  );

  it('the fixture genuinely contains curly quotes, not straight ones', () => {
    // If this fails, the fixture was normalised and every test below is
    // testing nothing — exactly the bug being guarded against.
    expect(fixture).toContain('“');
    expect(fixture).toContain('”');
    expect(fixture).toContain('‟');
    expect(fixture).toContain('’');
  });

  it('extracts the curly-quoted review', () => {
    const quotes = extractQuotes(fixture);
    expect(quotes).toContain(
      'I have been baking gluten free for four years and this is the first app that told me why the vinegar matters.',
    );
  });

  it('extracts the straight-quoted copy of the same words exactly once', () => {
    const quotes = extractQuotes(fixture);
    const matching = quotes.filter((q) => q.startsWith('I have been baking gluten free'));
    // Both spellings appear in the fixture; deduplication collapses them.
    expect(matching).toHaveLength(1);
  });

  it('does not let an apostrophe terminate a quotation', () => {
    const quotes = extractQuotes(fixture);
    expect(quotes).toContain('It saved my daughter’s birthday cake and I am not exaggerating.');
  });

  it('handles the reversed-9 opener some exports produce', () => {
    const quotes = extractQuotes(fixture);
    expect(quotes).toContain('The bread actually held together for the very first time.');
  });

  it('still ignores a short quoted term', () => {
    expect(extractQuotes(fixture).some((q) => q.includes('1:1 blend'))).toBe(false);
  });

  it('verifies a curly-quoted testimonial against its stored row', () => {
    const result = runProofQC({
      body: fixture,
      attached: [REVIEW],
    });
    // The fixture contains quotes that are not in REVIEW, so this must fail —
    // what matters is that it examined them rather than reporting nothing found.
    expect(result.verified + result.findings.length).toBeGreaterThan(0);
  });
});
