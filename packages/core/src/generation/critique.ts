/**
 * §275. The critic's client — deliberately separate from the describer.
 *
 * `OpenAiVisionClient` is forbidden from judging: its instruction says "Do not
 * judge the image. Do not comment on quality, style, composition or appeal."
 * That is correct and must stay true — the coherence gate needs a witness, not
 * a reviewer, and a describer that editorialises corrupts the evidence every
 * other gate reads.
 *
 * So the critic is a second client with a different instruction, looking at the
 * same frames for a different reason. Two jobs, two prompts, no blurring.
 */
import {
  criticSystemPrompt,
  parseCriticReply,
  CRITIC_PROMPT_VERSION,
  type CriticFrame,
  type CriticVerdict,
} from '../qc/critic.js';
import type { ImageInput } from './vision.js';

export interface CriticClient {
  /**
   * Judge a set of frames **together**.
   *
   * The whole set in one call, never frame by frame, because the defects this
   * exists to catch are properties of the set: sameness, flat emphasis,
   * interchangeable layouts. A per-frame critic would find each frame
   * acceptable and miss all of them — which is exactly what the existing
   * per-frame rules did.
   */
  critique(frames: Array<ImageInput & { visibleText?: string[] }>): Promise<CriticVerdict>;
}

const API = 'https://api.openai.com/v1/chat/completions';
export const CRITIC_MODEL = 'gpt-5.5';

interface ChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
}

export class OpenAiCriticClient implements CriticClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly model: string;

  constructor(
    apiKey = process.env.OPENAI_API_KEY,
    fetchImpl: typeof fetch = fetch,
    model = CRITIC_MODEL,
  ) {
    const key = apiKey?.trim();
    if (!key) throw new Error('OPENAI_API_KEY is not set, so the critic cannot look at frames.');
    this.apiKey = key;
    this.fetchImpl = fetchImpl;
    this.model = model;
  }

  async critique(
    frames: Array<ImageInput & { visibleText?: string[] }>,
  ): Promise<CriticVerdict> {
    const shown: CriticFrame[] = frames.map((f) => ({
      atSeconds: Number(f.atSeconds.toFixed(2)),
      describes: '',
      visibleText: f.visibleText ?? [],
    }));

    if (frames.length === 0) return parseCriticReply({ findings: [] }, shown);

    const content: Array<Record<string, unknown>> = [
      {
        type: 'text',
        text: `These are ${frames.length} frames from one video, in order, at ${shown
          .map((f) => `${f.atSeconds}s`)
          .join(', ')}. Judge them together.`,
      },
      ...frames.map((f) => ({
        type: 'image_url',
        image_url: {
          url: `data:${f.mimeType};base64,${Buffer.from(f.bytes).toString('base64')}`,
        },
      })),
    ];

    try {
      const response = await this.fetchImpl(API, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: criticSystemPrompt() },
            { role: 'user', content },
          ],
          max_completion_tokens: 900,
          metadata: { promptVersion: CRITIC_PROMPT_VERSION },
        }),
      });

      const body = (await response.json()) as ChatResponse;
      if (!response.ok || body.error) {
        throw new Error(body.error?.message ?? `HTTP ${response.status}`);
      }

      const text = body.choices?.[0]?.message?.content ?? '';
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      const json = start >= 0 && end > start ? text.slice(start, end + 1) : '{}';
      return parseCriticReply(JSON.parse(json), shown);
    } catch {
      /*
       * Fails silent, and that is the right direction here. The critic is an
       * upgrade to the review, never a gate on it — an outage must not fail a
       * piece, and it must not invent findings either. `examined` stays at the
       * frame count so a caller can tell "looked and found nothing" from "never
       * looked", which `parseCriticReply` already distinguishes.
       */
      return parseCriticReply({ findings: [] }, []);
    }
  }
}
