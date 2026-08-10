/**
 * Capture flows. Milestone 41 Parts B and C.
 *
 * Every selector here came out of `scripts/discover-selectors.ts` run against
 * the live recipefix.app, not out of a guess. That is the whole reason milestone
 * 26 was deferred: a flow written against imagined markup works on nothing, and
 * fails in a way that looks like a Playwright problem rather than a wrong
 * selector.
 *
 * RecipeFix ships no `data-testid` anywhere, so these are aria-label,
 * role-plus-name and placeholder selectors. It does have one genuinely good
 * hook — `aria-label="Choose your swap"` on the substitution control — and the
 * flows lean on it. The rest are as stable as role and copy, which is fragile in
 * one specific way: a wording change breaks them. `verify-flows` exists for
 * exactly that, and the fix on the RecipeFix side is four `data-testid`
 * attributes on the elements these flows touch.
 */

export type FlowId = 'adapt_and_reveal' | 'swap_toggle' | 'cook_mode_timer';

export interface FlowStep {
  /** Named so a failure reads "waited for the SWAPPED badge", not "step 7". */
  name: string;
  action:
    | 'goto'
    | 'click'
    | 'fill'
    | 'press'
    | 'waitFor'
    | 'waitForHidden'
    | 'wait'
    | 'still'
    | 'scrollTo';
  /** Discovered selector. Omitted for goto/wait/still. */
  selector?: string;
  value?: string;
  timeoutMs?: number;
  /**
   * The step may legitimately not be there — a cookie banner, a promo bar that
   * only shows on first visit. Verification does not fail on these.
   */
  optional?: boolean;
  /**
   * The long wait, which the edit cuts rather than shows.
   *
   * This was originally a speed ramp with a progress overlay, sized against a
   * 60–75s adaptation. Two things killed that design. The timing was wrong —
   * a cold adaptation measures ~26s and a cached one 2.3s — so a fixed ramp is
   * simultaneously too aggressive on the fast path and too weak on the slow one.
   * And the overlay was artifice: RecipeFix already shows its own "Adapting…"
   * state, so drawing a synthetic progress bar over it invents product UI that
   * does not exist. That is the same rule the slop filter applies to copy,
   * applied to footage.
   *
   * What replaces it is a plain cut with the *measured* elapsed time as a
   * caption. The compression is an ordinary edit and the number is a fact.
   */
  elide?: boolean;
  /** What the viewer should understand is happening here. */
  narration?: string;
}

export interface CaptureFlow {
  id: FlowId;
  title: string;
  /** Why this flow is worth the capture, in one sentence. */
  why: string;
  path: string;
  viewport: { width: number; height: number };
  /** Wall-clock range, measured. Outside it, something has changed. */
  expectedSeconds: [number, number];
  /** True when running it performs a real adaptation and spends a credit. */
  consumesCredit: boolean;
  /**
   * The flow that has to have run first, in the same browser context.
   *
   * Two of these three act on a result card, and a result card only exists
   * after a real adaptation. Chaining them means one credit produces all three
   * captures instead of three credits producing three.
   */
  dependsOn?: FlowId;
  steps: FlowStep[];
}

/** A recipe URL that is public, stable, and unambiguously wheat-and-dairy. */
export const SAMPLE_RECIPE_URL =
  'https://sallysbakingaddiction.com/homemade-artisan-bread/';

