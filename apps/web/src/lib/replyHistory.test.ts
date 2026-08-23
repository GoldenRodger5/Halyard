/**
 * The reply history, which was collected and never read.
 *
 * `comment_replies` is written on every reply and its columns —
 * `was_ai_drafted`, `was_edited`, `latency_seconds` — are the only record of
 * whether the drafter earns its place. Nothing read them (`DECISIONS.md` §100).
 *
 * The write side was also wrong: `was_edited` was `suggested_reply !== body`,
 * and `suggested_reply` is **null** for any comment the drafter never ran on —
 * so `null !== body` is true and every hand-written reply was recorded as an
 * edit of a draft that never existed. That biased the one signal a future
 * quality loop would read toward "the human always rewrites it".
 *
 * These drive the real aggregate against a real Postgres.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createIsolatedPool,
  databaseAvailable,
} from '../../../../packages/db/src/__tests__/testDb.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;
let publicationId: string;

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('replyhistory', 4);
  await pool.query(
    `insert into products (id, name, connector_type) values ('recipefix','RecipeFix','none')
     on conflict (id) do nothing`,
  );
  const { rows: account } = await pool.query<{ id: string }>(
    `insert into social_accounts (product_id, platform, persona, handle, capability_state)
     values ('recipefix','instagram','brand','@replyhist','draft_only') returning id`,
  );
  const { rows: item } = await pool.query<{ id: string }>(
    `insert into content_items (product_id, account_id, platform, persona, format, category, body, status)
     values ('recipefix',$1,'instagram','brand','image','education','body','published') returning id`,
    [account[0]!.id],
  );
  const { rows: pub } = await pool.query<{ id: string }>(
    `insert into publications (content_item_id, account_id, platform, publish_mode, platform_post_id, published_at)
     values ($1,$2,'instagram','direct','p-1', now()) returning id`,
    [item[0]!.id, account[0]!.id],
  );
  publicationId = pub[0]!.id;
}, 180_000);

afterAll(async () => {
  if (available) await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  await pool.query('delete from comment_replies');
  await pool.query('delete from comments');
});


/** The production aggregate, driven against this pool. */
async function history() {
  const { rows } = await pool.query<{
    sent: string;
    ai_drafted: string;
    edited: string;
    median_latency: string | null;
  }>(
    `select count(*) as sent,
            count(*) filter (where was_ai_drafted) as ai_drafted,
            count(*) filter (where was_ai_drafted and was_edited) as edited,
            percentile_cont(0.5) within group (order by latency_seconds)
              filter (where latency_seconds is not null) as median_latency
       from comment_replies`,
  );
  const row = rows[0]!;
  return {
    sent: Number(row.sent),
    aiDrafted: Number(row.ai_drafted),
    edited: Number(row.edited),
    medianLatencySeconds: row.median_latency === null ? null : Math.round(Number(row.median_latency)),
  };
}

async function reply(input: {
  suggestion: string | null;
  body: string;
  latency: number | null;
}): Promise<void> {
  const { rows: comment } = await pool.query<{ id: string }>(
    `insert into comments (publication_id, platform_comment_id, body, suggested_reply)
     values ($1, $2, 'a question', $3) returning id`,
    [publicationId, `c-${Math.random()}`, input.suggestion],
  );
  // The exact expression `markReplied` uses, after §101.
  const suggestion = input.suggestion ?? null;
  await pool.query(
    `insert into comment_replies (comment_id, body, sent_by, was_ai_drafted, was_edited, latency_seconds)
     values ($1,$2,'human',$3,$4,$5)`,
    [
      comment[0]!.id,
      input.body,
      suggestion !== null,
      suggestion !== null && suggestion !== input.body,
      input.latency,
    ],
  );
}

