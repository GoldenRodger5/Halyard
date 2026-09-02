/**
 * What to do about each kind of defect, decided in advance.
 *
 * §165. This is the file that stops self-correction becoming "roll the dice
 * again". Every rule the gates can emit maps to one action and one component,
 * written down before any artifact fails, so the correction applied to a
 * failing post is a consequence of *which check failed* rather than of what a
 * model thought while looking at it.
 *
 * Two properties are load-bearing and both are tested:
 *
 * **Every rule is covered.** `policyCoverage.test.ts` enumerates the rule
 * identifiers in the gate sources and fails if one has no entry — the same
 * technique `handlerCoverage.test.ts` uses to keep `JOB_KINDS` honest. A rule
 * added to a gate without a policy entry would otherwise fall to the default
 * and quietly get the wrong correction.
 *
 * **Some defects are not correctable.** Missing evidence, an unverifiable
 * product behaviour, absent testimonial consent, a measurement that never ran —
 * none of these is fixed by writing different words, and a loop that tries will
 * burn its whole budget producing variations of the same failure. Those map to
 * `escalate`, which stops the loop and tells a person why.
 */
import type { GateName } from '../qc/index.js';
import type { Component, CorrectionAction } from './defects.js';

export interface PolicyEntry {
  rootCause: string;
  component: Component;
  action: CorrectionAction;
  correctable: boolean;
}

/**
 * Rules that need their own entry, because the namespace default is wrong.
 *
 * Kept small on purpose. A table with an entry per rule is a table nobody
 * maintains; the namespace carries the common case and this carries the
 * exceptions, each with the reason it is one.
 */
