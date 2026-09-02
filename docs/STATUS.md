# Where Halyard is right now

**2026-08-31 — a piece now passes its own critics, and the loop has still never
closed.**

Driven from the UI as an operator drives it (`scripts/browser/floor.mjs`), not
by seeding a job: TikTok → Short video → History → "Why does bread go stale?" →
Send. Six text moments over four photographs, six drawn marks, a voiceover and
burned-in captions.

| Gate | Before this session | Now |
|---|---|---|
| critic | `skipped` — "no frames available" | **passed**, "6 frames reviewed" — it had 400'd on every call since it was written |
| creative | `failed` — 3 findings | **passed**, "6 beats, 0% footage" |
| retention | "longest static 19.3s" | "longest static 0.0s" |
| coherence | warning | warning, 1 note |
| audio | failed | failed — WER 7%, and the gate names the cause |

The audio failure is the correction loop's *input*, not a defect: the gate
returns `suggestedLexiconTerms: ['rearranges', 'realign', 'retrogradation']`,
`apply.ts` adds them to `voice_lexicon`, and the piece is retried. Locally it is
also a small whisper model mishearing technical words.

## The loop has never closed

`HALYARD_AGENTIC_SOCIAL_TEAM_SPEC` §1 sets the objective as "a social operation
that becomes measurably better over time". That cannot start yet:

| | |
|---|---|
| content items | **44** — 21 pending approval, 22 failed, 1 archived |
| approved | **0** |
| publications | **0** |
| post_metrics | **0** — `collect_metrics` has never run |
| learned_insights | **0** — nothing to learn from |

Halyard is a content factory with a working quality system and no feedback. Five
job kinds have never run: `collect_metrics`, `collect_comments`,
`send_newsletter`, `explore_product`, `verify_provider_capability`.

**Accounts:** `x` live (and one in error); instagram, tiktok, pinterest, youtube
`draft_only`; threads `pending_auth`. Nothing can publish until an account is
connected *and* an operator approves a piece — which is the boundary working as
designed, not a bug.

---

**2026-08-31 — the critic ran forty times and could not see what was wrong.**

The agents were the right place to look. Walking the production path one agent
at a time found that the Creative QA team specified in
`HALYARD_AGENTIC_SOCIAL_TEAM_SPEC.md` §14 is substantially *implemented* — around
fifty rules across coherence, retention, visual, creative and audio — and that
**six rules have ever fired**, across forty `review_media` runs.

| Agent | Ran? | Could it fire? |
|---|---|---|
| vision-describer | yes, 40× | described frames but never named what was *pictured* — §409 |
| creative-critic (coherence) | yes | `entirely_static` needed byte-identical descriptions; **never fired once** — §409 |
| retention | yes | said *"failed — 18.2s with no visual state change"* four times, **recorded as `warning`** by a deliberate §62/§73 deferral |
| creative-critic (model) | yes | its gate has never recorded a result |
| format-writer citation check | yes | refused accurate paraphrase whenever a fact carried a number — §410 |
| format-writer copy check | yes | judged the writer by rules the brief never stated — §411 |

**Fixed.** The describer names the depicted subject separately, so the static
check compares pictures instead of sentences and both signals fire it.
`assets.subject` records what each image was *asked* to show, which is a real
oracle for "does the background make sense with the piece" — a question that
cannot be answered against the script, because a post about gluten illustrated
with a loaf of bread is the job done right. A specific is now sufficient rather
than necessary for a citation. And the brief states the house style, so the
three-attempt budget buys real corrections rather than rule discovery.

**Still open, and honest:** motif and marks reach one format of eleven; pacing
holds ~4-5s per beat against 1.5-3s; the retention gate stays non-blocking by
the §62 deferral, now superseded in practice by the semantic static check, which
is an error and does block.

---

**2026-08-31 — `quiz` was the only format that could ever have worked.**

Found while proving the novelty fix, by running a `history` piece rather than
reading about one. It returned all five slots, correctly keyed, each with a
citation that verified against Britannica — and was refused as *"the format
asked for 5 slots and 3 were not filled"*, three times, then abandoned.

`checkDraft` looks a slot up by `key:index` and `expandSlots` numbers each key
from zero, so a singular slot is only ever `setup:0`. `parseDraft` believed
whatever number arrived. A model writing the quiz — `question` and `answer` five
times each — numbers per key and lands right. A model writing a format whose
slots are all singular numbers them **globally**, and every slot after the first
misses.

Thirty-six pieces exist; five are quizzes and thirty-one have no `post_format`.
`history`, `myth`, `fact`, `walkthrough` and `recipe` were structurally
incapable of completing, and every failure looked like a model that would not
follow instructions. `parseDraft` now counts position instead of believing the
number. Decision 98.

---

**2026-08-31 — the pipeline no longer repeats itself.** Six mechanisms meant to
stop repetition existed; five had no data to work from and the sixth had no
column to write to. Every one had the same shape — *the rule was right and
nothing supplied its answer*, which is indistinguishable from working until an
operator reads two posts in a row.

| Axis | What was wrong | Now |
|---|---|---|
| **Topic** | `selectIdeas` refuses an idea under 0.15 novelty and had never once refused one: nothing wrote `ideas.embedding`, so every idea scored the unmeasured 0.5 and cleared the floor | Ideas are embedded on write; 13 backfilled. A restatement measures 0.06, a paraphrase 0.45, an unrelated subject 0.80. §403 |
| **Facts** | `research()` took no exclusion list — same subject in, same facts out | `avoid` carries what the account published, injected into the prompt so the researcher looks elsewhere. §401 |
| **Openings** | The writer saw no previous piece | `recentOpenings` from `content_items`. §401 |
| **Photograph** | `visualLanguage: undefined` at the call site, so **every hero image ever generated** used the same `DEFAULT_MOOD` string | A *shot* — framing, light, surface — each axis rotated against `assets.shot`. §402 |
| Video treatment | Recency list seeded empty per piece | `renders.treatment`. §394 |
| Still / carousel | Four of five templates unreachable | `chooseStill`, layouts seeded from history. §395 |

Music and hook type already read real history. No recency argument in the worker
is passed empty any more — audited.

**Not fixed, and deliberately:** an operator's brief runs whatever its novelty.
They asked for it; the guard is for what the machine proposes on its own.

---

**2026-08-31 — a brief produces a piece, end to end, on OpenAI.**

Verified against the live APIs: brief → job → worker → research → citation check
→ **a `pending_approval` tiktok video** whose sources verified against
Britannica, the FDA and the NIH. `LLM_PROVIDER=openai` is set in all three env
files — it had been left empty, so everything tried Anthropic first and died.

Four defects were between a brief and a piece, and only the first was the one
that looked obvious:

*A provider with a key and no credits counted as configured.* Chosen once, on
key presence — so every generation died on a 400 while a working OpenAI key sat
in the same file. `createLlmClient` is a fallback chain now. Provider failures
fall back; request failures do not, because they fail identically next door.
Decision 91.

*Building the fallback is what executed it.* The OpenAI client sent
`content: null` for an absent system prompt — refused by OpenAI, tolerated by
Anthropic, and never seen because nothing had reached that client. And a
`generate` genuinely needs twelve minutes, not five. Decision 92.

*The citation gate was refusing well-formed quizzes.* It demanded a third of the
researched fact's words appear in a single slot — and **a question sharing a
third of the fact's words has given away its own answer**. It read as
"gpt-5.5 drifts from its sources"; it was a rule that would have refused any
writer. A question and its answer are one assertion, checked together, and what
a citation pins down is the fact's specifics rather than its grammar. Decision 93.

*An operator's brief was not treated as an idea.* The handler looked for a
proposed idea, found none, and returned — having ignored the subject entirely
and reported success. That is precisely "it started and then stopped".
Decision 94.

**On fallbacks:** falling back is a provider choice, never a quality one. The
other provider runs the same prompt, every gate still runs, and when all
providers are down the error is thrown — asserted by a test, because in
production it is better to fail than to serve something fabricated.
`LLM_FALLBACK=off` disables it entirely. `docs/MODEL_FALLBACK.md`.

**Suite: 219 files, 3,245 tests, none skipped. Lint and typecheck clean.**

---

**2026-08-31 — variety across every post type, and the connection test now
shows what it found.**

`docs/VARIETY_BY_POST_TYPE.md` scopes all ten post types. Short video was one
lane of four; an account posting every other day can have perfect video variety
and still read as automated because the other three repeat.

*The same defect in every lane.* Carousels were the third instance of §394's
bug — §267's own comment claimed the recency ran "across the account" and it
never did, because the list started empty on every deck. Slide one of every
carousel drew the same layout.

*Four still templates were unreachable.* The generator named
`transformation_diff_4x5` outright, so every product-grounded still was the same
card, and `chefNoteProps`, `substitutionRatioProps` and `scalingMathProps` were
exported code nothing called. `chooseStill` picks by fit then recency — fit
first because a template whose props cannot be built renders empty regions
rather than failing. 15 of 22 real artifacts can fill the scaling card.

*And none of it was visible.* The machinery chose a treatment per piece and the
answer lived only in the database. The Gallery piece names it; Master ▸
Templates shows the pool and what has actually been drawn. Decision 89.

**The connection test now reports.** `runSelfTest` has always written
`last_self_test_ok` and `last_self_test_detail` and revalidated the rig — and
the rig never displayed either, so clicking changed nothing an operator could
see. Work done, result stored, nothing reading it. **It immediately surfaced a
real problem: the Instagram connection is missing four scopes** —
`instagram_business_basic`, `_content_publish`, `_manage_comments`,
`_manage_insights`. A stale pass beside a current failure is marked as stale
rather than shown as health.

*The suite was asking for 228 connections against a limit of 100.* Forty-two
isolated pools. When enough overlapped the server ran out, and a suite that
cannot connect does not fail — it skips. One run was 1 failure and 61 tests
dark; capped at four per suite it is 217 files and 3,228 tests with none
skipped. Decision 90.

**Suite: 217 files, 3,228 tests, none skipped. Lint and typecheck clean.**

Still specced, not built: caption shapes for text posts (the largest remaining
gap — X and Threads are text-first and have no notion of shape at all), and two
more Pinterest templates.

---

**2026-08-30 (late) — two videos briefed the same way are no longer the same
video.**

`docs/VARIETY_SPEC.md` scopes the whole thing; step 1 and the highest-leverage
half of step 3 have landed.

*The machinery was right and nothing remembered its answer.* §302 gave the quiz
five treatments and §308 gave the narrative five, both chosen by fit then
recency. Both seeded that recency list **empty on every call**, so a piece
varied within itself and repeated across pieces — two quizzes briefed the same
way opened identically, and so did two histories. Nine of eleven formats render
through `Narrative`, so that was most of an account.

`renders.treatment` (migration 0071) is the whole fix: it records what a render
drew, and the worker reads it back. The choice moved out of the React
composition, which runs in a browser bundle and cannot reach a database
(gotcha 10) — the worker decides and passes the answer down. Decision 88.

**Asserted, and they are different claims:** that the pool is exhausted before a
treatment repeats; that a treatment is never picked for a piece it cannot draw;
that the choice is pure, so re-rendering an approved video produces the same
video; and — against a real database — that what a render drew comes back and
changes the next choice. Only the last one was broken.

*Corrected while building:* the spec's first draft said `Narrative` had one
treatment. It has five. The range was already there; the memory was not.

**Suite: 216 files, 3,222 tests, none skipped. Lint and typecheck clean.**

