# Halyard — Claude Code Prompts

Two prompts: a kickoff that establishes context and builds the foundation, then a milestone
template for everything after.

**Do not paste the whole build into one prompt.** Twenty milestones in one context produces
a plausible-looking skeleton with no working parts. One milestone per session, verified
before moving on.

---

# PROMPT 1 — Kickoff (Milestone 1)

Paste this into Claude Code in an empty `halyard` repo, with the four docs placed in
`docs/`.

````
# Halyard — Project Kickoff

You are building Halyard, an AI-assisted social content system. I am a solo founder. It
serves RecipeFix (a live recipe-adaptation app) now, and Kinolog (a movie diary app) later.

## Read these first, completely, before writing any code

- `docs/social_engine_architecture.md`   — v1: topology, schema, adapters, full UI spec
- `docs/social_engine_addendum_v2.md`    — v2: researched platform APIs, QC gates,
                                            decision engine, co-pilot. **Supersedes v1
                                            §5 and §7**
- `docs/halyard_build_pack.md`           — timezone, cold start, failure policy, repo
                                            structure, env vars, testing
- `docs/recipefix_overview.md`           — the product Halyard markets

Where v1 and v2 conflict, v2 wins. v2 Part L lists the specific corrections.

## What this system is

It generates social content from **real product output**, renders it to images and video,
holds it for my approval, publishes through official platform APIs, and measures which
content produces activated users.

It is not a scheduler with an LLM attached. Three things make it different, and if you cut
any of them you have built the wrong thing:

1. **Content is built from real product artifacts.** Halyard calls RecipeFix's MCP server
   to generate an actual recipe adaptation, then builds content from that JSON. Never from
   imagination.
2. **Four QC gates run before anything reaches me.** Copy lint, claim verification against
   the artifact, visual QC, audio QC. Content that fails never appears in my queue.
3. **I approve everything.** No auto-posting of unreviewed content, ever.

## Hard constraints

- **Publish must be idempotent.** A retry that double-posts to a real account is the worst
  possible bug. Unique index on `(account_id, platform_post_id)` plus a pre-flight check.
- **No auto-reply, no auto-DM, no follow automation.** There is no `reply()` method on the
  adapter interface. Comment replies are always human-sent with an AI draft.
- **Platform tokens are server-only**, pgsodium-encrypted, never in a client payload.
- **The slop filter is not optional.** Em dash is a hard reject in generated copy, not a
  style note. Full banned list in v2 Part F.1.
- **Everything UTC in the database.** Three separate timezone concepts. Build pack §1.
- **CI from the first commit.** The product this markets has no CI and it cost sixteen days
  of silent production drift.

## Milestone 1 — Scaffold and schema

Build only this. Stop when done.

1. Turborepo (or pnpm workspaces): `apps/web`, `apps/worker`, `packages/db`,
   `packages/core`, `packages/render`, `packages/ui`. Structure per build pack §4.
2. Next.js 15 App Router, TypeScript strict, Tailwind, shadcn/ui.
3. Supabase project. **Full schema** from v1 §2 plus v2 Part J plus build pack §1
   timezone columns. RLS on every table, single admin user.
4. Generated types in `packages/db`.
5. Auth: Supabase Auth, single admin, protected routes.
6. Sidebar shell with every route from v1 §8 rendering an honest empty state. Mobile
   bottom tab bar.
7. `.env.example` with every key from build pack §5, no values.
8. GitHub Actions: typecheck, lint, test on push.
9. `packages/core/qc/slopFilter.ts` with the full v2 Part F.1 banned list, plus unit tests
   including a fixture file of known-bad LLM copy that must all fail.

Do not build: generation, adapters, rendering, the worker. Those are later milestones.

## How to work

- Read all four docs fully before writing code.
- If a doc is ambiguous or contradicts itself, ask me rather than guessing.
- If you think a design decision in the docs is wrong, say so before implementing. I would
  rather argue now than refactor later.
- Commit in logical units with real messages.
- When done: summarise what you built, what you skipped and why, anything in the docs that
  turned out to be underspecified, and what you would change.
````

---

# PROMPT 2 — Milestone template

For milestones 2 through 20. Replace the bracketed parts.

