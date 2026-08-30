'use server';

/**
 * §288. Make one piece, from two buttons.
 *
 * The composer is a chat box: an operator types an idea and the system infers
 * platform, shape and subject. That is the right tool when the idea is the
 * uncertain part and the wrong one when it is not — "a quiz, for TikTok" is two
 * choices and a click, and typing it is a worse interface for the same request.
 *
 * This enqueues a real `generate` job, the same one the scheduler runs. It is
 * not a second pipeline: the shape reaches `selectFormat` through `postFormat`,
 * which honours an operator's pick over its own choice (§278), and everything
 * downstream — the writer, the citation check, the critic, the correction loop —
 * is unchanged. A button that took a different path would be a button that
 * tests something nobody ships.
 */
import { revalidatePath } from 'next/cache';
import { requireOperator } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatById, platformsForFormat } from '@halyard/core';

export interface MakeResult {
  ok: boolean;
  message: string;
  jobId?: string;
}

export async function makePiece(formData: FormData): Promise<MakeResult> {
  await requireOperator();

  const productId = String(formData.get('productId') ?? 'recipefix');
  const platform = String(formData.get('platform') ?? '').trim();
  const postFormat = String(formData.get('postFormat') ?? '').trim();
  const subject = String(formData.get('subject') ?? '').trim();
  /* §318. Which product flow to record, for a capture-backed format. */
  const flowId = String(formData.get('flowId') ?? '').trim();

  if (!platform) return { ok: false, message: 'Pick a platform first.' };

  /*
   * A format the platform cannot carry is refused here rather than silently
   * swapped downstream. `selectFormat` would fall back and say so in a log
   * nobody is reading; an operator pressing a button deserves the answer on
   * the screen they pressed it on.
   */
  if (postFormat) {
    const format = formatById(postFormat);
    if (!format) return { ok: false, message: `There is no ${postFormat} format.` };
    /* §295. Derived from the format's channels; there is no second list. */
    const carries = platformsForFormat(format.id);
    if (!carries.includes(platform)) {
      return {
        ok: false,
        message: `${format.name} cannot run on ${platform}. It carries: ${carries.join(', ')}.`,
      };
    }
  }

  /**
   * §318. A capture-backed format records first, then writes.
   *
   * The recording is the piece's content, so generating before it exists would
   * produce a walkthrough with nothing to walk through. The capture job runs
   * the flow against the live product signed in to the test account, and the
   * generate job is queued behind it at a lower priority so the poller takes
   * them in that order.
   *
   * The flow is required rather than defaulted. "Record something" is not a
   * request anybody can fill, and a default would quietly make a video of the
   * wrong screen — which is exactly the class of mistake this page's buttons
   * exist to prevent.
   */
  let captureJobId: string | undefined;
  const format = postFormat ? formatById(postFormat) : null;
  if (format?.needsCapture) {
    if (!flowId) {
      return {
        ok: false,
        message: `${format.name} is built from a recording, so it needs to know which part of the app to record.`,
      };
    }
    const capture = await query<{ id: string }>(
      `insert into jobs (kind, payload, status, priority)
       values ('capture', $1::jsonb, 'queued', 4)
       returning id`,
      [JSON.stringify({ productId, flowId })],
    );
    captureJobId = capture[0]?.id;
  }

  /*
   * Calibration mode, deliberately. Ordinary generation is gated until an
   * operator has rated twenty drafts (§260), and a button that silently did
   * nothing because of a gate elsewhere is the worst kind of button.
   */
  const rows = await query<{ id: string }>(
    `insert into jobs (kind, payload, status, priority)
     values ('generate', $1::jsonb, 'queued', 5)
     returning id`,
    [
      JSON.stringify({
        productId,
        limit: 1,
        calibration: true,
        onlyPlatform: platform,
        ...(postFormat ? { postFormat } : {}),
        ...(subject ? { subject } : {}),
        /* §318. Which recording this piece is about, for a capture-backed format. */
        ...(flowId ? { flowId } : {}),
      }),
    ],
  );

  revalidatePath('/make');
  revalidatePath('/queue');

  const shape = format?.name ?? postFormat ?? 'a shape it chooses';
  return {
    ok: true,
    jobId: rows[0]?.id,
    message: captureJobId
      ? `Recording ${flowId} against the live product, then making ${shape} for ${platform}. ` +
        'A capture takes a couple of minutes; it appears in the queue when the render finishes.'
      : `Making ${shape} for ${platform}. It appears in the queue when the render finishes.`,
  };
}
