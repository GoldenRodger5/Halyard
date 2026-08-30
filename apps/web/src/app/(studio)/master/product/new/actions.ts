'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { GitHubConnector, McpClient } from '@halyard/core';
import { one, query } from '@/lib/db';
import { requireOperator } from '@/lib/auth';

/**
 * Adding a product. Milestone 43, item 1.
 *
 * Five steps, but one row: the wizard writes the product on step one and
 * updates it as it goes, so closing the tab halfway leaves a real product with
 * gaps rather than nothing at all. The gaps are what /onboarding then asks for.
 */

const SLUG = /^[a-z0-9][a-z0-9_-]*$/;

export async function createProduct(formData: FormData): Promise<void> {
  await requireOperator();

  const id = String(formData.get('id') ?? '').trim().toLowerCase();
  const name = String(formData.get('name') ?? '').trim();
  const tagline = String(formData.get('tagline') ?? '').trim();
  const websiteUrl = String(formData.get('website_url') ?? '').trim();
  const appStoreUrl = String(formData.get('app_store_url') ?? '').trim();
  const audienceTimezone = String(formData.get('audience_timezone') ?? 'America/New_York');
  const operatorTimezone = String(formData.get('operator_timezone') ?? 'America/New_York');

  const fail = (message: string): never =>
    redirect(`/master/product/new?error=${encodeURIComponent(message)}`);

  if (!name) fail('A product needs a name.');
  if (!SLUG.test(id)) {
    fail(
      `"${id}" is not a usable id. Lowercase letters, numbers, hyphens and underscores only — it appears in URLs and in the routing constraint.`,
    );
  }

  const existing = await one<{ id: string }>('select id from products where id = $1', [id]);
  if (existing) fail(`A product called "${id}" already exists.`);

  await query(
    `insert into products (id, name, tagline, website_url, app_store_url, audience_timezone,
                           operator_timezone, connector_type, destinations)
     values ($1,$2,$3,$4,$5,$6,$7,'none',$8)`,
    [
      id,
      name,
      tagline || null,
      websiteUrl || null,
      appStoreUrl || null,
      audienceTimezone,
      operatorTimezone,
      // Both are link destinations *and* evidence sources; `destinations` is
      // what `discoverEvidenceSources` reads first.
      {
        ...(websiteUrl ? { web: websiteUrl } : {}),
        ...(appStoreUrl ? { app_store: appStoreUrl } : {}),
      },
    ],
  );

  await query(`insert into onboarding_state (product_id) values ($1)`, [id]);

  await query(
    `insert into audit_log (actor, action, entity_type, entity_id, detail)
     values ('human', 'product_created', 'product', null, $1)`,
    [{ productId: id, name }],
  );

  redirect(`/master/product/new?product=${id}&step=2`);
}

export async function saveBrief(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('product'));
  const brief = String(formData.get('brief_markdown') ?? '').trim();

  await query(
    `update products
        set brief_markdown = $2, brief_summary = $3, brief_updated_at = now()
      where id = $1`,
    [id, brief || null, brief ? summarise(brief) : null],
  );

  if (brief) {
    await query(
      `update onboarding_state set step_ingest_done = true where product_id = $1`,
      [id],
    );
  }
  redirect(`/master/product/new?product=${id}&step=3`);
}

/**
 * A first-pass summary, computed rather than generated.
 *
 * The model writes a better one during onboarding, when it has the whole brief
 * and the voice. This exists so the field is never empty, and so the wizard
 * works with no API key at all.
 */
function summarise(brief: string): string {
  const sentences = brief
    .replace(/[#*_>`]/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
  return sentences.slice(0, 3).join(' ').slice(0, 600);
}

export async function saveBrandTokens(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('product'));

  const tokens = {
    primary: String(formData.get('primary') ?? '#C4714A'),
    background: String(formData.get('background') ?? 'hsl(50 20% 97%)'),
    ink: String(formData.get('ink') ?? '#2A2320'),
    muted: String(formData.get('muted') ?? '#7A6E66'),
    accent: String(formData.get('accent') ?? '#5C7A5E'),
    heading_font: String(formData.get('heading_font') ?? 'Instrument Serif'),
    body_font: String(formData.get('body_font') ?? 'Inter'),
  };

  await query(`update products set brand_tokens = $2 where id = $1`, [id, tokens]);
  redirect(`/master/product/new?product=${id}&step=4`);
}

export async function saveConnector(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('product'));
  const type = String(formData.get('connector_type') ?? 'none');

  const config: Record<string, unknown> = {};
  if (type === 'mcp') {
    config.url_env = String(formData.get('url_env') ?? '').trim() || `${id.toUpperCase()}_MCP_URL`;
    config.token_env =
      String(formData.get('token_env') ?? '').trim() || `${id.toUpperCase()}_MCP_TOKEN`;
  } else if (type === 'rest') {
    config.base_url = String(formData.get('base_url') ?? '').trim();
    config.token_env =
      String(formData.get('token_env') ?? '').trim() || `${id.toUpperCase()}_API_TOKEN`;
  } else if (type === 'github') {
    config.owner = String(formData.get('owner') ?? '').trim();
    config.repo = String(formData.get('repo') ?? '').trim();
    config.token_env = String(formData.get('token_env') ?? '').trim() || 'GITHUB_TOKEN';
  }

  await query(
    `update products set connector_type = $2, connector_config = $3, repo_config = $4 where id = $1`,
    [id, type, config, type === 'github' ? config : {}],
  );

  redirect(`/master/product/new?product=${id}&step=5`);
}

