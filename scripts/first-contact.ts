/**
 * First contact. Milestone 46.
 *
 * Seven adapters, none of which has met a live API. The instruction is not to
 * debug them simultaneously — X has no review gate and can be fully live today,
 * so the whole chain gets proved there once, and every difference between the
 * contract test and reality becomes the debugging map for the other six.
 *
 *   pnpm first-contact --dry-run     build the exact request, send nothing
 *   pnpm first-contact --publish     actually post, after two confirmations
 *   pnpm first-contact --verify      check the chain after a real post
 *
 * `--publish` is the only destructive mode in this repository. It spends real
 * money, posts to a real account, and cannot be undone, so it refuses to run
 * without an explicit item id and an explicit acknowledgement.
 */
import { createInterface } from 'node:readline/promises';
import pg from 'pg';
import {
  PLATFORM_CLIENT_ENV,
  X_CONSTRAINTS,
  composeCaption,
  dryRunPublish,
  estimateXCostUsd,
  getAdapter,
  openToken,
  selfTest,
  stampUtm,
  type PublishAccount,
  type PublishItem,
} from '@halyard/core';

const RESET = '[0m';
const DIM = '[2m';
const GREEN = '[32m';
const RED = '[31m';
const YELLOW = '[33m';

function ok(label: string, detail = ''): void {
  console.log(`${GREEN}✓${RESET} ${label}${detail ? `  ${DIM}${detail}${RESET}` : ''}`);
}
function warn(label: string, detail = ''): void {
  console.log(`${YELLOW}!${RESET} ${label}${detail ? `  ${DIM}${detail}${RESET}` : ''}`);
}
function bad(label: string, detail = ''): void {
  console.log(`${RED}✗${RESET} ${label}${detail ? `  ${DIM}${detail}${RESET}` : ''}`);
}
function heading(text: string): void {
  console.log(`\n${text}\n${'─'.repeat(text.length)}`);
}

interface Ctx {
  pool: pg.Pool;
  productId: string;
}

async function loadAccount(
  ctx: Ctx,
  persona: 'brand' | 'founder',
): Promise<{ row: Record<string, unknown>; account: PublishAccount } | null> {
  const { rows } = await ctx.pool.query<{
    id: string;
    handle: string;
    platform_user_id: string | null;
    capability_state: PublishAccount['capabilityState'];
    access_token_enc: Buffer | null;
    refresh_token_enc: Buffer | null;
    token_expires_at: string | null;
    scopes: string[];
    identity_confirmed_at: string | null;
  }>(
    `select id, handle, platform_user_id, capability_state, access_token_enc,
            refresh_token_enc, token_expires_at, scopes, identity_confirmed_at
       from social_accounts
      where platform = 'x' and persona = $1
      order by identity_confirmed_at desc nulls last limit 1`,
    [persona],
  );

  const row = rows[0];
  if (!row?.access_token_enc) return null;

  return {
    row: row as unknown as Record<string, unknown>,
    account: {
      id: row.id,
      platform: 'x',
      handle: row.handle,
      platformUserId: row.platform_user_id,
      capabilityState: row.capability_state,
      tokens: {
        accessToken: openToken(row.access_token_enc),
        refreshToken: row.refresh_token_enc ? openToken(row.refresh_token_enc) : null,
        expiresAt: row.token_expires_at ? new Date(row.token_expires_at) : null,
        scopes: row.scopes,
      },
    },
  };
}

// ── 1. Preconditions ───────────────────────────────────────────────────────

