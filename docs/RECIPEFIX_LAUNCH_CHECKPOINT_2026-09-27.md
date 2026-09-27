# RecipeFix distribution launch checkpoint — 2026-09-27

**Goal:** wake up with a small, high-quality opening wave ready to review; no public post sent during preparation.

## Product truth refreshed

A live Product Brain collection was run against the current product:

- 8 website pages;
- 1 App Store listing;
- 13 MCP tools;
- GitHub: 1,691 paths indexed, 12 high-value files read, 6 recent user-facing PRs;
- 24 total evidence records considered in the rebuild.

Brain rebuild result:

- 49 factual proposals/writes;
- 37 verified;
- 18 strategic inferences recorded separately from public facts;
- 9 contradictions surfaced instead of silently resolved;
- visual-brand evidence remains incomplete until described product screenshots are stored.

The Product Brain is therefore based on the current RecipeFix, not the August social brief.

## Blotato state

Read-only provider contact succeeded and mapped RecipeFix:

| Platform | Blotato account id | Publish proof |
| --- | --- | --- |
| Instagram | 64295 | not yet |
| Pinterest | 9034 | not yet |
| Threads | 8692 | not yet |
| TikTok | 54896 | not yet |
| X | 23940 | not yet |
| YouTube | 46296 | not yet |

The founder X identity was not auto-mapped because Halyard and Blotato name different handles. No guess was made.

## Opening wave

The existing small launch wave is intentionally retained instead of freezing the whole 14-day calendar before learning:

- Day 1: platform introductions.
- Day 2: first transformation / education / product / community variants.
- Day 3: next coordinated variants.

The long-run planner is now capable of 72 native placements / 20 packages over 14 days with per-account cadence, but later waves should be generated using real early performance signals.

## Morning operator sequence

1. Open **Gallery → Holding**.
2. Read every copy draft as if it were already public.
3. Edit or reject anything generic, overconfident, repetitive or too promotional.
4. For IG/TikTok/YouTube pieces that say **Visual not generated yet**, press **Generate Blotato visual** only after the copy concept deserves the credits.
5. Review returned media. Do not approve a caption in place of the actual video/carousel.
6. Pick one strongest post for the first provider proof.
7. Run the unified first-contact dry run with that item UUID.
8. Inspect exact account, caption, link strategy, media URLs and target fields.
9. Only when ready, turn the global publishing switch on and use the interactive first-contact publish command.
10. Wait for Halyard to reconcile Blotato to a real `published` state and permalink.
11. Verify tracking, then unlock ordinary Blotato routing for that platform.

**Do not** bulk-switch every account to unified merely because one platform succeeds.

## Known setup gap

RecipeFix does not yet have a dedicated Explorer/capture login configured. Public/signed-out discovery works. Signed-in-only feature claims should remain unverified rather than be refuted from a login wall until a harmless dedicated test account is configured.

## Stop condition

Preparation is complete when:

- opening-wave copy is generated;
- paid media remains operator-gated;
- Gallery displays the real review boundary;
- the global publish kill switch remains off;
- there are zero publication rows and zero published RecipeFix items;
- tests/typechecks/browser QA pass;
- this branch is pushed with the implementation and docs.

## Spend ceiling added after owner instruction

Owner instruction: **cap automated spend at $5.**

Live setting:

- `settings.daily_budget_usd = 5.00`.
- At the moment the cap was imposed, Halyard's paid-call ledger showed **$0.6577** today across 20 paid calls.
- The direct manual generation helper that bypassed the worker/poller budget guard was stopped and is not part of the launch workflow.
- `PAID_JOB_KINDS` now includes Product Brain rebuild, Explorer and external Blotato visual generation in addition to the existing writing/correction/media/voice work.
- Blotato visual generation is also human-gated, so no visual credit is spent merely because a copy draft exists.

Blotato's live MCP credit query on 2026-09-27 reported **3,000 credits remaining** and **$6 / 1,000 credits** for additional credits. Those credits are not treated as permission to consume them automatically. The operator chooses which reviewed concepts deserve visual generation.

## Content quality decision

Halyard remains the primary content intelligence/writing layer; Blotato is not being promoted to generic strategist.

The decision is based on both capability and measured output:

- Blotato's live hosted MCP exposes account/publishing/scheduling, source extraction, visual production, comments/DM and analytics tools. It does **not** expose a general social-strategy/copywriting tool in the automation surface Halyard is integrating with.
- Halyard can ground copy in the current Product Brain, real product artifacts, verified claims, platform-native formats, recent openings, voice calibration and later conversion/engagement outcomes.
- The current RecipeFix transformation drafts demonstrate that this can produce specific hooks such as `Swaps break instructions.` and artifact-grounded transformations rather than generic feature copy.
- The current account-introduction drafts are **not yet consistently strong enough**: several converged on `Recipe needs changing/adapting`. That is competent but too safe for cold-start discovery.

The launch planner's introduction intent was therefore tightened: introductions must open on a sharp domain belief or concrete failure mode, may not open with a welcome/product name/generic “X needs changing” line, and must prefer one mechanism/example to a feature list.

This is the intended split:

- **Halyard:** truth, concepts, hooks, platform-native writing, coordination, QC, approval, attribution and learning.
- **Blotato:** selected visual/video execution, connected-account delivery/scheduling, provider analytics and other provider-native operations.
- **Human:** approve/reject/edit the opening wave and authorize paid visual generation / first public contact until the system has real evidence.
