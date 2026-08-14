/**
 * Turning what a page looks like into claims that can be checked.
 *
 * This is the perceiving half of the Explorer, and it is arranged so the model
 * can only ever *propose*. It cannot mark anything verified, it cannot widen
 * the action vocabulary, and it cannot get a claim stored that has nothing
 * observable in it. Every one of those is enforced here, in code, on the
 * parsed output — not asked for in the prompt.
 *
 * ## Why a claim must carry its own proof
 *
 * The obvious design is "list the features you can see". That produces prose,
 * prose becomes the brief, the brief becomes every prompt, and nothing
 * downstream can tell an observed feature from an imagined one. So the schema
 * demands the demonstration: the steps, and the thing that must be true when
 * they finish. A model that cannot say how it would prove a feature has not
 * found one.
 *
 * ## What the model is shown
 *
 * An accessibility-style outline of the page — roles, names, and the visible
 * text — rather than raw HTML. Raw markup is mostly class attributes and
 * framework noise, it is enormous, and it invites the model to invent CSS
 * selectors that happen to parse. Names and roles are what a person navigating
 * the page would use, and they survive a redeploy far better than a hashed
 * class name.
 */
import { extractJson } from '../generation/llm.js';
import type { LlmClient } from '../generation/llm.js';
import { ALLOWED_ACTIONS, checkFlowSafety, type ExplorerStep } from './safety.js';

export interface PageOutline {
  url: string;
  title: string;
  /** Role/name pairs, in document order. */
  elements: Array<{ role: string; name: string; selector?: string }>;
  /** Visible text, truncated. Context for what the page is for. */
  text: string;
}

export interface ProposedClaim {
  name: string;
  summary: string;
  steps: ExplorerStep[];
}

export interface RejectedClaim {
  name: string;
  reason: string;
}

export interface DiscoveryResult {
  accepted: ProposedClaim[];
  rejected: RejectedClaim[];
  costUsd: number;
}

export const DISCOVERY_PROMPT_VERSION = 'explorer_discovery.v1';

/** The most claims one page may yield, so a busy page cannot flood the queue. */
export const MAX_CLAIMS_PER_PAGE = 8;

/** Expectation actions — the ones that make a claim checkable rather than a walk. */
const EXPECTATION_ACTIONS = new Set(['expectText', 'expectVisible', 'expectUrl']);

export function buildDiscoveryPrompt(outline: PageOutline, productName: string): string {
  return `You are looking at a page of ${productName} and identifying what it lets a user DO.

A feature is something a user accomplishes, not something that exists. "Saves a
recipe to your library" is a feature. "Has a sidebar" is not.

For each feature, give the steps that DEMONSTRATE it, ending with something that
must be observable if the feature works. If you cannot say how you would prove a
feature exists, do not list it.

Steps use only these actions: ${ALLOWED_ACTIONS.join(', ')}.
Prefer targeting by visible name over CSS selectors — names survive a redeploy.

Never propose steps that delete, remove, reset, sign out, buy, upgrade, pay, or
change account settings. This runs against a real account.

## Page
URL: ${outline.url}
Title: ${outline.title}

Elements:
${outline.elements.slice(0, 120).map((e) => `- ${e.role}: ${e.name}`).join('\n')}

Text:
${outline.text.slice(0, 3000)}

Reply with this JSON object and nothing else:
{"claims":[{"name":"short feature name","summary":"one sentence, what a user accomplishes","steps":[{"name":"what this step does","action":"goto","value":"..."},{"name":"what must be true","action":"expectText","target":"..."}]}]}`;
}

/**
 * Validate what came back, and say why anything was thrown out.
 *
 * Rejections are returned rather than dropped. What a model *tried* to propose
 * is the useful signal for whether the prompt is working — and if it repeatedly
 * proposes destructive flows, that is something to know rather than to silently
 * filter.
 */
export function validateClaims(
  raw: unknown,
  options: { allowedOrigins: string[]; existingNames?: string[] },
): { accepted: ProposedClaim[]; rejected: RejectedClaim[] } {
  const accepted: ProposedClaim[] = [];
  const rejected: RejectedClaim[] = [];
  const seen = new Set((options.existingNames ?? []).map((n) => n.toLowerCase().trim()));

  const claims = (raw as { claims?: unknown })?.claims;
  if (!Array.isArray(claims)) {
    return { accepted, rejected: [{ name: '(response)', reason: 'No claims array in the reply.' }] };
  }

  for (const entry of claims.slice(0, MAX_CLAIMS_PER_PAGE)) {
    const claim = entry as Partial<ProposedClaim>;
    const name = String(claim.name ?? '').trim();

    if (!name) {
      rejected.push({ name: '(unnamed)', reason: 'A claim with no name cannot be stored or deduped.' });
      continue;
    }
    if (!String(claim.summary ?? '').trim()) {
      rejected.push({ name, reason: 'No summary. A claim nobody can read is not usable.' });
      continue;
    }

    const steps = Array.isArray(claim.steps) ? (claim.steps as ExplorerStep[]) : [];

    /**
     * The rule that makes this an inventory rather than a list of impressions.
     *
     * A claim whose steps only navigate would replay cleanly forever and
     * confirm nothing — `verdictFor` would return `unverifiable`. Catching it
     * here means the model gets told, rather than the row sitting in the table
     * looking like a near-miss.
     */
    const hasExpectation = steps.some((s) => EXPECTATION_ACTIONS.has(s.action) && !s.optional);
    if (!hasExpectation) {
      rejected.push({
        name,
        reason:
          'No required expectation. Steps that only navigate would replay cleanly forever and prove nothing.',
      });
      continue;
    }

    // The same denylist the replay uses. Checked here so an unsafe proposal is
    // never stored at all, rather than stored and refused at run time.
    const safety = checkFlowSafety(steps, { allowedOrigins: options.allowedOrigins });
    if (!safety.allowed) {
      rejected.push({ name, reason: `Unsafe: ${safety.refusals[0]!.why}` });
      continue;
    }

    if (seen.has(name.toLowerCase().trim())) {
      rejected.push({ name, reason: 'Already claimed. Re-discovery updates rather than duplicates.' });
      continue;
    }
    seen.add(name.toLowerCase().trim());

    accepted.push({ name, summary: String(claim.summary).trim(), steps });
  }

  return { accepted, rejected };
}

/**
 * Ask what this page lets a user do.
 *
 * Note what is absent: no `status` is read from the reply, ever. The model has
 * no way to express "and I checked, it works" — the only route to `verified`
 * is a replay.
 */
export async function discoverClaims(
  outline: PageOutline,
  options: { productName: string; allowedOrigins: string[]; existingNames?: string[] },
  llm: LlmClient,
): Promise<DiscoveryResult> {
  const response = await llm.complete({
    system:
      'You identify what a product lets users do, and how you would prove each one. Reply with JSON only.',
    messages: [{ role: 'user', content: buildDiscoveryPrompt(outline, options.productName) }],
    maxTokens: 2000,
    promptVersion: DISCOVERY_PROMPT_VERSION,
  });

  let parsed: unknown;
  try {
    parsed = extractJson(response.text);
  } catch (err) {
    return {
      accepted: [],
      rejected: [{ name: '(response)', reason: `Not valid JSON: ${(err as Error).message}` }],
      costUsd: response.costUsd,
    };
  }

  const { accepted, rejected } = validateClaims(parsed, {
    allowedOrigins: options.allowedOrigins,
    existingNames: options.existingNames,
  });

  return { accepted, rejected, costUsd: response.costUsd };
}
