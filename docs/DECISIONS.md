# Decisions

Where the build departs from the specs, and why. Each entry names the doc it
diverges from, so a reader can tell a deliberate choice from a mistake.

---

## 1. Token encryption is application-level AES-256-GCM, not pgsodium

**v1 §7 says** "encrypt with pgsodium at rest."
**Build pack §5 lists** a `TOKEN_ENCRYPTION_KEY` env var, which implies
application-level sealing. The two documents disagree; we followed the build pack.

Three reasons:

1. pgsodium and Supabase Vault are deprecated for new Supabase projects. A
   pgsodium design would be built on a retiring primitive.
2. Sealing in the application means the ciphertext is opaque to PostgREST, so a
   mis-scoped RLS policy leaks bytes rather than credentials.
3. It keeps migrations portable to plain Postgres, which is what CI runs — and
   CI running the real migrations is worth more than matching one sentence.

`packages/core/src/crypto/tokenCrypto.ts`. Layout is `version ‖ iv ‖ tag ‖
ciphertext`; the version byte exists so a key rotation can be staged rather than
flag-dayed. Migration `0010_rls.sql` additionally revokes the ciphertext columns
from the PostgREST roles, so both layers have to fail before a token escapes.

---

## 2. Novelty uses stored float arrays and TypeScript cosine distance, not pgvector

**v2 G.3 says** "check novelty against the last 60 days by embedding distance."

`ideas.embedding` is `jsonb` and the comparison happens in
`packages/core/src/generation/ideaEngine.ts`. The working set is a few hundred
rows; an index would be slower than the scan. It also keeps the schema
applicable to a vanilla Postgres, which is what the integration tests use.

Revisit if the idea corpus reaches tens of thousands of rows. It will not soon.

---

## 3. The web tier queries Postgres directly, not through PostgREST

Halyard's web tier is entirely server-rendered and single-operator. Every page is
a server component; the browser never holds a database credential and there is no
client-side query surface. Going through PostgREST would add a hop and a second
authorisation model for no gain.

RLS is still enabled and forced on all thirty tables, because the anon key is the
credential most likely to leak, and PostgREST is what it would reach.
`packages/db/src/__tests__/schema.test.ts` asserts that a role outside
`admin_users` reads every table as empty.

---

## 4. `HALYARD_DEV_UNAUTHENTICATED` exists

Not in any spec. Without it, the app cannot be run, reviewed, or screenshotted
without provisioning a Supabase project. It is refused when
`NODE_ENV === 'production'`, and the dashboard renders a standing warning banner
whenever it is active.

---

## 5. TikTok direct publish is behind a second explicit flag

**v2 A.4 recommends** planning for audit rejection and using inbox upload.

`TikTokAdapter.publish()` uses inbox upload unless *three* conditions hold:
`contentPostingAuditPassed`, `allowDirectPublish`, and `capabilityState === 'live'`.
Even with the audit passed, `verifyCapabilities()` still reports `draft_only` and
explains why: the API cannot attach trending audio, and sound is a large share of
TikTok distribution (v2 E.4). Assisted, not automated — deliberately.

---

## 6. Two slop-filter rules extend beyond v2 F.1

- **`structure.sentence_too_long`** — v2 F.1 specifies an *average* sentence
  ceiling. A single 40-word sentence behind a three-word hook never moves the
  mean, so a per-sentence ceiling was added. Reported as its own rule so the two
  failures read differently in the queue.
- **`structure.rule_of_three`** — the doc lists rule-of-three lists as banned.
  One tricolon is ordinary human writing; two in one short post is a tic. One is
  a warning, two or more is an error.

Hashtag ceilings for Threads and YouTube are not in the doc either. They are
marked `inferred: true` in `HASHTAG_LIMITS` so the source of every number is
unambiguous.

---

## 7. `docs/recipefix_overview.md` is missing

The kickoff prompt lists four documents to read; only three are in the repo. The
product brief is therefore **not** baked into any prompt as a literal. Instead:

- `products.brief_markdown` holds it, pasted through `/products/recipefix`
- `brief_summary` is derived from it and rides in every generation prompt
- the first-run wizard blocks on that step, so generation cannot run against an
  empty brief and quietly produce generic copy

This is arguably better than the original design, but it was forced rather than
chosen. If the overview document exists elsewhere, paste it in.

