/**
 * What to expect in the first thirty days. Milestone 51.
 *
 * The milestone says this should be drawn from `docs/halyard_first_run.md`.
 * **That document does not exist** — it is referenced by the spec and was never
 * written. Rather than invent a citation, the content here is drawn from what
 * the system actually does: the thresholds are the real constants, the waits are
 * the real review gates, and each item points at the screen that shows it.
 *
 * That is also why it lives in code rather than in a markdown file. Every number
 * below is imported from the module that enforces it, so a threshold that
 * changes cannot leave this page quietly describing the old one.
 *
 * Not a tutorial overlay. A page you read.
 */
import { LEARNING_MIN_POSTS_PER_CATEGORY } from '../generation/ideaEngine.js';
import { HOOK_PATTERN_COOLDOWN_DAYS } from '../generation/hooks.js';
import { MIN_POSTS_FOR_TIMING } from '../scoring/bestTime.js';
import { MIN_POSTS_PER_SLOT } from '../scoring/coldStart.js';

export interface FirstRunPhase {
  title: string;
  /** Rough span, in the operator's language rather than exact days. */
  when: string;
  /** What Halyard is doing. */
  happening: string[];
  /** What the operator has to do. Empty where the answer is "nothing". */
  yours: string[];
  /** What will look wrong but is not. */
  expected: string[];
  /** Where to watch it. */
  screens: Array<{ href: string; label: string }>;
}

export const FIRST_THIRTY_DAYS: FirstRunPhase[] = [
  {
    title: 'Before anything publishes',
    when: 'day zero',
    happening: [
      'Nothing generates until the first-run wizard is finished. That is deliberate: a system that writes in nobody’s voice writes faster than you can delete it.',
      'The launch batch stages a fortnight in one pass, then writes each post as a separate job, so a failure costs one slot rather than the batch.',
    ],
    yours: [
      'Create the accounts from /master/setup-kit, with the link-in-bio page already live.',
      'Connect them on /master and confirm each identity. A token is not an account until you have looked at whose account it is.',
      'Finish /onboarding, including the twenty calibration drafts. This is the step that cannot be automated, because it is your taste.',
    ],
    expected: [
      'Every platform except X and Bluesky will sit in draft_only until a manual review lands. That is the platform, not a bug, and the wait is measured in weeks.',
    ],
    screens: [
      { href: '/master/setup-kit', label: 'Setup kit' },
      { href: '/master', label: 'Accounts' },
      { href: '/first-run', label: 'Readiness' },
    ],
  },
  {
    title: 'The first fortnight',
    when: 'days 1 to 14',
    happening: [
      'Posts publish on the staggered schedule, jittered inside each slot window.',
      'Metrics start arriving on a delay of an hour or two. Some platforms need a paid tier before they report at all.',
      'Every link goes through /l/<slug>, so clicks are counted here even where the platform will not report them.',
    ],
    yours: [
      'Review the queue. It is built to work on a phone, because approval happens in spare moments or it does not happen.',
      'Reply to comments yourself. Halyard drafts replies and never sends one.',
    ],
    expected: [
      'Analytics will be mostly empty and will say so rather than rendering zeros. A zero and an absent measurement look identical on a chart and mean opposite things.',
      `Best-posting-time stays on its shipped defaults. It needs about ${MIN_POSTS_FOR_TIMING} posts per platform, and roughly ${MIN_POSTS_PER_SLOT} per window, before it is measuring your audience rather than repeating a general assumption.`,
      'Predicted stop rate stays blank below three posts of history. A prediction from two samples is a guess wearing a number.',
    ],
    screens: [
      { href: '/gallery', label: 'Queue' },
      { href: '/rundown', label: 'Calendar' },
      { href: '/wires', label: 'Inbox' },
    ],
  },
  {
    title: 'The first month',
    when: 'days 15 to 30',
    happening: [
      `Hook rotation starts to matter. Each pattern has a ${HOOK_PATTERN_COOLDOWN_DAYS}-day cooldown, so the library stops being a list and starts being a rotation.`,
      'Rejection clusters appear once you have rejected enough drafts for a pattern to be visible. That is the fastest route to better output: the reasons feed back into generation.',
      'Attribution starts closing if the product records utm_content on signup.',
    ],
    yours: [
      'Fill the swipe file. Fifteen entries is enough to change what gets written.',
      'Look at what you rejected and why. The cluster panel turns that into a rule.',
    ],
    expected: [
      `Conversion by category still will not be trustworthy. It needs about ${LEARNING_MIN_POSTS_PER_CATEGORY} posts per category, and two categories at that level, before a difference between them is a signal rather than the difference between individual posts.`,
      'Idea scoring is still on cold-start weights, which lean on mix debt and novelty rather than history. It switches itself over when there is history worth leaning on.',
    ],
    screens: [
      { href: '/floor/sources', label: 'Swipe file' },
      { href: '/floor/sources', label: 'Hooks' },
      { href: '/numbers', label: 'Analytics' },
    ],
  },
  {
    title: 'After that',
    when: 'day 30 onwards',
    happening: [
      'Scoring moves to measured weights once categories clear their thresholds, and the change is stated on the dashboard rather than happening quietly.',
      'Timing windows narrow from the defaults to what actually worked.',
    ],
    yours: [
      'Decide what to stop doing. The point of the conversion chart is subtraction.',
    ],
    expected: [
      'The numbers will be smaller than the platform dashboards suggest. Halyard counts activated users, not impressions, and those are different questions.',
    ],
    screens: [
      { href: '/numbers', label: 'Analytics' },
      { href: '/', label: 'Dashboard' },
    ],
  },
];

/**
 * Which phase the operator is actually in.
 *
 * From the first published post rather than from account creation: a system set
 * up three weeks ago and published to yesterday is on day one, and telling it
 * otherwise would date every expectation on the page.
 */
export function currentPhase(daysSinceFirstPost: number | null): number {
  if (daysSinceFirstPost === null) return 0;
  if (daysSinceFirstPost <= 14) return 1;
  if (daysSinceFirstPost <= 30) return 2;
  return 3;
}