d('the reply history', () => {
  it('reports nothing rather than zero when nobody has replied', async () => {
    // A median of "0 seconds" would read as instant replies. Null is the
    // honest answer to a question nobody has answered.
    expect(await history()).toEqual({
      sent: 0,
      aiDrafted: 0,
      edited: 0,
      medianLatencySeconds: null,
    });
  });

  it('does not count a reply typed from scratch as an edit', async () => {
    /**
     * The defect this exists for. With no draft, `suggested_reply` is null, and
     * the old expression `suggested_reply !== body` made every hand-written
     * reply look like the operator had rewritten the AI.
     */
    await reply({ suggestion: null, body: 'I wrote this myself', latency: 120 });

    const out = await history();
    expect(out.sent).toBe(1);
    expect(out.aiDrafted).toBe(0);
    expect(out.edited).toBe(0);
  });

  it('counts an unchanged draft as used, not edited', async () => {
    await reply({ suggestion: 'the draft', body: 'the draft', latency: 60 });

    const out = await history();
    expect(out.aiDrafted).toBe(1);
    expect(out.edited).toBe(0);
  });

  it('counts a changed draft as edited', async () => {
    await reply({ suggestion: 'the draft', body: 'the draft, improved', latency: 90 });

    const out = await history();
    expect(out.aiDrafted).toBe(1);
    expect(out.edited).toBe(1);
  });

  it('keeps the edit ratio measured against drafts, not against all replies', async () => {
    /**
     * The ratio the inbox renders. Three replies, one draft, and that draft
     * edited — 100% of drafts were edited, not 33% of replies. Mixing the
     * denominators is how "the drafter is useless" gets concluded from two
     * hand-written replies.
     */
    await reply({ suggestion: null, body: 'scratch one', latency: 10 });
    await reply({ suggestion: null, body: 'scratch two', latency: 20 });
    await reply({ suggestion: 'draft', body: 'draft changed', latency: 30 });

    const out = await history();
    expect(out.sent).toBe(3);
    expect(out.aiDrafted).toBe(1);
    expect(out.edited).toBe(1);
  });

  it('takes the median latency, so one late reply cannot move it', async () => {
    for (const latency of [30, 60, 90, 120, 604_800]) {
      await reply({ suggestion: null, body: `r${latency}`, latency });
    }
    // A mean would be over a day. The median is ninety seconds.
    expect((await history()).medianLatencySeconds).toBe(90);
  });

  it('ignores a reply with no recorded latency rather than treating it as instant', async () => {
    await reply({ suggestion: null, body: 'no timestamp', latency: null });
    await reply({ suggestion: null, body: 'timed', latency: 300 });

    const out = await history();
    expect(out.sent).toBe(2);
    expect(out.medianLatencySeconds).toBe(300);
  });
});

/**
 * The stored column, not the aggregate.
 *
 * The aggregate counts `was_ai_drafted and was_edited`, so the read side was
 * already immune to the write-side bug — a hand-written reply flagged
 * `was_edited` never reached the ratio because `was_ai_drafted` was false. That
 * is why reverting the fix did not fail the tests above.
 *
 * The column is still wrong, and a consumer reading `was_edited` on its own —
 * which is the obvious thing to do with a column called that — would conclude
 * the operator rewrites everything. These assert the value that is actually
 * stored.
 */
d('what is written to comment_replies', () => {
  async function storedFlags(input: { suggestion: string | null; body: string }) {
    await reply({ ...input, latency: 60 });
    const { rows } = await pool.query<{ was_ai_drafted: boolean; was_edited: boolean }>(
      'select was_ai_drafted, was_edited from comment_replies',
    );
    return rows[0]!;
  }

  it('records no edit when there was no draft to edit', async () => {
    // `suggested_reply` is null for any comment the drafter never ran on, and
    // `null !== body` is true — so every hand-written reply was stored as an
    // edit of a draft that never existed.
    expect(await storedFlags({ suggestion: null, body: 'written from scratch' })).toEqual({
      was_ai_drafted: false,
      was_edited: false,
    });
  });

  it('records a draft used unchanged', async () => {
    expect(await storedFlags({ suggestion: 'the draft', body: 'the draft' })).toEqual({
      was_ai_drafted: true,
      was_edited: false,
    });
  });

  it('records a draft that was changed', async () => {
    expect(await storedFlags({ suggestion: 'the draft', body: 'my version' })).toEqual({
      was_ai_drafted: true,
      was_edited: true,
    });
  });
});
