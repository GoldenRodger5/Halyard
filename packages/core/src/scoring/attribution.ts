/**
 * Attribution. v1 §9.
 *
 * Every link is stamped at schedule time, and `utm_content` is the content
 * item's UUID — the join key between a post and a PostHog cohort.
 *
 * HARD PREREQUISITE, stated in v1 §9 and repeated here because it is the single
 * highest-leverage hour in the plan: RecipeFix must capture UTMs. Without that,
 * everything downstream of `stampUtm` produces zeroes rather than errors, which
 * is the worst kind of failure. `attributionReadiness()` exists so the UI can
 * say "not wired up yet" instead of rendering an empty funnel as if it were bad
 * performance.
 */

export interface UtmParams {
  platform: string;
  category: string;
  contentItemId: string;
  persona?: string;
  seriesName?: string;
}

export function stampUtm(rawUrl: string, params: UtmParams): string {
  const url = new URL(rawUrl);
  url.searchParams.set('utm_source', params.platform);
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', params.category);
  url.searchParams.set('utm_content', params.contentItemId);
  if (params.seriesName) {
    url.searchParams.set('utm_term', params.seriesName.toLowerCase().replace(/\s+/g, '-'));
  }
  return url.toString();
}

export function readUtmContent(url: string): string | null {
  try {
    return new URL(url).searchParams.get('utm_content');
  } catch {
    return null;
  }
}

export interface AttributionRow {
  contentItemId: string;
  sessions: number;
  signups: number;
  activatedUsers: number;
  adaptations: number;
  saves: number;
  cookStarts: number;
  paidConversions: number;
}

/**
 * The activation cohort, defined once here rather than in a PostHog saved
 * insight, so the definition is versioned with the code:
 *
 *   adapted a recipe AND (saved OR started Cook Mode) in the first session
 */
export const ACTIVATION_DEFINITION =
  'adapted a recipe AND (saved a recipe OR started Cook Mode) within the first session';

export interface PostHogQueryConfig {
  host: string;
  projectId: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

/**
 * HogQL over the events table, grouped by utm_content. One query per day rather
 * than one per post — PostHog rate limits per project, not per row.
 */
export function buildAttributionQuery(sinceIso: string): string {
  return `
select
  properties.$initial_utm_content as content_item_id,
  count(distinct properties.$session_id)                                          as sessions,
  count(distinct if(event = 'user_signed_up', person_id, null))                   as signups,
  count(distinct if(event = 'recipe_adapted', person_id, null))                   as adaptations,
  count(distinct if(event = 'recipe_saved', person_id, null))                     as saves,
  count(distinct if(event = 'cook_mode_started', person_id, null))                as cook_starts,
  count(distinct if(event = 'subscription_started', person_id, null))             as paid_conversions
from events
where timestamp > toDateTime('${sinceIso}')
  and properties.$initial_utm_medium = 'social'
  and properties.$initial_utm_content is not null
group by content_item_id
`.trim();
}

export async function fetchAttribution(
  config: PostHogQueryConfig,
  sinceIso: string,
): Promise<AttributionRow[]> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `${config.host.replace(/\/$/, '')}/api/projects/${config.projectId}/query/`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: { kind: 'HogQLQuery', query: buildAttributionQuery(sinceIso) },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`PostHog query failed: HTTP ${response.status}`);
  }

  const body = (await response.json()) as { results?: unknown[][] };
  return (body.results ?? []).map((row) => {
    const [contentItemId, sessions, signups, adaptations, saves, cookStarts, paid] = row as [
      string,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    return {
      contentItemId,
      sessions: Number(sessions ?? 0),
      signups: Number(signups ?? 0),
      adaptations: Number(adaptations ?? 0),
      saves: Number(saves ?? 0),
      cookStarts: Number(cookStarts ?? 0),
      paidConversions: Number(paid ?? 0),
      // Activation is the intersection, not a separate event.
      activatedUsers: Math.min(Number(adaptations ?? 0), Number(saves ?? 0) + Number(cookStarts ?? 0)),
    };
  });
}

/**
 * Is attribution actually wired up end to end? The answer decides whether
 * /analytics shows a funnel or an explanation.
 */
export function attributionReadiness(input: {
  postsWithStampedLinks: number;
  attributionRowsSeen: number;
  postHogConfigured: boolean;
}): { ready: boolean; message: string } {
  if (!input.postHogConfigured) {
    return {
      ready: false,
      message: 'PostHog is not configured. Set POSTHOG_PROJECT_API_KEY, POSTHOG_HOST and POSTHOG_PROJECT_ID.',
    };
  }
  if (input.postsWithStampedLinks === 0) {
    return { ready: false, message: 'No published post carries a UTM-stamped link yet.' };
  }
  if (input.attributionRowsSeen === 0) {
    return {
      ready: false,
      message:
        `${input.postsWithStampedLinks} posts carry stamped links but PostHog has returned no rows. ` +
        'The usual cause is that the product does not capture UTM parameters — check that $initial_utm_content is being set on the other side.',
    };
  }
  return { ready: true, message: `${input.attributionRowsSeen} attributed posts.` };
}
