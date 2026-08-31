/**
 * §398. A provider that has a key but no credits is not a working provider.
 *
 * `resolveLlmProvider` chose once, at startup, on **key presence** — so an
 * account whose Anthropic balance had run out was still "configured", every
 * generation died on a 400, and the OpenAI key sat unused in the same file.
 * `llm.ts`'s own docstring says there is "no reason to be unable to generate
 * anything because one vendor's key is missing while another's is sitting right
 * there" — and it only ever handled *missing*, never *failing*.
 *
 * Three generate jobs died that way and the operator had to read the database
 * to find out why.
 *
 * ## What is worth falling back on, and what is not
 *
 * A provider failure is worth retrying elsewhere: no credits, rate limited,
 * overloaded, 5xx, a timeout. The next provider has a real chance.
 *
 * A **request** failure is not. A malformed prompt, a context overflow, an
 * unknown model, a content refusal — those fail identically at the next
 * provider, and retrying turns one clear error into two confusing ones and
 * doubles the bill. Falling back on everything is how a bad request becomes a
 * mystery.
 *
 * ## The model travels with the provider
 *
 * A request carrying `claude-opus-5` cannot be served by OpenAI. Each entry
 * therefore brings its own role→model map and rewrites the request as it hands
 * it on, which is what `modelsFor` has always been for.
 */
import type { LlmClient, LlmRequest, LlmResponse } from './llm.js';

export interface FallbackEntry {
  /** For logs and for the operator: which provider this is. */
  name: string;
  client: LlmClient;
  /**
   * Rewrite a request for this provider.
   *
   * Given the model the caller asked for, return the one this provider serves.
   * Identity for the primary; a mapping for anything else.
   */
  modelFor: (requested: string | undefined) => string | undefined;
}

/**
 * Whether the next provider deserves a try.
 *
 * Matched on the shape of the failure rather than on a status code alone,
 * because the message is where providers actually say what went wrong — an
 * exhausted balance is a 400 from Anthropic and a 429 from OpenAI, and neither
 * status alone distinguishes it from a malformed request.
 */
export function worthFallingBackOn(error: unknown): boolean {
  const text = (error instanceof Error ? error.message : String(error)).toLowerCase();

  /* The provider cannot serve anyone right now. */
  if (/credit balance|insufficient_quota|quota|billing|payment required/.test(text)) return true;
  if (/rate.?limit|too many requests|\b429\b/.test(text)) return true;
  if (/overloaded|capacity|service unavailable|\b5\d\d\b/.test(text)) return true;
  if (/timeout|timed out|econnreset|socket hang up|fetch failed|enotfound/.test(text)) return true;
  if (/invalid.?api.?key|authentication|unauthorized|\b401\b|\b403\b/.test(text)) return true;

  /*
   * Everything else is about *this request*: a schema the model would not fill,
   * a context overflow, a refusal. The next provider fails the same way.
   */
  return false;
}

/**
 * Try each provider in order, and say which one answered.
 *
 * `onFallback` is called with the provider that failed and why, so the run's
 * events record that the primary was down rather than leaving an operator to
 * wonder why the writing changed.
 */
export class FallbackLlmClient implements LlmClient {
  constructor(
    private readonly entries: FallbackEntry[],
    private readonly onFallback?: (from: string, to: string, because: string) => void,
  ) {
    if (entries.length === 0) throw new Error('A fallback client needs at least one provider.');
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    let lastError: unknown;

    for (const [i, entry] of this.entries.entries()) {
      try {
        return await entry.client.complete({
          ...request,
          model: entry.modelFor(request.model),
        });
      } catch (error) {
        lastError = error;

        const next = this.entries[i + 1];
        if (!next || !worthFallingBackOn(error)) throw error;

        this.onFallback?.(
          entry.name,
          next.name,
          error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
        );
      }
    }

    /* Unreachable: the loop either returns or throws. Kept for the type. */
    throw lastError;
  }
}