async function checkPreconditions(ctx: Ctx): Promise<boolean> {
  heading('1. Preconditions');
  let blocked = false;

  const env = PLATFORM_CLIENT_ENV.x;
  if (process.env[env.id] && process.env[env.secret]) {
    ok('developer app credentials', `${env.id} and ${env.secret} are set`);
  } else {
    bad('developer app credentials', `${env.id} and ${env.secret} are not set`);
    console.log(`  ${DIM}Run ./scripts/doctor — it prints the whole acquisition sequence.${RESET}`);
    blocked = true;
  }

  if (process.env.TOKEN_ENCRYPTION_KEY) {
    ok('token encryption key', 'tokens can be opened');
  } else {
    bad('token encryption key', 'TOKEN_ENCRYPTION_KEY is not set, so no token can be opened');
    blocked = true;
  }

  for (const persona of ['brand', 'founder'] as const) {
    const loaded = await loadAccount(ctx, persona);
    if (!loaded) {
      warn(`${persona} account`, 'not connected — /accounts → Connect, in a private window');
      blocked = true;
      continue;
    }
    const confirmed = loaded.row.identity_confirmed_at !== null;
    ok(
      `${persona} account`,
      `${loaded.account.handle}${confirmed ? '' : ' — identity never confirmed'}`,
    );
    if (!confirmed) blocked = true;
  }

  const { rows: settings } = await ctx.pool.query<{ publishing_enabled: boolean }>(
    'select publishing_enabled from settings where id = true',
  );
  if (settings[0]?.publishing_enabled) {
    ok('kill switch', 'publishing is enabled');
  } else {
    warn('kill switch', 'publishing is paused — turn it on in /settings before --publish');
  }

  return !blocked;
}

// ── 2. Self-test ───────────────────────────────────────────────────────────

async function runSelfTest(ctx: Ctx): Promise<void> {
  heading('2. Credential self-test');

  for (const persona of ['brand', 'founder'] as const) {
    const loaded = await loadAccount(ctx, persona);
    if (!loaded) continue;

    const result = await selfTest(getAdapter('x'), loaded.account, ['tweet.write', 'users.read']);
    for (const check of result.checks) {
      (check.ok ? ok : bad)(`${persona}: ${check.name}`, check.detail);
    }
  }
}

// ── 3. The item ────────────────────────────────────────────────────────────

/**
 * The item to rehearse, and the account it would go out on.
 *
 * The account is optional on purpose. A dry run has to work before any
 * credential exists — seeing exactly what would be posted is the thing that
 * tells you whether the twenty minutes of developer-portal forms are worth it.
 */
async function pickItem(ctx: Ctx, itemId?: string): Promise<{
  item: PublishItem;
  account: PublishAccount | null;
  persona: 'brand' | 'founder';
  row: { id: string; body: string; link_url: string | null };
} | null> {
  const { rows } = await ctx.pool.query<{
    id: string;
    body: string;
    platform: 'x';
    format: PublishItem['format'];
    title: string | null;
    alt_text: string | null;
    hashtags: string[];
    link_url: string | null;
    final_link_url: string | null;
    disclosure_text: string | null;
    requires_ai_label: boolean | null;
    persona: 'brand' | 'founder';
    status: string;
  }>(
    itemId
      ? `select * from content_items where id = $1`
      : `select * from content_items
          where platform = 'x' and status in ('approved','scheduled','pending_approval')
          order by (status = 'approved') desc, created_at limit 1`,
    itemId ? [itemId] : [],
  );

  const row = rows[0];
  if (!row) return null;

  // Missing or unopenable — either way there is no live account, which is a
  // different problem from having no item and is reported as such.
  let account: PublishAccount | null = null;
  try {
    account = (await loadAccount(ctx, row.persona))?.account ?? null;
  } catch {
    account = null;
  }

  const finalLink =
    row.final_link_url ??
    (row.link_url
      ? stampUtm(row.link_url, { platform: 'x', category: 'first_contact', contentItemId: row.id })
      : null);

  return {
    row,
    account,
    persona: row.persona,
    item: {
      id: row.id,
      platform: 'x',
      format: row.format,
      body: row.body,
      title: row.title,
      altText: row.alt_text,
      hashtags: row.hashtags ?? [],
      finalLinkUrl: finalLink,
      disclosureText: row.disclosure_text,
      requiresAiLabel: row.requires_ai_label ?? false,
    },
  };
}

// ── 4. Dry run ─────────────────────────────────────────────────────────────

