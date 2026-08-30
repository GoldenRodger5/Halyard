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

## 201. The compliance-audit gate had no producer

`YouTubeAdapter.publish` decided privacy like this:

```ts
const audited = account.meta?.complianceAuditPassed === true;
const privacyStatus = audited && account.capabilityState === 'live' ? 'public' : 'private';
```

**Nothing in production sets `complianceAuditPassed`.** `account.meta` is
assembled in `publish.ts` from `job.payload.accountMeta`, and a search for
producers of that key finds four test files and nothing else. So `audited` was
permanently `false`, the `&&` could never be satisfied, and every YouTube
upload was private — *forever*, regardless of whether the audit had passed.

The whole point of submitting the compliance audit is to stop uploading
private. Passing it would have changed nothing, and the failure would have
looked like YouTube's fault.

### The producer it needed already existed

`capability_state = 'live'` means "an operator marked this past platform
review" (gotcha 5). For YouTube, platform review *is* the compliance audit.
Using it makes the gate reachable, keeps the decision with a person, and keeps
it in the same place it lives for every other platform rather than inventing a
YouTube-shaped flag beside it.

The meta flag is still honoured, so a test can force the public path without a
database.

### What this does and does not change

It does not broaden anything today: YouTube is `draft_only`, so uploads stay
private until a human deliberately changes that, and `publishing_enabled` still
gates the pipeline above it. Verified against production after the change —
`capability_state: draft_only`, `publishing_enabled: false`, 0 publications.

`verifyCapabilities` got the same treatment with one deliberate limit: it never
reports `live` on its own initiative. No API discloses audit status, so a
capability refresh can only repeat what an operator declared. Inferring it from
a successful upload would be wrong — unaudited uploads succeed too, they are
just private.

### Verified against the real API, which is how it was found

§199 shipped on unit tests and rehearsals, neither of which sends anything. A
real private upload (`ZWTKMBPMq9s`) exercised the changed path and was read back
off YouTube:

| | old code (`v5Ty6K5BuqE`) | new code (`ZWTKMBPMq9s`) |
|---|---|---|
| `categoryId` | 26, hardcoded Howto & Style | **27**, Education, from the item |
| title | plain | `… #Shorts` appended within the 100-char limit |
| description | — | link first, the Shorts assembly |
| privacy | private | private |

`status.publishAt` was deliberately **not** exercised live: scheduling a real
`publishAt` schedules a real *public* video, so "testing" it means publishing
it. Its request shape is verified by rehearsal instead, where nothing is sent.
That asymmetry — some things cannot be tested live without doing the thing you
are testing — is the argument for the rehearsal harness in §200.

## 203. Every video was the same because there was only one planner

`CREATIVE_TYPES` declared nine treatments. `plan.ts` stated in its own comment
that only `before_after` was implemented, and `chooseVideoComposition` was a
fixed priority list returning the first template whose props could be built.
Both halves pointed the same way: every video on every account was a
before/after, rendered by `TransformationDiff`, opening on a card.

That is the "static recipe text with minor movement" complaint, and it was never
a rendering problem. Four compositions existed and one of them was always
chosen.

### What actually makes two treatments different

Not the words on the cards. Three things, and the module is organised around
them:

- **Structure.** A how-to sequences, a comparison forks, a myth/fact reverses,
  a listicle counts down. Five treatments produce five distinct beat-role
  sequences, and that is asserted rather than asserted about.
- **Pacing.** A montage is mostly `quick` with a single `hold` at the end; a
  myth/fact holds twice and does nothing else.
- **Evidence.** A comparison needs a swap carrying a real `alternative`; a
  how-to needs `technique` steps; a feature demo needs footage.

### Refusal is the feature

Each planner returns `null` when the artifact does not support it. That is what
stops a transformation being dressed up as a countdown, and it is the discipline
`planBeforeAfter` already had. `planComparison` will not invent a second option
and `planFeatureDemo` will not substitute a card for missing footage — both
would be fabricating product behaviour, which §2.4 of the specification and
gotcha 9 independently forbid.

Three names in the union remain unimplemented. They stay because the union is
the extension point, and `selectCreativePlan` can only ever return a type a
planner produced, so an unimplemented name cannot be selected by accident.

### Selection subtracts recent use

Distance-weighted: the last post costs a full point, the oldest in the window a
fraction, and repeats are summed. Recency is read from
`generation_meta.creative.type`, which generation has recorded since §160 — so
diversity needed a reader, not a column. What else was considered, and what each
alternative scored, is recorded too: "why this treatment" is only answerable
against the options that lost.

### The landmine underneath

`PlannedBeats` does `if (!Treatment) return null` while `layoutScenes` still
allots the beat its slice of the timeline. A role with no component is therefore
not a dropped beat — it is **blank frames that still consume seconds**, in a
video that renders successfully and passes every gate. Adding roles without
components would have shipped exactly that.

Four components added, and `EVERY_BEAT_ROLE` plus a test in each package makes
it unmissable. Two tests rather than one because `@halyard/render` is webpacked
and cannot import the core barrel (gotcha 10), so the core side compares the
render source as text.

## 204. Learning that changes a decision, not a table nobody reads

The `learning` team had one agent and it clustered *operator rejections* — what
a human disliked before publication. Useful, and not what the specification
means: nothing read `post_metrics` and turned it into a belief, so every
creative decision was made from priors that no result could revise.

### Why the arithmetic is deterministic

The tempting design is a model reading a dashboard and writing insights. That
produces confident sentences with nothing behind them and fails the only test
that matters. So a row in `learned_insights` is not "feature_demo is good"; it
is a cohort mean, a baseline mean, the ids on both sides, the window, and a
confidence anyone can recompute.

Confidence is sample size and effect size **multiplied**, because neither alone
is worth anything: a huge effect on four posts is noise and a 2% difference over
four hundred is real and useless. It is deliberately not a p-value — calling it
one would imply a test that was not run.

### Contradiction is the interesting case

`reconcileInsight` has three branches, and the middle one is the reason it
exists. Agreement corroborates and can reach `validated`. **Contradiction halves
confidence, resets corroboration, drops the belief out of `validated`, and keeps
the earlier cohort as contradicting evidence** — a pattern that reverses is not
a new fact, it is a weaker one, and a disagreement that has been tidied away
cannot be weighed by a later reader.

### Consumption is the half usually missing

`selectCreativePlan` takes insights, filters them through `actionableInsights`
(no `observed` notes, nothing past its review date), and scales the adjustment
by confidence with a hard cap. **Learning reorders what the artifact supports;
it can never select a treatment the evidence does not carry.** Overwhelming
evidence for `feature_demo` still loses to the absence of footage. An account
nobody has measured gets exactly zero adjustment, which is the honest state and
is asserted.

### Proven against a real database

Not stubs. A cohort forms a belief with both sides recorded; a second pass
corroborates rather than duplicating; the belief changes which treatment a later
plan chooses and names the belief that moved it; sixty contradicting results
reverse the lift, halve the confidence and drop the status. Unmeasured posts and
low-confidence scores are excluded rather than counted as zero.

### Two defects that only a database could reveal

Running the suite with `TEST_DATABASE_URL` set — which nothing had been doing —
un-skipped 26 suites and immediately found two things:

- `learned_insights` shipped without RLS. `schema.test.ts` asserts the invariant
  across every table rather than trusting each migration to remember, and caught
  it.
- **`hooks.test.ts` has been failing since §179.** Its fixture inserts a
  published TikTok item with no Direct Post choices, which
  `content_items_tiktok_needs_choices` correctly refuses. It was invisible
  because the suite skips without a database. Repaired by supplying the panel
  rather than moving the fixture off TikTok, since the test is specifically
  about TikTok being one of several platforms.

The second is the more useful finding: a suite that skips silently is a suite
that can rot, and 26 of them were.

## 205. A gate that fails a video for being a stack of text cards

Every existing gate answers a technical question — is the frame legal, does the
picture change often enough, is the loudness right. A video can pass all of them
and still be a stack of text cards with a word swapping on each, while a
recording of the product doing the thing sits unused in the database.

### Why this cannot be a pixel rule

§73 and §74 already walked that road. Mean-frame luminance could not see a light
card with dark text changing, so the motion signal became tonal range — which
works, and which a card sequence *also satisfies honestly*, because each new
card is a genuine visual state change. A four-second cadence of cards passes the
pattern-interrupt rule on its merits. **No threshold on that signal separates
"cards changing" from "product being used", because at the level of pixels they
are the same event.**

The difference is structural, and knowable without a single frame: did this
piece use the strongest evidence it had?

### What it deliberately does not do

It does not fail card creative as such. An artifact with no capture has nothing
better to show, and failing it would produce a defect no correction could clear
— which is a gate that gets switched off. The rule fires on the *gap* between
what was available and what was used, and reports itself unmeasured when no
footage existed, because `passed` has never meant "every rule ran" (gotcha 6).

Also caught: every beat after the hook sharing one role, nothing held, a beat
carrying more words than anyone reads, and the same treatment three posts
running — a portfolio defect even when each piece is individually fine.

### Policy

`policyCoverage.test.ts` caught all six rules as unmapped, which is what it is
for. The namespace routes to a re-plan. Two rules are exceptions for opposite
reasons: an empty plan escalates, because planning again produces the same
emptiness; text density routes to a copy revision, because shortening an overlay
is not a resequence.

Runs in `review_media`, where the rendered beats and the capture history are
both available. `examined: 0` reports `skipped`, never `passed`.

## 206. Discovery decayed in the specification and not in the schema

`generate` selected signals with `order by relevance desc nulls last, created_at
desc`. Relevance is the primary key of that sort, so **a six-month-old trend
scored 0.9 outranked today's scored 0.7 — permanently.** §9 of the specification
forbids exactly this.

### A half-life per source, not one expiry

The sources age at genuinely different rates and flattening them is wrong in
both directions. A platform trend is worthless in a week; a shipped changelog
entry is as true a month later, because the product still does the thing. One
window would either keep dead trends alive or discard durable material.

A seasonal signal has a date rather than a decay, so `expiresAt` overrides the
curve entirely.

### Where the rule lives

In `discovery/freshness.ts`, not in SQL. A half-life per source is a judgement
about the world, and the UI ranks with the same function the worker does.
`generate` therefore reads candidates, ranks in code, and consumes the winners
by id — the `skip locked` claim is preserved, and the extra round trip buys one
authoritative implementation of staleness instead of two that drift.

`rankSignals` returns fewer than asked rather than padding, because a caller
that wants twenty and gets four has four worth acting on.

### Unmeasured is not zero, again

Confidence and velocity are both nullable and both treated as "no adjustment"
when absent rather than as low confidence or no growth. The same distinction
`performance.ts` holds, and it is asserted in both directions.

The migration's own bug is worth recording: rewriting the consume statement left
`$1` unused, and Postgres cannot infer the type of a parameter nothing
references. `sqlValid.test.ts` plans every statement against the real schema and
caught it immediately. The fix restored the product scope to the `where`, which
the statement should have had anyway.

## 207. The creative acceptance test, on two real rendered files

The brief's standard verbatim: "A static recipe text card with minor movement
should FAIL creative QA... Then inspect the corrected artifact and prove that
the quality materially improved."

So `pnpm creative-acceptance` renders **two actual videos** from the same real
adaptation — the card-only treatment Halyard produced for every post before
§203, and whatever `selectCreativePlan` chooses with the capture available —
then measures both with FFmpeg and runs the gates over the measurements.

| | card-only | selected (listicle) |
|---|---|---|
| beats | 4, no footage | 7, one carrying real capture |
| peak tonal delta | 0.0157 | 0.0275 |
| creative QA | FAIL | PASS |
| retention | FAIL | pass |
| words on beat 2 | 35 | — |

The card-only render fails for the right reason and independently fails
retention, which is corroboration from a gate that knows nothing about
treatments. Its text density is the original complaint quantified: 35, 29 and 23
words on three consecutive cards.

Kept as a script rather than a suite test, matching `render-demo-videos.ts`: a
Remotion render is about a minute and does not belong in a run that must stay
fast.

## 208. The account as a body of work

`format_cadence` bounded formats per week and nothing else, so an account could
publish five transformations about one feature with one hook and break no rule —
each piece individually fine, the sequence monotonous.

`analysePortfolio` slices recent published work by treatment, format, topic,
hook, destination and feature. Overuse is measured **within** a dimension, so a
dominant treatment is a finding even when the topics beneath it vary.

Undercoverage is measured only against a *declared* expectation. Inferring what
an account should cover from what it has covered would make every account
permanently correct, which is the failure mode of every self-referential metric.

It steers rather than reports. Treatment selection carries a portfolio term kept
deliberately **separate** from the learning term: what worked and what the
account has been doing are different facts, a treatment can be both the best
performer and overused, and an operator should see both rather than their sum.
`score = support − penalty×2 + learned + portfolio` is asserted so the parts stay
legible.

## 209. Intelligence, and deliberately not action

§3.2 and §8 both say the same thing in different words, and it is the most
important sentence in either: **"Public engagement automation is not implied by
this intelligence layer."**

A paragraph saying so is followed until someone needs a feature.
`assertNoAutonomousAction` throws if a verb that touches a platform ever appears
among the recommendation kinds, and the test calls it — so adding `reply` is a
build failure rather than a quiet capability gain. This is the same decision
`platform/policy.ts` already makes one level down, where "respond to comments"
is not represented at all.

Two ranking rules carry the rest:

**Evidence or nothing.** A recommendation about a third party without evidence
is not a weak claim, it is not a claim. Dropped by the ranker, and refused by
the database with a non-empty-array constraint rather than left to the caller.

**Popularity is not evidence.** §13 asks the engine to avoid recommending
high-volume accounts merely because they are popular, so relevance is the sort
key and reach is a logarithmic tiebreak that cannot promote an irrelevant
subject past a relevant one — asserted with a 4k-follower relevant account
beating a 9M-follower irrelevant one.

`ignore` is kept visible rather than filtered: a subject considered and rejected
is more useful than its silent absence, and it stops the same candidate being
re-surfaced every run.

### What produces them

Deliberately narrow, and entirely real. Cross-platform creator discovery needs
search endpoints the adapters do not implement, and inventing candidates to fill
the table would be the exact fabrication the evidence rule prevents. So:
comments on this account's own posts — someone who replies repeatedly is
relevant by demonstration rather than inference — and authors surfaced by the
operator's own watch terms.

