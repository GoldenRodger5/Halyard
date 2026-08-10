# Social Engine — Architecture Addendum v2

Companion to `social_engine_architecture.md`. Research conducted 2026-08-10.
This document supersedes §7 (platform adapters) and §5 (rendering) of v1, and adds six
systems that v1 was missing.

---

# PART A — Platform API reality, researched

## A.1 The headline finding

**Every major platform gates public programmatic posting behind a manual review.** There is
no platform where you can register an app today and publish publicly to a real audience
this afternoon. The only exception is X, which has no review but now charges per post.

| Platform | Review required for public posting | What unreviewed access gives you |
|---|---|---|
| X | **No review** | Full public posting, pay-per-use |
| Instagram | Meta App Review | Up to 25 test users |
| TikTok | Content Posting API audit | `SELF_ONLY` posts, account must be private |
| Pinterest | Trial → Standard review | Sandbox pins, visible only to creator |
| YouTube | Compliance audit | Private uploads only |
| Threads | Meta App Review | Similar to Instagram |

This is the single most important planning fact in this document. Build accordingly.

## A.2 X

Pricing changed fundamentally in February 2026. <cite index="10-1">X moved to a pay-per-use model: there are no monthly subscriptions for new developers, and you buy credits in advance that are deducted as you call the API</cite>. <cite index="6-1">The old free tier was discontinued for new developers, and the legacy Basic and Pro subscription tiers are grandfathered for existing subscribers but closed to new signups</cite>.

**The rate card, and one line in it matters enormously:**

| Operation | Cost |
|---|---|
| Post without a link | $0.015 |
| **Post containing a URL** | **$0.20** |
| Read a third-party post | $0.005 |
| Read your own post | $0.001 |

<cite index="5-1">The $0.20 per-URL-post rate was added on 20 April 2026 and announced in a developer forum post rather than a press release, which is why many pricing guides still quote pre-April numbers.</cite>

### Two strategic consequences

**One: never put the link in the post body.** A post with a link costs 13× a post without
one. Standard practice already favours putting the link in a reply rather than the post,
because link posts are algorithmically deprioritised on X. The pricing now aligns with what
was already the better tactic. The system should default to **link-in-first-reply** for X.

At one link-free post per day plus one reply carrying the link, cost is roughly
$0.015 + $0.20 = $0.215/day, about **$6.50/month**. Acceptable.

**Two: the reply-monitoring plan is probably dead as designed.** <cite index="6-1">Reading is where the cost lands, and there is no free path through the official API for reading in 2026.</cite> Finding 10–20 relevant conversations a day means reading hundreds of posts at $0.005 each — roughly $30–75/month just to *look*, before writing anything, with a 2M read/month hard cap above which only Enterprise exists.

**Recommendation:** drop automated conversation discovery from v1. Do reply-hunting
manually in the X app, which is free, better at surfacing relevant conversations, and
produces better replies anyway. Revisit only if reply-driven growth proves itself manually.

## A.3 Instagram

<cite index="12-1">Posting to Instagram via API requires a Facebook Business account, a linked Facebook Page, an Instagram Professional account, a Meta developer app, and approved `instagram_business_content_publish` permission. Publishing is a two-step Graph API call: POST a media container to `/{ig-user-id}/media`, then publish via `/{ig-user-id}/media_publish`. App review takes 2-4 weeks per submission.</cite>

<cite index="16-1">Production access beyond 25 test users requires Meta App Review approval.</cite>

**Technical constraints:**

<cite index="12-1">Captions up to 2,200 characters. Hashtags and mentions work inline, but no bold or italic formatting. Daily limit of 100 API-published posts per 24-hour rolling period per account, with carousels counting as one post. All carousel images are cropped to match the aspect ratio of the first image.</cite>

That last point is a real trap: **build every carousel slide at the same aspect ratio**, or
slides 2 through 6 get cropped to match slide 1.

<cite index="11-1">Reels require 9:16 aspect ratio, 5 to 90 seconds duration, H.264 or HEVC, and an Instagram Business account for Reels tab eligibility. Publishing is three steps: POST to `/{ig-user-id}/media` with `media_type=REELS` and a public `video_url`, poll `/{container-id}?fields=status_code` until FINISHED, then POST to `/{ig-user-id}/media_publish`.</cite>

<cite index="13-1">Media must be hosted on a publicly accessible server at the time of the publish attempt, because Meta cURLs it.</cite> Supabase Storage with a public URL works. Signed URLs with short expiry do not.

<cite index="13-1">Reel video uploads use the `rupload.facebook.com` host rather than `graph.facebook.com`.</cite>

<cite index="17-1">Meta versions the Graph API quarterly and supports each version for roughly two years before sunset.</cite> Pin the version explicitly and set a calendar reminder.

## A.4 TikTok — the hardest problem, and a likely rejection

<cite index="19-1">Unaudited API clients can allow up to 5 users to post in a 24-hour window, all user accounts using the client must be set to private at the time of posting, and unaudited clients can only post content in `SELF_ONLY` viewership. To make content publicly viewable later, the account owner must change account visibility to public and then change each piece of content's privacy to "Everyone."</cite>

Read that carefully. Unaudited means not just private posts, but **the whole account must
be private while posting**. That is unusable for a brand account.

