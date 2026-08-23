/**
 * The registry contract, capability derivation, and the recording seam.
 *
 * These are the rules that stop the registry becoming another document. The
 * one that matters most is in the last block: `deriveState` never sees
 * `declaredStatus`, so no contract can talk itself green.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_REGISTRY,
  agentById,
  agentForPromptVersion,
  registeredPromptVersions,
  validateContract,
  validateRegistry,
  type AgentContract,
} from './index.js';
import { deriveState, explainState, isNotableTransition, rollUp } from './capability.js';
import { recordingLlmClient, recordAgentRun, NULL_SINK, type AgentRunSink } from './recorder.js';

function contract(over: Partial<AgentContract> = {}): AgentContract {
  return {
    agentId: 'sample',
    name: 'Sample',
    team: 'content',
    kind: 'model',
    version: '1.0',
    purpose: 'A valid contract for tests to vary one field at a time.',
    model: 'draft',
    runtimeAttribution: 'prompt_version',
    promptVersions: ['sample.v1'],
    implementation: 'packages/x/src/a.ts#sample',
    inputSchema: { a: 'string' },
    outputSchema: { b: 'string' },
    tools: [],
    expectedCallers: ['packages/x/src/b.ts#caller'],
    downstreamConsumer: 'table',
    permissions: [],
    retries: 0,
    timeoutMs: null,
    state: [],
    observations: [],
    acceptanceTests: [],
    declaredStatus: 'implemented_exercised',
    ...over,
  };
}

describe('contract validation', () => {
  it('accepts a well-formed contract', () => {
    expect(validateContract(contract())).toEqual([]);
  });

  it('refuses an id that is not a durable key', () => {
    // Execution records key on it, so a renamed or oddly-cased id orphans history.
    expect(validateContract(contract({ agentId: 'Sample Agent' }))[0]!.rule).toBe('agent_id.format');
  });

  it('refuses a model agent that cannot be attributed at runtime', () => {
    /**
     * A prompt-version-attributed agent declaring none could never be matched
     * by the recording wrapper, so it would look permanently un-invoked — a
     * false orphan, which is worse than a missing record.
     */
    const violations = validateContract(contract({ promptVersions: [] }));
    expect(violations.map((v) => v.rule)).toContain('prompt_versions.missing');
  });

  it('allows an explicitly-attributed agent to declare no prompt version', () => {
    // The vision describer calls a vision endpoint directly. Forcing a fake
    // version to exist purely to satisfy a validator is how a schema starts
    // producing lies.
    const violations = validateContract(
      contract({ runtimeAttribution: 'explicit', promptVersions: [] }),
    );
    expect(violations.map((v) => v.rule)).not.toContain('prompt_versions.missing');
  });

  it('refuses an explicitly-attributed agent that also claims prompt versions', () => {
    // The same run would be recorded twice.
    const violations = validateContract(contract({ runtimeAttribution: 'explicit' }));
    expect(violations.map((v) => v.rule)).toContain('attribution.contradiction');
  });

  it('refuses a contract claiming to be exercised with no caller named', () => {
    /**
     * Internally contradictory: if something exercises it, the thing is
     * nameable. Caught here rather than by the Auditor because it needs no
     * source access.
     */
    const violations = validateContract(contract({ expectedCallers: [] }));
    expect(violations.map((v) => v.rule)).toContain('status.contradiction');
  });

  it('requires a reason for any status that is not green', () => {
    const violations = validateContract(
      contract({ declaredStatus: 'blocked', statusNote: undefined }),
    );
    expect(violations.map((v) => v.rule)).toContain('status.unexplained');
  });

  it('refuses two agents sharing a prompt version', () => {
    // Runtime attribution would be ambiguous, so both agents' run counts would
    // be wrong in opposite directions.
    const violations = validateRegistry([
      contract({ agentId: 'a' }),
      contract({ agentId: 'b' }),
    ]);
    expect(violations.map((v) => v.rule)).toContain('prompt_version.shared');
  });

  it('refuses duplicate agent ids', () => {
    const violations = validateRegistry([
      contract({ agentId: 'a', promptVersions: ['one.v1'] }),
      contract({ agentId: 'a', promptVersions: ['two.v1'] }),
    ]);
    expect(violations.map((v) => v.rule)).toContain('agent_id.duplicate');
  });
});

