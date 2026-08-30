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
  /**
   * §355. Several platforms, because the wizard asks for several.
   *
   * One production for many destinations is the normal case (§352): the
   * screenplay, the voice and the render are shared and only the finish
   * differs. The old field took one platform, so the wizard's multi-select had
   * nowhere to go.
   */
  const platforms = String(formData.get('platforms') ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  /* The old single field still works, for anything that has not moved. */
  const single = String(formData.get('platform') ?? '').trim();
  if (single && platforms.length === 0) platforms.push(single);
  const postType = String(formData.get('postType') ?? '').trim();
  const together = String(formData.get('together') ?? '') === '1';
  /**
   * §358. The operator's overrides, if any.
   *
   * Only what was actually chosen: an option left on auto is absent, so the
   * pipeline's own decision runs rather than being handed a value that happens
   * to match it — which would read as a choice in the log and be indistinguish-
   * able from one.
   */
  const options: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('option.') && typeof value === 'string' && value) {
      options[key.slice('option.'.length)] = value;
    }
  }
  const postFormat = String(formData.get('postFormat') ?? '').trim();
  const subject = String(formData.get('subject') ?? '').trim();
  /* §318. Which product flow to record, for a capture-backed format. */
  const flowId = String(formData.get('flowId') ?? '').trim();

  if (platforms.length === 0) return { ok: false, message: 'Pick where it goes first.' };

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
    /*
     * Every chosen platform, not any. A piece made for three and publishable to
     * two fails at the last step, which is the most expensive place to find out.
     */
    const cannot = platforms.filter((p) => !carries.includes(p));
    if (cannot.length > 0) {
      return {
        ok: false,
        message: `${format.name} cannot run on ${cannot.join(', ')}. It carries: ${carries.join(', ')}.`,
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
  /**
   * §355. One job per platform.
   *
   * `generate.ts` produces a piece for one account per run — "one call per
   * platform, never one call producing all platforms" — so a multi-platform
   * request is several jobs rather than one job that fans out inside the
   * handler.
   *
   * `together` does not change the number of jobs, and that is deliberate: it
   * changes what §352's finish does at publish, not what is produced. Both
   * modes make a piece per platform today; the difference is whether they were
   * written from the same brief. Making "together" literally share a render is
   * the next step and belongs in the handler, not here.
   */
  const rows: Array<{ id: string }> = [];
  for (const platform of platforms) {
    const inserted = await query<{ id: string }>(
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
          ...(postType ? { postType } : {}),
          ...(subject ? { subject } : {}),
          /* §318. Which recording this piece is about, for a capture-backed format. */
          ...(flowId ? { flowId } : {}),
          /* §355. Recorded so a piece knows it was meant to match its siblings. */
          ...(together && platforms.length > 1 ? { together: true } : {}),
          /* §358. Overrides, so a stage can honour one instead of deciding. */
          ...(Object.keys(options).length > 0 ? { options } : {}),
        }),
      ],
    );
    if (inserted[0]) rows.push(inserted[0]);
  }

  revalidatePath('/make');
  revalidatePath('/queue');

  const shape = format?.name ?? postFormat ?? 'a shape it chooses';
  const where = platforms.length === 1 ? platforms[0] : `${platforms.length} platforms`;
  return {
    ok: true,
    jobId: rows[0]?.id,
    message: captureJobId
      ? `Recording ${flowId} against the live product, then making ${shape} for ${where}. ` +
        'A capture takes a couple of minutes; it appears in the queue when the render finishes.'
      : `Making ${shape} for ${where}. ${rows.length === 1 ? 'It appears' : 'They appear'} in the queue when the render finishes.`,
  };
}
