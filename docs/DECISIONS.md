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

## 25. Migrations backfill; seed.sql is the source of truth

Migrations run before `seed.sql`, so a product-scoped
`insert ... select from products` inside a migration matches **nothing** on a
fresh database. It fails silently, and the symptom is an empty screen weeks
later rather than an error at install time.

This has now happened three times:

| Round | What went missing | Symptom |
|---|---|---|
| 2 | `format_cadence` for RecipeFix | The video ceiling — the number the research says matters most — was absent from every fresh database |
| 3 | `products.destinations` | The link router had no destination to route to |
| 3 | `review_submissions` | `/submissions` was an empty checklist |

Round 2's fix for the first one made CI green by guarding the insert on the
product existing, which on a fresh database makes it a no-op — trading a loud
failure for a silent one. The rows only ever existed on the developer's machine,
where the product had been created by an earlier run.

The rule, now enforced rather than remembered: **a migration may backfill rows
for products that already exist; `seed.sql` owns the rows a new database needs.**
`packages/db/src/__tests__/seed.test.ts` applies migrations *and* the seed to an
isolated database and asserts that every product-scoped configuration table has
rows, so the next occurrence fails in CI instead of in the UI.

---

## 26. Unknown is not permission

**Milestone 49** asked for a unified publishing provider. The obvious shape is a
capability table listing what the provider supports, defaulting to "supported"
because the vendor says so.

`packages/core/src/adapters/unified/capabilities.ts` defaults every capability to
`unknown` instead, and `canPublish()` treats `unknown` as a refusal. A platform
cannot be switched to the unified transport, and a job cannot be carried by it,
until `scripts/verify-provider.ts` has watched it work against a real account.

The reason is specific rather than general caution. The single claim the provider
recommendation rests on — that their TikTok connection posts publicly without our
own Content Posting audit — is one that only their own marketing asserts. Nothing
neutral confirms it. Building on that assumption and finding out later would mean
a fortnight of posts that went somewhere unexpected.

This is the same rule `verify-flows` established for capture and the QC gates now
follow for empty input. **Never verified is not the same as passed.**

---

## 27. The metrics gap is named per platform, never rendered as a zero

Blotato's analytics response has no `savesCount`. Saves are weighted two to three
times a like in `engagementRate()`, and they matter most on exactly the two
platforms where they are missing.

A zero would have been arithmetically defensible and completely misleading:
"nobody saved this" and "this transport cannot see saves" are different facts and
only one of them is a reason to change what gets posted. `describeGap()` produces
the sentence and `/analytics` renders it per platform.

The general form, applied throughout milestone 51 as well: **an absent
measurement and a measured zero must never render the same way.**

---

## 28. Profile limits live in code, conservative where sources disagreed

**Milestone 50** needed per-platform bio limits, avatar sizes and banner
dimensions. Nothing in the repository knew any of it — `PlatformConstraints`
describes what a *post* may contain, which is a different question.

`PROFILE_SPECS` records them, checked against each platform's own documentation
and **rounded down wherever two sources disagreed**. Copy generated to fit a
conservative limit fits the real one; the reverse is not true, and a bio the
platform truncates mid-sentence is worse than a shorter one written deliberately.

The UI shows the character count against the limit for the same reason: when a
platform disagrees with this file, the operator sees the disagreement rather than
discovering it in a paste box.

---

## 29. A handle that cannot be checked is unknown, not free

Only Bluesky has a real availability API. Everywhere else the only unauthenticated
signal is whether a public profile page 404s, and that signal is corrupted by bot
walls, consent interstitials, login redirects and soft-404s that return 200.

So each platform declares its method and how far it can be trusted, an ambiguous
response resolves to `unknown`, and X and TikTok — which cannot be checked at all
without logging in — say so rather than guessing. Telling somebody a handle is
free when it is not costs a rebrand across seven profiles. Telling them to spend
fifteen seconds checking by hand costs fifteen seconds.

---

## 30. The launch batch was the first caller of the scheduler

`planSchedule`, `checkCadence` and `cadenceDebt` were built in earlier rounds and
had **no call sites outside their own tests**. Daily generation never set
`scheduled_at` at all, so no slot window, stagger rule or per-format cadence
ceiling had ever run in production.

