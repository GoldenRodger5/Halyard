# Which transport, per platform

Decided 11 August 2026, after the capability probe ran against real accounts.

**Recommendation in one line: unified for TikTok, Instagram and Pinterest;
direct for X, Threads and Bluesky; YouTube unified only until its own audit
lands.**

Nothing here is "unified because it works today". Two platforms are deliberately
kept on the harder path.

---

## First, a correction to my own framing

I told you the unified transport "loses alt text on four platforms". That
overstates it. Checking which direct adapters actually send alt text:

| Platform | Direct sends alt text | Unified has an `altText` field | Real loss? |
|---|---|---|---|
| X | yes | no | **yes** |
| Threads | yes | no | **yes** |
| Instagram | yes | yes (1,000 chars) | no |
| Pinterest | yes | yes (500 chars) | no |
| Bluesky | yes | not connected | n/a |
| YouTube | **no** | no | no |
| TikTok | **no** | no | no |

YouTube and TikTok are video. Their accessibility mechanism is captions, which
Halyard already burns in and which the transport does not touch. There is no alt
text to lose there, so counting them was wrong.

So the alt-text cost is real on exactly **two** platforms, and one of those (X)
is staying direct for an unrelated and stronger reason. That leaves **Threads**
as the only platform where alt text alone decides it.

Your framing was right — it is a requirement, not a footnote. It just points at a
narrower target than I first said.

---

## Platform by platform

### TikTok → **unified**

| | Direct | Unified |
|---|---|---|
| Gate | Content Posting API audit | none, their app is audited |
| Wait | Weeks, and assume rejection for an internal tool | zero |
| Unreviewed | `SELF_ONLY`, account must be private | — |
| Alt text | not sent either way | not sent either way |
| Verified | never attempted | **posted publicly, confirmed in the app** |

The clearest case in the list. TikTok's audit is the one gate in this system
that a single-operator internal tool should expect to fail — it is designed for
products with a user base, and Halyard has one user. Direct means `SELF_ONLY`
forever, which is not a slow path to public posting, it is a different outcome.

We now have the opposite evidence for unified: a real post, publicly visible, no
padlock. That is the only claim the whole provider recommendation rested on, and
it is settled.

Halyard still uploads TikTok **as drafts** by default, and that has not changed:
no API of any kind can attach trending commercial audio, which is most of TikTok
distribution. The difference is that draft-first is now a choice rather than a
constraint, and you can turn it off knowing public posting works.

### Instagram → **unified**, but test direct first

| | Direct | Unified |
|---|---|---|
| Gate | Meta App Review, `instagram_content_publish` | none |
| Wait | 2–4 weeks per submission, repeatable on rejection | zero |
| Unreviewed | up to 25 test users, and only accounts you own | full |
| Alt text | yes | **yes, 1,000 chars** |
| Extras | — | `firstComment`, `collaborators`, `coverImageUrl` |

Instagram is where my earlier reasoning was worst. I argued for direct because
the unified transport "could not report saves". It reports saves. With alt text
also present on both, the honest comparison is: identical capability, minus 2–4
weeks of review, plus a first-comment field the direct adapter does not have.

The one thing still worth testing is whether **Standard Access already covers
your own account** — if it does, direct works today with no review at all, and
fewer intermediaries fail in fewer ways.

    pnpm first-contact --dry-run --platform=instagram
    pnpm first-contact --publish --platform=instagram

If that publishes, keep Instagram direct. If it returns the permissions error,
switch to unified and stop thinking about it. Do not submit for App Review
purely to reach a capability you already have.

### Pinterest → **unified**

| | Direct | Unified |
|---|---|---|
| Gate | Trial → Standard, needs a video demo | none |
| Wait | 1–4 weeks | zero |
| Unreviewed | sandbox pins, visible only to you | full |
| Alt text | yes | **yes, 500 chars** |