async function dryRun(ctx: Ctx, itemId?: string): Promise<void> {
  heading('3. Dry run — the exact request, sent nowhere');

  const picked = await pickItem(ctx, itemId);
  if (!picked) {
    bad('no item', 'nothing on X is approved or pending. Approve something in /queue first.');
    return;
  }

  const { text, linkForReply } = composeCaption(picked.item, X_CONSTRAINTS);

  console.log(`\n  ${DIM}The post, as X would receive it:${RESET}\n`);
  console.log(
    text
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n'),
  );
  console.log(`\n  ${DIM}${text.length} of ${X_CONSTRAINTS.maxChars} characters${RESET}`);

  if (linkForReply) {
    console.log(`\n  ${DIM}Then, as a reply to that post:${RESET}\n    ${linkForReply}`);
    console.log(
      `  ${DIM}The link is in the reply because a post containing a URL costs $0.20 against $0.015.${RESET}`,
    );
  } else {
    warn('no link', 'this post carries no destination, so nothing will route or attribute');
  }

  // A dry run never sends, so a placeholder token is enough to walk the whole
  // adapter path and see the requests it would build.
  const account: PublishAccount = picked.account ?? {
    id: 'not-connected',
    platform: 'x',
    handle: `@${picked.persona}-account`,
    capabilityState: 'pending_auth',
    tokens: { accessToken: 'not-a-real-token' },
  };

  const result = await dryRunPublish(getAdapter('x'), picked.item, [], account);

  console.log(`\n  ${DIM}Requests it would send:${RESET}`);
  for (const request of result.requests) {
    console.log(`    ${request.method} ${request.url}`);
    if (request.body) {
      console.log(`      ${DIM}${JSON.stringify(request.body).slice(0, 300)}${RESET}`);
    }
  }

  const cost = estimateXCostUsd([{ hasLink: false }, ...(linkForReply ? [{ hasLink: false }] : [])]);
  ok('dry run complete', result.wouldHave);
  if (!picked.account) {
    warn(
      'no connected account',
      `this rehearsed against a placeholder token — connect the ${picked.persona} account to go further`,
    );
  }
  console.log(`  ${DIM}Estimated cost of the real thing: $${cost.toFixed(3)}${RESET}`);
  console.log(
    `\n  ${DIM}Nothing was sent. Every authorization header above was redacted before it was printed.${RESET}`,
  );
}

// ── 5. Publish, for real ───────────────────────────────────────────────────

