# Platform review submissions — Milestone 6

Not a coding task. v2 B.2 puts this on **day two**, immediately after the OAuth
flows work, because reviews are wall-clock time you cannot compress and nothing
in the build is blocked while they run.

Record every demo video in one session. The flows are nearly identical, and
re-recording later means re-finding the same four screens.

---

## The one shared recording session

Screen-record at 1920×1080, no audio needed unless a platform asks. Each clip is
90 to 180 seconds. What every reviewer wants to see is the same three things:

1. **A real product, not a demo.** Open `https://recipefix.app` first. Show it
   working. This is the single most common rejection cause for an app that looks
   like an internal tool.
2. **The full OAuth flow, uncut.** From clicking Connect, through the platform's
   own consent screen, to landing back on `/accounts` with the account showing a
   capability state. Do not cut the redirect. Pinterest rejects for exactly this.
3. **The API doing something.** Create a post through Halyard and show it appear
   on the platform.

Then record the per-platform additions below.

---

## Instagram — Meta App Review

**Permission:** `instagram_business_content_publish` (plus `instagram_basic`,
`instagram_manage_comments`, `instagram_manage_insights`).

**Prerequisites, all four:**

- Facebook Business account
- Facebook Page
- Instagram Professional account linked to that Page
- Meta developer app with the Instagram product added

**Expect 2 to 4 weeks per submission.** A rejection restarts the clock, so read
the use-case description twice before submitting.

**Recording additions:**

- Show the queue, with a carousel and its four QC lines visible. Reviewers
  respond well to evidence that a human approves each post.
- Publish that carousel to your own account in dev mode. Show the live post.
- State plainly in the use-case text: *one operator, publishing that operator's
  own content to accounts they own. No third-party publishing, no user data
  processing, no resale.*

**Until approval:** the account sits at `draft_only`. Dev mode publishes to your
own account for real. Flip to live on `/accounts` when approval lands.

---

## Threads — same Meta app

Rides the Instagram submission. Scopes: `threads_basic`,
`threads_content_publish`, `threads_manage_replies`, `threads_manage_insights`.
Add the Threads product to the same app and include one Threads publish in the
Instagram recording.

---

## Pinterest — Trial to Standard

**Free at both tiers.** The gate is a video demo.

The two most common rejections, both avoidable:

- *"Demo did not show the full OAuth flow."* Record the redirect, the consent
  screen, and the return. Uncut.
- *"Demo did not show Pinterest API integration."* Show a pin being created
  **through Halyard**, and the resulting pin.

**Recording additions:**

- Show `/accounts` before connecting: state `pending_auth`.
- Connect. Show the Pinterest consent screen in full.
- Create a pin from `/queue`. Show the destination link, title and alt text as
  three separate fields on the item detail screen — Pinterest cares that you
  understand this.

**Until approval:** the adapter writes to `api-sandbox.pinterest.com`. Pins are
sandbox entities visible only to you. `capability_state` stays `draft_only`.

Also note before building further metrics: Pinterest's Developer Guidelines bar
caching most API data. Halyard stamps `post_metrics.purge_after` on every
Pinterest row and the scoring job deletes them on schedule. Re-check the current
guidelines before changing `PINTEREST_METRIC_RETENTION_DAYS`.

---

## YouTube — compliance audit

**Form:** YouTube API Services Audit and Quota Extension Form.

**Recording additions:**

- The Google OAuth consent screen, in full, including the scopes.
- An upload from Halyard, and the video appearing in YouTube Studio as private.
- State that uploads are private until the audit passes, and that Halyard sets
  `privacyStatus: 'private'` in code rather than relying on a default.

**Quota, so the form is answered correctly:** since Google's June 2026 change,
uploads bill to their own daily bucket of roughly 100 calls rather than drawing
1,600 units from the shared 10,000-unit pool. Any guide quoting 1,600 predates
December 2025. Reads cost 1 unit, searches 100, writes 50, resetting at midnight
Pacific.

**Until approval:** uploads land private and `publish()` returns
`mode: 'draft'` with a Studio deep link.

---

## TikTok — Content Posting API audit

**Attempt it. Plan for rejection.**

TikTok rejects submissions from apps that look like internal tools, side
projects, or demos. Halyard is, by design, an internal tool for one operator.
That is the profile that gets bounced.

**If you submit anyway, the form wants:**

- a recorded demo of the full posting flow
- a privacy policy URL that resolves
- evidence the integration sits inside a finished product with real users

**What Halyard does regardless of the outcome:** uploads to the creator's
**inbox**, not direct publish. This is not a workaround for a failed audit — it
is the better path. API-published video cannot carry trending commercial audio,
and sound is a large share of TikTok distribution. Thirty seconds of human work
in the app buys something the API cannot provide.

Direct publish exists behind `allowDirectPublish` in account meta and is off.

---

## X — nothing to submit

No review gate. The only gate is billing.

Watch the rate card rather than the queue: a post containing a URL costs $0.20
against $0.015 without one. Halyard's X adapter puts the link in the first reply
for exactly this reason, which happens to also be the better tactic — link posts
are algorithmically deprioritised.

At one link-free post per day plus one reply carrying the link, expect roughly
$6.50 a month.

---

## Tracking

Record each outcome on `/accounts` by flipping the capability state when
approval lands. That flip is a manual operator action on purpose: Halyard cannot
see a platform's review decision, and inferring it would be worse than asking.

| Platform | Submitted | Outcome | Capability state |
|---|---|---|---|
| Instagram | | | `draft_only` |
| Threads | | | `pending_auth` |
| Pinterest | | | `draft_only` |
| YouTube | | | `draft_only` |
| TikTok | | | `draft_only`, permanently by design |
| X | n/a | n/a | `live` |
