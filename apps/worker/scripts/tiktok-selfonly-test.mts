/**
 * One real Direct Post to TikTok, visible only to the creator. §198.
 *
 * `SELF_ONLY` is the closest thing Direct Post has to a draft: the video is
 * genuinely posted and genuinely private. TikTok's inbox-draft path needed the
 * `video.upload` scope, which the developer portal never granted (§179), so this
 * is the safe way to exercise the real posting endpoint.
 *
 * The creator's choices are supplied explicitly, as the adapter requires — it
 * refuses to invent a privacy level, which is the whole point of §179.
 */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import {
  getAdapter, openToken, interpretPublishStatus,
  type PublishAccount, type PublishAsset, type PublishItem,
} from '@halyard/core';

async function main(): Promise<void> {
  const env = JSON.parse(readFileSync(process.env.RV!, 'utf8')) as Record<string, string>;
  process.env.TOKEN_ENCRYPTION_KEY = env.TOKEN_ENCRYPTION_KEY;
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2, connectionTimeoutMillis: 20_000 });

  try {
    const row = (
      await pool.query(
        `select handle, platform_user_id, capability_state, access_token_enc, refresh_token_enc,
                token_expires_at, scopes
           from social_accounts where platform = 'tiktok' and access_token_enc is not null`,
      )
    ).rows[0];
    if (!row) throw new Error('TikTok is not connected.');

    const account: PublishAccount = {
      id: 'tt-test',
      platform: 'tiktok',
      handle: row.handle,
      platformUserId: row.platform_user_id,
      capabilityState: row.capability_state,
      tokens: {
        accessToken: openToken(row.access_token_enc),
        refreshToken: row.refresh_token_enc ? openToken(row.refresh_token_enc) : null,
        expiresAt: row.token_expires_at ? new Date(row.token_expires_at) : null,
        scopes: row.scopes ?? [],
      },
    };

    const asset: PublishAsset = {
      id: '14b6e940-ecdf-4fe1-b70d-6f4c1564cf75',
      publicUrl: 'https://halyard-ten.vercel.app/media/14b6e940-ecdf-4fe1-b70d-6f4c1564cf75',
      mimeType: 'video/mp4', kind: 'video', width: 1080, height: 1920, durationSeconds: 23.37,
      altText: 'A gluten-free apple pie, before and after the swap.',
    };

    const now = new Date().toISOString();
    const item: PublishItem = {
      id: 'tt-test',
      platform: 'tiktok',
      format: 'video',
      body: '[Halyard test] Gluten-free apple pie. Private test post.',
      hashtags: ['glutenfree', 'baking'],
      tiktokOptions: {
        privacyLevel: 'SELF_ONLY',
        allowComment: false, allowDuet: false, allowStitch: false,
        commercialContent: false, brandOrganic: false, brandedContent: false,
        musicConfirmedAt: now, creatorInfoFetchedAt: now,
      },
    };

    console.log(`Direct Posting to ${row.handle} as SELF_ONLY …`);
    const result = await getAdapter('tiktok').publish(item, [asset], account);
    console.log('  mode       :', result.mode);
    console.log('  publish id :', result.platformPostId ?? '(none)');

    /* An accepted init is not a post. Poll until TikTok says what happened. */
    if (result.platformPostId) {
      const adapter = getAdapter('tiktok');
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const raw = await adapter.fetchStatus!(result.platformPostId, account);
        const state = interpretPublishStatus({ status: raw });
        console.log(`  poll ${String(i + 1).padStart(2)} : ${raw} → ${state}`);
        if (state === 'published' || state.startsWith('failed')) break;
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error('FAILED:', String(e).slice(0, 400)); process.exit(1); });
