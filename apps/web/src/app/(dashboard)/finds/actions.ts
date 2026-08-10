'use server';

import { revalidatePath } from 'next/cache';
import { one, query } from '@/lib/db';
import { requireOperator } from '@/lib/auth';
import { AnthropicLlmClient, extractJson } from '@halyard/core';

export async function addFind(formData: FormData): Promise<void> {
  await requireOperator();
  const url = String(formData.get('url') ?? '').trim();
  if (!url) return;

  await query(
    `insert into finds (product_id, url, why_useful, source)
     values ('founder', $1, $2, 'paste')
     on conflict (product_id, url) do nothing`,
    [url, String(formData.get('whyUseful') ?? '').trim() || null],
  );

  await query(
    `insert into jobs (kind, payload, priority, dedupe_key)
     values ('collect_signals', $1, 70, $2) on conflict do nothing`,
    [{ summariseFindUrl: url }, `find:${url}`],
  );

  revalidatePath('/finds');
}

/**
 * Turn a find into a draft. The operator's line is the seed and the constraint —
 * the model assembles around it rather than deciding what the point is.
 */
export async function draftFind(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));
  const whyUseful = String(formData.get('whyUseful') ?? '').trim();
  if (!whyUseful) return; // Without the reason there is nothing to say.

  await query('update finds set why_useful = $2 where id = $1', [id, whyUseful]);

  const find = await one<{ url: string; title: string | null; summary: string | null }>(
    'select url, title, summary from finds where id = $1',
    [id],
  );
  const account = await one<{ id: string }>(
    `select id from social_accounts where persona = 'founder'
      and capability_state in ('live','draft_only') limit 1`,
  );
  if (!find || !account) return;

  try {
    const llm = new AnthropicLlmClient();
    const response = await llm.complete({
      system: `You write a short post about a tool or technique the founder found useful.

Their line about why it is useful is the seed AND the constraint. Do not broaden
it, do not add benefits they did not claim, and do not turn it into a review.

- Say what it is, what it replaced, and what it cost.
- Concrete beats enthusiastic. No "you need this", no affiliate framing.
- One link, inline, at the end.
- Under 280 characters. No hashtags. No em dashes.

Reply with JSON only: {"body":""}`,
      messages: [
        {
          role: 'user',
          content: `${find.title ?? find.url}\n${find.summary ?? ''}\n${find.url}\n\nWHY IT IS USEFUL, IN THEIR WORDS\n${whyUseful}`,
        },
      ],
      maxTokens: 500,
      promptVersion: 'copywriter.founder.tip.v1',
    });

    const { body } = extractJson<{ body?: string }>(response.text);
    if (!body) return;

    const item = await query<{ id: string }>(
      `insert into content_items (product_id, account_id, platform, persona, format, category,
                                  format_subtype, body, link_url, status, ai_components, generation_meta)
       values ('founder', $1, 'x', 'founder', 'text', 'education', 'tip', $2, $3,
               'pending_approval', array['copy'], $4)
       returning id`,
      [account.id, body, find.url, { source: 'find', prompt_version: 'copywriter.founder.tip.v1' }],
    );

    await query(`update finds set status = 'drafted', content_item_id = $2 where id = $1`, [
      id,
      item[0]!.id,
    ]);
  } catch {
    // The line is saved either way; drafting can be retried.
  }

  revalidatePath('/finds');
  revalidatePath('/queue');
}

export async function discardFind(formData: FormData): Promise<void> {
  await requireOperator();
  await query(`update finds set status = 'discarded' where id = $1`, [String(formData.get('id'))]);
  revalidatePath('/finds');
}
