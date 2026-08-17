/**
 * Collecting evidence — the observing half, which contains no model at all.
 *
 * Every function here fetches something real and returns what it saw. Nothing
 * interprets, summarises or ranks, because the moment a collector starts
 * deciding what matters, the evidence store stops being a record of the world
 * and becomes a record of one function's opinion of it — and a fact traced back
 * to it would look sourced while resting on nothing observable.
 *
 * ## Why the body is stored rather than a summary
 *
 * A fact's whole worth is that it can be checked against what was actually
 * there. Storing a summary would mean checking a claim against an earlier
 * claim, which is how a system convinces itself.
 */
import { createHash } from 'node:crypto';
import type { EvidenceKind } from './model.js';

export interface CollectedEvidence {
  kind: EvidenceKind;
  sourceUrl: string | null;
  contentHash: string;
  title: string | null;
  body: string;
  meta: Record<string, unknown>;
  collector: string;
}

/**
 * The identity of an observation.
 *
 * Hashing the content rather than the URL is what makes re-collection
 * idempotent: fetching an unchanged page a second time produces the same hash,
 * collides with the existing row, and does **not** add a second corroborating
 * source. Without this, running the collector twice would verify every fact in
 * the Brain, which is corroboration by repetition — the failure this whole
 * design is arranged to prevent.
 */
export function hashContent(...parts: Array<string | null | undefined>): string {
  const h = createHash('sha256');
  for (const part of parts) h.update(part ?? '', 'utf8');
  return h.digest('hex').slice(0, 32);
}

/** How much of one page is kept. Enough to check a fact against, not a mirror. */
export const MAX_BODY_CHARS = 20_000;

/**
 * The readable text of an HTML document.
 *
 * Script and style content is removed rather than stripped of tags: a CSP
 * header or a minified bundle is not something a product says about itself,
 * and leaving it in would let a model "find" a fact in a base64 blob.
 */
export function visibleText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `<meta>` content, by name or property. Where a site states its own summary. */
export function metaContent(html: string, key: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+(?:name|property)=["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`,
    'i',
  );
  const tag = pattern.exec(html)?.[0];
  if (!tag) return null;
  const content = /content=["']([^"']*)["']/i.exec(tag)?.[1];
  return content?.trim() || null;
}

export function documentTitle(html: string): string | null {
  return /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() || null;
}

/** Same-origin links, so a crawl stays inside the product it is describing. */
export function sameOriginLinks(html: string, base: string): string[] {
  let origin: string;
  try {
    origin = new URL(base).origin;
  } catch {
    return [];
  }

  const out = new Set<string>();
  for (const match of html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)) {
    const href = match[1]!;
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    try {
      const url = new URL(href, base);
      url.hash = '';
      if (url.origin === origin) out.add(url.toString());
    } catch {
      // A malformed href is the page's problem, not a reason to stop.
    }
  }
  return [...out];
}

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export interface WebCollectOptions {
  rootUrl: string;
  maxPages?: number;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

/** How many pages one collection visits. The same ceiling the Explorer uses. */
export const MAX_WEB_PAGES = 8;

/**
 * Fetch the product's public web surface.
 *
 * Deliberately plain HTTP rather than a browser. The Explorer already drives a
 * real browser and renders SPA content; duplicating that here would be a second
 * crawler to keep working. What this adds is the part the Explorer does not
 * keep — the raw document, including the metadata a single-page app puts in its
 * shell, which is exactly where a product states its own positioning.
 */
export async function collectWebEvidence(
  options: WebCollectOptions,
): Promise<CollectedEvidence[]> {
  const fetchImpl = (options.fetchImpl ?? fetch) as FetchLike;
  const maxPages = options.maxPages ?? MAX_WEB_PAGES;
  const out: CollectedEvidence[] = [];

  const queue: string[] = [options.rootUrl];
  const visited = new Set<string>();

  while (queue.length > 0 && visited.size < maxPages) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    let html: string;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
      try {
        const response = await fetchImpl(url, { signal: controller.signal });
        if (!response.ok) continue;
        html = await response.text();
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // An unreachable page is not a failed collection. The pages that did
      // respond are still evidence, and a hard failure here would mean one
      // broken link costs the whole run.
      continue;
    }

    const text = visibleText(html);
    const description = metaContent(html, 'description') ?? metaContent(html, 'og:description');
    const keywords = metaContent(html, 'keywords');

    out.push({
      kind: 'web_page',
      sourceUrl: url,
      contentHash: hashContent(url, text.slice(0, MAX_BODY_CHARS)),
      title: documentTitle(html),
      body: text.slice(0, MAX_BODY_CHARS),
      meta: {
        description,
        keywords,
        ogTitle: metaContent(html, 'og:title'),
        length: text.length,
      },
      collector: 'web',
    });

    if (visited.size < maxPages) {
      for (const link of sameOriginLinks(html, url)) {
        if (!visited.has(link)) queue.push(link);
      }
    }
  }

  return out;
}

