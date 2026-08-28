/**
 * Voiceover. The second job kind that was declared, given a timeout policy, and
 * never written.
 *
 * `tts` has been in `JOB_KINDS` and `JOB_POLICY` since the beginning. The
 * schema has carried `content_items.vo_script`, `content_items.vo_asset_id`,
 * `content_items.audio_mode` and an `assets.kind = 'audio'` since then too, and
 * `voice_lexicon` exists so that a mispronunciation caught by the gate can be
 * corrected on the next synthesis. Every part was designed. Nothing was joined
 * up, so every video the system can produce is silent, and `runAudioQC` — a
 * complete gate with word-error-rate, pacing and trailing-silence rules — has
 * never had a single input to measure.
 *
 * ## The order matters
 *
 *   1. Normalise the script *before* synthesis, against the lexicon. "450°F"
 *      has to reach the model as "four hundred fifty degrees" — the gate
 *      catching it afterwards is a slower loop than not saying it wrong.
 *   2. Synthesise the narration.
 *   3. Compose and duck a bed, if and only if music is licensed for this use.
 *   4. Mix and normalise to the platform target.
 *   5. Transcribe the *finished mix*, not the narration stem, and run the gate
 *      on that. What matters is whether the words survive the mix.
 *
 * A failure at any step fails the job. There is deliberately no path that
 * proceeds without audio: a video that renders silent looks finished, publishes
 * happily, and the only symptom is that nobody hears anything.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  clampMusicLength,
  ElevenLabsSpeechClient,
  normaliseForSpeech,
  lexiconTermsUsed,
  runAudioQC,
  runDeliveryQC,
  slopFilter,
  type SlopPlatform,
  SpeechUnavailableError,
  type GateResult,
  type LexiconEntry,
  type MusicClient,
  type AudioBrief,
  directVoice,
  duckingFor,
  LANGUAGE_FOR_TREATMENT,
  type SpeechClient,
} from '@halyard/core';
// From the timing subpath rather than the package root: `timing.ts` is pure
// arithmetic, while the root pulls in the Remotion compositions and React with
// them. The worker has no use for a component tree.
import { buildCaptionCues, durationInFrames } from '@halyard/render/timing';
import { alignToScript } from '../captions.js';
import { audioDuration, measureEdgeSilence, mixAudio } from '../audio.js';
import type { HandlerContext, Job } from '../poller.js';
import { LibraryBedClient } from '../bed.js';
import { resolveSfx } from '../sfx.js';
import { readAssetBytes, uploadAsset } from '../storage.js';
import { transcribeWords } from '../video.js';

interface ItemRow {
  id: string;
  product_id: string;
  platform: string;
  vo_script: string | null;
  audio_mode: string;
  format: string;
  /** Read so the audio verdict can be merged into the existing gate list. */
  qc_results: { gates?: GateResult[] } | null;
  /* §221. Creative direction, joined in. Null on anything generated before
     concepts and briefs existed. */
  treatment: string | null;
  account_id: string | null;
  emotional_angle: string | null;
  target_seconds: string | null;
  beats: unknown[] | null;
}

/**
 * The bed's brief.
 *
 * Deliberately dull. This plays under someone explaining why a substitution
 * works; anything with a melody worth following competes with the words.
 */
export const MUSIC_PROMPT =
  'Simple instrumental bed for a short cooking explainer. Warm, unobtrusive, ' +
  'no vocals, no melody in the foreground, steady and unresolved so it can loop.';

export interface TtsDeps {
  speech?: SpeechClient;
  music?: MusicClient | null;
}