Milestone 51's launch batch is their first caller, and wiring them up immediately
found a defect none of their unit tests had: `deterministicJitterMinutes` returned
a value in `[-n, +n]` **including zero**, and since a slot midpoint is usually a
round hour and the placer walks in five-minute steps, a post could land on exactly
`hh:00:00` — the automation fingerprint the jitter exists to remove. The range now
excludes zero.

The lesson is about coverage rather than about jitter: a module with thorough unit
tests and no callers is not tested, it is rehearsed.

---

## 31. `docs/halyard_first_run.md` does not exist

Milestone 51 asks for a first-30-days view "drawn from `halyard_first_run.md`".
That document is cited by the spec and was never written.

Rather than invent a citation or skip the deliverable, the content lives in
`packages/core/src/readiness/firstThirtyDays.ts` and is drawn from what the system
actually does. Every threshold on the page is imported from the module that
enforces it — `LEARNING_MIN_POSTS_PER_CATEGORY`, `MIN_POSTS_FOR_TIMING`,
`HOOK_PATTERN_COOLDOWN_DAYS` — so a constant that changes cannot leave the page
quietly describing the old one. That is also why it is code rather than markdown.

---

## 32. OpenAI is a fallback, and the seam is what made that cheap

Anthropic is the intended provider and the model names in `llm.ts` still say so.
But nothing should be unable to generate because one vendor's key is missing
while another's is present, so `createLlmClient()` picks by what is configured —
explicit `LLM_PROVIDER` first, then whichever key is real, Anthropic preferred.

The `LlmClient` interface was built in milestone 4 so a provider change would be
one file. It was: one new class, one factory, six call sites swapped from a
constructor to a function. Nothing in the copywriter, the idea engine, the QC
retry loop or the co-pilot changed.

`describeLlmProvider()` says which is in use *and which role it is playing* —
"openai (fallback — ANTHROPIC_API_KEY is not set)". Output quality moving is the
first thing anybody notices, and "which model wrote this" is the first question.

### Everything about the OpenAI API was verified, not recalled

Four things were true of the real API and not of my memory of it:

1. **`max_tokens` is rejected** by the gpt-5 family. It is `max_completion_tokens`.
2. **`temperature` is rejected by some models and not others.** `gpt-5.5` allows
   only the default; `gpt-5.4-mini` takes 0.7. No stable documentation says which.
3. **`response_format: json_object` requires the word "json" in the messages**,
   or the request 400s.
4. **`gpt-5.5-pro` is not a chat model at all** and answers only on the responses
   endpoint.

Rather than a table of which model tolerates what — wrong the moment a model
ships — the client drops a parameter the API names in its error and retries once.

### The draft model is the *expensive* one, on purpose

The instinct is a cheap model on the high-frequency path. Benchmarked on one
draft through the real copywriter:

| model | attempts | time | cost |
|---|---|---|---|
| gpt-5.4-mini | 2 | 2.4s | $0.00087 |
| gpt-5.4 | 2 | 2.0s | $0.00084 |
| gpt-5.5 | **1** | **1.6s** | **$0.00051** |

The smaller models failed QC on the first pass and were regenerated, so they were
slower *and* dearer than the better one. Retries dominate at this size, and the
copy was plainly worse. This is the copy that gets published.

### Reasoning tokens are counted against the output budget

`maxTokens` means "text I want back" on Anthropic. On a gpt-5 model the same
number must also cover reasoning tokens, which are invisible and spent *before*
any text. The copywriter asks for 1500 because that is a sensible Claude number,
and the first real generation returned `finish_reason: length` with an empty
string — not truncated output, none at all.

The headroom lives in the OpenAI client rather than in every caller, with one
retry at a much larger budget if a future model thinks harder still.

---

## 33. A gate whose input is optional is a gate that never runs

Three subsystems were found designed-and-unwired in a single afternoon, and they
shared one shape. Recording it because the shape is the lesson, not the
instances.

