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
  type CriticFrame,
  type CriticVerdict,
} from '../qc/critic.js';
import { openAiChatCostUsd } from './openai.js';
import type { ProviderUsage } from './provider.js';
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
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}


export class OpenAiCriticClient implements CriticClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly model: string;

  constructor(
    apiKey = process.env.OPENAI_API_KEY,
    fetchImpl: typeof fetch = fetch,
    model = CRITIC_MODEL,
    /** §494. Called after every successful call with what it cost. */
    private readonly onUsage?: (usage: ProviderUsage) => void,
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
          /*
           * §412. No `metadata` here.
           *
           * It carried `promptVersion` for telemetry nobody reads, and OpenAI
           * refuses it: *"The 'metadata' parameter is only allowed when 'store'
           * is enabled"* — HTTP 400, on every call this client has ever made.
           * The critic has therefore never once run. The prompt version is
           * still exported and is recorded where versions are actually
           * compared, which is Halyard's own tables.
           */
        }),
      });

      const body = (await response.json()) as ChatResponse;
      if (!response.ok || body.error) {
        throw new Error(body.error?.message ?? `HTTP ${response.status}`);
      }

      if (body.usage && this.onUsage) {
        const inputTokens = body.usage.prompt_tokens ?? 0;
        const outputTokens = body.usage.completion_tokens ?? 0;
        this.onUsage({ model: this.model, inputTokens, outputTokens, costUsd: openAiChatCostUsd(this.model, inputTokens, outputTokens) });
      }

      const text = body.choices?.[0]?.message?.content ?? '';
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      const json = start >= 0 && end > start ? text.slice(start, end + 1) : '{}';
      return parseCriticReply(JSON.parse(json), shown);
    } catch (err) {
      /*
       * Fails soft, never silent. §412.
       *
       * The critic is an upgrade to the review and never a gate on it — an
       * outage must not fail a piece and must not invent findings. `examined`
       * stays at zero, because a call that errored did not look at anything and
       * `parseCriticReply` uses that to distinguish "looked and found nothing"
       * from "never looked".
       *
       * What changed is that the reason survives. This swallowed its error
       * entirely and reported *"No frames were available, so nothing was
       * reviewed"* — which reads as a benign condition, and was in fact a 400
       * on every call for the life of this client. A silent failure that
       * describes itself as an absence of input is the hardest kind to find.
       */
      return {
        ...parseCriticReply({ findings: [] }, []),
        unavailableBecause: (err as Error).message,
        summary: `The critic could not be reached: ${(err as Error).message}`,
      };
    }
  }
}
