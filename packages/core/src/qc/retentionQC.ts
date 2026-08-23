/**
 * Gate 3b — retention engineering. Milestone 27, Part C.
 *
 * The research findings become constraints rather than suggestions, because a
 * suggestion in a prompt is followed most of the time and a QC rule is followed
 * every time.
 *
 *   · The first 3 seconds drive roughly 80% of completion variance. 30 to 50% of
 *     viewers leave in that window; another 15 to 25% leave by 10 seconds if the
 *     hook does not pay off.
 *   · One pattern interrupt every 10 to 15 seconds resets the boredom clock.
 *   · Loop endings earn replays, and replays are the strongest watch signal
 *     available.
 *
 * Everything here is a pure function over a probe, so it is testable without
 * media and identical in the worker and the UI.
 */

/** v2 F.3 already covers dimensions and loudness; this covers attention. */
export interface RetentionProbe {
  fps: number;
  durationSeconds: number;
  /** Mean luminance per sampled frame, in order, 0..1. */
  frameLuminance: number[];
  /**
   * Mean absolute difference between consecutive sampled frames, 0..1. A run of
   * near-zero values is a static stretch.
   */
  frameDelta?: number[];
  /** Normalised text-bounds coverage of frame 1, 0..1. */
  firstFrameTextCoverage?: number;
  /** Words of on-screen text in frame 1. */
  firstFrameWordCount?: number;
  /** Contrast ratio of the frame-1 text against its background. */
  firstFrameContrast?: number;
  /** Similarity of the last frame to the first, 0..1. 1 is identical. */
  loopSimilarity?: number;
}

export interface RetentionTarget {
  platform: string;
  /** TikTok and Reels reward replays; a loop ending is expected there. */
  loopReady?: boolean;
  /** Seconds. 15 is the ceiling from the research. */
  maxSecondsBetweenInterrupts?: number;
}

export interface RetentionFinding {
  rule: string;
  severity: 'error' | 'warning';
  message: string;
  detail?: string;
}

export interface RetentionQCResult {
  passed: boolean;
  findings: RetentionFinding[];
  summary: string;
  /** Seconds until the first substantive content. Zero is the goal. */
  timeToContentSeconds: number;
  /** Longest static stretch, in seconds. */
  longestStaticStretchSeconds: number;
  /**
   * Rules whose inputs were absent, so they never ran.
   *
   * `passed` means "nothing that ran found an error" — it has never meant "every
   * rule passed", and this is what keeps the two apart. `review_media` measures
   * luminance and duration from the rendered file, which is enough for the
   * opening and pattern-interrupt rules; it has no OCR of frame 1 and no
   * first-to-last similarity, so the thumbnail and loop rules are named here
   * instead of quietly contributing a pass.
   *
   * The same rule `runAllGates` learned the hard way: a skipped check is not a
   * passed check.
   */
  unmeasured: string[];
}

/** Roughly 3 seconds at 30fps. Nothing may precede content inside this window. */
export const OPENING_FRAMES = 90;
/** One interrupt every 10 to 15 seconds. 15 is the ceiling. */
export const MAX_SECONDS_BETWEEN_INTERRUPTS = 15;
/** Below this, consecutive frames are the same picture. */
export const STATIC_DELTA_THRESHOLD = 0.01;
/**
 * Luminance below this is a black frame. Gate 3 owns black-frame detection; this
 * is here so a bumper that is a black card is also caught as "not content".
 */
export const EMPTY_FRAME_LUMINANCE_RANGE = 0.02;
/** Frame 1 text: four to seven words. */
export const FIRST_FRAME_WORDS = { min: 4, max: 7 };
/** Loop endings: how similar the last frame must be to the first. */
export const LOOP_SIMILARITY_THRESHOLD = 0.6;

