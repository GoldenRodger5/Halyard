/**
 * The one place Halyard talks to a model.
 *
 * Injected everywhere else so tests never need an API key and a provider change
 * is one file. Model choice follows v1's stack table: a stronger model for
 * strategy, a cheaper one for the per-platform drafts that run many times a day.
 */
import Anthropic from '@anthropic-ai/sdk';

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
  model?: string;
  /** Recorded on content_items.generation_meta so a regression is traceable. */
  promptVersion: string;
}

export interface LlmResponse {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface LlmClient {
  complete(request: LlmRequest): Promise<LlmResponse>;
}

/** Strategy work: idea generation, the performance analyst, co-pilot reasoning. */
export const STRATEGY_MODEL = 'claude-opus-4-5';
/** Volume work: per-platform drafts, VO scripts, reply suggestions. */
export const DRAFT_MODEL = 'claude-sonnet-4-6';

const PRICING_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-opus-4-5': { input: 5, output: 25 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
};

export class AnthropicLlmClient implements LlmClient {
  private readonly client: Anthropic;

  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set.');
    this.client = new Anthropic({ apiKey });
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const model = request.model ?? DRAFT_MODEL;
    const response = await this.client.messages.create({
      model,
      max_tokens: request.maxTokens ?? 2000,
      temperature: request.temperature ?? 1,
      system: request.system,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const pricing = PRICING_PER_MTOK[model] ?? { input: 3, output: 15 };
    const costUsd =
      (response.usage.input_tokens / 1_000_000) * pricing.input +
      (response.usage.output_tokens / 1_000_000) * pricing.output;

    return {
      text,
      model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      costUsd: Number(costUsd.toFixed(6)),
    };
  }
}

/**
 * Pull the first JSON object or array out of a model response.
 * Models wrap JSON in prose or fences often enough that parsing the raw string
 * is not worth the retries.
 */
export function extractJson<T = unknown>(text: string): T {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = (fenced?.[1] ?? text).trim();

  try {
    return JSON.parse(candidate) as T;
  } catch {
    // Fall through to bracket matching.
  }

  const start = candidate.search(/[[{]/);
  if (start === -1) throw new Error(`No JSON found in model response: ${text.slice(0, 200)}`);

  const opener = candidate[start]!;
  const closer = opener === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < candidate.length; i++) {
    const char = candidate[i]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') inString = !inString;
    if (inString) continue;
    if (char === opener) depth++;
    if (char === closer) {
      depth--;
      if (depth === 0) {
        return JSON.parse(candidate.slice(start, i + 1)) as T;
      }
    }
  }
  throw new Error(`Unbalanced JSON in model response: ${text.slice(0, 200)}`);
}
