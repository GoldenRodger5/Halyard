# Agent Registry

**Status:** current implementation, P0.
**Source of truth:** `packages/core/src/agents/registry.ts` — this document
describes it, and the code is authoritative.

---

## 1. The rule this registry exists to enforce

> An agent is not implemented because its function exists.

Per `HALYARD_MASTER_ARCHITECTURE.md` §15, it is implemented only when the
contract exists, the caller exists, the execution path exists, the output is
consumed, tests cover the path, runtime telemetry can prove invocation, and the
capability state is accurate.

The registry is therefore split in two, deliberately:

| | Declares | Authority |
|---|---|---|
| **The contract** (`registry.ts`) | Intent — purpose, expected caller, downstream consumer, tools, schemas | None over status |
| **The Auditor** (`@halyard/audit`) | Observation — from source, call graph, job graph, execution records | Decides the state |

`deriveState()` never receives `declaredStatus`. A contract cannot talk itself
green. Divergence between the two is reported as `capability.overclaimed`.

---

## 2. Capability states

| State | Meaning |
|---|---|
| `implemented_exercised` | Implementation, caller, recorded run, consumed output and tests all present |
| `implemented_partial` | Reachable, but some link is unproven — usually no recorded run |
| `implemented_no_caller` | The code exists and nothing in the call graph reaches it |
| `planned` | Declared and not built |
| `blocked` | An external precondition is absent — a credential, a licence, an input |
| `regression` | Ran before, failing now |

Named `CapabilityAuditState` in code, because `CapabilityState` already means a
social account's platform capability (`pending_auth` / `draft_only` / `live` /
`error` / `disabled`). Different axes, kept separate on purpose.

---

## 3. The registry, as of P0

**Forty agents.** Observed states come from `pnpm audit-halyard`; this table
records the *contract*.

> **This table is a copy and it went stale.** It listed twenty-two agents while
> the registry held thirty-seven, and it named `copywriter.v1` while the source
> had moved to v2. That is the same class of drift the registry exists to catch,
> committed by the document describing it. `registry.ts` is authoritative;
> anything below that disagrees with it is wrong, and the Auditor is what says
> so. §381.

| Agent | Team | Prompt version | Declared | Note |
|---|---|---|---|---|
| `copywriter` | content | `copywriter.v2` | partial | Wired and tested; no production run |
| `vo-scriptwriter` | content | `vo_script.v2` | partial | Wired and tested; no production run |
| `hook-generator` | content | `hooks.v1` | partial | Wired and tested; no production run |
| `copilot` | content | `copilot.v1` | partial | Reachable; route not covered by a test |
| `idea-generator` | content | `idea_generator.v1` | **no caller** | Only the prompt builder exists; nothing sends it |
| `payoff-verifier` | quality | `hook_payoff.v1` | partial | Wired and tested; no production run |
| `vision-describer` | quality | — (explicit) | partial | Vision endpoint; recorded explicitly |
| `take-fact-checker` | founder | `take_fact_check.v1` | partial | Wired; `web-search` tool unavailable |
| `take-drafter` | founder | `take_draft.v1` | partial | Wired and tested; no production run |
| `take-strengthener` | founder | `take_reinforce.v1` | partial | Wired; no production run |
| `find-drafter` | founder | `copywriter.founder.tip.v1` | partial | Reachable; no test |
| `reply-drafter` | engagement | `reply_drafter.v1` | partial | Prompt tested; action not covered |
| `setup-kit-writer` | setup | `setup-kit.v1` | partial | Wired and covered by E2E |
| `explorer-discovery` | explorer | `explorer_discovery.v1` | partial | Job unscheduled; never run against a product |
| `rejection-clusterer` | learning | `rejection_clusters.v1` | **no caller** | Per-item loop works; pattern layer unwired |
| `shipped-feature-summariser` | product_intelligence | `shipped_features.v1` | **blocked** | No merged PRs to read |
| `auto-clip` | content | `autoclip.v1` | **blocked** | No long-form footage exists |
| `product-discovery` | product_intelligence | `product_discovery.v1` | partial | P1; proposes from web evidence |
| `store-listing` | product_intelligence | `store_listing.v1` | partial | P1; proposes from the App Store listing |
| `code-intelligence` | product_intelligence | `code_intelligence.v1` | partial | P1; reads the connector's tool surface |
| `visual-brand` | product_intelligence | `visual_brand.v1` | partial | P1; runs only with described screenshots |
| `product-reconciler` | product_intelligence | `product_reconciler.v1` | partial | P1; explains, never decides |

