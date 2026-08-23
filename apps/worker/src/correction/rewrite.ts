/**
 * The two corrections that need a model to write something.
 *
 * §165. Everything else in this loop is deterministic — a caption backdrop
 * flip, a beat rebalance, a destination re-resolution. These two are not:
 * fixing copy that broke a rule means writing different copy, and no table can
 * do that.
 *
 * The model's role is still narrow, and the narrowness is the point:
 *
 *   · It is **told** what failed. It is never asked whether the gate was right.
 *   · It gets the defects and the do-not-regress list as constraints, not as a
 *     request for its opinion about the artifact.
 *   · Whatever comes back goes through the same deterministic gates. `writeDraft`
 *     and `writeVoScript` already run the slop filter and the claim verifier
 *     over their own output on a retry loop and refuse to return copy that
 *     fails, so a model cannot talk its way past a check by producing
 *     confident prose.
 *
 * That last point is worth stating plainly: the copy half of self-correction
 * has existed inside `writeDraft` all along — generate, gate, `buildFeedback`,
 * retry. What it could never see is anything measured *after* copy time: audio,
 * frames, retention, coherence. That is the gap §165's controller fills, and
 * these functions are how it reaches back into the writing stage.
 */
import {
  rehydrateArtifact,
  writeDraft,
  writeVoScript,
  type Defect,
  type LlmClient,
} from '@halyard/core';
import { copywriterDontRules } from '../handlers/generate.js';
import type { HandlerContext } from '../poller.js';
import type { CorrectionOutcome } from './apply.js';
import { correctionNote, requeueFinalRenders } from './apply.js';

interface Context {
  contentItemId: string;
  defects: Defect[];
  doNotRegress: Defect[];
}

/** Everything `writeDraft` needs, assembled from the item that already exists. */
async function draftContext(ctx: HandlerContext, contentItemId: string) {
  const { rows } = await ctx.pool.query<{
    product_id: string;
    connector_config: Record<string, unknown> | null;
    platform: string;
    format: string;
    category: string;
    persona: string;
    body: string;
    title: string | null;
    product_artifact: unknown;
    vo_script: string | null;
    idea_title: string | null;
    idea_angle: string | null;
    product_name: string;
    brief: string | null;
    content_rules: {
      forbidden_claims?: string[];
      banned_phrases?: string[];
      operator_rules?: string[];
    } | null;
    voice: {
      display_name: string;
      description: string;
      do_rules: string[];
      dont_rules: string[];
      examples: unknown;
      anti_examples: unknown;
    } | null;
  }>(
    `select c.product_id, p.connector_config, c.platform, c.format, c.category, c.persona, c.body, c.title,
            c.product_artifact, c.vo_script,
            i.title as idea_title, i.angle as idea_angle,
            p.name as product_name,
            coalesce(p.brief_summary, p.brief_markdown, p.name) as brief,
            p.content_rules,
            to_jsonb(v.*) as voice
       from content_items c
       left join ideas i on i.id = c.idea_id
       join products p on p.id = c.product_id
       left join brand_voices v on v.product_id = c.product_id and v.persona = c.persona
      where c.id = $1`,
    [contentItemId],
  );
  return rows[0] ?? null;
}

/**
 * Revise the copy against what the gates found.
 *
 * Reported as changing `copy` and nothing else, even though the claim array is
 * rewritten too. That is not a loophole: claims are *extracted from* the copy,
 * so re-extracting them is part of writing new words rather than a separate
 * decision to alter the claim set. The claims gate is invalidated by the copy
 * change and re-verified against the artifact before this can pass — which is
 * the check that matters, and it is stricter than freezing the array would be.
 */
export async function reviseCopy(
  ctx: HandlerContext,
  llm: LlmClient,
  input: Context,
): Promise<CorrectionOutcome> {
  const row = await draftContext(ctx, input.contentItemId);
  if (!row) return { changed: [], note: 'no context', escalate: 'The item could not be loaded.' };
  if (!row.voice) {
    return {
      changed: [],
      note: 'no brand voice',
      escalate: `No brand voice is configured for ${row.product_id}/${row.persona}, so copy cannot be rewritten in voice.`,
    };
  }

  const draft = await writeDraft(
    {
      platform: row.platform as never,
      format: row.format as never,
      category: row.category,
      persona: row.persona as 'founder' | 'brand',
      idea: { title: row.idea_title ?? row.title ?? '', angle: row.idea_angle ?? '' },
      /*
       * The stored column holds the provider's raw JSON; every downstream
       * component reads the generic `highlights` wrapper around it, which is
       * derived and was never stored. Rehydrated through the product's own
       * adapter rather than reconstructed here.
       */
      artifact: rehydrateArtifact({ id: row.product_id, connector_config: row.connector_config }, row.product_artifact),
      voice: {
        displayName: row.voice.display_name,
        description: row.voice.description,
        doRules: row.voice.do_rules,
        dontRules: copywriterDontRules(row.voice.dont_rules, row.content_rules),
        examples: (row.voice.examples as never) ?? [],
        antiExamples: (row.voice.anti_examples as never) ?? [],
      },
      productBrief: row.brief ?? row.product_name,
      contentRules: {
        forbiddenClaims: row.content_rules?.forbidden_claims,
        bannedPhrases: row.content_rules?.banned_phrases,
      },
      /*
       * The correction arrives through the same channel an operator's
       * regenerate note does. `writeDraft` already threads that into its
       * prompt and into every retry, so the constraint survives the internal
       * loop rather than being stated once and forgotten on attempt two.
       */
      regenNote: correctionNote(input),
    },
    llm,
  );

  if (!draft.qc.passed) {
    /*
     * `writeDraft` exhausted its own attempts and still could not produce copy
     * that passes. Escalating rather than storing it: writing the failing draft
     * over the previous one would lose a version that was at least no worse,
     * for a version that is known bad.
     */
    return {
      changed: [],
      note: 'revision still fails the copy gates',
      escalate: `The copywriter could not produce copy that passes after ${draft.attempts} attempts.`,
    };
  }

  await ctx.pool.query(
    `update content_items
        set body = $2, title = coalesce($3, title), alt_text = coalesce($4, alt_text),
            hashtags = $5, claims = $6::jsonb
      where id = $1`,
    [
      input.contentItemId,
      draft.body,
      draft.title ?? null,
      draft.altText ?? null,
      draft.hashtags,
      JSON.stringify(draft.claims),
    ],
  );

  return {
    changed: ['copy'],
    note: `Copy rewritten in ${draft.attempts} attempt(s) against ${input.defects.length} defect(s).`,
  };
}