export function runRetentionQC(
  probe: RetentionProbe,
  target: RetentionTarget,
): RetentionQCResult {
  const findings: RetentionFinding[] = [];
  const sampleSeconds =
    probe.frameLuminance.length > 1 ? probe.durationSeconds / (probe.frameLuminance.length - 1) : probe.durationSeconds;

  // ── The 3-second rule: open on content ───────────────────────────────────
  //
  // No logo bumper, no intro card, no title slide. A composition whose opening
  // window contains nothing substantive has spent the only window that matters.
  const timeToContent = firstSubstantiveSecond(probe, sampleSeconds);
  const openingSeconds = OPENING_FRAMES / (probe.fps || 30);

  /**
   * Whether the sampling can resolve the window this rule is about.
   *
   * `review_media` samples twelve frames per sixty seconds, so a 32-second
   * render yields one sample every 6.4s. A rule about the first *three* seconds
   * cannot be answered from that: the earliest it can distinguish is one whole
   * sample interval, and every video longer than about fifteen seconds would be
   * reported as opening late on the sampling artefact alone.
   *
   * Reported as unmeasured rather than answered badly. A gate that fails
   * everything is as useless as one that passes everything, and it is worse,
   * because the first gets switched off.
   *
   * **Do not close this by sampling harder.** It was measured (`DECISIONS.md`
   * §73): all four of Halyard's fixture renders are flat in mean luminance
   * across their opening, largest delta 0.0039 against a threshold of 0.01. The
   * rule uses mean-frame luminance as its motion proxy, and Halyard's style is a
   * light card with a small region of changing text — swapping every word barely
   * moves the frame mean. Denser sampling would fail every render on a signal
   * that cannot see this content. The deficiency is the signal, not the rate.
   */
  const canResolveOpening = sampleSeconds <= openingSeconds;

  if (canResolveOpening && timeToContent > openingSeconds) {
    findings.push({
      rule: 'retention.no_content_in_opening',
      severity: 'error',
      message: `Nothing substantive appears until ${timeToContent.toFixed(1)}s.`,
      detail:
        'The first 3 seconds drive around 80% of completion variance. Open on content: no logo bumper, no intro card, no title slide.',
    });
  }

  // ── Frame 1 is a thumbnail ───────────────────────────────────────────────
  if (probe.firstFrameWordCount !== undefined) {
    if (probe.firstFrameWordCount === 0) {
      findings.push({
        rule: 'retention.first_frame_empty',
        severity: 'error',
        message: 'Frame 1 carries no text. It is the thumbnail, and an empty thumbnail is a wasted impression.',
      });
    } else if (
      probe.firstFrameWordCount < FIRST_FRAME_WORDS.min ||
      probe.firstFrameWordCount > FIRST_FRAME_WORDS.max
    ) {
      findings.push({
        rule: 'retention.first_frame_words',
        severity: probe.firstFrameWordCount > FIRST_FRAME_WORDS.max + 4 ? 'error' : 'warning',
        message: `Frame 1 has ${probe.firstFrameWordCount} words. Four to seven reads at a glance.`,
      });
    }
  }

  if (probe.firstFrameContrast !== undefined && probe.firstFrameContrast < 4.5) {
    findings.push({
      rule: 'retention.first_frame_contrast',
      severity: 'error',
      message: `Frame 1 text contrast is ${probe.firstFrameContrast.toFixed(1)}:1, below WCAG AA. It is the thumbnail; it has to survive a small preview.`,
    });
  }

  // A merely slow open is worth saying, but only after the specific findings.
  if (canResolveOpening && timeToContent > 0.5 && timeToContent <= openingSeconds) {
    findings.push({
      rule: 'retention.slow_open',
      severity: 'warning',
      message: `First content at ${timeToContent.toFixed(1)}s. Earlier is better.`,
    });
  }

  // ── Pattern interrupts ───────────────────────────────────────────────────
  const maxGap = target.maxSecondsBetweenInterrupts ?? MAX_SECONDS_BETWEEN_INTERRUPTS;
  const longestStatic = longestStaticStretch(probe, sampleSeconds);

  if (probe.durationSeconds > 20 && longestStatic > maxGap) {
    findings.push({
      rule: 'retention.no_pattern_interrupt',
      severity: 'error',
      message: `${longestStatic.toFixed(1)}s with no visual state change. The ceiling is ${maxGap}s.`,
      detail:
        'One pattern interrupt every 10 to 15 seconds resets the viewer\'s boredom clock. A static stretch longer than that is where people leave.',
    });
  }

  // ── Loop endings ─────────────────────────────────────────────────────────
  if (target.loopReady && probe.loopSimilarity !== undefined) {
    if (probe.loopSimilarity < LOOP_SIMILARITY_THRESHOLD) {
      findings.push({
        rule: 'retention.not_loop_ready',
        severity: 'warning',
        message: `The last frame is ${(probe.loopSimilarity * 100).toFixed(0)}% similar to the first; a loop reads at ${(LOOP_SIMILARITY_THRESHOLD * 100).toFixed(0)}%+.`,
        detail:
          'Replays are the strongest watch signal available. An ending that reads as a continuation of the opening earns them.',
      });
    }
  }

  /**
   * What could not be looked at, named rather than omitted.
   *
   * Each entry is the rule that would have run had its input been present, so a
   * caller can say *which* checks are missing rather than only that some are.
   */
  const unmeasured: string[] = [];
  if (!canResolveOpening) unmeasured.push('retention.no_content_in_opening');
  if (probe.firstFrameWordCount === undefined) unmeasured.push('retention.first_frame_words');
  if (probe.firstFrameContrast === undefined) unmeasured.push('retention.first_frame_contrast');
  if (target.loopReady && probe.loopSimilarity === undefined) {
    unmeasured.push('retention.not_loop_ready');
  }

  const errors = findings.filter((f) => f.severity === 'error');

  return {
    passed: errors.length === 0,
    findings,
    unmeasured,
    timeToContentSeconds: Number(timeToContent.toFixed(2)),
    longestStaticStretchSeconds: Number(longestStatic.toFixed(2)),
    /**
     * The summary never reports a clean pass while a rule went unrun.
     *
     * "opens at 0.0s, longest static 2.1s" beside two checks that never
     * happened reads as a full sweep, and an operator has no way to tell. The
     * count is small and it is the difference between measured and assumed.
     */
    summary:
      errors.length > 0
        ? `failed — ${errors[0]!.message}`
        : `${
            canResolveOpening
              ? `opens at ${timeToContent.toFixed(1)}s`
              : `opening not resolvable at ${sampleSeconds.toFixed(1)}s per sample`
          }, longest static ${longestStatic.toFixed(1)}s` +
          (unmeasured.length > 0
            ? ` — ${unmeasured.length} check${unmeasured.length === 1 ? '' : 's'} not measured (${unmeasured
                .map((r) => r.replace('retention.', ''))
                .join(', ')})`
            : ''),
  };
}