### §381 — three agents that were running with no contract

The Auditor's `agent.unregistered` rule catches a prompt version the source
emits that no contract claims. It found five, and three of them were whole
agents nobody had written up:

| Agent | Prompt | Why it mattered |
|---|---|---|
| `format-writer` | `post_format.v1` | Writes **every** quiz, history, tips and myth piece. The largest thing the audit was missing. |
| `concept-generator` | `concept_generator.v1` | Proposes the directions `/studio` offers. Part of how a batch scoring 4.50 apiece went unexamined. |
| `creative-critic-model` | `creative_critic.v2` | **There are two critics.** `creative-critic` is a rule set — pacing, motion density, loudness. This one judges the craft problem no rule can express, which is the entire reason §275 built it, and it was itself unnoticed. |

The other two were version drift — `copywriter.v2` and `product_discovery.v2`
emitted while the contracts said v1. The Auditor checks both directions
deliberately: a claimed version nothing emits is a contract describing something
that cannot run, and either half alone looks fine.

One of those had a cause worth naming: `buildBrain.ts` carried a hardcoded
`'product_discovery.v1'` beside a call that sends v2, so every fact discovered
that way recorded provenance naming a prompt that had not been used. It uses the
exported constants now — and so do the three beside it that happen to be correct
today, because "correct today" is what the stale one was.

**Registering an orphan is the point.** An orphan absent from the registry is
invisible; an orphan present is a tracked defect with a name and a reason.

---

## 4. Runtime attribution

Two mechanisms, and the first covers almost everything:

**`prompt_version`** — every model agent reaches the model through
`LlmClient.complete`, and every request carries a `promptVersion`. A wrapper at
that seam attributes the run and writes it to `agent_runs`. **No agent's code
was modified to gain telemetry.** Instrumenting the seam rather than sixteen
call sites makes coverage structural: an agent cannot call a model without being
recorded.

**`explicit`** — for an agent that does not use `LlmClient`. Only the vision
describer today. Forcing it to invent a prompt version purely to satisfy a
validator is how a schema starts producing lies.

A prompt version with no contract is recorded as `unregistered:<version>` rather
than dropped, because an agent running outside the registry is a finding.

Clients are wrapped at all seven construction sites — two in the worker
(`generate`, `explore`) and five in the web tier (compose, inbox, finds,
setup-kit, take).

---

## 5. The Auditor

`packages/audit`, run with `pnpm audit-halyard [--runtime] [--persist]`.

Entirely deterministic. No model is asked whether a function has a caller,
because that question has an exact answer a parser can compute — asking a model
would make the truth machine probabilistic, which defeats it.

It parses the **TypeScript AST**, not text. The previous hand audit
(`docs/AUDIT.md`) was wrong twice using `grep`: it missed `factCheckTake` by
searching for `factCheck(`, and it counted `.next` build output as callers.

### Rules

| Rule | Catches |
|---|---|
| `agent.no_caller` | Code exists, nothing reaches it |
| `agent.declared_caller_missing` | Contract names a caller that does not call it |
| `agent.implementation_missing` | Contract points at a symbol the source lacks |
| `agent.unregistered` | A prompt version the source emits and no contract claims |
| `agent.prompt_version_absent` | A version claimed that no source file emits |
| `agent.version_never_invoked` | Declared version has never appeared in a run |
| `output.unconsumed` | Successful runs, no output ever stamped as consumed |
| `job.scheduled_no_handler` | Scheduled kind with no handler |
| `job.no_handler` | Declared kind, no handler, no written reason |
| `job.stale_exemption` | Documented as unhandled, handler exists |
| `gate.input_never_supplied` | Optional gate input nothing passes |
| `feature.enabled_unreachable` | Enabled and no code path produces it |
| `tool.unavailable` | Declared tool this deployment cannot provide |
| `capability.overclaimed` | Contract declares better than the evidence supports |
| `brain.category_unreachable` | A Product Brain category no agent can fill |
| `contract.*` | Structural violations of the contract schema |

