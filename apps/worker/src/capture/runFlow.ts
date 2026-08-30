/**
 * The flow runner. Milestone 41 Parts B and C.
 *
 * One code path serves both verification and capture, deliberately. If
 * `verify-flows` walked a different path from the recorder, a green verification
 * would prove nothing about whether a recording will work — which is the exact
 * failure the gate exists to prevent.
 *
 * Verification mode does everything except record video and, where it can, stops
 * short of spending a real adaptation credit.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright';
import {
  FLOWS,
  elisionCaption,
  shouldElide,
  type CaptureFlow,
  type FlowStep,
} from '@halyard/core';

export interface StepResult {
  step: string;
  action: FlowStep['action'];
  selector?: string;
  /** Which candidate answered: 0 is the preferred one. §159. */
  fallbackDepth?: number;
  /**
   * Offsets into the recording, in milliseconds from the start of the context.
   *
   * §163. `ms` says how long a step took but not *where* it is, so nothing
   * downstream could cut the footage to the part worth watching. A capture-
   * backed creative beat needs a span, and a span needs a start.
   */
  startMs?: number;
  endMs?: number;
  /** The flow marked this step as a wait the edit should cut. §159/§163. */
  elide?: boolean;
  /** §303. The line the flow wrote for this step, if it wrote one. */
  narration?: string;
  /**
   * The flow marked this step as setup: run it, do not show it. §166.
   *
   * Carried on the result rather than looked up from the flow later, so the
   * record of what was captured explains its own cut.
   */
  setup?: boolean;
  ok: boolean;
  optional: boolean;
  ms: number;
  /**
   * §303. Where on the screen the tap landed, as fractions of the viewport.
   *
   * A callout ring is a claim that something happened *there*, and until now
   * nothing recorded where "there" was — `WalkthroughCallout.at` existed and
   * every callout was written with `at: null`, which pins it beside the device
   * instead of on the control. Measured from the element Playwright actually
   * clicked, so the ring cannot point somewhere the tap did not happen.
   *
   * Absent for steps that are not taps, and for a tap whose element had no box.
   */
  at?: { x: number; y: number };
  /** Present on failure: what the page actually looked like. */
  failureScreenshot?: string;
  error?: string;
}

export interface FlowRunResult {
  flow: string;
  ok: boolean;
  mode: 'verify' | 'capture';
  startedAt: Date;
  totalSeconds: number;
  steps: StepResult[];
  /** Full-page PNGs written by `still` steps, keyed by their value. */
  stills: Record<string, string>;
  videoPath?: string;
  /**
   * The wall-clock spans the edit cuts, so Remotion knows which stretch of the
   * video to remove rather than guessing from a fixed offset.
   *
   * `elide` is false when the wait was too short to be worth cutting — a cached
   * adaptation returns in about two seconds — and the caption states the
   * measured duration rather than a designed one.
   */
  elisions: Array<{
    step: string;
    startMs: number;
    endMs: number;
    measuredMs: number;
    elide: boolean;
    caption: string;
  }>;
  /** The plain-language reason a failed run failed. */
  summary: string;
}

export interface RunFlowOptions {
  baseUrl: string;
  outDir: string;
  mode: 'verify' | 'capture';
  headless?: boolean;
  /** Reuse one browser across several flows. */
  browser?: Browser;
  /**
   * Continue in a context another flow left behind, for flows that act on a
   * result card rather than creating one. The caller owns closing it.
   */
  continueIn?: { context: BrowserContext; page: Page };
  /**
   * §303. When the recording started, as a `Date.now()`.
   *
   * Every step offset is documented as "milliseconds from the start of the
   * context", and for a continued flow it was milliseconds from the start of
   * *that flow* — while `runFlowChain` hands every result the same whole-chain
   * video. So `cook_mode_timer`'s cut has been taking a stretch of footage
   * offset by however long `adapt_and_reveal` took before it, and the only
   * reason nobody caught it is that a wrong stretch of a real recording still
   * looks like a real recording.
   *
   * Absent for a flow that owns its own context, where its start *is* the
   * recording's start.
   */
  anchorMs?: number;
  /**
   * §305. The credentials a `fillSecret` step names, by key.
   *
   * Never a value in a flow definition, a log line or a job payload — that is
   * the whole reason `fillSecret` exists (§299) and why migration 0060 says so
   * on the column. The step names *which* secret it wants; only this reaches
   * the value, and it is read from `products.capture_credentials` at run time.
   *
   * Absent for a flow with no secrets, and a `fillSecret` with no matching key
   * fails the step by name rather than typing an empty string into a login
   * form and reporting success.
   */
  secrets?: Record<string, string>;
  onStep?: (result: StepResult) => void;
}

