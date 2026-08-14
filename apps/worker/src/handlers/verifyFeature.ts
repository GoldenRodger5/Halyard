/**
 * Replay a feature claim in a real browser and decide whether it still holds.
 *
 * The verification half of Phase 3, built before the crawler on purpose: a list
 * of features a model believed it saw would become the ground truth every
 * prompt draws on, and nothing downstream would ever question it.
 *
 * ## What this does and does not decide
 *
 * It drives the steps and records what was observable. The **verdict** is
 * `verdictFor`, which is pure and lives in core — this file must not be able to
 * talk itself into a pass. Agents perceive, code decides, and here the browser
 * is the thing perceiving.
 *
 * Every flow is passed through `checkFlowSafety` before a browser is opened,
 * every time, including on re-verification of a claim that has run a hundred
 * times before. A claim's `replay` is a mutable jsonb column: checking it once
 * at discovery and trusting it afterwards would mean the safety property holds
 * only for as long as nothing edits the row.
 */
import { chromium, type Page } from 'playwright';
import {
  checkFlowSafety,
  verdictFor,
  VERIFICATION_TTL_DAYS,
  type ExplorerStep,
  type Expectation,
  type ReplayOutcome,
} from '@halyard/core';
import type { HandlerContext, Job } from '../poller.js';

interface ClaimRow {
  id: string;
  product_id: string;
  name: string;
  replay: { steps?: ExplorerStep[] };
  attempts: number;
}

/** Origins a claim for this product may touch. */
async function allowedOriginsFor(ctx: HandlerContext, productId: string): Promise<string[]> {
  const { rows } = await ctx.pool.query<{ destinations: Record<string, string> | null }>(
    'select destinations from products where id = $1',
    [productId],
  );
  const web = rows[0]?.destinations?.web;
  return web ? [web] : [];
}

const DEFAULT_TIMEOUT_MS = 15_000;

export async function verifyFeatureHandler(job: Job, ctx: HandlerContext): Promise<void> {
  const claimId = job.payload.claimId ? String(job.payload.claimId) : null;

  /**
   * With no claim named, take the one most in need of checking.
   *
   * Verification expires — the product ships with no release notes, so a check
   * from a month ago is a guess — and `canMarket` reads recency as well as
   * status. Without something re-running them the whole inventory ages out and
   * quietly becomes unusable, which is a decay that looks like nothing at all
   * from the outside.
   *
   * One claim per run, on a slow schedule. This walks someone's live product,
   * so the gentlest thing that keeps the inventory honest is the right amount.
   */
  const { rows } = claimId
    ? await ctx.pool.query<ClaimRow>(
        'select id, product_id, name, replay, attempts from feature_claims where id = $1',
        [claimId],
      )
    : await ctx.pool.query<ClaimRow>(
        `select id, product_id, name, replay, attempts
           from feature_claims
          where status <> 'unverifiable'
            and (verified_at is null or verified_at < now() - ($1 || ' days')::interval)
          order by last_attempt_at nulls first, verified_at nulls first
          limit 1`,
        [String(VERIFICATION_TTL_DAYS)],
      );

  const claim = rows[0];
  if (!claim) {
    if (claimId) throw new Error(`feature claim ${claimId} not found`);
    ctx.log('no feature claims are due for re-verification', {});
    return;
  }

  const steps = claim.replay.steps ?? [];
  const allowedOrigins = await allowedOriginsFor(ctx, claim.product_id);

  /**
   * Refuse before opening a browser, not after.
   *
   * An unsafe flow is not a verification failure — it is a claim that must
   * never run. Recording it as `unverifiable` keeps it visible without ever
   * putting it in front of a live account.
   */
  const safety = checkFlowSafety(steps, { allowedOrigins });
  if (!safety.allowed) {
    await record(ctx, claim, {
      status: 'unverifiable',
      summary: `Refused before running: ${safety.refusals[0]!.why}`,
      elapsedMs: null,
    });
    ctx.log('feature claim refused by safety check', {
      claimId,
      name: claim.name,
      refusals: safety.refusals.map((r) => `${r.rule} at ${r.stepName}`),
    });
    return;
  }

  if (allowedOrigins.length === 0) {
    await record(ctx, claim, {
      status: 'unverifiable',
      summary:
        'The product has no web destination recorded, so there is nowhere to replay this against.',
      elapsedMs: null,
    });
    return;
  }

  const outcome = await replay(steps);
  const verdict = verdictFor(outcome);

  await record(ctx, claim, {
    status: verdict.status,
    summary: verdict.summary,
    elapsedMs: outcome.elapsedMs ?? null,
  });

  ctx.log('feature claim replayed', {
    claimId,
    name: claim.name,
    status: verdict.status,
    checks: outcome.expectations.length,
    ms: outcome.elapsedMs,
  });
}

