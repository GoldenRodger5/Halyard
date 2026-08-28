/**
 * Where did v5Ty6K5BuqE actually land? Reads only — no writes, no uploads.
 *
 * A private video is invisible on the public channel page by design, so "I
 * don't see it" is the expected symptom of both success and of it landing on
 * the wrong channel. Only the API can tell those two apart.
 */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { getAdapter, openToken, type PublishAccount } from '@halyard/core';

const VIDEO_ID = process.env.VIDEO_ID ?? 'v5Ty6K5BuqE';

async function main(): Promise<void> {
  const env = JSON.parse(readFileSync(process.env.RV!, 'utf8')) as Record<string, string>;
  process.env.TOKEN_ENCRYPTION_KEY = env.TOKEN_ENCRYPTION_KEY;
  for (const k of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET']) {
    if (env[k]) process.env[k] = env[k];
  }
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2, connectionTimeoutMillis: 20_000 });

  try {
    const row = (
      await pool.query(
        `select id, handle, platform_user_id, capability_state, access_token_enc, refresh_token_enc,
                token_expires_at, scopes
           from social_accounts where platform = 'youtube' and access_token_enc is not null`,
      )
    ).rows[0];
    if (!row) throw new Error('YouTube is not connected.');

    let tokens = {
      accessToken: openToken(row.access_token_enc),
      refreshToken: row.refresh_token_enc ? openToken(row.refresh_token_enc) : null,
      expiresAt: row.token_expires_at ? new Date(row.token_expires_at) : null,
      scopes: row.scopes ?? [],
    };

    const adapter = getAdapter('youtube');
    const clientId = process.env.YOUTUBE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID ?? '';
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? '';

    const stale = !tokens.expiresAt || tokens.expiresAt.getTime() - Date.now() < 60_000;
    if (stale && tokens.refreshToken) {
      tokens = await adapter.refresh(tokens as never, { clientId, clientSecret } as never) as never;
      console.log('token refreshed for this read');
    }

    const call = async (path: string): Promise<any> => {
      const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}`, {
        headers: { authorization: `Bearer ${tokens.accessToken}` },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body).slice(0, 400)}`);
      return body;
    };

    console.log('\n=== the channel this token controls ===');
    const mine = await call('channels?part=snippet,contentDetails,statistics&mine=true');
    for (const c of mine.items ?? []) {
      console.log(`channel id    : ${c.id}`);
      console.log(`channel title : ${c.snippet?.title}`);
      console.log(`custom url    : ${c.snippet?.customUrl ?? '(none)'}`);
      console.log(`uploads list  : ${c.contentDetails?.relatedPlaylists?.uploads}`);
      console.log(`video count   : ${c.statistics?.videoCount}`);
    }
    console.log(`stored handle in Halyard : ${row.handle}`);
    console.log(`stored platform_user_id  : ${row.platform_user_id}`);

    console.log('\n=== the video ===');
    const vid = await call(`videos?part=snippet,status,processingDetails&id=${VIDEO_ID}`);
    if (!vid.items?.length) {
      console.log(`${VIDEO_ID}: NOT VISIBLE to this token (deleted, or owned by another channel)`);
    } else {
      for (const v of vid.items) {
        console.log(`id            : ${v.id}`);
        console.log(`title         : ${v.snippet?.title}`);
        console.log(`owning channel: ${v.snippet?.channelTitle}  (${v.snippet?.channelId})`);
        console.log(`privacy       : ${v.status?.privacyStatus}`);
        console.log(`upload status : ${v.status?.uploadStatus}`);
        console.log(`processing    : ${v.processingDetails?.processingStatus ?? 'n/a'}`);
        console.log(`published at  : ${v.snippet?.publishedAt}`);
      }
    }

    console.log('\n=== everything this token has ever uploaded ===');
    const up = mine.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (up) {
      const list = await call(`playlistItems?part=snippet,status&maxResults=10&playlistId=${up}`);
      if (!list.items?.length) console.log('(no uploads on this channel)');
      for (const i of list.items ?? []) {
        console.log(`- ${i.snippet?.resourceId?.videoId}  ${i.status?.privacyStatus?.padEnd(8)}  ${i.snippet?.title}`);
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