### The rejection risk

This is the finding that should change the plan:

<cite index="22-1">TikTok rejects audit submissions for apps that look like internal tools, side projects, or demos. The reviewer will open your privacy policy, your landing page, and the URLs in your app description. If they don't see a working product with real users, or at minimum a credible deployed signup flow, they bounce the submission. The audit submission asks for a recorded demo of your full posting flow, your privacy policy URL, and proof that the integration belongs inside a finished product.</cite>

The Social Engine is, by design, an internal tool for one operator. It is exactly the
profile TikTok rejects. Submitting the audit is worth attempting, but **plan for rejection**
rather than treating TikTok direct-post as a milestone that will land.

### The flow, if pursued

<cite index="23-1">The Content Posting API lives at `open.tiktokapis.com`. The flow is three steps: query creator info to get available privacy levels, POST to `/v2/post/publish/video/init/` with `PULL_FROM_URL` or `FILE_UPLOAD`, then poll `/status/fetch/` for `PUBLISH_COMPLETE`. It requires the `video.publish` scope.</cite>

<cite index="25-1">Direct publishing and upload-to-inbox are governed by different permission scopes.</cite>
**Upload-to-inbox is the practical path**: the video lands in the creator's TikTok drafts,
and publishing is finished in the app. This is also, as it happens, the better path for
sound (see §E.4).

## A.5 Pinterest

<cite index="29-1">Pinterest does not publish API access fees for v5. Both the Trial and Standard tiers cost nothing. The three things that gate you are non-monetary: the Trial-to-Standard video-demo review, per-category rate ceilings, and a data-storage rule that bars caching most API data.</cite>

<cite index="30-1">All Pins and Boards created with Trial access are only visible to their creator as Sandbox entities. Upgrading to Standard requires an already-approved Trial app and a video recording of the app completing an action using the Pinterest API.</cite>

<cite index="27-1">The current API is v5 at `https://api.pinterest.com/v5/`, with a separate sandbox at `https://api-sandbox.pinterest.com/v5/`. The most common Standard-access rejection patterns in 2026 are "demo did not show the full OAuth flow" and "demo did not show Pinterest API integration."</cite>

<cite index="31-1">Roughly 1,000 requests per day per app for most categories.</cite>

<cite index="28-1">Every Pin requires a `board_id`. Destination link, title, and alt text are separate fields.</cite>

**The data-storage rule is a genuine architectural constraint.** Pinterest bars caching most
API data. The `post_metrics` table needs a Pinterest-specific retention policy rather than
storing snapshots indefinitely. Check the current Developer Guidelines before building the
metrics collector.

## A.6 YouTube

<cite index="37-1">Apps created after 28 July 2020 that haven't passed a compliance audit can only upload videos as private. They cannot publish public content. The compliance review involves submitting a detailed use-case description, a demo video of the OAuth flow, and agreeing to the YouTube API Services Terms of Service. Unverified apps are limited to 100 users in testing.</cite>

Good news on quota:

<cite index="37-1">Since Google's June 2026 change, uploads and searches no longer draw from the shared 10,000-unit pool. Uploads bill to their own daily bucket of 100 calls, meaning roughly 100 uploads per day by default. Under the previous model an upload cost 1,600 units from the shared pool, capping a project at about six uploads a day.</cite>

Any tutorial quoting the 1,600-unit figure predates December 2025. <cite index="35-1">Read calls cost 1 unit, searches 100, and writes 50 from the 10,000-unit daily pool, which resets at midnight Pacific.</cite>

<cite index="36-1">There is no self-service option to buy more quota. Extensions require the YouTube API Services Audit and Quota Extension Form with no guaranteed timeline.</cite>

<cite index="37-1">For Shorts: vertical 9:16 under 60 seconds, with `#Shorts` in the title. Uploads use the resumable upload protocol with chunks in 256 KB multiples and require the `youtube.upload` scope.</cite>

---

# PART B — The publishing strategy decision

## B.1 Three options

Given that five of six platforms require review, there are three paths.

**Option 1 — Direct integration, do every review.**
Full control, no per-post fees beyond X, no third-party dependency. But: five review
processes, each 2–6 weeks, each requiring a demo video, and TikTok likely rejects an
internal tool outright. Realistic time to all platforms live: 8–12 weeks, with TikTok
possibly never.

**Option 2 — Pre-audited aggregator for everything.**
Several services have already passed every audit and expose one endpoint across all
platforms. Live in a day. But: a hard dependency on a vendor, per-post fees, and less
control over platform-specific fields.

**Option 3 — Hybrid. Recommended.**

| Platform | Path | Why |
|---|---|---|
| X | **Direct** | No review gate. Direct is simpler and cheaper than a middleman |
| Instagram | **Direct**, review started day 1 | Highest-value platform; worth owning. Dev mode works against your own account immediately |
| Pinterest | **Direct**, review started day 1 | Free, and the review is a screen recording |
| YouTube | **Direct**, audit started day 1 | Free, generous quota |
| TikTok | **Aggregator**, or inbox-upload | Audit likely rejects an internal tool |
| Threads | **Direct** | Rides the Instagram Meta app |

