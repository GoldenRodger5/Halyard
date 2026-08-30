/**
 * Build the Product Brain from stored evidence.
 *
 * Five agents propose; then code decides. The ordering in this file is the
 * architecture in miniature:
 *
 *   1. read evidence            — observed, already stored, never re-fetched
 *   2. agents propose facts     — the only model calls in the whole flow
 *   3. `planFactWrites` decides — status and confidence, from evidence alone
 *   4. persist                  — with provenance
 *   5. `findContradictions`     — code finds them
 *   6. reconciler explains      — prose about a conflict code already located
 *   7. stamp consumption        — proof the output was actually used
 *
 * Step 7 matters more than it looks. `markOutputConsumed` had **no production
 * caller** before this phase, which meant no agent could reach
 * `implemented_exercised` however often it ran: `deriveState` requires consumed
 * output, and nothing was stamping it. An agent OS that cannot observe
 * consumption reports every working agent as partial forever.
 */
import {
  inferProductFacts,
  discoverImplementationFacts,
  discoverListingFacts,
  discoverProductFacts,
  discoverVisualFacts,
  explainContradiction,
  findContradictions,
  planFactWrites,
  createLlmClient,
  type AttributedProposal,
  type EvidenceForPrompt,
  type EvidenceKind,
  type EvidenceRef,
  type FactCategory,
  type StoredFact,
  type ProposalResult,
  selectEvidence,
} from '@halyard/core';
import type { LlmClient } from '@halyard/core';
import type { HandlerContext, Job } from '../poller.js';
import { markOutputConsumed, recordingClient } from '../agentRuns.js';

interface EvidenceRow {
  id: string;
  kind: EvidenceKind;
  source_url: string | null;
  title: string | null;
  body: string;
  collected_at: Date;
}

/** How much evidence one agent is shown. Enough to reason over, not a corpus. */
const MAX_EVIDENCE_PER_AGENT = 6;

function toPrompt(rows: EvidenceRow[]): EvidenceForPrompt[] {
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    sourceUrl: r.source_url,
    title: r.title,
    body: r.body,
  }));
}

function attribute(
  result: ProposalResult,
  agent: { agentId: string; agentVersion: string; promptVersion: string },
  evidence: EvidenceForPrompt[],
): AttributedProposal[] {
  return result.accepted.map((fact) => ({
    ...fact,
    agentId: agent.agentId,
    agentVersion: agent.agentVersion,
    promptVersion: agent.promptVersion,
    evidenceIds: evidence.map((e) => e.id),
  }));
}

/**
 * An explicit seam for the model client.
 *
 * Present so the handler can be driven end to end in a test with a scripted
 * model — proposal through decision through persistence through consumption
 * stamp. Without it the only testable assertion would be "no API key, so
 * nothing was written", which asserts the absence of a credential rather than
 * the presence of the behaviour.
 *
 * Production never passes it; the default wraps the real client in the
 * recorder, so a run is attributed whether or not a test is driving it.
 */
export interface BuildBrainDeps {
  llm?: LlmClient;
}