/**
 * Test the connection before the wizard moves on.
 *
 * Every connector type has a real test here, including `none` — which reports
 * that it is working as intended rather than leaving the button dead.
 */
export async function testConnector(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('product'));

  const product = await one<{
    connector_type: string;
    connector_config: Record<string, string>;
  }>('select connector_type, connector_config from products where id = $1', [id]);
  if (!product) return;

  const config = product.connector_config ?? {};
  let result: string;

  try {
    if (product.connector_type === 'none') {
      result =
        'ok: no connector, which is a supported configuration. Ideas come from the brief, ' +
        'signals and your own input; nothing will try to pull product output.';
    } else if (product.connector_type === 'mcp') {
      const url = process.env[config.url_env ?? ''];
      const token = process.env[config.token_env ?? ''];
      if (!url) {
        result = `blocked: ${config.url_env} is not set in the environment. Add it, then test again.`;
      } else {
        const client = new McpClient({
          url,
          token,
          clientName: 'halyard-connector-test',
          timeoutMs: 20_000,
        });
        const tools = await client.listTools();
        result = `ok: reached the MCP server and it advertises ${tools.length} tools.`;
      }
    } else if (product.connector_type === 'rest') {
      const base = config.base_url;
      if (!base) {
        result = 'blocked: no base URL configured.';
      } else {
        const response = await fetch(base, { method: 'GET' });
        result = response.ok
          ? `ok: ${base} responded ${response.status}.`
          : `failed: ${base} responded ${response.status}.`;
      }
    } else if (product.connector_type === 'github') {
      const token = process.env[config.token_env ?? 'GITHUB_TOKEN'];
      if (!token) {
        result = `blocked: ${config.token_env ?? 'GITHUB_TOKEN'} is not set. A fine-grained token with read access to the repo is enough.`;
      } else if (!config.owner || !config.repo) {
        result = 'blocked: owner and repo are both required.';
      } else {
        const connector = new GitHubConnector({
          token,
          config: { owner: config.owner, repo: config.repo },
        });
        const releases = await connector.listReleases(new Date(Date.now() - 365 * 86_400_000));
        result = `ok: reached ${config.owner}/${config.repo} and found ${releases.length} releases in the last year.`;
      }
    } else {
      result = `unknown connector type "${product.connector_type}".`;
    }
  } catch (err) {
    result = `failed: ${(err as Error).message}`;
  }

  await query(
    `update products set connector_config = connector_config || $2::jsonb where id = $1`,
    [id, { last_test: result, last_test_at: new Date().toISOString() }],
  );

  revalidatePath('/master/product/new');
}

/**
 * Seed the voices from the brief and finish.
 *
 * A product with no voice cannot generate anything, so the wizard writes a
 * usable starting point rather than leaving the table empty. The calibration
 * step in /onboarding is what turns it into the operator's actual voice.
 */
export async function seedVoices(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('product'));
  const description = String(formData.get('voice_description') ?? '').trim();

  const product = await one<{ name: string; brief_summary: string | null }>(
    'select name, brief_summary from products where id = $1',
    [id],
  );
  if (!product) return;

  await query(
    `insert into brand_voices (product_id, persona, display_name, description,
                               do_rules, dont_rules, mix_targets)
     values ($1,'brand',$2,$3,$4,$5,$6)
     on conflict (product_id, persona) do update
       set description = excluded.description, do_rules = excluded.do_rules,
           dont_rules = excluded.dont_rules`,
    [
      id,
      product.name,
      description ||
        `Plain, specific and useful. Explains the mechanism rather than asserting the result. Never enthusiastic on ${product.name}'s behalf.`,
      [
        "Lead with the reader's problem, in five words or fewer",
        'Name the mechanism, not the outcome',
        'Use real numbers from the product',
        'Admit what a change costs',
      ],
      [
        'Never claim a result the product cannot demonstrate',
        'Never use a superlative the reader cannot check',
        'Never write a sentence that would fit any other product',
      ],
      // The default mix from v2 G.2. Calibration moves it.
      { education: 0.25, transformation: 0.3, community: 0.15, product: 0.15, founder_insight: 0.15 },
    ],
  );

  await query(`update onboarding_state set step_voice_done = true where product_id = $1`, [id]);

  await query(
    `insert into slots (product_id, platform, name, window_start, window_end, weekdays, enabled)
     select $1, v.platform, v.name, v.start::time, v.end::time, '{1,2,3,4,5,6,7}', true
       from (values
         ('x','morning','08:30','10:30'),
         ('x','evening','17:30','19:30'),
         ('instagram','midday','11:30','13:30'),
         ('pinterest','evening','19:00','21:00')
       ) as v(platform, name, start, "end")
     on conflict do nothing`,
    [id],
  );

  revalidatePath('/master/product');
  redirect(`/master/product/${id}?created=1`);
}
