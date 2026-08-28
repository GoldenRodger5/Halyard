/**
 * Check every connected credential against its platform. §197.
 *
 * `selfTest` only: verify the token exists, carries the scopes it should, and
 * can perform one trivial read. That is one request per platform and it proves
 * the connection is real rather than merely stored.
 *
 * A full `dryRunPublish` was tried first and cannot work here. Instagram and
 * TikTok both poll a media container until the platform reports it finished; a
 * dry-run fetch answers with a stub that never says finished, so the loop runs
 * to its five-minute ceiling while recording every poll, and the heap dies. The
 * rehearsal is worth having, but it needs the adapters to accept an injected
 * clock — a separate change, not one to make while pointing at live accounts.
 *
 * Two instruments the codebase already has, pointed at production credentials
 * for the first time:
 *
 *   · `selfTest`  — is the token alive, does it carry the scopes, can it read?
 *   · `dryRunPublish` — build the exact request the platform would receive,
 *     record it, and stop before the network.
 *
 * This is the honest way to test five live brand accounts. X and Threads have no
 * draft concept: any real post is immediately public and, on X, billed per post.
 * A rehearsal proves the request is correct without spending either.
 *
 * Nothing here writes to a platform. `createDryRunFetch` intercepts every call.
 */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import {
  dryRunPublish,
  getAdapter,
  openToken,
  selfTest,
  PLATFORM_SCOPES,
  type PlatformId,
  type PublishAccount,
  type PublishAsset,
  type PublishItem,
} from '@halyard/core';

async function main(): Promise<void> {
  const env = JSON.parse(readFileSync(process.env.RV!, 'utf8')) as Record<string, string>;
process.env.TOKEN_ENCRYPTION_KEY = env.TOKEN_ENCRYPTION_KEY;

const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2, connectionTimeoutMillis: 20_000 });

/** A real rendered asset already in production, served from the verified origin. */
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

const baseItem = (platform: PlatformId): PublishItem => ({
  id: 'rehearsal',
  platform,
  format: 'video',
  body: 'Store-bought apple pie has a gluten problem. This one does not — same crumb, same caramelised top, no wheat.',
  title: 'Gluten-free apple pie, same crumb',
  altText: asset.altText,
  hashtags: ['glutenfree', 'applepie', 'baking'],
  /* TikTok refuses without a completed panel; these are the creator's choices. */
  tiktokOptions:
    platform === 'tiktok'
      ? {
          privacyLevel: 'SELF_ONLY',
          allowComment: true,
          allowDuet: false,
          allowStitch: false,
          commercialContent: false,
          brandOrganic: false,
          brandedContent: false,
          musicConfirmedAt: new Date().toISOString(),
          creatorInfoFetchedAt: new Date().toISOString(),
        }
      : null,
});

const rows = (
  await pool.query<{
    platform: PlatformId;
    handle: string;
    platform_user_id: string | null;
    capability_state: string;
    access_token_enc: Buffer;
    refresh_token_enc: Buffer | null;
    token_expires_at: string | null;
    scopes: string[] | null;
    meta: unknown;
  }>(
    `select platform, handle, platform_user_id, capability_state, access_token_enc,
            refresh_token_enc, token_expires_at, scopes
       from social_accounts
      where access_token_enc is not null
      order by platform`,
  )
).rows;

console.log(`\nRehearsing against ${rows.length} connected accounts. Nothing is sent.\n`);

for (const row of rows) {
  const adapter = getAdapter(row.platform);
  const account: PublishAccount = {
    id: 'rehearsal',
    platform: row.platform,
    handle: row.handle,
    platformUserId: row.platform_user_id,
    capabilityState: row.capability_state as never,
    tokens: {
      accessToken: openToken(row.access_token_enc),
      refreshToken: row.refresh_token_enc ? openToken(row.refresh_token_enc) : null,
      expiresAt: row.token_expires_at ? new Date(row.token_expires_at) : null,
      scopes: row.scopes ?? [],
    },
  };

  console.log('─'.repeat(70));
  console.log(`${row.platform.toUpperCase()}  ${row.handle}  (${row.capability_state})`);

  /* 1. Is the credential actually alive? This does read from the platform. */
  const st = await selfTest(adapter, account, PLATFORM_SCOPES[row.platform] ?? []);
  for (const c of st.checks) {
    console.log(`   ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ` — ${String(c.detail).slice(0, 90)}` : ''}`);
  }

}

console.log('─'.repeat(70));
await pool.end();
}

main().catch((err) => {
  console.error(String(err).slice(0, 300));
  process.exit(1);
});
