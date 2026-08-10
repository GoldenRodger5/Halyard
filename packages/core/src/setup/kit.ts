/**
 * Profile copy generation. Milestone 50.
 *
 * Bios, display names and a pinned post per platform, generated in brand voice
 * from the product brief and passed through the same slop filter every other
 * piece of copy is. A bio written by the generator and not linted would be the
 * one place in the system where an em dash and a "seamlessly" could survive to
 * a real audience — and it would sit at the top of the profile forever, which is
 * worse than a bad post.
 *
 * Bios are also the one copy surface with a hard external limit. A 163-character
 * bio on X is not slightly too long, it is rejected, so length is enforced here
 * and variants over the limit are regenerated rather than truncated: a truncated
 * bio ends mid-word, and that is worse than a shorter one written on purpose.
 */
import type { PlatformId } from '../adapters/types.js';
import { extractJson, type LlmClient } from '../generation/llm.js';
import { DRAFT_MODEL } from '../generation/llm.js';
import { HARD_RULES_BLOCK, STYLE_RULES_BLOCK } from '../generation/prompts.js';
import { slopFilter } from '../qc/slopFilter.js';
import { PROFILE_SPECS } from './profiles.js';

export const SETUP_KIT_PROMPT_VERSION = 'setup-kit.v1';

export interface KitVoice {
  displayName: string;
  description: string;
  doRules: string[];
  dontRules: string[];
}

export interface KitRequest {
  platform: PlatformId;
  persona: 'brand' | 'founder';
  productName: string;
  productTagline: string | null;
  productBrief: string;
  voice: KitVoice;
  /** The URL going in the profile's link field, so the bio can point at it. */
  linkInBioUrl: string | null;
  forbiddenClaims?: string[];
  maxAttempts?: number;
}

export interface KitBio {
  text: string;
  /** What this variant is trying to do, so the operator can choose on purpose. */
  angle: string;
  length: number;
}

export interface KitResult {
  platform: PlatformId;
  bios: KitBio[];
  displayNames: string[];
  pinnedPost: string;
  promptVersion: string;
  /** Anything that had to be regenerated, kept so the operator can see the cost. */
  notes: string[];
}

/**
 * Platform-specific guidance for the bio, which is a different job per platform.
 *
 * An X bio is read by somebody deciding whether to follow in two seconds. A
 * YouTube description is read by somebody who already clicked and by the search
 * index. Writing one bio and trimming it to fit each limit produces seven bad
 * bios, so each gets its own instruction.
 */
const BIO_BRIEFS: Record<PlatformId, string> = {
  x: 'Read in about two seconds while deciding whether to follow. One concrete claim, no list of adjectives. No hashtags.',
  instagram:
    'Read by somebody who arrived from a Reel. Say what they will get if they follow. Line breaks are allowed and help. The link is separate, so do not write "link in bio" as if it were information.',
  threads:
    'Conversational, close to the Instagram bio in substance but written like a person rather than a brand.',
  tiktok:
    'Eighty characters. Effectively one sentence. Say the single most useful thing and stop.',
  youtube:
    'A channel description, read by both a human and the search index. Two short paragraphs: what the channel is, and what a new viewer should watch first. Plain keywords, no keyword stuffing.',
  pinterest:
    'Read by somebody searching for a solution, not browsing a brand. Lead with the problem being solved.',
  bluesky:
    'Bluesky rewards specificity and punishes marketing register. Write it like a person describing their own work.',
};

const ANGLES = [
  'lead with the problem the reader already has',
  'lead with what the product actually does, plainly',
  'lead with who it is for and what they get',
];

function buildPrompt(request: KitRequest): { system: string; user: string } {
  const spec = PROFILE_SPECS[request.platform];
  const persona =
    request.persona === 'founder'
      ? 'the founder, writing as themselves in first person'
      : 'the product account, writing as the product without pretending to be a person';

  const system = [
    `You write social profile copy for ${request.productName}.`,
    '',
    `This is a profile, not a post. It sits at the top of the account forever and is the first`,
    `thing anybody reads. It has to survive being read a hundred times.`,
    '',
    `VOICE — ${request.voice.displayName}`,
    request.voice.description,
    request.voice.doRules.length > 0 ? `Do: ${request.voice.doRules.join('; ')}` : '',
    request.voice.dontRules.length > 0 ? `Never: ${request.voice.dontRules.join('; ')}` : '',
    '',
    STYLE_RULES_BLOCK,
    '',
    HARD_RULES_BLOCK,
    request.forbiddenClaims && request.forbiddenClaims.length > 0
      ? `\nNever claim any of these, which are specifically untrue of this product:\n${request.forbiddenClaims
          .map((claim) => `- ${claim}`)
          .join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const user = [
    `PRODUCT BRIEF`,
    request.productBrief.slice(0, 6000),
    '',
    `PLATFORM: ${request.platform}, writing as ${persona}.`,
    BIO_BRIEFS[request.platform],
    '',
    `HARD LIMITS — copy over these is discarded, so write inside them:`,
    `- bio: ${spec.bioMaxChars} characters, counted including spaces`,
    `- display name: ${spec.displayNameMaxChars} characters`,
    request.linkInBioUrl
      ? `\nThe profile links to ${request.linkInBioUrl}. Do not paste the URL into the bio text; it has its own field.`
      : `\nThis platform has no link field: ${spec.linkNote}`,
    '',
    `Write THREE bio variants, each taking a different angle:`,
    ...ANGLES.map((angle, i) => `${i + 1}. ${angle}`),
    '',
    `Then THREE display-name options. A display name is not the handle. It may contain`,
    `spaces and should say what the account is to somebody who has never heard of it.`,
    '',
    `Then ONE pinned post for this platform, introducing the account: what it is, who it is`,
    `for, and what to expect. Written for ${request.platform}, at that platform's normal length.`,
    `Not an announcement of a launch. An explanation of a standing thing.`,
    '',
    `OUTPUT — reply with this JSON object and nothing else:`,
    `{`,
    `  "bios": [{"text": "...", "angle": "..."}, ...],`,
    `  "display_names": ["...", "...", "..."],`,
    `  "pinned_post": "..."`,
    `}`,
  ].join('\n');

  return { system, user };
}

