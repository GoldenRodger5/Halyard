/**
 * Does the artifact show what the post claims? Phase 2 of `AGENTIC_PLAN.md`.
 *
 * Every other gate checks one thing in isolation: the copy is not slop, the
 * claims trace to an artifact, the frames have adequate contrast, the audio
 * matches its script. All of them pass on a video whose voiceover describes a
 * feature the footage never shows, whose caption contradicts the on-screen text,
 * or whose first second is a static logo card. That coherence is what a person
 * checks in the approval queue, and it is the only check that was still a human's
 * job alone.
 *
 * ## Why this is not an "is it good?" model call
 *
 * The obvious design is to hand a rendered video to a model and ask it to score
 * quality. The evidence says not to:
 *
 *  - Frontier models assign **75–84% win rates to their own model family** in
 *    pairwise evaluation. A judge that wrote the thing is not a judge.
 *  - Self-reflection gains are contested; later work attributes them to
 *    exogenous factors rather than the reflection.
 *  - Models cannot reliably find their own errors **without a ground-truth
 *    oracle**.
 *
 * The codebase already contains a `visionScore` rubric of exactly that shape —
 * one-to-five on composition, feed fit, machine artefacts — and nothing has ever
 * populated it. That is fortunate, because scoring is the biased half.
 *
 * So this module never scores anything. A model is asked only to **describe what
 * it observes**, with the intent deliberately withheld, and the comparison
 * against intent happens **here, in code**. Perception is what models are
 * reliably good at; judgement is what they are biased at. The oracle problem
 * does not arise because the intent is already known — it is sitting in
 * `content_items`.
 *
 * ## Why these particular checks
 *
 * They are the observable proxies for what actually drives short-form
 * performance, rather than for what looks sophisticated:
 *
 *  - 71% of viewers decide in the first few seconds; 63% of the highest
 *    click-through videos hook within three.
 *  - The hook has to be **multimodal** — a visual pattern interrupt, a
 *    benefit-driven text overlay, and a spoken keyword-rich opening.
 *  - **Silent-first design wins**, because most first views are muted.
 *
 * Each of those is checkable against a description without anybody's taste.
 */

/** What a describer reports about one sampled frame. Perception, never opinion. */
export interface FrameObservation {
  /** Where in the video this frame came from. */
  atSeconds: number;
  /** What is visibly happening, in the describer's own words. */
  describes: string;
  /** Text burned into the frame, read literally. */
  visibleText: string[];
}

/** What a describer reports about the audio track. */
export interface AudioObservation {
  transcript: string;
  /** The first sentence spoken, which is the only one most viewers hear. */
  openingSentence: string;
}

/**
 * What the post was *supposed* to be. Known before rendering, so it is the
 * ground truth this gate compares against rather than a second opinion.
 */
export interface CoherenceIntent {
  /** The caption or post body. */
  body: string;
  /** The voiceover script, where there is one. */
  script?: string | null;
  /**
   * The handful of terms this post is actually about.
   *
   * Supplied by the caller from structured data — the idea, the artifact, the
   * category — rather than extracted from prose here. A gate that guesses its
   * own expectations is checking itself.
   */
  keyTerms: string[];
  format: string;
  durationSeconds?: number;
  /**
   * The brand's own name and wordmark, which do not count as a hook.
   *
   * Found by running this against a real render: at 0.0s the only text on
   * screen was "RECIPEFIX", and the silent-first check counted it as an
   * overlay and said nothing. A logo tells a muted viewer the brand and not
   * the reason to stay, so it has to be excluded or the check passes exactly
   * the openings it exists to catch.
   */
  brandTerms?: string[];
}

export interface CoherenceInput {
  intent: CoherenceIntent;
  frames: FrameObservation[];
  audio?: AudioObservation | null;
}

export interface CoherenceFinding {
  rule: string;
  severity: 'warning' | 'error';
  message: string;
  fix: string;
}

