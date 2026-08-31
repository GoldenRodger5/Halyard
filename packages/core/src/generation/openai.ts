/**
 * The OpenAI provider, behind the same `LlmClient` seam.
 *
 * Halyard's generation was written against Anthropic, but the seam exists
 * precisely so that is a choice rather than a commitment. Everything above this
 * file — the copywriter, the idea engine, the QC retry loop, the co-pilot — is
 * unchanged.
 *
 * ## Written against what the API actually does, in August 2026
 *
 * Every one of these was confirmed by calling the API rather than recalled:
 *
 *  - **`max_tokens` is rejected** by the gpt-5 family. It is
 *    `max_completion_tokens`, and the error is a hard 400.
 *  - **`temperature` is rejected by some models and accepted by others.**
 *    `gpt-5.5` allows only the default of 1; `gpt-5.4-mini` takes 0.7 happily.
 *    Which is which is not documented anywhere stable, and it changes per model
 *    release.
 *  - **`response_format: json_object` requires the word "json" somewhere in the
 *    messages**, or the request 400s. Halyard's prompts all say "reply with
 *    this JSON object", so the condition holds — but it is checked rather than
 *    assumed, because a prompt edit could silently break every generation.
 *
 * Rather than hard-code a table of which model tolerates which parameter — a
 * table that is wrong the moment OpenAI ships a model — this retries once
 * without the offending parameter when the API names it. Self-healing beats a
 * list that has to be maintained by somebody who remembers it exists.
 */
import type { LlmClient, LlmRequest, LlmResponse } from './llm.js';

/**
 * Strategy work: idea generation, the performance analyst, co-pilot reasoning.
 *
 * `gpt-5.5-pro` exists but is not a chat-completions model — it answers only on
 * the responses endpoint — so it is not an option here without a second code
 * path for one caller.
 */
export const OPENAI_STRATEGY_MODEL = 'gpt-5.5';

/**
 * Volume work: per-platform drafts, VO scripts, reply suggestions.
 *
 * **Also gpt-5.5, and that is a deliberate choice against the usual instinct to
 * put a cheap model on the high-frequency path.** Benchmarked on the same draft:
 *
 *   gpt-5.4-mini  2 attempts  2.4s  $0.00087
 *   gpt-5.4       2 attempts  2.0s  $0.00084
 *   gpt-5.5       1 attempt   1.6s  $0.00051
 *
 * The smaller models failed QC on the first pass and had to be regenerated, so
 * they were slower *and* more expensive than the better one. Retries dominate at
 * this size. The copy was also plainly worse — "That is the whole problem"
 * against "That difference is why the middle stays wet".
 *
 * This is the copy that actually gets published, at roughly sixty posts a month.
 * The entire monthly difference between tiers is under a dollar.
 */
export const OPENAI_DRAFT_MODEL = 'gpt-5.5';

/**
 * Dollars per million tokens.
 *
 * **These are estimates, not fetched.** OpenAI publishes no pricing endpoint, so
 * this table is hand-maintained and is the one thing in this file that was not
 * verified against the API. Treat the cost figures on /settings as an
 * order-of-magnitude guide rather than a bill, and correct these numbers from
 * openai.com/api/pricing when they matter.
 *
 * Unknown models fall back to the draft model's price rather than to zero: a
 * cost of zero would quietly under-report spend, and an over-estimate is the
 * safer error.
 */
const PRICING_PER_MTOK: Record<string, { input: number; output: number }> = {
  // Not checked against a price list — these are informed guesses, and the one
  // unverified thing in this file. Correct them before quoting a total.
  'gpt-5.5': { input: 1.75, output: 14 },
  'gpt-5.4': { input: 1.25, output: 10 },
  'gpt-5.4-mini': { input: 0.25, output: 2 },
  'gpt-5.4-nano': { input: 0.05, output: 0.4 },
  'gpt-5': { input: 1.25, output: 10 },
  'gpt-5-mini': { input: 0.25, output: 2 },
};

const API = 'https://api.openai.com/v1/chat/completions';

interface ChatResponse {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; param?: string };
}