interface RawKit {
  bios?: Array<{ text?: string; angle?: string }>;
  display_names?: string[];
  pinned_post?: string;
}

/**
 * Generate the profile copy for one platform.
 *
 * Retries on length and on slop, feeding back what was wrong, in the same shape
 * `writeDraft` uses. Three attempts, then it returns what it has with the
 * problems named rather than throwing — a bio that is four characters long is
 * still a starting point for a human, and losing the whole kit because one
 * variant ran over would be worse.
 */
export async function generateProfileCopy(
  request: KitRequest,
  llm: LlmClient,
): Promise<KitResult> {
  const spec = PROFILE_SPECS[request.platform];
  const maxAttempts = request.maxAttempts ?? 3;
  const notes: string[] = [];
  let feedback = '';
  let best: KitResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { system, user } = buildPrompt(request);
    const response = await llm.complete({
      system,
      messages: [{ role: 'user', content: feedback ? `${user}\n\nFIX THIS:\n${feedback}` : user }],
      model: DRAFT_MODEL,
      maxTokens: 2000,
      temperature: 0.8,
      promptVersion: SETUP_KIT_PROMPT_VERSION,
    });

    const raw = extractJson<RawKit>(response.text);
    const bios: KitBio[] = (raw.bios ?? [])
      .map((bio) => ({
        text: (bio.text ?? '').trim(),
        angle: (bio.angle ?? '').trim() || 'unstated',
        length: (bio.text ?? '').trim().length,
      }))
      .filter((bio) => bio.text.length > 0);

    const displayNames = (raw.display_names ?? [])
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    const pinnedPost = (raw.pinned_post ?? '').trim();

    const problems: string[] = [];

    const tooLong = bios.filter((bio) => bio.length > spec.bioMaxChars);
    for (const bio of tooLong) {
      problems.push(
        `A bio is ${bio.length} characters, over the ${spec.bioMaxChars} limit: "${bio.text}"`,
      );
    }
    for (const name of displayNames.filter((n) => n.length > spec.displayNameMaxChars)) {
      problems.push(
        `Display name "${name}" is ${name.length} characters, over the ${spec.displayNameMaxChars} limit.`,
      );
    }

    // The same lint every post goes through. A bio is copy, and it is the copy
    // that stays on the profile longest.
    for (const bio of bios) {
      for (const violation of slopFilter({ body: bio.text, platform: request.platform }).errors) {
        problems.push(`Bio "${bio.text.slice(0, 40)}": ${violation.message}`);
      }
    }
    if (pinnedPost) {
      for (const violation of slopFilter({ body: pinnedPost, platform: request.platform }).errors) {
        problems.push(`Pinned post: ${violation.message}`);
      }
    }
    if (bios.length === 0) problems.push('No bios were returned.');
    if (displayNames.length === 0) problems.push('No display names were returned.');
    if (!pinnedPost) problems.push('No pinned post was returned.');

    const result: KitResult = {
      platform: request.platform,
      bios: bios.filter((bio) => bio.length <= spec.bioMaxChars),
      displayNames: displayNames.filter((name) => name.length <= spec.displayNameMaxChars),
      pinnedPost,
      promptVersion: SETUP_KIT_PROMPT_VERSION,
      notes,
    };

    if (problems.length === 0) return result;

    // Keep the attempt with the most usable variants rather than the last one.
    if (!best || result.bios.length > best.bios.length) best = result;

    feedback = problems.join('\n');
    notes.push(`Attempt ${attempt}: ${problems.length} problem(s), regenerated.`);
  }

  const final = best ?? {
    platform: request.platform,
    bios: [],
    displayNames: [],
    pinnedPost: '',
    promptVersion: SETUP_KIT_PROMPT_VERSION,
    notes,
  };
  final.notes = [
    ...notes,
    `Gave up after ${maxAttempts} attempts. What is here fits the limits; what is missing did not.`,
  ];
  return final;
}
