# The generation wizard — full spec

**Written 2026-08-30.** This is the scoping document. Building the UI is what
forces the option space to be complete, so this is written *before* any screen
and covers **what we want**, not only what exists. Anything not built yet is
marked — those marks are the build list.

The visual design is out of scope. This is the flow, the options, and what each
choice does.

---

## Why the UI comes before short-form polish

Three reasons, and they are the operator's:

1. **It forces the scope.** Every option a person can choose has to be named,
   which surfaces the gaps — formats we want and do not have, templates that
   exist and cannot be selected, questions nobody is asked.
2. **It is how generation gets tested.** Testing through scripts tests what I
   remember to test. Testing through the wizard tests what a person would do.
3. **It makes the agents visible.** Watching the run is how we see which agent
   did what, at which step, and whether the decision was right — which is the
   review loop this whole system is missing.

---

## The flow

    1  Where          platforms, multi-select
    2  What kind      post types every chosen platform can carry
    3  Together?      one piece for all, or diverge per platform
    4  Shape          the format
    5  Specifics      questions that depend on the format
    6  Generate       live agent theatre
    7  Review         watch it, comment, adjust
    8  Decide         schedule · publish · redo · discard

Each step narrows the next. A step with one possible answer is skipped and
shown as already decided, because a question with one answer is not a question.

---

## Step 1 · Where

Multi-select. Every platform with a connected account.

| Platform | State shown | Why it matters |
|---|---|---|
| TikTok | live / draft only / reconnect / not set up | `capability_state` is not connection — an account can read `live` with no credential (gotcha 5) |
| Instagram | ” | |
| YouTube | ” | |
| X | ” | Only platform with no review gate; the only one that can truly publish today |
| Threads | ” | |
| Pinterest | ” | |

**Not selectable** rather than hidden when unusable, with the reason on hover.
Hiding it makes an operator wonder where it went.

---

## Step 2 · What kind of post

Only post types **every** chosen platform can carry, derived by `canCarry` from
each adapter's own constraints — never a hand-written list.

| Post type | Have | Notes |
|---|---|---|
| Caption only | ✅ | X, Threads |
| Caption + link | ✅ | X, Threads. On X the link goes in the first reply — ~$0.015 vs ~$0.20 and no demotion |
| Image + caption | ✅ | X, Threads, Instagram, Pinterest |
| Carousel | ✅ | Instagram, Threads, **TikTok** |
| Carousel with video | ⚠️ declared, no renderer | A moving slide is its own render |
| Short video | ✅ | TikTok, Instagram, YouTube |
| Long video | ✅ | YouTube |
| Story | ⚠️ declared, no composition | Instagram |
| Reply | ⚠️ declared, no path | X, Threads — highest-leverage reach there is |
| Pin | ✅ | Pinterest |

**If a chosen platform excludes a type**, show it disabled with *which* platform
is the reason — "TikTok cannot carry a caption-only post" — so the operator can
drop that platform rather than guess.

---

## Step 3 · One piece, or several?

Only asked when more than one platform is chosen.

- **One piece for all** — one production, finished per platform (§352). Default.
- **Diverge** — a separate piece per platform. Costs N× and is occasionally
  right: a TikTok quiz and a YouTube explainer on the same subject are not the
  same piece.

Show the cost difference in the choice. An operator picking "diverge" should
see it is three renders and three voiceovers.

---

## Step 4 · Shape

Formats the post type can carry, from `POST_FORMAT_CATALOG`.

### Have

| Format | Post types | What it is |
|---|---|---|
| Quiz | short video | Questions → countdown → reveal |
| History | short video, text, long video | One surprising true thing, told with a turn |
| Tips | short video, text, carousel | A numbered list |
| Myth / fact | short video, text, carousel | A belief, corrected |
| Origin | short video, long video | Where a thing came from |
| Transformation | short video, text, carousel | The product doing its job |
| Full recipe | carousel | The thing people came for |
| Comparison | text, carousel | Two options, a verdict |
| Walkthrough | short video | A recording of the product being used |
| Poll | story | A question with two answers |
| Behind | story | A look at the making |

### Want, not built

| Format | Post type | Why it is worth having |
|---|---|---|
| **Before / after** | short video, carousel | The single strongest visual proof shape. Distinct from transformation: no product needed, works for any change over time |
| **Mistake** | short video, text | "I did this wrong for years." Highest-engagement opening in the category |
| **Ranked list** | short video, carousel | "Every X, ranked." Invites disagreement, which is reach |
| **Explainer** | short video, long video | One mechanism, properly explained. The format that builds authority |
| **Reaction** | reply, text | A response to something live. Needs the reply channel |
| **Question to audience** | text, story | Asked to be answered. The cheapest engagement there is |
| **Case study** | long video, carousel | One person, one problem, one result. Needs real permission |
| **Series episode** | short video | Numbered, recurring, with a fixed opening. Makes an account followable |

---