````
# Halyard — Milestone [N]: [name]

Continuing the Halyard build. Re-read `docs/social_engine_addendum_v2.md` and the relevant
section of `docs/social_engine_architecture.md` before starting. v2 supersedes v1 §5 and §7.

## Current state

[Brief: what exists, what the last milestone delivered, anything broken.]

## This milestone

[Copy the milestone row from v2 Part K, expanded into specifics.]

Reference sections:
- [e.g. "v2 Part A.3 for Instagram API specifics"]
- [e.g. "v1 §8 for the queue UI spec"]

## Definition of done

[Concrete and verifiable. Not "Instagram works" but "publishing a carousel to my own
account in dev mode produces a live post and a `publications` row with the permalink."]

## Constraints that still apply

- Publish idempotency
- No auto-reply, no auto-DM
- Slop filter runs before anything enters the queue
- Tokens server-only
- CI green before you finish

Do not build ahead into the next milestone. If you finish early, add tests.
````

---

# Suggested milestone order

From v2 Part K, with notes on what matters.

| # | Milestone | Note |
|---|---|---|
| 1 | Scaffold, schema, slop filter, CI | Prompt 1 above |
| 2 | Products, voices, brand tokens, first-run wizard | Build pack §2. Do not skip the wizard |
| 3 | RecipeFix MCP connector | Verify with a real adaptation before moving on |
| 4 | Worker container: Chromium, FFmpeg, whisper.cpp, fonts, job poller | Test `SKIP LOCKED` under concurrency |
| 5 | **All six OAuth flows + PlatformAdapter interface** | Earlier than feels natural. Reviews are wall-clock time |
| 6 | **Record demo videos, submit IG / Pinterest / YouTube reviews** | Not a coding task. Do it the same day as 5 |
| 7 | Claim verifier + QC scaffolding | Before generation exists |
| 8 | Idea engine with mix-debt scoring | v2 Part G |
| 9 | Copywriter + approval queue with QC display | v1 §8 |
| 10 | **X adapter live — first real post** | The meaningful checkpoint |
| 11 | Satori templates + visual QC gate | |
| 12 | Threads + Pinterest | Sandbox until approved |
| 13 | Instagram | Dev mode, then live on approval |
| 14 | **Co-pilot compose mode** | Probably the feature you use most |
| 15 | Remotion + captions + audio QC + voice clone | Clone the voice before this |
| 16 | YouTube + TikTok inbox-upload | Not direct post |
| 17 | Comment inbox + reply drafting | The biggest gap in the original plan |
| 18 | Metrics, attribution, performance scoring | Needs RecipeFix UTM capture live |
| 19 | Series, hooks, submissions, swipe file, repost decay | |
| 20 | Calendar, mobile polish, kill switch, health page | |

---

# Do these outside Claude Code

Parallel tracks that gate later milestones. Start all on day one.

| Task | Blocks | Notes |
|---|---|---|
| **RecipeFix P0-0 redeploy + verify** | Everything | `estimate_nutrition` still 500s in prod. Broken lifecycle emails are live |
| **RecipeFix UTM capture** | Milestone 18 | ~1 hour. Highest-leverage hour in the plan |
| Register six developer apps | Milestone 5 | X, Meta, TikTok, Pinterest, Google |
| Instagram Business account + Facebook Page | Milestone 13 | Prerequisite to app review |
| Submit Meta / Pinterest / YouTube reviews | Milestones 12, 13, 16 | 2 to 6 weeks each |
| ElevenLabs Professional voice clone | Milestone 15 | ~30 min clean audio, one session |
| Music licence | Milestone 15 | Epidemic Sound, Artlist, or Uppbeat free tier |
| Create brand accounts on all six platforms | Milestone 5 | Manually, per the original brief |

---

# One warning

The riskiest failure mode is not a bug. It is Halyard working perfectly and producing
content nobody wants.

The first-run calibration in build pack §2 is the guard against that: twenty drafts you
review and reject with reasons, before any of it goes live. It takes about thirty minutes
and it is what separates a system trained on your taste from one trained on the average of
the internet.

Do not skip it, and do not let it get deferred to "after the build."
