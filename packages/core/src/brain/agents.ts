/**
 * The Product Intelligence agents — the perceiving half.
 *
 * Each of these reads evidence and proposes facts. None of them can decide
 * anything: `parseProposals` throws away every field that is not a proposal, so
 * a reply containing `"status":"verified"` loses that field on the way in
 * rather than being trusted and then checked. There is no code path from model
 * output to `product_facts.status` or `.confidence`.
 *
 * ## Why the categories are passed in rather than fixed per agent
 *
 * A single prompt builder with a category list makes the boundary between
 * agents explicit and auditable: what an agent may propose is data, not prose
 * buried in a template. It also means the Auditor can be told which categories
 * are reachable, and report a Brain screen promising knowledge no agent can
 * supply.
 */
import { extractJson, STRATEGY_MODEL } from '../generation/llm.js';
import type { LlmClient } from '../generation/llm.js';
import { FACT_CATEGORIES, type FactCategory, type ProposedFact } from './model.js';

export const PRODUCT_DISCOVERY_PROMPT_VERSION = 'product_discovery.v1';
export const STORE_LISTING_PROMPT_VERSION = 'store_listing.v1';
export const CODE_INTELLIGENCE_PROMPT_VERSION = 'code_intelligence.v1';
export const VISUAL_BRAND_PROMPT_VERSION = 'visual_brand.v1';
export const PRODUCT_RECONCILER_PROMPT_VERSION = 'product_reconciler.v1';

/** The most facts one call may yield, so a long page cannot flood a category. */
export const MAX_FACTS_PER_CALL = 12;

/** Longest value that is still a fact rather than a paragraph. */
export const MAX_VALUE_CHARS = 240;

export interface EvidenceForPrompt {
  id: string;
  kind: string;
  sourceUrl: string | null;
  title: string | null;
  body: string;
}

export interface ProposalResult {
  accepted: ProposedFact[];
  rejected: Array<{ key: string; reason: string }>;
  costUsd: number;
}

const CATEGORY_SET = new Set<string>(FACT_CATEGORIES);

/**
 * Validate what came back.
 *
 * Rejections are returned rather than dropped, on the same reasoning as the
 * Explorer's: what a model *tried* to propose is the signal for whether the
 * prompt is working, and a model repeatedly proposing categories it was not
 * offered is something to know rather than to filter away silently.
 */
