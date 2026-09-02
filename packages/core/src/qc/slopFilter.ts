/**
 * Gate 1 — Copy quality. v2 Part F.1.
 *
 * A lint pass, not a model call. Deterministic, fast, and non-negotiable: it runs
 * before anything reaches the approval queue, and the specific violation is shown
 * in the UI so the operator can see *why* something was rewritten.
 *
 * Severity contract:
 *   error   → the item never enters the queue. Regenerate.
 *   warning → visible on the card, does not block approval.
 *
 * The em dash rule is an error, not a style note. It is the single strongest LLM
 * tell in short-form copy.
 */

export type SlopSeverity = 'error' | 'warning';

export interface SlopViolation {
  /** Stable machine id, e.g. 'punctuation.em_dash'. Used for analytics and tests. */
  rule: string;
  severity: SlopSeverity;
  /** Operator-facing, written to be read on a phone. */
  message: string;
  /** The offending text, when there is a specific span. */
  excerpt?: string;
  /** Character offset into `body`, when known. */
  index?: number;
  /** What to do instead. */
  fix?: string;
}

export interface SlopStats {
  characters: number;
  words: number;
  sentences: number;
  averageSentenceWords: number;
  sentenceLengthCv: number;
  openingWords: number;
  questionMarks: number;
  emojiCount: number;
  hashtagCount: number;
}

export interface SlopFilterResult {
  passed: boolean;
  violations: SlopViolation[];
  errors: SlopViolation[];
  warnings: SlopViolation[];
  stats: SlopStats;
}

/**
 * Every platform Halyard writes copy for.
 *
 * Must stay in step with `PlatformId`. Bluesky was added as an adapter in
 * milestone 40 and was missing here until milestone 50 found it: because the
 * generate handler asserts the SQL row's platform into this type, a connected
 * Bluesky account did not fail a type check, it crashed the handler at the
 * hashtag rule with "cannot read properties of undefined". A missing key in a
 * `Record` keyed by a union is only as safe as the narrowest cast anywhere in
 * the system, and there was a cast.
 */
export type SlopPlatform =
  | 'x'
  | 'instagram'
  | 'tiktok'
  | 'pinterest'
  | 'youtube'
  | 'threads'
  | 'bluesky';

import { budgetFor, checkCopyBudget } from '../copy/budget.js';

/**
 * §450. Above this share, a caption is a transcript rather than a companion.
 *
 * Two thirds, not a half. A caption legitimately names what the piece is about,
 * so a subject noun and a couple of its neighbours appearing in both is correct
 * writing, not repetition. The bar is set where a caption stops adding anything
 * — measured pieces sat at 60% (close, still saying something of its own) and
 * 89% (a transcript).
 */
/**
 * §467. Phrasings that sound like a citation and cite nothing.
 *
 * Ordered so the most specific message wins; the loop stops at the first match
 * because one flag per caption is the useful amount.
 */
const VAGUE_AUTHORITY: ReadonlyArray<{ test: RegExp; message: string }> = [
  {
    /* "2021 salinity testing", "a 2019 study" with no author or publication. */
    test: /\b(19|20)\d{2}\s+[a-z]+(\s+[a-z]+)?\s+(test(ing|s)?|stud(y|ies)|research|trial(s)?|data)\b/i,
    message:
      'A year and a field is not a citation. Name the study, the author or the publication, or drop the year.',
  },
  {
    test: /\b(established|confirmed|proven|verified)\s+by\b/i,
    message:
      '"Established by" is the language of a finding, and it overstates a recipe site or a blog. Say who said it.',
  },
  {
    test: /\b(studies show|research shows|science says|experts (say|agree)|it is (widely |well )?known|scientists (say|found)|research suggests)\b/i,
    message: 'Authority with nobody behind it. Name the source or say the thing plainly.',
  },
  {
    test: /\baccording to (science|research|studies|experts)\b/i,
    message: '"According to science" cites nothing. Name who.',
  },
];

export const CAPTION_ECHO_LIMIT = 0.66;

/**
 * §466. Whether a caption gives a reader anything to do.
 *
 * Broad on purpose. A question mark is the obvious form and not the only one —
 * a caption ending "the second one is the one people get wrong" earns a reply
 * without asking for one, and is better writing than "which do you do?". What
 * is refused is a caption that closes every loop it opened.
 */
export function invitesAnything(body: string): boolean {
  const text = body.trim().toLowerCase();
  if (text.length === 0) return false;
  if (text.includes('?')) return true;
  return /\b(which|what|how many|tell me|let me know|try it|your turn|guess|do you|have you|ever|most people get|people get (this|it) wrong|the (one|second|third) .{0,24}(wrong|missed)|save this|worth (a )?(save|trying)|argue|disagree|change my mind)\b/.test(
    text,
  );
}

/**
 * Words long enough to look like content and too common to be any.
 *
 * Without this, "because", "through" and "different" count as shared meaning
 * and every caption reads as an echo of every video.
 */
const CAPTION_ECHO_STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'because', 'been', 'before', 'being',
  'between', 'both', 'could', 'does', 'doing', 'down', 'during', 'each',
  'from', 'have', 'here', 'into', 'just', 'like', 'more', 'most', 'much',
  'only', 'other', 'over', 'same', 'should', 'some', 'still', 'such', 'than',
  'that', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those',
  'through', 'under', 'until', 'very', 'were', 'what', 'when', 'where',
  'which', 'while', 'will', 'with', 'would', 'your', 'different', 'actually',
]);

