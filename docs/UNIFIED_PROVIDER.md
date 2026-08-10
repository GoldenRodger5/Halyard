# Choosing a unified publishing provider

Milestone 49. Researched 10 August 2026.

**Recommendation: Blotato, $29/month.** Sign up, connect the accounts, paste the
API key into `BLOTATO_API_KEY`. Keep X and Bluesky on the direct adapters.

The rest of this document is why, and — more usefully — the two things the
milestone's framing got wrong.

---

## The finding that decides it

The providers split into two categories, and only one of them solves the problem.

**Category A — the provider's own approved app.** You connect your accounts
through *their* OAuth. Their app has already passed Meta App Review and TikTok's
Content Posting audit, so those approvals are simply not your problem.
**Ayrshare** and **Blotato** work this way.

**Category B — bring your own credentials.** The provider gives you one clean API
across many platforms, but you still register your own developer app on each
platform and you still submit your own reviews. **Post for Me**, **Postiz**,
**PostPeer** and **Mixpost** work this way.

Category B providers solve a problem Halyard does not have. Seven working
adapters already exist here; the thing standing between them and publishing is
five manual reviews measured in weeks. A Category B provider leaves every one of
those reviews exactly where it was, in exchange for a monthly fee and a layer of
indirection.

Post for Me's own TikTok documentation is explicit about it: *"After the App is
approved there is an additional Audit needed for Direct Post on TikTok's
platform"*, and before that audit passes, `privacy_level` is forced to
`SELF_ONLY` regardless of what you send. That is precisely the constraint the
existing TikTok adapter already handles.

So the cheapest option, Post for Me at $10/month, delivers none of the value.

## The second correction: nobody is "pre-audited" for TikTok in the way the brief implies

The milestone asks to check "whether TikTok is genuinely pre-audited". The answer
has two halves:

- For **Category B** providers, no. Direct public posting requires *your* audit.
  PostPeer's own writeup says the same of itself and of Ayrshare and Upload-Post:
  *"if your app needs to publish public videos directly, you have to pass
  TikTok's Content Posting audit yourself."*
- For **Category A** providers, the audit belongs to their app, so it does not
  apply to you — but this is the single claim I could not verify from a neutral
  source, because most of the comparative material online is written by the
  vendors about each other. **Confirm it on a trial before relying on it.**

And regardless of provider, Halyard keeps TikTok draft-first. No API of any kind
can attach trending commercial audio, and sound is a large share of TikTok
distribution. A video posted without it underperforms one you finish by hand in
the app, so the adapter uploads to drafts on purpose. That is a product decision,
not a limitation being worked around.

## The third correction: Buffer's free plan is three channels, not eleven

The brief says the free plan "includes one API key, 11 channels" and asks whether
channels are capped separately. They are, and much harder than that:

| Buffer plan | Channels | API |
|---|---|---|
| Free | **3** | 1 key, 3,000 requests/month |
| Essentials | $5 per channel | 3 keys, 7,500 requests/month |
| Team | $10 per channel | 5 keys, 15,000 requests/month |

Six channels on Essentials is **$30/month** — and Buffer bills per channel, so
every account added costs again. There is also a lifetime cap of 8 unique channel
connections on free, so it cannot even be grown into.

Buffer is not a bad product; it is the wrong shape. It prices the thing Halyard
has a lot of (channels) and gives away the thing Halyard barely uses (requests —
60 posts a month against a 7,500-request allowance).

## The comparison, at ~60 posts a month across 6 channels

| Provider | Category | Monthly | Coverage | Notes |
|---|---|---|---|---|
| **Blotato** | A — own app | **$29 flat, 20 accounts** | X, IG, FB, LinkedIn, TikTok, YouTube, Threads, Bluesky, Pinterest | REST API on paid plans, MCP server. Priced per account, not per post |
| Ayrshare | A — own app | Higher; enterprise-shaped | 13+ networks, the widest | The established option. Worth pricing directly if Blotato disappoints |
| Buffer | A — own app | $30 (6 × $5) | Broad | Per-channel pricing scales the wrong way |
| Post for Me | B — BYO | $10 / 1,000 posts | 9 platforms | Cheapest and solves nothing here |
| Postiz | B — BYO | $29 hosted, or self-host | Wide, incl. Mastodon | Open source. Self-hosting is another service to run |
| PostPeer | B — BYO | — | — | Honest documentation, same constraint |

At this volume the cost differences are noise — $29 against $30 against $10 is
not a decision. **What is being bought is approvals**, and only Category A sells
them.

## Why Blotato over Ayrshare

- **Flat $29 for 20 accounts** fits a multi-product system. Halyard is built for
  more than one product, and per-channel pricing turns a second product into a
  second bill.
- **Purpose-built for programmatic use.** A REST API and an MCP server rather
  than a scheduling UI with an API bolted on.
- **Ayrshare is the safer, more established choice** and worth switching to if
  Blotato's metrics reads turn out thin. That switch costs one config change —
  see below.

## What I could not verify, and what to check on day one

Stated plainly, because a guessed fact here costs weeks:

1. **That Blotato's TikTok connection genuinely posts publicly without your own
   audit.** Most of the supporting material is Blotato's own marketing.
2. **Read coverage.** Whether the provider returns impressions, saves and video
   retention per post, or only the shallow counts. This matters more than it
   sounds: conversion by category is the chart that decides strategy here, and
   `activated users` is already the metric that drives it.
3. **Carousel and Reels support** through the API specifically.
4. **Alt text.** Non-negotiable, and quietly missing from several of these.

`/settings/readiness` and `/analytics` are built to say what is missing rather
than render a zero, so a thin read surface degrades honestly instead of looking
like nobody engaged.

## What stays direct regardless

- **X.** No review gate, and the direct adapter already handles the two things
  that matter: the link in the first reply (a URL in the body costs $0.20 against
  $0.015) and per-call billing.
- **Bluesky.** No gate, no cost, an app password.
- **Instagram, if direct works.** Test it before defaulting to unified: Standard
  Access may already cover accounts you own, and the direct path returns richer
  fields and better metrics than any intermediary.

## How switching works

`social_accounts.transport` is `direct` or `unified`, per account, changed from
`/accounts` with no code change and no redeploy. The `UnifiedAdapter` implements
the same `PlatformAdapter` interface every direct adapter implements, so the
queue, the four gates, scheduling, idempotency and attribution are untouched.
Only the transport changes.

That is deliberate: this recommendation is made on incomplete information, so the
cost of it being wrong should be one dropdown.
