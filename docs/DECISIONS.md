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

## 57. A fact cites its evidence, or the database refuses it

The Product Brain could have been a table of things a model said about a
product. That version works on the first run and is indefensible by the
hundredth: nothing downstream can tell an observed fact from an invented one,
and everything downstream — every prompt, every claim check — treats both the
same.

So `product_facts.evidence_ids` is checked by a trigger. A fact with no evidence
raises rather than inserting. The rule lives in the database rather than in the
writer because a check in the handler holds only for as long as every future
writer remembers it, and this is the one rule the whole design rests on.

**Two independent sources make a fact verified.** Never one — one source means
"observed", which is what `unverified` already says. And evidence is keyed on a
hash of its content, so re-collecting an unchanged page collides with the row
already there. Without that, the weekly collector would have corroborated every
fact in the Brain with itself, and the entire thing would have read `verified`
inside a month. Corroboration by repetition is the failure mode a knowledge
store is most naturally shaped to produce.

## 58. Features stay in feature_claims; prohibited claims stay in content_rules

The architecture lists both among the Product Brain's categories. Neither is
there, for opposite reasons.

**Features** already have a stronger home. A `feature_claims` row becomes
`verified` by *replaying its steps in a real browser* and observing the result —
far better evidence than two pages agreeing. Adding a `features` fact category
would have given one question two answers, and the weaker one would have won
arguments by being easier to write to.

**Prohibited claims** are not an observation at all. They are the operator
telling Halyard what it must never say, they live in
`products.content_rules.forbidden_claims`, and the slop filter and copywriter
enforce them. Copying them into a table that agents propose into would create a
second home for a safety rule *and* put a model in a position to write to it.

Both are departures from the architecture's category list, taken on §21: do not
rewrite a working subsystem to make its name match the document.

## 59. The contradiction table could not hold a contradiction

`product_facts` was first keyed unique on `(product_id, category, key)` — one
row per slot, which reads as obviously correct. It made the entire
contradictions feature impossible.

Two agents proposing different values for one slot collide on that index, and
the upsert overwrites the first with the second. `findContradictions` groups by
slot and looks for two values; it would have found one, always. The screen, the
reconciler agent and the rule behind them were all wired to something that could
never happen.

The key is now `(product_id, category, key, value)`. A slot holds every distinct
value observed for it, re-observing the same value still collides and updates,
and disagreement is representable.

Found by a test asserting two rows and getting one. It would not have been found
by reading the code, and it would never have been found in production — an
absence of contradictions looks exactly like a consistent product.

## 60. A verdict, not a third capability word

Two capability vocabularies already existed and both were correct.
`CapabilityState` (`pending_auth`/`draft_only`/`live`/`error`/`disabled`) is
where one account sits in authentication and review. `Capability`
(`yes`/`no`/`unknown`) is what a probe watched a transport do. Neither answers
the question a caller actually has, which is whether *this account* can do
*this thing* right now.

P2 added `resolveCapability` rather than a third word. It is a pure function
over five dimensions kept deliberately separate — platform, transport, account,
policy, verification — and it owns no state. A resolver with a store would
become a fourth opinion able to drift from the three it exists to reconcile,
which is exactly what happened to capability in the first place.

The verdict separates **`declared`** from **`verified`**, and only `verified` is
actionable. An adapter declaring it supports carousels is a statement by whoever
wrote the adapter; a probe is an observation. A system that renders those the
same way will eventually publish on the strength of a sentence in a vendor's
documentation.

## 61. A probe that could not run is a result

`capability_probes.outcome` has four values, and the important pair is
`unavailable` versus `refuted`. A probe that ran and found the capability
missing is a finding. A probe that could not run — no API key, provider
unreachable — proves nothing at all.

Collapsing them is how an absent credential hardens into a permanent "not
supported", which downstream is indistinguishable from a platform that genuinely
cannot do the thing. So the handler records `unavailable` and writes **no**
capability row, and a failed probe never downgrades a belief an earlier
successful probe established.

Verified against the live provider during P2's acceptance review: the probe ran,
Blotato returned `401 Unauthorized`, and the handler recorded `unavailable`,
wrote **no** capability row and did not throw. A rejected credential is exactly
the case where a lesser implementation would have written an all-`no` capability
that read like a thorough probe finding a limited provider.

This also gave `verify-provider` the ignition it never had. The script has
existed since milestone 49 and `provider_capabilities` had never held a row,
because running it was something an operator had to remember — the same shape
`explore_product` had before P1.

## 62. A skipped gate is not a passed gate

`runAllGates` computed `passed: gates.every(g => g.status !== 'failed')`, and
`skipped` is not `failed`. So an item whose gates never ran reported `passed:
true` — the "never verified ≠ passed" violation this codebase is built around,
arriving through the one function meant to enforce it.

Callers can now declare `requires`, and a required gate that did not run fails
honestly with a summary saying so. Declaring nothing keeps the old behaviour,
which is correct for the six copy-time callers: `runAllGates` runs before any
media exists, so it could never have supplied `visual` or `audio`.

**No production caller declares a requirement yet, and that is stated rather
than glossed.** The mechanism is tested and changes no current behaviour. It
shipped untested in P2's first commit and the gap was found in acceptance
review — which is late, but is what the review is for. Wiring a real caller
means deciding *which* items must have media QC before approval, and that is a
change to the quality system rather than to the capability model P2 exists to
build. Those are
measured by `runVisualQC` in `review_media` and `runAudioQC` in `tts`, each at
the only moment its input exists.

The Auditor's `gate.input_never_supplied` therefore remains, and remains
accurate: no production caller supplies those inputs. Fixing it properly means
unifying the two stages, which is a change to the quality system rather than to
P2, and P0 explicitly declined to make it. What P2 changed is that an unmeasured
dimension can no longer contribute to a pass.

## 63. FeatureDemo is disabled, not deleted

The Auditor reported `feature.enabled_unreachable` on it and was right: the only
non-test code that inserts into `renders` is `generate.ts`, which writes
`satori` and `remotion` and never a `playwright` render. An enabled template no
code path can reach is a capability that exists on a screen and nowhere else.

Disabled rather than deleted, because the template and its capture flow are real
work and the day something inserts a playwright render this is a one-line
change. Leaving it enabled would have kept claiming a capability the system does
not have.

## 64. Disconnect erases the credential; disable does not, and never did

Halyard's strongest "off" was `setCapabilityState(… 'disabled')`, which writes
one text column. A "switched off" account still held a live, decryptable
platform token, and `/privacy` and `/data-deletion` had to be written to say
Halyard could not erase a credential on request — the honest sentence at the
time, and a poor answer for a system asking Meta for permissions.

`packages/core/src/accounts/disconnect.ts` erases it: access and refresh tokens,
expiry, scopes, supported formats, identity confirmation, last verification and
the self-test result — everything that is a credential or was observed by
holding one. It also deletes any sealed copy staged in `pending_connections`,
which an erasure that only touched `social_accounts` would have missed.

**It reads the erasure back and throws if anything survived.** This is the one
operation whose entire purpose is to destroy data, so reporting an unobserved
success is itself the harm.

**It does not delete the account row.** Publications reference it, and a
publication that cannot say which account it went out from is worse than a
retained handle. Identity fields stay for the same reason.

**It does not revoke at the platform, and says so** — in the outcome, in the UI
message, and on both legal pages. Erasing Halyard's copy does not invalidate the
token. Provider-side revocation (X `/2/oauth2/revoke`, Meta
`DELETE /me/permissions`) is a real follow-on: it needs a method on all seven
adapters, must run *before* erasure or the token needed to revoke is already
gone, and cannot be verified without spending a live credential. Rejected for
this slice rather than half-built.

Guarded by typing the handle rather than a confirm dialog, because the cards sit
in a grid and "Disable" and "Disconnect" are one word apart.

## 65. Capability observations are scoped to an account, not just a transport

`read_comments` and `read_mentions` were in `CAPABILITY_ACTIONS` and had no
entry in `TRANSPORT_FIELD`, so they could never rise above `declared` however
much evidence existed. P2 recorded this as a real architectural hole and
deliberately did not fix it, because fixing it looked like it needed new
vocabulary.

It did not. What it needed was a **scope**. `PlatformCapability` describes a
transport — a fact about a provider, equally true for everyone using it. Whether
Halyard can read the comments on a post is a fact about one connected account:
it depends on which permissions that account granted, whether its token still
carries them, and whether the platform approved this app for it. @recipe.fix
succeeding proves nothing about @isaacmineo.

So `capability_probes` gained `account_id` (0032) and `CapabilityInputs` gained
`observation`. No new words: `outcome` is the same four the table already stored,
and the verdict is still computed rather than stored.

**Matching is strict on platform, action and account.** An observation carrying a
different account id, or none when one was asked about, is discarded rather than
generalised. The widening it would otherwise perform — "one account could, so the
platform can" — fails silently in the direction of permission, which is the one
direction that matters.

**`on delete cascade`, not `set null`.** A null `account_id` means "about the
transport", so letting an orphaned row fall back to null would promote an
account-scoped confirmation into a platform-wide one. Nothing in Halyard deletes
an account row — disconnect keeps it (§64) — so this guards a future path.

**The collector is the probe.** An engagement read cannot be verified by a
background job: it needs a real account, a real publication and a real call,
which is exactly what `collect_comments` already does fifteen times in a
publication's first day. A separate probe job would spend API calls to learn
what this one learns for free.

**No failure is ever recorded as `refuted`.** A deleted post, an expired token
and a rate limit all surface as a thrown error, and none proves the account
cannot read comments. Failures record `unavailable` or `error`, which the
resolver ignores in *both* directions — a failed probe can neither promote a
capability nor harden into "not supported". The reader also selects only
informative outcomes, so this morning's rate limit does not erase last week's
confirmation; it simply adds nothing, and staleness handles the ageing.

**Recording is rate-limited to one unchanged observation every six hours, and a
changed outcome is always recorded immediately.** Append-only evidence is only
useful while it can still be read.

## 66. An empty string is a credential the platform has to refuse

`loadAccount` and `publishHandler` both read the stored token as
`access_token_enc ? openToken(…) : ''`. An empty string is a *value*: with
nothing stored, the request was still composed, still sent, and refused by the
platform with an empty bearer — a real API call, plus its retries, to learn what
the row already said. On X that is a billed call.

It was never an exotic state. Every seeded account is `capability_state = 'live'`
with no token, because `live` has never meant "connected" (`accounts/status.ts`
exists because of that confusion), and §64's Disconnect now erases a credential
while leaving whatever state the account was in. `publish` refused `disabled` and
`error` and diverted `draft_only`, and `pending_auth` fell straight through.

All three call sites fail closed before any network call. `loadAccount` returns
`null` rather than a fabricated token, so the type forces each caller to decide;
the collectors log and return **without rescheduling**, because a missing
credential is not transient and the decay schedule would otherwise re-enqueue
forever.

The publish guard sits **after** the `draft_only` handover, not before. A post
being handed to a person to publish by hand does not need a credential, and
checking first would turn a working handover into a broken integration — the
same defect the handover branch was built to fix. Both orderings are asserted.

## 67. The declaration table is now checked against the adapters

`ADAPTER_DECLARED` opens by warning that "`unknown` for something we built is as
wrong as `declared` for something we did not", and then did exactly that: it was
hand-written against Instagram and Threads, while X, YouTube and Bluesky all
implement `listComments` and were missing entirely. `read_comments` resolved to
`unknown` on three platforms that plainly have the code.

A test in `platform.test.ts` had `expect(adapterDeclares('x','read_comments')).toBe(false)`
— a snapshot of the omission, not an invariant, and the reason nobody noticed.
The test was wrong and the production code was right; it now asserts `true` and
says why it changed.

The structural fix is a test that derives the truth from the adapter objects:
`read_comments` is declared exactly when `listComments` is a function, for every
platform. Only actions that map to a method can be checked this way — `carousel`
and `alt_text` live inside `publish` and are invisible from outside — but
`read_comments` is the one the whole observation model (§65) rests on.

Redundant entries were dropped rather than added. `publish`, `carousel` and
`video` are already answered by `PlatformConstraints`, and repeating them here
would create a second place for them to disagree.

## 68. A score is a claim, so an unmeasured post gets none

`scorePerformance` joins `content_items` to `post_metrics` with a `left join
lateral` and read the result as `Number(row.impressions ?? 0)`. A published post
whose metrics had never been collected therefore arrived at the scorer as a
*measured zero*: it got a real score, a real percentile, and a row in
`performance_scores` indistinguishable from a post the platform had genuinely
reported nothing for. This is gotcha 9 — "a collection job running ≠ metrics
collected" — reached from the far end.

The damage is not one wrong score. `percentileRank` is computed over the cohort,
so **every fabricated zero moved the score of every measured post beside it**. One
uncollected post silently inflated every genuine score in the same run.

`ScoreInput.impressions` is now `number | null`, where null means unmeasured, and
`scorePosts` **excludes** those posts from the population and from its output.
Returning fewer rows than it was given is the correct shape of "nothing is
known": the caller writes no row, and the post has no score rather than a wrong
one. `performance_scores.score` is `not null`, so this needed no migration.

`unmeasured()` names what was dropped and the handler logs the count, because
"nothing published" and "published but never collected" produce an identical
empty table and only one of them is a broken collector.

A measured zero is still scored. `0` is an observation; `null` is not.

The engagement counts keep `?? 0`. They are only ever a numerator over measured
impressions, and a transport that reports impressions but not saves is a gap
`missingMetrics()` already names rather than a null/zero confusion.

## 69. A test that waits for a condition instead of creating it

`e2e/agents.spec.ts` asserted that *some* check on `/system` read `unknown`, to
hold the rule that an unmeasurable dimension is never reported as ok. It passed
on a fresh database and started failing the moment anything real had happened:
running the worker once left two heartbeat rows and thirteen finished jobs
behind, and from then on every check had a measurement.

The rule was intact; the test was red anyway — the least useful way for a test to
fail, and it had been red since the previous session's worker run rather than
because of any change.

It now creates the condition it asserts: it removes `worker_heartbeats` (a
last-seen cache the worker rewrites on its next tick), asserts the Worker check
reports `unknown` with the detail line that only the unknown branch emits, and
restores the rows in a `finally`. It also anchors on that detail rather than on a
DOM shape, so it names *which* check is unmeasured instead of hoping one is.

## 70. The only feedback loop in Halyard had never run

`loadHookHistory` supplies the one input by which an *observed outcome* changes a
*future generation decision*: measured performance per hook type, which
`scoreVariant` and `predictStopRate` read. Its query selected
`post_metrics.stop_rate` and joined on `post_metrics.content_item_id`.

**Neither column has ever existed.** `post_metrics` is keyed by `publication_id`
and has no stop-rate column. The query could not plan, let alone run — and
`.catch(() => ({ rows: [] }))` turned that into an empty array. The comment
directly above it explained the emptiness as "almost always empty today, because
nothing has published", which is exactly what a *working* query would also have
produced. The test covering it asserted `performance` was `[]` and passed.

Three separate things made a dead code path look healthy: a silent catch, a
plausible explanation for the symptom, and a test that asserted the symptom.

**What it measures now.** `video_views / impressions` — a **view-through rate**,
named as itself. Halyard collects no three-second retention because no platform
reports one to it, and `predictionBasis` used to tell the operator "average 3s
retention", which was a measurement claim nothing supported.

**Scoped by platform**, because platforms do not agree on what a view is:
Instagram counts at roughly three seconds, TikTok at almost none, YouTube at
thirty. One average across them is true nowhere. The scorer now refuses to use
any measurement when the platform is unknown, rather than taking the first row it
finds.

**One sample per publication**, taken from the latest metric row, because
`collect_metrics` polls a fresh publication five times on its decay schedule and
counting rows would have made one post look like five.

**Failures are logged.** A query that cannot run and an account with no history
produce the same empty array, and the test now asserts the *absence of a logged
failure* alongside the empty result. That distinction is the whole fix; without
it the same bug returns invisibly.

## 71. Gate 3 has never seen a frame

`sampleLuminance` runs `ffmpeg -vf "…,signalstats,metadata=print:file=-"` and read
the result from **stderr**. `file=-` means **stdout**. The regex ran over
ffmpeg's banner and matched nothing, on every platform, for the life of this
codebase — so `VideoProbe.frameLuminance` has always been `[]`.

The function's own comment says it is "how a composition that renders a black
gap gets caught". Every luminance rule in `runVisualQC` has therefore never run
on any render Halyard has produced, and `review_media` stored the visual gate as
`passed` with `examined: 0` beside it. A check that never happened, shown as one
that succeeded.

The mistake is understandable and worth naming: `measureLoudness`, twenty lines
below, genuinely does read stderr, because `loudnorm`'s JSON goes there. The
pattern was copied; the filter's output destination was not.

Both streams are searched now rather than swapping one guess for another — the
payload (`lavfi.signalstats.YAVG=`) is unambiguous and has nothing to collide
with. Separately, `review_media` now stores the visual gate as **`skipped`** when
no frames were sampled, which is the guard that would have made this visible
instead of green.

## 72. The retention gate had no caller, and could not answer its own question

`runRetentionQC` — 310 lines, 171 lines of tests — was reachable only from its
own test file. The same shape as `canStatePublicly` and `markOutputConsumed`
before it. Every video Halyard has rendered skipped it.

`review_media` is the right home and always was: retention is measured from the
finished file, and the inputs its opening and pattern-interrupt rules need are
already probed there for `visual`.

Two things had to be true before wiring it was worth anything.

**The rules it cannot run must be visible.** `review_media` has no OCR of frame 1
and no first-to-last similarity, so the thumbnail and loop rules cannot run.
`RetentionQCResult.unmeasured` names them, the summary says how many, and the
gate is stored as `warning` rather than `passed` while any are outstanding — the
rule `runAllGates` already learned: a skipped check is not a passed check.

**It must not answer a question its sampling cannot resolve.** `review_media`
samples twelve frames per sixty seconds; on a 32-second render that is one every
6.4 seconds, and a rule about the first *three* seconds cannot be answered from
it. Wired naively, the gate failed the real fixture render on a sampling
artefact. It now reports `retention.no_content_in_opening` as **unmeasured** when
the sample interval is coarser than the window, and answers it when it is not.

A gate that fails everything is worse than one that passes everything, because
the first is the one that gets switched off.

`probeVideo` also reports `fps` now, read from ffprobe's `r_frame_rate` rather
than defaulted to 30 — the opening window is defined in frames, so a 24fps render
was being judged against 3.75 seconds while the comment said three.

## 73. The retention opening rule cannot see Halyard's own content

§72 wired the retention gate up and reported `retention.no_content_in_opening` as
unmeasured, because `review_media` samples one frame every ~6 seconds and the
rule is about the first three. The obvious follow-up — sample the opening densely
and switch the rule on — was measured before being recommended, and it is wrong.

> **Corrected by §74.** The measurements in this entry were taken with
> `ffmpeg -t 6 -vf fps=2` and presented as the whole-video series `probeVideo`
> actually produces. They are not comparable, and the "every render would be
> rejected" conclusion below is false — one of four is affected. The
> *direction* of the finding survives (the mean is a poor signal for this
> content, and the range is better); the magnitude does not. Read §74 with it.

All four fixture renders are flat in mean luminance across their first six
seconds. The largest consecutive delta anywhere is **0.0039** normalised against a
`STATIC_DELTA_THRESHOLD` of `0.01`; most are exactly zero. Densely sampled, every
render Halyard produces would raise the rule, which is an **error**, and
`review_media` fails a content item on an errored gate. The pipeline would begin
rejecting its own output.

And the verdict would be false. `firstSubstantiveSecond` uses mean-frame
luminance as its proxy for motion, and Halyard's visual style is a light card
with a small region of changing text — swapping every word barely moves the frame
mean. The videos may open on content and change throughout; the metric cannot
tell.

**So the deficiency is the signal, not the sample rate.** Reporting the rule as
unmeasured is correct for a second and stronger reason than the one §72 recorded,
and it is recorded here so the "cheap win" is not attempted again.

What would actually work: regional frame differencing, or the per-frame
`visibleText` the vision describer already returns into `media_observations` —
which answers "did the words change" directly, and costs nothing extra because
the frames are already described.

Measuring the consequence of a change before recommending it took one ffmpeg pass
over four files. It reversed the recommendation.

## 74. Measuring the wrong thing, and what it cost

§73 concluded that mean-frame luminance cannot see Halyard's content and used a
table of measurements to prove it. **The table was measured wrong.** It came from
`ffmpeg -t 6 -vf fps=2` — the first six seconds at two frames a second — and was
presented as the whole-video series that `probeVideo` actually produces
(`fps=12/60`, roughly one sample every five seconds). Re-measured through
`probeVideo` itself, the real series is different, and the conclusion drawn from
the bad one — "every render over twenty seconds was about to be rejected" — is
false.

The real verdicts, all four fixture renders, through the production path:

| Render | mean signal | tonal-range signal |
|---|---|---|
| ChefNoteCard (16s) | clean | clean |
| ScalingMath (24s) | `no_pattern_interrupt` | `no_pattern_interrupt` |
| SubstitutionExplainer (32s) | clean | clean |
| TransformationDiff (28s) | clean | clean |

Three corrections follow.

**The range signal is still the right one, for a smaller reason than claimed.**
It does not change any verdict here. What it changes is the margin: on
SubstitutionExplainer the mean clears the 0.01 threshold by 0.0108 and 0.0051,
while the range clears it by 0.284 and 0.355. The mean is passing by luck on a
card design one shade away from tipping it. `frameContentRange` is parsed from
YMIN/YMAX in the *same* `signalstats` output already being read for YAVG, so the
better signal costs nothing.

**`ScalingMath` genuinely is static for twenty-four seconds.** Range deltas
`[0.0000 0.0039 0.0000 0.0000]`. The rule is right; the template is the problem.

**§72 did introduce a regression, narrower than the bad measurement suggested and
real all the same.** `retention.no_pattern_interrupt` is an error,
`review_media` fails a content item on an errored gate, and this gate had no
caller at all before §72 — so one real template began failing QC on a rule
nothing had ever run. The gate now records its findings at `warning` and never
`failed`. That is not a softened rule: the finding, its severity and its detail
are all stored. What is deferred is whether it *blocks*, which `DECISIONS.md` §62
already declined to decide for exactly these media gates.

The lesson is narrower than "measure first", which §73 already said and which I
did. It is: **measure through the path the code actually takes.** An ad-hoc
command that looks like the production one is a different experiment, and it will
answer confidently.

## 75. Parseable is not well-formed

`extractJson<T>` is an unchecked cast. It proves a model's reply is JSON; it
proves nothing about the shape. Every caller then reads it as though the type
were real, and the pattern `(parsed.things ?? []).map(...)` throws
`map is not a function` the moment a model answers with a bare string where a
list was asked for.

In `copywriter.writeDraft` that was live: `{"hashtags": "glutenfree"}` parses
cleanly, then throws **outside** the `try` that wraps the parse — so the one
malformed answer the retry loop could not see took the whole generate job down
instead of converging. A tamper test reproduces it exactly.

Two answers, because the right one depends on the caller:

- **Where a retry loop exists, converge.** `describeShapeProblem` names the
  offending field and the loop asks again with that as feedback — the same path
  invalid JSON already took. A model that returned the wrong shape probably got
  other things wrong too, so retrying beats coercing.
- **Where there is none, degrade.** `asArray` / `asString` in `generation/llm.ts`,
  for auxiliary fields where losing the caveats beats losing the response.

`asString` also fixed a guard that was wrong in a quieter way: `if (!parsed.body)
throw` is false for every non-zero number, so `{"body": 42}` cleared it and threw
on `.trim()` one line later.

**Deliberately not zod**, which is a dependency of `packages/core` and is used by
nothing. Introducing it here would add a second validation idiom for a one-line
problem, and the callers that need real validation — `parseProposals` in the
Product Brain, the QC gates after the copywriter — already do it
deterministically at the point of use, which is stronger than a schema because it
encodes what the value is *for*.

Provider responses were checked too and left alone: the adapters cast
`response.data ?? []` the same way, but they sit behind `platformFetch` and, for
comments, inside the observation-recording try that already normalises a failure.
The distinction is that a provider has a contract and a model does not.

## 76. An RLS test that could not run, and one that could not fail

The only RLS assertion exercised through a real unprivileged connection —
`set role halyard_rls_probe` — has been failing on every local run against
Supabase, whose `postgres` role has `CREATEROLE` but may not `SET ROLE` into a
role it just created. Reproducible with plain `psql`; no Halyard code involved.
CI uses a stock Postgres image where it passes.

A suite that is permanently red is a suite nobody reads, and that is its own
hazard. The probe now checks whether the database permits `SET ROLE` at all and
says so out loud when it does not — but it **fails rather than skips** wherever
it can run, so a genuine permission regression is still caught.

Skipping is only tolerable because the same invariant is asserted from the
catalog by a second test that runs everywhere. Which raised the more interesting
problem: **that test could not fail for the right reason.** It selected only
violating tables and asserted the result was empty, so a broken join, a renamed
schema or an unmigrated database all returned `[]` and passed. Examining nothing
is not a pass — the same rule the QC gates follow — so it now counts the tables
first and requires more than fifty before the emptiness means anything.

Worth recording that the first attempt at this added a *third* RLS test that
duplicated the catalog one outright. The tamper check caught it: disabling
`force row level security` on `jobs` failed two tests with identical messages.
Duplicated coverage reads as thoroughness and is the opposite — two places to
update, and neither one obviously canonical.

## 77. Ask Postgres whether the query is real

`loadHookHistory` (§70) selected two columns that have never existed. It could
not plan, let alone run. A `.catch()` made the failure look like an empty
result, a plausible comment explained the emptiness, and a test asserted it. The
query was wrong from the day it was written and nothing in the repository could
see it.

Nothing in the repository *could*: a unit test never exercises the path without a
database, and a schema test passes because the schema is fine. The only thing
that can tell you is Postgres.

