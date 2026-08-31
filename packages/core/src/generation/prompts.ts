/**
 * Prompt assembly. v1 §4.4.
 *
 * Prompt *text* lives in versioned files under prompts/ so a quality regression
 * is traceable to a prompt change; this module assembles them with runtime
 * context and stamps the version onto generation_meta.
 *
 * The hard-rules block is duplicated here rather than imported from a file
 * because it must be impossible to ship a copywriter call without it.
 */
import type { SlopPlatform } from '../qc/slopFilter.js';
import { BODY_LIMITS, HASHTAG_LIMITS } from '../qc/slopFilter.js';
import { budgetFor } from '../copy/budget.js';
import {
  CAPTION_ARCHITECTURE,
  formatSpecBlock,
  selectFormatSpec,
  type FormatSubtype,
} from './formatPrompts.js';
import type { ProductArtifact } from '../connectors/types.js';

/** v1 §4.4 — every copywriter prompt ends with this. */
export const HARD_RULES_BLOCK = `HARD RULES — violating any of these makes the output unusable:
- Never claim nutrition figures are accurate or verified.
- Never state a substitution is a perfect 1:1 replacement.
- Never invent product capabilities not present in the brief.
- Never mention a competitor by name.
- Every factual claim about a transformation must trace to the artifact provided.`;

/** v2 F.1, restated as instructions rather than as a filter. */
export const STYLE_RULES_BLOCK = `STYLE — the automated lint rejects all of these, so writing them wastes a call:
- No em dashes. None. Rewrite the sentence or use a period.
- No en dashes outside numeric ranges. No ellipsis character. Straight quotes only.
- At most one emoji, and only where it carries meaning. Never a rocket.
- Banned: "not just X, it's Y", "let's dive in", "in today's fast-paced world",
  "game changer", "revolutionize", "10x", "unlock", "elevate", "the secret to",
  "here's the thing", "whether you're X or Y", "that's where {product} comes in",
  "seamlessly", "effortlessly", "leverage", "utilize", "robust", "delve",
  "tapestry", "testament to", "navigate the landscape".
- Opening line: twelve words maximum. The hook is the first three to five words.
- Average sentence under twenty-two words, and vary the lengths wildly. Uniform
  rhythm is the strongest tell that a machine wrote it.
- Do not start three consecutive sentences with the same word.
- At most one rule-of-three list, and preferably none.
- No stacked adjectives.`;

export interface CopywriterContext {
  platform: SlopPlatform;
  format: string;
  /** Overrides the default subtype for this platform-and-format pair. */
  formatSubtype?: FormatSubtype;
  category: string;
  persona: 'founder' | 'brand';
  idea: { title: string; angle: string };
  /**
   * §370. The piece this caption goes under, once it exists.
   *
   * Absent for a transformation, which is about the artifact and has no slots,
   * and absent wherever the caption genuinely is the whole post.
   */
  piece?: Array<{ key: string; text: string }> | null;
  /**
   * Whether this format's claims are *about* the artifact. §405.
   *
   * `false` for a quiz, a history, a myth-buster — anything grounded in its own
   * researched sources rather than in product output. §291 already used this to
   * decide what to verify claims against; the prompt never asked.
   */
  verifyClaimsAgainstArtifact?: boolean;
  /**
   * The shape this caption should take on the screen. §419.
   *
   * A brief, not a template — nothing decides the words here, only the form.
   * Chosen by `chooseCaptionShape` from what the piece can honestly fill and
   * what the account has not written lately, because an account whose every
   * caption is a three-line paragraph with the same rhythm reads as automated
   * within a fortnight and no gate catches it.
   */
  captionShape?: { shape: string; brief: string } | null;
  artifact?: ProductArtifact | null;
  voice: {
    displayName: string;
    description: string;
    doRules: string[];
    dontRules: string[];
    examples: Array<{ platform?: string; text: string; why_good?: string }>;
    antiExamples?: Array<{ text: string; why_bad?: string }>;
  };
  productBrief: string;
  contentRules: { forbiddenClaims?: string[]; bannedPhrases?: string[] };
  hooks: string[];
  series?: { name: string; nextSequence: number } | null;
}

