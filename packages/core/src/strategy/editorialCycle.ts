/**
 * The autonomous editorial controller.
 *
 * Discovery, performance learning, portfolio balance and generation already
 * exist as separate systems. This module makes the one decision none of them
 * owns alone: which opportunity deserves the next slot on which account.
 *
 * Pure by design. The worker gathers facts; this file ranks them. A controller
 * that needs a model to decide whether to call the model cannot explain why it
 * spent money.
 */
import {
  decideStrategy,
  isRefusal,
  type StrategyAccount,
  type StrategyDecision,
  type StrategyOpportunity,
} from './decide.js';
import type { Insight } from '../learning/insights.js';
import type { PortfolioReport } from '../social/portfolio.js';
import { PLATFORM_STRATEGIES } from '../platform/strategy.js';

export interface EditorialOpportunity extends StrategyOpportunity {
  signalId: string;
}

export interface EditorialAccount {
  account: StrategyAccount;
  portfolio?: PortfolioReport;
  insights?: Insight[];
}

export interface EditorialSelection {
  signalId: string;
  accountId: string;
  platform: string;
  score: number;
  mode: 'explore' | 'exploit';
  decision: StrategyDecision;
  reason: string;
}

export interface EditorialCycleInput {
  opportunities: EditorialOpportunity[];
  accounts: EditorialAccount[];
  /** Already-open decisions, encoded as signalId:accountId. */
  recentDecisionKeys?: string[];
  maxDecisions?: number;
  maxPerAccount?: number;
  maxSignalFanout?: number;
  explorationTarget?: number;
}

export interface EditorialCycleResult {
  selected: EditorialSelection[];
  considered: number;
  refused: Array<{ signalId: string; accountId: string; reason: string }>;
  summary: string;
}

const DEFAULT_EXPLORATION_TARGET = 0.2;

/**
 * Small, explainable "where does this idea belong?" term.
 *
 * This never creates a decision by itself. Opportunity worth remains the main
 * score; platform fit only breaks close calls between connected destinations.
 */
export function editorialPlatformFit(
  opportunity: EditorialOpportunity,
  decision: StrategyDecision,
  platform: string,
): number {
  const strategy =
    PLATFORM_STRATEGIES[platform as keyof typeof PLATFORM_STRATEGIES] ?? null;
  if (!strategy) return 0;

  let fit = 0;

  // A signal observed on one platform stays native to that surface.
  if (opportunity.platform === platform) fit += 0.1;

  switch (opportunity.source) {
    case 'trend':
      if (strategy.discovery === 'recommendation_engine') fit += 0.08;
      else if (strategy.discovery === 'search_index') fit += 0.04;
      if (strategy.primarySignal === 'completion') fit += 0.02;
      else if (strategy.primarySignal === 'post_view_engagement') fit += 0.01;
      break;
    case 'editorial':
      // Recurring questions are conversation/search opportunities.
      if (strategy.primarySignal === 'replies') fit += 0.1;
      else if (strategy.primarySignal === 'search') fit += 0.04;
      else if (strategy.primarySignal === 'post_view_engagement') fit += 0.04;
      break;
    case 'seasonal':
      if (strategy.primarySignal === 'search') fit += 0.08;
      if (strategy.primarySignal === 'saves') fit += 0.07;
      break;
    case 'product_activity':
    case 'changelog':
      if (strategy.primarySignal === 'saves') fit += 0.07;
      else if (strategy.primarySignal === 'completion') fit += 0.06;
      else if (strategy.primarySignal === 'post_view_engagement') fit += 0.05;
      else if (strategy.primarySignal === 'replies') fit += 0.03;
      break;
    case 'submission':
      if (strategy.primarySignal === 'replies') fit += 0.08;
      break;
    case 'performance':
      // Performance signals should normally carry a platform. Do not invent one.
      break;
    default:
      break;
  }

  switch (decision.objective) {
    case 'awareness':
    case 'follower_growth':
      if (strategy.discovery === 'recommendation_engine') fit += 0.05;
      else if (strategy.discovery === 'search_index') fit += 0.02;
      break;
    case 'engagement':
      if (strategy.primarySignal === 'replies') fit += 0.06;
      break;
    case 'education':
      if (strategy.primarySignal === 'search') fit += 0.05;
      else if (strategy.primarySignal === 'post_view_engagement') fit += 0.04;
      else if (strategy.primarySignal === 'saves') fit += 0.03;
      break;
    case 'traffic':
      if (strategy.primarySignal === 'search') fit += 0.06;
      break;
    case 'conversion':
    case 'product_promotion':
      if (strategy.primarySignal === 'saves') fit += 0.05;
      else if (strategy.primarySignal === 'completion') fit += 0.04;
      else if (strategy.primarySignal === 'post_view_engagement') fit += 0.04;
      break;
    case 'retention':
      if (strategy.discovery === 'recommendation_engine') fit += 0.03;
      break;
  }

  // Fit is a tie-breaker, never a reason to resurrect a weak opportunity.
  return Math.min(0.16, Math.round(fit * 1000) / 1000);
}

