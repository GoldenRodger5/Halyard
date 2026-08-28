/**
 * Rehearse one canonical idea across every connected account. §200.
 *
 * Builds the exact request each platform would receive, using the real stored
 * credentials, and **sends nothing** — `dryRunPublish` swaps in a recording
 * fetch and a virtual clock, so the adapter runs its true code path against a
 * stub. No kill switch is touched and no publication is recorded.
 *
 * This is the thing that used to be impossible: Instagram, TikTok and YouTube
 * all poll a container, and before the clock was injectable a rehearsal ran for
 * five wall-clock minutes and died of heap exhaustion.
 */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import {
  dryRunPublish,
  getAdapter,
  openToken,
  resolveVariant,
  type PublishAccount,
  type PublishAsset,
  type PublishItem,
} from '@halyard/core';

const IDEA = {
  title: 'Five salmon mistakes',
  body: 'Most salmon is ruined before it hits the pan. Five fixes, none of them "cook it less".',
  hashtags: ['salmon', 'cooking', 'recipefix'],
  link: 'https://recipefix.app/?utm_source=rehearsal&utm_medium=social',
};

/** A vertical render, the shape Halyard actually produces today. */
const VERTICAL: PublishAsset = {
  id: 'rehearsal-asset',
  publicUrl: 'https://halyard-ten.vercel.app/media/rehearsal-asset',
  mimeType: 'video/mp4',
  kind: 'video',
  width: 1080,
  height: 1920,
  durationSeconds: 34,
};

async function main(): Promise<void> {
  const env = JSON.parse(readFileSync(process.env.RV!, 'utf8')) as Record<string, string>;
  process.env.TOKEN_ENCRYPTION_KEY = env.TOKEN_ENCRYPTION_KEY;
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2, connectionTimeoutMillis: 20_000 });

  try {
    const rows = (
      await pool.query(
        `select id, platform, handle, platform_user_id, capability_state,
                access_token_enc, refresh_token_enc, token_expires_at, scopes
           from social_accounts
          where access_token_enc is not null
          order by platform`,
      )
    ).rows;

    console.log(`\nRehearsing one idea across ${rows.length} connected accounts. Nothing is sent.\n`);
    console.log('='.repeat(78));

    for (const row of rows) {
      const platform = row.platform as string;
      const account: PublishAccount = {
        id: row.id,
        platform: platform as PublishAccount['platform'],
        handle: row.handle,
        platformUserId: row.platform_user_id,
        capabilityState: row.capability_state,
        tokens: {
          accessToken: openToken(row.access_token_enc),
          refreshToken: row.refresh_token_enc ? openToken(row.refresh_token_enc) : null,
          expiresAt: row.token_expires_at ? new Date(row.token_expires_at) : null,
          scopes: row.scopes ?? [],
        },
        meta: {},
      } as PublishAccount;

      const adapter = getAdapter(platform);
      const textOnly = platform === 'x' || platform === 'threads';

      const item: PublishItem = {
        id: 'rehearsal-item',
        platform: platform as PublishItem['platform'],
        format: textOnly ? 'text' : 'video',
        formatSubtype: platform === 'youtube' ? 'short' : null,
        body: IDEA.body,
        title: IDEA.title,
        hashtags: IDEA.hashtags,
        category: 'education',
        finalLinkUrl: IDEA.link,
        requiresAiLabel: true,
        disclosureText: 'Voiceover and imagery are AI-generated.',
        // TikTok refuses to publish without explicit creator choices (§179).
        tiktokOptions:
          platform === 'tiktok'
            ? {
                privacyLevel: 'SELF_ONLY',
                allowComment: false,
                allowDuet: false,
                allowStitch: false,
                commercialContent: false,
                brandOrganic: false,
                brandedContent: false,
                /*
                 * Timestamps, not booleans. §179 requires these to be a
                 * person's actual confirmation — a rehearsal stands in for one
                 * so the request can be built, and the adapter refuses outright
                 * when they are absent, which is the behaviour worth keeping.
                 */
                musicConfirmedAt: new Date().toISOString(),
                creatorInfoFetchedAt: new Date().toISOString(),
              }
            : null,
      } as PublishItem;

      const started = Date.now();
      const result = await dryRunPublish(adapter, item, textOnly ? [] : [VERTICAL], account);
      const ms = Date.now() - started;

      const mark = result.failed ? '✗' : '✓';
      console.log(`\n${mark} ${platform.toUpperCase().padEnd(10)} ${row.handle}   (${ms}ms, ${result.requests.length} requests)`);
      console.log(`   ${result.wouldHave}`);

      if (platform === 'youtube') {
        const v = resolveVariant('short', VERTICAL);
        console.log(`   variant: ${v.actual}${v.mismatch ? ' — MISMATCH' : ''} — ${v.reason}`);
      }

      for (const req of result.requests) {
        const url = req.url.length > 96 ? `${req.url.slice(0, 96)}…` : req.url;
        console.log(`     ${req.method.padEnd(5)} ${url}`);
      }

      /* The safety property, asserted rather than asserted-about. */
      const leaked = JSON.stringify(result.requests).includes(account.tokens.accessToken);
      if (leaked) console.log('   !! ACCESS TOKEN APPEARS IN THE RECORDED REQUESTS');
    }

    console.log(`\n${'='.repeat(78)}`);
    const pubs = (await pool.query('select count(*)::int as n from publications')).rows[0].n;
    const ks = (await pool.query('select publishing_enabled from settings limit 1')).rows[0];
    console.log(`publications: ${pubs}   publishing_enabled: ${ks?.publishing_enabled}   — unchanged\n`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