/**
 * Turn a discovered selector string into a locator.
 *
 * The three forms `discover-selectors.ts` emits — `role=…[name="…"]`, `text=…`,
 * and a plain CSS selector — are resolved here so the flow definitions stay
 * declarative and a selector can be pasted straight out of the discovery JSON.
 */
export function locatorFor(page: Page, selector: string): Locator {
  const roleMatch = /^role=([a-z]+)\[name=(?:"(.*)"|\/(.*)\/([a-z]*))\]$/s.exec(selector);
  if (roleMatch) {
    const [, role, literal, pattern, flags] = roleMatch;
    const name = literal !== undefined ? literal : new RegExp(pattern!, flags || undefined);
    return page.getByRole(role as 'button', { name });
  }
  if (selector.startsWith('text=')) {
    return page.getByText(selector.slice(5), { exact: false });
  }
  return page.locator(selector);
}

/**
 * The first candidate selector that actually finds something.
 *
 * §159. A step used to carry one selector, so a markup change turned it into
 * `did not resolve` and the job died three attempts later. Candidates are tried
 * in order and the winner is reported, which turns a brittle break into a
 * degradation somebody can see coming: a step falling through to its last
 * candidate still works *and* says the preferred hook has gone.
 *
 * Each candidate gets a short probe rather than the step's full timeout —
 * trying four selectors at thirty seconds each is how a capture job hits the
 * five-minute ceiling and dies for a reason that has nothing to do with the
 * page.
 */
export const CANDIDATE_PROBE_MS = 2_500;

export interface SelectorResolution {
  locator: Locator;
  /** Which candidate answered. */
  selector: string;
  /** 0 when the preferred selector worked; higher means it has drifted. */
  fallbackDepth: number;
}