export const FLOWS: Record<FlowId, CaptureFlow> = {
  adapt_and_reveal: {
    id: 'adapt_and_reveal',
    title: 'Paste a recipe, get it adapted',
    why:
      'The whole product in one shot: an arbitrary recipe URL goes in, a diet constraint is picked, and what comes back has substitutions with reasons attached.',
    path: '/adapt',
    viewport: { width: 1280, height: 900 },
    // Measured, not assumed. The spec said 60–75s. A cold adaptation of this
    // URL took 26s; a repeat of the same URL and diet came back in under 10,
    // because RecipeFix caches the result. Both are normal, so the range is wide
    // and the ramp is driven by the measured wait rather than a fixed guess.
    expectedSeconds: [8, 60],
    consumesCredit: true,
    steps: [
      { name: 'open the converter', action: 'goto', value: '/adapt' },
      {
        name: 'dismiss the App Store banner',
        action: 'click',
        selector: '[aria-label="Dismiss"]',
        optional: true,
      },
      {
        name: 'switch to the Link tab',
        action: 'click',
        selector: 'role=button[name="Link"]',
        narration: 'Any recipe URL on the internet.',
      },
      {
        name: 'paste the recipe URL',
        action: 'fill',
        selector: '[placeholder="https://www.anyrecipesite.com/recipe..."]',
        value: SAMPLE_RECIPE_URL,
      },
      {
        name: 'choose gluten-free',
        action: 'click',
        selector: 'role=button[name="Gluten-Free"]',
        narration: 'One constraint. This is the only input.',
      },
      {
        name: 'submit',
        action: 'click',
        selector: 'role=button[name="Adapt This Recipe →"]',
      },
      {
        // An idle /adapt shows an animated demo card that already contains a
        // swapped row, so waiting for one straight after submitting matches the
        // demo and reports a ten-second adaptation. Waiting for the demo to go
        // away first is what makes the next wait mean anything.
        name: 'wait for the demo card to clear',
        action: 'waitForHidden',
        selector: 'button:has-text("SWAPPED")',
        timeoutMs: 30_000,
      },
      {
        name: 'wait for the adaptation',
        action: 'waitFor',
        selector: 'button:has-text("SWAPPED")',
        // 90s, matching the connector's own adaptation timeout: past that the
        // page is not slow, it is broken, and waiting longer only delays saying
        // so.
        timeoutMs: 90_000,
        elide: true,
        narration: 'Real work, cut down.',
      },
      { name: 'let the result settle', action: 'wait', value: '1200' },
      { name: 'still of the finished card', action: 'still', value: 'result-card' },
      {
        name: 'expand a swapped ingredient',
        action: 'click',
        selector: 'button:has-text("SWAPPED")',
        narration: 'Every substitution says why it was made.',
      },
      { name: 'hold on the reason', action: 'wait', value: '2500' },
      { name: 'still of the reveal', action: 'still', value: 'swap-reason' },
    ],
  },

  swap_toggle: {
    id: 'swap_toggle',
    title: 'One toggle rewrites the recipe',
    why:
      'The strongest ten seconds the product has: changing one ingredient updates the ingredient line, the step text, the title and the protein figure together, which is the thing a static substitution chart cannot do.',
    path: '/adapt',
    viewport: { width: 1280, height: 900 },
    expectedSeconds: [8, 20],
    // Acts on the card adapt_and_reveal left on screen, so no second credit.
    consumesCredit: false,
    dependsOn: 'adapt_and_reveal',
    steps: [
      {
        name: 'find the swap control',
        // The one genuinely stable hook on the page.
        action: 'waitFor',
        selector: '[aria-label="Choose your swap"]',
        timeoutMs: 30_000,
      },
      { name: 'scroll the ingredient into view', action: 'scrollTo', selector: '[aria-label="Choose your swap"]' },
      { name: 'still before the swap', action: 'still', value: 'before' },
      {
        // The alternative is whichever option is not currently pressed, so this
        // works on any recipe rather than only on the one it was written against.
        name: 'pick the other option',
        action: 'click',
        selector: '[aria-label="Choose your swap"] button[aria-pressed="false"]',
        narration: 'One tap.',
      },
      {
        name: 'wait for the rewrite',
        action: 'wait',
        value: '2500',
        narration: 'Ingredient, method, title and macros, all at once.',
      },
      { name: 'still after the swap', action: 'still', value: 'after' },
    ],
  },

  cook_mode_timer: {
    id: 'cook_mode_timer',
    title: 'Cook mode, with the screen awake',
    why:
      'The moment the app stops being a website: a step-by-step view that says "keep this screen open while you cook", which is the whole difference between a recipe page and something you use with flour on your hands.',
    path: '/adapt',
    viewport: { width: 430, height: 932 },
    expectedSeconds: [15, 45],
    consumesCredit: false,
    dependsOn: 'adapt_and_reveal',
    steps: [
      {
        name: 'find the result card',
        action: 'waitFor',
        selector: 'role=button[name="Cook"]',
        timeoutMs: 30_000,
      },
      { name: 'scroll to the actions', action: 'scrollTo', selector: 'role=button[name="Cook"]' },
      { name: 'open cook mode', action: 'click', selector: 'role=button[name="Cook"]' },
      { name: 'let the overlay open', action: 'wait', value: '1800' },
      {
        name: 'still of the cook-mode intro',
        action: 'still',
        value: 'cook-intro',
        narration: 'Keep this screen open while you cook.',
      },
      {
        name: 'start the walkthrough',
        action: 'click',
        selector: 'role=button[name=/Start Cooking/]',
      },
      { name: 'let step one render', action: 'wait', value: '1800' },
      { name: 'still of step one', action: 'still', value: 'step-one' },
      { name: 'advance a step', action: 'click', selector: 'role=button[name=/Next/]' },
      { name: 'let the step change', action: 'wait', value: '1200' },
      { name: 'advance again', action: 'click', selector: 'role=button[name=/Next/]' },
      { name: 'let the step change', action: 'wait', value: '1200' },
      { name: 'still of a method step', action: 'still', value: 'method-step' },
      {
        // The control reads "Start 120:00 timer", so the duration is part of
        // the accessible name and only the word "timer" is stable. Which step
        // carries one depends on the recipe, so this stays optional rather than
        // becoming a guess at an index.
        name: 'start a step timer if this step has one',
        action: 'click',
        selector: 'role=button[name=/timer/i]',
        optional: true,
        narration: 'The timer runs in the app, not in your head.',
      },
      { name: 'let the timer run', action: 'wait', value: '5000' },
      { name: 'still of the running timer', action: 'still', value: 'timer-running' },
    ],
  },
};

