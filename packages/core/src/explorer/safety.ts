/**
 * What a *discovered* flow is allowed to do.
 *
 * The capture flows in `capture/flows.ts` are hand-written and were read by a
 * person before they ever ran. The Explorer's flows are not: a model proposes
 * them from what it saw on the page, and something then drives a real browser
 * through a real signed-in account. Those are entirely different risk profiles
 * for an identical-looking data structure.
 *
 * ## The rule
 *
 * **The model proposes; this file decides.** No prompt instruction — "please
 * don't click delete" — is a control. It is a request, it is subject to every
 * failure mode prompts have, and the thing on the other side of the click is
 * someone's real account. The denylist is deterministic code, it runs on every
 * step of every proposed flow, and a flow containing one refused step is
 * refused entirely rather than run with that step skipped.
 *
 * Refusing the whole flow matters: a flow is a sequence, and dropping step 4 of
 * 9 produces a sequence nobody designed, running against live state.
 *
 * ## What this cannot do
 *
 * Text matching is a heuristic, and heuristics have gaps. A button labelled
 * "Tidy up" that deletes everything passes this. So the denylist is one layer:
 * exploration is also expected to run against a **dedicated exploration
 * account** with no payment method and nothing worth losing, which is the
 * control that does not depend on guessing what a button means.
 */

/** Actions a discovered flow may contain. Anything else is refused outright. */
export const ALLOWED_ACTIONS = [
  'goto',
  'click',
  'fill',
  'press',
  'waitFor',
  'waitForHidden',
  'wait',
  'scrollTo',
  'expectText',
  'expectVisible',
  'expectUrl',
] as const;

export type ExplorerAction = (typeof ALLOWED_ACTIONS)[number];

export interface ExplorerStep {
  name: string;
  action: ExplorerAction;
  selector?: string;
  /** Accessible name or visible label, which is what the denylist reads. */
  target?: string;
  value?: string;
  timeoutMs?: number;
  optional?: boolean;
}

/**
 * Words that mean "this changes or destroys something".
 *
 * Matched on word boundaries against a step's target and selector. Deliberately
 * broad: a false refusal costs one undiscovered feature, and a false permit
 * costs someone's data.
 */
export const DESTRUCTIVE_TERMS: readonly string[] = [
  'delete',
  'remove',
  'destroy',
  'erase',
  'wipe',
  'clear all',
  'reset',
  'revoke',
  'deactivate',
  'close account',
  'cancel subscription',
  'cancel plan',
  'unsubscribe',
  'archive all',
  'sign out',
  'log out',
  'logout',
];

/** Words that mean "this spends money or changes what is owed". */
export const TRANSACTIONAL_TERMS: readonly string[] = [
  'buy',
  'purchase',
  'checkout',
  'check out',
  'pay',
  'payment',
  'billing',
  'card',
  'subscribe',
  'upgrade',
  'downgrade',
  'redeem',
  'apply coupon',
  'place order',
];

/** Words that mean "this changes the identity we are borrowing". */
export const IDENTITY_TERMS: readonly string[] = [
  'change password',
  'new password',
  'change email',
  'update email',
  'two-factor',
  '2fa',
  'api key',
  'access token',
  'transfer ownership',
];

/**
 * Input types a discovered flow may never fill.
 *
 * The login step is performed by the authenticator with credentials the
 * operator supplied, before the discovered flow runs at all. A discovered flow
 * therefore has no legitimate reason to type into a password or payment field,
 * and every reason it might want to is a reason to stop.
 */
