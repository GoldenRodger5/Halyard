import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCopyGate, forbiddenMatches, numbersIn } from './copyGate.js';
import {
  assembleBrief,
  isQuotable,
  KnowledgePackError,
  loadKnowledgePack,
  productPostsPaused,
  quotableClaims,
  validateClaims,
} from './knowledge.js';
import { Ledger, SpendCapError } from './ledger.js';

/** A fresh pack directory per test (fixtures are never shared by reference). */
function makePack(overrides: { claims?: string; state?: string } = {}): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'mk-pack-'));
  writeFileSync(
    path.join(dir, 'claims.yaml'),
    overrides.claims ??
      `version: 1
verified_against: { web_commit: abc1234, mcp_build: b1, ios_version: "2.5.5", verified_at: 2026-10-26 }
claims:
  - id: core.rewrites_steps
    status: live_receipt
    phrasing: "It rewrites the cooking steps, not just the ingredient list."
  - id: price.plus
    status: live
    phrasing: "Plus is $3.99/month or $27.99/year."
  - id: loop.create
    status: implemented
    phrasing: "When nothing online fits, RecipeFix writes one."
  - id: core.reasons
    status: live
    needs_review: true
    phrasing: "Every change comes with its reason."
  - id: no.tested_originals
    status: forbidden
    examples: ["tested", "test kitchen"]
  - id: no.diet_count
    status: forbidden
    examples: ["15 diets"]
`,
  );
  writeFileSync(path.join(dir, 'product.md'), '# P\n\n## 1. One line\nOne.\n\n## 2. Why\nTwo.\n\n## 3. Audiences\nThree.\n\n## 4. Competition\nFour.\n');
  writeFileSync(path.join(dir, 'brand.md'), '# B\n\n## 1. Voice\nPlain.\n\n## 2. Visual\nCream.\n\n## 3. Editorial rules\nTeach.\n');
  writeFileSync(path.join(dir, 'learnings.md'), '# L\n\n## 2026-10-26 — newest\nA\n\n## 2026-10-20 — older\nB\n');
  writeFileSync(path.join(dir, 'state.json'), overrides.state ?? '{"schema":1,"verified_web_commit":"abc1234"}');
  return dir;
}

describe('knowledge pack', () => {
  it('quotes exactly live and live_receipt claims, and not one awaiting review', () => {
    const pack = loadKnowledgePack({ kind: 'dir', dir: makePack() });
    // Named literally, not read out of QUOTABLE_STATUSES (RecipeFix gotcha 14a).
    expect(quotableClaims(pack).map((c) => c.id)).toEqual(['core.rewrites_steps', 'price.plus']);
    expect(isQuotable(pack.claims.find((c) => c.id === 'loop.create'))).toBe(false);
    expect(isQuotable(pack.claims.find((c) => c.id === 'core.reasons'))).toBe(false);
  });

  it('refuses an invalid register instead of loading what it can', () => {
    const problems = validateClaims({
      version: 1,
      claims: [
        { id: 'a', status: 'live' },
        { id: 'a', status: 'shipped', phrasing: 'x' },
        { id: 'f', status: 'forbidden' },
        { id: 's', status: 'superseded' },
      ],
    });
    expect(problems).toEqual([
      'claim a: a quotable claim needs phrasing',
      'claim a: duplicate id',
      "claim a: unknown status 'shipped'",
      'claim f: forbidden claims need examples (the copy gate matches them)',
      'claim s: superseded claims need superseded_at and reason',
    ]);
    expect(() => loadKnowledgePack({ kind: 'dir', dir: makePack({ claims: 'version: 2\nclaims: []\n' }) })).toThrow(KnowledgePackError);
  });

  it('assembles the brief deterministically, in the README §2 order', () => {
    const dir = makePack();
    const a = assembleBrief(loadKnowledgePack({ kind: 'dir', dir }));
    const b = assembleBrief(loadKnowledgePack({ kind: 'dir', dir }));
    expect(a).toBe(b);
    expect(a.startsWith('Verified against web abc1234')).toBe(true);
    expect(a).toContain('- core.rewrites_steps: It rewrites the cooking steps');
    expect(a).not.toContain('loop.create:'); // implemented, not quotable
    expect(a).toContain('- no.tested_originals: "tested", "test kitchen"');
    expect(a.indexOf('## 1. Voice')).toBeLessThan(a.indexOf('## 3. Editorial rules'));
    expect(a).not.toContain('## 2. Visual'); // brand §2 is not in the brief
    expect(a).not.toContain('## 4. Competition');
    expect(a.indexOf('newest')).toBeLessThan(a.indexOf('older'));
  });

  it('pauses product posts while the live deploy has no receipt', () => {
    expect(productPostsPaused(loadKnowledgePack({ kind: 'dir', dir: makePack() }))).toBeNull();
    const paused = loadKnowledgePack({
      kind: 'dir',
      dir: makePack({ state: '{"unreceipted_deploy":{"seen_at":"2026-10-26T19:04Z","note":"no receipt"}}' }),
    });
    expect(productPostsPaused(paused)).toContain('no receipt');
  });
});

