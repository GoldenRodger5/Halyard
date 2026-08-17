/**
 * The agent execution contract.
 *
 * ## Why a contract, and why it does not decide its own status
 *
 * The master architecture is explicit that an agent is not implemented merely
 * because its function exists. It is implemented when the contract exists, the
 * caller exists, the execution path exists, the output is consumed, tests cover
 * the path, and runtime telemetry can prove invocation.
 *
 * That creates an obvious trap: a registry where each entry states its own
 * status is a document, and this repository has already proved — repeatedly —
 * that documentation is where phantom capabilities live. An entry claiming
 * `implemented_exercised` is worth nothing on its own.
 *
 * So the split here is deliberate and load-bearing:
 *
 * - **The contract declares intent.** What the agent is for, who is expected to
 *   call it, what it produces, who is expected to consume that.
 * - **The Auditor derives the observed state** from source code, the call
 *   graph, the job graph, the database and execution records.
 * - **Divergence between the two is itself a finding.** A contract claiming a
 *   caller that does not exist is a lie the system can now detect.
 *
 * `declaredStatus` therefore records what we *believe*, never what is true. The
 * UI shows the observed state; the declared one appears only when they differ.
 */

/**
 * The capability states from the master architecture, §14.
 *
 * Named `CapabilityAuditState` rather than `CapabilityState` because that name
 * is already taken, by a different and equally real thing: a social account's
 * platform capability (`pending_auth` / `draft_only` / `live` / `error` /
 * `disabled`). Those are different axes — one is "can this account post", the
 * other is "is this capability actually wired" — and collapsing them into one
 * name would be the first step to collapsing them into one concept.
 *
 * Ordered worst-to-best is deliberately *not* how they are listed — these are
 * not a severity scale. `blocked` is a legitimate resting state for something
 * waiting on a credential; `implemented_no_caller` is a defect.
 */
export const CAPABILITY_AUDIT_STATES = [
  /** Implemented, and something actually invoked it. */
  'implemented_exercised',
  /** Implemented and reachable, but not every declared path is exercised. */
  'implemented_partial',
  /** The code exists and nothing calls it. The failure this repo keeps finding. */
  'implemented_no_caller',
  /** Declared in the architecture, not yet built. */
  'planned',
  /** Cannot proceed — a credential, a licence, an external dependency. */
  'blocked',
  /** Previously exercised, now failing or unreachable. */
  'regression',
] as const;

export type CapabilityAuditState = (typeof CAPABILITY_AUDIT_STATES)[number];

/** The colour vocabulary the architecture and the UI share. */
export const STATE_COLOUR: Record<CapabilityAuditState, 'green' | 'yellow' | 'orange' | 'blue' | 'red' | 'grey'> = {
  implemented_exercised: 'green',
  implemented_partial: 'yellow',
  implemented_no_caller: 'orange',
  planned: 'blue',
  blocked: 'red',
  regression: 'grey',
};

/**
 * Teams from the master architecture §3–§13.
 *
 * `content`, `quality`, `founder`, `setup` and `explorer` describe what exists
 * today. The rest are declared because the architecture names them and because
 * an agent added later should land in a team that already has a name — but no
 * agent may claim one of those teams while P0 is the current phase.
 */
export const AGENT_TEAMS = [
  'content',
  'quality',
  'founder',
  'setup',
  'explorer',
  'engagement',
  'learning',
  'product_intelligence',
  'platform_intelligence',
  'social_discovery',
  'opportunity',
  'growth',
  'system',
] as const;

export type AgentTeam = (typeof AGENT_TEAMS)[number];

/** How an agent is driven. */
export type AgentKind =
  /** A model call: perception, reasoning, synthesis, writing. */
  | 'model'
  /** Deterministic code registered as an agent because it owns a decision. */
  | 'deterministic';

export interface AgentContract {
  /** Stable identifier. Never reused, never renamed — execution records key on it. */
  agentId: string;
  name: string;
  team: AgentTeam;
  kind: AgentKind;
  /** Bumped when the prompt, schema or behaviour changes materially. */
  version: string;
  purpose: string;

  /** Model tier, or null for a deterministic agent. */
  model: string | null;

  /**
   * The `promptVersion` values this agent sends with its model calls.
   *
   * This is the attribution key. Every `llm.complete` in the codebase carries
   * one, so a recording wrapper at the client seam can attribute a run to an
   * agent **without any agent knowing it is being recorded** — no call site is
   * modified to gain telemetry.
   *
   * The Auditor checks this both ways: a prompt version in the source claimed
   * by no agent is an unregistered agent, and a version claimed here that no
   * source file emits is a contract describing something that cannot run.
   */
  promptVersions: string[];

  /**
   * How a run is attributed to this agent at runtime.
   *
   * `prompt_version` is the default and covers every chat-completion agent: the
   * recording wrapper at the LLM client seam reads the version off the request.
   *
   * `explicit` is for an agent that does not go through `LlmClient` at all —
   * the vision describer calls a vision endpoint directly and carries no prompt
   * version. Requiring one would have forced a fake version to exist purely to
   * satisfy a validator, which is how a schema starts producing lies.
   */
  runtimeAttribution: 'prompt_version' | 'explicit';

  /** `path/to/file.ts#exportedSymbol`, or a route path for inline agents. */
  implementation: string;

  /** Shape of the input, described for the UI. Not a runtime validator. */
  inputSchema: Record<string, string>;
  outputSchema: Record<string, string>;

