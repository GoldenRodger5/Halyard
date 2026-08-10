/**
 * Gate 3 — Visual QC. v2 Part F.3. Runs after render, before the queue.
 *
 * The deterministic half lives here as pure functions over a probe object. The
 * worker produces the probe with Sharp and FFmpeg; keeping the rules pure means
 * they are testable without media files and identical in the worker and the UI.
 *
 * The vision-model half is an injected function, so a failing model call
 * degrades to a warning rather than blocking the pipeline.
 */

export interface MediaProbe {
  kind: 'image' | 'video';
  width: number;
  height: number;
  /** Video only. */
  durationSeconds?: number;
  /** Integrated loudness in LUFS, from FFmpeg `loudnorm`. */
  loudnessLufs?: number;
  /** True peak in dBTP. */
  truePeakDbtp?: number;
  /** Mean luminance per sampled frame, 0..1. */
  frameLuminance?: number[];
  /** Largest caption-vs-audio timing drift, milliseconds. */
  captionDriftMs?: number;
  /**
   * Bounding boxes of rendered text, normalised 0..1 against the canvas.
   * Produced by rendering at 2x and diffing against a text-bounds mask.
   */
  textBoxes?: Array<{ x: number; y: number; width: number; height: number; contrastRatio?: number }>;
}

export interface VisualTarget {
  aspectRatio: string; // '1:1' | '4:5' | '9:16' | '16:9' | '2:3'
  platform: string;
  format: string;
  /** Carousel slides are probed together so the aspect-ratio rule can compare them. */
  carouselSiblings?: MediaProbe[];
}

export interface VisualFinding {
  rule: string;
  severity: 'error' | 'warning';
  message: string;
  detail?: string;
}

export interface VisionScore {
  textLegibility: number;
  composition: number;
  brandColors: number;
  feedFit: number;
  machineArtefacts: number;
  notes?: string;
}

export interface VisualQCResult {
  passed: boolean;
  findings: VisualFinding[];
  visionScore?: VisionScore;
  /** Rendered for the queue: "4.2/5 — slide 4 text is close to the safe area". */
  summary: string;
}

/** Platform video bounds, from v2 Part A. */
export const VIDEO_BOUNDS: Record<string, { minSeconds: number; maxSeconds: number }> = {
  // v2 A.3: Reels require 5 to 90 seconds.
  instagram: { minSeconds: 5, maxSeconds: 90 },
  tiktok: { minSeconds: 3, maxSeconds: 600 },
  // v2 A.6: Shorts are vertical 9:16 under 60 seconds.
  youtube: { minSeconds: 3, maxSeconds: 60 },
  x: { minSeconds: 1, maxSeconds: 140 },
  threads: { minSeconds: 1, maxSeconds: 300 },
  pinterest: { minSeconds: 4, maxSeconds: 900 },
};

/** Vertical formats reserve the top and bottom for platform UI. */
export const SAFE_AREA_FRACTION = 0.12;
/** v2 F.3: −14 LUFS ±1. */
export const TARGET_LUFS = -14;
export const LUFS_TOLERANCE = 1;
/** v2 F.3: no true peak above −1 dBTP. */
export const MAX_TRUE_PEAK_DBTP = -1;
/** v2 F.3: reject if caption drift exceeds 200ms. */
export const MAX_CAPTION_DRIFT_MS = 200;
/** v2 F.3: reject below 3.5 on any vision dimension. */
export const VISION_THRESHOLD = 3.5;

export function parseAspectRatio(ratio: string): number {
  const [w, h] = ratio.split(':').map(Number);
  if (!w || !h) throw new Error(`Unparseable aspect ratio: ${ratio}`);
  return w / h;
}

export function aspectRatioOf(probe: MediaProbe): number {
  return probe.width / probe.height;
}

