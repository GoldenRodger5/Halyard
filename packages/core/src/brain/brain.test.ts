/**
 * The Product Brain, tested where it matters: at the boundary between what a
 * model says and what Halyard believes.
 *
 * The single most important test in this file is `refuses a status supplied by
 * the model`. Everything else in the Brain is arrangement; that one is the
 * property the design exists to hold.
 */
import { describe, expect, it } from 'vitest';
import {
  CORROBORATION_REQUIRED,
  FACT_CATEGORIES,
  UNVERIFIABLE_CATEGORIES,
  canStatePublicly,
  computeConfidence,
  deriveFactStatus,
  findContradictions,
  independentSources,
  sameValue,
  type EvidenceRef,
  type FactCategory,
  type StoredFact,
} from './model.js';
import {
  documentTitle,
  hashContent,
  metaContent,
  sameOriginLinks,
  visibleText,
  collectWebEvidence,
  collectAppStoreEvidence,
  collectConnectorSurface,
  collectBriefEvidence,
} from './collect.js';
import {
  MAX_VALUE_CHARS,
  parseProposals,
  buildProposalPrompt,
  discoverProductFacts,
  explainContradiction,
  PRODUCT_DISCOVERY_CATEGORIES,
  REACHABLE_CATEGORIES,
} from './agents.js';
import { planFactWrites, type AttributedProposal } from './plan.js';
import type { LlmClient } from '../generation/llm.js';

const DAY = 86_400_000;

function evidence(overrides: Partial<EvidenceRef> & { id: string }): EvidenceRef {
  return {
    kind: 'web_page',
    sourceUrl: `https://example.test/${overrides.id}`,
    collectedAt: new Date(),
    ...overrides,
  };
}

function stubLlm(text: string): LlmClient {
  return {
    complete: async () => ({ text, costUsd: 0.001, inputTokens: 10, outputTokens: 10 }),
  } as unknown as LlmClient;
}

// ── The boundary ───────────────────────────────────────────────────────────

describe('a model cannot decide anything', () => {
  it('refuses a status supplied by the model', () => {
    /**
     * The property the whole design rests on. A reply that confidently claims
     * its own verification must lose that claim on the way in — not be trusted
     * and then corrected, because a field that is read and overridden is one
     * refactor away from being read and kept.
     */
    const { accepted } = parseProposals(
      {
        facts: [
          {
            category: 'identity',
            key: 'what_it_is',
            value: 'A recipe adapter',
            status: 'verified',
            confidence: 0.99,
            verified: true,
            sources: ['everywhere'],
          },
        ],
      },
      PRODUCT_DISCOVERY_CATEGORIES,
    );

    expect(accepted).toHaveLength(1);
    const fact = accepted[0]! as unknown as Record<string, unknown>;
    expect(fact.status).toBeUndefined();
    expect(fact.confidence).toBeUndefined();
    expect(fact.verified).toBeUndefined();
    expect(fact.sources).toBeUndefined();
    // Only the four proposal fields survive.
    expect(Object.keys(fact).sort()).toEqual(['category', 'detail', 'key', 'value']);
  });

  it('gives deriveFactStatus no parameter a proposal could reach', () => {
    // Mirrors the same assertion about `deriveState` in the agent capability
    // model: the absence of the parameter is the guarantee.
    const one = [evidence({ id: 'a' })];
    expect(deriveFactStatus({ category: 'identity', evidence: one })).toBe('unverified');
    expect(
      deriveFactStatus({ category: 'identity', evidence: [...one, evidence({ id: 'b' })] }),
    ).toBe('verified');
  });

  it('tells the model its assessments are discarded', () => {
    const prompt = buildProposalPrompt({
      productName: 'Test',
      role: 'testing',
      guidance: 'guidance',
      categories: PRODUCT_DISCOVERY_CATEGORIES,
      evidence: [{ id: 'e1', kind: 'web_page', sourceUrl: null, title: null, body: 'body' }],
    });
    expect(prompt).toMatch(/anything you\s+supply for them is discarded/);
  });
});

// ── Verification ───────────────────────────────────────────────────────────

