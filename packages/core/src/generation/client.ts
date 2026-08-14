/**
 * Build the model client every caller should use.
 *
 * Six call sites used to construct `new AnthropicLlmClient()` directly, which
 * made the provider a compile-time fact rather than a configuration one. They
 * all call this instead, so adding a provider is one file and switching is an
 * environment variable.
 */
import { AnthropicLlmClient, modelsFor, resolveLlmProvider, type LlmClient } from './llm.js';
import { OpenAiLlmClient } from './openai.js';

export function createLlmClient(env: NodeJS.ProcessEnv = process.env): LlmClient {
  const provider = resolveLlmProvider(env);

  if (!provider) {
    throw new Error(
      'No model provider is configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in the environment, ' +
        'then run ./scripts/doctor to confirm it is being read.',
    );
  }

  return provider === 'anthropic'
    ? new AnthropicLlmClient(env.ANTHROPIC_API_KEY)
    : new OpenAiLlmClient(env.OPENAI_API_KEY);
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