export function parseProposals(
  raw: unknown,
  allowed: readonly FactCategory[],
): { accepted: ProposedFact[]; rejected: Array<{ key: string; reason: string }> } {
  const accepted: ProposedFact[] = [];
  const rejected: Array<{ key: string; reason: string }> = [];
  const allowedSet = new Set<string>(allowed);
  const seen = new Set<string>();

  const facts = (raw as { facts?: unknown })?.facts;
  if (!Array.isArray(facts)) {
    return { accepted, rejected: [{ key: '(response)', reason: 'No facts array in the reply.' }] };
  }

  for (const entry of facts.slice(0, MAX_FACTS_PER_CALL)) {
    const fact = entry as Record<string, unknown>;
    const key = String(fact.key ?? '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    const category = String(fact.category ?? '').trim();
    const value = String(fact.value ?? '').trim();

    if (!key) {
      rejected.push({ key: '(unnamed)', reason: 'No key. A fact with no slot cannot be updated or contradicted.' });
      continue;
    }
    if (!CATEGORY_SET.has(category)) {
      rejected.push({ key, reason: `'${category}' is not a fact category.` });
      continue;
    }
    if (!allowedSet.has(category)) {
      rejected.push({ key, reason: `'${category}' is outside this agent's remit.` });
      continue;
    }
    if (!value) {
      rejected.push({ key, reason: 'No value. An empty fact reads as knowledge and carries none.' });
      continue;
    }
    if (value.length > MAX_VALUE_CHARS) {
      rejected.push({ key, reason: `Value is ${value.length} characters; a fact is not a paragraph.` });
      continue;
    }

    const slot = `${category}:${key}`;
    if (seen.has(slot)) {
      rejected.push({ key, reason: 'Duplicate slot in one reply.' });
      continue;
    }
    seen.add(slot);

    /**
     * Note what is not read: `status`, `confidence`, `verified`, `sources`.
     *
     * Only these four fields survive. A reply that supplies a status loses it
     * here — not later, and not with a warning, because a field that is read
     * and then overridden is one refactor away from being read and kept.
     */
    accepted.push({
      category: category as FactCategory,
      key,
      value,
      detail: fact.detail ? String(fact.detail).trim().slice(0, 1000) : null,
    });
  }

  return { accepted, rejected };
}

function evidenceBlock(evidence: EvidenceForPrompt[], perItemChars: number): string {
  return evidence
    .map(
      (e, i) =>
        `### Evidence ${i + 1} — ${e.kind}${e.sourceUrl ? ` (${e.sourceUrl})` : ''}\n` +
        `${e.title ? `Title: ${e.title}\n` : ''}${e.body.slice(0, perItemChars)}`,
    )
    .join('\n\n');
}

export function buildProposalPrompt(input: {
  productName: string;
  role: string;
  guidance: string;
  categories: readonly FactCategory[];
  evidence: EvidenceForPrompt[];
  perItemChars?: number;
}): string {
  return `You are ${input.role} for ${input.productName}.

${input.guidance}

State only what the evidence below shows. If the evidence does not support a
fact, omit it — an omitted fact costs nothing and an invented one poisons every
downstream use. Do not infer from what is typical of products like this one.

You may propose facts in these categories only: ${input.categories.join(', ')}.

Each fact needs a stable \`key\` — a slug naming the slot it occupies, so a later
observation of the same thing updates it rather than accumulating beside it. Use
\`primary_audience\`, not \`audience_2\`.

Keep each \`value\` under ${MAX_VALUE_CHARS} characters. A value is a fact, not a
paragraph; put the elaboration in \`detail\`.

## Evidence

${evidenceBlock(input.evidence, input.perItemChars ?? 6000)}

Reply with this JSON object and nothing else:
{"facts":[{"category":"one of the categories above","key":"slug","value":"the fact","detail":"optional context"}]}

Do not include a status, a confidence, or any assessment of how sure you are.
Those are computed from how many independent sources agree, and anything you
supply for them is discarded.`;
}

async function propose(
  llm: LlmClient,
  args: {
    system: string;
    prompt: string;
    promptVersion: string;
    categories: readonly FactCategory[];
    maxTokens?: number;
    /**
     * Which tier proposes these facts.
     *
     * All four discoverers used to share the client's default, which is the
     * draft model. Three of them propose facts that are published as true —
     * what the product is, what its listing claims, what the code implements —
     * and a wrong premise there is laundered through every later post. Those
     * name the strategy model explicitly. The visual one describes a design
     * language and stays on draft.
     */
    model?: string;
  },
): Promise<ProposalResult> {
  const response = await llm.complete({
    system: args.system,
    messages: [{ role: 'user', content: args.prompt }],
    maxTokens: args.maxTokens ?? 2000,
    ...(args.model ? { model: args.model } : {}),
    promptVersion: args.promptVersion,
  });

  let parsed: unknown;
  try {
    parsed = extractJson(response.text);
  } catch (err) {
    return {
      accepted: [],
      rejected: [{ key: '(response)', reason: `Not valid JSON: ${(err as Error).message}` }],
      costUsd: response.costUsd,
    };
  }

  const { accepted, rejected } = parseProposals(parsed, args.categories);
  return { accepted, rejected, costUsd: response.costUsd };
}

// ── Product Discovery ──────────────────────────────────────────────────────

export const PRODUCT_DISCOVERY_CATEGORIES = [
  'identity',
  'mission',
  'users',
  'personas',
  'jobs_to_be_done',
  'differentiators',
  'pricing',
  'content_pillars',
  'conversion_funnel',
] as const satisfies readonly FactCategory[];

/**
 * What the product says it is, from its public web surface.
 *
 * The broadest of these agents and therefore the one most able to drift into
 * fluent invention, which is why its guidance is about restraint rather than
 * coverage. A landing page is a product's own account of itself; treating it as
 * observation of the *page* rather than of the *world* is the distinction that
 * keeps `mission` correctly `unverifiable`.
 */
export async function discoverProductFacts(
  input: { productName: string; evidence: EvidenceForPrompt[] },
  llm: LlmClient,
): Promise<ProposalResult> {
  return propose(llm, {
    system:
      'You identify what a product is and who it is for, strictly from supplied evidence. Reply with JSON only.',
    model: STRATEGY_MODEL,
    prompt: buildProposalPrompt({
      productName: input.productName,
      role: 'reading the public website of a product to work out what it is and who it serves',
      guidance:
        'Distinguish what the product does from what it claims about outcomes. "Adapts recipes to dietary restrictions" is an identity fact; "saves users hours every week" is a marketing claim and belongs in the claims category if it appears at all.',
      categories: PRODUCT_DISCOVERY_CATEGORIES,
      evidence: input.evidence,
    }),
    promptVersion: PRODUCT_DISCOVERY_PROMPT_VERSION,
    categories: PRODUCT_DISCOVERY_CATEGORIES,
  });
}

// ── Store / Listing ────────────────────────────────────────────────────────

export const STORE_LISTING_CATEGORIES = [
  'app_store_positioning',
  'competitors',
  'claims',
  'pricing',
  'monetization',
] as const satisfies readonly FactCategory[];

/**
 * How the product presents itself in a store listing.
 *
 * A store listing is positioning under constraints nobody else imposes —
 * a character-limited subtitle, a keyword field, a screenshot order — so it
 * reveals what the operator thinks matters most, which the website's more
 * generous layout hides.
 */
export async function discoverListingFacts(
  input: { productName: string; evidence: EvidenceForPrompt[] },
  llm: LlmClient,
): Promise<ProposalResult> {
  return propose(llm, {
    system:
      'You read app store listings and report how a product positions itself. Reply with JSON only.',
    model: STRATEGY_MODEL,
    prompt: buildProposalPrompt({
      productName: input.productName,
      role: 'reading an App Store listing to work out how the product is positioned',
      guidance:
        'Ratings, review counts and prices are facts. A phrase from the description is a claim, and belongs in the claims category rather than being restated as if observed. Name a competitor only if the listing names one.',
      categories: STORE_LISTING_CATEGORIES,
      evidence: input.evidence,
    }),
    promptVersion: STORE_LISTING_PROMPT_VERSION,
    categories: STORE_LISTING_CATEGORIES,
  });
}

// ── Code Intelligence ──────────────────────────────────────────────────────

export const CODE_INTELLIGENCE_CATEGORIES = [
  'workflows',
  'ux_model',
  'monetization',
  'differentiators',
] as const satisfies readonly FactCategory[];

/**
 * What the product can actually do, from the interface it really exposes.
 *
 * The architecture asks this agent for "implementation truth — actual vs
 * claimed behaviour". For a product that ships through Lovable with no
 * repository, the honest source of that truth is the API surface: a tool the
 * server advertises is a capability that exists, whatever the landing page says.
 *
 * This is deliberately not a second GitHub agent. `shipped-feature-summariser`
 * already reads merged pull requests and is already blocked for want of them;
 * adding another agent blocked on the same absent input would add a name and no
 * capability.
 */
export async function discoverImplementationFacts(
  input: { productName: string; evidence: EvidenceForPrompt[] },
  llm: LlmClient,
): Promise<ProposalResult> {
  return propose(llm, {
    system:
      'You read a product API surface and report what the product actually supports. Reply with JSON only.',
    model: STRATEGY_MODEL,
    prompt: buildProposalPrompt({
      productName: input.productName,
      role: "reading a product's own API surface to work out what it genuinely supports",
      guidance:
        'Each entry is a capability the product really exposes. Group related operations into the workflow they serve rather than restating the list. Do not infer a feature from a name alone when the description contradicts it.',
      categories: CODE_INTELLIGENCE_CATEGORIES,
      evidence: input.evidence,
    }),
    promptVersion: CODE_INTELLIGENCE_PROMPT_VERSION,
    categories: CODE_INTELLIGENCE_CATEGORIES,
  });
}

// ── Visual Brand ───────────────────────────────────────────────────────────

export const VISUAL_BRAND_CATEGORIES = [
  'visual_identity',
  'brand_voice',
] as const satisfies readonly FactCategory[];

/**
 * The product's design language, from what it actually looks like.
 *
 * Fed screenshot descriptions rather than the images themselves: the vision
 * describer already exists, is already registered, and is deliberately blind to
 * intent. Reusing it keeps one component looking at pixels instead of two.
 */
export async function discoverVisualFacts(
  input: { productName: string; evidence: EvidenceForPrompt[] },
  llm: LlmClient,
): Promise<ProposalResult> {
  return propose(llm, {
    system:
      'You describe a product visual design language from supplied observations. Reply with JSON only.',
    prompt: buildProposalPrompt({
      productName: input.productName,
      role: "reading descriptions of a product's screens to work out its design language",
      guidance:
        'Report what is consistently visible: palette, typography, density, imagery, component language. A single screen is not a design system — say what recurs.',
      categories: VISUAL_BRAND_CATEGORIES,
      evidence: input.evidence,
    }),
    promptVersion: VISUAL_BRAND_PROMPT_VERSION,
    categories: VISUAL_BRAND_CATEGORIES,
  });
}

// ── Product Reconciler ─────────────────────────────────────────────────────

export interface ReconciliationInput {
  category: string;
  key: string;
  left: { value: string; source: string; agentId: string };
  right: { value: string; source: string; agentId: string };
}

export interface Reconciliation {
  explanation: string;
  costUsd: number;
}

/**
 * Explain a contradiction that code already found.
 *
 * The narrowness is the design. `findContradictions` decides *that* two facts
 * conflict — an exact question about two rows in one slot — and this explains
 * *why* they might, in a sentence an operator can act on. An agent asked to
 * "compare the product's claims against reality" would be free to find
 * conflicts that are not there and to miss ones that are, and its output would
 * be a policy decision wearing the clothes of an observation.
 *
 * It returns prose. It does not choose a winner, and nothing downstream reads
 * this field as a decision.
 */
export async function explainContradiction(
  input: ReconciliationInput,
  llm: LlmClient,
): Promise<Reconciliation> {
  const response = await llm.complete({
    system:
      'You explain why two observations of the same product fact might differ. You do not decide which is correct.',
    messages: [
      {
        role: 'user',
        content: `Two sources disagree about ${input.category}/${input.key}.

Source A (${input.left.source}, via ${input.left.agentId}): "${input.left.value}"
Source B (${input.right.source}, via ${input.right.agentId}): "${input.right.value}"

In two sentences at most, explain the most likely reason these differ — a stale
page, a different audience, a marketing simplification, a genuine change. Say
what an operator would need to check to settle it.

Do not state which one is correct. Reply with plain prose, no JSON.`,
      },
    ],
    maxTokens: 300,
    /*
     * The reconciler adjudicates a conflict between two facts that both cite
     * real evidence. It is the last word on which one the Brain keeps, so it
     * runs on the strategy tier even though its answer is three hundred tokens.
     */
    model: STRATEGY_MODEL,
    promptVersion: PRODUCT_RECONCILER_PROMPT_VERSION,
  });

  return { explanation: response.text.trim().slice(0, 1000), costUsd: response.costUsd };
}

/**
 * Every category some registered agent can actually produce.
 *
 * Exported so the Auditor can compare it against what the Brain UI offers, and
 * report a screen promising knowledge nothing can supply. That is the
 * phantom-capability pattern applied to the Brain: an empty category with a
 * producer is waiting for data, and an empty category with no producer is a lie
 * with a heading.
 */
export const REACHABLE_CATEGORIES: ReadonlySet<FactCategory> = new Set<FactCategory>([
  ...PRODUCT_DISCOVERY_CATEGORIES,
  ...STORE_LISTING_CATEGORIES,
  ...CODE_INTELLIGENCE_CATEGORIES,
  ...VISUAL_BRAND_CATEGORIES,
]);
