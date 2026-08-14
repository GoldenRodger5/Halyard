import { readFileSync } from 'node:fs';
/**
 * Prove the model provider works, end to end. Milestone 48.
 *
 *   pnpm llm-check
 *
 * Writes one real draft through the copywriter — the same path the worker uses,
 * including the QC retry loop — and reports which provider served it, at what
 * cost. A key that authenticates is not the same as a provider that can produce
 * a post that passes the gates, and only the second one matters.
 */
import { createLlmClient, describeLlmProvider, writeDraft } from '@halyard/core';

for (const line of readFileSync('apps/web/.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
}

async function main(): Promise<void> {
  console.log('\n' + describeLlmProvider() + '\n');
  const llm = createLlmClient();

  const draft = await writeDraft(
    {
      platform: 'x',
      format: 'text',
      category: 'education',
      persona: 'brand',
      idea: {
        title: 'Why gluten-free bread goes gummy',
        angle: 'The starch holds water that wheat would have released.',
      },
      voice: {
        displayName: 'RecipeFix',
        description: 'Plain, specific, never markety. Writes like a cook who has failed at this.',
        doRules: ['name the mechanism', 'give one concrete number'],
        dontRules: ['no hype', 'no emoji'],
        examples: [],
      },
      productBrief:
        'RecipeFix adapts any recipe to a dietary need. It does not guarantee allergy safety.',
      contentRules: { forbiddenClaims: ['medical or allergy-safety guarantee'] },
    },
    llm,
  );

  console.log('--- draft ---\n' + draft.body);
  console.log('\nhashtags:', draft.hashtags.join(', ') || 'none');
  console.log('alt text:', draft.altText ?? 'none');
  console.log('attempts:', draft.attempts, '| QC passed:', draft.qc.passed);
  console.log(
    'model:', draft.generationMeta?.model,
    '| cost: $' + (draft.generationMeta?.costUsd ?? 0),
    '| tokens:', draft.generationMeta?.inputTokens, 'in /', draft.generationMeta?.outputTokens, 'out',
  );
}

main().catch((err) => {
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
