/**
 * Release detection, and what it triggers.
 *
 * The flows depend on live strings — `aria-label="Choose your swap"`,
 * `role=button[name="Adapt This Recipe →"]` — and RecipeFix ships through
 * Lovable with no CI, no release notes and no GitHub releases. A GitHub-based
 * trigger would therefore never fire for the one product this system exists to
 * serve, so it is the secondary signal rather than the primary one.
 *
 * The primary signal is the deployed build itself. recipefix.app is a Vite
 * single-page app and its entry bundle carries a content hash
 * (`/assets/index-DYhSuiDJ.js`) that changes on every deploy. One GET of the
 * homepage detects a release that nobody announced.
 *
 * A detected release does three things, in this order:
 *   1. records the new build against the product,
 *   2. marks every asset captured against the old build stale,
 *   3. enqueues a verification pass, so a broken selector is found by a job
 *      rather than by a video of an error state.
 */
import { GitHubConnector } from '@halyard/core';
import type { Job, HandlerContext } from '../poller.js';
import { detectAppVersion } from './capture.js';

export async function detectReleaseHandler(job: Job, ctx: HandlerContext): Promise<void> {
  const productId = String(job.payload.productId ?? 'recipefix');

  const { rows } = await ctx.pool.query<{
    id: string;
    destinations: { web?: string };
    website_url: string | null;
    observed_app_version: string | null;
    repo_config: { owner?: string; repo?: string; token_env?: string };
  }>(
    `select id, destinations, website_url, observed_app_version, repo_config
       from products where id = $1`,
    [productId],
  );
  const product = rows[0];
  if (!product) return;

  const baseUrl =
    process.env.RECIPEFIX_WEB_URL ?? product.destinations?.web ?? product.website_url;
  if (!baseUrl) {
    ctx.log('release detection skipped, no web URL', { productId });
    return;
  }

  const detected = await detectAppVersion(baseUrl);
  const githubRelease = await latestGitHubRelease(product.repo_config, ctx);

  // A GitHub release is a stronger statement than a bundle hash when both exist,
  // because it carries a human-written version.
  const version = githubRelease?.version ?? detected;
  if (!version) {
    ctx.log('release detection found no version signal', { productId, baseUrl });
    return;
  }

  if (version === product.observed_app_version) {
    ctx.log('no release since last check', { productId, version });
    return;
  }

  const previous = product.observed_app_version;

  await ctx.pool.query(
    `update products set observed_app_version = $2, observed_app_version_at = now()
      where id = $1`,
    [productId, version],
  );

  // First observation is not a release — it is the baseline. Treating it as one
  // would mark every asset stale the first time this ever runs.
  if (!previous) {
    ctx.log('recorded the first observed build', { productId, version });
    return;
  }

  const stale = await ctx.pool.query<{ id: string }>(
    `update assets
        set archived_reason = $3
      where product_id = $1 and archived_at is null and app_version is not null
        and app_version <> $2
      returning id`,
    [
      productId,
      version,
      `Captured against ${previous}; ${productId} now serves ${version}. Re-capture before using it.`,
    ],
  );

  await ctx.pool.query(
    `insert into jobs (kind, payload, priority, dedupe_key)
     values ('capture', $1, 15, $2)
     on conflict do nothing`,
    [
      { flowId: 'adapt_and_reveal', productId, verifyOnly: true, reason: `release ${version}` },
      `release_verify:${productId}:${version}`,
    ],
  );

  await ctx.pool.query(
    `insert into notifications (kind, severity, title, body, dedupe_key)
     values ('render_failure', 'info', $1, $2, $3)
     on conflict (dedupe_key) do nothing`,
    [
      `${productId} shipped: ${previous} → ${version}`,
      `${stale.rowCount ?? 0} captured asset${stale.rowCount === 1 ? '' : 's'} now predate the live build, and a flow verification has been queued. ` +
        'If the verification fails, the selectors moved with the deploy.',
      `release:${productId}:${version}`,
    ],
  );

  ctx.log('release detected', {
    productId,
    previous,
    version,
    staleAssets: stale.rowCount ?? 0,
  });
}

/** Secondary signal, for products that actually publish GitHub releases. */
async function latestGitHubRelease(
  repoConfig: { owner?: string; repo?: string; token_env?: string } | null,
  ctx: HandlerContext,
): Promise<{ version: string } | null> {
  if (!repoConfig?.owner || !repoConfig.repo) return null;

  const token = process.env[repoConfig.token_env ?? 'GITHUB_TOKEN'];
  if (!token) {
    ctx.log('repo configured but no token, skipping GitHub release check', {
      owner: repoConfig.owner,
    });
    return null;
  }

  try {
    const connector = new GitHubConnector({
      token,
      config: { owner: repoConfig.owner, repo: repoConfig.repo },
    });
    const releases = await connector.listReleases(new Date(Date.now() - 90 * 86_400_000));
    const latest = releases[0];
    return latest ? { version: latest.tag } : null;
  } catch (err) {
    ctx.log('GitHub release check failed', { error: (err as Error).message });
    return null;
  }
}
