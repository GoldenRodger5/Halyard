/**
 * Watch terms. Milestone 43, item 4.
 *
 * A daily read-only pass over public sources, looking for the questions people
 * keep asking. Three rules, all structural rather than remembered:
 *
 *   · **Discovery only.** Nothing here can reply, follow, upvote or message.
 *     There is no code path that writes to any of these platforms, and a test
 *     asserts the absence.
 *   · **X is deliberately absent.** Reads are $0.005 each, which puts automated
 *     term-watching at $30–75/month before anything is written. The recommended
 *     alternative is doing it by hand in the app, which costs nothing.
 *   · **Recurrence, not arrival.** One person asking something is noise. The
 *     same question three times is a content idea, so promotion to a signal is
 *     by count.
 */

export type WatchSource = 'reddit' | 'rss' | 'pinterest';

export interface WatchHit {
  source: WatchSource;
  url: string;
  title: string;
  excerpt?: string;
  author?: string;
  engagement?: number;
  postedAt?: Date;
  /** True when this reads as someone asking rather than telling. */
  question: boolean;
}

export interface FetchOptions {
  fetchImpl?: typeof fetch;
  /** Identifies this client politely, as every one of these APIs asks. */
  userAgent?: string;
  limit?: number;
}

const DEFAULT_USER_AGENT =
  'halyard/1.0 (content research; read-only; contact via the product website)';

/**
 * Is this someone asking a question?
 *
 * A question mark is the strongest signal but not the only one — "why does my
 * bread come out gummy" is a question without one, and those are the most
 * useful hits because they name a failure the reader has actually had.
 */
export function looksLikeQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.includes('?')) return true;
  return /^(why|how|what|when|which|can|does|do|is|are|should|any(one|body)|help|has anyone)\b/i.test(
    trimmed,
  );
}

/**
 * Reddit's public JSON. No API key, no OAuth, no write scope available.
 *
 * `/search.json` over all of Reddit rather than one subreddit, because the
 * question "why is my gluten-free bread gummy" gets asked in a dozen places and
 * picking subreddits in advance decides the answer.
 */