  /** External capabilities the agent needs — an API, a browser, a binary. */
  tools: string[];

  /**
   * Who is expected to invoke this, as `path/to/file.ts#symbol`.
   *
   * Empty means the contract asserts the agent has no caller. That is a valid
   * and honest declaration; what is not valid is claiming a caller that the
   * Auditor cannot find in the call graph.
   */
  expectedCallers: string[];

  /** What reads the output. A table, a column, or a module. */
  downstreamConsumer: string | null;

  permissions: string[];
  retries: number;
  timeoutMs: number | null;

  /** State the agent reads or writes, for the UI and for data-integrity audits. */
  state: string[];
  /** What the agent observes rather than decides. */
  observations: string[];
  /** Test files that exercise this agent's path. */
  acceptanceTests: string[];

  /** What we believe. Never authoritative — see the file header. */
  declaredStatus: CapabilityAuditState;
  /** Why, when the declared status is not `implemented_exercised`. */
  statusNote?: string;
}

export interface ContractViolation {
  agentId: string;
  rule: string;
  detail: string;
}

/**
 * Structural validation of a contract.
 *
 * Deliberately narrow: this checks that a contract is *well formed*, not that
 * it is *true*. Truth is the Auditor's job, because truth requires reading the
 * source. Conflating the two would let a well-formed lie pass as verified.
 */
export function validateContract(contract: AgentContract): ContractViolation[] {
  const violations: ContractViolation[] = [];
  const fail = (rule: string, detail: string): void => {
    violations.push({ agentId: contract.agentId || '(unnamed)', rule, detail });
  };

  if (!/^[a-z0-9][a-z0-9-]*$/.test(contract.agentId)) {
    fail('agent_id.format', 'Must be lower-case kebab-case; it is a durable key in execution records.');
  }
  if (!contract.name.trim()) fail('name.empty', 'An agent with no name cannot be shown to an operator.');
  if (!contract.purpose.trim()) fail('purpose.empty', 'A purpose is what makes an orphan judgeable.');
  if (!AGENT_TEAMS.includes(contract.team)) fail('team.unknown', `'${contract.team}' is not a declared team.`);
  if (!/^v?\d+(\.\d+)*$/.test(contract.version)) {
    fail('version.format', `'${contract.version}' is not a version. Execution records key on it.`);
  }

  if (contract.kind === 'model') {
    if (!contract.model) fail('model.missing', 'A model agent must name the model it runs on.');
    if (contract.runtimeAttribution === 'prompt_version' && contract.promptVersions.length === 0) {
      fail(
        'prompt_versions.missing',
        'Attributed by prompt version and declaring none, so its executions could never be attributed and it would look permanently un-invoked.',
      );
    }
    if (contract.runtimeAttribution === 'explicit' && contract.promptVersions.length > 0) {
      fail(
        'attribution.contradiction',
        'Declares explicit attribution and also claims prompt versions, so the same run could be recorded twice.',
      );
    }
  } else {
    if (contract.model) fail('model.unexpected', 'A deterministic agent must not claim a model.');
  }

  if (!contract.implementation.includes('#') && !contract.implementation.startsWith('/')) {
    fail(
      'implementation.format',
      "Must be 'path/to/file.ts#symbol' or a route path beginning with '/'.",
    );
  }

  if (Object.keys(contract.outputSchema).length === 0) {
    fail('output_schema.empty', 'An agent that produces nothing describable has no consumer to verify.');
  }

  if (contract.retries < 0) fail('retries.negative', 'Retries cannot be negative.');
  if (contract.timeoutMs !== null && contract.timeoutMs <= 0) {
    fail('timeout.invalid', 'A timeout must be positive, or null for "inherits the caller".');
  }

  /**
   * The rule that stops the registry becoming decoration.
   *
   * Claiming `implemented_exercised` while declaring no caller is internally
   * contradictory — something exercised it, so name the thing. This is caught
   * here rather than by the Auditor because it needs no source access.
   */
  if (contract.declaredStatus === 'implemented_exercised' && contract.expectedCallers.length === 0) {
    fail(
      'status.contradiction',
      'Declared as exercised while declaring no caller. If something exercises it, the caller is nameable.',
    );
  }

  if (contract.declaredStatus !== 'implemented_exercised' && !contract.statusNote?.trim()) {
    fail('status.unexplained', `Status '${contract.declaredStatus}' needs a note saying why.`);
  }

  return violations;
}

/** Validate the whole registry, including cross-entry rules. */
export function validateRegistry(contracts: AgentContract[]): ContractViolation[] {
  const violations = contracts.flatMap(validateContract);

  const seenIds = new Set<string>();
  const promptOwners = new Map<string, string>();

  for (const contract of contracts) {
    if (seenIds.has(contract.agentId)) {
      violations.push({
        agentId: contract.agentId,
        rule: 'agent_id.duplicate',
        detail: 'Two contracts share an id, so execution records cannot be attributed to either.',
      });
    }
    seenIds.add(contract.agentId);

    for (const version of contract.promptVersions) {
      const owner = promptOwners.get(version);
      if (owner) {
        violations.push({
          agentId: contract.agentId,
          rule: 'prompt_version.shared',
          detail: `Prompt version '${version}' is also claimed by '${owner}'. Runtime attribution would be ambiguous.`,
        });
      }
      promptOwners.set(version, contract.agentId);
    }
  }

  return violations;
}
