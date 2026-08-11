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
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
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

/**
 * Platforms whose Blotato target object has an `altText` field.
 *
 * From the OpenAPI reference: Instagram (max 1,000 characters) and Pinterest
 * (max 500). No other target accepts it. This is not a gap a probe can close.
 */
const ALT_TEXT_SUPPORTED = new Set<PlatformId>(['instagram', 'pinterest']);

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

/**
 * Put a local file on the provider's CDN and return its public URL.
 *
 * Blotato fetches media by URL, so a rendered video sitting on a laptop is
 * unreachable to it. `/v2/media/uploads` hands back a presigned URL to PUT the
 * bytes to, which is what makes the TikTok question answerable before this is
 * deployed anywhere.
 */
async function uploadLocalMedia(filePath: string): Promise<string> {
  const info = await stat(filePath);
  const bytes = await readFile(filePath);
  console.log(
    `  ${DIM}uploading ${path.basename(filePath)} (${(info.size / 1_000_000).toFixed(1)} MB)${RESET}`,
  );

  const created = (await api('/media/uploads', {
    method: 'POST',
    body: JSON.stringify({ filename: path.basename(filePath) }),
  })) as { presignedUrl?: string; publicUrl?: string };

  if (!created.presignedUrl || !created.publicUrl) {
    throw new Error(`No presigned URL returned: ${JSON.stringify(created).slice(0, 200)}`);
  }

  const put = await fetch(created.presignedUrl, {
    method: 'PUT',
    body: new Uint8Array(bytes),
    headers: { 'content-type': 'video/mp4' },
  });
  if (!put.ok) {
    throw new Error(`Upload failed: HTTP ${put.status} ${(await put.text()).slice(0, 200)}`);
  }

  return created.publicUrl;
}

interface ConnectedAccount {
  id: string;
  platform?: string;
  username?: string;
  fullname?: string;
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
  videoUrl: string | null,
  resumeId: string | null,
): Promise<Partial<PlatformCapability>> {
  heading('1. TikTok — does it publish publicly, or only to drafts?');

  const account = accounts.find((a) => a.platform === 'tiktok');
  if (!account) {
    unknown('no TikTok account connected', 'connect one at my.blotato.com/settings, then re-run');
    return { publish: 'unknown', publishesPublicly: 'unknown', notes: ['No TikTok account connected.'] };
  }
  ok('TikTok account connected', account.username ?? account.id);

  // A submission takes minutes to settle. Resuming from one already sent means
  // a re-run costs nothing rather than another post on a real account.
  if (resumeId) {
    return settleTikTok(resumeId);
  }

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

  if (!videoUrl) {
    // TikTok takes video or photo, never text. Blotato fetches media by URL, so
    // the file has to be reachable from the public internet — a localhost asset
    // path cannot settle this, and pretending otherwise would produce a failure
    // that says nothing about the audit.
    unknown(
      'no publicly reachable video',
      'pass --video <https url>, or deploy so rendered assets have public URLs',
    );
    return {
      publish: 'unknown',
      publishesPublicly: 'unknown',
      notes: [
        'Could not test: TikTok needs a video and the provider fetches media by URL, which needs a public origin.',
      ],
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
            // This may land publicly on a real brand account, so it reads as
            // something a person could have posted rather than as debug output.
            text: 'Testing the posting setup. Back shortly with actual recipes.',
            platform: 'tiktok',
            mediaUrls: videoUrl ? [videoUrl] : [],
          },
          // Every one of these is required by the schema. The interesting one is
          // privacyLevel: asking for public is the whole experiment.
          target: {
            targetType: 'tiktok',
            privacyLevel: 'PUBLIC_TO_EVERYONE',
            isDraft: false,
            disabledComments: false,
            disabledDuet: false,
            disabledStitch: false,
            isBrandedContent: false,
            isYourBrand: true,
            isAiGenerated: false,
          },
        },
      }),
    })) as { postSubmissionId?: string };

    const id = created.postSubmissionId;
    if (!id) {
      no('no submission id returned', JSON.stringify(created).slice(0, 200));
      return { publish: 'unknown', publishesPublicly: 'unknown', notes: ['Malformed response.'] };
    }

    return await settleTikTok(id);
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
 * Read a TikTok submission to a terminal state and decide what it proves.
 *
 * Separated so a re-run can resume from a submission already sent. The
 * distinction it exists to draw: **"published" is not "published publicly".**
 * TikTok forces SELF_ONLY for apps that have not cleared the Content Posting
 * audit, and a forced-private post still reports as published. If the response
 * does not state the privacy level, this returns `unknown` and says which screen
 * settles it — because recording `yes` here on the strength of a status string
 * is precisely the assumption this script exists to prevent.
 */
