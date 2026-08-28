/**
 * §238. A render failure is attributable, and a success clears the one it caused.
 *
 * A production item was found at `status = 'failed'` with both of its renders
 * `done` and no error recorded anywhere. Nothing explains that state on any
 * screen and no job retries it — the render had failed, marked the item, then
 * been retried successfully, and there was no path back.
 *
 * The marker is what makes recovery safe: a render succeeding says nothing
 * about a claim that could not be verified, so only a failure *this* subsystem
 * caused may be cleared by it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createIsolatedPool, databaseAvailable } from '../../../packages/db/src/__tests__/testDb.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: Pool;

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('render_recovery', 6);
  await pool.query(
    `insert into products (id, name, connector_type) values ('recipefix','RecipeFix','none')
     on conflict (id) do nothing`,
  );
  await pool.query(
    `insert into social_accounts (id, product_id, platform, persona, handle)
     values ('33333333-3333-3333-3333-333333333333','recipefix','tiktok','brand','@recipefix')`,
  );
  await pool.query(
    `insert into templates (id, renderer, format, aspect_ratio, enabled)
     values ('TransformationDiff','remotion','video','9:16',true)
     on conflict (id) do nothing`,
  );
});

afterAll(async () => {
  if (available) await pool.end();
});

d('recovering an item a render failed', () => {
  async function seedItem(status: string, meta: Record<string, unknown>): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `insert into content_items (product_id, account_id, platform, persona, format, category,
                                  body, status, generation_meta)
       values ('recipefix','33333333-3333-3333-3333-333333333333','tiktok','brand','video',
               'education','body',$1,$2::jsonb) returning id`,
      [status, JSON.stringify(meta)],
    );
    return rows[0]!.id;
  }

  /* The exact statement the handler runs when a render lands successfully. */
  async function clearIfRenderCaused(id: string): Promise<number> {
    const { rows } = await pool.query(
      `update content_items
          set status = 'pending_approval',
              generation_meta = generation_meta - 'renderFailure'
        where id = $1
          and status = 'failed'
          and generation_meta ? 'renderFailure'
          and not exists (
            select 1 from renders
             where content_item_id = $1 and quality = 'final' and status = 'failed'
          )
        returning id`,
      [id],
    );
    return rows.length;
  }

  it('clears a failure the render subsystem caused', async () => {
    const id = await seedItem('failed', { renderFailure: { renderId: 'x', error: 'boom' } });
    expect(await clearIfRenderCaused(id)).toBe(1);
    const { rows } = await pool.query<{ status: string; has: boolean }>(
      `select status, generation_meta ? 'renderFailure' as has from content_items where id = $1`,
      [id],
    );
    expect(rows[0]!.status).toBe('pending_approval');
    expect(rows[0]!.has).toBe(false);
  });

  it('leaves a failure it did not cause alone', async () => {
    /*
     * The reason attribution exists. A render succeeding says nothing about a
     * claim that could not be verified, and resurrecting such an item would
     * push unverifiable content back toward approval.
     */
    const id = await seedItem('failed', { claimFailure: 'unverifiable' });
    expect(await clearIfRenderCaused(id)).toBe(0);
    const { rows } = await pool.query<{ status: string }>(
      'select status from content_items where id = $1',
      [id],
    );
    expect(rows[0]!.status).toBe('failed');
  });

  it('does not recover while another final render is still failed', async () => {
    const id = await seedItem('failed', { renderFailure: { renderId: 'x', error: 'boom' } });
    await pool.query(
      `insert into renders (content_item_id, template_id, renderer, input_props, quality, status)
       values ($1,'TransformationDiff','remotion','{}'::jsonb,'final','failed')`,
      [id],
    );
    expect(await clearIfRenderCaused(id)).toBe(0);
  });

  it('does not touch an item that is not failed', async () => {
    const id = await seedItem('pending_approval', {});
    expect(await clearIfRenderCaused(id)).toBe(0);
  });
});
