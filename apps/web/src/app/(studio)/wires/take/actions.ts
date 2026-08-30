'use server';

import { revalidatePath } from 'next/cache';
import { one, query } from '@/lib/db';
import { requireOperator } from '@/lib/auth';
import { recordingClient } from '@/lib/agentRuns';
import { createLlmClient, runTakeLoop } from '@halyard/core';

/**
 * Submit a take. Milestone 28, B.3.
 *
 * The order is the whole design: fact-check, verify the story, strengthen, flag
 * risk, and only then draft. If the check contradicts the central claim, this
 * stops at `needs_revision` and nothing is written.
 */
export async function submitTake(formData: FormData): Promise<void> {
  await requireOperator();

  const storyId = String(formData.get('storyId'));
  const rawInput = String(formData.get('rawInput') ?? '').trim();
  const audience = String(formData.get('audience') ?? '').trim() || null;
  const inputMethod = String(formData.get('inputMethod') ?? 'typed') === 'spoken' ? 'spoken' : 'typed';

  // No draft without input. Ever.
  if (!rawInput) return;

  const story = await one<{ id: string; title: string; url: string; summary: string | null }>(
    'select id, title, url, summary from rss_items where id = $1',
    [storyId],
  );
  if (!story) return;

  const voice = await one<{ description: string }>(
    `select description from brand_voices where product_id = 'founder' and persona = 'founder'`,
  );

  const takeRows = await query<{ id: string }>(
    `insert into takes (product_id, rss_item_id, raw_input, input_method, audience, status)
     values ('founder', $1, $2, $3, $4, 'checking')
     returning id`,
    [storyId, rawInput, inputMethod, audience],
  );
  const takeId = takeRows[0]!.id;

  try {
    const result = await runTakeLoop(
      {
        rawInput,
        storyTitle: story.title,
        storyUrl: story.url,
        storySummary: story.summary ?? undefined,
        voiceDescription: voice?.description ?? 'direct and specific',
        audience,
      },
      recordingClient(createLlmClient(), { trigger: 'ui_action', triggerRef: takeId }),
    );

    if (result.stage === 'needs_input') {
      await query(`update takes set status = 'awaiting_input' where id = $1`, [takeId]);
    } else if (result.stage === 'needs_revision') {
      await query(
        `update takes
            set status = 'needs_revision', fact_check = $2, fact_check_ok = false,
                story_verified = $3
          where id = $1`,
        [takeId, JSON.stringify(result.verification.claims), result.verification.storyVerified],
      );
    } else {
      await query(
        `update takes
            set status = 'drafted', fact_check = $2, fact_check_ok = true, story_verified = true,
                supporting = $3, strongest_counter = $4, risk_flags = $5,
                draft = $6, likely_pushback = $7,
                -- §377. How much of what you said is still in it.
                opinion_overlap = $8, opinion_note = $9
          where id = $1`,
        [
          takeId,
          JSON.stringify(result.verification.claims),
          JSON.stringify(result.reinforcement.supporting),
          result.reinforcement.strongestCounter,
          JSON.stringify(result.reinforcement.riskFlags),
          result.draft.body,
          JSON.stringify(result.draft.likelyPushback),
          result.opinion.overlap,
          result.opinion.note,
        ],
      );
    }

    await query(`update rss_items set status = 'used' where id = $1`, [storyId]);
  } catch (err) {
    await query(
      `update takes set status = 'needs_revision', fact_check = $2 where id = $1`,
      [
        takeId,
        JSON.stringify([
          {
            claim: 'the loop could not run',
            verdict: 'unverifiable',
            note: `${(err as Error).message}. Your input is saved; nothing was drafted.`,
            sources: [],
          },
        ]),
      ],
    );
  }

  revalidatePath('/take');
}

/** Approve a drafted take into the queue, where it goes through the same gates. */
export async function approveTake(formData: FormData): Promise<void> {
  await requireOperator();
  const takeId = String(formData.get('takeId'));

  const take = await one<{ draft: string | null; raw_input: string }>(
    'select draft, raw_input from takes where id = $1',
    [takeId],
  );
  if (!take?.draft) return;

  const account = await one<{ id: string }>(
    `select id from social_accounts
      where persona = 'founder' and capability_state in ('live','draft_only')
      order by platform = 'x' desc limit 1`,
  );
  if (!account) return;

  const item = await query<{ id: string }>(
    `insert into content_items (product_id, account_id, platform, persona, format, category,
                                format_subtype, body, status, ai_components, generation_meta)
     values ('founder', $1, 'x', 'founder', 'text', 'founder_insight', 'take', $2,
             'pending_approval', array['copy'], $3)
     returning id`,
    [
      account.id,
      take.draft,
      // The raw input travels with the item: the diff between what was said and
      // what was published is the only honest record of whether the draft kept
      // the opinion.
      { source: 'daily_take', prompt_version: 'take_draft.v1', raw_input: take.raw_input },
    ],
  );

  await query(`update takes set status = 'approved', content_item_id = $2 where id = $1`, [
    takeId,
    item[0]!.id,
  ]);

  revalidatePath('/take');
  revalidatePath('/queue');
}

export async function discardTake(formData: FormData): Promise<void> {
  await requireOperator();
  await query(`update takes set status = 'discarded' where id = $1`, [String(formData.get('takeId'))]);
  revalidatePath('/take');
}