async function settleTikTok(id: string): Promise<Partial<PlatformCapability>> {
  let submission: {
    status?: string;
    privacyLevel?: string;
    publicUrl?: string;
    error?: string;
    errorMessage?: string;
    target?: { privacyLevel?: string };
  } = {};

  for (let attempt = 0; attempt < 40; attempt += 1) {
    submission = (await api(`/posts/${id}`)) as typeof submission;
    if (submission.status && submission.status !== 'in-progress') break;
    if (attempt === 0) {
      console.log(`  ${DIM}waiting for TikTok to finish processing (about four minutes)${RESET}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }

  if (submission.status === 'in-progress') {
    unknown('still processing after ten minutes', `resume with: pnpm verify-provider --resume ${id}`);
    return {
      publish: 'unknown',
      publishesPublicly: 'unknown',
      notes: [`Submission ${id} had not settled after ten minutes.`],
    };
  }

  const failure = submission.error ?? submission.errorMessage;
  if (submission.status === 'failed' || failure) {
    no('the provider could not publish it', String(failure ?? 'no reason given'));
    return {
      publish: 'no',
      publishesPublicly: 'no',
      notes: [`Publish failed: ${String(failure ?? 'no reason given')}`],
    };
  }

  ok('published', `status ${submission.status ?? 'unknown'}`);
  const level = submission.privacyLevel ?? submission.target?.privacyLevel;

  if (level === 'PUBLIC_TO_EVERYONE') {
    ok('published publicly', 'the provider app has cleared the Content Posting audit');
    return {
      publish: 'yes',
      publishesPublicly: 'yes',
      notes: ['Verified publishing publicly through the provider.'],
    };
  }

  if (level === 'SELF_ONLY') {
    no('forced to SELF_ONLY', 'the provider app has not cleared the audit either');
    return {
      publish: 'yes',
      publishesPublicly: 'no',
      notes: [
        'TikTok forced SELF_ONLY, so the provider is not pre-audited. Halyard uploads to drafts and you finish them in the app.',
      ],
    };
  }

  // The common case: it published, and said nothing about visibility.
  unknown(
    'published, but visibility unconfirmed',
    'the response carries no privacy level, and a forced-private post also reports as published',
  );
  console.log(
    `\n  ${DIM}Open TikTok on your phone: profile → the newest post.\n` +
      `  A padlock or an "Only you" badge means it was forced private, and the\n` +
      `  provider is not pre-audited. No badge means public posting works.\n` +
      `  Record it with: pnpm verify-provider --tiktok-public yes|no${RESET}`,
  );
  return {
    publish: 'yes',
    publishesPublicly: 'unknown',
    notes: [
      'The provider published it, but reported no privacy level, and a post forced to SELF_ONLY also reports as published. Confirm in the TikTok app.',
    ],
  };
}

/**
 * Settle one platform by publishing to it, as harmlessly as the platform allows.
 *
 * Every platform gets the least destructive setting it offers: YouTube private,
 * TikTok a draft, Pinterest a real pin on the default board (Pinterest has no
 * draft concept through this API). Instagram and Threads have neither, so those
 * are real posts and the caption says so.
 */
async function verifyPlatformByPublishing(
  platform: PlatformId,
  accounts: ConnectedAccount[],
  boards: Array<{ id: string; name: string }>,
  videoUrl: string | null,
): Promise<Partial<PlatformCapability>> {
  const account = accounts.find((a) => a.platform === TARGET_TYPE[platform]);
  if (!account) {
    unknown(platform, 'not connected to the provider');
    return { publish: 'unknown', notes: ['Not connected.'] };
  }

  const text = 'Testing the posting setup. Back shortly with actual recipes.';
  const target: Record<string, unknown> = { targetType: TARGET_TYPE[platform] };
  const mediaUrls: string[] = [];

  switch (platform) {
    case 'youtube':
      if (!videoUrl) {
        unknown(platform, 'needs --video, since YouTube takes nothing but video');
        return { publish: 'unknown', notes: ['No video supplied.'] };
      }
      mediaUrls.push(videoUrl);
      Object.assign(target, {
        title: 'Halyard posting check',
        privacyStatus: 'private',
        shouldNotifySubscribers: false,
      });
      break;
    case 'pinterest': {
      const board = boards[0];
      if (!board) {
        no(platform, 'no boards exist, and every pin needs one');
        return { publish: 'no', notes: ['No Pinterest boards exist.'] };
      }
      if (!videoUrl) {
        unknown(platform, 'needs --video or an image, since a pin must carry media');
        return { publish: 'unknown', notes: ['No media supplied.'] };
      }
      mediaUrls.push(videoUrl);
      Object.assign(target, {
        boardId: board.id,
        title: 'Halyard posting check',
        altText: 'A test pin published to confirm the posting setup works.',
      });
      break;
    }
    case 'instagram':
      if (!videoUrl) {
        unknown(platform, 'needs --video or an image, since Instagram must carry media');
        return { publish: 'unknown', notes: ['No media supplied.'] };
      }
      mediaUrls.push(videoUrl);
      Object.assign(target, {
        mediaType: 'reel',
        altText: 'A test post published to confirm the posting setup works.',
      });
      break;
    default:
      break;
  }

  try {
    const created = (await api('/posts', {
      method: 'POST',
      body: JSON.stringify({
        post: { accountId: account.id, content: { text, platform: TARGET_TYPE[platform], mediaUrls }, target },
      }),
    })) as { postSubmissionId?: string };

    if (!created.postSubmissionId) {
      no(platform, 'accepted but returned no submission id');
      return { publish: 'unknown', notes: ['Malformed response.'] };
    }

    let submission: { status?: string; error?: string; errorMessage?: string } = {};
    for (let attempt = 0; attempt < 40; attempt += 1) {
      submission = (await api(`/posts/${created.postSubmissionId}`)) as typeof submission;
      if (submission.status && submission.status !== 'in-progress') break;
      await new Promise((resolve) => setTimeout(resolve, 15_000));
    }

    const failure = submission.error ?? submission.errorMessage;
    if (submission.status === 'published') {
      ok(platform, `published, submission ${created.postSubmissionId}`);
      return {
        publish: 'yes',
        video: mediaUrls.length > 0 ? 'yes' : 'unknown',
        notes: [`Verified by publishing on ${new Date().toISOString().slice(0, 10)}. Delete the test post.`],
      };
    }
    no(platform, `${submission.status ?? 'no status'}${failure ? `: ${failure}` : ''}`);
    return { publish: 'no', notes: [`Publish failed: ${failure ?? submission.status ?? 'unknown'}`] };
  } catch (err) {
    no(platform, (err as Error).message.slice(0, 200));
    return { publish: 'no', notes: [`Publish failed: ${(err as Error).message.slice(0, 200)}`] };
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
  const matching = accounts.filter((a) => a.platform === target);
  const account = matching[0];

  const capability: PlatformCapability = {
    platform,
    // **Connected is not verified.** An account being linked in the provider
    // dashboard says nothing about whether a post to it succeeds — the app
    // review, the account type and the platform's own rules all sit between the
    // two. This said 'yes' for merely being connected, which would have let a
    // platform be switched to the unified transport on no evidence at all, and
    // that is the precise failure this script exists to prevent.
    publish: 'unknown',
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

  /**
   * Some capabilities are settled by the schema, not by a post.
   *
   * A field that does not exist in the request body cannot be sent, so no
   * amount of publishing will discover it. Alt text is the sharp case: the
   * target object accepts `altText` on Instagram and Pinterest and **nowhere
   * else**, so on X, Threads, Bluesky and YouTube this transport cannot carry
   * alt text at all. That is a schema fact, and calling it "unverified" would
   * be false modesty that hides a real accessibility regression.
   */
  capability.scheduling = 'yes'; // top-level scheduledTime, every platform
  capability.altText = ALT_TEXT_SUPPORTED.has(platform) ? 'yes' : 'no';
  // Multiple media are accepted on every platform — up to 20 mediaUrls — and a
  // carousel is what several of them produce rather than a separate mode.
  capability.carousel = 'yes';

  if (capability.altText === 'no') {
    capability.notes.push(
      'The provider has no alt-text field for this platform, so a post routed through it loses alt text. The direct adapter keeps it.',
    );
  }

  capability.notes.push(
    `Connected as ${account.username || account.fullname || account.id}, but nothing has been ` +
      `published through it. Run \`pnpm verify-provider --verify-platform ${platform}\` to settle it.`,
  );

  if (matching.length > 1) {
    // Two accounts on one platform is the founder/brand split, and the provider
    // account id has to be chosen per Halyard account rather than guessed here.
    capability.notes.push(
      `${matching.length} accounts connected on this platform (${matching
        .map((a) => a.username || a.fullname || a.id)
        .join(', ')}). Set the provider account id per account on /accounts.`,
    );
  }

  (capability.altText === 'no' ? unknown : ok)(
    platform,
    `connected as ${matching.map((a) => a.username || a.fullname || a.id).join(', ')}` +
      (capability.altText === 'no' ? ' · no alt-text support on this platform' : ''),
  );
  return capability;
}

/** Step 3. What comes back, against what a direct adapter would have given. */
async function verifyMetrics(
  capabilities: ProviderCapabilities,
  pool: pg.Pool,
): Promise<void> {
  heading('3. Metrics — what actually comes back');

  // Only posts that actually went out through this transport. Reading a
  // directly-published post's id against the provider's analytics returns 404,
  // and reporting that as "no snapshot yet" reads as a provider problem when it
  // is a category error.
  const { rows } = await pool.query<{ platform: PlatformId; platform_post_id: string }>(
    `select ci.platform, p.platform_post_id
       from publications p
       join content_items ci on ci.id = p.content_item_id
       join social_accounts sa on sa.id = ci.account_id
      where p.platform_post_id is not null and sa.transport = 'unified'
      order by p.published_at desc limit 20`,
  );

  if (rows.length === 0) {
    unknown(
      'nothing has been published through this transport yet',
      'switch an account to unified on /accounts, publish once, then re-run',
    );
  }

  for (const platform of Object.keys(capabilities.platforms) as PlatformId[]) {
    const sample = rows.find((r) => r.platform === platform);
    const capability = capabilities.platforms[platform]!;

    if (!sample) {
      const gap = DIRECT_METRICS[platform] ?? [];
      unknown(
        platform,
        `no post published through the provider. Direct would give: ${gap.join(', ')}`,
      );
      continue;
    }

    try {
      const analytics = (await api(`/posts/${sample.platform_post_id}/analytics`)) as {
        metrics?: Record<string, number | null> | null;
        history?: Array<{ metrics: Record<string, number | null> }>;
      };
      const latest =
        analytics.metrics ?? analytics.history?.[analytics.history.length - 1]?.metrics ?? {};
      const present = Object.entries(latest)
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
    playsCount: 'videoViews',
    facebookTotalVideoViewsCount: 'videoViews',
    // Present in the analytics schema, and absent from this map until the
    // reference was read — which is how the transport came to be described as
    // unable to report saves.
    savesCount: 'saves',
    clicksCount: 'linkClicks',
    followsCount: 'follows',
    profileVisitsCount: 'profileVisits',
    profileActivityCount: 'profileVisits',
    watchTimeMsAvg: 'watchTimeSeconds',
    viewTimeMsSum: 'watchTimeSeconds',
  };
  return [...new Set(fields.map((f) => map[f]).filter(Boolean) as ScoredMetric[])];
}

async function main(): Promise<void> {
  const allowPublish = process.argv.includes('--publish');
  const videoArg = process.argv.includes('--video')
    ? (process.argv[process.argv.indexOf('--video') + 1] ?? null)
    : null;
  const resumeId = process.argv.includes('--resume')
    ? (process.argv[process.argv.indexOf('--resume') + 1] ?? null)
    : null;
  const tiktokPublic = process.argv.includes('--tiktok-public')
    ? (process.argv[process.argv.indexOf('--tiktok-public') + 1] ?? null)
    : null;
  const verifyPlatformArg = process.argv.includes('--verify-platform')
    ? (process.argv[process.argv.indexOf('--verify-platform') + 1] ?? null)
    : null;

  if (tiktokPublic && !['yes', 'no'].includes(tiktokPublic)) {
    console.error('--tiktok-public takes yes or no, from looking at the post in the app.');
    process.exit(1);
  }

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
    const response = (await api('/users/me/accounts')) as { items?: ConnectedAccount[] };
    accounts = response.items ?? [];
    ok('API key works', `${accounts.length} accounts connected`);
  } catch (err) {
    no('could not reach the provider', (err as Error).message);
    await pool.end();
    process.exit(1);
  }

  // A local path is uploaded to the provider's CDN; an https URL is used as is.
  let videoUrl: string | null = null;
  if (videoArg) {
    try {
      videoUrl = /^https:\/\//.test(videoArg) ? videoArg : await uploadLocalMedia(videoArg);
      ok('media ready', videoUrl);
    } catch (err) {
      no('media upload failed', (err as Error).message);
      await pool.end();
      process.exit(1);
    }
  }

  const platforms: PlatformId[] = ['x', 'instagram', 'threads', 'pinterest', 'youtube', 'tiktok', 'bluesky'];

  /**
   * Accounts connected to the provider that Halyard cannot reach.
   *
   * The provider supports platforms Halyard has no adapter for. A connected
   * account there looks like a live channel and is not one: nothing is ever
   * drafted for it, scheduled, or published. It also consumes one of the plan's
   * twenty account slots.
   *
   * Named rather than ignored, because "connected" and "usable" looking the same
   * is the whole class of problem this script exists for.
   */
  const supported = new Set(platforms.map((platform) => TARGET_TYPE[platform]));
  const orphans = accounts.filter((a) => a.platform && !supported.has(a.platform));
  if (orphans.length > 0) {
    heading('Connected to the provider, unreachable from Halyard');
    for (const orphan of orphans) {
      no(
        orphan.platform ?? 'unknown platform',
        `${orphan.username || orphan.fullname || orphan.id} — Halyard has no ${orphan.platform} ` +
          'adapter, so nothing is drafted, scheduled or published here.',
      );
    }
    console.log(
      `\n  ${DIM}Either disconnect it in the provider dashboard, which frees an account\n` +
        `  slot, or accept that it is inert. It is not a channel until Halyard has a\n` +
        `  platform id for it: mix targets, cadence, slots, QC briefs and the profile\n` +
        `  spec all key off that.${RESET}`,
    );
  }
  const capabilities: ProviderCapabilities = {
    provider: 'blotato',
    verifiedAt: new Date().toISOString(),
    platforms: {},
  };

  // TikTok first, alone, because the whole recommendation rested on it.
  let tiktok = await verifyTikTok(accounts, allowPublish, videoUrl, resumeId);

  // The operator looked at the app and is recording what they saw. That is a
  // real observation, and the only available one for this question.
  if (tiktokPublic) {
    tiktok = {
      publish: 'yes',
      publishesPublicly: tiktokPublic === 'yes' ? 'yes' : 'no',
      notes: [
        tiktokPublic === 'yes'
          ? 'Confirmed public by the operator, in the TikTok app.'
          : 'Confirmed forced-private by the operator, in the TikTok app. The provider is not pre-audited.',
      ],
    };
    ok('recorded from the app', `public: ${tiktokPublic}`);
  }

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

  // Settle one platform by publishing to it, keeping whatever the previous run
  // proved about the others.
  if (verifyPlatformArg) {
    heading(`Publishing to ${verifyPlatformArg} to settle it`);
    const previous = await pool.query<{ capabilities: ProviderCapabilities }>(
      `select capabilities from provider_capabilities where provider = 'blotato'`,
    );
    for (const [name, was] of Object.entries(previous.rows[0]?.capabilities?.platforms ?? {})) {
      const platform = name as PlatformId;
      if (capabilities.platforms[platform] && was?.publish === 'yes') {
        capabilities.platforms[platform] = {
          ...capabilities.platforms[platform]!,
          publish: was.publish,
          publishesPublicly: was.publishesPublicly,
          video: was.video,
          notes: was.notes,
        };
      }
    }

    const pinterestAccount = accounts.find((a) => a.platform === 'pinterest');
    let boards: Array<{ id: string; name: string }> = [];
    if (verifyPlatformArg === 'pinterest' && pinterestAccount) {
      const listed = (await api(
        `/social/pinterest/boards?accountId=${encodeURIComponent(pinterestAccount.id)}`,
      )) as { items?: Array<{ id: string; name: string }> };
      boards = listed.items ?? [];
    }

    const result = await verifyPlatformByPublishing(
      verifyPlatformArg as PlatformId,
      accounts,
      boards,
      videoUrl,
    );
    capabilities.platforms[verifyPlatformArg as PlatformId] = {
      ...capabilities.platforms[verifyPlatformArg as PlatformId]!,
      ...result,
    } as PlatformCapability;
  } else {
    // Carry forward anything a previous run proved, so a read-only re-run does
    // not quietly downgrade a verified platform back to unknown.
    const previous = await pool.query<{ capabilities: ProviderCapabilities }>(
      `select capabilities from provider_capabilities where provider = 'blotato'`,
    );
    for (const [name, was] of Object.entries(previous.rows[0]?.capabilities?.platforms ?? {})) {
      const platform = name as PlatformId;
      if (capabilities.platforms[platform] && was?.publish === 'yes') {
        capabilities.platforms[platform] = {
          ...capabilities.platforms[platform]!,
          publish: was.publish,
          publishesPublicly: was.publishesPublicly,
          video: was.video,
          notes: was.notes,
        };
      }
    }
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