| Subsystem | How it looked | What was true |
|---|---|---|
| Visual and audio QC | Two of six gates in every stored verdict | `runAllGates` takes their probes as **optional** inputs and no production path ever supplied one. Unable to run since written |
| `visionScore` rubric | A scored vision check with tests | Never populated by anything |
| `collect_signals` | On the schedule every six hours since day one | **No handler registered.** The poller claimed each job, put it back, repeated. 13 accumulated over 75 hours in production |
| `tts` | A job kind, a voice lexicon, an audio gate, `writeVoScript` | **No ElevenLabs integration exists anywhere.** Voiceover is not implemented |

In every case the failure is silent *by construction*:

- An optional input nobody provides produces a gate that never objects, which
  renders identically to a gate that examined the media and approved it.
- A job with no handler is put back rather than failed — which is correct, since
  a rolling deploy produces exactly that — and so never errors, never
  dead-letters, never alerts.

**The structural fixes, which matter more than the individual repairs:**

- `handlerCoverage.test.ts` fails if a scheduled kind has no handler, if a
  handler has no timeout policy, or if a declared kind is unhandled *without a
  written reason*. `tts`, `digest_email` and `send_newsletter` are now
  documented as knowingly unimplemented, which is the difference between a
  decision and an oversight.
- The poller raises a notification, once per kind per process, when it meets a
  job it cannot run.

## 34. "It drains" is not "it works"

The first fix for `collect_signals` was a correct handler that never ran.

All eight RSS sources belong to `founder`, which is `kind = 'personal'`. The
scheduler's `perProduct` option enqueues one job per `kind = 'product'` row, so
the job arrived with `productId: 'recipefix'`, found no sources, logged "no rss
sources configured", and returned successfully. Thirteen stuck jobs drained from
`queued` to `done` on deploy and **zero stories were stored**. `last_polled_at`
stayed null on every feed.

Every dashboard would have shown that as fixed.

The handler now follows the data rather than the payload — it collects for
whichever products actually have enabled feeds. And the tests assert the
*effect* rather than the completion: one checks a story lands under `founder`
when the payload carries no product at all, the other checks `last_polled_at` is
set, which is proof the feeds were reached rather than proof the function
returned.

**The general rule: assert on the side effect, never on the absence of an
error.** Four of this week's bugs would have been caught by that alone.

## 35. A story's age belongs to the story, not to when we fetched it

`collect_signals` finally reached the feeds, and stored 2,118 stories.

The number going up read as the feature working. It was not. Expiry was written
as `now() + 48 hours` — measured from the moment of fetch — while several of
these sources serve a deep archive rather than a recent window. So every item
arrived `new` regardless of when it was published: **1,135 were more than a year
old, and the oldest was from 2015**. The take screen ranks by convergence and
shows the top five, so the founder's "what happened today" could have been a
decade-old post that three feeds happened to carry.

Nothing errored, nothing was in a dead letter, and the count looked healthy.

Freshness is now anchored to `published_at`, and stale items are refused at
ingest rather than stored and expired in the same pass — writing 1,135 rows in
order to immediately retire them would have taught the health screen to expect
churn that means nothing. An item with **no** date is still kept: fetch time is
the only clock available for it, and dropping every undated item would blind the
take screen to whole sources without saying so.

## 36. A skipped test is an unrun test, and the suite reports it as green

Chasing the story-age bug turned up something worse in the harness.

The same commit reported "47 passed, 1 skipped" and "42 passed, 6 skipped"
depending on which shell invoked it, and both looked fine. Two causes:

- Five cron tests guard on `test.skip(!process.env.CRON_SECRET)`. Playwright's
  process never loaded an env file, so they ran only if the operator happened to
  have exported the secret by hand. **Those are the tests that catch the
  GET/POST mismatch that would have made every scheduled task 405 in
  production** — the exact bug they exist for, unrun by default.
- One safety test skipped when no unexpired story happened to be in the
  database, which made its coverage a function of when the feeds last ran. It
  skipped for real the day expiry was corrected, because the whole local table
  aged out at once.

Both are now unconditional: the config loads `apps/web/.env.local`, and the
safety test seeds the story it needs instead of excusing itself. The suite runs
**48 of 48** from a clean shell.

