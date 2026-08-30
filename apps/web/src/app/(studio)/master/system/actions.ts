'use server';

import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireOperator } from '@/lib/auth';

/** v1 §10 — the kill switch. One toggle stops all outbound posting. */
export async function setKillSwitch(formData: FormData): Promise<void> {
  const operator = await requireOperator();
  const enabled = String(formData.get('enabled')) === '1';
  const reason = String(formData.get('reason') ?? '').trim() || null;

  await query(
    `update settings
        set publishing_enabled = $1,
            publishing_disabled_reason = case when $1 then null else $2 end
      where id = true`,
    [enabled, reason],
  );

  await query(
    `insert into audit_log (actor, action, entity_type, detail)
     values ('human', $1, 'settings', $2)`,
    [enabled ? 'publishing_enabled' : 'publishing_paused', { reason, operator: operator.email }],
  );

  revalidatePath('/settings');
  revalidatePath('/');
}

/**
 * How long operational logs are kept.
 *
 * Blank means keep everything, which is the default and is the *absence* of a
 * policy rather than one. Halyard deliberately ships no number here: how long
 * an operator's data is retained is their decision, and a default invented in
 * a migration would have made it silently.
 *
 * Never applies to `audit_log` — what a human decided is a compliance record,
 * and `purge_operational_logs` refuses to delete from it.
 */
export async function setLogRetention(formData: FormData): Promise<void> {
  const operator = await requireOperator();
  const raw = String(formData.get('days') ?? '').trim();

  const days = raw === '' ? null : Number(raw);
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 3650)) return;

  await query('update settings set log_retention_days = $1 where id = true', [days]);
  await query(
    `insert into audit_log (actor, action, entity_type, detail)
     values ('human', 'log_retention_set', 'settings', $1)`,
    [{ days, operator: operator.email }],
  );

  revalidatePath('/settings');
}

export async function setGeneration(formData: FormData): Promise<void> {
  await requireOperator();
  const enabled = String(formData.get('enabled')) === '1';
  await query('update settings set generation_enabled = $1 where id = true', [enabled]);
  revalidatePath('/settings');
}

/**
 * Build pack §9 — export. Writes a notification carrying the payload size so the
 * operator has a record; the file itself is streamed by the API route.
 */
export async function exportData(): Promise<void> {
  const operator = await requireOperator();
  const counts = await query<{ table_name: string; rows: string }>(
    `select 'content_items' as table_name, count(*)::text as rows from content_items
     union all select 'publications', count(*)::text from publications
     union all select 'post_metrics', count(*)::text from post_metrics
     union all select 'attribution', count(*)::text from attribution`,
  );

  await query(
    `insert into notifications (kind, severity, title, body)
     values ('digest', 'info', 'Export prepared', $1)`,
    [
      `Ready to download: ${counts.map((c) => `${c.rows} ${c.table_name}`).join(', ')}. ` +
        `Requested by ${operator.email}. Fetch it from /api/export.`,
    ],
  );

  revalidatePath('/settings');
}
