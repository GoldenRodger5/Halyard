/**
 * The one place Halyard talks to a model.
 *
 * Injected everywhere else so tests never need an API key and a provider change
 * is one file. Model choice follows v1's stack table: a stronger model for
 * strategy, a cheaper one for the per-platform drafts that run many times a day.
 */
import Anthropic from '@anthropic-ai/sdk';
import { providerRefusal, refusalIsExhausted } from './provider.js';

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

/**
 * Strategy work: proposing facts that get published, and adjudicating conflicts
 * between them. Every caller of this either writes into the Product Brain or
 * gates a public claim, and deterministic code downstream cannot rescue a bad
 * premise.
 */
export const STRATEGY_MODEL = 'claude-opus-5';
/** Volume work: per-platform drafts, VO scripts, reply suggestions. */
export const DRAFT_MODEL = 'claude-sonnet-5';
/**
 * Classification, where the answer is a verdict rather than prose.
 *
 * Only `verifyPayoff` uses it: "does this hook pay off in the body" is a binary
 * judgement behind a gate, not a piece of writing. Generation stays on the
 * draft model — the retry benchmark in `openai.ts` is the reason cheap models
 * are not used where output quality drives a QC retry.
 */
export const CLASSIFY_MODEL = 'claude-haiku-4-5';

/**
 * Dollars per million tokens, for `agent_runs.cost_usd`.
 *
 * Standard rates. Claude Sonnet 5 carries introductory pricing of $2/$10 until
 * 2026-08-31; the standard $3/$15 is used here on purpose, because an
 * over-estimate is the safer error in a spend report — the same rule
 * `openai.ts` states for its own table.
 *
 * The superseded models are kept so historical `agent_runs` rows written under
 * them still price correctly if anything ever recomputes.
 */
const PRICING_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  // Superseded 2026-08-21, retained for historical rows.
  'claude-opus-4-5': { input: 5, output: 25 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
};

/**
 * Models that still accept sampling parameters.
 *
 * Claude Opus 5 and Sonnet 5 **removed** `temperature`, `top_p` and `top_k` —
 * sending one is a hard 400, not a warning. Haiku 4.5 predates that change and
 * still accepts them.
 *
 * Deliberately a list of what *does* accept sampling rather than what rejects
 * it, so the fail-safe direction is "omit". A model released after this line
 * was written is assumed not to take the parameter: losing a non-default
 * temperature costs a little sampling variety, while guessing the other way
 * costs every request.
 */
const SAMPLING_MODELS = new Set([
  'claude-haiku-4-5',
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-opus-4-5',
  'claude-sonnet-4-5',
]);

/**
 * Models that reason before answering, where thinking tokens are billed as
 * output and counted against `max_tokens`.
 *
 * This is not the same question as sampling support, even though the same
 * models happen to answer both — one is about a request parameter, the other
 * about how the token ceiling is consumed. Kept separate so a future model that
 * changes one does not silently change the other.
 */
const THINKING_BY_DEFAULT = new Set(['claude-opus-5', 'claude-sonnet-5', 'claude-fable-5']);

/**
 * Room for the model to think *and* still finish its answer.
 *
 * Callers set `maxTokens` to describe how long the answer should be — 300 for a
 * one-paragraph reconciliation, 2000 for a batch of ideas. On a thinking model
 * that number is not the answer budget, it is the answer *plus* the reasoning,
 * and reasoning goes first.
 *
 * The first live Opus 5 call proved it: `proposeIdeas` asked for 2000, the run
 * cost $0.053285 — about 657 tokens in and 2000 out, exactly the ceiling — and
 * the JSON came back cut off mid-string. `extractJson` reported "Unbalanced
 * JSON", the round was discarded, and the failure looked like a parsing problem
 * rather than a truncated one.
 *
 * A ceiling is not a spend: raising it bills nothing extra, because the model
 * is only charged for tokens it actually produces. The caller's own number is
 * still honoured as a floor for models that do not think.
 */
const THINKING_HEADROOM_TOKENS = 16_000;

/** How long one model call may take before it is treated as stalled. */
export const LLM_TIMEOUT_MS = 5 * 60_000;

export function thinksByDefault(model: string): boolean {
  return THINKING_BY_DEFAULT.has(model);
}

export function supportsSampling(model: string): boolean {
  return SAMPLING_MODELS.has(model);
}

/**
 * The exact body sent to `messages.create`.
 *
 * Pulled out of the client so the one thing that matters here is assertable
 * without a network call or an injected SDK: **whether `temperature` is in the
 * outgoing request**. A test that only checks `supportsSampling()` passes even
 * when the client stops consulting it — which is precisely what happened the
 * first time this was tamper-tested.
 */
