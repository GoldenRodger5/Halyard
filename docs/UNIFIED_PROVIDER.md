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

1. ~~That Blotato's TikTok connection genuinely posts publicly without your own
   audit.~~ **Settled on 11 August 2026: it does.** One real post through
   `pnpm verify-provider --publish --video <path>`, confirmed publicly visible in
   the TikTok app with no padlock and no "Only you" badge. The API alone could
   not answer it — a forced-private post also reports as `published` — so the
   capability row carries an operator observation rather than an inference.
2. ~~Read coverage.~~ **Settled: every scored metric is returned, saves
   included.** See above.
3. **Carousel and Reels support** through the API specifically. Multiple
   `mediaUrls` are accepted everywhere (max 20) and Instagram takes
   `mediaType: 'reel'`, but neither is confirmed until a post of that shape has
   gone out.
4. **Pinterest boards** are at `GET /v2/social/pinterest/boards?accountId=`,
   which is missing from the endpoint list on the publishing page. `pnpm
   pinterest-boards` syncs them, and a pin is routed to a board from its dietary
   signals at draft time.
5. ~~Alt text.~~ **Settled: Instagram and Pinterest only.** Costly on Threads,
   which is why Threads stays direct. Not costly on YouTube or TikTok, which
   never carried alt text on either transport.

`/settings/readiness` and `/analytics` are built to say what is missing rather
than render a zero, so a thin read surface degrades honestly instead of looking
like nobody engaged.

## What stays direct regardless

- **X.** No review gate, and the direct adapter already handles the two things
  that matter: the link in the first reply (a URL in the body costs $0.20 against
  $0.015) and per-call billing.
- **Bluesky.** No gate, no cost, an app password.
- **Anything that needs alt text.** Only Instagram and Pinterest can carry it
  through this transport. On X, Threads, YouTube and TikTok the field does not
  exist, so routing them through it drops alt text silently. This is the single
  strongest reason to stay direct, and it replaced the metrics argument, which
  turned out to be based on a misreading.

- **Instagram, if direct works.** Test it before defaulting to unified:

      pnpm first-contact --dry-run --platform=instagram
      pnpm first-contact --publish --platform=instagram
      pnpm first-contact --verify  --platform=instagram

  Standard Access may already cover accounts you own, and the direct path
  returns richer per-post fields. Note that the original reason given here —
  that the unified transport could not report saves — was wrong; it can. The
  remaining reasons are alt text, which Instagram *does* have on both
  transports, and the general one that fewer intermediaries fail in fewer ways.

## What is built, and what it refuses to do

The transport exists in code and is wired end to end. It is also, right now,
**refusing to publish anything**, and that is the correct state.

`provider_capabilities` holds one row per provider: what was observed, per
platform, and when. Every field starts `unknown`. `canPublish()` treats `unknown`
as a refusal rather than a default-yes, so an account cannot be switched to the
unified transport, and a job cannot be carried by it, until a probe has watched
that platform work against a real account.

    pnpm verify-provider              read-only; lists connected accounts and
                                      their provider ids
    pnpm verify-provider --publish    posts real content to real accounts

The probe runs TikTok **first and alone**, because that is the one claim this
recommendation rests on that no documentation settles. Then per-platform
capability — carousel, short video, alt text, scheduling — then metrics, compared
against `DIRECT_METRICS`, which is what each platform's own API documents.

Whatever it observes is what `/accounts` and this document are permitted to say.
Nothing is described as working because a vendor page describes it as working.

## What the API actually returns

**Corrected 10 August 2026, after reading the OpenAPI reference instead of the
marketing pages.** The earlier version of this document was wrong about the most
consequential thing on it, and the correction is recorded rather than quietly
applied.

### Metrics: saves *are* reported

The analytics response includes `savesCount`, `clicksCount`, `followsCount`,
`profileVisitsCount`, `profileActivityCount`, `watchTimeMsAvg`, `viewTimeMsSum`,
`impressionsCount`, `reachCount`, `likesCount`, `commentsCount`, `repliesCount`,
`sharesCount`, `viewsCount` and `playsCount`, plus platform-specific variants
such as `twitterRetweetsCount` and `pinterestSaveRate`.

