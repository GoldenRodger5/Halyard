/**
 * Which board a pin belongs on.
 *
 * Pinterest is a search index rather than a feed, and the board is a large part
 * of how a pin is classified: a dairy-free adaptation filed under "Gluten-Free
 * Recipes" is mis-shelved, and Pinterest ranks it accordingly. Defaulting every
 * pin to one board throws that away.
 *
 * ## Keywords are derived from the board name
 *
 * Rather than asking the operator to configure a mapping, the match terms come
 * from the board's own name: "Gluten-Free Recipes" matches `gluten-free`,
 * `glutenfree`, `gluten free` and `gf`. A board created next week works without
 * anyone editing a table, which is the difference between a feature and a chore.
 *
 * Explicit `matchTags` on a board override the derived ones, for the cases where
 * a name is not the signal — a board called "Weeknight" that should catch
 * `quick` and `30-minute`.
 */

export interface PinterestBoard {
  boardId: string;
  name: string;
  /** Overrides the terms derived from the name. */
  matchTags?: string[] | null;
  /** The board a pin lands on when nothing else matches. */
  isDefault?: boolean;
}

export interface BoardSignals {
  /** Without the hash. */
  hashtags?: string[];
  body?: string;
  title?: string;
  /** The connector's raw artifact, which usually names the diet outright. */
  artifact?: unknown;
}

export type BoardChoice =
  | { boardId: string; name: string; reason: string; matched: string[] }
  | { boardId: null; reason: string; problem: 'no_boards' | 'no_match' };

/** Common shorthands that a board name will never contain but a post will. */
const ALIASES: Record<string, string[]> = {
  'gluten-free': ['gf', 'celiac', 'coeliac'],
  'dairy-free': ['df', 'lactose', 'lactosefree'],
  vegan: ['plantbased', 'plant-based'],
  vegetarian: ['veggie'],
  'high-protein': ['protein', 'highprotein'],
  substitutions: ['substitute', 'substitution', 'swap', 'swaps', 'replace'],
  'low-carb': ['keto', 'lowcarb'],
  'nut-free': ['peanutfree', 'treenutfree'],
};

/** Words that carry no signal and would match everything. */
const STOPWORDS = new Set(['recipes', 'recipe', 'ideas', 'board', 'the', 'and', 'my', 'for']);

/**
 * Match terms for a board, from its name.
 *
 * "Gluten-Free Recipes" gives `gluten-free`, `glutenfree`, `gluten free`, `gf`,
 * `celiac`, `coeliac` — and drops "recipes", which every board is about.
 */
export function deriveBoardKeywords(name: string): string[] {
  const lower = name.toLowerCase().trim();
  const words = lower.split(/\s+/).filter((word) => !STOPWORDS.has(word));
  const terms = new Set<string>();

  for (const word of words) {
    terms.add(word);
    // "gluten-free" also matches "glutenfree" and "gluten free", because a
    // hashtag drops the hyphen and prose keeps the space.
    if (word.includes('-')) {
      terms.add(word.replace(/-/g, ''));
      terms.add(word.replace(/-/g, ' '));
    }
    for (const alias of ALIASES[word] ?? []) terms.add(alias);
  }

  // Multi-word names also match as a phrase: "ingredient substitutions".
  if (words.length > 1) terms.add(words.join(' '));

  return [...terms].filter((term) => term.length > 1);
}

function haystack(signals: BoardSignals): string {
  const artifact =
    signals.artifact && typeof signals.artifact === 'object'
      ? JSON.stringify(signals.artifact).slice(0, 4000)
      : '';
  return [
    ...(signals.hashtags ?? []).map((tag) => tag.replace(/^#/, '')),
    signals.title ?? '',
    signals.body ?? '',
    artifact,
  ]
    .join(' ')
    .toLowerCase();
}

/**
 * Pick the board, or say precisely why it could not.
 *
 * Scores by how many terms matched, so "Vegan Substitutions" beats a bare
 * "Substitutions" board on a vegan swap. Ties break toward the more specific
 * board — the one with more terms — because a two-signal match is a stronger
 * classification than a one-signal one.
 */
export function chooseBoard(boards: PinterestBoard[], signals: BoardSignals): BoardChoice {
  if (boards.length === 0) {
    return {
      boardId: null,
      problem: 'no_boards',
      reason:
        'This Pinterest account has no boards. Every pin needs one, so create at least one board and re-sync before drafting pins.',
    };
  }

  const text = haystack(signals);

  const scored = boards
    .map((board) => {
      const terms = board.matchTags?.length ? board.matchTags : deriveBoardKeywords(board.name);
      const matched = terms.filter((term) => {
        // Word-boundary match, so "gf" does not fire inside "gforce" and
        // "protein" does not fire inside "proteins" being about something else.
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
      });
      return { board, matched, specificity: terms.length };
    })
    .filter((entry) => entry.matched.length > 0)
    .sort(
      (a, b) =>
        b.matched.length - a.matched.length || b.specificity - a.specificity,
    );

  const best = scored[0];
  if (best) {
    return {
      boardId: best.board.boardId,
      name: best.board.name,
      matched: best.matched,
      reason: `Filed under ${best.board.name} because the post mentions ${best.matched
        .slice(0, 3)
        .join(', ')}.`,
    };
  }

  const fallback = boards.find((board) => board.isDefault);
  if (fallback) {
    return {
      boardId: fallback.boardId,
      name: fallback.name,
      matched: [],
      reason: `Nothing in the post matched a board, so it went to ${fallback.name}, the default. Pinterest treats the board as a classification, so a more specific one would rank better.`,
    };
  }

  return {
    boardId: null,
    problem: 'no_match',
    reason:
      `Nothing in this post matches any board (${boards
        .map((b) => b.name)
        .join(', ')}), and no board is marked as the default. ` +
      'Mark one as default on /accounts, or give the post a dietary hashtag.',
  };
}