A conditional skip is only honest when the condition is a real capability the
environment cannot have. "The secret was not exported" and "the data happened to
be absent" are not that — they are the test quietly declining to check, in
exactly the environments where checking mattered.

## 37. Source weight had a `why` for every row and no effect on anything

With story ages fixed, the take screen showed five arXiv preprints. Every day.

Each source carries a `weight` and a written `why`: Hacker News 1.4, Anthropic
and OpenAI 1.3, arXiv deliberately lowest at 0.6 *because* it publishes hundreds
of preprints daily. That column was read in exactly one place — `order by weight
desc` on the polling loop, deciding which feed gets fetched first, which affects
nothing at all.

So relevance was convergence alone, every single-outlet story tied at 0.33, the
tie broke on recency, and the highest-volume lowest-rated source took all five
slots. The seeded editorial judgment was decoration.

Relevance now scales convergence by the highest contributing outlet's weight.
Convergence still leads — three outlets on the same morning beats one trusted
one — but a Hacker News story alone (0.47) now outranks a preprint nobody else
picked up (0.20).

This is the third bug this week of the same shape as §33: a field that exists,
is populated with care, reads as if it does something, and is wired to nothing.
Worth asking of every column that looks like a knob — **who reads this?**

## 38. TikTok has been getting image drafts since generation was written

Generation chose format with `platform === 'pinterest' ? 'pin' : 'image'`.

TikTok's adapter declares `supportedFormats: ['video']`. YouTube's declares
`['video']`. Both were therefore issued image drafts for every post — a format
neither can accept. Nothing caught it because nothing has published yet, so the
first symptom would have been the launch batch failing at the publish step on
two platforms simultaneously.

The capability was already recorded, per platform, by the adapter that knows it.
`chooseFormat` reads it, and **throws rather than defaulting** when nothing
matches: a fallback that is always *a* valid value is indistinguishable from a
correct one right up until something tries to publish it, which is exactly how
this survived.

The same commit joined up the rest of the video path, which had never run: four
Remotion templates marked `enabled` and unreachable, `renderVideo` called only
by a demo script, `writeVoScript` called by nothing, `tts` declared with a
timeout policy and no handler, and `runAudioQC` — a complete gate — with no
input in its life.

## 39. A list of known gaps has to be exact, or it becomes a place gaps hide

`handlerCoverage.test.ts` was written to catch a scheduled job with no handler.
Its `knowinglyUnhandled` map was checked as a *superset*: fail if a kind is
unregistered **and** undocumented.

That is one-directional, and it rotted immediately. The entry for `tts` read
"there is no ElevenLabs integration anywhere in the codebase" while sitting in
the same repository as a working ElevenLabs integration. Nothing failed, because
a kind documented as missing that actually exists still satisfies a check for
kinds that are missing and undocumented.

Worse than stale: if the handler were ever unregistered, this file would have
called it a deliberate decision and gone green.

Now asserted in both directions — which immediately caught `send_newsletter`,
documented as "sending is not implemented" while being fully implemented, with
an approval gate and a Resend integration, for who knows how long.

**A file whose job is to record what is missing needs a test that it is still
right about what is present.**

## 40. The gate built to catch unreachable checks had three of its own

Phase 2 added `runCoherenceQC` specifically to catch the pattern in §33 — a
check that exists, reads as coverage, and never runs. Building it found
`runAllGates` taking `visual` and `audio` as optional inputs that no production
path had ever supplied.

It shipped with the same defect. `runCoherenceQC` accepts an optional `audio`,
and `reviewMedia` called it as `runCoherenceQC({ intent, frames })`. So
`silent_open_says_nothing`, `narration_shows_nothing` and
`opening_line_buries_it` were unreachable from the day they were written.

`intent.script` was passed as `null` in the same call, while `vo_script` sat on
the row being read. Every rule comparing what was said against what was scripted
compared against nothing.

There was a reason available at the time — no voiceover existed, so there was
genuinely no audio to observe. That is an argument for the code failing to be
written, not for it appearing to be complete. The gate reported `passed` on
posts it had not fully examined.

Now supplied from the tts handler's transcript, which it had to produce for the
audio gate anyway, and reported as `not_measured` when there is no voiceover.

