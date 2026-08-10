import { NextResponse, type NextRequest } from 'next/server';
import {
  AnthropicLlmClient,
  HARD_RULES_BLOCK,
  STYLE_RULES_BLOCK,
  runAllGates,
  type SlopPlatform,
} from '@halyard/core';
import { one } from '@/lib/db';
import { requireOperator } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Co-pilot streaming endpoint. v2 Part H.
 *
 * Server-sent events carrying two kinds of frame: prose the model is writing,
 * and a structured draft the preview pane renders. Keeping them separate is what
 * lets the preview update mid-conversation without the chat turning into JSON.
 */
export async function POST(request: NextRequest) {
  await requireOperator();

  const { productId, messages } = (await request.json()) as {
    productId: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not set, so the co-pilot cannot run.' },
      { status: 428 },
    );
  }

  const product = await one<{ name: string; brief_summary: string | null }>(
    'select name, brief_summary from products where id = $1',
    [productId],
  );
  const voice = await one<{ description: string; do_rules: string[]; dont_rules: string[] }>(
    `select description, do_rules, dont_rules from brand_voices
      where product_id = $1 and persona = 'brand'`,
    [productId],
  );

  const system = `You are the co-pilot inside Halyard, a social content system for ${product?.name ?? 'a product'}.

You are talking to the founder. Be direct and specific. Offer two or three angles
rather than one, say which is stronger and why, and ask before doing expensive
work.

${product?.brief_summary ? `PRODUCT\n${product.brief_summary}\n` : ''}
${voice ? `VOICE\n${voice.description}\nDO: ${voice.do_rules.join('; ')}\nNEVER: ${voice.dont_rules.join('; ')}\n` : ''}
${STYLE_RULES_BLOCK}

${HARD_RULES_BLOCK}

When you have written actual post copy, end your message with a fenced block:

\`\`\`draft
{"platform":"x","body":"...","hashtags":[]}
\`\`\`

The preview pane renders that block. Do not emit it until you have copy worth
looking at.`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      try {
        const llm = new AnthropicLlmClient();
        const response = await llm.complete({
          system,
          messages,
          maxTokens: 1500,
          promptVersion: 'copilot.v1',
        });

        // Emit the prose in chunks so the client renders progressively even
        // though the SDK call itself is not incremental here.
        const withoutDraft = response.text.replace(/```draft[\s\S]*?```/g, '').trim();
        for (const chunk of withoutDraft.match(/[\s\S]{1,60}/g) ?? []) {
          send({ type: 'text', text: chunk });
          await new Promise((resolve) => setTimeout(resolve, 12));
        }

        const draftMatch = /```draft\s*([\s\S]*?)```/.exec(response.text);
        if (draftMatch?.[1]) {
          try {
            const parsed = JSON.parse(draftMatch[1]) as {
              platform: SlopPlatform;
              body: string;
              hashtags?: string[];
            };
            // Every draft the co-pilot shows has already been through the gates,
            // so the preview never displays copy the queue would reject.
            const qc = runAllGates({
              copy: {
                body: parsed.body,
                platform: parsed.platform,
                hashtags: parsed.hashtags ?? [],
              },
            });
            send({
              type: 'draft',
              draft: {
                platform: parsed.platform,
                body: parsed.body,
                hashtags: parsed.hashtags ?? [],
                qc: { gates: qc.gates.map((g) => ({ gate: g.gate, status: g.status, summary: g.summary })) },
              },
            });
          } catch {
            send({ type: 'error', message: 'The model emitted a draft block that was not valid JSON.' });
          }
        }

        send({ type: 'done' });
      } catch (err) {
        send({ type: 'error', message: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}
