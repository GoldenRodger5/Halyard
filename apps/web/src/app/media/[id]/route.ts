import { NextResponse, type NextRequest } from 'next/server';
import { one } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Media, served from the verified Halyard domain.
 *
 * §179. TikTok's Content Posting API fetches the video itself with
 * `PULL_FROM_URL`, and it will only fetch from a URL prefix the developer has
 * verified — for Halyard, `https://halyard-ten.vercel.app/`. It also follows no
 * redirects and requires no authentication, which rules out every URL Halyard
 * already had:
 *
 *   · `/r/[id]` is the click router. It *is* a redirect, by design.
 *   · Supabase Storage URLs are on `*.supabase.co`, a domain TikTok has not
 *     verified and which Halyard cannot verify because it does not own it.
 *   · Local `/dev-assets/` paths do not exist in production at all.
 *
 * So this is the smallest thing that satisfies the requirement: one route, on
 * the verified origin, that reads the bytes server-side and returns them.
 *
 * **Deliberately unauthenticated.** TikTok's fetcher carries no session, so a
 * guard here would mean TikTok downloading a sign-in page and posting it as a
 * video. The protection is the identifier: an asset id is a UUID, unguessable
 * and never listed publicly. That is the same exposure a public storage bucket
 * would have, reached through a domain Halyard controls.
 *
 * The service-role key stays on the server. It authenticates Halyard to Supabase
 * and is never part of the URL handed to TikTok.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  /*
   * Validated before it reaches the database. `id` is a path segment, and a
   * malformed one should be a 404 rather than a query error.
   */
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const asset = await one<{ storage_path: string | null; mime_type: string }>(
    'select storage_path, mime_type from assets where id = $1',
    [id],
  );
  if (!asset?.storage_path) return new NextResponse('Not found', { status: 404 });

  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return new NextResponse('Media storage is not configured', { status: 503 });
  }

  const upstream = await fetch(
    `${supabaseUrl}/storage/v1/object/${ASSET_BUCKET}/${asset.storage_path}`,
    { headers: { authorization: `Bearer ${serviceKey}` }, cache: 'no-store' },
  );
  if (!upstream.ok || !upstream.body) {
    return new NextResponse('Not found', { status: 404 });
  }

  /*
   * Streamed rather than buffered: a 600-second TikTok video is large enough
   * that reading it fully into a serverless function is a memory problem for no
   * benefit.
   *
   * The declared `mime_type` wins over whatever storage reports, because it is
   * the value the rest of Halyard validated the file against — and TikTok
   * rejects a video served as `application/octet-stream`.
   */
  const headers = new Headers({
    'content-type': asset.mime_type,
    'cache-control': 'public, max-age=3600',
    'accept-ranges': 'bytes',
  });
  const length = upstream.headers.get('content-length');
  if (length) headers.set('content-length', length);

  return new NextResponse(upstream.body, { status: 200, headers });
}

/**
 * The bucket the worker actually writes to.
 *
 * §188. This said `'assets'`, which is the *table* name, not the bucket — the
 * bucket is `halyard-assets` (`apps/worker/src/storage.ts`). Every TikTok
 * `PULL_FROM_URL` would have 404'd, and the symptom would have appeared minutes
 * later at TikTok as `video_pull_failed`, naming nothing.
 *
 * Imported from the worker's own constant now rather than restated, so the two
 * cannot drift again.
 */
const ASSET_BUCKET = 'halyard-assets';