describe('copy gate', () => {
  const base = () => ({
    pack: loadKnowledgePack({ kind: 'dir', dir: makePack() }),
    proofText: 'broil one sheet at a time for 8 to 10 minutes; 4 → 6 servings',
    factSources: [{ id: 'arith', statement: '6 / 4 = 1.5, so 50% more', source: 'arithmetic' }],
    productTerms: ['RecipeFix'],
  });

  it('passes a line whose product statement cites a quotable claim and whose numbers trace', () => {
    const r = runCopyGate({
      ...base(),
      lines: [
        { where: 'slide 1', text: 'Two sheets. 8 to 10 minutes each.' },
        { where: 'slide 7', text: 'RecipeFix rewrote the steps.', claimIds: ['core.rewrites_steps'] },
        { where: 'slide 3', text: '50% more chicken is not 50% more time.', factIds: ['arith'] },
      ],
    });
    expect(r.checks.filter((c) => !c.passed)).toEqual([]);
  });

  it('fails each defect it exists for', () => {
    const r = runCopyGate({
      ...base(),
      lines: [
        { where: 'a', text: 'RecipeFix writes new recipes.' }, // product, no claim
        { where: 'b', text: 'Works great.', claimIds: ['loop.create'] }, // not quotable
        { where: 'c', text: 'Broil for 12 minutes.' }, // untraced number
        { where: 'd', text: 'Every Original is tested.' }, // forbidden
        { where: 'e', text: 'Four people asked us about this.' }, // narrative
        { where: 'f', text: 'No gluten-free)? [object Object]' }, // the Halyard X-card bug
      ],
    });
    const failed = Object.fromEntries(r.checks.map((c) => [c.id, c.problems]));
    expect(r.passed).toBe(false);
    expect(failed['claims.correspondence']).toEqual([
      'a: product statement without a quotable claim id: "RecipeFix writes new recipes."',
      "b: cites 'loop.create' whose status 'implemented' is not quotable",
    ]);
    expect(failed['facts.numbers_traced']).toEqual(['c: number "12" is in no proof, cited claim or fact source']);
    expect(failed['claims.forbidden']).toEqual(['d: matches forbidden no.tested_originals example "tested"']);
    expect(failed['claims.narrative']).toHaveLength(1);
    expect(failed['copy.on_screen_typography']).toEqual(['f: "No gluten-free)? [object Object]"']);
  });

  it('matches forbidden examples as words, not substrings', () => {
    expect(forbiddenMatches('Every recipe is tested.', 'tested')).toBe(true);
    expect(forbiddenMatches('Untested, AI-written recipe.', 'tested')).toBe(false);
    expect(forbiddenMatches('Over 15 diets supported', '15 diets')).toBe(true);
    expect(numbersIn('1½ lb, 3/4 cup, 165°F, 4 → 6')).toEqual(['1½', '3/4', '165', '4', '6']);
  });
});

describe('spend ledger', () => {
  it('refuses a call that would cross the cap, before it is made', () => {
    const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'mk-ledger-')), 'ledger.jsonl');
    const ledger = new Ledger(file, 1);
    ledger.record({ run: 'r', provider: 'openai', model: 'm', purpose: 'p', units: {}, usd: 0.9, basis: 'test' });
    expect(ledger.spent()).toBeCloseTo(0.9);
    expect(() => ledger.assertCanSpend(0.2)).toThrow(SpendCapError);
    expect(() => ledger.assertCanSpend(0.05)).not.toThrow();
  });
});
