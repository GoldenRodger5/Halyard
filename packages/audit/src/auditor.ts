/**
 * The Halyard Auditor.
 *
 * Compares the architecture's claims against the source code, the call graph,
 * the job graph and runtime execution records, and produces capability states
 * that no document can influence.
 *
 * ## Everything here is deterministic
 *
 * No model is called. Each question this asks — does a symbol exist, does
 * anything call it, is a scheduled kind handled, has this agent ever run — has
 * an exact answer available from a parser or a query. Asking a model would make
 * the answer probabilistic, and a probabilistic truth machine is not one.
 *
 * ## Runtime evidence is optional and its absence is honest
 *
 * Without a database the Auditor still runs and reports every static finding,
 * but no agent can reach `implemented_exercised` — because nothing can prove
 * invocation. That is the correct answer to "is this exercised?" when the
 * evidence is unavailable, and it is why `everInvoked` defaults to false
 * rather than being skipped.
 */
import { AGENT_REGISTRY, validateRegistry, type AgentContract } from '@halyard/core';
import { scan, type FactBase } from './scanner.js';
import {
  auditAgent,
  ruleDeclaredCallerMissing,
  ruleImplementationMissing,
  ruleJobGraph,
  ruleNoCaller,
  rulePromptVersionDrift,
  ruleStatusOverclaim,
  ruleToolAvailability,
  ruleUnreachableFeature,
  ruleUnsuppliedGateInput,
  ruleUnusedOutput,
  ruleVersionNeverInvoked,
  EMPTY_RUNTIME,
  type AgentAudit,
  type FeatureFact,
  type Finding,
  type GateFact,
  type JobFacts,
  type RuntimeEvidence,
} from './rules.js';

/** Source roots. `.next`, `dist` and `node_modules` are excluded by the scanner. */
export const DEFAULT_ROOTS = ['packages', 'apps', 'scripts', 'e2e'];

export interface AuditInput {
  repoRoot: string;
  roots?: string[];
  agents?: AgentContract[];
  jobs?: JobFacts;
  gates?: GateFact[];
  features?: FeatureFact[];
  /** Tools this deployment can actually provide. */
  availableTools?: Set<string>;
  runtime?: RuntimeEvidence;
}

export interface AuditReport {
  startedAt: Date;
  durationMs: number;
  findings: Finding[];
  agents: AgentAudit[];
  counts: { total: number; error: number; warning: number; info: number };
  /** Files parsed, so a report over an empty tree is obviously empty. */
  filesScanned: number;
}

export function runAudit(input: AuditInput): AuditReport {
  const startedAt = new Date();
  const started = Date.now();

  const agents = input.agents ?? AGENT_REGISTRY;
  const runtime = input.runtime ?? EMPTY_RUNTIME;
  const facts: FactBase = scan(input.repoRoot, input.roots ?? DEFAULT_ROOTS);

  const findings: Finding[] = [];

  /**
   * Registry validity first.
   *
   * A malformed contract makes every downstream finding about it unreliable —
   * an agent with no prompt version cannot be attributed, so its "never
   * invoked" finding would be an artefact of the contract rather than a fact
   * about the system.
   */
  for (const violation of validateRegistry(agents)) {
    findings.push({
      rule: `contract.${violation.rule}`,
      severity: 'error',
      subject: violation.agentId,
      subjectKind: 'agent',
      detail: violation.detail,
      evidence: { rule: violation.rule },
    });
  }

  const audits: AgentAudit[] = [];
  for (const agent of agents) {
    findings.push(...ruleImplementationMissing(facts, agent));
    findings.push(...ruleNoCaller(facts, agent));
    findings.push(...ruleDeclaredCallerMissing(facts, agent));
    findings.push(...ruleUnusedOutput(agent, runtime));
    findings.push(...ruleVersionNeverInvoked(agent, runtime));
    if (input.availableTools) {
      findings.push(...ruleToolAvailability(agent, input.availableTools));
    }

    const audit = auditAgent(facts, agent, runtime);
    audits.push(audit);
    findings.push(...ruleStatusOverclaim(audit));
  }

  findings.push(...rulePromptVersionDrift(facts, agents));

  if (input.jobs) findings.push(...ruleJobGraph(input.jobs));
  for (const gate of input.gates ?? []) findings.push(...ruleUnsuppliedGateInput(gate));
  for (const feature of input.features ?? []) findings.push(...ruleUnreachableFeature(feature));

  return {
    startedAt,
    durationMs: Date.now() - started,
    findings,
    agents: audits,
    counts: {
      total: findings.length,
      error: findings.filter((f) => f.severity === 'error').length,
      warning: findings.filter((f) => f.severity === 'warning').length,
      info: findings.filter((f) => f.severity === 'info').length,
    },
    filesScanned: facts.files.length,
  };
}

/**
 * A short human summary, used by the CLI and the UI header.
 *
 * States the counts plainly. A summary that said "healthy" when three agents
 * are orphaned would be the same failure this system exists to catch, one
 * level up.
 */
export function summarise(report: AuditReport): string {
  const orphans = report.agents.filter((a) => a.state === 'implemented_no_caller').length;
  const exercised = report.agents.filter((a) => a.state === 'implemented_exercised').length;
  return [
    `${report.agents.length} agents audited across ${report.filesScanned} files`,
    `${exercised} exercised, ${orphans} with no caller`,
    `${report.counts.error} error(s), ${report.counts.warning} warning(s)`,
  ].join(' · ');
}