An operator's decision is authoritative: the upsert is guarded on `status =
'proposed'`, so a dismissed subject is not re-proposed by the next observation.

## 210. Why this, why now, why here

`ideas` records a topic, `content_items` a platform, `slots` a time. Nothing
recorded the reasoning that joined them, so "why did Halyard make this post" was
answerable only by inference from three tables each holding a third of it.

`decideStrategy` is arithmetic over facts that already exist — the opportunity's
decayed worth, the account's mix, what performance established, when it last
posted — so it is identical on identical input and an operator can disagree with
a term rather than with a vibe.

**It refuses**, and that is the point. An account that cannot publish, a decayed
opportunity, a platform-specific signal routed elsewhere, and a post inside the
spacing window all produce no plan at all. A strategy layer that always produces
a plan is a queue filler.

### The measurement plan is why the table is worth having

One metric, chosen from the objective. Judging an education post on link clicks
measures the wrong thing and then teaches the wrong lesson — and §204 will
happily learn from a badly chosen metric. Review delay varies with how long the
number takes to mean anything: two days for impressions, seven for a conversion
signal that needs the person to come back.

`success_threshold` is **null and deliberately not guessed**. A threshold
invented before any measurement would be met or missed for reasons unrelated to
the content, and would then become a fabricated lesson. Null until a baseline
exists, with the basis saying so.

A decision with no measurement cannot be wrong later, and a decision that cannot
be wrong teaches nothing.

## 211. Two registers, because an editorial voice is not a feed voice

`presentationFor(platform, formatSubtype)` returns one of two specs. `EDITORIAL`
is what every render had always been: a modest type scale, a card filling 62% of
its band, a heading face, an eyebrow above the hook. `PUNCH` is 1.85× the type,
86% fill, weight 700, no heading face, no eyebrow, and a harder push on media.

The eyebrow is the clearest case. "ONE ADAPTATION" above the hook spends the top
of the most valuable frame in the piece on a label nobody scrolled for, and in
the measured opening it was the brightest element on screen. In an editorial
context it is a masthead. In a feed it is a tax.

Rejected: one register with a tuning knob. Every value moves together or none of
them do — a punchy type scale inside an editorial fill produces a card that
overflows, and the two registers exist precisely so that cannot be assembled.

**It shipped dead.** §211 built `presentationFor` and only the acceptance script
called it, so every production render was still editorial and the change did
nothing outside a test. Found by auditing modules against their callers, not by
any test. A module with no caller is the same defect as a learning table nobody
reads, pointed the other way.

## 212. The hook reaches the frames, not only the caption

The hook variant was chosen, recorded, and used to write the caption — and then
the video was rendered from the artifact, so the frames said something else. An
experiment measuring hooks was measuring a hook the viewer never saw.

## 213. Generated imagery may illustrate, and may never be evidence

A model can make a picture of a kitchen. It cannot make a picture of the product
doing something, because the picture would be a claim, and the claim would be
manufactured. `assertIllustrative` refuses **before** the provider call rather
than filtering afterwards: a fabricated product shot that exists on disk is one
mistake away from being attached to a post, and the cheapest place to stop it is
before it is made.

This is gotcha 9 applied to pixels. `null` means unmeasured; a generated image
means illustration; neither is evidence.

## 214. A caption budget per platform, and an overflow with somewhere to go

`COPY_BUDGETS` records three numbers per platform — what is visible before a
"more" link, what to aim for, and what the API will accept — plus where the
remainder goes. TikTok shows about 90 characters and accepts 2200; writing to
the ceiling puts the whole point behind a tap.

**The prompt and the gate disagreed for a full pass.** The gate rejected long
captions while `copywriter.v1` still instructed "hard ceiling: 2200 characters",
so the model was being told to write the thing the gate would reject, and the
retry loop paid for it. Prompts are configuration; a gate added without reading
them ships a contradiction that looks like a flaky model.

## 215. Seven ways to tell a story, and the honesty to refuse all seven

Each planner declares what the artifact must support and returns null when it
does not. Selection scores `support − penalty×2 + learned + portfolio`, so a
strong treatment used twice recently loses to a weaker fresh one, and an
artifact carrying nothing a planner recognises produces no plan rather than a
default.

Rejected: a fallback treatment. A default that always fits is how every video on
every account became a before/after opening on a card.

## 216. Provenance travels with the picture

An image's licence is not a property of the pipeline stage that fetched it, so
`ImageProvenance` and `ImageLicense` travel on the asset itself. `owned`,
`attribution_required` and `generated` are different permissions, and
`licenceAllows(license, usage, attribution)` answers the question at the point
of use rather than at the point of download — because the usage is what the
licence actually constrains.

## 217. 5,833 rows and no signals, because nothing joined two tables

`rss_items` had 5,833 rows. `signals` had none. Both tables were correct, both
were being written and read, and the join between them did not exist — so the
discovery half of the system had been running for weeks producing nothing, with
every dashboard green.

`promoteToSignals` and `promoteProductFacts` close it, rate-limited (5 and 3 per
run) so a backlog drains steadily instead of arriving as one flood. Facts
promote only at `status = 'verified'`.

**A deduped candidate leaked a slot.** A candidate rejected as a duplicate
stayed `new` forever and consumed one of the five every run thereafter. The
symptom was a system that promoted fewer and fewer things and never errored.

## 218. Concepts are generated and scored before anything is built

`generateConcepts` produces several angles on one signal; `scoreConcepts` ranks
them. An unbuildable concept scores **0 and is still returned**, because "we
thought of this and could not build it" is information about the product's
evidence gaps, and deleting it destroys the only record of the gap.

`conceptDiversity` measures spread, so three phrasings of one idea do not read
as three concepts.

## 220. Motion is a grammar, not a per-treatment decision

Each visual language — `documentary`, `kinetic`, `editorial_cut`, `product_led`
— maps to entrances, camera moves and transitions, and `LANGUAGE_FOR_TREATMENT`
binds a treatment to one. A transition is implemented as a `Sequence` overlap
rather than an effect layer, which keeps the timing engine authoritative: a
transition cannot desynchronise from the beat it belongs to.

**Three defects, all found by rendering frames and looking at them.** `cascade`
was unreachable, because it was keyed on a language nothing mapped to. Made
reachable, it rendered as a plain block fade, because `Enter` had no cascade
branch. Fixed, the word it emphasised was "a" — `emphasisWordFor` now takes the
last non-stopword. Every one of these passed typecheck, lint and the full suite.

## 221. A music director, and a mix that stops being one constant

The bed was chosen by least-recently-used rotation and mixed at a fixed −22 dB
with a fixed ducking ratio, for every video Halyard has ever made. That is why
they all sounded like the same video.

Mood and energy now come from the concept's emotional angle and the visual
language §220 already chose, so the bed and the cutting agree about what kind of
film this is. Ducking is derived rather than constant: a bed under narration
sits at −26 dB, a bed carrying the piece alone at −14 dB with no duck at all.

**Licence is a gate, not a tiebreak.** A bed whose terms exclude a platform is
refused there even when it is the best creative match. The first version of the
test did not prove this — the restricted bed was losing on mood anyway, so
neutralising the licence check changed nothing and the test still passed. It now
makes the restricted bed the *better* match, so only the gate can produce the
expected answer.

`music_beds` ships empty and stays empty until someone buys music. Inventing a
licensed track is the same class of fabrication as inventing product evidence,
so the empty case reports **why** it is silent rather than substituting a
synthesised pad — which would be ours outright, would sound like a synthesised
pad, and would be indistinguishable in the pipeline from a real bed.

## 222. The frame decides the layout, so there is one implementation to be right

Every composition was 1080×1920, and the constants that went with it — a 12%
safe area top and bottom, a caption band starting at 72% — encoded two facts
about a *phone*: TikTok and Reels draw their own UI over the frame, and portrait
has vertical room to spare. Neither is true of a YouTube player. So
`resolveVariant` could tell an operator "render it landscape to make it
long-form" and there was no landscape to render.

`geometryFor(frame)` resolves the safe areas, the caption band, the content
column and the type scale from the canvas. The landscape compositions share
their components with the portrait ones, so a treatment cannot be right in one
orientation and wrong in the other.

The column cap is the load-bearing part. Padding cannot fix a landscape measure:
1920 px less two 72 px gutters is still nearly thirty words across. Landscape
caps the column at 62% of the frame and centres it, and overrides the role's
vertical anchor — bottom-anchoring puts words near the thumb on a phone and
strands a third of the picture on a 16:9 frame.

**The type scale was settled by looking, not by arithmetic.** Derived from the
height ratio it came out at 1.6, which turned a hook into a title card. 1.25 is
what the rendered frames actually supported.

**A landscape slot refuses rather than falling back to portrait.** A 9:16 file in
a long-form slot publishes as a Short — exactly the mismatch `resolveVariant`
exists to report, except the render would have succeeded and nobody would see
the report. The landscape templates arrive **disabled**: a template the operator
has not looked at should not start carrying posts because a seed ran.

Registered in `seed.sql`, not a migration. A migration inserting a template with
a `product_id` breaks `createIsolatedPool`, whose freshly-migrated database has
no products in it — 37 test files failed at collection before this moved.

## 223. Chapters, and the silence that made them worth enforcing

YouTube shows chapters only when the whole list satisfies rules it does not
report on: the first stamp must be `0:00`, there must be at least three, and
each must run ten seconds. Break one and YouTube renders the description as
plain text. The upload succeeds, the API response is identical, and the
chapters are not there.

So the rules are enforced in `chaptersFromBeats` and a list that cannot satisfy
them is refused **with a reason**, which is recorded on the publication. An
operator looking at a long-form video with no chapters would otherwise have no
way to find out why.

Timestamps come from `layoutScenes` against the measured runtime of the file
being uploaded — the same function the renderer used, called with the same
inputs. Rejected: storing resolved times at render time, which would be a
second copy of the same fact and therefore a thing that can disagree.

A beat with no title gets no chapter. "Chapter 3" tells a viewer nothing the
scrubber did not already.

## 224. A thumbnail is not a small picture, it is a picture seen small

YouTube serves 1280×720 and draws it at roughly 360 px wide. Everything follows:
type that looks generous on the canvas is worth 28% of that where it is read.
So the limits are expressed as *rendered* sizes and the canvas figures derived
from them — the opposite of every other template here, and deliberately.

`thumbnails.set` accepts anything that is a valid image under 2 MB. A thumbnail
with eleven words uploads exactly as successfully as a good one, and the only
feedback is a click-through rate weeks later that nobody can attribute. Same
shape as §223: the API's success is not evidence the thing works.

**Two defects, both found by shrinking a render to feed size and looking.** The
canvas was `CANVAS['16:9']` — 1920×1080, the right ratio and the wrong picture,
which quietly invalidated the legible-size arithmetic. And the overlay asked
`Instrument Serif` for weight 700, which loads at 400 only, so it fell back
silently and read as a thin line rather than a thumbnail. It now uses the face
that actually has weight.

### The upload refuses before it calls

`thumbnails.set` needs `youtube` or `youtube.force-ssl`. Halyard requests
`youtube.upload`, `youtube.readonly` and `yt-analytics.readonly`, and the
connected channel holds exactly those three — verified against production, not
inferred. So the call would 403 every time.

Making the request anyway would burn quota, fill the log with an error that
looks like a fault, and tell an operator nothing about what would fix it. The
refusal names the scope instead and stops. Widening the grant is not a quiet
code change: the requested scopes are what the pending compliance audit is
assessed against, and `force-ssl` grants full write access to the channel.
That is an operator's decision.

The upload itself is written and correct, and runs the moment the grant exists.
It is not a stub.

## 225. A table with readers and no writer

This has now happened three times, and every time it looked like success.

- §210 built `strategy_decisions` and wired no writer.
- §217 found 5,833 `rss_items` and zero `signals`, because nothing joined the
  two tables.
- §218 built `concepts`, `creative_briefs` and `platform_variants`, and
  `creative_briefs` had **no writer at all** — so §221's audio direction and
  §223's chapters were both correct code joined to an empty table. Three
  systems, one missing insert. Production held zero briefs.

Nothing in the suite could see any of it. Tests insert their own fixtures, so
they pass. Typecheck passes, because nothing is wrong with the types. No rows
is not an error, so the dashboards stay green and the table stays empty.

`tableWriters.test.ts` reads every SQL statement in production code and requires
each table on a declared list to have an `insert` or an `update` somewhere
outside a test. It fails today if the brief writer is removed — checked by
removing it.

The list is deliberately not every table. `music_beds` ships empty until someone
buys music (§221), and `halyard_empirical` claims are zero everywhere by design
(gotcha 9). Those are decisions, and listing them would turn a decision into a
failure. The list is the tables where empty means broken.

**What it does not prove:** that the writer runs, that it runs often enough, or
that what it writes is right. Only that a path exists — which is precisely the
thing that was missing all three times.

### The plan is the brief

Writing it down is not a derivation. `CreativePlan` already carries the
treatment, the beats, the runtime, the evidence and the rationale; the row is a
record of a decision that was already made, and `content_items.brief_id` is what
makes it findable from the thing it produced.

## 226. Six typography systems, because one pairing made every video the same

Every video set its headings in Instrument Serif and its body in Inter, because
those were the only two families on disk. Motion varied (§220), the register
varied (§211), the treatment varied (§203) — and every frame still opened in the
same type, so none of that variation was visible.

Five more families ship with the render package, all SIL OFL, as **variable**
faces so one file covers a weight range. Fetched from the upstream sources
rather than the CDN, whose unicode-range subsets are partial faces that render
missing glyphs.

The unit of choice is a **system**, not a face. A pairing is not two independent
choices: a high-contrast display serif wants a quiet grotesque under it and
looks wrong under a second display face. A director picks a system; it never
picks a font.

`inkFor` gained a `role`, so a label can be uppercase and tracked while body
copy in the same system is neither. Before that, every piece of text on a frame
was the same face at different sizes.

## 227. Thirteen visual languages, and a test that they are not synonyms

Five languages was enough to prove the grammar and not enough to stop an account
looking like one show. The new ones are the looks a social team would name in a
brief — `editorial_food`, `fast_cut_creator`, `premium_instructional` — and each
is a distinct *motion behaviour*, not a label.

`motion.test.ts` builds a signature from every language's entrance, camera,
transition, amplitude and direction across four beats, and fails any two that
match. A set of labels over one behaviour is variety that is not variety, which
is the specific failure this codebase keeps finding.

**Coverage is an invariant, not a hope.** The first typography mapping left six
of the thirteen languages with exactly one compatible system, so type never
varied for them at all. Every language now has at least three: two alternate,
and a viewer reads an alternation as a pattern; three or more rotate.

## 228. A Creative Director, so the choices cooperate

`selectCreativePlan` chose a treatment, `motionFor` moved a beat,
`selectTypography` picked type. Each was right alone and none chose the **look** —
the language everything else hangs off, which was derived from the treatment by
a seven-entry lookup. Eight of the thirteen languages were reachable from
nothing at all.

Deterministic, because this is a resolution of constraints that all exist as
data: what the concept is about, what the platform rewards, what the account
just did, what performed, what assets exist. A model asked the same question
would be less consistent and could not explain itself against the alternatives.

**It refuses rather than penalising.** `product_led` with no footage is
restrained motion around nothing; `cinematic` under fifteen seconds has no room
for a considered pace. Recency carries the largest single weight, because an
account that always looks the same is the actual complaint.

## 229. Seven openings, because the layout was the last thing that never varied

Rendered side by side, all six typography systems still opened identically: a
small uppercase kicker, then the headline, both flush left at the same height.
Type and motion vary *inside* a layout; the layout is what makes an account look
like one show.

Availability is content-dependent and that is the point. `numeral` needs a real
figure from the artifact and is unavailable without one — inventing a number to
unlock a nicer composition would be fabricating evidence for a design reason,
which is the worst kind. `over_media` needs media; `cold_open` needs a before
state; `question` needs a hook that actually asks something, because punctuating
a statement with a question mark is the cheapest trick in the format.

**Two defects, both found by rendering the frames.** The question opening printed
its mark twice — the sentence's and the display one. The fragment reveal split
one sentence into two blocks, so the hold forced a line break wherever it fell;
it is one paragraph with two spans now, and only the opacity changes.

## 230. Parallax was a push with a drift

`parallax` had been in the vocabulary since §220, implemented as a translate and
a scale on the *whole subtree*. Two planes moving at different rates is what
parallax is, and one plane moving is a camera move with a different name.

The background and the foreground were already siblings, so the fix was to make
them move *against* each other. Counter-motion rather than merely different
rates: on a 1080-wide frame, at amplitudes that stay tasteful, same-direction
motion at different speeds is indistinguishable from a single drift.

## 231. Platform variants that are actually different

`platform_variants` had columns for pacing, text density, hook treatment, CTA
and audio treatment since §218 and **no writer**. A TikTok, a Reel and a Short
got the same file with different words underneath.

The decision matters more than the spec: `reuse`, `remix`, `original`, `skip`.
**Skip is what makes the others honest** — a system that always finds a way to
post everywhere is a system that posts things it should not, and a montage on a
still surface is a slideshow.

A reused *edit* never reuses the *wording*. Two accounts posting the identical
hook a day apart is the clearest tell that a feed is automated, and the cheapest
thing to vary.

## 232. A voice that is directed rather than defaulted

`synthesize` took stability 0.55 and similarity 0.8, and nothing ever passed
anything else, so a playful fifteen-second TikTok and a considered explainer were
read identically. Stability is a **performance** setting, not a quality one:
high is consistent and flat, low is expressive and varies between renders.

The half the API cannot take goes to the writer instead. ElevenLabs exposes no
per-word emphasis and no speed control on this endpoint, so pace and stress live
in the sentences — a comma is a pause, a short sentence is emphasis, an em dash
is a beat. Passing a `speed` that does not exist would silently produce a flat
read, which is the same shape as a gate that never runs.

## 233. Sound design, anchored to the edit

Every cue is tied to something the edit already decided: a transition sound
marks a transition that exists, an impact marks a beat that enters on a pop, a
UI sound marks a **captured** product interaction. Nothing is placed for energy.

A hard cut gets nothing, because the point of a hard cut is that it is instant
and a whoosh over one turns it into a wipe. `documentary`, `cinematic` and
`editorial_food` get no sound design at all — punctuating them reads as a sizzle
reel.

The density cap is deliberately low. One effect every four seconds is already
busy; above that a viewer stops hearing individual sounds and starts hearing
production.

A tap over footage where nothing is tapped is a **fabricated interaction**, in
the same family as a fabricated screenshot. The library ships empty for the same
reason `music_beds` does.

## 234. Nine more gates, and a namespace that was covering for them

The creative acceptance suite judges pacing against what the platform variant
asked for, motion density in both directions, repetition of language, opening
and typography, unexplained silence, loudness, and alt text. Every input is
optional and an absent one reports `unmeasured` rather than passing — gotcha 6.

All nine were "covered" by the `creative` namespace fallback, which routes to
`resequence_scenes`: a correction that cannot add alt text, cannot change a font
and cannot remix audio. `policyCoverage.test.ts` passed the entire time.

It now fails when a namespace that already needed a specific entry leaves any
rule inherited — the evidence that a namespace is not uniform is that somebody
already had to write one. That found two more that were wrong:
`creative.repeated_treatment` was resequencing a finished render to fix a
property of the *sequence*, and `coherence.opening_line_buries_it` was
resequencing scenes to fix a writing defect.

## 235. The Studio, and gotcha 10 catching a fourth victim

Concepts, selection, direction pins, rejection with a reason. Everything an
operator sets is a **pin**: the directors honour it absolutely, including over
their own objection, which they record rather than silently overriding.

Its client component imported `@halyard/core` to fill a dropdown. That
typechecked, linted, and passed all 2,524 tests, then failed the production
build with `UnhandledSchemeError: node:crypto`. The landmine is documented in
CLAUDE.md and it still happened, because the only thing that catches it is the
slowest signal in the repository.

`clientBoundary.test.ts` is the one-second version.

## 236. What the first real production run found

Production had generated nothing, ever. The cause was a first-run wizard guard
refusing on **stale flags**: a brand voice with rules existed and eleven
templates were enabled, and `step_voice_done` and `step_templates_done` had
never been flipped.

Then, running against real RecipeFix data:

- `creative_briefs.concept_id` and `platform_variants.concept_id` were `not
  null`, which assumed a concept always comes first. §218 made concept
  generation asynchronous precisely so a model call could not stall a run, so a
  brief planned from the artifact alone is a real state.
- `platform_variants.decision` had no value for **remix**, which is the case
  that separates a cross-post from a feed that reads as automated.

## 237. A fit that fitted the wrong size

`fitWords` had existed since §211 with no caller. The cost was visible on the
first real production frame: a step beat carrying 25 words. It also cut at the
word limit, turning a sentence into a fragment that stops mid-thought, so it now
cuts at a boundary the writer put there.

The larger bug was underneath it. `fitScale` searched for a scale whose height
fits the band, and the font size was then computed as `base × scale ×
typeScale`. In the punch register that multiplies a fitted block by 1.85 **after**
fitting it, so every dense beat overflowed by exactly that factor.

Both halves were correct and their composition was not, which no unit test of
either half can see.

The first correction divided the band by `typeScale` instead, and still
overflowed by 7%: height is not linear in scale, because bigger type wraps
sooner. The multiplier is passed *into* the fit.

## 238. A failure nothing could explain

A production item sat at `status = 'failed'` with both of its renders `done` and
no error recorded anywhere. The render had failed, marked the item, then been
retried successfully — and there was no path back.

A render failure is now attributed on the item, and a later success clears **only
a failure that renders caused**. A render succeeding says nothing about a claim
that could not be verified, and resurrecting such an item would push
unverifiable content back toward approval.

The marker is what makes the recovery safe rather than merely convenient.

## 239. What a production music library actually needs

`music_beds` had mood, energy, tempo and licence fields and could not answer:
where did this come from, who proved the licence, does it have vocals, is it
retired, has this *account* heard it. Selection was a mood match and a
timestamp.

**Provenance is the column that makes a fixture library safe.** §221 refused to
synthesise beds because a synthesised pad would be indistinguishable in the
pipeline from a real one, so nobody would notice which shipped. That danger is
now a gate: `licensed_production` may be published, `test` may be previewed,
`unverified` is neither — and a production claim with no `licence_proof` is
refused by both a database constraint and the director.

`music_usage` exists because `last_used_at` answers *when* and nothing else.
Repetition is judged in the feed a viewer actually scrolls, not globally: two
accounts may legitimately use the same bed on the same day.

Selection now weighs tempo against the cut rhythm, refuses vocals under
narration, matches energy to how much the picture is moving, and takes measured
performance as a tilt rather than a verdict. Every choice returns reasons.

## 240–241. A fixture library, clearly marked

Six `[TEST]` beds and four effects, synthesised deterministically, spanning the
mood and tempo space so the selector has something to choose between — a single
candidate always wins and "chose this because" means nothing.

They are not licensed music and the operator action is unchanged. They exist so
the mixing, ducking, loudness, selection, repetition and placement code can be
exercised without inventing a licence.

## 242. Sound design was unreachable

`planSfx` and `selectEffect` were written in §233, tested, and called by
nothing: no handler invoked them, and `mixAudio` had no input that could take
the result. The fourth instance of this codebase's signature failure.

Effects are mixed as delayed inputs *after* the duck rather than inside it: an
effect is punctuation on the edit, not part of the bed, and side-chaining it
against the voice would swallow the transient that makes it audible.

The tests measure band energy in the mixed file. Asserting that a function ran
is what let this sit dead for two sections.

## 243. A stale worker is a silent outage

The deployed worker's heartbeat listed 29 job kinds where the code has 32. It
predated `generate_concepts`, `learn_from_performance` and
`build_account_intelligence`, so those jobs sat `pending` forever — no error, no
failed job, and the features they belong to looked broken for reasons nothing
explained.

The `kinds` list is a good staleness signal because it is derived from the code
actually running and changes exactly when the handler map does. The heartbeat
also recorded version `0.1.0` on every deploy ever made; it now records the
commit.

## 244. The check §242 said existed

§242 set `forPublication: false` in the TTS handler — correctly, that mix
happens long before approval — and left a comment claiming the publish path
re-checked provenance. It did not. A fixture mixed at draft time would have
reached a real post and the whole apparatus would have been decoration.

`audioIsPublishable` runs against what was **recorded as used**, not against
what the selector would choose if asked again: the file that exists is the one
being published.

## 245. Selecting a bed is not using one

Production produced a `music_usage` row for a bed whose bytes were never read —
the run selected it, wrote the row, then died before the mix. The mix shipped
silent while the memory said the bed had played.

That memory drives repetition avoidance, so a phantom entry silences a bed
nobody heard, for a fortnight, on the strength of a use that did not happen.

## 246. Captured footage did not survive a deploy

A beat references product footage as a path inside the Remotion bundle's
`public/` directory, and the capture handler wrote it there and nowhere else. A
deployed container is ephemeral, so after any redeploy every render planning on
product footage failed with a 404 from the bundle's own dev server — three
retries, then `dead`, with nothing saying the file had not survived.

The cut footage is now an asset tagged with the bundle-relative path the beat
references, and the render handler stages it back before rendering. A render
whose footage cannot be staged is **refused**: a beat planned around product
footage that silently becomes a text card looks finished while the evidence it
was built on is absent.

## 247. The anchor stranded the top half of the frame

Everything but a hook was bottom-anchored, justified as clearing the caption
band — which `bandFor` already does by ending content at 72% of the height.
Anchoring to the bottom of that band as well pushed a text card into the lowest
third.

A production frame showed it: a label and two lines in the bottom 40%, and 55%
of a 1080×1920 card holding nothing. The distinction is **media, not role** —
over footage the words belong low because there is a picture to keep; over
nothing there is not.

## 248. An import path that will not guess a licence

The library is the one place where a mistake is a *legal* mistake. A bed with
a plausible-looking licence string and no proof is exactly as publishable as a
real one unless something refuses it, so the refusal lives in code with tests
rather than in the head of whoever ran the importer.

Duration is measured from the file. A manifest claiming ninety seconds for a
twelve-second file produces a bed the selector believes can cover a
thirty-second piece, and the mix runs dry two thirds through with nothing
reporting it.

There is no path from "this was free to download" to publishable that does not
pass through a person writing down where the grant can be checked. An
unfamiliar licence is `unverified`, not assumed fine — and unverified beds are
still imported, because discarding them means downloading them again later and
re-deciding the same question.

A bed whose mood the director cannot score is refused outright: it would sit in
the library, paid for, and never be selected.

## 249–251. Long-form, and the two ways it was still a Short

Ask a short-form planner for eight minutes and the timing engine stretches four
beats to two minutes each. Five structures now produce *sections* with intended
lengths; the proportions are the argument.

The chapter rules shape the structure rather than being applied to it (§223), so
a test runs the sections through `chaptersFromBeats` to prove the list is one
YouTube will render.

**Then it was still a Short, twice.** `defaultSubtypeFor('youtube')` returns
`short`, so nothing could *ask* for long-form and the whole architecture sat
behind a condition that never fired. And once it fired, the render was 28
seconds: the render length follows the voiceover, and the voiceover was written
to `VO_TARGET_SECONDS` regardless.

**Then the script was sixty words.** Asked for eleven hundred in one call, the
model wrote a short-form script and stopped — that is what a single "write a
voiceover" request looks like however large the number in it is. The sections
were already there and each is a normal-sized writing task with its own brief.

## 252. Types do not survive a JSON boundary

A render died on `Minified React error #31` — an object with keys
`{adapted, stepNote, tradeoff, replaceTerm}` passed as a React child. The
connector returned a structured swap where the planner expected a line of text,
and every layer carried it: the plan *types* the field as `string | undefined`
and nothing checked at runtime, so the first thing to object was React,
minified, three retries deep, on the deployed worker.