## Step 5 · Specifics

Depends on the format. **Buttons, not free text**, wherever the answer is finite
— an operator choosing from four options cannot ask for something that does not
exist, and the system never guesses what they meant.

### Every format

- **Subject** — one line, optional. Empty means "pick from this week's signals".
- **Tone** — ⚠️ *want*: plain / playful / authoritative. Currently the visual
  director infers it.

### Quiz

- **How many questions** — 3 / 5. *(have: `repeats: 5`, not selectable)*
- **Question kind** — mixed / multiple choice / true-false / free-form
  *(have: §300 `planQuestion`, decided automatically, not selectable)*
- **Template** — auto / stack / rail / grid / spotlight / versus
  *(have: §302, chosen by fit and recency, not selectable)*
- **Difficulty curve** — easy→hard / mixed *(have: §300, not selectable)*

### Walkthrough

- **Which flow** — the recordable product flows *(have: `adapt_and_reveal`,
  `cook_mode_timer`; `swap_toggle` is a dependent, `sign_in` is plumbing)*
- **Speed** — ⚠️ *want*: how hard to compress the waiting
- **Point at** — ⚠️ *want*: which moments get a mark, or auto (§331)

### Tips / Ranked list

- **How many** — 3 / 5 / 7
- **Numbered or not** — ⚠️ *want*

### History / Origin / Explainer

- **Angle** — ⚠️ *want*: the surprise / the mechanism / the person
- **Era** — ⚠️ *want*, for history

### Carousel

- **How many slides** — 4 / 6 / 8 / 10 *(Instagram caps at 10, TikTok at 35)*
- **All images or mixed** — *(mixed is declared, not built)*

### Every video format

- **Voice** — on / off *(have; a caption-led silent cut is a real style)*
- **Music** — on / off / which mood *(have: 7 CC0 beds, one per mood)*
- **Captions burned in** — on / off *(have)*

---

## Step 6 · Generate — the agent theatre

A live view over a websocket. **Not a progress bar.** The point is to see *which
agent is working, on what, and what it decided* — because that is the review
loop the system needs and does not have.

### What it shows

Each agent as a card, in pipeline order, in its team lane:

    RESEARCH        ● Researcher            checking 6 sources… 4 kept, 2 rejected
    WRITE           ○ Format Writer
    STAGE           ○ Screenwriter
    LOOK            ○ Visual Director · Typographer · Photographic Subject
    SOUND           ○ Voice Director · Music Director
    MAKE            ○ Renderer
    CHECK           ○ Critic · Media Integrity

- **Waiting** — outlined
- **Working** — highlighted, with what it is doing in its own words
- **Done** — its decision and *why*, in one line, kept visible
- **Refused** — the reason, and what happens next

The decisions are already written: every director returns a `reason` or a
`because`. This surfaces what is currently only in the log.

### What it needs that does not exist

- ⚠️ **An agent event stream.** `agent_runs` records a row *after* the fact.
  Nothing emits progress *during*.
- ⚠️ **A websocket.** Nothing in the web app holds one.
- ⚠️ **A run id** an operator can watch and come back to.

---

## Step 7 · Review

The piece plays. Under it:

- **What it is** — format, platform(s), length, cost to make
- **The screenplay** — the script as a person reads it (`printScreenplay`),
  because reviewing the *plan* is far cheaper than re-rendering the piece
- **What the critic said** — findings with the frames they cite
- **What was refused** — anything a gate stopped, with its reason

### Giving feedback

Two ways, both wanted:

1. **Adjustment buttons** — ⚠️ *want*: "slower opening", "different picture",
   "shorter", "more contrast", "change the hook". Each maps to a correction the
   system can already make (`correction/policy.ts`).
2. **Free text** — ⚠️ *want*: typed, and read for *actionable points* rather
   than pasted into a prompt. "The music is too loud and the second question is
   boring" is two corrections, one of which is a re-write and one a mix change.

Both produce the same thing: a list of corrections with a component and an
action, which `correct.ts` already knows how to run.

---

## Step 8 · Decide

- **Schedule** — a time, or "next good slot" from the scheduler
- **Publish now** — with the confirmation the platform requires
- **Redo** — regenerate with the feedback applied
- **Discard** — with a reason, because a discarded piece is a signal

---

## Build order

1. **Steps 1–5** — pure derivation, everything needed exists. This is the
   scoping win: the option space becomes real and the gaps become visible.
2. **Step 8** — scheduling and publishing already work; the screens do not.
3. **Step 7** — review without the feedback loop first: play it, show the
   screenplay, show the critic.
4. **Step 6** — the agent theatre. Needs the event stream and the websocket,
   which is the largest genuinely new piece of work here.
5. **Feedback → corrections** — the loop that makes review worth doing.

---

## What this document is for

When a screen is built, it is checked against this. When a gap here is closed,
this is updated. It is the list of everything an operator can ask for, and
therefore the list of everything the backend has to answer.
