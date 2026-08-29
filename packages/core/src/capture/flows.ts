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
 * role-plus-name and placeholder selectors — as stable as role and copy, which
 * is fragile in one specific way: a wording change breaks them.
 *
 * §159. `aria-label="Choose your swap"` was the one genuinely good hook and it
 * moved, killing three capture jobs a day. Steps now carry
 * `fallbackSelectors`: the same intent said several ways, most durable first,
 * with the winner recorded so drift is visible before it is fatal. The
 * `data-testid` candidates lead the chains deliberately — they cost nothing
 * while absent and become the durable hook the day RecipeFix adds them.
 */

export type FlowId = 'sign_in' | 'adapt_and_reveal' | 'swap_toggle' | 'cook_mode_timer';

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
    | 'scrollTo'
    /**
     * §299. Fill a field from the product's stored credentials.
     *
     * A separate action from `fill` so a credential can never be written into a
     * flow definition, a log line, or a job payload — the step names *which*
     * secret it wants and the runner is the only thing that ever sees the
     * value. `value` here is a key (`email`, `password`), not a secret.
     */
    | 'fillSecret';
  /** Discovered selector. Omitted for goto/wait/still. */
  selector?: string;
  /**
   * Other ways to find the same element, tried in order after `selector`.
   *
   * §159. `aria-label="Choose your swap"` was the one genuinely good hook
   * RecipeFix offered, and it moved — three capture jobs a day now die on
   * `Selector [aria-label="Choose your swap"] did not resolve`. The fix is not
   * a better guess at the markup; markup moves. It is to say the same intent
   * several ways and record which one answered.
   *
   * Ordered most durable first, which is roughly: a test id, then an
   * accessible role and name, then visible text, then structural CSS. A step
   * that falls through to its last candidate is still working and is *also*
   * a warning, which `selectorHealth` reports.
   */
  fallbackSelectors?: string[];
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
  /**
   * Executed, but not shown.
   *
   * §166. A flow has to do things that produce the artifact and are worth
   * nothing to a viewer: load a page, dismiss a promo bar, wait for a
   * placeholder to disappear. The first capture-backed render spent about two
   * of its 3.8 hero seconds on exactly that — a blank page, a banner being
   * closed, and a spinner — before the product did anything.
   *
   * This is deliberately **not** `elide`. The two mean different things and
   * conflating them would lose one of them:
   *
   *   · `elide` is a *long wait the edit cuts and captions with its measured
   *     duration* — the viewer is told real work happened and how long it took.
   *     It is a claim about the product's behaviour.
   *   · `setup` is footage that simply is not part of the story. There is
   *     nothing to tell the viewer, because nothing happened worth telling.
   *
   * The step still runs. Nothing about verification, selector health, stills,
   * timing or provenance changes — a setup step that fails still fails the
   * flow, because the artifact depends on it. The only thing this withholds is
   * screen time.
   *
   * Which steps are setup is knowledge about *this product's* flow, so it lives
   * here in the configuration, next to that flow's selectors and focus region,
   * rather than as a rule the generic footage engine guesses (§146, §163).
   */
  setup?: boolean;
  /** What the viewer should understand is happening here. */
  narration?: string;
}

/**
 * The part of the viewport worth framing, as fractions of width and height.
 *
 * §163. A browser recording is a whole window, and a 9:16 frame of the whole
 * window renders the product at a size nobody can read on a phone. The region
 * that matters — a result panel, a canvas, an editor pane — is knowledge about
 * *this product's layout*, so it lives here in the flow configuration rather
 * than in the renderer, which must stay product-agnostic (§146).
 *
 * Omitted means the whole viewport, which is the honest default for a flow
 * nobody has framed yet.
 */