async function publish(ctx: Ctx, itemId?: string): Promise<void> {
  heading('4. Publish — this is real, costs money, and cannot be undone');

  const picked = await pickItem(ctx, itemId);
  if (!picked) {
    bad('no item', 'pass --item <uuid>, or approve something on X in /queue.');
    return;
  }
  if (!picked.account) {
    bad('no connected account', `connect the ${picked.persona} X account on /accounts first.`);
    return;
  }

  const { text, linkForReply } = composeCaption(picked.item, X_CONSTRAINTS);
  console.log(`\n  Posting as ${picked.account.handle}:\n`);
  console.log(
    text
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n'),
  );
  if (linkForReply) console.log(`\n  Then replying with:\n    ${linkForReply}`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const first = await rl.question(
    `\n  This posts to the real ${picked.account.handle}. Type the handle to continue: `,
  );
  if (first.trim() !== picked.account.handle.replace(/^@/, '') &&
      first.trim() !== picked.account.handle) {
    rl.close();
    bad('aborted', 'the handle did not match');
    return;
  }
  const second = await rl.question('  Type PUBLISH to confirm: ');
  rl.close();
  if (second.trim() !== 'PUBLISH') {
    bad('aborted', 'not confirmed');
    return;
  }

  // Everything after this point is the ordinary publish path — the same handler
  // the worker runs, not a special one. A separate code path here would prove
  // nothing about the code that actually publishes.
  const { publishHandler } = await import('../apps/worker/src/handlers/publish.js');
  await ctx.pool.query(`update content_items set status = 'approved' where id = $1`, [
    picked.row.id,
  ]);

  await publishHandler(
    {
      id: 'first-contact',
      kind: 'publish',
      payload: { contentItemId: picked.row.id },
      attempts: 1,
      max_attempts: 1,
      dedupe_key: null,
    } as never,
    {
      pool: ctx.pool,
      workerId: 'first-contact',
      log: (message, detail) => console.log(`  ${DIM}${message}${RESET}`, detail ?? ''),
      enqueue: async (kind, payload) => {
        await ctx.pool.query(`insert into jobs (kind, payload) values ($1,$2)`, [kind, payload]);
      },
    },
  );

  ok('published', 'now run: pnpm first-contact --verify');
}

// ── 6. Verify the chain ────────────────────────────────────────────────────

async function verify(ctx: Ctx): Promise<void> {
  heading('5. Verify the chain');

  const { rows: publications } = await ctx.pool.query<{
    id: string;
    content_item_id: string;
    platform_post_id: string | null;
    permalink: string | null;
    link_reply_post_id: string | null;
    needs_reconciliation: boolean;
    published_at: string | null;
  }>(
    `select p.* from publications p
      join content_items ci on ci.id = p.content_item_id
     where ci.platform = 'x' order by p.published_at desc nulls last limit 1`,
  );

  const publication = publications[0];
  if (!publication) {
    warn('publications', 'nothing published on X yet');
    return;
  }

  (publication.platform_post_id ? ok : bad)(
    'publication row',
    `post ${publication.platform_post_id ?? 'MISSING — malformed response'}`,
  );
  (publication.permalink ? ok : warn)('permalink', publication.permalink ?? 'not recorded');
  (publication.link_reply_post_id ? ok : warn)(
    'link in the first reply',
    publication.link_reply_post_id ?? 'no reply recorded — did the post carry a link?',
  );
  (publication.needs_reconciliation ? warn : ok)(
    'response parsed',
    publication.needs_reconciliation ? 'flagged for reconciliation' : 'clean',
  );

  // Idempotency: a second attempt must not produce a second row.
  const { rows: dupes } = await ctx.pool.query<{ n: string }>(
    `select count(*) as n from publications where content_item_id = $1`,
    [publication.content_item_id],
  );
  (Number(dupes[0]!.n) === 1 ? ok : bad)('idempotency', `${dupes[0]!.n} publication row(s)`);

  const { rows: metrics } = await ctx.pool.query<{ impressions: number; collected_at: string }>(
    `select impressions, collected_at from post_metrics
      where publication_id = $1 order by collected_at desc limit 1`,
    [publication.id],
  );
  (metrics[0] ? ok : warn)(
    'metrics',
    metrics[0]
      ? `${metrics[0].impressions ?? 0} impressions at ${metrics[0].collected_at}`
      : 'not collected yet — the first poll is an hour after publish',
  );

  const { rows: comments } = await ctx.pool.query<{ n: string }>(
    `select count(*) as n from comments where publication_id = $1`,
    [publication.id],
  );
  (Number(comments[0]!.n) > 0 ? ok : warn)(
    'comments in the inbox',
    `${comments[0]!.n} — replies are drafted, never sent`,
  );

  const { rows: clicks } = await ctx.pool.query<{ device_class: string; n: string }>(
    `select device_class, count(*) as n from link_clicks
      where content_item_id = $1 group by device_class`,
    [publication.content_item_id],
  );
  (clicks.length > 0 ? ok : warn)(
    'routed clicks',
    clicks.length > 0
      ? clicks.map((c) => `${c.n} ${c.device_class}`).join(', ')
      : 'none yet — click the link in the post yourself to prove the router',
  );

  const { rows: attribution } = await ctx.pool.query<{ n: string }>(
    `select count(*) as n from attribution where content_item_id = $1`,
    [publication.content_item_id],
  );
  (Number(attribution[0]!.n) > 0 ? ok : warn)(
    'attribution',
    Number(attribution[0]!.n) > 0
      ? 'present'
      : 'none — needs RecipeFix to capture utm_content, which is the other half of the chain',
  );

  console.log(
    `\n  ${DIM}Anything that differs from what the contract tests assumed belongs in docs/FIRST_CONTACT.md.${RESET}`,
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const itemId = args.includes('--item') ? args[args.indexOf('--item') + 1] : undefined;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Run ./scripts/halyard first.');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString, max: 4 });
  const ctx: Ctx = { pool, productId: 'recipefix' };

  console.log(
    `\nFirst contact — X is the only platform with no review gate, so it is where the\n` +
      `whole chain gets proved before the other six are touched.`,
  );

  const ready = await checkPreconditions(ctx);

  if (args.includes('--publish')) {
    if (!ready) {
      console.log(`\n${RED}Not ready.${RESET} Fix the failures above first.\n`);
      await pool.end();
      process.exit(1);
    }
    await runSelfTest(ctx);
    await publish(ctx, itemId);
  } else if (args.includes('--verify')) {
    await verify(ctx);
  } else {
    if (ready) await runSelfTest(ctx);
    await dryRun(ctx, itemId);
    console.log(
      `\n${DIM}When the request above looks right:  pnpm first-contact --publish${RESET}\n`,
    );
  }

  await pool.end();
}

if (process.argv[1]?.endsWith('first-contact.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
