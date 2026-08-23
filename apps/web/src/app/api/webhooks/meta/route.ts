import { NextResponse, type NextRequest } from 'next/server';
import { safeEqual } from '@halyard/core';
import { query } from '@/lib/db';
import { mediaIdsFrom, verifySignature } from '@/lib/metaWebhook';

export const dynamic = 'force-dynamic';

/**
 * Meta's webhook callback.
 *
 * ## Why this lives in the web tier, and why that was never a real choice
 *
 * `PLATFORM_COVERAGE.md` §9 recorded "web tier versus worker ingestion" as an
 * open architectural decision. It is not one: the worker has **no HTTP surface
 * at all** — no listener, no server, no framework — it is a poller and a
 * scheduler on Railway. Only the web tier is reachable over HTTPS, so only the
 * web tier can receive a callback. The pattern it follows is the one
 * `/api/cron/[task]` already uses: authenticate, enqueue, return quickly.
 *
 * ## The webhook is a trigger, not a source of truth
 *
 * This deliberately does **not** write comments, metrics or anything else from
 * the payload. It resolves which publication a notification is about and
 * enqueues `collect_comments`, which reads the platform's API through the
 * existing adapter — the path that already records an account-scoped capability
 * observation (`DECISIONS.md` §65) and dedupes on
 * `(publication_id, platform_comment_id)`.
 *
 * That is the difference between a notification and an observation. A payload
 * says something happened; Halyard's evidence model requires that it went and
 * looked. Trusting the payload would put provider-shaped data into `comments`
 * with no verified read behind it.
 *
 * ## Fail closed
 *
 * Both verbs refuse when their secret is absent. An unconfigured webhook that
 * answered Meta's handshake would let a subscription be registered against an
 * endpoint that cannot check anything, and an unverified POST is an
 * unauthenticated write path into the job queue.
 */

/**
 * Meta's subscription handshake: echo `hub.challenge` when the token matches.
 *
 * Compared in constant time, like `CRON_SECRET`, and refused outright when no
 * token is configured — answering the handshake without one would let a
 * subscription be attached to an endpoint that can verify nothing.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const configured = process.env.META_WEBHOOK_VERIFY_TOKEN;
  const params = request.nextUrl.searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  if (!configured || configured.trim().length === 0) {
    return NextResponse.json(
      { error: 'META_WEBHOOK_VERIFY_TOKEN is not set; refusing to complete the handshake' },
      { status: 503 },
    );
  }
  if (mode !== 'subscribe' || !token || !safeEqual(token, configured) || !challenge) {
    return NextResponse.json({ error: 'verification failed' }, { status: 403 });
  }

  // Meta requires the challenge echoed as a bare body, not JSON.
  return new Response(challenge, { status: 200, headers: { 'content-type': 'text/plain' } });
}

export async function POST(request: NextRequest): Promise<Response> {
  const secret = process.env.META_APP_SECRET;
  if (!secret || secret.trim().length === 0) {
    return NextResponse.json({ error: 'META_APP_SECRET is not set' }, { status: 503 });
  }

  // The raw body, because the signature is over the bytes Meta sent. Parsing
  // first and re-serialising changes them.
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get('x-hub-signature-256'), secret)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    // Signed but unparseable. Recorded and accepted: Meta retries anything it
    // does not get a 200 for, and retrying will not make this parse.
    await record('meta_webhook_unparseable', { bytes: raw.length });
    return NextResponse.json({ ok: true, enqueued: 0 });
  }

  const mediaIds = mediaIdsFrom(payload);
  let enqueued = 0;

  if (mediaIds.length > 0) {
    /**
     * Only publications Halyard actually made. A notification about media this
     * install has never published is not something to go and read — it would be
     * an unbounded API call driven by an outside party.
     */
    const publications = await query<{ id: string }>(
      `select id from publications
        where platform = 'instagram' and platform_post_id = any($1)`,
      [mediaIds],
    );

    for (const publication of publications) {
      /**
       * Deduped per publication per minute. Meta can deliver several
       * notifications for one burst of comments, and each would otherwise
       * enqueue its own read of the same post.
       */
      const inserted = await query<{ id: string }>(
        `insert into jobs (kind, payload, priority, dedupe_key)
         values ('collect_comments', $1, 40, $2)
         on conflict do nothing
         returning id`,
        [
          JSON.stringify({ publicationId: publication.id }),
          `webhook_comments:${publication.id}:${new Date().toISOString().slice(0, 16)}`,
        ],
      );
      enqueued += inserted.length;
    }
  }

  await record('meta_webhook_received', {
    mediaIds: mediaIds.length,
    enqueued,
    // What was *not* matched is the interesting number: a persistent gap means
    // the subscription is pointed at media this install did not publish.
    unmatched: mediaIds.length - enqueued,
  });

  return NextResponse.json({ ok: true, enqueued });
}

/** Bookkeeping must never stop the work it describes, but must not be silent. */
async function record(action: string, detail: Record<string, unknown>): Promise<void> {
  await query(
    `insert into audit_log (actor, action, entity_type, detail)
     values ('system', $1, 'webhook', $2)`,
    [action, JSON.stringify(detail)],
  ).catch((err: unknown) => {
    console.error('webhook audit insert failed', { action, error: String(err) });
  });
}
