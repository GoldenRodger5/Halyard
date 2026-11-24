/**
 * The product knowledge pack, read at a pinned commit. Product-agnostic.
 *
 * A product owns its facts in its own repo (`docs/marketing/knowledge/`:
 * claims.yaml, product.md, brand.md, learnings.md, state.json). Halyard never
 * writes them and never keeps a second copy; it reads them at a commit, checks
 * them, and assembles the writer's brief deterministically (pack README §2).
 *
 * The Product Brain is deliberately NOT a source here. It is frozen and stale
 * for RecipeFix (2026-10-26), and a model-proposed fact store is exactly what
 * this pack replaces.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

export const CLAIM_STATUSES = [
  'live',
  'live_receipt',
  'implemented',
  'in_flight',
  'unverified',
  'superseded',
  'forbidden',
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

/** The only statuses a post may quote (pack README §1). */
export const QUOTABLE_STATUSES: readonly ClaimStatus[] = ['live', 'live_receipt'];

export interface Claim {
  id: string;
  status: ClaimStatus;
  phrasing?: string;
  must_keep?: string[];
  evidence?: unknown[];
  watch?: string[];
  notes?: string;
  tier?: string;
  derive?: string;
  since_commit?: string;
  examples?: string[];
  reason?: string;
  superseded_at?: string;
  needs_review?: boolean;
}

export type PackSource =
  | { kind: 'dir'; dir: string }
  | { kind: 'git'; repo: string; ref: string; path: string };

export interface KnowledgePack {
  source: PackSource;
  /** Full commit SHA the pack was read at (git sources), or null for a working directory. */
  commit: string | null;
  claims: Claim[];
  verifiedAgainst: Record<string, unknown>;
  product: string;
  brand: string;
  learnings: string;
  state: Record<string, unknown>;
}

export const PACK_FILES = ['claims.yaml', 'product.md', 'brand.md', 'learnings.md', 'state.json'] as const;

export class KnowledgePackError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Knowledge pack is invalid:\n- ${problems.join('\n- ')}`);
    this.name = 'KnowledgePackError';
  }
}

function readPackFile(source: PackSource, file: string): string {
  if (source.kind === 'dir') return readFileSync(path.join(source.dir, file), 'utf8');
  return execFileSync('git', ['-C', source.repo, 'show', `${source.ref}:${source.path.replace(/\/$/, '')}/${file}`], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
}

function resolveCommit(source: PackSource): string | null {
  if (source.kind !== 'git') return null;
  return execFileSync('git', ['-C', source.repo, 'rev-parse', `${source.ref}^{commit}`], { encoding: 'utf8' }).trim();
}

/** Structural problems with a parsed claims register; empty means valid. */
export function validateClaims(doc: unknown): string[] {
  const problems: string[] = [];
  const d = doc as { version?: unknown; claims?: unknown };
  if (!d || typeof d !== 'object') return ['claims.yaml did not parse to an object'];
  if (d.version !== 1) problems.push(`claims.yaml version must be 1, got ${String(d.version)}`);
  if (!Array.isArray(d.claims) || d.claims.length === 0) return [...problems, 'claims.yaml has no claims list'];

  const seen = new Set<string>();
  for (const [i, raw] of (d.claims as Claim[]).entries()) {
    const at = raw?.id ? `claim ${raw.id}` : `claim #${i}`;
    if (!raw?.id || typeof raw.id !== 'string') {
      problems.push(`${at}: missing id`);
      continue;
    }
    if (seen.has(raw.id)) problems.push(`${at}: duplicate id`);
    seen.add(raw.id);
    if (!CLAIM_STATUSES.includes(raw.status)) problems.push(`${at}: unknown status '${String(raw.status)}'`);
    if (raw.status === 'forbidden' && (!Array.isArray(raw.examples) || raw.examples.length === 0)) {
      problems.push(`${at}: forbidden claims need examples (the copy gate matches them)`);
    }
    if (raw.status === 'superseded' && (!raw.superseded_at || !raw.reason)) {
      problems.push(`${at}: superseded claims need superseded_at and reason`);
    }
    if (QUOTABLE_STATUSES.includes(raw.status) && !raw.phrasing) {
      problems.push(`${at}: a quotable claim needs phrasing`);
    }
  }
  return problems;
}

