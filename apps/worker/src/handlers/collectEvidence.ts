/**
 * Collect a product's public surfaces into `product_evidence`.
 *
 * There is no model in this file, on purpose. Collection and reasoning are
 * separate jobs so that evidence which was slow to gather survives a failure in
 * the reasoning over it — and so that a bad prompt can be re-run without
 * re-fetching someone's website.
 *
 * ## Why re-collection does not raise confidence
 *
 * Evidence is keyed on a hash of its content. Running this twice against an
 * unchanged site collides with the existing rows and touches `collected_at`
 * instead of inserting. Without that, a nightly collector would corroborate
 * every fact in the Brain with itself and everything would read `verified`
 * within a week — the exact "green means nothing" failure the Auditor exists to
 * catch, arriving through the front door.
 */
import { execFileSync } from 'node:child_process';
import {
  collectAppStoreEvidence,
  discoverEvidenceSources,
  hasAnyEvidenceSource,
  collectBriefEvidence,
  collectConnectorSurface,
  collectWebEvidence,
  createConnector,
  GitHubConnector,
  looksLikeFeature,
  hashContent,
  repositoryTreeBody,
  selectRepositoryEvidencePaths,
  type CollectedEvidence,
} from '@halyard/core';
import type { HandlerContext, Job } from '../poller.js';

interface ProductRow {
  id: string;
  name: string;
  brief_markdown: string | null;
  connector_type: 'mcp' | 'rest' | 'github' | 'none';
  connector_config: Record<string, unknown>;
  repo_config: Record<string, unknown>;
  destinations: { web?: string; app_store?: string } | null;
  website_url: string | null;
  app_store_url: string | null;
}

/**
 * Insert, or record that the same content was seen again.
 *
 * `on conflict do update` on the identity index is what makes the whole thing
 * idempotent. `collected_at` moves so staleness reflects when the source was
 * last confirmed to still say this; nothing else changes, because nothing else
 * can have changed without producing a different hash.
 */
export async function upsertEvidence(
  ctx: HandlerContext,
  productId: string,
  evidence: CollectedEvidence,
): Promise<{ id: string; fresh: boolean }> {
  const { rows } = await ctx.pool.query<{ id: string; fresh: boolean }>(
    `insert into product_evidence
       (product_id, kind, source_url, content_hash, title, body, meta, collector)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (product_id, kind, coalesce(source_url, ''), content_hash)
       do update set collected_at = now()
     returning id, (xmax = 0) as fresh`,
    [
      productId,
      evidence.kind,
      evidence.sourceUrl,
      evidence.contentHash,
      evidence.title,
      evidence.body,
      JSON.stringify(evidence.meta),
      evidence.collector,
    ],
  );
  return rows[0]!;
}

/**
 * Mark older observations of the same source superseded.
 *
 * The old row is kept rather than deleted. A fact citing it is not a broken
 * reference — it is the accurate statement "this was true of the page as it was
 * then", which is what provenance is for.
 */
async function supersedeOlder(
  ctx: HandlerContext,
  productId: string,
  kind: string,
  sourceUrl: string | null,
  currentId: string,
): Promise<void> {
  if (!sourceUrl) return;
  await ctx.pool.query(
    `update product_evidence
        set superseded_by = $4
      where product_id = $1 and kind = $2 and source_url = $3
        and id <> $4 and superseded_by is null`,
    [productId, kind, sourceUrl, currentId],
  );
}

/**
 * Resolve a GitHub credential without ever logging it.
 *
 * Cloud workers use the configured environment variable. On a founder's local
 * machine, `gh auth login` is already the durable credential store, so a rescan
 * can reuse that login rather than requiring the same secret to be copied into
 * another plaintext file. A machine with neither simply attempts public access
 * and reports the private-repo 404 honestly.
 */
export function localGitHubToken(
  tokenEnv: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const configured = env[tokenEnv]?.trim();
  if (configured) return configured;
  if (env.CI || env.VERCEL || env.RAILWAY_ENVIRONMENT || env.RENDER) return undefined;

  try {
    const token = execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3_000,
    }).trim();
    return token || undefined;
  } catch {
    return undefined;
  }
}

interface ScreenshotRow {
  id: string;
  alt_text: string | null;
  caption: string | null;
  storage_path: string;
  app_version: string | null;
}