**An optional parameter is a promise that something will pass it. Three times
now the caller has not, and every time the result read as a pass.** The pattern
is worth distrusting on sight: if a gate takes an optional input, find the
caller before believing the gate runs.

## 41. The caption was gated. The narration was not.

`writeDraft` runs the slop filter and the claim verifier over the post body, on
a retry loop, and refuses to return copy that fails. `writeVoScript` called the
model once and returned whatever came back.

So the words beside a video were held to the standard and **the words in it were
not** — not for banned phrasing, not against the product's own forbidden-claims
list. A script could state a health claim nobody can support and the only gate
downstream measured whether it was *pronounced* correctly.

A voiceover script also has failure modes a caption does not. A hashtag is read
aloud as "hash tag". A URL is spelled out. A fraction reaches the synthesiser as
a symbol. A parenthetical has no spoken form at all, and a sentence a reader can
re-scan is one a listener has already lost. Those are now `spoken` rules in the
slop filter, and hashtag-count rules are skipped there, because counting
hashtags in something nobody can say is meaningless.

The script is gated before synthesis and the **transcript** is gated after. The
second pass is not redundant: it catches the synthesis rather than the writing —
narration that never existed as text, which no earlier gate could have seen.

## 42. No licence means no music, not a cheaper imitation of music

ElevenLabs Music is off: their terms carve advertising out of the standard
commercial grant, and Halyard's entire output is product marketing.

The tempting workaround is to synthesise a bed with FFmpeg. A drone is
unambiguously ours and needs no licence from anybody. It is also, plainly, a
drone — and worse, it would be indistinguishable *inside the pipeline* from a
real bed. Every gate would pass it, the mix would report `hadMusic: true`, and
nobody would ever discover which one shipped.

Beds come from the asset library instead: licensed audio the operator owns,
tagged `music_bed`, rotated least-recently-used because sixty posts a month over
a handful of beds collides constantly and the same bed twice running is the
first thing a viewer notices.

With no library, videos ship with narration alone, normalised — a normal
short-form style rather than a degraded one — and the reason is recorded on the
item rather than inferred from silence.

**Where a licence is the blocker, the honest output is the unlicensed feature
switched off and labelled, not a lookalike that clears the same checks.**

## 43. Coherence is not the same question as quality

The coherence gate asks whether a video is *about* the right thing. A video can
answer that perfectly and still be a static card with thirty words on it, which
is the clearest signature there is of content nobody made by hand.

`visual_slop` rules are separate for that reason, and deterministic over what
the describer reported — no judgement is delegated to a model. The describer
says what it saw; the rules decide what that means.

`entirely_static` matters most because `static_open` only compares the first two
frames. A video that holds one card for its entire length passes the hook check
at worst as a warning, because its opening is exactly as static as the rest of
it, and being uniformly motionless was never the thing being measured.

## 44. Approving a post and sending it are two decisions

`approveItem` enqueued a publish job only if the slot had already passed. So
approving something scheduled for Thursday meant waiting until Thursday, with no
way to say "this is fine, send it".

Those are different judgements. Approval says the post is good; posting says it
should go out. Fusing them makes the queue reviewable only at the moment you
also want to publish, which is not how anyone reviews a fortnight of drafts.

`publishNow` still enqueues rather than publishing inline. The publish handler
owns the idempotency guard, the kill switch and the cross-product routing check,
and a second path around it would be a second path around all three. It refuses
anything not already in `approved` or `scheduled`, because publishing straight
from `pending_approval` would route around the review the screen exists for.

## 45. An account with no API is a handover, not a failure

`draft_only` and `awaiting_manual_publish` were designed together. The
capability state, the item state, both schema constraints, `publications.publish_mode`,
`publications.manual_publish_url`, the demo seed and the architecture doc all
describe this path in detail.

**Neither end was ever built.** The publish handler refused only `disabled` and
`error`, so a `draft_only` account fell through to the adapter and failed there
— which reads as a broken integration rather than as a post waiting for a
person. Nothing in the UI ever showed `awaiting_manual_publish` either, so an
item in that state was invisible.