export interface SlopFilterInput {
  body: string;
  platform: SlopPlatform;
  /** Hashtags as stored on content_items — without the leading '#'. */
  hashtags?: string[];
  /** products.content_rules.banned_phrases, merged with the built-in list. */
  extraBannedPhrases?: string[];
  /** products.content_rules.forbidden_claims. Matched as substrings, case-insensitive. */
  forbiddenClaims?: string[];
  /**
   * Long-form surfaces (YouTube descriptions, Pinterest board copy) legitimately
   * run longer than a feed post. Relaxes sentence-length and opening-line limits.
   */
  longForm?: boolean;
  /**
   * The text is a voiceover script — something a person will hear rather than
   * read.
   *
   * Different failure modes entirely. Hashtag counts are meaningless because a
   * hashtag cannot be spoken, and the things that ruin a read — a symbol, a
   * parenthetical, a URL, a sentence too long to follow by ear — are invisible
   * to the rules written for a caption.
   *
   * This matters because the voiceover is the half of a video that viewers
   * actually receive, and it was the half nothing checked: `writeDraft` gated
   * the post body through the slop filter and the claim verifier on a retry
   * loop, while `writeVoScript` ran neither.
   */
  spoken?: boolean;
  /**
   * §450. What the viewer will already be reading on screen.
   *
   * The lines of the piece this caption goes under. Absent for a text post,
   * where there is no second channel and the caption *is* the piece.
   */
  onScreen?: string[];
}

// ───────────────────────────────────────────────────────────────────────────
// Rule tables
// ───────────────────────────────────────────────────────────────────────────

/**
 * v2 F.1 — banned phrases and constructions, verbatim from the doc plus the
 * near-synonyms that trip the same tell. Matched case-insensitively on word
 * boundaries.
 */
export const BANNED_PHRASES: readonly string[] = [
  // The single most recognisable LLM sentence shape gets its own regex below.
  "let's dive in",
  "let's explore",
  'lets dive in',
  'dive into',
  "in today's fast-paced world",
  'in a world where',
  'game changer',
  'game-changer',
  'revolutionize',
  'revolutionise',
  'revolutionizing',
  'revolutionising',
  '10x',
  'unlock',
  'unlocking',
  'elevate',
  'elevates',
  'elevating',
  'the secret to',
  "here's the thing",
  'seamlessly',
  'seamless',
  'effortlessly',
  'effortless',
  'leverage',
  'leveraging',
  'utilize',
  'utilise',
  'utilizing',
  'robust',
  'delve',
  'delving',
  'tapestry',
  'testament to',
  'navigate the landscape',
  'landscape of',
  'in the realm of',
  'at the end of the day',
  'when it comes to',
  'look no further',
  'buckle up',
  'the bottom line',
  'supercharge',
  'transformative',
  'cutting-edge',
  'best-in-class',
  'needle-moving',
];

/** Constructions that need more than a substring match. */
const CONSTRUCTION_RULES: Array<{
  rule: string;
  severity: SlopSeverity;
  pattern: RegExp;
  message: string;
  fix: string;
}> = [
  {
    rule: 'construction.not_just_but',
    severity: 'error',
    // "It's not just X, it's Y" and its variants.
    pattern:
      /\b(it'?s|this is|that'?s|they'?re|we'?re)\s+not\s+just\b[^.!?]{0,80}?[,;]\s*(it'?s|this is|that'?s|they'?re|we'?re|but)\b/i,
    message: 'The "not just X, it\'s Y" construction. The most recognisable LLM sentence shape.',
    fix: 'State the second half on its own. The contrast is doing no work.',
  },
  {
    rule: 'construction.whether_youre',
    severity: 'error',
    pattern: /\bwhether\s+you'?re\b[^.!?]{0,60}?\bor\b/i,
    message: '"Whether you\'re X or Y" opener.',
    fix: 'Pick one reader and write to them.',
  },
  {
    rule: 'construction.thats_where_x_comes_in',
    severity: 'error',
    pattern: /\bthat'?s\s+where\s+[\w\s]{1,30}\s+comes?\s+in\b/i,
    message: '"That\'s where {product} comes in" — reads as ad copy.',
    fix: 'Show the product doing the thing instead of announcing it.',
  },
  {
    rule: 'construction.more_than_just',
    severity: 'error',
    pattern: /\b(more than just|not merely|far more than)\b/i,
    message: 'Hype comparative ("more than just ...").',
    fix: 'Delete the comparative and keep the claim.',
  },
];

/**
 * Hashtag ceilings. X / Instagram / TikTok / Pinterest are stated in v2 F.1.
 * Threads and YouTube are not, and are inferred:
 *   Threads — behaves like X in the feed, so the same restraint applies.
 *   YouTube — description tags, capped low to avoid keyword stuffing.
 * Both are marked INFERRED so the source of the number is never ambiguous.
 */
export const HASHTAG_LIMITS: Record<SlopPlatform, { min: number; max: number; inferred?: boolean }> =
  {
    x: { min: 0, max: 2 },
    instagram: { min: 3, max: 8 },
    tiktok: { min: 3, max: 5 },
    pinterest: { min: 0, max: 0 },
    threads: { min: 0, max: 3, inferred: true },
    youtube: { min: 0, max: 5, inferred: true },
    // Bluesky indexes hashtags but the culture reads more than a couple as
    // marketing. Inferred from norms rather than from a documented limit.
    bluesky: { min: 0, max: 2, inferred: true },
  };