const BY_RULE: Record<string, PolicyEntry> = {
  /**
   * §467. Borrowed authority is a wording defect, not an evidence one.
   *
   * *"Established by BBC Good Food"*, *"2021 salinity testing"* — the caption
   * sounds more certain than anything it cited. The underlying fact may be
   * perfectly sourced; `claims` and `format.uncited_claim` answer that
   * separately, and they escalate rather than rewrite because a missing source
   * cannot be written into existence.
   *
   * This one genuinely is fixed by writing the sentence again, so it is a
   * `revise_copy` — and it gets its own entry rather than a `claim` namespace
   * fallback, because a future `claim.*` rule about *evidence* must be decided
   * on its own and must not inherit "just rewrite it" from this.
   */
  'claim.vague_authority': {
    rootCause: 'The copy borrowed the cadence of a citation without naming a source.',
    component: 'copy',
    action: 'revise_copy',
    correctable: true,
  },

  /*
   * §205. A creative with no beats is not a badly planned piece — it is an
   * artifact that carried nothing any planner recognised as a story. Planning
   * again produces the same emptiness, so this escalates rather than looping.
   * The same reasoning as the missing-evidence entries below.
   */
  'creative.no_beats': {
    rootCause: 'The artifact carried nothing a creative planner could use.',
    component: 'evidence',
    action: 'escalate',
    correctable: false,
  },

  /*
   * Text density is the one creative finding that is genuinely about words.
   * The beat text comes from the artifact, but what reaches the frame is a
   * choice about how much of it to draw — and shortening an overlay is a copy
   * revision, not a resequence. Routed accordingly so a correction changes the
   * thing that is actually wrong.
   */
  /*
   * §213. A generated image standing where product evidence belongs.
   *
   * Not a resequence: the beat order is fine and the picture is the problem.
   * Not correctable by re-planning either, because the planner would reach for
   * the same illustration — the fix is a real product image or a capture, and
   * whether either exists is not something a correction can decide. Escalates,
   * for the same reason missing evidence does.
   */
  'creative.fabricated_evidence': {
    rootCause: 'A generated image is presented as evidence of product behaviour.',
    component: 'evidence',
    action: 'escalate',
    correctable: false,
  },

  'creative.text_density': {
    rootCause: 'A beat carries more on-screen text than a viewer will read.',
    component: 'copy',
    action: 'revise_copy',
    correctable: true,
  },

  /*
   * §234. The rules added with the creative acceptance suite.
   *
   * Entered individually rather than left to the `creative` namespace
   * fallback, which routed all nine to `resequence_scenes` — a correction that
   * cannot add alt text, cannot change a font and cannot remix audio. The
   * coverage test passed the whole time, because a namespace fallback is
   * coverage in the letter and a wrong answer in substance.
   */
  /*
   * §234. Two the namespace fallback had wrong, found by the heterogeneity
   * guard rather than by anything failing.
   *
   * Repetition is a property of the *sequence*, not of this artifact — the fix
   * is for the next piece to choose differently, which the directors already
   * do from recency. Re-rolling a finished render to solve a problem it does
   * not have on its own is churn.
   */
  'creative.repeated_treatment': {
    rootCause: 'The account used this treatment on a recent post.',
    component: 'creative_plan',
    action: 'escalate',
    correctable: false,
  },
  /* An opening line that buries the point is a *writing* defect. Resequencing
     the scenes moves the same buried line to a different frame. */
  'coherence.opening_line_buries_it': {
    rootCause: 'The opening line puts the point after the setup.',
    component: 'copy',
    action: 'revise_copy',
    correctable: true,
  },

  /*
   * §409. The frames are illustrating a different piece than the words.
   *
   * Not `resequence_scenes`, which the `coherence` namespace fallback would
   * have given it — reordering beats that are about the wrong subject produces
   * the same wrong subject in a different order. The defect is upstream of the
   * edit: the composition was handed content that is not this piece's, which is
   * exactly what §406 was. It needs a person, because a pipeline that regrades
   * its own wiring is the thing this codebase refuses.
   */
  'coherence.pictures_are_of_something_else': {
    rootCause: 'The frames show subjects the piece never asked to photograph.',
    component: 'creative_plan',
    action: 'escalate',
    correctable: false,
  },

  /*
   * §409. Nothing recorded what the frames were meant to show, so the check did
   * not run. Unmeasured, and `remeasure` is the honest action — there is no
   * defect in the piece to correct, only a gap in what was written down.
   */
  'coherence.expected_subjects_not_recorded': {
    rootCause: 'The generator did not record the subject it asked an image model for.',
    component: 'measurement',
    action: 'remeasure',
    correctable: false,
  },

  'creative.pacing_too_slow': {
    rootCause: 'Too few beats for the runtime, so the piece reads as a slideshow.',
    component: 'creative_plan',
    action: 'resequence_scenes',
    correctable: true,
  },
  'creative.no_motion': {
    rootCause: 'Every beat is a still card, so nothing in the edit moves.',
    component: 'creative_plan',
    action: 'resequence_scenes',
    correctable: true,
  },
  'creative.constant_motion': {
    rootCause: 'Every beat moves, so no single move means anything.',
    component: 'creative_plan',
    action: 'adjust_scene_timing',
    correctable: true,
  },
  /*
   * The three repetition rules escalate rather than self-correcting.
   *
   * A correction runs on *this* artifact, and repetition is a property of the
   * sequence it sits in — the fix is for the next piece to choose differently,
   * which the directors already do from recency. Re-rolling this one would
   * churn a finished render to solve a problem it does not have on its own.
   */
  'creative.repeated_language': {
    rootCause: 'The account used this visual language on the previous post.',
    component: 'creative_plan',
    action: 'escalate',
    correctable: false,
  },
  'creative.repeated_opening': {
    rootCause: 'The account opened the previous post the same way.',
    component: 'creative_plan',
    action: 'escalate',
    correctable: false,
  },
  'creative.repeated_typography': {
    rootCause: 'The account set the previous post in the same typography system.',
    component: 'creative_plan',
    action: 'escalate',
    correctable: false,
  },
  'creative.unexplained_silence': {
    rootCause: 'The mix has no bed and no recorded reason, so silence cannot be distinguished from failure.',
    component: 'measurement',
    action: 'remeasure',
    correctable: true,
  },
  'creative.loudness_off_target': {
    rootCause: 'The finished mix sits far from the loudness platforms normalise to.',
    component: 'voiceover',
    action: 'resynthesise_voiceover',
    correctable: true,
  },
  'creative.missing_alt_text': {
    rootCause: 'The rendered asset carries no alt text.',
    component: 'copy',
    action: 'revise_copy',
    correctable: true,
  },


  /*
   * Pace and word-error are both `audio`, and they need opposite corrections.
   * Pacing is the *script* — 195 words per minute against a 140–175 window
   * means there are too many words for the runtime, and resynthesising the same
   * script produces the same speech at the same speed. Word-error is the
   * *synthesis* — the words were right and the voice said something else, which
   * is a pronunciation problem the lexicon exists for.
   */
  /*
   * §275. The critic's craft findings.
   *
   * Every one of these is a **judgement**, not a measurement, which changes
   * what a correction may do with it. A threshold breach has one right answer;
   * "this reads as automated" has several, and picking one automatically means
   * spending a regeneration on a guess about taste.
   *
   * So the two that name a *specific, mechanical* cause are correctable —
   * uniform type and a flat read are both fixed by varying the caption
   * treatment, which is a real lever (§274) with a deterministic action behind
   * it. The rest escalate: they describe a piece that is dull rather than
   * broken, and the fix is a different idea, which no correction can supply.
   *
   * Escalating is not ignoring. The finding stays on the scorecard, and the
   * same finding arriving on piece after piece is the systemic signal — which
   * is exactly how the caption problem should have surfaced weeks earlier.
   */
  /*
   * These two escalate, and the reason is worth stating because the obvious
   * mapping is wrong.
   *
   * `adjust_caption_treatment` raises the caption *backdrop* — surface to media
   * plate — which is a **contrast** correction (§158). It cannot make one line
   * heavier than another, so pointing uniformity at it would spend an iteration
   * changing something unrelated and then report the defect as corrected.
   *
   * Emphasis now varies by construction: captions inside the hook beat are set
   * as the hook and everything after is narration (§274), derived from the plan
   * rather than passed in. So a critic still calling a piece uniform after that
   * is seeing something the caption system cannot reach — a treatment repeated
   * across *cards*, or a plan with no hook beat — and the answer is a different
   * plan, which no correction supplies.
   */
  /**
   * §317. The media integrity rules.
   *
   * Every one of these is arithmetic about the finished file, and none of them
   * is fixable by rewriting copy or restyling a caption — the piece has to be
   * built again with the right numbers. So they escalate, with the exception of
   * a dead tail, which is untidy rather than wrong.
   */
  'media.silent_audio': {
    rootCause:
      'The file has an audio stream carrying digital silence, so every player shows a track and plays nothing.',
    component: 'render',
    action: 'escalate',
    correctable: false,
  },
  'media.no_audio_stream': {
    rootCause: 'A narrated piece reached the file with no audio at all; the mux did not happen.',
    component: 'render',
    action: 'escalate',
    correctable: false,
  },
  'media.no_faststart': {
    rootCause:
      'The MP4 index sits after the media data, so a streaming player can present the video as silent.',
    component: 'render',
    action: 'escalate',
    correctable: false,
  },
  'media.truncated': {
    rootCause:
      'The composition was sized for different content than it was given, so the last beat is cut off mid-way.',
    component: 'render',
    action: 'escalate',
    correctable: false,
  },
  'media.dead_tail': {
    /* A held final frame. Worth shortening, not worth refusing a piece over. */
    rootCause: 'The file runs past its last beat and ends on a held frame.',
    component: 'creative_plan',
    action: 'adjust_scene_timing',
    correctable: true,
  },
  'media.narration_overrun': {
    rootCause:
      'A line is still being spoken when the next one starts, over a card that has already changed.',
    component: 'creative_plan',
    action: 'adjust_scene_timing',
    correctable: true,
  },
  /**
   * §317. The two imagery findings escalate for the same reason every other
   * critic finding does: the answer is a different picture, and no correction
   * in this table supplies one. Restyling a caption over the wrong photograph
   * produces a well-set caption over the wrong photograph.
   */
  'critic.unrelated_imagery': {
    rootCause:
      'The photograph has nothing to do with what the words say — generated from something other than this piece.',
    component: 'creative_plan',
    action: 'escalate',
    correctable: false,
  },
  'critic.stock_imagery': {
    rootCause:
      'The photograph would fit any post on the account, so it was chosen for none of them.',
    component: 'creative_plan',
    action: 'escalate',
    correctable: false,
  },
  'critic.uniform_treatment': {
    rootCause:
      'One type treatment is used on every frame, so nothing carries more weight than anything else.',
    component: 'creative_plan',
    action: 'escalate',
    correctable: false,
  },
  'critic.flat_emphasis': {
    rootCause: 'The emphasis never changes, so the important line reads like the incidental one.',
    component: 'creative_plan',
    action: 'escalate',
    correctable: false,
  },
  'critic.weak_opening': {
    rootCause: 'The first frame does not say what the piece is about.',
    component: 'composition',
    action: 'resequence_scenes',
    correctable: true,
  },
  'critic.accidental_space': {
    rootCause: 'Empty space reads as a rendering accident rather than a composition.',
    component: 'composition',
    action: 'resequence_scenes',
    correctable: true,
  },
  'critic.covered_by_ui': {
    rootCause: 'Something important sits where the platform draws its own buttons.',
    component: 'composition',
    action: 'resequence_scenes',
    correctable: true,
  },
  'critic.interchangeable_frames': {
    rootCause: 'Two frames differ only in their words — the same layout refilled rather than a new idea.',
    component: 'creative_plan',
    action: 'escalate',
    correctable: false,
  },
  /**
   * §472. The scroller's findings, and why none of them is a copy edit.
   *
   * All three are about the *piece*, not its words. A video that reads as a
   * card with words on it is not fixed by better words — it is fixed by
   * planning a different piece, or it is not fixed at all. Escalating is the
   * honest answer: an operator can decide the subject was thin, and no retry
   * loop can.
   */
  'critic.scrolls_past': {
    rootCause: 'Nothing in the opening earns the second the viewer would have to give it.',
    component: 'creative_plan',
    action: 'escalate',
    correctable: false,
  },
  'critic.loses_you': {
    rootCause: 'The middle of the piece stops giving a viewer a reason to stay.',
    component: 'creative_plan',
    action: 'escalate',
    correctable: false,
  },
  'critic.looks_generated': {
    rootCause: 'The piece reads as produced rather than made.',
    component: 'creative_plan',
    action: 'escalate',
    correctable: false,
  },

  /**
   * §472. The expert's findings, which are about the writing and *are* fixable.
   *
   * Overstatement is a sentence written too strongly — that is a rewrite. A
   * piece that says nothing a competent cook does not know is a different
   * problem: the *subject* was thin, and rewriting it produces the same
   * obvious advice in new words.
   */
  'critic.overstated': {
    rootCause: 'A claim is stated more strongly than the evidence behind it.',
    component: 'copy',
    action: 'revise_copy',
    correctable: true,
  },
  'critic.not_worth_knowing': {
    rootCause: 'The piece tells a competent reader something they already do.',
    /*
     * §472. The plan, not the copy. There is no `idea` component and inventing
     * one would be wrong: what went astray is the decision that this subject
     * was worth thirty seconds, which is what `creative_plan` names.
     */
    component: 'creative_plan',
    action: 'escalate',
    correctable: false,
  },

  'critic.reads_automated': {
    rootCause: 'The piece looks like a system filled in a shape rather than something a person made.',
    component: 'creative_plan',
    action: 'escalate',
    correctable: false,
  },
  'audio.pacing': {
    rootCause: 'The script has more words than the runtime allows, so the voice reads it too fast.',
    component: 'vo_script',
    action: 'rewrite_vo_script',
    correctable: true,
  },
  /*
   * Word-error is a *script* correction, not a re-synthesis, and the reason is
   * worth stating because the obvious answer is wrong.
   *
   * The tempting fix is "say it again" — but synthesis of the same script is
   * near-deterministic, so a second attempt reproduces the same mispronunciation
   * and the loop has spent a provider call to learn nothing. That is precisely
   * the dice-rolling this design exists to prevent.
   *
   * The lexicon is the other tempting answer, and it is worse: `voice_lexicon`
   * requires a `phonetic` column, and a machine inventing a phonetic spelling
   * is fabricating evidence about how a word sounds. A person adds those.
   *
   * What *can* be corrected deterministically is the script: spell the numeral,
   * hyphenate the compound, replace the term the synthesiser cannot say with
   * one it can. The gate already names the culprits in `suggestedLexiconTerms`.
   */
  'audio.word_error_rate': {
    rootCause: 'The synthesiser said something other than the script — a term it cannot pronounce as written.',
    component: 'vo_script',
    action: 'rewrite_vo_script',
    correctable: true,
  },
  'audio.unnormalised_numerals': {
    rootCause: 'A numeral reached the synthesiser unspoken, so it was read as digits.',
    component: 'vo_script',
    action: 'rewrite_vo_script',
    correctable: true,
  },
  'audio.trailing_silence': {
    rootCause: 'The mix holds silence past the last word.',
    component: 'voiceover',
    action: 'resynthesise_voiceover',
    correctable: true,
  },

  /*
   * Caption legibility is §158's territory and has a treatment seam, so it is
   * corrected by changing the caption treatment rather than by rewriting the
   * words. Rewriting a caption to fit a bad backdrop is fixing the wrong thing.
   */
  'visual.contrast': {
    rootCause: 'Captions do not clear the contrast floor against what is behind them.',
    component: 'caption_style',
    action: 'adjust_caption_treatment',
    correctable: true,
  },
  'visual.text_clipped': {
    rootCause: 'Text runs outside the frame or through another element.',
    component: 'composition',
    action: 'adjust_caption_treatment',
    correctable: true,
  },
  'visual.safe_area': {
    rootCause: 'Content sits where the platform draws its own interface over it.',
    component: 'composition',
    action: 'adjust_caption_treatment',
    correctable: true,
  },
  'visual.caption_drift': {
    rootCause: 'Captions have drifted out of sync with the narration.',
    component: 'voiceover',
    action: 'resynthesise_voiceover',
    correctable: true,
  },

  /*
   * These describe the *file*, not the creative. A render at the wrong
   * resolution or aspect ratio is a composition selection problem; the words
   * and the plan are innocent.
   */
  'visual.aspect_ratio': {
    rootCause: 'The render does not match the aspect ratio the platform expects.',
    component: 'composition',
    action: 'adjust_caption_treatment',
    correctable: true,
  },
  'visual.resolution': {
    rootCause: 'The render is below the resolution the platform expects.',
    component: 'composition',
    action: 'adjust_caption_treatment',
    correctable: true,
  },
  'visual.black_frames': {
    rootCause: 'The render contains frames with nothing on them.',
    component: 'creative_plan',
    action: 'adjust_scene_timing',
    correctable: true,
  },
  'visual.duration': {
    rootCause: 'The render is outside the platform’s duration limits.',
    component: 'creative_plan',
    action: 'adjust_scene_timing',
    correctable: true,
  },

  /*
   * Loudness and true peak are measured on the mix, and the mix is produced by
   * a deterministic ffmpeg filter chain. If those fail the fault is in
   * synthesis or normalisation, not in anything a writer chose.
   */
  'visual.loudness': {
    rootCause: 'The mix is off the loudness target.',
    component: 'voiceover',
    action: 'resynthesise_voiceover',
    correctable: true,
  },
  'visual.true_peak': {
    rootCause: 'The mix exceeds the true-peak ceiling.',
    component: 'voiceover',
    action: 'resynthesise_voiceover',
    correctable: true,
  },

  /*
   * The vision rubric is the independent reviewer's own judgement of the
   * frames. It is perception, and it is deliberately *not* given a component of
   * its own: a model's overall impression is not a licence to rewrite the post.
   * It escalates, so a person decides.
   */
  'visual.vision_rubric': {
    rootCause: 'The independent reviewer judged the frames below the rubric, without naming a mechanical fault.',
    component: 'evidence',
    action: 'escalate',
    correctable: false,
  },

  'destination.missing': {
    rootCause: 'The post sends people nowhere.',
    component: 'link',
    action: 'fix_destination',
    correctable: true,
  },

  /*
   * A quoted testimonial with no consent recorded cannot be corrected by
   * generation. There is no version of this that is fixed by rewriting: either
   * the consent exists and was not linked, or the quote must not be published.
   */
  'proof.no_consent': {
    rootCause: 'A quoted testimonial has no recorded consent.',
    component: 'evidence',
    action: 'escalate',
    correctable: false,
  },
  'proof.no_source': {
    rootCause: 'A quoted testimonial resolves to no stored row.',
    component: 'evidence',
    action: 'escalate',
    correctable: false,
  },
};