describe('verification requires corroboration', () => {
  it('never verifies on one source', () => {
    expect(deriveFactStatus({ category: 'pricing', evidence: [evidence({ id: 'a' })] })).toBe(
      'unverified',
    );
  });

  it('verifies on two distinct sources', () => {
    const status = deriveFactStatus({
      category: 'pricing',
      evidence: [evidence({ id: 'a' }), evidence({ id: 'b' })],
    });
    expect(status).toBe('verified');
    expect(CORROBORATION_REQUIRED).toBe(2);
  });

  it('does not treat one page seen twice as two sources', () => {
    /**
     * The failure this guards is a nightly collector corroborating every fact
     * with itself. Independence is counted by source, not by row.
     */
    const twice = [
      evidence({ id: 'a', sourceUrl: 'https://example.test/pricing' }),
      evidence({ id: 'b', sourceUrl: 'https://example.test/pricing' }),
    ];
    expect(independentSources(twice)).toBe(1);
    expect(deriveFactStatus({ category: 'pricing', evidence: twice })).toBe('unverified');
  });

  it('marks categories corroboration cannot settle as unverifiable', () => {
    for (const category of UNVERIFIABLE_CATEGORIES) {
      const status = deriveFactStatus({
        category,
        evidence: [evidence({ id: 'a' }), evidence({ id: 'b' }), evidence({ id: 'c' })],
      });
      expect(status, category).toBe('unverifiable');
    }
  });

  it('lets a refutation outrank any amount of agreement', () => {
    const status = deriveFactStatus({
      category: 'pricing',
      evidence: [evidence({ id: 'a' }), evidence({ id: 'b' }), evidence({ id: 'c' })],
      refutedBy: [evidence({ id: 'r' })],
    });
    expect(status).toBe('refuted');
  });
});

