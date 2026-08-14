/**
 * Walk the product, propose claims, and queue each one for verification.
 *
 * The discovering half of Phase 3. It never decides that anything is true — it
 * writes `unverified` rows and enqueues `verify_feature`, which replays them.
 *
 * ## Signing in is code, not a proposed step
 *
 * The authenticator runs before any discovered flow, using credentials from the
 * environment, and it is written here rather than left to the model. That is
 * why `checkFlowSafety` refuses a discovered `fill` into a password field
 * outright: there is no legitimate reason for a proposed flow to type a
 * credential, because signing in has already happened.
 *
 * ## What it will not do
 *
 * Follow links off the product. Sign out. Spend money. Delete anything. Those
 * are enforced by `checkFlowSafety` on every proposal, and again before every
 * replay — not by this file remembering to be careful.
 *
 * Exploration is meant to run against a **dedicated account** with no payment
 * method. The denylist is a heuristic and text matching has gaps; the account
 * is the control that does not depend on guessing what a button means.
 */
import { chromium, type Page } from 'playwright';
import {
  createLlmClient,
  discoverClaims,
  isInScope,
  type PageOutline,
} from '@halyard/core';
import type { HandlerContext, Job } from '../poller.js';

/** How many pages one exploration run visits. */
export const MAX_PAGES = 12;

interface ProductRow {
  id: string;
  name: string;
  destinations: { web?: string } | null;
}

export interface ExploreCredentials {
  email: string;
  password: string;
}

/** The exploration account, which is deliberately not the operator's own. */
export function credentialsFromEnv(): ExploreCredentials | null {
  const email = process.env.EXPLORE_ACCOUNT_EMAIL;
  const password = process.env.EXPLORE_ACCOUNT_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}

export async function exploreHandler(job: Job, ctx: HandlerContext): Promise<void> {
  const productId = String(job.payload.productId ?? '');
  if (!productId) throw new Error('explore job has no productId');

  const { rows } = await ctx.pool.query<ProductRow>(
    'select id, name, destinations from products where id = $1',
    [productId],
  );
  const product = rows[0];
  if (!product) throw new Error(`product ${productId} not found`);

  const root = product.destinations?.web;
  if (!root) {
    // Not an error: a product with no web presence is a real configuration.
    ctx.log('nothing to explore', { productId, why: 'no web destination recorded' });
    return;
  }

  const credentials = credentialsFromEnv();
  const { rows: existing } = await ctx.pool.query<{ name: string }>(
    'select name from feature_claims where product_id = $1',
    [productId],
  );
  const existingNames = existing.map((e) => e.name);

  const llm = createLlmClient();
  const browser = await chromium.launch({ headless: true });
  let proposed = 0;
  let refused = 0;
  let cost = 0;

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    await page.goto(root, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    /**
     * Signed-out exploration is still worth doing.
     *
     * Most of what a product markets is visible before login — the landing
     * page, the pricing, the public flows. Refusing to explore at all without
     * credentials would mean this feature does nothing until a secret arrives,
     * and the standing rule here is that no code path goes unwritten because a
     * credential is absent.
     */
    if (credentials) {
      const signedIn = await signIn(page, root, credentials);
      ctx.log(signedIn ? 'signed in for exploration' : 'could not sign in; exploring signed out', {
        productId,
      });
    } else {
      ctx.log('exploring signed out', {
        productId,
        why: 'EXPLORE_ACCOUNT_EMAIL and EXPLORE_ACCOUNT_PASSWORD are not set',
      });
    }

    const queue = [root];
    const visited = new Set<string>();

    while (queue.length > 0 && visited.size < MAX_PAGES) {
      const url = queue.shift()!;
      if (visited.has(url) || !isInScope(url, [root])) continue;
      visited.add(url);

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      } catch {
        continue;
      }

      const outline = await outlineOf(page);
      const result = await discoverClaims(
        outline,
        { productName: product.name, allowedOrigins: [root], existingNames },
        llm,
      );
      cost += result.costUsd;
      refused += result.rejected.length;

      for (const claim of result.accepted) {
        const inserted = await ctx.pool.query<{ id: string }>(
          `insert into feature_claims (product_id, name, summary, source, replay, evidence)
           values ($1, $2, $3, 'crawl', $4, $5)
           on conflict (product_id, name) do nothing
           returning id`,
          [
            productId,
            claim.name,
            claim.summary,
            JSON.stringify({ steps: claim.steps }),
            JSON.stringify({ foundAt: url, title: outline.title }),
          ],
        );
        const id = inserted.rows[0]?.id;
        if (!id) continue;

        existingNames.push(claim.name);
        proposed += 1;

        // Queued rather than replayed inline: a claim is worthless until it is
        // checked, and this handler already holds a browser.
        await ctx.enqueue(
          'verify_feature',
          { claimId: id },
          { dedupeKey: `verify_feature:${id}`, priority: 60 },
        );
      }

      /**
       * Rejections are logged, not discarded. What the model *tried* to propose
       * is the signal for whether the prompt works — and repeated destructive
       * proposals are something to know about rather than to filter quietly.
       */
      for (const rejection of result.rejected) {
        ctx.log('claim rejected at discovery', {
          productId,
          name: rejection.name,
          reason: rejection.reason,
        });
      }

      for (const link of await linksOn(page, root)) {
        if (!visited.has(link) && queue.length + visited.size < MAX_PAGES) queue.push(link);
      }
    }

    ctx.log('exploration finished', {
      productId,
      pages: visited.size,
      proposed,
      refused,
      costUsd: Number(cost.toFixed(4)),
      signedIn: Boolean(credentials),
    });
  } finally {
    await browser.close();
  }
}