/**
 * The hard character ceiling each platform enforces on the post body.
 *
 * Declared on every adapter as `maxChars` and **checked nowhere**. A draft
 * exceeding it passed every gate, sat in the queue looking finished, and would
 * have been rejected by the platform at publish — the first symptom being a
 * failed post rather than a flagged draft.
 *
 * Duplicated here rather than imported because `qc` does not depend on
 * `adapters`, and a cycle between the two is worse than a second copy. The
 * copies are compared in `slopFilter.test.ts`, which is the only thing that
 * makes a second copy safe.
 */
export const BODY_LIMITS: Record<SlopPlatform, number> = {
  x: 280,
  instagram: 2200,
  tiktok: 2200,
  pinterest: 500,
  threads: 500,
  youtube: 5000,
  bluesky: 300,
};

/**
 * Where a warning turns into an error.
 *
 * Over the ceiling is a hard failure. Approaching it is worth flagging because
 * feeds truncate well before the limit and a caption that only reads correctly
 * when expanded is a caption most people read wrong.
 */
export const BODY_WARN_FRACTION = 0.9;

/** Emoji that are banned outright rather than merely rationed (v2 F.1). */
const BANNED_EMOJI = ['🚀', '🛸', '🛰', '🌠', '💫'];

// Variation selectors are excluded from the class: they modify a preceding
// emoji rather than being one, and counting them doubles the emoji tally.
const EMOJI_PATTERN =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F000}-\u{1F02F}]/gu;

/** Adjective shapes used by the stacking detector. */
const ADJECTIVE_SUFFIX = /(y|ous|ful|less|able|ible|ish|ive|ic|al|ed|ing)$/i;
const ADJECTIVE_LEXICON = new Set([
  'delicious',
  'tender',
  'rich',
  'fresh',
  'crisp',
  'warm',
  'bold',
  'simple',
  'easy',
  'quick',
  'perfect',
  'great',
  'amazing',
  'incredible',
  'stunning',
  'gorgeous',
  'smooth',
  'light',
  'moist',
  'soft',
  'sweet',
  'savory',
  'savoury',
  'hearty',
  'vibrant',
  'authentic',
  'wholesome',
]);

/**
 * v2 F.2 — hard blocks that hold regardless of source. These are copy-level and
 * therefore cheap to catch here; the claim verifier (Gate 2) catches the rest.
 */
const HARD_BLOCK_RULES: Array<{ rule: string; pattern: RegExp; message: string }> = [
  {
    rule: 'hard_block.nutrition_accuracy',
    pattern:
      /\b(accurate|verified|exact|precise|guaranteed)\s+(nutrition|macros|calories|nutritional)/i,
    message: 'Claims nutrition figures are accurate or verified. Never permitted.',
  },
  {
    rule: 'hard_block.nutrition_accuracy_reverse',
    pattern: /\b(nutrition|macros|calorie counts?)\s+(are|is)\s+(accurate|verified|exact|precise)/i,
    message: 'Claims nutrition figures are accurate or verified. Never permitted.',
  },
  {
    rule: 'hard_block.one_to_one',
    pattern: /\b(perfect|exact|true|straight)\s*1\s*[:\-–]\s*1\b|\bperfect\s+(1\s*to\s*1|one[- ]to[- ]one)\b/i,
    message: 'Claims a perfect 1:1 substitution. Never permitted — substitutions are never 1:1.',
  },
  {
    rule: 'hard_block.medical_guarantee',
    pattern:
      /\b(safe for (celiacs?|coeliacs?|allergies|allergy sufferers)|allergen[- ]free guarantee|guaranteed (gluten|dairy|nut)[- ]free|will not (trigger|cause) (a )?(reaction|flare))\b/i,
    message: 'Medical or allergy-safety guarantee. Never permitted.',
  },
  {
    rule: 'hard_block.cures',
    pattern: /\b(cures?|treats?|heals?|prevents?)\s+(your\s+)?(ibs|celiac|coeliac|diabetes|inflammation)\b/i,
    message: 'Medical claim. Never permitted.',
  },
];

/**
 * Internal vocabulary from the GitHub connector. A shipped-feature summary is a
 * model output, and "instructed not to mention SHAs" is not a guarantee.
 * Milestone 24.
 */
