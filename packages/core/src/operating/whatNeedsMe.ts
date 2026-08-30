/**
 * §365. The one thing to do next.
 *
 * Home showed four counters, an account table, a mix chart, an opportunities
 * panel and a setup card, and left the operator to work out which of them was
 * the thing that mattered today. That is a dashboard, and a dashboard is a
 * reasonable answer for somebody who runs a system all day. Halyard has one
 * operator who opens it in spare moments, and the honest question they arrive
 * with is *"what needs me?"* — singular.
 *
 * So this resolves it. Deterministically, in code, from state that is already
 * being read for the rest of the page: the governing rule of the whole system
 * is that anything decidable is decided in code, and "which of nine possible
 * problems is the most urgent" is entirely decidable.
 *
 * ## Why an ordered ladder rather than a score
 *
 * Because the order is a judgement about consequence, and a judgement is worth
 * writing down. A paused kill switch outranks a full approval queue because
 * approving into a paused system produces nothing; an unconnected account
 * outranks both because a piece with nowhere to go is wasted work. Scoring
 * these against each other would produce the same ordering with the reasoning
 * hidden inside weights.
 *
 * ## Why every rung carries its own sentence
 *
 * "3 items need approval" is a count. "Three pieces are waiting, and the oldest
 * has been there four days" is a reason to act. Each rung says what is true,
 * what it means, and where to go — and the last rung, where nothing is wrong,
 * says so plainly rather than inventing urgency.
 */

export interface OperatingState {
  /** Whether a product exists at all. */
  hasProduct: boolean;
  /** First-run wizard steps still outstanding, in the wizard's own words. */
  setupIncomplete: string[];
  /** The global kill switch. False means nothing will post. */
  publishingEnabled: boolean;
  /** Accounts that can actually receive a post right now. */
  connectedAccounts: number;
  /** Accounts that were connected and have since broken. */
  brokenAccounts: number;
  /** Pieces whose generation or render failed. */
  failed: number;
  /** Pieces holding for approval. */
  pendingApproval: number;
  /** How long the oldest of those has been waiting, in whole days. */
  oldestPendingDays: number | null;
  /** Comments and mentions with no reply. */
  inboxWaiting: number;
  /** Pieces scheduled to go out in the next seven days. */
  scheduledNext7: number;
  /** Whether anything has ever published. Distinguishes cold start from a lull. */
  hasEverPublished: boolean;
}

/**
 * Named OperatorAction rather than NextAction because `accounts/status.ts`
 * already exports that name for something narrower — the next step for one
 * account. This is the next step for the whole operation, and two types with
 * one name in a barrel is an ambiguity the compiler is right to refuse.
 */
export interface OperatorAction {
  /** A short imperative. What to do, not what is true. */
  title: string;
  /** Why, in one or two sentences an operator can disagree with. */
  because: string;
  /** Where the doing happens. */
  href: string;
  /** The label on the link. */
  cta: string;
  /**
   * How loud to be. `blocked` means the system cannot proceed without this;
   * `waiting` means work is piled up; `calm` means nothing is wrong and the
   * screen should not pretend otherwise.
   */
  tone: 'blocked' | 'waiting' | 'calm';
  /** Which rung matched, for tests and for the log. */
  rung: string;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/**
 * The ladder, highest consequence first.
 *
 * Returns the first rung that applies. Exhaustive by construction: the final
 * rung has no condition, so there is always an answer and never a blank card.
 */
export function whatNeedsMe(state: OperatingState): OperatorAction {
  if (!state.hasProduct) {
    return {
      rung: 'no_product',
      tone: 'blocked',
      title: 'Add a product',
      because:
        'Halyard markets a product, so it cannot do anything at all until it has one to market.',
      href: '/products/new',
      cta: 'Add a product',
    };
  }

  if (state.setupIncomplete.length > 0) {
    return {
      rung: 'setup',
      tone: 'blocked',
      title: 'Finish the first run',
      because:
        `Daily generation will not start until it is done — ${state.setupIncomplete.join(', ')} ` +
        `${plural(state.setupIncomplete.length, 'is', 'are')} outstanding. ` +
        'The calibration batch is the part that separates a system trained on your taste from one trained on the average of the internet.',
      href: '/onboarding',
      cta: 'Continue setup',
    };
  }

  /*
   * Before the queue. Approving into a paused system produces a scheduled post
   * that will not go out, which looks like progress and is not.
   */
  if (!state.publishingEnabled) {
    return {
      rung: 'paused',
      tone: 'blocked',
      title: 'Publishing is paused',
      because:
        'The kill switch is on, so nothing will post however much of it you approve. Turn it off when you are ready for Halyard to publish.',
      href: '/settings',
      cta: 'Settings',
    };
  }

  if (state.connectedAccounts === 0) {
    return {
      rung: 'no_accounts',
      tone: 'blocked',
      title: 'Connect an account',
      because:
        'Nothing is connected, so a finished piece has nowhere to go. Halyard will still make things; they will pile up in Review.',
      href: '/accounts',
      cta: 'Connect',
    };
  }

  if (state.brokenAccounts > 0) {
    return {
      rung: 'broken_accounts',
      tone: 'blocked',
      title: `Reconnect ${state.brokenAccounts} ${plural(state.brokenAccounts, 'account', 'accounts')}`,
      because:
        'A connection that has expired fails at the moment of publishing, which is the worst time to find out. Reconnecting takes under a minute.',
      href: '/accounts',
      cta: 'Accounts',
    };
  }

  if (state.failed > 0) {
    return {
      rung: 'failed',
      tone: 'waiting',
      title: `${state.failed} ${plural(state.failed, 'piece', 'pieces')} failed`,
      because:
        'Each one records why it failed. A run of failures with the same reason is usually one fix rather than several.',
      href: '/queue?status=failed',
      cta: 'See what happened',
    };
  }

  if (state.pendingApproval > 0) {
    const age =
      state.oldestPendingDays !== null && state.oldestPendingDays >= 2
        ? ` The oldest has been waiting ${state.oldestPendingDays} days.`
        : '';
    return {
      rung: 'approval',
      tone: 'waiting',
      title: `Review ${state.pendingApproval} ${plural(state.pendingApproval, 'piece', 'pieces')}`,
      because:
        `Nothing publishes without you.${age} ` +
        'Rejections teach as much as approvals, so a reason on the way past is worth the extra line.',
      href: '/queue',
      cta: 'Review',
    };
  }

  if (state.inboxWaiting > 0) {
    return {
      rung: 'inbox',
      tone: 'waiting',
      title: `${state.inboxWaiting} ${plural(state.inboxWaiting, 'reply is', 'replies are')} waiting`,
      because:
        'Replies carry more weight than almost anything else you can post, and they go stale faster.',
      href: '/inbox',
      cta: 'Inbox',
    };
  }

  if (state.scheduledNext7 === 0) {
    return {
      rung: 'empty_schedule',
      tone: 'waiting',
      title: 'Nothing goes out this week',
      because: state.hasEverPublished
        ? 'The schedule for the next seven days is empty. A gap is not fatal, but it is a decision rather than an accident.'
        : 'Nothing has published yet and nothing is scheduled. The first piece is the one that starts everything else measuring.',
      href: '/make',
      cta: 'Make something',
    };
  }

  return {
    rung: 'clear',
    tone: 'calm',
    title: 'Nothing needs you',
    because:
      `${state.scheduledNext7} ${plural(state.scheduledNext7, 'piece is', 'pieces are')} scheduled for the next seven days, ` +
      'the queue is clear and every account is connected. Halyard will carry on without you.',
    href: '/calendar',
    cta: 'See the schedule',
  };
}
