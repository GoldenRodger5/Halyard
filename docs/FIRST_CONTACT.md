# First contact

Seven platform adapters exist. **None has met a live API.** This document is the
map for the moment each one does — what was assumed, what turned out to be true,
and what differed.

The rule from milestone 46 is: do not debug seven adapters simultaneously. X has
no review gate and can be fully live today, so the whole chain gets proved there
once. Everything learned there is the debugging map for the other six.

---

## Status

| Step | State | Blocked on |
|---|---|---|
| Request shape verified by dry run | **done** | — |
| OAuth round trip, brand + founder | not started | `X_CLIENT_ID`, `X_CLIENT_SECRET` |
| One real post, link in first reply | not started | the above |
| `publications` row, permalink, idempotency | not started | the above |
| Real metrics | not started | the above |
| A comment in the inbox | not started | the above |
| A routed click in `link_clicks` | **provable now** | — (see below) |
| `/analytics` showing the post | not started | the above |

Two of these are already proved and need no credentials:

- **The request shape.** `pnpm first-contact` composes the exact post and the
  exact reply, prints both, and walks the whole adapter path against a recording
  fetch. It works with no token at all, deliberately — seeing what would be
  posted is what tells you whether the developer-portal forms are worth it.
- **The router.** `/r/[id]` was verified against four device classes with real
  user-agent strings; every click landed on the right URL and logged with its
  device class. See `e2e/router.spec.ts`.

## What to run

```bash
./scripts/doctor                    # prints the full X credential acquisition sequence
pnpm first-contact                  # dry run: the exact request, sent nowhere
pnpm first-contact --publish        # real, costs money, two confirmations
pnpm first-contact --verify         # walks the chain after a post
```

`--publish` is the only destructive command in this repository. It requires
typing the account handle and then the word `PUBLISH`, and it runs the *same*
`publishHandler` the worker runs — a separate code path here would prove nothing
about the code that actually publishes.

---

## What the dry run establishes

Run against the seeded RecipeFix item, 10 August 2026:

```
POST https://api.x.com/2/tweets
  {"text":"Your gluten-free loaf is gummy. The starch holds water that wheat
            would have released. Drop the oven 25 degrees and bake it twelve
            minutes longer."}

POST https://api.x.com/2/tweets
  {"text":"https://recipefix.app/adapt?utm_source=x&utm_medium=social&...",
   "reply":{"in_reply_to_tweet_id":"<id of the first>"}}
```

146 of 280 characters. Two writes, about $0.030 total.

The link is in the second post, not the first. A post containing a URL costs
$0.20 against $0.015 — thirteen times — and link posts are algorithmically
deprioritised anyway. That is `linkStrategy: 'first_reply'` in `X_CONSTRAINTS`,
and it is the single most expensive detail in the adapter to get wrong.

---

## Differences between the contract tests and reality

**Nothing to record here yet for X.** This section stays empty until first
contact rather than being filled with predictions — a guessed difference is
worse than an absent one, because it reads as evidence.

When it happens, record every one of these, however small:

- Field names that differ from the documentation
- Fields the response omits that the adapter assumed
- Error shapes: what a 401, 403 and 429 actually contain
- Whether `Retry-After` is present on a 429, and in what units
- Rate limits that bite before the documented ones
- Anything that succeeds with a different status code than expected
- How long each call actually takes

### Already learned from live contact this round

Not X, but real API contact worth carrying forward:

**recipefix.app (milestone 41).** Contract-testing a UI against imagined markup
produces flows that work on nothing. Three things only discovery could tell us:

- The adaptation takes **~26 seconds cold**, not the 60–75 the spec assumed, and
  under 10 on a repeat because RecipeFix caches upstream. Every timeout sized
  against the old figure was wrong; the connector's was dangerously wrong, at
  150s × 2 attempts against a 300s job budget.
- `/adapt` renders an **animated demo card** that already contains a `SWAPPED`
  row. A flow that waits for one straight after submitting matches the demo and
  reports a ten-second adaptation that never happened.
- RecipeFix ships **no `data-testid` anywhere**. Four attributes on their side
  would make the whole capture subsystem durable. It has exactly one good hook,
  `aria-label="Choose your swap"`, and the flows lean on it.

**App Store Connect (milestone 42).** Apple's campaign parameters were verified
rather than assumed: `pt` (provider token, static per developer account), `ct`
(campaign token, capped at 40 characters), `mt=8`. The JWT is ES256 and Node's
signature comes out DER-encoded while JWS wants raw `r||s` — skipping that
conversion produces a token Apple rejects with a completely unhelpful 401.

**recipefix.app share links (milestone 42).** A saved adaptation carries a
`share_token`, and `recipefix.app/recipe/<token>` renders it publicly with no
sign-in. Combined with an `apple-app-site-association` that wildcards every path,
that is why iOS goes to the web URL rather than the App Store: the installed app
opens it directly and nobody bounces through a store page for an app they have.

---

## Expected differences, from the research

Written before contact, so they can be scored afterwards. Each is a prediction,
not a finding.

| Prediction | Basis |
|---|---|
| Free-tier apps fail on the first publish with 403, not at token exchange | X developer docs; the most confusing failure available |
| `media/upload` returns `data.id` on v2, `media_id_string` on legacy | The adapter reads both |
| A 429 carries `Retry-After` in seconds | `platformFetch` parses it as such |
| `non_public_metrics` requires the post to be recent and owned | Reading your own post is $0.001; a third-party post is $0.005 |
| The reply's `in_reply_to_tweet_id` must be the first post's id, not the conversation id | X API v2 shape |

---

## After X: Instagram

Instagram is next because it is testable in dev mode without waiting for
approval — publishing works against your own account for up to 25 users with a
role on the app. Expect the differences to be larger there: it is a two-step
container flow, Meta cURLs the media itself so signed URLs fail, and the
container can sit in `IN_PROGRESS` for a long time.

`assertPublicUrl()` already refuses signed URLs before the request is sent,
because a container that never finishes is the hardest failure in that adapter to
diagnose.

## Other platforms

Milestone 49 added `--platform=<id>`, which runs the identical rehearsal against
any adapter:

    pnpm first-contact --dry-run --platform=instagram

X remains the default because it is the only platform with no review gate, so a
failure there is always the code. Elsewhere a failure may be the review not
having landed, which is why the self-test runs first — it separates a dead
credential from an unapproved one.

One platform has a specific reason to be tested this way. Instagram's Standard
Access may already cover accounts you own, and the direct adapter returns
**saves** while the unified transport does not. Saves are weighted two to three
times a like in scoring, so if a real post to your own account works, Instagram
should stay direct. `--verify --platform=instagram` checks that field by name.