This is not an edge case. Facebook is not in the platform check constraint at
all, so it cannot even be represented; any account whose platform review has not
landed sits in `draft_only` indefinitely.

The handover is designed so posting by hand costs one visit: the caption is one
click from the clipboard *already joined to its hashtags* — assembling it by
hand is where the posted version drifts from the reviewed one — the media is one
click from disk, and the platform's composer is one click away.

The URL back is **required**. Without it there is nothing to collect metrics
against and nothing to prove the post exists, and the item would claim
`published` on an assertion alone. That is the shape of every "it looked done"
bug in this codebase, so it is refused rather than defaulted.

## 46. The Explorer's unit of discovery is a claim plus a way to re-perform it

Phase 3 says build verification before the crawler. The reason is worth stating
in full: a list of forty features a model believed it saw would immediately
become the ground truth every prompt draws on, and **nothing downstream would
ever question it**. An inventory nobody can check is worse than no inventory,
because it reads as knowledge.

So `feature_claims` rows carry `replay` — the steps that demonstrate the
feature and the things that must be observable when they run. `status` is
decided by running them, never by asserting them.

Four statuses, and the fourth is the one that matters:

- `unverified` — not run yet, or the last run broke part-way
- `verified` — ran, and every required expectation held
- `refuted` — ran to the end and something promised was absent
- `unverifiable` — **ran cleanly and asserted nothing**

That last one is the most likely way this system starts lying. Nine navigation
steps with no expectation complete cleanly every time, including on a page that
has lost the feature entirely, and "no failures" reads exactly like "confirmed".
`verdictFor` has no path to `verified` without a satisfied required expectation.

A flow that broke part-way stays `unverified` rather than `refuted`, because a
moved selector and a removed feature look identical from here, and refuting on
ambiguity would delete real features from the inventory on a flaky run.

Verification also expires. RecipeFix ships through Lovable with no release
notes, so a check from a month ago is a guess — `canMarket` reads status *and*
recency, and `verified_at` moves only on a pass.

## 47. The model proposes, the denylist decides

The capture flows in `capture/flows.ts` are hand-written and were read by a
person before they ever ran. The Explorer's flows are proposed by a model from
what it saw, and then driven through a real browser against a real signed-in
account. Identical-looking data structure, completely different risk.

No prompt instruction is a control here. "Please don't click delete" is a
request, subject to every failure mode prompts have, and the thing on the other
side of the click is someone's account. `checkFlowSafety` is deterministic code:
allowed action vocabulary, destructive/transactional/identity term matching on
both label *and* selector, no typing into credential or payment fields, and
origin scoping that compares hosts rather than string suffixes — because
`'evil-recipefix.app'.endsWith('recipefix.app')` is true, and that is how an
authenticated browser gets handed to someone else.

Two decisions inside it worth keeping:

- **A flow with one refused step is refused entirely.** Dropping step 4 of 9
  and running the rest produces a sequence nobody designed, against live state.
- **Safety is re-checked on every run**, not once at discovery. `replay` is a
  mutable jsonb column; checking once would mean the property holds only for as
  long as nothing edits the row.

The denylist is a heuristic and text matching has gaps — a button labelled "Tidy
up" that deletes everything passes it. It is therefore one layer, and the other
is that exploration is meant to run against a dedicated account with no payment
method and nothing worth losing. That control does not depend on guessing what
a button means.

## 48. The model proposes claims; it cannot propose that they are true

The discovering half of the Explorer is arranged so the model can only ever
suggest. It cannot mark anything verified — `status` is not read from its reply
at all — it cannot widen the action vocabulary, and it cannot get a claim stored
that has nothing observable in it.

That last rule is what makes this an inventory rather than a list of
impressions. The obvious prompt is "list the features you can see", which
produces prose; prose becomes the brief, the brief becomes every prompt, and
nothing downstream can tell an observed feature from an imagined one. So the
schema demands the demonstration — the steps, and what must be true when they
finish. **A model that cannot say how it would prove a feature has not found
one**, and `validateClaims` rejects it with that as the reason.

