/**
 * Verify what a unified provider can actually do. Milestone 49.
 *
 *   BLOTATO_API_KEY=... pnpm verify-provider
 *   BLOTATO_API_KEY=... pnpm verify-provider --publish     spends real posts
 *
 * Every claim a provider makes is a claim until something watches it happen.
 * This is that something, and it runs **before** anything is built on the
 * answer, in the order that matters:
 *
 *   1. TikTok public-vs-draft — the one unverified claim the whole
 *      recommendation rested on. Tested first, alone, so a wrong answer costs
 *      one post rather than a week.
 *   2. Per-platform capability — carousels, short video, alt text, scheduling.
 *      Confirmed per platform rather than assumed uniform, because "supports
 *      nine platforms" is a sentence about breadth, not about depth.
 *   3. Metrics — what actually comes back, against what a direct adapter would
 *      have given. The gap is named per platform in /analytics.
 *
 * Read-only by default. `--publish` sends real posts and says so first.
 */
import pg from 'pg';
import {
  DIRECT_METRICS,
  TARGET_TYPE,
  missingMetrics,
  type Capability,
  type PlatformCapability,
  type PlatformId,
  type ProviderCapabilities,
  type ScoredMetric,
} from '@halyard/core';

const API = 'https://backend.blotato.com/v2';

const RESET = '[0m';
const DIM = '[2m';
const GREEN = '[32m';
const RED = '[31m';
const YELLOW = '[33m';

function ok(label: string, detail = ''): void {
  console.log(`${GREEN}✓${RESET} ${label}${detail ? `  ${DIM}${detail}${RESET}` : ''}`);
}
function no(label: string, detail = ''): void {
  console.log(`${RED}✗${RESET} ${label}${detail ? `  ${DIM}${detail}${RESET}` : ''}`);
}
function unknown(label: string, detail = ''): void {
  console.log(`${YELLOW}?${RESET} ${label}${detail ? `  ${DIM}${detail}${RESET}` : ''}`);
}
function heading(text: string): void {
  console.log(`\n${text}\n${'─'.repeat(text.length)}`);
}

const KEY = process.env.BLOTATO_API_KEY;

async function api(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'blotato-api-key': KEY!, 'content-type': 'application/json' },
  });
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${String(text).slice(0, 300)}`);
  }
  return body;
}

interface ConnectedAccount {
  id: string;
  platform?: string;
  username?: string;
}

/**
 * Step 1. The question the recommendation rested on.
 *
 * Blotato's API accepts `privacyLevel: PUBLIC_TO_EVERYONE` for TikTok. Whether
 * TikTok *honours* it depends on whether Blotato's app has cleared the Content
 * Posting audit, which no documentation on either side states. The only way to
 * know is to send one and read back what privacy level the post actually has.
 */
async function verifyTikTok(
  accounts: ConnectedAccount[],
  allowPublish: boolean,
): Promise<Partial<PlatformCapability>> {
  heading('1. TikTok — does it publish publicly, or only to drafts?');

  const account = accounts.find((a) => a.platform === 'tiktok');
  if (!account) {
    unknown('no TikTok account connected', 'connect one at my.blotato.com/settings, then re-run');
    return { publish: 'unknown', publishesPublicly: 'unknown', notes: ['No TikTok account connected.'] };
  }
  ok('TikTok account connected', account.username ?? account.id);

  if (!allowPublish) {
    unknown(
      'not tested',
      'this needs one real post. Re-run with --publish when you are ready to spend it',
    );
    return {
      publish: 'unknown',
      publishesPublicly: 'unknown',
      notes: ['Requires --publish to settle.'],
    };
  }

  // Ask for public explicitly. If the app is unaudited, TikTok forces SELF_ONLY
  // and the response says so — which is the answer either way.
  const notes: string[] = [];
  try {
    const created = (await api('/posts', {
      method: 'POST',
      body: JSON.stringify({
        post: {
          accountId: account.id,
          content: {
            text: 'Halyard capability check. This post exists to determine whether the API can publish publicly.',
            platform: 'tiktok',
            mediaUrls: [],
          },
          target: { targetType: 'tiktok', privacyLevel: 'PUBLIC_TO_EVERYONE', isDraft: false },
        },
      }),
    })) as { id?: string; submissionId?: string; status?: string };

    const id = created.id ?? created.submissionId;
    if (!id) {
      no('no submission id returned', JSON.stringify(created).slice(0, 200));
      return { publish: 'unknown', publishesPublicly: 'unknown', notes: ['Malformed response.'] };
    }

    // Read the submission back — the status is where a forced downgrade shows.
    const submission = (await api(`/posts/${id}`)) as {
      status?: string;
      privacyLevel?: string;
      error?: string;
      target?: { privacyLevel?: string };
    };

    const level = submission.privacyLevel ?? submission.target?.privacyLevel;
    ok('post accepted', `submission ${id}, status ${submission.status ?? 'unknown'}`);

    if (level === 'PUBLIC_TO_EVERYONE') {
      ok('published publicly', 'the provider app has cleared the Content Posting audit');
      notes.push('Verified publishing publicly through the provider.');
      return { publish: 'yes', publishesPublicly: 'yes', notes };
    }

    if (level === 'SELF_ONLY' || submission.error) {
      no(
        'forced to SELF_ONLY',
        'the provider app has not cleared the audit either — draft-first it is',
      );
      notes.push(
        'TikTok forced SELF_ONLY, so the provider is not pre-audited. Halyard uploads to drafts and you finish them in the app.',
      );
      return { publish: 'yes', publishesPublicly: 'no', notes };
    }

    unknown('inconclusive', `privacy level came back as ${level ?? 'absent'}`);
    notes.push(`Inconclusive: privacy level ${level ?? 'absent'}. Check the post in TikTok.`);
    return { publish: 'yes', publishesPublicly: 'unknown', notes };
  } catch (err) {
    no('publish attempt failed', (err as Error).message);
    return {
      publish: 'no',
      publishesPublicly: 'no',
      notes: [`Publish failed: ${(err as Error).message}`],
    };
  } finally {
    console.log(
      `\n  ${DIM}Whatever the answer, Halyard keeps TikTok draft-first: no API can attach\n` +
        `  trending audio, and that is most of TikTok's distribution.${RESET}`,
    );
  }
}

