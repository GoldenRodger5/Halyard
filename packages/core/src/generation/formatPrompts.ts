/**
 * Format-split copywriter prompts. Milestone 27, Parts A and B.
 *
 * One prompt per platform was too coarse. A carousel, a single image and a Reel
 * script are three different crafts on Instagram alone, and a prompt that covers
 * all three produces the average of them.
 *
 * Part B — every format prompt states the same caption architecture explicitly:
 *
 *   Hook   first 3 to 5 words, works with no context
 *   Body   the specific claim, traced to the artifact
 *   Turn   the counterintuitive part. This is what earns the save
 *   Close  no CTA on most posts. A CTA every time trains people to scroll
 */

export type FormatSubtype =
  | 'insight'
  | 'thread'
  | 'carousel'
  | 'single'
  | 'reel_script'
  | 'script'
  | 'pin'
  | 'short'
  | 'post'
  | 'take'
  | 'tip';

export interface FormatSpec {
  id: `${string}/${FormatSubtype}`;
  platform: string;
  subtype: FormatSubtype;
  promptFile: string;
  version: string;
  /** What the model is actually being asked to write. */
  craft: string;
  /** Shape rules specific to this format, appended to the shared architecture. */
  rules: string[];
  /** Extra JSON fields this format returns beyond the shared contract. */
  extraOutput?: Record<string, string>;
  isVideo: boolean;
}

/** Part B, stated once and injected into every format prompt. */
export const CAPTION_ARCHITECTURE = `CAPTION ARCHITECTURE — every post has these four parts, in order:

HOOK    The first three to five words. Must work with no context at all, because
        that is all a scrolling reader sees. Never open with a question unless
        the question IS the insight.
BODY    The specific claim. Every factual part traces to the artifact.
TURN    The counterintuitive part — the thing the reader did not expect. This is
        what earns the save, and saves are worth two to three times a like.
CLOSE   Most posts have no call to action. A CTA every time trains people to
        scroll past the end of your posts.`;

