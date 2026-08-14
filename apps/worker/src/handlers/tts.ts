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
  ElevenLabsMusicClient,
  ElevenLabsSpeechClient,
  normaliseForSpeech,
  runAudioQC,
  SpeechUnavailableError,
  type LexiconEntry,
  type MusicClient,
  type SpeechClient,
} from '@halyard/core';
// From the timing subpath rather than the package root: `timing.ts` is pure
// arithmetic, while the root pulls in the Remotion compositions and React with
// them. The worker has no use for a component tree.
import { buildCaptionCues, durationInFrames } from '@halyard/render/timing';
import { audioDuration, measureEdgeSilence, mixAudio } from '../audio.js';
import type { HandlerContext, Job } from '../poller.js';
import { uploadAsset } from '../storage.js';
import { transcribeWords } from '../video.js';

interface ItemRow {
  id: string;
  product_id: string;
  vo_script: string | null;
  audio_mode: string;
  format: string;
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
    `select id, product_id, vo_script, audio_mode, format from content_items where id = $1`,
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

  const speech = deps.speech ?? new ElevenLabsSpeechClient();
  const music = deps.music === undefined ? new ElevenLabsMusicClient() : deps.music;

  const work = await mkdtemp(path.join(tmpdir(), 'halyard-tts-'));
  const narrationPath = path.join(work, 'narration.mp3');
  const mixPath = path.join(work, 'mix.mp3');

  try {
    await writeFile(narrationPath, await speech.synthesize(script));
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
          err instanceof SpeechUnavailableError ? err.reason : (err as Error).message.slice(0, 200);
        ctx.log('music bed skipped', { contentItemId, reason: musicSkipped });
      }
    }

    const mix = await mixAudio({ narrationPath, musicPath, outputPath: mixPath });

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
    const cues = buildCaptionCues(words);
    const silence = await measureEdgeSilence(mixPath);

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
     */
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
            captions: cues,
            durationInFrames: durationInFrames(mix.durationSeconds),
          },
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