/**
 * When the first substantive frame appears.
 *
 * A logo bumper, an intro card and a title slide share one measurable property:
 * nothing moves. So "time to content" is the length of the static run the video
 * opens with — if the picture is already changing at frame 0, the video opened
 * on content, which is the goal.
 */
function firstSubstantiveSecond(probe: RetentionProbe, sampleSeconds: number): number {
  if (probe.frameLuminance.length === 0) return 0;

  const deltas = probe.frameDelta ?? deriveDeltas(probe.frameLuminance);

  let staticSamples = 0;
  for (const delta of deltas) {
    if (delta < STATIC_DELTA_THRESHOLD) staticSamples++;
    else break;
  }

  // Every sampled frame is identical: one static card for the whole runtime.
  if (staticSamples === deltas.length && deltas.length > 0) return probe.durationSeconds;

  return staticSamples * sampleSeconds;
}

function longestStaticStretch(probe: RetentionProbe, sampleSeconds: number): number {
  const deltas = probe.frameDelta ?? deriveDeltas(probe.frameLuminance);
  if (deltas.length === 0) return 0;

  let longest = 0;
  let current = 0;
  for (const delta of deltas) {
    if (delta < STATIC_DELTA_THRESHOLD) {
      current += sampleSeconds;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

function deriveDeltas(luminance: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < luminance.length; i++) {
    out.push(Math.abs(luminance[i]! - luminance[i - 1]!));
  }
  return out;
}

// ── Script-level rules ─────────────────────────────────────────────────────

/**
 * Part C — hard bans for video scripts, and Part H — tells specific to spoken
 * copy. Written and spoken slop differ: "so there you have it" never appears in
 * a caption and appears in every second AI voiceover.
 */
export const SPOKEN_ANTI_PATTERNS: Array<{ rule: string; pattern: RegExp; message: string }> = [
  {
    rule: 'spoken.greeting',
    pattern: /\b(hey guys|hi guys|hey everyone|welcome back|what'?s up)\b/i,
    message: 'Greeting. The three-second window is not for hello.',
  },
  {
    rule: 'spoken.in_this_video',
    pattern: /\b(in this video|in today'?s video|let'?s talk about|i'?m going to show you)\b/i,
    message: 'Announcing the video inside the video.',
  },
  {
    rule: 'spoken.sign_off',
    pattern: /\b(so there you have it|that'?s it for today|thanks for watching|see you next time)\b/i,
    message: 'Sign-off. The end of a short video is a loop point, not a goodbye.',
  },
  {
    rule: 'spoken.make_sure_to',
    pattern: /\b(make sure to|be sure to|don'?t forget to)\b/i,
    message: 'Instructional filler.',
  },
  {
    rule: 'spoken.but_first',
    pattern: /\bbut first\b/i,
    message: '"But first" delays the payoff, which is where viewers leave.',
  },
  {
    rule: 'spoken.generic_promise',
    pattern: /\b(this will change how you|you won'?t believe|the results will shock)\b/i,
    message: 'Generic promise.',
  },
];

export interface SpokenLintResult {
  passed: boolean;
  violations: Array<{ rule: string; message: string; excerpt: string }>;
}

export function lintSpokenScript(
  script: string,
  options: { hook?: string } = {},
): SpokenLintResult {
  const violations: SpokenLintResult['violations'] = [];

  for (const rule of SPOKEN_ANTI_PATTERNS) {
    const match = rule.pattern.exec(script);
    if (match) {
      violations.push({ rule: rule.rule, message: rule.message, excerpt: match[0] });
    }
  }

  // The spoken line must not restate the on-screen hook. Two channels saying one
  // thing wastes one of them.
  if (options.hook) {
    const firstSentence = script.split(/[.!?]/)[0]?.trim() ?? '';
    if (firstSentence && normalise(firstSentence) === normalise(options.hook)) {
      violations.push({
        rule: 'spoken.restates_hook',
        message: 'The first spoken line restates the on-screen hook.',
        excerpt: firstSentence.slice(0, 60),
      });
    }
  }

  return { passed: violations.length === 0, violations };
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
}
