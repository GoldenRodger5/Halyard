# Where Halyard is right now

**2026-08-19.** Replaces the 2026-08-10 build-status document, which predated P0, P1 and P2. That version is superseded, not merely dated — its counts and its picture of the agent layer are both wrong now.

`main` is at `6ca8d99`, CI green.

---

## Done

**P0 — Agent operating system + Auditor** (PR #1, merged). Agent registry with a full execution contract, `agent_runs` execution records, capability states derived from evidence rather than declaration, and the Halyard Auditor (`packages/audit`) which parses the TypeScript AST rather than grepping. Agents/System UI surfaces.

**P1 — Product Brain** (PR #2/#3, merged). `product_evidence` (observed) and `product_facts` (believed, each citing its evidence, enforced by a trigger). Five product-intelligence agents propose; `deriveFactStatus` and `computeConfidence` decide from evidence alone. `verified` requires two independent sources. `/brain` and its category screens.

**P2 — Platform Intelligence** (PR #4, merged). `resolveCapability` — one canonical resolution over five separated dimensions, adding no third vocabulary. `capability_probes` records observations; `provider_capabilities` holds the belief citing them. Per-platform strategy where every claim carries its basis.

**X OAuth is working.** `@Recipe_Fix` is genuinely connected: identity confirmed, token sealed, self-test passed. The original failure was an `X_CLIENT_ID` copied one character short.

**Token refresh now actually runs.** The worker's handler used to log which accounts were due and refresh nothing, deferring to a web cron scheduled once a day — against X tokens that live two hours. `packages/core/src/accounts/refresh.ts` is now shared and the worker runs it hourly.

**Accounts UI** rewritten around what an operator can do rather than what the state machine calls it.

---

## Blocked

**The first real X publication — blocked on X API credits.** The full path was exercised for real on 2026-08-19: kill switch, approval, routing, token decryption, and a genuine `POST /2/tweets`. X returned **HTTP 402 credits-depleted**. Halyard wrote **zero** publications and did not claim success — which is the correct behaviour.

The test content item is `archived`, so its still-queued job is inert: `publishHandler` returns at the approval guard before any network call. Verified by running the worker — job `done` in 1ms, zero API calls. **Do not un-archive it** unless a post is genuinely wanted.

**Downstream of that:** no publication means no metrics, no comments, no scores, and **no `halyard_empirical` claims**. That basis is zero everywhere by design and a test keeps it there.

**Also blocked:** live Product Brain reasoning (`OpenAI 429 — no credits`; the Anthropic key in `.env.local` is a comment line, not a key). Live provider capability verification (`BLOTATO_API_KEY` present but rejected **401**).

Every one of these is an external credential or billing problem. None is a code defect.

---

## Next 1–3 steps

1. **Add X API credits**, then re-run the single-post test. Everything on Halyard's side is proven to the provider boundary; one real observation unblocks the entire learning loop.
2. Once a post exists, let the existing `collect_metrics` decay schedule run and confirm real observations land with provenance.
3. Only then consider P3 (Social Discovery / Opportunity Intelligence). It is architecturally premature until first-party data exists — see `docs/PLATFORM_COVERAGE.md` §7.

---

## Uncommitted work

Several passes are complete, verified and **not committed**: the OAuth redirect fix (`apps/web/src/lib/oauthRedirect.ts` + tests), token refresh (`packages/core/src/accounts/refresh.ts` + tests), the Accounts UI pass, and `collectionLifecycle.test.ts`. The `media.write` scope removal in `packages/core/src/adapters/oauth.ts` is a deliberate diagnostic — keep it removed until media publishing is actually needed.

Current suite: **1247 unit**, **81 E2E**, 47 RLS. Auditor: 22 agents, 1 error, 5 warnings, 0 falsely exercised.
