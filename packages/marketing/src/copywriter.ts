/**
 * The copywriter: one model call per attempt, at most three attempts, each
 * judged by deterministic gates. The model proposes; code decides.
 *
 * Reused from Halyard as-is: `HARD_RULES_BLOCK` and `STYLE_RULES_BLOCK`
 * (`generation/prompts.ts`), the OpenAI client and its cost figure
 * (`generation/openai.ts`), the claim verifier (`qc/claimVerifier.ts`).
 */
import { HARD_RULES_BLOCK, STYLE_RULES_BLOCK, type LlmClient } from '@halyard/core/generation';
import type { Ledger } from './ledger.js';

export const MAX_ATTEMPTS = 3;

export interface Attempt<T> {
  n: number;
  model: string;
  costUsd: number;
  raw: string;
  parsed: T | null;
  problems: string[];
}

export interface CopyResult<T> {
  accepted: T | null;
  attempts: Attempt<T>[];
}

export interface CopyTask<T> {
  run: string;
  system: string;
  user: string;
  /** Deterministic gate. Empty array = accepted. */
  gate: (parsed: T) => string[];
  /** Upper-bound estimate for one call, checked against the ledger before it is made. */
  estimateUsd: number;
  model?: string;
  promptVersion: string;
}

export function systemPrompt(brief: string, extra: string): string {
  return [
    'You write social posts for a cooking product. You are a knowledgeable friend who cooks: plain, specific, a little dry.',
    'Everything you may say about the product is in the BRIEF below. Claims not listed there do not exist.',
    'Every number you write must come from the PROOF excerpts or the FACT SOURCES you are given. Never invent a number, a time or a temperature.',
    HARD_RULES_BLOCK,
    STYLE_RULES_BLOCK,
    extra,
    '=== BRIEF (assembled by code from the product knowledge pack) ===',
    brief,
  ].join('\n\n');
}

export async function writeCopy<T>(llm: LlmClient, ledger: Ledger, task: CopyTask<T>): Promise<CopyResult<T>> {
  const attempts: Attempt<T>[] = [];
  let feedback = '';
  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    ledger.assertCanSpend(task.estimateUsd);
    const response = await llm.complete({
      system: task.system,
      messages: [{ role: 'user', content: task.user + feedback }],
      maxTokens: 3000,
      model: task.model,
      promptVersion: task.promptVersion,
    });
    ledger.record({
      run: task.run,
      provider: 'openai',
      model: response.model,
      purpose: `copy attempt ${n} (${task.promptVersion})`,
      units: { inputTokens: response.inputTokens, outputTokens: response.outputTokens },
      usd: response.costUsd,
      basis: 'Halyard openAiChatCostUsd price table (estimate; generation/openai.ts)',
    });

    let parsed: T | null = null;
    let problems: string[];
    try {
      parsed = JSON.parse(extractJson(response.text)) as T;
      problems = task.gate(parsed);
    } catch (err) {
      problems = [`output was not valid JSON: ${(err as Error).message}`];
    }
    attempts.push({ n, model: response.model, costUsd: response.costUsd, raw: response.text, parsed, problems });
    if (problems.length === 0) return { accepted: parsed, attempts };
    feedback =
      `\n\nYour previous answer was rejected by the automated checks. Fix exactly these and change nothing else that passed:\n- ${problems.join('\n- ')}\n` +
      `Previous answer:\n${response.text}`;
  }
  return { accepted: null, attempts };
}

function extractJson(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('no JSON object in the response');
  return text.slice(start, end + 1);
}
