/**
 * The failure patterns, as pure functions.
 *
 * Every rule here is deterministic. None calls a model, and that is not a
 * cost-saving measure — "does this function have a caller" has a correct
 * answer that a parser can compute and a model can only guess at. Asking a
 * model would make the truth machine probabilistic, which defeats it.
 *
 * A model is warranted only where interpretation is genuinely required, and
 * none of these need it. If one ever does, it belongs behind an explicit seam
 * with the deterministic answer still preferred where available.
 *
 * Each rule is separately testable and each is proved against a synthetic
 * fixture that deliberately contains the defect — see `fixtures/`.
 */
import {
  deriveState,
  explainState,
  type AgentContract,
  type CapabilityAuditState,
  type CapabilityEvidence,
} from '@halyard/core';
import {
  findCallers,
  findDefinition,
  findImporters,
  findTestCallers,
  type FactBase,
} from './scanner.js';

export type FindingSeverity = 'error' | 'warning' | 'info';
export type SubjectKind = 'agent' | 'job' | 'gate' | 'integration' | 'feature' | 'source';

export interface Finding {
  rule: string;
  severity: FindingSeverity;
  subject: string;
  subjectKind: SubjectKind;
  detail: string;
  evidence: Record<string, unknown>;
}

export interface RuntimeEvidence {
  /** agent_id → number of recorded runs. */
  runCounts: Map<string, number>;
  /** agent_id → recent runs that failed. */
  recentFailures: Map<string, number>;
  /** agent_id → runs whose output was stamped as consumed. */
  consumedCounts: Map<string, number>;
  /** agent_id → versions seen in execution records. */
  versionsSeen: Map<string, Set<string>>;
}

export const EMPTY_RUNTIME: RuntimeEvidence = {
  runCounts: new Map(),
  recentFailures: new Map(),
  consumedCounts: new Map(),
  versionsSeen: new Map(),
};

/** The symbol half of `path/to/file.ts#symbol`. Null for a route path. */
export function symbolOf(implementation: string): string | null {
  const hash = implementation.indexOf('#');
  if (hash === -1) return null;
  const symbol = implementation.slice(hash + 1);
  // `Class.method` → `method`, which is how the scanner records it.
  const dot = symbol.lastIndexOf('.');
  return dot === -1 ? symbol : symbol.slice(dot + 1);
}

export function fileOf(implementation: string): string | null {
  const hash = implementation.indexOf('#');
  return hash === -1 ? null : implementation.slice(0, hash);
}

// ── Rule: an agent whose implementation does not exist ─────────────────────

export function ruleImplementationMissing(facts: FactBase, agent: AgentContract): Finding[] {
  const symbol = symbolOf(agent.implementation);
  // A route-path implementation is a file, not a symbol; its existence is
  // checked by `ruleRouteMissing` instead.
  if (!symbol) return [];

  if (findDefinition(facts, symbol)) return [];

  return [
    {
      rule: 'agent.implementation_missing',
      severity: 'error',
      subject: agent.agentId,
      subjectKind: 'agent',
      detail: `The contract points at '${agent.implementation}' and no such symbol exists in the source.`,
      evidence: { implementation: agent.implementation, symbol },
    },
  ];
}

// ── Rule: declared agent with no caller ────────────────────────────────────

/**
 * The pattern this repository has produced most often.
 *
 * Reported at `warning` when the contract already admits it, and `error` when
 * the contract claims otherwise — an honest orphan is a tracked defect, while a
 * contract asserting a caller that does not exist is actively misleading.
 */
export function ruleNoCaller(facts: FactBase, agent: AgentContract): Finding[] {
  const symbol = symbolOf(agent.implementation);
  if (!symbol) return [];
  if (!findDefinition(facts, symbol)) return [];

  const callers = findCallers(facts, symbol);
  if (callers.length > 0) return [];

  /**
   * A non-test importer counts as wiring.
   *
   * A server action is imported and handed to a `<form action={...}>`; there is
   * no call expression to find. Requiring one reported two working agents as
   * orphans.
   */
  const importers = findImporters(facts, symbol).filter(
    (i) => i.file !== fileOf(agent.implementation),
  );
  if (importers.length > 0) return [];

  const testCallers = findTestCallers(facts, symbol);
  const admits =
    agent.expectedCallers.length === 0 ||
    agent.declaredStatus === 'implemented_no_caller' ||
    agent.declaredStatus === 'blocked' ||
    agent.declaredStatus === 'planned';

  return [
    {
      rule: 'agent.no_caller',
      severity: admits ? 'warning' : 'error',
      subject: agent.agentId,
      subjectKind: 'agent',
      detail: admits
        ? `No caller, as the contract states. ${testCallers.length} test reference(s) — a test is not a caller.`
        : `The contract claims ${agent.expectedCallers.length} caller(s) and the call graph has none. ${testCallers.length} test reference(s).`,
      evidence: {
        symbol,
        expectedCallers: agent.expectedCallers,
        testCallerCount: testCallers.length,
        testFiles: [...new Set(testCallers.map((c) => c.file))],
      },
    },
  ];
}