/**
 * What each surface actually wants. §215.
 *
 * These used to quote the platform's own ceiling — "Up to 2,200 characters" for
 * Instagram, "Short" with no number for TikTok — and the request block below
 * added "Hard ceiling: 2200 characters". A model told *short* and *2,200* wrote
 * 472, which is exactly what it was asked for and roughly five times what
 * anyone reads before the fold.
 *
 * The ceiling is a rejection threshold, not a brief. Each entry now carries the
 * number that matters, and says where the longer version goes — because the
 * essay is not the problem, putting it in the caption is.
 */
export const PLATFORM_BRIEFS: Record<SlopPlatform, string> = {
  x: `X. 280 characters, and the best posts are nearer 240. No link in the body —
the link goes in a reply, so do not write one. Zero to two hashtags, and usually
zero. One observation stated plainly.`,
  instagram: `Instagram caption. Aim for 220 characters. About 125 show before
"more", so the first sentence has to work alone. Three to eight hashtags. Links
are not clickable, so never write "link in bio" as if it were an instruction —
say the thing instead. Anything longer than the caption needs belongs in
\`overflow\`, which is posted as the first comment.`,
  tiktok: `TikTok caption. Aim for 150 characters — about 90 show before "more".
The video carries the message; the caption adds the one thing the video could
not show. Three to five hashtags. If you have more to say, it goes in
\`overflow\` and is posted as the first comment, where it will actually be read.`,
  pinterest: `Pinterest. Keyword-forward, because this is a search index, not a
feed. Around 400 characters is right. No hashtags at all. Write the title as a
search query someone would type.`,
  youtube: `YouTube Shorts description. Aim for 350 characters. The first line
sits above the fold and is the only line most viewers see. Up to five tags.`,
  threads: `Threads. 500 characters and aim for 300. Links are clickable inline.
Conversational, closer to X than Instagram. A longer thought goes in
\`overflow\`, posted as a reply in the same thread.`,
  bluesky: `Bluesky. 300 characters and aim for 260. Links are clickable and
unfurl into a card, so the URL does not need describing. Zero to two hashtags and
usually zero. This audience is unusually allergic to marketing register: write it
the way you would say it to someone who already knows the subject.`,
};

/**
 * §215. Bumped from v1: the length brief changed materially.
 *
 * `generation_meta.prompt_version` is how a regression is traced, and a stored
 * v1 must keep meaning the brief that quoted the platform ceiling. A prompt
 * whose text changes under a fixed version makes every past attribution a lie.
 */
export const COPYWRITER_PROMPT_VERSION = 'copywriter.v2';