/**
 * Rank opportunity/account pairs, then greedily choose a small diverse slate.
 *
 * Signal value remains the strongest term. Portfolio exploration can break a
 * close call, never rescue an irrelevant trend. One signal normally reaches
 * one account per cycle: native variants are valuable, identical feeds are not.
 */
export function planEditorialCycle(input: EditorialCycleInput): EditorialCycleResult {
  const maxDecisions = Math.max(0, input.maxDecisions ?? 2);
  const maxPerAccount = Math.max(1, input.maxPerAccount ?? 1);
  const maxSignalFanout = Math.max(1, input.maxSignalFanout ?? 1);
  const explorationTarget = input.explorationTarget ?? DEFAULT_EXPLORATION_TARGET;
  const recent = new Set(input.recentDecisionKeys ?? []);
  const refused: EditorialCycleResult['refused'] = [];
  const candidates: EditorialSelection[] = [];

  for (const opportunity of input.opportunities) {
    for (const accountInput of input.accounts) {
      const key = `${opportunity.signalId}:${accountInput.account.id}`;
      if (recent.has(key)) continue;

      const result = decideStrategy({
        opportunity,
        account: accountInput.account,
        ...(accountInput.portfolio ? { portfolio: accountInput.portfolio } : {}),
        ...(accountInput.insights ? { insights: accountInput.insights } : {}),
      });

      if (isRefusal(result)) {
        refused.push({
          signalId: opportunity.signalId,
          accountId: accountInput.account.id,
          reason: result.reason,
        });
        continue;
      }

      const report = accountInput.portfolio;
      const unexplored = new Set(
        (report?.findings ?? [])
          .filter((finding) => finding.kind === 'unexplored')
          .map((finding) => finding.value),
      );
      const preferredUnexplored = result.preferredTreatments.some((t) => unexplored.has(t));
      const mode: EditorialSelection['mode'] =
        !report || report.window < 5 || report.explorationShare < explorationTarget || preferredUnexplored
          ? 'explore'
          : 'exploit';

      /*
       * Present opportunity value dominates. Strategy confidence and a modest
       * exploration/platform-native tilt break ties without turning novelty
       * into a reason to make weak content.
       */
      const platformFit = editorialPlatformFit(
        opportunity,
        result,
        accountInput.account.platform,
      );
      const explorationBoost = mode === 'explore' ? 0.06 : 0;
      const score =
        opportunity.effectiveValue * 0.64 +
        result.confidence * 0.2 +
        platformFit +
        explorationBoost;

      candidates.push({
        signalId: opportunity.signalId,
        accountId: accountInput.account.id,
        platform: accountInput.account.platform,
        score: Math.round(score * 1000) / 1000,
        mode,
        decision: result,
        reason:
          `${result.whyNow} ` +
          (mode === 'explore'
            ? 'This slot also buys information the portfolio is missing.'
            : 'This slot exploits measured/current evidence without repeating the account mix.'),
      });
    }
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.mode === 'explore') - Number(a.mode === 'explore') ||
      a.platform.localeCompare(b.platform),
  );

  const selected: EditorialSelection[] = [];
  const accountCounts = new Map<string, number>();
  const signalCounts = new Map<string, number>();

  for (const candidate of candidates) {
    if (selected.length >= maxDecisions) break;
    if ((accountCounts.get(candidate.accountId) ?? 0) >= maxPerAccount) continue;
    if ((signalCounts.get(candidate.signalId) ?? 0) >= maxSignalFanout) continue;

    selected.push(candidate);
    accountCounts.set(candidate.accountId, (accountCounts.get(candidate.accountId) ?? 0) + 1);
    signalCounts.set(candidate.signalId, (signalCounts.get(candidate.signalId) ?? 0) + 1);
  }

  return {
    selected,
    considered: candidates.length,
    refused,
    summary:
      selected.length === 0
        ? 'No opportunity/account pair earned an autonomous slot.'
        : `Selected ${selected.length} of ${candidates.length} buildable opportunity/account pairs; ` +
          `${selected.filter((s) => s.mode === 'explore').length} exploration slot(s), ` +
          `${selected.filter((s) => s.mode === 'exploit').length} exploitation slot(s).`,
  };
}