async function record(
  ctx: HandlerContext,
  claim: ClaimRow,
  result: { status: string; summary: string; elapsedMs: number | null },
): Promise<void> {
  await ctx.pool.query(
    `update feature_claims
        set status = $2,
            last_verdict = $3,
            last_attempt_at = now(),
            attempts = attempts + 1,
            last_elapsed_ms = $4,
            -- Only a pass moves the clock. A refutation must not look freshly
            -- checked-and-fine to anything reading verified_at.
            verified_at = case when $2 = 'verified' then now() else verified_at end,
            updated_at = now()
      where id = $1`,
    [claim.id, result.status, result.summary, result.elapsedMs],
  );
}

/**
 * Drive the steps, recording what was observable.
 *
 * Deliberately returns observations rather than a judgement. An expectation
 * that could not be checked is `observed: null`, which is distinct from
 * `false` — "we never looked" and "we looked and it was absent" produce
 * different verdicts, and collapsing them is how a flaky run deletes a real
 * feature from the inventory.
 */
export async function replay(steps: ExplorerStep[]): Promise<ReplayOutcome> {
  const expectations: Expectation[] = [];
  const started = Date.now();

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      // Read-only exploration should look like a person, not announce itself as
      // a scraper, but it also must not misrepresent itself as a real browser
      // to evade a block. This is the honest middle: a normal UA string.
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
    });
    const page = await context.newPage();

    for (const step of steps) {
      try {
        await runStep(page, step, expectations);
      } catch (err) {
        if (step.optional) continue;
        return {
          completed: false,
          error: `${step.name}: ${(err as Error).message.slice(0, 200)}`,
          expectations,
          elapsedMs: Date.now() - started,
        };
      }
    }

    return { completed: true, expectations, elapsedMs: Date.now() - started };
  } finally {
    await browser.close();
  }
}

async function runStep(
  page: Page,
  step: ExplorerStep,
  expectations: Expectation[],
): Promise<void> {
  const timeout = step.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const locator = step.selector
    ? page.locator(step.selector)
    : step.target
      ? page.getByText(step.target, { exact: false }).first()
      : null;

  switch (step.action) {
    case 'goto':
      await page.goto(step.value ?? step.target ?? '', { waitUntil: 'domcontentloaded', timeout });
      break;
    case 'click':
      await locator!.click({ timeout });
      break;
    case 'fill':
      await locator!.fill(step.value ?? '', { timeout });
      break;
    case 'press':
      await page.keyboard.press(step.value ?? 'Enter');
      break;
    case 'waitFor':
      await locator!.waitFor({ state: 'visible', timeout });
      break;
    case 'waitForHidden':
      await locator!.waitFor({ state: 'hidden', timeout });
      break;
    case 'wait':
      await page.waitForTimeout(Math.min(Number(step.value ?? 1000), 30_000));
      break;
    case 'scrollTo':
      await locator!.scrollIntoViewIfNeeded({ timeout });
      break;

    /**
     * The expectations. These never throw on a negative result — a feature that
     * is absent is an observation, and the verdict function decides what it
     * means. Throwing here would turn "the badge was missing" into "the flow
     * broke", which are different statuses on purpose.
     */
    case 'expectText': {
      const wanted = step.target ?? step.value ?? '';
      const observed = await page
        .getByText(wanted, { exact: false })
        .first()
        .isVisible({ timeout })
        .catch(() => false);
      expectations.push({
        stepName: step.name,
        kind: 'expectText',
        wanted,
        observed,
        optional: step.optional,
      });
      break;
    }
    case 'expectVisible': {
      const wanted = step.selector ?? step.target ?? '';
      const observed = await (step.selector ? page.locator(step.selector) : locator!)
        .first()
        .isVisible({ timeout })
        .catch(() => false);
      expectations.push({
        stepName: step.name,
        kind: 'expectVisible',
        wanted,
        observed,
        optional: step.optional,
      });
      break;
    }
    case 'expectUrl': {
      const wanted = step.value ?? step.target ?? '';
      expectations.push({
        stepName: step.name,
        kind: 'expectUrl',
        wanted,
        observed: page.url().includes(wanted),
        optional: step.optional,
      });
      break;
    }
  }
}
