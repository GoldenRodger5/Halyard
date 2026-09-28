import { describe, expect, it } from 'vitest';
import { planEditorialCycle } from './editorialCycle.js';
import type { PortfolioReport } from '../social/portfolio.js';

const opportunity = (
  id: string,
  value: number,
  platform: string | null = null,
  source: 'trend' | 'editorial' | 'seasonal' | 'product_activity' = 'trend',
) => ({
  id,
  signalId: id,
  summary: `signal ${id}`,
  source,
  effectiveValue: value,
  platform,
});

const account = (id: string, platform: string, portfolio?: PortfolioReport) => ({
  account: {
    id,
    platform,
    capabilityState: 'live',
    lastPublishedAt: null,
  },
  ...(portfolio ? { portfolio } : {}),
});

const maturePortfolio: PortfolioReport = {
  window: 20,
  slices: [],
  findings: [],
  gaps: {},
  explorationShare: 0.25,
  summary: 'balanced',
};

describe('planEditorialCycle', () => {
  it('does not spray one signal across every connected account', () => {
    const result = planEditorialCycle({
      opportunities: [opportunity('s1', 0.9)],
      accounts: [account('tt', 'tiktok'), account('ig', 'instagram'), account('yt', 'youtube')],
      maxDecisions: 3,
    });

    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]!.signalId).toBe('s1');
  });

  it('keeps platform-specific signals on their observed platform', () => {
    const result = planEditorialCycle({
      opportunities: [opportunity('s1', 0.9, 'tiktok')],
      accounts: [account('tt', 'tiktok'), account('ig', 'instagram')],
      maxDecisions: 2,
    });

    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]!.platform).toBe('tiktok');
    expect(result.refused.some((r) => r.accountId === 'ig')).toBe(true);
  });

  it('skips a signal/account pair already decided recently', () => {
    const result = planEditorialCycle({
      opportunities: [opportunity('s1', 0.9), opportunity('s2', 0.7)],
      accounts: [account('tt', 'tiktok')],
      recentDecisionKeys: ['s1:tt'],
      maxDecisions: 1,
    });

    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]!.signalId).toBe('s2');
  });

  it('labels cold or underexplored accounts as exploration without letting novelty outrank weak signals', () => {
    const underexplored: PortfolioReport = {
      ...maturePortfolio,
      explorationShare: 0.05,
      findings: [
        {
          dimension: 'treatment',
          value: 'myth_fact',
          kind: 'unexplored',
          severity: 'warning',
          message: 'not tried',
        },
      ],
    };

    const result = planEditorialCycle({
      opportunities: [opportunity('strong', 0.9), opportunity('weak', 0.2)],
      accounts: [account('tt', 'tiktok', underexplored)],
      maxDecisions: 1,
    });

    expect(result.selected[0]!.signalId).toBe('strong');
    expect(result.selected[0]!.mode).toBe('explore');
  });

  it('routes a general fast-moving trend to the strongest recommendation surface instead of account ordering', () => {
    const result = planEditorialCycle({
      opportunities: [opportunity('trend', 0.9)],
      accounts: [
        account('pin', 'pinterest', maturePortfolio),
        account('yt', 'youtube', maturePortfolio),
        account('ig', 'instagram', maturePortfolio),
        account('tt', 'tiktok', maturePortfolio),
      ],
      maxDecisions: 1,
    });

    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]!.platform).toBe('tiktok');
  });

  it('routes a recurring editorial question toward conversation rather than a generic video feed', () => {
    const result = planEditorialCycle({
      opportunities: [opportunity('question', 0.85, null, 'editorial')],
      accounts: [
        account('tt', 'tiktok', maturePortfolio),
        account('th', 'threads', maturePortfolio),
        account('pin', 'pinterest', maturePortfolio),
        account('yt', 'youtube', maturePortfolio),
      ],
      maxDecisions: 1,
    });

    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]!.platform).toBe('threads');
  });

  it('routes a seasonal opportunity toward a durable save/search surface', () => {
    const result = planEditorialCycle({
      opportunities: [opportunity('seasonal', 0.8, null, 'seasonal')],
      accounts: [
        account('ig', 'instagram', maturePortfolio),
        account('th', 'threads', maturePortfolio),
        account('pin', 'pinterest', maturePortfolio),
      ],
      maxDecisions: 1,
    });

    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]!.platform).toBe('pinterest');
  });

  it('limits autonomous work per account even when several signals are strong', () => {
    const result = planEditorialCycle({
      opportunities: [opportunity('s1', 0.95), opportunity('s2', 0.9), opportunity('s3', 0.85)],
      accounts: [account('tt', 'tiktok', maturePortfolio)],
      maxDecisions: 3,
      maxPerAccount: 1,
    });

    expect(result.selected).toHaveLength(1);
  });
});