Still ahead in the spec: walkthrough's family, seeded within-treatment variation
(Remotion's `random(seed)`, already a dependency), and showing the operator which
treatment was used and why.

---

**2026-08-30 (night, later) — deployed, and put through a design pass.**

Live at `halyard-87mphvnfn-isaac-mineos-projects.vercel.app` (behind Vercel's
deployment protection). Six commits pushed.

*What made it look generated was composition, not type.* Three fixes, no new
colours and no font changes (decision 85):

- **The accent rail is gone.** A coloured bar down the left edge of a rounded
  card is the most recognisable tell of a machine-made layout, and it had
  stopped working anyway — six rails on one screen read as decoration. A card
  that matters now carries a warmer ground and its own border colour.
- **The four-box counter row is one panel.** Four equal cards each holding a
  two-digit number is what every dashboard template ships with. One strip with
  rules between the segments is denser and quieter; the count that needs
  attention takes a hairline instead of a box.
- **Cards are the shape of their contents.** "Finish the first run" was a
  paragraph in a card sixty per cent empty; it now carries the outstanding
  checks themselves. The rig was the opposite — six identical not-connected
  cards repeating one sentence over 1,800px, now one list and two real cards for
  the accounts that differ. It reads at 975px.

Dead space and uniform repetition turned out to be the same defect from either
end: a layout that is not the shape of what it holds.

**Suite: 214 files, 3,209 tests, none skipped. Lint and typecheck clean.**

---

**2026-08-30 (night) — walked the new console page by page, and it was hiding
two broken things.**

Every route shot at 1440×900 and 390×844 and reviewed. Two defects that no test
saw, both found by using the app:

*Connecting an account was broken.* §390 moved twenty-two screens between route
groups; their bodies came along and so did every link inside them, still written
against the old paths. Thirty-four routing targets were dead the moment
`(dashboard)` went — including the OAuth callback's redirect to
`/accounts/confirm/`, which is the last step of connecting anything. Nothing
failed, because a route is a string until somebody clicks it.
`deadLinks.test.ts` now resolves every `href`, `redirect()` and
`revalidatePath()` in the app. Decision 83.

*The Brief's shape chips did nothing.* The panel posted `name="format"` and
`makePiece` reads `postFormat`, so every shape an operator chose — quiz,
history, tips — was dropped on the way to the job and the run picked its own.
Found by driving the room in a browser and reading the payload back out of the
database, which is the only way it could be found. `formFields.test.ts` is the
guard, and it is asserted against the real mutation because three earlier
versions of it passed while the bug was there. Decision 84.

**The path works end to end**, verified in a real browser: the room opens with
its desks already lit, choosing TikTok · short video · quiz moves it to 6 of 6
desks, and sending writes a `generate` job carrying
`{subject, postType, postFormat, productId, onlyPlatform}`. It stops there —
the worker is not running and both model providers are out of credits, so
nothing has been generated against the new UI.

*UI work from the same pass.* The Call Sheet's counters and rig rows are links
with a visible affordance, and "failed" filters rather than dropping you on the
unfiltered wall. The Gallery no longer shows two different things for a missing
render and a broken one. The phone's tab bar has four distinct marks instead of
four identical squares. The Brief's first preview is computed on the server, so
the room is lit on first paint rather than reading dead for a second. The crew
list links to each agent and filters by state — the two agents nothing calls are
the rows worth finding.

**Suite: 214 files, 3,209 tests, none skipped. Lint and typecheck clean.**

---

**2026-08-30 (late) — the old console is gone, and Google signs you in.**

`(dashboard)` is deleted. The studio is the console: Call Sheet at `/`, seven
rooms, 49 routes, and nothing in the navigation that does not resolve.

*A frozen list proves nothing was lost.* `navigation.test.ts` held the set of
every destination the old sidebar offered and made §172 prove it dropped none.
Deleting that test would have thrown away the only check that *this* change
dropped none either — so it became `capability.test.ts`, same frozen list, plus
an explicit map from each old destination to where it lives now. A map entry is
a claim; the test checks it resolves to a real page. The only way to lose a
capability now is to write it down. Decision 80.

*Twenty-two drill-downs moved rather than being rewritten.* These screens work —
`accounts/confirm/[id]` is the only thing between an OAuth round trip and a live
credential. Moving a directory between route groups keeps the body and swaps the
shell, which is what the groups are for.

*The move exposed three capabilities about to vanish.* The TikTok panel (its API
refuses a direct post without those options), the asset picker and manual
publish were left with no caller. They are on the Gallery piece now. Had the
delete gone first they would have gone silently.

*Reachable means linked, not listed.* The orphan check now scans every `href` in
the app rather than the navigation model, because a drill-down is linked from
the page it belongs to and that is a real path down. Decision 81.

*Google sign-in.* `signInWithOAuth` on the client and no new route: Google
returns to Supabase, Supabase redirects to `/api/auth/callback` with `?code=`,
and that has exchanged PKCE codes since Milestone 48. The `admin_users`
allow-list is untouched — signing in with Google proves an address, it does not
make anybody an operator. Decision 82. **Setup steps are in
`docs/GOOGLE_SIGN_IN.md`; two consoles still need configuring by hand.**

**Suite: 212 files, 3,207 tests, none skipped. Lint and typecheck clean.**

Still true: both model providers are out of credits, so no live generation run
has been made against the new UI, and the app is not deployed.

---

**2026-08-30 (evening) — all seven rooms are built, and nothing in the
navigation is dead.**

The studio is complete as a surface: 26 routes across Call Sheet, The Floor,
Gallery, Rundown, Wires, Numbers and Master Control, every one rendering against
real data, checked by screenshot at 1440×900 and 390×844. `rooms.test.ts` fails
if a nav entry ever loses its page.

*The Rundown counts gaps rather than listing them.* Twenty-eight slot openings a
day produced a 9,454-pixel page of one repeated sentence — §362's lesson one
room over. A count is also the truer statement: an open slot next Tuesday is
normal, and what an operator needs is how much of the day is uncommissioned.
Decision 78.

*Numbers prints dashes, not zeroes.* Four absent figures and a sheet explaining
that they are absent rather than low. Gotcha 9 made visible, in the room where a
confident-looking zero would be most persuasive and most wrong.

*Master Control separates three facts that used to be one.* Whether Halyard has
a credential, whether the platform has reviewed the app, and what the account
can actually do right now — gotcha 5 is precisely the case where those three
disagree.

*Three defects found by building the rooms* (decision 79): a Postgres `numeric`
arriving as a string and throwing on `.toFixed`; "typically Assume rejection for
an internal tool **weeks**"; and a crew screen that invented a state vocabulary
when the Auditor's own is better — it has `implemented_no_caller`, which is this
codebase's recurring bug given a name.

**Suite: 211 files, 3,214 tests, none skipped. Lint and typecheck clean.**

Remaining, all in step 9: delete `(dashboard)`, move Call Sheet to `/`, fold the
setup kit into the rig, and remap the ten routes `assessReadiness` and
`FIRST_THIRTY_DAYS` hardcode — they still point at screens that step deletes.

---

**2026-08-30 (later) — the floor, and the seven stages nobody could see.**

Room 2 has landed: **Brief** and **Live**. Six desks in a horseshoe, wires
between them, one speech bubble above whichever desk is working, and a rail of
what the crew actually said. Choosing in the brief wakes the desks in front of
you — pick "caption" and the sound booth goes dark, which teaches what a caption
is in this system without anybody reading anything.

*Seven of eleven stages were declared and never opened.* §367 made stage
attribution structural — wrapping a stage attributes everything logged inside
it — and only four stages were ever wrapped. `brief`, `caption`, `voice`,
`music`, `marks`, `render` and `qc` were named in `STAGE_AGENTS`, owned by named
agents, and passed to `ctx.as` nowhere. Three of the six desks could never have
lit up. Nothing failed, because nothing was wrong: the work ran, anonymously.
`openStage` fixes it and `stageCoverage.test.ts` keeps it fixed. Decision 74.

*The bubbles are written, never generated.* A deterministic map, falling back to
the handler's own `because`. A test asserts no written line contains a number,
so every quantity on the floor came from an event that carried it — gotcha 9 in
its friendliest disguise. Decision 75.

*The phone gets a different gesture, not a smaller room.* At 390px the horseshoe
overlapped itself and ran off the edge, so below `md` it becomes a map strip and
a swipe deck. Same desks, same order, same words. Decision 76.

*Gotcha 10 caught one, live.* `desks.ts` imported `STAGE_ORDER` for a name check;
it is reached from a client component, the core barrel pulls `node:crypto`, and
it built, typechecked, passed every test and failed at render. The check moved
into the test, where it costs nothing.

**Rooms live:** `/call`, `/gallery` (+ Scheduled · On air · Stock · piece),
`/floor` and `/floor/live`. All checked by screenshot at 1440×900 and 390×844.

*Twenty-one test files were bypassing §367's `testContext`.* Writing the helper
was never the missing half — the assertion that nothing bypasses it was.
`testContextUse.test.ts` now fails if any worker test casts to `HandlerContext`,
and the narrow cast that is still honest (a stub pool genuinely is not a
`pg.Pool`) is left where it belongs, on the pool. Decision 77.

Next: step 7 — Rundown, Wires and Numbers, which are re-skins of screens that
already work; then Master Control; then step 9 deletes `(dashboard)`.

---

**2026-08-30 — the studio has three rooms, and they run on real data.**

The console replacement is under way. `docs/STUDIO_BUILD_PLAN.md` is the plan;
steps 1–5 have landed and `(dashboard)` is untouched beside it, because every
room has a new path (`/queue` → `/gallery`, `/make` → `/floor`, `/calendar` →
`/rundown`) so nothing collides until step 9 deletes the old group.

*The Gallery is a wall.* §386. Seventeen pieces holding, shown as a bank of
monitors rather than a list — triage needs the batch on one screen, which a row
cannot give you. Failures stay on the wall, unlit and hatched, because filtering
them out of the default view is how a system quietly stops producing. The piece
view answers four questions: how it got here, what the gates said, why it came
out this way, and what to do about it.

*Three defects the screens found by being looked at.* A gate map keyed `warned`
against gates that emit `warning`, so every warning gate drew as one that never
ran — now `Record<GateStatus, …>`, which makes it a compile error. A route strip
that counted an all-skipped gate run as checked (gotcha 6, in the least visible
place). And a `<img>` whose file was gone rendering its alt text as prose across
the monitor.

*The plan was wrong about the route map.* It claimed the strip was derivable
from `job_events.stage`. `job_events.job_id` points at a job and nothing on
`content_items` points back, so it would have been empty for every row. Built
from the item's own record instead — claims, renders, gates, status are real
evidence and work today. Decision 72.

*Thirteen tests were going dark under load.* `createIsolatedPool` builds a
database and applies every migration; twelve suites had each independently set a
120s hook timeout by hand, eight had not and were inheriting 60s, and
`schema.test.ts` had settled on 90s — which is the one that tripped. The timeout
now belongs to the operation. Decision 73, and §70 from the other side.

**Suite: 207 files, 3,194 tests passing, none skipped. Lint and typecheck clean.** Rooms live at `/call`
and `/gallery` (Holding · Scheduled · On air · Stock) plus `/gallery/[id]`,
checked by screenshot at 1440×900 and 390×844.

Next: step 6, the Floor — Brief and Live, which is where the new backend is
(stage transitions for the lit wire, the crew voice map, a `planProduction`
preview). Still blocked on both model providers being out of credits, so no live
generation run has been made against the new UI.

---

**2026-08-29 (evening) — the short-video channel, made by looking at it.**

*The quiz can be played.* §302. `QuizQuestion` has carried `options` and
`correctIndex` since §294 and the composition **never drew one**, so every
multiple choice reached the viewer as a free-form question. Five treatments now
draw them — `stack`, `rail`, `grid`, `spotlight`, `versus` — chosen per question
by fit and then recency, so a four-question quiz cycles rather than repeating.
The palette is *measured* from the brand (`quizPalette`), so a dark-ground
product gets legible type with nothing configured for it.

*The scrim is scaled to the photograph.* §301. Every video since §294 sat under
the same three-stop gradient, tuned against one image. `measureLowerLuminance`
probes the band where the type sits; a failed probe stays `null` and keeps the
fixed scrim, because an unmeasured background is not a mid-grey one.

*Captures were running signed out.* §303. `requires` was declared on
`adapt_and_reveal` in §299 and nothing read it, so every capture recorded the
demo card rather than a real adaptation. Fixed, along with the two other missing
hops between a capture and a callout — the runner now records where a tap landed
and `calloutSourceFromCapture` maps it into **cut** time. Found on the way: every
result in a chain gets the same whole-chain video while each flow measured
offsets from its own start, so `cook_mode_timer`'s cut has been taking the wrong
stretch of footage.

*Method.* Every visual defect here was found by rendering a frame and looking at
it, not by a gate and not by reading the code: white type invisible on cream, the
question stranded in the middle 40% of the frame, the rail's rule running the
full height. All of them typechecked and passed their tests.

**Suite: 170 files, 2839 tests — 2386 passing, 453 skipped (DB-backed, locally).
Lint and typecheck clean.** Output to look at: `media-review/2026-08-29-quiz-templates/`
(`quiz-flat.mp4` on the brand ground, `quiz-photo.mp4` over a photograph).

Open, in order: voice (`audioSrc` filled by nothing), music (`selectBed` exists,
nothing mixes it), Ken Burns and cuts, the logo mark, the UI source picker. See
`docs/SHORT_VIDEO_PLAN.md`.

---

**2026-08-29 — the creative system can make things that are not product demos,
and something finally looks at whether they are any good.**

*A media review, by looking.* 21 real renders were downloaded and examined
(`media-review/2026-08-29/`). Every gate had passed them. The video opened on a
blank frame with `{"script":"` in the caption bar; carousel slides truncated
mid-word with 60% of the canvas empty; a cooking product had published twenty-one
assets and not one photograph of food. None of it was a rule violation — which is
the finding, not an aside.

*What that produced.* Typography and layout now reach the image path (§265, §267)
— the Creative Director was choosing well and 90% of output could not see it,
because Satori could not parse the bundled variable fonts and only two families
were ever registered. Sixteen static cuts later, six systems and seven layouts
render. Generated food photography (§268), the app-capture last hop (§273),
karaoke captions (§270), and a caption hierarchy that is not 52px-bold on every
line (§274).

*The critic.* §275. Halyard had a describer and a rule set and no critic, so
"every caption is set the same way" crossed no threshold and violated no rule.
It perceives; code decides. It may never pass anything, never fail a piece, and
never speak without citing frames it was shown. Its findings reach the scorecard
(§269) and the correction loop.

*The format family.* §277–282. Eight editorial shapes — quiz, history, tips, full
recipe, myth/fact, comparison, origin, transformation — of which **six need no
product artifact**, so an account can post on a day when nothing was converted.
Sourced formats have their citations **fetched and read**: a URL that 404s or a
page that never mentions the claim is rejected and rewritten.

*Confirmed in production, not merely deployed.* §285's sweeper closed four ideas
that had produced drafts and been stranded for a day (`closed=4` in the worker
log). §258's disown fired on a real rejected voiceover with zero stranded renders.

**2755 tests, 162 files.** Lint, typecheck and `next build` clean.

**Waiting on you:** TikTok's refresh token is expired and needs an OAuth
reconnect; `publishing_enabled` is false in production; licensed music and SFX;
the YouTube compliance audit.

**2026-08-28 (later) — long-form is real, and discovery can now say no in four
different ways.**

*Long-form.* Asking the short-form planner for eight minutes stretched four
beats to two minutes each. Five structures now produce **sections** with
intended lengths, and the chapter rules shape the structure rather than being
applied to it. It was then still a Short twice over — `defaultSubtypeFor
('youtube')` returns `short`, so nothing could ask for long-form; and once it
could, the render was 28 seconds because render length follows the voiceover and
the voiceover was written to `VO_TARGET_SECONDS`. Then the script came back
**sixty words** for an eleven-hundred-word ask: that is what one "write a
voiceover" call produces however large the number in it. Each section is now its
own writing task with its own brief. §249–251.

*Two production failures fixed.* A render died on `Minified React error #31` —
the connector returned a structured swap object where the planner expected a
line of text, and every layer carried it because the type says `string` and
nothing checked at runtime (§252). And capture died on an exact-match selector
including a trailing arrow, against a UI that ships continuously — §159 learned
this once and the fix had not spread; four more bare click steps now have
fallbacks (§253).

*Discovery decides what is worth making.* `freshness.ts` decayed signals and
ranked them; nothing asked whether a signal was worth building. `opportunity.ts`
refuses in four ways that are deliberately **not** interchangeable: `off_brand`
is permanent, `covered` is a no for now, `unbuildable` is a no until the product
ships something, `stale` fixes itself by being dropped. A signal with no source
is refused *before* scoring — gotcha 9 applied to trends. §254.

*The chain is tested end to end.* `packages/core/src/creative/pipeline.test.ts`
carries one signal through opportunity → direction → typography → opening →
motion → variants → voice → music → sound design → QC using the real production
functions. It does not prove the content is good; nothing automated can. It
proves each stage produces something the next can consume — the failure this
codebase keeps finding is two stages that each work, joined by nothing. The
assertion that catches it: QC reports nothing `unmeasured`. §255.

**2611 tests, 153 files, all passing.** Lint, typecheck and `next build` clean.
Deployed to Railway; the worker is rendering, reviewing media and scheduling on
this commit.

**A dead rule, found in production logs — and left honestly dead.**
`review_media` reported four retention checks `unmeasured` on a real render. One
is unmeasured by decision (§73: mean luminance cannot see a light card with
changing dark text; sampling is already front-loaded, so the deficiency is the
signal). The other three — `firstFrameWordCount`, `firstFrameContrast`,
`loopSimilarity` — are optional probe fields **with no writer anywhere**, the
third instance after `frameLuminance` (§71) and `frameDelta` (§74).

`loopSimilarity` was implemented, then reverted. A 16×16 average-hash scored
0.990–0.994 on the fixture renders, which looked like a pass until frames from
*different scenes in the same video* scored 0.979–1.000 — the loop pair sits
inside the noise band. Full-resolution and min-pooled variants fail the same
way. The reason generalises §73: every render is a light card with a small dark
text region, so any two frames are ~98% identical by construction, and
whole-frame comparison of any kind is blind to this content. The rule stays
`unmeasured` rather than returning a pass that cannot fail. §256.



**2026-08-28 — the creative system is a system, and it has run against
production.**

*What was wrong.* Every video Halyard made set its headings in one serif and its
body in one sans, opened with the same kicker over the same headline at the same
height, and cut in one of five languages derived from the treatment by a lookup.
Motion varied, the register varied, the treatment varied — and none of it was
visible, because the three things a viewer actually registers never changed.

*What exists now.* Seven bundled SIL OFL families, six typography systems,
thirteen visual languages each with a distinct motion signature, seven opening
compositions, and a **Creative Director** that chooses the language every other
decision hangs off — so typography, motion and the music bed agree about what
kind of film this is instead of each guessing from the treatment. Recency
carries the largest weight in every one of those choices, because an account
that always looks the same is the complaint. `docs/CREATIVE_SYSTEM.md`.

*Platform variants are real.* `platform_variants` had columns and no writer;
a TikTok, a Reel and a Short got the same file with different words. Each
platform now gets its own pacing, density, hook treatment, CTA and audio
treatment, and a decision — reuse, remix, original, or **skip**. Skip is what
makes the others honest.

*It ran in production.* Publishing stayed off. The first run found that
production had **never generated anything**: a first-run wizard guard refusing on
stale flags, with the brand voice and eleven templates in place all along. Then
four more defects that no test could see — two NOT NULL columns that assumed a
concept always comes first, a decision vocabulary with no word for `remix`,
`fitWords` with no caller putting 25 words on a frame, and a fit computed at base
size then multiplied by 1.85 after fitting. Three consecutive pieces on the same
account came out as `listicle/energetic_short/creator_condensed`,
`process_montage/fast_cut_creator/grotesque_punch`, and
`how_to/premium_instructional/display_contrast`.

*Real media, measured.* A production video: 1080×1920 h264, 30fps, 26.8s, AAC
48kHz, **−14.39 LUFS**, −1.01 dBTP, no silence over 1.5s.

**2537 tests, 147 files.** Typecheck, lint and `next build` all clean — the
build matters, because a client component importing the core barrel passed
2,524 tests and failed only there. `clientBoundary.test.ts` is now the fast
version of that signal.

**Waiting on you:** licensed music and SFX (a purchase, not code); the YouTube
compliance audit; whether to request `youtube.force-ssl` for thumbnails;
enabling the landscape and thumbnail templates once you have looked at a render;
and Anthropic credit — the key is out of balance, and the production run used
`LLM_PROVIDER=openai`.

**2026-08-28 — the creative model stopped being write-only, and long-form got
the two things that make it shippable.**

*The bug under the bug.* `creative_briefs` had **no writer at all**. Production
held zero briefs, so §221's audio direction and §223's chapters were both
correct code joined to an empty table — three systems, one missing insert. This
is the third time (§210 `strategy_decisions`, §217 `signals`, now this), and
every time it looked like success: fixtures fill the table in tests, no rows is
not an error, the dashboards stay green. `tableWriters.test.ts` now reads every
SQL statement in production code and fails when a table on its list has readers
and no writer. Verified by removing the fix and watching it fail. §225.

*Chapters.* YouTube shows them only when the whole list satisfies rules it never
reports on — first stamp `0:00`, at least three, ten seconds each. Break one and
the description renders as plain text with an identical API response. Enforced
in code; a list that cannot comply is refused with a reason recorded on the
publication. Timestamps come from `layoutScenes` against the measured runtime of
the file being uploaded. §223.

*Thumbnails.* A thumbnail is served at 1280×720 and drawn at ~360px, so the
limits are expressed as rendered sizes and the canvas figures derived from them.
Two defects found by shrinking a render and looking: the canvas was 1920×1080
(right ratio, wrong picture, invalidating the arithmetic) and the overlay asked a
400-weight serif for 700, which fell back silently and read as a thin line.
**`thumbnails.set` is unreachable**: it needs `youtube.force-ssl`, and the
connected channel holds `upload`/`readonly`/`analytics` — checked against
production. The upload refuses and names the scope rather than 403ing. Widening
the grant changes what the compliance audit covers and gives full channel write
access, so it is the operator's call. §224.

**2447 tests, 139 files**, with `TEST_DATABASE_URL=postgres://localhost:5432/postgres`.

**Open, and needing you:** licensed music (zero beds — a purchase, not code),
the YouTube compliance audit submission, whether to request `youtube.force-ssl`
for thumbnails, and enabling the landscape templates once you have looked at a
render.

**2026-08-28 — a video can be landscape, and a mix can be directed.** Two gaps
that had been quietly structural closed in one pass.

*Sound.* The bed was picked by least-recently-used rotation and mixed at a fixed
−22 dB for every video Halyard has ever made, which is why they all sounded like
the same video. `selectBed` now matches mood, energy and tempo against the
concept's emotional angle and the visual language §220 chose, and `duckingFor`
derives the level from whether anything is being said over it. **Licence is a
gate, not a tiebreak** — and the first version of that test did not prove it, so
it was rebuilt until neutralising the gate actually fails it. `music_beds` ships
empty and stays empty until someone buys music; the empty case reports why it is
silent rather than substituting a synthesised pad. §221.

*Picture.* Every composition was 1080×1920 and the layout constants encoded
facts about a *phone*, so `resolveVariant` could say "render it landscape to make
it long-form" with no landscape to render. `geometryFor(frame)` now resolves the
safe areas, caption band, content column and type scale from the canvas, and the
landscape compositions share components with the portrait ones — one
implementation to be right. The type scale was settled by rendering frames and
looking: derived arithmetically it was 1.6 and turned a hook into a title card;
1.25 is what the frames supported. A landscape slot **refuses** rather than
falling back to portrait, because a 9:16 file in a long-form slot publishes as a
Short. §222.

**Templates arrive disabled.** `TransformationDiffWide` and
`SubstitutionExplainerWide` are seeded off. Switching one on is an operator
decision, and until then a YouTube long-form slot refuses honestly.

**2401 tests, 135 files**, with `TEST_DATABASE_URL=postgres://localhost:5432/postgres`.
Migration 0053 (`music_beds`) is applied to production. Landscape templates live
in `seed.sql`, not a migration — a migration inserting a template with a
`product_id` breaks `createIsolatedPool`, whose freshly-migrated database has no
products, and 37 files failed at collection before that moved.

**Still open:** licensed music (zero beds — a purchasing decision, not a code
one), the YouTube compliance audit submission, per-platform render variants
beyond aspect, long-form chapters and thumbnails, and the remaining Creative
Studio UX.

**2026-08-28 — the loop closes, and it is proven on real artifacts.** A signal
decays, a strategy decision records the objective and the one metric it will be
judged on, a treatment is chosen from seven with diversity and portfolio
pressure, the rendered video is inspected by a gate that fails a stack of text
cards, and measured performance changes which treatment the next plan picks.
Every link is tested; the learning and social links against a real database.
`DECISIONS.md` §203–§210, `docs/SOCIAL_INTELLIGENCE_SYSTEM.md` §0.

**Proven with two real renders.** `pnpm creative-acceptance` renders the
card-only treatment and the selected one from the same adaptation and measures
both with FFmpeg: peak tonal delta 0.0157 → 0.0275, creative QA FAIL → PASS,
retention FAIL → pass. The card version's text density is the original complaint
quantified — 35, 29 and 23 words on three consecutive cards.

**Not built, and said so:** cross-platform creator discovery (needs search
endpoints the adapters lack — recommendations come only from comments on
Halyard's own posts and watch-term hits), multi-concept generation, briefs as a
first-class record, experiments beyond hooks, music as a per-piece decision.

**Run the suite with a database.** 26 files skip without one:
`TEST_DATABASE_URL=postgres://localhost:5432/postgres` → 2252 tests, 125 files.

**2026-08-28 — Halyard can tell a story more than one way, and it learns which
way worked.** Nine creative types were declared and one was implemented, with
composition selection a fixed priority list — so every video on every account
was a before/after opening on a card. Seven planners now exist, each refusing
when the artifact does not support it, producing five distinct beat structures;
selection subtracts recent use so a strong treatment cannot become the only one.
`learned_insights` turns measured performance into beliefs whose confidence is
sample size times effect size, and **the beliefs change which treatment a later
plan picks** — proven against a real database, along with contradiction halving
confidence rather than being discarded. `DECISIONS.md` §203, §204.

**The suite had been skipping 26 files.** Every database-backed test skips
unless `TEST_DATABASE_URL` is set, and nothing was setting it. Run with a
database attached the count goes 1691 → **2166 across 120 files**, and two real
defects surfaced immediately: a new table shipped without RLS, and
`hooks.test.ts` had been failing since §179 because its fixture inserts a
published TikTok item with no Direct Post choices — which the constraint
correctly refuses. Use `TEST_DATABASE_URL=postgres://localhost:5432/postgres`.

**2026-08-28 — YouTube can express both of its products, and rehearsal works.**
`maxSeconds: 60` was stated platform-wide: it was the Shorts cap until October
2024 and never the YouTube cap, so a 90-second Short failed validation and
long-form video could not be expressed at all. Shorts and long-form are now
variants resolved from intent *and* from what YouTube will actually do with the
file — the platform classifies at ingest and no API field overrides it, so
declaring long-form on a vertical 30-second render is a warning at validation
rather than a surprise after publication. `status.publishAt` is implemented
(reachable on `youtube.upload` alone, advertised since §156, implemented by
nothing); the claim that a private video could later be flipped public via
`videos.update` is **withdrawn** — that needs a scope Halyard does not hold.
`DECISIONS.md` §199, `docs/YOUTUBE.md`.

**2026-08-28 — the dry run could not rehearse anything that polls.** Adapters
depended on the clock twice, and only `sleep` was injectable, so a dry run
stopped waiting while its deadline stayed five real minutes out — spinning and
recording a request per pass until the heap died. `Clock` supplies both halves;
an Instagram Reel now rehearses in 12 ms and four requests. The bug underneath
was that §184 moved Instagram to `graph.instagram.com` and the response stub
still matched `graph.facebook`. Writing the test found a second defect: the
recorder redacted headers and bodies but not URLs, and the Meta family carries
`access_token` in the query string. **X and Threads can now be rehearsed
without a public post.** `DECISIONS.md` §200.

**Production, verified against the live database this session** — not inferred:
`publishing_enabled = false`, **0 publications**, five accounts connected with
live credentials (YouTube, TikTok, X `@Recipe_Fix`, Threads, Instagram). One
real private YouTube upload exists, `v5Ty6K5BuqE`, on the RecipeFix channel;
private videos do not appear on a channel's public page or in its `videoCount`,
which is why it looks absent. TikTok's app review has been submitted.

**A trap worth knowing:** the local `.env` `DATABASE_URL` points at
`localhost:5432/halyard`, and the local `youtube` row is an untouched seed row
with no tokens. Every real connection lives in production Supabase. A script run
without production credentials silently tests the wrong database and reports
"not connected". Production credentials come from `railway variables --json`.

**2026-08-23 — Halyard can fix its own work before asking anyone to look at
it.** A failing QC verdict used to be terminal: `status = 'failed'`, and a person
dealt with it. `correct_content` now runs first — it turns each failed gate into
a structured defect, maps it through a deterministic policy to the *smallest*
correction that addresses it, applies exactly that, invalidates only the gates
that change can reach, and re-enters the existing pipeline at the earliest stage
that must run again. Bounded at three corrections or $2. It cannot approve or
publish: a corrected item lands back in `pending_approval` exactly where it would
have. History is append-only in `content_iterations`, enforced by a trigger, and
rendered on the queue detail screen. **Not yet deployed** — corrected 2026-08-23:
`origin/main` was at `6ca8d99` while this work sat in unpushed local commits, so
whatever production is running does not contain it. Migration 0040 is applied to
the database, which is a separate action from a deploy, and the loop was proven
end to end against that database from a local worker. The earlier claim here that
the worker and web were deployed was wrong; `git rev-list origin/main..main` is
the check that catches it. Proven live on a real item — the pacing
correction took the narration from **195 wpm to 157**, inside the window, with
copy and claims preserved untouched throughout. Four defects were found by real
execution rather than by the suite: a false regression from judging an unfinished
rebuild, a voiceover correction that never re-queued its renders, a provider
failure burning the retry budget instead of escalating, and no way to rehydrate a
stored artifact. `DECISIONS.md` §165.

**2026-08-23 — Account connection is an operator action, and the runbook is
written.** No production account can be connected by Halyard: OAuth requires a
human to authorise on the provider's site and Bluesky requires an app password
only the operator holds — there is no CLI path, by design. `PLATFORM_COVERAGE.md`
§17 is the exact runbook: which four platforms are connectable today, the
callback URLs to register, and the developer-app setup TikTok, Pinterest and
YouTube still need. **`OAUTH_REDIRECT_BASE_URL` was deliberately left unset** —
the origin fallback is self-consistent, and a guessed value would break OAuth if
the other stable URL is the registered one. Verified this pass: `accountStatus()`
renders every production row honestly as "Not connected", and routing safety is
already pinned by the approval-boundary suite.

**2026-08-23 — Platform readiness audited; swap_toggle recovered at zero cost.**
X, Instagram, Threads and Bluesky are all connectable today — the first three
have client credentials in both tiers, Bluesky needs only an app password, and
the account path has **no code defects**. TikTok, Pinterest and YouTube need
developer apps registered, which is operator work. `swap_toggle`, dead in
production for weeks, turned out never to have been a selector problem: the
control is on `/` not `/adapt`, and `flow.path` is metadata that does not
navigate, so the flow was searching `about:blank`. Fixed, verified by a real
capture (1.29s, zero credits), and the invariant is now tested. `DECISIONS.md`
§171.

**2026-08-23 — The correction loop closed, for real, on OpenAI.** The one
disposition that had never executed — a correction that clears its defect and is
accepted next pass — ran end to end: `remeasure` → `rewrite_vo_script` →
**accepted**, narration 183 → 172 wpm, audio gate passed. It used the provider
seam that already existed (`LLM_PROVIDER=openai`); Anthropic was never called.
Two defects surfaced that only a *successful* correction could reveal: an
accepted item stayed in `draft` and never reached the approval queue, and a
malformed history snapshot could brick an item's controller permanently. Both
fixed and tamper-verified. `DECISIONS.md` §170.

**The blocking fact for production: zero connected accounts in production.**
Every production account is `pending_auth` with no token, so the deployed worker
cannot publish. All working credentials are local. X is verified live locally
(`GET /users/me`, @Recipe_Fix). One X post is pre-flighted and ready pending an
operator go — see the iteration log.

**Creative memory lives in `docs/CREATIVE_ITERATION_LOG.md`** — eight iterations,
a "Do Not Regress / Already Solved" table, and a *NEXT RUN MUST READ THIS*
section naming the exact next action. Read it before touching creative code.

**2026-08-23 — The evidence beat carries its weight, and provenance survives the
render boundary.** The proof beat used 21% of its band where the cards used
56–60%; it now uses 50%. Separately, a real defect: the planner has set
`sourcePath` on every artifact-derived beat since §160 and the mapping into
`renders.input_props` silently dropped it, so a stored render could not be
traced to its evidence — the test that asserted provenance was checking the
plan, not the render. Fixed, extracted to `beatsForRender`, and guarded. The
correction appliers had zero tests and now have 18. `DECISIONS.md` §169.

**2026-08-23 — The demo is captured at the shape it is published in.** The flow
recorded a 1280×900 desktop window, which is 1.20:1 against a 0.81:1 band — so a
third of the demo band was slack no arrangement could remove, and the product's
own type arrived at 0.94× and was unreadable on a phone. Cropping harder would
have cut the second ingredient column, which is evidence. The viewport is now
430×932, matching `cook_mode_timer`, and the product's responsive layout answers
the question itself; the stale desktop focus region was removed rather than
re-guessed. Footage is fitted in both dimensions instead of overflowing into
`BeatStage`'s hidden overflow. Band occupancy 65% → 100% on a real render, with
no evidence cropped. Selectors were verified at the new viewport before the
change, without spending an adaptation credit. `DECISIONS.md` §168.

**Still open:** the proof beat now measures 21% of its band against 56–60% for
the transformation cards — the same fixed-type problem §167 solved for cards, in
a different treatment. And the demo occupies 45% of the frame width, which is
inherent to a portrait screen in a portrait frame; closing it needs per-step
focus regions.

**2026-08-23 — The transformation is now the largest thing on screen.** Card
type sizes were fixed constants, so a short change used about a fifth of its
band no matter where it was placed — and the hook headline (96px) was larger
than the transformation it introduced (66px). Type now scales to the room the
content actually needs, bounded 0.8–2.0 with a hard band ceiling; the planner's
emphasis selects how much of the frame a beat should command rather than
multiplying a fitted scale. Measured on real renders: ink in the band 21% → 51%,
`after` type 66px → 109px, held cards larger than normal ones, and a card with
no reason reserves no space for one. A multi-line strikethrough defect the
larger type exposed was fixed in the same treatment. `DECISIONS.md` §167.

**2026-08-23 — Setup footage no longer reaches the viewer.** A flow step can say
`setup: true`: run it, do not show it. The hero beat used to open on a blank
page, dismiss a promo bar and sit on a spinner; it now opens on rendered product
UI and reaches the adapted result about two and a half seconds sooner. Measured
on a live capture and a real render — cut 3.80s → 3.05s, payoff within the video
~6.5s → ~4.0s. Deliberately distinct from `elide`, which is a captioned claim
about real product latency and stays exactly as it was. `DECISIONS.md` §166.

**P0 hardening, 2026-08-23.** The flaky approval-boundary test was asserting
*which* duplicate guard fired rather than the invariant — safe either way, and
order-dependent, so it failed whenever the machine was fast enough for the
winner to finish first. The race window is now held open deliberately. Three
further guards turned out not to be guarding what they claimed: the append-only
trigger blocked its own cascade, its entire test file passed vacuously against
an empty database, and `correct_content` had no protection against two
controllers spending twice on one item. All fixed and tamper-verified.
`DECISIONS.md` §165.

**One path is still unproven, and the loop is not yet fully validated.** Four of
the five dispositions have run for real — `accepted`, `corrected`,
`rejected_regression` and `escalated`. The fifth is the one that matters most:
a correction that runs, **clears its targeted defect, and is accepted on the
next pass**. It is blocked on a single external fact — the Anthropic account has
no credit, verified by direct probe against both the local and the production
credential, which are the same key. Every non-provider prerequisite is ready:
four real items sit with zero iterations and a genuine error-severity audio
defect (three `audio.pacing`, one `audio.word_error_rate`), production carries
migration 0040, and the deployed worker dispatches `correct_content`. Until that
run succeeds, do not describe the correction loop as fully proven.

**This is not the learning loop.** It makes Halyard better at the artifact in
front of it and learns nothing across artifacts — there are still zero
publications, zero metrics and zero scores. `POSITIONING.md` §11.

**2026-08-23 — Real product footage is in the frame.** The `before_after`
composition now opens on a `demo` beat playing an actual recording of RecipeFix
adapting a recipe: captured live, cut to the 3.8 seconds worth watching out of
a fifty-second session, cropped to the result panel, and rendered through the
existing plan → treatment → timing → caption path. No new timing engine, no new
caption system, no creative-type conditionals in the composition. Every frame in
the band is a frame that was recorded — a beat whose footage is missing renders
nothing rather than a placeholder. Three defects came out of the real render and
were fixed in the same pass: Remotion serving a stale `public/` copy from its
code-keyed bundle cache, `minSeconds` being a floor so a held demo beat froze
its last frame for four and a half seconds, and the resulting `maxSeconds` cap
being silently dropped at the beat→scene mapping. `DECISIONS.md` §163.

**2026-08-23 — The creative layer is reusable, and before_after looks
deliberate.** A creative type is now a map from beat role to visual treatment,
so a second type is a mapping rather than an edit to the transformation
composition. Emphasis became visible as type scale, not only duration. Two
layout defects found by inspecting real frames — percentage padding resolving
against width (the caption ran through the reason text) and a bottom-anchored
hook leaving half the canvas empty. `DECISIONS.md` §162.

**2026-08-23 — The creative layer exists, and it reaches a real render.**
`planBeforeAfter` decides the beats of a story — hook, held change,
corroboration, evidence — from the generic `Highlight` contract, and those beats
drive `layoutScenes` and the composition. Proven live on a real MCP adaptation:
five beats, the best-explained change held at 3× the hook's weight, and a
`proof` scene that did not exist before. `DECISIONS.md` §160–§161.

**2026-08-23 — Two production defects fixed at the layer above the media
pipeline.** Caption legibility is now *measured* — `captionStyle` guarantees
WCAG AA against whatever is behind the words, proven by a test that sweeps the
colour cube, and verified on a real render. And the capture selector that was
killing three production jobs a day now degrades through a candidate chain that
reports which selector answered. `DECISIONS.md` §158–§159.

**The creative/media intelligence layer was scoped but not built** — see
*Creative engine: what exists already* below.

**2026-08-22 — Halyard is online and current.** Production was four to eight
days behind and its database predated P0 and P1 — no `agent_runs`, no
`product_facts`, no `product_evidence`, no storage bucket, and a worker with no
`ANTHROPIC_API_KEY`, which meant it could not generate anything at all. Schema
forward-filled, both environments configured, both services redeployed. The
production worker then ran evidence collection and a Product Brain build against
real providers with no local machine involved: 11 evidence rows including 13
tools from the live RecipeFix MCP, 36 facts, $0.29 of Anthropic. `docs/DEPLOY.md`
carries the procedure and the reasons.

**2026-08-22 — The queue became the operator surface, and "draft" stopped
meaning three things.** A private YouTube upload was reporting itself as a
native draft, sending operators to finish something that needed no finishing —
and one line in `publish` would have recorded the next delivery capability as a
**publication**. Both fixed, with the platform capability matrix verified
against current official documentation. `DECISIONS.md` §156–§157,
`PLATFORM_COVERAGE.md` §13. Details below under *Draft and delivery*.

**2026-08-22 — Production validation loop, up to the approval boundary.** Six
real items generated from two real MCP adaptations, all six passing QC; a real
1080×1920 video at −14.3 LUFS; the audio gate recalibrated from five real
voiceovers rather than loosened. Five more defects found and fixed, all
tamper-verified — `DECISIONS.md` §151–§155. **Nothing has been published**: the
candidate sits at `pending_approval`, which is the boundary working. Details
below under *Production validation*.

**2026-08-21 — Product Understanding generalised, and MCP activated.** Halyard
no longer has RecipeFix in its control flow. Evidence collection reads whatever
a product exposes, MCP is one optional source among six, and a product with
nothing but a website was run end to end to prove it. Five more defects found by
real execution, all fixed and tamper-verified — `DECISIONS.md` §146–§150.
Details below under *Product Understanding*.

**2026-08-21 — Provider Activation Pass 1 complete.** The system has now been
run against real providers rather than reasoned about. Anthropic, ElevenLabs,
OpenAI vision, whisper.cpp, ffmpeg and Remotion all executed end to end; the X
credential was verified by a live read. Five defects surfaced that only real
execution could surface, all fixed and tamper-verified — `DECISIONS.md`
§142–§145 and §141. Details below under *Activation Pass 1*.

**2026-08-19.** Replaces the 2026-08-10 build-status document, which predated P0, P1 and P2. That version is superseded, not merely dated — its counts and its picture of the agent layer are both wrong now.

`main` is at `36dbf53`, CI green. A substantial amount of verified work sits **uncommitted** on top of it — see the last section.

---

## §174 — the browser suite was dead, and it was hiding real bugs

`HALYARD_DEV_UNAUTHENTICATED=1` did nothing. The check sat inside
`if (!supabaseConfigured())`, so on any machine with Supabase keys — every real
development setup — the flag was read and ignored. Playwright cannot sign in to
Supabase, so every spec that opens a protected page had been failing. A full run
was **2 passed**. Moving the check ahead of the Supabase branch fixed it;
`NODE_ENV !== 'production'` was always the guard that mattered and is now asserted
directly.

**What it had stopped reporting**, all now fixed:

- **158 contrast violations.** `text-muted/60` composited to 2.33:1 on every
  skipped gate on every queue item — dimming the one state an operator most needs
  to notice until it could not be read. `--color-muted` itself failed on the
  tinted backgrounds it is used over; darkened to `#6e635c`.
- **The post editor had no accessible name** — 35 per full queue, critical.
- **The preview strip could not be focused**, so every image past the fold did not
  exist for a keyboard.
- **Connect was a dead button** on TikTok, Pinterest and YouTube — it reached the
  OAuth route and returned 428 as raw JSON. Those cards now say what is missing.
- **Account card ids collided** — both personas rendered `id={platform}`.
- Three specs asserted against unscoped text and only ever passed on a small
  database; one would have clicked "Stop watching" on another term entirely.

**Deployed and verified in production**, both tiers, by observation:

- **Web** — commit `a885c99`, Vercel status `success`. `/api/health` →
  `{"ok":true,"database":"reachable","pooler":"transaction"}`. `/accounts` still
  redirects to `/signin`, which is the check that the development bypass is *not*
  active in a deployed environment.
- **Worker** — Railway logs `database.pooler mode="session" ok=true` at startup.
  Note: `railway redeploy` rebuilds the previous *snapshot*, not the latest
  commit; `railway up` is what actually ships current source. A redeploy looked
  successful and shipped nothing new, and the missing log line is what caught it.

`/api/health` returns
`{"ok":true,"database":"reachable","pooler":"transaction"}`. The web tier is on
the transaction pooler (6543) and EMAXCONNSESSION is resolved, not merely
mitigated. The worker stays on session mode and now **refuses to start** on the
wrong one — verified empirically: on 6543 the same advisory lock was granted twice
in a row.

**Verification.** 1574 unit tests passed / 399 skipped · typecheck 7/7 · lint clean
· production build clean · **Playwright 132 passed / 0 failed / 9 skipped** on a
freshly started dev server (it was 2 passed before this pass). Two specs
(`delivery`, `launch`) time out intermittently on a *long-running* dev server and
pass in isolation — a Next dev degradation under sustained recompiles, not a
product defect. Run the suite against a fresh server.

**Real browser coverage for the connect flow** (`e2e/oauth-connect.spec.ts`): a
real click, the real route handler, the real redirect, asserted from the browser's
own location, with all off-origin traffic sealed. It stops at consent, which needs
the operator's provider login.

**No account is connected.** Every remaining blocker is a provider-dashboard
setting or a consent screen — see `docs/ACCOUNT_CONNECTION.md`.


## §173 — Account connection: three real bugs fixed, the rest is dashboard config

**Fixed in code.** (1) **Threads authenticated as the Meta app.** Meta requires a
separate Threads app id; `THREADS_APP_ID`/`THREADS_APP_SECRET` now resolve first,
falling back to Meta and *saying so*. A test had asserted the old behaviour — it
encoded the bug. (2) **The Instagram login dialog was unversioned**, so it resolved
to the oldest version Meta still serves while `GRAPH_VERSION` sat pinned at v23.0.
(3) **`requireOperator` throws**, which a route handler turns into a bare 500 — an
expired session made Connect look like a broken integration.

**The values each provider needs are now on the card**, computed from the same
helper the OAuth route uses, so what we tell the operator to register and what we
send cannot drift. Asserted for all six OAuth platforms.

**Poolers are opposite by tier.** Web wants transaction (6543); worker needs session
(5432) for the correction advisory lock. The worker now **refuses to start** on a
transaction pooler — that failure is silent and costs duplicated spend.

**Not a bug: X.** Its authorize request matches X's current documentation exactly.
The error is raised before consent, so it is the callback URI, the app type, or
OAuth 2.0 being off — not scopes.

Runbook with every exact value: `docs/ACCOUNT_CONNECTION.md`.

**1564 passed / 399 skipped (40 added) · lint clean · typecheck 7/7 · build clean ·
nothing published · `publishing_enabled` false.**

**Deployment.** Four commits made this pass; the branch is **8 ahead of
`origin/main`**, which still points at `6ca8d99`. Nothing in §165–§173 is live
until someone runs `git push origin main`. A deploy claim in this file must be
backed by `git rev-list --count origin/main..main` returning zero.


## §172 — Product UX and information architecture

The sidebar went from **29 links in three groups** to **seven destinations plus a
collapsed More**. Nothing was removed: 29 destinations in, 29 out, asserted by a
test against a frozen baseline and tamper-verified.

Three reported bugs, all **reachability rather than missing capability**:

- **Product switcher** wrote `?product=` that nothing read — the layout called
  `getCurrentProduct()` with no argument. Now a cookie set by `GET /api/product`.
  (A layout cannot read `searchParams`; only pages can.)
- **Account health rows** were plain divs reporting `NOT CONNECTED` with nowhere
  to click. Now link to `/accounts#<platform>`.
- **Products** were unreachable from the switcher the operator was clicking.
  `+ Manage` now points at `/products`.

`EMAXCONNSESSION` root-caused: web tier on the session-mode pooler at `max: 5`
per lambda. Mitigated to 2; the cure is moving the **web tier** to port 6543,
which is an operator action. The **worker must stay on 5432** — its correction
claim is a session-scoped advisory lock.

X / Instagram / Threads OAuth all diagnosed as **dashboard configuration**, not
code. Redirect URIs, scopes and PKCE verified correct.

Full write-up, including phases 2–6 (designed, not built): `docs/PRODUCT_UX.md`.

**1524 passed / 399 skipped · lint clean · build clean · nothing committed ·
`publishing_enabled` false.**


## Product positioning

**Canonical positioning lives in `docs/POSITIONING.md`.** Halyard is positioned
as an autonomous product-marketing system for builders — a system that starts
from the connected *product* rather than from a brief the operator writes. That
document carries the claim levels (Today / Established / Direction / Not yet) and
an honesty ledger naming what must not be marketed as complete: performance
learning, social-platform discovery, the automated revise-until-passing loop,
Facebook, X threads, and self-serve multi-tenant onboarding. Update it when a
capability changes level, not when work merely progresses.

---

## Creative engine: what exists already (2026-08-23)

Before building a creative planner, this is what the machine already does, so
the layer above it is designed against reality rather than a blank page:

| Capability | Where it lives | State |
|---|---|---|
| format choice per account | `chooseFormat`, `supported_formats` | real |
| video composition choice | `chooseVideoComposition` | real, artifact-driven |
| platform strategy + link strategy | `PlatformConstraints` | real |
| capture step elision | `FlowStep.elide`, `shouldElide`, `elisionCaption` | **real** — measured elapsed time, cut with a caption |
| selector resilience | `fallbackSelectors`, `selectorHealth` | new, §159 |
| caption treatment | `captionStyle` | new, §158 |
| visual/coherence/retention critique | `review_media` on `gpt-5.5` | real, independent provider |

Capture compression is therefore **not** missing: `elide` already cuts the long
adaptation wait and captions it with the *measured* elapsed time rather than a
synthetic progress bar. What does not exist is a plan that chooses the creative
*type* — before/after versus explainer versus demo — and drives scene emphasis,
caption backdrop and timing from it. `captionStyle`'s `CaptionBackdrop` is the
first parameter such a plan would set.

Nothing here fabricates performance data: there are still no publications, so
the learning loop has nothing to learn from.

---

## Draft and delivery — one queue, three platform outcomes (2026-08-22)

**Halyard's draft is authoritative. A platform's is a delivery outcome.** The
two were being mixed, and the mixing was live: YouTube reported a private upload
as `mode: 'draft'`, so the queue told an operator to open Studio and finish a
video that needed no finishing — while hiding that Halyard could publish it over
the API. Three states now, each with its own sentence in the UI:

| what happened | who finishes it | Halyard status |
|---|---|---|
| **native draft** (TikTok inbox) | the creator, inside TikTok | `awaiting_manual_publish` |
| **private upload** (YouTube private) | nobody — Halyard can publish it | `awaiting_manual_publish` |
| **direct post** | already public | `published` |

**The dangerous half was one line.** `publish` read
`mode === 'draft' ? awaiting_manual_publish : published`, so the moment a third
outcome existed it would have been recorded as published — `published_at`
stamped, the repost clock started, metrics collected against a private video.
`statusAfterDelivery` now publishes only on `direct`, so a capability added
later fails closed.

**The capability matrix is verified, not assumed.** `PlatformConstraints.delivery`
declares `nativeDraft`, `privateUpload`, `apiScheduling` and
`requiresCreatorCompletion` per platform, each carrying the documentation that
justifies it. TikTok is the only native draft; YouTube is the only private
upload and the only API scheduling. Instagram and Threads media containers are
recorded as **neither** — they are a transient publishing step that expires in
24 hours and the creator never sees. Sources in `PLATFORM_COVERAGE.md` §13.

**An edit no longer leaves stale verdicts** (§157). The copy gate is re-run
because the slop filter is deterministic; the claims gate is marked
*not re-verified* because only a re-check can settle it; every other gate is
left alone, because editing a caption does not un-measure a render.

**The queue shows the whole lifecycle.** `published` and `rejected` had no tab
and were missing from "Everything", so the only way to see what Halyard had
actually done was the database. Both are tabs now, with a platform filter and a
delivery badge on every card.

---

## Production validation — the loop up to approval (2026-08-22)

**The generation half is real and repeatable.** One scheduled `generate` run
produced six items from two real MCP adaptations — *Chewy Fudgy Frosted Brownies
(Gluten-Free)* and *Gluten-Free Apple Pie* — each with a real artifact. All six
carry `passed: true`. The X candidate's claims gate reads **2/2 verified against
artifact**, with `sourcePath`s (`steps[1].updated_note`, `steps[6].updated_note`)
that resolve into the adaptation, and the artifact genuinely contains the
cornstarch and bubbling details the copy talks about.

**ElevenLabs is on Starter and the media chain is clean.** Five voiceovers
synthesised with the premade voice: 23–36s, all at −14.3 LUFS, spoken slop
clean, captions aligned. Instant voice cloning is now permitted by the plan and
was deliberately **not** used. Music stays absent — the bed is gated on a
licensed `music_bed` asset for the product, and there is none.

**The audio gate was calibrated from evidence, not loosened** (§152). The 2%
ceiling is unchanged; it was counting whisper's tokeniser rather than the
speaker. The video that failed at 2.94% re-ran through the production path and
now reads **WER 0.0%**.

**The publication candidate is verified and unpublished.** `first-contact
--dry-run` against the named item: `@Recipe_Fix`, 244 of 280 characters, no
link, **one** write, ~$0.015. Its link was `http://localhost:3200/r/…` — §153
now refuses that at publish time, and clearing it was recorded as an operator
decision in `audit_log`.

**The loop below publication is genuinely empty, and says so.** 0 publications,
0 `post_metrics`, 0 `performance_scores`, 0 `halyard_empirical`. `score_performance`
ran and reported `posts: 0` — an honest zero rather than fabricated scores. The
learning edge cannot be exercised until one real post exists.

---

## Product Understanding — source-agnostic, MCP optional (2026-08-21)

**RecipeFix is the activation subject, not a dependency.** `createConnector`
branched on `product.id === 'recipefix'`; any other product with a valid MCP
configuration silently got no connector. MCP is now generic, and
product-specific artifact adapters resolve from `connector_config.adapter`.
See `DECISIONS.md` §146 for the evidence/artifact split that makes that work.

**Six evidence sources, all optional.** `discoverEvidenceSources` is one pure
function over the product row and the environment — website, App Store, MCP,
repository, screenshots, operator brief. It is what drives collection *and* what
the Brain page and onboarding show, so the operator is told what actually ran.
It reports **configured**, never reachable; the UI pairs that with what was last
**observed**, because a configured source that has produced nothing is what a
wrong URL looks like.

**Proven live, all four MCP states:**

| State | Result |
|---|---|
| configured and answering | 13 tools read from the real server → 12 implementation facts |
| configured, unreachable | `unavailable — fetch failed`; website collection unaffected |
| not configured | `not configured`; three agents skipped by name |
| no MCP at all | a website-only product collected, reasoned and built a Brain for $0.0066 |

**The video path works for the first time.** A real MCP adaptation now produces
a real artifact (§149), so `chooseVideoComposition` finds its swaps: two video
items reached `pending_approval` with a 1080×1920 H.264 + AAC render at
−14.3 LUFS, and the claims gate reported **5 of 6 verified against artifact**.
Both are held back by a failing audio gate (WER 2.3% against a 2% ceiling),
which is the gate doing its job.

**Model calls are streamed** (§147). One hung for eighteen minutes holding a
worker slot; the same Brain build now finishes in 120 seconds.

**Still externally blocked:** ElevenLabs remains on the free tier, so the
founder voice clone is unavailable and testing uses a premade voice; music is
unlicensed and the bed is skipped; some Discover recipes cannot be scraped and
the server refuses them, which the retry now routes around.

---

## Activation Pass 1 — what real execution proved (2026-08-21)

Everything here is a live provider result, not a fixture.

**The generation path runs.** Opus 5 proposed 8 ideas, Sonnet 5 wrote the copy,
Haiku 4.5 verified the payoff, `runAllGates` passed it, and the draft is sitting
in `pending_approval` where it belongs. 14 `agent_runs` rows, $0.36 recorded.

**The media chain runs.** ElevenLabs synthesised, ffmpeg mixed and measured
−14.6 LUFS, whisper.cpp timed the words, Remotion rendered 1080×1920, ffmpeg
muxed H.264 + AAC, and OpenAI `gpt-5.5` described six frames. The coherence gate
moved from `skipped` to measured. Frames were inspected by eye, not inferred.

**Five defects only live execution could find.**
- Opus 5's adaptive thinking consumed the whole `max_tokens` ceiling before the
  answer, truncating every idea batch (§141).
- One account with unknown capabilities failed the entire generate job before
  reaching the account that could publish (§142).
- The hook stage replaced the whole post on any single-paragraph platform, and
  stored a green QC describing text that no longer existed (§143).
- Whisper was returning sub-word tokens, so the audio gate scored 29.4% word
  error against word-perfect speech, and captions would have rendered "g" and
  "ummy" as separate cards (§144). Live result after the fix: **1.18%**.
- Caption text came verbatim from the transcript, so a frame read "Keep the rice
  short, 60 to 90 minutes" where the script said "rise… sixty to ninety" (§145).

**Three things are blocked outside the code**, and none of them are defects:
ElevenLabs is on the free tier and refuses the cloned founder voice
(`ivc_not_permitted`); the RecipeFix MCP connector has no URL or token, so no
product artifact exists and every video refuses honestly; music is unlicensed
and the bed is correctly skipped rather than faked.

**X is ready except for one unverifiable thing.** `@Recipe_Fix` passed a live
read — token valid, `tweet.write` granted, identity confirmed, "posting is live
and billed per call". Whether the developer account holds credits cannot be
established without a billed write (gotcha 11), and nothing is approved, so
nothing would publish.

**Fact-checking on the Daily Take is model-knowledge-only.** The `WebSearch`
seam exists in `factCheckTake` and `runTakeLoop`; no implementation exists in the
repo and the only caller passes nothing. Verified live — every claim came back
with `sources: []` and the model wrote "I cannot verify from memory".

---

## Done

**P0 — Agent operating system + Auditor** (PR #1, merged). Agent registry with a full execution contract, `agent_runs` execution records, capability states derived from evidence rather than declaration, and the Halyard Auditor (`packages/audit`) which parses the TypeScript AST rather than grepping. Agents/System UI surfaces.

**P1 — Product Brain** (PR #2/#3, merged). `product_evidence` (observed) and `product_facts` (believed, each citing its evidence, enforced by a trigger). Five product-intelligence agents propose; `deriveFactStatus` and `computeConfidence` decide from evidence alone. `verified` requires two independent sources. `/brain` and its category screens.

**P2 — Platform Intelligence** (PR #4, merged). `resolveCapability` — one canonical resolution over five separated dimensions, adding no third vocabulary. `capability_probes` records observations; `provider_capabilities` holds the belief citing them. Per-platform strategy where every claim carries its basis.

**X OAuth is working.** `@Recipe_Fix` is genuinely connected: identity confirmed, token sealed, self-test passed. The original failure was an `X_CLIENT_ID` copied one character short.

**Token refresh now actually runs.** The worker's handler used to log which accounts were due and refresh nothing, deferring to a web cron scheduled once a day — against X tokens that live two hours. `packages/core/src/accounts/refresh.ts` is now shared and the worker runs it hourly.

**Accounts UI** rewritten around what an operator can do rather than what the state machine calls it.

**Disconnect erases a credential, and now actually exists.** The strongest "off" Halyard had was `setCapabilityState(… 'disabled')`, which writes one text column — a "switched off" account still held a live, decryptable token, and the legal pages had to be written to say so. `packages/core/src/accounts/disconnect.ts` erases the tokens, the scopes, the identity confirmation and every observation made through the credential, deletes any sealed copy staged in `pending_connections`, reads the erasure back and throws if anything survived, and keeps the account row so published history stays explicable. It does **not** revoke at the platform, and says so everywhere. `DECISIONS.md` §64.

**Engagement reads can reach `verified`.** `read_comments` had no field in `TRANSPORT_FIELD` and could never rise above `declared` whatever was observed — the architectural hole P2 recorded and left. The missing piece was a *scope*, not a vocabulary: `capability_probes` gained `account_id` (migration 0032) and `resolveCapability` gained an `observation` input. `collect_comments` is the writer — a successful read *is* the observation, at no extra API cost. No failure is ever recorded as a refutation. `DECISIONS.md` §65.

**Gate 3 has never seen a frame.** `sampleLuminance` read ffmpeg's *stderr* while `metadata=print:file=-` writes to *stdout*, so `frameLuminance` has always been `[]` and every luminance rule in `runVisualQC` — including the black-gap check the function exists for — has never run on any render. The visual gate stored `passed` with `examined: 0` beside it. Fixed, and the gate now stores `skipped` when nothing was sampled. `DECISIONS.md` §71.

**A Meta access token could have reached Sentry and the database in the clear.** The redactor matches credentials by *shape*, and Meta's Graph API carries the token as a URL query parameter — a long opaque string nothing matched. Now redacted by parameter name, and applied at the database boundary as well as the reporter. Nothing had leaked. `DECISIONS.md` §96.

**Attached images were published with no gate having looked at them**, on both the image-only and the video path — the second found while reviewing the first fix. `DECISIONS.md` §93–§94. `review_media` walked `renders` only and returned early for image-only items, behind a comment claiming stills were covered by a gate that has never received its input. `publish` sends attached assets too. Now examined from stored dimensions, with unrecorded dimensions reported as unexamined rather than passed — and the verdict is recomputed when the attachments change. `DECISIONS.md` §93.

**Two holes in the approval boundary, found by attacking it as a whole.** Editing an approved item left `status` untouched, so the queued job published text nobody approved (§90). And `pending_auth` published if it happened to hold a token — a real window, because `confirmConnection` writes the account with its sealed token *before* verifying it, and every other component already treated that state as unable to act (§91). Both fixed and tamper-verified. The new adversarial suite is `apps/worker/src/approvalBoundary.test.ts`. `DECISIONS.md` §90–§92.

**The double-spend window in idea generation is closed.** Signals are consumed the moment the model call returns, before anything is persisted — so a failed insert loses the proposals rather than paying for them twice on retry. Fault-injected at the real boundary. `DECISIONS.md` §87.

**The first X publication has an executable specification.** Rehearsal 6 pins everything one controlled post must leave behind, including the two collection jobs without which the learning half stays empty while looking successful. A fixture, not provider evidence. `DECISIONS.md` §89.

**An operator's find is now evidence.** `signals` had one writer; a pasted find could become one post and never become evidence. `promoteFindToSignal` closes that, gated on the operator's reason — a bare URL creates nothing. Two dead things went with it: an enqueued job carrying a payload nothing reads, and an `on conflict do nothing` that silently discarded a reason added after the paste. `DECISIONS.md` §85.

**The learning edge is connected.** `IdeaCandidate.historicalConversion` existed since the scorer was written and nothing ever supplied it. It changes nothing today — no rows, neutral still applied — and it will carry data the moment a post is scored, rather than being remembered then. `DECISIONS.md` §86.

**Nothing produced ideas at all.** `ideas` is the entry point of the generation pipeline and its only writer in the repository was `supabase/seed-demo.sql` — a demo seed. `generate` found nothing proposed and returned on every scheduled run; `signals` was read by nothing. Both closed: `proposeIdeas` reads unconsumed signals and writes proposals carrying `source_signals`, and it spends nothing when there is no signal. **Not exercised** — no live model call has been made, because there are no credits. `DECISIONS.md` §84.

**The observation layer observes almost nothing — and could not be switched on.** No adapter reads third-party content on any social platform; every read is `listComments` on Halyard's own publications. The one automated third-party path, `collect_watch_terms`, has been scheduled daily since milestone 41 and read an **empty table** every day, because `watch_terms` had no UI, no server action and no API route. That ignition now exists on `/finds`. `DECISIONS.md` §83.

**The queue can hear "do not retry".** `publishFailurePolicy` has returned `retry: false` for auth failures, duplicate aborts and malformed responses since milestone 40 — including one whose note reads "never retried — that double-posts" — and `Poller.fail()` had no way to receive it, so every one burned its full retry allowance. For a malformed response the idempotency index was the only thing preventing the second write. `DECISIONS.md` §79.

**Meta webhooks are implemented.** `/api/webhooks/meta`: handshake, `X-Hub-Signature-256` over the raw body, payload parsing, and enqueue of the existing `collect_comments` job — a trigger, never a source of truth, so nothing is written from a payload. The recorded "web tier vs worker" decision was not one: the worker has no HTTP surface. Registration remains external. `DECISIONS.md` §80.

**The retention gate had no caller** — and wiring it up introduced a regression I then had to fix, because I had measured the wrong thing. `probeVideo` samples one frame per ~5s; my "measurement" had used the first six seconds at 2fps and I read it as the whole-video series. Re-measured through `probeVideo` itself: one of four renders is affected, not all four. `DECISIONS.md` §74. The gate now records findings at `warning` and never fails an item, and reads its motion from the frame's **tonal range** rather than its mean — free, from the same `signalstats` output, and clearing the threshold by 0.28 where the mean clears it by 0.01.

**The retention gate, in full.** 310 lines and 171 lines of tests, reachable only from its own test file. Now wired into `review_media`, with two constraints that had to hold first: the rules it cannot run (frame-1 OCR, loop similarity) are **named** and drop the gate to `warning` rather than passing quietly, and it reports the 3-second opening rule as *unmeasured* when the sampling interval is too coarse to resolve it rather than failing every video on an artefact. `DECISIONS.md` §72.

**Halyard's only feedback loop had never run.** `loadHookHistory` supplies the one input by which an observed outcome changes a future generation decision. Its query selected `post_metrics.stop_rate` and joined on `post_metrics.content_item_id` — **neither column has ever existed** — and a `.catch()` turned the failure into an empty array, which the comment above it explained as "nothing has published yet". The test asserted the empty array and passed. It now measures a **view-through rate** (`video_views / impressions`), named as itself rather than as the 3-second retention nothing collects, scoped per platform, one sample per publication, and logs failures so a broken query is distinguishable from a cold start. `DECISIONS.md` §70.

**A score is a claim, and an unmeasured post no longer gets one.** `scorePerformance` read `Number(row.impressions ?? 0)` over a `left join lateral`, so a published post that had never been collected was scored as a *measured zero*. Percentiles are computed over the cohort, so each fabricated zero also moved the score of every genuinely measured post beside it. Unmeasured posts are now excluded from the population and from the output, the count is logged, and a measured zero is still scored. `DECISIONS.md` §68.

**An erased credential no longer reaches the network.** `loadAccount` and `publishHandler` both read `access_token_enc ? openToken(…) : ''`, and an empty string is a value: the request was built, sent, and refused with an empty bearer — a real API call, plus retries, to learn what the row already said. Reachable three ordinary ways, including every seeded account (`live` has never meant "connected"). All three call sites now fail closed before any network call. `PLATFORM_COVERAGE.md` §11.

---

## Blocked

**The first real X publication — blocked on X API credits.** The full path was exercised for real on 2026-08-19: kill switch, approval, routing, token decryption, and a genuine `POST /2/tweets`. X returned **HTTP 402 credits-depleted**. Halyard wrote **zero** publications and did not claim success — which is the correct behaviour.

The test content item is `archived`, so its still-queued job is inert: `publishHandler` returns at the approval guard before any network call. Verified by running the worker — job `done` in 1ms, zero API calls. **Do not un-archive it** unless a post is genuinely wanted.

**Downstream of that:** no publication means no metrics, no comments, no scores, and **no `halyard_empirical` claims**. That basis is zero everywhere by design and a test keeps it there.

**Also blocked:** live Product Brain reasoning (`OpenAI 429 — no credits`; the Anthropic key in `.env.local` is a comment line, not a key). Live provider capability verification (`BLOTATO_API_KEY` present but rejected **401**).

Every one of these is an external credential or billing problem. None is a code defect.

---

## Meta / Instagram (2026-08-19)

Instagram OAuth is live. `@recipe.fix` is connected, identity confirmed, token
sealed (~60 days), granted permissions discovered via `/me/permissions` and
persisted, self-test passing, account `draft_only`.

**No Instagram capability is verified**, and `read_comments` still reads
`declared` — correctly, because @recipe.fix has zero media, so there is no
publication whose comments could be read. The *second* reason has gone: the
model can now hold an account-scoped observation, so a single real read would
move it to `verified`. Before, no number of successful reads could have.

Legal pages `/privacy`, `/terms`, `/data-deletion` are implemented and tested,
**not deployed**. They now describe a real Disconnect rather than its absence,
and a test pins that they still do not claim it revokes access at the platform.
`business_management` is granted, exercised by nothing, and recommended for
removal pending approval — see `PLATFORM_COVERAGE.md` §9.

**Two concurrent generate runs could pay for the same evidence** (§108). §87 closed the retry window; concurrency was still open, because `generate` runs from cron *and* `regenerateItem`. Signals are now claimed in the select and released only when the model call never completed. Fixing it also exposed a false positive in the §77 SQL validator — a doc comment quoting SQL in backticks was read as a statement.

**The approval gate was a public endpoint** (§107). Ten server actions — including `approveItem` and `publishNow` — had no `requireOperator()`. The dashboard layout guards *rendering* and never runs for an action invocation; middleware does no auth. The boundary §90/§92 hold in logic was bypassable at the transport layer, which is why the adversarial suite could not see it. Fixed, and `serverActionAuth.test.ts` now asserts every action authenticates *before* touching state.

**Learning fed on a percentile computed over nothing** (§106). With no attribution, `percentileRank(0,[0,0,0])` is 0.5, and that synthetic middle was stored in `conversion_score` — which §86 averages into idea scoring. Harmless while attribution is uniformly absent; a meaningless average the moment it is partial. Now null. The provenance links themselves hold: published content traces back to its idea, and comments back to the post that caused them.

**A newsletter would ship a broken unsubscribe link** (§105). `/u/{id}` is embedded in every rendered email and the route does not exist — and the URL carries the *newsletter* id, not the subscriber's, so it could not work even with one. Unreachable today because the feature is dormant, and now a hard prerequisite on the newsletter decision rather than a nice-to-have.

**The founder take dead-ended at its last step** (§104). `approveTake` and `discardTake` were complete server actions referenced from nowhere — an operator could speak a reaction, watch it fact-checked, read the draft, and then had nothing to click. Wired to the existing actions; approving sends it to the queue as `pending_approval`, never publishes.

**All 13 scheduled jobs audited as execution paths: no defects** (§103). No expensive no-op — both browser jobs guard before launching. No LLM spend on empty input — the Product Brain chain only fires when evidence was actually collected. "Enqueue work nobody handles" is already structurally impossible via `handlerCoverage.test.ts`.

**Compose implied it could save conversations.** `compose_sessions` has a reader and no writer, so "Nothing saved yet" told the operator they had not saved one when nothing could. Corrected at the surface. `voice_lexicon` turned out to be seeded (the §100 scan walked only TypeScript), and the newsletter feature is dormant but correctly guarded — a send with no subscribers fails rather than reporting success. `DECISIONS.md` §102.

**The reply drafter's own scorecard recorded the opposite of what happened** (§101). `was_edited` was `suggested_reply !== body`, and `suggested_reply` is null for any comment the drafter never ran on — so every hand-written reply was stored as an edit of a draft that never existed. Fixed, and `comment_replies` now has the read path it never had: the inbox shows replies sent, how many had a draft, how many of those were changed, and the median latency.

**Agent registry audited: accurate, no drift** (§99). Two apparent orphans are internal callers reached through `runTakeLoop`, and one "caller" is an Auditor fixture — the third time a symbol scan of this shape has produced a confident wrong answer. A table-level producer/consumer map is in §100: `rejection_clusters` has a consumer and no producer, `comment_replies` a producer and no consumer, and six tables have no code at all.

## Activation

The exact external steps, in order, with the evidence each should produce:  §16.

## Needs a human

Recorded rather than decided, because each has consequences repository evidence cannot settle:

0. **How long should operational logs be kept?** The mechanism is built and the control is on `/settings`; `log_retention_days` defaults to null, which means keep everything. Setting a number is the decision. `audit_log` retention is separate and deliberately untouched. §131.
0. **Does Halyard run a newsletter?** Everything works except signup: `subscribers` has no capture surface, and adding one means email capture plus double opt-in, which needs Resend. Nothing promises a newsletter today, so the feature is dormant and honest. Recommendation: leave dormant until there is a reason. §133.
0. **Five dead tables, classified rather than dropped.** `submissions` and `format_cadence` are superseded and safe to drop; `product_artifacts` and `hook_experiments` are unfinished features and should stay; `connector_calls` needs a yes/no on whether a per-connector call log is wanted (recommendation: drop). Ready SQL in `docs/DEAD_TABLES.md`, deliberately not in `migrations/`.
0. **Three visual baselines need one look.** `/privacy`, `/terms`, `/data-deletion`, captured from a production build. Approving each page approves both widths, after which the suite is fully automated. `docs/VISUAL_BASELINES.md`.

0. **Five tables are dead and none has been dropped** — `submissions` (superseded by `review_submissions`), `product_artifacts`, `connector_calls`, `hook_experiments`, `format_cadence`. Dropping a table is irreversible against production data, so "no reference in this repository" is the start of that argument, not the end. `DECISIONS.md` §127.
0. ~~**Two read-only features.**~~ **Resolved** — pronunciation is fully built (§130); series is superseded by campaigns and the screen now says so (§132).

0. **How long should operational logs be kept?** `purge_operational_logs(interval)` exists, is tested and is called by nothing — it takes the window as an argument precisely so the schema does not answer this. Applies to `jobs`, `notifications`, `agent_runs` and `capability_probes`. `audit_log` is never purged by it and its retention is a separate, compliance-shaped question. `DECISIONS.md` §123.

0. ~~**Three jobs on no schedule.**~~ **Resolved** — `collect_attribution` and `digest_email` are scheduled (the digest was also *built*); `verify_flows` was already covered by the worker's weekly capture, and §121 was wrong about it. §129.
0. ~~**Is generation meant to be daily?**~~ **Resolved** — yes, and it is now scheduled. Safe because `generation_enabled` is honoured by the handler. §129.

0. ~~**The brand orange fails WCAG AA.**~~ **Resolved** — darkened to `#8c5035` after measurement; zero violations product-wide. §128.

0. **What may be written to a platform request log.** `platform_requests` exists, is indexed, is RLS'd and is purged on a schedule — and nothing has ever written to it. Its `request_body`/`response_body` columns would capture OAuth token exchanges, so the open question is what may be recorded, not whether to record. `DECISIONS.md` §81.
0. **Does Halyard run a newsletter?** The engineering blocker is gone: subscriber-scoped unsubscribe is built, tested and tamper-verified (§117), so this is now purely a product decision plus a Resend account and verified sending domain. If no, unschedule the drafter. Recommendation: leave dormant. Sending is dormant by construction — no schedule, no enqueuer.
0. ~~**The adaptation cache and its spend ceiling.**~~ **Answered, not deferred** — §120. The sharp edge (a retried generate job re-spending a credit for the same idea) was an ordering bug and is fixed: the idea is now claimed before anything is spent. The cache itself is proven unnecessary for correctness, and the hourly ceiling cannot bind because `generate` is operator-driven. `artifactCache.ts` stays unwired deliberately.
0. **Should a static render block publication?** `retention.no_pattern_interrupt` fires on `ScalingMath.mp4`, which genuinely holds one card for twenty-four seconds. The finding is real and is recorded; the gate does **not** fail the item, because this gate had no caller at all until today and `DECISIONS.md` §62 already declined to decide which media gates block. Either raise it to blocking, or fix the template. `DECISIONS.md` §74.
1. **`business_management` *and* `pages_read_engagement`** — both granted, both reaching no code at all. The second had never been flagged; the live connection succeeded with all seven scopes granted, which isolates nothing about which were necessary. One OAuth round trip with a scope withheld would settle it. Recommendation: remove both. `DECISIONS.md` §98, `PLATFORM_COVERAGE.md` §9.
2. ~~**Webhook ownership**~~ — resolved by reading the code: the worker has no HTTP surface, so the web tier is the only candidate. `/api/webhooks/meta` is implemented and tested. What remains is external: set `META_WEBHOOK_VERIFY_TOKEN`, register the callback URL, subscribe to fields. `DECISIONS.md` §80.
3. **Which items must pass media QC before approval** — the Auditor's one remaining error (`gate.input_never_supplied`) is a policy question about the quality system, not a bug in the capability model. `DECISIONS.md` §62.
4. **Deploying the legal pages** and pasting the three URLs into the Meta App Dashboard. External portal action.
5. **X API credits.** External and financial.

## Next 1–3 steps

1. **Add X API credits**, then re-run the single-post test. Everything on Halyard's side is proven to the provider boundary; one real observation unblocks the entire chain below.
2. Once a post exists, let the `collect_metrics` decay schedule run and confirm real observations land with provenance — and that `scorePerformance` now scores it *because it was measured* rather than in spite of not being.
3. If the post is Instagram or Threads video, `collect_comments` will write the first account-scoped observation and `loadHookHistory` the first real view-through figure. Both paths are now exercised by tests and neither has ever seen real data.
4. Only then consider P3 (Social Discovery / Opportunity Intelligence). It is architecturally premature until first-party data exists — `PLATFORM_COVERAGE.md` §7 and §12.

---

## Uncommitted work

Several passes are complete, verified and **not committed** — 33 modified files and 19 new ones:

- the OAuth redirect fix (`apps/web/src/lib/oauthRedirect.ts` + tests)
- token refresh (`packages/core/src/accounts/refresh.ts` + tests)
- the Accounts UI pass
- the legal pages (`/privacy`, `/terms`, `/data-deletion`) + `e2e/legal.spec.ts`
- **Disconnect** (`packages/core/src/accounts/disconnect.ts`, its server action and UI, 8 real-database tests, 2 E2E)
- **account-scoped observations** (migration 0032, `apps/worker/src/observations.ts`, the `observation` input to `resolveCapability`, 17 tests)
- the missing-credential guards in `publish` and both collectors
- the scoring null/zero fix and the hook-history query repair

The `media.write` scope removal in `packages/core/src/adapters/oauth.ts` is a deliberate diagnostic — keep it removed until media publishing is actually needed.

Nothing here is half-applied: every slice typechecks, lints, builds and has passing tests, and each has a `DECISIONS.md` entry (§64–§70).

### Model lock (2026-08-21)

`DECISIONS.md` §141. Models chosen and the compatibility blocker cleared.

| Tier | Model | Workloads |
|---|---|---|
| Strategy | `claude-opus-5` | idea-generator, take-fact-checker, take-drafter, take-strengthener, product-discovery, store-listing, code-intelligence, product-reconciler |
| Draft | `claude-sonnet-5` | copywriter, vo-scriptwriter, hook-generator, copilot, find-drafter, reply-drafter, setup-kit-writer, explorer-discovery, visual-brand, shipped-feature-summariser, auto-clip |
| Classify | `claude-haiku-4-5` | payoff-verifier |

Unchanged: `gpt-5.5` vision, `whisper-1` voice memos, local `whisper.cpp`
captions, `eleven_multilingual_v2` TTS, `music_v1`, provider fallback, and every
approval and publishing boundary.

**The blocker was `temperature`.** The client sent it on every call — including
the API's own default, which no caller asked for — and Opus 5 and Sonnet 5
reject sampling parameters with a 400. It is now sent only when a caller asks
*and* the model accepts it. Four agents were also on the wrong tier, routed by
an omitted `model` argument rather than by decision.

Suite: **1590 unit passing, 0 failing**; **118 E2E passing, 8 skipped**;
typecheck, lint, build, SQL clean.

---

### Overnight hardening pass (2026-08-20, fifth)

`DECISIONS.md` §134–§138. The brief was to challenge the internal finish line
rather than confirm it. Five defects, three of them in work from earlier passes.

**The one public route could be made to throw.** `/r/[id]` says it never fails
closed; a preview crawler following a link for a product with no web destination
hit `new URL('')` and got a 500. Checked while there and clean: no open
redirect — destinations come from the database and incoming parameters are only
ever added.

**My own notification retention could never delete anything.** §123 purged only
*read* notifications and nothing has ever set `read_at`. Migration 0038 purges
by age; the operator's window is the real protection.

**Forty-eight tests passed while a live refresh token stayed in the database.**
`disconnect.test.ts` stubs the query function, so it never ran the UPDATE that
erases. `/data-deletion` makes that promise to platform reviewers in public.
`disconnectDb.test.ts` now proves each clause against a real Postgres.

**A column the screen displayed and nothing wrote.** `voice_lexicon.hit_count`
read zero forever; `tts` now counts the terms a script actually used. Found by
looking at a screenshot of a page built the same night.

**Twenty undocumented environment variables**, including
`META_WEBHOOK_VERIFY_TOKEN` — an activation step the webhook refuses without.
`envDocumented.test.ts` now asserts both directions.

Verified and needing no work: 82/82 server actions guarded, three public routes
correctly public, routing safety (14 real-database tests over cross-product and
cross-persona attacks), publish idempotency, token sealing, permanent-failure
semantics, no orphan rows, no dead UI controls, all 46 routes rendering under a
production build.

Suite: **1575 unit passing, 0 failing**; **118 E2E passing, 8 skipped**; zero
accessibility violations; typecheck, lint, build, SQL clean. Migration 0038
added; 0001–0038 apply fresh.

---

### Pre-activation completeness pass (2026-08-19, fourth)

`DECISIONS.md` §128–§133. The objective was to stop treating "deferred" as an
answer and build everything that does not genuinely need a provider, a deploy,
or a business decision.

**Zero accessibility violations, across all 45 routes at both widths.** The
brand colour was darkened to `#8c5035` after two proposed values were measured
and rejected — the exemption in `e2e/accessibility.spec.ts` is gone entirely.
Two further defects surfaced only because the sweep ran wider than the spec:
`text-warn` used as body text at 2.49:1, and another redundant `opacity-60`.

**Generation is daily.** The promise every screen made is now kept, and it is
safe because `settings.generation_enabled` was already honoured by the handler.
`collect_attribution` is scheduled too — it no-ops without credentials.

**The daily digest exists.** It was a declared job kind, a cron task and two
settings columns with no handler. It reports what an operator would act on,
stays silent on a quiet day, and records itself as a notification when no email
provider is configured.

**Custom pronunciation works end to end.** `/settings/pronunciation` is the
surface `voice_lexicon` never had — and building it exposed a unique constraint
that did not constrain: `unique (product_id, term)` cannot prevent duplicate
*global* terms, because Postgres treats NULLs as distinct. Migration 0036.

**Retention has a mechanism and still no number.** `settings.log_retention_days`
defaults to null, which means keep everything; a `purge_logs` job applies
whatever is chosen. `audit_log` is never purged by it. Sentry is external.

**Series and the newsletter were decided, not deferred.** Series is superseded
by campaigns and the screen now says so. The newsletter is coherently dormant,
and the drafter no longer produces issues for zero subscribers.

Visual baselines were recaptured from a **production build**; regenerating from
a dev server is now refused outright.

Suite: **1556 unit passing, 0 failing**; **118 E2E passing, 8 skipped**;
typecheck, lint, build, SQL clean. Migrations 0036 and 0037 added.

---

### Internal completion pass (2026-08-19, third)

Seven slices, `DECISIONS.md` §119–§127.

**§95 resolved, and a real hole under it.** `runAllGates` accepted `visual`,
`audio` and `coherence` inputs no caller could ever supply — it runs at copy
time, before media exists. The inputs are gone; the gate *entries* stay, because
`review_media` and `tts` merge their verdicts into that same array. Chasing that
merge found the hole: `tts` wrote its verdict to `qc_results.audio`, which the
queue does not render and which `review_media` later overwrote wholesale, so **a
failed voiceover blocked nothing and was shown to nobody**. It now merges into
`gates` and counts.

**§78 answered rather than deferred.** The retry double-spend was an ordering
bug, not a missing cache: `generateSample` spent a RecipeFix credit before the
idea was marked `selected`, so a second attempt bought the same adaptation
again. The idea is now claimed first, and the claim is never released — a
timed-out adapt does not prove nothing was spent. The artifact cache is proven
unnecessary for correctness and stays unwired.

**Notifications were the one error column nobody scrubbed**, while Meta puts
access tokens in query strings. Scrubbed at the `notify()` boundary.

**A purge capability without a policy.** `purge_operational_logs(interval)` takes
its window as an argument, is called by nothing, never touches `audit_log`, and
refuses to delete live jobs or unread notifications.

**The scope audit covered one Meta product out of two** — Threads' four scopes
had no coverage at all. All four have call sites; now pinned.

**RECOMMEND: no gap.** The layer P3 describes already exists as
`proposeFromSignals → scoreIdeas → selectIdeas`. Nothing built.

**Visual baselines exist and are not approved.** Six images, three static pages,
opt-in, and the suite *throws* on a missing baseline rather than writing one and
reporting a pass. `docs/VISUAL_BASELINES.md` lists three reasons they are not yet
trustworthy.

Suite: **1539 unit passing, 0 failing**; **114 E2E passing, 8 skipped** (2
pre-existing, 6 opt-in visual); typecheck, lint, build clean. Migrations 0035
added.

---

### Internal finish pass (2026-08-19, later)

Continuing past the readiness pass, on everything buildable without a provider.
`DECISIONS.md` §112–§118.

**Accessibility and visual QA, measured rather than assumed.** 45 routes
rendered at 1440px and 390px with axe. Found and fixed: three colour tokens that
were never declared (`text-bad`, `bg-accent`, `bg-paper` — the second on the
"Post it now" publish button, where an undefined background under `text-white`
is an invisible label); wide tables that scrolled with a mouse and were
unreachable by keyboard; `/submissions` selects with no accessible name;
`/signin` with no `main` landmark; `/agents/runs` scrolling sideways on a phone.
Contrast violations went 846 → 231 (desktop) and 614 → 119 (phone) by darkening
three tokens to the smallest value that clears AA.

**Every remaining contrast failure is one decision** — see "Needs a human".

**The rejection loop now closes.** `rejection_clusters` had a complete consumer
and no producer, and `content_rules.operator_rules` had a producer and no
consumer. Both ends built: a daily `cluster_rejections` job, and accepted rules
merged into the copywriter's DO NOT list. Deterministic — no model, no credits.

**The newsletter opt-out works.** It was a 404 carrying the newsletter id rather
than a subscriber token. Per-subscriber tokens, a `/u/[token]` route answering
both GET and RFC 8058 one-click POST, and per-recipient sending. **Sending
remains dormant** — no schedule, nothing enqueues it, refuses without
credentials.

**Auto Clip stays blocked** (nothing ingests long-form footage — a product
decision) but is no longer untested: 16 fixture tests over the deterministic
half.

New guards: `designTokens.test.ts` (undefined colour tokens),
`e2e/accessibility.spec.ts` (13 routes × 2 widths), `e2e/unsubscribe.spec.ts`.
All tamper-verified. §118 records a scanner that silently stopped working when
narrowed, and was caught only by repeating the tamper.

Suite: **1516 unit passing, 0 failing**; **114 E2E passing, 2 skipped**;
typecheck, lint, build clean. Migrations 0033 and 0034 added.

---

### Product / UI / deployment readiness pass (2026-08-19)

A pass over the product as an operator meets it, rather than over the code. Three
findings, all of the kind whose symptom is a green result — `DECISIONS.md`
§109–§111:

- **The Daily Take showed a link block as a story summary.** Found in a
  screenshot; every layer was behaving correctly. Discarded in the RSS parser.
- **Every published link pointed at localhost.** `HALYARD_PUBLIC_URL` was read
  once and defined nowhere, and no QC gate reads `link_url`. Generation now
  fails in production rather than attaching a dead link; the variable is defined
  in `.env.example`.
- **The container healthcheck could not fail.** `node -e "process.exit(0)"`
  under a comment claiming it reflected the heartbeat. It now reads a liveness
  file the poller touches after its database write.

Also checked and clean: no TODO/FIXME anywhere in shipped source, no placeholder
copy, `console.log` only in the worker's structured JSON logger, and no other
localhost reference on a production path (`publicOrigin` already returns null by
design). The floating circle overlapping the last sidebar item in screenshots is
the **Next.js dev indicator**, which does not render in a production build.

Current suite: **1458 unit passing, 24 skipped, 0 failing**; typecheck, lint and
build all clean. `renderVideo.test.ts` performs a **real Remotion render** (17.8s)
and `verifyFeature.test.ts` drives a **real browser**, so the media and replay
paths are exercised rather than asserted.

The suite is green locally. Two things worth knowing:

- The `SET ROLE` RLS probe **skips** against Supabase local, whose `postgres` role has `CREATEROLE` but may not `SET ROLE` into a role it creates. It fails rather than skips wherever it can run, and the same invariant is asserted from the catalog by a test that runs everywhere — which itself could not fail for the right reason until today. `DECISIONS.md` §76.
- `renderVideo.test.ts` does a real Remotion render taking 15–20s against a 30s timeout, so it fails under heavy CPU contention (two suites at once) and passes on an idle machine.

## 2026-08-30 — the first end-to-end wizard run, and what it found

The Make wizard was driven in a real browser for the first time
(`scripts/browser/make-wizard.mjs`). It works: the tree narrows correctly, the
payload is right, the overrides travel, and `job_events` feeds the live run
page. Five defects surfaced, all invisible to a green suite of 2,618:

1. The quiz template diagrams were **invisible in the default state** — drawn
   only for the selected choice, and the default choice is `auto`, which has
   none. Fixed: all five shown as a gallery.
2. `citationCheck` re-read the same page up to **eight times per run** and blew
   the handler's 300s budget. Fixed with a per-run source cache.
3. A **PDF** answered 200, yielded no text, and was reported as *"the source
   does not mention this claim"* — false. New `unreadable` verdict.
4. **The citation comparison itself was wrong.** Research verifies a fact
   against its page; the writer paraphrases it into a quiz question; the gate
   then term-matched the *question* against the page and refused good work. A
   slot citing a researched URL is now judged against the researched fact.
5. A generate run that produced nothing **returned silently**. Now names which
   of the two very different causes it was.

### Blocked

**Both model providers are out of credits.** Anthropic returns
`credit balance is too low`; OpenAI returns `429 no credits remaining`. Nothing
generates — no copy, no gpt-image-1 background, no piece. The full visual test
(background → template → questions → voice → render) is written and waiting on
a topped-up key.

### Local database was several migrations behind

`scripts/db-catchup.ts` applies migrations to a database with no ledger, one
file at a time, treating "already exists" as already applied. It brought this
machine forward 39 migrations, including `job_events`, `capture_credentials`
and the Quiz/Walkthrough/Narrative template rows — without which the quiz
composition cannot render at all.

## 2026-08-30 (overnight) — the UI redone, and eight subsystems wired to it

### The navigation

Seven sections, each holding its own tools as tabs (§361). No "More": §172's
collapsed list had grown back to twenty-one links, and three of the seven
primary destinations — Make, Create, Co-pilot — were one job. Every route is
unchanged and the frozen baseline test still passes. `sectionFor` resolves a
drill-down to its parent, so `/settings/readiness` highlights Setup rather than
Home.

### Screens that could not be read

| Screen | Was | Now | What was wrong |
|---|---|---|---|
| Review (queue) | 25,000px | 4,519px | A full card per item; triage and inspection are different jobs |
| Accounts | 8,084px | 3,184px | Reference material inline, a card per unconnected platform, a breakdown open on accounts that never worked |

Neither lost anything. `/queue/[id]` already rendered the full card in 587 lines
nobody had a reason to visit; `/accounts/platforms` holds the capability matrix.

### Backend that had no window

A sweep found seventeen tables the web app never reads. Four were live:

- **Sound** (§363) — every bed is a test fixture, so every video comes out
  silent, and that appeared nowhere but a worker log.
- **Learned** (§364) — `learned_insights`, `strategy_decisions` and
  `account_intelligence`, all steering what gets made, none with a screen.
- **`failed_because`** (§362) — written by `generate.ts` since forever, read by
  nothing. Every failed piece showed a red badge and no reason.
- **`reject_reason`** — used to train the voice, never shown to the person who
  wrote it.

### Features

- §365 `whatNeedsMe` — Home answers one question instead of presenting nine
- §366 a batch of eleven concepts all scoring 4.50 is a tie, not a ranking
- §367 run events carry their stage, so the run view is agent lanes
- §369 `explainPiece` — why a piece came out this way, collected not narrated
- §370 the caption is written *after* the piece, and is given it
- §371 `honour()` — directors read the screenplay and disagree out loud
- §372 `stagePiece` — screenplays are produced during generation and persisted
- §373 named adjustments — an operator says which part to rebuild
- §374 gate names are a list, so their column can be checked

### Still blocked

**Both model providers are out of credits.** Anthropic returns *credit balance
is too low*; OpenAI returns *429 no credits remaining*. Nothing generates. Every
change above is verified by test, by typecheck, and by rendering the real UI
against real data — none of it by a live generation.

### Standing risks, updated

- `generate.ts` is 3,135 lines. §372 went into its own module rather than into
  it, which is the pattern the rest of the decomposition should follow.
- `videoForFormat` still builds from slots rather than from screenplay scenes.
  That is the last hop of the screenplay work and a real change to the
  composition builders.

### The suite was lying — 445 tests were dark (§379)

`pnpm test` reported **2,706 passing, 453 skipped** and had for a day. The 453
were every database-backed test in the repository, and they were not skipped for
want of a database: migrations 0061 and 0063 insert templates referencing
`product_id = 'recipefix'`, a migration runs before `seed.sql`, so a clean
database has no products and the insert fails on the foreign key.
`createIsolatedPool` replays every migration into a fresh database, so it threw,
so every suite guarded on `databaseAvailable()` skipped. **A skipped test
reports green.**

Worse: those three rows were already in `seed.sql`. The migrations were
duplicating the seed and failing on a clean database in order to do it.

Now **3,162 passing, nothing skipped**, and two real defects were waiting inside:
`capture_audit` and `job_events` had shipped without row-level security, which
`schema.test.ts` had been asserting since the beginning.

`migrationsApply.test.ts` is the guard. The distinction is the whole point: a
suite that cannot build its database *skips*; a test that asserts the database
can be built *fails*.

### Three sweeps for the recurring bug

The pattern this codebase keeps producing is *declared, typed, tested, never
executed*. Three mechanical sweeps found six more:

| Sweep | Found |
|---|---|
| Job payload keys with no reader | Regenerate targeted nothing (§375); `campaignId` and `requestedBy` redundant |
| Core functions with no caller | §300's quiz checks never ran (§376); `opinionPreserved` never ran (§377); `rankStories` never ran (§378) |
| Columns no source mentions | The caption overflow was discarded despite a comment promising otherwise (§380) |

`payloadCoverage.test.ts` makes the first permanent. Its own first version read
only the worker and would have missed the bug it was written for — the web app
enqueues with raw SQL — which is worth remembering: a guard covering the half of
the system where the fault is not is worse than none, because it reads as
coverage.

### Deployment state

- **Production schema is current.** Migrations 0067–0070 applied: `job_events.stage`,
  `content_items.screenplay`, `takes.opinion_*`, and RLS on the two tables that
  lacked it. All additive; `job_events` verified still readable afterwards.
- **The worker deploy was uploaded** and the schema is ahead of it, which is the
  safe direction.
- **The web app is NOT deployed with tonight's work.** `vercel --prod` returns
  `Not authorized` — the CLI session needs re-authorising, and that cannot be
  done non-interactively. Everything is on `main`; one `vercel --prod` publishes
  it.



## Where we are now — direction and length

`docs/DIRECTION_SPEC.md` is the plan of record for the creative path. **W1-W10
and W12 are built and live; W11 remains.** Every item below was verified by
driving the studio in a browser and reading the worker log, not only by tests.

**Length is now decided rather than discovered (§438-§440).** `targetSeconds`
was inert *and* unreachable — `quiz` declared 30 seconds out of slot ceilings
implying 82. The platform owns a band (TikTok 32s/55s ceiling, Shorts 48/90,
Reels 26/45), the format owns a pace, and the budget inverts into a word count
that reaches the writer before it writes. Where the words will not fit the
structure flexes. Live: a TikTok quiz cuts to three questions at 33s; the same
catalogue's YouTube tips keeps five at 47s. Same system, genuinely different
pieces. `retention.length_band` catches what still ships long, and the Editor —
the first agent here that removes anything — cuts structure, never prose.

**The screenplay directs the render (§441, §446).** §132's fix. `Scene.slotKey`
joins a scene to its beat exactly, so `move`, `weight`, `seconds` and `ground`
reach frames for the first time. Verified live: *"screenplay directs the render,
myth_fact, scenes 4 of 4, moves hold/settle/push_in"*. The screenplay is a
director that **can be absent** — an undirected beat renders as before, which is
what made this safe on the only path that works.

**Three stale platform caps corrected (§438), and dated so it cannot recur
(§442).** Reels 90s → 180s in two places, Shorts 60 → 180. `youtube.ts` had
already fixed its own copy and the other two kept the old one, while
`gates.test.ts` asserted the stale refusal was *correct* — a green suite proving
nothing. `VERIFIED_CONSTANTS` now dates every fact about somebody else's product
and fails after a year.

**Also:** the hook audition became one (§443) — every variant scored 0.5 with no
published data, so the strongest hook won by luck; the account now has a look
(§444) — five recency mechanisms that could not see each other; and what each
platform counts finally reaches the writing (§445) — `PLATFORM_STRATEGIES` had
been read by one page that displays it.

### Found by running it, not by reading it

Both of these were invisible to types, tests and docs, and both surfaced within
minutes of driving the UI:

- **A screenplay that turned every picture off.** The first live §441 run
  returned `ground: 'colour'` on all four scenes and rendered zero photographs —
  a slide deck, which is what §407 fixed. Unanimous flat ground is now read as
  the screenplay declining to choose.
- **A connector outage stopping the formats that exist to survive one (§447).**
  `generateSample` ran whenever a connector existed, so a RecipeFix edge-function
  failure blocked `tips`, `history`, `quiz` and `myth_fact` — all of which
  declare `needsArtifact: false` *precisely because they can be made on a day
  when nothing was adapted*. It also returned silently: a critical notification
  went to the operator while the job log read "briefed idea written" then "job
  done".

### A second pass, as a social team reading its own output

Everything above was structural. This pass looked at what the system actually
*produced* and found four things a person would catch on sight.

- **§448 — the thumbnail nobody had looked at.** `first_frame_words` reported
  `unmeasured` on every video ever made here, the reason recorded as "no OCR".
  No OCR is needed: the words on frame one are the first beat's text, sitting in
  `renders.input_props` the whole time. Our openings measured 5 to 9 words
  against a bar of 4-7. Now briefed, checked at draft time, and audited after —
  the constraint reaches the writer first, which is where it is worth most.
- **§449 — a good piece binned over its wrapper.** A `history` filled all five
  slots with zero warnings, researched and sourced, and was discarded because
  its caption failed the copy gate three times. `repairDraft` has fixed
  punctuation deterministically for format slots since §290; the caption path,
  the one that loses whole pieces, never got it.
- **§450 — the caption was a transcript.** 88.9% of one caption's distinctive
  words were also on screen. The screenwriter has enforced this rule between
  spoken and on-screen since §335; nothing applied it one level up. The
  instruction that did exist said *"do not restate the first line"* — and the
  writer obeyed it exactly, restating all the others.
- **§451 — the director was staging blind.** The screenwriter was told its
  channel and not its platform, so it staged for an average of TikTok, Reels and
  Shorts on a generic 15-45s clock while the writer wrote to a 40s budget.

Two things were **checked and deliberately not built**, which is the more useful
half of a review: a `not_loop_ready` gate (it would warn on every piece, and a
gate that fires on everything is not information — the composition is the fix),
and hook-craft scoring on the opening slot (it flags exactly what §448 already
flags).

### What is left

- **W11** — fold `creative-director`, `story-architect` and `concept-generator`
  into the screenwriter. Registry hygiene; changes nothing a viewer sees.
- The RecipeFix connector's `adapt_recipe` edge function is returning non-2xx,
  so `transformation` and `recipe` cannot be made until that is fixed. External.
  Every other format is unaffected since §447.
- Two agents blocked outside the code: the Sound Designer on procurement, the
  Thumbnail Director on a YouTube OAuth scope. Both statuses are honest.
- Nothing loops yet. §451 asks the screenwriter for it; whether it obeys is
  worth watching on the next few pieces.

**Suite:** 3,049 passing, 467 skipped. Lint clean.