/**
 * The common case, by rule namespace.
 *
 * Reading the namespace rather than the whole rule is what keeps this table
 * maintainable: a new phrase added to the slop filter is still a copy defect
 * fixed by revising copy, and needs no entry here.
 */
const BY_NAMESPACE: Record<string, PolicyEntry> = {
  /*
   * §214. Length and hashtag findings are all "the writing is fine, the
   * container is wrong" — a caption carrying an essay, an opening that will be
   * truncated, a hashtag count the platform does not reward. Every one is
   * fixed by rewriting the copy, and none of them by re-planning the piece.
   */
  budget: {
    rootCause: 'The copy does not fit the surface it is going to.',
    component: 'copy',
    action: 'revise_copy',
    correctable: true,
  },

  /*
   * §205. Creative defects are plan defects.
   *
   * Every rule this gate raises is about *how the story was laid out* — which
   * evidence was used, whether the beats vary, whether anything is held. None
   * of them is fixed by writing different words, and all of them are fixed by
   * planning again, so the namespace default is the plan.
   *
   * The two exceptions below are exceptions for opposite reasons: one is not a
   * plan problem at all, and one has no plan left to fix.
   */
  creative: {
    rootCause: 'The creative plan does not use the material well.',
    component: 'creative_plan',
    action: 'resequence_scenes',
    correctable: true,
  },

  // Every slop-filter namespace. All of them are the same defect — words that
  // should not have been written — and the same correction.
  construction: { rootCause: 'A banned construction reached the copy.', component: 'copy', action: 'revise_copy', correctable: true },
  phrase: { rootCause: 'A banned phrase reached the copy.', component: 'copy', action: 'revise_copy', correctable: true },
  emoji: { rootCause: 'Emoji use is outside the platform policy.', component: 'copy', action: 'revise_copy', correctable: true },
  hashtags: { rootCause: 'The hashtag count is outside the platform ceiling.', component: 'copy', action: 'revise_copy', correctable: true },
  length: { rootCause: 'The copy is outside the platform length limit.', component: 'copy', action: 'revise_copy', correctable: true },
  punctuation: { rootCause: 'Punctuation is outside the house style.', component: 'copy', action: 'revise_copy', correctable: true },
  structure: { rootCause: 'The copy structure is outside the house style.', component: 'copy', action: 'revise_copy', correctable: true },
  copy: { rootCause: 'The copy is empty or unusable.', component: 'copy', action: 'revise_copy', correctable: true },

  /*
   * `internals` is a leak of build detail — a branch name, a commit SHA, a file
   * path — into copy meant for the public. Correctable, and worth its own root
   * cause because it means an upstream prompt was fed something it should not
   * have been.
   */
  internals: { rootCause: 'Build internals leaked into public copy.', component: 'copy', action: 'revise_copy', correctable: true },

  /*
   * A hard block is a claim the system must never publish — a medical
   * guarantee, a competitor mention, a nutrition assertion it cannot stand
   * behind. Correctable by removing it, and never by softening it, which is why
   * it reroutes through the claims path rather than a plain copy revision.
   */
  hard_block: { rootCause: 'The copy contains a claim that must never be published.', component: 'claims', action: 'reground_claims', correctable: true },

  /*
   * Delivery findings — a flat read, a laboured word, sentences run together, a
   * rushed open — are all descriptions of *how the script was spoken*, and the
   * only lever this system has over that is the script's own structure. There
   * is no speed or prosody control in `SynthesisOptions`; there are full stops,
   * commas and sentence length. So they route where pacing routes.
   */
  delivery: { rootCause: 'The read is uneven, and the only lever available is the script’s sentence structure.', component: 'vo_script', action: 'rewrite_vo_script', correctable: true },

  // Spoken-slop rules apply to the narration, wherever they are raised from.
  spoken: { rootCause: 'The narration contains filler the house style bans.', component: 'vo_script', action: 'rewrite_vo_script', correctable: true },

  retention: { rootCause: 'The opening or the pacing does not hold a viewer.', component: 'creative_plan', action: 'adjust_scene_timing', correctable: true },
  coherence: { rootCause: 'What is said and what is shown do not line up.', component: 'creative_plan', action: 'resequence_scenes', correctable: true },
  visual_slop: { rootCause: 'The render is visually inert.', component: 'creative_plan', action: 'adjust_scene_timing', correctable: true },
  claims: { rootCause: 'A claim is not supported by the artifact.', component: 'claims', action: 'reground_claims', correctable: true },
  destination: { rootCause: 'The destination is wrong for this platform.', component: 'link', action: 'fix_destination', correctable: true },
  proof: { rootCause: 'A quoted testimonial does not check out.', component: 'evidence', action: 'escalate', correctable: false },
  visual: { rootCause: 'The rendered frames failed a visual check.', component: 'composition', action: 'adjust_caption_treatment', correctable: true },
  audio: { rootCause: 'The voiceover failed an audio check.', component: 'voiceover', action: 'resynthesise_voiceover', correctable: true },
};