const INTERNALS_RULES: Array<{ rule: string; pattern: RegExp; message: string }> = [
  {
    rule: 'internals.commit_sha',
    // At least one a-f, so a seven-digit number is not mistaken for a hash.
    pattern: /\b(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/,
    message: 'Looks like a commit SHA. Internal references never go in copy.',
  },
  {
    rule: 'internals.branch_name',
    pattern: /\b(feat|fix|chore|refactor|release)\/[a-z0-9._-]+/i,
    message: 'Looks like a branch name.',
  },
  {
    rule: 'internals.file_path',
    pattern: /\b[\w-]+\/[\w-]+\.(ts|tsx|js|jsx|sql|py|go|rs|json|yml|yaml)\b/,
    message: 'Looks like a source file path.',
  },
  {
    rule: 'internals.pr_reference',
    pattern: /\b(PR|pull request)\s*#\d+|\(#\d{1,6}\)/i,
    message: 'Looks like a pull request reference.',
  },
  {
    rule: 'internals.conventional_commit',
    pattern: /(^|\n)(feat|fix|chore|docs|refactor|perf|test|build|ci)(\([\w-]+\))?:/i,
    message: 'Looks like a conventional commit prefix.',
  },
];

/** Competitor names are configured per product; these are the always-on ones. */
const COMPETITOR_PATTERN =
  /\b(chatgpt|copy\s?me\s?that|paprika|mealime|yummly|allrecipes|whisk|samsung food)\b/i;

// ───────────────────────────────────────────────────────────────────────────
// Text utilities
// ───────────────────────────────────────────────────────────────────────────

/** Split into sentences without breaking on decimals, abbreviations, or 350°F. */
export function splitSentences(text: string): string[] {
  // Periods inside numbers and abbreviations are swapped for a sentinel before the
  // split and restored afterwards, so "Rest 3.5 min. Then slice." is two sentences.
  const SENTINEL = '\u0001';
  const guarded = text
    .replace(/(\d)\.(\d)/g, `$1${SENTINEL}$2`)
    .replace(/\b(Mr|Mrs|Ms|Dr|vs|etc|e\.g|i\.e|approx|tsp|tbsp|oz|lb|min|hr)\./gi, `$1${SENTINEL}`);

  return guarded
    .split(/(?<=[.!?])[\s\n]+/)
    .map((s) => s.split(SENTINEL).join('.').trim())
    .filter((s) => s.length > 0);
}

export function countWords(text: string): number {
  const matches = text.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return matches ? matches.length : 0;
}

function firstWord(sentence: string): string {
  const m = sentence.trim().match(/[\p{L}\p{N}']+/u);
  return m ? m[0].toLowerCase() : '';
}

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function excerptAround(text: string, index: number, span = 48): string {
  const start = Math.max(0, index - 12);
  return text.slice(start, Math.min(text.length, start + span)).replace(/\s+/g, ' ').trim();
}

// ───────────────────────────────────────────────────────────────────────────
// The filter
// ───────────────────────────────────────────────────────────────────────────

export function slopFilter(input: SlopFilterInput): SlopFilterResult {
  const { body, platform, hashtags = [], longForm = false, spoken = false, onScreen } = input;
  const violations: SlopViolation[] = [];
  const push = (v: SlopViolation) => violations.push(v);

  /**
   * Nothing to examine is not a pass.
   *
   * Every rule below is a search for something wrong. Run them over an empty
   * string and they all come back clean, which reads exactly like a post that
   * was checked and found good. That is the same failure shape as an extractor
   * that silently matched nothing, and it is the one this whole gate exists to
   * prevent, so it is caught first and reported as an error rather than a
   * vacuous pass.
   */
  if (body.trim().length === 0) {
    push({
      rule: 'copy.empty',
      severity: 'error',
      message: 'There is no copy to check.',
      excerpt: '',
      index: 0,
      fix: 'An empty body means generation produced nothing, or a staged slot reached QC before it was written. Either way this is not a post.',
    });
    return {
      passed: false,
      violations,
      errors: violations,
      warnings: [],
      stats: emptyStats(),
    };
  }

  // ── Punctuation and typography (v2 F.1) ──────────────────────────────────
  const emDashIndex = body.indexOf('—');
  if (emDashIndex >= 0) {
    push({
      rule: 'punctuation.em_dash',
      severity: 'error',
      message: 'Em dash. The strongest LLM tell in short-form copy.',
      excerpt: excerptAround(body, emDashIndex),
      index: emDashIndex,
      fix: 'Rewrite the sentence, or use a period or a comma.',
    });
  }

  // En dash is acceptable only inside a numeric range (10–15 minutes).
  for (const match of body.matchAll(/–/g)) {
    const i = match.index ?? 0;
    const before = body.slice(Math.max(0, i - 4), i);
    const after = body.slice(i + 1, i + 5);
    const isNumericRange = /\d\s?$/.test(before) && /^\s?\d/.test(after);
    if (!isNumericRange) {
      push({
        rule: 'punctuation.en_dash_in_prose',
        severity: 'error',
        message: 'En dash in prose. Only acceptable in a numeric range.',
        excerpt: excerptAround(body, i),
        index: i,
        fix: 'Use a comma, a period, or a hyphen.',
      });
      break;
    }
  }

  const ellipsisIndex = body.indexOf('…');
  if (ellipsisIndex >= 0) {
    push({
      rule: 'punctuation.ellipsis_char',
      severity: 'error',
      message: 'Ellipsis character.',
      excerpt: excerptAround(body, ellipsisIndex),
      index: ellipsisIndex,
      fix: 'Use three periods, or nothing at all.',
    });
  }

  // Any curly quotation mark, including the right single quote LLMs emit inside
  // contractions. v2 F.1 is unqualified: straight quotes only.
  const curlyIndex = body.search(/[\u201C\u201D\u2018\u2019]/);
  if (curlyIndex >= 0) {
    push({
      rule: 'punctuation.curly_quotes',
      severity: 'error',
      message: 'Curly quote. Some platforms mangle them.',
      excerpt: excerptAround(body, curlyIndex),
      index: curlyIndex,
      fix: "Use straight quotes (' and \").",
    });
  }

  // ── Emoji ────────────────────────────────────────────────────────────────
  const emojiMatches = [...body.matchAll(EMOJI_PATTERN)];
  const emojiCount = emojiMatches.length;
  for (const banned of BANNED_EMOJI) {
    const i = body.indexOf(banned);
    if (i >= 0) {
      push({
        rule: 'emoji.banned',
        severity: 'error',
        message: `Banned emoji ${banned}. Rocket-adjacent emoji are excluded entirely.`,
        excerpt: excerptAround(body, i),
        index: i,
        fix: 'Remove it.',
      });
    }
  }
  if (emojiCount > 1) {
    push({
      rule: 'emoji.too_many',
      severity: 'error',
      message: `${emojiCount} emoji in the body. Maximum is 1, and only where it carries meaning.`,
      fix: 'Keep at most the one that means something.',
    });
  }

  // ── Banned phrases ───────────────────────────────────────────────────────
  const allBanned = [...BANNED_PHRASES, ...(input.extraBannedPhrases ?? [])];
  const lower = body.toLowerCase();
  const seenPhrases = new Set<string>();
  for (const phrase of allBanned) {
    const needle = phrase.toLowerCase().trim();
    if (!needle || seenPhrases.has(needle)) continue;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const boundaryStart = /^[\p{L}\p{N}]/u.test(needle) ? '\\b' : '';
    const boundaryEnd = /[\p{L}\p{N}]$/u.test(needle) ? '\\b' : '';
    const re = new RegExp(`${boundaryStart}${escaped}${boundaryEnd}`, 'i');
    const m = re.exec(body);
    if (m) {
      seenPhrases.add(needle);
      push({
        rule: 'phrase.banned',
        severity: 'error',
        message: `Banned phrase: "${m[0]}".`,
        excerpt: excerptAround(body, m.index),
        index: m.index,
        fix: 'Say the thing plainly instead.',
      });
    }
  }
  void lower;

  // ── Constructions ────────────────────────────────────────────────────────
  for (const rule of CONSTRUCTION_RULES) {
    const m = rule.pattern.exec(body);
    if (m) {
      push({
        rule: rule.rule,
        severity: rule.severity,
        message: rule.message,
        excerpt: m[0].slice(0, 80),
        index: m.index,
        fix: rule.fix,
      });
    }
  }

  // ── Hard blocks (v2 F.2) ─────────────────────────────────────────────────
  for (const rule of HARD_BLOCK_RULES) {
    const m = rule.pattern.exec(body);
    if (m) {
      push({
        rule: rule.rule,
        severity: 'error',
        message: rule.message,
        excerpt: m[0].slice(0, 80),
        index: m.index,
        fix: 'Remove the claim. There is no rewording that makes it acceptable.',
      });
    }
  }
  for (const rule of INTERNALS_RULES) {
    const m = rule.pattern.exec(body);
    if (m) {
      push({
        rule: rule.rule,
        severity: 'error',
        message: rule.message,
        excerpt: excerptAround(body, m.index),
        index: m.index,
        fix: 'Say what a person can now do. Nobody outside the repo knows what this refers to.',
      });
    }
  }

  const competitor = COMPETITOR_PATTERN.exec(body);
  if (competitor) {
    push({
      rule: 'hard_block.competitor',
      severity: 'error',
      message: `Names a competitor ("${competitor[0]}"). Never permitted.`,
      excerpt: excerptAround(body, competitor.index),
      index: competitor.index,
      fix: 'Describe the problem, not the rival.',
    });
  }
  for (const claim of input.forbiddenClaims ?? []) {
    const needle = claim.trim();
    if (!needle) continue;
    const i = body.toLowerCase().indexOf(needle.toLowerCase());
    if (i >= 0) {
      push({
        rule: 'hard_block.forbidden_claim',
        severity: 'error',
        message: `Forbidden claim for this product: "${needle}".`,
        excerpt: excerptAround(body, i),
        index: i,
        fix: 'Remove it.',
      });
    }
  }

  // ── Structural checks ────────────────────────────────────────────────────
  const sentences = splitSentences(body);
  const sentenceWordCounts = sentences.map(countWords);
  const words = countWords(body);
  const averageSentenceWords =
    sentenceWordCounts.length > 0
      ? sentenceWordCounts.reduce((a, b) => a + b, 0) / sentenceWordCounts.length
      : 0;
  const cv = coefficientOfVariation(sentenceWordCounts);

  const sentenceCeiling = longForm ? 28 : 22;
  if (averageSentenceWords > sentenceCeiling) {
    push({
      rule: 'structure.sentence_length',
      severity: 'error',
      message: `Average sentence is ${averageSentenceWords.toFixed(1)} words. Ceiling is ${sentenceCeiling}.`,
      fix: 'Break the long ones. Short-form rewards short sentences.',
    });
  }

  // Extension beyond v2 F.1, which specifies an average only: a single very long
  // sentence hides behind a short hook and never moves the mean. Caught separately
  // so the two failures read differently in the queue.
  const longestSentenceIndex = sentenceWordCounts.indexOf(Math.max(...sentenceWordCounts, 0));
  const longestSentenceWords = sentenceWordCounts[longestSentenceIndex] ?? 0;
  const singleSentenceCeiling = longForm ? 45 : 30;
  if (longestSentenceWords > singleSentenceCeiling) {
    push({
      rule: 'structure.sentence_too_long',
      severity: 'error',
      message: `One sentence runs ${longestSentenceWords} words. Ceiling is ${singleSentenceCeiling}.`,
      excerpt: (sentences[longestSentenceIndex] ?? '').slice(0, 80),
      fix: 'Split it. Nobody reads a 30-word sentence on a phone.',
    });
  }

  // Humans vary wildly. Uniform sentence length is a generation artifact.
  if (sentences.length >= 4 && averageSentenceWords >= 8 && cv < 0.25) {
    push({
      rule: 'structure.uniform_rhythm',
      severity: 'error',
      message: `Sentence lengths are near-identical (variation ${(cv * 100).toFixed(0)}%). Humans vary wildly.`,
      fix: 'Make one sentence very short. Let another run long.',
    });
  }

  const openingSentence = sentences[0] ?? '';
  const openingWords = countWords(openingSentence);
  const openingCeiling = longForm ? 20 : 12;
  if (openingWords > openingCeiling) {
    push({
      rule: 'structure.opening_line',
      severity: 'error',
      message: `Opening line is ${openingWords} words. Ceiling is ${openingCeiling}; the hook is the first 3 to 5.`,
      excerpt: openingSentence.slice(0, 80),
      index: 0,
      fix: 'Lead with the reader\'s problem in five words.',
    });
  }

  const questionMarks = (body.match(/\?/g) ?? []).length;
  /**
   * §466. One question is not a density.
   *
   * This rule exists to refuse a post *made* of questions — "Struggling with
   * bread? Want better crust? Ready to level up?" — which is engagement bait
   * and reads as one. Expressed purely as a ratio it also refused **any**
   * question in a short caption: one question mark in twelve words is 1 per 12,
   * over a ceiling of 1 per 40, so a caption could not ask anything at all
   * without failing.
   *
   * That collided head-on with the rule one section above it, which refuses a
   * caption that asks for nothing. Between them a short caption had no legal
   * form. Found by writing a clean fixture for the new rule and watching the
   * old one reject it.
   *
   * A pattern needs at least two instances. One question is a caption doing its
   * job.
   */
  if (words >= 8 && questionMarks >= 2 && questionMarks / words > 1 / 40) {
    push({
      rule: 'structure.question_density',
      severity: 'error',
      message: `${questionMarks} question marks in ${words} words. Ceiling is 1 per 40.`,
      fix: 'Make the questions statements.',
    });
  }

  // Three consecutive sentences opening with the same word.
  for (let i = 0; i + 2 < sentences.length; i++) {
    const a = firstWord(sentences[i] ?? '');
    if (!a) continue;
    if (a === firstWord(sentences[i + 1] ?? '') && a === firstWord(sentences[i + 2] ?? '')) {
      push({
        rule: 'structure.anaphora',
        severity: 'error',
        message: `Three consecutive sentences start with "${a}".`,
        excerpt: [sentences[i], sentences[i + 1], sentences[i + 2]].join(' ').slice(0, 90),
        fix: 'Vary the openings, or cut two of them.',
      });
      break;
    }
  }

  // Rule-of-three lists as a default rhythm. One tricolon is human; two is a tic.
  const ITEM = "[\\p{L}'\\-]+(?:\\s[\\p{L}'\\-]+){0,2}";
  const tricolonPattern = new RegExp(
    `\\b(${ITEM}),\\s+(${ITEM}),\\s+(?:and\\s+)?(${ITEM})\\b`,
    'gu',
  );
  const tricolons = [...body.matchAll(tricolonPattern)];
  if (tricolons.length >= 2) {
    push({
      rule: 'structure.rule_of_three',
      severity: 'error',
      message: `${tricolons.length} rule-of-three lists. It reads as a default rhythm.`,
      excerpt: tricolons[0]?.[0]?.slice(0, 80),
      fix: 'Keep one list at most, and give it a different shape.',
    });
  } else if (tricolons.length === 1) {
    push({
      rule: 'structure.rule_of_three',
      severity: 'warning',
      message: 'One rule-of-three list. Fine once; watch it becoming the default.',
      excerpt: tricolons[0]?.[0]?.slice(0, 80),
    });
  }

  // Adjective stacking: "delicious, tender, perfectly-seasoned".
  for (const m of tricolons) {
    const candidates = [m[1], m[2], m[3]].filter(Boolean) as string[];
    const adjectiveish = candidates.filter((c) =>
      c
        .split(/\s+/)
        .some(
          (w) =>
            ADJECTIVE_LEXICON.has(w.toLowerCase()) ||
            (w.length > 4 && ADJECTIVE_SUFFIX.test(w)) ||
            (w.includes('-') && w.length > 6),
        ),
    );
    if (adjectiveish.length >= 3) {
      push({
        rule: 'structure.adjective_stacking',
        severity: 'error',
        message: `Stacked adjectives: "${m[0].slice(0, 60)}".`,
        index: m.index,
        fix: 'Keep the one adjective that carries information. Delete the rest.',
      });
      break;
    }
  }

  // ── Spoken scripts ───────────────────────────────────────────────────────
  if (spoken) {
    /**
     * Things that cannot be said out loud, or that fall apart when they are.
     * Each is an error rather than a warning: unlike a caption, there is no
     * reading of these that a listener can recover from.
     */
    const unspeakable: Array<[RegExp, string, string, string]> = [
      [
        /(?:^|\s)#[\p{L}\p{N}_]+/u,
        'spoken.hashtag',
        'A hashtag in a voiceover script is read aloud as "hash tag".',
        'Move it to the caption. Hashtags are not spoken.',
      ],
      [
        /https?:\/\/|www\./i,
        'spoken.url',
        'A URL in a voiceover script gets read out character by character.',
        'Say where to go in words, and put the link in the caption.',
      ],
      [
        /\([^)]*\)/,
        'spoken.parenthetical',
        'A parenthetical has no spoken equivalent — it just becomes a clause that arrives from nowhere.',
        'Cut it, or make it its own sentence.',
      ],
      [
        /\d+\s*(?:°|℉|℃)|\b\d+\/\d+\b|[%&@]/u,
        'spoken.unspoken_symbol',
        'A symbol or fraction here reaches the synthesiser as a symbol.',
        'Spell it: "four hundred fifty degrees", "three quarters", "percent".',
      ],
    ];

    for (const [pattern, rule, message, fix] of unspeakable) {
      if (pattern.test(body)) push({ rule, severity: 'error', message, fix });
    }

    /**
     * A sentence a listener cannot hold.
     *
     * Reading gives you a second pass; hearing does not. Twenty words is
     * already generous for narration — the prompt asks for under twelve.
     */
    for (const sentence of splitSentences(body)) {
      const words = countWords(sentence);
      if (words > 20) {
        push({
          rule: 'spoken.sentence_too_long',
          severity: 'error',
          message: `A ${words}-word sentence is too long to follow by ear: "${sentence.slice(0, 60)}…"`,
          fix: 'Break it. Under twelve words each.',
        });
      }
    }
  }

  // ── Length, against the platform's own ceiling ────────────────────────────
  //
  // Skipped for spoken scripts: a voiceover has no character limit, and the
  // length that matters there is measured in seconds by the audio gate.
  if (!spoken) {
    const limit = BODY_LIMITS[platform];
    // Hashtags are posted with the body and count against the same ceiling.
    const posted = body.length + hashtags.reduce((sum, h) => sum + h.length + 2, 0);

    if (posted > limit) {
      push({
        rule: 'length.over_limit',
        severity: 'error',
        message: `${posted} characters with hashtags. ${platform} accepts ${limit}.`,
        fix: `Cut ${posted - limit} characters. The platform will reject this outright.`,
      });
    } else if (posted > limit * BODY_WARN_FRACTION) {
      push({
        rule: 'length.near_limit',
        severity: 'warning',
        message: `${posted} of ${limit} characters on ${platform}.`,
        fix: 'Feeds truncate well before the ceiling. A caption that only reads correctly when expanded is one most people read wrong.',
      });
    }

    /**
     * §214. The budget people actually read, not the ceiling the platform sets.
     *
     * The rule above fires at 80% of the platform limit, which on TikTok is
     * 1,760 characters. Halyard's TikTok captions average 472 and reach 783 —
     * comfortably inside, and comfortably past the ~90 characters TikTok shows
     * before "more". So the existing rule was true and useless here: it was
     * measuring the wrong ceiling.
     *
     * Warnings, not errors. Where the essay belongs is a judgement about
     * engagement, and a judgement should not block a human who disagrees. The
     * one thing that stays an error is the platform's own limit, above.
     */
    if (!longForm) {
      for (const finding of checkCopyBudget(body, hashtags, budgetFor(platform))) {
        if (finding.rule === 'budget.over_platform_limit') continue; // said above
        push({
          rule: finding.rule,
          severity: finding.severity,
          message: finding.message,
          fix:
            finding.rule === 'budget.caption_too_long'
              ? 'The writing is not the problem; the container is. Keep the opening and move the rest.'
              : finding.rule === 'budget.opening_truncated'
                ? 'Lead with the shortest true sentence. Everything after the fold is opt-in.'
                : 'Match the hashtag count to what the platform rewards.',
        });
      }
    }
  }

  // ── Hashtags ─────────────────────────────────────────────────────────────
  // Skipped for spoken scripts: a script has no hashtag field, and counting the
  // ones it must not contain against a per-platform minimum is meaningless.
  const limits = HASHTAG_LIMITS[platform];
  const inlineHashtags = (body.match(/(?:^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
  const hashtagCount = hashtags.length + inlineHashtags;
  if (!spoken && hashtagCount > limits.max) {
    push({
      rule: 'hashtags.too_many',
      severity: 'error',
      message: `${hashtagCount} hashtags on ${platform}. Ceiling is ${limits.max}.${
        limits.inferred ? ' (Limit inferred — see HASHTAG_LIMITS.)' : ''
      }`,
      fix: `Cut to ${limits.max} or fewer.`,
    });
  }
  if (!spoken && hashtagCount < limits.min) {
    push({
      rule: 'hashtags.too_few',
      severity: 'warning',
      message: `${hashtagCount} hashtags on ${platform}. Expected at least ${limits.min}.`,
      fix: `Add ${limits.min - hashtagCount} that describe the dish or the constraint.`,
    });
  }

  const errors = violations.filter((v) => v.severity === 'error');
  /**
   * §450. A caption that transcribes the video wastes one of two channels.
   *
   * The screenwriter has enforced exactly this rule one level down since §335:
   * *"SPOKEN and ON SCREEN are different. Never put the same sentence in both —
   * that is a caption being read aloud, and it is the single clearest sign a
   * machine made the video."* Nothing applied it between the **caption** and
   * the video, and the prompt's own instruction was too narrow: it said do not
   * restate *the first line*, so the writer restated all of them.
   *
   * Measured on real pieces: 88.9% of one caption's distinctive words were also
   * on screen, 60% on another. At that point a viewer who reads has no reason
   * to watch and a viewer who watches has no reason to read.
   *
   * Some overlap is correct and expected — a caption about herbs says "herbs".
   * So this counts only words long enough to be *content*, and the bar is set
   * where a caption stops adding anything rather than where it first repeats.
   *
   * A warning, never an error. §449 is the standing lesson about what failing a
   * caption costs: a whole researched piece, binned over its wrapper.
   */
  if (!spoken && onScreen && onScreen.length > 0) {
    const distinctive = (text: string) =>
      new Set(
        (text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? []).filter(
          (w) => !CAPTION_ECHO_STOPWORDS.has(w),
        ),
      );
    const caption = distinctive(body);
    const screen = distinctive(onScreen.join(' '));
    if (caption.size >= 4 && screen.size > 0) {
      let shared = 0;
      for (const word of caption) if (screen.has(word)) shared += 1;
      const overlap = shared / caption.size;
      if (overlap > CAPTION_ECHO_LIMIT) {
        push({
          rule: 'structure.caption_echoes_screen',
          severity: 'warning',
          message: `${Math.round(overlap * 100)}% of this caption is already on screen.`,
          excerpt: body.slice(0, 80),
          index: 0,
          fix: 'The caption and the video are two channels doing two jobs. Say the thing that did not fit, or ask the question the video raises. A caption that transcribes it spends one of them.',
        });
      }
    }
  }

  /**
   * §466. A post that asks nothing gets nothing back.
   *
   * Measured across twelve real captions: **not one** contained a question, an
   * invitation, or any ask. Every piece ended on a statement and stopped. On
   * every platform here the *return* is what ranks — a reply, a save, a
   * comment after the watch, a rewatch — and none of them was ever invited.
   *
   * Deliberately broad about what counts. A question mark is the obvious form
   * and far from the only one: "the second one is the one people get wrong"
   * earns a reply without asking for one, and is better writing than "which do
   * you do?". So this refuses *silence*, not a particular phrasing.
   *
   * A warning, and never on a voiceover: a narrator asking a rhetorical
   * question is a different craft and `spoken` already marks that case.
   */
  if (!spoken && !invitesAnything(body)) {
    push({
      rule: 'structure.invites_nothing',
      severity: 'warning',
      message: 'This caption asks for nothing, so there is nothing for a reader to do.',
      excerpt: body.slice(-70),
      index: Math.max(0, body.length - 70),
      fix: 'End on something that earns a reply, a save or a rewatch — a real question about what the piece showed, or the one detail worth arguing with. Not "comment below".',
    });
  }

  /**
   * §467. Authority-shaped phrasing with nothing behind it.
   *
   * Two real captions:
   *
   *   *"Established by BBC Good Food."*
   *   *"2021 salinity testing points to absorption, not heat."*
   *
   * Both borrow the *cadence* of a citation without being one. BBC Good Food is
   * a recipe site and "established by" is what you write about a finding, not a
   * how-to. "2021 salinity testing" names no study, no author and no
   * publication — it is the shape a fabricated citation takes, and a reader who
   * knows the field spots it instantly.
   *
   * This is the sharpest possible risk for this particular product. An account
   * whose entire pitch is *"we know what is in your food"* cannot be caught
   * sounding more certain than its evidence. Gotcha 9 is the same rule about
   * metrics; this is it about prose.
   *
   * A warning, not an error: the *fact* may be perfectly sourced — `claims` and
   * `format.uncited_claim` check that separately. What is wrong is the wording,
   * and the fix is to name the source or drop the flourish.
   */
  for (const vague of VAGUE_AUTHORITY) {
    const found = body.match(vague.test);
    if (!found) continue;
    push({
      rule: 'claim.vague_authority',
      severity: 'warning',
      message: vague.message,
      excerpt: found[0].slice(0, 60),
      index: found.index ?? 0,
      fix: 'Name who, and when — or say the thing plainly without borrowing an authority you did not cite.',
    });
    break;
  }

  const warnings = violations.filter((v) => v.severity === 'warning');

  return {
    passed: errors.length === 0,
    violations,
    errors,
    warnings,
    stats: {
      characters: body.length,
      words,
      sentences: sentences.length,
      averageSentenceWords: Number(averageSentenceWords.toFixed(2)),
      sentenceLengthCv: Number(cv.toFixed(3)),
      openingWords,
      questionMarks,
      emojiCount,
      hashtagCount,
    },
  };
}

/** Zeroed stats for a body there was nothing to measure. */
function emptyStats(): SlopStats {
  return {
    characters: 0,
    words: 0,
    sentences: 0,
    averageSentenceWords: 0,
    sentenceLengthCv: 0,
    openingWords: 0,
    questionMarks: 0,
    emojiCount: 0,
    hashtagCount: 0,
  };
}

/** Compact one-line summary for the queue card. */
export function slopSummary(result: SlopFilterResult): string {
  if (result.passed && result.warnings.length === 0) return 'passed (0 flags)';
  if (result.passed) return `passed (${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'})`;
  return `failed (${result.errors.length} violation${result.errors.length === 1 ? '' : 's'})`;
}

/**
 * §348. Rules that describe a **post**, not a line.
 *
 * `slopFilter` was written for a caption — a whole post, with an opening line,
 * a rhythm across sentences, and a question density. §293 pointed it at format
 * slots, which was right for the language rules and wrong for these: a slot is
 * a fragment on a card, and it has no opening line because it is not an opening.
 *
 * The cost was not theoretical. A Kinolog quiz was refused three times in a row
 * for `structure.opening_line` on an **answer** slot, then for
 * `structure.question_density` on its **questions**, then for
 * `format.uncited_claim` on its **title**. Three separate rules, all correct
 * about a post and none applicable to the thing they were judging, each
 * consuming an attempt the piece needed for its actual content.
 *
 * The language rules still apply everywhere, because an em dash is an em dash
 * wherever it appears.
 */
export const POST_SHAPED_RULES: readonly string[] = [
  'structure.opening_line',
  'structure.question_density',
  'structure.uniform_rhythm',
  'structure.anaphora',
  'structure.rule_of_three',
];

/** Whether a rule is about the shape of a whole post rather than its language. */
export function isPostShaped(rule: string): boolean {
  return POST_SHAPED_RULES.includes(rule);
}
