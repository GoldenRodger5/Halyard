/**
 * The deterministic copy gate. Code decides; the model only proposes.
 *
 * Checks, all pass/fail (QUALITY_AND_OPERATIONS §3):
 *  - claim correspondence: every product sentence cites a QUOTABLE claim id;
 *  - forbidden phrases: the pack's `forbidden` examples, case-insensitive;
 *  - numbers: every number in the copy appears in the proof source, a cited
 *    claim's phrasing, or a declared fact source — the body sweep for
 *    undeclared numbers that `qc/claimVerifier.ts` never had;
 *  - narrative claims: first-person / "people asked" lines need a learnings entry;
 *  - Halyard's slop filter (`qc/slopFilter.ts`) on the caption, unchanged.
 */
import { slopFilter, type SlopPlatform } from '@halyard/core/qc';
import { claimById, forbiddenClaims, isQuotable, type KnowledgePack } from './knowledge.js';

export interface CopyLine {
  /** Where it appears: `slide 3 headline`, `caption`, `vo 2`, … */
  where: string;
  text: string;
  /** Claim ids this line relies on. Required when the line is about the product. */
  claimIds?: string[];
  /** Ids into the piece's `factSources` for non-product numbers on this line. */
  factIds?: string[];
}

export interface FactSource {
  id: string;
  /** What the number is and where it comes from (USDA, the stored output's path, arithmetic). */
  statement: string;
  source: string;
}

export interface CopyGateInput {
  pack: KnowledgePack;
  lines: CopyLine[];
  caption?: { text: string; hashtags: string[]; platform: SlopPlatform; claimIds?: string[]; factIds?: string[] };
  /** The real stored output the piece is built on, as text. Numbers in it are traceable. */
  proofText: string;
  factSources: FactSource[];
  /** Words that make a sentence a product statement. */
  productTerms: string[];
  /** Learnings entry dates cited for narrative lines. */
  learningsCited?: string[];
}

export interface GateCheck {
  id: string;
  passed: boolean;
  detail: string;
  problems: string[];
}

const NARRATIVE = /\b(I|we|our users|our customers|people (asked|told|keep asking)|you (all )?asked|several of you|many of you)\b/i;

/** Numbers as a reader sees them: 8, 8–10, 1½, 3/4, 165°F, 4 → 6. */
export function numbersIn(text: string): string[] {
  const out: string[] = [];
  const re = /(\d+\/\d+|\d+(?:[.,]\d+)?(?:\s?[½¼¾⅓⅔])?|[½¼¾⅓⅔])/g;
  for (const m of text.matchAll(re)) out.push(normaliseNumber(m[1]!));
  return out;
}

