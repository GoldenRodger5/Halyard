'use server';

import { revalidatePath } from 'next/cache';
import { one, query } from '@/lib/db';
import { requireOperator } from '@/lib/auth';
import { createConnector } from '@halyard/core';

export async function saveBrief(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));
  const brief = String(formData.get('brief') ?? '');

  // A cheap deterministic summary: the first substantive paragraph. The full
  // markdown stays available; the summary is what rides in every prompt, so it
  // has to be short and it has to be stable.
  const summary =
    brief
      .split(/\n{2,}/)
      .map((p) => p.replace(/^#+\s*/, '').trim())
      .find((p) => p.length > 60) ?? brief.slice(0, 400);

  await query(
    `update products
        set brief_markdown = $2, brief_summary = $3, brief_updated_at = now()
      where id = $1`,
    [id, brief, summary.slice(0, 1200)],
  );
  await query(
    `update onboarding_state set step_ingest_done = $2 where product_id = $1`,
    [id, brief.trim().length > 0],
  );

  revalidatePath(`/products/${id}`);
  revalidatePath('/');
}

export async function saveVoice(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));
  const splitLines = (value: string): string[] =>
    value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

  const voice = await one<{ product_id: string }>(
    'select product_id from brand_voices where id = $1',
    [id],
  );

  await query(
    `update brand_voices
        set description = $2, do_rules = $3, dont_rules = $4
      where id = $1`,
    [
      id,
      String(formData.get('description') ?? ''),
      splitLines(String(formData.get('do_rules') ?? '')),
      splitLines(String(formData.get('dont_rules') ?? '')),
    ],
  );

  if (voice) {
    await query(`update onboarding_state set step_voice_done = true where product_id = $1`, [
      voice.product_id,
    ]);
    revalidatePath(`/products/${voice.product_id}`);
  }
}

/**
 * "Generate test sample" from v1 §8. Verifies the connector end to end before
 * anything depends on it, and records the outcome where the health page can see
 * it.
 */
export async function testConnector(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));

  const product = await one<{
    id: string;
    connector_type: 'mcp' | 'rest' | 'none';
    connector_config: Record<string, unknown>;
  }>('select id, connector_type, connector_config from products where id = $1', [id]);
  if (!product) return;

  const connector = createConnector(product);
  if (!connector) {
    await query(
      `insert into notifications (kind, severity, title, body)
       values ('connector_down', 'warning', 'No connector configured',
               'Set RECIPEFIX_MCP_URL and RECIPEFIX_MCP_TOKEN, or set connector_type to none.')`,
    );
    revalidatePath(`/products/${id}`);
    return;
  }

  const health = await connector.healthCheck();
  await query(
    `insert into notifications (kind, severity, title, body)
     values ('connector_down', $1, $2, $3)`,
    [
      health.ok ? 'info' : 'critical',
      health.ok ? 'Connector healthy' : 'Connector unreachable',
      `${health.detail ?? ''} (${health.latencyMs ?? 0}ms)`,
    ],
  );

  revalidatePath(`/products/${id}`);
  revalidatePath('/settings/health');
}
