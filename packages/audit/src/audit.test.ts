/**
 * The Auditor, proved against synthetic phantoms.
 *
 * Every fixture reproduces a defect this repository has actually shipped, so a
 * passing test means the tool would have caught the historical bug — not a toy
 * resembling it.
 *
 * The last block is the important one: it runs the Auditor against the real
 * repository and asserts it finds the orphans we already know about by other
 * means. A rule that passes on fixtures and finds nothing in production is a
 * rule that does not work.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AGENT_REGISTRY, validateRegistry } from '@halyard/core';
import { runAudit, summarise, DEFAULT_ROOTS } from './auditor.js';
import { collectJobFacts } from './collect.js';
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
} from './rules.js';
import { findCallers, findImporters, scan } from './scanner.js';
import {
  factsFor,
  validContract,
  PHANTOM_SCHEDULED_NO_HANDLER,
  PHANTOM_STALE_VERSION,
  PHANTOM_TEST_ONLY_CALLER,
  PHANTOM_UNREACHABLE_FEATURE,
  PHANTOM_UNREGISTERED,
  PHANTOM_UNSUPPLIED_GATE,
  PHANTOM_WRONG_CALLER,
} from './fixtures/phantom.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('phantom capabilities the Auditor must catch', () => {
  it('catches an agent whose only caller is its own test', () => {
    /**
     * `clusterRejections` was reported as wired for weeks because the caller
     * count included test files and `.next` build output.
     */
    const { contract, facts } = PHANTOM_TEST_ONLY_CALLER;
    const findings = ruleNoCaller(facts, contract);

    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe('agent.no_caller');
    // An error, not a warning: the contract claimed a caller.
    expect(findings[0]!.severity).toBe('error');
    expect(findings[0]!.evidence.testCallerCount).toBe(1);
  });

  it('catches a scheduled job with no handler', () => {
    // collect_signals: thirteen jobs over seventy-five hours, no error, no alert.
    const findings = ruleJobGraph(PHANTOM_SCHEDULED_NO_HANDLER);
    const scheduled = findings.filter((f) => f.rule === 'job.scheduled_no_handler');

    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]!.subject).toBe('ghost_job');
    expect(scheduled[0]!.severity).toBe('error');
  });

  it('catches an optional gate input that nothing supplies', () => {
    const findings = ruleUnsuppliedGateInput(PHANTOM_UNSUPPLIED_GATE);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe('gate.input_never_supplied');
    expect(findings[0]!.evidence.neverSupplied).toEqual(['audio', 'visual']);
  });

  it('catches a feature enabled and unreachable', () => {
    const findings = ruleUnreachableFeature(PHANTOM_UNREACHABLE_FEATURE);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe('feature.enabled_unreachable');
  });

  it('catches a contract naming a caller that does not call it', () => {
    const { contract, facts } = PHANTOM_WRONG_CALLER;
    const findings = ruleDeclaredCallerMissing(facts, contract);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe('agent.declared_caller_missing');
  });

  it('catches an agent running outside the registry', () => {
    const findings = rulePromptVersionDrift(PHANTOM_UNREGISTERED, []);
    const unregistered = findings.filter((f) => f.rule === 'agent.unregistered');
    expect(unregistered).toHaveLength(1);
    expect(unregistered[0]!.subject).toBe('ghost_agent.v1');
  });

  it('catches a version that shipped and never ran', () => {
    const { contract, versionsSeen } = PHANTOM_STALE_VERSION;
    const findings = ruleVersionNeverInvoked(contract, { ...EMPTY_RUNTIME, versionsSeen });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe('agent.version_never_invoked');
  });

  it('catches output produced and never consumed', () => {
    const contract = validContract({ agentId: 'produces-nothing-used' });
    const findings = ruleUnusedOutput(contract, {
      ...EMPTY_RUNTIME,
      runCounts: new Map([['produces-nothing-used', 12]]),
      consumedCounts: new Map([['produces-nothing-used', 0]]),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe('output.unconsumed');
  });

  it('catches an implementation the contract points at and the source lacks', () => {
    const findings = ruleImplementationMissing(factsFor({}), validContract());
    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe('agent.implementation_missing');
  });

  it('catches a tool the deployment cannot provide', () => {
    const findings = ruleToolAvailability(
      validContract({ tools: ['llm', 'web-search'] }),
      new Set(['llm']),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.evidence.missing).toEqual(['web-search']);
  });
});

