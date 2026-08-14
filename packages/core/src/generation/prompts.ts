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

export const PLATFORM_BRIEFS: Record<SlopPlatform, string> = {
  x: `X. 280 characters. No link in the body — the link goes in a reply, so do not
write one. Zero to two hashtags, and usually zero. The best posts here are one
observation stated plainly.`,
  instagram: `Instagram caption. Up to 2,200 characters but the first line is what
shows in the feed. Three to eight hashtags. Links are not clickable, so never
write "link in bio" as if it were an instruction — say the thing instead.`,
  tiktok: `TikTok caption. Short. Three to five hashtags. The video carries the
message; the caption adds the one thing the video could not show.`,
  pinterest: `Pinterest. Keyword-forward, because this is a search index, not a
feed. No hashtags at all. Write the title as a search query someone would type.`,
  youtube: `YouTube Shorts description. The first line sits above the fold and is
the only line most viewers see. Up to five tags.`,
  threads: `Threads. 500 characters. Links are clickable inline. Conversational,
closer to X than Instagram.`,
  bluesky: `Bluesky. 300 characters. Links are clickable and unfurl into a card,
so the URL does not need describing. Zero to two hashtags and usually zero. This
audience is unusually allergic to marketing register: write it the way you would
say it to someone who already knows the subject.`,
};

export const COPYWRITER_PROMPT_VERSION = 'copywriter.v1';

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
    `Hard ceiling: ${BODY_LIMITS[context.platform]} characters including hashtags. The platform rejects anything longer.`,
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
  "body": "the post copy",
  "title": "only for Pinterest and YouTube, otherwise omit",
  "alt_text": "one sentence describing the image for a screen reader, always present",
  "hashtags": ["without", "the", "hash"],
  "hook_pattern": "the shape of your opening, e.g. 'Why your {thing} is {problem}.'",
  "claims": [
    {"text": "each factual claim you made", "source": "path.into[0].the.artifact"}
  ]
}

Every factual claim needs a source path that resolves against the artifact JSON
below. A claim you cannot source is a claim you must not make.`,
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

  const artifactBlock = context.artifact
    ? `\n## The artifact — real product output, the only source of fact\nHeadline: ${
        context.artifact.headline
      }\n\nHighlights:\n${context.artifact.highlights
        .map((h) => `- (${h.sourcePath}) ${h.reason ?? h.note ?? h.text ?? `${h.before} → ${h.after}`}`)
        .join('\n')}\n\nFull JSON:\n${JSON.stringify(context.artifact.raw, null, 2).slice(0, 6000)}`
    : '\n## No artifact\nThis post is not built from product output. Make no factual claims about a transformation.';

  const user = [
    `## Product\n${context.productBrief.slice(0, 2000)}`,
    `\n## The idea\n${context.idea.title}\n${context.idea.angle}`,
    `\n## This post\nPlatform: ${context.platform}. Format: ${context.format}. Category: ${context.category}.`,
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
    input.signals.length > 0
      ? `\n## Unconsumed signals\n${input.signals.map((s) => `- [${s.source}] ${s.summary}`).join('\n')}`
      : '',
    input.recentTitles.length > 0
      ? `\n## Posted in the last 60 days — do not repeat these\n${input.recentTitles.map((t) => `- ${t}`).join('\n')}`
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