export class OpenAiLlmClient implements LlmClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(apiKey = process.env.OPENAI_API_KEY, fetchImpl: typeof fetch = fetch) {
    const key = apiKey?.trim();
    if (!key) throw new Error('OPENAI_API_KEY is not set. Run ./scripts/doctor.');
    if (!key.startsWith('sk-')) {
      throw new Error(
        'OPENAI_API_KEY does not look like an API key — real keys begin with "sk-". ' +
          'The value in the environment is probably still a placeholder. Get one at platform.openai.com.',
      );
    }
    this.apiKey = key;
    this.fetchImpl = fetchImpl;
  }

  /**
   * Translate a requested model into one this provider actually serves.
   *
   * Ten call sites pass `DRAFT_MODEL` or `STRATEGY_MODEL` — Claude names, because
   * that is what Halyard was written against. Sending `claude-sonnet-4-6` to
   * OpenAI is a 404 at generation time, which is the worst moment to find out.
   *
   * What those callers are really expressing is a *tier*: strategy work versus
   * volume work. So a name this provider does not recognise is read as the tier
   * it stands for, rather than passed through to fail.
   */
  private resolveModel(requested: string | undefined): string {
    if (!requested) return OPENAI_DRAFT_MODEL;
    if (/^(gpt-|o[1-9])/.test(requested)) return requested;
    // Anything else is a foreign name standing in for a tier. Opus is the
    // strategy tier; everything else is volume.
    return /opus/i.test(requested) ? OPENAI_STRATEGY_MODEL : OPENAI_DRAFT_MODEL;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const model = this.resolveModel(request.model);

    /*
     * The system prompt is a message with role 'system' here, not a top-level
     * field as it is on Anthropic.
     *
     * §398. Included only when there *is* one. `LlmRequest.system` is optional,
     * and this used to send `content: undefined` unconditionally — which
     * serialises to null and OpenAI refuses outright:
     *
     *   Invalid value for 'content': expected a string, got null.
     *
     * Anthropic simply omits an absent system field, so the same request worked
     * there and failed here. It stayed hidden because nothing ever reached this
     * client: the provider was chosen once on key presence, so with an
     * Anthropic key set this path never ran. Building the fallback is what
     * executed it for the first time — the defect and its discovery are the
     * same event.
     */
    const messages = [
      ...(request.system ? [{ role: 'system' as const, content: request.system }] : []),
      ...request.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    /**
     * `maxTokens` means two different things on the two providers.
     *
     * On Anthropic it is a budget for the text you get back. On a gpt-5
     * reasoning model, `max_completion_tokens` covers the reasoning tokens too —
     * and those are invisible, unbounded by the prompt, and spent *before* any
     * text is emitted. Pass 1500 through unchanged and a long prompt returns
     * `finish_reason: length` with an empty string: not truncated output, no
     * output at all.
     *
     * That is exactly what the first real generation run did. The copywriter
     * asks for 1500 because that is a sensible Claude number, so the headroom
     * belongs here rather than in every caller.
     */
    const requested = request.maxTokens ?? 2000;
    const body: Record<string, unknown> = {
      model,
      messages,
      max_completion_tokens: Math.max(requested * 3, requested + 4000),
    };

    if (request.temperature !== undefined) body.temperature = request.temperature;

    // Only when the prompt actually says "json", because the API refuses the
    // combination otherwise. Every Halyard prompt that wants JSON says so.
    const wantsJson = [request.system, ...request.messages.map((m) => m.content)]
      .join(' ')
      .toLowerCase()
      .includes('json');
    if (wantsJson) body.response_format = { type: 'json_object' };

    let data = await this.send(body);
    let text = data.choices?.[0]?.message?.content ?? '';

    // Headroom above is generous, but "generous" is a guess about how much a
    // model thinks, and the next one may think harder. One retry at four times
    // the budget costs a few seconds; failing the draft costs the post.
    if (!text && data.choices?.[0]?.finish_reason === 'length') {
      data = await this.send({ ...body, max_completion_tokens: requested * 12 });
      text = data.choices?.[0]?.message?.content ?? '';
    }

    if (!text) {
      const reason = data.choices?.[0]?.finish_reason ?? 'no choices returned';
      throw new Error(
        `${model} returned no text (finish_reason: ${reason}). ` +
          (reason === 'length'
            ? 'The completion hit max_completion_tokens even after a retry with twelve times the budget. Reasoning models spend tokens before they emit any; this prompt may be asking for too much at once.'
            : 'Nothing to parse.'),
      );
    }

    const inputTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;
    const pricing = PRICING_PER_MTOK[model] ?? PRICING_PER_MTOK[OPENAI_DRAFT_MODEL]!;
    const costUsd =
      (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;

    return { text, model, inputTokens, outputTokens, costUsd: Number(costUsd.toFixed(6)) };
  }

  /**
   * Send, and drop a parameter the model rejects rather than failing the job.
   *
   * The gpt-5 family rejects `temperature` on some models and not others, and
   * the set changes with each release. A hard-coded table of which is which
   * would be wrong within weeks and wrong silently. The API names the offending
   * parameter in the error, so the honest move is to believe it and retry once.
   */
  private async send(body: Record<string, unknown>, attempt = 0): Promise<ChatResponse> {
    const response = await this.fetchImpl(API, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as ChatResponse;

    if (response.ok) return data;

    const message = data.error?.message ?? `HTTP ${response.status}`;
    const droppable = ['temperature', 'response_format'];
    const offending = droppable.find(
      (param) => data.error?.param === param || message.includes(`'${param}'`),
    );

    if (offending && attempt < droppable.length && offending in body) {
      const { [offending]: _dropped, ...rest } = body;
      void _dropped;
      return this.send(rest, attempt + 1);
    }

    throw new Error(`OpenAI ${response.status}: ${message}`);
  }
}