function normaliseNumber(n: string): string {
  return n.replace(/\s+/g, '').replace(',', '.');
}

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function runCopyGate(input: CopyGateInput): { passed: boolean; checks: GateCheck[] } {
  const checks: GateCheck[] = [];
  const allLines: CopyLine[] = [
    ...input.lines,
    ...(input.caption
      ? [{ where: 'caption', text: input.caption.text, claimIds: input.caption.claimIds ?? [], factIds: input.caption.factIds ?? [] }]
      : []),
  ];
  if (allLines.length === 0 || allLines.every((l) => !l.text.trim())) {
    return { passed: false, checks: [{ id: 'copy.present', passed: false, detail: 'no copy to check', problems: ['no copy'] }] };
  }

  // 1. Claim correspondence
  const claimProblems: string[] = [];
  const productTerm = new RegExp(`\\b(${input.productTerms.map(escapeRe).join('|')})\\b`, 'i');
  for (const line of allLines) {
    for (const id of line.claimIds ?? []) {
      const claim = claimById(input.pack, id);
      if (!claim) claimProblems.push(`${line.where}: cites unknown claim '${id}'`);
      else if (!isQuotable(claim)) claimProblems.push(`${line.where}: cites '${id}' whose status '${claim.status}' is not quotable`);
    }
    const productSentences = sentencesOf(line.text).filter((s) => productTerm.test(s));
    if (productSentences.length > 0 && !(line.claimIds ?? []).some((id) => isQuotable(claimById(input.pack, id)))) {
      claimProblems.push(`${line.where}: product statement without a quotable claim id: "${productSentences[0]}"`);
    }
  }
  checks.push({
    id: 'claims.correspondence',
    passed: claimProblems.length === 0,
    detail: `${allLines.filter((l) => (l.claimIds ?? []).length > 0).length} lines cite claims`,
    problems: claimProblems,
  });

  // 2. Forbidden phrases
  const forbiddenProblems: string[] = [];
  const forbidden = forbiddenClaims(input.pack).flatMap((c) => (c.examples ?? []).map((e) => ({ id: c.id, e })));
  for (const line of allLines) {
    for (const { id, e } of forbidden) {
      if (forbiddenMatches(line.text, e)) forbiddenProblems.push(`${line.where}: matches forbidden ${id} example "${e}"`);
    }
  }
  checks.push({
    id: 'claims.forbidden',
    passed: forbiddenProblems.length === 0,
    detail: `${forbidden.length} forbidden examples checked`,
    problems: forbiddenProblems,
  });

  // 3. Numbers trace to the proof, a cited claim, or a fact source
  const numberProblems: string[] = [];
  const proofNumbers = new Set(numbersIn(input.proofText));
  const factById = new Map(input.factSources.map((f) => [f.id, f]));
  let numbersSeen = 0;
  for (const line of allLines) {
    const allowed = new Set(proofNumbers);
    for (const id of line.claimIds ?? []) for (const n of numbersIn(claimById(input.pack, id)?.phrasing ?? '')) allowed.add(n);
    for (const id of line.factIds ?? []) {
      const f = factById.get(id);
      if (!f) numberProblems.push(`${line.where}: cites unknown fact source '${id}'`);
      else for (const n of numbersIn(f.statement)) allowed.add(n);
    }
    for (const n of numbersIn(line.text.replace(/#\w+/g, ''))) {
      numbersSeen++;
      if (!allowed.has(n)) numberProblems.push(`${line.where}: number "${n}" is in no proof, cited claim or fact source`);
    }
  }
  checks.push({
    id: 'facts.numbers_traced',
    passed: numberProblems.length === 0,
    detail: `${numbersSeen} numbers checked`,
    problems: numberProblems,
  });

  // 4. Narrative claims
  const narrativeProblems = allLines
    .filter((l) => NARRATIVE.test(l.text) && (input.learningsCited ?? []).length === 0)
    .map((l) => `${l.where}: first-person or "people" claim without a learnings.md entry: "${l.text.match(NARRATIVE)![0]}"`);
  checks.push({
    id: 'claims.narrative',
    passed: narrativeProblems.length === 0,
    detail: 'first-person / audience claims need learnings.md',
    problems: narrativeProblems,
  });

  // 5. Halyard's slop filter, on the caption (on-screen lines are too short for its prose rules)
  if (input.caption) {
    const slop = slopFilter({
      body: input.caption.text,
      platform: input.caption.platform,
      hashtags: input.caption.hashtags,
      onScreen: input.lines.map((l) => l.text),
    });
    checks.push({
      id: 'copy.slop_filter',
      passed: slop.passed,
      detail: `${slop.errors.length} errors, ${slop.warnings.length} warnings`,
      problems: [
        ...slop.errors.map((v) => `error ${v.rule}: ${v.message}${v.excerpt ? ` ("${v.excerpt}")` : ''}`),
        ...slop.warnings.map((v) => `warning ${v.rule}: ${v.message}${v.excerpt ? ` ("${v.excerpt}")` : ''}`),
      ],
    });
  }

  // Every on-screen line is also swept for slop-filter hard punctuation the renderer would expose.
  const typo = input.lines.filter((l) => /—|\.\.\.|…|\[object Object\]|undefined|null/.test(l.text));
  checks.push({
    id: 'copy.on_screen_typography',
    passed: typo.length === 0,
    detail: 'no em dashes, ellipses, or serialisation artefacts on screen',
    problems: typo.map((l) => `${l.where}: "${l.text}"`),
  });

  return { passed: checks.every((c) => c.passed), checks };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A forbidden example matches on its words, not its punctuation. Very short
 * single-word examples ("tested") match as whole words only, so "untested"
 * and "testing" are not caught but "tested" is.
 */
export function forbiddenMatches(text: string, example: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9$'%. ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const t = ` ${norm(text)} `;
  const e = norm(example).replace(/…$/, '').trim();
  if (!e) return false;
  return t.includes(` ${e} `) || t.includes(` ${e}.`) || t.includes(` ${e},`);
}
