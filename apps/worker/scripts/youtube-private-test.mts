/**
 * One real upload to YouTube, private. §198.
 *
 * The safest possible live test of the whole chain: Halyard's media route on the
 * verified origin → the adapter → YouTube's resumable upload → a publication
 * record. An unaudited Google client can only upload as `privacyStatus: private`,
 * which the adapter already sets, so the video exists on the channel and nobody
 * but its owner can see it.
 *
 * It calls the adapter directly rather than flipping `publishing_enabled`. The
 * kill switch governs *autonomous* publishing — the scheduler acting on its own
 * — and turning it on to test one thing would arm every other path for as long
 * as it stayed on. This is one operator-authorised upload, and it stays that.
 */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { getAdapter, openToken, type PublishAccount, type PublishAsset, type PublishItem } from '@halyard/core';

async function main(): Promise<void> {
  const env = JSON.parse(readFileSync(process.env.RV!, 'utf8')) as Record<string, string>;
  process.env.TOKEN_ENCRYPTION_KEY = env.TOKEN_ENCRYPTION_KEY;
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2, connectionTimeoutMillis: 20_000 });

  try {
    const row = (
      await pool.query(
        `select handle, platform_user_id, capability_state, access_token_enc, refresh_token_enc,
                token_expires_at, scopes
           from social_accounts where platform = 'youtube' and access_token_enc is not null`,
      )
    ).rows[0];
    if (!row) throw new Error('YouTube is not connected.');

    const account: PublishAccount = {
      id: 'yt-test',
      platform: 'youtube',
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
      mimeType: 'video/mp4',
      kind: 'video',
      width: 1080,
      height: 1920,
      durationSeconds: 23.37,
      altText: 'A gluten-free apple pie, before and after the swap.',
    };

    const item: PublishItem = {
      id: 'yt-test',
      platform: 'youtube',
      format: 'video',
      title: '[Halyard test] Gluten-free apple pie — private',
      body: 'Private test upload from Halyard. Not for distribution.',
      altText: asset.altText,
      hashtags: ['glutenfree', 'baking'],
    };

    console.log(`Uploading to ${row.handle} as PRIVATE …`);
    const result = await getAdapter('youtube').publish(item, [asset], account);
    console.log('  mode        :', result.mode);
    console.log('  video id    :', result.platformPostId ?? '(none)');
    console.log('  permalink   :', result.permalink ?? '(none)');
    if (result.malformedResponse) console.log('  NOTE: response did not carry an id');
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error('FAILED:', String(e).slice(0, 400)); process.exit(1); });
