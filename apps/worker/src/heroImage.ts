/**
 * §268. A picture of the thing being talked about.
 *
 * The 2026-08-29 review found the honest version of the problem: a cooking
 * product had published twenty-one assets and not one photograph of anything
 * edible. Every card was type on cream. That is the difference between reading
 * as a brand and reading as a script, and no amount of typography closes it.
 *
 * ## Why generating one is allowed here, and where it is not
 *
 * `imagery/types.ts` already draws the line this has to respect. A generated
 * image is **illustration only**: it can never back a claim, and
 * `EVIDENTIAL_ROLES` names the beats where using one would be fabrication —
 * `demo`, `proof`, `before`, `after`, `change`. A picture of finished food in a
 * *hook* is atmosphere. The same picture captioned "here is your result" is a
 * lie about an outcome nobody measured, which is gotcha 9 wearing a nicer coat.
 *
 * So this generates for the opening frame and nothing else, and it records
 * `provenance: 'generated'` on the asset so every downstream gate can see what
 * it is.
 *
 * ## Why not the publisher's photo
 *
 * The connector does extract `sourceImage` from a recipe, and the RecipeFix
 * catalogue says plainly that those are the publisher's own `og:image`, usable
 * only as attribution-linked references. A brand posting somebody else's food
 * photography as its own is a rights problem, not a design choice. Those images
 * stay available for attributed use; they are not what this reaches for.
 *
 * ## Product-agnostic
 *
 * Nothing here knows what a recipe is. It is handed a subject and a mood and
 * asks for a photograph of that subject. A different product attached to
 * Halyard describes different things and gets pictures of those.
 */
import {
  assertIllustrative,
  shotDirection,
  shotId,
  type ImageClient,
  type GeneratedImage,
  type Shot,
} from '@halyard/core';
import type { HandlerContext } from './poller.js';
import { readAssetBytes, uploadAsset } from './storage.js';
import { recordPaidCall } from './paidCalls.js';
import { isProviderExhausted } from '@halyard/core';

/**
 * How the picture should feel. Chosen from the piece's visual language so the
 * photograph and the typography are not arguing with each other.
 */
const MOOD_FOR_LANGUAGE: Record<string, string> = {
  documentary: 'natural window light, matte finish, unstyled, slightly imperfect',
  clean_modern: 'soft even light, clean neutral surface, minimal props',
  premium_instructional: 'controlled studio light, shallow depth of field, considered composition',
  bold_social: 'high contrast, direct light, saturated, close crop',
  energetic_short: 'bright punchy light, close crop, high energy',
  fast_cut_creator: 'phone-camera realism, direct flash, candid',
  kinetic: 'high contrast, strong shadow, graphic composition',
  editorial_calm: 'diffuse north light, calm palette, generous negative space',
  geometric: 'flat overhead light, ordered arrangement, strong shapes',
};

const DEFAULT_MOOD = 'natural light, honest and unstyled, shallow depth of field';

export interface HeroImageRequest {
  /** §494. Scopes photograph reuse to this product's own library. */
  productId?: string;
  /** What the picture is of, in plain words. Never the product's interface. */
  subject: string;
  /**
   * How to take the picture — framing, light, surface. §402.
   *
   * Chosen by `chooseShot` against what this product shot recently, so two
   * pieces on the same subject are two different photographs rather than one
   * photograph twice. Optional because a caller with no product history to read
   * is better off with the default styling than with a fabricated shot.
   */
  shot?: Shot;
  /** The piece's visual language, so the photograph matches the type. */
  visualLanguage?: string;
  aspectRatio: '9:16' | '1:1' | '16:9' | '4:5';
  contentItemId: string;
}

/**
 * The prompt, built so `assertIllustrative` can never be surprised by it.
 *
 * Deliberately asks for a photograph of a *subject*, never for a screen, a UI,
 * or the product doing something — those are the terms `PRODUCT_SHAPED`
 * rejects, and being rejected at the guard is the correct outcome if this ever
 * drifts.
 */
export function heroPrompt(input: {
  subject: string;
  shot?: Shot;
  visualLanguage?: string;
}): string {
  /*
   * §402. The shot wins when there is one, because it varies three axes and a
   * mood varies one. The mood map stays as the fallback for callers with no
   * history to rotate against — it is still the right answer for a one-off.
   */
  const styling = input.shot
    ? shotDirection(input.shot)
    : (input.visualLanguage && MOOD_FOR_LANGUAGE[input.visualLanguage]) || DEFAULT_MOOD;
  return [
    `A photograph of ${input.subject}.`,
    `Styling: ${styling}.`,
    'Real photography, not an illustration and not a render.',
    'No text, no lettering, no watermarks, no logos, no hands holding a phone.',
    'Nothing resembling software, and no signage of any kind.',
  ].join(' ');
}

/** Alt text is required at the point of request, so it is written here too. */
export function heroAlt(subject: string): string {
  return `A photograph of ${subject}.`;
}