// ── Rule: a declared caller that does not actually call ────────────────────

/**
 * A contract naming a caller that does not call it.
 *
 * This is the rule that catches documentation drifting away from code while
 * still looking maintained — the contract is specific, plausible, and wrong.
 */
export function ruleDeclaredCallerMissing(facts: FactBase, agent: AgentContract): Finding[] {
  const symbol = symbolOf(agent.implementation);
  if (!symbol) return [];

  const actualFiles = new Set([
    ...findCallers(facts, symbol).map((c) => c.file),
    ...findImporters(facts, symbol).map((i) => i.file),
  ]);
  const findings: Finding[] = [];

  for (const declared of agent.expectedCallers) {
    const file = fileOf(declared) ?? declared;
    if (actualFiles.has(file)) continue;

    findings.push({
      rule: 'agent.declared_caller_missing',
      severity: 'error',
      subject: agent.agentId,
      subjectKind: 'agent',
      detail: `The contract names '${declared}' as a caller, and no call to '${symbol}' appears in that file.`,
      evidence: { declared, symbol, actualCallerFiles: [...actualFiles] },
    });
  }

  return findings;
}

// ── Rule: prompt version claimed but never sent, and vice versa ────────────

/**
 * Two-way check between the registry and the source.
 *
 * A version claimed by a contract that no file emits describes an agent that
 * cannot run. A version in the source claimed by no contract is an agent
 * running unregistered — invisible to the registry, the UI and every count.
 */
export function rulePromptVersionDrift(facts: FactBase, agents: AgentContract[]): Finding[] {
  const findings: Finding[] = [];
  const inSource = new Set(facts.promptVersions.filter((s) => !s.isTest).map((s) => s.value));

  const claimed = new Map<string, string>();
  for (const agent of agents) {
    for (const version of agent.promptVersions) {
      claimed.set(version, agent.agentId);
      if (!inSource.has(version)) {
        findings.push({
          rule: 'agent.prompt_version_absent',
          severity: 'error',
          subject: agent.agentId,
          subjectKind: 'agent',
          detail: `Claims prompt version '${version}', which no non-test source file emits. Its runs could never be attributed.`,
          evidence: { promptVersion: version },
        });
      }
    }
  }

  /**
   * The other direction: a prompt version the source emits and no contract
   * claims is an agent running outside the registry — invisible to the UI, to
   * every count, and to this audit's own agent list.
   */
  for (const version of inSource) {
    if (claimed.has(version)) continue;
    findings.push({
      rule: 'agent.unregistered',
      severity: 'error',
      subject: version,
      subjectKind: 'agent',
      detail: `Prompt version '${version}' is emitted by the source and claimed by no contract — an agent running outside the registry.`,
      evidence: {
        promptVersion: version,
        files: [
          ...new Set(facts.promptVersions.filter((s) => s.value === version).map((s) => s.file)),
        ],
      },
    });
  }

  return findings;
}

// ── Rule: a scheduled job with no handler ──────────────────────────────────

export interface JobFacts {
  declaredKinds: string[];
  handledKinds: string[];
  scheduledKinds: string[];
  /** Kinds documented as deliberately unhandled, with the reason. */
  knowinglyUnhandled: Record<string, string>;
}

export function ruleJobGraph(jobs: JobFacts): Finding[] {
  const findings: Finding[] = [];
  const handled = new Set(jobs.handledKinds);

  for (const kind of jobs.scheduledKinds) {
    if (handled.has(kind)) continue;
    findings.push({
      rule: 'job.scheduled_no_handler',
      severity: 'error',
      subject: kind,
      subjectKind: 'job',
      detail:
        'Scheduled and has no handler. The poller will claim it, find nothing to run, and requeue it forever without an error.',
      evidence: { kind },
    });
  }

  for (const kind of jobs.declaredKinds) {
    if (handled.has(kind)) continue;
    if (kind in jobs.knowinglyUnhandled) continue;
    findings.push({
      rule: 'job.no_handler',
      severity: 'warning',
      subject: kind,
      subjectKind: 'job',
      detail: 'Declared as a job kind with no handler and no written reason for its absence.',
      evidence: { kind },
    });
  }

  /** A documented-as-missing kind that turns out to exist is a stale note. */
  for (const kind of Object.keys(jobs.knowinglyUnhandled)) {
    if (!handled.has(kind)) continue;
    findings.push({
      rule: 'job.stale_exemption',
      severity: 'warning',
      subject: kind,
      subjectKind: 'job',
      detail: `Documented as knowingly unhandled — "${jobs.knowinglyUnhandled[kind]}" — but a handler is registered.`,
      evidence: { kind, reason: jobs.knowinglyUnhandled[kind] },
    });
  }

  return findings;
}