/**
 * The App Store listing.
 *
 * Apple renders the listing server-side and embeds it as JSON-LD, so the
 * structured record is available without an API key. That matters: the
 * alternative is App Store Connect credentials, and this is public information
 * about a public listing.
 */
export async function collectAppStoreEvidence(options: {
  listingUrl: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<CollectedEvidence[]> {
  const fetchImpl = (options.fetchImpl ?? fetch) as FetchLike;

  let html: string;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
    try {
      const response = await fetchImpl(options.listingUrl, { signal: controller.signal });
      if (!response.ok) return [];
      html = await response.text();
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return [];
  }

  /**
   * The JSON-LD block, when Apple provides one.
   *
   * Parsed defensively and never required: a listing that renders without it is
   * still evidence through its visible text. A collector that returned nothing
   * because one optional block was missing would report "no listing" for a
   * listing that plainly exists.
   */
  let structured: Record<string, unknown> | null = null;
  for (const match of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed = JSON.parse(match[1]!) as Record<string, unknown>;
      const type = parsed['@type'];
      if (type === 'SoftwareApplication' || type === 'MobileApplication') {
        structured = parsed;
        break;
      }
      structured ??= parsed;
    } catch {
      continue;
    }
  }

  const text = visibleText(html);

  return [
    {
      kind: 'app_store_listing',
      sourceUrl: options.listingUrl,
      contentHash: hashContent(options.listingUrl, text.slice(0, MAX_BODY_CHARS)),
      title: documentTitle(html),
      body: text.slice(0, MAX_BODY_CHARS),
      meta: {
        description: metaContent(html, 'description'),
        structured,
      },
      collector: 'app_store',
    },
  ];
}

/**
 * The product's own API surface, as it actually is.
 *
 * This is the closest thing to implementation truth available for a product
 * that ships without a repository — which is the case for the first connected
 * product, and the reason the Code Intelligence agent reads this rather than
 * merged pull requests. A tool the server advertises is a capability the
 * product really has, stated by the product rather than about it.
 */
export async function collectConnectorSurface(options: {
  connectorId: string;
  listTools: () => Promise<Array<{ name: string; description?: string }>>;
}): Promise<CollectedEvidence[]> {
  let tools: Array<{ name: string; description?: string }>;
  try {
    tools = await options.listTools();
  } catch {
    // An unreachable connector is a real state and already surfaced by the
    // health check. It is not evidence of anything about the product.
    return [];
  }
  if (tools.length === 0) return [];

  const body = tools
    .map((t) => `${t.name}${t.description ? `: ${t.description}` : ''}`)
    .join('\n');

  return [
    {
      kind: 'connector_surface',
      sourceUrl: `connector://${options.connectorId}`,
      contentHash: hashContent(options.connectorId, body),
      title: `${options.connectorId} API surface`,
      body: body.slice(0, MAX_BODY_CHARS),
      meta: { toolCount: tools.length, tools: tools.map((t) => t.name) },
      collector: 'connector',
    },
  ];
}

/**
 * The operator's brief, when there is one.
 *
 * Included as evidence rather than treated as ground truth. The operator is a
 * source like any other — a well-informed one — and holding the brief to the
 * same corroboration rule is what lets the Brain report that the site and the
 * brief disagree, instead of quietly preferring whichever it read last.
 */
export function collectBriefEvidence(input: {
  productId: string;
  briefMarkdown: string | null;
}): CollectedEvidence[] {
  const brief = input.briefMarkdown?.trim();
  if (!brief) return [];

  return [
    {
      kind: 'operator_brief',
      sourceUrl: `brief://${input.productId}`,
      contentHash: hashContent(input.productId, brief),
      title: 'Operator brief',
      body: brief.slice(0, MAX_BODY_CHARS),
      meta: { length: brief.length },
      collector: 'brief',
    },
  ];
}