### Without `--runtime`

No agent can reach `implemented_exercised`, because nothing can prove
invocation. That is the correct answer when the evidence is unavailable, not a
limitation.

---

## 6. What the Auditor found on its first real run

One error and five warnings, all verified genuine:

- **`gate.input_never_supplied` on `runAllGates`** — six non-test call sites,
  not one supplies `visual` or `audio`. Every rule depending on them is
  unreachable and the gate still reports a pass. **Exposed, not fixed:** P0
  formalises reality rather than changing the quality system.
- Four `agent.no_caller`, matching the hand audit plus `idea-generator`, which
  the hand audit missed.
- `tool.unavailable` on the fact checker's `web-search` — no search tool is
  configured, so it degrades to model knowledge.

It also caught **three bugs in itself and one in this registry** during
development, each fixed and each now covered by a regression test:

1. Excluding the definition file dropped same-file callers, reporting three
   working agents as orphans.
2. Server actions are *referenced*, never called, so two working agents looked
   orphaned until imports were treated as wiring.
3. The prompt-version heuristic matched any `name.vN` string, sweeping up eleven
   `FORMAT_SPECS` entries as unregistered agents.
4. The registry named the wrong caller for `setup-kit-writer`.

---

## 6a. P1 — the Product Brain

Five agents propose product facts; **none can decide one**. `parseProposals`
keeps only `category`, `key`, `value` and `detail`, so a reply supplying
`"status":"verified"` loses that field on the way in rather than being trusted
and then corrected — a field that is read and overridden is one refactor away
from being read and kept.

Status and confidence come from `deriveFactStatus` and `computeConfidence`,
which read the evidence rows and take **no parameter a proposal could reach** —
the same arrangement as `deriveState` above. `verified` requires two independent
sources; evidence is keyed on a content hash so re-collecting an unchanged page
corroborates nothing.

`findContradictions` — code — decides *that* two facts conflict. The reconciler
explains *why* they might, in prose, and picks no winner.

Building P1 closed two things P0 left structurally unable to work:

- **`explore_product` had no trigger.** Handler, policy and contract all
  shipped; nothing enqueued it. It now has a button on `/brain/features`.
- **`markOutputConsumed` had no production caller**, so `deriveState` could
  never observe consumed output and no agent could reach
  `implemented_exercised` however often it ran.

## 7. Tables

`agent_runs`, `capability_audit_state`, `auditor_runs`, `auditor_findings` —
migration `0025_agent_operating_system.sql`.

`product_evidence`, `product_facts` — migration `0027_product_brain.sql`.
**Not created:** a `features` category, because `feature_claims` already is the
feature inventory and verifies by replay; and no `prohibited_claims` category,
because that is an instruction in `products.content_rules`, not an observation.

**Not created:** a registry table. The registry stays in code so it is versioned
with the implementation it describes and cannot drift between deploys. **Not
created:** a second job log — `jobs` already records job execution, and an agent
run happens *inside* a job. **Not touched:** `social_accounts.capability_state`
or `provider_capabilities`, which answer a different question.

---

## 8. Adding an agent

1. Add a contract to `AGENT_REGISTRY`. Declare the caller you intend to write.
2. Implement it, reaching the model through `LlmClient` so it is recorded.
3. Wire the caller.
4. Have the consumer call `markOutputConsumed` when it uses the output.
5. Write an acceptance test and list it in `acceptanceTests`.
6. Run `pnpm audit-halyard`. Anything you got wrong is now a finding rather than
   a thing somebody notices in three months.
