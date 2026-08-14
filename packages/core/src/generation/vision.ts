/**
 * Describing what is in an image. Not judging it.
 *
 * The whole coherence gate rests on one property, and it is enforced by this
 * file's shape rather than by anybody remembering: **a describer is never told
 * what the artifact was supposed to be.**
 *
 * `describeFrames` takes images and nothing else. There is no parameter for the
 * script, the caption, the idea or the intent, so no caller can leak them in.
 * A model told "the script says the loaf collapses" will report a collapsing
 * loaf; a model shown only pixels reports what is there, and the disagreement
 * surfaces in `runCoherenceQC`, in code, where no model's preferences apply.
 *
 * That is the difference between this and the `visionScore` rubric that has sat
 * unpopulated in `visualQC` since milestone 11: that one asks for scores out of
 * five on composition and feed fit, which is exactly the judgement task the
 * evidence says models are biased at.
 */
import type { FrameObservation } from '../qc/coherence.js';

export interface ImageInput {
  /** Raw bytes. PNG or JPEG. */
  bytes: Uint8Array;
  mimeType: string;
  /** Where in the video this came from, carried through to the observation. */
  atSeconds: number;
}

export interface VisionClient {
  /**
   * Describe each image independently.
   *
   * Note the signature: images in, observations out. Nothing about intent can
   * be passed, which is the point.
   */
  describeFrames(images: ImageInput[]): Promise<FrameObservation[]>;
}

/**
 * The instruction. Fixed, and deliberately dull.
 *
 * It asks for description and transcription only. No adjectives of quality, no
 * scoring, no "does this look good" — every one of those invites the model to
 * evaluate, and an evaluation is what must not happen here.
 */
export const DESCRIBE_INSTRUCTION = [
  'Describe what is visibly present in this image, factually, in one or two sentences.',
  'Then list every piece of text you can read in it, exactly as written.',
  'Do not judge the image. Do not comment on quality, style, composition or appeal.',
  'If you cannot tell what something is, say so rather than guessing.',
  '',
  'Reply as JSON: {"describes": "...", "visibleText": ["...", "..."]}',
].join('\n');

interface ChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
}

const API = 'https://api.openai.com/v1/chat/completions';

/** Models that accept image parts on chat/completions. */
export const VISION_MODEL = 'gpt-5.5';

export class OpenAiVisionClient implements VisionClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly model: string;

  constructor(
    apiKey = process.env.OPENAI_API_KEY,
    fetchImpl: typeof fetch = fetch,
    model = VISION_MODEL,
  ) {
    const key = apiKey?.trim();
    if (!key) throw new Error('OPENAI_API_KEY is not set, so frames cannot be described.');
    this.apiKey = key;
    this.fetchImpl = fetchImpl;
    this.model = model;
  }

  async describeFrames(images: ImageInput[]): Promise<FrameObservation[]> {
    // Sequentially rather than in parallel: these are independent perception
    // tasks with no shared context, and the rate limit is a likelier constraint
    // than wall-clock for a handful of frames.
    const observations: FrameObservation[] = [];
    for (const image of images) {
      observations.push(await this.describeOne(image));
    }
    return observations;
  }

  private async describeOne(image: ImageInput): Promise<FrameObservation> {
    const base64 = Buffer.from(image.bytes).toString('base64');

    const response = await this.fetchImpl(API, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: DESCRIBE_INSTRUCTION },
              {
                type: 'image_url',
                image_url: { url: `data:${image.mimeType};base64,${base64}` },
              },
            ],
          },
        ],
        // Reasoning tokens are charged against this budget and are spent before
        // any text appears, so a description needs far more headroom than its
        // length suggests.
        max_completion_tokens: 4000,
        response_format: { type: 'json_object' },
      }),
    });

    const data = (await response.json()) as ChatResponse;
    if (!response.ok) {
      throw new Error(`Vision ${response.status}: ${data.error?.message ?? 'no reason given'}`);
    }

    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text) {
      throw new Error(`No description returned for the frame at ${image.atSeconds}s.`);
    }

    let parsed: { describes?: string; visibleText?: unknown };
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      // A describer that returned prose still described something. Use it
      // rather than failing the whole gate on a formatting miss.
      parsed = { describes: text, visibleText: [] };
    }

    return {
      atSeconds: image.atSeconds,
      describes: (parsed.describes ?? '').trim(),
      visibleText: Array.isArray(parsed.visibleText)
        ? parsed.visibleText.map((t) => String(t)).filter(Boolean)
        : [],
    };
  }
}
