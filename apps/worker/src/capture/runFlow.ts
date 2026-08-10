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
import { FLOWS, type CaptureFlow, type FlowStep } from '@halyard/core';

export interface StepResult {
  step: string;
  action: FlowStep['action'];
  selector?: string;
  ok: boolean;
  optional: boolean;
  ms: number;
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
   * The wall-clock spans of any ramped step, so Remotion knows which stretch of
   * the video to compress rather than guessing from a fixed offset.
   */
  ramps: Array<{ step: string; startMs: number; endMs: number }>;
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
  const steps: StepResult[] = [];
  const stills: Record<string, string> = {};
  const ramps: FlowRunResult['ramps'] = [];

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
    };

    try {
      await executeStep(page, step, options.baseUrl, outDir, stills);
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
    if (step.ramp) {
      ramps.push({
        step: step.name,
        startMs: stepStart - started,
        endMs: Date.now() - started,
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
    ramps,
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
): Promise<void> {
  const timeout = step.timeoutMs ?? 15_000;

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
      return;
    }

    case 'click': {
      const locator = locatorFor(page, step.selector!).first();
      await locator.waitFor({ state: 'visible', timeout });
      await locator.scrollIntoViewIfNeeded({ timeout });
      await locator.click({ timeout });
      return;
    }

    case 'fill': {
      const locator = locatorFor(page, step.selector!).first();
      await locator.waitFor({ state: 'visible', timeout });
      await locator.fill(step.value ?? '', { timeout });
      return;
    }

    case 'press':
      await page.keyboard.press(step.value ?? 'Enter');
      return;

    case 'waitFor':
      await locatorFor(page, step.selector!)
        .first()
        .waitFor({ state: 'visible', timeout });
      return;

    case 'waitForHidden':
      await locatorFor(page, step.selector!)
        .first()
        .waitFor({ state: 'hidden', timeout });
      return;

    case 'wait':
      await page.waitForTimeout(Number(step.value ?? 1000));
      return;

    case 'scrollTo': {
      const locator = locatorFor(page, step.selector!).first();
      await locator.scrollIntoViewIfNeeded({ timeout });
      return;
    }

    case 'still': {
      const file = path.join(outDir, `${slug(step.value ?? step.name)}.png`);
      await page.screenshot({ path: file, fullPage: false });
      stills[step.value ?? step.name] = file;
      return;
    }
  }
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
  if (dependents.length === 0) return [await runFlow(root, options)];

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

  const results: FlowRunResult[] = [];
  results.push(await runFlow(root, { ...options, browser, continueIn: { context, page } }));

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
        ramps: [],
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
    results.push(await runFlow(dependent, { ...options, browser, continueIn: { context, page } }));
  }

  const video = options.mode === 'capture' ? page.video() : null;
  await context.close();
  const videoPath = video ? await video.path() : undefined;
  if (videoPath) for (const r of results) r.videoPath = videoPath;
  if (ownBrowser) await browser.close();

  return results;
}
