import { describe, expect, it, vi } from 'vitest';
import { rewriteVoScript } from './rewrite.js';

/**
 * §488. The applier must refuse a format piece before it touches anything —
 * so the fake pool answers the narration query and records every other call,
 * and the assertion is that there are none.
 */
function fakeCtx(voLines: unknown) {
  const queries: string[] = [];
  const pool = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
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
