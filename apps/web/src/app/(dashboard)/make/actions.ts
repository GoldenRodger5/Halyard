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
import { formatById } from '@halyard/core';

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
    if (!format.platforms.includes(platform)) {
      return {
        ok: false,
        message: `${format.name} cannot run on ${platform}. It carries: ${format.platforms.join(', ')}.`,
      };
    }
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
      }),
    ],
  );

  revalidatePath('/make');
  revalidatePath('/queue');

  const shape = postFormat ? formatById(postFormat)?.name ?? postFormat : 'a shape it chooses';
  return {
    ok: true,
    jobId: rows[0]?.id,
    message: `Making ${shape} for ${platform}. It appears in the queue when the render finishes.`,
  };
}