The previous claim — that saves were unavailable, and that the transport was
therefore materially thinner than a direct adapter — **was false**. It came from
reading the vendor's prose rather than the schema. Every scored metric Halyard
uses is present, so there is no documented gap on any platform.

`/analytics` still reports gaps, and still should: it compares against what a
probe *observed*, not against what the schema promises. Documented and observed
are different things, which is exactly why they are stored separately.

### Alt text: only Instagram and Pinterest

The `target` object accepts `altText` on **Instagram** (max 1,000 characters) and
**Pinterest** (max 500), and nowhere else. No amount of probing changes that: the
field is absent from the request body.

**But the cost is narrower than "four platforms lose alt text", which is what an
earlier version of this document said.** The direct adapters only send alt text
on x, instagram, threads, pinterest and bluesky — never on youtube or tiktok,
which are video, where the accessibility mechanism is captions and Halyard burns
those in already.

So the loss is real on **X and Threads only**. X is staying direct for a stronger
reason anyway, which leaves Threads as the one platform alt text alone decides.
See `TRANSPORT_DEFAULTS.md`.

### No reply endpoint, which settles X

There is no `replyToId`, no `in_reply_to`, and no way to attach a post to an
existing one. `additionalPosts` builds a thread within a single submission, but
it cannot carry a link the first post is deliberately keeping out of its own
body, because X's pricing applies to the submission.

So a platform whose link strategy is `first_reply` cannot be served correctly
here. The adapter **refuses** rather than falling back to putting the link in the
body: on X that is $0.20 a post against $0.015, a thirteenfold increase applied
silently to every post. X stays direct, permanently, and not only by preference.

### Other corrections found the same way

| What the adapter assumed | What the schema says |
|---|---|
| `POST /v2/posts` returns `id` | It returns `postSubmissionId` |
| Accounts at `GET /v2/accounts` | `GET /v2/users/me/accounts`, and the name field is `fullname` |
| Instagram `mediaType: 'reels' \| 'carousel'` | `'reel' \| 'story'` only; a carousel is what several `mediaUrls` produce |
| TikTok needs `privacyLevel` and `isDraft` | Also requires `disabledComments`, `disabledDuet`, `disabledStitch`, `isBrandedContent`, `isYourBrand`, `isAiGenerated` |
| Pinterest needs `boardId` | Also requires `title` |
| YouTube needs `privacyStatus` | Also requires `shouldNotifySubscribers` |
| Analytics returns `latestMetrics` / `metricsHistory` | `metrics` / `history`; those other names belong to the *list* endpoint |
| `mediaUrls` optional | Required, and `[]` for a text post |

Every one of those would have failed on first contact. They are listed because
"the endpoint shape was guessed" is the same class of error as "the capability
was assumed", and this document was the source of both.

### Media, and why the probe can run before deploying

`POST /v2/media/uploads` returns a presigned URL to PUT a local file to, and a
public URL to use afterwards. That is what makes the TikTok question answerable
from a laptop: the provider fetches media by URL, and a rendered video on disk is
unreachable to it otherwise.

Post creation is rate limited to 30 requests a minute.

## TikTok, stated plainly

Halyard uploads TikTok to **drafts**, on every transport, whatever the probe
finds. No API of any kind — direct, Blotato's, anyone's — can attach trending
commercial audio, and sound is a large share of TikTok distribution. A video
published without it underperforms one finished by hand in the app.

So the probe's TikTok result does not change what gets sent. It changes what
`/accounts` is allowed to claim: whether public posting *was available and
declined*, or was never available at all. Both are honest; only one of them is
true, and until the probe runs neither is asserted.

## How switching works

`social_accounts.transport` is `direct` or `unified`, per account, changed from
`/accounts` with no code change and no redeploy. The `UnifiedAdapter` implements
the same `PlatformAdapter` interface every direct adapter implements, so the
queue, the four gates, scheduling, idempotency and attribution are untouched.
Only the transport changes.

That is deliberate: this recommendation is made on incomplete information, so the
cost of it being wrong should be one dropdown.
