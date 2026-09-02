/**
 * §407. A photograph per beat, not per piece.
 *
 * Halyard generated one image and held it behind the whole video. Every
 * platform's own guidance says the opposite: TikTok wants a visual reset every
 * 1.5-3 seconds, Reels 2.5-4, Shorts 3-5, and "dead time — any moment where
 * nothing new appears on screen" is the fastest way to lose a feed viewer. A
 * nineteen-second piece on one still is four text changes over one unchanging
 * picture, which is precisely the shape that gets scrolled past.
 *
 * ## Why several photographs rather than several crops
 *
 * Cropping one image is cheaper and reads as one image, because it is. The
 * subject does not change, the light does not change, and the eye recognises
 * the same picture moved. Four photographs of four different things — the loaf,
 * the starter, the jar, the crumb — is four visual resets.
 *
 * ## What each beat is a photograph *of*
 *
 * The beat's own line, run through `photographicSubject`, which answers "what
 * physical thing is this sentence about" and refuses when the answer is not
 * photographable. A refusal falls back to the piece's subject, so a beat about
 * an abstraction gets a relevant picture rather than a wrong one.
 *
 * ## Shots rotate twice over
 *
 * Within the piece, so consecutive beats are not four versions of the same
 * framing; and against `assets.shot`, so the next piece does not open the way
 * this one did. `chooseShot` is fed the running history of both.
 *
 * ## Cost is real and is bounded
 *
 * Each image is a paid generation. `MAX_PHOTOGRAPHED_BEATS` caps it, and a
 * failure on any single beat leaves that beat to fall back to the piece
 * background rather than failing the run — one flat beat is a worse video, a
 * thrown error is no video.
 */
import { photographicSubject, chooseShot, shotId, isProviderExhausted, type ImageClient } from '@halyard/core';
import type { HandlerContext } from './poller.js';
import { generateHeroImage } from './heroImage.js';
import { recentShots } from './shotRecency.js';
import type { LlmClient } from '@halyard/core';

/**
 * The most beats worth photographing.
 *
 * Six covers every format's beat count in the catalogue. Past that the spend
 * grows and the return does not: nobody is still watching beat nine.
 */
export const MAX_PHOTOGRAPHED_BEATS = 6;

export interface BeatPhotograph {
  /** The asset, or null when this beat could not be photographed. */
  assetId: string | null;
  shot: string | null;
}

export interface BeatPhotographs {
  photographs: BeatPhotograph[];
  /**
   * §491. Set when the image provider refused on account grounds — no
   * credits, bad key — part-way through. The loop stops there rather than
   * asking again, and the caller decides what a piece with this many stills
   * missing is worth: nothing, usually, because the next piece gets the same
   * answer and a person has to act first.
   */
  providerExhausted: string | null;
}

export async function photographBeats(
  ctx: HandlerContext,
  imageClient: ImageClient | null,
  llm: LlmClient,
  input: {
    productId: string;
    contentItemId: string;
    format: string;
    /** The piece's subject, for a beat whose own line names nothing to shoot. */
    fallbackSubject: string;
    beats: Array<{ text: string }>;
    productContext?: string;
  },
): Promise<BeatPhotographs> {
  if (!imageClient) {
    return { photographs: input.beats.map(() => ({ assetId: null, shot: null })), providerExhausted: null };
  }

  /* Across pieces. Extended in-place below so it also rotates within this one. */
  const history = await recentShots(ctx.pool, { productId: input.productId });
  const out: BeatPhotograph[] = [];

  for (const beat of input.beats.slice(0, MAX_PHOTOGRAPHED_BEATS)) {
    const line = beat.text?.trim();
    let subject = input.fallbackSubject;
    if (line) {
      const verdict = await photographicSubject(
        /* §483. The line read inside its piece, not as a homonym. */
        { line, productContext: input.productContext, pieceSubject: input.fallbackSubject },
        llm,
      ).catch(() => ({ subject: null, reason: 'the subject agent failed' }));
      if (verdict.subject) subject = verdict.subject;
    }

    const shot = chooseShot({ format: input.format, recent: history });
    history.unshift(shotId(shot));

    let image: Awaited<ReturnType<typeof generateHeroImage>>;
    try {
      image = await generateHeroImage(ctx, imageClient, {
        subject,
        shot,
        aspectRatio: '9:16',
        contentItemId: input.contentItemId,
        productId: input.productId,
        /* §496. Never hand this piece a picture it is already showing. */
        avoidAssetIds: out.flatMap((p) => (p.assetId ? [p.assetId] : [])),
      });
    } catch (err) {
      if (isProviderExhausted(err)) {
        ctx.log('image provider refused on account grounds; photography stops here', {
          contentItemId: input.contentItemId,
          after: out.length,
          reason: err.message,
        });
        while (out.length < input.beats.length) out.push({ assetId: null, shot: null });
        return { photographs: out, providerExhausted: err.message };
      }
      throw err;
    }
    out.push({ assetId: image?.assetId ?? null, shot: image ? shot.id : null });
    ctx.log('beat photographed', {
      contentItemId: input.contentItemId,
      subject,
      shot: shot.id,
      ok: Boolean(image),
    });
  }

  /* Beats past the cap keep the piece background. Stated, not silently dropped. */
  while (out.length < input.beats.length) out.push({ assetId: null, shot: null });
  return { photographs: out, providerExhausted: null };
}
