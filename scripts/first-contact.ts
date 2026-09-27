/**
 * First contact. Milestone 46, extended in 49.
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
 * `--platform=<id>` runs the same rehearsal against any adapter, defaulting to
 * X. That exists because of a specific open question: Instagram's Standard
 * Access may already cover accounts you own, and if a real post to your own
 * account works, Instagram should stay on the direct adapter for its much richer
 * metrics rather than moving to a unified provider that cannot report saves.
 * Guessing the answer is what this whole script exists to avoid.
 *
 * `--publish` is the only destructive mode in this repository. It spends real
 * money, posts to a real account, and cannot be undone, so it refuses to run
 * without an explicit item id and an explicit acknowledgement.
 */
import { createInterface } from 'node:readline/promises';
import { parseArgs } from './args.js';
import pg from 'pg';
import {
  PLATFORM_CLIENT_ENV,
  PLATFORM_SCOPES,
  buildTarget,
  composeCaption,
  dryRunPublish,
  estimateXCostUsd,
  getAdapter,
  openToken,
  selfTest,
  stampUtm,
  TARGET_TYPE,
  type PlatformId,
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
  /** Which adapter is under test. X by default — it is the only ungated one. */
  platform: PlatformId;
  /** Direct platform API, or Blotato as the transport under first contact. */
  transport: 'direct' | 'unified';
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
    provider_account_id: string | null;
    transport: 'direct' | 'unified';
  }>(
    `select id, handle, platform_user_id, capability_state, access_token_enc,
            refresh_token_enc, token_expires_at, scopes, identity_confirmed_at,
            provider_account_id, transport
       from social_accounts
      where platform = $2 and persona = $1
        and product_id = case when $1 = 'founder' then 'founder' else $3 end
      order by identity_confirmed_at desc nulls last limit 1`,
    [persona, ctx.platform, ctx.productId],
  );

  const row = rows[0];
  if (!row) return null;
  if (ctx.transport === 'direct' && !row.access_token_enc) return null;
  if (ctx.transport === 'unified' && !row.provider_account_id) return null;

  return {
    row: row as unknown as Record<string, unknown>,
    account: {
      id: row.id,
      platform: ctx.platform,
      handle: row.handle,
      platformUserId: row.platform_user_id,
      capabilityState: row.capability_state,
      tokens:
        ctx.transport === 'unified'
          ? { accessToken: 'managed-by-unified-provider', scopes: [] }
          : {
              accessToken: openToken(row.access_token_enc!),
              refreshToken: row.refresh_token_enc ? openToken(row.refresh_token_enc) : null,
              expiresAt: row.token_expires_at ? new Date(row.token_expires_at) : null,
              scopes: row.scopes,
            },
      meta: ctx.transport === 'unified' ? { providerAccountId: row.provider_account_id } : undefined,
    },
  };
}

// ── 1. Preconditions ───────────────────────────────────────────────────────

