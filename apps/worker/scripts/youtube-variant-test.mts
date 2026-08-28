/**
 * One real private upload that exercises the §199 path, then reads it back.
 * §199 verification.
 *
 * The earlier upload (`v5Ty6K5BuqE`) went through the *old* code. This one
 * exercises what actually changed — variant resolution, the per-item category
 * that used to be hardcoded to Howto & Style, the Shorts title assembly, and
 * the validation — and then asks YouTube what it stored, because the only proof
 * that metadata was applied is reading it back off the platform.
 *
 * **`scheduledAt` is deliberately not set.** `status.publishAt` schedules a
 * genuinely public video; "testing" it live means publishing. Its request shape
 * is verified by rehearsal instead, where nothing is sent.
 */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import {
  categoryIdFor,
  getAdapter,
  openToken,
  resolveVariant,
  validateYouTubeUpload,
  type PublishAccount,
  type PublishAsset,
  type PublishItem,
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
           from social_accounts where platform = 'youtube' and access_token_enc is not null`,
      )
    ).rows[0];
    if (!row) throw new Error('YouTube is not connected in this database.');

    const adapter = getAdapter('youtube');
    let tokens = {
      accessToken: openToken(row.access_token_enc),
      refreshToken: row.refresh_token_enc ? openToken(row.refresh_token_enc) : null,
      expiresAt: row.token_expires_at ? new Date(row.token_expires_at) : null,
      scopes: row.scopes ?? [],
    };

    const clientId = env.GOOGLE_CLIENT_ID ?? '';
    const clientSecret = env.GOOGLE_CLIENT_SECRET ?? '';
    if (!tokens.expiresAt || tokens.expiresAt.getTime() - Date.now() < 120_000) {
      tokens = (await adapter.refresh(tokens as never, { clientId, clientSecret } as never)) as never;
      console.log('· refreshed the access token for this run');
    }

    const account: PublishAccount = {
      id: 'yt-variant-test',
      platform: 'youtube',
      handle: row.handle,
      platformUserId: row.platform_user_id,
      capabilityState: row.capability_state,
      tokens,
      meta: {},
    } as PublishAccount;

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

    /* `education`, so the upload must NOT land in category 26. */
    const item: PublishItem = {
      id: 'yt-variant-test',
      platform: 'youtube',
      format: 'video',
      formatSubtype: 'short',
      category: 'education',
      title: '[Halyard test] Variant path — private',
      body: 'Private test upload exercising the §199 variant path. Not for distribution.',
      hashtags: ['#glutenfree', '#baking'],
      finalLinkUrl: 'https://recipefix.app/?utm_source=halyard_test',
      requiresAiLabel: false,
      scheduledAt: null,
    } as PublishItem;

    // ── What the new code decides, before anything is sent ──────────────────
    const resolution = resolveVariant('short', asset);
    console.log('\nvariant       :', resolution.actual, resolution.mismatch ? '(MISMATCH)' : '');
    console.log('reason        :', resolution.reason);
    console.log('category      :', categoryIdFor(item.category), '(26 would mean the hardcode survived)');
    const issues = validateYouTubeUpload({
      variant: resolution.actual,
      asset,
      title: item.title!,
      description: item.body,
      tags: item.hashtags.map((t) => t.replace(/^#/, '')),
      privacyStatus: 'private',
    });
    console.log('validation    :', issues.length === 0 ? 'clean' : JSON.stringify(issues));

    console.log(`\nUploading to ${row.handle} as PRIVATE …`);
    const result = await adapter.publish(item, [asset], account);
    console.log('  mode        :', result.mode);
    console.log('  video id    :', result.platformPostId ?? '(none)');
    console.log('  permalink   :', result.permalink ?? '(none)');
    console.log('  manual url  :', result.manualPublishUrl ?? '(none — scheduled or public)');

    // ── Read it back. Metadata is only proven by what the platform stored ───
    const id = result.platformPostId;
    if (!id) throw new Error('no video id returned');
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${id}`,
      { headers: { authorization: `Bearer ${tokens.accessToken}` } },
    );
    const body = (await res.json()) as any;
    const v = body.items?.[0];
    console.log('\n── what YouTube actually stored ──');
    console.log('  title       :', v?.snippet?.title);
    console.log('  categoryId  :', v?.snippet?.categoryId);
    console.log('  tags        :', JSON.stringify(v?.snippet?.tags));
    console.log('  privacy     :', v?.status?.privacyStatus);
    console.log('  publishAt   :', v?.status?.publishAt ?? '(none — correct, not scheduled)');
    console.log('  description :');
    console.log(String(v?.snippet?.description ?? '').split('\n').map((l: string) => `      ${l}`).join('\n'));

    const ok =
      v?.snippet?.categoryId === '27' &&
      /#Shorts/.test(v?.snippet?.title ?? '') &&
      v?.status?.privacyStatus === 'private';
    console.log(`\n${ok ? '✓' : '✗'} §199 path verified against the real API`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error('FAILED:', String(e).slice(0, 600)); process.exit(1); });
