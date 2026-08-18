/**
 * Dimension D — what Halyard forbids itself, whatever a platform allows.
 *
 * This is the smallest file in the capability model and the one that outranks
 * every other. A platform supporting an action, a transport performing it and
 * an account being authorised for it together say nothing about whether Halyard
 * should do it.
 *
 * ## Engagement is modelled, never performed
 *
 * The standing rule is older than this phase: **no auto-reply, no auto-DM, no
 * engagement automation.** It is why `collect_comments` collects and the inbox
 * states plainly that it never sends, and why `PublishAdapter` has no `reply()`
 * method with a test asserting its absence.
 *
 * P2 models engagement *capability* — whether a platform exposes comment reads,
 * what constraints apply — because knowing that is useful for strategy and
 * costs nothing. It adds no action. The two write-shaped engagement actions are
 * listed here as permanently refused so that the refusal is a value in the
 * model rather than an absence somebody later reads as an oversight.
 *
 * Reversing this is a product decision, not an implementation detail. Anything
 * that would draft or send engagement must surface the conflict rather than
 * quietly routing around it — see `PLATFORM_COVERAGE.md` §5, which sets out the
 * three distinct things people mean by "outreach" and their very different
 * risks.
 */
import type { CapabilityAction } from './capability.js';

export interface PolicyRefusal {
  reason: string;
}

/**
 * Actions Halyard refuses itself outright, with the reason it refuses them.
 *
 * Keyed loosely rather than by `CapabilityAction` because these name things
 * that deliberately are **not** in that union — an action Halyard will never
 * take should not be expressible as a capability request in the first place.
 */
export const PROHIBITED_ACTIONS: Record<string, PolicyRefusal> = {
  auto_reply: {
    reason:
      'Halyard never sends a reply. It drafts them and a person sends them — there is no reply() on any adapter, and a test asserts its absence.',
  },
  auto_dm: {
    reason:
      'Automated direct messages are the fastest route to a banned account and violate several platforms’ terms outright.',
  },
  auto_follow: {
    reason: 'Following, unfollowing and any other engagement action is out of scope by policy.',
  },
  engagement_automation: {
    reason: 'Engagement is observed and drafted, never executed automatically.',
  },
};

/**
 * Whether product policy refuses this action.
 *
 * Returns `null` for everything in `CapabilityAction`, because that union is
 * already restricted to publishing and *reading* engagement. The function
 * exists so the capability resolver has a real policy dimension to consult
 * rather than a hardcoded `null`, and so a future action that *is* prohibited
 * gets refused by the model instead of by somebody remembering.
 */
export function policyRefusalFor(action: CapabilityAction | string): PolicyRefusal | null {
  return PROHIBITED_ACTIONS[action] ?? null;
}

/**
 * Engagement capability, as read-only intelligence.
 *
 * Answers "what can be *observed* here", never "what can be done". Every field
 * is a read or a constraint; there is deliberately no `canReply` or `canSend`.
 */
export interface PlatformEngagementCapability {
  /** Can Halyard read comments on its own posts at all? */
  readsComments: boolean;
  /** Can it read mentions of the account? */
  readsMentions: boolean;
  /** Can it retrieve a conversation thread rather than isolated comments? */
  readsThreads: boolean;
  /** What the operator must know, in their language. */
  notes: string[];
  /**
   * Stated on every record, so nobody reads the absence of a write field as an
   * oversight to be corrected.
   */
  writesDisabledBy: 'product_policy';
}

export function engagementCapability(
  input: Omit<PlatformEngagementCapability, 'writesDisabledBy'>,
): PlatformEngagementCapability {
  return { ...input, writesDisabledBy: 'product_policy' };
}
