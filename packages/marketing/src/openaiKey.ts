/**
 * The OpenAI key the marketing pipeline may spend on.
 *
 * On 2026-10-27 the marketing key's organization hit its enforced spend limit, and that
 * organization is also RecipeFix production's: production adaptations fell back to Gemini
 * and every route without a second provider failed. Marketing images and reviews must
 * never draw on the budget real readers depend on, so the pipeline only uses its own key
 * (MK_OPENAI_API_KEY, from an OpenAI organization with its own spend limit). Using the
 * shared key needs the owner's explicit opt-in (MK_SHARED_OPENAI_OK=1).
 */
export function marketingOpenAIKey(): string {
  const own = process.env.MK_OPENAI_API_KEY;
  if (own) return own;
  if (process.env.MK_SHARED_OPENAI_OK === '1' && process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  throw new Error(
    'MK_OPENAI_API_KEY is not set. Marketing must use its own OpenAI organization so it can never exhaust the spend limit RecipeFix production runs on. ' +
      'Set MK_OPENAI_API_KEY (separate org with its own limit), or MK_SHARED_OPENAI_OK=1 to accept sharing.',
  );
}