export function allFlows(): CaptureFlow[] {
  return Object.values(FLOWS);
}

/**
 * Below this, there is nothing worth cutting.
 *
 * A cached adaptation returns in about two seconds, and cutting two seconds out
 * of a clip to replace them with a caption saying "2s" is worse footage than
 * simply leaving it in. The threshold means the edit does something only when
 * there is something to do.
 */
export const ELIDE_THRESHOLD_MS = 4_000;

export function shouldElide(measuredMs: number): boolean {
  return measuredMs >= ELIDE_THRESHOLD_MS;
}

/**
 * How the elided stretch is labelled, from what was actually measured.
 *
 * Never rounded up and never dramatised: if it took 26 seconds the caption says
 * 26 seconds, because the honest number is also the impressive one.
 */
export function elisionCaption(measuredMs: number): string {
  const seconds = Math.round(measuredMs / 1000);
  return seconds >= 60
    ? `${Math.round(seconds / 6) / 10} minutes later`
    : `${seconds} seconds later`;
}

/**
 * The selectors a flow depends on, which is what `verify-flows` asserts before
 * anything is recorded. Optional steps are excluded: a promo banner that is not
 * there is not a broken flow.
 */
export function requiredSelectors(flow: CaptureFlow): Array<{ step: string; selector: string }> {
  return flow.steps
    .filter((s) => s.selector && !s.optional)
    .map((s) => ({ step: s.name, selector: s.selector! }));
}

/**
 * Assets are captures of a product that keeps shipping, so they go off.
 *
 * Sixty days is chosen because it is long enough that a normal release cycle
 * does not churn the library, and short enough that a screenshot of a screen
 * that no longer exists does not reach a post.
 */
export const ASSET_STALE_DAYS = 60;

export function assetStaleness(
  capturedAt: Date,
  appVersionAtCapture: string | null,
  currentAppVersion: string | null,
  now: Date = new Date(),
): { stale: boolean; reason: string | null; ageDays: number } {
  const ageDays = Math.floor((now.getTime() - capturedAt.getTime()) / 86_400_000);

  if (
    appVersionAtCapture &&
    currentAppVersion &&
    appVersionAtCapture !== currentAppVersion
  ) {
    return {
      stale: true,
      ageDays,
      reason: `Captured on ${appVersionAtCapture}; the app is now on ${currentAppVersion}. Re-capture before using it.`,
    };
  }

  if (ageDays >= ASSET_STALE_DAYS) {
    return {
      stale: true,
      ageDays,
      reason: `${ageDays} days old. The UI has probably moved since. Re-capture, or use it knowing it may not match what a viewer sees today.`,
    };
  }

  return { stale: false, ageDays, reason: null };
}

/**
 * Does this screenshot look blank?
 *
 * The failure being guarded against is recording an error state or an unpainted
 * page and filing it as an asset — black frames, in the shorthand. PNG is
 * losslessly compressed, so a flat image compresses to almost nothing: a
 * 1280×900 screenshot of real UI lands in the hundreds of kilobytes, while a
 * uniform fill lands in single-digit kilobytes regardless of size.
 *
 * Bytes per pixel is therefore a reliable, dependency-free blank detector. The
 * threshold is deliberately low — this is meant to catch "nothing rendered", not
 * to be an opinion about design.
 */
export const MIN_BYTES_PER_PIXEL = 0.02;

export function looksBlank(
  bytes: number,
  width: number,
  height: number,
): { blank: boolean; bytesPerPixel: number; reason: string | null } {
  const pixels = Math.max(width * height, 1);
  const bytesPerPixel = bytes / pixels;

  if (bytesPerPixel >= MIN_BYTES_PER_PIXEL) {
    return { blank: false, bytesPerPixel, reason: null };
  }

  return {
    blank: true,
    bytesPerPixel,
    reason:
      `This capture is ${bytesPerPixel.toFixed(4)} bytes per pixel, against a floor of ${MIN_BYTES_PER_PIXEL}. ` +
      'A screenshot that compresses that hard is a blank or near-blank page — usually an error state, ' +
      'or a screenshot taken before the page painted. It has not been filed as an asset.',
  };
}
