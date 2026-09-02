import { describe, expect, it, vi } from 'vitest';
import { rewriteVoScript } from './rewrite.js';

/**
 * §488. The applier must refuse a format piece before it touches anything —
 * so the fake pool answers the narration query and records every other call,
 * and the assertion is that there are none.
 */
function fakeCtx(voLines: unknown, measured?: { wpm: string; speed: string }) {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const pool = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      if (/wordsPerMinute/.test(sql)) return { rows: measured ? [measured] : [{}] };
      if (/vo_lines/.test(sql)) return { rows: [{ vo_lines: voLines }] };
      return { rows: [] };
    }),
  };
  return { ctx: { pool, log: () => undefined } as never, queries };
}

const llm = { complete: vi.fn() } as never;

describe('§488 rewriteVoScript on a format piece', () => {
  it('escalates without loading, writing or calling a model', async () => {
    const { ctx, queries } = fakeCtx([{ atSeconds: 0.25, text: 'Fresh herbs can last two weeks' }]);
    const outcome = await rewriteVoScript(ctx, llm, {
      contentItemId: 'c1',
      defects: [{ rule: 'audio.word_error_rate', evidence: {} }],
    } as never);
    expect(outcome.changed).toEqual([]);
    expect(outcome.escalate).toMatch(/written slots/);
    expect(queries).toHaveLength(1);
    expect((llm as { complete: ReturnType<typeof vi.fn> }).complete).not.toHaveBeenCalled();
  });

  it('goes on to load the piece when the narration is freeform', async () => {
    const { ctx, queries } = fakeCtx(null);
    const outcome = await rewriteVoScript(ctx, llm, {
      contentItemId: 'c1',
      defects: [{ rule: 'audio.word_error_rate', evidence: {} }],
    } as never);
    /* No context row in the fake, so it stops there — but it did try. */
    expect(queries.length).toBeGreaterThan(1);
    expect(outcome.escalate).toMatch(/could not be loaded/);
  });
});

describe('§496 pacing on a format piece is a speed correction', () => {
  const lines = [{ atSeconds: 0.25, text: 'Fresh herbs can last two weeks' }];

  it('re-synthesises slower instead of rewriting the words', async () => {
    const { ctx, queries } = fakeCtx(lines, { wpm: '184', speed: '0.95' });
    const outcome = await rewriteVoScript(ctx, llm, {
      contentItemId: 'c1',
      defects: [{ rule: 'audio.pacing', evidence: { detail: 'Too fast to follow.' } }],
    } as never);

    expect(outcome.changed).toEqual(['voiceover']);
    expect(outcome.note).toMatch(/184 wpm at speed 0.95/);
    expect(outcome.note).toMatch(/words are unchanged/);
    /* 0.95 × (157.5 / 184) = 0.81 */
    const write = queries.find((q) => /voice,speed/.test(q.sql));
    expect(write?.params?.[1]).toBe(0.81);
    expect((llm as { complete: ReturnType<typeof vi.fn> }).complete).not.toHaveBeenCalled();
  });

  it('escalates when the synthesiser cannot go any further', async () => {
    const { ctx } = fakeCtx(lines, { wpm: '200', speed: '0.7' });
    const outcome = await rewriteVoScript(ctx, llm, {
      contentItemId: 'c1',
      defects: [{ rule: 'audio.pacing', evidence: {} }],
    } as never);
    expect(outcome.changed).toEqual([]);
    expect(outcome.escalate).toMatch(/different voice/);
  });

  it('still refuses to rewrite the words for a non-pacing defect', async () => {
    const { ctx } = fakeCtx(lines);
    const outcome = await rewriteVoScript(ctx, llm, {
      contentItemId: 'c1',
      defects: [{ rule: 'audio.word_error_rate', evidence: {} }],
    } as never);
    expect(outcome.escalate).toMatch(/written slots/);
  });
});
