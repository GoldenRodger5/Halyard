/**
 * Reads for the Product Brain.
 *
 * Every query here returns facts *with* their evidence count and verification
 * age, because a fact shown without its provenance is indistinguishable from an
 * assertion — and the entire point of this phase is that the two are never
 * confused again.
 */
import 'server-only';
import {
  CATEGORY_LABELS,
  FACT_CATEGORIES,
  REACHABLE_CATEGORIES,
  canStatePublicly,
  isStale,
  type FactCategory,
  type FactStatus,
} from '@halyard/core';
import { query } from './db';

export interface BrainFact {
  id: string;
  category: FactCategory;
  key: string;
  value: string;
  detail: string | null;
  status: FactStatus;
  confidence: number;
  sourceCount: number;
  agentId: string;
  lastVerifiedAt: Date | null;
  updatedAt: Date;
  contradicts: string | null;
  reconciliation: string | null;
  stale: boolean;
  /**
   * Whether this fact may be repeated outside Halyard.
   *
   * The operational distinction that matters most on these screens: a fact is
   * fine to show an operator long before it is fine to put in a post. Decided
   * by `canStatePublicly`, the same rule `canMarket` applies to feature claims.
   */
  safeToQuote: boolean;
}

interface FactRow {
  id: string;
  category: FactCategory;
  key: string;
  value: string;
  detail: string | null;
  status: FactStatus;
  confidence: string;
  source_count: string;
  agent_id: string;
  last_verified_at: Date | null;
  updated_at: Date;
  contradicts: string | null;
  reconciliation: string | null;
}

function toFact(row: FactRow): BrainFact {
  const lastVerifiedAt = row.last_verified_at ? new Date(row.last_verified_at) : null;
  return {
    id: row.id,
    category: row.category,
    key: row.key,
    value: row.value,
    detail: row.detail,
    status: row.status,
    confidence: Number(row.confidence),
    sourceCount: Number(row.source_count),
    agentId: row.agent_id,
    lastVerifiedAt,
    updatedAt: new Date(row.updated_at),
    contradicts: row.contradicts,
    reconciliation: row.reconciliation,
    // Computed at read time rather than stored. A stored staleness flag is
    // wrong the moment the clock passes it and nothing re-runs.
    stale: row.status === 'verified' && isStale(lastVerifiedAt),
    safeToQuote: canStatePublicly({ status: row.status, lastVerifiedAt }),
  };
}

/**
 * Distinct evidence *sources*, counted in SQL.
 *
 * Counting rows would overstate corroboration when one page is cited by several
 * agents. This mirrors `independentSources` in core; the two must agree, and
 * `brain.test.ts` pins the definition they share.
 */
const SOURCE_COUNT = `(
  select count(distinct coalesce(e.source_url, e.id::text))
    from product_evidence e where e.id = any(f.evidence_ids)
)`;

export async function getFacts(productId: string, category?: FactCategory): Promise<BrainFact[]> {
  const rows = await query<FactRow>(
    `select f.id, f.category, f.key, f.value, f.detail, f.status, f.confidence,
            ${SOURCE_COUNT} as source_count,
            f.agent_id, f.last_verified_at, f.updated_at, f.contradicts, f.reconciliation
       from product_facts f
      where f.product_id = $1 and f.superseded_by is null
        and ($2::text is null or f.category = $2)
      order by f.category, f.confidence desc, f.key`,
    [productId, category ?? null],
  );
  return rows.map(toFact);
}

export interface CategorySummary {
  category: FactCategory;
  label: string;
  total: number;
  verified: number;
  /**
   * Whether any registered agent can produce facts here.
   *
   * A category with no producer is not "waiting for data" — nothing will ever
   * fill it, and the UI says so rather than showing an empty section that reads
   * like a feature not yet run.
   */
  reachable: boolean;
}

export async function getCategorySummary(productId: string): Promise<CategorySummary[]> {
  const rows = await query<{ category: FactCategory; total: string; verified: string }>(
    `select category, count(*) as total,
            count(*) filter (where status = 'verified') as verified
       from product_facts
      where product_id = $1 and superseded_by is null
      group by category`,
    [productId],
  );
  const byCategory = new Map(rows.map((r) => [r.category, r]));

  return FACT_CATEGORIES.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    total: Number(byCategory.get(category)?.total ?? 0),
    verified: Number(byCategory.get(category)?.verified ?? 0),
    reachable: REACHABLE_CATEGORIES.has(category),
  }));
}

export interface EvidenceRow {
  id: string;
  kind: string;
  sourceUrl: string | null;
  title: string | null;
  contentHash: string;
  collectedAt: Date;
  collector: string;
  superseded: boolean;
  bodyChars: number;
  citedBy: number;
}