async function checkPreconditions(ctx: Ctx): Promise<boolean> {
  heading('1. Preconditions');
  let blocked = false;

  if (ctx.transport === 'unified') {
    if (process.env.BLOTATO_API_KEY) {
      ok('Blotato API key', 'set');
    } else {
      bad('Blotato API key', 'BLOTATO_API_KEY is not set');
      blocked = true;
    }

    const { rows: mapped } = await ctx.pool.query<{ persona: string; handle: string; provider_account_id: string | null }>(
      `select persona, handle, provider_account_id from social_accounts
        where product_id = $1 and platform = $2 order by persona`,
      [ctx.productId, ctx.platform],
    );
    const usable = mapped.filter((row) => row.provider_account_id);
    if (usable.length === 0) {
      bad('provider account mapping', 'no Blotato account id is mapped; run the provider probe first');
      blocked = true;
    } else {
      for (const row of usable) {
        ok(`${row.persona} provider mapping`, `${row.handle} → ${row.provider_account_id}`);
      }
    }

    const { rows: beliefs } = await ctx.pool.query<{ n: string }>(
      `select count(*)::text as n from provider_capabilities where provider = 'blotato'`,
    );
    if (Number(beliefs[0]?.n ?? 0) === 0) {
      bad('provider probe', 'no read-only Blotato capability observation exists');
      blocked = true;
    } else {
      ok('provider probe', 'read-only provider observation exists; first contact may settle unknown publish capability');
    }
  } else {
    const env = PLATFORM_CLIENT_ENV[ctx.platform];
    if (!env) {
      // Bluesky has no developer app at all — an app password is the credential.
      ok('developer app credentials', 'this platform needs none');
    } else if (process.env[env.id] && process.env[env.secret]) {
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

  if (ctx.transport === 'unified') {
    const response = await fetch('https://backend.blotato.com/v2/users/me/accounts', {
      headers: { 'blotato-api-key': process.env.BLOTATO_API_KEY ?? '' },
    });
    if (!response.ok) {
      bad('Blotato account read', `HTTP ${response.status}`);
      return;
    }
    const payload = (await response.json()) as { items?: Array<{ id?: string; platform?: string; username?: string }> };
    const ids = new Set((payload.items ?? []).map((item) => String(item.id ?? '')));
    const { rows } = await ctx.pool.query<{ persona: 'brand' | 'founder'; handle: string; provider_account_id: string | null }>(
      `select persona, handle, provider_account_id from social_accounts
        where product_id = $1 and platform = $2 and provider_account_id is not null`,
      [ctx.productId, ctx.platform],
    );
    ok('Blotato API', `${(payload.items ?? []).length} connected accounts returned`);
    for (const row of rows) {
      const present = Boolean(row.provider_account_id && ids.has(row.provider_account_id));
      (present ? ok : bad)(
        `${row.persona}: ${row.handle}`,
        present ? `provider account ${row.provider_account_id} is present` : `mapped provider account ${row.provider_account_id} was not returned`,
      );
    }
    return;
  }

  for (const persona of ['brand', 'founder'] as const) {
    const loaded = await loadAccount(ctx, persona);
    if (!loaded) continue;

    const result = await selfTest(
      getAdapter(ctx.platform),
      loaded.account,
      PLATFORM_SCOPES[ctx.platform] ?? [],
    );
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
  row: {
    id: string;
    body: string;
    link_url: string | null;
    render_ids: string[];
    attached_asset_ids: string[];
    board_id: string | null;
  };
} | null> {
  const { rows } = await ctx.pool.query<{
    id: string;
    body: string;
    platform: PlatformId;
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
    render_ids: string[];
    attached_asset_ids: string[];
    board_id: string | null;
  }>(
    itemId
      ? `select * from content_items where id = $1`
      : `select * from content_items
          where platform = $1 and status in ('approved','scheduled','pending_approval')
          order by (status = 'approved') desc, created_at limit 1`,
    itemId ? [itemId] : [ctx.platform],
  );

  const row = rows[0];
  if (!row) return null;

  // Missing or unopenable — either way there is no live account, which is a
  // different problem from having no item and is reported as such.
  let account: PublishAccount | null;
  try {
    account = (await loadAccount(ctx, row.persona))?.account ?? null;
  } catch {
    account = null;
  }

  const finalLink =
    row.final_link_url ??
    (row.link_url
      ? stampUtm(row.link_url, {
          platform: ctx.platform,
          category: 'first_contact',
          contentItemId: row.id,
        })
      : null);

  return {
    row,
    account,
    persona: row.persona,
    item: {
      id: row.id,
      platform: ctx.platform,
      format: row.format,
      body: row.body,
      title: row.title,
      altText: row.alt_text,
      hashtags: row.hashtags ?? [],
      finalLinkUrl: finalLink,
      disclosureText: row.disclosure_text,
      requiresAiLabel: row.requires_ai_label ?? false,
      boardId: row.board_id,
    },
  };
}

async function previewMediaUrls(
  ctx: Ctx,
  row: { render_ids: string[]; attached_asset_ids: string[] },
): Promise<string[]> {
  const renderIds = row.render_ids ?? [];
  const attachedIds = row.attached_asset_ids ?? [];
  const urls: string[] = [];

  if (renderIds.length > 0) {
    const { rows } = await ctx.pool.query<{ public_url: string | null }>(
      `select a.public_url
         from renders r join assets a on a.id = r.output_asset_id
        where r.id = any($1::uuid[]) and a.archived_at is null
        order by array_position($1::uuid[], r.id)`,
      [renderIds],
    );
    urls.push(...rows.map((row) => row.public_url).filter((url): url is string => Boolean(url)));
  }
  if (attachedIds.length > 0) {
    const { rows } = await ctx.pool.query<{ public_url: string | null }>(
      `select public_url from assets
        where id = any($1::uuid[]) and archived_at is null
        order by array_position($1::uuid[], id)`,
      [attachedIds],
    );
    urls.push(...rows.map((row) => row.public_url).filter((url): url is string => Boolean(url)));
  }
  return urls;
}

// ── 4. Dry run ─────────────────────────────────────────────────────────────

async function dryRun(ctx: Ctx, itemId?: string): Promise<void> {
  heading('3. Dry run — the exact request, sent nowhere');

  const adapter = getAdapter(ctx.platform);
  const constraints = adapter.constraints;

  const picked = await pickItem(ctx, itemId);
  if (!picked) {
    bad(
      'no item',
      `nothing on ${ctx.platform} is approved or pending. Approve something in /queue first.`,
    );
    return;
  }

  const { text, linkForReply } = composeCaption(picked.item, constraints);

  console.log(`\n  ${DIM}The post, as ${ctx.platform} would receive it:${RESET}\n`);
  console.log(
    text
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n'),
  );
  console.log(`\n  ${DIM}${text.length} of ${constraints.maxChars} characters${RESET}`);

  if (linkForReply) {
    console.log(`\n  ${DIM}Then, as a reply to that post:${RESET}\n    ${linkForReply}`);
    console.log(
      `  ${DIM}The link is in the reply because a post containing a URL costs $0.20 against $0.015.${RESET}`,
    );
  } else if (picked.item.finalLinkUrl) {
    console.log(`\n  ${DIM}Destination: ${picked.item.finalLinkUrl}${RESET}`);
    console.log(`  ${DIM}${constraints.linkNote}${RESET}`);
  } else {
    warn('no link', 'this post carries no destination, so nothing will route or attribute');
  }

  // A dry run never sends. Direct adapters use the existing recording fetch;
  // Blotato is rendered as a pure payload because the unified adapter owns its
  // fetch implementation and must never accidentally reach the network here.
  let failed = false;
  let wouldHave: string;
  if (ctx.transport === 'unified') {
    if (linkForReply && constraints.linkStrategy === 'first_reply') {
      failed = true;
      wouldHave = `${ctx.platform} needs its link in a first reply, which Blotato cannot express. Keep this account direct.`;
      bad('unified dry run refused', wouldHave);
    } else {
      const account: PublishAccount = picked.account ?? {
        id: 'not-connected',
        platform: ctx.platform,
        handle: `@${picked.persona}-account`,
        capabilityState: 'pending_auth',
        tokens: { accessToken: 'managed-by-unified-provider' },
        meta: { providerAccountId: '<provider-account-id>' },
      };
      const providerAccountId = String(account.meta?.providerAccountId ?? '<provider-account-id>');
      const mediaUrls = await previewMediaUrls(ctx, picked.row);
      const payload = {
        post: {
          accountId: providerAccountId,
          content: { text, platform: TARGET_TYPE[ctx.platform], mediaUrls },
          target: buildTarget(ctx.platform, picked.item, account),
        },
      };
      console.log(`\n  ${DIM}Request it would send through Blotato:${RESET}`);
      console.log(`    POST https://backend.blotato.com/v2/posts`);
      console.log(`      ${DIM}${JSON.stringify(payload).slice(0, 1800)}${RESET}`);
      wouldHave = `submitted one ${ctx.platform} post to Blotato account ${providerAccountId}; Halyard would then poll the submission until published or failed`;
      ok('unified dry run complete', wouldHave);
    }
  } else {
    const account: PublishAccount = picked.account ?? {
      id: 'not-connected',
      platform: ctx.platform,
      handle: `@${picked.persona}-account`,
      capabilityState: 'pending_auth',
      tokens: { accessToken: 'not-a-real-token' },
    };
    const result = await dryRunPublish(adapter, picked.item, [], account);
    console.log(`\n  ${DIM}Requests it would send:${RESET}`);
    for (const request of result.requests) {
      console.log(`    ${request.method} ${request.url}`);
      if (request.body) console.log(`      ${DIM}${JSON.stringify(request.body).slice(0, 500)}${RESET}`);
    }
    failed = result.failed;
    wouldHave = result.wouldHave;
    (failed ? bad : ok)(failed ? 'dry run did not reach the platform' : 'dry run complete', wouldHave);
  }

  // X is the only platform that bills per call, and that applies to the direct
  // API path Halyard uses for its first-reply link strategy.
  const cost =
    ctx.transport === 'direct' && ctx.platform === 'x'
      ? estimateXCostUsd([{ hasLink: false }, ...(linkForReply ? [{ hasLink: false }] : [])])
      : null;
  if (!picked.account) {
    warn(
      'no connected account',
      ctx.transport === 'unified'
        ? `no Blotato provider account is mapped for the ${picked.persona} account yet`
        : `this rehearsed against a placeholder token — connect the ${picked.persona} account to go further`,
    );
  }
  if (cost !== null) {
    console.log(`  ${DIM}Estimated cost of the real thing: $${cost.toFixed(3)}${RESET}`);
  }
  if (failed && wouldHave) console.log(`  ${DIM}${wouldHave}${RESET}`);
  console.log(
    `\n  ${DIM}Nothing was sent. Every authorization header above was redacted before it was printed.${RESET}`,
  );
}

// ── 5. Publish, for real ───────────────────────────────────────────────────

async function publish(ctx: Ctx, itemId?: string): Promise<void> {
  heading('4. Publish — this is real, costs money, and cannot be undone');

  const picked = await pickItem(ctx, itemId);
  if (!picked) {
    bad('no item', `pass --item <uuid>, or approve something on ${ctx.platform} in /queue.`);
    return;
  }
  if (!picked.account) {
    bad(
      'no connected account',
      `connect the ${picked.persona} ${ctx.platform} account on /accounts first.`,
    );
    return;
  }

  const { text, linkForReply } = composeCaption(picked.item, getAdapter(ctx.platform).constraints);
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

  if (ctx.transport === 'unified') {
    const providerAccountId = String(picked.account.meta?.providerAccountId ?? '');
    if (!providerAccountId) {
      bad('aborted', 'the approved account has no Blotato provider account id');
      return;
    }
    await ctx.pool.query(
      `update social_accounts
          set transport = 'unified', provider_account_id = $2
        where id = $1`,
      [picked.account.id, providerAccountId],
    );
    await ctx.pool.query(
      `insert into audit_log (actor, action, entity_type, entity_id, detail)
       values ('human', 'first_contact_transport_selected', 'social_account', $1, $2)`,
      [picked.account.id, { transport: 'unified', provider: 'blotato', providerAccountId }],
    );
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
      payload: {
        contentItemId: picked.row.id,
        allowUnverifiedUnifiedFirstContact: ctx.transport === 'unified',
      },
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

  const { rows: after } = await ctx.pool.query<{ status: string }>(
    'select status from content_items where id = $1',
    [picked.row.id],
  );
  const status = after[0]?.status ?? 'unknown';
  if (status === 'published') {
    ok('published', 'the platform confirmed the post; now run first-contact --verify');
  } else if (status === 'publishing' && ctx.transport === 'unified') {
    ok('submitted to Blotato', 'not yet marked published; delivery reconciliation is queued and will settle it');
  } else if (status === 'awaiting_manual_publish') {
    warn('delivered as a draft/private upload', 'this is not a public post');
  } else {
    warn('publish path returned', `content item is now ${status}; inspect the publication row before doing anything else`);
  }
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
     where ci.platform = $1 order by p.published_at desc nulls last limit 1`,
    [ctx.platform],
  );

  const publication = publications[0];
  if (!publication) {
    warn('publications', `nothing published on ${ctx.platform} yet`);
    return;
  }

  (publication.platform_post_id ? ok : bad)(
    'publication row',
    `post ${publication.platform_post_id ?? 'MISSING — malformed response'}`,
  );
  (publication.permalink ? ok : warn)('permalink', publication.permalink ?? 'not recorded');
  if (ctx.transport === 'direct' && getAdapter(ctx.platform).constraints.linkStrategy === 'first_reply') {
    (publication.link_reply_post_id ? ok : warn)(
      'link in the first reply',
      publication.link_reply_post_id ?? 'no reply recorded — did the post carry a link?',
    );
  }
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

  // The reason `--platform=instagram` exists. If a direct post to an owned
  // account works, Instagram keeps the direct adapter: it returns saves, and the
  // unified transport does not.
  if (ctx.transport === 'direct' && ctx.platform === 'instagram' && publication.platform_post_id) {
    const { rows: saves } = await ctx.pool.query<{ saves: number | null }>(
      `select saves from post_metrics where publication_id = $1
        order by collected_at desc limit 1`,
      [publication.id],
    );
    (saves[0]?.saves !== null && saves[0]?.saves !== undefined ? ok : warn)(
      'saves',
      saves[0]?.saves !== null && saves[0]?.saves !== undefined
        ? `${saves[0].saves} — direct access returns saves, so keep Instagram on the direct transport`
        : 'not reported yet — saves decide whether Instagram stays direct, so re-run --verify after the first poll',
    );
  }

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
  const { itemId, platform: platformArg } = parseArgs(args);
  const platform = (platformArg ?? 'x') as PlatformId;

  try {
    getAdapter(platform);
  } catch {
    console.error(`Unknown platform "${platform}".`);
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Run ./scripts/halyard first.');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString, max: 4 });
  const transport: Ctx['transport'] = args.includes('--unified') ? 'unified' : 'direct';
  const ctx: Ctx = { pool, productId: 'recipefix', platform, transport };

  console.log(
    transport === 'unified'
      ? `\nFirst contact on ${platform} through Blotato. This is the deliberately armed path that lets one\n` +
          `explicitly approved real post settle an otherwise unknown provider capability. Ordinary automation\n` +
          `remains fail-closed until the provider reports that post as published.`
      : platform === 'x'
        ? `\nFirst contact — X is the only platform with no review gate, so it is where the\n` +
            `whole direct chain gets proved before the other direct adapters are touched.`
        : `\nFirst contact on ${platform} through the direct adapter. This platform may gate public posting\n` +
            `behind a review, so a failure can be provider policy rather than Halyard code.`,
  );

  const ready = await checkPreconditions(ctx);

  if (args.includes('--publish')) {
    /**
     * §154. The header has always promised that `--publish` "refuses to run
     * without an explicit item id". It did not: `pickItem` falls back to
     * whatever sorts first, and neither confirmation names the post — one asks
     * for the account handle, the other for the word PUBLISH. So the only
     * destructive command here could spend real money on a post nobody chose.
     */
    if (!itemId) {
      console.log(
        `\n${RED}Refusing to publish.${RESET} Name the item explicitly: ` +
          `--item=<uuid>.\nRun --dry-run with the same id first and read what it prints.\n`,
      );
      await pool.end();
      process.exit(1);
    }
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
      `\n${DIM}When the request above looks right:  pnpm first-contact --publish${transport === 'unified' ? ' --unified' : ''}${platform === 'x' ? '' : ` --platform=${platform}`} --item=<uuid>${RESET}\n`,
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