export const FORMAT_SPECS: FormatSpec[] = [
  {
    id: 'x/insight',
    platform: 'x',
    subtype: 'insight',
    promptFile: 'prompts/copywriter/x/insight.v1.md',
    version: 'copywriter.x.insight.v1',
    craft: 'One observation, stated plainly, in under 280 characters.',
    rules: [
      'No link in the body. The link goes in a reply, so do not write one.',
      'Zero to two hashtags, and usually zero.',
      'The best posts here are one observation and nothing else. Resist the urge to add a second.',
      'No thread-bait numbering, no "a thread 🧵".',
    ],
    isVideo: false,
  },
  {
    id: 'x/thread',
    platform: 'x',
    subtype: 'thread',
    promptFile: 'prompts/copywriter/x/thread.v1.md',
    version: 'copywriter.x.thread.v1',
    craft: 'A short sequence where the first post stands alone.',
    rules: [
      'The first post must be worth reading even if nobody expands it. If it only makes sense as a setup, rewrite it.',
      'Three to six posts. Longer is a blog post pretending to be a thread.',
      'Each post carries one idea and ends without a cliffhanger tease.',
      'No numbering in the text. The client already numbers them.',
    ],
    extraOutput: { posts: 'array of strings, one per post in the thread' },
    isVideo: false,
  },
  {
    id: 'instagram/carousel',
    platform: 'instagram',
    subtype: 'carousel',
    promptFile: 'prompts/copywriter/instagram/carousel.v1.md',
    version: 'copywriter.instagram.carousel.v1',
    craft: 'Slide by slide, one idea per slide, plus the caption underneath.',
    rules: [
      'One idea per slide. A slide with two ideas is two slides.',
      'Slide 1 is the hook and nothing else. It is the only slide most people see.',
      'The last slide is the payoff, not a call to action.',
      'Slides carry short lines, not paragraphs. If a slide needs three sentences it needs to be two slides.',
      'Three to eight hashtags in the caption.',
    ],
    extraOutput: {
      slides: 'array of {kicker, headline, body_lines[]} — between 4 and 8 slides',
    },
    isVideo: false,
  },
  {
    id: 'instagram/single',
    platform: 'instagram',
    subtype: 'single',
    promptFile: 'prompts/copywriter/instagram/single.v1.md',
    version: 'copywriter.instagram.single.v1',
    craft: 'One image and a caption that earns the read.',
    rules: [
      'The first line shows in the feed. Everything after it is opt-in.',
      'Links are not clickable. Never write "link in bio" as an instruction; say the thing instead.',
      'Three to eight hashtags.',
    ],
    isVideo: false,
  },
  {
    id: 'instagram/reel_script',
    platform: 'instagram',
    subtype: 'reel_script',
    promptFile: 'prompts/copywriter/instagram/reel_script.v1.md',
    version: 'copywriter.instagram.reel_script.v1',
    craft: 'A script written for motion and captions, not prose.',
    rules: [
      'Written for the ear and the eye at once. Short sentences, under twelve words.',
      'Open on content. No greeting, no "in this video", no restatement of the title.',
      'Structure as an open loop: the hook opens a curiosity gap, and each stage answers part of it while opening the next. Not one fact stated once.',
      'A visual beat every ten to fifteen seconds. Say what changes on screen.',
      'End on a frame that reads as a continuation of the opening, so the loop earns a replay.',
      'Numbers spoken as words: "four hundred fifty degrees", never "450F".',
    ],
    extraOutput: {
      beats: 'array of {seconds, spoken, on_screen, visual} covering the whole runtime',
    },
    isVideo: true,
  },
  {
    id: 'tiktok/script',
    platform: 'tiktok',
    subtype: 'script',
    promptFile: 'prompts/copywriter/tiktok/script.v1.md',
    version: 'copywriter.tiktok.script.v1',
    craft: 'A script whose verbal hook lands inside 1.5 seconds.',
    rules: [
      'The first spoken sentence must land inside 1.5 seconds. Count the words: about four.',
      'Open on content. No greeting, no preamble, no throat-clearing.',
      'A visual beat every ten to fifteen seconds.',
      'End loop-ready.',
      'Three to five hashtags in the caption.',
      'Numbers spoken as words.',
    ],
    extraOutput: {
      beats: 'array of {seconds, spoken, on_screen, visual} covering the whole runtime',
    },
    isVideo: true,
  },
  {
    id: 'pinterest/pin',
    platform: 'pinterest',
    subtype: 'pin',
    promptFile: 'prompts/copywriter/pinterest/pin.v1.md',
    version: 'copywriter.pinterest.pin.v1',
    craft: 'A keyword-forward title, a description, and alt text, for a search index.',
    rules: [
      'This is a search surface, not a feed. Write the title as a query someone would actually type.',
      'No hashtags at all.',
      'Alt text is a ranking signal here. Write it as a description of the image, not a repeat of the title.',
      'The destination link is a field, not something you write into the copy.',
    ],
    isVideo: false,
  },
  {
    id: 'youtube/short',
    platform: 'youtube',
    subtype: 'short',
    promptFile: 'prompts/copywriter/youtube/short.v1.md',
    version: 'copywriter.youtube.short.v1',
    craft: 'A title, and a description whose first line is the only line most people see.',
    rules: [
      'The title carries the hook. Under sixty characters so it does not truncate.',
      'The first line of the description sits above the fold; everything after it is opt-in.',
      'Up to five tags.',
      'Do not write "#Shorts" — the adapter adds it.',
    ],
    isVideo: true,
  },
  {
    id: 'threads/post',
    platform: 'threads',
    subtype: 'post',
    promptFile: 'prompts/copywriter/threads/post.v1.md',
    version: 'copywriter.threads.post.v1',
    craft: 'Conversational, closer to X than Instagram, with links that work inline.',
    rules: [
      'Links are clickable inline, so the link can go in the post.',
      '500 characters. Conversational rather than declarative.',
      'Zero to three hashtags.',
    ],
    isVideo: false,
  },
  {
    id: 'founder/take',
    platform: 'x',
    subtype: 'take',
    promptFile: 'prompts/copywriter/founder/take.v1.md',
    version: 'copywriter.founder.take.v1',
    craft: 'News commentary carrying an opinion the founder actually expressed.',
    rules: [
      'The opinion is the founder\'s and arrives as input. Sand nothing.',
      'Do not neutralise a strong claim into a balanced summary. If the input is a strong claim, the output is a strong claim.',
      'Clean up grammar, structure, length and rhythm. Not stance, not hedging, not added caveats.',
      'No hashtags.',
      'Never invent a position the founder did not state.',
    ],
    isVideo: false,
  },
  {
    id: 'founder/tip',
    platform: 'x',
    subtype: 'tip',
    promptFile: 'prompts/copywriter/founder/tip.v1.md',
    version: 'copywriter.founder.tip.v1',
    craft: 'A tool or technique worth sharing, in the founder\'s voice.',
    rules: [
      'Say what it is, what it replaced, and what it cost. Concrete beats enthusiastic.',
      'No affiliate framing, no "you need this".',
      'One link, inline, at the end.',
    ],
    isVideo: false,
  },
];

export function findFormatSpec(platform: string, subtype: string): FormatSpec | null {
  return (
    FORMAT_SPECS.find((spec) => spec.platform === platform && spec.subtype === subtype) ?? null
  );
}

/**
 * Pick a format for a platform when the caller only knows the broad format.
 * Keeps the mapping in one place rather than scattered through the generate job.
 */
export function defaultSubtypeFor(platform: string, format: string): FormatSubtype {
  if (platform === 'pinterest') return 'pin';
  if (platform === 'youtube') return 'short';
  if (platform === 'tiktok') return 'script';
  if (platform === 'threads') return 'post';
  if (platform === 'instagram') {
    if (format === 'carousel') return 'carousel';
    if (format === 'video') return 'reel_script';
    return 'single';
  }
  return format === 'text' ? 'insight' : 'insight';
}

/** The format-specific half of the system prompt. */
export function formatPromptBlock(spec: FormatSpec): string {
  const output = spec.extraOutput
    ? `\n\nThis format also returns:\n${Object.entries(spec.extraOutput)
        .map(([key, description]) => `  "${key}": ${description}`)
        .join('\n')}`
    : '';

  return `FORMAT — ${spec.id}
${spec.craft}

${spec.rules.map((rule) => `- ${rule}`).join('\n')}

${CAPTION_ARCHITECTURE}${output}`;
}