export interface FocusRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptureFlow {
  id: FlowId;
  title: string;
  /** Why this flow is worth the capture, in one sentence. */
  why: string;
  path: string;
  viewport: { width: number; height: number };
  /** Where the product's output lives in this flow's viewport. §163. */
  focusRegion?: FocusRegion;
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
  /**
   * §299. A flow that must run first to establish state, not to be reused.
   *
   * Distinct from `dependsOn`, which means "this reuses the result the parent
   * produced, so it spends no credit". `sign_in` produces no result to reuse —
   * it establishes a session — and conflating the two broke the rule that a
   * dependent never spends a second credit, because an adaptation genuinely
   * does spend one whether or not somebody signed in first.
   *
   * Two words for two relationships, so neither rule has to be weakened.
   */
  requires?: FlowId;
  /**
   * §299. This flow is plumbing, and is expected to be invisible.
   *
   * Every other flow is checked against "no flow should be mostly setup",
   * because a mostly-invisible content flow means the flow is wrong. Signing in
   * is *entirely* setup by design — a video of somebody typing a password is
   * not a demonstration — so it declares that rather than quietly failing the
   * rule or forcing the rule to be loosened for everyone.
   */
  plumbing?: boolean;
  /**
   * §299. This flow cannot run without the product's test credentials.
   *
   * Skipped rather than failed when they are absent: an app with no account
   * requirement is a normal case, and a capture run should not dead-letter
   * because a product does not have a login.
   */
  requiresCredentials?: boolean;
  steps: FlowStep[];
}

/** A recipe URL that is public, stable, and unambiguously wheat-and-dairy. */
export const SAMPLE_RECIPE_URL =
  'https://sallysbakingaddiction.com/homemade-artisan-bread/';