The `PlatformAdapter` interface from v1 makes this trivial: an `AggregatorAdapter`
implements the same interface as a direct adapter, so swapping either direction is a
config change. **Build the interface first, then whichever adapter unblocks fastest.**

## B.2 The unlock sequence

Every review needs a demo video of the OAuth flow plus a core action. Record all of them
in one session once the OAuth flows work.

```
Day 1     Register all six developer apps. Implement OAuth for all six.
Day 1     X live. Real posting begins immediately.
Day 2     Record OAuth + action demo videos for IG, Pinterest, YouTube.
Day 2     Submit: Meta App Review, Pinterest Standard, YouTube compliance audit.
Day 2-14  Instagram dev mode (25 users) — publish to your own account for real.
          Pinterest sandbox, YouTube private uploads. Everything testable.
Week 2-6  Approvals land. Flip capability_state to 'live' per platform.
TikTok    Attempt the audit. Assume rejection. Fall back to inbox-upload
          or an aggregator.
```

Nothing is blocked. The system runs end to end from day one; only the audience visibility
changes as approvals land. That is precisely what the `capability_state` field is for.

---

# PART C — Compliance

## C.1 AI disclosure

New in 2026 and directly relevant.

<cite index="66-1">Every major platform draws the same line: disclosure is required when content shows photorealistic synthetic media, an AI-generated human, or a real person altered to appear to say or do something they did not. The rule targets content a viewer could mistake for real, not the use of an AI tool in production.</cite>

<cite index="65-1">AI-assisted text workflows such as script writing, captions, and hashtag generation remain exempt from labeling.</cite>

**What this means for the planned output:**

| Content type | Disclosure needed? |
|---|---|
| AI-written captions and hooks | **No** |
| Motion-graphic transformation videos | **No** — not photorealistic |
| Kinetic typography, data visualisation | **No** |
| Screen recordings of the real app | **No** — it is real footage |
| Rendered images and carousels | **No** |
| **AI voiceover** | **Probably yes.** See below |
| AI-generated photorealistic food images | **Yes** |
| AI-generated people | **Yes**, and avoid entirely |

The design is mostly clear. Two exceptions.

**AI voiceover is the ambiguous one.** <cite index="67-1">FTC guidance flags synthetic speech: disclosure is required for AI-generated voiceover, AI voice cloning, or synthetic speech in video or audio content, and AI voice cloning of real people requires both consent and disclosure. This is a high-enforcement area.</cite> Platform rules focus on *realistic depiction of real people*, which a generic TTS narrator arguably is not, but the safest posture is a visible `#AIvoiceover` or an on-screen note when TTS narration is used. Cheap insurance.

**Automatic detection means self-disclosure is the better option anyway.** <cite index="65-1">TikTok integrated C2PA Content Credentials in January 2025 and has labeled over 1.3 billion AI-generated videos using Content Credentials, watermarking, and detection models.</cite> <cite index="67-1">Instagram and TikTok detect C2PA metadata from some AI image tools and auto-label. Even without disclosure, the platform may label content for you, and the label says "AI generated" with no context, which can look worse than a self-authored disclosure.</cite>

## C.2 EU AI Act — live as of eight days ago

<cite index="66-1">From 2 August 2026, Article 50 requires that AI-generated synthetic content shown to EU users be marked in a machine-readable format and clearly labeled, with deepfakes needing distinguishable labels.</cite>

This is now in force. Social content is globally visible, so EU users will see it. Practical
response: embed C2PA Content Credentials in generated video and audio, keep a
`ai_generated_components` field on every content item recording exactly which parts were
machine-produced, and default to labelling anything with TTS narration.

## C.3 Encoded, not remembered

Add to the `content_items` schema:

```sql
alter table content_items add column ai_components text[] default '{}';
  -- 'copy' | 'voiceover' | 'imagery' | 'motion' | 'none'
alter table content_items add column requires_ai_label boolean
  generated always as ('voiceover' = any(ai_components)
                    or 'imagery'   = any(ai_components)) stored;
```

The publish job refuses to post when `requires_ai_label` is true and no disclosure is
present in the caption or the platform's native AI toggle is unset. Compliance as a code
path, not a habit.

---

# PART D — Video and audio toolchain

## D.1 Remotion licensing — free, for now

<cite index="47-1">Remotion is free for individuals, for-profit organizations with up to 3 employees, and non-profits, including commercial use.</cite>

A solo founder is covered. Automation is explicitly included in the free license. But note
the threshold:

<cite index="50-1">Remotion for Automators, required for companies of 4 or more building automated video pipelines, is $0.01 per render with a $100/month minimum. Remotion for Creators is $25 per seat per month.</cite>

Hiring a fourth person triggers a $100/month minimum. Worth knowing; not worth avoiding
Remotion over.

**Permissively-licensed alternatives**, if the threshold ever bites: Motion Canvas (MIT)
and HyperFrames (Apache 2.0). Neither is as mature. Stay on Remotion.

## D.2 Do we need ElevenLabs?

Short answer: for *some* content, and it is not the most important audio decision.

<cite index="54-1">ElevenLabs Multilingual v2 and v3 API pricing starts at $120 per million characters, with Flash and Turbo models from $60 per million.</cite> A 30-second script is roughly 450 characters, so 100 videos costs about **$5**. Cost is irrelevant at this scale; pick on quality.

