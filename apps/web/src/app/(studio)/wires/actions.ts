'use server';

import { revalidatePath } from 'next/cache';
import { one, query } from '@/lib/db';
import { requireOperator } from '@/lib/auth';
import { recordingClient } from '@/lib/agentRuns';
import { createLlmClient, buildReplyDraftPrompt, extractJson } from '@halyard/core';

/**
 * Draft a reply. The model writes; a human sends. There is no code path in this
 * file, or anywhere else, that transmits a reply to a platform.
 */
export async function draftReply(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));

  const context = await one<{
    body: string;
    author_handle: string | null;
    post_body: string;
    voice_description: string;
  }>(
    `select c.body, c.author_handle, ci.body as post_body,
            coalesce(bv.description, 'plain and useful') as voice_description
       from comments c
       join publications p on p.id = c.publication_id
       join content_items ci on ci.id = p.content_item_id
       left join brand_voices bv on bv.product_id = ci.product_id and bv.persona = ci.persona
      where c.id = $1`,
    [id],
  );
  if (!context) return;

  const prompt = buildReplyDraftPrompt({
    postBody: context.post_body,
    comment: context.body,
    authorHandle: context.author_handle ?? undefined,
    voiceSummary: context.voice_description,
  });

  try {
    const llm = recordingClient(createLlmClient(), { trigger: 'ui_action', triggerRef: id });
    const response = await llm.complete({
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      maxTokens: 400,
      promptVersion: prompt.version,
    });
    const parsed = extractJson<{
      reply?: string;
      is_support_question?: boolean;
      sentiment?: string;
    }>(response.text);

    await query(
      `update comments
          set suggested_reply = $2, is_support_question = $3, sentiment = $4
        where id = $1`,
      [id, parsed.reply ?? null, parsed.is_support_question ?? false, parsed.sentiment ?? null],
    );
  } catch (err) {
    await query('update comments set suggested_reply = $2 where id = $1', [
      id,
      `Could not draft a reply: ${(err as Error).message}. Write one yourself, or set ANTHROPIC_API_KEY.`,
    ]);
  }

  revalidatePath('/wires');
}

/**
 * Record that the operator sent a reply. Halyard does not transmit it — the
 * operator sends from the platform, and this closes the loop so reply latency
 * is measurable.
 */
export async function markReplied(formData: FormData): Promise<void> {
  const operator = await requireOperator();
  const id = String(formData.get('id'));
  const body = String(formData.get('body') ?? '').trim();
  if (!body) return;

  const comment = await one<{ suggested_reply: string | null; posted_at: string | null }>(
    'select suggested_reply, posted_at from comments where id = $1',
    [id],
  );

  const latencySeconds = comment?.posted_at
    ? Math.round((Date.now() - new Date(comment.posted_at).getTime()) / 1000)
    : null;

  /**
   * What these two flags are for, and what they used to record.
   *
   * `was_ai_drafted` and `was_edited` are the learning signal on this table:
   * did the operator use the draft, or rewrite it. `was_edited` was
   * `comment?.suggested_reply !== body`, and for a comment the drafter has
   * never run on `suggested_reply` is **null** — so `null !== body` is true and
   * every hand-written reply was recorded as an *edit of an AI draft that never
   * existed*.
   *
   * That is not a cosmetic mislabel. It is the exact signal a future
   * quality loop would read to decide whether the drafter is worth running, and
   * it was biased toward "the human always rewrites it" by the replies where
   * there was nothing to rewrite.
   *
   * Editing is only meaningful relative to something: no draft, no edit.
   */
  const suggestion = comment?.suggested_reply ?? null;
  await query(
    `insert into comment_replies (comment_id, body, sent_by, was_ai_drafted, was_edited, latency_seconds)
     values ($1, $2, 'human', $3, $4, $5)`,
    [id, body, suggestion !== null, suggestion !== null && suggestion !== body, latencySeconds],
  );
  await query(
    `update comments set reply_status = 'replied', replied_at = now() where id = $1`,
    [id],
  );
  await query(
    `insert into audit_log (actor, action, entity_type, entity_id, detail)
     values ('human', 'reply_sent', 'comment', $1, $2)`,
    [id, { operator: operator.email, latencySeconds }],
  );

  revalidatePath('/wires');
}

export async function ignoreComment(formData: FormData): Promise<void> {
  await requireOperator();
  await query(`update comments set reply_status = 'ignored' where id = $1`, [
    String(formData.get('id')),
  ]);
  revalidatePath('/wires');
}

/** Support questions go to a human channel, not to a social reply. */
export async function routeToSupport(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));
  await query(
    `update comments set reply_status = 'routed', is_support_question = true where id = $1`,
    [id],
  );
  await query(
    `insert into notifications (kind, severity, title, body, entity_type, entity_id)
     values ('digest', 'info', 'Support question routed', 'A comment was routed to hello@ rather than answered in public.', 'comment', $1)`,
    [id],
  );
  revalidatePath('/wires');
}