describe('the Auditor does not produce false positives', () => {
  it('counts a caller in the same file as the definition', () => {
    /**
     * The first version excluded the whole definition file to avoid counting
     * recursion, which silently dropped every same-module caller —
     * `runTakeLoop` calling `factCheckTake` twelve lines below it was reported
     * as no-caller for three agents that work perfectly.
     */
    const facts = factsFor({
      definitions: [{ name: 'agentFn', file: 'a.ts' }],
      calls: [{ callee: 'agentFn', file: 'a.ts', enclosing: 'orchestrator' }],
    });
    expect(findCallers(facts, 'agentFn')).toHaveLength(1);
    expect(ruleNoCaller(facts, validContract({ implementation: 'a.ts#agentFn' }))).toEqual([]);
  });

  it('does not count a function calling itself', () => {
    const facts = factsFor({
      definitions: [{ name: 'recursive', file: 'a.ts' }],
      calls: [{ callee: 'recursive', file: 'a.ts', enclosing: 'recursive' }],
    });
    expect(findCallers(facts, 'recursive')).toHaveLength(0);
  });

  it('treats a server action imported by a page as wired', () => {
    /**
     * A server action is referenced, never called — `<form action={draftFind}>`
     * produces no call expression. Requiring one reported two working agents as
     * orphans.
     */
    const facts = factsFor({
      definitions: [{ name: 'draftFind', file: 'actions.ts' }],
      imports: [{ name: 'draftFind', file: 'page.tsx' }],
    });
    expect(findImporters(facts, 'draftFind')).toHaveLength(1);
    expect(ruleNoCaller(facts, validContract({ implementation: 'actions.ts#draftFind' }))).toEqual(
      [],
    );
  });

  it('does not treat a route-path agent as an orphan', () => {
    // An HTTP route is called by the browser, which no call graph contains.
    const audit = auditAgent(
      factsFor({}),
      validContract({ implementation: '/api/compose/stream' }),
      EMPTY_RUNTIME,
    );
    expect(audit.state).not.toBe('implemented_no_caller');
  });

  it('does not report an unused output for an agent that never ran', () => {
    // Already covered by no_caller. Reporting it twice turns the list to noise.
    expect(ruleUnusedOutput(validContract(), EMPTY_RUNTIME)).toEqual([]);
  });

  it('does not flag a knowingly-unhandled job kind', () => {
    const findings = ruleJobGraph({
      declaredKinds: ['generate', 'digest_email'],
      handledKinds: ['generate'],
      scheduledKinds: ['generate'],
      knowinglyUnhandled: { digest_email: 'Not implemented. Nothing enqueues it.' },
    });
    expect(findings).toEqual([]);
  });

  it('flags an exemption that has gone stale', () => {
    // A kind documented as missing that turns out to exist is a stale note, and
    // left alone it would let a removed handler read as a deliberate decision.
    const findings = ruleJobGraph({
      declaredKinds: ['generate'],
      handledKinds: ['generate'],
      scheduledKinds: [],
      knowinglyUnhandled: { generate: 'Not implemented.' },
    });
    expect(findings.map((f) => f.rule)).toContain('job.stale_exemption');
  });
});

