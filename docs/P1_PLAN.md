# P1 — Product Intelligence / Product Brain

**Scope source:** `HALYARD_IMPLEMENTATION_PLAN.md` §3 (lines 162–252) and
`HALYARD_MASTER_ARCHITECTURE.md` §3 Team A, §18, §20.

**Exit criterion, verbatim:** *Halyard can explain RecipeFix using persisted
evidence without relying on a transient model conversation.*

---

## 1. Objective

Give Halyard a durable, evidence-backed understanding of a connected product,
where every fact carries its provenance and no fact can become true because a
model asserted it.

The governing rule applies unchanged: **agents perceive, code decides.** An
agent may *propose* a fact from evidence. Only code may decide a fact's status,
its confidence, and whether it is safe to say in public.

---

## 2. What already exists, and is therefore not rebuilt

| P1 component | Existing implementation | Action |
|---|---|---|
| UX Explorer | `packages/core/src/explorer/*`, `explore_product` job + handler | **Wire a trigger.** It has none. |
| Feature inventory | `feature_claims` + `verify_feature` (scheduled) | **Read it.** Do not restate features as facts. |
| Verification vocabulary | `ClaimStatus`, `isStale()`, `canMarket()`, `VERIFICATION_TTL_DAYS` | **Reuse verbatim.** |
| Product artifacts | `product_artifacts`, `RecipeFixConnector` | Evidence source. |
| Visual assets | `assets`, `capture_runs`, release detection | Evidence source. |
| Brand voice | `brand_voices` (operator-authored) | Evidence source; not overwritten. |
| Runtime recording | `recordingClient` at the `LlmClient` seam | New agents inherit it for free. |

### The duplication trap, stated so it is not walked into

The architecture lists `features` among the Product Brain's categories. But
`feature_claims` **is** the feature inventory, and its verification is stronger
than anything a fact table could offer: a claim is verified by *replaying* it in
a browser. Creating `product_facts.category = 'features'` would give one
question two answers that drift apart.

**Decision: `features` is not a fact category.** The Brain reads `feature_claims`
for features and owns everything else.

---

## 3. Data model

### `product_evidence` — what was observed

Immutable. Written only by deterministic collectors, never by an agent.

```
id, product_id, kind, source_url, content_hash, title, body, meta,
collected_at, collector, superseded_by
```

`kind ∈ (web_page, app_store_listing, connector_surface, connector_artifact,
screenshot, repository, operator_brief)`

`content_hash` makes re-collection idempotent: identical content updates
`collected_at` rather than inserting a second row. A fact points at evidence
that cannot change underneath it.

### `product_facts` — what Halyard believes, and why

```
id, product_id, category, key, value, detail,
status, confidence, evidence_ids[], contradicts,
agent_id, agent_version, prompt_version,
first_seen_at, last_verified_at, superseded_by
```

`status ∈ (unverified, verified, refuted, unverifiable)` — the same four words
`feature_claims` uses, so the system has one vocabulary for belief rather than
two.

`category ∈ (identity, mission, users, personas, jobs_to_be_done, workflows,
differentiators, pricing, monetization, competitors, brand_voice,
visual_identity, claims, ux_model, conversion_funnel, app_store_positioning,
content_pillars)` — the architecture's list, minus `features` for the reason
above and minus `prohibited_claims`.

**`prohibited_claims` was removed during implementation**, and by the Auditor
rather than by judgement: `brain.category_unreachable` fired on it on the rule's
first run. It is an *instruction* — the operator forbidding Halyard from saying
something — already living in `products.content_rules.forbidden_claims` and
enforced by the slop filter. This table holds *observations*, and a category a
model proposes into is the worst available home for a safety list.

**Staleness is computed, never stored.** A stored `stale` drifts the moment the
clock moves past it.

---

## 4. What code decides, and agents cannot

| Decision | Where it lives | Why not the model |
|---|---|---|
| `status` | `deriveFactStatus()` | A model that can write `verified` will eventually write it about something it invented. |
| `confidence` | `computeConfidence()` | A self-reported confidence is a number the model chose, not a measurement. |
| contradiction detection | `findContradictions()` | Exact comparison of `(category, key)` across sources has an exact answer. |
| safe to quote? | `canStatePublicly()` | The same rule `canMarket` applies to feature claims: a fact is fine to show an operator long before it is fine to put in a post. |
| staleness | `isStale()`, existing | Derived from `last_verified_at`. |

`verified` requires **two independent evidence sources agreeing** — never one,
and never an assertion. A single source yields `unverified`, which is the honest
word for "observed once, uncorroborated".

---

## 5. Agents (all team `product_intelligence`)