/**
 * A measurement that did not happen is not a defect in the artifact.
 *
 * `audio.not_measured`, `coherence.not_measured` and a gate that reports
 * `skipped` are all statements about the *pipeline*, and correcting the content
 * cannot make them go away. They re-measure once; if the measurement still does
 * not happen, the controller escalates rather than rewriting a post that may be
 * perfectly fine.
 */
function isMeasurementFault(rule: string): boolean {
  return rule.endsWith('.not_measured') || rule.endsWith('.unspecified');
}

export function policyFor(
  rule: string,
  /**
   * The gate that raised it. Unused today and deliberately kept: the rule is
   * the join key, and a policy that fell back to the gate name would let a new
   * rule get a plausible-looking correction rather than the refusal that the
   * coverage test is there to force someone to replace.
   */
  _gate: GateName,
): PolicyEntry {
  if (isMeasurementFault(rule)) {
    return {
      rootCause: 'This check did not run, so nothing about the artifact was established either way.',
      component: 'measurement',
      action: 'remeasure',
      correctable: true,
    };
  }

  const exact = BY_RULE[rule];
  if (exact) return exact;

  const namespace = rule.split('.')[0] ?? '';
  const byNamespace = BY_NAMESPACE[namespace];
  if (byNamespace) return byNamespace;

  /*
   * An unknown rule escalates rather than guessing.
   *
   * The coverage test should make this unreachable for rules that exist in the
   * repository. It is here for the case it cannot cover: a gate whose findings
   * come from a provider response rather than from source, where a new rule
   * string can appear without any code changing.
   */
  return {
    rootCause: `No correction policy covers ${rule}, so it is not safe to guess one.`,
    component: 'evidence',
    action: 'escalate',
    correctable: false,
  };
}