/**
 * An accessibility-style outline rather than raw HTML.
 *
 * Raw markup is mostly class attributes and framework noise, it is enormous,
 * and it invites a model to invent CSS selectors that happen to parse. Roles
 * and names are what a person navigating the page would use, and they survive a
 * redeploy far better than a hashed class name.
 */
async function outlineOf(page: Page): Promise<PageOutline> {
  const elements = await page
    .locator('a, button, input, select, textarea, [role]')
    .evaluateAll((nodes) =>
      nodes.slice(0, 150).map((node) => {
        const el = node as HTMLElement;
        return {
          role:
            el.getAttribute('role') ??
            el.tagName.toLowerCase(),
          name: (
            el.getAttribute('aria-label') ??
            el.getAttribute('placeholder') ??
            el.textContent ??
            ''
          )
            .trim()
            .slice(0, 80),
        };
      }),
    )
    .catch(() => []);

  return {
    url: page.url(),
    title: await page.title().catch(() => ''),
    elements: elements.filter((e) => e.name.length > 0),
    text: (await page.locator('body').innerText({ timeout: 5000 }).catch(() => '')).slice(0, 4000),
  };
}

/** In-scope links, deduped and stripped of fragments. */
async function linksOn(page: Page, root: string): Promise<string[]> {
  const hrefs = await page
    .locator('a[href]')
    .evaluateAll((nodes) => nodes.map((n) => (n as HTMLAnchorElement).href))
    .catch(() => []);

  const seen = new Set<string>();
  for (const href of hrefs) {
    if (!isInScope(href, [root])) continue;
    const clean = href.split('#')[0]!;
    seen.add(clean);
  }
  return [...seen];
}

/**
 * Sign in with the exploration account.
 *
 * Best-effort and deliberately simple: find an email field, a password field,
 * and a submit. If the product's login does not look like that, exploration
 * continues signed out rather than failing the job — a partial inventory of the
 * public surface is worth more than none, and it is honestly labelled by the
 * log line above.
 *
 * Returns whether it believes it worked. It does not assert that it did: the
 * claims it goes on to make are verified by replay regardless.
 */
async function signIn(page: Page, root: string, credentials: ExploreCredentials): Promise<boolean> {
  for (const path of ['/login', '/signin', '/sign-in', '/auth/login']) {
    try {
      await page.goto(new URL(path, root).toString(), {
        waitUntil: 'domcontentloaded',
        timeout: 15_000,
      });
    } catch {
      continue;
    }

    const email = page.locator('input[type=email], input[name=email]').first();
    const password = page.locator('input[type=password]').first();
    if (!(await email.isVisible({ timeout: 3000 }).catch(() => false))) continue;

    await email.fill(credentials.email);
    if (await password.isVisible({ timeout: 3000 }).catch(() => false)) {
      await password.fill(credentials.password);
    }
    await page.keyboard.press('Enter');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);

    // A password field still on screen is the clearest signal it did not take.
    return !(await password.isVisible({ timeout: 2000 }).catch(() => false));
  }
  return false;
}