Alt text survives, so the argument reduces to the review. Pinterest's is the
mildest of the five and you would probably pass it, but you would be spending a
video demo and a fortnight to reach a capability that already works.

Pinterest matters more than its follower count suggests here — it is a search
index, pins keep working for months, and it is the one platform where a recipe
adaptation has a long tail. Getting it live now is worth more than getting it
live purely.

**Alt text on Pinterest is also a ranking input, not only an accessibility one.**
Both transports carry it, so this is an argument for making sure `alt_text` is
actually populated, not for choosing a transport.

### Threads → **direct**

| | Direct | Unified |
|---|---|---|
| Gate | Meta App Review | none |
| Wait | 2–4 weeks | zero |
| Alt text | **yes** | **no field at all** |
| Extras | — | `replyControl`, `additionalPosts` for threads |

The one platform where alt text decides it, and it decides it against the
convenient answer.

Threads is image-and-text. An image posted without alt text is inaccessible to
anyone using a screen reader, permanently, and there is no way to add it
afterwards through the API. Halyard generates alt text for every image already —
the copywriter produces it and the visual gate checks it — so routing Threads
through the unified transport means generating alt text and then discarding it,
which is worse than not having it.

Threads also shares the Meta app with Instagram. If you submit App Review for
Instagram you get Threads in the same submission, so the marginal cost of direct
here is close to zero once Instagram is decided.

**Interim:** leave Threads unconnected rather than routing it through unified.
Publishing nothing is better than publishing something inaccessible, and Threads
is the lowest-volume platform in the mix.

### YouTube → **unified**, provisionally

| | Direct | Unified |
|---|---|---|
| Gate | compliance audit | none |
| Wait | 2–6 weeks, no guaranteed timeline | zero |
| Unreviewed | **uploads forced private** | full |
| Alt text | not applicable to video | not applicable |
| Extras | resumable chunked upload, playlists | `thumbnailUrl`, `playlistIds` |

No alt-text cost, because video does not have alt text. So this is purely about
the audit, and YouTube's is the least predictable of the five: no committed
timeline, and unreviewed uploads are forced private, which means direct produces
nothing publicly visible until it passes.

Unified now, and it is worth submitting the audit anyway in the background — the
direct adapter does resumable chunked upload, which matters for long video, and
nothing about using unified today blocks switching later.

### X → **direct, permanently**

Not a judgement call. The unified provider has **no reply endpoint**, so
link-in-first-reply is impossible, and putting the link in the body costs $0.20
against $0.015 — thirteen times more, on every post, on the platform Halyard
posts to most. The adapter refuses rather than degrading.

X also has no review gate at all, so direct costs nothing but the developer app
you already need.

### Bluesky → **direct**

No gate, no cost, an app password. It is not connected in Blotato and does not
need to be.

---

## The resulting defaults

| Platform | Default | Why, in one line |
|---|---|---|
| TikTok | unified | The audit is the one you should expect to fail; unified is verified public |
| Instagram | unified *(test direct first)* | Identical capability, minus a fortnight of review |
| Pinterest | unified | Alt text survives; the review buys nothing you do not already have |
| YouTube | unified | No alt-text cost, and the least predictable audit of the five |
| Threads | **direct** | The only platform where alt text is genuinely lost, and it is free with Instagram's submission |
| X | **direct** | No reply endpoint, and $0.20 against $0.015 |
| Bluesky | direct | No gate to avoid |

Four unified, three direct. If everything had come out unified, that would have
been the signal to re-check the reasoning rather than the answer.

## What would change this

- **Instagram direct works on Standard Access.** Switch Instagram to direct;
  Threads comes with it.
- **Blotato adds `altText` to the Threads target.** Threads becomes unified
  immediately; it is the only thing holding it back.
- **A platform's probe result changes.** `pnpm verify-provider` overwrites the
  capability row, and `/accounts` refuses any platform that comes back unknown.
- **Volume grows past 20 accounts, or a second product.** The flat $29 stops
  being flat and the comparison reopens.