export async function fetchReddit(term: string, options: FetchOptions = {}): Promise<WatchHit[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url =
    `https://www.reddit.com/search.json?q=${encodeURIComponent(term)}` +
    `&sort=new&limit=${options.limit ?? 25}&t=month`;

  const response = await fetchImpl(url, {
    headers: { 'user-agent': options.userAgent ?? DEFAULT_USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(
      `Reddit returned HTTP ${response.status} for "${term}". ` +
        (response.status === 429
          ? 'Rate limited — the public JSON endpoint allows roughly 60 requests a minute per user agent.'
          : 'The public JSON endpoint needs no credentials, so this is availability rather than auth.'),
    );
  }

  const body = (await response.json()) as {
    data?: { children?: Array<{ data?: Record<string, unknown> }> };
  };

  return (body.data?.children ?? [])
    .map((child) => child.data)
    .filter((post): post is Record<string, unknown> => Boolean(post))
    .map((post) => {
      const title = String(post.title ?? '');
      const selftext = String(post.selftext ?? '');
      return {
        source: 'reddit' as const,
        url: `https://www.reddit.com${String(post.permalink ?? '')}`,
        title,
        excerpt: selftext.slice(0, 500) || undefined,
        author: post.author ? `u/${String(post.author)}` : undefined,
        engagement: Number(post.score ?? 0) + Number(post.num_comments ?? 0),
        postedAt: post.created_utc ? new Date(Number(post.created_utc) * 1000) : undefined,
        question: looksLikeQuestion(`${title} ${selftext}`),
      };
    })
    .filter((hit) => hit.url.length > 'https://www.reddit.com'.length);
}

/**
 * Any RSS or Atom feed.
 *
 * Deliberately a regex rather than an XML parser: feeds in the wild are full of
 * malformed markup that a strict parser rejects outright, and the only fields
 * needed here are title, link and date.
 */
export async function fetchRss(feedUrl: string, options: FetchOptions = {}): Promise<WatchHit[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(feedUrl, {
    headers: { 'user-agent': options.userAgent ?? DEFAULT_USER_AGENT },
  });
  if (!response.ok) throw new Error(`Feed ${feedUrl} returned HTTP ${response.status}.`);

  const xml = await response.text();
  const items = xml.split(/<(?:item|entry)[\s>]/i).slice(1);

  return items.slice(0, options.limit ?? 25).map((chunk) => {
    const title = decodeXml(
      /<title[^>]*>([\s\S]*?)<\/title>/i.exec(chunk)?.[1] ?? 'untitled',
    );
    const link =
      /<link[^>]*href=["']([^"']+)["']/i.exec(chunk)?.[1] ??
      decodeXml(/<link[^>]*>([\s\S]*?)<\/link>/i.exec(chunk)?.[1] ?? '');
    const description = decodeXml(
      /<(?:description|summary|content)[^>]*>([\s\S]*?)<\/(?:description|summary|content)>/i.exec(
        chunk,
      )?.[1] ?? '',
    );
    const date = /<(?:pubDate|published|updated)[^>]*>([\s\S]*?)<\//i.exec(chunk)?.[1];

    return {
      source: 'rss' as const,
      url: link.trim(),
      title: title.trim(),
      excerpt: description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500) || undefined,
      postedAt: date ? new Date(date.trim()) : undefined,
      question: looksLikeQuestion(`${title} ${description}`),
    };
  }).filter((hit) => hit.url.length > 0);
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Pinterest trends.
 *
 * Pinterest has no public trends API. The authenticated endpoint needs the same
 * Standard access that gates publishing, so this returns nothing and says why
 * rather than pretending. When Standard access lands, the account token already
 * in `social_accounts` is what unlocks it.
 */
export async function fetchPinterestTrends(
  term: string,
  options: FetchOptions & { accessToken?: string } = {},
): Promise<WatchHit[]> {
  if (!options.accessToken) {
    throw new WatchSourceUnavailable(
      'pinterest',
      'Pinterest trends need Standard access, which is the same review that gates publishing. ' +
        'Until it is approved there is no public endpoint to read — track it on /submissions.',
    );
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `https://api.pinterest.com/v5/trends/keywords/US/top/growing?limit=${options.limit ?? 25}`,
    {
      headers: {
        authorization: `Bearer ${options.accessToken}`,
        'user-agent': options.userAgent ?? DEFAULT_USER_AGENT,
      },
    },
  );
  if (!response.ok) {
    throw new Error(`Pinterest trends returned HTTP ${response.status}.`);
  }

  const body = (await response.json()) as { trends?: Array<{ keyword?: string }> };
  return (body.trends ?? [])
    .filter((trend) => trend.keyword?.toLowerCase().includes(term.toLowerCase()))
    .map((trend) => ({
      source: 'pinterest' as const,
      url: `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(trend.keyword!)}`,
      title: trend.keyword!,
      question: false,
    }));
}

export class WatchSourceUnavailable extends Error {
  constructor(
    public readonly source: WatchSource,
    message: string,
  ) {
    super(message);
    this.name = 'WatchSourceUnavailable';
  }
}

/**
 * Group hits by the question being asked, so recurrence is measurable.
 *
 * Normalising to content words means "why is my gf bread gummy" and "gluten free
 * bread came out gummy why" land in the same bucket, which is the whole point —
 * the same question phrased four ways is still one question.
 */
export function questionKey(title: string): string {
  const STOP = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'my', 'i', 'me', 'to', 'of', 'in', 'on', 'for', 'and',
    'or', 'it', 'this', 'that', 'with', 'why', 'how', 'what', 'does', 'do', 'did', 'can', 'any',
    'anyone', 'help', 'so', 'but', 'from', 'at', 'be', 'been', 'has', 'have', 'out', 'up',
  ]);
  return [
    ...new Set(
      title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 2 && !STOP.has(word)),
    ),
  ]
    .sort()
    .slice(0, 6)
    .join(' ');
}

export interface RecurringQuestion {
  key: string;
  title: string;
  occurrences: number;
  urls: string[];
}

export function findRecurringQuestions(
  hits: WatchHit[],
  minOccurrences: number,
): RecurringQuestion[] {
  const buckets = new Map<string, RecurringQuestion>();

  for (const hit of hits) {
    if (!hit.question) continue;
    const key = questionKey(hit.title);
    if (!key) continue;

    const bucket = buckets.get(key) ?? { key, title: hit.title, occurrences: 0, urls: [] };
    bucket.occurrences++;
    if (bucket.urls.length < 5) bucket.urls.push(hit.url);
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .filter((bucket) => bucket.occurrences >= minOccurrences)
    .sort((a, b) => b.occurrences - a.occurrences);
}