export async function ttsHandler(job: Job, ctx: HandlerContext, deps: TtsDeps = {}): Promise<void> {
  const contentItemId = String(job.payload.contentItemId ?? '');
  if (!contentItemId) throw new Error('tts job has no contentItemId');

  const { rows } = await ctx.pool.query<ItemRow>(
    /*
     * §221. The creative direction rides along so the Music Director can hear
     * what the piece is. Left-joined: an item generated before concepts
     * existed has neither, and still needs a voiceover.
     */
    `select ci.id, ci.product_id, ci.platform, ci.vo_script, ci.audio_mode, ci.format,
            ci.qc_results,
            ci.generation_meta -> 'creative' ->> 'type' as treatment,
            ci.account_id,
            c.emotional_angle,
            b.target_seconds,
            b.beats
       from content_items ci
       left join concepts c on c.id = ci.concept_id
       left join creative_briefs b on b.id = ci.brief_id
      where ci.id = $1`,
    [contentItemId],
  );
  const item = rows[0];
  if (!item) throw new Error(`content item ${contentItemId} not found`);

  if (item.audio_mode === 'text_only') {
    // Not a failure. A text post has no voiceover by design, and saying so is
    // more useful than a job that silently does nothing.
    ctx.log('tts skipped, item is text_only', { contentItemId });
    return;
  }

  if (!item.vo_script?.trim()) {
    throw new Error(
      `content item ${contentItemId} is ${item.audio_mode} but has no vo_script to speak`,
    );
  }

  const { rows: lexicon } = await ctx.pool.query<LexiconEntry>(
    `select term, phonetic from voice_lexicon
      where product_id = $1 or product_id is null
      order by length(term) desc`,
    [item.product_id],
  );

  // Longest-first ordering is the lexicon's contract, so '450°F' wins over
  // '450'. Done in SQL above rather than trusted to insertion order.
  const script = normaliseForSpeech(item.vo_script, lexicon);

  /**
   * Record which lexicon terms this script actually used.
   *
   * `hit_count` has been on the table since 0007 and the pronunciation screen
   * shows it, and nothing ever incremented it — so the column read zero for
   * every term forever. It is the only signal for whether a pronunciation is
   * earning its place or was added once for a word that never recurs.
   *
   * After the substitution, not before: what is counted is what was replaced.
   * Failing to count is never allowed to fail the synthesis — the audio is the
   * job, the tally is bookkeeping.
   */
  const used = lexiconTermsUsed(item.vo_script, lexicon);
  if (used.length > 0) {
    await ctx.pool
      .query(
        `update voice_lexicon set hit_count = hit_count + 1
          where term = any($1::text[]) and (product_id = $2 or product_id is null)`,
        [used, item.product_id],
      )
      .catch(() => undefined);
  }

  const speech = deps.speech ?? new ElevenLabsSpeechClient();

  const work = await mkdtemp(path.join(tmpdir(), 'halyard-tts-'));

  /**
   * Beds come from the operator's own library, not from a generator.
   *
   * ElevenLabs Music is not licensed for advertising and this is advertising,
   * so that path is shut. Synthesising a drone instead would be ours outright
   * and would also sound like a synthesised drone, indistinguishable in the
   * pipeline from a real bed — so nobody would ever notice which one shipped.
   *
   * No library means narration alone, normalised. That is a normal short-form
   * style, and the reason is recorded on the item either way.
   */
  /*
   * §221. What the piece needs, assembled from what the creative already
   * decided rather than guessed here. `LANGUAGE_FOR_TREATMENT` is the same
   * mapping the motion grammar uses, so the bed and the cutting agree about
   * what kind of film this is.
   */
  const beatCount = Array.isArray(item.beats) ? item.beats.length : 0;
  const briefSeconds = item.target_seconds === null ? null : Number(item.target_seconds);
  /*
   * §232. How this should be read.
   *
   * `synthesize` took stability 0.55 for everything and nothing ever passed
   * anything else, so a playful 15-second TikTok and a considered explainer
   * were read identically. Stability is a performance setting, not a quality
   * one, and which end of the range is right depends on the piece.
   */
  const voice = directVoice({
    platform: item.platform,
    visualLanguage: item.treatment ? (LANGUAGE_FOR_TREATMENT[item.treatment] ?? null) : null,
    emotionalAngle: item.emotional_angle,
    targetSeconds: item.target_seconds ? Number(item.target_seconds) : 30,
  });
  ctx.log('voice direction', {
    energy: voice.energy,
    stability: voice.stability,
    because: voice.reason,
  });

  const audioBrief: AudioBrief = {
    /*
     * §244. A draft mix may use a fixture; a post may not.
     *
     * This audio is produced long before anybody approves anything, so
     * refusing fixtures here would mean the whole audio path could never be
     * exercised without buying music. `audioIsPublishable` is what stops a
     * fixture reaching a real post, and it runs against what was actually
     * mixed rather than against what would be chosen if asked again.
     */
    forPublication: false,
    accountId: item.account_id,
    contentItemId,
    platform: item.platform,
    emotionalAngle: item.emotional_angle,
    visualLanguage: item.treatment ? (LANGUAGE_FOR_TREATMENT[item.treatment] ?? null) : null,
    targetSeconds: briefSeconds && briefSeconds > 0 ? briefSeconds : 30,
    cutsPerMinute:
      beatCount > 0 && briefSeconds && briefSeconds > 0
        ? (beatCount / briefSeconds) * 60
        : null,
    hasVoiceover: true,
  };

  const music =
    deps.music === undefined
      ? new LibraryBedClient(ctx, item.product_id, work, readAssetBytes, audioBrief)
      : deps.music;
  const narrationPath = path.join(work, 'narration.mp3');
  const mixPath = path.join(work, 'mix.mp3');

  try {
    await writeFile(
      narrationPath,
      await speech.synthesize(script, {
        /* §232. The directed performance, not the default one. */
        stability: voice.stability,
        similarityBoost: voice.similarityBoost,
        ...(voice.voiceId ? { voiceId: voice.voiceId } : {}),
      }),
    );
    const narrationSeconds = await audioDuration(narrationPath);

    /**
     * Music is best-effort *within the bounds of the licence*, and its absence
     * is recorded rather than hidden.
     *
     * A missing or unlicensed bed should not stop a voiceover from being
     * produced — narration alone, normalised, is a perfectly good short-form
     * video. What must never happen is the bed silently vanishing and the
     * operator believing the mix has one.
     */
    let musicPath: string | null = null;
    let musicSkipped: string | null = null;
    if (music) {
      try {
        const composed = await music.compose(
          MUSIC_PROMPT,
          clampMusicLength(narrationSeconds * 1000),
        );
        musicPath = path.join(work, 'bed.mp3');
        await writeFile(musicPath, composed);
      } catch (err) {
        musicPath = null;
        musicSkipped =
          err instanceof SpeechUnavailableError
            ? err.reason
            : (err as Error).message.slice(0, 200);
        ctx.log('music bed skipped', { contentItemId, reason: musicSkipped });
      }
    }

    /**
     * §242. Sound design, finally reachable.
     *
     * `planSfx` and `selectEffect` were written in §233 and called by nothing —
     * there was no handler that invoked them and no input on `mixAudio` that
     * could take the result. This is the caller.
     *
     * `forPublication` is false here on purpose: this mix is produced before
     * anybody has approved anything, so a test fixture is legitimate. The
     * publish path re-checks provenance against what actually got mixed.
     */
    const beatsForSfx = (item.beats ?? []).map((b, i) => {
      const beat = b as Record<string, unknown>;
      const motion = (beat.motion ?? {}) as Record<string, unknown>;
      return {
        startSeconds: (narrationSeconds / Math.max(1, (item.beats ?? []).length)) * i,
        role: String(beat.role ?? ''),
        transitionOut: motion.transitionOut as string | undefined,
        entrance: motion.entrance as string | undefined,
        isProductFootage: Boolean(beat.media),
      };
    });

    const sfx = await resolveSfx(
      ctx,
      {
        productId: item.product_id,
        platform: item.platform,
        workDir: work,
        beats: beatsForSfx,
        totalSeconds: narrationSeconds,
        visualLanguage: item.treatment ? (LANGUAGE_FOR_TREATMENT[item.treatment] ?? null) : null,
        hasVoiceover: true,
        forPublication: false,
      },
      readAssetBytes,
    );
    /*
     * §244. What actually went into the mix, recorded on the item.
     *
     * The publish gate reads this rather than re-deriving a selection: the
     * file that exists is the one that matters, and asking the selector again
     * could easily produce a different answer.
     */
    await ctx.pool.query(
      `update content_items
          set qc_results = jsonb_set(
                coalesce(qc_results, '{}'::jsonb),
                '{audio,sfxUsed}',
                $2::jsonb,
                true)
        where id = $1`,
      [contentItemId, JSON.stringify(sfx.cues.map((c) => ({ id: c.effectId, title: c.title })))],
    );

    if (sfx.cues.length > 0) {
      ctx.log('sound design', {
        contentItemId,
        cues: sfx.cues.map((c) => `${c.title} @${c.atSeconds.toFixed(1)}s — ${c.because}`),
      });
    } else {
      ctx.log('no sound design', { contentItemId, reason: sfx.skippedReason });
    }

    const mix = await mixAudio({
      narrationPath,
      musicPath,
      outputPath: mixPath,
      /* §221. Where the bed sits is a creative call, not a constant. */
      ducking: duckingFor(audioBrief),
      /* §242. Punctuation on the edit, under the voice by level. */
      ...(sfx.cues.length > 0
        ? { sfx: sfx.cues.map((c) => ({ path: c.path, atSeconds: c.atSeconds, gainDb: c.gainDb })) }
        : {}),
    });

    /**
     * Transcribe the mix, not the narration.
     *
     * Running the gate on the narration stem would measure a file the viewer
     * never hears. If the bed is too loud, or the ducking failed, the words are
     * harder to make out in the mix than in the stem — and that is exactly the
     * defect worth catching.
     */
    const words = await transcribeWords(mixPath);
    const transcript = words.map((w) => w.text).join(' ');

    /**
     * Cues, built here because the transcription the gate needs is the same
     * transcription the captions need. `buildCaptionCues` groups words into
     * whole clauses rather than the two-word karaoke style that reads as a
     * template — it has existed, unused, for as long as the timing module has.
     */
    /**
     * §145. The captions say what the script says, at the times whisper heard.
     *
     * `words` is the right clock and the wrong spelling. A real render put
     * "Keep the rice short, 60 to 90 minutes" on screen where the script reads
     * "Keep the rise short, sixty to ninety minutes" — whisper's mishearing and
     * whisper's numerals, burned into the picture. The transcript above still
     * feeds the gates, because measuring what was *heard* is the whole point of
     * those; only the words the viewer reads are anchored to the script.
     *
     * `item.vo_script` and not `script`: the latter is the version prepared for
     * the *synthesiser*, with lexicon terms swapped for their phonetic
     * respellings. "ZAN-thun" is the correct thing to say and the wrong thing
     * to print.
     */
    const cues = buildCaptionCues(alignToScript(words, item.vo_script));
    const silence = await measureEdgeSilence(mixPath);

    /**
     * Slop-check the transcript: what was *said*, not what was written.
     *
     * The script is gated before synthesis, which catches the writing. This
     * catches the synthesis — a model that reads "3/4" as "three slash four",
     * or drops a clause, produces narration that never existed as text and that
     * no earlier gate ever saw. `runAudioQC` measures whether the words came
     * out *accurately*; this measures whether the words that came out are any
     * good.
     */
    const spokenSlop = slopFilter({
      body: transcript,
      platform: item.platform as SlopPlatform,
      hashtags: [],
      spoken: true,
    });

    /**
     * Delivery: whether the read sounds like a person or like a machine.
     *
     * Measured from the word timings whisper already produced, not judged by a
     * model — flat pace, sentences run together, laboured words, a rushed
     * opening. Every finding is a warning, because no real synthesised speech
     * has been measured against these thresholds yet and a gate that blocks on
     * an invented number is worse than no gate.
     */
    const delivery = runDeliveryQC({
      words: words.map((w) => ({
        text: w.text,
        startSeconds: w.startSeconds,
        endSeconds: w.endSeconds,
      })),
      script,
      durationSeconds: mix.durationSeconds,
    });

    const qc = runAudioQC({
      script,
      transcript,
      durationSeconds: mix.durationSeconds,
      trailingSilenceMs: silence.trailingMs,
      leadingSilenceMs: silence.leadingMs,
    });

    const asset = await uploadAsset(ctx, {
      bytes: await readFileBuffer(mixPath),
      mimeType: 'audio/mpeg',
      kind: 'audio',
      durationSeconds: mix.durationSeconds,
      contentItemId,
      productId: item.product_id,
      source: 'render',
    });

    await ctx.pool.query(`update content_items set vo_asset_id = $2 where id = $1`, [
      contentItemId,
      asset.id,
    ]);

    /**
     * Store the gate's verdict alongside the caption timing.
     *
     * The word timings are what the Remotion `Captions` component burns in, and
     * they come free with the transcription that the gate needed anyway — so
     * the captions are a by-product of measuring, rather than a second pass.
     *
     * ## The verdict also goes into `gates`, not only into `audio`
     *
     * This wrote `qc_results.audio` and nothing else, and two things followed.
     *
     * The queue renders `qc_results.gates`, so an item whose voiceover had just
     * failed its gate displayed `audio: skipped — no voiceover here`. The
     * comment below says the queue is where the opinion gets acted on; the
     * queue was never shown it.
     *
     * And `review_media` finishes with `set qc_results = $2`, replacing the
     * whole object with `{passed, gates, ranAt}` — so for any item with both a
     * voiceover and a render, which is every video, the top-level `audio` key
     * was **destroyed** a few minutes later. It read the key first, for the
     * coherence gate, and then overwrote it.
     *
     * Merging into `gates` fixes both: the entry is what the queue displays,
     * `review_media` preserves entries it does not own, and `passed` is
     * recomputed over the whole list so a failed voiceover counts.
     */
    const previousGates = (item.qc_results?.gates ?? []) as GateResult[];
    const audioGate: GateResult = {
      gate: 'audio',
      status: qc.passed ? (qc.findings.length > 0 ? 'warning' : 'passed') : 'failed',
      summary: `${qc.summary}, ${mix.lufs.toFixed(1)} LUFS`,
      detail: { findings: qc.findings, wordErrorRate: qc.wordErrorRate, lufs: mix.lufs },
    };
    const mergedGates = [...previousGates.filter((g) => g.gate !== 'audio'), audioGate];

    await ctx.pool.query(
      `update content_items
          set qc_results = coalesce(qc_results, '{}'::jsonb) || $2::jsonb
        where id = $1`,
      [
        contentItemId,
        JSON.stringify({
          audio: {
            passed: qc.passed,
            summary: `${qc.summary}, ${mix.lufs.toFixed(1)} LUFS`,
            findings: qc.findings,
            wordErrorRate: qc.wordErrorRate,
            wordsPerMinute: qc.wordsPerMinute,
            lufs: mix.lufs,
            truePeakDb: mix.truePeakDb,
            hadMusic: mix.hadMusic,
            musicSkipped,
            // Kept so the coherence gate can compare what is said against what
            // is shown. Its `audio` input was optional and unsupplied, which
            // meant three of its rules could never fire.
            transcript,
            openingSentence: firstSentence(transcript),
            // Recorded, not thrown: the audio exists and is attached, and what
            // the transcript reveals is a judgement for the queue to act on.
            delivery: {
              measured: delivery.measured,
              summary: delivery.summary,
              findings: delivery.findings,
              paceVariation: delivery.paceVariation,
              pauseCount: delivery.pauseCount,
            },
            spokenSlop: {
              passed: spokenSlop.passed,
              violations: spokenSlop.errors,
            },
            captions: cues,
            durationInFrames: durationInFrames(mix.durationSeconds),
          },
          gates: mergedGates,
          passed: mergedGates.every((g) => g.status !== 'failed'),
        }),
      ],
    );

    /**
     * A failing gate does not fail the job.
     *
     * The audio exists and is attached; what the gate found is an opinion about
     * its quality, and the queue is where opinions get acted on. Throwing here
     * would retry the synthesis three times and reach the same verdict, because
     * the same script produces the same speech.
     */
    /**
     * Release the renders this item was waiting on.
     *
     * Generation creates the Remotion render row but deliberately does not
     * enqueue it: the video's length and its audio both come from this mix, so
     * rendering first would produce a silent video of the wrong duration and
     * mark it done. This is the other half of that contract, and without it a
     * video item would sit in `queued` forever with no error to explain it.
     */
    const { rows: waiting } = await ctx.pool.query<{ id: string }>(
      `select id from renders
        where content_item_id = $1 and renderer = 'remotion' and status = 'queued'`,
      [contentItemId],
    );
    for (const render of waiting) {
      await ctx.enqueue(
        'render',
        { renderId: render.id },
        { dedupeKey: `render:${render.id}`, priority: 50 },
      );
    }

    ctx.log('voiceover produced', {
      rendersReleased: waiting.length,
      contentItemId,
      seconds: Number(mix.durationSeconds.toFixed(2)),
      lufs: Number(mix.lufs.toFixed(1)),
      music: mix.hadMusic,
      qc: qc.passed ? 'passed' : 'findings',
      spokenSlop: spokenSlop.passed ? 'clean' : `${spokenSlop.errors.length} errors`,
      delivery: delivery.measured ? delivery.summary : 'not measured',
      wer: Number((qc.wordErrorRate * 100).toFixed(2)),
      wpm: Math.round(qc.wordsPerMinute),
    });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * The first sentence, which is the only one most viewers hear.
 *
 * Falls back to the first dozen words when the transcript has no terminator —
 * whisper does not always punctuate, and returning the entire transcript as
 * "the opening sentence" would make the gate's opening checks meaningless.
 */
export function firstSentence(transcript: string): string {
  const trimmed = transcript.trim();
  const match = trimmed.match(/^[^.!?]+[.!?]/);
  if (match) return match[0].trim();
  return trimmed.split(/\s+/).slice(0, 12).join(' ');
}

async function readFileBuffer(file: string): Promise<Buffer> {
  const { readFile } = await import('node:fs/promises');
  return readFile(file);
}