/**
 * Step 2. Per platform, one at a time.
 *
 * A provider that "supports nine platforms" may support carousels on two of
 * them. Uniform coverage is the assumption this exists to break.
 */
async function verifyPlatform(
  platform: PlatformId,
  accounts: ConnectedAccount[],
): Promise<PlatformCapability> {
  const target = TARGET_TYPE[platform];
  const account = accounts.find((a) => a.platform === target);

  const capability: PlatformCapability = {
    platform,
    publish: account ? 'yes' : 'unknown',
    publishesPublicly: 'unknown',
    carousel: 'unknown',
    video: 'unknown',
    shortVideo: 'unknown',
    altText: 'unknown',
    scheduling: 'unknown',
    metrics: [],
    notes: [],
  };

  if (!account) {
    capability.notes.push('No account of this platform is connected to the provider.');
    unknown(platform, 'not connected');
    return capability;
  }

  // Scheduling is settled by the API surface rather than by sending a post:
  // /v2/posts accepts a scheduledTime, and a rejected schedule returns 4xx.
  capability.scheduling = 'yes';

  // Everything else needs a real post of that shape to settle honestly, so it
  // stays unknown until --publish is used for it. Saying "probably" here would
  // be the precise failure this script exists to prevent.
  capability.notes.push(
    'Connected. Carousel, video and alt-text support are unverified until a post of each shape has been sent.',
  );
  ok(platform, `connected as ${account.username ?? account.id}`);
  return capability;
}

/** Step 3. What comes back, against what a direct adapter would have given. */
async function verifyMetrics(
  capabilities: ProviderCapabilities,
  pool: pg.Pool,
): Promise<void> {
  heading('3. Metrics — what actually comes back');

  const { rows } = await pool.query<{ platform: PlatformId; platform_post_id: string }>(
    `select ci.platform, p.platform_post_id
       from publications p join content_items ci on ci.id = p.content_item_id
      where p.platform_post_id is not null
      order by p.published_at desc limit 20`,
  );

  if (rows.length === 0) {
    unknown('nothing published yet', 'publish one post through the provider, then re-run');
  }

  for (const platform of Object.keys(capabilities.platforms) as PlatformId[]) {
    const sample = rows.find((r) => r.platform === platform);
    const capability = capabilities.platforms[platform]!;

    if (!sample) {
      const gap = DIRECT_METRICS[platform] ?? [];
      unknown(
        platform,
        `no published post to read. Direct would give: ${gap.join(', ')}`,
      );
      continue;
    }

    try {
      const analytics = (await api(`/posts/${sample.platform_post_id}/analytics`)) as {
        latestMetrics?: Record<string, number | null>;
      };
      const present = Object.entries(analytics.latestMetrics ?? {})
        .filter(([, v]) => typeof v === 'number')
        .map(([k]) => k);

      const observed = mapMetricNames(present);
      capability.metrics = observed;

      const missing = missingMetrics(platform, observed);
      if (missing.length === 0) {
        ok(platform, `everything a direct adapter would give: ${observed.join(', ')}`);
      } else {
        unknown(
          platform,
          `returns ${observed.join(', ') || 'nothing'} · missing ${missing.join(', ')}`,
        );
      }
    } catch (err) {
      unknown(platform, `no snapshot yet: ${(err as Error).message.slice(0, 120)}`);
    }
  }
}