export interface CoherenceResult {
  passed: boolean;
  findings: CoherenceFinding[];
  summary: string;
  /** Frames actually observed. Zero means this gate did not run. */
  examined: number;
  /** Which key terms were visible somewhere, for the queue detail view. */
  shownTerms: string[];
  missingTerms: string[];
}

/** Formats where a muted first view is the norm rather than the exception. */
const SHORT_FORM = new Set(['video', 'reel', 'short', 'pin']);

/** Seconds within which the hook has to have happened. */
export const HOOK_WINDOW_SECONDS = 3;

/**
 * The most words that can usefully sit on screen at once.
 *
 * A viewer reads about four words a second and is listening at the same time.
 * Twenty-five is already generous for a frame that is on screen for a beat.
 */
export const MAX_WORDS_ON_SCREEN = 25;

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with',
  'is', 'it', 'this', 'that', 'your', 'you', 'we', 'our', 'be', 'are', 'was',
]);

function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function contentWords(term: string): string[] {
  return normalise(term)
    .split(/[\s-]+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

/**
 * Is this term present in that text?
 *
 * Every content word of the term must appear, on a word boundary. "gluten-free
 * bread" needs both "gluten"/"glutenfree" and "bread"; matching on either alone
 * would call any loaf a match and make the gate useless. Hyphenated terms also
 * match their unhyphenated form, because a description writes "gluten free" and
 * an overlay writes "GLUTEN-FREE".
 */
export function termAppearsIn(term: string, haystack: string): boolean {
  const hay = normalise(haystack);
  const words = contentWords(term);
  if (words.length === 0) return false;

  const joined = normalise(term).replace(/[\s-]+/g, '');
  if (joined.length > 4 && hay.replace(/[\s-]+/g, '').includes(joined)) return true;

  return words.every((word) => new RegExp(`(^|[^a-z0-9])${word}([^a-z0-9]|$)`).test(hay));
}

/** Everything a viewer could see, as one searchable string. */
function visualHaystack(frames: FrameObservation[]): string {
  return frames.map((f) => `${f.describes} ${f.visibleText.join(' ')}`).join(' ');
}

/**
 * Compare what was observed against what was intended.
 *
 * Pure: no network, no model, no clock. Every finding is a deterministic
 * consequence of the two inputs, which is what makes this testable and what
 * keeps a model's preferences out of the verdict.
 */
export function runCoherenceQC(input: CoherenceInput): CoherenceResult {
  const findings: CoherenceFinding[] = [];
  const frames = [...input.frames].sort((a, b) => a.atSeconds - b.atSeconds);

  /**
   * Nothing observed is not coherent. It is unmeasured.
   *
   * The same rule every other gate follows: a gate whose input was empty
   * reports `skipped`, because examining nothing and finding nothing wrong
   * reads exactly like examining something and finding it good.
   */
  if (frames.length === 0) {
    return {
      passed: false,
      findings: [
        {
          rule: 'coherence.not_measured',
          severity: 'error',
          message: 'No frames were observed, so nothing was compared against the post.',
          fix: 'Check that frame sampling ran. An unmeasured render must not read as a coherent one.',
        },
      ],
      summary: 'not measured — no frames were observed',
      examined: 0,
      shownTerms: [],
      missingTerms: input.intent.keyTerms,
    };
  }

  const haystack = visualHaystack(frames);
  const shownTerms = input.intent.keyTerms.filter((term) => termAppearsIn(term, haystack));
  const missingTerms = input.intent.keyTerms.filter((term) => !shownTerms.includes(term));

  // ── 1. Does the footage show what the post is about? ──────────────────────
  if (input.intent.keyTerms.length > 0 && shownTerms.length === 0) {
    findings.push({
      rule: 'coherence.nothing_claimed_is_shown',
      severity: 'error',
      message:
        `The post is about ${input.intent.keyTerms.join(', ')}, and none of it appears in any ` +
        `frame. What was observed instead: ${frames[0]!.describes}`,
      fix: 'Either the wrong asset was attached or the copy drifted from the artifact. They have to be about the same thing.',
    });
  } else if (missingTerms.length > 0 && missingTerms.length < input.intent.keyTerms.length) {
    findings.push({
      rule: 'coherence.partly_shown',
      severity: 'warning',
      message: `Visible: ${shownTerms.join(', ')}. Never shown: ${missingTerms.join(', ')}.`,
      fix: 'A term the copy leans on and the footage never shows is a promise the video does not keep.',
    });
  }

  // ── 2. The hook window ────────────────────────────────────────────────────
  const hookFrames = frames.filter((f) => f.atSeconds <= HOOK_WINDOW_SECONDS);
  const shortForm = SHORT_FORM.has(input.intent.format);

  if (hookFrames.length > 0) {
    const brand = (input.intent.brandTerms ?? []).map(normalise).filter(Boolean);
    const isBrandOnly = (line: string): boolean => {
      const cleaned = normalise(line);
      if (!cleaned) return true;
      return brand.some((b) => b && cleaned.replace(/\s+/g, '') === b.replace(/\s+/g, ''));
    };

    const hookLines = hookFrames.flatMap((f) => f.visibleText).filter((t) => t.trim());
    const substantiveLines = hookLines.filter((line) => !isBrandOnly(line));
    const hookText = substantiveLines.join(' ').trim();

    if (hookLines.length > 0 && substantiveLines.length === 0) {
      findings.push({
        rule: 'coherence.brandmark_only_open',
        severity: shortForm ? 'error' : 'warning',
        message: `The only text in the first ${HOOK_WINDOW_SECONDS} seconds is the brand name.`,
        fix: 'A logo tells a muted viewer who you are, not why to stay. Lead with the claim and let the mark come later.',
      });
    }

    // Silent-first: most first views are muted, so text in the opening is not
    // decoration, it is the only channel that reaches the viewer. A brand-only
    // opening is reported by its own rule above rather than twice here.
    if (!hookText && hookLines.length === 0) {
      findings.push({
        rule: 'coherence.no_text_in_hook',
        severity: shortForm ? 'error' : 'warning',
        message: `No text is burned into the first ${HOOK_WINDOW_SECONDS} seconds.`,
        fix: 'Most first views are muted. Without an overlay the opening reaches nobody who has not turned sound on.',
      });
    }

    // A pattern interrupt in the first second is what stops the scroll. Two
    // opening frames that describe the same thing are a static open.
    if (shortForm && hookFrames.length >= 2) {
      const first = normalise(hookFrames[0]!.describes);
      const second = normalise(hookFrames[1]!.describes);
      if (first === second) {
        findings.push({
          rule: 'coherence.static_open',
          severity: 'warning',
          message: `Nothing visibly changes between ${hookFrames[0]!.atSeconds}s and ${hookFrames[1]!.atSeconds}s.`,
          fix: 'A hard cut, push-in or reveal in the first second is what stops a scroll. A held card does not.',
        });
      }
    }

    // Could a muted viewer tell what this is about?
    const hookHaystack = visualHaystack(hookFrames);
    const hookShows = input.intent.keyTerms.some((term) => termAppearsIn(term, hookHaystack));
    if (shortForm && input.intent.keyTerms.length > 0 && !hookShows && !hookText) {
      findings.push({
        rule: 'coherence.silent_open_says_nothing',
        severity: 'error',
        message: `Muted, the first ${HOOK_WINDOW_SECONDS} seconds convey nothing about ${input.intent.keyTerms[0]}.`,
        fix: 'Put the subject on screen, in text or in vision, before the viewer decides.',
      });
    }
  }

  // ── 3. The spoken opening ─────────────────────────────────────────────────
  if (input.audio?.openingSentence) {
    const carries = input.intent.keyTerms.some((term) =>
      termAppearsIn(term, input.audio!.openingSentence),
    );
    if (input.intent.keyTerms.length > 0 && !carries) {
      findings.push({
        rule: 'coherence.opening_line_buries_it',
        severity: 'warning',
        message: `The first thing said is "${input.audio.openingSentence.slice(0, 80)}", which names none of ${input.intent.keyTerms.join(', ')}.`,
        fix: 'The opening line is the only one most viewers hear. Lead with the subject.',
      });
    }
  }

  // ── 4. Does the script describe something never shown? ────────────────────
  if (input.intent.script) {
    const unshown = input.intent.keyTerms.filter(
      (term) => termAppearsIn(term, input.intent.script!) && !termAppearsIn(term, haystack),
    );
    if (unshown.length > 0) {
      findings.push({
        rule: 'coherence.narration_shows_nothing',
        severity: 'error',
        message: `The voiceover talks about ${unshown.join(', ')} and no frame shows it.`,
        fix: 'Narration describing something off screen is the most common way an automated edit goes wrong.',
      });
    }
  }

  // ── 5. Visual slop: the tells of an automated edit ────────────────────────
  //
  // Distinct from coherence. These do not ask whether the video is *about* the
  // right thing — they ask whether it looks like something a person made. A
  // video can be perfectly on-topic and still be a static card with a wall of
  // text on it, which is the single most recognisable signature of generated
  // content and the thing an audience scrolls past without registering why.
  //
  // Deterministic, over what the describer reported. No judgement call is
  // delegated to a model: the describer says what it saw, and these rules
  // decide what that means.
  if (frames.length >= 3) {
    const descriptions = frames.map((f) => normalise(f.describes));
    if (new Set(descriptions).size === 1) {
      findings.push({
        rule: 'visual_slop.entirely_static',
        severity: 'error',
        message: `All ${frames.length} sampled frames are the same shot: ${frames[0]!.describes}`,
        fix: 'This is a still image with audio over it. The hook check only looks at the first second, so a video that never moves at all passes it.',
      });
    }

    const textPerFrame = frames.map((f) => f.visibleText.join(' ').trim());
    const nonEmpty = textPerFrame.filter((t) => t.length > 0);
    if (nonEmpty.length >= 3 && new Set(nonEmpty).size === 1) {
      findings.push({
        rule: 'visual_slop.text_never_changes',
        severity: 'warning',
        message: 'The same on-screen text is held for the whole video.',
        fix: 'Nothing is revealed, so there is no reason to keep watching. Break the text across beats.',
      });
    }
  }

  /**
   * A frame nobody can read in the time it is on screen.
   *
   * Short-form frames last a beat. Reading speed is roughly four words a
   * second at best, and a viewer is also listening — thirty words on one card
   * is not a card, it is a paragraph nobody finishes.
   */
  for (const frame of frames) {
    const words = frame.visibleText.join(' ').trim().split(/\s+/).filter(Boolean).length;
    if (words > MAX_WORDS_ON_SCREEN) {
      findings.push({
        rule: 'visual_slop.text_wall',
        severity: 'warning',
        message: `${words} words on screen at ${frame.atSeconds}s.`,
        fix: `Over ${MAX_WORDS_ON_SCREEN} words is a paragraph, not an overlay. Cut it to the line that matters.`,
      });
      break; // One finding is the point; ten identical ones is noise.
    }
  }

  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warning');

  const summary =
    errors.length > 0
      ? `${errors.length} coherence failure${errors.length === 1 ? '' : 's'} across ${frames.length} frames`
      : warnings.length > 0
        ? `coherent, ${warnings.length} note${warnings.length === 1 ? '' : 's'} across ${frames.length} frames`
        : `coherent across ${frames.length} frames, showing ${shownTerms.join(', ') || 'no declared terms'}`;

  return {
    passed: errors.length === 0,
    findings,
    summary,
    examined: frames.length,
    shownTerms,
    missingTerms,
  };
}