describe('capability state cannot be produced by documentation', () => {
  it('will not call an agent exercised on the strength of its own claim', () => {
    /**
     * The rule the whole phase rests on. A contract declaring itself exercised,
     * with an implementation and a caller but no recorded run, is
     * `implemented_partial` — because a caller is not proof of execution.
     */
    const facts = factsFor({
      definitions: [{ name: 'testAgent', file: 'packages/fake/src/agent.ts' }],
      calls: [{ callee: 'testAgent', file: 'packages/fake/src/caller.ts' }],
    });
    const audit = auditAgent(facts, validContract(), EMPTY_RUNTIME);

    expect(audit.declaredState).toBe('implemented_exercised');
    expect(audit.state).toBe('implemented_partial');
    expect(audit.reason).toMatch(/no record of it ever having run/);
  });

  it('reports the divergence as a finding rather than silently disagreeing', () => {
    const facts = factsFor({
      definitions: [{ name: 'testAgent', file: 'packages/fake/src/agent.ts' }],
      calls: [{ callee: 'testAgent', file: 'packages/fake/src/caller.ts' }],
    });
    const findings = ruleStatusOverclaim(auditAgent(facts, validContract(), EMPTY_RUNTIME));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe('capability.overclaimed');
  });

  it('reaches exercised only with a recorded run, a consumer and tests', () => {
    const facts = factsFor({
      definitions: [{ name: 'testAgent', file: 'packages/fake/src/agent.ts' }],
      calls: [{ callee: 'testAgent', file: 'packages/fake/src/caller.ts' }],
    });
    const audit = auditAgent(facts, validContract(), {
      ...EMPTY_RUNTIME,
      runCounts: new Map([['test-agent', 5]]),
      consumedCounts: new Map([['test-agent', 5]]),
    });
    expect(audit.state).toBe('implemented_exercised');
  });
});

describe('against the real repository', () => {
  /**
   * A rule that passes on fixtures and finds nothing in production is a rule
   * that does not work. These assert the Auditor reproduces orphans already
   * established by other means — by hand, in `docs/AUDIT.md`.
   */
  it('parses the real source tree', () => {
    const facts = scan(REPO_ROOT, DEFAULT_ROOTS);
    expect(facts.files.length).toBeGreaterThan(200);
    expect(facts.symbols.length).toBeGreaterThan(1000);
    // Build output must never be scanned: `.next` holds compiled copies of the
    // same source, and counting them as callers is how the previous hand audit
    // got the rejection clusterer wrong.
    expect(facts.files.some((f) => f.file.includes('.next'))).toBe(false);
    expect(facts.files.some((f) => f.file.includes('node_modules'))).toBe(false);
  }, 120_000);

  it('finds the orphans the hand audit found, and no others', () => {
    const report = runAudit({ repoRoot: REPO_ROOT, jobs: collectJobFacts(REPO_ROOT) });
    const orphans = report.agents
      .filter((a) => a.state === 'implemented_no_caller')
      .map((a) => a.agentId)
      .sort();

    expect(orphans).toEqual(['idea-generator', 'rejection-clusterer']);
  }, 120_000);

  it('agrees with the job graph the worker actually registers', () => {
    const jobs = collectJobFacts(REPO_ROOT);
    // Parsing failures here look exactly like catastrophic findings: an earlier
    // version matched no handlers and reported every kind as unhandled.
    expect(jobs.declaredKinds.length).toBeGreaterThan(15);
    expect(jobs.handledKinds.length).toBeGreaterThan(15);
    expect(jobs.scheduledKinds).toContain('collect_signals');
    expect(ruleJobGraph(jobs).filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('keeps the shipped registry structurally valid', () => {
    expect(validateRegistry(AGENT_REGISTRY)).toEqual([]);
  });

  it('summarises without claiming health it cannot prove', () => {
    const report = runAudit({ repoRoot: REPO_ROOT });
    expect(summarise(report)).toMatch(/agents audited/);
    expect(summarise(report)).toMatch(/with no caller/);
  }, 120_000);
});
