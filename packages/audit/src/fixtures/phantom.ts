/**
 * Synthetic phantom capabilities, built to be caught.
 *
 * The implementation plan is explicit that the Auditor must have tests proving
 * it catches deliberately planted defects. Without them the Auditor is one more
 * component asserting that it works — the exact shape of thing it was built to
 * find. An auditor nobody audits is a phantom with extra steps.
 *
 * Each fixture below is a *minimal* reproduction of one real failure this
 * repository has actually produced, so a passing test means the tool would have
 * caught the historical bug rather than a toy version of it.
 */
import type { AgentContract } from '@halyard/core';
import type { FactBase } from '../scanner.js';

/** A contract with every field valid, for tests to vary one thing at a time. */
export function validContract(over: Partial<AgentContract> = {}): AgentContract {
  return {
    agentId: 'test-agent',
    name: 'Test Agent',
    team: 'content',
    kind: 'model',
    version: '1.0',
    purpose: 'Exists so a test can vary exactly one field.',
    model: 'draft',
    runtimeAttribution: 'prompt_version',
    promptVersions: ['test_agent.v1'],
    implementation: 'packages/fake/src/agent.ts#testAgent',
    inputSchema: { in: 'string' },
    outputSchema: { out: 'string' },
    tools: ['llm'],
    expectedCallers: ['packages/fake/src/caller.ts#caller'],
    downstreamConsumer: 'fake_table',
    permissions: [],
    retries: 0,
    timeoutMs: null,
    state: [],
    observations: [],
    acceptanceTests: ['packages/fake/src/agent.test.ts'],
    declaredStatus: 'implemented_exercised',
    ...over,
  };
}

/** Build a fact base by hand, so a rule can be tested without a repository. */
export function factsFor(input: {
  definitions?: Array<{ name: string; file: string; isTest?: boolean }>;
  calls?: Array<{ callee: string; file: string; isTest?: boolean; enclosing?: string | null }>;
  imports?: Array<{ name: string; file: string; isTest?: boolean }>;
  promptVersions?: Array<{ value: string; file: string; isTest?: boolean }>;
}): FactBase {
  return {
    files: [],
    symbols: (input.definitions ?? []).map((d) => ({
      name: d.name,
      file: d.file,
      isTest: d.isTest ?? false,
      exported: true,
      line: 1,
    })),
    calls: (input.calls ?? []).map((c) => ({
      callee: c.callee,
      file: c.file,
      isTest: c.isTest ?? false,
      enclosing: c.enclosing ?? null,
      line: 1,
    })),
    strings: [],
    imports: (input.imports ?? []).map((i) => ({
      name: i.name,
      file: i.file,
      isTest: i.isTest ?? false,
      from: './x',
      line: 1,
    })),
    promptVersions: (input.promptVersions ?? []).map((p) => ({
      value: p.value,
      file: p.file,
      isTest: p.isTest ?? false,
      line: 1,
    })),
  };
}

/**
 * PHANTOM 1 — an agent whose only caller is its own test.
 *
 * The real instance: `clusterRejections`, referenced by `hooks.test.ts` and
 * nothing else, reported as wired for weeks because a caller count included
 * test files and `.next` build output.
 */
export const PHANTOM_TEST_ONLY_CALLER = {
  contract: validContract({
    agentId: 'phantom-test-only',
    implementation: 'packages/fake/src/orphan.ts#orphanAgent',
    expectedCallers: ['packages/fake/src/caller.ts#caller'],
  }),
  facts: factsFor({
    definitions: [{ name: 'orphanAgent', file: 'packages/fake/src/orphan.ts' }],
    calls: [{ callee: 'orphanAgent', file: 'packages/fake/src/orphan.test.ts', isTest: true }],
  }),
};

/**
 * PHANTOM 2 — a scheduled job with no handler.
 *
 * The real instance: `collect_signals` sat on the schedule for the life of the
 * system with no handler registered. The poller claimed each job, found nothing
 * to run, and requeued it. Thirteen accumulated over seventy-five hours with no
 * error, no dead letter and no alert.
 */
export const PHANTOM_SCHEDULED_NO_HANDLER = {
  declaredKinds: ['generate', 'ghost_job'],
  handledKinds: ['generate'],
  scheduledKinds: ['generate', 'ghost_job'],
  knowinglyUnhandled: {},
};

/**
 * PHANTOM 3 — an optional gate input nothing supplies.
 *
 * The real instance, twice: `runAllGates` accepting `visual` and `audio` with
 * no production path passing either, and `runCoherenceQC` accepting `audio`
 * with nothing passing it — three rules unreachable in a gate built to catch
 * unreachable rules.
 */
export const PHANTOM_UNSUPPLIED_GATE = {
  name: 'ghostGate',
  optionalInputs: ['audio', 'visual'],
  suppliedInputs: [] as string[],
};

/**
 * PHANTOM 4 — a feature enabled and unreachable.
 *
 * The real instance: four Remotion templates marked `enabled` in the database
 * while generation only ever created `satori` render rows. Offered by the UI,
 * countable in the mix, and impossible to produce.
 */
export const PHANTOM_UNREACHABLE_FEATURE = {
  id: 'GhostTemplate',
  kind: 'template:remotion',
  enabled: true,
  reachable: false,
  why: 'No non-test code path inserts a remotion render.',
};

/**
 * PHANTOM 5 — a contract naming a caller that does not call it.
 *
 * The real instance: this registry, on its first run, named the setup-kit
 * download route as the caller of `generateProfileCopy` when the actual caller
 * is a server action in a different file. The Auditor caught it.
 */
export const PHANTOM_WRONG_CALLER = {
  contract: validContract({
    agentId: 'phantom-wrong-caller',
    implementation: 'packages/fake/src/agent.ts#realAgent',
    expectedCallers: ['packages/fake/src/wrong.ts#notTheCaller'],
  }),
  facts: factsFor({
    definitions: [{ name: 'realAgent', file: 'packages/fake/src/agent.ts' }],
    calls: [{ callee: 'realAgent', file: 'packages/fake/src/actual.ts' }],
  }),
};

/**
 * PHANTOM 6 — an agent running outside the registry.
 *
 * Not yet observed in this repository, and the reason it is guarded: an agent
 * added without a contract is invisible to the registry, the UI, and every
 * count this system produces — including the count of how many agents exist.
 */
export const PHANTOM_UNREGISTERED = factsFor({
  promptVersions: [{ value: 'ghost_agent.v1', file: 'packages/fake/src/ghost.ts' }],
});

/**
 * PHANTOM 7 — a version deployed but never invoked.
 *
 * Every recorded run is on an older version, so the code shipped and the path
 * that reaches it did not.
 */
export const PHANTOM_STALE_VERSION = {
  contract: validContract({ agentId: 'phantom-stale', version: '2.0' }),
  versionsSeen: new Map([['phantom-stale', new Set(['1.0'])]]),
};
