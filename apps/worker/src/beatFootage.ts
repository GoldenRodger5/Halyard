/**
 * §478. Real motion under the beats that asked for it.
 *
 * The screenplay marks a scene `ground: 'footage'` with a `groundSubject`
 * (§441, §478), and `videoForFormat` carries that onto the beat as
 * `wantsFootage` and `footageSubject`. This is the step that turns the request
 * into a clip: search, choose, download, store. It mirrors `photographBeats`
 * on purpose — the two are the same decision with a different source, and the
 * render handler resolves the result the same way, from an asset id on the
 * beat.
 *
 * ## What code decides, and what the model was only asked to perceive
 *
 * The screenwriter perceives which lines are about something *happening*. It
 * does not get to decide that footage can carry a claim: a beat whose subject
 * names the product is refused here, in code, because licensed footage is
 * somebody else's kitchen and cannot contain the software however good the
 * search phrase is. That refusal leaves the beat to be photographed.
 *
 * ## Rotation
 *
 * Clips already used on this product are passed to the search as `avoid`, so
 * two pieces about dough do not open on the same pair of hands. This is
 * `chooseShot`'s recency read, applied to somebody else's camera.
 *
 * ## Cost
 *
 * Pexels is free, so the bound here is bytes and time rather than money: at
 * most `MAX_FOOTAGE_BEATS` clips per piece, none above `MAX_CLIP_BYTES`. A
 * failure on one beat leaves that beat to fall back to a photograph and is
 * logged with its reason — a still where motion was asked for is a lesser
 * video; a thrown error is no video.
 */
import { photographicSubject, type LlmClient, type StockFootageClient } from '@halyard/core';
import type { HandlerContext } from './poller.js';
import { uploadAsset } from './storage.js';

/** Four covers every beat a short piece would sensibly want moving. */
export const MAX_FOOTAGE_BEATS = 4;
/** A portrait 1080p clip of six seconds is a few megabytes; sixty is a 4K master. */
export const MAX_CLIP_BYTES = 60 * 1024 * 1024;

const STOCK_TAG = 'stock-footage';
const CLIP_TAG_PREFIX = 'pexels:';

export interface BeatFootage {
  /** The stored clip, or null when this beat keeps a still. */
  assetId: string | null;
  clipId: string | null;
  seconds: number | null;
  /** Why the beat has no footage, when it has none. Read back in logs. */
  reason: string | null;
}

export interface FootageBeat {
  text: string;
  /** What the screenplay said the footage is of. Preferred over the line. */
  subject?: string | null;
  /** How long the beat holds, so a clip long enough to cover it is preferred. */
  seconds?: number;
}

/** Whether a search phrase would be looking for the product itself. */
export function namesTheProduct(subject: string, productName: string): boolean {
  const name = productName.trim().toLowerCase();
  if (!name) return false;
  const haystack = subject.toLowerCase();
  return haystack.includes(name) || /\b(the app|this app|our app|the tool|screenshot|screen)\b/.test(haystack);
}

/** Clip ids already stored for this product, newest first. */
export async function recentClipIds(
  pool: HandlerContext['pool'],
  input: { productId: string; limit?: number },
): Promise<string[]> {
  const { rows } = await pool.query<{ tags: string[] }>(
    `select tags from assets
      where product_id = $1 and $2 = any(tags) and archived_at is null
      order by created_at desc limit $3`,
    [input.productId, STOCK_TAG, input.limit ?? 40],
  );
  return rows.flatMap((r) =>
    r.tags.filter((t) => t.startsWith(CLIP_TAG_PREFIX)).map((t) => t.slice(CLIP_TAG_PREFIX.length)),
  );
}

/**
 * §503. Which beats get the clips when more want them than the cap allows.
 *
 * The first live run asked for footage on **eight of eight** beats. Taking the
 * first four gives a piece that moves for fifteen seconds and then stops dead;
 * a piece that moved on all eight would be its own monotony, with nothing to
 * cut against. A still between two clips is punctuation — the argument §444
 * makes for a flat ground between photographs, one layer up.
 *
 * So the opening always moves, because on a completion-ranked platform the
 * first second is the whole job, and the rest are spaced evenly through what
 * remains rather than filling from the front. Deterministic: the same
 * screenplay always picks the same beats.
 */