export const FLOWS: Record<FlowId, CaptureFlow> = {
  /**
   * §299. Sign in, so everything after it records the real product.
   *
   * The walkthrough render showed the *demo* card with a "Sign in to save your
   * recipes" sheet across it. The adapt flow waits correctly for a real
   * adaptation, and the real adaptation needs an account — so every product
   * demonstration Halyard has recorded has been of the signed-out state, which
   * is the one part of the product nobody is trying to sell.
   *
   * Every step is `setup`: signing in is plumbing, and a video of somebody
   * typing a password is not a demonstration. Nothing here is stilled.
   *
   * Skipped rather than failed when the product has no stored credentials — an
   * app with no account requirement is a normal case, and a capture run should
   * not dead-letter because a product has no login.
   */
  sign_in: {
    id: 'sign_in',
    title: 'Sign in with the test account',
    why: 'Everything worth demonstrating is behind the sign-in.',
    path: '/account',
    viewport: { width: 430, height: 932 },
    expectedSeconds: [2, 20],
    consumesCredit: false,
    requiresCredentials: true,
    plumbing: true,
    steps: [
      /*
       * §299. `/account`, not `/signin`.
       *
       * Verified against the live app: `/signin`, `/login` and `/sign-in` all
       * render the marketing shell with **zero inputs**. The form is on
       * `/account` and only after a click — so a flow that went straight to a
       * sign-in path would have timed out on a field that was never there.
       */
      { name: 'open the account page', action: 'goto', value: '/account', setup: true },
      {
        name: 'open the sign-in form',
        action: 'click',
        selector: 'role=button[name=/^sign in$/i]',
        fallbackSelectors: ['role=button[name=/sign in|log in/i]'],
        setup: true,
      },
      {
        name: 'enter the email',
        action: 'fillSecret',
        value: 'email',
        selector: 'input[type="email"]',
        fallbackSelectors: ['input[name="email"]', 'input[autocomplete="email"]'],
        setup: true,
      },
      {
        name: 'enter the password',
        action: 'fillSecret',
        value: 'password',
        selector: 'input[type="password"]',
        fallbackSelectors: ['input[name="password"]', 'input[autocomplete="current-password"]'],
        setup: true,
      },
      {
        name: 'submit the sign-in',
        action: 'click',
        /*
         * The *last* matching control. The page carries several "Sign In"
         * buttons — the header, the card, and the form's own submit — and the
         * first one re-opens the form rather than submitting it.
         */
        selector: 'role=button[name=/^sign in$/i] >> nth=-1',
        fallbackSelectors: ['button[type="submit"]', 'role=button[name=/^(log in|continue)$/i]'],
        setup: true,
      },
      {
        name: 'wait for the signed-in state',
        action: 'waitForHidden',
        selector: 'input[type="password"]',
        timeoutMs: 30_000,
        setup: true,
      },
    ],
  },

  adapt_and_reveal: {
    id: 'adapt_and_reveal',
    /* §299. Signed in first, so the adaptation is real rather than the demo. */
    requires: 'sign_in',
    title: 'Paste a recipe, get it adapted',
    why:
      'The whole product in one shot: an arbitrary recipe URL goes in, a diet constraint is picked, and what comes back has substitutions with reasons attached.',
    path: '/adapt',
    /*
     * §168. Captured at the shape it is published in.
     *
     * This flow recorded a 1280×900 desktop window, and the cut that reached
     * the demo beat was 1.20:1 against a portrait band of 0.81:1 — so fitting
     * it by width left 28% of the band as slack no arrangement could remove.
     * Cropping harder was the obvious answer and the wrong one: the desktop
     * layout puts the adapted ingredients in two columns, and a portrait crop
     * of it cuts one of them, which is transformation evidence.
     *
     * A phone viewport does not need cropping, because the product's own
     * responsive layout already answers the question. At 430px the ingredients
     * stack, the type is set for a hand, and the recording is the shape a
     * social viewer will actually see. `cook_mode_timer` has captured this way
     * since it was written; this flow was the outlier.
     *
     * The `focusRegion` that used to be here described where the result panel
     * sat *in a desktop window*. That window no longer exists, and a region
     * describing a layout the capture no longer produces is worse than none —
     * so it is removed rather than re-guessed. Every selector this flow depends
     * on was verified to resolve at this viewport before the change.
     */
    viewport: { width: 430, height: 932 },
    // Measured, not assumed. The spec said 60–75s. A cold adaptation of this
    // URL took 26s; a repeat of the same URL and diet came back in under 10,
    // because RecipeFix caches the result. Both are normal, so the range is wide
    // and the ramp is driven by the measured wait rather than a fixed guess.
    expectedSeconds: [8, 60],
    consumesCredit: true,
    steps: [
      // Navigation to a blank, still-loading page. Nothing to watch.
      { name: 'open the converter', action: 'goto', value: '/adapt', setup: true },
      {
        // Closing a promo bar says nothing about the product.
        name: 'dismiss the App Store banner',
        action: 'click',
        selector: '[aria-label="Dismiss"]',
        optional: true,
        setup: true,
      },
      {
        name: 'switch to the Link tab',
        action: 'click',
        selector: 'role=button[name="Link"]',
        fallbackSelectors: ['role=tab[name=/link|url/i]', 'button:has-text("Link")'],
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
        /* §253. Same reasoning as `submit`: one label change should not stop
           every recording of the product's central action. */
        fallbackSelectors: [
          'role=button[name=/gluten[- ]?free/i]',
          'role=checkbox[name=/gluten[- ]?free/i]',
          'button:has-text("Gluten-Free")',
        ],
        narration: 'One constraint. This is the only input.',
      },
      {
        /*
         * §253. The submit button, with fallbacks, because its label moved.
         *
         * A production capture failed on
         * `role=button[name="Adapt This Recipe →"]` — an exact-match selector
         * including a trailing arrow, against a UI that ships continuously.
         * The flow had no fallbacks for this step, so one copy change stopped
         * every recording of the product's central action, and the failure
         * surfaced as "none of 1 selector(s) resolved".
         *
         * The fallbacks widen in the order a person would try: the same button
         * without the arrow, any button whose name mentions adapting, then the
         * form's submit control. The last one survives a complete rewording,
         * which is the case an exact match can never survive.
         */
        name: 'submit',
        action: 'click',
        /*
         * §292. The label moved again, and this time it is *dynamic*.
         *
         * It now reads "Make it gluten-free →" and changes with the diet the
         * user picked — "Make it dairy-free →", "Make it vegan →". So the
         * primary selector is a pattern on the stable half of the sentence,
         * not a literal, because there is no literal that survives a diet
         * change let alone a copy change.
         *
         * §253 widened the fallbacks after the last break and every one of them
         * still assumed the word "adapt". Twenty-seven capture jobs dead-lettered
         * against that assumption and the product's central action went
         * unrecorded for a day, which is the second time this exact class of
         * selector has stopped the capture system. The lesson §159 recorded is
         * not "add fallbacks", it is **never anchor on the words a designer is
         * free to change** — so the last resort is structural.
         */
        selector: 'role=button[name=/^make it /i]',
        fallbackSelectors: [
          /* The previous wording, in case a deploy rolls back. */
          'role=button[name=/adapt this recipe/i]',
          /*
           * Any primary action, by the verb it starts with. Anchored to the
           * start on purpose: a loose `/(gluten|dairy|vegan)/i` was tried and
           * matched **five** elements on the live page, because the diet chips
           * are named for diets too. A fallback that clicks the first of five
           * is worse than one that fails — it would silently pick "Gluten-Free"
           * and record a capture of the wrong action entirely.
           */
          'role=button[name=/^(make|adapt|convert|fix|get)\\b/i]',
          /*
           * Last resort, and it is the trailing arrow rather than a `<form>`.
           * The page has no form element at all — the structural fallback §253
           * added matched nothing on the live app, so the "always works" option
           * never worked. The arrow is this product's convention for a primary
           * action and outlives its wording.
           */
          'role=button[name=/→\\s*$/]',
        ],
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
        /*
         * A placeholder disappearing. This is the spinner that was on screen at
         * five seconds in the first capture-backed render — dead time between
         * the submit and the wait that actually means something, which `elide`
         * already handles and captions.
         */
        setup: true,
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
    /*
     * §171. The homepage, not `/adapt`.
     *
     * This flow was dead in production for weeks — thirteen capture jobs died
     * on "find the swap control" — and the diagnosis was wrong twice. It looked
     * like selector drift, so §159 built a five-candidate fallback chain; then
     * all five failed and it looked like the product had removed the feature.
     *
     * Neither. The control is exactly where the flow always said it was,
     * `[aria-label="Choose your swap"]`, and it is on **`/`**. It was never on
     * an idle `/adapt`: the original design assumed this flow would act on the
     * card `adapt_and_reveal` left on screen, and captures run in their own
     * browser context, so there was never a card there to act on.
     *
     * Verified live before changing anything, at zero credit: the control is
     * visible, its two options carry `aria-pressed`, and clicking the unpressed
     * one rewrote the ingredient from "1 can (400g) jackfruit, drained" to
     * "150g soy curls, rehydrated in warm broth". That is the product doing the
     * thing this flow exists to film, not a marketing still.
     *
     * `dependsOn` is gone with the assumption that created it — the homepage
     * card is always present, so this flow no longer needs a prior adaptation
     * and cannot be taken down by one drifting.
     */
    path: '/',
    viewport: { width: 430, height: 932 },
    expectedSeconds: [8, 20],
    // The homepage card is already adapted; toggling it spends nothing.
    consumesCredit: false,
    steps: [
      /*
       * §171. Its own navigation, now that it is independent.
       *
       * `flow.path` is metadata for `sourceUrl` — it does not navigate. This
       * flow had no `goto` because it was designed to inherit the page
       * `adapt_and_reveal` left behind, and `runFlowChain` opens a fresh blank
       * page, so run as a root flow it was looking for the swap control on
       * `about:blank`. The failure screenshot was a blank white frame, which is
       * what sent the earlier diagnosis chasing selectors.
       */
      { name: 'open the homepage', action: 'goto', value: '/', setup: true },
      {
        name: 'find the swap control',
        /*
         * §159. This was the one genuinely stable hook on the page, and it
         * moved — three capture jobs a day died on it. The candidates below say
         * the same intent four ways, most durable first, so a further change
         * degrades the run instead of ending it.
         */
        action: 'waitFor',
        // §171. Verified live on `/`. The testid leads the fallbacks so the
        // flow moves back to it automatically if the product ever ships one.
        selector: '[aria-label="Choose your swap"]',
        fallbackSelectors: [
          '[data-testid="swap-control"]',
          'role=group[name=/swap/i]',
          'role=radiogroup[name=/swap|substitut/i]',
          'text=Choose your swap',
        ],
        timeoutMs: 30_000,
      },
      {
        name: 'scroll the ingredient into view',
        action: 'scrollTo',
        selector: '[aria-label="Choose your swap"]',
        fallbackSelectors: [
          '[data-testid="swap-control"]',
          'role=group[name=/swap/i]',
          'text=Choose your swap',
        ],
      },
      { name: 'still before the swap', action: 'still', value: 'before' },
      {
        // The alternative is whichever option is not currently pressed, so this
        // works on any recipe rather than only on the one it was written against.
        name: 'pick the other option',
        action: 'click',
        // `aria-pressed` is real and exactly one option carries `false`.
        selector: '[aria-label="Choose your swap"] button[aria-pressed="false"]',
        fallbackSelectors: [
          '[aria-label="Choose your swap"] button[aria-pressed="false"]',
          'role=radio[name=/.+/]',
          'button[aria-pressed="false"]',
        ],
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