// ── Rule: output produced but never consumed ───────────────────────────────

/**
 * Static analysis cannot see a consumer that reads a database row an hour
 * later, so this uses runtime evidence: succeeded runs whose output nothing
 * ever stamped as used.
 *
 * Reported only for agents that have actually run. An agent with no runs is
 * already covered by `no_caller` or `never_invoked`, and reporting it twice
 * turns the finding list into noise.
 */
export function ruleUnusedOutput(agent: AgentContract, runtime: RuntimeEvidence): Finding[] {
  const runs = runtime.runCounts.get(agent.agentId) ?? 0;
  if (runs === 0) return [];

  const consumed = runtime.consumedCounts.get(agent.agentId) ?? 0;
  if (consumed > 0) return [];

  return [
    {
      rule: 'output.unconsumed',
      severity: 'warning',
      subject: agent.agentId,
      subjectKind: 'agent',
      detail: `${runs} successful run(s) and not one output recorded as consumed. Either nothing reads it, or the consumer never stamps it.`,
      evidence: { runs, declaredConsumer: agent.downstreamConsumer },
    },
  ];
}

// ── Rule: a version deployed but never invoked ─────────────────────────────

export function ruleVersionNeverInvoked(agent: AgentContract, runtime: RuntimeEvidence): Finding[] {
  const seen = runtime.versionsSeen.get(agent.agentId);
  if (!seen || seen.size === 0) return [];
  if (seen.has(agent.version)) return [];

  return [
    {
      rule: 'agent.version_never_invoked',
      severity: 'warning',
      subject: agent.agentId,
      subjectKind: 'agent',
      detail: `The registry declares version ${agent.version}; every recorded run is on ${[...seen].join(', ')}. The current version has never run.`,
      evidence: { declaredVersion: agent.version, seenVersions: [...seen] },
    },
  ];
}

// ── Rule: a declared tool that is not available ────────────────────────────

export function ruleToolAvailability(
  agent: AgentContract,
  available: Set<string>,
): Finding[] {
  const missing = agent.tools.filter((t) => !available.has(t));
  if (missing.length === 0) return [];

  return [
    {
      rule: 'tool.unavailable',
      severity: 'warning',
      subject: agent.agentId,
      subjectKind: 'agent',
      detail: `Declares tool(s) ${missing.join(', ')}, which this deployment cannot provide. Any run needing one will refuse.`,
      evidence: { missing, declared: agent.tools },
    },
  ];
}

// ── Rule: a gate whose input is never supplied ─────────────────────────────

export interface GateFact {
  /** The gate's name, e.g. `coherence`. */
  name: string;
  /** Optional inputs it accepts, e.g. `audio`. */
  optionalInputs: string[];
  /** Which of those any non-test caller actually passes. */
  suppliedInputs: string[];
}

/**
 * The pattern that has bitten three times: `runAllGates` taking `visual` and
 * `audio` as optional and no production path supplying either, and
 * `runCoherenceQC` taking `audio` with nothing passing it.
 *
 * An optional input is a promise that something will pass it. When nothing
 * does, the rules depending on it are unreachable and the gate still reports
 * a pass.
 */
export function ruleUnsuppliedGateInput(gate: GateFact): Finding[] {
  const supplied = new Set(gate.suppliedInputs);
  const never = gate.optionalInputs.filter((i) => !supplied.has(i));
  if (never.length === 0) return [];

  return [
    {
      rule: 'gate.input_never_supplied',
      severity: 'error',
      subject: gate.name,
      subjectKind: 'gate',
      detail: `Accepts optional input(s) ${never.join(', ')} that no caller supplies. Every rule depending on them is unreachable, and the gate still reports a pass.`,
      evidence: { gate: gate.name, neverSupplied: never, optional: gate.optionalInputs },
    },
  ];
}

// ── Rule: a feature enabled but unreachable ────────────────────────────────

export interface FeatureFact {
  id: string;
  kind: string;
  enabled: boolean;
  /** Whether any non-test code path can produce it. */
  reachable: boolean;
  why: string;
}

export function ruleUnreachableFeature(feature: FeatureFact): Finding[] {
  if (!feature.enabled || feature.reachable) return [];

  return [
    {
      rule: 'feature.enabled_unreachable',
      severity: 'error',
      subject: feature.id,
      subjectKind: 'feature',
      detail: `Marked enabled and no code path can produce it. ${feature.why}`,
      evidence: { id: feature.id, kind: feature.kind },
    },
  ];
}