/**
 * Generate one illustrative image and store it as a Halyard-owned asset.
 *
 * Returns null rather than throwing when generation is unavailable or fails: a
 * piece without a hero image is the status quo and still publishable, and a
 * generation outage must not take the whole run down with it. The reason is
 * logged so a run of nulls is visible rather than silent.
 */
export async function generateHeroImage(
  ctx: HandlerContext,
  client: ImageClient | null,
  request: HeroImageRequest,
): Promise<{ assetId: string; bytes: Buffer; mimeType: string; costUsd: number } | null> {
  if (!client) {
    ctx.log('no image client configured, piece runs without a hero image', {
      contentItemId: request.contentItemId,
    });
    return null;
  }

  const prompt = heroPrompt(request);
  const alt = heroAlt(request.subject);

  /*
   * §494. A photograph already taken of this subject is used before another
   * is bought. Six test runs of one subject bought forty-odd images of herbs
   * in jars; the third would have done. Rotated by least-recently-used so the
   * same picture does not lead two consecutive pieces, and bounded by age so a
   * product that has changed its look does not keep its old one forever.
   */
  const reuseDays = Number(process.env.HALYARD_PHOTO_REUSE_DAYS ?? 30);
  if (reuseDays > 0 && request.subject.trim()) {
    const { rows } = await ctx.pool.query<{
      id: string;
      storage_path: string | null;
      public_url: string | null;
      mime_type: string;
    }>(
      `select id, storage_path, public_url, mime_type from assets
        where kind = 'generated' and archived_at is null
          and lower(subject) = lower($1)
          and ($2::text is null or product_id = $2)
          and created_at > now() - make_interval(days => $3)
        order by last_used_at asc nulls first, created_at desc
        limit 1`,
      [request.subject.trim(), request.productId ?? null, reuseDays],
    );
    const found = rows[0];
    if (found) {
      const bytes = await readAssetBytes(found.storage_path, found.public_url);
      if (bytes) {
        await ctx.pool.query('update assets set last_used_at = now() where id = $1', [found.id]);
        ctx.log('photograph reused', {
          contentItemId: request.contentItemId,
          assetId: found.id,
          subject: request.subject,
          because: `an image of this subject from the last ${reuseDays} days exists; nothing was bought`,
        });
        return { assetId: found.id, bytes, mimeType: found.mime_type, costUsd: 0 };
      }
    }
  }

  let image: GeneratedImage;
  try {
    /*
     * Checked here as well as inside the client. The client's own assertion is
     * the one that matters; this one makes the failure legible at the call
     * site rather than three frames down inside a provider.
     */
    assertIllustrative(prompt);
    image = await client.generate({ prompt, aspectRatio: request.aspectRatio, alt });
  } catch (err) {
    /*
     * §491. Not for a provider that has said the account cannot pay. That is
     * a fact about the run, not about this picture; returning null here made
     * the loop ask three more times and released a slideshow.
     */
    if (isProviderExhausted(err)) throw err;
    ctx.log('hero image not generated', {
      contentItemId: request.contentItemId,
      reason: (err as Error).message,
    });
    return null;
  }

  const bytes = Buffer.from(image.data);
  const stored = await uploadAsset(ctx, {
    bytes,
    mimeType: image.mimeType,
    kind: 'generated',
    width: image.width,
    height: image.height,
    altText: image.alt,
    caption: null,
    contentItemId: request.contentItemId,
    source: 'generated',
    /*
     * Tagged with its provenance and the exact prompt so a published frame can
     * be traced back to what asked for it — the reason `GeneratedImage` carries
     * the prompt at all.
     */
    tags: ['generated', `model:${image.model}`],
    /* §402. So the next picture can be shot differently. */
    shot: request.shot ? shotId(request.shot) : null,
    /* §409. So the critic can check the frames show what was asked for. */
    subject: request.subject,
    /*
     * Never `video` or `proof`. This is an illustration and the roles it may
     * appear in are the non-evidential ones; declaring it here keeps a later
     * caller from reaching for it as evidence.
     */
    usableFor: ['image', 'carousel'],
  });

  ctx.log('hero image generated', {
    contentItemId: request.contentItemId,
    assetId: stored.id,
    model: image.model,
    costUsd: Number(image.costUsd.toFixed(4)),
    subject: request.subject,
    shot: request.shot ? shotId(request.shot) : null,
    /*
     * §369. The reason, not only the parameters. The account of a piece is
     * assembled from what each decision recorded about itself, and this one
     * recorded five facts and no sentence — so it appeared in the account as a
     * decision that said nothing about why.
     */
    because:
      `A photograph of ${request.subject}, because that is the physical thing this piece is about. ` +
      'It is illustration and carries `generated` provenance, so it can never stand as evidence for a claim about the product.',
  });

  /* §494. Bought, so the ledger knows. */
  await recordPaidCall(ctx.pool, {
    agentId: 'image-generator',
    jobId: ctx.jobId,
    model: 'gpt-image-1',
    costUsd: image.costUsd,
    units: { images: 1, subject: request.subject.slice(0, 80) },
    estimate: true,
  });

  return { assetId: stored.id, bytes, mimeType: image.mimeType, costUsd: image.costUsd };
}