export function loadKnowledgePack(source: PackSource): KnowledgePack {
  const read = (f: string) => readPackFile(source, f);
  const problems: string[] = [];

  let claimsDoc: unknown;
  try {
    claimsDoc = yaml.load(read('claims.yaml'));
  } catch (err) {
    throw new KnowledgePackError([`claims.yaml: ${(err as Error).message}`]);
  }
  problems.push(...validateClaims(claimsDoc));

  let state: Record<string, unknown> = {};
  try {
    state = JSON.parse(read('state.json')) as Record<string, unknown>;
  } catch (err) {
    problems.push(`state.json: ${(err as Error).message}`);
  }
  if (problems.length > 0) throw new KnowledgePackError(problems);

  const doc = claimsDoc as { claims: Claim[]; verified_against?: Record<string, unknown> };
  return {
    source,
    commit: resolveCommit(source),
    claims: doc.claims,
    verifiedAgainst: doc.verified_against ?? {},
    product: read('product.md'),
    brand: read('brand.md'),
    learnings: read('learnings.md'),
    state,
  };
}

export function isQuotable(claim: Claim | undefined): boolean {
  return Boolean(claim && QUOTABLE_STATUSES.includes(claim.status) && claim.needs_review !== true);
}

export function quotableClaims(pack: KnowledgePack): Claim[] {
  return pack.claims.filter(isQuotable);
}

export function claimById(pack: KnowledgePack, id: string): Claim | undefined {
  return pack.claims.find((c) => c.id === id);
}

export function forbiddenClaims(pack: KnowledgePack): Claim[] {
  return pack.claims.filter((c) => c.status === 'forbidden');
}

/**
 * Whether product posts must wait (pack README §3 step 2): the live deploy is
 * not matched by a release receipt, so no product claim is re-verified against
 * it. Education posts may still be made. Never a reason to fail a DRAFT; it is
 * a reason no product post can be approved for publishing.
 */
export function productPostsPaused(pack: KnowledgePack): string | null {
  const flag = pack.state.unreceipted_deploy as { note?: string; seen_at?: string } | null | undefined;
  if (!flag) return null;
  return `state.json.unreceipted_deploy is set (seen ${flag.seen_at ?? 'unknown'}): ${flag.note ?? 'live deploy has no receipt'}`;
}

/** `## 3. Audiences` style sections, by number. Missing sections are a brief error, not a silent gap. */
export function markdownSections(md: string, numbers: number[]): string {
  const parts = md.split(/^(?=## )/m);
  const out: string[] = [];
  for (const n of numbers) {
    const hit = parts.find((p) => new RegExp(`^## ${n}\\.\\s`).test(p));
    if (!hit) throw new KnowledgePackError([`markdown is missing section "## ${n}."`]);
    out.push(hit.trim());
  }
  return out.join('\n\n');
}

/** The newest `n` learnings entries (the file is newest-first). */
export function latestLearnings(md: string, n: number): string {
  return md
    .split(/^(?=## \d{4}-\d{2}-\d{2})/m)
    .filter((p) => /^## \d{4}-\d{2}-\d{2}/.test(p))
    .slice(0, n)
    .map((p) => p.trim())
    .join('\n\n');
}

/**
 * The writer's brief, assembled by code (pack README §2), in a fixed order.
 * Same pack in, same bytes out: a brief is part of the run record.
 */
export function assembleBrief(pack: KnowledgePack): string {
  const va = pack.verifiedAgainst;
  const header =
    `Verified against web ${String(va.web_commit ?? pack.state.verified_web_commit ?? 'unknown')}` +
    `, live bundle ${String(va.live_bundle_entry ?? pack.state.live_bundle_entry ?? 'unknown')}` +
    `, MCP build ${String(va.mcp_build ?? pack.state.mcp_build ?? 'unknown')}` +
    `, iOS ${String(va.ios_version ?? pack.state.ios_version ?? 'unknown')}` +
    `, at ${String(va.verified_at ?? pack.state.verified_at ?? 'unknown')}` +
    `; knowledge commit ${pack.commit ?? 'working tree'}. Claims not listed below do not exist.`;

  const quotable = quotableClaims(pack)
    .map((c) => `- ${c.id}: ${c.phrasing}${c.tier ? ` [${c.tier}]` : ''}${c.notes ? ` (${c.notes})` : ''}`)
    .join('\n');
  const forbidden = forbiddenClaims(pack)
    .map((c) => `- ${c.id}: ${(c.examples ?? []).map((e) => `"${e}"`).join(', ')}${c.reason ? ` → ${c.reason}` : ''}`)
    .join('\n');

  return [
    header,
    '# Product (product.md §1–§3)',
    markdownSections(pack.product, [1, 2, 3]),
    '# Quotable claims (cite the id for every product statement)',
    quotable,
    '# Forbidden (never write these, whatever the evidence)',
    forbidden,
    '# Voice and editorial rules (brand.md §1, §3)',
    markdownSections(pack.brand, [1, 3]),
    '# Latest learnings (learnings.md, newest 5)',
    latestLearnings(pack.learnings, 5),
  ].join('\n\n');
}