// ── Rule: a Brain category nothing can fill ────────────────────────────────

export interface BrainCategoryFact {
  category: string;
  /** Whether some registered agent declares it can propose facts here. */
  reachable: boolean;
  /** Facts currently stored in it, when runtime evidence is available. */
  factCount: number;
}

/**
 * A fact category the Product Brain offers and no agent can produce.
 *
 * The same phantom-capability pattern as `feature.enabled_unreachable`, applied
 * to knowledge instead of media: `/brain/[category]` will render a heading for
 * any category in `FACT_CATEGORIES`, and a category no agent proposes into is a
 * promise the system cannot keep.
 *
 * A **warning**, not an error. The architecture names eighteen categories and
 * P1 builds agents for a subset on purpose — an unbuilt category is a tracked
 * gap, exactly like a registered orphan agent, and calling it an error would
 * make a truthful roadmap look like a broken build.
 *
 * What makes this worth a rule rather than a comment is regression: an agent
 * losing a category from its declared list silently turns a working section
 * into an empty one, and nothing else in the system would notice.
 */
export function ruleUnreachableBrainCategory(fact: BrainCategoryFact): Finding[] {
  if (fact.reachable) return [];

  return [
    {
      rule: 'brain.category_unreachable',
      severity: 'warning',
      subject: fact.category,
      subjectKind: 'feature',
      detail:
        fact.factCount > 0
          ? `The Brain offers this category and no registered agent proposes into it, yet ${fact.factCount} fact(s) are stored — so something wrote facts nothing can now maintain.`
          : 'The Brain offers this category and no registered agent can propose into it. It will stay empty however much evidence is collected.',
      evidence: { category: fact.category, factCount: fact.factCount },
    },
  ];
}

// ── Capability state derivation ────────────────────────────────────────────

export interface AgentAudit {
  agentId: string;
  state: CapabilityAuditState;
  declaredState: CapabilityAuditState;
  reason: string;
  evidence: CapabilityEvidence & { callerFiles: string[]; runs: number };
}

/**
 * The observed state of one agent.
 *
 * Note what is *not* an input: `agent.declaredStatus`. The contract's own claim
 * never reaches `deriveState`, which is what stops documentation producing
 * green. It is returned alongside only so the UI can show a divergence.
 */
export function auditAgent(
  facts: FactBase,
  agent: AgentContract,
  runtime: RuntimeEvidence,
): AgentAudit {
  const symbol = symbolOf(agent.implementation);
  const definition = symbol ? findDefinition(facts, symbol) : null;

  /**
   * A route-path agent is reachable by definition — an HTTP route is called by
   * the browser, which no call graph contains. Treating it as an orphan would
   * report three false positives every run.
   */
  const isRoute = symbol === null;
  const callers = symbol ? findCallers(facts, symbol) : [];
  const importers = symbol
    ? findImporters(facts, symbol).filter((i) => i.file !== fileOf(agent.implementation))
    : [];

  const runs = runtime.runCounts.get(agent.agentId) ?? 0;
  const failures = runtime.recentFailures.get(agent.agentId) ?? 0;

  const evidence: CapabilityEvidence = {
    implementationFound: isRoute ? true : Boolean(definition),
    callerFound: isRoute ? true : callers.length > 0 || importers.length > 0,
    outputConsumed: (runtime.consumedCounts.get(agent.agentId) ?? 0) > 0,
    testsFound: agent.acceptanceTests.length > 0,
    everInvoked: runs > 0,
    recentlyFailing: runs > 0 && failures > 0 && failures >= runs / 2,
    blockedReason:
      agent.declaredStatus === 'blocked' ? (agent.statusNote ?? 'Declared blocked.') : null,
  };

  return {
    agentId: agent.agentId,
    state: deriveState(evidence),
    declaredState: agent.declaredStatus,
    reason: explainState(evidence),
    evidence: {
      ...evidence,
      callerFiles: [...new Set([...callers.map((c) => c.file), ...importers.map((i) => i.file)])],
      runs,
    },
  };
}

/** A contract whose declared status is better than the observed one. */
export function ruleStatusOverclaim(audit: AgentAudit): Finding[] {
  const rank: Record<CapabilityAuditState, number> = {
    implemented_exercised: 5,
    implemented_partial: 4,
    planned: 3,
    blocked: 2,
    implemented_no_caller: 1,
    regression: 0,
  };

  if (rank[audit.declaredState] <= rank[audit.state]) return [];

  return [
    {
      rule: 'capability.overclaimed',
      severity: 'warning',
      subject: audit.agentId,
      subjectKind: 'agent',
      detail: `The contract declares '${audit.declaredState}'; the evidence supports '${audit.state}'. ${audit.reason}`,
      evidence: { declared: audit.declaredState, observed: audit.state },
    },
  ];
}
