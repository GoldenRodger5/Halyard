/**
 * Destination QC. Milestone 42, item 5.
 *
 * "A QC warning when a specific-transformation post points at the bare
 * homepage."
 *
 * This is a warning rather than a failure, deliberately. Sometimes the homepage
 * really is the right destination — a launch post, a brand post, anything where
 * the reader is not being sent to one particular thing. But a post that says
 * "here is what happened to this exact recipe" and links to the front page asks
 * the reader to reproduce what they just read, and most will not.
 */
import type { DestinationType } from '../destinations/router.js';

export interface DestinationQCInput {
  category: string;
  destinationType: DestinationType | null;
  destinationUrl: string | null;
  /** The product's homepage, to recognise when the link is exactly that. */
  webUrl?: string | null;
  /** Whether the artifact this post came from has a shareable page. */
  hasShareToken?: boolean;
  /** Whether the product knows how to build a share URL at all. */
  hasShareTemplate?: boolean;
  /** True when the post names one specific thing, e.g. one adapted recipe. */
  isSpecific?: boolean;

  /**
   * Pinterest only: which board this pin was routed to, and why.
   *
   * Checked here rather than at publish because `board_id` is required by every
   * API that publishes a pin, and a post that cannot be published should never
   * reach the approval queue. Discovering it at publish means an approved post
   * failing at its slot, which is the worst time to find out.
   */
  board?: { boardId: string | null; reason: string; problem?: 'no_boards' | 'no_match' } | null;
}

export interface DestinationFinding {
  rule: string;
  severity: 'warning' | 'error';
  message: string;
  /** What to do about it. */
  fix: string;
}

export interface DestinationQCResult {
  passed: boolean;
  findings: DestinationFinding[];
  summary: string;
}

/** Categories where the post is about one particular thing. */
const SPECIFIC_CATEGORIES = new Set(['transformation', 'product']);

/** Strip protocol, www and a trailing slash, so two spellings of a homepage match. */
export function isBareHomepage(url: string | null, webUrl: string | null | undefined): boolean {
  if (!url || !webUrl) return false;
  const normalise = (u: string): string =>
    u
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\?.*$/, '')
      .replace(/#.*$/, '')
      .replace(/\/$/, '');
  return normalise(url) === normalise(webUrl);
}

export function runDestinationQC(input: DestinationQCInput): DestinationQCResult {
  const findings: DestinationFinding[] = [];
  const specific = input.isSpecific ?? SPECIFIC_CATEGORIES.has(input.category);

  if (input.board) {
    if (!input.board.boardId) {
      findings.push({
        rule:
          input.board.problem === 'no_boards'
            ? 'destination.no_pinterest_boards'
            : 'destination.no_matching_board',
        severity: 'error',
        message: input.board.reason,
        fix:
          input.board.problem === 'no_boards'
            ? 'Create a board on Pinterest, then run `pnpm pinterest-boards`.'
            : 'Mark a default board on /accounts, or give this post a dietary hashtag so it can be filed.',
      });
    } else if (input.board.reason.includes('default')) {
      // Placed, but placed generically. Pinterest treats the board as a
      // classification, so this costs ranking rather than the post.
      findings.push({
        rule: 'destination.default_board',
        severity: 'warning',
        message: input.board.reason,
        fix: 'Add a dietary hashtag so the pin files itself onto a more specific board.',
      });
    }
  }

  if (!input.destinationUrl) {
    findings.push({
      rule: 'destination.missing',
      severity: 'error',
      message: 'This post has no destination at all.',
      fix: 'Set a destination on the queue detail screen, or configure destinations on the product.',
    });
  } else if (specific && isBareHomepage(input.destinationUrl, input.webUrl)) {
    findings.push({
      rule: 'destination.bare_homepage',
      severity: 'warning',
      message:
        'This post is about one specific transformation, but the link goes to the homepage. The reader has to reproduce what they just read about.',
      fix: input.hasShareToken
        ? 'The artifact has a share token — switch the destination to the share link on this screen.'
        : input.hasShareTemplate === false
          ? 'Set share_url_template on the product so a specific adaptation can be linked to. RecipeFix serves one at https://recipefix.app/recipe/{shareToken}.'
          : 'The adaptation has no share token, which means it was never saved on the product side. Save it, or point this post at something more specific by hand.',
    });
  }

  if (input.destinationType === 'app_store' && !input.destinationUrl?.includes('apps.apple.com')) {
    findings.push({
      rule: 'destination.app_store_mismatch',
      severity: 'warning',
      message: 'The destination is marked App Store but the URL is not an App Store link.',
      fix: 'Set app_store on the product destinations, or change the destination type.',
    });
  }

  const errors = findings.filter((f) => f.severity === 'error');
  return {
    passed: errors.length === 0,
    findings,
    summary:
      findings.length === 0
        ? `points at ${describe(input.destinationType)}`
        : errors.length > 0
          ? `failed — ${errors[0]!.message}`
          : `warning — ${findings[0]!.message}`,
  };
}

function describe(type: DestinationType | null): string {
  switch (type) {
    case 'share_link':
      return 'the specific recipe';
    case 'app_store':
      return 'the App Store';
    case 'link_in_bio':
      return 'the link-in-bio page';
    default:
      return 'the web page';
  }
}