export async function getEvidence(productId: string): Promise<EvidenceRow[]> {
  const rows = await query<{
    id: string;
    kind: string;
    source_url: string | null;
    title: string | null;
    content_hash: string;
    collected_at: Date;
    collector: string;
    superseded_by: string | null;
    body_chars: string;
    cited_by: string;
  }>(
    `select e.id, e.kind, e.source_url, e.title, e.content_hash, e.collected_at,
            e.collector, e.superseded_by, length(e.body) as body_chars,
            (select count(*) from product_facts f
              where f.product_id = e.product_id and e.id = any(f.evidence_ids)) as cited_by
       from product_evidence e
      where e.product_id = $1
      order by e.collected_at desc`,
    [productId],
  );

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    sourceUrl: r.source_url,
    title: r.title,
    contentHash: r.content_hash,
    collectedAt: new Date(r.collected_at),
    collector: r.collector,
    superseded: r.superseded_by !== null,
    bodyChars: Number(r.body_chars),
    citedBy: Number(r.cited_by),
  }));
}

/** The evidence behind one fact, so a claim can be followed to its source. */
export async function getEvidenceForFact(factId: string): Promise<EvidenceRow[]> {
  const rows = await query<{
    id: string;
    kind: string;
    source_url: string | null;
    title: string | null;
    content_hash: string;
    collected_at: Date;
    collector: string;
    superseded_by: string | null;
    body_chars: string;
  }>(
    `select e.id, e.kind, e.source_url, e.title, e.content_hash, e.collected_at,
            e.collector, e.superseded_by, length(e.body) as body_chars
       from product_evidence e
       join product_facts f on e.id = any(f.evidence_ids)
      where f.id = $1
      order by e.collected_at desc`,
    [factId],
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    sourceUrl: r.source_url,
    title: r.title,
    contentHash: r.content_hash,
    collectedAt: new Date(r.collected_at),
    collector: r.collector,
    superseded: r.superseded_by !== null,
    bodyChars: Number(r.body_chars),
    citedBy: 1,
  }));
}

export interface FeatureRow {
  id: string;
  name: string;
  summary: string;
  source: string;
  status: string;
  verifiedAt: Date | null;
  lastAttemptAt: Date | null;
  attempts: number;
  lastVerdict: string | null;
  stale: boolean;
}

/**
 * Features come from `feature_claims`, not from `product_facts`.
 *
 * The Brain does not restate them. A feature claim is verified by *replaying it
 * in a browser*, which is stronger evidence than two pages agreeing — and two
 * tables answering "what does this product do" would drift, with the weaker one
 * winning arguments by being easier to write to.
 */
export async function getFeatures(productId: string): Promise<FeatureRow[]> {
  const rows = await query<{
    id: string;
    name: string;
    summary: string;
    source: string;
    status: string;
    verified_at: Date | null;
    last_attempt_at: Date | null;
    attempts: number;
    last_verdict: string | null;
  }>(
    `select id, name, summary, source, status, verified_at, last_attempt_at,
            attempts, last_verdict
       from feature_claims where product_id = $1
      order by status, name`,
    [productId],
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    summary: r.summary,
    source: r.source,
    status: r.status,
    verifiedAt: r.verified_at ? new Date(r.verified_at) : null,
    lastAttemptAt: r.last_attempt_at ? new Date(r.last_attempt_at) : null,
    attempts: r.attempts,
    lastVerdict: r.last_verdict,
    stale: r.status === 'verified' && isStale(r.verified_at ? new Date(r.verified_at) : null),
  }));
}

export interface BrainJobState {
  kind: string;
  status: string;
  createdAt: Date;
  /** When the worker claimed it. `jobs` records this as `locked_at`. */
  claimedAt: Date | null;
  lastError: string | null;
}

/**
 * What the Brain's own jobs are doing.
 *
 * Shown because "nothing here yet" and "the collection failed twice" look
 * identical on an empty screen, and only one of them is worth an operator's
 * attention.
 */
export async function getBrainJobs(productId: string): Promise<BrainJobState[]> {
  const rows = await query<{
    kind: string;
    status: string;
    created_at: Date;
    locked_at: Date | null;
    last_error: string | null;
  }>(
    `select kind, status, created_at, locked_at, last_error
       from jobs
      where kind in ('collect_product_evidence', 'build_product_brain', 'explore_product')
        and payload->>'productId' = $1
      order by created_at desc limit 10`,
    [productId],
  );
  return rows.map((r) => ({
    kind: r.kind,
    status: r.status,
    createdAt: new Date(r.created_at),
    claimedAt: r.locked_at ? new Date(r.locked_at) : null,
    lastError: r.last_error,
  }));
}