export function buildCopywriterPrompt(context: CopywriterContext): {
  system: string;
  user: string;
  version: string;
} {
  const limits = HASHTAG_LIMITS[context.platform];
  const spec = selectFormatSpec(context.platform, context.format ?? 'image', context.formatSubtype);

  const system = [
    `You are writing one social post as ${context.voice.displayName}, the ${context.persona} voice for a product.`,
    '',
    `VOICE\n${context.voice.description}`,
    context.voice.doRules.length > 0 ? `\nDO\n${context.voice.doRules.map((r) => `- ${r}`).join('\n')}` : '',
    context.voice.dontRules.length > 0
      ? `\nDO NOT\n${context.voice.dontRules.map((r) => `- ${r}`).join('\n')}`
      : '',
    '',
    `PLATFORM\n${PLATFORM_BRIEFS[context.platform]}`,
    `Hashtags: ${limits.min} to ${limits.max}.`,
    /*
     * §215. The budget first, the ceiling second and clearly labelled as a
     * rejection threshold. Stated the other way round, a model reads the larger
     * number as the target — which is how a 150-character surface got 472.
     */
    `Aim for ${budgetFor(context.platform, context.formatSubtype).target} characters. ` +
      `About ${budgetFor(context.platform, context.formatSubtype).visible} show before the fold.`,
    `Hard ceiling: ${BODY_LIMITS[context.platform]} characters including hashtags — a rejection threshold, not a target.`,
    '',
    /**
     * The format spec, which selects between eleven declared craft prompts.
     *
     * Nothing chose between them before, so a carousel and a single image were
     * written identically and the slide structure a carousel needs was never
     * asked for. Absent for platforms with no spec, which get the shared
     * architecture alone rather than a near-match borrowed from a neighbour.
     */
    spec ? formatSpecBlock(spec) : '',
    CAPTION_ARCHITECTURE,
    '',
    STYLE_RULES_BLOCK,
    '',
    context.contentRules.forbiddenClaims?.length
      ? `FORBIDDEN CLAIMS FOR THIS PRODUCT\n${context.contentRules.forbiddenClaims.map((c) => `- ${c}`).join('\n')}\n`
      : '',
    context.contentRules.bannedPhrases?.length
      ? `ALSO BANNED\n${context.contentRules.bannedPhrases.join(', ')}\n`
      : '',
    HARD_RULES_BLOCK,
    '',
    `OUTPUT — reply with this JSON object and nothing else:
{
  "body": "the post copy, inside the character budget above",
  "overflow": "optional. Anything worth saying that did not fit the budget. Posted as a first comment or reply, never discarded. Omit when the body says everything.",
  "title": "only for Pinterest and YouTube, otherwise omit",
  "alt_text": "one sentence describing the image for a screen reader, always present",
  "hashtags": ["without", "the", "hash"],
  "hook_pattern": "the shape of your opening, e.g. 'Why your {thing} is {problem}.'",
  "claims": [
    {"text": "each factual claim you made", "source": "path.into[0].the.artifact"}
  ]
}

Every factual claim needs a source path that resolves against the artifact JSON
below. A claim you cannot source is a claim you must not make.

Do not pad the body to reach the budget, and do not cut a thought to fit it —
move it to \`overflow\`. A short caption with a strong first line beats a
complete one nobody expands.`,
  ]
    .filter(Boolean)
    .join('\n');

  const exampleBlock =
    context.voice.examples.length > 0
      ? `\n## Posts that sound right\n${context.voice.examples
          .slice(0, 5)
          .map((e, i) => `${i + 1}. ${e.text}${e.why_good ? `\n   (works because: ${e.why_good})` : ''}`)
          .join('\n')}`
      : '';

  const antiExampleBlock =
    context.voice.antiExamples?.length
      ? `\n## Rejected drafts, and why\n${context.voice.antiExamples
          .slice(0, 5)
          .map((e, i) => `${i + 1}. ${e.text}\n   (rejected: ${e.why_bad ?? 'no reason recorded'})`)
          .join('\n')}`
      : '';

  const hookBlock =
    context.hooks.length > 0
      ? `\n## Hook patterns that have worked\n${context.hooks.map((h) => `- ${h}`).join('\n')}`
      : '';

  const seriesBlock = context.series
    ? `\n## Series\nThis fills slot #${context.series.nextSequence} of "${context.series.name}". Keep the shape recognisable.`
    : '';

  /*
   * §405. The artifact is the source of fact only for a format that is about
   * the artifact.
   *
   * This block calls it *"the only source of fact"* and hands over six thousand
   * characters of raw JSON. For a `history` or a `quiz` — grounded in its own
   * researched, verified sources — that artifact is an unrelated recipe the
   * connector happened to generate, and against a three-hundred-character
   * `pieceBlock` it wins on sheer volume and on being called the only source of
   * fact.
   *
   * Live: a piece about the origins of sourdough, correctly written and
   * correctly cited, captioned *"Watery tofu sauce happens. Press 2 lbs
   * extra-firm tofu dry…"* — because the artifact was Baked Pineapple Teriyaki
   * Tofu and the prompt said to believe it.
   *
   * §291 already decided this: `verifyClaimsAgainstArtifact` is false for any
   * format whose factuality is not `product`. That decision governed what
   * claims were *checked* against and never reached the prompt that writes
   * them.
   */
  const artifactIsTheSubject = context.verifyClaimsAgainstArtifact !== false;
  const artifactBlock =
    context.artifact && artifactIsTheSubject
      ? `\n## The artifact — real product output, the only source of fact\nHeadline: ${
          context.artifact.headline
        }\n\nHighlights:\n${context.artifact.highlights
          .map((h) => `- (${h.sourcePath}) ${h.reason ?? h.note ?? h.text ?? `${h.before} → ${h.after}`}`)
          .join('\n')}\n\nFull JSON:\n${JSON.stringify(context.artifact.raw, null, 2).slice(0, 6000)}`
      : context.piece?.length
        ? '\n## No artifact\nThis post is not built from product output. It is grounded in the ' +
          'lines above and the sources they cite. Write about those, and make no ' +
          'factual claims about a transformation.'
        : '\n## No artifact\nThis post is not built from product output. Make no factual claims about a transformation.';

  /**
   * §370. The piece itself, when there is one.
   *
   * A caption introduces something. Written from the idea alone it can only
   * describe what the piece was *meant* to be, which is how captions ended up
   * reading as plausible summaries of a video nobody had made yet. Given the
   * actual lines, it can point at them.
   *
   * Explicitly told not to repeat them: a caption that restates the first card
   * spends the one line a scroller reads on something they are about to see
   * anyway.
   */
  const pieceBlock =
    context.piece && context.piece.length > 0
      ? `\n## The piece this caption goes under\nThese are its actual lines, in order:\n${context.piece
          .map((slot) => `- ${slot.key}: ${slot.text}`)
          .join('\n')}\n\nWrite a caption that earns the watch. Do not restate the first line — the reader is about to see it.`
      : '';

  /*
   * §419. The shape, stated as a constraint on form and nothing else.
   *
   * Placed with the request rather than the voice rules: it is what this
   * caption must *be*, not how the brand generally sounds, and a shape buried
   * among the style guidance is read as a preference.
   */
  const shapeBlock = context.captionShape
    ? `\n## The shape this one takes\n${context.captionShape.brief}`
    : '';

  const user = [
    `## Product\n${context.productBrief.slice(0, 2000)}`,
    `\n## The idea\n${context.idea.title}\n${context.idea.angle}`,
    `\n## This post\nPlatform: ${context.platform}. Format: ${context.format}. Category: ${context.category}.`,
    shapeBlock,
    pieceBlock,
    seriesBlock,
    hookBlock,
    exampleBlock,
    antiExampleBlock,
    artifactBlock,
  ]
    .filter(Boolean)
    .join('\n');

  return { system, user, version: COPYWRITER_PROMPT_VERSION };
}