The best available string is salvaged where there is one. A transformation card
missing its "after" is a worse render; a card carrying an object is no render at
all, because React refuses the whole tree.

## 253. A selector with no way to fail gracefully

Capture died on `role=button[name="Adapt This Recipe →"]` — an exact match
including a trailing arrow, against a UI that ships continuously, with no
fallbacks on the step. One copy change stopped every recording of the product's
central action.

§159 learned this for `aria-label="Choose your swap"` and the fix did not
spread. Four more bare click steps now have fallbacks that widen the way a
person would try: the same name without the decoration, a pattern, then the
structural control.

## 254–255. Discovery that refuses in four distinguishable ways

`freshness.ts` decayed a signal and ranked it. Nothing decided whether a signal
was *worth making content about*, which is a different question.

Four refusals, and they are not interchangeable: `off_brand` is permanent,
`covered` is a no for now, `unbuildable` is a no until the product ships
something, `stale` fixes itself by being dropped. Collapsing them into one
`false` is how a discovery system becomes a thing that rejects everything for
reasons nobody can act on.

A signal with no source is refused **before** scoring. Gotcha 9 applies to
trends exactly as it does to metrics: a trend Halyard cannot point at is one it
invented.

`pipeline.test.ts` carries a signal through all ten stages — opportunity,
direction, typography, opening, motion, variants, voice, music, sound design,
QC — using the real production functions with fixed inputs. It does not prove
the content is good; nothing automated can. It proves each stage produces
something the next can consume, which is the failure this codebase keeps
finding: two stages that each work, joined by nothing.

## 256. Three optional probe fields with no writer — and why only two of them stay that way

`review_media` reported four retention checks `unmeasured` on a production
render. One is unmeasured on purpose: §73 established that mean luminance cannot
see a light card with a small region of changing text. Sampling is already
front-loaded — `0, 0.8, 2` plus three body frames — so the deficiency is the
signal, not the rate.

The other three were not a decision. `firstFrameWordCount`, `firstFrameContrast`
and `loopSimilarity` are optional fields on `RetentionProbe` that **nothing has
ever written** — the third instance of that defect after §71 (`frameLuminance`
parsed off the wrong stream, always `[]`) and §74 (`frameDelta` never supplied).
An optional input with no writer reads, from outside, exactly like a check that
passes.

