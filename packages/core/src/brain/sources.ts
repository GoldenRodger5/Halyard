/**
 * Which evidence sources a product actually has.
 *
 * §146. Product understanding is source-agnostic: it consumes whatever surfaces
 * exist and says so. Before this, the collector decided that ad hoc in a chain
 * of `if`s and told nobody — so an operator could not answer "what is Halyard
 * reading about my product", and a product with no MCP server looked
 * indistinguishable from one whose MCP server was misconfigured.
 *
 * Every source here is **optional**. There is no minimum set, and no source is
 * privileged. A product with only a website is a fully supported product; a
 * product with an MCP server is the same product with one more source.
 *
 * ## configured ≠ reachable
 *
 * Everything in this file is a pure function over the product row and the
 * environment. It answers *"is this source configured"* and nothing else.
 * Whether the source actually answers is a different claim, established only by
 * collecting from it — which is why `EvidenceSourceStatus` carries no `ok`
 * field and why the UI pairs each source with what was last *observed* from it.
 * Gotcha 5 is the same mistake in the accounts table: a state that reads
 * connected because somebody wrote the word down.
 */
import { mcpEnvNames } from '../connectors/mcp.js';
import type { EvidenceKind } from './model.js';

export const EVIDENCE_SOURCE_IDS = [
  'website',
  'app_store',
  'mcp',
  'github',
  'screenshots',
  'operator_brief',
] as const;

export type EvidenceSourceId = (typeof EVIDENCE_SOURCE_IDS)[number];

export interface EvidenceSourceStatus {
  id: EvidenceSourceId;
  /** Shown to the operator. Never names a specific product. */
  label: string;
  /** Configured well enough to attempt collection. Not a reachability claim. */
  configured: boolean;
  /** Why it is or is not configured, in one line an operator can act on. */
  detail: string;
  /** What this source writes into `product_evidence` when it succeeds. */
  evidenceKind: EvidenceKind;
  /** Which agent reasons over that evidence, for the UI. */
  agent: string;
}

/** What `discoverEvidenceSources` needs. A subset of the products row. */
export interface SourceDiscoveryInput {
  id: string;
  brief_markdown?: string | null;
  connector_type?: 'mcp' | 'rest' | 'github' | 'none' | null;
  connector_config?: Record<string, unknown> | null;
  destinations?: { web?: string; app_store?: string } | null;
  website_url?: string | null;
  app_store_url?: string | null;
  /** Described screenshots already captured. Counted by the caller. */
  describedScreenshots?: number;
}

const LABELS: Record<EvidenceSourceId, string> = {
  website: 'Website',
  app_store: 'App Store listing',
  mcp: 'MCP server',
  github: 'Repository',
  screenshots: 'Screenshots',
  operator_brief: 'Operator brief',
};

/**
 * What this product can be read from, right now.
 *
 * Deterministic and offline. Ordered richest-first, which is also roughly the
 * order in which they are worth configuring.
 */
export function discoverEvidenceSources(
  product: SourceDiscoveryInput,
  env: NodeJS.ProcessEnv = process.env,
): EvidenceSourceStatus[] {
  const web = product.destinations?.web ?? product.website_url ?? null;
  const listing = product.destinations?.app_store ?? product.app_store_url ?? null;
  const config = product.connector_config ?? {};
  const shots = product.describedScreenshots ?? 0;

  const sources: EvidenceSourceStatus[] = [];

  sources.push({
    id: 'website',
    label: LABELS.website,
    configured: Boolean(web),
    detail: web
      ? `Reading ${web}`
      : 'No website set. Add one on the product page — it is the most common single source.',
    evidenceKind: 'web_page',
    agent: 'product-discovery',
  });

  // ── MCP ──────────────────────────────────────────────────────────────────
  //
  // Three distinguishable states, because they need three different actions:
  // not chosen, chosen but unset in this environment, and ready.
  if (product.connector_type === 'mcp') {
    const { urlEnv } = mcpEnvNames(product);
    const configured = Boolean(env[urlEnv]);
    sources.push({
      id: 'mcp',
      label: LABELS.mcp,
      configured,
      detail: configured
        ? `Reading the tool surface via ${urlEnv}`
        : `${urlEnv} is not set in this environment, so the server cannot be reached from here.`,
      evidenceKind: 'connector_surface',
      agent: 'code-intelligence',
    });
  } else {
    sources.push({
      id: 'mcp',
      label: LABELS.mcp,
      configured: false,
      detail:
        'Optional. If the product exposes an MCP server, its tool list is the strongest ' +
        'evidence of what the product actually does.',
      evidenceKind: 'connector_surface',
      agent: 'code-intelligence',
    });
  }

  // ── Repository ───────────────────────────────────────────────────────────
  const repoConfigured =
    product.connector_type === 'github' &&
    typeof config.owner === 'string' &&
    config.owner.length > 0 &&
    typeof config.repo === 'string' &&
    config.repo.length > 0 &&
    Boolean(env[String(config.token_env ?? 'GITHUB_TOKEN')]);
  sources.push({
    id: 'github',
    label: LABELS.github,
    configured: repoConfigured,
    detail: repoConfigured
      ? `Reading ${String(config.owner)}/${String(config.repo)}`
      : product.connector_type === 'github'
        ? 'Owner, repo and a token are all needed before a repository can be read.'
        : 'Optional. Shipped features come from merged pull requests when there is no product API.',
    evidenceKind: 'repository',
    agent: 'code-intelligence',
  });

  sources.push({
    id: 'app_store',
    label: LABELS.app_store,
    configured: Boolean(listing),
    detail: listing
      ? `Reading ${listing}`
      : 'Optional. Only meaningful for a product that ships in an app store.',
    evidenceKind: 'app_store_listing',
    agent: 'store-listing',
  });

  sources.push({
    id: 'screenshots',
    label: LABELS.screenshots,
    configured: shots > 0,
    detail:
      shots > 0
        ? `${shots} described screenshot${shots === 1 ? '' : 's'} available`
        : 'Optional. Captured screenshots become visual evidence once they have alt text.',
    evidenceKind: 'screenshot',
    agent: 'visual-brand',
  });

  sources.push({
    id: 'operator_brief',
    label: LABELS.operator_brief,
    configured: Boolean(product.brief_markdown?.trim()),
    detail: product.brief_markdown?.trim()
      ? 'Held to the same corroboration rule as every other source'
      : 'Optional. What you write about the product is evidence, not ground truth.',
    evidenceKind: 'operator_brief',
    agent: 'product-discovery',
  });

  return sources;
}

/**
 * Whether the Brain has anything at all to reason over.
 *
 * Used to tell an operator "nothing is connected yet" rather than letting a
 * collection run finish quietly having read nothing. No single source is
 * required — that is the whole point — but *some* source has to exist.
 */
export function hasAnyEvidenceSource(sources: EvidenceSourceStatus[]): boolean {
  return sources.some((s) => s.configured);
}
