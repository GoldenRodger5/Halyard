/**
 * §317. The checks that would have caught tonight.
 *
 * Every defect found on 2026-08-29 was found by a person rendering a file and
 * looking at it, or playing it and hearing nothing. None of them tripped a
 * gate, and none of them could have: the gates check aspect ratio, resolution,
 * safe area and contrast — all properties of a *frame* — and every one of these
 * was a property of the **piece**.
 *
 *   - A quiz whose video ended on "Question 3 of 4" because the composition was
 *     sized for three questions and given four.
 *   - Four rendered files carrying a **silent** audio track at -91 dB, so a
 *     player showed an audio track and played nothing.
 *   - A narrator still speaking question one's answer 1.9 seconds into
 *     question two.
 *
 * All three are arithmetic. None of them needs a model, and a person should
 * never have been the thing that caught them — which is the whole complaint,
 * and it is a fair one.
 *
 * `runVisualQC` is left alone: it is about frames and this is about pieces, and
 * merging them would make one function that answers two questions.
 */

export type MediaIntegritySeverity = 'error' | 'warning';

export interface MediaIntegrityFinding {
  rule: string;
  severity: MediaIntegritySeverity;
  message: string;
  /** What to do about it, where that is not obvious from the message. */
  detail?: string;
}

export interface MediaIntegrityInput {
  /** Runtime of the rendered file, in seconds. */
  durationSeconds: number;
  /**
   * Mean volume of the muxed audio, in dBFS.
   *
   * Null when the file has no audio stream at all, which is legitimate — a
   * caption-led cut is a normal short-form style. What is not legitimate is a
   * *silent stream*, which looks like audio to every player and to every
   * check that asks "does this have sound".
   */
  meanVolumeDb: number | null;
  /** Whether this piece has narration that was supposed to be in the mix. */
  hasNarration: boolean;
  /**
   * How long the composition needs to show everything it was given, in seconds.
   *
   * Supplied by the composition rather than assumed here, because only it knows
   * how long its own content takes.
   */
  requiredSeconds?: number;
  /**
   * §320. Whether the index sits before the media data.
   *
   * An MP4 with `moov` after `mdat` requires a player to read the whole file
   * before it knows there is an audio track. ffmpeg does; a normal player
   * streaming the file may present it as silent — which is exactly what
   * happened: the mix measured -19 dB, played correctly in ffmpeg, and an
   * operator heard nothing. Extracting the same audio to an MP3 played fine,
   * which is what identified the container rather than the audio.
   *
   * Invisible to every level measurement, so it has to be asked separately.
   * Null when it could not be determined.
   */
  moovBeforeMdat?: boolean | null;
  /** The timed read, with each line's measured length. */
  narration?: Array<{ atSeconds: number; durationSeconds: number; text: string }>;
}

/**
 * Below this, an audio track is silence with a codec on it.
 *
 * Digital silence measures around -91 dBFS. A real mix normalised to -14 LUFS
 * measures about -19 dB mean, so the gap is enormous and the threshold does not
 * need to be delicate — anything under -60 is not audio anybody will hear.
 */
export const SILENCE_FLOOR_DB = -60;

export interface MediaIntegrityResult {
  passed: boolean;
  findings: MediaIntegrityFinding[];
}

export function runMediaIntegrity(input: MediaIntegrityInput): MediaIntegrityResult {
  const findings: MediaIntegrityFinding[] = [];

  /* ── A narrated piece that makes no sound ──────────────────────────────── */
  if (input.hasNarration) {
    if (input.meanVolumeDb === null) {
      findings.push({
        rule: 'media.no_audio_stream',
        severity: 'error',
        message: 'This piece has narration and the rendered file has no audio stream.',
        detail: 'The voiceover was written and synthesised and never reached the file. Check the mux step.',
      });
    } else if (input.meanVolumeDb < SILENCE_FLOOR_DB) {
      findings.push({
        rule: 'media.silent_audio',
        severity: 'error',
        message: `The audio track measures ${input.meanVolumeDb.toFixed(1)} dB, which is silence.`,
        detail:
          'A silent stream is worse than no stream: every player shows an audio track and plays nothing, ' +
          'so it looks like the viewer’s problem rather than ours.',
      });
    }
  }

  /* ── An index a player cannot reach until it has read everything ───────── */
  if (input.moovBeforeMdat === false) {
    findings.push({
      rule: 'media.no_faststart',
      severity: 'error',
      message: 'The MP4 index sits after the media data, so a player must read the whole file to find the audio.',
      detail:
        'Mux with `-movflags +faststart`. Every platform Halyard publishes to streams, and a streaming ' +
        'player can present this as a silent video while the audio measures perfectly.',
    });
  }

  /* ── A video that ends before its content does ─────────────────────────── */
  if (input.requiredSeconds !== undefined) {
    /*
     * Half a second of tolerance for frame rounding. Anything beyond that is a
     * composition sized for different content than it was given — which is
     * exactly the quiz that ended on "Question 3 of 4", mid-question, on screen.
     */
    if (input.durationSeconds < input.requiredSeconds - 0.5) {
      findings.push({
        rule: 'media.truncated',
        severity: 'error',
        message: `The file is ${input.durationSeconds.toFixed(1)}s and its content needs ${input.requiredSeconds.toFixed(1)}s.`,
        detail:
          'The last beat is cut off mid-way. A composition whose duration is a constant will do this ' +
          'the first time it is given content of a different size.',
      });
    }
    /*
     * The other direction is a warning, not an error: a piece that runs long
     * ends on a held frame, which is untidy rather than broken.
     */
    if (input.durationSeconds > input.requiredSeconds + 2) {
      findings.push({
        rule: 'media.dead_tail',
        severity: 'warning',
        message: `The file runs ${(input.durationSeconds - input.requiredSeconds).toFixed(1)}s past its last beat.`,
      });
    }
  }

  /* ── Two voices at once ────────────────────────────────────────────────── */
  const lines = [...(input.narration ?? [])].sort((a, b) => a.atSeconds - b.atSeconds);
  for (let i = 0; i < lines.length - 1; i += 1) {
    const line = lines[i]!;
    const next = lines[i + 1]!;
    const overlap = line.atSeconds + line.durationSeconds - next.atSeconds;
    /*
     * A tenth of a second is a breath, not an overlap. Beyond that two lines
     * are being spoken together over a card that has already changed — which is
     * inaudible in a waveform and invisible in a frame, so nothing else finds
     * it.
     */
    if (overlap > 0.1) {
      findings.push({
        rule: 'media.narration_overrun',
        severity: 'error',
        message: `"${line.text.slice(0, 48)}" runs ${overlap.toFixed(2)}s into the line after it.`,
        detail: 'Shorten the line, or the beat it sits on is too short for what it says.',
      });
    }
  }

  return { passed: findings.every((f) => f.severity !== 'error'), findings };
}
