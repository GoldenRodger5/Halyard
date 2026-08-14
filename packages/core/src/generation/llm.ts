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
    // A placeholder left in an env file is the common case, not an empty
    // string. The value shipped in .env.example is a comment, which is truthy,
    // so a bare falsy check lets it through and the operator meets a raw 401
    // from the SDK several seconds and one wasted round trip later.
    const key = apiKey?.trim();
    if (!key) throw new Error('ANTHROPIC_API_KEY is not set. Run ./scripts/doctor.');
    if (!key.startsWith('sk-ant-')) {
      throw new Error(
        'ANTHROPIC_API_KEY does not look like an API key — real keys begin with "sk-ant-". ' +
          'The value in the environment is probably still the placeholder. Get one at console.anthropic.com.',
      );
    }
    this.client = new Anthropic({ apiKey: key });
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

/**
 * Which provider to talk to.
 *
 * Halyard was written against Anthropic and the model names above are still the
 * intent. But the seam exists so the provider is a runtime choice, and there is
 * no reason to be unable to generate anything because one vendor's key is
 * missing while another's is sitting right there.
 *
 * Order: an explicit `LLM_PROVIDER` wins, then whichever key is actually
 * present, Anthropic first. Deliberately *not* a silent preference — the choice
 * is reported by `describeLlmProvider()` and shown on /settings, because "which
 * model wrote this" is the first question asked when output quality changes.
 */
export type LlmProvider = 'anthropic' | 'openai';

function keyLooksReal(value: string | undefined, prefix: string): boolean {
  const key = value?.trim();
  return Boolean(key && key.startsWith(prefix));
}

export function resolveLlmProvider(env: NodeJS.ProcessEnv = process.env): LlmProvider | null {
  const explicit = env.LLM_PROVIDER?.trim().toLowerCase();
  if (explicit === 'anthropic' || explicit === 'openai') return explicit;

  if (keyLooksReal(env.ANTHROPIC_API_KEY, 'sk-ant-')) return 'anthropic';
  if (keyLooksReal(env.OPENAI_API_KEY, 'sk-')) return 'openai';
  return null;
}

/**
 * The models each provider uses for the two roles.
 *
 * Kept together so "the strategy model" means something regardless of who is
 * serving it, and so a caller passing `STRATEGY_MODEL` to an OpenAI client does
 * not silently ask for a model that does not exist there.
 */
export function modelsFor(provider: LlmProvider): { strategy: string; draft: string } {
  return provider === 'anthropic'
    ? { strategy: STRATEGY_MODEL, draft: DRAFT_MODEL }
    : { strategy: 'gpt-5.5', draft: 'gpt-5.5' };
}

/** One sentence for /settings and for logs. */
export function describeLlmProvider(env: NodeJS.ProcessEnv = process.env): string {
  const provider = resolveLlmProvider(env);
  if (!provider) {
    return 'No model provider is configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY — nothing generates without one.';
  }
  const models = modelsFor(provider);
  const explicit = env.LLM_PROVIDER?.trim().toLowerCase();
  // Anthropic is the intended provider; OpenAI is the fallback. Saying which of
  // those is currently true matters, because output quality moving is the first
  // thing anybody notices and "which model wrote this" is the first question.
  const role =
    provider === 'anthropic'
      ? 'primary'
      : explicit
        ? 'chosen explicitly'
        : 'fallback — ANTHROPIC_API_KEY is not set';

  return (
    `${provider} (${role}): ${models.strategy} for strategy, ${models.draft} for drafts.` +
    (provider === 'openai' && !explicit
      ? ' Set ANTHROPIC_API_KEY to return to the primary provider.'
      : '')
  );
}