describe('confidence is measured, not asserted', () => {
  it('rises with independent sources and stops rising', () => {
    const at = (n: number) =>
      computeConfidence({
        category: 'pricing',
        evidence: Array.from({ length: n }, (_, i) => evidence({ id: `s${i}` })),
      });

    expect(at(1)).toBeLessThan(at(2));
    expect(at(2)).toBeLessThan(at(3));
    // A fourth agreeing page is not meaningfully more convincing than a third.
    expect(at(4)).toBe(at(3));
  });

  it('is zero with no evidence', () => {
    expect(computeConfidence({ category: 'pricing', evidence: [] })).toBe(0);
  });

  it('falls when the evidence has gone stale', () => {
    const now = new Date('2026-08-17T00:00:00Z');
    const old = new Date(now.getTime() - 30 * DAY);

    const fresh = computeConfidence({
      category: 'pricing',
      evidence: [evidence({ id: 'a' }), evidence({ id: 'b' })],
      now,
    });
    const stale = computeConfidence({
      category: 'pricing',
      evidence: [evidence({ id: 'a', collectedAt: old }), evidence({ id: 'b', collectedAt: old })],
      now,
    });

    expect(stale).toBeLessThan(fresh);
  });

  it('caps categories nothing can corroborate', () => {
    // Otherwise a mission repeated on three pages would outscore a verified
    // price — the site's consistency masquerading as the world's agreement.
    const mission = computeConfidence({
      category: 'mission',
      evidence: [evidence({ id: 'a' }), evidence({ id: 'b' }), evidence({ id: 'c' })],
    });
    expect(mission).toBeLessThanOrEqual(0.5);
  });

  it('never leaves the unit interval', () => {
    const many = Array.from({ length: 40 }, (_, i) => evidence({ id: `s${i}` }));
    const score = computeConfidence({ category: 'pricing', evidence: many });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe('what may be said in public', () => {
  it('allows a fresh verified fact', () => {
    expect(canStatePublicly({ status: 'verified', lastVerifiedAt: new Date() })).toBe(true);
  });

  it('refuses a verified fact that has gone stale', () => {
    const now = new Date('2026-08-17T00:00:00Z');
    expect(
      canStatePublicly({ status: 'verified', lastVerifiedAt: new Date(now.getTime() - 30 * DAY) }, now),
    ).toBe(false);
  });

  it('refuses unverified, unverifiable and refuted alike', () => {
    for (const status of ['unverified', 'unverifiable', 'refuted'] as const) {
      expect(canStatePublicly({ status, lastVerifiedAt: new Date() }), status).toBe(false);
    }
  });
});

// ── Contradictions ─────────────────────────────────────────────────────────

describe('contradictions are found by code', () => {
  const fact = (over: Partial<StoredFact> & { id: string; value: string }): StoredFact => ({
    category: 'pricing',
    key: 'monthly_price',
    status: 'unverified',
    confidence: 0.25,
    lastVerifiedAt: null,
    agentId: 'product-discovery',
    ...over,
  });

  it('finds two values in one slot', () => {
    const found = findContradictions([
      fact({ id: '1', value: '$5 a month' }),
      fact({ id: '2', value: '$9 a month', agentId: 'store-listing' }),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]!.why).toContain('$5 a month');
    expect(found[0]!.why).toContain('$9 a month');
  });

  it('does not report a slot that agrees with itself', () => {
    expect(
      findContradictions([
        fact({ id: '1', value: '$5 a month' }),
        fact({ id: '2', value: '$5 a month.', agentId: 'store-listing' }),
      ]),
    ).toEqual([]);
  });

  it('does not report different slots', () => {
    expect(
      findContradictions([
        fact({ id: '1', value: '$5 a month' }),
        fact({ id: '2', key: 'annual_price', value: '$50 a year' }),
      ]),
    ).toEqual([]);
  });

  it('leaves the reconciler no way to decide a winner', async () => {
    /**
     * The reconciler returns prose and nothing else. If it ever returned a
     * structured verdict, something downstream would eventually act on it —
     * and a model would be deciding which product fact is true.
     */
    const result = await explainContradiction(
      {
        category: 'pricing',
        key: 'monthly_price',
        left: { value: '$5', source: 'web', agentId: 'product-discovery' },
        right: { value: '$9', source: 'store', agentId: 'store-listing' },
      },
      stubLlm('The website may be showing a promotional price.'),
    );

    expect(result.explanation).toBe('The website may be showing a promotional price.');
    expect(Object.keys(result).sort()).toEqual(['costUsd', 'explanation']);
  });
});

// ── Proposal validation ────────────────────────────────────────────────────

describe('proposals are validated before they can become facts', () => {
  it('refuses a category outside the agent remit', () => {
    const { accepted, rejected } = parseProposals(
      { facts: [{ category: 'visual_identity', key: 'palette', value: 'warm' }] },
      PRODUCT_DISCOVERY_CATEGORIES,
    );
    expect(accepted).toEqual([]);
    expect(rejected[0]!.reason).toContain("outside this agent's remit");
  });

  it('refuses a category that does not exist', () => {
    const { rejected } = parseProposals(
      { facts: [{ category: 'vibes', key: 'x', value: 'y' }] },
      PRODUCT_DISCOVERY_CATEGORIES,
    );
    expect(rejected[0]!.reason).toContain('not a fact category');
  });

  it('refuses a paragraph pretending to be a fact', () => {
    const { rejected } = parseProposals(
      {
        facts: [
          { category: 'identity', key: 'what', value: 'x'.repeat(MAX_VALUE_CHARS + 1) },
        ],
      },
      PRODUCT_DISCOVERY_CATEGORIES,
    );
    expect(rejected[0]!.reason).toContain('not a paragraph');
  });

  it('refuses an empty value, which reads as knowledge and carries none', () => {
    const { rejected } = parseProposals(
      { facts: [{ category: 'identity', key: 'what', value: '   ' }] },
      PRODUCT_DISCOVERY_CATEGORIES,
    );
    expect(rejected[0]!.reason).toContain('empty fact');
  });

  it('normalises keys so the same slot collides rather than accumulating', () => {
    const { accepted } = parseProposals(
      { facts: [{ category: 'identity', key: 'What It Is!', value: 'A recipe adapter' }] },
      PRODUCT_DISCOVERY_CATEGORIES,
    );
    expect(accepted[0]!.key).toBe('what_it_is_');
  });

  it('reports a malformed reply rather than throwing', () => {
    const { accepted, rejected } = parseProposals({ nope: true }, PRODUCT_DISCOVERY_CATEGORIES);
    expect(accepted).toEqual([]);
    expect(rejected[0]!.reason).toContain('No facts array');
  });

  it('survives a reply that is not JSON at all', async () => {
    const result = await discoverProductFacts(
      { productName: 'Test', evidence: [] },
      stubLlm('I am afraid I cannot help with that.'),
    );
    expect(result.accepted).toEqual([]);
    expect(result.rejected[0]!.reason).toContain('Not valid JSON');
  });
});

// ── Planning ───────────────────────────────────────────────────────────────

describe('planning turns proposals into rows', () => {
  const proposal = (over: Partial<AttributedProposal>): AttributedProposal => ({
    category: 'identity',
    key: 'what_it_is',
    value: 'A recipe adapter',
    detail: null,
    agentId: 'product-discovery',
    agentVersion: '1.0',
    promptVersion: 'product_discovery.v1',
    evidenceIds: ['e1'],
    ...over,
  });

  const evidenceById = new Map<string, EvidenceRef>([
    ['e1', evidence({ id: 'e1', sourceUrl: 'https://example.test/one' })],
    ['e2', evidence({ id: 'e2', sourceUrl: 'https://example.test/two' })],
  ]);

  it('verifies a fact two agents found in different evidence', () => {
    const writes = planFactWrites({
      proposals: [
        proposal({ evidenceIds: ['e1'] }),
        proposal({ agentId: 'store-listing', evidenceIds: ['e2'] }),
      ],
      evidenceById,
    });

    expect(writes).toHaveLength(1);
    expect(writes[0]!.status).toBe('verified');
    expect(writes[0]!.sourceCount).toBe(2);
    expect(writes[0]!.lastVerifiedAt).not.toBeNull();
  });

  it('does not verify a fact two agents found in the same evidence', () => {
    // Two readers reading one page is one observation, not two.
    const writes = planFactWrites({
      proposals: [proposal({ evidenceIds: ['e1'] }), proposal({ agentId: 'store-listing', evidenceIds: ['e1'] })],
      evidenceById,
    });

    expect(writes).toHaveLength(1);
    expect(writes[0]!.status).toBe('unverified');
    expect(writes[0]!.sourceCount).toBe(1);
  });

  it('keeps disagreeing values apart rather than merging them', () => {
    const writes = planFactWrites({
      proposals: [
        proposal({ value: '$5 a month', category: 'pricing', key: 'price', evidenceIds: ['e1'] }),
        proposal({ value: '$9 a month', category: 'pricing', key: 'price', evidenceIds: ['e2'] }),
      ],
      evidenceById,
    });

    // Two rows, so the contradiction pass can see them. Merging would hide it.
    expect(writes).toHaveLength(2);
    expect(writes.every((w) => w.status === 'unverified')).toBe(true);
  });

  it('stamps no verification time on an unverified fact', () => {
    /**
     * Stamping `now` regardless would make an unverified fact look freshly
     * checked, and `isStale` would then report it healthy for a fortnight on
     * the strength of never having been confirmed.
     */
    const writes = planFactWrites({ proposals: [proposal({})], evidenceById });
    expect(writes[0]!.status).toBe('unverified');
    expect(writes[0]!.lastVerifiedAt).toBeNull();
  });

  it('treats trivially different spellings as the same value', () => {
    expect(sameValue('A recipe adapter', '  a recipe adapter.  ')).toBe(true);
    expect(sameValue('$5 a month', '$9 a month')).toBe(false);
  });
});

// ── Collection ─────────────────────────────────────────────────────────────

describe('collection observes and does not interpret', () => {
  const html = `<!doctype html><html><head>
    <title>RecipeFix · Adapt any recipe</title>
    <meta name="description" content="Adapt any recipe to how you eat.">
    <meta property="og:title" content="RecipeFix">
    <script>var csp = "default-src 'self'";</script>
    <style>.a{color:red}</style>
  </head><body>
    <h1>Adapt any recipe</h1>
    <a href="/pricing">Pricing</a>
    <a href="https://twitter.com/x">Twitter</a>
    <!-- a comment -->
  </body></html>`;

  it('reads the metadata a single-page app puts in its shell', () => {
    expect(documentTitle(html)).toBe('RecipeFix · Adapt any recipe');
    expect(metaContent(html, 'description')).toBe('Adapt any recipe to how you eat.');
    expect(metaContent(html, 'og:title')).toBe('RecipeFix');
    expect(metaContent(html, 'absent')).toBeNull();
  });

  it('removes script and style content rather than just their tags', () => {
    const text = visibleText(html);
    expect(text).toContain('Adapt any recipe');
    // A CSP string is not something a product says about itself, and leaving it
    // in would let a model "find" a fact in a config blob.
    expect(text).not.toContain('default-src');
    expect(text).not.toContain('color:red');
    expect(text).not.toContain('a comment');
  });

  it('stays inside the product when following links', () => {
    const links = sameOriginLinks(html, 'https://recipefix.app/');
    expect(links).toContain('https://recipefix.app/pricing');
    expect(links.some((l) => l.includes('twitter'))).toBe(false);
  });

  it('hashes content so re-collection is idempotent', () => {
    expect(hashContent('a', 'b')).toBe(hashContent('a', 'b'));
    expect(hashContent('a', 'b')).not.toBe(hashContent('a', 'c'));
  });

  it('crawls to the page limit and no further', async () => {
    const fetchImpl = async (url: string) => ({
      ok: true,
      status: 200,
      text: async () =>
        `<html><head><title>${url}</title></head><body>` +
        Array.from({ length: 20 }, (_, i) => `<a href="/p${i}">p${i}</a>`).join('') +
        `</body></html>`,
    });

    const collected = await collectWebEvidence({
      rootUrl: 'https://example.test/',
      maxPages: 3,
      fetchImpl,
    });
    expect(collected).toHaveLength(3);
    expect(collected.every((e) => e.kind === 'web_page')).toBe(true);
  });

  it('keeps the pages that responded when one fails', async () => {
    let call = 0;
    const fetchImpl = async (url: string) => {
      call += 1;
      if (call === 2) throw new Error('connection reset');
      return {
        ok: true,
        status: 200,
        text: async () => `<html><body><a href="/next">n</a>${url}</body></html>`,
      };
    };

    const collected = await collectWebEvidence({
      rootUrl: 'https://example.test/',
      maxPages: 3,
      fetchImpl,
    });
    // One broken link must not cost the whole run.
    expect(collected.length).toBeGreaterThan(0);
  });

  it('reads an App Store listing without credentials', async () => {
    const listing = `<html><head><title>RecipeFix on the App Store</title>
      <script type="application/ld+json">{"@type":"SoftwareApplication","name":"RecipeFix"}</script>
      </head><body>Adapt any recipe</body></html>`;

    const collected = await collectAppStoreEvidence({
      listingUrl: 'https://apps.apple.com/app/id1',
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => listing }),
    });

    expect(collected).toHaveLength(1);
    expect(collected[0]!.kind).toBe('app_store_listing');
    expect((collected[0]!.meta.structured as { name: string }).name).toBe('RecipeFix');
  });

  it('still collects a listing whose structured block is missing', async () => {
    const collected = await collectAppStoreEvidence({
      listingUrl: 'https://apps.apple.com/app/id1',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => '<html><body>Just text</body></html>',
      }),
    });
    // Reporting "no listing" for a listing that plainly exists would be worse
    // than reporting it without its optional metadata.
    expect(collected).toHaveLength(1);
    expect(collected[0]!.meta.structured).toBeNull();
  });

  it('records the API surface a product advertises', async () => {
    const collected = await collectConnectorSurface({
      connectorId: 'recipefix',
      listTools: async () => [
        { name: 'adapt_recipe', description: 'Adapt a recipe' },
        { name: 'save_recipe' },
      ],
    });

    expect(collected[0]!.kind).toBe('connector_surface');
    expect(collected[0]!.body).toContain('adapt_recipe: Adapt a recipe');
    expect(collected[0]!.meta.toolCount).toBe(2);
  });

  it('reports nothing rather than failing when the connector is down', async () => {
    const collected = await collectConnectorSurface({
      connectorId: 'recipefix',
      listTools: async () => {
        throw new Error('unreachable');
      },
    });
    expect(collected).toEqual([]);
  });

  it('treats the operator brief as evidence rather than ground truth', () => {
    const collected = collectBriefEvidence({ productId: 'p', briefMarkdown: '# Brief\nSomething.' });
    expect(collected[0]!.kind).toBe('operator_brief');
    // Holding it to the same corroboration rule is what lets the Brain report
    // that the brief and the site disagree.
    expect(collected[0]!.collector).toBe('brief');
  });

  it('collects nothing from an empty brief', () => {
    expect(collectBriefEvidence({ productId: 'p', briefMarkdown: '   ' })).toEqual([]);
    expect(collectBriefEvidence({ productId: 'p', briefMarkdown: null })).toEqual([]);
  });
});

// ── The Brain's own shape ──────────────────────────────────────────────────

describe('the category model', () => {
  it('does not restate features, which feature_claims owns', () => {
    // Two tables answering "what does this product do" would drift, and the
    // weaker verification would win by being easier to write to.
    expect(FACT_CATEGORIES).not.toContain('features' as FactCategory);
  });

  it('does not hold prohibited claims, which are an instruction not an observation', () => {
    // They live in products.content_rules and are enforced by the slop filter.
    // A category a model proposes into is the worst home for a safety list.
    expect(FACT_CATEGORIES).not.toContain('prohibited_claims' as FactCategory);
  });

  it('can fill every category it offers', () => {
    /**
     * The Brain UI renders a page for every category in `FACT_CATEGORIES`. One
     * with no producing agent is a promise nothing can keep — the same phantom
     * the Auditor reports as `brain.category_unreachable`, asserted here so it
     * fails in CI rather than only in an audit run.
     */
    const unreachable = FACT_CATEGORIES.filter((c) => !REACHABLE_CATEGORIES.has(c));
    expect(unreachable).toEqual([]);
  });
});