`sqlValid.test.ts` extracts every SQL string literal in `apps/`, `packages/core`
and `scripts` and runs `PREPARE` on each against a freshly migrated database.
`PREPARE` parses, resolves every identifier and plans the statement **without
executing it** — so a missing column is a hard error and a `delete from` is
still harmless. 394 statements, planned in under a second.

Verified two ways rather than asserted. The suite contains the historical query
verbatim and requires it to fail with `42703 undefined_column`; and
reintroducing the bug into `apps/worker/src/hooks.ts` makes the check report
`apps/worker/src/hooks.ts:105 [42703] column m.stop_rate does not exist`.

**What it does not cover, stated rather than implied.** Ten statements are built
with `${}` interpolation and cannot be planned without inventing the missing
text — inventing it would validate a statement nothing runs. They are in
`queries.ts`, `brainQueries.ts`, two server actions, `attribution.ts` and
`verify-hosted.ts`. It also proves only that a statement *can* run, never that it
returns the right thing, which is the same distinction the capability model draws
between declared and verified.

The count is asserted before anything else — an extractor whose regex stopped
matching would otherwise report a clean sweep of zero statements, which is the
trap §76 was about.

## 78. The adaptation cache and its spend ceiling were never built

`connectors/artifactCache.ts` is a complete, carefully-reasoned module: a request
cache keyed by a canonicalised spec, a 14-day TTL, a `RateLimitExceeded` error,
and a documented ceiling of "twenty adaptations an hour, hard. This is the
operator's money."

None of it is in force. `withArtifactCache` has **no caller** — the only
reference in the repository is the barrel export. `ArtifactStore` has **no
implementation**. There is **no `artifact_cache` table** in any migration. And
both real call sites, `generate.ts:309` and `campaignSlot.ts:145`, call
`connector.generateSample()` directly.

So a RecipeFix adaptation — 26 seconds and one real credit — is uncached and
unbounded by anything in this file.

**The exposure, measured rather than alarmed about.** One credit per selected
idea per generate attempt. Normal operation is bounded by the cadence ceilings
(`DEFAULT_CADENCE`: 5 video, 5 carousel, 7 image a week), so the steady-state
cost is tens of credits a week, not the hundreds an unbounded loop implies. The
sharp edge is narrower and real: `JOB_POLICY.generate` allows **two attempts**,
nothing dedupes between them, so a generate job that fails after adapting
re-spends the credit for the same idea on retry.

**Not wired tonight, and that is a decision rather than an omission.** Finishing
it needs three things that are not engineering judgement: a table (schema), an
`ArtifactStore` implementation, and switching on a hard limit that would begin
*blocking* generation at a ceiling. The last is the same class of question as
§74's retention severity — a live behavioural change with product consequences.
Recorded under "Needs a human" instead.

Worth noting how it was found. The Auditor tracks orphaned **agents** and would
never have seen this, because a cache is not an agent. A scan of every exported
function in `packages/core` against its non-test callers surfaced it, alongside
26 others — most of them legitimate internal helpers exported for testability.
The signal is not "no caller" on its own; it is "no caller" on something
capability-sized. `runRetentionQC` (§72) was the same shape.

## 79. The queue could not hear "do not retry"