export function buildMessageParams(
  request: LlmRequest,
  model: string,
): {
  model: string;
  max_tokens: number;
  temperature?: number;
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
} {
  const requested = request.maxTokens ?? 2000;

  return {
    model,
    // Thinking is billed as output and spends this ceiling before the answer
    // starts, so a thinking model needs room for both.
    max_tokens: thinksByDefault(model) ? Math.max(requested, THINKING_HEADROOM_TOKENS) : requested,
    ...(request.temperature !== undefined && supportsSampling(model)
      ? { temperature: request.temperature }
      : {}),
    system: request.system,
    messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
  };
}

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
    /*
     * An explicit ceiling, so a stalled connection fails instead of holding a
     * worker slot. Generous: the slowest legitimate call observed live is the
     * Product Brain's discovery agents at ~35s, and a thinking model asked for
     * a hard question can take several minutes.
     */
    this.client = new Anthropic({ apiKey: key, timeout: LLM_TIMEOUT_MS });
  }

  /**
   * §398. A name this provider does not serve stands for a *tier*.
   *
   * The mirror of `OpenAiLlmClient.resolveModel`, and it exists for the same
   * reason: once a request can fall back from one provider to the other, it
   * arrives carrying the *first* provider's model name. `gpt-5.5` sent to
   * Anthropic is a 404 at generation time, which is the worst moment.
   *
   * Callers ask for a tier — strategy work or volume work — and a foreign name
   * is read as the tier it stood for rather than passed through to fail.
   */
  private resolveModel(requested: string | undefined): string {
    if (!requested) return DRAFT_MODEL;
    if (/^claude-/.test(requested)) return requested;
    /* OpenAI's strategy tier is its `-pro` and top line; everything else is volume. */
    return /pro|opus|luna|sol|terra/i.test(requested) ? STRATEGY_MODEL : DRAFT_MODEL;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const model = this.resolveModel(request.model);

    /**
     * `temperature` is sent only when it was asked for *and* the model takes it.
     *
     * This used to send `temperature: request.temperature ?? 1` on every call.
     * Two things were wrong with that. The `?? 1` supplied the API's own
     * default, so twenty of the twenty-one agents were sending a parameter that
     * changed nothing — and Claude Opus 5 and Sonnet 5 **removed** sampling
     * parameters, so that redundant value is a hard 400. Every request to the
     * models Halyard now uses would have failed, on a parameter no caller had
     * asked for.
     *
     * One caller does ask: `generateProfileCopy` wants 0.8. On a model without
     * sampling there is no way to honour it, so it is dropped rather than sent
     * — the request succeeds at the model's default instead of failing. The
     * call site keeps expressing the intent, so it applies again if that work
     * ever moves to a model that supports it.
     */
    /**
     * Streamed, and not because anything here wants the tokens as they arrive.
     *
     * §147. Found during the MCP activation run: `store-listing` sat in
     * `agent_runs` as `running` for eighteen minutes on one call, holding a
     * worker slot, until the process was killed. A non-streamed request has to
     * hold a single HTTP response open for the whole generation, and §141 set
     * `max_tokens` to at least 16,000 on the thinking models — long enough that
     * the connection is what fails, not the model.
     *
     * Anthropic's guidance is explicit: stream anything with long input, long
     * output, or a high `max_tokens`. `finalMessage()` accumulates the stream
     * and returns exactly the `Message` that `create` would have returned, so
     * nothing downstream changes.
     */
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.stream(buildMessageParams(request, model)).finalMessage();
    } catch (err) {
      /*
       * §493. "Your credit balance is too low" arrives as a 400. Typed here so
       * the fallback client can tell a dead account from a bad request, and
       * the poller can stop retrying into the same answer.
       */
      if (err instanceof Anthropic.APIError && refusalIsExhausted(err.status ?? 0, err.message)) {
        throw providerRefusal('anthropic', err.status ?? 0, err.message);
      }
      throw err;
    }

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
 * A model's array field, or an empty one.
 *
 * `extractJson<T>` is an unchecked cast: it proves the response is JSON, not
 * that it is *this* JSON. Reading `(parsed.things ?? []).map(...)` therefore
 * throws `map is not a function` the moment a model answers with a bare string
 * where a list was asked for — a parseable reply that crashes the caller
 * instead of being handled.
 *
 * Two ways to deal with that, and which one is right depends on the caller:
 *
 *  - **Where a retry loop exists**, name the problem and ask again.
 *    `copywriter.describeShapeProblem` does that; converging beats coercing,
 *    because a model that returned the wrong shape probably got other things
 *    wrong too.
 *  - **Where there is no retry loop**, degrade to empty. This is that. It is
 *    for fields that are auxiliary — a list of caveats beside a body of text —
 *    where losing them is better than losing the whole response.
 *
 * Deliberately not a schema library. `zod` is a dependency of this package and
 * is used by nothing; adding it here would introduce a second validation idiom
 * for a one-line problem, and the callers that need real validation already do
 * it deterministically at the point of use.
 */
export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** A model's string field, trimmed, or null when it is anything else. */
export function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
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
import { OPENAI_DRAFT_MODEL, OPENAI_STRATEGY_MODEL } from './openai.js';

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
    : { strategy: OPENAI_STRATEGY_MODEL, draft: OPENAI_DRAFT_MODEL };
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