Rejections are returned rather than filtered away. What a model *tried* to
propose is the signal for whether the prompt is working, and a run that
repeatedly proposes destructive flows is something to know about.

The model is shown an accessibility-style outline — roles, names, visible text —
not raw HTML. Markup is mostly framework noise, it is enormous, and it invites
invented CSS selectors that happen to parse. Names are what a person navigating
the page would use, and they survive a redeploy far better than a hashed class.

Signing in is code, using credentials from the environment, and runs before any
discovered flow. That is *why* the denylist refuses a proposed `fill` into a
password field outright: there is no legitimate reason for a discovered flow to
type a credential, because signing in has already happened.

Exploration is deliberately **not scheduled**. It costs model calls and may
spend product credits, so it stays a deliberate act. Re-verification *is*
scheduled, one stale claim every six hours, because verification expires and
without a sweep the inventory decays into uselessness — a decay that looks
identical to an empty inventory from the outside.

## 49. Two lists of the same thing, in two languages

`JOB_KINDS` in TypeScript and `jobs_kind_check` in Postgres are the same list
written twice. Adding the Explorer's kinds to one and not the other typechecked
cleanly and then failed at the first insert.

It surfaced only because the scheduler tests enqueue against a real database. A
unit test over the TypeScript constant would have passed happily, and the
failure would have been the scheduler dying in production on its first tick
after deploy — every periodic job, not just the new ones.

The two lists are now compared directly against `pg_constraint`. The general
form of this is worth watching for: **any constant duplicated across a language
boundary needs a test that reads both copies**, because the compiler only ever
sees one of them.

## 50. Nobody had looked at a rendered card

Every gate measures something real — contrast, aspect ratio, whether the claimed
term appears, whether the frames match the copy. None of them answers "would a
person stop scrolling for this", and until now nothing put the actual pixels
anywhere a human could see them without running the whole pipeline first.

`pnpm render-templates` renders all seven image templates to disk. Looking at
the output found, in the first five minutes, things no gate could have caught:

- **`substitution_ratio` rendered a heading over nothing.** "WHAT GOES WRONG IF
  YOU IGNORE IT" with empty space beneath it, because the caller passed `note`
  where the template wanted `failureMode` and `text(undefined)` renders as blank
  rather than throwing. Contrast fine, ratio fine, claimed term present — every
  gate passed a card that promised an explanation and delivered nothing.
- **`pinterest_tall` crashed outright** on `.slice` of undefined. It had never
  been rendered by anything but its own unit test.
- **All of them carry a great deal of dead space** — content occupying roughly
  the middle half of the frame, on surfaces where vertical space is the scarcest
  thing there is. That is a judgement, not a defect, and it is the sort of
  judgement only looking produces.

`renderTemplate` now validates required props and refuses rather than rendering
a partial card, because a blank area on a finished-looking card is worse than a
failed render: the failed render is visible in the queue.

## 51. A hand-written list about code is wrong the moment the code moves

`TEMPLATE_REQUIRED_PROPS` was wrong on the day it was written — `pinterest_tall`
declared as needing `headline`/`before`/`after` when it takes
`title`/`subtitle`/`bullets`. So validation passed a call that then crashed
inside the template.

The fix is not care. It is a test that gives each template exactly what it
declares it needs and nothing else: if it cannot render from that, the
declaration is incomplete. Seven templates, checked both ways — renders from its
declared props, refuses without one of them.

Writing that test then caught the *validation itself* being wrong. It treated an
empty array as missing, which failed a caller that was correct: `carouselProps`
deliberately emits `bodyLines: []` for a slide carrying a screenshot instead of
copy. Whether emptiness is a defect depends on the template, so the validator
no longer decides it.

**Three layers, three bugs, each found by the layer above it.** The list was
wrong, the test caught it; the validator was wrong, the test caught that too.

## 52. The loop that compounds was recording its results and never acting on them

`hooks.ts` opens by saying it is "the highest-leverage three seconds in the
product" and "the loop that compounds: everything else in Halyard makes
production faster, this makes the output better over time."

`surfaceBestVariants` had no caller.

