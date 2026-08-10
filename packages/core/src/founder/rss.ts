/**
 * RSS ingestion. Milestone 28, Part A.
 *
 * RSS rather than a paid news API: free, and higher signal for this use case.
 * The parser is hand-rolled because the alternative is a dependency for
 * something that is fundamentally "find the item tags", and feeds in the wild
 * are RSS 2.0, Atom, or a mix of both regardless of what the library expects.
 */

export interface RssItem {
  guid: string;
  url: string;
  title: string;
  summary: string | null;
  author: string | null;
  publishedAt: Date | null;
}

/** Handles RSS 2.0 and Atom, because the seeded sources use both. */
export function parseFeed(xml: string): RssItem[] {
  const entries = [
    ...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi),
    ...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi),
  ].map((m) => m[0]);

  return entries
    .map((entry) => {
      const url = tag(entry, 'link') ?? attr(entry, 'link', 'href') ?? '';
      const title = decode(tag(entry, 'title') ?? '');
      if (!title || !url) return null;

      const published =
        tag(entry, 'pubDate') ?? tag(entry, 'published') ?? tag(entry, 'updated') ?? null;

      return {
        guid: tag(entry, 'guid') ?? tag(entry, 'id') ?? url,
        url: url.trim(),
        title,
        summary: stripHtml(
          decode(tag(entry, 'description') ?? tag(entry, 'summary') ?? tag(entry, 'content') ?? ''),
        ).slice(0, 600) || null,
        author:
          decode(tag(entry, 'dc:creator') ?? tag(entry, 'author') ?? '')
            .replace(/<[^>]+>/g, '')
            .trim() || null,
        publishedAt: published ? safeDate(published) : null,
      };
    })
    .filter((item): item is RssItem => item !== null);
}

function tag(xml: string, name: string): string | null {
  const pattern = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i');
  const value = pattern.exec(xml)?.[1];
  if (value === undefined) return null;
  return value.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1').trim();
}

function attr(xml: string, name: string, attribute: string): string | null {
  const pattern = new RegExp(`<${name}[^>]*\\s${attribute}=["']([^"']+)["']`, 'i');
  return pattern.exec(xml)?.[1] ?? null;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function decode(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

function safeDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function fetchFeed(
  feedUrl: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 20_000,
): Promise<RssItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(feedUrl, {
      signal: controller.signal,
      headers: { 'user-agent': 'halyard/0.1 (+https://recipefix.app)', accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseFeed(await response.text());
  } finally {
    clearTimeout(timer);
  }
}

// ── Deduplication ──────────────────────────────────────────────────────────

const TITLE_STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is',
  'are', 'its', 'new', 'now', 'how', 'why', 'what', 'this', 'that', 'from',
]);

/**
 * A cluster key for near-duplicate titles.
 *
 * The same story arrives from five feeds with five different headlines.
 * Convergence across feeds is signal worth keeping, so items are grouped rather
 * than dropped, and the group size becomes a ranking input.
 */
export function clusterKey(title: string): string {
  return [
    ...new Set(
      title
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 2 && !TITLE_STOP_WORDS.has(word)),
    ),
  ]
    .sort()
    .slice(0, 6)
    .join('-');
}

export function titleSimilarity(a: string, b: string): number {
  const tokensA = new Set(clusterKey(a).split('-'));
  const tokensB = new Set(clusterKey(b).split('-'));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let shared = 0;
  for (const token of tokensA) if (tokensB.has(token)) shared++;
  return shared / Math.max(tokensA.size, tokensB.size);
}

export interface ClusteredItem extends RssItem {
  clusterKey: string;
  feedCount: number;
  sourceNames: string[];
}

/** Two headlines about the same story rarely share a key exactly. */
export const CLUSTER_SIMILARITY_THRESHOLD = 0.55;

export function clusterItems(
  items: Array<RssItem & { sourceName: string }>,
  threshold = CLUSTER_SIMILARITY_THRESHOLD,
): ClusteredItem[] {
  const groups: ClusteredItem[] = [];

  for (const item of items) {
    const key = clusterKey(item.title);
    // Match on similarity rather than an identical key: five outlets write five
    // different headlines about one story, and an exact key never groups them.
    const existing = groups.find(
      (group) => group.clusterKey === key || titleSimilarity(group.title, item.title) >= threshold,
    );

    if (existing) {
      existing.feedCount++;
      if (!existing.sourceNames.includes(item.sourceName)) {
        existing.sourceNames.push(item.sourceName);
      }
      // Keep the earliest publication; the first feed to carry it is the story.
      if (item.publishedAt && existing.publishedAt && item.publishedAt < existing.publishedAt) {
        existing.publishedAt = item.publishedAt;
        existing.url = item.url;
      }
      continue;
    }

    groups.push({ ...item, clusterKey: key, feedCount: 1, sourceNames: [item.sourceName] });
  }

  return groups;
}

// ── Ranking ────────────────────────────────────────────────────────────────

export interface RankingContext {
  /** Terms the founder actually works on. */
  interests: string[];
  /** Titles posted about recently, so the same story is not surfaced twice. */
  recentTitles: string[];
  now?: Date;
}

export interface RankedStory extends ClusteredItem {
  relevance: number;
  /** The actual reason, not a score. */
  rankReason: string;
  ageHours: number;
}

/**
 * Rank on relevance to the founder's work, convergence across feeds, freshness,
 * and whether it has already been covered.
 *
 * The reason is produced alongside the number because a ranked list without a
 * reason is a list you stop trusting after a week.
 */
export function rankStories(
  items: ClusteredItem[],
  context: RankingContext,
  limit = 5,
): RankedStory[] {
  const now = context.now ?? new Date();

  return items
    .map((item) => {
      const ageHours = item.publishedAt
        ? (now.getTime() - item.publishedAt.getTime()) / 3_600_000
        : 48;

      const haystack = `${item.title} ${item.summary ?? ''}`.toLowerCase();
      const matched = context.interests.filter((interest) =>
        haystack.includes(interest.toLowerCase()),
      );

      const relevanceScore = Math.min(1, matched.length / 2);
      const convergence = Math.min(1, (item.feedCount - 1) / 3);
      const freshness = ageHours <= 12 ? 1 : ageHours <= 24 ? 0.8 : ageHours <= 48 ? 0.4 : 0.1;
      const alreadyCovered = context.recentTitles.some(
        (title) => titleSimilarity(title, item.title) > 0.5,
      );

      const relevance = alreadyCovered
        ? 0
        : 0.45 * relevanceScore + 0.25 * convergence + 0.3 * freshness;

      const reasons: string[] = [];
      if (matched.length > 0) reasons.push(`touches ${matched.slice(0, 3).join(', ')}`);
      if (item.feedCount > 1) reasons.push(`carried by ${item.feedCount} feeds`);
      if (ageHours <= 12) reasons.push('broke in the last 12 hours');
      else if (ageHours > 48) reasons.push(`${Math.round(ageHours / 24)} days old, decaying`);
      if (alreadyCovered) reasons.push('you have posted about this already');

      return {
        ...item,
        relevance: Number(relevance.toFixed(4)),
        ageHours: Number(ageHours.toFixed(1)),
        rankReason: reasons.length > 0 ? reasons.join('; ') : 'no strong signal either way',
      };
    })
    .filter((story) => story.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit);
}

/** News decays. A take on a four-day-old story is dead on arrival. */
export const STORY_TTL_HOURS = 72;

export function isExpired(publishedAt: Date | null, now = new Date()): boolean {
  if (!publishedAt) return false;
  return (now.getTime() - publishedAt.getTime()) / 3_600_000 > STORY_TTL_HOURS;
}