<cite index="59-1">ElevenLabs v3 ranks #4 on the Artificial Analysis ELO Speech Arena at $100 per million characters. Several alternatives now deliver competitive or higher ELO scores at lower cost.</cite> <cite index="55-1">Broader options include Google Cloud TTS, Azure AI Speech, Amazon Polly, OpenAI TTS, and Deepgram Aura, differing on realism, latency, language coverage, and cloning.</cite>

### The recommendation: clone the founder voice

A cloned founder voice is better than generic TTS and better than recording every script by
hand. It resolves the tension between "a real voice performs better" and "recording every
video does not scale."

**Why cloning wins here:**

- It is a real human voice with real prosody, not a stock narrator
- Consent is trivially satisfied — it is your own voice
- Consistency across hundreds of videos, which stock voices also give but recorded takes do
  not
- Zero marginal recording time. Script to audio in seconds
- The same voice works across RecipeFix and Kinolog, building recognition

**Do it properly:**

| Decision | Recommendation |
|---|---|
| Cloning tier | **Professional Voice Cloning**, not Instant. Instant clones from seconds of audio and sounds it. Professional wants ~30 minutes of clean audio and is materially better |
| Source recording | One session, quiet room, decent mic (a $100 USB condenser is plenty), read varied material including numbers, temperatures, and ingredient names |
| Pronunciation | Build a lexicon file for terms the clone gets wrong. Cooking is full of them: *ghee*, *tamari*, *za'atar*, *roux*, *quinoa*, fractions, degree symbols. Pre-normalise numerals in the script before synthesis |
| Fallback | Keep the recorded source audio. If ElevenLabs changes terms or the clone degrades, you own the raw material |

**Disclosure — do it, and it costs nothing.** A cloned voice of a real person is the case
platform rules most directly target, and <cite index="67-1">the FTC flagged AI voice cloning specifically, requiring both consent and audience disclosure</cite>. Consent is satisfied. Disclosure is a line in the caption or a small on-screen note. The alternative is an audience discovering later that the founder voice was synthetic, which in a category built on dietary trust is a real cost for no benefit.

**Keep recorded audio for a small set of high-stakes content:** the Product Hunt launch
video, the founder story, anything where you are asking people to trust you personally.
Synthetic is fine for explaining why vinegar strengthens a gluten-free crumb. It is worse
for "here is why I built this."

### Revised audio modes

| Mode | Use | Disclosure |
|---|---|---|
| `founder_cloned` | **Default for narrated video.** Explainers, transformations, technique | Yes, brief |
| `founder_recorded` | Launch, founder story, high-trust moments | No |
| `text_only` | Music bed + on-screen text | No |

Generic third-party TTS is dropped entirely. Once a founder clone exists there is no reason
to use a stock narrator.

**`text_only` remains a large share of output.** Most short-form is watched muted, and
on-screen text with a music bed frequently beats narration for information-dense content.
Voiceover is a choice per template, not a default.

### Cost

<cite index="54-1">ElevenLabs Multilingual v2 and v3 pricing starts at $120 per million characters, with Flash and Turbo from $60.</cite> A 30-second script is roughly 450 characters, so 100 narrated videos costs about $5 in synthesis. Professional Voice Cloning requires a paid subscription tier; check current plan requirements. Total voice cost is negligible against the value.

## D.3 The rest of the video toolchain

Remotion is the compositor, not the whole pipeline.

