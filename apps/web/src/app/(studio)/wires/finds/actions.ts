'use server';

import { revalidatePath } from 'next/cache';
import { one, query } from '@/lib/db';
import { requireOperator } from '@/lib/auth';
import { promoteFindToSignal } from '@/lib/findSignals';
import { recordingClient } from '@/lib/agentRuns';
import { createLlmClient, extractJson } from '@halyard/core';

export async function addFind(formData: FormData): Promise<void> {
  await requireOperator();
  const url = String(formData.get('url') ?? '').trim();
  if (!url) return;

  const whyUseful = String(formData.get('whyUseful') ?? '').trim() || null;

  /**
   * `do update` rather than `do nothing` on the reason.
   *
   * Pasting a URL and adding the reason afterwards is the normal way this gets
   * used, and `do nothing` silently discarded the second attempt — so the find
   * kept the null reason it was created with and could never be drafted from or
   * promoted. The URL still identifies the find; only the operator's line is
   * updated, and only when they actually supplied one.
   */
  const rows = await query<{ id: string }>(
    `insert into finds (product_id, url, why_useful, source)
     values ('founder', $1, $2, 'paste')
     on conflict (product_id, url) do update
       set why_useful = coalesce(excluded.why_useful, finds.why_useful)
     returning id`,
    [url, whyUseful],
  );

  /**
   * The `collect_signals` job that used to be enqueued here is gone.
   *
   * It carried `{ summariseFindUrl: url }` and **nothing has ever read that
   * payload** — `collect_signals` fetches RSS feeds, which is why `finds.title`
   * and `finds.summary` are null on every row. So the job did unrelated work on
   * a schedule that already runs it every six hours, and the find was never
   * summarised. Removing it changes no behaviour except the wasted fetch.
   *
   * What replaces it is the promotion below, which uses the evidence that
   * actually exists: the operator's own line.
   */
  const find = rows[0];
  if (find && whyUseful) {
    await promoteFindToSignal(
      async <T>(sql: string, params?: unknown[]) => (await query(sql, params ?? [])) as T[],
      {
        id: find.id,
        productId: 'founder',
        url,
        whyUseful,
      },
    );
  }

  revalidatePath('/wires/finds');
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
    const llm = recordingClient(createLlmClient(), { trigger: 'ui_action', triggerRef: id });
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

  revalidatePath('/wires/finds');
  revalidatePath('/gallery');
}

export async function discardFind(formData: FormData): Promise<void> {
  await requireOperator();
  await query(`update finds set status = 'discarded' where id = $1`, [String(formData.get('id'))]);
  revalidatePath('/wires/finds');
}

/**
 * Watch terms — the ignition `collect_watch_terms` never had.
 *
 * The job is scheduled daily per product, the handler is written, three sources
 * are implemented, `watch_hits` dedupes, and `findRecurringQuestions` promotes a
 * question asked repeatedly into a `signal` that feeds the idea engine. All of
 * it has run every day against **zero rows**, because nothing in the product
 * could create a watch term: no page, no server action, no API route referenced
 * `watch_terms` at all.
 *
 * The same missing-ignition shape as `explore_product` before P1 and
 * `verify-provider` before P2 — a complete capability nobody could reach.
 *
 * It lives on Finds because the two feed the same place: a find is a thing the
 * operator noticed, a watch term is a standing instruction to notice things, and
 * both end up as ideas.
 */
export async function addWatchTerm(formData: FormData): Promise<void> {
  await requireOperator();
  const term = String(formData.get('term') ?? '').trim();
  if (!term) return;

  /**
   * Sources are chosen, not assumed. `WatchSource` is `reddit | rss |
   * pinterest`; a term with no source would be collected by nothing and look
   * like a term that found nothing, which are different failures.
   */
  const chosen = ['reddit', 'rss', 'pinterest'].filter((s) => formData.get(`source_${s}`) === 'on');
  const sources = chosen.length > 0 ? chosen : ['reddit'];

  const minOccurrences = Math.max(2, Math.min(10, Number(formData.get('minOccurrences') ?? 3)));

  await query(
    `insert into watch_terms (product_id, term, sources, min_occurrences, enabled)
     values ($1, $2, $3, $4, true)
     on conflict (product_id, term) do update
       set sources = excluded.sources,
           min_occurrences = excluded.min_occurrences,
           enabled = true`,
    [String(formData.get('product') ?? 'recipefix'), term, sources, minOccurrences],
  );

  revalidatePath('/wires/finds');
}

/** Stop watching without losing what it already saw. */
export async function setWatchTermEnabled(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));
  const enabled = formData.get('enabled') === 'true';

  // Disabled rather than deleted: `watch_hits` references it, and thirty days of
  // recurrence evidence is the thing that makes a signal mean anything.
  await query(`update watch_terms set enabled = $2 where id = $1`, [id, enabled]);
  revalidatePath('/wires/finds');
}

/**
 * Run the collection now rather than waiting for tomorrow.
 *
 * Deliberately a button and not a shorter schedule: the sources are public
 * endpoints that ask to be polled politely, and the handler's own comment says
 * recurrence is measured over thirty days so reading more often changes nothing.
 * This exists so an operator who has just added a term can see it work.
 */
export async function collectWatchTermsNow(formData: FormData): Promise<void> {
  await requireOperator();
  const productId = String(formData.get('product') ?? 'recipefix');

  await query(
    `insert into jobs (kind, payload, priority, dedupe_key)
     values ('collect_watch_terms', $1, 55, $2)
     on conflict do nothing`,
    [
      JSON.stringify({ productId }),
      `watch_manual:${productId}:${new Date().toISOString().slice(0, 13)}`,
    ],
  );
  revalidatePath('/wires/finds');
}