`publishFailurePolicy` has decided this since milestone 40. It returns
`retry: false` for an auth failure ("do not retry blindly against a dead
token"), for a duplicate abort, and for a malformed response whose own note
reads **"never retried — that double-posts"**.

`publish.ts` read that policy, acted on it for the content item and the account,
and then threw a plain `Error`. `Poller.fail()` had no way to hear it, so it
retried the job on backoff regardless. For `malformed_response` — where the post
may already be live — the only thing preventing the second write its policy
warns about was the idempotency index.

`PermanentJobFailure` is the channel that was missing. The decision stays where
it already lived; this is how it reaches the queue. Deliberately a marker on the
error rather than a return value: a handler signals permanence by *how* it
fails, which is how it signals everything else, and every existing handler keeps
working untouched.

Applied only where the policy already said so — the three `retry: false` cases
and the missing-credential guard from §66, where no number of retries stores a
credential. `DuplicatePublishAbort` now extends it and is still its own type, so
existing catches are unaffected. An ordinary error still takes its full
allowance, and a test pins that: the guard against this becoming a shortcut for
a flaky provider is that opting out requires knowing repetition cannot help.

## 80. Webhook ownership was never a decision to make

`PLATFORM_COVERAGE.md` §9 recorded "choosing between web-tier and worker
ingestion is a real architectural decision rather than an implementation
detail". It is not. **The worker has no HTTP surface at all** — no `listen`, no
`createServer`, no framework; it is a poller and a scheduler process. Only the
web tier is reachable over HTTPS, so only the web tier can receive a callback.
Reading the code answered a question that had been recorded as needing a person.

`/api/webhooks/meta` follows the pattern `/api/cron/[task]` already established:
authenticate, enqueue, return quickly.

**The webhook is a trigger, not a source of truth.** It writes no comments,
metrics or anything else from the payload. It resolves which publication a
notification concerns and enqueues `collect_comments`, which reads through the
adapter — the path that already records an account-scoped observation (§65) and
dedupes on `(publication_id, platform_comment_id)`. A payload asserts that
something happened; Halyard's evidence model requires that it went and looked.
Trusting the payload would put provider-shaped rows into `comments` with no
verified read behind them.

**No new job kind, so no migration.** `collect_comments` already exists, is
already scheduled on a decay curve, and already does exactly this work.

**Fail closed on both verbs.** No `META_WEBHOOK_VERIFY_TOKEN` and the handshake
is refused — completing it would attach a subscription to an endpoint that can
verify nothing afterwards. No `META_APP_SECRET` and POST is refused; an
unverified POST is an unauthenticated write path into the job queue. Only
publications this install actually made are matched, so a notification about
foreign media cannot drive an unbounded read.

**What is verified and what is not.** The handshake, the HMAC over the raw bytes
(read with `request.text()`, because parsing and re-serialising changes them),
the payload parsing against thirteen malformed shapes, and the refusal paths
through the real HTTP route — all tested. That Meta actually calls it is a portal
action and remains **externally blocked**; nothing here claims otherwise.

## 81. A table nothing writes, and a cron that purges nothing

`platform_requests` has one reference in the entire codebase:

    apps/web/src/app/api/cron/[task]/route.ts:98
    delete from platform_requests where purge_after < now() returning id

Nothing writes it. Nothing else reads it. It has two indexes, an RLS policy, a
seven-day `purge_after` default, and a scheduled cron that has been deleting
from an always-empty table and reporting `{ purged: 0 }` — an
empty-state-as-success at the infrastructure layer. `REQUEST_LOG_RETENTION_DAYS`
in `adapters/dryRun.ts` encodes the same seven days and is likewise unused.

**Not implemented, and the reason is not effort.** `request_body` and
`response_body` are `jsonb` columns on a table designed to record every platform
call — which includes OAuth token exchanges. What may be written there is a
secret-handling decision, not an engineering one, and the module that would do
the redacting (`redactHeaders`) currently only ever sees dry-run traffic. Wiring
a live request log without settling redaction first would be the worst possible
order.

Recorded under "Needs a human" with that framing: the question is *what may be
logged*, not whether to log.

**A correction to how this was found.** The scan that surfaced §78 also flagged
`createDryRunFetch` and `redactHeaders` as callerless. They are not — both are
used inside `dryRun.ts` by `dryRunPublish`, which `scripts/first-contact.ts`
calls. The scan excluded same-file references, so every internal helper looked
like an orphan. Of 27 flagged, most were that. The signal was never "no caller";
it was "no caller **and** capability-sized", and only a human read separates
them. Worth knowing before the list is trusted again.

## 82. A third platform list, already wrong

`packages/db` exported `PLATFORMS` and `Platform`, listing six platforms. Both
`PlatformId` in `@halyard/core` and `social_accounts_platform_check` in the
database list **seven** — `bluesky` has an adapter, a constraint entry, metric
mappings and a connect flow. Anything reaching for "the platforms" from
`@halyard/db` would have been handed a list that silently omitted a connected
platform.

Nothing imported them, which is the only reason the drift cost nothing yet.

Deleted rather than corrected. Gotcha 1 in `CLAUDE.md` is about exactly this
shape — `JOB_KINDS` and `jobs_kind_check` are one list written twice, and it cost
three migrations — and the fix for a list written twice is not to write it a
third time. `PlatformId` is canonical; `packages/db` cannot import it without
inverting the dependency.

`apps/worker/src/platformParity.test.ts` is what was missing: it asserts the
adapters and the constraint hold the same set, in both directions, and does it by
**inserting** rather than by comparing constraint text — a constraint that parses
correctly and is not enforced would satisfy a text comparison and nothing else.
It lives beside `handlerCoverage.test.ts` for the same reason, and needs both
`packages/core` and the schema, which is why it cannot live in `packages/db`.

## 83. The observation layer observes almost nothing, and could not be switched on

The Social Intelligence architecture's OBSERVE layer calls for posts, replies,
mentions, profiles, relationships, engagement, topics, search, trends and
competitor activity. Traced through the code, here is what exists:

| Source | Reads | Rows |
|---|---|---|
| `watch_hits` | reddit, rss, pinterest | 0 |
| `comments` | own publications only — keyed by `publication_id` | 0 |
| `signals` | derived from `watch_hits` recurrence | 0 |
| `finds` | **human paste**, not discovery | 0 |

**No adapter reads third-party content on any social platform.** Every adapter's
only read is `listComments`, scoped to Halyard's own publications, and `comments`
is keyed by `publication_id` — it structurally cannot hold a comment on someone
else's post. There is no mention, search, profile, relationship or trend read
anywhere. Bluesky's "mentions" is a comment about rich-text facets.

**The binding constraint is not the sources.** `watch_terms` had **no UI, no
server action and no API route** — nothing in the product could create one. The
`collect_watch_terms` job has been scheduled daily per product since milestone
41, reading an empty table every day. The same missing-ignition shape as
`explore_product` before P1 and `verify-provider` before P2.

That is now fixed on the Finds page: create a term, choose its sources, set the
recurrence threshold, disable it, or collect on demand. Disabling rather than
deleting, because `watch_hits` references the term and thirty days of recurrence
is the only thing that makes a signal mean anything.

**`watch_hits` already is the normalized observation model** the architecture
asks for — source, url, author, engagement, `posted_at`, dedupe, product scope,
promotion to `signals`. It does not need a new table; it needs social sources,
and those are blocked per platform rather than uniformly:

| Platform | Third-party read | Status |
|---|---|---|
| Reddit / RSS / Pinterest | implemented | reachable now |
| X | search needs a paid tier | **blocked_external** — credits |
| Instagram / Threads | hashtag search needs App Review | **blocked_external** |
| Bluesky | free public search API | **actionable, not built** |

Bluesky is the only social platform where observation is achievable today. It is
recorded rather than built: RecipeFix has no Bluesky account, so a source feeding
a pipeline for an unconnected platform would be built on speculation.

## 84. RECOMMEND was not the missing link — nothing produced ideas at all

The previous checkpoint concluded that RECOMMEND/opportunity modelling was "the
first genuinely unbuilt link". Tracing execution paths rather than trusting that,
the break is two steps earlier and much larger.

| Table | Written by | Read by | Rows |
|---|---|---|---|
| `signals` | `collect_watch_terms` | **nothing** | 0 |
| `ideas` | **`supabase/seed-demo.sql`** | `generate` | 0 |

`ideas` is the entry point of the entire generation pipeline. Its only writer in
the repository was a **demo seed file** — not a handler, not a route, not a
server action. So `generate` ran on its schedule, found nothing proposed, logged
"no proposed ideas to draft" and returned. Every day. The agent registry had said
so all along: *"Ideas are currently scored but never generated by a model."*

Building opportunity modelling on top of that would have been roofing a house
with no walls. Answering the audit questions directly: there is no opportunity
model, no opportunity scoring, no recommendation model, and no agent for either —
they are documentation only. `scoreIdeas` scores *ideas*, not opportunities.

**What was built instead.** `proposeIdeas` in `generation/ideaGenerator.ts` — the
caller `buildIdeaGeneratorPrompt` never had. It reads unconsumed `signals`, the
product brief, the voice, the real `brand_voices.mix_targets` and recent titles;
it proposes; and `proposeFromSignals` in `generate.ts` writes them as
`status = 'proposed'` with `ideas.source_signals` carrying the signal ids. That
column already existed, designed for exactly this.

**A model here, deliberately.** Turning "asked nine times" into "here is an angle
worth writing" is *writing*. The deciding stays deterministic: `scoreIdeas`
weighs mix debt and novelty, `selectIdeas` applies hard caps, the QC gates judge
the draft. A template that manufactured angles would be a second, worse idea
pipeline.

**Provenance is what was in the prompt, not what the model claims.** Asking a
model which of its inputs it used yields a confident answer and no evidence, so
the recorded ids are the ones that were actually in front of it — asserted by a
test that feeds a model claiming a different signal.

**No proposal without a signal, and therefore no spend.** The first version
called the model whenever no ideas were proposed, which is the *normal* state of
an idle product — a strategy-model call every day forever, reasoning about a
content mix with no new observation behind it. An existing calibration test
caught it by failing with a live `OpenAI 429`. It now returns having spent
nothing when there is no unconsumed signal. Signals are marked `consumed_at`
either way, so one unusable signal cannot re-spend on every future run.

**`topPerformers` is empty and says so.** `performance_scores` has no rows
because nothing has published. Supplying a fabricated top performer would put an
invented claim into the prompt that writes the next sixty days of content.

**Status: `implemented_partial`, not exercised.** No live model call has ever
been made — there are no credits. The registry entry was updated, and the Auditor
caught the divergence before anyone did: it reported `idea-generator` had left
the orphan list while the declaration still said `implemented_no_caller`. That is
the Auditor doing the job it exists for.

## 85. Operator evidence is `editorial` with a marked collector, not a new source

`signals` had one writer. An operator's find could become a single post through
`draftFind` and could never become *evidence*, so the idea generator (§84) only
ever saw recurring questions from watch terms.

`promoteFindToSignal` closes that. A find with the operator's reason becomes a
signal; a bare URL does not — the same gate `draftFind` already applies, because
without the reason there is nothing to say and a bare link would reach the idea
generator as though somebody had vouched for it.

**Two dead things were removed on the way.** `addFind` enqueued
`collect_signals` carrying `{ summariseFindUrl }`, and **nothing has ever read
that payload** — `collect_signals` fetches RSS feeds, which is why `finds.title`
and `finds.summary` are null on every row. The job did unrelated work on a
schedule that already runs every six hours. Separately, the insert used
`on conflict do nothing`, so pasting a URL and adding the reason afterwards —
the normal way this gets used — silently discarded the reason, leaving a find
that could never be drafted from.

**The source vocabulary is closed, and a real-database test is what found that.**
`signals_source_check` allows exactly `product_activity`, `changelog`,
`editorial`, `seasonal`, `trend`, `performance`, `submission`. The first draft
wrote `source = 'operator_find'` and was rejected on insert. A mocked test would
have accepted it and shipped.

So the source is `editorial` and the distinction lives in `raw.collectedBy =
'operator'`, where it is explicit and queryable. `watch.ts` writes no
`collectedBy`, so its absence reads as "not operator-supplied" rather than as a
missing field.

**Alternative considered:** extend `signals_source_check` with a new value. That
is a migration plus a vocabulary written in TypeScript and SQL at once — gotcha
1's exact shape — for a distinction `raw` already expresses. Rejected. If a
consumer ever needs to filter by collection method at the *source* level rather
than inside the payload, that is when the migration earns itself.

**Relevance is null, not a number.** `watch.ts` derives relevance from how often
a question recurred. A find has recurred once by definition, and inventing a
score would be a measurement claim with nothing behind it.

**Deduplication reuses the existing semantic**: a `not exists` guard on
`raw ->> 'findId'` over thirty days, exactly as `watch.ts` guards on
`raw ->> 'questionKey'`.

**The query is injected**, like `refreshDueTokens` and `disconnectAccount`, so
the test drives the real statement against a real Postgres. An earlier draft
re-typed the SQL into the test, which proves the copy works and nothing about
what runs.

## 86. The learning edge existed as a type and was never connected

`IdeaCandidate.historicalConversion` — "mean conversion of similar past
content" — has been part of the scorer since it was written, and `generate`
built its candidates without it. Every idea therefore scored on
`historicalConversion ?? 0.5`, whose comment reads "at cold start there is no
learning; 0.5 is the honest neutral".

It is the honest neutral, and it was going to stay 0.5 forever. Nothing would
have supplied it after the first publication either — the difference between a
cold start and an edge that never connects is invisible from inside the scorer,
because both look like 0.5.

`generate` now reads mean `conversion_score` per category from
`performance_scores` joined to `content_items`, and supplies it. **This changes
nothing today**: no rows, empty map, `undefined` on every candidate, neutral
still applied. That is the point — the edge is connected before the data
arrives, rather than being remembered afterwards.

Per category, not per idea, because that is the grain the field asks for and a
single post's score is noise at these volumes. `undefined` rather than `0` for
an unmeasured category: a zero is a *measured* failure and would bury every
category that has not published yet.

## 87. Paying twice for the same evidence, and the order that prevents it

`proposeFromSignals` ran: call the model → insert the ideas → mark the signals
consumed. If the insert threw — a constraint, a dropped connection — the signals
stayed unconsumed, `JOB_POLICY.generate` retried the job, and **the same signals
went to the model again and were paid for twice.**

That is exactly the duplicate-spend case an artifact cache was proposed for
(§78), and it needs no cache and no schema. It needs the right order: signals are
consumed the moment the money is spent, before anything is persisted.

**The trade is deliberate and asymmetric.** If persistence now fails, the
proposals are lost and the signals are still consumed. Losing an idea is
recoverable — a question that genuinely matters recurs, and
`collect_watch_terms` raises it again, which is what measuring recurrence over
thirty days is *for*. A spent credit does not come back.

Verified by fault injection at the real boundary: `proposeFromSignals` is given a
pool whose `insert into ideas` fails, and the test asserts the signals are
consumed, the model was called once, and a retry calls it zero more times.
Restoring the old ordering fails that test.

**This does not close §78.** The RecipeFix adaptation cache and its hourly spend
ceiling are still unbuilt, and still need a table and a policy decision. What is
closed is the one duplicate-spend path that existed in the new code, using
ordering rather than infrastructure.

## 88. Prompt input Halyard did not write

`buildIdeaGeneratorPrompt` interpolated signal summaries and past titles at full
length. A signal summary is assembled from a Reddit post title, or from the
sentence an operator typed into `/finds` — **neither is length-bounded at the
source**, and both land verbatim in a prompt paid for by the token. Twenty
signals of unbounded length is an input-cost explosion driven by whatever
somebody else wrote.

Capped at 300 characters per signal and 160 per title, the same reasoning that
already capped `productBrief` at 2,500. Truncated rather than dropped: a long
signal is still a real signal, and the first 300 characters of a question carry
the question. A test drives the builder with 20 signals of 2,000 characters each
and asserts the result stays under 30,000.

## 89. The execution proof, written before the run that proves it

X credits are unavailable, so the first genuine publication has not happened.
When it does it will be **one controlled post**, and it has to yield the whole
evidence chain in that single run — there is no second cheap attempt.

Rehearsal 6 is that chain, as an executable specification against the real
handler and a real database. One publication must leave behind: the provider's
post id, a `published_at`, the provider's reply kept verbatim in `raw_response`,
`needs_reconciliation` false, `publish_mode = 'direct'`, the account it was
routed to, a `content_items` row that agrees, and — the link that matters most —
a queued `collect_metrics` and `collect_comments` keyed on the publication id.

Without those last two the first real post produces no metrics and no comments,
and the entire learning half of the system stays empty **while looking like it
published successfully**. Disabling the enqueue fails the rehearsal.

The paired case is the 402 that actually happened on 2026-08-19: a refused
publication must enqueue nothing. Otherwise Halyard polls for metrics on a post
that does not exist, and an empty result there is indistinguishable from a post
nobody engaged with.

**This is a fixture, and it is not provider evidence.** Nothing here promotes X
publishing past `implemented`. What it buys is that every link is pinned now, so
a live run that deviates is immediately legible instead of being interpreted
after the fact.

An earlier draft of this rehearsal asserted the dedupe keys against a helper that
returned `''`, and `includes('')` is true of every string. It now asserts the
real publication id and that the id looks like one.

## 90. Approval did not survive an edit — it just didn't know that

`editItem` updated the body and **never touched `status`**. So an operator could
approve an item, edit the words, and the publish job already sitting in the queue
would send text **nobody approved**. The approval gate was never bypassed; it was
simply answered about a different post.

An edit now withdraws the approval: `approved` and `scheduled` demote to
`pending_approval` and `approved_at` is cleared. That also neutralises the queued
job without hunting for it — `publishHandler` returns at
`if (!['approved','scheduled','publishing'].includes(item.status))` before any
account lookup or network call — so re-approval is what re-arms it, which is the
correct sequence.

Editing a `publishing` or `published` item is refused outright. `publishing`
means a worker holds the claim and already read the body it is sending;
`published` means the platform has it. An edit in either case desynchronises
Halyard's record from what exists, which is worse than refusing.

**No versioning mechanism.** The existing status machine already expresses "a
human has not signed off on this", and a generalised approval-version system
would be a second way to say the same thing.

## 91. `pending_auth` published if it happened to hold a token

`publishHandler` refused `disabled` and `error`, diverted `draft_only`, and
checked for a missing credential. **`pending_auth` with a token fell straight
through and published.**

That is not hypothetical. `confirmConnection` writes the account as
`pending_auth` **with the sealed token** and only then runs `verifyCapabilities`
to move it on — so there is a real window in which an account holds a working
credential and has been verified for nothing.

Every other part of the system already said so: `resolveCapability` returns
`auth_required` for this state, and `accountStatus` reports it as not connected.
The publisher was the only component that disagreed, and it is the only one whose
disagreement reaches a platform. It now refuses, permanently — no retry resolves
an unauthenticated account.

Found by the adversarial suite, not by the individual gate tests, which is the
argument for having one: each gate was correct in isolation and the boundary had
a hole between them.

## 92. The adversarial approval-boundary suite

`apps/worker/src/approvalBoundary.test.ts` — nineteen tests that drive the real
`publishHandler` against a real Postgres and count outbound requests. A publish
that happens is the failure.

It attacks: five unapproved statuses; withdrawn approval; `pending_auth`,
`error`, `disabled`; `draft_only` escalation; an account degrading between
approval and execution; the kill switch before and during; routing redirection
via the job payload; cross-persona routing at the database constraint; permanent
failure on a missing credential; duplicate protection under manual re-enqueue and
under concurrency.

Two of those found real defects (§90, §91). The rest passed, which is worth
recording: the individual gates were right, and the value of the suite is that it
asks whether any *combination* of a valid token, a granted scope, a working
adapter and a QC-passed item can reach a provider without a human. It cannot.

## 93. Stills reached a platform with no gate having looked at them

Slice 5 asked whether the media path had §90's stale-verdict shape. It does not,
and what it has instead is worse.

`review_media` selected assets **through `renders` only**, examined the video,
and returned early when it found none — behind this comment:

> Images are covered by the existing visual gate at draft time.

**They are not.** No caller supplies `visual` to `runAllGates` — all four pass
`copy` and sometimes `claims` — which is precisely what the Auditor's
`gate.input_never_supplied` has been reporting all along. The comment pointed at
a gate that has never run.

Meanwhile `publish` sends `render_ids` **and** `attached_asset_ids`. So an image
the operator attached from the library reached a platform with **no gate of any
kind having examined it**, and an image-only item got no `visual` row at all —
which reads as "nothing wrong" rather than "nothing looked at".

`reviewStills` closes it. It builds a `MediaProbe` from `assets.width`/`height`
— already stored, no file downloaded — and runs the existing `runVisualQC`
against the platform's aspect ratio, passing the other stills as
`carouselSiblings` so the consistency rule can compare. An asset with no
recorded dimensions is reported as **unexamined**, never as passed, and drops
the gate to `warning`; the same rule §72 applied to retention.

**And the verdict is now recomputed when the media changes.** `attachAsset` and
`detachAsset` re-enqueue `review_media`. This *is* the §90 shape — the gate was
never bypassed, it was answered about a different set of files — but the repair
is re-examination rather than demotion, because the stills gate is cheap: it
reads two integers off a row. The dedupe key is only unique while a job is
queued or running, so a second attachment after the first review completes
enqueues a fresh one.

**Severity is unchanged and remains an operator decision** (§62, §74). A failing
still fails the item exactly as a failing render already did; nothing new blocks,
and nothing previously blocking was loosened.

## 94. The same gap, one branch over

§93 examined attached stills only in the **no-video** branch. `attached` was
loaded and then ignored when a render existed — so an item with a rendered video
*and* an operator-attached image examined the video and published the image with
no gate having looked at it. Exactly the defect §93 closed, reintroduced by the
shape of the fix.

`examineStills` is now shared by both paths, and the video branch folds the
result into the same `visual` gate: `examined` counts frames **plus** measured
stills, an unexamined still downgrades the gate to `warning` even when the video
passes cleanly, and a still with an error fails it.

Worth recording as a pattern rather than an incident. Both §93 and this were the
same mistake — a check placed on one side of a branch that both sides need — and
the second was made while fixing the first. The tell is a value loaded before a
branch and used inside only one of them.

## 95. PENDING OPERATOR DECISION — `visual`/`audio` on `runAllGates`

The Auditor's one remaining error, `gate.input_never_supplied`, is unchanged and
is **not** being resolved unilaterally. §62 decided to keep these inputs; that
decision stands until the operator revisits it.

**What has changed since §62.** §93/§94 established that the media measurements
genuinely happen where their inputs exist — `review_media` for renders and
attached stills, `tts` for audio — and that the comment claiming stills were
"covered by the existing visual gate at draft time" was false. So the inputs on
`runAllGates` are not a placeholder for an unbuilt measurement; the measurement
exists elsewhere.

**Option A — remove `visual`/`audio` from `runAllGates`.** `runAllGates` runs at
copy time, when no media exists, so no caller *can* supply them. Removing them
stops the aggregate from implying media coverage it cannot have. Reverses §62.

**Option B — retain them and require callers to declare `requires`.** The
mechanism already exists and is tested; an undeclared, unprovided input then
produces an honest non-pass instead of a silent pass. Preserves §62's future
unification. Costs a decision about *which* items must carry media QC before
approval, which is the quality-system policy question §62 declined.

**Recommendation: A**, because the second stage now demonstrably measures these
dimensions and a second place to express the same verdict is what allows them to
disagree. **Not taken.** Either option is safe today: media QC failures already
fail the item in `review_media`, so nothing currently publishes on the strength
of this gap.

## 96. A credential the redactor could not see

Auditing the logging paths before proposing any policy, as instructed. The
finding is not about `platform_requests` — that table still has no writer (§81).

**What actually persists text that could carry a credential:** `jobs.last_error`
(2,000 chars), `social_accounts.last_error` (500, rendered on `/accounts`),
`publications.error`, `notifications.body`, and every Sentry event. `agent_runs`
stores `input_ref`/`output_ref` — references, not payloads — which is a
deliberately narrow design and holds up.

**The gap.** `scrubEvent`/`scrubString` is a real primitive and is live in
Sentry's `beforeSend`. But `SENSITIVE_KEY` inspects **object keys**, and the
value patterns match credentials with a recognisable shape — `Bearer …`, a JWT,
`sk-…`, a Postgres URL. **None of them sees `?access_token=EAAGm0PX…`**, and the
Instagram adapter puts exactly that in the URL of every GET it makes, because
Meta's Graph API takes the token as a query parameter rather than a header. A
Meta token is a long opaque string with no prefix, so nothing matched it.

Reachable via any error whose message or cause quotes the URL — undici does this
— which then goes to Sentry in the clear and, before this change, into
`jobs.last_error` too.

**Two fixes, both reusing the existing primitive rather than adding another.**
`scrubString` now redacts credential-bearing **query parameters by name**
(`access_token`, `client_secret`, `code`, `code_verifier`, `signature`, …),
because the value is by definition unrecognisable. And `scrubString` is now
applied at the **database** boundary — `Poller.fail`, the account error write,
the publication error write — not only on the way to Sentry.

The parameter name is kept (`access_token=[redacted]`) so the row stays
diagnostic, and `state=` is deliberately left alone: over-redacting a log costs
debuggability, under-redacting it costs a credential.

**Nothing had leaked.** Nine stored job errors, zero matching a credential shape.
This closes the boundary before it mattered rather than after.

**No policy invented.** Retention (7 days for `platform_requests`, indefinite for
`jobs.last_error`) and whether request/response bodies may ever be persisted
remain open and are recorded as operator decisions — this slice changed what may
appear in a log, not how long logs are kept.

## 97. A flake that was gotcha 7, again

`daily-path.spec.ts` — "rejecting with a reason stores it as a negative
example" — failed once in a full run and passed in isolation. Not caused by the
redaction work; a pre-existing race.

`rejectItem` writes `status = 'rejected'` first and appends to
`brand_voices.anti_examples` in a **later statement of the same server action**.
The test polled until the status changed, then read `anti_examples` immediately —
so it read while the append was still in flight. It passed on an idle machine and
failed under load.

This is gotcha 7 in `CLAUDE.md` verbatim: poll for the value the assertion
actually needs, not for an earlier one that happens to arrive first. The poll now
targets the anti-example.

Recorded because the gotcha has now cost time three times, and each instance
looked like a different problem — a flaky test, a slow machine, an unrelated
change. The tell is a poll on one value followed by a bare read of another
written by the same action.

## 98. PENDING OPERATOR DECISION — two Meta scopes reach no code, not one

The permission-to-code-path audit mapped every Graph endpoint
`instagram.ts` calls to the scope it exercises. Ten endpoints, five scopes
covered. Full table in `PLATFORM_COVERAGE.md` §9.

**`pages_read_engagement` has exactly the same status as `business_management`**
— requested at `oauth.ts:129`, granted on 2026-08-19, and referenced by nothing
else in the repository. It had never been flagged; the previous version of §9
named only `business_management`. Two scopes, one noticed.

**What the successful live connection proves, and does not.** Connection,
identity resolution and the self-test succeeded with **all seven scopes
granted**. That demonstrates the flow works and isolates nothing about which
scopes were necessary, because none was withheld. This is `granted` being
mistaken for `exercised` — the distinction the whole capability model exists to
hold — and the earlier §9 wording ("succeeded without any code path exercising
it") was right about `business_management` and silently incomplete.

**What this repository cannot establish.** Whether Meta's `/me/accounts` requires
`pages_read_engagement` in practice is a provider fact. Meta has moved Page-read
requirements between API versions, and no amount of reading this codebase settles
it.

**The experiment that would.** Reconnect `@recipe.fix` with the scope withheld
and observe whether `/me/accounts` still returns the `instagram_business_account`
edge. That is one OAuth round trip, costs nothing, and needs no App Review — but
it is an operator action against a live account, and a failed reconnect leaves
the account needing another.

**Recommendation: remove both**, on the evidence that no code path reaches
either. **Neither removed.** Changing a requested scope has App Review
consequences and is not a decision to infer.

**Made durable rather than only written down.** `metaScopes.test.ts` asserts every
requested scope either maps to a call site that still exists in `instagram.ts`,
or is named in `KNOWN_UNEXERCISED` with a reason. Adding an eighth scope fails the
suite; deleting a call site while keeping its scope fails it too. Both directions
are tamper-verified. The next scope cannot arrive unnoticed the way this one did.

## 99. The agent registry is accurate — and both orphan scans are not

All 22 agents traced against actual callers. **No drift found.** The registry's
declared statuses match the code, including the two that look wrong from a naive
scan.

**Two false positives, both §81's lesson again.**

`take-drafter` and `take-strengthener` have no caller outside their own file and
are declared `implemented_partial`. That looks like drift and is not:
`runTakeLoop` calls both from inside `dailyTake.ts`, and `runTakeLoop` is called
by `take/actions.ts`. An internal caller with a reachable outer function is a
real caller.

`rejection-clusterer` is declared `implemented_no_caller`, and a symbol scan
finds a hit — in `packages/audit/src/fixtures/phantom.ts`, which is a fixture the
Auditor uses to test itself. A fixture is not a caller.

So a symbol scan must exclude the defining file's own module graph, test files,
**and** fixtures, and must still be read by a person. Recorded because this is
the third time a scan of this shape has produced a confident wrong answer (§78's
27 flagged, §81's correction, and now this). The Auditor's own
`audit.test.ts` already pins the orphan list; that remains the durable check, not
an ad-hoc scan.

## 100. Producer/consumer map, table by table

A systematic pass over all 65 tables, separating `insert` from `update` — because
a table that is only ever updated has no producer, which a combined "writes"
count hides. Findings verified individually, not taken from the scan.

**Consumer and mutators, no producer.** `rejection_clusters` is `SELECT`ed by the
dashboard and `UPDATE`d by accept/dismiss actions, and **never inserted** — its
only writer would be `clusterRejections`, the declared orphan. The dashboard
renders the section behind `clusters.length > 0`, so an operator sees nothing
rather than an empty promise. Correct as it stands; the prerequisite (a body of
rejections) genuinely does not exist yet.

**Producer, no consumer.** `comment_replies` is inserted by `inbox/actions.ts`
and read by nothing. Its columns — `was_ai_drafted`, `was_edited`,
`latency_seconds` — are learning substrate: did the operator use the draft or
rewrite it, and how fast did they answer. It is being collected correctly and
consumed by nothing, which is consistent with LEARN being unexercised rather than
a defect.

**Read paths for data that cannot exist.** `compose_sessions`, `subscribers`,
`voice_lexicon` are each `SELECT`ed in exactly one place and never written.

**No code at all.** `product_artifacts`, `shipped_features`, `submissions`,
`connector_calls`, `format_cadence`, `hook_experiments`. Note that `submissions`
is *not* the table behind `/submissions` — that page uses `review_submissions`,
which is live. The bare `submissions` table is unreferenced.

None of these is fixed here. Each is either a genuine prerequisite gap (a
producer whose inputs do not exist), or dead schema whose removal is a migration
and a decision. Recorded as a map so the next slice can pick from evidence rather
than from a table listing.

## 101. A learning signal that recorded the opposite of what happened

`comment_replies` is written on every reply and, per §100, read by nothing. Its
columns are the only record of whether the reply drafter earns its place:
`was_ai_drafted`, `was_edited`, `latency_seconds`.

`was_edited` was `comment?.suggested_reply !== body`. For any comment the drafter
has never run on, `suggested_reply` is **null** — so `null !== body` is true, and
**every hand-written reply was stored as an edit of a draft that never
existed.** Editing is only meaningful relative to something; no draft, no edit.

Fixed to `suggestion !== null && suggestion !== body`.

**The read path is the other half.** `getReplyHistory` aggregates the three
columns and the inbox renders them — replies sent, how many had a draft, how many
of *those* were changed, and the median latency. The ratio is measured against
drafts rather than against all replies, because mixing those denominators is how
"the drafter is useless" gets concluded from two replies typed from scratch.
Median rather than mean, so one reply sent a week late cannot move it. Null
rather than zero when nothing carries a latency.

**Worth recording how nearly this was mis-tested.** The first tamper — reverting
`was_edited` to the buggy expression — **passed**. The aggregate counts
`was_ai_drafted and was_edited`, so a hand-written reply flagged as edited never
reached the ratio anyway. The read side was already immune; the *stored column*
was still wrong, and any consumer reading `was_edited` on its own — the obvious
thing to do with a column called that — would conclude the operator rewrites
everything.

So the tests now assert the stored column directly as well as the aggregate, and
the tamper fails. A test that only exercises the reading of a value cannot prove
the writing of it.

## 102. The three read-only tables, classified

§100 flagged `voice_lexicon`, `compose_sessions` and `subscribers` as read in
one place and written nowhere. Traced individually, they are three different
things, and only one needed a change.

**`voice_lexicon` — working as designed.** It has 8 rows: `supabase/seed.sql` is
the producer, which the scan missed because it only walked TypeScript. `tts.ts`
reads it to normalise a script before synthesis, and an empty lexicon means "no
custom pronunciations", not a broken assumption — the normaliser simply
substitutes nothing. What *is* deferred is the feedback half its own comment
describes: "a mispronunciation caught by the gate can be corrected on the next
synthesis". Nothing writes an entry from the audio gate, and `hit_count` is
never incremented. Category **C**, deferred, not a defect.

**`subscribers` — an entire deferred feature, correctly guarded.** There is no
signup path anywhere, so it can never be non-empty. The important question was
whether `send_newsletter` degrades safely, and it does: `sendNewsletter` throws
`No confirmed subscribers to send to.` before any provider call, so the
newsletter is recorded `failed` rather than `sent`. A newsletter delivered to
nobody is **not** marked sent — the empty-state-as-success trap this codebase
keeps finding is already closed here.

Worth stating plainly: `draft_newsletter` is scheduled weekly, `newsletters` has
no UI at all, nothing references `send_newsletter` from the web tier, and there
is no audience-acquisition path. The whole newsletter capability is server-side
and unreachable by an operator. It spends **no** model credits — the drafter uses
no LLM — so it is dormant rather than costly. Category **C**. Not built out here:
that is a product decision about whether Halyard runs a newsletter at all.

**`compose_sessions` — a UI implying a control that does not exist.** The compose
page renders "Saved conversations" and, when empty, said *"Nothing saved yet."*
That tells the operator they have not saved one. Nothing *can* save one: the page
is the only reader and there is no writer anywhere. The list is empty by
construction, not by circumstance.

Fixed at the surface rather than by inventing a writer: it now says conversations
are not saved yet and that queued drafts survive while the conversation does not.
The same rule the legal pages follow (§64, §93) — a surface must not imply a
control the product does not have — and `e2e/compose.spec.ts` pins it, including
that the old wording is gone.

**Method note.** The §100 scan walked only TypeScript, so a table whose producer
is `seed.sql` looked producerless. Any future producer/consumer scan has to
include SQL seeds and migrations before a table is called orphaned.

## 103. The scheduled-job audit — no new defects

All 13 scheduled kinds traced as execution paths: `refresh_tokens`,
`detect_release`, `capture`, `mark_stale_assets`, `collect_app_store`,
`collect_watch_terms`, `collect_signals`, `collect_reviews`, `draft_newsletter`,
`reconcile_schedule`, `verify_feature`, `score_performance`,
`collect_product_evidence`.

**The expensive-no-op case does not exist.** The two jobs that can open a browser
both guard first. `verify_feature` selects the due claim and returns —
`feature_claims` is empty, so every six-hourly run is one query — before any
`chromium.launch()`. `capture` resolves the flow and the product first, and its
weekly `verifyOnly` run launching a browser *is* the work: proving the selectors
still resolve is the point, not a side effect.

**The LLM-spend case does not exist either.** `collect_product_evidence` is plain
HTTP and chains `build_product_brain` — five model calls — **only when something
was actually collected**, which migration 0028 already established and the
handler honours. `draft_newsletter` uses no model at all (§102).

**"Enqueue work nobody handles" is already structurally impossible.**
`handlerCoverage.test.ts` asserts all four directions: every scheduled kind has a
handler, every handler has a policy, every handler is in `JOB_KINDS`, and every
declared kind is either handled or on an **exact** knowingly-unhandled list
(`digest_email` alone). It exists because `collect_signals` sat on the schedule
with no handler for the life of the system, accumulating thirteen jobs over
seventy-five hours without erroring. Nothing further is needed here.

**Currently-empty inputs, each with a legitimate producer.** `feature_claims`
(produced by `explore_product`), `watch_terms` (by the `/finds` UI since §83),
`assets` (by `render`), `content_items` (by `generate`). A job waking against an
empty source is the correct behaviour when the source can legitimately fill.

**Result: no defects found, and nothing changed.** Recorded because an audit that
finds nothing is a result, and because the next person to ask "are the scheduled
jobs safe?" should not have to re-derive it. The two known dormant cases
(`draft_newsletter` §102, `purge_request_logs` §81) remain documented and
harmless — neither spends anything.

**What is not covered by any test**, and is the honest limit here: nothing
asserts that a scheduled job's input *can* become non-empty. That is a semantic
question about product intent, not a structural one, and §83/§100/§102 show it
takes a human read — twice producing a confidently wrong answer from a scan.

## 104. A workflow that dead-ended at its last step

A reachability scan of all 77 server actions against every `.tsx`, `.ts` and
E2E file found three with **zero references anywhere**. Two of them are the end
of the founder-take workflow.

`approveTake` and `discardTake` are complete, correct server actions —
`approveTake` inserts a `content_items` row with the founder persona, the `take`
subtype and `pending_approval` status, routed to the founder account. Neither was
referenced by a page, a component or a test.

So an operator could speak a reaction, watch it fact-checked, read the draft
Halyard wrote from it — and then had nothing to click. The draft rendered with no
controls beneath it. The whole `/take` feature produced output that could not
leave the screen.

Wired to the existing actions; no new behaviour invented, because both actions
already defined it. `e2e/take.spec.ts` covers both ends, and the assertion that
matters most is that **approving a take does not publish it**: it arrives in the
queue as `pending_approval` and every gate from §90/§92 still applies. "Send to
queue" is exactly the phrase an operator would read as "post it", so the copy
says otherwise directly.

Tamper-verified: removing the controls fails all three tests.

**The third orphan is not a dead feature.** `shareTokenFor` is a two-line server
action wrapping `extractShareToken`, which is called directly in
`queue/[id]/page.tsx` and `destinations/router.ts`. The wrapper is redundant, not
the capability. Left in place — deleting it is a trivial cleanup with no
evidence-backed benefit, and category D deletions need better reasons than tidiness.

**Method note.** The scan checked `.tsx` first and found three candidates; two of
them survived a wider check across `.ts` and the E2E suite. §99 and §102 each
produced a wrong answer from a scan that was too narrow, so the wider pass ran
before anything was touched — and this time it changed nothing, which is how a
methodology fix is supposed to look.

## 105. Every newsletter would carry an unsubscribe link that cannot work

The reverse reachability audit traced all 14 API routes and both public page
groups. Every internal route has a real caller; the external-entry routes —
`/api/oauth/[platform]/callback`, `/api/auth/callback`, `/api/webhooks/meta`,
`/api/cron/[task]`, `/r/[id]`, `/l/[slug]` — are called by providers, the
scheduler or a browser, and correctly have no repository caller.

**One referenced route does not exist.** `send_newsletter` builds
`${newsletter.web}/u/${newsletterId}` and `renderNewsletter` embeds it in every
email, HTML and plain text: `Unsubscribe: …`. There is no `/u/` route in
`apps/web/src/app`. Every newsletter Halyard sent would carry a dead unsubscribe
link.

**And the URL could not work even with a route.** It is built from the
**newsletter** id, not the subscriber's. The link identifies which issue was
sent, not who to unsubscribe — so the endpoint would have no way to know whose
`subscribers.unsubscribed_at` to set. This is not a missing file; it is a link
that cannot do its job by construction.

**Currently unreachable, and that matters.** Per §102 the newsletter is dormant:
no signup path, so `subscribers` is always empty; `sendNewsletter` throws before
any provider call; nothing in the web tier triggers `send_newsletter`; there is
no newsletter UI. No email can be sent, so no broken link can reach anyone. **No
legal page claims an unsubscribe capability**, so nothing published is untrue.

**Not built.** Making the link work needs a subscriber-scoped token — a design
decision — and building it would be activating a dormant feature, which the
operating rules forbid.

**What this changes is the newsletter decision.** §102 recommended leaving it
dormant on the grounds that it is harmless. That recommendation now has teeth:
activating it without first building subscriber-scoped unsubscribe would ship
bulk email with a non-functional opt-out, which is a legal exposure rather than a
bug. Recorded against the pending newsletter decision as a hard prerequisite.

**Clean on the other axes.** No always-disabled controls (the one conditional
`disabled` is `placed.length === 0`, which is correct), no `href="#"` dead links,
no UI invoking a stale action name — §104's scan already covered the reverse
direction.

## 106. A percentile computed over nothing, fed into learning

The learning loop traced as one graph: `post_metrics` → `scorePosts` →
`performance_scores` → `historicalConversion` → `scoreIdeas`, alongside
`hook_variants` → `loadHookHistory` → `scoreVariant`, and
`comments` → `comment_replies`.

**The provenance links hold.** `content_items.idea_id` is populated by
`generate`, so published content traces back to the idea that caused it.
`comments.publication_id` traces a comment to its post and onward to the item and
the idea. The hook a post used is derivable through
`hook_variants.content_item_id` where `selected = true`, which is exactly the
join `loadHookHistory` makes.

`content_items.hook_variant_id` is written and read by nothing — but it is a
redundant denormalisation of that same link, not a broken path. Left alone;
category D deletions need better reasons than tidiness (§104).

**The defect is in what `conversion_score` stores.** With no attribution
anywhere, `activatedPerThousand` is 0 for every post and
`percentileRank(0, [0,0,0])` is **0.5** — ranking zeros against zeros produces a
confident-looking middle. That was written to `performance_scores.conversion_score`.

It is harmless *today*: the weight redistributes to zero, every value is
identical, and §86's average of 0.5s equals the `?? 0.5` neutral. It stops being
harmless the moment attribution is **partial** — §86 averages `conversion_score`
per category into the idea scorer, and an average mixing real percentiles with
synthetic 0.5s is a number with no meaning being treated as evidence. That is the
failure this codebase keeps finding, one step before it happens.

Now null, which §68 established for exactly this: unmeasured is not zero, and it
is not the median either. The read side already filtered
`where conversion_score is not null`, so it was waiting for this.

An existing test asserted `conversionScore === 0.5` — documenting the synthetic
value rather than an invariant, the same shape as §84's stale assertion. It now
asserts null and says why it changed.

Tamper-verified at both levels: the in-memory score and the persisted column,
with the marker checked before and after restoration (§104's process lesson).

## 107. The approval gate was a public endpoint

**Ten server actions had no `requireOperator()`**, among them `approveItem` and
`publishNow` — the approval gate and the direct publish trigger. Also
`markManuallyPublished`, `rejectItem`, `editItem`, `regenerateItem`,
`rescheduleItem`, `retryRender`, `buildLaunchPlan`, `shareTokenFor`.

**Why the existing guards did not cover it.** A server action is a public POST
endpoint. `(dashboard)/layout.tsx` calls `getOperator()` and redirects to
`/signin`, but a layout guards **rendering** — it does not run for an action
invocation. `middleware.ts` sets a pathname header and does no auth. So the
protection an operator would reasonably assume from "it is behind the dashboard"
did not exist for the actions themselves.

This is the boundary §90 and §92 exist to hold, bypassed **at the transport layer
rather than the logic layer** — which is precisely why the adversarial suite could
not see it. Every test there attacks `publishHandler` and the state machine, and
all of them were right. The hole was one layer up, in who is allowed to ask.

Exploitation needs the action's build-time id, which is not published — but that
is obscurity, and the ids are present in the served client bundle and flight
payloads. Halyard's own claim is that nothing publishes without an explicit human
action, "enforced in code rather than policy". This was policy.

Fixed by adding `await requireOperator()` as the first statement of each, the
pattern the other 67 actions already followed.

**Made durable.** `serverActionAuth.test.ts` reads every file marked
`'use server'` and asserts three things: that it finds more than sixty actions
(non-vacuity — a regex that stopped matching would report a clean sweep of zero,
the §76 trap), that every action contains `requireOperator`, and that the check
appears **before** the first statement touching state. Position matters: a check
after the write has happened is not a check.

Tamper-verified by removing the guard from `approveItem` — the marker was
confirmed present before the run and absent after restoration, per §104's
process lesson.

## 108. Two runs, one set of signals — and a safety net that cried wolf

§87 closed the double-spend window for **retries** by consuming signals before
persistence. **Concurrency was still open.** `generate` is not worker-scheduled —
it runs from the web cron and from `regenerateItem` — so two runs for one product
can overlap, and a plain `select … where consumed_at is null` lets both read the
same rows and both send them to the model.

The claim is now the read: an `update … where id in (select … for update skip
locked) returning`. Postgres evaluates the predicate and writes atomically, so a
second run in flight sees them consumed and takes none — the same
claim-by-writing the job poller already uses for jobs.

**Released when the model call never completes.** Claiming without releasing
would drain every signal on the first run while there are no LLM credits, and
they would be gone by the time credits arrived — which is exactly the state
Halyard is in. So the `catch` restores `consumed_at = null`, and only that case.

The two failures want opposite orderings — a retry must not resend, a concurrent
run must not read — and claiming in the select satisfies both. Tamper-verified:
reverting to a plain select fails four tests, including one that runs two
proposals simultaneously and asserts the model was called once.

### The SQL validator produced a false positive

Adding this surfaced a flaw in §77's net. The extractor matches backtick
template literals, and a **doc comment** quoting SQL in backticks looks
identical — it reported `apps/worker/src/handlers/generate.ts:718 [42703] column
"…" does not exist` for a sentence of prose.

Fixed in the extractor rather than the comment: comments are blanked before
scanning, preserving line numbers so `file:line` still points at the real line.
A false positive in a safety net is worse than a gap — it trains the next person
to disbelieve the net, and this one would have recurred on any comment that
quotes a query.

## 109. A feed's description element is not always a description

The Daily Take rendered a paragraph under every Hacker News headline reading
`Article URL: https://… Comments URL: https://… Points: 180 # Comments: 82`.
Found by looking at a screenshot, not by reading code — every layer was behaving
correctly and the result was still wrong.

HN has no summary to give. Its `<description>` is a block of link markup, and
`stripHtml` faithfully turned that into text. Nothing was broken; the field was
simply being presented as something it is not.

**Discarded in the parser, not hidden in the page.** `summary` is nullable, the
Daily Take already renders nothing for null, and the idea generator prompt and
signal clustering read the same column — a page-level fix would have left the
noise in the two places nobody would look at.

**Two conditions, both required.** URLs must exceed half the text *and* what
remains must contain no run of four consecutive words. Either alone is wrong:
the clause test by itself discards `Tooling for evaluation`, and the URL test by
itself discards a real one-line summary that cites a long link. Together they
match a metadata block and nothing else — the three existing fixtures, including
two summaries of three words, were left untouched deliberately as the proof.

Rows already ingested keep their old summary (`on conflict … do nothing`, which
is right — re-polling must not overwrite `relevance` or `status`). No migration:
`rss_items` carry `expires_at` and the page already filters on it, so they age
out. Tamper-verified: relaxing the gate fails exactly the new assertion.

## 110. Every published link pointed at localhost

`HALYARD_PUBLIC_URL` appeared **once in the entire repository** — as the
left-hand side of `process.env.HALYARD_PUBLIC_URL ?? 'http://localhost:3200'`.
It was in no `.env.example`, no deployment config, and no document, so in
production it is unset by construction.

That value is not a preview. `generate` writes it to `content_items.link_url`,
which is the link that goes out in a real post. No QC gate reads `link_url`, so
it would have passed all four. On X it is also the expensive shape: a post
carrying a link bills ~$0.20 against ~$0.015, so a misconfigured deploy pays
thirteen times over to publish a link no reader can open.

**Generation fails rather than attaches a dead link.** The alternative — drop
the link and publish anyway — changes what goes out, and that is Isaac's call,
not a handler's. A `PermanentJobFailure` names the variable, stops before
anything is drafted, and costs nothing. In development the localhost default
stands, gated on `NODE_ENV !== 'production'`, matching `devBypassAllowed`.

Empty is treated as unset, not as a value: `.env.example` ships `KEY=` with a
trailing comment, dotenv parses that to `""`, and `??` does not fall back on an
empty string — gotcha 3, which broke OAuth on every fresh clone, applies here
verbatim. The variable is now defined in `.env.example` as well.

`publicOrigin` in the web tier had this right all along and said so in a
comment. The worker did the opposite. Two answers to one question, and the
wrong one was on the path that publishes.

## 111. The container healthcheck could not fail

    HEALTHCHECK … CMD node -e "process.exit(0)"

with a comment above it reading "this healthcheck is the container's own view of
the same fact" — the fact being the sixty-second heartbeat. It read no heartbeat.
It exits zero for as long as the image can start node, which a worker whose loop
wedged an hour ago does perfectly well.

Railway honours neither Docker `HEALTHCHECK` nor any `healthcheckPath` we set,
so nothing was relying on it. That makes it worse, not better: an inert check
that claims to detect a dead worker is a false assurance sitting in the file
where someone would go to add a real one.

**Made true rather than deleted.** The poller now touches
`HALYARD_LIVENESS_FILE` on the same beat, and the check reads its mtime with a
three-missed-beat threshold matching `--retries=3`. Written *after* the database
insert, so a worker that has lost the database goes unhealthy too — liveness
that ignores the dependency the worker exists to use is the same lie in a
smaller font.

Opt-in by environment variable, set only in the Dockerfile, so tests and local
runs touch no disk. The command itself was exercised in all three states before
being committed to the file — fresh exits 0, stale exits 1, missing exits 1 —
because the thing being replaced was never run even once.

## 112. Three colour tokens that did not exist

`text-bad` was used for agent-run error text in two places and a Brain nav
state in a third. There is no `--color-bad`, so Tailwind emitted no rule and the
error rendered in body ink — proven in the browser, not inferred: the computed
colour of `p.text-bad` was `rgb(42,35,32)`, identical to `body`.

`bg-accent` was worse. It sat on two buttons that also carry `text-white`, one
of them **"Post it now"** — the publish trigger. No background plus white text
is an invisible label on the most consequential control in the product.

`bg-paper` was used 45 times, on inputs and selects, and rendered transparent
everywhere.

None of this could fail: an undefined utility typechecks (it is a string),
lints, builds, and leaves the element in the DOM, so every selector-based test
passes. Only a screenshot or a computed-style read can see it.

**Fixed by naming the intent, not by deleting the classes.** `bad` → `danger`
and `info` → `primary` (the failed/running cards on `/brain` had left borders
that drew nothing, so a failed card looked exactly like a healthy one);
`accent` → `primary`, matching the `bg-primary … hover:bg-primary-dark`
convention used by every other primary button; `paper` declared as `#fdfbf7`,
which is what those controls already looked like on a card, so declaring it
changes nothing there and gives controls on `canvas` and `sunk` the lift the
class was asking for.

**The guard matters more than the fix.** `apps/web/src/lib/designTokens.test.ts`
scans source for colour utilities and asserts the colour half names a declared
token. It found `accent` and `paper` on its first run — after `bad` had already
been fixed by hand, which is exactly the argument for having it. Tamper-verified
with a `text-nonexistent`.

## 113. The palette missed AA almost everywhere, by a little

An axe pass over 45 routes at two widths reported 846 contrast violations on
desktop and 614 on phone. The instinct is to reach for an exemption; the numbers
say otherwise. Measured through axe rather than assumed, every token was a *near*
miss: muted 4.09–4.45 against 4.5, good 4.23, warn-ink 4.36.

Darkened by the smallest amount that clears 4.5 against the worst background
each one appears on — muted `#7a6e66`→`#736760`, good `#4f7a52`→`#4c754f`,
warn-ink `#8a6512`→`#876312`. All three are invisible side by side and carry no
design tradeoff. `danger` already passed at 5.37 and was left alone.

Two usages were fixed rather than tokens. `text-muted/70` on the nav group
labels measured 2.73 — opacity applied to a colour that was already at the
limit. And `/templates` dimmed the whole card of a disabled template to
`opacity-60`, which dropped its `disabled_reason` to 2.23: the one thing an
operator needs to read was what the styling hid. The card already carries a
`disabled` badge, so the dimming was a redundant second cue that cost the first.

Result: 846 → 231 and 614 → 119.

**What is left is one decision, not a hundred defects.** Every remaining
violation involves `--color-primary` `#c4714a` — 3.13:1 as text on its own tint,
3.49 on surface, 3.61 behind white on a button. Fixing it means darkening the
brand orange to roughly `#9e5b3c`, which is a visible change to how Halyard
looks, so it is Isaac's call and not one to make quietly at 3am. The one-line
change is `--color-primary` in `globals.css`; nothing else needs to move,
because a single darker value satisfies both the text and the button case.

`e2e/accessibility.spec.ts` allows contrast violations **only** where the
measured colour is that exact hex. Any other pair that starts failing is a new
defect and fails the suite. That is a bounded exception, not a suppressed rule.

## 114. A table you can only scroll with a mouse

Four wide tables — accounts, analytics, brain evidence, hooks — sat in
`overflow-x-auto` containers that were not focusable. A mouse drags them
sideways; a keyboard has nothing to put the caret on, so every column past the
fold simply does not exist. It only appears at narrow widths, which is why a
desktop pass never saw it.

Encoded once in `Card` as a `scrollLabel` prop rather than sprinkled across nine
call sites, so the next wide table gets it by asking for it. The label is
required rather than optional: `role="region"` without an accessible name is
announced as an unnamed landmark, which is worse than no landmark.

Also on this pass: `/signin` had no `main` landmark, `/submissions` had five
`<select>`s and two inputs labelled only by placeholder, and `/agents/runs`
scrolled horizontally on a phone because a long run error had nothing to break
on. `e2e/accessibility.spec.ts` asserts all of it across 13 routes at two
widths; tamper-verified by removing one `aria-label`.

## 115. The rejection loop had a consumer and no producer

The dashboard reads the top three surfaced rows of `rejection_clusters`.
`acceptCluster` promotes one into `products.content_rules.operator_rules` and
writes an audit entry. `dismissCluster` suppresses it for thirty days. All of
that works.

**Nothing had ever inserted a row.** An operator could reject the same thing
thirty times and Halyard would keep writing it, and the screen would keep saying
there was nothing to learn.

And the far end was broken too: `operator_rules` was written by exactly one
statement and read by *nothing*. Generation reads `content_rules` for
`forbidden_claims` and `banned_phrases` and never for the rules the operator
accepted. So even a hand-inserted cluster would have changed no output —
accepting a pattern moved a row's status and nothing else.

**Both ends built.** A `cluster_rejections` job kind (added to `JOB_KINDS` and
`jobs_kind_check` together, per gotcha 1), a handler, and a daily per-product
schedule. `copywriterDontRules` merges accepted operator rules into the
copywriter's DO NOT list, de-duplicated, voice rules first.

**Deterministic, and deliberately not a model call.** `clusterRejections`
matches rejection reasons against known complaint vocabulary; that is the whole
judgement and it belongs in code. `inferRejectionPattern` exists for groups
matching no known pattern and is *not* called — wiring it in would make the one
loop that closes depend on credits Halyard does not have, and a named pattern
with no rule attached still tells the operator what they keep rejecting.

**Re-running must not undo a decision.** Clusters are a view over current
rejections, so a run replaces the surfaced set — but the rejections behind a
decided cluster are still in the table, so a naive recompute would re-ask
tomorrow, forever. A pattern is skipped while a decision stands: `accepted`
permanently, `dismissed` until `dismissed_until`, which honours `dismissCluster`'s
own stated intent that a pattern dismissed once may be worth acting on after
another ten rejections. Done as `insert … select … where not exists` so the
check and the write are one statement.

Nine database tests, tamper-verified. The Auditor independently agreed: the
orphan list, which read `['rejection-clusterer']`, is now empty.

## 116. "Blocked" was doing the work of "untested"

`auto-clip` is registered `blocked` because Halyard ingests no long-form
footage, so nothing can call it. That is a real prerequisite and ingestion is a
product decision, not missing plumbing — it stays blocked.

But it had `acceptanceTests: []`, and the status note was quietly covering for
that. Almost none of the agent is the model: the duration bounds, the strength
floor, the overlap resolution and the ffmpeg arguments are all deterministic
code, and all of it was unasserted. Sixteen tests now cover it with fixtures and
a stub model — including that a clip running past the end of the recording is
clamped rather than discarded as too long, which would have silently lost usable
clips the first time anyone did feed it footage.

No live model call has been made and none is claimed. The registry says so.

## 117. The newsletter's opt-out was a 404 that identified nobody

Two independent failures in one link. The send handler built
`${web}/u/${newsletterId}` — the *newsletter* id, identical for every recipient,
so a click could not have said who to unsubscribe even if it had resolved. And
there was no `/u/` route at all, so it resolved to nothing.

The design had been right once. `draft_newsletter` renders the footer as
`/u/{{unsubscribe}}`, a placeholder plainly waiting for per-recipient
substitution. The send path ignored it and re-rendered with an id instead.

**Sending stays dormant**, as instructed: `send_newsletter` is on no schedule,
nothing enqueues it, and it refuses without an approved newsletter and both
`RESEND_API_KEY` and `NEWSLETTER_FROM`. This is the subsystem being finished,
not switched on.

### What the token had to be

Per-subscriber, unguessable, and **not derivable from the email address** — a
derived token would let anyone unsubscribe anyone. 32 random bytes, hex,
generated in the column default so a subscriber cannot exist without one, and
uniquely indexed because the whole scheme rests on no two sharing one.

### The batching had to go

The transport BCC'd a hundred addresses per call. That is efficient, and it
cannot carry a working opt-out: one body cannot hold a different link per
recipient. The batching is what gives way, because the link is what makes bulk
mail lawful rather than merely possible.

BCC also existed to stop the subscriber list becoming visible to every
subscriber. Sending individually keeps that property for a better reason — each
message has exactly one recipient and no `bcc` at all.

`List-Unsubscribe` and `List-Unsubscribe-Post` are now set per message
(RFC 8058), which is what puts the native one-click control in Gmail and Apple
Mail. A recipient with a blank unsubscribe URL is **refused rather than sent to**:
a message with no way out is the one failure that cannot be corrected after the
fact. One bad address no longer aborts the run, but `recipientCount` counts what
the provider accepted and `failures` carries the rest, so a mostly-failed send
cannot read as a clean one.

### GET does not unsubscribe

Mail clients, security scanners and link previewers fetch every URL in a
message. An unsubscribe that happens on fetch removes people for opening their
mail. So GET asks and the button posts — except for a provider's one-click POST,
which is already a person acting on their client's own control.

Both verbs answer at one URI because RFC 8058 requires it, which is why this is
a route handler rather than a page. Tamper-verified: making GET perform the
unsubscribe fails exactly the test that says it must not.

### Still required before a single mail goes out

A Resend account and verified sending domain, `NEWSLETTER_FROM`, and Isaac's
decision that the newsletter should exist at all. None of that is engineering.

## 118. A scanner that stopped seeing the file it was written for

While narrowing §112's token scan to avoid a false positive on CSS, the scan
quietly stopped matching anything in the file that motivated it. Caught only
because the tamper was repeated after the change — reintroducing `text-bad` into
`BrainNav.tsx` produced a **pass**.

Two causes, both worth recording. Restricting the scan to `className=`
attributes missed the original defect outright: `text-bad` was in a ternary,
`? 'text-bad'`. And scanning every string literal instead broke on prose — an
apostrophe in a comment ("doesn't") opens a string match that runs to the next
apostrophe and swallows every real literal between them. §108 is the same trap
in the SQL validator, three weeks earlier, and it was not remembered.

Now: comments are blanked first, then every literal is read, and CSS is told
apart from a class list by punctuation a class list never contains — `;`, a
brace, or a tag — checked after `${...}` interpolations are removed.

The lesson is about method rather than regexes. **A tamper test proves a
scanner only at the moment it is run.** Any change to what a scanner looks at
invalidates the last tamper, and re-running it is not optional — a narrowed
scanner that passes is indistinguishable from a clean codebase.

## 119. §95 resolved — the inputs go, the slots stay, and the audio verdict finally counts

§95 left this to the operator with two options. Both turn out to be wrong, and
the evidence that settles it also uncovered a hole neither option addressed.

### The measurements

`runAllGates` has six production callers. Not one supplies `visual` or `audio`,
and none *can*: the aggregate runs at copy time, before any media exists. The
Auditor's `gate.input_never_supplied` has been correct about this the whole
time — re-confirmed by running the real scan rather than trusting §95's summary.

`coherence` was dead for the same reason and was not being audited at all,
because the Auditor's `GATE_SPECS` never listed it.

### Why both §95 options were wrong

**Option B — require callers to declare `requires`** — is incoherent. No caller
could satisfy a `visual` requirement at copy time, so `requires: ['visual']`
does not mean "fail honestly", it means "fail always".

**Option A — remove `visual`/`audio` from `runAllGates`** — over-reaches, and
§95 could not see why because it never looked at the merge. `review_media`
finishes with `previous.filter(g => g.gate !== 'coherence' && ...)` and pushes
its own entries into **this function's own `gates` array**. The gate *entries*
are not decoration; they are slots a later stage fills.

**So: the inputs go, the entries stay.** `visual`, `audio` and `coherence` are
now always emitted as `skipped`, naming the stage that measures them. This is
narrower than either option, resolves the Auditor error honestly, and preserves
§62's substance — the aggregate still carries a media verdict, written by the
stage that can actually measure it rather than by a parameter nothing can fill.

Coverage did not move: `runVisualQC` and `runAudioQC` already had 13 and 9
direct tests, and exactly one `runAllGates` call supplied `visual` — to colour a
status in a test whose real subject was gate *order*. The four coherence tests
that ran through the aggregate now call `runCoherenceQC`, which is what
`review_media` calls.

### The hole underneath

Chasing the merge turned up something worse than a dead parameter. `tts` wrote
its verdict to `qc_results.audio` — a **top-level key, not into `gates`** — and
then took no action on failure, by an explicit and reasonable decision: the
audio exists, retrying synthesis would reach the same verdict, and "the queue is
where opinions get acted on".

Except the queue renders `qc_results.gates`. So an item whose voiceover had just
failed its gate displayed `audio: skipped — no voiceover here`, and `passed` was
computed over a list the verdict was not in. **A failed voiceover blocked
nothing and was shown to nobody.**

And it did not even survive. `review_media` ends with `set qc_results = $2`,
replacing the whole object with `{passed, gates, ranAt}` — so for any item with
both a voiceover and a render, which is every video, the top-level `audio` key
was **destroyed** minutes later. It read the key first, for coherence, and then
overwrote it.

`tts` now merges an `audio` entry into `gates` and recomputes `passed`. The
documented intent is preserved exactly — the job still does not throw, synthesis
is not retried — but the verdict now reaches the list the queue displays and the
aggregate counts. A consequence worth stating plainly rather than burying: since
`review_media` fails an item on any failed gate, a genuinely failed voiceover
will now fail the item. That is the correct completion. A recorded failure that
blocks nothing is not a lenient policy, it is a broken one.

Tamper-verified in both directions: dropping the merge fails the two new tests,
and after the `GATE_SPECS` change the audit rule was re-tampered — removing
`proof` from its one caller — to prove it can still fire. §118's lesson applied
rather than merely written down.

Media mutation invalidation was checked and needed nothing: `attachAsset` and
`detachAsset` both re-enqueue `review_media`, which is the right repair.

## 120. §78 answered — the cache is not needed, the ordering was

§78 recorded the artifact cache as unbuilt and left it under "Needs a human",
because finishing it needs a table, a store, and a decision to start *blocking*
generation at a hard ceiling. Re-examined now, on the question asked: is the
exposure it was meant to cover still real?

**The exposure §78 named is real, and it was an ordering bug rather than a
missing cache.** `generateSample` is one RecipeFix credit. The idea was marked
`selected` twenty lines *after* that call, so a generate attempt that died in
between left the idea `proposed` — and `JOB_POLICY.generate` allows a second
attempt, which re-selected it (`where status = 'proposed'`) and bought the same
adaptation again.

Fixed by claiming first: an atomic, status-conditional
`update ideas set status = 'selected' where id = $1 and status = 'proposed'`
before anything is spent, skipping the idea if the claim takes no row. The same
claim-by-writing the poller uses for jobs and `proposeFromSignals` uses for
signals.

**The claim is deliberately never released.** `ConnectorUnavailableError` is
raised only after the adapt call has been attempted and timed out, and a timeout
does not prove nothing was spent — the request may have reached RecipeFix and
consumed a credit while the response never came back. Releasing would let the
retry buy it again, which is precisely what this is for. One idea is consumed
per outage and the handler returns rather than continuing, so the loss is one
idea, not the batch. Ideas are regenerated; credits are the operator's money.

**And the cache itself is not needed for correctness.** Three measurements, not
assertions:

- *Retry double-spend* — the only sharp edge §78 identified — is now closed by
  ordering, with no table and no TTL.
- *Cross-run duplicate specs*, which a cache would deduplicate, cannot arise for
  the same idea: an idea is claimed on selection and set `used` after drafting,
  so it is never adapted twice. Two distinct ideas yielding an identical intent
  string is what `scoreIdeas`' embedding novelty check exists to prevent.
- *The hourly ceiling* ("twenty adaptations an hour, hard") could not bind.
  `generate` is enqueued only by three operator actions — the launch batch, a
  queue action, and campaigns — at `limit` ideas each, default 3. There is no
  loop that could approach twenty in an hour.

So `artifactCache.ts` stays unwired, and this is now a proven answer rather than
a deferral. If a future caller ever adapts on a timer, the ceiling becomes a
real question again and this entry is the thing to re-read.

Tamper-verified: neutering the claim to a no-op update fails both new tests.
The tests use a GitHub-backed product, whose `generateSample` throws
immediately and without a network call, so they exercise the real failure path
for free and never touch a provider — an earlier draft reached the copywriter
and hit OpenAI, which would have spent money the moment credits existed.

## 121. Three scheduled jobs that are on no schedule

Found while bounding §78's exposure, by asking what actually triggers
`generate`. The answer needed three sources cross-referenced, and cross-
referencing them showed more than was being looked for.

- `apps/worker/src/scheduler.ts` runs **14** job kinds.
- `apps/web/vercel.json` schedules **3** cron paths.
- `apps/web/src/app/api/cron/[task]/route.ts` accepts **12** task names.

Most of the cron route's tasks are also driven by the worker scheduler, so the
route is a manual entry point for them rather than dead. Three are not driven by
anything at all — no cron entry, no scheduler entry, and no code anywhere that
enqueues them:

| Task | Consequence of it never running |
|---|---|
| `collect_attribution` | Install attribution is never collected, so no post can ever be tied to a download. |
| `digest_email` | The daily operator digest is never sent. |
| `verify_flows` | The weekly proof that capture selectors still resolve never runs, so selector rot is silent. |

**Not switched on, and that is the decision.** Each is blocked on something that
is not engineering: `collect_attribution` needs App Store credentials and would
otherwise enqueue failing jobs; `digest_email` sends real mail; `verify_flows`
starts real browser work. Turning any of them on is a live behavioural change of
the kind §78's ceiling and §74's severity both are. Recorded under "Needs a
human" with the exact one-line schedule each would take.

**`generate` is reachable, and the queue's copy about it is wrong.** It is
enqueued by the launch batch, a queue action and campaigns — operator-driven,
which is coherent. But `queue/page.tsx` tells an operator staring at an empty
screen that "the daily generation job produces drafts and holds them here."
There is no daily generation job. Whether the fix is a schedule (which starts
automatic spend) or honest copy (which concedes the loop is operator-driven) is
a product decision, not a typo, so both options are recorded rather than one
being chosen.

## 122. Notifications were the one error column nobody scrubbed

`jobs.last_error`, `publications.error` and `social_accounts.last_error` are all
scrubbed at the moment they are written. `notifications.body` was not, and
callers put raw error text into it — `generate` sends
`${err.message} Generation is paused…`, `appStore` sends `err.message` straight
through.

An error message is whatever threw, and for an HTTP client that routinely
includes the request URL. **Meta's Graph API takes the access token as a query
parameter**, so a failed Instagram call produces a message with a live
credential in it. That message would land in `notifications.body`, render on the
dashboard, and stay there for ever — notifications have no purge.

Scrubbed inside `notify()` rather than at each call site, for §96's reason: a
boundary every caller must pass is the only place a rule like this holds. Nine
call sites exist today and the tenth would not have known. `title` is scrubbed
too, being equally caller-supplied.

Tamper-verified, including the negative: an ordinary message must come back
untouched, because over-redaction costs a debugging detail and a scrub that
mangles everything is one people route around.

## 123. A purge capability, deliberately without a policy

Five tables grow without limit: `jobs`, `notifications`, `agent_runs`,
`capability_probes` and `audit_log`. Only `platform_requests` (seven days, with
a cron) and `post_metrics` (`purge_after`) were bounded at all.

**The window is an argument, not a constant.** `purge_operational_logs(interval)`
takes the retention period from its caller and no schedule invokes it. How long
Halyard keeps an operator's data is a product and legal question, and inventing
a number here would have answered it in the schema where nobody would look for
it. The capability exists; the policy is Isaac's.

**Only finished rows are eligible.** A `queued` or `running` job is live state
rather than history, and deleting one loses work instead of a record. An unread
notification has not done its job yet, so it survives regardless of age. Both
are asserted with tests that fail if the predicate widens — tamper-verified by
relaxing it to every status, which fails exactly those two.

**`audit_log` is never deleted.** It records what a *human* decided — approvals,
disconnections, accepted rules — which is the one table whose retention is a
compliance question rather than housekeeping. The function counts its old rows
and reports them under a name that says so, so growth stays visible without the
schema quietly assuming an answer. Tamper-verified by making it delete, which
fails.

Partial indexes match each purge predicate; without them the function
table-scans on exactly the tables that are big enough to need purging.

What this does **not** do: pick a number, add a schedule, or touch
`platform_requests`, which already had both halves.

## 124. The RECOMMEND gap is not real yet, and building it now would duplicate the scorer

Asked to reassess whether an opportunity/recommendation layer should sit between
signals and ideas now that `OBSERVE → signals → ideas → drafts` exists. The
instruction was to prove the gap before building anything, and the proof runs
the other way.

**The stage the spec describes already exists, under another name.** The P3 test
criterion in `HALYARD_IMPLEMENTATION_PLAN.md` is "synthetic signals → agent
analysis → deterministic ranking → opportunity UI", with the rule that "no
opportunity is allowed to enter an action queue merely because an LLM
recommended it." That is a description of the path Halyard already runs:

| Spec calls it | Halyard has it as |
|---|---|
| agent analysis of signals | `proposeFromSignals` → `ideas` |
| evidence behind the recommendation | `ideas.source_signals` |
| why it matters | `ideas.rationale` |
| deterministic ranking | `scoreIdeas` — mix debt, novelty, seasonal, historical conversion |
| approval before action | `selectIdeas` hard caps, then the queue |

The governing rule is already enforced at exactly the point the spec cares
about: the model proposes, `scoreIdeas` and `selectIdeas` decide, and nothing
reaches the queue on a model's say-so. A second layer expressing the same
judgement is what §119 has just finished removing from the QC gates — two places
holding one verdict is how they come to disagree.

**What P3 genuinely adds is social discovery** — other accounts, competitors,
conversations, creators — and that is blocked on first-party data rather than on
engineering. There are zero publications and zero metric observations, so an
opportunity ranker would today be ranking an empty set with a conversion signal
that has never been measured. `STATUS.md` has said this since P2 merged, and
`PLATFORM_COVERAGE.md` §7 and §12 hold the evidence.

**Nothing built.** The redundant-architecture risk is concrete here, and the
prerequisite is the same X credit that blocks the rest of the measurement chain.

One note for whoever picks this up: `docs/Halyard_Social_Intelligence_Architecture.md`
is marked *"Status: Architecture / product direction"*. It is a statement of
intent, not a description of what exists, and its checklists are unticked on
purpose. It should not be read as a gap list.

## 125. The scope audit covered one Meta product out of two

§98 built `metaScopes.test.ts` after finding `pages_read_engagement` sitting
beside `business_management` with identical status — requested, granted,
reachable from no code — after months in which only one had been noticed.

The same file had the same blind spot one level up. It read
`PLATFORM_SCOPES.instagram` and stopped. **Threads is a Meta product, reviewed
through the same App Review, and its four scopes had no audit at all.**

All four turn out to have call sites — `/me?fields=id,username`,
`/{user}/threads_publish`, `/{post}/replies`, `/{post}/insights` — so there is no
Threads equivalent of the `business_management` question. That is the good
outcome, and it is not the point: nothing would have noticed if one of those
call sites disappeared, which is exactly the condition that produced §98.

Now pinned the same way, tamper-verified by renaming the replies endpoint, which
fails `threads_manage_replies has a live call site` and nothing else.

**The experiment is now stated per scope rather than generically.** §98 said
"reconnect with the scope withheld", which reads as one test. It is two:
`pages_read_engagement` is settled by whether `/me/accounts` still returns the
`instagram_business_account` edge, `business_management` by whether the connect
and self-test complete at all. Both are one OAuth round trip, cost nothing, and
need no App Review — and both remain unrun, because a failed reconnect leaves a
live account needing another.

Neither scope removed. That has not changed and is not this file's call.

## 126. Visual baselines that refuse to pass without one

Playwright writes a missing snapshot and reports a **pass**. That is the whole
problem with snapshot suites in a codebase built around "never verified is not
passed" — the first run of a new baseline is a check that did not happen,
reported green.

So `e2e/visual.spec.ts` is gated behind `HALYARD_VISUAL=1`, is not in the
default suite, and **throws when a baseline is missing** rather than creating
one. Writing requires a second explicit flag. Tamper-verified twice: once when
written, and again after `testInfo.snapshotPath` replaced a hand-built path,
because §118's lesson is that changing what a check looks at invalidates the
last tamper — and it did, the first version reported every baseline missing.

**Six images, three pages, and that is deliberate.** Only `/privacy`, `/terms`
and `/data-deletion` qualify: static prose with no dates, counts or provider
data, verified by reading the sources rather than assumed. Everything else needs
seeded fixtures and a frozen clock — the Daily Take renders live Hacker News,
the sidebar carries a badge count, sources say "polled 20h ago". A suite that
fails for those reasons is one people learn to ignore.

`/signin` was captured, reviewed, and **removed**. Looking at the image showed it
had recorded "Supabase Auth is not configured on this deployment" — a fact about
this laptop, not about the page, and one that would fail on any real deployment.
It was only caught by opening the file, which is the argument for this entry.

**They are candidates, not baselines, and the docs say so.** Opening one also
showed the Next.js dev indicator sitting in the middle of the page; a `mask` on
`nextjs-portal` did not remove it, because the control mounts late and outside
the normal element tree. Combined with platform-specific font rendering and
capture against `next dev` rather than a production build, that is three reasons
these images are not yet trustworthy. `docs/VISUAL_BASELINES.md` lists all three
and what would fix them.

Claiming these as verified would have been the easiest lie available this run: a
green suite, six committed images, and nothing behind them.

## 127. The reachability sweep, with SQL included this time

65 tables, cross-referenced against every writer and reader in `apps`,
`packages` and `scripts`, and separately against `supabase/` so a seed counts as
a producer. That last part is what previous sweeps missed, and it changes two
answers.

### Dead: created, never used

| Table | Created | Status |
|---|---|---|
| `submissions` | 0007 | **Superseded** by `review_submissions` (0016) and never dropped. The newer table is the one every screen uses. |
| `product_artifacts` | 0011 | No writer, no reader, referenced only by generated types. |
| `connector_calls` | 0011 | Same. |
| `hook_experiments` | 0012 | Same. |
| `format_cadence` | 0012 | Seeded with three rows and read by **nothing**. The cadence that actually governs is `DEFAULT_CADENCE` in `scheduling/cadence.ts`; the table duplicates it in a place no code looks. |

**None dropped.** A migration that drops a table is irreversible against
production data, and "no reference in this repository" is the beginning of that
argument rather than the end of it. Recorded for a deliberate decision.

### Producerless consumers — read by real screens, written by nothing

**`series`.** `/series` renders it and `/api/export` exports it. The only
`insert` anywhere is `supabase/seed.sql:198`. So the Series feature shows demo
rows and offers no way to create one — the same shape as `ideas` before
`proposeFromSignals` was wired, and invisible to a scan that does not read SQL.

**`voice_lexicon`.** `tts.ts:108` reads it before every synthesis, and the only
writer in the repository is a *test*. That would be a quiet gap except that
`deliveryQC.ts:199` tells the operator, in a finding they will actually see:
*"Add the term to voice_lexicon with a phonetic spelling and the next synthesis
gets it right."* There is no screen, action or script that lets them. The gate
diagnoses a mispronunciation correctly and then prescribes something impossible.

**Reported, not built.** Both need a product surface — where a series is created,
where a lexicon term is added — and inventing one is the thing this run is not
for. The minimal honest alternative for `voice_lexicon`, if the UI is not
wanted, is to change the fix text to name the real remedy.

### Known and unchanged

`compose_sessions` (read by `/compose`, written by nothing) is already stated in
that page's own comment. `platform_requests` has a reader and a purge and no
writer — §81, unchanged and deliberate. `shipped_features` is empty because its
agent is blocked on a repository RecipeFix does not have — §125's neighbour.

## 128. The brand colour, solved twice wrong before it was solved

The proposed fix for the palette was `#9e5b3c`. It is not sufficient, and the
way that was established matters more than the value.

Calculated against surface and white-on-fill it clears 4.5:1 comfortably. Run
through axe it still failed on `sunk` (4.33) and on the product chip's own 10%
tint (4.45) — the chip that renders in the sidebar on every screen, and the
single largest source of violations. The second candidate, `#98583a`, cleared
those and axe *still* found one pair at 4.37: the chip composited over `canvas`,
a background no hand calculation had thought to list.

`#8c5035` was solved against the backgrounds axe actually measured and then
confirmed by re-running it. `--color-primary-dark` moved to `#824b31` because
the old hover value was *lighter* than the new primary and would have inverted
the interaction.

**The exemption is gone.** `e2e/accessibility.spec.ts` allowed contrast
violations whose measured colour was the old brand hex; there is nothing to
allow now, so the rule is absolute. Tamper-verified by reverting the token,
which fails with the original 3.13:1 on the chip.

Two more defects surfaced when a 45-route sweep was run rather than the spec's
13: `/brain/evidence` used `text-warn` as body text — a badge colour at 2.49:1,
when `--color-warn-ink` exists for exactly this at 4.51 — and `/products/new`
dimmed unreached wizard steps to 2.35:1, the same redundant-opacity mistake §113
found on templates. Both routes joined the durable spec, and the tamper was
re-run there too.

**Zero accessibility violations across all 45 routes at both widths.**

## 129. Three jobs that were never scheduled, and one that was already running

§121 reported `generate`, `collect_attribution`, `digest_email` and
`verify_flows` as driven by nothing. One of those was wrong, and the correction
is the useful part: `verify_flows` enqueues a `capture` job in verify mode, and
`scheduler.ts` **already runs exactly that weekly**. The capability was never
unscheduled; only the duplicate cron name is unused. A finding that names a
working system as broken is worse than no finding, and it came from comparing
three lists by name instead of by what they do.

The other three were real.

**`generate` is now daily.** Every description of Halyard says drafts arrive
daily and the queue's own empty state promises it, but the job was enqueued only
by the launch batch, a queue action and campaigns. Scheduling it is safe because
the operator already owns the switch: `generate` reads
`settings.generation_enabled` and returns when it is off, `/settings` toggles
it, the onboarding gate refuses to run before the wizard is finished, and §120's
claim-before-spend means a retry cannot buy the same adaptation twice. A first
pass through the greps suggested that setting was read by nothing but the page
that renders it — a truncated result, corrected by looking again.

**`collect_attribution` is now daily.** It no-ops cleanly without App Store
credentials rather than failing, so scheduling it costs nothing today and starts
working the day credentials exist.

**`digest_email` was a declared kind, a cron task, and two settings columns with
no handler at all.** `handlerCoverage.test.ts` recorded it as knowingly
unhandled, which was honest bookkeeping for a hole that stayed open. Now built:
counts an operator would act on, read from tables rather than narrated; skipped
entirely on a quiet day, because a message that says "nothing needs you" every
morning trains someone to ignore the one that matters; and recorded as a
notification when no email provider is configured, so the absence of Resend
costs the delivery rather than the content.

The exemption list it lived in is gone, replaced by the invariant it was
standing in for: nothing the scheduler enqueues may lack a handler, derived from
`HANDLERS` rather than hardcoded. Tamper-verified by unregistering the digest.

## 130. Pronunciation, and a unique constraint that was not unique

`voice_lexicon` was read before every synthesis and written by nothing but a
test, while the delivery gate told the operator — in a finding they see — to
*"add the term to voice_lexicon"*. The gate diagnosed correctly and prescribed
something impossible.

Built: `/settings/pronunciation`, with add, correct, remove and the hit count,
plus the audit entries. The gate's fix text now names the screen instead of the
table.

**And building it found a real schema defect.** The table carries
`unique (product_id, term)` and `product_id` is nullable so a term can be
global. Postgres treats NULLs as distinct, so `(null, 'tamari')` does not
conflict with `(null, 'tamari')` — the constraint that looks like it prevents
duplicates prevents them only for product-scoped rows. Two rows for one term are
the same length, and `tts` substitutes longest-first, so which spelling won was
whatever order the planner returned: the voiceover would say one thing today and
another tomorrow with nothing to explain it.

Found because an `on conflict (product_id, term) do update` silently inserted a
second row instead of correcting the first. Migration 0036 adds a unique index
on `(coalesce(product_id, ''), term)` and collapses the duplicates it found.

## 131. Retention: a mechanism, still with no number

0035 built `purge_operational_logs(interval)` with no schedule and no default,
because the window is a product and legal question. That left a capability
nobody could reach without opening psql.

`settings.log_retention_days` is that window, and **null — the default — means
keep everything**. That is the absence of a policy rather than a policy, and it
is the correct state until someone chooses. A `purge_logs` job applies whatever
is set, daily, and does nothing at all while it is null. `/settings` has the
control, and setting it writes an audit entry.

The three retentions stay separate, as asked:

- **Operational** — jobs, notifications, agent runs, capability probes. Bounded
  by the setting above. Live state is never eligible: a queued job and an unread
  notification survive any window.
- **Audit log** — never purged by this mechanism at all. What a human decided is
  a compliance record, and the schema should not answer that question quietly.
- **Sentry** — set in the Sentry project, not reachable from this codebase.
  Named here so it is not assumed to be covered.

## 132. Series is superseded, and the screen now says so

`/series` renders rows only `supabase/seed.sql` creates. Nothing sets
`content_items.series_id`, so the numbering, cadence and `next_sequence` in a
carefully designed schema drive nothing.

**Not built, deliberately.** Campaigns are the same idea, finished: a named run
over a window, a creation surface, slots that enqueue `generate`, a worker
handler, and a product-ceiling override for the window. Building series would
duplicate that to satisfy a checklist.

The screen now says it plainly — series cannot be created, what is listed came
with the starter data, and a campaign does the job today. The open decision is
whether open-ended numbering is worth having *on top of* campaigns, which is a
product question rather than missing work.

## 133. The newsletter drafts for an audience of nobody

`draft_newsletter` runs weekly. `subscribers` has no signup surface at all — the
only writer in the repository is the unsubscribe route — so the audience is zero
and every run produced an issue in `pending_approval` that could not be sent to
anyone.

Guarded: no confirmed subscribers, no issue. An unconfirmed row does not count,
because `send_newsletter` filters on `confirmed_at` and could not send to one
either. The drafter resumes on its own the moment a subscriber exists.

Cheap rather than free — `composeNewsletter` is deterministic and spends no
model credits — so this is about not filling the operator's approval queue, not
about money. Its first tests came with the guard; it had none before.

**Whether Halyard runs a newsletter is untouched.** The schema anticipates
signup via the link-in-bio page (`source` defaults to `link_in_bio`), and
building that means email capture plus double opt-in, which needs Resend. No UI
promises a newsletter today, so there is no stale claim to remove — the feature
is coherently dormant, and the decision is a business one.

## 134. The one public surface could be made to throw

`/r/[id]` is the only unauthenticated route in Halyard, and its own comment says
it "never fails closed" — a missing item, an unconfigured product or a malformed
id all land on a homepage rather than an error.

One path did fail closed. `routeClick`'s bot branch passes
`webBase ?? destinations.web ?? ''` into `withParams`, which calls `new URL('')`
— and that throws. A preview crawler is exactly who reaches it: every link
shared on X or Facebook is fetched by one, and any `utm_*` parameter is enough
to enter the branch. A product with no web destination configured would answer
a link-preview fetch with a 500.

`withParams` now returns the base unchanged when it is not a URL, which lets the
route's existing "no destination" answer handle it — a 404 naming what to
configure rather than a stack trace shown to whoever clicked.

Also checked while there, and clean: the destination always comes from the
database, incoming parameters are only ever *added* to it and never replace the
host, and the id is validated before the query. There is no open redirect.

## 135. My own retention purge could never delete a notification

§123 made only *read* notifications eligible, on the reasoning that an operator
who has not looked yet is owed the message. The reasoning is sound. The
predicate was inert: **nothing in Halyard has ever set `read_at`**. There is no
dismiss control and no code writes the column — the health screen simply renders
the twenty most recent.

So `read_at is not null` matched nothing at any window, and notification
retention was a setting that did nothing. A protection that cannot fire is worse
than none, because it reads as coverage — and this one was written, tested and
documented three passes ago by me.

Migration 0038 purges by age. The operator's guard against losing something they
have not seen is the *length* of the window they chose, which is a real control
on `/settings`, rather than a flag nothing sets. Live rows elsewhere are still
protected and `audit_log` is still never purged.

The alternative — marking notifications read when displayed — was rejected: it
would make "read" mean "was briefly in a list of twenty" and invent an inbox
this product does not have.

## 136. Forty-eight tests passed while a live refresh token stayed in the database

`disconnect.test.ts` drives `disconnectAccount` with a **stubbed** query
function. Its `ERASED` constant is what the stub returns, so the suite proves
the read-back logic reacts correctly to a row that is already erased — and never
runs the UPDATE that does the erasing.

Deleting `refresh_token_enc = null` from that statement left all 48 tests green.

This is the most consequential vacuous test found so far, because `/data-deletion`
is a **public page** that tells a platform reviewer Disconnect "removes the
encrypted access and refresh tokens, the recorded permissions, the identity
confirmation, and discards any credential staged mid-reconnect". Nothing
verified the sentence.

`disconnectDb.test.ts` now runs the real statement against a real Postgres and
asserts each clause of that promise, including that no ciphertext survives
anywhere in the row and that the staged copy in `pending_connections` is gone.
The read-back guard is exercised with a trigger that quietly restores the token,
which is the failure it exists for — a policy or rule leaving the credential in
place while the call returns cleanly.

Re-running the original tamper now fails four tests instead of none.

The lesson generalises: a stub proves the caller's logic, never the SQL. Only
two test files in the repository stub a query function, and the other one stubs
a *model*, which is correct.

## 137. A column the screen displayed and nothing ever wrote

Building the pronunciation surface (§130) added a "used" column from
`voice_lexicon.hit_count`. Looking at the rendered page showed every row at
zero — and nothing in the repository had ever incremented it, since 0007.

It is the only signal for whether a pronunciation earns its place or was added
once for a word that never recurs, so `tts` now counts the terms a script
actually used. `lexiconTermsUsed` is a separate pure function rather than a
change to `normaliseForSpeech`, which has a settled signature and its own tests,
and it matches exactly the way the substitution matches — same escaping, same
case-insensitivity, longest-first — so the count cannot claim a hit the
substitution did not make.

Counting never fails the synthesis: the audio is the job, the tally is
bookkeeping.

Found by opening the screenshot of a page I had built the same night. Neither
typecheck, lint, nor any test would ever have reported it.

## 138. Twenty environment variables the code read and nothing documented

A two-way diff of `process.env.X` against `.env.example` found twenty variables
read by shipped code and listed nowhere — including
**`META_WEBHOOK_VERIFY_TOKEN`**, which is a step in the activation runbook and
which the webhook route refuses the handshake without. A fresh clone or a new
deployment had no way to learn it existed except by reading the route.

Also missing: `NEWSLETTER_FROM` (digest and newsletter both refuse to send
without it), the Explorer's sign-in credentials, the App Store attribution set,
and `HALYARD_DEV_UNAUTHENTICATED` itself.

The reverse direction was mostly false positives — OAuth client ids and secrets
are read as `process.env[env.id]`, dynamically, and are documented. One was
genuinely stale: `ALERT_EMAIL`, superseded by `settings.alert_email`, which is
what the digest reads.

`envDocumented.test.ts` now asserts both directions and is tamper-verified.
Commented entries count as documented — `# FOO=` is a deliberate statement that
FOO exists and is optional.

## 139. A server action that existed for a caller that never needed it

`shareTokenFor` was exported from a `'use server'` file "so the detail screen
can say whether a share link is even possible". The detail screen calls
`extractShareToken` directly — it is a server component, and a pure function
needs no round trip.

So the export was an unused **POST endpoint**. Every export from a `'use server'`
file is callable by anyone who can reach the app, which is why the 82-action
auth audit exists at all. Removing it removes a surface rather than a
capability, and the file records why so it is not re-added for the same reason.

The only orphan among 82 server actions, found by checking each export for a
caller outside its own file.

## 140. Novelty was claimed for ideas nobody measured

`noveltyScore` collapsed two different situations into one answer:

```ts
if (!candidate || recent.length === 0) return 1;
```

Only one of them deserves a 1. **Nothing to compare against** is a real
measurement with a real answer — the first idea in a corpus is genuinely novel.
**No embedding** is not a measurement at all, and returning 1 claimed maximum
novelty for something nobody looked at.

Three lines below, `historicalConversion` states the rule the same file was
breaking: `?? 0.5`, *"the honest neutral"*.

### Why it mattered twice

**Ranking.** Nothing writes `ideas.embedding` — the column exists, `scoreIdeas`
reads it, and no producer was ever built. So every idea took the unmeasured
branch and the constant cancelled out. It stops cancelling the moment one idea
has an embedding: an unmeasured idea would score a perfect 1 against a measured
one scoring 0.7, and **unmeasured would outrank measured** — the failure this
codebase is built around, latent and waiting for the day someone adds
embeddings.

**Explanation, and this one was live.** `explanation` is rendered on `/ideas` as
the reason an idea was chosen. At cold-start weights novelty contributed a flat
`1.0 × 0.20 = 0.20` — frequently the single largest term — so the screen told
the operator **"novelty 20%"** about an idea whose novelty nothing had compared.
A neutral is an honest number to score with and a dishonest one to cite as a
reason.

Fixed on both counts: the unmeasured branch returns `NOVELTY_UNMEASURED` (0.5,
matching the neighbouring convention), and `scoreIdeas` excludes unmeasured
factors from the explanation.

### The test asserted the defect

`expect(noveltyScore(undefined, [[1, 0, 0]])).toBe(1)` pinned the wrong answer
in place. Corrected rather than deleted, with the reasoning recorded next to it,
and joined by the case it was missing — an empty corpus, which really is a 1.

### The first tamper passed, and that was the point

Neutering the explanation filter left all 48 tests green. The fixture used the
default candidate, where lowering novelty from 1.0 to 0.5 had *already* pushed
it out of the top two — so the test was measuring the score change, not the
filter. Rebuilt against an over-served category with no renderable template,
where the 0.10 novelty term is the largest one left and the filter is the only
thing keeping it out of the explanation. The tamper then failed correctly.

§118 says to re-run a tamper after changing what a check looks at. This is the
same lesson arriving from the other direction: a tamper that passes is
information, not a clean bill.

### What was deliberately not built

An embedding producer. `ideas.embedding` has no writer, which makes the cross-run
semantic novelty check inert — but three other defences do work: exact-title
dedup within a response, `recentTitles` passed into the generator prompt, and
category cooldowns in `selectIdeas`. Adding embeddings means adding a provider
capability and a recurring per-idea cost for a 0.2-weight ranking factor, which
is an operator decision rather than a missing piece. Recorded as such.

## 141. Model lock, and the parameter that would have 400'd every request

The models are chosen. `claude-opus-5` for the eight workloads that either
propose facts which get published or gate a public claim; `claude-sonnet-5` for
the eleven drafting workloads; `claude-haiku-4-5` for the one that is
classification rather than writing.

### The blocker was a parameter nobody asked for

`AnthropicLlmClient` sent `temperature: request.temperature ?? 1` on every call.
Two things were wrong with that, and the second is why nothing would have run:

- The `?? 1` supplies the API's own default, so twenty of the twenty-one agents
  were sending a parameter that changed nothing.
- **Claude Opus 5 and Sonnet 5 removed sampling parameters.** Sending one is a
  hard 400. Every request to the models above would have failed, on a value no
  caller had asked for.

`temperature` is now sent only when a caller asked for one *and* the model takes
it. `supportsSampling` is a list of models that **do** accept sampling rather
than models that reject it, so the fail-safe direction is "omit": a model
released after this line was written loses a non-default temperature instead of
failing every request.

One caller does ask — `generateProfileCopy` wants 0.8, and it now runs on Sonnet
5, which cannot honour it. The parameter is dropped rather than sent, so the
request succeeds at the model's default. The call site keeps expressing the
intent, so it applies again if that work ever moves to a sampling-capable model.

### Four agents were on the wrong tier and nothing said so

Routing is by call site: a caller that omits `model` silently inherits the draft
tier. That is how these ended up there.

- **`take-drafter`** wrote the founder's opinion, published under their name, on
  the volume model — while the fact-check gating it and the strengthener
  following it both ran on strategy.
- **`product-discovery`, `store-listing`, `code-intelligence`** propose facts the
  Brain publishes as true. All three shared `propose()`'s default, which is
  draft. `propose()` now takes a model and they name strategy; `visual-brand`
  stays on draft, because a design language is description rather than a claim.
- **`product-reconciler`** adjudicates which of two conflicting facts survives.
  Three hundred tokens, and the last word — strategy.

`payoff-verifier` moved the other way, to Haiku: "does this hook pay off in the
body" is a verdict behind a gate, with no prose to get worse. Generation stays on
Sonnet, because `openai.ts`'s benchmark shows a weaker model there fails QC and
costs *more* after the retry.

### The first tamper passed, again

Neutering the sampling guard left all 11 tests green: they asserted
`supportsSampling()` returned the right answers, not that the client consulted
it. The predicate was tested; the behaviour was not.

`buildMessageParams` is now a pure exported function returning the exact body
sent to `messages.create`, so the question that matters — *is `temperature` in
the outgoing request* — is assertable without a network call or an injected SDK.
Re-tampered afterwards, per §118, and it fails correctly.

### Untouched on purpose

Vision stays on `gpt-5.5`: `vision.ts` describes only what is in the frame, and
the coherence gate depends on the describer *disagreeing* with the script.
Putting both on one provider would correlate them. TTS, music, Whisper,
whisper.cpp, provider fallback, prompts, agent architecture, media architecture,
and every approval and publishing boundary are unchanged.

Pricing metadata covers all three models so `agent_runs.cost_usd` stays honest.
Sonnet 5's introductory $2/$10 runs to 2026-08-31; the standard $3/$15 is used
deliberately, because an over-estimate is the safer error in a spend report.

## 142. One unconfigured account must not stop the others

The first live generation run failed the whole job. The log said `instagram
reports no supported formats`, and the `x` account — the only one that could
have produced a publishable draft — was never reached, because Instagram sorts
first and `NoUsableFormatError` was rethrown out of the per-account loop.

With `JOB_POLICY.generate.maxAttempts = 2` that is not a bad day, it is a dead
letter: daily generation stops for the product until somebody reconnects an
account the error does not name.

An account whose capabilities are unknown is a fact about **that account**. It
is now logged and skipped. The guard itself is unchanged — that account still
gets nothing generated for it, which is the point of it.

Rejected: defaulting the format. A guess about what a platform accepts is what
the guard exists to prevent, and a draft in a format the account cannot publish
fails later, further from the cause.

## 143. A hook that changes the post must be gated against the post it changed

Two defects, both visible only once a real draft existed.

`applyHookToBody` replaced the body's first *line*. X copy is one paragraph, so
a 267-character post is a single line, and "replace the first line" replaced the
entire post with its 35-character hook. The payoff — the half that carries the
value and the half the gates measured — was deleted between QC and the queue.
The opening of a single-paragraph post is its first *sentence*; a post that is
one sentence has no payoff to keep, so the hook is refused rather than swapped.

Then: the hook stage rewrites the body **after** `writeDraft` gates it, and
generation stored the new text over the old one while leaving `qc_results`
untouched. The approval screen showed a green QC computed on copy that no longer
existed — gotcha 6 in a different hat. The live draft made the exposure concrete:
the copy gate had already warned at 267 of 280 characters, so any hook longer
than the sentence it replaced took the post past X's ceiling with the stored
verdict still reading "passed".

`regateHookedBody` now runs the gates on the hooked post and returns `null` when
it fails, and the caller keeps the copywriter's opening. A better opening that
cannot be published is not better.

## 144. Whisper was returning tokens, and the audio gate was measuring them

The first real voiceover scored a 29.4% word error rate against speech that was,
on listening, word-perfect. Two causes, neither in the audio.

`--max-len 1` bounds a segment to one *token*, and whisper's tokens are sub-word
pieces: the transcript read `Your g ummy bread isn 't under cooked` and
`sh ag gy`. `--split-on-word` is the documented flag for what both callers
already assumed. The audio gate was one reader; the caption cues were the other,
and they would have put "g" and "ummy" on screen as separate cards.

The rest was orthography. `normaliseForSpeech` spells the script's numerals out
before synthesis and whisper writes them straight back as digits, so "four
hundred fifty degrees" was scored against "450 degrees" as three substitutions.
WER compares what was *said*; `tokenise` now spells numerals out on both sides.
A mispronunciation still scores, because the words still have to match.

Live result on the same audio: **29.41% → 1.18%**, under the 2% limit. What
remained was a genuine finding the gate should make — 178 words per minute,
outside the 140–175 band — which is the gate doing its job.

`whisperArgs` is exported so the flag is assertable: `transcribeWords` is mocked
everywhere it is used, so nothing in 1,600 tests could have caught this.

## 145. Captions say what the script says, at the times whisper heard

A frame at 9.56 seconds read **"Keep the rice short, 60 to 90 minutes."** The
script says "Keep the rise short, sixty to ninety minutes." Caption text was
taken verbatim from the transcript, so a mishearing was burned into the picture,
and whisper's digits with it — and digits are not even an error, they are just
how it writes.

The script is ground truth; the transcript is not. Whisper is here for *timing*,
which is the one thing the script cannot supply. `alignToScript` aligns the two
and keeps each side's contribution: the script's spelling, whisper's clock.
Words whisper never heard inherit the neighbouring span rather than vanishing.

It anchors to `vo_script` and not to the normalised script: the latter carries
lexicon terms swapped for phonetic respellings. "ZAN-thun" is the correct thing
to say and the wrong thing to print. The gates still read the transcript,
because measuring what was heard is the entire point of them.

Placed in `apps/worker/src/captions.ts` rather than in `@halyard/render`.
Remotion webpacks `timing.ts` for the browser, and the numeral speller comes
from `@halyard/core`, whose barrel reaches `node:crypto`. That import builds,
typechecks, and passes every test — then fails at render time with
`UnhandledSchemeError`. See gotcha 11.

## 146. Product Understanding is source-agnostic; MCP is one optional source

Halyard has one customer so far, and it had leaked into the architecture.
`createConnector` branched on `product.id === 'recipefix'`, so a product with
`connector_type: 'mcp'` and a perfectly good configuration fell out of the
bottom of the function as `null` — and `null` is also what "no connector
configured" returns, so the failure was indistinguishable from a choice.

**MCP is now generic.** An MCP server is the one product surface that describes
*itself*: a tool list, written by the people who built the product, is
implementation truth in a way a landing page is not. Reading it requires no
knowledge of the product, so `McpProductConnector` works for any of them.
Product-specific artifact adapters are resolved by `connector_config.adapter`,
falling back to the product id so existing rows keep working without a
migration. RecipeFix is one entry in that registry rather than a branch.

The split that makes this work: **evidence is generic, artifacts are
product-specific.** `generateSample` on the generic connector throws, because
knowing which tool produces the product's characteristic output and how to read
it is exactly the knowledge a tool list does not contain. A product with an MCP
server and no adapter still gets Halyard's richest evidence source; it just
cannot yet build posts around its own output.

**Source discovery** (`packages/core/src/brain/sources.ts`) replaces a chain of
`if`s that told nobody what it concluded. Six sources — website, App Store,
MCP, repository, screenshots, operator brief — each reporting whether it is
configured and why. Every one is optional and none is privileged: a product with
only a website is fully supported, and a second source is corroboration, which
is what moves a fact from believed to verified.

It answers *configured*, never *reachable*. That is gotcha 5 in a different
table, so the UI pairs each source with what was last **observed** from it — the
interesting case being a source that is configured and has produced nothing,
which is what a wrong URL looks like and is invisible if you show only one of
the two.

Rejected: a `product_sources` table. Availability is a pure function of the
product row and the environment, and storing a derived value creates a record
that can disagree with the configuration it describes. Rejected too: a new
onboarding step column — the evidence-sources step derives its state, so there
is nothing to mark done and nothing to get out of sync.

The agent team is unchanged. `code-intelligence` already read
`connector_surface`; it simply never had any to read.

## 147. Model calls are streamed, because one hung for eighteen minutes

`store-listing` sat in `agent_runs` as `running` for eighteen minutes on a
single call during the MCP activation run, holding a worker slot, until the
process was killed. Nothing was wrong with the prompt or the model.

A non-streamed request holds one HTTP response open for the entire generation,
and §141 raised `max_tokens` to at least 16,000 on the thinking models — long
enough that the connection is what fails. Anthropic's guidance is explicit:
stream anything with long input, long output, or a high `max_tokens`.
`finalMessage()` returns exactly the `Message` that `create` would have, so
nothing downstream changed.

Live result: the Product Brain build that hung now completes in **120 seconds**,
ten agent runs, $0.29. An explicit five-minute client timeout was added with it,
so a stall fails instead of occupying a slot indefinitely.

## 148. A malformed call the tests could not see

The first live generation against the real MCP server refused: `adapt_recipe`
requires `dietary` to be an array of at least one string, and `generate` passes
`params: sampleParams ?? {}` while nothing anywhere supplies `sampleParams`.
Every real call had been sending `dietary: undefined`. The stubbed tests passed
because a stub accepts whatever it is given.

Inventing a recipe and a diet would be fabrication. RecipeFix already publishes
the pairing: the Discover catalogue is a curated pool where each entry carries a
real `source_url` **and** the `suggested_diet` the product itself pairs with it.
The sample is chosen from that, and an explicit `url`/`text` plus `dietary`
still wins. Selection is a stable hash of the intent, not a random pick, so two
ideas get two recipes and a retry re-adapts the same one.

The retry advances to the *next* candidate. Some catalogue entries cannot be
scraped and the server answers non-2xx for them every time, so a second attempt
at the same URL spends a second credit to learn what the first already proved.

This is product-specific knowledge and it lives in the product-specific adapter,
which is the boundary §146 exists to draw.

## 149. Every real adaptation produced an empty artifact

The live server returns `{ persisted, adaptation: {…} }`. The fixture every test
was written against is the bare adaptation. `toArtifact` read `recipeName` and
`ingredients` off the envelope, found neither, and built an artifact with **no
highlights at all**.

Nothing failed. The job succeeded, the item was queued, and the artifact behind
it was empty — so no video composition could ever be chosen, and the claim
verifier had no `sourcePath` to resolve against. Both the empty video path and
the unverifiable claims had been read as separate problems for weeks.

`unwrapAdaptation` accepts both shapes. Live result on the next run: the first
video items Halyard has ever put in `pending_approval` — a real 1080×1920 render
at −14.3 LUFS built from a real adaptation — and a claims gate reporting
**5 of 6 verified against artifact** with paths like `steps[1].updated_note`.

## 150. An unreachable source must not report itself as reachable

Introduced and caught in the same session. `collectConnectorSurface` swallows a
failed tool list and returns `[]`, which is correct for the collector — an
unreachable server is not evidence about the product — but it left the handler
unable to tell "answered with nothing" from "did not answer", and it logged a
closed port as `reachable, advertised no tools`.

The tool list is now fetched by the handler, so a failure reaches the `catch`
and is reported as `unavailable — <reason>`. Verified against a closed port:
the MCP source reports unavailable while website collection is unaffected, which
is the requirement — a source that failed is not a product that lacks the
capability.

## 151. The media review stopped destroying what the voiceover measured

`review_media` finished with `set qc_results = $2`, replacing the whole object
with `{passed, gates, ranAt}`. `tts` stores the transcript, the delivery
measurements and **the caption cues** under a sibling `audio` key, and every one
of them was destroyed a few minutes after being measured.

§119 fixed the *gate list* this way and left the object around it still being
overwritten. The sharp end is captions: `loadVoiceover` reads
`qc_results.audio.captions`, so any render after this point — a retry, a
regenerate, a second platform — would burn a video with no captions onto an
asset nothing else flags. It also cost this pass its evidence: the transcript
behind a failing WER score was gone by the time anyone looked.

Both write sites now merge. The first tamper of the guard *passed*, because the
test reached a path that returns before writing; the test was rewritten to
attach a still so a write actually happens, and the re-tamper fails correctly.

## 152. The audio gate was measuring the transcriber, not the speaker

A real video failed at **WER 2.3%** against a 2% ceiling, and the brief was to
decide whether the ceiling was right rather than to move it.

Five real voiceovers were measured. Four scored 0–1.08%; one failed at 2.94%.
The diff, word by word, showed what the failures were made of: the script said
`tradeoff`, the narration said "tradeoff", and whisper wrote `trade off`. Two
errors against sixty-eight words, for a word that was pronounced correctly. The
other run's only finding was a spurious `the`. Numerals were already reconciled
by §144. And the same script that scored 2.3% scored **0%** on re-synthesis, so
the number was never stable enough to move a threshold from.

None of it is meaningful to a viewer. It is inaudible, it cannot reach the
captions — those are anchored to the script since §145 — and it touches no
product claim.

So **the 2% ceiling is unchanged**, and what it measures is what changed.
`reconcileWordBoundaries` fuses a token on one side that equals a run of tokens
on the other, because that is the same utterance written two ways. A genuine
mispronunciation still scores 40%, a wrong number still scores 25%, and a real
inserted word still scores — measured, not forgiven. The failing video re-ran
through the production path and its audio gate now reads **WER 0.0%**.

Rejected: raising the ceiling. The evidence said the measurement was wrong, not
the standard. Rejected too: replacing WER with a bag of separate rules — the
aggregate is fine once it stops counting orthography.

## 153. A link is not attached until it is known to be reachable

§111 made *generation* refuse to build a link from an unset
`HALYARD_PUBLIC_URL` and stopped there. An item drafted on a developer's machine
carries `http://localhost:3200/r/…`, and nothing between that row and the
platform looked at it again: no QC gate reads `link_url`, and the adapters treat
it as opaque. The first real publication candidate carried exactly that.

On X it is not only a dead link. The adapter's `linkStrategy` is `first_reply`,
so the link buys a **second billed post** to carry it — the run would have been
two posts, one of them a URL no reader can open.

`publish` now refuses. Refused rather than silently dropped, for the reason §111
gives: publishing the same post without its link changes what goes out, and that
is the operator's call. Clearing `link_url` is how an operator makes it, and
that is what was done for this pass, recorded in `audit_log`.

## 154. The only destructive command could publish something nobody chose

`first-contact --publish` is documented as refusing "to run without an explicit
item id". It did not. `--platform=x` parsed with `=` while `--item` expected a
following token, so `--item=<uuid>` — the spelling the sibling flag teaches —
matched nothing and was dropped. `pickItem` then fell back to whatever sorted
first.

Observed, not theorised: a dry run naming one item printed a different one, an
old 35-character post from the §143 hook defect. Neither confirmation would have
caught it — one asks for the account handle, the other for the word PUBLISH.

Both spellings are now accepted, and `--publish` refuses without an explicit id,
which is what the header always claimed. The parsing moved to `scripts/args.ts`
so it can be tested without the script's `pg` import, and `vitest.config.ts` now
includes `scripts/**` — these are shipped code, and one of them spends money.

## 155. A malformed job payload is a permanent failure, not a database error

`collect_metrics` read `String(job.payload.publicationId)`, and `String(undefined)`
is `'undefined'`, which reaches Postgres as a uuid and returns
`invalid input syntax for type uuid: "undefined"` — a message about the database
rather than about the job. It was then **retried**, spending the budget
rediscovering a row that cannot become valid.

Every sibling handler already had this guard. Now this one does too.

## 156. Halyard's draft is authoritative; a platform's is a delivery outcome

Three things get called "draft" and they ask an operator for three different
things, so they are now three different states rather than one word.

- A **native draft** is an object the *creator* sees in their own app and
  finishes there. TikTok's inbox upload is the only one among these seven
  platforms, and Halyard cannot publish it afterwards.
- A **private upload** is real content on the platform, unpublished, which
  **Halyard can still publish** over the API. YouTube's `privacyStatus: private`
  is this, and `status.publishAt` even schedules it.
- A **media container** — Instagram, Threads — is neither. The creator never
  sees it, it expires after 24 hours, and it exists to be published seconds
  later. Recording it as an unpublished upload would invent a capability.

**The conflation was live.** YouTube returned `mode: 'draft'` for a private
upload, so the queue told an operator to open Studio and finish a video that
needed no finishing — while hiding that Halyard could have published it. It is
`mode: 'private'` now, `publications.publish_mode` gained the value (migration
0039), and `readDelivery` gives each outcome its own sentence.

The dangerous half was one line in `publish`:
`mode === 'draft' ? awaiting_manual_publish : published`. The moment a third
outcome existed it would have been recorded as **published** — `published_at`
stamped, the 90-day repost clock started, metrics collected against a private
video. `statusAfterDelivery` inverts the polarity: only `direct` publishes, so a
delivery capability added later fails closed instead of claiming a post that
does not exist.

`PlatformConstraints.delivery` is the registry, deterministic and per-adapter,
with each flag carrying the documentation that justifies it. Every value is a
claim about the **API**: a platform whose web UI offers drafts by hand is
`false`. The matrix and its sources are in `PLATFORM_COVERAGE.md` §13.

Rejected: a `native_deliveries` table. `publications` already stores
`publish_mode`, `platform_post_id`, `permalink` and `manual_publish_url`, and a
second home for the same facts is how two records of one delivery start
disagreeing. Rejected too: a `native_draft` item status. Halyard's lifecycle
answers "has a human approved this"; the platform's answers "what is over
there". Collapsing them would let a native draft look like progress toward
publication, which is exactly backwards — nothing publishes because a draft
exists.

## 157. An edit re-runs what can be re-run and un-verifies what cannot

`qc_results.gates` is what the queue renders, and `editItem` left every entry
untouched. So an operator could rewrite a post and the screen went on showing
`copy: passed (0 flags)` and `claims: 2/2 verified against artifact` for words
nothing had examined — §143 again, with the operator doing the rewriting.

The two gates get different treatment because only one can be settled at edit
time. The copy gate *is* the slop filter, which is deterministic and already
runs on the new text, so it is **re-run**. The claims gate cannot be: the claims
were extracted from the old wording and checked against the artifact, and
whether they survive an edit is a question only a re-verification answers. It is
marked `not re-verified since a human edit` rather than left green.

Every other gate is returned untouched. Editing a caption does not un-measure a
render, and blanking the visual verdict would mean re-rendering to get it back.

`gatesAfterEdit` is pure and lives beside `runAllGates`, so the rule is
assertable without a server action, a database or a session.

## 158. Caption legibility is measured, not chosen

Captions were `color: brand.ink` with a `brand.background` outline, fixed,
whatever the composition put behind them. On a cream card that is legible — the
frames prove it. Over a screen recording of a product, which is exactly what the
capture path produces, it is black text with a pale halo on arbitrary pixels,
and there is no value of "brand ink" that is readable on all of them.

`captionStyle` decides from what is actually behind the words, and the rule is
not a taste: **the result is guaranteed to clear WCAG AA at 4.5:1**. A test
sweeps the colour cube and asserts it. Which brand colour is used, whether a
plate appears and how heavy the type is all follow from that measurement.

Two backdrops, because they are genuinely different problems. A **surface** has
one known colour, so the brand's own ink and paper are measured against it and
the better one wins; a plate appears only when neither clears the bar, which
happens on mid-tones where an outline cannot rescue legibility either. **Media**
has no single colour — it changes thirty times a second — so a plate is not
optional there, and it inverts on dark footage so a caption over a dark UI does
not become a bright slab.

The palette is never left. A caption may change treatment; it may not become a
colour the product does not own. An unparseable token resolves to mid-grey,
which contrasts with nothing and therefore forces a plate — guessing white would
produce a style that looks fine in the object and is invisible on the frame.

Deterministic on purpose. The visual gate already has an independent critic, and
a generator that graded its own contrast would be marking its own homework.

Rejected: picking a new font and a brighter colour. The complaint was that
captions looked poor, and the fix for that is not a nicer hardcoded style — it
is a style that is correct for each backdrop, which is the thing the old one
could not be.

## 159. A moved attribute degrades a capture rather than ending it

`aria-label="Choose your swap"` was, per the file's own header, "the one
genuinely good hook" RecipeFix offered. It moved. Production then lost three
capture jobs a day to `Selector [aria-label="Choose your swap"] did not
resolve` — three attempts each, then dead, on a page that was working fine for
humans.

The answer is not a better guess at the markup, because markup moves. A step now
carries `fallbackSelectors`: the same intent said several ways, ordered most
durable first — a test id, then role and accessible name, then visible text,
then structural CSS — and `resolveSelector` reports **which one answered**.

That last part is the point. A flow running entirely on its last candidates is
still producing footage *and* is a warning, and `selectorHealth` separates
`drifted` from `broken` so the operator learns before the day it stops.

Non-final candidates get a 2.5s probe rather than the step's full timeout.
Trying four selectors at thirty seconds each is how a capture job hits the
five-minute ceiling and dies for a reason that has nothing to do with the page.
The final candidate keeps the real timeout: if everything else has drifted, that
one *is* the step and deserves the full wait before it is called broken.

The `data-testid` candidates lead the chains deliberately. They cost nothing
while absent and become the durable hook the day RecipeFix adds them — which
remains the right fix on that side, and is now an improvement rather than a
prerequisite.

## 160. The creative plan: how a story is told, decided before anything renders

Halyard could already choose *what* to make — a format from `chooseFormat`, a
composition from `chooseVideoComposition`. It could not decide *how the story
should be shown*: which moment is the before, which is the change, what deserves
to be held on.

**Above `chooseVideoComposition`, not instead of it.** Composition selection asks
which template can carry an artifact; the plan asks what the beats are and how
long each one is. The plan's beats become `Scene[]` — the shape `layoutScenes`
has always taken — so it drives the existing timing engine rather than a second
one. A second timing system would be a second set of rounding bugs.

**No agent, and that is the decision, not an omission.** Every judgement here is
a fact about the artifact or arithmetic over it: a `swap` highlight carrying both
a `before` and an `after` **is** a transformation. Beat order, weights and
durations are structure. A model that chose its own emphasis and then rendered it
would be grading its own work, which is precisely what `review_media` stays on a
different provider to prevent.

**Product-agnostic by construction.** The planner reads `Highlight` and nothing
else — no product vocabulary, and a test asserts a non-RecipeFix artifact plans
identically. Anything that needs to know what a swap *means* stays behind the
adapter, per §146.

`planBeforeAfter` returns `null` when the artifact contains no transformation.
That refusal is the important part: an artifact with nothing that changed cannot
be told as a before/after, and the composition falls back to its old flat layout
rather than rendering an empty stage.

Live result on a real MCP adaptation: five beats — a quick hook, the
best-explained change **held** at three times the hook's weight, two more changes
as corroboration, then a `proof` beat carrying the change's own reason. Evidence
resolves to real artifact paths (`ingredients[3].changeReason`). The `proof`
scene did not exist before; it is the plan visibly changing the render.

Extension is a planner function and a `CreativeType` case, not a new
architecture. Platform differences already work through the same seam — the
number of changes shown is capped per platform, because a 9:16 frame fits about
three pairs before the bottom lands under the platform's own UI.

## 161. An item that has a voiceover and cannot read it fails loudly

This looked like a defect worth fixing: captions vanished whenever the audio
bytes could not be fetched, because `loadVoiceover` returned `null` and the
caller reads `audio?.captions`. A silent caption-led cut is something this
file's own header calls "a legitimate state", so the coupling appeared to make a
legitimate outcome unreachable.

It is the wrong reading, and the code already said so. `readAssetBytes` throws on
the Supabase path for exactly this case, with its reason written down:
*rendering would otherwise produce a silent video from an item that has audio*.
The local fallback returned `null` instead — so the same broken state failed
loudly in production and degraded quietly on a laptop.

The defect was the **inconsistency**, not the coupling. `loadVoiceover` now
throws when a voiceover asset exists and cannot be read, naming the asset. The
legitimate silent cut is unaffected: an item with no `vo_asset_id` returns `null`
before any of this and renders silently, as designed.

Not changed: `readAssetBytes` itself, which the music-bed path also uses and
where `null` correctly means "no bed available".

## 162. A creative type is a map from role to treatment, not a branch

`TransformationDiffVideo` drew beats through `if (beat.role === …)` inside
itself, so a second creative type meant either editing that file or copying its
sequencing, timing and caption wiring into a new one. The first makes one
composition the home of every creative type; the second forks the timing engine.

The seam is a **treatment set** — `Record<role, React.FC>`. Sequencing, the
`Scene[]` layout and the captions live once in `PlannedBeats`; a composition
supplies only the mapping. A future `tutorial` maps `step` to a numbered
instruction and `result` to the existing transformation card, and the
transformation file is never opened. A test asserts exactly that, by building a
tutorial-shaped set without importing anything from `compositions.tsx`.

A role with no treatment renders **nothing**. A beat drawn by a component that
was not written for it is worse than a beat omitted.

What deliberately stays out: which beats exist, in what order, and for how long.
That is `CreativePlan` (§160), decided from artifact facts before anything
renders. This file only knows how to draw a beat it is handed.

### Emphasis became visible

`hold` and `quick` were spent entirely on duration, and on a muted phone a
merely-longer scene is close to imperceptible — so the hero transformation was
not perceptibly the hero. `scaleFor` derives a type scale from the same value,
so size and duration cannot drift apart. Bounded to 0.92–1.18: a hierarchy cue,
not a licence to overflow the safe area.

### Two layout defects, both found by looking at frames

**Percentage padding resolves against width.** `paddingBottom: '28%'` on a
1080×1920 frame reserves 302px, not the 538px it reads as — so the first render
through this seam put the caption straight through the reason text. The band is
now computed from `useVideoConfig().height`. This is the kind of defect no test
asserting "the composition rendered" can catch.

**The opening was bottom-anchored like everything else**, leaving more than half
the canvas empty above the only line a scrolling viewer reads. `anchorFor`
centres the hook and bottom-anchors the rest, so ordinary beats sit directly
above the captions and the eye travels down one block. Role-driven, so a future
type inherits it.

### Remaining, and not hidden

The composition is still type on a flat brand ground, and a short beat leaves
real empty space above it. The honest fix is product media in that band — a
capture-backed treatment setting `captionBackdrop: 'media'`, which §158 already
supports — not decoration. Inventing UI to fill the frame is the thing the slop
filter exists to prevent, applied to pixels.

## §163 — Real product footage in the frame

§162 ended with the honest note that the composition was still type on a flat
ground, and that the fix was product media rather than decoration. This is that
media: a `demo` beat playing a real recording of RecipeFix adapting a recipe,
cut from a live capture, wired through the existing plan → treatment → timing →
caption path. Nothing about the visual story is drawn; every frame in the band
is a frame that was recorded.

### A recording is not footage

The first capture ran fifty seconds, of which roughly ten were the product doing
anything — the rest was a sibling flow stalled on a selector that no longer
exists. `footageSpansFor` decides deterministically which parts are worth
watching, from measured step offsets rather than step names, and `cutFootage`
trims and joins them. Cutting rather than speeding up is deliberate: a speed
ramp over a spinner is still a spinner, and §159 rejected a synthetic progress
overlay for the same reason.

Three rules came out of cutting real footage rather than reasoning about it:

**Spans are plural.** The result card appears *during* the adaptation wait, so a
single span either shows three seconds of spinner or cuts away before the result
exists. An elision is two spans joined.

**Filter by action, not by name.** `let the result settle` reads nothing like a
wait; its action is exactly that. Names are prose an author chose; actions are
the flow contract.

**The wait after an elision is the payoff.** Dropping every wait meant the
adapted result was never on screen — the piece showed the setup and then a
400ms flash of an ingredient expanding. A wait following an elided step is held.

### The refusals

- No capture produced footage → no `demo` beat. The planner never goes looking
  for a file, never falls back to a previous capture, and never names one.
- A `demo` beat whose `media` is missing renders **nothing**. Not a placeholder,
  not a mock interface, not a drawn approximation of a state nobody recorded.
- A `footage:` tag that does not parse is not footage. Nothing fills in a
  default length or points at the bundle root.
- Footage older than 30 days is not evidence. A capture is a claim about what
  the product looks like, and the failure mode is silent — stale footage renders
  perfectly.

### Product knowledge stayed in configuration

The whole product interface scaled to 1080 wide is unreadable on a phone, so the
cut crops to a `focusRegion` before scaling — crop-then-scale, because scaling
first leaves the interface at desktop size shrunk onto a phone. The *mechanism*
is generic and lives on `CaptureFlow`; RecipeFix's numbers live in that flow's
configuration, alongside its selectors. The label is `In the product`, which is
true of every product; anything more specific would be product vocabulary inside
the generic creative layer.

### Three defects the tests could not have found

**Remotion caches bundles by code and copies `publicDir` into them.** Footage
written after a bundle exists is therefore never served: the code has not
changed, the cache hits, and the render is handed the previous copy. The first
footage render 404'd on a file that had been sitting on disk for ten minutes.
The bundle now re-copies `public/` over the cached result, and `publicFingerprint`
covers size and mtime — a recapture writes the same filename, so a names-only
check would silently serve last week's product.

**`minSeconds` is a floor, not a ceiling.** A held demo beat took 8.7s of a
27.9s piece over 3.8s of footage, and Remotion froze the last frame for the
difference — four and a half seconds of stillness presented as a demo. Scenes
now accept `maxSeconds`, and the time a capped scene gives up is redistributed
to the scenes that can use it. Emphasis says how *important* a beat is, which is
right for a card, whose length is a choice, and wrong for footage, whose length
is a fact.

**The cap reached the render row and stopped there.** `PlannedBeats` mapped
beats to scenes field by field and dropped `maxSeconds` silently. The re-render
came back byte-identical — nothing threw, nothing logged. The mapping is now
`beatScenes`, a function with tests, rather than an object literal inside a
component.

### Captions are decided once for the piece

Only one beat is footage, so a per-beat caption backdrop would switch styles
mid-video, which reads as two videos spliced together. A plan carrying footage
uses §158's media plate throughout. Over a flat surface that is merely a
stronger caption, and stronger is the safe direction to be wrong in.

### What the render actually measured

`visual` passed. `retention` warns at a 16.7s static stretch — which *begins
where the footage ends*, so the capture beat is registering as the pattern
interrupt it was meant to be, and the transformation cards that follow are not.
`audio` fails on this item for reasons that predate footage: 5.5% WER and 195
wpm. Those are properties of the voiceover, not of the creative.


## §164 — Positioning is product-centric, and lives in one file

Halyard is positioned as an **autonomous product-marketing system for builders**,
not as a scheduler, an AI copywriter or a generic content generator. Those are
components; treating any of them as the identity is what produces a product
indistinguishable from a crowded market.

The substantive choice is where the system *starts*. Most social tools start with
a person describing their business, and that description becomes the brief, the
brief becomes every prompt, and nothing downstream can tell a real capability
from a remembered sentence. Halyard starts with the product — website, code, UI,
artifacts, MCP — and the operator brief is one evidence source among six. That is
not a marketing frame laid over the architecture; it is the architecture, already
enforced by `product_facts` citing `product_evidence` under a trigger, by
`deriveFactStatus` deciding status from evidence alone, and by §146's split
between generic product intelligence and product-specific artifact adapters.

**Rejected: positioning around the feature list.** Post generation, scheduling,
trend discovery, repurposing, analytics, approval workflows and autonomous
posting are all table stakes now. Claiming differentiation from having them
invites a feature comparison Halyard does not need to win.

**Rejected: absolute claims** — "the only", "the first", "no competitor does
this". No competitive research exists in this repository to support one, and an
unverifiable absolute makes every verifiable claim read as marketing too.

`docs/POSITIONING.md` is the canonical source, and it carries a four-level claim
ledger so the marketing and the code cannot drift apart silently: **Today**
(exercised against real providers), **Established** (built, unexercised or
partial), **Direction** (decided, unbuilt), **Not yet** (must not be implied).
The most consequential entries are that Halyard does not learn from performance
today, does not read third-party social content, and has published nothing —
each a deliberate sequencing decision recorded here, and each far cheaper to
state plainly than to have discovered in a demo.

## §165 — Bounded self-correction: the loop that fixes its own work

Halyard ran its gates and stopped there. A failing verdict set
`content_items.status = 'failed'` and waited for a person — so the system could
tell you precisely what was wrong with a video and could not do anything about
it. This is the loop that tries first.

```
generate → tts → render → review_media → [correct_content] ⤴
                                       └→ pending_approval
```

The controller orchestrates the pipeline that already exists. It synthesises
nothing, renders nothing and reviews nothing: it decides what the smallest
useful change is, applies it, invalidates exactly the gates that change can
reach, and re-enters the chain at the earliest stage that has to run again.
`tts` already releases the renders it gates and `render` already enqueues
`review_media`, so re-entering at the right point is enough — including
enqueuing the controller again with the new verdict.

### The rule is a table, not a judgement

The obvious design is to hand a failing artifact to a model and ask what to do.
That produces a plausible answer every time, **including for defects that cannot
be corrected by generation at all** — missing evidence, absent testimonial
consent, a measurement that never ran.

Five of the eight gates already emit `{ rule, severity, message }`, and that
rule string is a stable identifier chosen by whoever wrote the check. So the
mapping from "what failed" to "what to change" is a table keyed on it, written
before any artifact fails. No model is consulted anywhere in the decision path.
`policyCoverage.test.ts` reads the gate sources and fails if a rule has no
entry — the technique `handlerCoverage.test.ts` uses on `JOB_KINDS`, and it
immediately found four uncovered `delivery.*` rules.

A model writes in exactly two places — revising copy and rewriting a narration
script — and neither is asked whether a gate was right. Whatever comes back goes
through the same deterministic gates, because `writeDraft` and `writeVoScript`
already run the slop filter and the claim verifier over their own output and
refuse to return copy that fails.

**Worth naming: the copy half of self-correction already existed.** `writeDraft`
has always generated, gated, called `buildFeedback` and retried. What it could
never see is anything measured *after* copy time — audio, frames, retention,
coherence — because those live in different jobs. That gap is what this fills.

### Two corrections that look obvious and are wrong

**Word-error is a script fix, not a re-synthesis.** The tempting answer is "say
it again", but synthesis of the same script is near-deterministic: the second
attempt reproduces the same mispronunciation and the loop has paid a provider
call to learn nothing. The lexicon is worse — `voice_lexicon` requires a
`phonetic`, and a machine inventing one is fabricating evidence about how a word
sounds. What can be corrected is the script: spell the numeral, hyphenate the
compound.

**Pacing is not fixed by writing fewer words.** `audio.pacing` is
`scriptWords / measuredDuration`, and a synthesiser reads at roughly its own
rate — so cutting words shortens the audio proportionally and the ratio barely
moves. What moves it is sentence structure: full stops become pauses, pauses
lengthen the audio without adding words. And a read that is too *slow* is not
correctable at all, because the gate's own remedy is a higher synthesis speed
and `SynthesisOptions` has no speed control. It escalates rather than pretending.

### Invalidation is computed from what was written, not what was allowed

Three places already answered a version of "what does this change invalidate" —
`gatesAfterEdit` (§157), `regateHookedBody` (§143), and `review_media`'s merge —
each correct for exactly one change. This is the general form, and the three
remain, because they encode caller knowledge the table does not have.

The governing rule is that **correctness beats economy**: the question each entry
answers is not "did this probably change the gate's input" but "can I *prove* it
did not". A copy revision that left the narration alone keeps its audio verdict;
one that rewrote the script does not — and which of those happened is read from
the components the applier reports actually writing, not from the ones its action
permits. An invalidated gate becomes `skipped` with a reason, never dropped and
never left green, so a required gate that is not re-established still blocks.

`ACTION_SCOPE` states what each action may and must not touch, and `assertScope`
checks it against what really changed. A `resynthesise_voiceover` that rewrote
the copy is a bug, and it is caught at the seam rather than found later in a diff.

### Stopping

- **All required gates pass** → back to `pending_approval`, and no further.
- **Budget spent** → three corrections or $2, whichever binds first; the best
  iteration is preserved and the operator is told what was attempted.
- **Uncorrectable** → missing evidence, absent consent, an unknown rule, a
  correction already tried twice without clearing its target, or a provider that
  will not answer. Each escalates with a sentence saying why.

A later iteration is never assumed better. Among iterations with no blocking
gates, fewer warnings wins, then **the earliest** — the anti-churn rule, because
two passing versions are both publishable and "the model liked it more" is not a
measurable reason to prefer the more expensive one.

### The history is append-only, and enforced

`content_iterations` refuses UPDATE and DELETE by trigger. The operator-facing
promise is a readable history — version 0 failed because X, version 1 attempted
Y, version 2 passed — and a history that can be rewritten is not evidence of
anything. §151 is why that is a trigger and not a convention. Each row is written
once, complete: the correction chosen *in response to* an iteration is stored on
that iteration's own row, which is what makes every row final at insert time.

Cost reuses `agent_runs.cost_usd`, summed over the window between iterations. It
is a window attribution rather than a per-item ledger — `trigger_ref` holds a job
id — and the column comment says so, because a number that looks exact and is
not is worse than one that admits its method.

### What real execution found that the tests could not

**A false regression.** The first live run cleared the voiceover so `tts` would
produce a new one, the controller ran again before `tts` had, and the regression
check saw `hasAudio` go true → false and called it a regression. It is the
correction's own mechanism, observed halfway through. The fix is not a softer
check but a refusal to judge an unfinished rebuild: while any invalidated gate is
still `skipped`, there is nothing worth judging.

**A rebuild that rebuilt nothing.** `tts` releases renders whose status is
`queued`; after a successful render those rows read `done`. So a voiceover
correction produced new audio, released nothing, and left the old video in place
with the media gates never re-running — reported as `rendersReleased: 0` in a log
line that otherwise looked like success.

**A provider failure burning the retry budget.** Anthropic credits ran out
mid-correction, `writeVoScript` threw, and the job died after three attempts with
no iteration recorded and nobody told. Every attempt bought the same 400. It now
escalates on the first occurrence, and says explicitly that this is a failure of
the loop rather than of the content.

**Nothing could rehydrate a stored artifact.** `content_items.product_artifact`
holds the provider's raw JSON; the generic `highlights` wrapper every downstream
component reads is derived and was never stored. That was fine while only
generation used it, because generation had just built it. `rehydrateArtifact`
closes it, keyed by `connector_config.adapter` like connectors are.

### Two guards that were not guarding what they claimed

**The append-only trigger blocked its own cascade.** §165 said the
`on delete cascade` from `content_items` was "deliberately still allowed —
the trigger guards edits to history, not the removal of an item that no longer
exists". It was not allowed: the trigger refused every DELETE, cascades
included, so any item with correction history could never be removed and a
retention purge or an erasure request would fail on a foreign key nothing was
permitted to clear. The fix reads the one signal that cannot be forged —
Postgres deletes the parent before the cascading children, so an absent parent
*is* the cascade, and a direct delete still finds the item present.

**And the test that proved it proved nothing.** Every test in
`contentIterations.test.ts` opened `select id from content_items limit 1` and
bailed with `if (!itemId) return`. An isolated database is built from the
migrations alone and seeds nothing, so `itemId` was always empty and all seven
tests returned before their first assertion — including the one asserting the
cascade worked, and the one asserting the trigger was doing the work. The file
reported green while exercising nothing, which is §143 and §70 again in code
written to prevent exactly that. It now builds its own fixtures and asserts
`itemId` is a real uuid before anything else runs.

**The correction claim protects spend, not rows.** Two controllers on one item
would both read the same history, both decide the same correction, and both
act — and the unique `(content_item_id, iteration)` key would hide the loser's
*row* while its ElevenLabs synthesis and its render had already been paid for.
The queue is the first line: `review_media` now enqueues with a **stable**
dedupe key, and `jobs_dedupe_idx` is unique while a job is queued *or running*,
so the `Date.now()` that used to be in that key was defeating the protection the
index already provided. A session advisory lock is the second line, for a job
inserted by a path that skipped the key.

The first version of the concurrency test counted iteration *rows* and passed
with the claim removed — because the unique key already guaranteed one row. It
counts side effects now, and the tamper produces
`['review_media', 'review_media']`.

### `skipped` means two different things

Found by looking at the *rendered operator view* rather than the database, which
is the only reason it was found at all. Every version of a real item's history
listed `destination.unspecified — no link` and `proof.unspecified — no quoted
testimonial` as defects it had failed on. Both gates were `skipped` because they
genuinely had nothing to examine: the post has no link and quotes nobody.

A **required** gate that did not run is the "never verified is not passed" rule
this codebase is built on, and it is a real defect. An **unrequired** one is a
check with nothing to look at, and recording it as a defect is noise in the one
screen that exists to explain what went wrong. `defectsFrom` now takes the
required set and only manufactures a defect for the first kind.

It never affected a decision — `blocking()` has always ignored unrequired gates
— which is exactly why the database looked fine and the screen did not.

### Implemented, and not

**Implemented:** bounded self-correction — detection, diagnosis, a deterministic
correction policy, dependency-aware revalidation, regression protection, stop
conditions, cost bounds, an append-only history, and an operator view of it.

**Proven live:** `accepted`, `corrected`, `rejected_regression` and `escalated`
— the last twice, including against a genuinely unavailable provider.

**Not yet proven:** a correction that clears its targeted defect and is accepted
on the following pass. That is the loop closing, and it is blocked on Anthropic
credit rather than on anything in this design. The honest reading of §165 today
is that every mechanism is verified and the end-to-end success case is not.

**Not implemented, and must not be read as such:** performance-driven learning
from published results. That remains exactly where `POSITIONING.md` §11 puts it —
zero publications, zero metrics, zero scores. This loop makes Halyard better at
the artifact in front of it. It learns nothing across artifacts.

## §166 — Setup footage is executed, not shown

The first capture-backed render spent roughly half its hero beat on work no
viewer wants: it opened on a **blank white page**, dismissed a promo bar, and
sat on a spinner. The product's actual output — the adapted recipe — arrived in
the last moments of a 3.8-second beat that existed to show it.

A flow step can now say `setup: true`.

### Why this is not `elide`

The two look similar and mean opposite things, and collapsing them would lose
the more valuable one.

`elide` is a **claim about the product**: real work happened, here is how long
it took, and the edit cuts it with that measured duration as a caption. It is
the honest replacement for the speed ramp and synthetic progress overlay §159
rejected. The adaptation wait is elided and must stay that way.

`setup` says **there is nothing to tell the viewer**. A page loading, a banner
closing, a placeholder disappearing. No caption, because no claim.

A test asserts no step carries both.

### Not shown is not not-run

The distinction the whole design rests on. A setup step executes exactly as
before: it is verified, its selector health is recorded, its offsets are
measured, its failure still fails the flow. The artifact depends on it — without
the page load there is no adaptation to film. `setup` is read in exactly one
place, `shows()` inside `footageSpansFor`, and it withholds screen time and
nothing else.

It is checked *before* the payoff rule, so a setup step cannot be promoted back
in by happening to follow an elision.

### Where the knowledge lives

In the flow configuration, beside that flow's selectors and focus region —
because which steps are setup is knowledge about *this product's* flow. The
footage engine stays product-agnostic and guesses nothing (§146, §163). Nothing
in `packages/render` or the selection engine knows what a "recipe" is.

### What was classified, and what deliberately was not

**Setup:** `open the converter` (navigation to a blank page), `dismiss the App
Store banner` (chrome, zero product information), `wait for the demo card to
clear` (a placeholder disappearing — the spinner that was on screen at five
seconds in the previous render).

**Kept, deliberately:** `switch to the Link tab` and `paste the recipe URL`.
Both were on the list of suspected waste and both survived inspection: together
they are the product's central claim made concrete — *any recipe URL on the
internet* — and the author had already marked the first with narration saying
so. A rule that "early steps are setup" would have cut them. Judgement about
what a viewer wants to watch is the reason this is configuration rather than a
heuristic.

`choose gluten-free`, `submit`, the settle and the reason reveal are the story.

### Measured, on real captures

A live capture through the production path, and a real render:

| | before | after |
|---|---|---|
| cut length | 3.80s | 3.05s |
| first frame | blank white page | rendered product UI |
| payoff reached, within the cut | ~2.0s (53% pre-payoff) | ~1.0s (33%) |
| payoff reached, within the video | ~6.5s | ~4.0s |
| demo beat | 2.93→6.73s | 3.03→6.10s |

The time a viewer waits to see the transformation fell by roughly two and a half
seconds. Each transformation card gained about 0.2s from the freed budget, via
the existing timing engine — no scene arithmetic was written for this.

The transition needed nothing new: the `Rise` treatment already fades a beat in,
and the span join is the same plain concat cut §163 established.

### Not fixed here

The transformation cards still leave about half the frame empty above them.
`anchorFor` is the right seam, but the fix is not the one-line change it looks
like — centring reintroduces a gap above the caption, and filling the band is a
type-scale decision affecting every non-hook beat. It is the next visual task,
not a rider on this one.

## §167 — A transformation should be the largest thing on screen

The transformation cards used about a fifth of the frame they were given.
Measured on a real render: 242px of ink in a 1152px band, with 905px empty
above it.

The obvious reading is dead space, and the obvious fix is to move the card. Both
are wrong, and §166 already said so without knowing why.

### The cause was type size, not position

Every size in the card was a fixed constant — before 44px, after 66px, reason
32px — chosen once for a dense transformation and then used for every one.
A short change like *2 large eggs → 1 flax egg* draws roughly 330px of type
whatever band it is placed in. Moving that block up, down or to the middle
changes where the emptiness sits and nothing else.

The sharper version of the same finding: the **hook headline was 96px and the
transformation was 66px**. The line that orients the viewer was typographically
louder than the thing the piece exists to show.

### Density selects the scale; emphasis selects the target

Two inputs, kept separate, exactly as §160 requires:

- The **planner** decides which change is the hero. That is `emphasis`, and it
  now maps to how much of the band the beat should command — `hold` 0.74,
  `normal` 0.62, `quick` 0.54.
- The **treatment** decides what type size reaches that target for *these*
  words. That is density, and it is a search rather than a formula.

Neither recomputes the other's judgement, and no model is involved.

**Emphasis as a target, not a multiplier.** The first attempt multiplied an
emphasis factor onto a fitted scale, which pushes a held card past the band it
was just fitted to. Selecting a larger target instead keeps every outcome under
the ceiling by construction.

**A search, because height is not linear in scale.** Bigger type wraps sooner,
so a card at 2× can be more than twice as tall. Dividing a target by the height
at scale 1 overshot badly — a real transformation aimed at 62% of the band and
landed at 85%, because three lines had become five. Stepping down from the cap
and taking the first scale that genuinely fits accounts for rewrapping.

Bounds are explicit: 0.8–2.0, with a hard 92% band ceiling underneath and a
floor below that for pathological content. Text does not grow until it fills the
screen — a two-word card is capped, and it is capped by width anyway.

Hierarchy survives every scale because all three sizes scale together: the
ratios *are* the hierarchy. A missing reason contributes nothing to the
measurement and reserves no space — reserving it would be §160's refusal to
invent a reason, expressed as layout.

### Measured, on real renders

| | before | after |
|---|---|---|
| ink in the 1152px band | 242px (**21%**) | 586px (**51%**) |
| empty above the content | 905px (79%) | 557px (48%) |
| `after` type, real card | 66px | 109px |
| held card | — | 55% of band |
| card with no reason | — | 42% of band, no reserved gap |

The hook is 96px; the transformation is now 109px at normal emphasis. The thing
being introduced is finally larger than its introduction.

The residual upper band is intentional. Two-thirds is the target because a card
pressed against both edges reads as cramped, and the caption needs the eye to
arrive at it rather than collide with it.

### A defect the larger type exposed

The strike on the before was a single absolutely-positioned rule at `top: 50%`
of the block. That is a strikethrough only when the before is one line; at two
lines it sits *between* them and reads as an underline of the first. Invisible
at 44px, obvious at 88px. It is now a `line-through` copy of the text stacked
over the plain one and clipped horizontally, which strikes every line and keeps
the left-to-right draw that makes the change something the viewer watches.

### Not built

No layout engine, no second caption system, no per-platform branch, no model.
Captions still come from `captionStyle` and were not touched; card typography
and caption typography remain separate systems, which is why the caption band
could be excluded from the measurement cleanly.

## §168 — Capture the product at the shape it is published in

The demo beat left about a third of its band unused, and the product UI inside
it was too small to read on a phone. Both had one cause.

### The cause was the capture's aspect ratio

`adapt_and_reveal` recorded a **1280×900 desktop window**. Cropped by its focus
region and scaled, the cut was 1080×900 — **1.20:1** against a band of
**0.81:1**. Fitting that by width gives a 936×780 video in a 1152px band, so
328px (28%) of slack remains no matter where it is placed. Unlike the
transformation cards (§167), no scale removes it: a recording's aspect ratio is
a property of the file.

The second symptom came from the same place. A desktop layout renders at ~998
CSS pixels and is then squeezed into 936 device pixels, so the product's own
type arrives at roughly 0.94× — the ingredient rows measured a handful of pixels
tall in a 1080-wide frame.

### Cropping harder was the obvious answer and the wrong one

A portrait crop of a desktop layout cuts the second ingredient column, and those
columns are the transformation evidence. §163's rule — never crop out the thing
being demonstrated — rules it out.

### The lever is the viewport, not the crop

A phone viewport needs no crop, because the product's own responsive layout
already answers the question: at 430px the ingredients stack, the type is set
for a hand, and the recording is the shape a social viewer actually sees.
`cook_mode_timer` has captured at 430×932 since it was written. This flow was
the outlier.

Every selector the flow depends on was verified to resolve at the new viewport
**before** the change, by loading the page and walking the steps up to but not
including submit — so the check cost no adaptation credit.

The old `focusRegion` described where a result panel sat *in a desktop window*.
That window no longer exists, so it was removed rather than re-guessed: a region
describing a layout the capture no longer produces is worse than none.

### Fitted, not stretched

`BeatStage` sets `overflow: hidden`, so a recording taller than its band lost
its bottom edge silently — and a portrait capture is exactly that shape. The
footage is now bounded in both dimensions with automatic sizing, which fits it
at its own aspect ratio: no distortion, no letterbox bars, no clipping. The
browser reads the intrinsic aspect from the file, so nothing has to be told the
footage's dimensions or kept in sync with them.

The band arithmetic is now computed once by `PlannedBeats` and threaded to the
treatments, replacing three independent derivations. As a side effect the
treatments need no Remotion context for geometry, which is what lets the
"no footage renders nothing" refusal be asserted directly.

### Measured, on real renders

| | before | after |
|---|---|---|
| capture viewport | 1280×900 | 430×932 |
| cut aspect | 1.20:1 | 0.46:1 |
| band occupancy | 65% | **100%** |
| product CSS width → device px | 998 → 936 (0.94×) | 430 → 485 (1.13×) |
| ingredient rows | unreadable at a glance | legible |
| evidence cropped | — | none |

The progression now measures HOOK 20% · DEMO 100% · CARD 56% · CARD 60% ·
PROOF 21%.

### What this does not fix

The demo occupies **45% of the frame width**. A portrait phone screen inside a
portrait frame leaves horizontal margin, and that is inherent rather than
accidental — it reads as framing, but it is not free space that has been won
back. Filling the frame edge-to-edge would mean cropping the phone capture
vertically to the band's aspect, and the meaningful region moves during the
demo (input at the top early, result later), so a fixed window would cut the
payoff. Doing it properly needs **per-step focus regions**, which is a camera
abstraction this pass deliberately did not build.

A defect found along the way: the media container was full-width, so the
hairline border traced a box around 55% empty ground rather than the footage.
`alignSelf` did not fix it — `Rise` renders a plain block, not a flex parent.
It is shrink-wrapped and left-aligned now, sharing an edge with the label above
and the cards that follow.

## §169 — Evidence carries its weight, and provenance survives the render

Three things, found by auditing rather than by looking at one more frame.

### Provenance died at a boundary nobody was watching

`planBeforeAfter` has set `sourcePath` on every beat drawn from the artifact
since §160, and `creative.test.ts` asserts it — **on the plan**. The mapping into
`renders.input_props` was an object literal inside the generate handler and did
not copy it, so the thing that actually ships could not say which artifact path
any of its beats came from.

Nothing failed, because nothing looked. The guarantee held exactly as far as the
test's reach and stopped at the moment it started mattering.

The mapping is now `beatsForRender`, extracted so the boundary is testable, and
a tamper that drops the field fails two tests.

Provenance is **carried, not drawn**. A viewer has no use for
`steps[3].updated_note`, and printing an internal path on a social post would be
noise imitating rigour. It travels for the operator surface and for anything
auditing a render after the fact.

### The evidence beat was the thinnest moment in the piece

21% of its band against 56–60% for the transformation cards beside it — §167's
defect in a different treatment, with the same cause: fixed type sizes.

It now measures 50%. It also refuses to render at all when the artifact carried
no reason: the planner only emits this beat when a change explains itself, so a
lone "WHY" over blank ground would be inventing evidence expressed as layout.

**Quoted evidence is deliberately not special-cased.** The proof gate verifies
testimonials against stored rows with recorded consent, but no planner path
builds a proof beat from one — the only producer is a change's own `reason`.
Styling a quotation nothing can emit would be architecture for a content shape
that does not exist.

### The search is shared; the measurement is not

The first attempt reused `cardDensityScale` directly, which measures against a
transformation's 66px heading — and then drew the note at its own 54px. It aimed
at 62% of the band and landed at 35%.

`fitScale` now holds the search and each treatment supplies its own `heightAt`.
Sharing the *search* is one rule in one place; sharing the *measurement* is a
silent miss whenever the bases differ.

### Audits that changed nothing, and why that is the result

**Creative-type selection — verified.** Across seven artifact shapes it refuses
on an empty artifact, a null artifact and a note without text, and an artifact
with no transformations correctly selects `ChefNoteCard` rather than being
forced into before_after. `SubstitutionExplainer` is unreachable while
`TransformationDiff` is enabled, because its condition is a strict subset and
selection is fixed-priority — reachable only through per-account composition
enablement. Documented, not changed: fit-based scoring with one built planner
would be speculative.

**QC → correction coverage — verified.** 92 gate rules resolve to 11 distinct
correction paths with nothing unmapped. Five escalate by design.

**The per-flow capture gate — verified in production, with numbers.** 13 capture
jobs died of `swap_toggle` selector drift before §163's per-flow gate deployed;
**0 have died since, and 10 have succeeded.** `swap_toggle` itself remains
drifted: all five declared candidates return zero on the live page, and the idle
`/adapt` carries no swap UI at all, so it cannot be re-derived without spending
an adaptation. That is product drift, not a Halyard defect, and the system
already degrades the way it was designed to — the root flow records and the
operator is told.

### Correction appliers had no tests

The controller's decisions have been tested since §165. The code that carries
them out — the code that clears a voiceover, requeues renders and spends
provider calls — had none. A wrong decision produces a bad correction; a wrong
applier spends money and writes an iteration row claiming it did something else.

18 tests, all on deterministic paths that need no provider, which is precisely
why the gap mattered while Anthropic is unavailable.

## §170 — The correction loop closed, and two defects only success could reveal

The one disposition that had never executed — a correction that **clears its
targeted defect and is accepted on the following pass** — ran for real against
item `0685510a`: `remeasure` → `rewrite_vo_script` → **accepted**. The narration
went from 183 words per minute to 172, inside the 140–175 window, with word
error at 1.6%.

It ran on **OpenAI**, through the provider seam that already existed. Anthropic
is credit-blocked and was not called.

### No fallback was added, deliberately

`resolveLlmProvider`, `modelsFor` and `createLlmClient` already make the provider
a runtime choice, and `LLM_PROVIDER=openai` is an explicit override that wins
over key presence. `describeLlmProvider` reports *"chosen explicitly"* and
`agent_runs` records the model that actually served each call, so which vendor
produced a given artifact is already answerable.

Automatic failover was considered and rejected for now. A credit-exhausted key
still *looks* real, so the resolver keeps choosing Anthropic — which is a
configuration problem with a configuration answer. Silently retrying a second
vendor on failure would double the cost of every genuine outage and hide the
condition that caused it. Explicit selection is the safer default; if failover
is ever wanted it belongs in `createLlmClient`, recording requested vs actual.

### An accepted item never reached the approval queue

`review_media` sets a failing item to `failed`. The *correct* branch moves it to
`draft` while a rebuild is in flight. The accept branch promoted only
`where status = 'failed'` — so an item that was corrected and then accepted
stayed in `draft`: out of the queue a human works, carrying a full history that
said it had passed.

Unreachable until a correction actually succeeded, which is why fifteen passes
of architecture work never found it and the first real success did.

The promotion now covers `draft` as well, narrowed to drafts **this loop
created** — a prior `corrected` iteration is the evidence. An operator's own
work in progress must not be pushed into the approval queue behind their back.

### A malformed snapshot could brick an item's controller

`snapshot` is jsonb, and the regression check reads `snapshot.gates.map(...)`.
A row written by an earlier version — or by hand during an incident — crashes
the controller for that item **permanently**. The coercion existed in
`toRecord`; the regression check built its `previous` record inline and bypassed
it. One conversion, one place, and a missing snapshot now compares as "nothing
known" rather than throwing.

### Verified without changes

**The empirical chain is complete.** `publish` → `publications` →
`collect_metrics` at +1h on a decay schedule → `post_metrics` →
`score_performance` → `performance_scores`, with `historicalConversion` feeding
idea scoring and the scorer excluding posts it never measured (§68). There is no
missing link: the first real publication becomes the first empirical
observation.

**X is verified live**, by one `GET /users/me` — a read, not a publish. Formats
text, image, video.

**Production has no connected accounts.** Every production row is `pending_auth`
with no credential, so the deployed worker cannot publish at all. Every working
credential is local. This is the single largest gap between the current system
and production operation, and it is an operator action rather than an
engineering one.

## §171 — swap_toggle was never a selector problem

Thirteen production capture jobs died on *"find the swap control"*. The
diagnosis was wrong twice, and both wrong diagnoses were reasonable.

**First it looked like selector drift.** §159 built a five-candidate fallback
chain, which was the right response to the evidence available. Then all five
candidates failed, which looked like the product having removed the feature —
and §170 probed the idle `/adapt` page, found no swap UI at all, and recorded it
as external product drift needing an operator capture to diagnose.

It was neither. Three facts, each cheap to establish and none established until
now:

1. **The control is exactly where the flow always said it was.**
   `[aria-label="Choose your swap"]` is present and visible — on **`/`**, not
   `/adapt`. Its two options carry `aria-pressed`, so the flow's compound click
   selector was correct too.
2. **It does real work.** Clicking the unpressed option rewrote the ingredient
   from *"1 can (400g) jackfruit, drained"* to *"150g soy curls, rehydrated in
   warm broth"*, with the reason line beneath it. Verified before changing
   anything, because filming a marketing still and calling it product behaviour
   is the failure this codebase exists to prevent.
3. **`flow.path` does not navigate.** It is metadata for `sourceUrl`. This flow
   had no `goto` step because it was written to inherit the page
   `adapt_and_reveal` left behind — and `runFlowChain` opens a fresh blank page.
   Run as a root flow it was looking for the control on `about:blank`.

That third fact is why the earlier diagnoses failed: the failure screenshot was
a **blank white frame**, and a blank frame reads as "the page changed" rather
than "the page was never opened".

### The fix

`path: '/'`, a portrait viewport matching §168, its own `goto` marked
`setup: true` (§166 — a page load is not story), the verified `aria-label` as
the primary selector with the `data-testid` leading the fallbacks so the flow
moves back to it automatically if the product ever ships one, and `dependsOn`
removed.

Dropping the dependency matters as much as the selector: it is the coupling that
let one drifting flow take down the other, and the homepage card is always
present, so this flow needs no prior adaptation and spends no credit.

Verified by a real capture: 1.29s of footage at 1080×2340 showing the swap and
its reason. **Zero credits** — `consumesCredit: false`, and every diagnostic
probe stopped short of submitting.

### The invariant that would have caught it

A flow that can run as a root must navigate itself. Tested for every flow, with
the navigation required to be marked `setup`.

### Known quality issue, not fixed

A sign-in modal ("Continue with Google / Continue with Apple") overlays the
lower third of the recovered footage. The swap, its badge and its reason are all
above it and fully legible, so the capture is usable. Dismissing it wants the
same treatment `adapt_and_reveal` gives the App Store banner — an optional
`setup` step — but the selector has not been verified and this pass does not
guess at selectors.

---

## 172. The navigation is organised by the operator's questions, not by ours

Twenty-nine sidebar links over three groups named *Today*, *Plan* and *Configure*.
Every group named a piece of Halyard's own machinery — Swipe file, Hooks, Series,
Readiness, Pronunciation, Agents, System — and none of them named something a
person arrives wanting. The list had no ceiling: each feature added a row, until
the sidebar was a table of contents for the repository.

**Chosen:** seven primary destinations, each answering exactly one question —
Home, Create, Content, Calendar, Inbox, Analytics, Accounts — with everything
else under a collapsed **More**, grouped by purpose.

**Rejected:** deleting anything. 29 destinations went in and 29 came out; the
count is asserted by a test against a frozen baseline, not remembered. A
navigation that is smaller because it does less is not the goal.

**Rejected:** a search-driven command palette as the primary answer. It works
only for someone who already knows the name of what they want, which is exactly
the operator this navigation was failing.

`<details>` rather than `useState`, so the shell stays a server component. The
disclosure opens itself when the current page is inside it.

### Three bugs, one cause

The three problems reported from a real session were all **reachability**, not
missing capability:

- Switching products did nothing. The chip wrote `?product=<id>` and the layout
  called `getCurrentProduct()` with **no argument** — a parameter that had
  accepted a `requested` id since it was written, and never once received one.
  The same shape as every other orphaned parameter this codebase has found, and
  invisible for the same reason: a query string nobody reads is not an error.
- Clicking a `NOT CONNECTED` account did nothing. The rows were plain `<div>`s.
  They reported a problem and linked nowhere.
- Products could not be found. `/products`, `/products/new` and `/products/[id]`
  all existed, filed under *Plan*, never referenced from the product switcher the
  operator was actually clicking.

**Capability is not reachability.** All three features worked perfectly. None
could be operated from where the operator was standing. The lesson generalises:
a feature that ships without an affordance pointing at it has not shipped.

**Chosen for the switcher:** a cookie, set by `GET /api/product`, which validates
the id against the real product list and refuses off-origin redirects.
**Rejected:** the query parameter it already had — in the App Router a **layout
does not receive `searchParams`**, only pages do, and the switcher lives in the
shell that the layout renders. The parameter could never have worked.

**Chosen for the rows:** a link to `/accounts#<platform>`, landing on the one
card that can fix it rather than the top of a page holding seven.

### `next build` is part of verification

`PRODUCT_COOKIE` exported from a route handler typechecks cleanly, passes every
test, and fails the production build: *"not a valid Route export field."* A route
file may export only route fields. The constant moved to `lib/product.ts`.

Another entry in the long list of failures whose symptom is a green result.

### Connection exhaustion, mitigated and not cured

`EMAXCONNSESSION` under load: the web tier runs against the **session-mode**
pooler (port 5432, one Postgres connection per client) at `max: 5` per lambda,
and the real ceiling is `max × concurrent instances`. Lowered to 2 with idle and
connection timeouts.

That is mitigation. The cure is moving the **web tier** to the **transaction**
pooler on port 6543, which is safe: the web tier holds no session-scoped SQL.
The **worker must stay on session mode** — §165's correction claim is a
`pg_try_advisory_lock`, which is session-scoped and becomes silently useless
behind a transaction pooler. Silently is the dangerous part: the lock would
appear to be taken and would guard nothing.

This is an operator action. Vercel returns `DATABASE_URL` as `[SENSITIVE]`.

### X, Instagram and Threads

Diagnosed by constructing and inspecting the real authorize URLs. Redirect URIs,
scopes and PKCE parameters are all correct. Each fails at the provider because
the deployed origin is not registered in that provider's dashboard. No code
change would fix any of them, and none was made.

---

## 173. Three connection bugs the type system was happy with

Every account-connection failure in this pass was a **configuration** failure that
compiled, typechecked and passed the suite. None was catchable by "does it build" —
only by asserting the shape of what we send against what the provider documents.

### Threads is not the Meta app

`PLATFORM_CLIENT_ENV.threads` mapped to `META_APP_ID`, and a test asserted that
Instagram and Threads shared credentials — encoding the bug as the requirement.

Meta's documentation is explicit: *"For Threads API implementation purposes, use
the Threads app ID and its corresponding app secret,"* and the authorization
reference names `client_id` as *"Your Threads App ID."* Adding the Threads use
case to a Meta app mints a separate id.

**Chosen:** `THREADS_APP_ID` / `THREADS_APP_SECRET`, with `resolvePlatformClient`
falling back to the Meta app and **reporting that it did**. Some apps genuinely
report the same value, and an operator who has not split them yet should get the
behaviour they had — but never silently. **Rejected:** a hard switch, which would
have broken the running deployment on deploy.

The resolver also refuses to satisfy one platform from another platform's
credentials, which would connect an account with the wrong app entirely.

### The Instagram dialog was unversioned

`GRAPH_VERSION` is pinned to `v23.0` for every Graph call, but the login dialog was
`https://www.facebook.com/dialog/oauth`. An unversioned dialog resolves to the
*oldest* version Meta still serves — by definition the one closest to removal. It
would have started failing on Meta's deprecation schedule rather than on any change
here, while the pinned constant sat there looking correct.

### `requireOperator` throws, and a route handler turns that into a 500

`GET /api/oauth/x/start` answered an expired session with a bare 500. A page turns
that throw into an error boundary; a **route handler** turns it into an opaque
error page. The operator clicks Connect and gets a blank failure that reads exactly
like a broken integration rather than "sign in again."

`operatorOrSignIn` returns the operator or the redirect, preserving the intended
destination.

### The values a provider needs are now computed, not remembered

Every provider validates the redirect URI by **exact string match** and none of them
names the mismatch in the error, so a nearly-right URL fails identically to a
completely wrong one. Telling an operator the right value in a chat message fixes it
once; showing it on the card, derived from the same `callbackUrl` helper the OAuth
route uses, fixes it for every future deploy and origin change. A test asserts the
displayed value equals the sent value for all six OAuth platforms.

### The two tiers need opposite poolers

Web wants **transaction** (6543); worker needs **session** (5432). The failure modes
are not symmetric:

- Web on session mode fails **loudly** — `EMAXCONNSESSION`.
- Worker on transaction mode fails **silently**. `pg_try_advisory_lock` is
  session-scoped; behind a transaction pooler it is taken and dropped around one
  statement and guards nothing. Two workers would both believe they held the
  correction claim, and the only symptom would be duplicated spend.

**Chosen:** `assertPoolerFor` **refuses to start** the worker on a transaction
pooler. A silent correctness failure is worth crashing over; the web tier only
warns, because session mode there is survivable with a small pool.

### What was not a bug

X's authorize request is correct against X's current documentation — endpoint,
every required parameter, `S256`, space-separated scopes, `offline.access` for a
refresh token. *"Something went wrong — You weren't able to give access to the App"*
is raised **before consent**, so it is never a scope-grant problem: it is the
callback URI, the app type, or OAuth 2.0 being off. Halyard sends a client secret on
token exchange, which makes it a confidential client, so the X app type must be
**Web App, Automated App or Bot** — a Native App or SPA is a public client and the
exchange is refused.

Bluesky's app-password path is correct and unchanged. It remains the one manual
credential step, and the form on Accounts is the only correct place for it.

---

## 174. A dead test suite, and the bugs it was hiding

`HALYARD_DEV_UNAUTHENTICATED=1` did nothing.

The check sat inside `if (!supabaseConfigured())`, so on any machine with Supabase
keys in `.env.local` — every real development setup — the flag was read, ignored,
and the app kept redirecting to `/signin`. Nothing said why.

It took the browser suite with it. Playwright cannot sign in to Supabase, so every
spec that opens a protected page had been failing: `e2e/accounts.spec.ts` was five
of six, and a full run was **2 passed**. After moving the check ahead of the
Supabase branch — `NODE_ENV !== 'production'` was always the guard that mattered,
and is now asserted directly — the same run is **128 passed**.

A dead E2E suite is worse than no E2E suite. It is green when skipped, ignored
when red, and it silently stops being evidence. What it had stopped reporting:

### 158 contrast failures

`text-muted/60` composited to `#a79f98` on the card behind it — **2.33:1**, half
of what a person needs — once per skipped gate on every queue item. Dimming the
one state an operator most needs to notice until it cannot be read.

`--color-muted` itself cleared 4.5 on `surface` and `canvas` and failed on the
tinted backgrounds it is actually used over: 4.31 on `primary/25`, 4.28 on
`danger/10`. Darkened to `#6e635c`, the lightest value clearing 4.5 on every
background axe measured — solved against those, not against white.

### A post editor with no name

The `<textarea>` that edits what gets published had no label. Thirty-five of them
on a full queue; the largest critical finding in the product.

### Previews no keyboard could reach

The preview strip scrolls horizontally and could not be focused, so every image
past the fold did not exist for a keyboard. The same defect `Card.scrollLabel`
was built for, on a plain `div` that never went through `Card`.

**Both spec reports now name the element.** "Contrast failed" is not actionable,
and a composited colour like `#a79f98` appears in no stylesheet — grepping for it
finds nothing.

### Tests that only ever passed on a small database

Three specs asserted against unscoped text: the seeded fact, the watch term, the
contradiction. Each resolved to many elements once real data existed. One of them
would have clicked "Stop watching" on **somebody else's watch term** and then
asserted, correctly, that its own term was disabled.

Facts and account cards gained stable ids so a test can name the row it means —
and so anything citing a fact can link to it.

### Connect was a dead button

It rendered for every platform. TikTok, Pinterest and YouTube have no developer
app, so it reached the OAuth route and came back **428 with a raw JSON body**.
Those cards now say what is missing and name the variables — names, never values.
Threads says out loud when it has fallen back to the Meta app id, because a silent
fallback fails at consent with an error naming neither id.

### Card ids collided

Every platform renders twice, once per persona, and both got `id={platform}` —
two elements with the same id, and §172's deep link landed on whichever rendered
first. Scoped to `{persona}-{platform}`.

### The web tier is on the transaction pooler

Verified rather than argued: connecting on 6543 with the same credentials, the
**same advisory lock was granted twice in a row**. That is the hazard §173
described, observed. The web tier moved to 6543 and `/api/health` reports
`{"pooler":"transaction","database":"reachable"}` in production.

---

## 175. The expectation was wrong, not the comparison

A real, correct authorisation of **@Recipe_Fix** was reported as the wrong
account. The obvious reading — "the check is case-sensitive" — is wrong twice
over, and acting on it would have been harmful.

`normaliseHandle` has always folded case. `@Recipe_Fix` and `@recipefix`
normalise to `recipe_fix` and `recipefix`, which differ by an **underscore**, not
by capitalisation. Making them match requires folding `_`, and `@recipefix`,
`@recipe_fix` and `@recipe.fix` are three usernames three different people can
own. Folding them would leave the identity check unable to tell the product's
account from a lookalike — the exact failure the module exists to prevent.

### Where `@recipefix` came from

`products.expected_handles`, a JSONB column, seeded by **migration 0014**:

```sql
set expected_handles = jsonb_build_object('brand', 'recipefix')
```

A guess written before any account existed, keyed by **persona alone**. But a
brand's handle is per *platform*: the same product is `@Recipe_Fix` on X,
`@recipe.fix` on Instagram and Threads, `@recipefix` on TikTok and Pinterest. One
string cannot be right for all of them, and it was wrong for three — X was simply
the first to be connected.

**Chosen:** keys of `"<persona>"` with an optional `"<persona>:<platform>"`
override, resolved by `expectedHandleFor`. The general value keeps applying
wherever it is still correct; a platform overrides it only where the handle
genuinely differs. **Rejected:** widening the comparison, and dropping the
expectation for X — an unset expectation is not a satisfied one, it is no check.

**Rejected:** deriving the expectation from `social_accounts.handle`. That row is
what a connection *writes*; checking a connection against it would be circular
and would approve whatever arrived.

The founder row is deliberately untouched: `expected_handles.founder` reads
`isaacmineo` while the seeded X row reads `@IsaacMBuilds`. Only the operator can
say which is meant, and guessing would either wave through the wrong account or
block the right one.

### The message named a spelling that exists nowhere

It printed the expected handle **lower-cased** — "You expected @recipefix" — so an
operator comparing it against their own configuration saw a third spelling in the
one message that has to be read carefully. Both handles are now printed exactly
as written.

### Two clock and PATH defects found alongside

`explorer.test.ts` pinned `now` to a fixed date while `canMarket` read the real
clock, so "verified one day ago" quietly became "verified fourteen days ago" and
the test failed having changed nothing. A fixed `now` is only safe when it is
*given* to the code under test.

Ten further failures were `ffmpeg` missing from the shell's PATH, not code.
Worth recording because they looked exactly like a regression.

---

## 176. A first connection has nothing to be checked against

Halyard could not connect an account it had never seen. The identity check
required knowing the answer in advance: a `social_accounts` row is seeded for
every platform so the Accounts screen can list them, and `expected_handles` was
seeded alongside it with handles written *before anything was connected*. The
first correct authorisation of @Recipe_Fix was therefore reported, severely, as
the wrong account.

That design cannot serve a second tenant. A new Halyard user has no handles to
seed, so any rule that depends on them being present is a rule that only ever
worked for the first customer. §175 corrected the seeded values, which fixed the
symptom for one account on one platform and left the shape wrong.

**The platform is the authority.**

- A connection is **first** when the slot has no confirmed identity — no
  `platform_user_id` and no `identity_confirmed_at`. A row existing proves
  nothing; a person having confirmed who it is proves everything.
- On a first connection the returned identity *becomes* canonical.
  `confirmConnection` already wrote it; nothing now contradicts it.
- On a **reconnection** continuity is checked against the stored
  `platform_user_id`. It is stable across renames and cannot be mistyped, so a
  handle never outranks it: renaming @Recipe_Fix to @RecipeFixHQ is a rename, and
  reporting it as a stranger would only train the operator to click through the
  warning that matters.
- Where a provider returns no id, the confirmed handle is the only continuity
  signal there is, so it is used — compared exactly.

**Rejected:** widening the handle comparison. @recipefix, @recipe_fix and
@recipe.fix are three usernames three different people can own; folding `_` or
`.` would make a lookalike indistinguishable from the real account.

**Rejected:** deleting the expectation outright. An operator may still declare
one deliberately, and it now shows as a **non-severe** advisory on a first
connection — "Halyard had @x noted; you authorised @y" — and is dropped entirely
once an identity exists, because the platform's id has superseded it.

Migration 0043 empties the seeded values in both databases. The column stays for
deliberate use; it is simply never seeded, and it never blocks.

### What still protects a first connection

The mechanism that always did, and the reason this module exists: the identity is
fetched from the provider, **shown to a person**, and written only after they
confirm it. The seeded handle was a second, weaker guess layered on top — and the
one that fired.

Ownership is untouched: `duplicate_identity` still refuses an identity already
connected to another persona or product, and product/persona routing is unchanged.

---

## 177. Threads cannot borrow the Meta app id

§173 gave Threads a fallback to `META_APP_ID`, reasoning that an operator who had
not yet split the two should keep working. Production disproved it: the Threads
authorisation returns

> Authorization Failed: No App ID was sent with the request.

which is Meta's way of saying the id it received is not a *Threads* app id. The
fallback never bought anything.

What it cost was the diagnosis. A clear, fixable Halyard state — "Threads needs
its own app id, set `THREADS_APP_ID`" — was converted into a provider error that
names no variable, on a page Halyard does not control, after a redirect. The
operator's only clue was a sentence that sounds like a bug in the request.

**Chosen:** no fallback at all. `PLATFORM_CLIENT_FALLBACK` is empty, and a
platform with no credentials of its own reports `missing`, which the Accounts card
renders as "Needs developer setup" naming the exact variables. **Rejected:**
keeping the fallback with a louder warning — the connection still fails, just with
two explanations instead of one.

A fallback is only worth having when the thing it falls back to can work.

---

## 184. Instagram moves from Facebook Login to Instagram Login

Halyard implemented Meta's *other* Instagram product. **Instagram API with
Facebook Login** authorises against `facebook.com`, calls `graph.facebook.com`,
and finds the account by walking `/me/accounts` to a Page carrying a linked
`instagram_business_account`. It works, and it requires the creator to own a
Facebook Page and to have linked it — an obstacle for the many people who only
have Instagram, and a step Halyard cannot perform for them.

**Instagram API with Instagram Login** authorises against `instagram.com`, calls
`graph.instagram.com`, and the token *is* the account: `/me` returns it, no Page
anywhere. It issues its own app id and secret, distinct from the Meta app's —
the same split §173 found for Threads, and the reason `META_APP_ID` was
authorising against the wrong app entirely.

The portal was already configured for Instagram Login. The code was not, so a
connection would have redirected correctly and then failed at token exchange
against endpoints that do not serve this flow.

### What changed

| | Facebook Login | Instagram Login |
|---|---|---|
| Authorize | `facebook.com/v23.0/dialog/oauth` | `instagram.com/oauth/authorize` |
| Exchange | `GET graph.facebook.com/oauth/access_token` | `POST api.instagram.com/oauth/access_token` |
| Long-lived | `fb_exchange_token` | `ig_exchange_token` |
| Refresh | `fb_exchange_token` + secret | `ig_refresh_token`, token only |
| Identity | `/me/accounts` → Page → IG account | `/me` |
| Credentials | `META_APP_ID` | `INSTAGRAM_APP_ID` |

Publishing, metrics and comments were untouched: they route through `this.get` /
`this.post` against a `GRAPH` constant, so changing the host moved all three.

### Granted scopes arrive earlier, and the passengers are gone

Facebook Login returns no `scope`, so the adapter made a second call to
`/me/permissions` to learn what was granted. Instagram Login returns
`permissions` on the code exchange itself — but **only on the short-lived
response**, not the long-lived upgrade, so they are carried across. That is the
same bug §180 fixed for Threads, in the flow next door, caught this time before
it shipped.

The scope list dropped from seven to four, and `KNOWN_UNEXERCISED` is empty for
the first time. `pages_show_list` and `pages_read_engagement` existed only to
walk to a Page; `business_management` never had a call site at all and the audit
had been naming it as unexercised for months. Meta's setup page also offers
`instagram_business_manage_messages`, which is **not** requested — Halyard
implements no messaging, and asking review to approve a permission nothing calls
is a rejection risk.

### What was lost, and why that is right

`fetchIdentity` no longer returns `alternatives`. Under Facebook Login one token
commonly reached several Pages, each with its own Instagram account, and picking
wrong was silent until a post appeared on a business account the operator had
forgotten they administered — so all of them were listed and a human chose.
Instagram Login has no such ambiguity: the authorisation is for one account.
Offering a choice would mean inventing one.

The protection is unchanged and lives where it always did: the identity is
fetched, shown to a person, and written only after they confirm it (§176).

## 199. YouTube is two products, and the adapter only knew one

`YOUTUBE_CONSTRAINTS.video.maxSeconds` was `60`. That was the Shorts cap until
15 October 2024, and it was never the YouTube cap. Stated platform-wide it did
two things at once: rejected a legitimate 90-second Short, and made long-form
video *inexpressible* — one constraint capped the entire platform at a minute.

### Who decides what a Short is

Not Halyard. YouTube classifies at ingest: square-or-taller and ≤ 3 minutes is a
Short, and no API field overrides it. `#Shorts` stopped being a classifier on
the same date and survives only as a discovery signal.

That makes intent and outcome two different facts, so `resolveVariant` returns
both. A `long_form` intent on a 45-second vertical render is not a setting to be
honoured — it is a mistake, and previously one that surfaced only after
publication when the video turned up in the Shorts feed. It is now a warning at
validation time, not a block: the upload is still legal, it is just not what was
asked for.

`format_subtype` already existed on `content_items` and already had a
`FormatSubtype` union with `'short'` in it. Long-form is a new member of that
union with its own `FORMAT_SPECS` entry, not a new system — a long-form video is
a *search* object where a Short is a *feed* object, so it gets its own craft
notes rather than a longer version of the Short's.

### Two capability claims, one implemented and one withdrawn

The delivery contract has advertised `apiScheduling: true` since §156, and the
note explained that a private upload could later be published "via
`videos.update`". Both halves were checked against Google's documentation.

**`status.publishAt` is real and was never implemented.** `videos.insert`
accepts it on the `youtube.upload` scope alone. It is implemented now, and a
scheduled upload no longer offers a `manualPublishUrl` — sending an operator to
Studio to finish something YouTube will finish itself is the same error §156
fixed in the other direction.

**`videos.update` is not reachable.** It requires `youtube`, `youtube.force-ssl`
or `youtubepartner`; Halyard holds `youtube.upload`, `youtube.readonly` and
`yt-analytics.readonly`. A private video cannot be made public over the API. The
claim is withdrawn and the scope requirement recorded in
`youtube/variant.ts#canModifyExistingVideo`, so the next person to want
thumbnails or playlists finds the reason rather than the symptom.

The scope was **not** added. Enlarging the requested set enlarges the Google
verification surface, and there is no feature waiting on it — the compliance
audit blocks public uploads anyway. It should be added deliberately, with the
feature that needs it.

### Smaller things the audit turned up

`categoryId` was hardcoded to `'26'` (Howto & Style) for every upload, including
founder-persona posts about building the product. `categoryIdFor` maps Halyard's
own categories instead. Titles were sliced to 90 characters to leave room for
`#Shorts` even when nothing was appended. Long-form descriptions now lead with
the summary rather than the link, because that is the surface search reads.

### What was deliberately not fixed

`collectMetrics` sets `impressions` to `viewCount`. Those are different numbers,
and reporting one as the other makes click-through rate meaningless. The fix is
the YouTube Analytics API — which is what `yt-analytics.readonly` was granted
for and which nothing calls — and it belongs with cross-platform metric
normalisation, where "cannot see it" and "measured zero" have to stay apart.
Recorded in `docs/YOUTUBE.md` §D rather than half-done here.

## 200. Rehearsal was impossible because time was not a seam

Three adapters poll a media container until the platform reports it finished.
Each loop depends on the clock twice — the interval, and the deadline — and only
the interval was injectable.

A dry run replaced `sleep` with a no-op. The loop stopped waiting; the deadline
stayed five real minutes away on `Date.now()`. So it span as fast as the event
loop allowed, appending a `RecordedRequest` every pass, until the heap died.
The symptom read as a timeout bug. It was a missing seam.

`Clock` supplies both halves together. `sleep` advances `now`, so a five-minute
ceiling at five-second intervals is exactly sixty iterations and takes no time.
The adapter's own termination condition does the work, so there is still no
dry-run branch inside `publish()` that could drift from the real path —
the property the harness was built for in the first place. `maxPollsFor` is a
second stop in case a clock is ever injected that does not advance.

### The bug underneath was narrower and worse

§184 moved Instagram to `graph.instagram.com`. The dry-run response stub still
matched `graph.facebook`, so an Instagram rehearsal fell through to a bare
`{ id }`, the container never reported `FINISHED`, and the loop ran to its
ceiling. TikTok's `/status/fetch/` had the same gap.

A rehearsal that cannot answer the adapter's own status check is not a rehearsal
of it. The stub is now matched by hostname against the adapters as they exist.
An Instagram Reel rehearses in 12 ms and four requests.

### Writing the test found a second defect

`redactHeaders` and `redactBody` existed from the first version of this file.
`redactUrl` did not, because the adapters written then carried their token in an
`authorization` header. **The Meta family does not** — Instagram and Threads put
`access_token` in the query string, so every recorded GET held a live token in
plain text.

Found by asserting the absence of the token rather than by reading the code,
which is the only way this class of thing gets found. Exposure was limited to
in-memory results rendered in the UI: `platform_requests` has a `url` column and
a purge cron, and nothing writes to it.

### Two capabilities the matrix had backwards

`short_video` and `scheduling` map to no adapter method, so the test that
derives declarations from method names — the one that caught the `read_comments`
drift in §-past — could not see either.

Instagram declared no `short_video`, and its comment said Reels are "a distinct
container type Halyard does not build". It builds it: every Instagram video
container is `media_type: 'REELS'`, in two places, since the adapter was
written. A test asserted the resulting `unknown`, so it was confirming an
omission rather than a fact. Threads stays absent — checked, not assumed; it
sends `media_type: 'VIDEO'`, a video post rather than a short-form product.

X and Threads can now be rehearsed without a public post, which is what this was
blocking.