Generation *recorded* a hook after the fact — classifying whichever first line
the copywriter happened to write — and the half that generates eight variants,
filters them against a typed taxonomy, checks for near-duplicates and clickbait,
scores them on recency-weighted history and predicts a stop rate never ran. Three
tables behind it, reachable only from tests.

This is the largest quality change available before anything publishes, and it
was found by enumerating every exported agent function and counting its real
callers rather than by reading the architecture docs, which describe it as
working.

Two decisions in the joining-up:

- **Five surfaced, the top one applied.** The scoring leans on measured stop
  rates that do not exist yet, so ranking is a suggestion; applying the top one
  means an unattended run still produces a complete post, and swapping is the
  operator's.
- **The payoff check runs on the applied hook only.** Checking all five costs
  five model calls to reject four hooks nobody chose.

Writing the test then proved the filter is real: a fixture whose `spoken_hook`
was the on-screen text plus a full stop had **all eight variants rejected** for
`hook.layers_identical` — two channels saying one thing wastes one of them. The
filter was right; the fixture was the bad hook.

## 53. Counting callers is how you find out what runs

The agent audit was done by enumerating every LLM call site, then every exported
agent function, then counting real callers of each — excluding tests and build
output. Not by reading `social_engine_architecture.md`, which describes all of
it as working.

Three of thirteen agents had no caller. One of them, the hook system, was the
highest-leverage component in the product by its own documentation.

It also caught me being wrong in the other direction: I reported `factCheckTake`
as orphaned because I had grepped for `factCheck(`, which does not match
`factCheckTake(`. It is wired, inside `runTakeLoop`, and runs on every founder
take. **An audit is only worth the precision of its query**, and a grep that
silently matches nothing looks exactly like a grep that found nothing.

## 54. Delivery is measured, not judged

The one thing no gate covered was whether a read *sounds* like a person. The
obvious fix is to hand the audio to a model and ask. That is a vibe, it is
unfalsifiable, and it is the kind of judgement this project has spent weeks
moving out of models and into code.

The things that make synthetic speech sound synthetic are visible in data
already produced. Whisper returns per-word timings for the finished mix, and the
script says where the sentences are. From those: pace variation (a flat read
holds one rate; a person speeds through a familiar clause and slows on the
point), whether there are audible pauses at all, word-duration outliers that are
usually mispronunciations, and whether the opening is rushed.

**Every finding is a warning, and stays one.** No ElevenLabs key exists on this
deployment, so no real synthesised speech has ever been measured by this module
— the thresholds come from the pacing band the audio gate already used, not from
observed output. A gate that blocks publishing on an invented number is worse
than no gate, because the number acquires authority it never earned.

## 55. Eleven per-platform prompts, and nothing chose between them

`FORMAT_SPECS` declares eleven craft prompts — X insights and threads, Instagram
carousels, singles and reel scripts, TikTok scripts, Pinterest pins, YouTube
shorts, Threads posts — each with its own craft notes, shape rules and extra
output fields.

`selectFormatSpec` did not exist. The copywriter used one generic prompt with a
per-platform brief appended, so **a carousel and a single image were written
identically**, and the slide structure a carousel declares it returns was never
asked for.

Selection is on the platform *and* format pair, not the platform alone: a
carousel is not a longer single post and a reel script is not a caption. Where
no spec exists — Bluesky — it returns null and the post gets the shared caption
architecture rather than a near-match. Handing Bluesky the Threads prompt
because they look similar is how a platform quietly acquires someone else's
voice.

## 56. maxChars was declared on every adapter and checked nowhere

Every platform adapter carries `maxChars`. Nothing read it. A 400-character X
post passed every gate, sat in the queue looking finished, and would have been
rejected by the platform at publish — the first symptom a failed post rather
than a flagged draft.

Now enforced in the slop filter, counting hashtags against the same ceiling
because they are posted together, with a warning band at 90% because feeds
truncate well before the limit and a caption that only reads correctly when
expanded is one most people read wrong.

The limits live in `qc` rather than being imported from `adapters`, because a
cycle between them is worse than a second copy — and the second copy is only
safe because a test compares it against every adapter. That is the same lesson
as §49: **a constant duplicated across a boundary needs a test that reads both
copies**, because the compiler only ever sees one.