export async function buildBrainHandler(
  job: Job,
  ctx: HandlerContext,
  deps: BuildBrainDeps = {},
): Promise<void> {
  const productId = String(job.payload.productId ?? '');
  if (!productId) throw new Error('build_product_brain job has no productId');

  const { rows: productRows } = await ctx.pool.query<{ id: string; name: string }>(
    'select id, name from products where id = $1',
    [productId],
  );
  const product = productRows[0];
  if (!product) throw new Error(`product ${productId} not found`);

  /**
   * Only current evidence. A superseded row is kept for the facts that already
   * cite it, but reasoning over a page that has since changed would produce a
   * fact about a page that no longer exists.
   */
  const { rows: evidence } = await ctx.pool.query<EvidenceRow>(
    `select id, kind, source_url, title, body, collected_at
       from product_evidence
      where product_id = $1 and superseded_by is null
      order by collected_at desc`,
    [productId],
  );

  if (evidence.length === 0) {
    // Correct outcome, not a failure. A Brain with no evidence is a Brain with
    // no facts, and inventing some is the one thing this must never do.
    ctx.log('no evidence to reason over', { productId });
    return;
  }

  /**
   * §322. Chosen by what is in them, not by when they were fetched.
   *
   * This was `.slice(0, MAX_EVIDENCE_PER_AGENT)` over a `collected_at desc`
   * ordering, so with eight pages and six slots two were dropped for a reason
   * unrelated to their contents. Kinolog's `/pricing` — 6,027 characters of
   * plans and limits — lost to a 326-character login form and a landing page
   * that had already been counted twice under two URLs.
   *
   * The reasons are logged, so "why did it not know the price" has an answer.
   */
  const byKind = (kind: EvidenceKind): EvidenceForPrompt[] => {
    const chosen = selectEvidence(
      evidence
        .filter((e) => e.kind === kind)
        .map((e) => ({
          id: e.id,
          sourceUrl: e.source_url,
          title: e.title,
          body: e.body,
          collectedAt: new Date(e.collected_at),
        })),
      MAX_EVIDENCE_PER_AGENT,
    );
    if (chosen.length > 0) {
      ctx.log('evidence chosen', {
        kind,
        pages: chosen.map((c) => `${c.candidate.sourceUrl} (${c.why})`),
      });
    }
    return toPrompt(
      chosen.map(
        (c) =>
          evidence.find((e) => e.id === c.candidate.id) as EvidenceRow,
      ),
    );
  };

  const llm: LlmClient =
    deps.llm ??
    recordingClient(ctx.pool, createLlmClient(), { trigger: 'job', triggerRef: job.id });

  const proposals: AttributedProposal[] = [];
  const skipped: string[] = [];
  let cost = 0;

  /**
   * Each agent runs only when its evidence exists.
   *
   * A skipped agent is logged by name. Running one on an empty evidence set
   * would ask a model to describe a design language it has not been shown,
   * which is precisely how fluent invention enters a fact table.
   */
  const web = [...byKind('web_page'), ...byKind('operator_brief')];
  if (web.length > 0) {
    const result = await discoverProductFacts({ productName: product.name, evidence: web }, llm);
    cost += result.costUsd;
    proposals.push(
      ...attribute(
        result,
        { agentId: 'product-discovery', agentVersion: '1.0', promptVersion: 'product_discovery.v1' },
        web,
      ),
    );
  } else {
    skipped.push('product-discovery (no web evidence)');
  }

  const listing = byKind('app_store_listing');
  if (listing.length > 0) {
    const result = await discoverListingFacts(
      { productName: product.name, evidence: listing },
      llm,
    );
    cost += result.costUsd;
    proposals.push(
      ...attribute(
        result,
        { agentId: 'store-listing', agentVersion: '1.0', promptVersion: 'store_listing.v1' },
        listing,
      ),
    );
  } else {
    skipped.push('store-listing (no listing evidence)');
  }

  const surface = byKind('connector_surface');
  if (surface.length > 0) {
    const result = await discoverImplementationFacts(
      { productName: product.name, evidence: surface },
      llm,
    );
    cost += result.costUsd;
    proposals.push(
      ...attribute(
        result,
        { agentId: 'code-intelligence', agentVersion: '1.0', promptVersion: 'code_intelligence.v1' },
        surface,
      ),
    );
  } else {
    skipped.push('code-intelligence (no connector surface)');
  }

  const shots = byKind('screenshot');
  if (shots.length > 0) {
    const result = await discoverVisualFacts({ productName: product.name, evidence: shots }, llm);
    cost += result.costUsd;
    proposals.push(
      ...attribute(
        result,
        { agentId: 'visual-brand', agentVersion: '1.0', promptVersion: 'visual_brand.v1' },
        shots,
      ),
    );
  } else {
    skipped.push('visual-brand (no described screenshots)');
  }

  // ── Code decides ─────────────────────────────────────────────────────────
  const evidenceById = new Map<string, EvidenceRef>(
    evidence.map((e) => [
      e.id,
      { id: e.id, kind: e.kind, sourceUrl: e.source_url, collectedAt: new Date(e.collected_at) },
    ]),
  );

  const writes = planFactWrites({ proposals, evidenceById });

  /**
   * §328. What follows from what was found, run after the evidence agents.
   *
   * Given the facts they established rather than the pages they read: reasoning
   * from raw pages is how a model paraphrases marketing copy back as insight,
   * and reasoning from facts that already survived the evidence rules keeps the
   * chain page → fact → inference visible.
   *
   * Written with status `inferred`, which `EVIDENTIAL_STATUSES` excludes, so
   * nothing published can cite one. It exists to make the system *understand* a
   * product — which audience to address, what to position against — not to put
   * words in its mouth.
   */
  if (writes.length > 0) {
    const inferred = await inferProductFacts(
      {
        productName: product.name,
        facts: writes.map((w) => ({ category: w.category, key: w.key, value: w.value })),
      },
      llm,
    );
    cost += inferred.costUsd;
    for (const fact of inferred.accepted) {
      await ctx.pool.query(
        `insert into product_facts
           (product_id, category, key, value, detail, status, confidence, evidence_ids,
            agent_id, agent_version, prompt_version, last_verified_at, updated_at)
         values ($1,$2,$3,$4,$5,'inferred',$6,'{}',$7,'1.0',$8, now(), now())
         on conflict (product_id, category, key, value) where superseded_by is null
         do update set detail = excluded.detail, updated_at = now()`,
        [
          productId,
          fact.category,
          fact.key,
          fact.value,
          fact.detail ?? null,
          /*
           * Deliberately below every evidenced status. An inference that scored
           * like a verified fact would sort alongside one in any list an
           * operator reads, which is the whole thing this is trying not to do.
           */
          0.35,
          'product-inference',
          'product_inference.v1',
        ],
      );
    }
    ctx.log('inferences recorded', {
      productId,
      count: inferred.accepted.length,
      rejected: inferred.rejected.length,
    });
  }

  for (const write of writes) {
    await ctx.pool.query(
      `insert into product_facts
         (product_id, category, key, value, detail, status, confidence, evidence_ids,
          agent_id, agent_version, prompt_version, last_verified_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
       on conflict (product_id, category, key, value) where superseded_by is null
       do update set detail = excluded.detail,
                     status = excluded.status,
                     confidence = excluded.confidence,
                     evidence_ids = excluded.evidence_ids,
                     agent_id = excluded.agent_id,
                     agent_version = excluded.agent_version,
                     prompt_version = excluded.prompt_version,
                     last_verified_at = excluded.last_verified_at,
                     updated_at = now()`,
      [
        productId,
        write.category,
        write.key,
        write.value,
        write.detail,
        write.status,
        write.confidence,
        write.evidenceIds,
        write.agentId,
        write.agentVersion,
        write.promptVersion,
        write.lastVerifiedAt,
      ],
    );
  }

  // ── Contradictions: found by code, explained by an agent ─────────────────
  const { rows: stored } = await ctx.pool.query<{
    id: string;
    category: FactCategory;
    key: string;
    value: string;
    status: StoredFact['status'];
    confidence: string;
    last_verified_at: Date | null;
    agent_id: string;
  }>(
    `select id, category, key, value, status, confidence, last_verified_at, agent_id
       from product_facts where product_id = $1 and superseded_by is null`,
    [productId],
  );

  const facts: StoredFact[] = stored.map((f) => ({
    id: f.id,
    category: f.category,
    key: f.key,
    value: f.value,
    status: f.status,
    confidence: Number(f.confidence),
    lastVerifiedAt: f.last_verified_at ? new Date(f.last_verified_at) : null,
    agentId: f.agent_id,
  }));

  const contradictions = findContradictions(facts);

  for (const contradiction of contradictions) {
    const explained = await explainContradiction(
      {
        category: contradiction.category,
        key: contradiction.key,
        left: {
          value: contradiction.left.value,
          source: contradiction.left.agentId,
          agentId: contradiction.left.agentId,
        },
        right: {
          value: contradiction.right.value,
          source: contradiction.right.agentId,
          agentId: contradiction.right.agentId,
        },
      },
      llm,
    );
    cost += explained.costUsd;

    /**
     * The explanation is stored on both sides and decides nothing.
     *
     * Neither fact is demoted, dropped or preferred. An operator sees two
     * values and a sentence about why they might differ — which is the honest
     * state of the knowledge, and better than a resolution nothing measured.
     */
    await ctx.pool.query(
      `update product_facts set contradicts = $2, reconciliation = $3, updated_at = now()
        where id = $1`,
      [contradiction.left.id, contradiction.right.id, explained.explanation],
    );
    await ctx.pool.query(
      `update product_facts set contradicts = $2, reconciliation = $3, updated_at = now()
        where id = $1`,
      [contradiction.right.id, contradiction.left.id, explained.explanation],
    );
  }

  /**
   * Stamp consumption, per agent that actually produced a stored fact.
   *
   * This is the evidence that separates "ran" from "was used". An agent whose
   * every proposal was rejected by `parseProposals` produced nothing that
   * reached a table, and is deliberately not stamped — which is the difference
   * between a run and a useful one.
   */
  const producing = new Set(writes.map((w) => w.agentId));
  for (const agentId of producing) {
    await markOutputConsumed(ctx.pool, {
      agentId,
      triggerRef: job.id,
      consumer: 'product_facts',
    });
  }
  if (contradictions.length > 0) {
    await markOutputConsumed(ctx.pool, {
      agentId: 'product-reconciler',
      triggerRef: job.id,
      consumer: 'product_facts.reconciliation',
    });
  }

  ctx.log('built product brain', {
    productId,
    evidence: evidence.length,
    proposed: proposals.length,
    facts: writes.length,
    verified: writes.filter((w) => w.status === 'verified').length,
    contradictions: contradictions.length,
    skipped,
    costUsd: Number(cost.toFixed(4)),
  });
}