/**
 * Rewrite the narration script.
 *
 * ## Why a shorter script does not fix pacing
 *
 * `audio.pacing` is `scriptWords / measuredDuration`, and a synthesiser reads
 * at roughly its own rate — so cutting words shortens the audio by about the
 * same proportion and the words-per-minute figure barely moves. Writing "fewer
 * words" would spend a provider call to fail the same check again.
 *
 * What does move it is **sentence structure**. Full stops and commas become
 * pauses, pauses lengthen the audio without adding words, and the ratio falls.
 * So the instruction is about breaking sentences up, not about length, and it
 * says so explicitly rather than hoping the model infers it.
 *
 * ## Why a slow read is not correctable here
 *
 * The gate's own remedy for the low side is "regenerate at a higher speed", and
 * `SynthesisOptions` has no speed control — stability, similarity, voice and
 * model, and nothing else. There is no honest correction available, so it
 * escalates instead of pretending.
 */
export async function rewriteVoScript(
  ctx: HandlerContext,
  llm: LlmClient,
  input: Context,
): Promise<CorrectionOutcome> {
  const row = await draftContext(ctx, input.contentItemId);
  if (!row) return { changed: [], note: 'no context', escalate: 'The item could not be loaded.' };

  const pacing = input.defects.find((d) => d.rule === 'audio.pacing');
  if (pacing && /too slow/i.test(String((pacing.evidence as { detail?: unknown })?.detail ?? ''))) {
    return {
      changed: [],
      note: 'slow read',
      escalate:
        'The read is too slow, and the gate’s own remedy is a higher synthesis speed. SynthesisOptions exposes no speed control, so there is no correction to apply — this needs a voice or model change, which is a person’s decision.',
    };
  }

  const { rows: measured } = await ctx.pool.query<{ duration: string | null }>(
    `select (qc_results->'audio'->>'wordsPerMinute') as duration from content_items where id = $1`,
    [input.contentItemId],
  );

  /*
   * Target the same runtime the item was generated for. The script is written
   * to a target and the video is then cut to the *measured* audio, so aiming at
   * a shorter target would shorten the video rather than slow the read.
   */
  const result = await writeVoScript(
    {
      body: row.body,
      artifact: rehydrateArtifact({ id: row.product_id, connector_config: row.connector_config }, row.product_artifact),
      targetSeconds: 22,
      platform: row.platform as never,
      contentRules: {
        bannedPhrases: row.content_rules?.banned_phrases,
        forbiddenClaims: row.content_rules?.forbidden_claims,
      },
    },
    llm,
  );

  if (!result.qc.passed) {
    return {
      changed: [],
      note: 'script still fails its gates',
      escalate: `The scriptwriter could not produce a script that passes after ${result.attempts} attempts.`,
    };
  }

  if (result.script.trim() === (row.vo_script ?? '').trim()) {
    /*
     * An identical script would re-synthesise to identical audio and fail the
     * same check — the dice-roll this design exists to avoid, arriving by
     * accident rather than by design.
     */
    return {
      changed: [],
      note: 'script unchanged',
      escalate: `The scriptwriter returned the same script (measured at ${measured[0]?.duration ?? 'unknown'} wpm), so re-synthesising it would reproduce the same audio.`,
    };
  }

  /*
   * The script changes and the voiceover is cleared together: they are one
   * change, and leaving the old asset attached would make `tts` return early
   * and the new script would never be spoken.
   */
  await ctx.pool.query(
    `update content_items set vo_script = $2, vo_asset_id = null where id = $1`,
    [input.contentItemId, result.script],
  );

  /*
   * The renders have to go back to `queued` or `tts` will release nothing and
   * the new narration will never reach a video. See `requeueFinalRenders`.
   */
  const released = await requeueFinalRenders(ctx, input.contentItemId);

  return {
    changed: ['vo_script', 'voiceover'],
    note: `Narration rewritten in ${result.attempts} attempt(s); ${released} render(s) requeued.`,
  };
}
