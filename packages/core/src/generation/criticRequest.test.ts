/**
 * §412. The critic sent a field OpenAI refuses, and called the refusal
 * "no frames were available".
 *
 * `metadata: { promptVersion }` carried telemetry nobody reads, and the API
 * answers *"The 'metadata' parameter is only allowed when 'store' is enabled"*
 * with HTTP 400. Every request this client has ever made was rejected, so the
 * model critic — which works, and produces genuinely useful findings when
 * called — has never once run against a Halyard render.
 *
 * The catch then reported it as an absence of input rather than a failure,
 * which is the hardest kind of silence to find: the gate read `skipped`, the
 * summary read like a benign condition, and nothing anywhere said "400".
 */
import { describe, expect, it, vi } from 'vitest';
import { OpenAiCriticClient } from './critique.js';

function frame(atSeconds: number) {
  return { atSeconds, bytes: Buffer.from([0x89, 0x50]), mimeType: 'image/png', visibleText: ['x'] };
}

describe('what the critic actually sends', () => {
  it('sends no metadata field', () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '{"findings":[]}' } }] }),
    })) as unknown as typeof fetch;

    return new OpenAiCriticClient('sk-test', fetchImpl).critique([frame(0)]).then(() => {
      const body = JSON.parse(
        (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]![1]!
          .body as string,
      );
      expect(body).not.toHaveProperty('metadata');
      expect(body.model).toBeTruthy();
      expect(Array.isArray(body.messages)).toBe(true);
    });
  });

  it('surfaces why it could not run, instead of blaming missing frames', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "The 'metadata' parameter is only allowed when 'store' is enabled." } }),
    })) as unknown as typeof fetch;

    const verdict = await new OpenAiCriticClient('sk-test', fetchImpl).critique([frame(0)]);
    expect(verdict.examined).toBe(0);
    expect(verdict.unavailableBecause).toMatch(/metadata/);
    expect(verdict.summary).toMatch(/could not be reached/);
    /* The old message, which described a broken call as an empty input. */
    expect(verdict.summary).not.toMatch(/No frames were available/);
  });

  it('still invents nothing when it fails', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const verdict = await new OpenAiCriticClient('sk-test', fetchImpl).critique([frame(0)]);
    expect(verdict.findings).toEqual([]);
    expect(verdict.examined).toBe(0);
  });

  it('reports a genuinely empty frame list as exactly that', async () => {
    const verdict = await new OpenAiCriticClient('sk-test', vi.fn() as unknown as typeof fetch).critique([]);
    expect(verdict.summary).toMatch(/No frames were available/);
    expect(verdict.unavailableBecause).toBeUndefined();
  });
});