**`loopSimilarity` was implemented, measured, and reverted.** The plan was a
16×16 greyscale average-hash of the first and last frames, on the argument that
256 cells are not an average and so escape §73's objection. Against the four
fixture renders it looked perfect: 0.990–0.994, comfortably past the 0.6
threshold.

That number is meaningless, and the check that showed it is the one worth
keeping. Comparing frames from *entirely different scenes within the same
render* gives:

| signal | different-scene pairs | the actual loop pair |
|---|---|---|
| 16×16 average-hash | 0.979 – 1.000 | 0.994 |
| full-resolution MAD | 0.980 – 1.000 | 0.993 |
| 16×16 **min**-pool (§74's YMIN signal) | 0.965 – 1.000 | 0.949 |

The loop pair sits *inside* the noise band of unrelated frames under every
variant. No threshold can separate "the ending reads as the opening" from "the
ending is a different scene", so the rule would have returned a measured pass on
every render Halyard will ever produce.

Min-pooling was the most promising variant, because §74 found that tonal range
sees this content where the mean does not. It fails here too, and the reason
generalises §73 rather than repeating it: **whole-frame comparison of any kind
cannot see Halyard's content.** Every render is a light card with a small dark
text region, so any two frames are ~98% identical by construction, whatever the
pooling. §74's tonal range works because it asks a *within-frame* question
(is there dark content anywhere); loop similarity is inherently
*between-frame*, which is the axis where this content carries almost no signal.

So the field stays unwritten and `retention.not_loop_ready` stays `unmeasured`.
An honest gap is worth more than a green check that cannot fail — and a rule
that passes everything is the one that gets trusted and then relied on.

Closing it honestly needs a signal that survives the light-card problem:
comparing the *text* rather than the picture, which means the frame descriptions
`review_media` already gets from the vision model, or the render's own knowledge
of what it drew. Both are real options; neither is a pixel comparison.

The same reasoning applies to `firstFrameContrast`. A bimodal-histogram guess at
"text against its background" would be a fabricated measurement, which is worse
than an absent one.

## 257. The database I was reading was not the one that runs

Six days of "production" analysis came from `localhost:5432`. The repo-root
`.env` points at the local development database; the Railway worker reads its
own `DATABASE_URL`, which is Supabase. Gotcha 2 covers the *write* direction —
credentials placed at the root are invisible to both apps — and this is the read
direction of the same split, which is worse because nothing errors. Every query
answered, with plausible, wrong data.

What it produced: a report that long-form had never run, that `platform_variants`
had no writer, that `concepts` and `creative_briefs` were empty, and that
`publishing_enabled` was **true**. In production all four are the opposite —
39 variants with real `skip` decisions, 44 concepts, 8 briefs, and publishing
off. The local database was simply six days stale.

Read production through `railway variables --service worker --kv`. A local
`psql` says nothing about what the system is doing.

## 258. A row that outlives the piece it was for

Three YouTube long-form items sat in `pending_approval` with `ai_components` of
`{copy}`, `vo_script` null, `vo_asset_id` null and `render_ids` empty — videos
with no video, waiting for a human to approve them.

`content_items` is inserted at line 781, when the copy is written. The voiceover
lands at line 1022 and the render after that. Everything in between can abort,
and the rejected-voiceover path does: `writeVoScript` throws
`DraftRejectedError`, the handler catches it, logs **"draft rejected by QC,
nothing queued"**, and `continue`s. The log was true when the gates ran before
the insert. It has been false since the insert moved ahead of them, and the
comment beside it — "Never queued. That is the point of the gates." — is the
kind of comment that stops being read.

So the gate worked perfectly and its refusal reached the operator as a finished
piece. Gotcha 6 one table over: a skipped step is not a passed step.

The row is now marked `failed` with the reason, on every exit from that loop
including the rethrow. Conditional on `status = 'pending_approval'`, so it can
only disown what this run left half-built — never something an operator already
approved, never a later stage's own failure reason.

**§251 made this reachable.** Writing long-form section by section means one
`writeVoScript` call per section rather than one per piece, and any section
being rejected now rejects the whole voiceover. Before it, long-form got a
too-short script that failed honestly at the audio gate; after it, long-form
silently got no script at all. A fix that turned a loud failure into a quiet
one.

## 259. wpm is not a property of the voice

Three local scripts measured 177–179 wpm across a 13% spread in word count,
which looked like proof that the synthesiser has a fixed rate and that the
158-wpm word budget in `copywriter.ts` was therefore targeting a number it would
never hit. I changed the constant to 178 on that basis.

Production, same ElevenLabs voice id, same key: **131 and 134 wpm**. A 36% range
on one voice, so the rate is not a voice constant and the change was a
regression — it would have written ~35% too many words for long-form.

The local sample was three scripts of the same *kind* — short-form continuous
prose. Consistency within one style is not evidence of a constant across styles;
long-form is stitched from sections with paragraph breaks, and the synthesiser
pauses at them, which is exactly the lever `audio/voice.ts` documents as the
only one available. Reverted.

The real finding is that one constant cannot serve both styles: 158 writes ~11%
short for continuous prose and ~20% long for stitched sections. Closing that
honestly means measuring the delivered rate per style and feeding it back, not
picking a better number.

## 260. The mix ceiling is unsatisfiable on an account that has published nothing

The first real generation run after §258 was refused twice. The first refusal
was the onboarding gate, which is working as designed: Halyard will not generate
at scale until an operator has rated twenty calibration drafts. The intended
bypass is a `calibration: true` job, and batch size still comes from `limit`, so
a calibration run can be one piece per format rather than twenty.

The second refusal was the content-mix guard, and it is a deadlock:

```
idea not selected — "Product content is at 0% over 14 days; the hard cap is 15%."
```

The message names the *current* share while the rejection is computed from the
*projected* one:

```js
wouldBeShare = (productShare14d * projectedTotal + 1) / (projectedTotal + 1)
```

`projectedTotal` is floored at 1, so the first product idea against an empty
history projects to `1/2` — 50% against a 15% ceiling. Product content stays
unreachable until roughly six non-product posts exist in the fourteen-day
window, and those come from `publications`, which is empty and stays empty
because publishing is off pre-launch by design. So the guard cannot be satisfied
on the account it is guarding, and the stated reason ("at 0%") reads to an
operator as nonsense, which is why it sat there.

This is the same deadlock Milestone 51 fixed one guard earlier: a calibration
batch refused by a condition that calibration is what satisfies. Fixed the same
way — the ceiling governs *publishing* over fourteen days, and a calibration
batch is never published. It is the spread of drafts an operator rates, and
those ratings are what give the mix any meaning at all.

Scoped to calibration deliberately. The ordinary run still enforces 15%, which a
test pins, because the alternative — treating an empty window as permissive
everywhere — would let the first six posts on a new account all be product.

## 261. Rows claimed by a stage that died

Three defects, one shape, all live at once: a row marked in-progress by a stage
that then aborted, with no job pointing at it and no error to explain it.

- **Renders.** `generate` inserts the Remotion row and deliberately does *not*
  enqueue it — `tts` releases it once the audio exists, because rendering first
  produces a silent video of the wrong duration. That `tts` enqueue is the last
  statement in the video block, so anything throwing in between leaves a render
  in `queued` forever. Three were, the oldest eleven hours old, and the
  contract's own comment predicted it: "without it a video item would sit in
  `queued` forever with no error to explain it."
- **Ideas.** `generate` claims an idea before spending anything on it (§78/§87)
  and marks it `used` when the drafts land. A run that dies between the two
  leaves it `selected` permanently: never drafted, never re-proposed. Five were.

Fixed at the source — §258's disown now fails the item's queued renders too,
because releasing them would render a video for a piece whose script was
rejected, which is the exact silent-video case the contract exists to prevent.

And a net in `reconcile_schedule` for what the source fix cannot see: a worker
killed mid-run, a deploy during generation, a retry abandoning its first
attempt's rows. Put there rather than in a new job kind on purpose — a new kind
means `JOB_KINDS` *and* `jobs_kind_check` *and* a migration (gotcha 1), for a
sweep that belongs on the cadence `reconcile` already runs.

Deliberately conservative: it touches only rows with **no job referencing them
at all**, and only after two hours. Anything still being worked on has a job, so
it cannot race live work — four of the ten tests assert exactly what it must not
touch.

Reported per sweep rather than silently repaired. A steady trickle here means a
bug upstream, and a sweeper that quietly tidies up after one is how the upstream
bug stays invisible.

## 262. Which gate refused, not merely that one did

`DraftRejectedError` has carried `lastQc` since it was written and nothing ever
read it. A rejection reached the operator as "rejected by QC after 3 attempts"
with no way to learn why — the copywriter's own comment calls that "the failure
recorded somewhere nobody reads", and it was in fact recorded nowhere.

The failing gates now travel into the disown reason and the log line. Three
consecutive attempts failing the same rule is the signal worth having: it means
the brief and the gate disagree, and no number of retries will settle that.

## 263. The envelope that got spoken

The first real end-to-end run produced a 1080×1920 video whose opening frame
carries this, in the caption bar, on screen:

```
{"script":"Phone locked mid-recipe?
```

`writeVoScript` asks for prose and took `response.text.trim()` verbatim, while
`writeDraft` twenty lines away runs `extractJson`. When the model wrapped its
answer anyway the whole envelope became the script — synthesised by TTS,
transcribed into captions, and passed by **every gate**, because the gates read
a script for slop, banned phrases and forbidden claims, and not one of them asks
whether it is a script at all.

Same family as §252: a structure travelling through layers that each type it as
`string`. It survived because every one of those layers was individually
correct.

`unwrapSpokenScript` takes the prose out of an envelope, including a truncated
one — `maxTokens` cutting the reply before its closing quote is the common
shape, and the words are all there. When nothing spoken can be recovered it
returns null, the attempt retries with feedback naming the problem, and a run of
those refuses. A script nobody can read aloud is not a script.

Found by rendering a frame and looking at it. No gate in the system would have
caught it, and the loudness, duration, dimensions and word-error-rate were all
within tolerance on that same file.

## 264. Truncation that stopped inside a word

A production carousel slide read *"keeps the graham flavor and the classic crisp
t…"* — cut mid-word, with a quarter of the canvas empty beneath it. Another
stopped at *"oat flour keeps…"* with 60% of the slide unused.

Two faults compounding. The budget was a flat 130 characters that knew nothing
about the box: a 4:5 slide sets body across ~912px at 36px, roughly fifteen
lines, and 130 characters is under three of them. And the fallback cut wherever
it landed — a sentence or clause boundary was tried, but only past 60% of the
budget, so anything shorter got a raw slice.

Now: a sentence end if there is one, else a clause, else the last **whole word**.
Never inside a word, because that is what reads as broken software rather than
as an abbreviation. The budget is 230 characters, derived from the measure and
the line height rather than picked.

The ellipsis is now the single character `…` rather than `...`, because
`slopFilter` searches for `…` when deciding whether copy trails off, and three
dots walked straight past it.

## 265. Nineteen of twenty-one renders could not see the Creative Director

The review of 2026-08-29 called the output "one template". The first diagnosis —
that the director had not run — was wrong, and worth recording as wrong:
`generation_meta` carries no `visualLanguage` because it is the *copywriter's*
metadata, written 570 lines before the director is called. The director runs and
chooses well; `creative_briefs.visual_direction` holds eight visual languages and
five typography systems across ten briefs.

The direction reached the **Remotion video path only**. Satori image templates
were handed `bodyLines, headline, index, kicker, total` and drew with one fixed
`props.brand` pair. Nineteen of twenty-one renders in that run were images. The
variety machine worked and 90% of the output could not see it.

**Why it had never been wired.** Not an oversight — Satori *could not render the
fonts*. Its parser throws `Cannot read properties of undefined (reading '256')`
on all five bundled variable families, and 256/257/264 are **nameIDs**: it parses
the variable-font `fvar` table against `font.names` and cannot resolve the axis
records. So only Inter and Instrument Serif were ever registered.

The fix is a font change, not a loader change. Each family is instanced to
static cuts with **every axis pinned**, which removes `fvar` entirely. Pinning
`wght` alone is not enough — Fraunces carries `opsz/SOFT/WONK`, Bricolage
`opsz/wdth` — and an unpinned axis keeps the table and the parse still fails.
`scripts/build-static-fonts.py` regenerates the sixteen cuts.

Remotion renders the variable originals perfectly, because a browser does not
use this parser. That asymmetry is precisely why the gap survived: the video
path was standing proof that the fonts were fine.

The system crosses into `@halyard/render` as **plain data** via
`renderTypography()`, never as an id it would have to look up — gotcha 10, and
the reason `renderTypography` exists at all.

Image-only accounts get a typography choice of their own now, from the same
recency window, because the director sits inside the `needsVideo` branch and
Instagram — whose carousel is the most-rendered template in the system — never
reached it.

## 266. A headline sized for the canvas it is read at

Carousel headlines were 66px on a 1080×1350 slide: inside the 60–90px range that
works and at the bottom of it, which read as a small block of type marooned in a
tall canvas — the "empty top third" in the review. 78px is the middle of the
range and fills the measure. A slide is looked at around a third of its size in
feed, so this is the dimension least safe to eyeball at full size.

## 267. Layouts, because type alone is not variety

§265 gave the image path six typography systems and every slide still had one
composition. At feed size the eye reads *position* before it reads a typeface,
so six fonts in one layout still looks like one template.

`layouts.ts` holds five typographic compositions and two photographic ones, and
none of them knows what a recipe is: a layout is a **shape for an argument** —
a claim alone, a claim with support, a number carrying the point, a hinge
between problem and fix. Every product attached to Halyard has those.

Chosen, not cycled. The content decides what is *possible* before the brand
decides what is preferred: a statement layout given four sentences has to shrink
them past legibility, and an editorial column given no body renders an empty
well. Then the visual language narrows it, and recency breaks the tie — within
the deck as well as across the account, because six consecutive slides in one
shape is what a viewer actually notices.

## 268. A cooking product with no picture of food

The review found it plainly: twenty-one assets, not one photograph of anything
edible. Type on cream every time. That is the gap between reading as a brand and
reading as a script, and no amount of typography closes it.

**Everything needed already existed and none of it was connected.**
`imagery/types.ts` has provenance, licence, attribution and `canEvidence()`.
`connectors/recipefix.ts` extracts a `sourceImage`. There is an OpenAI image
client. `attached_asset_ids` is read by `publish` and `review_media`. And
`attached_asset_ids` was empty on every item ever made.

The client had never worked. It sent `response_format: 'b64_json'` — a DALL·E
parameter that `gpt-image-1` rejects outright with `HTTP 400 Unknown parameter`.
So the first call ever made to it failed, and nothing had called it since.

**Where a generated picture is allowed.** `generated` means illustration only.
A photograph of finished food in a *hook* is atmosphere; the same picture
captioned "here is your result" is a claim about an outcome nobody measured,
which is gotcha 9 in a nicer coat. `EVIDENTIAL_ROLES` already named those beats,
so hero images are generated for the opening frame and nowhere else, and the
asset records `provenance: 'generated'` for every gate downstream.

**Not the publisher's photo.** The connector does surface `sourceImage`, and the
catalogue states those are the publisher's own `og:image`, usable only as
attribution-linked references. A brand posting someone else's food photography
as its own is a rights problem, not a design decision. They stay available for
attributed use; this does not reach for them.

One image per piece, shared by every card — a six-slide carousel costs one
generation, not six. The subject comes from the artifact's own headline, so a
different product gets pictures of what *it* is about. Null when there is no
usable subject: a generic stock-looking prompt is worse than no picture, because
being generic is the thing that reads as generated.

The asset id travels in `input_props`, not the bytes. `render` inlines it at
draw time because Satori cannot fetch a URL — and a megabyte of base64 per slide
would otherwise be written to Postgres six times a carousel and read back on
every retry.

## 269. A scorecard, because ticks are not a verdict

Spec §14.5 asks for a multi-dimensional creative score and states the rule it
has to obey: **no single aggregate score may hide a hard failure.**

Halyard had the gates and no reading of them. The copy gate knows about slop,
retention about openings, audio about pacing, coherence about frames — and an
operator gets a row of green ticks with no sense of whether the piece is good.
The 2026-08-29 review found a video that passed every gate while opening on a
blank frame with raw JSON in its caption.

So `scoreCreative` is a **scorecard, not a score**. Ten dimensions, each with
its own verdict and its own evidence. `passed` is a conjunction, never a
threshold. There is a `rankingScore`, and its doc comment says what it is for —
ordering two pieces that both passed — and that thresholding on it reintroduces
exactly the failure §14.5 forbids.

Deterministic throughout: it calls no model and reads only findings other gates
produced. A model wrote the copy; it does not get to mark its own work.

`unmeasured` is not `pass`, one layer up from gotcha 6. A dimension with no
inputs scores `null` rather than 0 — 0 would mean "measured, bad" — and a caller
declares `requires` for the dimensions its format genuinely demands, where an
unmeasured one fails rather than being skipped. An empty finding list reports
ten unmeasured dimensions, not ten passes, because nothing running is not the
same as nothing being wrong.

Two corrections to my own reading while building this. **The Payoff Verifier is
wired** — `verifyPayoff` runs in `apps/worker/src/hooks.ts` and demotes a hook
whose promise the body does not deliver; I had grepped in a way that excluded
both files named `hooks.ts`. And the **regeneration loop already exists** as the
§165 correction controller, which implements §14.6's shape exactly. Neither
needed building.

`payoffDelivered` is passed as null from `review_media` rather than assumed:
the verdict is reached at draft time and never carried onto the item, so from
there it is genuinely unknown — and unknown must not read as delivered.

## 270. Karaoke captions

Word-by-word highlighting is the dominant short-form caption style, and the
reason is mechanical rather than fashionable: most viewers watch muted, and a
static block of subtitle text gives the eye nothing to track, so a reader runs
ahead of the audio and loses the thread. A moving highlight paces them.

Halyard already had everything needed. `transcribeWords` returns
`{text, startSeconds, endSeconds}` per word and `buildCaptionCues` groups them —
then threw the individual timings away and kept only the joined string. The cue
now carries its words.

The whole cue stays on screen and only the emphasis moves. A caption that
reveals one word at a time is unreadable at speed, which is the common mistake
in this style.

The highlight is **colour only, never weight**. Re-weighting reflows the line on
every word and the caption visibly twitches; the brand accent carries it without
moving anything. Cues built before words were carried fall back to the plain
text, so nothing regresses.

## 271. The last slide asks for something

The deck ended by repeating slide one's headline, so the final thing a reader
saw was the thing they had already read. The ending is where saves and shares
are decided — which is the whole point of a carousel — and roughly 5% of brand
carousels carry an explicit ask.

It **replaces** the result slide rather than following it. The template is
`carousel_6` and Instagram crops slides 2..n to match slide 1, so a seventh card
is a different post shape; the result slide was the weakest of the six anyway.

Not a link. Instagram does not make one tappable from a carousel, and an
unclickable URL rendered into an image is the detail that tells a reader nobody
is paying attention. Saving is the action available on the surface the card is
on.

## 272. The post in the shape it will be seen in

The queue rendered media as a horizontal strip of bare `<img>` tags, so video
was **invisible** — an mp4 in an `<img>` draws nothing — and an operator
approving a TikTok was approving a filename.

`PostPreview` puts the media in the platform's own furniture: TikTok full-bleed
with the caption block and action rail over it, Instagram with a header, swipe
dots and the caption underneath, X as a text post with the media card below.
Video gets a real player, not autoplaying, because an operator opening a queue
card is reading.

The reason this is a check and not a nicety: every platform draws its own UI
*over* the media. The action rail eats the right edge, the caption block eats the
bottom left, Instagram crops slides 2..n to slide one's shape. A frame that looks
balanced in a strip can be half-covered in the feed, and the only way to catch
that before publishing is to look at it in the right shape.

Labelled "approximate — a safe-area check, not an exact preview", because an
operator who trusts it for pixel accuracy will be wrong about something it
cannot answer.

The platform-furniture colours are inline rather than tokens. `designTokens.test`
caught the first version using raw Tailwind palette classes, and it is right to:
those greys and gradients are somebody else's brand being imitated, and putting
them in Halyard's token space would let them be mistaken for Halyard's own.

## 273. The capture system's last hop

Halyard has captured the product since the capture flows were written: three
Playwright flows on a schedule, nine assets in production, each tagged with its
flow and step and captioned in plain words. The card templates take a
`screenshotDataUri`.

**Nothing ever connected them.** `screenshotDataUri` had no caller anywhere, so
every capture ever taken sat unused while the posts described the product in
words. That is the fourth instance this session of a complete feature missing
one hop — after the image client, the layouts and the typography systems.

It matters more than any generated picture, because a screenshot is the only
image in a post that may **evidence** a claim about the software:
`imagery/types.ts` puts `captured` in `EVIDENTIAL_PROVENANCE` and leaves
`generated` out. The hero photograph sets a scene; this shows the thing
happening.

Placed on the mechanism slide rather than the opener. A UI screenshot does not
stop a scroll, so it is wasted on slide one — but by slide three a reader has
asked *how*, and a picture of the answer beats another sentence.

Only unarchived assets are selected. A screenshot of a build that no longer
exists shows an interface the reader will not find, which is a false claim about
the product made in pictures rather than in words. `mark_stale_assets` already
archives those.

## 274. Not every line is the hook

Every caption was 52px at weight 600, on every line of every video. Using the
loudest setting everywhere is itself the tell: real accounts vary emphasis
because not every sentence is the most important one, and a wall of identical
bold text both reads as a template and flattens the one line that genuinely
needs the weight.

Three levels now, driven by what the line is doing — `hook` keeps the old
treatment, `narration` is lighter and smaller and sits under the picture rather
than competing with it, `aside` is quieter still. The typography systems already
carried `body` and `label` at real weights and nothing used them for captions.

## 275. The critic — why nothing caught the captions

Every video Halyard made set its captions at 52px weight 600, on every line, and
no gate flagged it. A person had to notice. That is an architectural hole rather
than a missing rule, and naming it precisely matters:

Halyard had a **describer** (`describeFrames` → `{atSeconds, describes,
visibleText}`) and a **rule set** (banned phrases, contrast ratios, word counts,
loudness). Both worked exactly as designed. But *"every caption is set the same
way, and using the loudest treatment on every line reads as automated"* crosses
no threshold and violates no rule. Every frame is individually fine; the **set**
of them is the problem, and no per-frame rule can see a set.

You cannot write a rule for "this is boring". You can put the judgement on the
other side of the line this codebase already draws — **agents perceive, code
decides**. The critic perceives; `critic.ts` decides what may be done with what
it says.

What it may not do, and why each limit exists:

- **Never passes anything.** A model marking a model's work is the fabrication
  case in a nicer hat. Silence from it means nothing at all.
- **Never fails a piece.** Findings are `warning`. A critic with a veto will
  eventually block a good post over taste, and taste is the operator's call.
- **Never speaks without evidence.** A finding citing no frames, or citing a
  timestamp it was not shown, is discarded whole — the second is hallucination,
  and a critic that invents frames is worse than no critic.
- **Never praises.** The prompt forbids it, because a critic that says nice
  things gets read for the nice things.

`parseCriticReply` fails closed in the one direction that matters: a malformed
reply yields no findings, never an invented one.

**Corrections split on whether the cause is mechanical.** Uniform type and flat
emphasis name a specific lever — the caption treatment (§274) — so they are
correctable. `reads_automated` and `interchangeable_frames` describe a piece that
is *dull rather than broken*, and the fix is a different idea, which no
correction can supply; those escalate. `policyCoverage.test` caught this
immediately, which is the check working: a gate may not raise a rule nothing
knows how to answer.

The value is not any single warning. It is that the same warning arriving on
piece after piece is a systemic signal — which is exactly how the caption problem
would have surfaced weeks before a person noticed it.

## 276. Closing the critic's loop, and two mistakes found doing it

§275 built the critic and left it **unwired** — the module existed and nothing
called it, which is the exact defect this session keeps finding, committed by me.
Closing it turned up two more.

**The critic is a separate client, not a second question to the describer.**
`OpenAiVisionClient`'s instruction says "Do not judge the image. Do not comment
on quality, style, composition or appeal", and that must stay true: the coherence
gate needs a witness, and a describer that editorialises corrupts the evidence
every other gate reads. `OpenAiCriticClient` looks at the same frames with a
different instruction. Two jobs, two prompts.

**All the frames go in one call.** The defects it exists to catch are properties
of the *set* — sameness, flat emphasis, interchangeable layouts. A per-frame
critic finds every frame acceptable and misses all of them, which is precisely
what the per-frame rules already did.

**Mistake one: the emphasis prop had no caller.** §274 added `hook | narration |
aside` to the caption component and nothing set it, so every caption became
uniform again one level down — the same pattern, one commit later. Emphasis is
now *derived* from the plan: cues inside the hook beat are set as the hook,
everything after is narration. Derived rather than passed, because a prop every
caller must remember to set is the wiring that never happens.

**Mistake two: the correction I mapped to could not do the job.**
`critic.uniform_treatment` pointed at `adjust_caption_treatment`, which raises
the caption *backdrop* for contrast (§158) and cannot make one line heavier than
another. It would have spent an iteration changing something unrelated and then
reported the defect as corrected — worse than not correcting, because the
history would show a fix. Both judgement-only rules now escalate, and a test
asserts they stay that way.

The gate has three states, not two: `warning` when it raised something, `passed`
when it looked and found nothing, `skipped` when it never ran. A critic that
could not run has not endorsed anything.

`critic.test.ts` walks a finding the whole way — gate → defect → policy → action
— so a change that quietly disconnects any link fails there rather than in
production, where the symptom is "the critic runs and nothing ever changes".

## 277–280. The format family

An account that only posts "here is a thing, converted" is a catalogue. The
family is the other shapes — quiz, history, tips, full recipe, myth/fact,
comparison, origin — and the point of it is that **six of the eight need no
product artifact at all**, so an account can post on a day when nothing was
converted.

**A format is a structure with slots, not a topic.** That is what makes it
work: slots map onto layouts that already exist, so it renders deterministically;
gates check slots rather than prose, so it is gradeable; and nothing in the
catalogue knows what a recipe is, so it holds for any product attached to
Halyard.

Named `PostFormat`, not `ContentFormat` — that name is taken by
`generation/formatChoice.ts` for the *media* type (text, image, carousel,
video). The two are orthogonal: a quiz is a `PostFormat` and can be rendered as
either.

### Citations are the hard part

A product post's claims check against the artifact. A **history** post's claims
are about the world and there is no artifact to check. That is the real risk
this family introduces: an account whose pitch is "we know what is in your food"
cannot be wrong about a date, and a wrong fact is the most screenshottable
mistake available.

So each format declares `factuality`, and `sourced` formats require a citation
per claim — refused, not downgraded, because a plausible unsourced fact is
indistinguishable from a true one until somebody checks. `looksCitable` is
deliberately shallow: it cannot verify a source *says* what is claimed, only
that something checkable was offered, and it rejects "studies show" and "experts
say", which is the failure that actually happens.

`selectFormat` will not pick a sourced format when the caller says nothing can
cite — a duller post beats a confident invented one.

### The inversion, found by looking at the card

`lead_emphasis` promotes `bodyLines[0]` to 86px and draws the headline small as
a label. The first quiz answer put the answer in the headline and the citation
in the body, so the card read **"Source: Beccari, 1728"** in display type with
the actual answer as a caption above it.

Invisible in the data and obvious on the render. Fixed in three places — the
quiz answer, the history source, the transformation cost — and pinned by a test,
plus a second test that no promoting layout is used with an empty body, since
that makes it an expensive `statement`.

A quiz keeps question and answer on **separate cards**. A reader who can see the
answer under the question has not been asked anything, and the pause is the
entire format.

## 281. The format family's last hop

The catalogue, the selector, the slot checker and the slide builder all existed
and connected to each other, and **nothing called any of them** — the same
pattern this session has now found five times, committed by me twice. This is
the hop.

`selectFormat` runs before anything is written, because the format decides what
the writer is asked for. The choice is persisted to `content_items.post_format`
(migration 0058) for one reason: the selector breaks ties by what the account
used least recently, and **recency it cannot read is recency it cannot honour**.
That is exactly what §265 found for typography — a director choosing well and an
output that could not show it.

The column is deliberately not constrained to a list in Postgres. `jobs_kind_check`
is the standing lesson (gotcha 1): a check constraint listing the same values as
a TypeScript union is one list written twice.

**`transformation` keeps the artifact-driven path** — it *is* the product
demonstration, `carouselProps` already builds it from the artifact's own swaps,
and that path is proven. Every other format is a structure the artifact cannot
fill alone, so it is written to its slots and rendered from them.

A format that cannot be filled **refuses the piece** rather than falling back to
the artifact deck. A quiz that quietly becomes a transformation post is worse
than no post: it is the format system appearing to work while doing nothing. The
same reasoning applies to a catalogue entry with no slide builder, which throws
rather than substituting a plausible default.

A format's slides carry pinned layouts and those win over `chooseLayout`. A quiz
question **must** be the loud card and its answer the quiet one, because the
contrast between them is the format; only an artifact-driven deck leaves the
choice open to recency.

### The gap this leaves, stated plainly

`canCite: false` is passed, so the selector will not choose `quiz`, `history`,
`myth_fact` or `origin` in production — the four sourced formats. Nothing in the
pipeline can supply a *verified* citation yet, and `looksCitable` checks the
shape of one, not its truth. A model can produce "Beccari, 1728" that is correct,
and can equally produce a plausible citation that is wrong.

For an account whose entire pitch is knowing what is true, shipping that risk to
save a research step is the wrong trade. The formats are built, tested and
rendering; enabling them needs a step that fetches and verifies a source, and
that is the next real piece of work rather than a flag to flip.

## 282. Reading the source, not just checking a citation was offered

§279's `looksCitable` asks whether a citation has the *shape* of one. That
catches "studies show" and nothing else. The failure that actually damages an
account is a confident, well-formed, **invented** citation — a plausible URL
that does not exist, or a real URL about something else.

So every cited slot is now fetched and read. Two things get established, and
neither is "true":

1. **The source resolves.** A hallucinated URL 404s.
2. **It mentions the claim.** The claim's distinctive terms — a year, a
   surname, a technical noun — appear in the page.

A citation failing either is rejected and the slot is named, so the rewrite
replaces that fact rather than starting over. `supported` is deliberately a
weaker word than `true`: it means a real page exists and is about this, and the
piece remains a person's judgement to approve.

Distinctive terms rather than whole sentences, because matching sentences fails
on paraphrase and paraphrase is what honest citation looks like. Half the terms
is the threshold — enough to establish subject, low enough not to punish good
writing.

**Tested against the live web, and it corrected me twice.** I first asserted
that Wikipedia's *Gluten* page supports "identified in 1728 by Beccari"; it does
not mention Beccari or 1728 at all, and the verifier was right to refuse it. A
unit test then encoded a paraphrase that dropped the word "gluten" and expected
a pass — also correctly refused, since a page that never names the subject is
not evidence about it. Both times the code was right and the expectation was
wrong.

Against real pages: the Beccari and coeliac-disease articles support their
claims (5/6 and 5/5 terms), a football article does not (1/6), a non-existent
page is unreachable, and a citation with no link is `not_a_url`.

`canCite` is now **true**. The four sourced formats — quiz, history, myth/fact,
origin — are available, because an invented link now costs the writer an attempt
instead of reaching a reader.

`fetchImpl` is injected so tests never touch the network: a test that reaches the
internet fails when somebody else edits a page, and this is the one check that
has to be reliable enough to refuse a piece.

## 283. Naming the shape, beside the idea

The composer took a free-text idea and inferred everything. Right for the common
case, wrong for the one where an operator already knows: "make this a quiz"
typed into a chat box is a hint the system was free to ignore.

`FormatPicker` makes it an instruction. The chosen id travels as `postFormat` on
the request, and `selectFormat` honours an operator's pick over its own choice.

Threaded the whole way, because a picker that sets a field nothing reads is the
defect this session keeps finding:

- **The stream route** puts the format's slots into the co-pilot's system prompt,
  so the shape governs what is written rather than being applied afterwards.
- **The queue route** records `post_format` on the row. A composed piece that
  does not record its shape is invisible to the recency rule, so the next
  automatic run could repeat it — §281's problem at a second entry point.

The catalogue is resolved on the **server** and passed down as plain data. A
client component importing `@halyard/core` reaches `node:crypto` and fails the
build; `clientBoundary.test.ts` exists because that once passed 2,524 tests and
broke only at `next build`.

The picker shows a format's constraints before the run rather than after a
failure: a quiz that cannot cite is refused (§282), and an operator deserves to
know that when choosing rather than when it is rejected.

## 284. Drawing on the screen, in time with the words

The one thing NotebookLM-style video did that Halyard could not: marks that
appear *as they are talked about*. An underline drawing under a phrase as the
voice says it, a circle closing around the thing being discussed.

It reads as "a person made this" for a precise reason — **the mark is evidence
of intent**. A layout can be generated. A mark that lands on the right word at
the right moment cannot be, unless something knew what the words were and when
they were said.

**Not a video model.** It is animated SVG over a still, and Remotion is exactly
the right tool: `strokeDashoffset` interpolated across frames draws a path, and
the frames come from the per-word caption timings §270 already carries. The same
timings that made karaoke captions possible land an underline on the right
syllable — cheap now, impossible before. A generated video cannot do this at
all: it cannot hit a cue, and re-rendering gives a different result.

**Hand-drawn, not geometric.** Every mark carries a deliberate wobble, because a
geometrically perfect underline reads as a UI element and a slightly wrong one
reads as a person with a pen. The imperfection is seeded from the mark's own
text, so a re-render draws it identically — `Math.random()` would mean a
corrected piece visibly differs from the one an operator approved.

**Refuses rather than guesses.** A phrase not present in the cue returns null. A
mark over the wrong words is worse than no mark: it is exactly what makes an
annotation stop reading as intentional.

Two errors found by rendering it and looking, both invisible in the tests that
existed:

- **Units.** `annotationForPhrase` returns fractions of the frame; `pathFor`
  treated them as viewBox units, which drew every mark as a speck in the
  top-left corner. Pinned by a test that boxes stay in 0..1.
- **Position weighting.** Estimating a word's position by *word count* assumes
  every word is the same width, and a circle asked for the last word of "Your
  dusting flour is not gluten-free" landed over "en-free". Weighted by character
  count now; the residual error is smaller than the wobble in the stroke, which
  is where more precision stops being visible.

## 285. Ideas that produced content and were never closed

`generate` marks an idea `used` only after its whole account loop finishes, so a
run that dies partway — §258's rethrow path, a worker killed mid-loop — leaves it
`selected` with drafts already made.

§261's sweep deliberately will not touch those: it only releases claims that
produced *nothing*, because re-proposing an idea that already produced drafts
would draft it a second time. Correct, and it left a second state uncovered.
Four ideas sat in it, each with one to three content items: never re-proposed,
never drafted again, simply gone. With four ideas stranded and nothing
proposing, an account can run out of things to post while its backlog is
technically full.

Closed as `used`, not `proposed`. The idea did its job; only the bookkeeping is
missing.

A test asserted this stuck state as correct — "keeps a claimed idea that did
produce content", expecting `selected`. It was encoding the limbo rather than
the intent. The guarantee that actually matters is *never re-proposed*, and that
is what it asserts now.

## 286. The product the system markets had no signal sources

Generation stopped with "no proposed ideas to draft, and none could be proposed".
The cause was not the idea engine: **`rss_sources` held eight rows and every one
belonged to the `founder` product**, seeded by migration 0013 for an account
about AI. RecipeFix had none — not none enabled, none at all.

So `collect_signals` for recipefix read nothing, `proposeFromSignals` had nothing
to propose from, and the product the entire system exists to market could not
originate a single idea on its own. Every piece it had ever made came from an
idea somebody put there by hand.

Seven feeds seeded, and **every URL was fetched before being written**. 0013's own
comment records the cost of skipping that: its seeded Anthropic feed 404'd from
the day it was written. Four plausible candidates were rejected during the check —
Serious Eats and Beyond Celiac return 403 to a non-browser agent, Food52
rate-limits, and the FDA *food-safety* feed is a dead URL while the *recalls* one
is live.

Weighted by distance from the subject: a coeliac authority publishing a labelling
change outranks a general food blog publishing a recipe, and both are worth
having. FDA recalls are weighted low because the volume is mostly irrelevant —
but an undeclared-gluten recall is the single most useful thing this account could
post on the day it happens.

First run: **7 sources, 0 failures, 100 items fetched, 19 stored, 5 promoted.**

## 287. Three identical failures, and why feedback could not win

A YouTube piece failed its voiceover three times and was abandoned. All three
failures were **the same two rules**: `spoken.unspoken_symbol` on "1/4" and a
22-word sentence.

The retry loop was working exactly as designed. `buildFeedback` named the rule,
quoted the excerpt and supplied the fix, and it changed nothing, three times.
The reason is in the prompt: the VO request opens with *"Post copy this
narrates:"* followed by the body — and that body says "1/4 cup wheat flour". The
model was anchored on the text it had just been told to read, so every rewrite
faithfully reproduced the fraction the feedback had asked it to remove.
**Feedback cannot win an argument against the prompt's own source material.**

The rule this establishes: **a violation with one correct mechanical answer
should never reach a model.** "1/4" becomes "a quarter". There is no judgement in
that — no style, nothing a writer could improve — and spending an attempt on it
is worse than pointless, because attempts are finite and two of this piece's
three were spent on the same fraction.

So the loop is now: repair what is mechanical, re-check, and ask the model only
about what is genuinely left. A second failure then means something *different*
from the first, which is the property the loop needed and did not have.

The body is repaired **before** it enters the prompt as well, so the anchor is
gone rather than merely corrected afterwards.

**Sentence length is deliberately not repaired.** Splitting a sentence changes
emphasis and rhythm, which is writing; a machine breaking at the nearest comma
produces something worse than the model would. It still goes back — but now it
goes back alone, with a whole attempt available for it.

`MECHANICALLY_REPAIRABLE` is an explicit set rather than a guess, so a new
spoken rule is not silently assumed fixable.

### And a migration that broke every database test

0059 seeded `recipefix` rss_sources unconditionally. A fresh database built from
migrations alone has no such product — the test harness creates its own — so the
foreign key failed and took **40 test files** down with it. Seeded conditionally
now: `where exists (select 1 from products …)`, which is also what makes it
idempotent against production, where it re-runs as `INSERT 0 0`.

## 288. Two buttons and a make

The composer is a chat box. That is the right tool when the *idea* is the
uncertain part and the wrong one when it is not: "a quiz, for TikTok" is two
choices and a click, and typing it is a worse interface for the same request.

`/make` is platform buttons, format buttons, and one action. It enqueues the
same `generate` job the scheduler runs — **not a second pipeline**. The shape
reaches `selectFormat` through `postFormat`, which honours an operator's pick
over its own choice, and the writer, citation check, critic and correction loop
are all unchanged. A button that took a different path would be a button that
tests something nobody ships.

Formats **grey out** rather than disappear when the platform cannot carry them,
with the reason on hover. Hiding them leaves an operator wondering where the quiz
went; a disabled button answers the question before it is asked. Picking a
platform also clears an incompatible shape rather than leaving it selected and
silently ignored at submit.

Platforms show their account state on the button — `reconnect` for TikTok's
expired token, `pending auth`, `not set up` — because the most common reason a
piece never appears is an account nobody remembered was dead.

Two payload fields were wired at the same time, because a field nothing reads is
worse than no field — it looks like it worked:

- **`onlyPlatform`** narrows the run to one account. Without it, a button saying
  "make it" drafts for every connected account: five pieces, four unasked for.
- **`subject`** overrides the artifact's own headline in the format brief.

## 289. The quiz as a video — question, countdown, reveal

A quiz rendered as a carousel is a list of questions with the answers on the next
card. That works and it is not what makes the format land. What makes it land is
**the pause**: a question, a beat where the viewer commits to an answer, then the
reveal. A carousel cannot enforce a pause because the reader controls the swipe.
A video can, because it controls time. The format's mechanism is temporal, so the
render has to be — that is the whole argument for a composition rather than reuse.

Three seconds of countdown. Short enough to keep pace, long enough to think, and
a visible commitment device: a viewer who has silently answered is invested in
seeing whether they were right, which is the open loop that carries them into the
next question.

A **ring** rather than a bare numeral, because a draining arc is readable in
peripheral vision — a viewer reading the question does not have to look away to
know how long is left, which is the only reason to show a timer at all.

The countdown occupies the space the answer will fill, so the reveal replaces it
in place. A layout that jumps at the moment of payoff undercuts the payoff. The
answer arrives on a spring rather than a fade: a fade reads as a transition, a
spring reads as an arrival, and a reveal is an arrival.

The source line sits under the answer, small. §282 fetched and verified it, and a
citation nobody can see is a citation that did no work.

**The bug the first render had**, found by extracting frames and looking:
`Countdown` called `useCurrentFrame()`, which inside a `Sequence` counts from the
*sequence*, not from the component. So it burned 3-2-1 while the question was
still being read, then held an **empty ring** through the actual pause — a dead
beat at exactly the moment the format is tightest. It takes its start offset
explicitly now, and the numeral clamps to 1 rather than blanking, because a blank
numeral inside a visible ring reads as broken rather than as "time is up".

## 290. Naming why a format refused, and failing only the piece

The first production quiz failed three times and the log said
`format not filled, asking again — missing=[]`. An empty missing list with a
failure means every slot *was* filled and something else refused it — an uncited
claim, a citation that would not verify, a line over its ceiling — and none of
that reached the log. §262 taught this exact lesson for the copy gate and it
arrived one module late here.

The log now names the failing rules and the first reason, and
`FormatRejectedError` carries them into its message, so the reason survives on
the row rather than only in a line somebody has to go and find.

**And the error was failing the wrong thing.** `FormatRejectedError` reached the
generic rethrow, which fails the whole `generate` job and retries it — so one
unfillable quiz took down the drafts for every other account in the run, and the
retry asked for the same impossible thing again. It is a fact about *one piece*:
the shape asked for something the writer could not produce with a source it could
verify. The item is disowned with the reason and the account loop continues, which
is exactly how `DraftRejectedError` and `NoUsableFormatError` already behave.

## 292. The capture selector broke again, and the fallbacks shared its assumption

Twenty-seven capture jobs dead-lettered and the last successful capture was a day
old, which is the real reason no post has ever shown the actual product: the
assets do not exist.

The submit button now reads **"Make it gluten-free →"**, and it is *dynamic* —
"Make it dairy-free →", "Make it vegan →". Every selector in the chain assumed
the word "adapt", including all four fallbacks §253 added after the *last* break.
Widening a chain does nothing when every branch shares the same wrong assumption.

The lesson §159 recorded is not "add fallbacks". It is **never anchor on words a
designer is free to change.** The primary is a pattern on the stable half of the
sentence; the last resort is the trailing arrow, this product's convention for a
primary action.

Two things were caught by running the chain against the live page rather than
reasoning about it:

- A fallback of `/(gluten|dairy|vegan)/i` matched **five** elements, because the
  diet chips are named for diets too. A fallback that clicks the first of five is
  worse than one that fails — it would have silently selected "Gluten-Free" and
  recorded a capture of the wrong action.
- §253's structural fallback, `form button[type="submit"]`, matches **nothing**:
  the page has no `<form>` at all. The "always works" option had never worked.

Every branch now resolves to the correct button, verified against production.

## 294. Every video was a beige card, and the fault was in the shared shell

The quiz looked like a PDF. So did everything else, and that is the point: the
flat cream ground was in `Stage`, which **every** composition sits inside, so
fixing it in the quiz would have fixed one video and left the rest.

A feed is a wall of photographs and video. A flat card loses to all of it before
a word is read — not because the typography is bad but because there is nothing
to look at. The image path got generated photography in §268 and the video path
was simply never given one, which is why carousels had pictures and videos did
not.

Now: a piece with a photograph puts it **full bleed** with a gradient scrim, and
the type sits on the scrim in white. Without one, the ground gets a soft vignette
in the brand's own colours rather than staying perfectly flat.

The scrim is heavy at the bottom where the type lives and light at the top so the
picture is still a picture — a flat 60% overlay kills the photograph and leaves a
grey card, which is the failure being fixed. It is not tunable per composition:
the photograph is generated per piece and nobody has checked its contrast, so
legibility cannot be left to whatever came back from the model.

Type scaled with it — the question from 76px to 104px, the title to 124px. On a
1080×1920 frame the old sizes filled about a sixth of the canvas, which is
unreadable at arm's length and is what made it read as a document.

## 295. Channels — the brief, above the platform

Halyard has had platforms since the beginning and a platform is the wrong unit
for almost every creative decision. TikTok, Reels and Shorts are **one brief**: a
vertical video that has to win in half a second. X and Threads are another: text
that lives or dies on its first line. Treating them as six destinations means
writing the same rule six times and getting it slightly different each time.

Four channels — `short_video`, `text_post`, `carousel`, `long_video`. Each carries
the things that are true of the brief rather than of the surface: the decision
window and what the opening must do, whether it is spoken, whether motion is the
medium, and what the viewer is being asked to do. A Reel asks for a save, a text
post asks for a reply, a long video asks for the next video, and those differ
more than the formats do.

Instagram and YouTube each sit in **two** channels, because a Reel and a carousel
are different briefs on one account, and a Short is not a long-form explainer.
The media format decides; an unknown one defaults to the option that cannot
silently produce a video nobody asked for.

**Pinterest and Facebook return null**, deliberately. `selectFormat` reports that
as a gap rather than inventing a shape, because a silent default makes an
unserved platform look served.

### Folded in, not bolted on

The first version gave `Channel` a `formats` list beside `PostFormat.platforms`,
which is the same relationship written twice — `JOB_KINDS` and `jobs_kind_check`
exactly. Now a format declares its **channels** and everything else is derived:
`formatsForChannel` filters the catalogue, `platformsForFormat` unions the
channels' platforms, and the hand-written `platforms` array is gone. Four tests
assert the two catalogues agree in both directions and that neither can name
something the other does not have.

## 296. The media director — the missing row in the decision table

`CREATIVE_SYSTEM.md` lists the decisions that make a piece: treatment, visual
language, typography, opening, motion, voice, audio, variants. Every one is
deterministic and every one explains itself. **Where the image comes from is not
on that list**, and it is the decision a viewer notices first — a screen
recording of the product, a photograph of the thing being discussed, and a
typographic card are three different videos.

The slots were already there. `PlannedBeat.media` takes real footage and §163 is
explicit that there is no default and no placeholder. `PlannedBeat.image` carries
provenance and licence *per beat*, because what a picture may **say** depends on
where it came from. `EVIDENTIAL_ROLES` and `canEvidence()` already say which
provenance may back which role. What was missing was the chooser.

Five sources, ranked per beat role rather than globally, because the best source
genuinely differs by what the beat is doing: a `demo` wants the product moving, a
`hook` wants whatever stops a scroll and proves nothing, a `proof` wants the
strongest evidence and nothing else.

**The rule that outranks preference, and outranks the operator:** a beat whose
job is to show the product doing something may only carry evidence. A generated
photograph in a `proof` beat is a claim about software nobody observed. An
operator asking for one gets type instead — not because their preference is
overridden, but because no choice makes an unobserved claim true. A beat that
cannot be evidenced falls back to type rather than to a picture that lies.

Type is the floor, never a failure: there is always an answer.

## 297. Two more channels — story, and the one nobody builds

**`story`** is not a short video with a shorter shelf life. Nobody saves a story,
so a save-oriented close is wasted on it; production value reads as *wrong*
rather than good, because the form's whole signal is immediacy; and it is the
only channel where asking a question outright is native rather than needy. Two
formats of its own — `poll`, whose value is the response rather than the content,
and `behind`, which exists to carry something unpolished on purpose.

**`reply`** is the highest-leverage surface nobody builds because it does not look
like content. Replies carry more algorithmic weight than likes, and Halyard
already had the parts — a comment system, a Reply Writer in the registry, an
Engagement team in the spec. What it lacked was a *channel*, so replies were
never planned, never scheduled, and never counted as output.

A reply **originates nothing**: it responds to what somebody else said, so it has
no format to fill. That is declared as `originates: false` rather than inferred
from an empty format list, because "no formats" otherwise reads identically to
"somebody forgot to add formats" — and the drift test cannot tell those apart.

## 298. The walkthrough — spec §12's one unbuilt media type

An audit of the spec against the code found three gaps. One was already there and
my grep was wrong (`draftReply` lives in the web inbox, not core). One is
`hook_experiments` — a table with zero rows and no code, still unwired. The third
was real: **"animated UI demonstrations"**, the only media type in §12 with
nothing behind it.

Halyard could record the product (§292) and put a screenshot on a card (§273),
and had no way to show somebody *using* it. That gap matters more than it sounds:
a screenshot says "this screen exists"; a recording inside a device, with the
thing being explained pointed at as it happens, says "this is what using it is
like" — which is the only claim a product demonstration is really making.

**The phone is drawn, not photographed.** A photographed hand holding a device
dates instantly, ties the piece to one model, and cannot be re-rendered when the
app changes. A drawn frame is a few rounded rectangles, re-renders free, and never
becomes last year's hardware. The screen inside is the only part that has to be
real, and it is, because it is a capture.

**What is real and what is decoration.** The recording is `captured` provenance
and may evidence a claim. The drifting ground, the frame and the rings are
decoration and may not. This composition only ever points at pixels the capture
actually contains — it never draws a control, which is §296's line held one level
down.

**Callouts are derived, not written.** `calloutsFromSteps` takes the capture's own
step labels and timings, so a callout cannot point at a moment the recording does
not contain. A hand-written one points at a moment somebody imagined. The first
render made the case for this by accident: hardcoded demo callouts said "Paste any
recipe link" while pointing at the Cook button of a finished recipe, which looks
deliberate and is therefore worse than no callout at all.

The ground is blurred hard and dimmed. A sharp photograph behind a phone competes
with the screen, which is the one thing the viewer is meant to be reading.

## 299. RecipeFix has a sign-in form, and it is not where a sign-in form goes

The walkthrough recorded the demo card because a real adaptation needs an
account. Adding a sign-in flow turned up two things worth writing down, both
found by driving the live app rather than reasoning about it:

**`/signin`, `/login` and `/sign-in` all return 200 with zero inputs.** They
render the marketing shell. The form is on `/account`, and only after a click.
A flow that went to a sign-in path would have timed out waiting for a field that
was never there — and it would have looked like a broken selector rather than a
wrong page.

**The page carries four "Sign In" buttons.** The header, the card, the modal
trigger and the form's own submit. Clicking the first re-opens the form instead
of submitting it, so the submit selector takes the *last* match. This is §292's
lesson again: the first thing that matches is not the thing you meant.

Credentials live in `products.capture_credentials` because a *user* supplies this
when they connect their app, and an env var is not something a user can set.
`fillSecret` is a separate action from `fill` so a credential can never be
written into a flow definition — the step names which secret it wants and the
runner is the only thing that sees the value.

## 300. A good question, asked the wrong way

The first production quiz asked **"What year was gluten first identified?"** as a
free-form question. It is a good question and a bad free-form one: almost nobody
produces "1728" from memory, so the honest reaction is "no idea" — and a viewer
who cannot play does not stay for the answer.

The same fact as multiple choice is a *good* question, because 1728 against 1928
and 1608 is a real decision. Nothing about the fact changed; the asking changed.

So how to ask is a decision, and it follows from one property of the answer:
**can an ordinary person produce it, or only recognise it?** A year, a name or a
number is recognisable and not producible — multiple choice. A belief people
already hold is true-or-false, because "True or False" is a game people
recognise while "A or B" reads as a multiple choice that ran out of ideas. A
technique somebody uses every week is producible, so it can be asked open.

**Three options, never four.** A fourth is nearly always obviously wrong, and an
obviously wrong option makes a question feel easier rather than harder.

**Difficulty is a curve.** Easy first, hard last, never getting easier. A quiz
that opens hard loses the people who would have stayed, and one that ends easy
gives nobody a reason to say how they did — which is what a comment is.

`checkQuestion` verifies what makes a quiz *playable* rather than true (§282
handles truth): that the revealed answer is actually among its own options, that
no two options are identical, that a true-or-false has True and False. An answer
missing from its own options is the mistake a model makes and the one a viewer
screenshots.

## 301. A fixed scrim cannot be right for a photograph nobody has looked at

**Chosen:** measure the background's brightness in the band where the type sits,
and scale the scrim to it. `apps/worker/src/video.ts` → `measureLowerLuminance`;
`compositions.tsx` derives the gradient from `backgroundLuminance`.

Since §294 every video has sat on a generated photograph under a gradient that
was the same three stops every time. That gradient was tuned against one image.
A dark kitchen gets more scrim than it needs and turns into a grey card — which
is the exact failure full-bleed was introduced to fix — and a bright flatlay
gets less than it needs and the headline sits on toast.

Measured over the **lower 45% only**. A whole-image mean is the wrong number: a
photograph with a bright sky over a dark counter averages to "medium" and says
nothing about the strip a headline actually crosses.

**Unmeasured stays unmeasured.** A failed probe returns `null` and the
composition keeps its fixed scrim rather than substituting 0.5. Gotcha 9's line,
applied to a number nobody would think of as evidence: an unmeasured background
is not a mid-grey one.

**Rejected:** deciding it in the model that writes the piece. The describer is
already forbidden to judge its own output (§275), and "how dark is this photo"
is a measurement, not a perception — *agents perceive, code decides*.

**Also fixed here:** the quiz title card was `brand.ink` unconditionally, which
put dark type on the dark end of a scrim for the first two seconds of every
quiz. Same class of bug, and it had been shipping since §294.

## 302. One quiz template is one quiz template too few

**Chosen:** five treatments — `stack`, `rail`, `grid`, `spotlight`, `versus` —
chosen per question by `chooseQuizTemplate`, fit before recency. See
`packages/render/src/video/quizTemplates.tsx`.

§300 fixed how a question is *asked*. This is how it is *drawn*, and drawing it
was worse than it looked: `QuizQuestion` has carried `options` and
`correctIndex` since §294, `planQuestion` returns `optionCount: 3`, and the
composition **never rendered a single option**. Every multiple-choice question
ever made reached the viewer as free-form. The same missing-last-hop shape as
the image client, the typography path and the captures.

One template per question kind would not have been enough either. A feed does
not experience "this is a true/false and that is a multiple choice" — it
experiences *these all look the same*, and an account posting three times a week
asks a viewer to see the same composition 150 times a year.

**Fit before variety, and it is not a close call.** A template is picked only
from those that can draw the question's option count; `versus` renders two
panels and given three options would drop one, which could be the right answer.
Variety only breaks ties. `chooseLayout`'s order (§293), for the same reason.

**Rejected:** random selection. It reruns the same treatment twice in a row
often enough to notice, and cannot tell an operator why.

**The palette is measured, not configured.** `quizPalette` resolves type and
surface colours once from the brand: white over a photograph, and on the brand
ground whichever of ink and white actually contrasts with it, by the same
`contrastRatio` the captions have used since §211. A dark-ground product gets
legible type with nothing configured — which is the product-agnostic claim made
concrete rather than asserted. The accent is lifted toward white until it clears
4.5:1, because RecipeFix's rust measured ~3:1 against the scrim and it is used
only in small type, where a marginal ratio is where it actually fails.

**Found by rendering, not by testing.** The first version was written in white
and was invisible on RecipeFix's cream ground; the second stranded the question
in the middle 40% of a 9:16 frame; the third split it into three islands; the
rail's rule ran the full height of the frame because a stray `height: '100%'`
survived a replacement. All four typechecked and passed their tests.

## 303. Three hops missing between a capture and a callout

**Chosen:** the runner records where each tap landed, `requires` actually runs,
and step offsets are measured from the recording rather than from each flow.

`WalkthroughCallout.at` has existed since §298 and **every callout ever built
passed `null`**, which pins the text beside the device and never draws the ring.
Three separate things had to be true for a ring to appear and none of them were.

**1. Nothing recorded where a tap landed.** `runFlow` now measures the clicked
element's box — after `scrollIntoViewIfNeeded`, because the box moves, and
before `click`, because a click can navigate and leave nothing to measure. The
recording is made at the viewport size, so a fraction of the viewport is a
fraction of the frame and there is no mapping to get wrong.

**2. Nothing turned a capture into callouts.** `calloutSourceFromCapture` maps
steps into **cut time**. This is the part that would have shipped broken: the
recording spans the whole session and `cutFootage` removes the elided stretches,
so a step beginning at 34s in the raw file may begin at 11s in the footage. A
callout at the raw offset points at the right place at the wrong moment, which
reads as a rendering glitch rather than a bug. A step in no kept span produces
no callout — it is not on screen, and pointing at what a viewer cannot see is
§296's fabrication rule in visual form.

**3. `requires` was declared and never read.** §299 built the sign-in flow and
declared `adapt_and_reveal` needs it, and the runner had no code for it — so
every capture since has run **signed out and recorded the demo card**, which is
what the operator spotted in the walkthrough. It runs first now, in the same
context because a session lives in cookies. A failed sign-in refuses the capture
rather than recording the signed-out product and filing it as evidence of the
signed-in one (gotcha 9).

**Found on the way:** `runFlowChain` hands every result the same whole-chain
video while each flow's offsets were relative to its own start, so
`cook_mode_timer`'s cut has been taking a stretch of footage offset by however
long `adapt_and_reveal` ran first. Nobody noticed because the wrong stretch of a
real recording still looks like a real recording. Offsets now anchor to the
context, which is what the field's own comment always claimed.

**Rejected:** storing callouts on the footage asset. `capture_runs.steps` is
already the record of what happened; a copy on the asset would be a second
source that could disagree with the first, which is gotcha 1 in a new place.

## 304. The format family reached carousels and stopped

**Chosen:** `videoForFormat` — the video twin of §280's `slidesForFormat` — plus
`templates` rows for `Quiz` and `Walkthrough`, plus a test that fails when a
composition has neither.

Three things were true at once and each hid the next.

**The video path never consulted the format.** §281 gave the *carousel* path a
format-driven deck and the video path went straight to
`chooseVideoComposition(artifact, …)`, which picks from three compositions all
derived from a product artifact. Every Remotion render in production is a
`TransformationDiff`.

**`quiz` declares `channels: ['short_video']` and nothing else.** So it could
never be reached by the carousel path either. The catalogue entry, the writer,
the question planner (§300) and the five treatments (§302) have **never produced
a single piece**. Everything connected to the next thing and the chain was not
attached to anything.

**`Quiz` and `Walkthrough` had no `templates` row.** Registered in `root.tsx`
since §289 and §298, renderable from a script, and invisible to every selector —
all of which filter by the account's enabled templates. Even after the video path
started consulting formats, nothing could have asked for them.

That last one is **gotcha 1 in a second place**: `root.tsx`'s compositions and
the `templates` table are the same list written twice, and adding to one
typechecks cleanly. `videoTemplateCoverage.test.ts` is what catches the next one.
It reads `seed.sql` *and* the migrations, because a fresh database is built by
one and a live one is patched by the other, and a row in only one of them is
still a gap.

**A format that cannot fill its video refuses the piece.** Null is not a
fallback. Substituting the artifact path is how a quiz quietly becomes a
transformation post — the format system appearing to work while doing nothing,
which is the exact failure this family was built to make impossible. Options
whose answer is not among them are dropped rather than shown, because two right
answers on screen is worse than none.

**Also fixed:** the sign-in submit was selected by position (`nth=-1`) and the
recorded tap landed at y=0.94 — a footer link, not the form's button. Scoped to
`form:has(input[type="password"]) button[type="submit"]`, which resolves to
exactly one control at y=0.893 on the live page. Position is a guess about
layout; the form holding the password is a structural fact. The capture refused
rather than recording a signed-out product, which is §303 working.

## 305. `fillSecret` had no implementation

**Chosen:** implement it, pass `products.capture_credentials` to the runner, and
add `actionCoverage.test.ts` so an unhandled action fails a test instead of
doing nothing.

§299 added `fillSecret` to the flow action union so a credential could never be
written into a flow definition, a log line or a job payload. Both of the
sign-in's credential steps use it. **`executeStep` had no case for it.** The
switch fell through to `return {}`, both fields stayed empty, the form was
submitted blank, and the run failed 30 seconds later on `waitForHidden` — a very
long way from the actual mistake.

The tell was `ms: 0` on both fill steps, which is only visible because §303
started recording per-step timings into `capture_runs`. Two earlier attempts at
this bug went after the submit selector, because the tap position was the
obvious suspect and the fill was invisible.

**TypeScript cannot catch this.** The switch has no throwing `default` and the
function returns after it, so an unhandled action is exhaustive as far as the
compiler is concerned — it simply does nothing and reports success. That is
gotcha 1's shape exactly: two lists in two files with nothing tying them
together. The test reads both and fails on the difference; it was verified by
removing the case and watching it fail before being trusted.

**The value never appears in an error.** A step naming a secret nobody supplied
reports *which key* was missing, because the key is not the secret. And it
throws rather than filling an empty string — a login form submitted blank
reports success at the fill and fails somewhere unrelated, which is how this
took three attempts to find.

**Also corrected here:** two previous decisions blamed the submit selector. The
recorded tap at y=0.9399 was the *post-scroll* position of the correct button —
`fallbackDepth: 0` said the preferred selector resolved, and that was true both
before and after the change. The selector was never the fault. The form-scoped
selector is kept because it is structurally sound rather than positional, but it
fixed nothing on its own.

## 306. A quiz that ends mid-question, and a narrator talking over the countdown

**Chosen:** compositions derive their own length from their props; the read is
assembled from the same slots as the picture and placed line by line.

**"Question 3 of 4" on the final frame.** `Quiz` was registered with
`durationInFrames={quizDurationSeconds(3)}` and a comment saying the worker
overrides it per render. The worker passes `durationInFrames` **only when there
is a voiceover**, so every silent quiz ran for exactly three questions' worth of
frames and a four-question quiz ended in the middle of question three. Remotion's
`calculateMetadata` makes the composition describe its own length, so no caller
has to remember. `Walkthrough` had the same bug in the other direction — a flat
twenty seconds, holding a frozen frame against a twelve-second capture.

**The narration could not simply be the caption.** Every other video sends its
caption to `writeVoScript`. For a quiz that would have the narrator talking about
something other than what is on screen, because the caption is written for a feed
and the video is a quiz — worse than silence.

So the read is assembled from **the same slots the video is built from**. The
words are already written and already gated (§282); turning them into a read is
mechanical, which is where this system does the work itself rather than asking a
model. It also makes a class of mistake impossible: the voice cannot say 1928
while the screen fills 1728.

**Placed, not read straight through.** The screen holds a three-second countdown
and a continuous read answers during it — which removes the only thing the viewer
was doing. The pause *is* the format, so a continuous read is not a lesser
version of this, it is the format broken. Each line is synthesised on its own and
placed with `adelay`, the same way §242 places sound effects. The character count
is unchanged, so this costs what one call would have: more requests, not more
money.

**Overruns are reported, never shifted.** A line that runs into the next one is a
script that needs a shorter sentence. Moving it later would put the words out of
step with the picture they were written for, which is the problem this exists to
solve.

**The fact and the citation are different fields.** §304 put the answer's "one
clause of why it is interesting" into `source`, so a genuinely good line rendered
as "Source: Beccari separated it from wheat flour" — not a citation, and reads as
a mistake. `aside` now lands a beat after the answer, on screen and in the read:
the answer is the payoff and the aside is the reason anyone repeats it, which is
what gets a quiz shared.

## 307. `fillSecret` fixed the sign-in, and the capture is real

**Confirmed in production, not merely deployed.** `sign_in` — all 6 steps in
3.1s, the credential fills taking 13ms and 11ms where they had recorded `ms: 0`
since §299. `adapt_and_reveal` — all 13 steps in 11.2s, **signed in**, with five
tap positions recorded. That is the first capture of a real adaptation on a real
account rather than the demo card.

Still open: `cook_mode_timer`'s "Start Cooking" control no longer resolves. §163's
per-flow gate means that no longer blocks recording the root, which is the
behaviour it was written for and this is the first time it has mattered.

## 308. The other four short-video formats had no composition

**Chosen:** one `Narrative` composition with beat *roles*, and a mapping per
format — not four bespoke compositions.

`quiz` got one in §289. `history`, `tips`, `myth_fact` and `origin` all declare
`short_video` and had none, so they rendered as cards. That is what "the videos
look like slideshows" meant, and it was true.

Four compositions would be four places for the same timing bug and would do
nothing for the fifth format somebody adds. A narrative format is a **sequence
of beats**, and the formats differ in what their beats *mean* rather than in how
a beat is drawn: a history is hook → setup → turn → why; an origin is
hook → before → change → now. Both are "say a thing, hold it, say the next", and
in each the turn has to land hardest. So the composition takes roles and the
format decides which slot becomes which role — `slidesForFormat`'s pattern.

**Variety is structural.** Each beat picks a treatment by fit then recency, so a
five-beat piece cycles through five compositions rather than showing the same
card five times with different words in it. `FITS` is a fit rule and not a
preference: a close set at hook weight reads as the piece starting again.

**Beat length is derived from the read.** A fixed beat makes a four-word hook
drag and cuts a twenty-word setup off mid-sentence — and the narration is placed
on this same clock (§306), so a wrong estimate here puts the voice out of step
with the picture rather than merely producing an odd rhythm.

**The label is a safety property, not decoration.** `myth_fact` sets "Myth"
above the claim on the beat that states it. A myth stated without being labelled
as one is a myth post spreading the myth.

**Corrected here:** §302's `legibleAccent` lifted a failing accent toward white
*unconditionally*. That is right over a dark scrim and exactly backwards on a
light ground — RecipeFix's rust on cream resolved to near-white, so the eyebrow
and the rail's rule rendered invisible on the brand ground. It shipped because
it was only ever looked at over a photograph. It now moves toward `fg`, which
`quizPalette` has already measured as legible against that ground, and the test
asserts it on both kinds of brand **and** both grounds — the version that only
checked the scrim is what let this through.

## 309. The recorded pass was always a cache hit

**Chosen:** `FlowStep.captureValue` — a different input for the pass that is
kept.

A capture runs the flow twice: verify, then record. Both used the same recipe
URL, and RecipeFix caches an adaptation. So the recorded pass was always reading
back what the verify pass had just produced, in a shape the flow's selectors were
not written against — `adapt_and_reveal` verified in 8.6s and the recording
failed on `wait for the adaptation` **thirty seconds later, on identical steps**.

That signature is worth naming: *verify passes and record fails on the same
selector* means the two passes are not seeing the same thing, and the difference
is almost always state the first pass created.

Different URLs make the recorded pass a cold adaptation, which is what the
selectors were written against and also the more honest footage — the product
doing the work, not reading back something it did thirty seconds ago. Both URLs
were checked for a 200 before being written down.

**`captureValue` may never appear on a `fillSecret` step**, and there is a test
for it: it is a plain string in a flow definition, which is exactly what §299
built `fillSecret` to prevent a credential from being.

## 311. The music library was six test tones

Every bed carried `[TEST] … synthesised test fixture, not licensed music`. §221's
selector, the ducking and the mix all worked — against fixtures. So "music is
wired" was true of the code and false of the account: any video that shipped
with a bed would have shipped with a test tone.

**Openverse, CC0 only.** No API key, a real commercial-use filter, and it indexes
Freesound and Jamendo rather than hosting, so the licence on a result is the one
the uploader granted. CC-BY is free and legal and requires attribution *on every
use* — which for social video means a credit line in a caption written by a
copywriter that does not know it is there, on a platform that truncates
captions. A licence obligation that depends on a caption surviving will be
breached. CC0 is public domain: nothing to carry, nothing to truncate.

Seven real beds imported, one per mood. The manifest goes through the existing
`import-music.ts`, so the duration probe, the loudness measurement and the
licence validation are unchanged.

**Found by importing for the first time:** `moodFor` returns `driving` for a
kinetic piece and `confident` for an editorial cut, and `IMPORTABLE_MOODS`
excluded both — so no bed of either mood could exist, and every such piece
scored a mood mismatch against the whole library. Two settings on the music
director that nothing could satisfy. `moodCoverage.test.ts` now asserts both
directions: every mood the director can want is importable, and nothing
importable is unreachable.

**Queries were tuned against the live index**, not written from intuition:
"warm acoustic instrumental loop" returned nothing over 30 seconds and
"acoustic guitar instrumental" returns a usable set. A search term nobody has
run is a guess, and a mood that silently finds nothing gets filled by the
selector with a bed that does not suit the piece.

## 312. The narrator was still talking over the next card

§306 placed each line at the second its visual appears. Rendering it with real
synthesis and measuring the clips showed the placement was right and the
**sizing** was wrong: question one's aside was still being spoken 1.9 seconds
into question two.

**A beat must be as long as what is said over it.** `QUIZ_REVEAL_SECONDS` was a
flat 2.6s, correct when a reveal was one word and wrong once §306 added the fact
that makes an answer worth repeating. Each reveal is now sized from its own
content, the title card from its own line, and the composition from the sum —
not a count times an average, which ends mid-sentence on the long ones.

**The floor is the part that mattered.** Words-per-second said "1728" takes
0.4s; ElevenLabs says "seventeen twenty-eight" in **1.49s**. Any short line — a
year, a name, "True" — is slower per word than a sentence. `spokenSeconds` is
one model with a measured floor, shared by everything that sizes a beat, so the
picture and the read cannot disagree about how long a sentence is.

Measured against real synthesis rather than assumed, which is the only way this
was ever going to be found: it is inaudible in a waveform and invisible in a
frame.

## 313. The picture had nothing to do with the video

The hero photograph was generated from the **artifact's** headline, before the
format had written a word. So a quiz about the history of gluten was illustrated
with whatever recipe was adapted that morning. A picture unrelated to its video
is worse than none: it reads as stock, and stock is what makes an account look
automated.

`subjectFromFormat` takes the piece's own opening slot — a quiz's `title`, a
history's `hook`, a myth's `myth`. It is a line written *for this piece*, which
is what a picture of it should come from. `transformation` keeps the artifact,
because it genuinely is about the adapted recipe.

**And a bug of my own:** §304 added a `writeToFormat` call in the video path
while §281's was still in the carousel path — two model calls producing two
different drafts for one piece, and on an Instagram account both branches can
run. The draft is written once now, above both, which is also what makes the
picture possible: the content has to exist before anything can be a picture of
it.

## 317. A person was the only thing checking the videos

Every defect found on 2026-08-29 was found by rendering a file and looking at
it, or playing it and hearing nothing. None tripped a gate, and none could
have: `runVisualQC` asks about **frames** — aspect ratio, resolution, safe area,
contrast — and all three defects were properties of the **piece**.

`runMediaIntegrity` checks the three, and every case in its test is a real one
with its measured numbers:

- the quiz that ended on "Question 3 of 4" — 23.4s of file for 30.6s of content;
- four rendered files carrying a **-91 dB** audio track;
- the aside still being spoken 1.9s into the next question.

All arithmetic. None needs a model.

**A silent stream is treated as worse than no stream.** Every player shows an
audio track for it and plays nothing, so the failure looks like the viewer's
problem rather than ours — which is exactly how it went unnoticed until an
operator said they could not hear anything.

**The critic gets the questions no arithmetic can answer**: whether the
photograph has anything to do with the words, and whether it is generic enough
to have illustrated any post on the account. §313's bug produced a frame that
was well-composed, legible, correctly sized and about the wrong thing — every
deterministic check passes that frame. Prompt version bumped to v2 rather than
edited, so v1 findings are not compared against a reviewer that was never asked.

**A gate needs a correction policy or it is a dead end.** `policyCoverage`
caught seven new rules with no entries — after I had already committed and
deployed, which was the second time that day I shipped on a red suite.

## 318. From "I want a walkthrough" to a walkthrough

§298 built the composition — a drawn phone, a real recording inside, rings on
the taps. Nothing could ask for one. There was no format, so no operator button,
no planner entry, and no path from wanting one to having one.

`walkthrough` is a format with `needsCapture`, which is a different thing from
`needsArtifact`: an artifact is a *result* the product produced and can be
written from; a capture is **a recording of somebody using the software**, and
no amount of writing substitutes for it. Choosing it on the Make page reveals a
flow picker — buttons, so an operator cannot ask for a flow that does not exist
— and queues the capture ahead of the generate.

**The flow is required, never defaulted.** "Record something" is not a request
anybody can fill, and a default would quietly make a video of the wrong screen.

**No footage means no piece.** A walkthrough rendered with an empty screen is a
drawn phone showing nothing, which reads as the product failing to load — worse
than refusing.

**The coverage test was wrong in a way that hid two gaps.** It required a
*slide* builder for every format, which passed while five formats declared
`short_video` with no video builder at all — they happened to have slide
builders. Now it checks each format against the channels it actually claims,
and that immediately found two more unkept claims: `recipe` and `comparison`
both declared `long_video` with nothing able to render one. Both channels were
removed rather than filled with the short-form composition, which would produce
a twenty-second video for a slot asking for eight minutes.