| Agent | Perceives | Proposes | Evidence available today |
|---|---|---|---|
| `product-discovery` | web pages | identity, mission, users, personas, jobs_to_be_done, differentiators, pricing, content_pillars | ✅ recipefix.app |
| `store-listing` | App Store listing | app_store_positioning, competitors, claims | ✅ id6759676502 |
| `code-intelligence` | connector tool surface + product stats | ux_model, workflows, monetization — *implementation truth* | ✅ RecipeFix MCP |
| `visual-brand` | screenshots | visual_identity | ⚠️ needs captured assets |
| `product-reconciler` | contradictions **code already found** | prose on why two sources might differ — never which is right | derived |

The reconciler is deliberately narrow: **code finds the contradiction**, the
agent explains it. An agent asked to "compare everything" would be a policy
engine wearing a perception hat.

`code-intelligence` reads the **connector's tool surface**, not a repository.
RecipeFix ships through Lovable with no repo, and a second permanently-blocked
GitHub agent would duplicate `shipped-feature-summariser` while adding no
capability. The live API surface is implementation truth, and it is available.

---

## 6. Jobs

| Kind | Trigger | Does |
|---|---|---|
| `collect_product_evidence` | UI action + scheduled weekly | Deterministic collection into `product_evidence`. No model call. |
| `build_product_brain` | UI action, and chained after collection | Runs the proposing agents over evidence, then the deterministic decision pass. |
| `explore_product` | **UI action — the trigger it never had** | Unchanged handler. |

Collection and reasoning are separate jobs on purpose: evidence that was
expensive to gather must survive a failure in the reasoning over it.

---

## 7. UI — `/brain`

| Route | Shows |
|---|---|
| `/brain` | Every category, its fact count, status mix, and what is missing |
| `/brain/[category]` | Facts with value, status, confidence, source count, last verified |
| `/brain/features` | `feature_claims` with verification verdict and replay age |
| `/brain/evidence` | What was collected, when, from where, and its hash |
| `/brain/contradictions` | Facts that disagree, with the reconciler's explanation |

Every screen states plainly when it has nothing, in the P0 idiom (*"No agent has
ever run"*). A category with no facts says so rather than rendering an empty
shell that implies a feature exists.

---

## 8. Auditor

- Five new contracts → audited automatically by the existing rules.
- **`brain.category_unreachable`** (new rule): a fact category the UI offers that
  no registered agent can ever produce. The phantom-capability pattern applied
  to the Brain — a screen promising knowledge nothing can supply. **It found one
  on its first run** (`prohibited_claims`), which is how that category came to be
  removed rather than papered over.
- **`markOutputConsumed` gets its first production callers.** It currently has
  none, which means no agent can reach `implemented_exercised` regardless of how
  often it runs. The Brain's consumers stamp it.

---

## 9. Tests

- Deterministic core: status derivation, confidence, contradiction detection,
  staleness, evidence idempotency by hash.
- Each agent: valid input, valid output, malformed reply, refusal, and **an
  assertion that the model cannot set `verified`**.
- Collectors against fixtures — no live network in tests.
- Handlers: job → agent → persistence → consumption stamp.
- E2E: the RecipeFix vertical slice, and every empty state.
- Auditor: a synthetic unreachable category must be detected.
- RLS: the new tables, in the pattern `agentRls.test.ts` established.

---

## 10. Acceptance criteria

1. `pnpm db:reset --fresh --seed` → typecheck, lint, 1096+ unit, build, E2E, audit all pass.
2. A fact can be traced UI → fact → evidence → source URL → collected_at.
3. No fact reaches `verified` from one source.
4. No model output can write a status.
5. `explore_product` has a trigger.
6. `markOutputConsumed` has production callers.
7. The Auditor reports the new agents accurately, and `capability_audit_state`
   records a real transition from the P0 baseline.
8. GitHub CI green.

---

## 11. Risks

- **Scope.** P1 is the largest phase so far. Mitigated by reusing the Explorer
  and `feature_claims` rather than restating them.
- **A model proposing plausible fiction.** Mitigated structurally: a fact with no
  evidence row cannot be inserted, and corroboration is counted, not asserted.
- **Evidence rot.** recipefix.app is a Vite SPA; its HTML shell is thin. The
  Explorer's rendered outline is the richer path and already exists.
- **Vision availability** for `visual-brand` — reported `blocked` if the tool is
  absent, never silently skipped.

---

## 12. Non-goals — explicitly out of P1

- Platform Intelligence, specialists, capability model (**P2**)
- Social discovery, trends, creators, competitors research (**P3**)
- Strategy and content changes (**P4**) — the Brain is not wired into generation
  prompts in this phase
- Any change to publishing, approval, or the quality gates
- Fixing `gate.input_never_supplied` — a tracked P0 finding, not P1's
- Rebuilding any existing agent, adapter, renderer, publisher or scheduler
