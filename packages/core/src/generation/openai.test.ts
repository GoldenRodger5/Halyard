/**
 * The OpenAI provider.
 *
 * Every assertion here corresponds to something the real API rejected during
 * the swap. They are not hypotheticals: each one was a 400 before it was a test.
 */
import { describe, expect, it } from 'vitest';
import { OpenAiLlmClient, OPENAI_DRAFT_MODEL, OPENAI_STRATEGY_MODEL } from './openai.js';
import { DRAFT_MODEL, STRATEGY_MODEL, describeLlmProvider, modelsFor, resolveLlmProvider } from './llm.js';

interface Sent {
  body: Record<string, unknown>;
}

function scripted(
  respond: (body: Record<string, unknown>, calls: Sent[]) => { status: number; json: unknown },
): { fetchImpl: typeof fetch; calls: Sent[] } {
  const calls: Sent[] = [];
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ body });
    const { status, json } = respond(body, calls);
    return new Response(JSON.stringify(json), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const ok = (text: string) => ({
  status: 200,
  json: {
    choices: [{ message: { content: text }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  },
});

const request = {
  system: 'You write posts.',
  messages: [{ role: 'user' as const, content: 'Write one.' }],
  promptVersion: 'test.v1',
};

describe('OpenAiLlmClient', () => {
  it('refuses a key that is not a key, rather than failing at the first call', () => {
    expect(() => new OpenAiLlmClient('')).toThrow(/not set/);
    expect(() => new OpenAiLlmClient('paste-yours-here')).toThrow(/sk-/);
  });

  it('sends max_completion_tokens, which is what the gpt-5 family accepts', async () => {
    // `max_tokens` is a hard 400 on these models.
    const { fetchImpl, calls } = scripted(() => ok('{"body":"x"}'));
    const client = new OpenAiLlmClient('sk-test', fetchImpl);
    await client.complete({ ...request, maxTokens: 1234 });

    // The value carries reasoning headroom on top of what was asked for; the
    // point of this test is the parameter *name*, which is a hard 400 if wrong.
    expect(calls[0]!.body.max_completion_tokens).toBeDefined();
    expect(calls[0]!.body).not.toHaveProperty('max_tokens');
  });

  it('puts the system prompt in a message, not a top-level field', async () => {
    const { fetchImpl, calls } = scripted(() => ok('{}'));
    await new OpenAiLlmClient('sk-test', fetchImpl).complete(request);

    const messages = calls[0]!.body.messages as Array<{ role: string; content: string }>;
    expect(messages[0]).toEqual({ role: 'system', content: 'You write posts.' });
    expect(calls[0]!.body).not.toHaveProperty('system');
  });

  it('asks for JSON only when the prompt mentions it', async () => {
    // The API 400s on response_format unless the messages contain "json".
    const plain = scripted(() => ok('hello'));
    await new OpenAiLlmClient('sk-test', plain.fetchImpl).complete(request);
    expect(plain.calls[0]!.body).not.toHaveProperty('response_format');

    const jsony = scripted(() => ok('{}'));
    await new OpenAiLlmClient('sk-test', jsony.fetchImpl).complete({
      ...request,
      messages: [{ role: 'user', content: 'Reply with this JSON object.' }],
    });
    expect(jsony.calls[0]!.body.response_format).toEqual({ type: 'json_object' });
  });

  it('drops a parameter the model rejects and retries, rather than failing the job', async () => {
    // gpt-5.5 allows only the default temperature; gpt-5.4-mini takes 0.7. Which
    // is which changes per release, so the API is believed rather than a table.
    const { fetchImpl, calls } = scripted((body) => {
      if (body.temperature !== undefined) {
        return {
          status: 400,
          json: {
            error: {
              message: "Unsupported value: 'temperature' does not support 0.7 with this model.",
              param: 'temperature',
            },
          },
        };
      }
      return ok('{"body":"x"}');
    });

    const result = await new OpenAiLlmClient('sk-test', fetchImpl).complete({
      ...request,
      temperature: 0.7,
    });

    expect(calls).toHaveLength(2);
    expect(calls[1]!.body).not.toHaveProperty('temperature');
    expect(result.text).toContain('body');
  });

  it('gives up on an error it cannot fix by dropping something', async () => {
    const { fetchImpl } = scripted(() => ({
      status: 401,
      json: { error: { message: 'Incorrect API key provided.' } },
    }));
    await expect(new OpenAiLlmClient('sk-test', fetchImpl).complete(request)).rejects.toThrow(
      /401.*Incorrect API key/,
    );
  });

  it('translates a Claude model name into the tier it stands for', async () => {
    // Ten call sites pass DRAFT_MODEL or STRATEGY_MODEL. Passing those through
    // would be a 404 at generation time.
    const draft = scripted(() => ok('{}'));
    await new OpenAiLlmClient('sk-test', draft.fetchImpl).complete({
      ...request,
      model: DRAFT_MODEL,
    });
    expect(draft.calls[0]!.body.model).toBe(OPENAI_DRAFT_MODEL);
    expect(draft.calls[0]!.body.model).not.toMatch(/claude/);

    const strategy = scripted(() => ok('{}'));
    await new OpenAiLlmClient('sk-test', strategy.fetchImpl).complete({
      ...request,
      model: STRATEGY_MODEL,
    });
    expect(strategy.calls[0]!.body.model).toBe(OPENAI_STRATEGY_MODEL);
  });

  it('passes an OpenAI model through untouched', async () => {
    const { fetchImpl, calls } = scripted(() => ok('{}'));
    await new OpenAiLlmClient('sk-test', fetchImpl).complete({ ...request, model: 'gpt-5.4-nano' });
    expect(calls[0]!.body.model).toBe('gpt-5.4-nano');
  });

  it('gives a reasoning model headroom above what the caller asked for', async () => {
    // maxTokens means "text I want back" on Anthropic. On a gpt-5 model the
    // same budget also has to cover invisible reasoning tokens, which are spent
    // before any text is emitted. Passing 1500 straight through returned
    // finish_reason: length and an empty string on the first real run.
    const { fetchImpl, calls } = scripted(() => ok('{}'));
    await new OpenAiLlmClient('sk-test', fetchImpl).complete({ ...request, maxTokens: 1500 });
    expect(Number(calls[0]!.body.max_completion_tokens)).toBeGreaterThan(1500);
  });

  it('retries with a much larger budget when it still ran out of room', async () => {
    const { fetchImpl, calls } = scripted((_body, made) =>
      made.length === 1
        ? { status: 200, json: { choices: [{ message: { content: '' }, finish_reason: 'length' }], usage: {} } }
        : ok('{"body":"made it"}'),
    );

    const result = await new OpenAiLlmClient('sk-test', fetchImpl).complete({
      ...request,
      maxTokens: 1500,
    });

    expect(calls).toHaveLength(2);
    expect(Number(calls[1]!.body.max_completion_tokens)).toBeGreaterThan(
      Number(calls[0]!.body.max_completion_tokens),
    );
    expect(result.text).toContain('made it');
  });

  it('explains an empty completion rather than returning empty text', async () => {
    const { fetchImpl } = scripted(() => ({
      status: 200,
      json: { choices: [{ message: { content: '' }, finish_reason: 'length' }], usage: {} },
    }));
    await expect(new OpenAiLlmClient('sk-test', fetchImpl).complete(request)).rejects.toThrow(
      /max_completion_tokens/,
    );
  });

  it('costs something, so spend is not silently reported as zero', async () => {
    const { fetchImpl } = scripted(() => ok('{}'));
    const result = await new OpenAiLlmClient('sk-test', fetchImpl).complete(request);
    expect(result.costUsd).toBeGreaterThan(0);
    expect(result.inputTokens).toBe(100);
  });
});

describe('provider resolution', () => {
  it('prefers an explicit choice', () => {
    expect(resolveLlmProvider({ LLM_PROVIDER: 'openai', ANTHROPIC_API_KEY: 'sk-ant-x' })).toBe(
      'openai',
    );
  });

  it('falls back to whichever key is actually present', () => {
    expect(resolveLlmProvider({ OPENAI_API_KEY: 'sk-abc' })).toBe('openai');
    expect(resolveLlmProvider({ ANTHROPIC_API_KEY: 'sk-ant-abc' })).toBe('anthropic');
  });

  it('ignores a placeholder that is truthy but not a key', () => {
    expect(resolveLlmProvider({ ANTHROPIC_API_KEY: '# paste yours here' })).toBeNull();
  });

  it('returns null when there is nothing to use, rather than guessing', () => {
    expect(resolveLlmProvider({})).toBeNull();
  });

  it('names the models for whichever provider is chosen', () => {
    expect(modelsFor('openai').draft).toBe(OPENAI_DRAFT_MODEL);
    expect(modelsFor('anthropic').draft).toBe(DRAFT_MODEL);
  });

  it('says which provider is in use, and that OpenAI is the fallback', () => {
    const onOpenAi = describeLlmProvider({ OPENAI_API_KEY: 'sk-abc' });
    expect(onOpenAi).toContain('gpt-5.5');
    expect(onOpenAi).toContain('fallback');
    expect(onOpenAi).toContain('ANTHROPIC_API_KEY');

    expect(describeLlmProvider({ ANTHROPIC_API_KEY: 'sk-ant-x' })).toContain('primary');
    expect(describeLlmProvider({})).toContain('No model provider is configured');
  });

  it('does not call it a fallback when it was chosen deliberately', () => {
    const explicit = describeLlmProvider({ LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-abc' });
    expect(explicit).toContain('chosen explicitly');
    expect(explicit).not.toContain('fallback');
  });
});