describe('the shipped registry', () => {
  it('is structurally valid', () => {
    expect(validateRegistry(AGENT_REGISTRY)).toEqual([]);
  });

  it('registers the known orphans rather than omitting them', () => {
    /**
     * An orphan absent from the registry is invisible; an orphan present is a
     * tracked defect with a name and a reason. Omitting them would make the
     * registry look healthier and the system less honest.
     */
    for (const id of ['auto-clip']) {
      const agent = agentById(id);
      expect(agent, `${id} should be registered`).not.toBeNull();
      expect(agent!.expectedCallers).toEqual([]);
      expect(agent!.statusNote).toBeTruthy();
    }
  });

  it('records a caller for an agent that has stopped being an orphan', () => {
    /**
     * `idea-generator` was on the list above until `proposeFromSignals` gave it
     * one. Leaving it there would have been the same defect in the other
     * direction — a registry claiming a capability is unreachable when it is
     * the entry point of the generation pipeline.
     *
     * It is `implemented_partial`, not exercised: no live model call has ever
     * been made, because there are no credits. The Auditor decides that from
     * `agent_runs`, and this only asserts the contract is no longer empty.
     */
    const agent = agentById('idea-generator');
    expect(agent).not.toBeNull();
    expect(agent!.expectedCallers.length).toBeGreaterThan(0);
    expect(agent!.acceptanceTests.length).toBeGreaterThan(0);
    expect(agent!.declaredStatus).not.toBe('implemented_no_caller');
  });

  it('records a caller for the rejection clusterer', () => {
    /**
     * The second agent to leave that list, on the same day. It had a complete
     * consumer and no producer: the dashboard read `rejection_clusters`,
     * `acceptCluster` promoted one, and nothing ever inserted a row.
     *
     * Unlike `idea-generator` this one needs no credits to be real — the
     * clustering is deterministic — so `implemented_exercised` is a claim about
     * code that runs, not a claim about a model that has never been called.
     */
    const agent = agentById('rejection-clusterer');
    expect(agent).not.toBeNull();
    expect(agent!.expectedCallers).toContain(
      'apps/worker/src/handlers/clusterRejections.ts#clusterRejectionsHandler',
    );
    expect(agent!.acceptanceTests.length).toBeGreaterThan(0);
    expect(agent!.declaredStatus).not.toBe('implemented_no_caller');
  });

  it('maps every prompt version to exactly one agent', () => {
    const versions = registeredPromptVersions();
    expect(new Set(versions).size).toBe(versions.length);
    for (const version of versions) {
      expect(agentForPromptVersion(version)).not.toBeNull();
    }
  });

  it('returns null for a prompt version nobody owns', () => {
    // The recorder relies on this to detect an unregistered agent rather than
    // silently dropping its run.
    expect(agentForPromptVersion('nobody.v1')).toBeNull();
  });
});

describe('capability state derivation', () => {
  const evidence = {
    implementationFound: true,
    callerFound: true,
    outputConsumed: true,
    testsFound: true,
    everInvoked: true,
    recentlyFailing: false,
    blockedReason: null,
  };

  it('is green only when every link in the chain is present', () => {
    expect(deriveState(evidence)).toBe('implemented_exercised');
  });

  it('will not go green on a caller alone', () => {
    // Code that *can* run and code that *has* run are different claims.
    expect(deriveState({ ...evidence, everInvoked: false })).toBe('implemented_partial');
  });

  it('reports no caller when nothing reaches it', () => {
    expect(deriveState({ ...evidence, callerFound: false })).toBe('implemented_no_caller');
  });

  it('reports planned when the implementation is absent', () => {
    expect(deriveState({ ...evidence, implementationFound: false })).toBe('planned');
  });

  it('ranks regression above everything else', () => {
    // A caller and a consumer are depending on it right now.
    expect(deriveState({ ...evidence, recentlyFailing: true })).toBe('regression');
  });

  it('cannot regress from never having run', () => {
    expect(deriveState({ ...evidence, everInvoked: false, recentlyFailing: true })).toBe(
      'implemented_partial',
    );
  });

  it('prefers blocked over no-caller when a reason is given', () => {
    // "Nothing calls it because there is nothing for it to do yet" is a
    // different and less alarming fact than "nobody noticed".
    expect(
      deriveState({ ...evidence, callerFound: false, blockedReason: 'No footage exists.' }),
    ).toBe('blocked');
  });

  it('explains itself in a sentence an operator can act on', () => {
    expect(explainState({ ...evidence, callerFound: false })).toMatch(/nothing in the call graph/);
    expect(explainState({ ...evidence, outputConsumed: false })).toMatch(/consume its output/);
  });
});