export async function collectEvidenceHandler(job: Job, ctx: HandlerContext): Promise<void> {
  const productId = String(job.payload.productId ?? '');
  if (!productId) throw new Error('collect_product_evidence job has no productId');

  const { rows } = await ctx.pool.query<ProductRow>(
    `select id, name, brief_markdown, connector_type, connector_config, repo_config,
            destinations, website_url, app_store_url
       from products where id = $1`,
    [productId],
  );
  const product = rows[0];
  if (!product) throw new Error(`product ${productId} not found`);

  /**
   * What this product can be read from — decided once, and deterministically.
   *
   * §146. This was a chain of `if`s that told nobody what it concluded, so "no
   * evidence was collected" and "no sources are configured" were the same empty
   * run. `discoverEvidenceSources` is that decision in one place, and it is the
   * same function the setup screen and the Brain page show the operator — so
   * what they are told is what actually drove the collection.
   *
   * Every source is optional. A product with only a website is fully supported.
   */
  const { rows: shots } = await ctx.pool.query<ScreenshotRow>(
    `select id, alt_text, caption, storage_path, app_version
       from assets
      where product_id = $1
        and kind = 'screenshot'
        and archived_at is null
        and coalesce(alt_text, caption) is not null
      order by created_at desc limit 8`,
    [productId],
  );

  const sources = discoverEvidenceSources({ ...product, describedScreenshots: shots.length });
  const configured = new Set(sources.filter((s) => s.configured).map((s) => s.id));

  if (!hasAnyEvidenceSource(sources)) {
    // A real state with an obvious remedy, and the remedy belongs here rather
    // than in an operator's guess at why the Brain is empty.
    ctx.log('no evidence sources configured, nothing to collect', {
      productId,
      remedy: 'Add a website, or connect an MCP server or repository. Every source is optional.',
    });
    return;
  }

  const collected: CollectedEvidence[] = [];
  /** Per source: what was attempted and what came back. Logged at the end. */
  const outcomes: Record<string, string> = {};

  // ── Web ──────────────────────────────────────────────────────────────────
  const web = product.destinations?.web ?? product.website_url;
  if (configured.has('website') && web) {
    const pages = await collectWebEvidence({ rootUrl: web });
    collected.push(...pages);
    outcomes.website = `${pages.length} pages`;
  } else {
    outcomes.website = 'not configured';
  }

  // ── App Store ────────────────────────────────────────────────────────────
  const listing = product.destinations?.app_store ?? product.app_store_url;
  if (configured.has('app_store') && listing) {
    const rows = await collectAppStoreEvidence({ listingUrl: listing });
    collected.push(...rows);
    outcomes.app_store = `${rows.length} listings`;
  } else {
    outcomes.app_store = 'not configured';
  }

  // ── The product's own API surface ────────────────────────────────────────
  //
  // Wrapped, because a connector being unreachable is an operational state
  // already surfaced by the health check — not a reason to lose the web
  // evidence collected a moment ago.
  //
  // An unread source proves nothing about the product: a server that fails to
  // answer is not a product that lacks the capability, and the difference has
  // to survive into `outcomes` rather than being flattened to silence.
  if (configured.has('mcp')) {
    try {
      const connector = createConnector({
        id: product.id,
        connector_type: product.connector_type,
        connector_config: product.connector_config ?? {},
      });
      if (connector?.describeSurface) {
        /*
         * The tool list is fetched here rather than behind
         * `collectConnectorSurface`, which swallows the error and returns an
         * empty array. That swallow is right for the collector — an unreachable
         * server is not evidence about the product — but it left this handler
         * unable to tell "answered with nothing" from "did not answer", and it
         * reported an unreachable server as `reachable, advertised no tools`.
         * Claiming reachability that was never established is the same class of
         * error as gotcha 5.
         */
        const tools = await connector.describeSurface();
        const surface = await collectConnectorSurface({
          connectorId: productId,
          listTools: async () => tools,
        });
        collected.push(...surface);
        outcomes.mcp =
          tools.length > 0
            ? `${tools.length} tools advertised`
            : 'answered, but advertised no tools';
      } else {
        outcomes.mcp = 'configured, but this connector does not describe its surface';
      }
    } catch (err) {
      outcomes.mcp = `unavailable — ${(err as Error).message}`;
      ctx.log('connector surface unavailable', { productId, why: (err as Error).message });
    }
  } else {
    outcomes.mcp = 'not configured';
  }

  // ── Repository: implementation truth + the shipped surface ───────────────
  //
  // Repository evidence is additive. A product may expose MCP for real product
  // output and still have a repository that says what shipped. The recursive
  // tree gives Code Intelligence the complete component/route surface; a small
  // set of high-value docs is then read in full, plus recent user-facing PRs.
  if (configured.has('github')) {
    const repoConfig =
      product.repo_config && Object.keys(product.repo_config).length > 0
        ? product.repo_config
        : product.connector_type === 'github'
          ? product.connector_config
          : {};
    const owner = String(repoConfig.owner ?? '');
    const repo = String(repoConfig.repo ?? '');
    const tokenEnv = String(repoConfig.token_env ?? 'GITHUB_TOKEN');

    try {
      const github = new GitHubConnector({
        token: localGitHubToken(tokenEnv),
        config: { owner, repo },
      });
      const info = await github.getRepositoryInfo();
      const tree = await github.listTree(info.defaultBranch);
      const treeBody = repositoryTreeBody(tree);
      if (treeBody) {
        collected.push({
          kind: 'repository',
          sourceUrl: `https://github.com/${owner}/${repo}/tree/${info.defaultBranch}`,
          contentHash: hashContent(owner, repo, info.defaultBranch, treeBody),
          title: `${info.fullName} repository tree`,
          body: treeBody,
          meta: { defaultBranch: info.defaultBranch, private: info.private, files: tree.length },
          collector: 'github',
        });
      }

      const selected = selectRepositoryEvidencePaths(tree);
      let filesRead = 0;
      for (const path of selected) {
        const body = await github.readTextFile(path, info.defaultBranch);
        if (!body?.trim()) continue;
        filesRead += 1;
        collected.push({
          kind: 'repository',
          sourceUrl: `https://github.com/${owner}/${repo}/blob/${info.defaultBranch}/${path}`,
          contentHash: hashContent(owner, repo, info.defaultBranch, path, body.slice(0, 20_000)),
          title: path,
          body: body.slice(0, 20_000),
          meta: { defaultBranch: info.defaultBranch, path },
          collector: 'github',
        });
      }

      // Anonymous GitHub reads are limited to 60 requests/hour, and each PR
      // needs one extra call for its changed files. Public repositories do not
      // need a token, but an unauthenticated rescan must stay comfortably under
      // that ceiling instead of consuming the whole hour in one click.
      const pullLimit = process.env[tokenEnv] ? 50 : 12;
      const pulls = await github.listMergedPullRequests(
        new Date(Date.now() - 120 * 86_400_000),
        pullLimit,
      );
      const featurePulls = pulls.filter((pull) => looksLikeFeature(pull)).slice(0, 30);
      if (featurePulls.length > 0) {
        const body = featurePulls
          .map((pull) =>
            [
              pull.title,
              (pull.body ?? '').slice(0, 1_500),
              `changed: ${pull.files.slice(0, 20).join(', ')}`,
              `merged: ${pull.mergedAt.toISOString()}`,
            ].filter(Boolean).join('\n'),
          )
          .join('\n\n---\n\n')
          .slice(0, 20_000);
        collected.push({
          kind: 'repository',
          sourceUrl: `https://github.com/${owner}/${repo}/pulls?q=is%3Apr+is%3Amerged`,
          contentHash: hashContent(owner, repo, body),
          title: `${info.fullName} recent shipped work`,
          body,
          meta: { mergedPulls: featurePulls.length },
          collector: 'github',
        });
      }

      outcomes.github = `${tree.length} paths indexed · ${filesRead} files read · ${featurePulls.length} recent feature PRs`;
    } catch (err) {
      outcomes.github = `unavailable — ${(err as Error).message}`;
      ctx.log('repository evidence unavailable', { productId, why: (err as Error).message });
    }
  } else {
    outcomes.github = 'not configured';
  }

  // ── The operator's brief ─────────────────────────────────────────────────
  //
  // Evidence like any other, and deliberately not ground truth. Holding it to
  // the same corroboration rule is what lets the Brain report that the brief
  // and the site disagree, rather than silently preferring one.
  const brief = collectBriefEvidence({ productId, briefMarkdown: product.brief_markdown });
  collected.push(...brief);
  outcomes.operator_brief = brief.length > 0 ? 'included' : 'not written';

  // ── Screenshots already captured ─────────────────────────────────────────
  //
  // Reuses `assets` rather than taking new screenshots: the capture system
  // exists, runs on release detection, and already knows which shots are stale.
  //
  // `alt_text` and `caption` are what an asset says about itself. An asset with
  // neither is a file with no description, and describing it here would mean
  // inventing one.
  for (const shot of shots) {
    const description = [shot.alt_text, shot.caption].filter(Boolean).join(' — ');
    collected.push({
      kind: 'screenshot',
      sourceUrl: `asset://${shot.id}`,
      contentHash: hashContent(shot.id, description),
      title: shot.storage_path,
      body: description,
      meta: { assetId: shot.id, appVersion: shot.app_version },
      collector: 'assets',
    });
  }
  outcomes.screenshots = shots.length > 0 ? `${shots.length} described` : 'none described';

  let fresh = 0;
  for (const evidence of collected) {
    const { id, fresh: isNew } = await upsertEvidence(ctx, productId, evidence);
    if (isNew) fresh += 1;
    await supersedeOlder(ctx, productId, evidence.kind, evidence.sourceUrl, id);
  }

  ctx.log('collected product evidence', {
    productId,
    observed: collected.length,
    fresh,
    unchanged: collected.length - fresh,
    sources: outcomes,
  });

  /**
   * Reasoning follows collection, as a separate job.
   *
   * Chained rather than inlined so a model failure does not roll back the
   * evidence, and so the Brain can be rebuilt from stored evidence without
   * touching the product again.
   */
  if (collected.length > 0) {
    await ctx.enqueue(
      'build_product_brain',
      { productId },
      { dedupeKey: `build_brain:${productId}:${new Date().toISOString().slice(0, 10)}`, priority: 40 },
    );
  }
}