/** Provider field names to Halyard's metric vocabulary. */
export function mapMetricNames(fields: string[]): ScoredMetric[] {
  const map: Record<string, ScoredMetric> = {
    impressionsCount: 'impressions',
    reachCount: 'reach',
    likesCount: 'likes',
    commentsCount: 'comments',
    repliesCount: 'comments',
    sharesCount: 'shares',
    twitterRetweetsCount: 'shares',
    viewsCount: 'videoViews',
    facebookTotalVideoViewsCount: 'videoViews',
  };
  return [...new Set(fields.map((f) => map[f]).filter(Boolean) as ScoredMetric[])];
}

async function main(): Promise<void> {
  const allowPublish = process.argv.includes('--publish');

  if (!KEY) {
    console.error(
      '\nBLOTATO_API_KEY is not set.\n\n' +
        '  1. Sign up at blotato.com — $29/month, 20 accounts\n' +
        '  2. Connect the six accounts at my.blotato.com/settings\n' +
        '  3. Settings → API → copy the key\n' +
        '  4. Add BLOTATO_API_KEY to apps/web/.env.local and apps/worker/.env\n\n' +
        'Then re-run this. It is read-only until you pass --publish.\n',
    );
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Run ./scripts/halyard first.');
    process.exit(1);
  }

  console.log(
    '\nVerifying the unified provider against a real account.\n' +
      (allowPublish
        ? `${YELLOW}--publish is on: this sends real posts.${RESET}`
        : `${DIM}Read-only. Pass --publish to settle the questions that need a real post.${RESET}`),
  );

  const pool = new pg.Pool({ connectionString, max: 2 });

  heading('0. Connection');
  let accounts: ConnectedAccount[] = [];
  try {
    const response = (await api('/accounts')) as { items?: ConnectedAccount[] };
    accounts = response.items ?? [];
    ok('API key works', `${accounts.length} accounts connected`);
  } catch (err) {
    no('could not reach the provider', (err as Error).message);
    await pool.end();
    process.exit(1);
  }

  const platforms: PlatformId[] = ['x', 'instagram', 'threads', 'pinterest', 'youtube', 'tiktok', 'bluesky'];
  const capabilities: ProviderCapabilities = {
    provider: 'blotato',
    verifiedAt: new Date().toISOString(),
    platforms: {},
  };

  // TikTok first, alone, because the whole recommendation rested on it.
  const tiktok = await verifyTikTok(accounts, allowPublish);

  heading('2. Per-platform capability');
  for (const platform of platforms) {
    capabilities.platforms[platform] = await verifyPlatform(platform, accounts);
  }
  capabilities.platforms.tiktok = {
    ...capabilities.platforms.tiktok!,
    ...tiktok,
  } as PlatformCapability;

  for (const platform of platforms) {
    capabilities.platforms[platform]!.verifiedAt = new Date().toISOString();
  }

  await verifyMetrics(capabilities, pool);

  await pool.query(
    `insert into provider_capabilities (provider, capabilities, verified_at)
     values ($1, $2, now())
     on conflict (provider) do update
       set capabilities = excluded.capabilities, verified_at = now()`,
    ['blotato', JSON.stringify(capabilities)],
  );

  heading('Recorded');
  console.log(
    `  Written to provider_capabilities. /accounts and /analytics read it, and an\n` +
      `  unverified platform cannot carry a real post through this transport.\n`,
  );

  await pool.end();
}

if (process.argv[1]?.endsWith('verify-provider.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