export function beatsToFilm(wanted: number, cap = MAX_FOOTAGE_BEATS): number[] {
  if (wanted <= 0) return [];
  if (wanted <= cap) return Array.from({ length: wanted }, (_, i) => i);
  const chosen = [0];
  const step = (wanted - 1) / (cap - 1);
  for (let n = 1; n < cap; n += 1) {
    const at = Math.round(n * step);
    if (!chosen.includes(at) && at < wanted) chosen.push(at);
  }
  return chosen.sort((a, b) => a - b);
}

export async function footageForBeats(
  ctx: HandlerContext,
  client: StockFootageClient | null,
  llm: LlmClient,
  input: {
    productId: string;
    contentItemId: string;
    productName: string;
    beats: FootageBeat[];
    productContext?: string;
    /** §483. What the piece is about, so a line is read inside it. */
    pieceSubject?: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<BeatFootage[]> {
  const none = (reason: string): BeatFootage => ({ assetId: null, clipId: null, seconds: null, reason });
  if (!client) return input.beats.map(() => none('no footage source is configured'));

  const avoid = await recentClipIds(ctx.pool, { productId: input.productId });
  const out: BeatFootage[] = [];

  /* §503. Spread through the piece, not the first four. */
  const filming = new Set(beatsToFilm(input.beats.length));

  for (const [index, beat] of input.beats.entries()) {
    if (!filming.has(index)) {
      out.push(none(`past the ${MAX_FOOTAGE_BEATS}-clip cap; a still here, for contrast`));
      continue;
    }
    try {
      let subject = beat.subject?.trim() || null;
      if (!subject && beat.text.trim()) {
        const verdict = await photographicSubject(
          { line: beat.text, productContext: input.productContext, pieceSubject: input.pieceSubject },
          llm,
        ).catch(() => ({ subject: null, reason: 'the subject agent failed' }));
        subject = verdict.subject;
      }
      if (!subject) {
        out.push(none('the line names nothing that could be filmed'));
        continue;
      }
      if (namesTheProduct(subject, input.productName)) {
        out.push(none(`"${subject}" is the product, which licensed footage cannot show`));
        continue;
      }

      const [clip] = await client.search(subject, {
        want: 1,
        /* A snapshot: the list grows below, and the client must not see that. */
        avoid: [...avoid],
        ...(beat.seconds ? { minSeconds: beat.seconds } : {}),
      });
      if (!clip) {
        out.push(none(`no portrait clip found for "${subject}"`));
        continue;
      }

      const response = await fetchImpl(clip.url);
      if (!response.ok) {
        out.push(none(`clip download failed: HTTP ${response.status}`));
        continue;
      }
      const declared = Number(response.headers.get('content-length') ?? 0);
      if (declared > MAX_CLIP_BYTES) {
        out.push(none(`clip is ${Math.round(declared / 1e6)} MB, over the ${MAX_CLIP_BYTES / 1e6} MB cap`));
        continue;
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength > MAX_CLIP_BYTES) {
        out.push(none(`clip is ${Math.round(bytes.byteLength / 1e6)} MB, over the cap`));
        continue;
      }

      const stored = await uploadAsset(ctx, {
        bytes,
        mimeType: 'video/mp4',
        /*
         * §502. `broll`, which the schema has always had and nothing has ever
         * written. The first live footage run stored eight clips as `footage`
         * and Postgres refused all eight — `assets_kind_check` is a list of
         * allowed kinds, and inventing a ninth word for a concept the column
         * already names is gotcha 1 in a different table. The screenwriter had
         * done its part: it asked for footage on eight of eight beats.
         */
        kind: 'broll',
        width: clip.width,
        height: clip.height,
        durationSeconds: clip.durationSeconds,
        caption: `Footage by ${clip.photographer}, via Pexels`,
        altText: subject,
        contentItemId: input.contentItemId,
        productId: input.productId,
        source: 'licensed',
        sourceUrl: clip.pageUrl,
        subject,
        tags: [STOCK_TAG, `${CLIP_TAG_PREFIX}${clip.id}`],
      });
      /* Rotate within the piece as well as across pieces. */
      avoid.unshift(clip.id);
      out.push({ assetId: stored.id, clipId: clip.id, seconds: clip.durationSeconds, reason: null });
      ctx.log('beat given footage', {
        contentItemId: input.contentItemId,
        subject,
        clip: clip.id,
        seconds: clip.durationSeconds,
        by: clip.photographer,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.log('footage failed for a beat; it keeps a still', { contentItemId: input.contentItemId, error: message });
      out.push(none(message));
    }
  }

  return out;
}
