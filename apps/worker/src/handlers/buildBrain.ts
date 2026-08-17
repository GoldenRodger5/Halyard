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

  const byKind = (kind: EvidenceKind): EvidenceForPrompt[] =>
    toPrompt(evidence.filter((e) => e.kind === kind).slice(0, MAX_EVIDENCE_PER_AGENT));

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
