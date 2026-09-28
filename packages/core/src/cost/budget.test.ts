import { describe, expect, it } from 'vitest';
import { PAID_JOB_KINDS, budgetDecision } from './budget.js';

describe('§494 budgetDecision', () => {
  it('pauses a paid kind once the day is spent, and says what to do', () => {
    const d = budgetDecision({ kind: 'generate', spentTodayUsd: 5.004, dailyBudgetUsd: 5 });
    expect(d.proceed).toBe(false);
    expect(d.because).toMatch(/\$5\.00 against a \$5\.00 daily budget/);
    expect(d.because).toMatch(/master\/system/);
  });
  it('lets a paid kind run while there is budget', () => {
    expect(budgetDecision({ kind: 'tts', spentTodayUsd: 4.99, dailyBudgetUsd: 5 }).proceed).toBe(true);
  });

  it('reserves a quoted/capped call before starting so the last job cannot knowingly overshoot', () => {
    const d = budgetDecision({
      kind: 'generate_external_visual',
      spentTodayUsd: 4.2,
      dailyBudgetUsd: 5,
      estimatedJobCostUsd: 1,
    });
    expect(d.proceed).toBe(false);
    expect(d.because).toContain('would exceed the $5.00 daily budget');
  });

  it('allows a quoted/capped call that still fits under the ceiling', () => {
    expect(
      budgetDecision({
        kind: 'generate_external_visual',
        spentTodayUsd: 4.2,
        dailyBudgetUsd: 5,
        estimatedJobCostUsd: 0.75,
      }).proceed,
    ).toBe(true);
  });
  it('never pauses publishing or collection', () => {
    for (const kind of ['publish', 'collect_metrics', 'reconcile_schedule'] as const) {
      expect(PAID_JOB_KINDS).not.toContain(kind);
      expect(budgetDecision({ kind, spentTodayUsd: 100, dailyBudgetUsd: 0 }).proceed).toBe(true);
    }
  });
  it('a zero budget means no paid work today', () => {
    expect(budgetDecision({ kind: 'generate', spentTodayUsd: 0, dailyBudgetUsd: 0 }).proceed).toBe(false);
  });
});