| Need | Tool | Notes |
|---|---|---|
| Composition and render | Remotion | Free at current size |
| Encoding, probing, concat | FFmpeg | In the worker container regardless |
| Captions / burned-in subtitles | `@remotion/captions` + Whisper | **Burned-in captions are not optional.** Most short-form is watched muted |
| Transcription for caption timing | `whisper.cpp` locally, or a hosted API | Locally is free and fast enough |
| Waveform visualisation | `@remotion/media-utils` | For audio-reactive motion |
| Music | Licensed library (Epidemic Sound, Artlist, or Uppbeat's free tier) | **Never use platform trending audio via API.** See §E.4 |
| Loudness normalisation | FFmpeg `loudnorm` to −14 LUFS | Inconsistent loudness is a strong amateur tell |
| Font subsetting | `subset-font` | Instrument Serif and Inter, subset for render speed |
| Screen capture | Playwright | Already in the container |
| Frame QC | Sharp + a vision model | See Part F |

**Add to the worker container:** FFmpeg, `whisper.cpp`, and the font files. Chromium is
already there for Remotion and Playwright.

---

# PART E — Scheduling and distribution logic

## E.1 The question: same content everywhere at once?

No. Three distinct decisions get conflated here.

**Decision 1 — Is it the same content?** No. Same *source insight*, different artifacts per
platform. One transformation becomes an X text post, a 6-slide IG carousel, a 9:16 TikTok
video, and a 2:3 Pinterest pin. Different aspect ratios, different copy lengths, different
hooks. This is already in v1 and is the correct design.

**Decision 2 — Same day?** Usually yes for the visual platforms, with staggering. The
insight is fresh, and coordinated presence compounds.

**Decision 3 — Same minute?** Never.

## E.2 The staggering model

```
Idea → platform variants → per-platform slot assignment → stagger → publish
```

Rules the scheduler should enforce:

| Rule | Value | Reason |
|---|---|---|
| Minimum gap, same platform | 4 hours | Consecutive posts cannibalise each other's reach |
| Minimum gap, cross-platform, same idea | 45–90 minutes | Avoids a synchronised burst that reads as automated |
| Maximum posts per platform per day | 1–2 | Except Pinterest, which tolerates and rewards more |
| Pinterest daily volume | 3–5 pins | Different medium: a search index, not a feed |
| Jitter on every scheduled time | ±7 minutes | Exact-o'clock posting is an automation fingerprint |
| Founder vs brand on same platform | ≥3 hours apart | They should not look coordinated |

**Do not post everything at 9:00:00.** Randomised offsets within a slot window cost nothing
and remove an obvious tell.

## E.3 Slot definitions, not fixed times

Optimal timing is audience-specific and platform-specific, and any number quoted today is
guesswork until there is data. Define **named slots** with wide windows, let the scheduler
pick within the window, and let measured performance narrow it over time.

```
morning   06:30–08:30   commute, first scroll
midday    11:30–13:00   lunch
evening   17:00–19:30   the meal-planning window — likely strongest for a recipe product
late      20:30–22:30   couch scroll
```

For a cooking product, the **evening slot is the strategic bet**: people decide what to cook
between 4pm and 7pm. The system should over-weight evening for transformation content and
morning for educational content, then let the data correct it.

## E.4 The trending-audio problem — a real structural limit

This deserves its own flag because it is the strongest argument against full automation on
two platforms.

TikTok and Reels both weight trending audio heavily in distribution. **Trending commercial
sounds cannot be attached through the posting APIs.** API-published videos carry your own
audio track only. That is a real, structural disadvantage versus native posting.

Consequences worth accepting deliberately:

1. **API-published TikToks and Reels will under-perform natively-published ones**, holding
   content quality constant. Not a bug in the build; a property of the channel.
2. **This makes TikTok inbox-upload attractive rather than merely tolerable.** The video
   lands in drafts, you open the app, attach a trending sound, and publish. Thirty seconds
   of human work that the API cannot substitute for.
3. **Never repost a watermarked download.** Downloading a TikTok and uploading it to Reels
   carries the watermark, and Instagram deprioritises watermarked content. Always render
   each platform's cut separately from source. The v1 architecture does this correctly.

**Revised recommendation:** treat TikTok and Instagram Reels as *assisted* rather than
*automated*. The system renders, captions, writes copy, and uploads to drafts. You attach
sound and hit publish. Full automation stays on X, Pinterest, YouTube, Threads, and IG
feed/carousel posts.

---

# PART F — Quality control: the anti-slop system

Four independent gates. Content that fails any one never reaches the approval queue, so the
queue stays worth reading.

## F.1 Gate 1 — Copy quality (deterministic)

A lint pass, not a model call. Fast, cheap, and non-negotiable.

### The banned-pattern list

**Punctuation and typography:**

```
em dash (—)        → rewrite the sentence, or use a period or comma
en dash in prose   → only acceptable in numeric ranges
"…" ellipsis char  → use three periods or nothing
curly quotes       → straight quotes only; some platforms mangle curly
emoji in body copy → maximum 1, and only where it carries meaning
```

The em dash rule is the single strongest LLM tell in short-form copy. Enforce it as a hard
regex reject, not a style suggestion.

**Banned phrases and constructions:**

```
"It's not just X, it's Y"        the single most recognisable LLM sentence shape
"Let's dive in" / "Let's explore"
"In today's fast-paced world"
"game changer" / "revolutionize" / "10x" / "unlock" / "elevate"
"the secret to" / "here's the thing"
"Whether you're X or Y, ..."
"That's where {product} comes in"
"seamlessly" / "effortlessly" / "leverage" / "utilize" / "robust"
"delve" / "tapestry" / "testament to" / "navigate the landscape"
rule-of-three lists as a default rhythm
starting three consecutive sentences with the same word
"🚀" and rocket-adjacent emoji entirely
```

**Structural checks:**

| Check | Threshold |
|---|---|
| Average sentence length | Reject if >22 words for short-form |
| Sentence length variance | Reject if too uniform — humans vary wildly |
| Hashtag count | X: 0–2. IG: 3–8. TikTok: 3–5. Pinterest: 0 |
| Opening line | Reject if >12 words. The hook is the first 3–5 words |
| Question-mark density | Reject if >1 per 40 words |
| Adjective stacking | Reject "delicious, tender, perfectly-seasoned" patterns |

Implement as `lib/slopFilter.ts`, run before anything reaches the queue, with the specific
violation shown in the UI so you can see *why* something was rewritten.

## F.2 Gate 2 — Factual verification (traceability)

Every factual claim must trace to the `product_artifact`.

The copywriter returns claims alongside the copy:

```json
{
  "body": "...",
  "claims": [
    { "text": "GF flour needs 25 degrees less heat",
      "source": "steps[3].updated_note" },
    { "text": "vinegar strengthens the crumb",
      "source": "ingredients[4].changeReason" }
  ]
}
```

A verifier resolves each `source` path against the stored artifact and confirms the claim is
actually supported. Unresolvable path, or claim not supported → reject and regenerate.

This is the same principle as RecipeFix's own compliance scanner: do not trust the model's
output, verify it deterministically. It is also what prevents the system confidently posting
cooking advice the product never gave.

Hard blocks regardless of source: nutrition accuracy claims, "perfect 1:1 substitution",
medical or allergy-safety guarantees, any competitor comparison.

## F.3 Gate 3 — Visual QC (automated)

Runs after render, before the queue.

**Deterministic checks:**

| Check | Method |
|---|---|
| Dimensions and aspect ratio match target | Sharp metadata |
| Text overflow / clipping | Render at 2× and diff against a text-bounds mask |
| Safe area | No text within 12% of top/bottom on 9:16 (platform UI overlays) |
| Contrast | WCAG AA against the background |
| Carousel consistency | All slides identical aspect ratio (Instagram crops otherwise) |
| Video duration | Within platform bounds |
| Loudness | −14 LUFS ±1 via FFmpeg `loudnorm` |
| Audio clipping | No true-peak above −1 dBTP |
| Black frames | No frame below 5% mean luminance except intentional fades |
| Caption timing drift | Whisper transcript vs caption track, reject if >200ms drift |

**Vision-model check:** sample 4–6 frames, send to a vision model with a rubric.

```
Score 1-5 and flag any failure:
- Is any text cut off, overlapping, or unreadable?
- Is the composition balanced, or does it look like a default template?
- Do the brand colors appear correctly?
- Would this look out of place in a well-produced food account feed?
- Does anything look obviously machine-generated in a bad way?
Reject below 3.5 on any dimension.
```

## F.4 Gate 4 — Audio QC

For any voiceover:

1. **Round-trip transcription.** Whisper the generated audio, diff against the source
   script. Word error rate above 2% means the TTS mispronounced something. Common failure:
   ingredient names, temperatures, fractions.
2. **Number pronunciation.** Explicitly test that "450°F" reads as "four hundred fifty
   degrees" and "1¾ tsp" as "one and three quarter teaspoons". Pre-normalise numerals in
   the script before TTS rather than hoping.
3. **Pacing.** Words per minute between 140 and 175. Outside that, regenerate.
4. **Trailing silence.** Trim to under 300ms.

## F.5 The queue shows its work

Every item displays its QC result:

```
✓ Copy       passed  (0 flags)
✓ Claims     3/3 verified against artifact
⚠ Visual     4.2/5 — "slide 4 text is close to the safe area"
✓ Audio      WER 0.4%, 158 wpm, −14.1 LUFS
```

You approve knowing what was checked. Warnings are visible but not blocking; failures never
arrive.

---

# PART G — The decision engine

How the system decides what to post. v1 described this loosely; this is the full mechanism.

## G.1 Inputs

| Input | Weight at cold start |
|---|---|
| Content-mix debt (which pillar is under-served vs target) | 0.25 |
| Novelty (distance from last 60 days) | 0.20 |
| Seasonal / calendar proximity | 0.15 |
| Product signal freshness (new feature, notable adaptation) | 0.15 |
| Format availability (can we actually render this well?) | 0.15 |
| Historical performance of similar content | 0.10 → rises to 0.40 with data |

## G.2 Content-mix debt is the primary driver

The brand voice config defines target mix. RecipeFix brand: 40% transformations, 25%
education, 20% community, 15% product. Founder: 70% non-promotional, 20% building, 10%
direct.

The system computes actual mix over a trailing 21 days and prioritises whichever pillar is
furthest below target. This alone prevents the most common failure mode of automated
content: drifting into whatever is easiest to generate, usually product promotion.

**Hard cap:** never more than 15% product content in any trailing 14-day window,
regardless of scores.

## G.3 Selection

```
1. Score all ideas
2. Apply mix-debt boost to under-served pillars
3. Apply hard caps (product ceiling, category cooldowns)
4. Select top N for today's slots
5. Enforce diversity: no two items same category same day
6. Check novelty against the last 60 days by embedding distance
7. Generate
```

## G.4 The learning loop, described honestly

At cold start there is no learning. Weights are hand-set and shown as such in the UI.

The loop activates at roughly **20 posts per category**, below which differences are noise.
The UI should say so rather than rendering a confident chart over n=3.

What it learns, in order of how quickly signal appears:

1. **Format performance** — fastest signal. Carousel vs video vs static
2. **Category performance** — needs more volume
3. **Hook patterns** — which opening structures stop the scroll
4. **Slot performance** — needs weeks
5. **Category → activated users** — the real objective, and the slowest

---

# PART H — Co-pilot mode

The conversational path. Currently missing entirely and arguably the most-used feature once
it exists.

## H.1 Why it matters

The daily queue handles volume. It does not handle the case where you have a specific idea,
or see something in the wild worth responding to, or want to work an angle out loud. That is
where the best content usually comes from.

## H.2 Entry points

- `/compose` — a chat interface
- "Make a post about this" from any idea, artifact, or published post
- Mobile: a compose button always visible

## H.3 The interaction

A streaming chat with a live preview pane. The model has the product brief, brand voice,
recent posts, and access to the connector and render tools.

```
You:  I want to post about how gluten-free bread needs vinegar. Not sure
      which platform.

AI:   That's a strong one because it's counterintuitive. Two angles:

      The mechanism — vinegar's acidity strengthens structure where gluten
      normally would. Educational, works as founder content on X.

      The demonstration — a real GF bread adaptation where RecipeFix added
      vinegar unprompted. Brand content, works as carousel or video.

      The second is stronger for conversion. Want me to pull a real
      adaptation so we're working from actual output?

You:  yes, and let's do the video

AI:   [calls adapt_recipe on Sally's artisan bread, gluten-free]

      Got it. Five changes, three of them substantive:
      · added ACV, structural reason
      · dropped oven 475 → 450, GF browns faster
      · salt and yeast scaled to ~85% of linear

      Hook options:
      1. "Gluten-free bread needs vinegar. Here's why."
      2. "This recipe added an ingredient that wasn't in the original."
      3. "Why your gluten-free loaf is gummy."

      Three is strongest — it leads with the reader's problem.

You:  three. make it

AI:   [renders TransformationDiff, 28s, text-only audio]
      [preview appears in the right pane]

      QC: copy clean, 3/3 claims verified, visual 4.6/5.
      Want it on TikTok too, or Reels only?
```

## H.4 Tools available in co-pilot

| Tool | Purpose |
|---|---|
| `generate_sample` | Pull real product output |
| `draft_copy` | Platform-specific copy |
| `render_preview` | Fast low-res render for iteration |
| `render_final` | Full-quality render |
| `check_novelty` | "Have I posted this before?" |
| `search_past_posts` | Find and re-template a winner |
| `suggest_platforms` | Recommend where it fits |
| `run_qc` | Run all four gates on demand |

## H.5 Requirements

- **Preview is live** and updates as the conversation changes the content
- **Preview renders are cheap** — 480p, no audio, sub-5-second turnaround. Only the final
  approved version renders at full quality
- **Any turn can become a queued item** — a "Send to queue" button on every draft state
- **Conversations are saved** to `compose_sessions`, because the reasoning is often reusable
- **Works on mobile**, because ideas arrive away from a desk

---

# PART I — What was missing

Things a working social operator needs that neither v1 nor the original brief included.

## I.1 Post-publish reply management — the biggest gap

Engagement in the first 30–60 minutes disproportionately determines distribution on every
platform. A system that publishes and walks away leaves most of the value on the table.

**Required:**

- Poll comments on published posts for 24 hours at declining frequency (5min → 15min → 1hr)
- Surface them in an **Inbox** view, newest first, grouped by post
- Draft a suggested reply for each, never send automatically
- One-tap send after human approval
- Flag anything that looks like a support question and route it to hello@
- Track reply latency, because it is a controllable variable that affects reach

`comments` and `comment_replies` tables. Reply is a human action with an AI draft, always.

## I.2 Link strategy per platform

Different everywhere, and getting it wrong is costly:

| Platform | Link placement |
|---|---|
| X | **First reply, not the post.** $0.20 vs $0.015, plus link posts are deprioritised |
| Instagram | Not clickable in captions. Link in bio, updated per campaign |
| TikTok | Bio only until eligible for in-video links |
| Pinterest | **Destination URL on the pin** — this is Pinterest's whole strength |
| YouTube | Description, first line above the fold |
| Threads | Clickable inline |

Add a `link_strategy` field per platform adapter, and a **link-in-bio rotation** job that
updates the bio link when a campaign changes.

## I.3 Named recurring formats

Franchises build habit in a way one-off posts do not. "Fix This Recipe #47" trains an
audience to expect something. Add a `series` table: name, format, template, cadence,
sequence number. The generator fills slots in a series rather than inventing a new shape
each time.

Candidates from the existing content ideas: *Fix This Recipe*, *Why This Swap Isn't 1:1*,
*8 Servings → 2*, *Chef Notes*.

## I.4 Hook library

The first three to five words determine whether anything else gets read. Maintain a `hooks`
table with the pattern, the platform, and measured stop-rate. The copywriter samples from
proven hooks rather than inventing openings from scratch every time.

## I.5 UGC intake

"Give RecipeFix a challenge" is in the original content plan and needs somewhere to land.
A `submissions` table fed by mentions and comments, with a flow to turn a submission into a
real adaptation and a response post. This is the highest-converting content type in the
plan because it is participatory and it produces genuinely novel material.

## I.6 Repost decay

Good content can run again after 45–90 days on most platforms, re-cut rather than reposted
identically. Add `eligible_for_repost_at` to `content_items` and let the idea generator
consider proven winners alongside new ideas.

## I.7 Swipe file

A `references` table for saved examples of content that works, from anywhere. Feed these
into the copywriter as few-shot examples. Taste is transferable to a model, but only if it
is written down.

## I.8 Alt text everywhere

Accessibility, and Pinterest treats alt text as a ranking signal. <cite index="28-1">Pinterest exposes alt text as a distinct field alongside title and destination link.</cite> Instagram supports it too. Generate it always; never leave it null.

## I.9 Follower-quality tracking

Follower count is a vanity metric, but *follower growth rate per post* correlates with reach
over time. Track `follows` per publication. A post that gains followers is doing something a
post that gains likes is not.

---

# PART J — Schema additions

```sql
-- Compliance
alter table content_items add column ai_components text[] default '{}';
alter table content_items add column disclosure_text text;
alter table content_items add column eligible_for_repost_at timestamptz;
alter table content_items add column series_id uuid;
alter table content_items add column sequence_number int;
alter table content_items add column qc_results jsonb default '{}';
alter table content_items add column claims jsonb default '[]';
alter table content_items add column audio_mode text default 'text_only';
  -- founder_cloned | founder_recorded | text_only

create table voice_lexicon (
  id uuid primary key default gen_random_uuid(),
  term text not null unique,          -- 'tamari', '450°F', '1¾'
  phonetic text not null,             -- how it should be spoken
  notes text
);
-- Applied as a normalisation pass on every VO script before synthesis.
-- Grows every time the audio QC gate catches a mispronunciation.

create table series (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references products(id) on delete cascade,
  name text not null,
  template_id text references templates(id),
  cadence text,
  next_sequence int not null default 1,
  active boolean not null default true
);

create table hooks (
  id uuid primary key default gen_random_uuid(),
  pattern text not null,
  platform text,
  category text,
  uses int not null default 0,
  avg_stop_rate numeric,
  avg_score numeric
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references publications(id) on delete cascade,
  platform_comment_id text not null,
  author_handle text,
  body text not null,
  posted_at timestamptz,
  is_support_question boolean default false,
  suggested_reply text,
  reply_status text default 'pending',  -- pending|replied|ignored|routed
  replied_at timestamptz,
  unique (publication_id, platform_comment_id)
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references products(id),
  source_platform text,
  source_handle text,
  content text not null,
  received_at timestamptz not null default now(),
  status text default 'new',   -- new|selected|fulfilled|declined
  resulting_content_item_id uuid references content_items(id)
);

create table references_swipe (
  id uuid primary key default gen_random_uuid(),
  url text,
  platform text,
  screenshot_asset_id uuid references assets(id),
  transcript text,
  why_it_works text not null,
  tags text[] default '{}'
);

create table compose_sessions (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references products(id),
  messages jsonb not null default '[]',
  resulting_content_item_ids uuid[] default '{}',
  created_at timestamptz not null default now()
);

create table slots (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references products(id),
  platform text not null,
  name text not null,          -- morning | midday | evening | late
  window_start time not null,
  window_end time not null,
  weekdays int[] not null default '{1,2,3,4,5,6,7}',
  avg_score numeric,
  enabled boolean not null default true
);
```

---

# PART K — Revised build order

| # | Milestone | Change from v1 |
|---|---|---|
| 1 | Scaffold, schema (including Part J), RLS, auth | Expanded schema |
| 2 | Products, voices, brand tokens, content rules | — |
| 3 | RecipeFix MCP connector | — |
| 4 | Worker container: Chromium, FFmpeg, whisper.cpp, fonts | Expanded |
| 5 | **All six OAuth flows + adapter interface** | **Moved much earlier** |
| 6 | **Record demo videos, submit IG / Pinterest / YouTube reviews** | **New, day 2** |
| 7 | **`slopFilter.ts` + claim verifier** | **New, before any generation** |
| 8 | Idea engine with mix-debt scoring | Expanded |
| 9 | Copywriter + approval queue with QC display | Expanded |
| 10 | **X adapter live — first real post** | Same checkpoint |
| 11 | Satori templates + visual QC gate | Expanded |
| 12 | Threads + Pinterest (sandbox until approved) | — |
| 13 | Instagram (dev mode → live on approval) | — |
| 14 | **Co-pilot compose mode** | **New, and high value** |
| 15 | Remotion + captions + audio QC | Expanded |
| 16 | YouTube + TikTok inbox-upload | Changed from direct post |
| 17 | Comment inbox + reply drafting | **New** |
| 18 | Metrics, attribution, performance scoring | — |
| 19 | Series, hooks, submissions, swipe file, repost decay | **New** |
| 20 | Calendar, mobile polish, kill switch | — |

Milestones 5, 6, and 7 moving to the front is the most important change. Reviews are
wall-clock time you cannot compress, so start them on day two. And the slop filter must
exist before the first generated post, or the queue fills with output you would not have
sent and you stop trusting it.

---

# PART L — Corrections to v1

| v1 claim | Correction |
|---|---|
| "Pinterest likely same-day live" | Wrong. Trial pins are sandbox-only; Standard needs a video-demo review |
| "YouTube likely same-day live" | Wrong. Unaudited apps upload private only |
| "X may need a paid tier" | Changed. No subscription exists for new developers. Pay-per-use, and $0.20 per link post |
| "Reply monitoring via X API" | Not economically viable. Do it manually |
| "TikTok draft mode as v1 behavior" | Correct, and more important than stated. Also the *better* path, because of trending audio |
| Screen capture as a content class | Confirmed narrow. Trending-audio limits make TikTok/Reels assisted rather than automated |
| Remotion cost unknown | Free at current company size. $100/mo minimum at 4+ employees |
| "~1 hour" for UTM capture | Unchanged, and still the highest-leverage hour in the entire plan |