export const IDEA_GENERATOR_PROMPT_VERSION = 'idea_generator.v1';

/**
 * How much of one signal reaches the prompt.
 *
 * Signal summaries are assembled from text Halyard did not write — a Reddit
 * title, or an operator's own sentence — so neither is length-bounded at the
 * source.
 */
export const SIGNAL_SUMMARY_CHARS = 300;
/** Enough to recognise a past post without repeating its whole headline. */
export const TITLE_CHARS = 160;

export function buildIdeaGeneratorPrompt(input: {
  productBrief: string;
  voiceSummary: string;
  signals: Array<{ source: string; summary: string }>;
  recentTitles: string[];
  topPerformers: Array<{ title: string; category: string; activatedUsers?: number }>;
  mixTargets: Record<string, number>;
  mixActual: Record<string, number>;
  seasonalWindow: string[];
  count: number;
}): { system: string; user: string; version: string } {
  const system = `You propose social content ideas for a product. You are not writing posts; you are proposing angles worth writing.

An idea is good when it is:
- Specific. "Why gluten-free bread needs vinegar" beats "gluten-free baking tips".
- Grounded. It can be demonstrated with real product output, not asserted.
- Counterintuitive, or it solves a problem the reader already has.
- Renderable. It has a visual shape.

An idea is bad when it is generic advice, a listicle, product promotion wearing
an educational hat, or something already posted in the last sixty days.

Under-served pillars matter more than good ideas in over-served ones. If the mix
shows education at 8% against a 25% target, weight education heavily.

${HARD_RULES_BLOCK}

Reply with JSON only:
{"ideas":[{"title":"","angle":"the actual insight, two sentences","category":"transformation|education|community|product|founder_insight","rationale":"why now","needs_artifact":true,"suggested_formats":["carousel","video"],"days_until_seasonal_peak":null}]}`;

  const user = [
    `## Product\n${input.productBrief.slice(0, 2500)}`,
    `\n## Voice\n${input.voiceSummary}`,
    `\n## Content mix — target vs actual over 21 days\n${Object.keys(input.mixTargets)
      .map(
        (k) =>
          `- ${k}: target ${(input.mixTargets[k]! * 100).toFixed(0)}%, actual ${(
            (input.mixActual[k] ?? 0) * 100
          ).toFixed(0)}%`,
      )
      .join('\n')}`,
    /**
     * Bounded per line, because two of these fields are not ours.
     *
     * A signal summary is built from a Reddit post title, or from the sentence
     * an operator typed into `/finds` — neither has a length limit, and both
     * land verbatim in a prompt that is paid for by the token. Twenty signals
     * of unbounded length is an input-cost explosion driven by whatever someone
     * else wrote. The same reasoning already caps `productBrief` at 2,500.
     *
     * Truncated rather than dropped: a long signal is still a real signal, and
     * the first 300 characters of a question carry the question.
     */
    input.signals.length > 0
      ? `\n## Unconsumed signals\n${input.signals
          .map((s) => `- [${s.source}] ${s.summary.slice(0, SIGNAL_SUMMARY_CHARS)}`)
          .join('\n')}`
      : '',
    input.recentTitles.length > 0
      ? `\n## Posted in the last 60 days — do not repeat these\n${input.recentTitles
          .map((t) => `- ${t.slice(0, TITLE_CHARS)}`)
          .join('\n')}`
      : '',
    input.topPerformers.length > 0
      ? `\n## Top performers\n${input.topPerformers
          .map((p) => `- ${p.title} (${p.category})${p.activatedUsers ? ` — ${p.activatedUsers} activated users` : ''}`)
          .join('\n')}`
      : '',
    input.seasonalWindow.length > 0 ? `\n## Calendar, next six weeks\n${input.seasonalWindow.map((s) => `- ${s}`).join('\n')}` : '',
    `\n## Ask\nPropose ${input.count} ideas.`,
  ]
    .filter(Boolean)
    .join('\n');

  return { system, user, version: IDEA_GENERATOR_PROMPT_VERSION };
}