/**
 * What a given action is allowed to change, and what it must leave alone.
 *
 * The second half is the point. §4 of the brief that produced this file asks
 * for a policy that "explicitly prevents unrelated portions of a successful
 * artifact from being unnecessarily changed" — so the forbidden list is data,
 * checked by `assertScope` before a correction is applied, rather than a
 * property the correction code is trusted to have.
 */
export interface ActionScope {
  /** Components this action may write. */
  may: Component[];
  /** Components this action must not write, stated rather than implied. */
  mustNot: Component[];
}

export const ACTION_SCOPE: Record<CorrectionAction, ActionScope> = {
  revise_copy: {
    may: ['copy'],
    mustNot: ['claims', 'creative_plan', 'voiceover', 'composition', 'link'],
  },
  reground_claims: {
    // A claim lives in the copy, so regrounding one necessarily rewrites words.
    may: ['claims', 'copy'],
    mustNot: ['creative_plan', 'voiceover', 'composition', 'link'],
  },
  fix_destination: {
    may: ['link'],
    mustNot: ['copy', 'claims', 'creative_plan', 'voiceover', 'composition'],
  },
  rewrite_vo_script: {
    // The script only. The post's own words are a separate artifact and a
    // pacing problem in the narration is no reason to touch them.
    may: ['vo_script', 'voiceover'],
    mustNot: ['copy', 'claims', 'creative_plan', 'composition', 'link'],
  },
  resynthesise_voiceover: {
    // The same script, said again. Not even the script may change here — that
    // is `rewrite_vo_script`, and conflating them is how a pronunciation fix
    // turns into a rewrite.
    may: ['voiceover'],
    mustNot: ['copy', 'claims', 'vo_script', 'creative_plan', 'composition', 'link'],
  },
  adjust_caption_treatment: {
    may: ['caption_style', 'composition'],
    mustNot: ['copy', 'claims', 'vo_script', 'voiceover', 'link'],
  },
  adjust_scene_timing: {
    may: ['creative_plan'],
    mustNot: ['copy', 'claims', 'vo_script', 'voiceover', 'link'],
  },
  resequence_scenes: {
    may: ['creative_plan'],
    mustNot: ['copy', 'claims', 'vo_script', 'voiceover', 'link'],
  },
  remeasure: {
    // Measuring changes nothing about the artifact. That is the whole point.
    may: ['measurement'],
    mustNot: ['copy', 'claims', 'vo_script', 'voiceover', 'creative_plan', 'composition', 'link'],
  },
  escalate: {
    may: [],
    mustNot: ['copy', 'claims', 'vo_script', 'voiceover', 'creative_plan', 'composition', 'link'],
  },
};

/**
 * Whether a set of actually-changed components was permitted.
 *
 * Called *after* a correction runs, against what it really wrote, so the check
 * is on behaviour rather than intent.
 */
export function assertScope(
  action: CorrectionAction,
  changed: Component[],
): { ok: true } | { ok: false; violation: string } {
  const scope = ACTION_SCOPE[action];
  for (const component of changed) {
    if (scope.mustNot.includes(component)) {
      return {
        ok: false,
        violation: `${action} changed ${component}, which it is not permitted to touch.`,
      };
    }
    if (!scope.may.includes(component)) {
      return {
        ok: false,
        violation: `${action} changed ${component}, which is outside its declared scope.`,
      };
    }
  }
  return { ok: true };
}