export async function resolveSelector(
  page: Page,
  step: Pick<FlowStep, 'selector' | 'fallbackSelectors' | 'timeoutMs'>,
  probeMs = CANDIDATE_PROBE_MS,
): Promise<SelectorResolution | null> {
  const candidates = [step.selector, ...(step.fallbackSelectors ?? [])].filter(
    (c): c is string => typeof c === 'string' && c.length > 0,
  );
  if (candidates.length === 0) return null;

  for (let depth = 0; depth < candidates.length; depth++) {
    const selector = candidates[depth]!;
    const locator = locatorFor(page, selector);
    // The last candidate is given the step's real timeout: if everything else
    // has drifted, this one is the step, and it deserves the full wait before
    // the step is called broken.
    const isLast = depth === candidates.length - 1;
    const timeout = isLast ? (step.timeoutMs ?? 30_000) : probeMs;
    try {
      await locator.first().waitFor({ state: 'attached', timeout });
      return { locator: locator.first(), selector, fallbackDepth: depth };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * What the selectors did across a run.
 *
 * Reported rather than thrown: a flow whose every step fell through to its last
 * candidate is still producing footage, and the operator should learn that
 * before the day it stops.
 */
export function selectorHealth(
  steps: Array<{ step: string; selector?: string; fallbackDepth?: number; ok: boolean }>,
): { drifted: Array<{ step: string; selector: string; depth: number }>; broken: string[] } {
  const drifted = steps
    .filter((s) => (s.fallbackDepth ?? 0) > 0 && s.selector)
    .map((s) => ({ step: s.step, selector: s.selector!, depth: s.fallbackDepth! }));
  const broken = steps.filter((s) => !s.ok).map((s) => s.step);
  return { drifted, broken };
}

export async function runFlow(
  flow: CaptureFlow,
  options: RunFlowOptions,
): Promise<FlowRunResult> {
  const outDir = path.join(options.outDir, flow.id);
  mkdirSync(outDir, { recursive: true });

  const ownBrowser = !options.browser && !options.continueIn;
  const browser =
    options.continueIn
      ? null
      : (options.browser ?? (await chromium.launch({ headless: options.headless ?? true })));

  const context = options.continueIn?.context ?? (await browser!.newContext({
    viewport: flow.viewport,
    deviceScaleFactor: 2,
    // A capture is footage; a verification is a check. Only one needs video.
    recordVideo:
      options.mode === 'capture'
        ? { dir: path.join(outDir, 'video'), size: flow.viewport }
        : undefined,
    // Motion is the point of the recording, so the reduced-motion default that
    // Playwright would otherwise leave alone is set explicitly to "no
    // preference" — a captured animation that never plays is a dead video.
    reducedMotion: 'no-preference',
  }));

  const page = options.continueIn?.page ?? (await context.newPage());
  const started = Date.now();
  /*
   * §303. Offsets are measured from the recording, not from this flow. They are
   * used to cut a video that may have begun before this flow did.
   */
  const anchor = options.anchorMs ?? started;
  const steps: StepResult[] = [];
  const stills: Record<string, string> = {};
  const elisions: FlowRunResult['elisions'] = [];

  let failed: StepResult | null = null;

  for (const step of flow.steps) {
    const stepStart = Date.now();
    const result: StepResult = {
      step: step.name,
      action: step.action,
      selector: step.selector,
      ok: true,
      optional: step.optional === true,
      ms: 0,
      startMs: stepStart - anchor,
      ...(step.elide ? { elide: true } : {}),
      ...(step.setup ? { setup: true } : {}),
      /*
       * §303. The line the flow wrote for this step, carried onto the result.
       *
       * The flow definition is not available where callouts are built — the
       * render reads `capture_runs.steps`, which is a record of what happened
       * rather than of what was planned. Carrying it means a callout says what
       * the author wrote, and a step nobody wrote a line for falls back to its
       * own name rather than to nothing.
       */
      ...(step.narration ? { narration: step.narration } : {}),
    };

    try {
      const outcome = await executeStep(
        page,
        step,
        options.baseUrl,
        outDir,
        stills,
        options.secrets,
        options.mode,
      );
      if (outcome.fallbackDepth !== undefined) result.fallbackDepth = outcome.fallbackDepth;
      /* §303. Where the tap landed, for a callout that points at it. */
      if (outcome.at) result.at = outcome.at;
    } catch (err) {
      result.ok = false;
      result.error = (err as Error).message.split('\n')[0];

      // Never fail blind. What the page actually looked like is the only thing
      // that turns "selector not found" into a five-minute fix.
      const shot = path.join(outDir, `FAILED-${slug(step.name)}.png`);
      await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);
      result.failureScreenshot = shot;
    }

    result.ms = Date.now() - stepStart;
    result.endMs = Date.now() - anchor;
    if (step.elide) {
      const measuredMs = Date.now() - stepStart;
      elisions.push({
        step: step.name,
        startMs: stepStart - anchor,
        endMs: Date.now() - anchor,
        measuredMs,
        elide: shouldElide(measuredMs),
        caption: elisionCaption(measuredMs),
      });
    }

    steps.push(result);
    options.onStep?.(result);

    if (!result.ok && !result.optional) {
      failed = result;
      break;
    }
  }

  const totalSeconds = (Date.now() - started) / 1000;

  // A continued flow leaves the context open for the next one; the chain owns it.
  let videoPath: string | undefined;
  if (!options.continueIn) {
    const video = options.mode === 'capture' ? page.video() : null;
    await context.close(); // The video file is only finalised on close.
    videoPath = video ? await video.path() : undefined;
    if (ownBrowser) await browser!.close();
  }

  const [minSeconds, maxSeconds] = flow.expectedSeconds;
  const timingNote =
    !failed && (totalSeconds < minSeconds * 0.5 || totalSeconds > maxSeconds * 2)
      ? ` It took ${totalSeconds.toFixed(0)}s against an expected ${minSeconds}–${maxSeconds}s, which usually means the page changed rather than that it was slow.`
      : '';

  return {
    flow: flow.id,
    ok: !failed,
    mode: options.mode,
    startedAt: new Date(started),
    totalSeconds,
    steps,
    stills,
    videoPath,
    elisions,
    summary: failed
      ? `"${failed.step}" failed. ${failed.selector ? `Selector ${failed.selector} did not resolve. ` : ''}${failed.error ?? ''} A screenshot of what the page actually looked like is at ${failed.failureScreenshot}.`
      : `All ${steps.length} steps passed in ${totalSeconds.toFixed(1)}s.${timingNote}`,
  };
}

async function executeStep(
  page: Page,
  step: FlowStep,
  baseUrl: string,
  outDir: string,
  stills: Record<string, string>,
  secrets: Record<string, string> | undefined,
  mode: 'verify' | 'capture',
): Promise<{ fallbackDepth?: number; at?: { x: number; y: number } }> {
  const timeout = step.timeoutMs ?? 15_000;
  /* §309. The recorded pass may need a different input; see `captureValue`. */
  const value = (mode === 'capture' ? step.captureValue : undefined) ?? step.value;

  /**
   * §159. Every selector-driven action resolves through the candidate chain,
   * so a moved attribute degrades instead of killing the job.
   */
  const resolve = async (): Promise<SelectorResolution> => {
    const found = await resolveSelector(page, step);
    if (!found) {
      const tried = [step.selector, ...(step.fallbackSelectors ?? [])].filter(Boolean);
      throw new Error(
        `none of ${tried.length} selector(s) resolved: ${tried.join(' | ')}`,
      );
    }
    return found;
  };

  switch (step.action) {
    case 'goto': {
      const response = await page.goto(new URL(step.value!, baseUrl).toString(), {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      });
      if (!response || response.status() >= 400) {
        throw new Error(`HTTP ${response?.status() ?? 'no response'}`);
      }
      await page.waitForLoadState('networkidle').catch(() => undefined);
      return {};
    }

    case 'click': {
      const { locator, fallbackDepth } = await resolve();
      await locator.waitFor({ state: 'visible', timeout });
      await locator.scrollIntoViewIfNeeded({ timeout });

      /*
       * §303. Measured after scrolling and before clicking. Before, because a
       * click can navigate and leave nothing to measure; after scrolling,
       * because the box moves and the pre-scroll position would put the ring
       * somewhere the tap did not happen.
       *
       * The recording is made at the viewport size, so a fraction of the
       * viewport is a fraction of the frame and no mapping is needed.
       */
      const box = await locator.boundingBox().catch(() => null);
      const viewport = page.viewportSize();
      const at =
        box && viewport && viewport.width > 0 && viewport.height > 0
          ? {
              x: Number(((box.x + box.width / 2) / viewport.width).toFixed(4)),
              y: Number(((box.y + box.height / 2) / viewport.height).toFixed(4)),
            }
          : undefined;

      await locator.click({ timeout });
      return { fallbackDepth, ...(at ? { at } : {}) };
    }

    /**
     * §305. A secret, named rather than written.
     *
     * `fillSecret` has been in the action union since §299, is used by both of
     * the sign-in's credential steps, and had **no case here** — so the switch
     * fell through to `return {}` and both fields stayed empty. The form was
     * submitted blank, the password field never went away, and the capture
     * failed on the wait 30 seconds later, which is a very long way from the
     * actual mistake. Both steps recorded `ms: 0`, which is what gave it away.
     *
     * The value never appears in an error. A step that names a secret nobody
     * supplied says which key was missing, because the key is not the secret.
     */
    case 'fillSecret': {
      const key = step.value ?? '';
      const secret = secrets?.[key];
      if (!secret) {
        throw new Error(
          `No credential named '${key}' is configured for this product, ` +
            'so the form would be submitted empty. Set products.capture_credentials.',
        );
      }
      const { locator, fallbackDepth } = await resolve();
      await locator.waitFor({ state: 'visible', timeout });
      await locator.fill(secret, { timeout });
      return { fallbackDepth };
    }

    case 'fill': {
      const { locator, fallbackDepth } = await resolve();
      await locator.waitFor({ state: 'visible', timeout });
      await locator.fill(value ?? '', { timeout });
      return { fallbackDepth };
    }

    case 'press':
      await page.keyboard.press(step.value ?? 'Enter');
      return {};

    case 'waitFor': {
      const { locator, fallbackDepth } = await resolve();
      await locator.waitFor({ state: 'visible', timeout });
      return { fallbackDepth };
    }

    case 'waitForHidden':
      // Hidden means gone; the chain does not apply, and a missing element
      // already satisfies the intent.
      await locatorFor(page, step.selector!).first().waitFor({ state: 'hidden', timeout });
      return {};

    case 'wait':
      await page.waitForTimeout(Number(step.value ?? 1000));
      return {};

    case 'scrollTo': {
      const { locator, fallbackDepth } = await resolve();
      await locator.scrollIntoViewIfNeeded({ timeout });
      return { fallbackDepth };
    }

    case 'still': {
      const file = path.join(outDir, `${slug(step.value ?? step.name)}.png`);
      await page.screenshot({ path: file, fullPage: false });
      stills[step.value ?? step.name] = file;
      return {};
    }
  }
  return {};
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Run a flow and everything that depends on it, in one browser context.
 *
 * A dependent flow acts on the result card the first flow produced, so chaining
 * turns one adaptation credit into three captures rather than three credits into
 * three captures. The video covers the whole chain and each flow records the
 * wall-clock window it occupied, so a per-flow clip can be cut out of it.
 */
export async function runFlowChain(
  root: CaptureFlow,
  options: Omit<RunFlowOptions, 'continueIn'>,
): Promise<FlowRunResult[]> {
  const dependents = Object.values(FLOWS).filter((f) => f.dependsOn === root.id);
  /*
   * §303. A shared context is needed for a requirement as well as for a
   * dependent, so the shortcut only applies when there is neither.
   */
  if (dependents.length === 0 && !root.requires) return [await runFlow(root, options)];

  const ownBrowser = !options.browser;
  const browser =
    options.browser ?? (await chromium.launch({ headless: options.headless ?? true }));

  const outDir = path.join(options.outDir, root.id);
  mkdirSync(outDir, { recursive: true });

  const context = await browser.newContext({
    viewport: root.viewport,
    deviceScaleFactor: 2,
    recordVideo:
      options.mode === 'capture'
        ? { dir: path.join(outDir, 'video'), size: root.viewport }
        : undefined,
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  /* §303. The recording begins here, so every step in the chain measures from here. */
  const anchorMs = Date.now();

  const results: FlowRunResult[] = [];

  /*
   * §303. Whatever this flow requires runs first, in this same context.
   *
   * `requires` has been declared on `adapt_and_reveal` since §299 and nothing
   * read it, so every capture ran signed out and recorded the demo card rather
   * than a real adaptation — the operator spotted it in the walkthrough before
   * any gate did. It is not `dependsOn`: a dependent acts on the result the
   * root produced and is *shown*; a requirement is plumbing that has to have
   * happened and is never shown.
   *
   * Same context, because a session lives in cookies and a fresh context would
   * throw away the sign-in the moment it succeeded. Its result is recorded like
   * any other — a sign-in that failed is the reason the capture is wrong, and
   * hiding it would leave that unexplained — but its steps are all `setup`, so
   * §166 keeps them off screen.
   */
  if (root.requires) {
    const required = FLOWS[root.requires];
    const prerequisite = await runFlow(required, {
      ...options,
      browser,
      anchorMs,
      continueIn: { context, page },
    });
    results.push(prerequisite);
    if (!prerequisite.ok) {
      /*
       * Recording anyway would produce footage of the signed-out product and
       * file it as evidence of the signed-in one. Gotcha 9: a capture running
       * is not a capture of the thing it claims.
       */
      results.push({
        flow: root.id,
        ok: false,
        mode: options.mode,
        startedAt: new Date(),
        totalSeconds: 0,
        steps: [],
        stills: {},
        elisions: [],
        summary: `Not run: ${required.id} failed, and this flow records a signed-in product.`,
      });
      if (options.mode === 'capture') await context.close();
      if (ownBrowser) await browser.close();
      return results;
    }
  }

  results.push(await runFlow(root, { ...options, browser, anchorMs, continueIn: { context, page } }));

  for (const dependent of dependents) {
    if (!results[results.length - 1]!.ok) {
      // Running a dependent against a page that never reached a result would
      // report a missing selector that is not actually missing.
      results.push({
        flow: dependent.id,
        ok: false,
        mode: options.mode,
        startedAt: new Date(),
        totalSeconds: 0,
        steps: [],
        stills: {},
        elisions: [],
        summary: `Not run: ${root.id} did not reach a result, and this flow acts on one.`,
      });
      continue;
    }
    // A phone-shaped flow needs the phone viewport, and the context cannot be
    // resized, so the page is.
    if (
      dependent.viewport.width !== root.viewport.width ||
      dependent.viewport.height !== root.viewport.height
    ) {
      await page.setViewportSize(dependent.viewport);
    }
    results.push(
      await runFlow(dependent, { ...options, browser, anchorMs, continueIn: { context, page } }),
    );
  }

  const video = options.mode === 'capture' ? page.video() : null;
  await context.close();
  const videoPath = video ? await video.path() : undefined;
  if (videoPath) for (const r of results) r.videoPath = videoPath;
  if (ownBrowser) await browser.close();

  return results;
}