export const REPLY_DRAFTER_PROMPT_VERSION = 'reply_drafter.v1';

/**
 * v2 I.1 — the system drafts, a human sends. The prompt says so explicitly so
 * the model does not write anything that reads like an automated reply.
 */
export function buildReplyDraftPrompt(input: {
  postBody: string;
  comment: string;
  authorHandle?: string;
  voiceSummary: string;
}): { system: string; user: string; version: string } {
  return {
    system: `You draft a reply to a comment on a social post. A human reads your draft, edits it, and sends it. You never send anything.

- One or two sentences. Replies are short.
- Answer the actual question. If there is no question, respond to the specific thing they said.
- Never thank someone for engaging. Never ask them to follow, share, or check the bio.
- If this is a support question about a broken product experience, say so in the
  routing field instead of drafting a reply that pretends to fix it.

Voice: ${input.voiceSummary}

${HARD_RULES_BLOCK}

Reply with JSON only:
{"reply":"the draft","is_support_question":false,"sentiment":"positive|neutral|negative|question"}`,
    user: `## The post\n${input.postBody}\n\n## The comment${
      input.authorHandle ? ` from ${input.authorHandle}` : ''
    }\n${input.comment}`,
    version: REPLY_DRAFTER_PROMPT_VERSION,
  };
}