---

## 8. Automated conversation discovery on X was not built

**v2 A.2 recommends** dropping it: reading is $0.005 per third-party post, which
puts reply-hunting at $30 to $75 a month before writing anything.

`XAdapter.collectMetrics()` reads only its own posts, at $0.001. `listComments()`
searches by `conversation_id` on posts Halyard published — that is answering
replies to your own content, not hunting for conversations. There is no watch-term
search anywhere.

---

## 9. Idea generation runs through the worker, not the web tier

Both the daily cron and the calibration batch enqueue a `generate` job rather
than calling a model inline. Vercel route handlers cap well below a generation
run that retries through three QC failures across four platforms.

---

## 10. Rendered assets go to a public Storage bucket

Meta cURLs media at publish time, and signed URLs with a short expiry fail
(v2 A.3). `assertPublicUrl()` in the Instagram adapter refuses anything that
looks signed, rather than letting the container hang in `IN_PROGRESS` until the
poll times out. The bucket holds rendered output only.

---

# Round 2 (milestones 21 to 32)

## 11. RLS is applied by a function, not a list

Migration 0010 enumerated thirty tables by hand. The first round-2 migration
added three more and they shipped unprotected until a test caught it. 0011
replaces the list with `apply_admin_rls()`, which finds any public table without
RLS and applies the standard policy. Every later migration ends with one line:

```sql
select public.apply_admin_rls();
```

A hand-maintained list of tables to protect is a list that will be wrong.

## 12. Migrations never depend on seed data

0012 seeded `format_cadence` for `recipefix` and broke CI, which applies
migrations to an empty database. Seeds inside migrations are now guarded on the
row existing. The rule: a migration must apply to an empty database, and seed
data belongs in `seed.sql`.

## 13. The founder is a `products` row, and that has a cost

Milestone 23 asks for a persona that is not a product. Reusing the `products`
table gives it a voice, a mix, its own signals and its own cadence for free — but
it also means "the first product" silently became a persona with no accounts, and
every product-scoped page went blank.

`products.kind` plus kind-aware ordering fixes it, and `getCurrentProduct()` is
now the only correct way to ask which product the UI is about. Personas are never
the default context; they are selected deliberately.

## 14. Bluesky is in the adapter registry despite not being in any spec

It has no review gate, no per-post cost, and — the actual reason — no native
scheduling at all, so a third-party tool is the only way to schedule there. It
cost about 250 lines against an existing interface.

It is not OAuth: the operator makes an app password and pastes it, so
`getAuthUrl()` returns the settings page and carries no state. The adapter
contract test excludes it from the state-carrying assertion, explicitly and with
a reason, rather than the assertion being quietly loosened.

## 15. Retention rules measure motion, not content

"Open on content, no logo bumper" needs a definition a machine can check.
Rather than trying to recognise a logo, `retentionQC` measures the length of the
*static run* a video opens with: a bumper, an intro card and a title slide all
share the property that nothing moves. A video already changing at frame 0 opened
on content.

The same measurement gives pattern-interrupt detection for free.

## 16. Engagement is weighted, and the weights are stated

Saves are worth two to three times a like to the algorithm, so
`engagementRate()` weights them (`ENGAGEMENT_WEIGHTS`) rather than counting
interactions equally. `rawEngagementRate()` is kept alongside it for display, so
the weighting is visible rather than baked invisibly into a score.

## 17. The Daily Take fact-checks before drafting, and can refuse to draft

The order is the design. Fact-checking after drafting produces a false post with
a footnote; fact-checking before it produces a revised opinion. `runTakeLoop`
returns `needs_revision` and writes nothing when the check contradicts the
central claim.

`opinionPreserved()` measures vocabulary overlap between the raw input and the
draft, because the failure mode here is not a hallucination — it is a strong
claim quietly sanded into a balanced non-statement.

## 18. Transcription for spoken takes uses a hosted API, not the local whisper

The container has whisper.cpp, but the microphone is in the browser and the take
screen runs on Vercel where the container is not. `/api/take/transcribe` calls a
hosted model and degrades to "type it instead" on every failure path, because a
broken microphone must not block the only input-gated workflow in the system.

## 19. The adaptation is 26 seconds, not 60 to 75, and everything sized against that moved