export const FORBIDDEN_INPUT_PATTERNS: readonly RegExp[] = [
  /type=["']?password/i,
  /\bpassword\b/i,
  /\bcvc\b|\bcvv\b/i,
  /card[-_ ]?number/i,
  /\bexpiry\b|\bexp[-_ ]?date\b/i,
  /\bssn\b|social[-_ ]?security/i,
];

/** A flow longer than this is not a feature demonstration, it is a wander. */
export const MAX_STEPS = 40;

export interface SafetyVerdict {
  allowed: boolean;
  /** Every reason, not just the first — the full picture is the useful one. */
  refusals: Array<{ stepIndex: number; stepName: string; rule: string; why: string }>;
}

function matches(haystack: string, terms: readonly string[]): string | null {
  const lower = ` ${haystack.toLowerCase()} `;
  for (const term of terms) {
    // Word-boundary-ish: the term surrounded by non-letters. Catches "Delete"
    // and "delete-account" without matching "undeleted".
    const pattern = new RegExp(`(^|[^a-z])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i');
    if (pattern.test(lower)) return term;
  }
  return null;
}

/**
 * Is this URL inside the product we were asked to explore?
 *
 * An off-site link is not necessarily hostile — it is usually a docs page or a
 * social profile — but following one takes an authenticated browser somewhere
 * nobody scoped. Exploration stays on the product's own origins.
 */
export function isInScope(url: string, allowedOrigins: string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  // A relative path stays wherever it already is, which is in scope by
  // construction — but `new URL` cannot parse one, so it never reaches here.
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;

  return allowedOrigins.some((origin) => {
    try {
      const allowed = new URL(origin);
      // Exact host, or a subdomain of it. Never a suffix match on the string:
      // 'evil-recipefix.app'.endsWith('recipefix.app') is true and wrong.
      return (
        parsed.host === allowed.host || parsed.host.endsWith(`.${allowed.host}`)
      );
    } catch {
      return false;
    }
  });
}

/**
 * Decide whether a proposed flow may run.
 *
 * Returns every refusal rather than the first, because the useful output when a
 * model proposes something unsafe is the whole pattern of what it tried.
 */
export function checkFlowSafety(
  steps: ExplorerStep[],
  options: { allowedOrigins: string[] },
): SafetyVerdict {
  const refusals: SafetyVerdict['refusals'] = [];
  const refuse = (stepIndex: number, stepName: string, rule: string, why: string): void => {
    refusals.push({ stepIndex, stepName, rule, why });
  };

  if (steps.length === 0) {
    return {
      allowed: false,
      refusals: [
        {
          stepIndex: -1,
          stepName: '(none)',
          rule: 'flow.empty',
          why: 'An empty flow demonstrates nothing. Running it would report success having done nothing, which is indistinguishable from a verified feature.',
        },
      ],
    };
  }

  if (steps.length > MAX_STEPS) {
    refuse(
      -1,
      '(flow)',
      'flow.too_long',
      `${steps.length} steps. Over ${MAX_STEPS} this is exploration, not a feature demonstration, and it should be split.`,
    );
  }

  steps.forEach((step, index) => {
    if (!ALLOWED_ACTIONS.includes(step.action)) {
      refuse(
        index,
        step.name,
        'action.not_allowed',
        `'${step.action}' is not in the allowed vocabulary. New actions are added deliberately, not proposed at run time.`,
      );
      return;
    }

    const surface = `${step.target ?? ''} ${step.selector ?? ''} ${step.name}`;

    // Only interactions can destroy something. An expectation cannot.
    const interacts = step.action === 'click' || step.action === 'press';
    if (interacts) {
      const destructive = matches(surface, DESTRUCTIVE_TERMS);
      if (destructive) {
        refuse(
          index,
          step.name,
          'step.destructive',
          `Matches '${destructive}'. Exploration is read-only; it never removes, resets or signs out of anything.`,
        );
      }

      const transactional = matches(surface, TRANSACTIONAL_TERMS);
      if (transactional) {
        refuse(
          index,
          step.name,
          'step.transactional',
          `Matches '${transactional}'. Exploration never spends money or changes what is owed.`,
        );
      }

      const identity = matches(surface, IDENTITY_TERMS);
      if (identity) {
        refuse(
          index,
          step.name,
          'step.identity',
          `Matches '${identity}'. Exploration borrows an identity; it does not change one.`,
        );
      }
    }

    if (step.action === 'fill') {
      for (const pattern of FORBIDDEN_INPUT_PATTERNS) {
        if (pattern.test(surface)) {
          refuse(
            index,
            step.name,
            'step.forbidden_input',
            'Typing into a credential or payment field. Signing in is the authenticator\'s job, done before this flow runs, so a discovered flow has no reason to.',
          );
          break;
        }
      }
    }

    if (step.action === 'goto') {
      const url = step.value ?? step.target ?? '';
      if (!isInScope(url, options.allowedOrigins)) {
        refuse(
          index,
          step.name,
          'step.out_of_scope',
          `'${url}' is outside ${options.allowedOrigins.join(', ')}. An authenticated browser does not follow links off the product.`,
        );
      }
    }
  });

  return { allowed: refusals.length === 0, refusals };
}
