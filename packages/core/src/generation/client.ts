/**
 * Build the model client every caller should use.
 *
 * Six call sites used to construct `new AnthropicLlmClient()` directly, which
 * made the provider a compile-time fact rather than a configuration one. They
 * all call this instead, so adding a provider is one file and switching is an
 * environment variable.
 */
import { AnthropicLlmClient, modelsFor, resolveLlmProvider, type LlmClient, type LlmProvider } from './llm.js';
import { OpenAiLlmClient } from './openai.js';
import { FallbackLlmClient, type FallbackEntry } from './fallback.js';

export function createLlmClient(
  env: NodeJS.ProcessEnv = process.env,
  onFallback?: (from: string, to: string, because: string) => void,
): LlmClient {
  const provider = resolveLlmProvider(env);

  if (!provider) {
    throw new Error(
      'No model provider is configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in the environment, ' +
        'then run ./scripts/doctor to confirm it is being read.',
    );
  }

  /*
   * §398. Every provider with a usable key, preferred one first.
   *
   * This used to return a single client chosen on key *presence*, so a provider
   * whose balance had run out was still "configured" and every generation died
   * on a 400 while the other vendor's key sat unused in the same file. Three
   * jobs died that way.
   *
   * The preferred provider is still whatever `resolveLlmProvider` decides —
   * `LLM_PROVIDER`, then key order — and the other becomes the fallback rather
   * than being ignored.
   */
  /*
   * Each client resolves a foreign model name to its own tier — `resolveModel`
   * in both — so a request handed on carrying the previous provider's model is
   * translated by the receiver rather than rewritten here. One rule, in the
   * place that knows what it serves.
   */
  const passThrough = (requested: string | undefined): string | undefined => requested;

  const build = (p: LlmProvider): FallbackEntry | null => {
    if (p === 'anthropic') {
      return env.ANTHROPIC_API_KEY?.trim()
        ? {
            name: 'anthropic',
            client: new AnthropicLlmClient(env.ANTHROPIC_API_KEY),
            modelFor: passThrough,
          }
        : null;
    }
    return env.OPENAI_API_KEY?.trim()
      ? { name: 'openai', client: new OpenAiLlmClient(env.OPENAI_API_KEY), modelFor: passThrough }
      : null;
  };

  /*
   * §400. Falling back is a *provider* choice, never a quality one.
   *
   * The rule this respects: in production it is better to fail than to serve
   * something fabricated. A fallback that invented text, returned a placeholder
   * or skipped a check would be exactly that, and none of this does — the other
   * provider runs the same prompt and every QC gate still refuses the result if
   * it does not hold up. A briefed quiz was abandoned rather than published on
   * the very first fallback run, which is the guarantee working.
   *
   * `LLM_FALLBACK=off` turns it off anyway, for a deployment that would rather
   * see the error than have the other vendor answer. Default on, because
   * generating nothing is worse than generating something every gate has
   * approved.
   */
  if (env.LLM_FALLBACK?.trim().toLowerCase() === 'off') {
    const only = build(provider);
    if (!only) {
      throw new Error(
        `LLM_FALLBACK is off and ${provider} has no usable key. Set its key, or allow fallback.`,
      );
    }
    return only.client;
  }

  const order: LlmProvider[] =
    provider === 'anthropic' ? ['anthropic', 'openai'] : ['openai', 'anthropic'];
  const entries = order.map(build).filter((e): e is FallbackEntry => e !== null);

  return entries.length === 1
    ? entries[0]!.client
    : new FallbackLlmClient(entries, onFallback);
}

/**
 * The model to use for a role, for whichever provider is configured.
 *
 * Callers ask for "the strategy model" rather than for a model name, because a
 * caller that hard-codes `claude-opus-4-5` and reaches an OpenAI client asks for
 * a model that does not exist there — a 404 at generation time, which is the
 * worst moment.
 */
export function modelFor(role: 'strategy' | 'draft', env: NodeJS.ProcessEnv = process.env): string {
  const provider = resolveLlmProvider(env) ?? 'anthropic';
  const models = modelsFor(provider);
  return role === 'strategy' ? models.strategy : models.draft;
}