The 60-to-75-second figure came from a July 2026 audit and was wrong by the time
round 3 measured it. A cold adaptation of a fresh URL completed in **26 seconds**
against the live server; a repeat of the same URL and diet returned in **under 10**,
because RecipeFix caches upstream.

Everything derived from the old number was recalibrated:

- **Connector timeout: 150s → 90s.** The old value was quietly dangerous. Two
  attempts at 150s consume 300s, which is exactly the generate job's timeout, so
  a hung adaptation killed the job on a timeout instead of failing with a reason.
  At 90s, two attempts fit inside the budget with room for the rest of generation.
- **Capture wait: 150s → 90s**, matching the connector. A capture that waits past
  the point the product itself would have given up is waiting on something broken.
- **The rate limit did not move.** Twenty an hour was never a throughput ceiling
  derived from duration; it is a spend ceiling, and adaptations got cheaper in
  seconds, not in credits.

## 20. The speed ramp became a cut, and the progress overlay was removed as artifice

Milestone 41 specified "ramp the wait to ~2s under a progress overlay". Two things
killed that design once the timing was measured.

A fixed ramp is wrong at both ends: at 2.3s (cached) there is nothing to compress,
and compressing it to 2s and captioning it is worse footage than leaving it alone.
The overlay was the real problem though — RecipeFix already shows its own
"Adapting…" state, so drawing a synthetic progress bar over it invents product UI
that does not exist. That is the rule the slop filter applies to copy, applied to
footage.

What replaced it: a plain cut, taken only above `ELIDE_THRESHOLD_MS` (4s), captioned
with the **measured** elapsed time. The compression is an ordinary edit and the
number is a fact. `26 seconds later` is also the more impressive claim, so honesty
costs nothing here.

## 21. Negative modulo, in Postgres and in JavaScript

`hashtext()` returns a *signed* int4, so `hashtext(x) % n` is negative for about
half of all inputs. The demo seed used exactly that, and `/analytics` rendered
"−3,449 impressions per post" without complaint for two rounds.

Three responses, because one was not enough:

1. The seed uses `abs(hashtext(x)::bigint) % n`. The bigint cast is not optional
   either — `abs(-2147483648)` overflows int4.
2. `post_metrics` and `attribution` now **refuse** negative counts. A constraint
   turns this class of mistake into a failed insert rather than a plausible chart.
3. The same family exists in JavaScript, where `%` keeps the sign of its left
   operand. `deterministicJitterMinutes` was already safe — the `>>> 0` is
   load-bearing — and is now tested across 2,000 ids. `bestTime.pad()` was latent
   and is now `((h % 24) + 24) % 24`.

## 22. Release detection watches the deployed build, not GitHub

Milestone 41's verification gate depends on live strings like
`aria-label="Choose your swap"`. RecipeFix ships through Lovable: no CI, no release
notes, no GitHub releases. A GitHub-triggered verification would therefore have
fired **never** for the one product this system serves.

The signal that does exist is the deployed build itself. recipefix.app is a Vite
single-page app whose entry bundle carries a content hash
(`/assets/index-DYhSuiDJ.js`) that changes on every deploy. One GET of the homepage
detects a release nobody announced. GitHub releases remain wired in as the
secondary signal for products that actually publish them.

## 23. Periodic work is scheduled by the worker, not by an absent cron

Every recurring job used to depend on something calling `/api/cron/[task]`, and
nothing was configured to call it. "Runs weekly" meant "exists, and has never run",
which is worse than no gate at all because it reads as coverage.

The worker now enqueues its own periodic jobs on a one-minute tick, with dedupe
keys bucketed to each job's interval so several workers converge on exactly one
copy. Only the jobs that genuinely need the web app's environment — token refresh
needs the OAuth client secrets — remain in `vercel.json`.

## 24. A verification pass proves the selectors resolved, not that the page painted

So captures are checked for blank frames before anything is filed. PNG is
losslessly compressed, so a flat image collapses to almost nothing: real UI lands
around 0.2 bytes per pixel, a uniform fill under 0.005. `looksBlank()` rejects
anything under 0.02 and the capture is discarded with a notification rather than
filed as an asset. A broken flow is also shown as **broken** on `/settings/health`,
with "never verified" as its own state rather than being counted as a pass.