export function runVisualQC(
  probe: MediaProbe,
  target: VisualTarget,
  visionScore?: VisionScore,
): VisualQCResult {
  const findings: VisualFinding[] = [];

  // ── Dimensions and aspect ratio ──────────────────────────────────────────
  const expected = parseAspectRatio(target.aspectRatio);
  const actual = aspectRatioOf(probe);
  if (Math.abs(actual - expected) / expected > 0.01) {
    findings.push({
      rule: 'visual.aspect_ratio',
      severity: 'error',
      message: `Aspect ratio is ${actual.toFixed(3)}, target ${target.aspectRatio} (${expected.toFixed(3)}).`,
    });
  }
  if (probe.width < 640 || probe.height < 640) {
    findings.push({
      rule: 'visual.resolution',
      severity: 'error',
      message: `Rendered at ${probe.width}×${probe.height}. Too small for a feed.`,
    });
  }

  // ── Carousel consistency ─────────────────────────────────────────────────
  // v2 A.3: "All carousel images are cropped to match the aspect ratio of the
  // first image." Slides 2-6 get silently cropped if this is not enforced.
  if (target.carouselSiblings && target.carouselSiblings.length > 0) {
    const first = target.carouselSiblings[0]!;
    const firstRatio = aspectRatioOf(first);
    const mismatched = target.carouselSiblings
      .map((s, i) => ({ i, ratio: aspectRatioOf(s) }))
      .filter((s) => Math.abs(s.ratio - firstRatio) / firstRatio > 0.005);
    if (mismatched.length > 0) {
      findings.push({
        rule: 'visual.carousel_consistency',
        severity: 'error',
        message: `Slides ${mismatched.map((m) => m.i + 1).join(', ')} do not match slide 1's aspect ratio.`,
        detail: 'Instagram crops every slide to match the first. Build all slides at one ratio.',
      });
    }
  }

  // ── Safe area, text overflow, contrast ───────────────────────────────────
  const isVertical = actual < 1;
  for (const [index, box] of (probe.textBoxes ?? []).entries()) {
    if (box.x < -0.001 || box.y < -0.001 || box.x + box.width > 1.001 || box.y + box.height > 1.001) {
      findings.push({
        rule: 'visual.text_clipped',
        severity: 'error',
        message: `Text block ${index + 1} extends past the canvas edge.`,
      });
      continue;
    }
    if (isVertical) {
      const inTop = box.y < SAFE_AREA_FRACTION;
      const inBottom = box.y + box.height > 1 - SAFE_AREA_FRACTION;
      if (inTop || inBottom) {
        findings.push({
          rule: 'visual.safe_area',
          severity: 'error',
          message: `Text block ${index + 1} sits inside the ${Math.round(
            SAFE_AREA_FRACTION * 100,
          )}% ${inTop ? 'top' : 'bottom'} safe area, where platform UI overlays it.`,
        });
      } else if (box.y < SAFE_AREA_FRACTION + 0.03 || box.y + box.height > 1 - SAFE_AREA_FRACTION - 0.03) {
        findings.push({
          rule: 'visual.safe_area',
          severity: 'warning',
          message: `Text block ${index + 1} is close to the safe area.`,
        });
      }
    }
    if (box.contrastRatio !== undefined && box.contrastRatio < 4.5) {
      findings.push({
        rule: 'visual.contrast',
        severity: 'error',
        message: `Text block ${index + 1} contrast is ${box.contrastRatio.toFixed(2)}:1, below WCAG AA (4.5:1).`,
      });
    }
  }

  // ── Video-only checks ────────────────────────────────────────────────────
  if (probe.kind === 'video') {
    const bounds = VIDEO_BOUNDS[target.platform];
    const duration = probe.durationSeconds ?? 0;
    if (bounds && (duration < bounds.minSeconds || duration > bounds.maxSeconds)) {
      findings.push({
        rule: 'visual.duration',
        severity: 'error',
        message: `${duration.toFixed(1)}s is outside ${target.platform}'s ${bounds.minSeconds}–${bounds.maxSeconds}s bounds.`,
      });
    }

    if (probe.loudnessLufs !== undefined) {
      const delta = Math.abs(probe.loudnessLufs - TARGET_LUFS);
      if (delta > LUFS_TOLERANCE) {
        findings.push({
          rule: 'visual.loudness',
          severity: 'error',
          message: `Integrated loudness ${probe.loudnessLufs.toFixed(1)} LUFS, target ${TARGET_LUFS} ±${LUFS_TOLERANCE}.`,
          detail: 'Inconsistent loudness is a strong amateur tell. Normalise with FFmpeg loudnorm.',
        });
      }
    }

    if (probe.truePeakDbtp !== undefined && probe.truePeakDbtp > MAX_TRUE_PEAK_DBTP) {
      findings.push({
        rule: 'visual.true_peak',
        severity: 'error',
        message: `True peak ${probe.truePeakDbtp.toFixed(1)} dBTP exceeds ${MAX_TRUE_PEAK_DBTP} dBTP.`,
      });
    }

    if (probe.frameLuminance && probe.frameLuminance.length > 0) {
      const black = probe.frameLuminance
        .map((l, i) => ({ l, i }))
        .filter((f) => f.l < 0.05);
      // Leading and trailing frames are allowed to be intentional fades.
      const interior = black.filter((f) => f.i > 0 && f.i < probe.frameLuminance!.length - 1);
      if (interior.length > 0) {
        findings.push({
          rule: 'visual.black_frames',
          severity: 'error',
          message: `${interior.length} interior frame${interior.length === 1 ? '' : 's'} below 5% mean luminance.`,
        });
      }
    }

    if (probe.captionDriftMs !== undefined && probe.captionDriftMs > MAX_CAPTION_DRIFT_MS) {
      findings.push({
        rule: 'visual.caption_drift',
        severity: 'error',
        message: `Captions drift ${probe.captionDriftMs}ms from the transcript, over the ${MAX_CAPTION_DRIFT_MS}ms limit.`,
      });
    }
  }

  // ── Vision-model rubric ──────────────────────────────────────────────────
  let lowest = 5;
  if (visionScore) {
    const dimensions: Array<[string, number]> = [
      ['text legibility', visionScore.textLegibility],
      ['composition', visionScore.composition],
      ['brand colours', visionScore.brandColors],
      ['feed fit', visionScore.feedFit],
      ['machine artefacts', visionScore.machineArtefacts],
    ];
    for (const [label, score] of dimensions) {
      lowest = Math.min(lowest, score);
      if (score < VISION_THRESHOLD) {
        findings.push({
          rule: 'visual.vision_rubric',
          severity: 'error',
          message: `Vision score ${score.toFixed(1)}/5 on ${label}, below ${VISION_THRESHOLD}.`,
          detail: visionScore.notes,
        });
      }
    }
  }

  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warning');

  let summary: string;
  if (visionScore) {
    const average =
      (visionScore.textLegibility +
        visionScore.composition +
        visionScore.brandColors +
        visionScore.feedFit +
        visionScore.machineArtefacts) /
      5;
    summary = `${average.toFixed(1)}/5`;
    if (warnings.length > 0) summary += ` — ${warnings[0]!.message}`;
    if (errors.length > 0) summary = `failed — ${errors[0]!.message}`;
  } else {
    summary = errors.length === 0 ? `passed (${warnings.length} warnings)` : `failed — ${errors[0]!.message}`;
  }

  return { passed: errors.length === 0, findings, visionScore, summary };
}

/**
 * The rubric sent to the vision model, verbatim from v2 F.3. Kept as an exported
 * constant so the prompt is versioned with the code rather than buried in a
 * worker handler.
 */
export const VISION_RUBRIC = `Score 1-5 on each dimension and flag any failure:
- textLegibility: Is any text cut off, overlapping, or unreadable?
- composition: Is the composition balanced, or does it look like a default template?
- brandColors: Do the brand colors appear correctly?
- feedFit: Would this look out of place in a well-produced food account feed?
- machineArtefacts: Does anything look obviously machine-generated in a bad way?

Reply with JSON only:
{"textLegibility":n,"composition":n,"brandColors":n,"feedFit":n,"machineArtefacts":n,"notes":"one sentence"}`;