describe('state transitions', () => {
  it('flags working to broken', () => {
    expect(isNotableTransition('implemented_exercised', 'implemented_no_caller')).toBe(true);
    expect(isNotableTransition('implemented_partial', 'regression')).toBe(true);
  });

  it('flags reaching green', () => {
    expect(isNotableTransition('implemented_partial', 'implemented_exercised')).toBe(true);
  });

  it('stays quiet when nothing changed', () => {
    // A system that reports noise gets ignored, which is how a real regression
    // goes unread.
    expect(isNotableTransition('implemented_no_caller', 'implemented_no_caller')).toBe(false);
  });

  it('rolls a team up to its worst member, not its average', () => {
    expect(rollUp(['implemented_exercised', 'implemented_exercised', 'regression'])).toBe(
      'regression',
    );
    expect(rollUp(['implemented_exercised', 'implemented_no_caller'])).toBe(
      'implemented_no_caller',
    );
  });
});

describe('the recording seam', () => {
  function spySink(): AgentRunSink & { begun: unknown[]; finished: unknown[] } {
    const begun: unknown[] = [];
    const finished: unknown[] = [];
    return {
      begun,
      finished,
      async begin(start) {
        begun.push(start);
        return `run-${begun.length}`;
      },
      async finish(runId, f) {
        finished.push({ runId, ...f });
      },
    };
  }

  const ok = {
    text: 'result',
    model: 'stub',
    inputTokens: 10,
    outputTokens: 20,
    costUsd: 0.001,
  };

  it('attributes a completion to the agent that owns its prompt version', () => {
    const sink = spySink();
    const client = recordingLlmClient(
      { complete: async () => ok },
      sink,
      { trigger: 'job', triggerRef: 'job-1' },
    );

    return client
      .complete({ system: 's', messages: [], promptVersion: 'copywriter.v1' })
      .then(() => {
        expect((sink.begun[0] as { agentId: string }).agentId).toBe('copywriter');
        expect((sink.finished[0] as { status: string }).status).toBe('succeeded');
      });
  });

  it('records an unregistered prompt version rather than dropping it', () => {
    /**
     * An agent running outside the registry is a finding. A recorder that
     * ignored it would be the one component guaranteed not to notice.
     */
    const sink = spySink();
    const client = recordingLlmClient({ complete: async () => ok }, sink, { trigger: 'job' });

    return client
      .complete({ system: 's', messages: [], promptVersion: 'ghost.v1' })
      .then(() => {
        expect((sink.begun[0] as { agentId: string }).agentId).toBe('unregistered:ghost.v1');
      });
  });

  it('records a failure and still throws', () => {
    const sink = spySink();
    const client = recordingLlmClient(
      {
        complete: async () => {
          throw new Error('model unavailable');
        },
      },
      sink,
      { trigger: 'job' },
    );

    return client
      .complete({ system: 's', messages: [], promptVersion: 'copywriter.v1' })
      .then(
        () => expect.unreachable('should have thrown'),
        () => {
          expect((sink.finished[0] as { status: string }).status).toBe('failed');
        },
      );
  });

  it('never lets a recording failure break the agent', () => {
    /**
     * Telemetry that can take down generation is worse than no telemetry.
     */
    const broken: AgentRunSink = {
      async begin() {
        throw new Error('database down');
      },
      async finish() {
        throw new Error('database down');
      },
    };
    const client = recordingLlmClient({ complete: async () => ok }, broken, { trigger: 'job' });

    return client
      .complete({ system: 's', messages: [], promptVersion: 'copywriter.v1' })
      .then((r) => expect(r.text).toBe('result'));
  });

  it('stores sizes rather than prompts', () => {
    // A run log holding every draft becomes the largest table in the database
    // within a week, and none of the interesting facts are large.
    const sink = spySink();
    const client = recordingLlmClient({ complete: async () => ok }, sink, { trigger: 'job' });

    return client
      .complete({ system: 'a'.repeat(500), messages: [], promptVersion: 'copywriter.v1' })
      .then(() => {
        const input = (sink.begun[0] as { inputRef: Record<string, unknown> }).inputRef;
        expect(input.systemChars).toBe(500);
        expect(JSON.stringify(input)).not.toContain('aaaa');
      });
  });

  it('records an explicitly-attributed agent that never touches the LLM seam', async () => {
    const sink = spySink();
    const result = await recordAgentRun(
      sink,
      {
        agentId: 'vision-describer',
        agentVersion: '1.0',
        team: 'quality',
        trigger: 'job',
      },
      async () => ['frame'],
      (frames) => ({ frames: frames.length }),
    );

    expect(result).toEqual(['frame']);
    expect((sink.finished[0] as { outputRef: { frames: number } }).outputRef.frames).toBe(1);
  });

  it('works with no sink at all, so an unwired context still runs', async () => {
    const client = recordingLlmClient({ complete: async () => ok }, NULL_SINK, {
      trigger: 'unknown',
    });
    await expect(
      client.complete({ system: 's', messages: [], promptVersion: 'copywriter.v1' }),
    ).resolves.toEqual(ok);
    expect(vi.isMockFunction(() => undefined)).toBe(false);
  });
});
