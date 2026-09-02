/**
 * §501. The brief that decides whether any clip is ever asked for.
 *
 * §478 built the whole footage path — a source, a store, a ground that plays
 * in the render — and every piece of it is downstream of two sentences in the
 * screenwriter's prompt. If those sentences stop being sent, nothing errors:
 * the model simply never returns `ground: "footage"`, the worker searches for
 * nothing, and the pipeline goes back to stills while every test still passes.
 * That is the §478 defect shape pointed at itself, so the prompt is asserted.
 */
import { describe, expect, it } from 'vitest';
import { writeScreenplay, type ScreenwriterInput } from './screenwriter.js';
import type { LlmClient } from './llm.js';

/** Captures the prompt and returns a minimal valid screenplay. */
function capturing(): { llm: LlmClient; prompts: string[] } {
  const prompts: string[] = [];
  const llm: LlmClient = {
    complete: async ({ system, messages }) => {
      prompts.push(`${system}\n${messages.map((m) => m.content).join('\n')}`);
      return {
        text: JSON.stringify({
          scenes: [
            {
              id: 's1',
              role: 'hook',
              weight: 'lead',
              seconds: 4,
              ground: 'colour',
              groundSubject: null,
              gestures: [],
            },
          ],
          bedMood: 'warm',
        }),
        model: 'test',
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      };
    },
  };
  return { llm, prompts };
}

const input = (over: Partial<ScreenwriterInput> = {}): ScreenwriterInput =>
  ({
    subject: 'searing a steak',
    format: 'tips',
    channel: 'short_video',
    seconds: { min: 12, max: 55 },
    productFacts: [],
    marks: ['circle'],
    locatable: ['pan'],
    hasFootage: false,
    ...over,
  }) as ScreenwriterInput;

describe('§501 the footage brief reaches the model', () => {
  it('tells the writer what footage is for, and to name a search phrase', async () => {
    const { llm, prompts } = capturing();
    await writeScreenplay(input({ hasFootage: true }), llm);
    const prompt = prompts.join('\n');

    expect(prompt).toMatch(/ground: "footage"/);
    /* The distinction the whole feature turns on: happening, versus at rest. */
    expect(prompt).toMatch(/happening/);
    expect(prompt).toMatch(/photograph.*at rest|at rest/);
    /* And the thing the worker searches with. */
    expect(prompt).toMatch(/groundSubject/);
  });

  it('refuses footage for the product, because a stock clip cannot contain it', async () => {
    const { llm, prompts } = capturing();
    await writeScreenplay(input({ hasFootage: true }), llm);
    expect(prompts.join('\n')).toMatch(/[Nn]ever footage for a scene that names or shows the product/);
  });

  it('says plainly that there is none when no source is configured', async () => {
    const { llm, prompts } = capturing();
    await writeScreenplay(input({ hasFootage: false }), llm);
    const prompt = prompts.join('\n');
    expect(prompt).toMatch(/No footage can be found\. Never call for `footage`\./);
  });

  it('keeps product capture a separate question from footage', async () => {
    const { llm, prompts } = capturing();
    await writeScreenplay(input({ hasFootage: true, hasProductCapture: false }), llm);
    expect(prompts.join('\n')).toMatch(/No recording of the product exists/);
  });
});
