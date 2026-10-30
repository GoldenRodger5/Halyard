# RecipeFix creative strategy (2026-10-27)

This covers sound, pacing, platform fit, the bridge to the product, and how to stop looking
AI-made. It sits alongside `PLAYBOOK.md`, which covers what to post and how the machine
decides; this file covers how each post must sound, read and be adapted per platform. Evidence
was gathered on 2026-10-27. Where a claim comes only from a vendor blog, it is marked
*(vendor)*. Where evidence is thin, it says so.

## The decisions, in one screen

1. **The AI disclosure is currently wrong, and fixing it is the first job.** Today the
   pipeline sets `isAiGenerated` / `containsSyntheticMedia` only when a voice is used
   (`src/publish.ts`). TikTok and YouTube both require a label for **realistic generated
   scenes**, and our candid kitchen stills are exactly that. Unlabelled content "may be
   removed, restricted, or labeled" ([TikTok Community Guidelines](https://www.tiktok.com/community-guidelines/en/integrity-authenticity);
   [YouTube Help](https://support.google.com/youtube/answer/14328491)).
2. **Default sound is captions plus an owned music bed, with no synthetic narrator.** A
   business account cannot use trending music on TikTok or Instagram. An AI voice on top of AI
   pictures stacks two "AI" tells, and the evidence that it helps engagement is weak.
3. **Reading pace: 2.5 words a second for sentence text**, plus 0.8 s for every new picture.
   Today's list items run at about 7 words a second (see §2.4). That is the "too fast" the owner felt.
4. **A list video should run 28–35 s, not 15 s.** The pace in point 3 sets the length, and
   nothing in the evidence argues for 15 s.
5. **Real footage beats a better template.** The viewer review already found the score ceiling
   for "stills + text" (PLAYBOOK §8). Pexels footage is free for commercial social use. The
   owner's hands-only phone shots of real labels are the highest-trust asset we can get without
   a face.
6. **Before/after transformations are the bridge to the product.** Product mentions belong in
   captions, pinned comments and the bio, never as an end slab on the video.

---

## 1. Sound

### 1.1 What a brand account may legally use

| Platform | Trending / licensed music for a business account | What we can use at $0 | Notes |
|---|---|---|---|
| TikTok | **No.** A business account sees only the Commercial Music Library (CML) for promotional content, including organic posts with no ad spend ([Soundstripe summary of TikTok's commercial music policy](https://www.soundstripe.com/blogs/tiktok-music-licensing-rules) *(vendor)*). The general library is licensed for personal use only. | (a) CML tracks, but only added **in the app**: the posting API cannot attach them. (b) Audio we own, baked into the file. | CML tracks are licensed for TikTok only ([Soundstripe](https://www.soundstripe.com/tiktok) *(vendor)*). Outside music needs a commercial licence plus TikTok's music-usage confirmation at upload. |
| Instagram / Facebook | **No.** Business profiles get the Meta Sound Collection, "over 14,000 songs and sounds" cleared for commercial use on Facebook and Instagram ([Soundstripe, citing Meta's help center](https://www.soundstripe.com/blogs/instagram-music-library) *(vendor)*). "This sound isn't licensed for commercial use" is the error a business sees ([Later](https://later.com/blog/trending-songs-on-instagram-reels/)). | Sound Collection tracks (in the app only), or audio baked into the file. | Switching to a Creator account restores more music. It also makes the account look less like a brand and does not change what is legal for promotional use. Not recommended. |
| YouTube Shorts | The in-app Shorts library is licensed by YouTube. A Short **over one minute** with any active Content ID claim "will be blocked globally" ([YouTube Help: music eligibility for Shorts](https://support.google.com/youtube/answer/13486873?hl=en)). | YouTube Audio Library tracks ("won't receive a Content ID claim", same page), or our own audio. | Audio Library rights *outside* YouTube are unclear per track ([Lickd](https://lickd.co/youtube-audio-library/) *(vendor)*), so do not reuse them on TikTok or IG. |
| X, Threads, Pinterest | No in-app music library for organic posts that matters. | Our own audio. | X autoplays muted, so the captions carry the post. |

**Decision: one owned music bed, baked into the master and used on every platform.** The
cheapest cross-platform route is music we hold the rights to. GarageBand on the owner's Mac
allows Apple Loops to be used royalty-free in "projects you create" and distributed. What it
forbids is redistributing the loops themselves "as audio samples, sound effects or music beds"
([Apple Support 102034](https://support.apple.com/en-us/102034)). So **build original
30–45 s arrangements from several loops**; never publish a bare, unmodified loop. Residual risk:
someone else may register a Content ID track that uses the same loops. Keep the `.band`
project as proof and dispute any claim.
In-app CML or Sound Collection tracks stay an **optional human step** for proven winners.

### 1.2 AI labelling: what our assets require

| Asset | TikTok | Instagram / Facebook / Threads | YouTube |
|---|---|---|---|
| Rule | Label "AI-generated or significantly edited content that shows realistic-looking scenes or people" ([Guidelines](https://www.tiktok.com/community-guidelines/en/integrity-authenticity)) | Label "photorealistic video or realistic-sounding audio" that was digitally generated or altered. A still image needs no label, but Meta may label it if detected ([Instagram Help](https://help.instagram.com/761121959519495); [NPR](https://www.npr.org/2024/02/06/1229317971/meta-labeling-ai-generated-images-instagram-facebook-artificial-intelligence)) | Disclose content that "generates a realistic scene that didn't occur". Production help (script, captions, thumbnail) is exempt, and so is cloning **your own** voice ([YouTube Help](https://support.google.com/youtube/answer/14328491)) |
| Our photoreal AI kitchen stills inside a video | **Label required** | Treat as required: the Reel is a photoreal generated video | **Disclose** |
| AI stills in a carousel or single image | Label (photo mode is still TikTok content) | Not required. Meta may auto-label, because OpenAI images carry C2PA metadata and SynthID watermarks ([OpenAI Help](https://help.openai.com/en/articles/8912793)) | n/a |
| ElevenLabs / OpenAI narrator | Label | **Required** ("realistic AI voiceover" is Meta's own example) | Disclose. Only cloning your own voice is exempt |
| Real RecipeFix screens, type-only cards, Pexels footage | No label | No label | No label |
| Effect on reach | No official statement. Viewers now have an AI-content slider in Manage Topics ([TechCrunch](https://techcrunch.com/?p=3068861)), so labelled posts reach fewer of the people who turned AI down. | No official statement | "Disclosing AI content alone won't limit a video's audience" ([YouTube Help](https://support.google.com/youtube/answer/14328491)) |

Not labelling risks removal and is also a trust problem. In Sprout Social's Q3 2025 survey,
**52% of consumers** named brands posting undisclosed AI content as a top concern
([eMarketer](https://www.emarketer.com/content/ai-transparency--data-privacy-top-consumers--concerns-brands-on-social-media)).
In Clutch's 2026 survey of 601 consumers, 53% said they were less likely to buy from brands that
use AI in social content ([Business Wire](https://secure.businesswire.com/news/home/20260908931145/en/Clutch-Report-53-of-Consumers-Are-Less-Likely-to-Buy-From-Brands-Using-AI-on-Social-Media)).
**The real fix is to make AI non-load-bearing** (§5): label honestly now, and replace the stills
over time.

### 1.3 The narrator question

- Sound matters on TikTok: in a TikTok-commissioned Kantar study, **88%** of users called sound
  "essential" to the experience ([TikTok for Business](https://ads.tiktok.com/business/en-US/blog/kantar-report-how-brands-are-making-noise-and-driving-impact-with-sound-on-tiktok)).
  This is platform-funded research, but the direction is not disputed.
- Whether AI narration helps is **mixed and thin**. A study of 129 Bilibili videos found AI
  voices "less effective than human voiceovers in fostering audience engagement"
  (primary paper not located; treat as weak). Blind tests find listeners struggle to tell AI
  voices from human ones, and ratings drop once the AI is disclosed
  ([Radio Online](https://news.radio-online.com/articles/n49138/Study-Listeners-Struggle-to-Spot-AI-Voiceovers);
  [Barrett Media](https://barrettmedia.com/2026/07/14/crowd-react-media-study-divided-radio/)).
  WPP's ad tests found synthetic voices matched human ones on brand measures, although people
  stated a preference for human voices ([WPP Media](https://www.wppmedia.com/news/ai-voices-audio-ads)).
  Disclosure lowers ratings. No good 2025–26 study covers organic short-form trust.
- Our own review saw history videos (always narrated) at 6/5/3/7, the worst of any format.

**Decision:** no synthetic narrator on the lead formats. The human options, in order of trust,
are: (1) **the owner's own voice** recorded on a phone, which needs no camera and no AI label
(YouTube exempts your own voice); (2) **TikTok's in-app text-to-speech** as a test arm, which
viewers read as a platform convention rather than a fake person. It needs a human in the app.
Keep `--voice` (ElevenLabs) for the app-intro format only, and always label it.

### 1.4 Sound setup per post type

| Post type | Setup | Why |
|---|---|---|
| **List video** (lead) | **Captions + music bed**, keeping the existing whoosh/stamp SFX | Silent with SFX is sound-off-safe but reads as "template". A bed adds pace and mood at no legal risk. |
| **Before/after transform** | **Captions + music bed**. Test arm: owner's voice reading the one-line "why the step changed" | This is where a voice explains something and earns trust. |
| Recipe video (Originals) | Captions + bed, plus real kitchen foley (sizzle, knife) if the footage is real | Foley is what makes food feel real. |
| App intro / demo | **Narrated** (owner's voice preferred; ElevenLabs only with the AI label on every platform) | A demo with no voice reads as an ad. |
| IG carousel | None from the API. Optional: add a Sound Collection track in the app | Carousels with music can also appear in the Reels tab ([Pulse Advertising](https://www.pulse-advertising.com/?p=18822) *(vendor)*). |
| TikTok photo mode | `autoAddMusic: true` (already set) | TikTok picks a cleared track; no human step needed. |
| X / Threads video | Same master as TikTok, captions mandatory | X autoplays muted. |
| X / Threads text, image | None | |
| Pinterest video pin | Same master. It must work with the sound off | |

### 1.5 Mix spec (for the engineer)

- Final master: **−14 LUFS integrated, true peak ≤ −1 dBTP** (`ffmpeg loudnorm=I=-14:TP=-1:LRA=7`). This is the common short-form delivery convention, not a platform rule.
- Bed with no voice: about 8 dB under the SFX hits (stamp and whoosh must still land). Fade in 0.3 s, fade out over the last 1.0 s.
- Bed under a voice: sidechain-duck to **18 dB under the voice** while it speaks.
- Rotate at least 8 beds and never use the same bed on consecutive posts. Record `bed_id` in `record.json` so analytics can rule out the bed as a variable.

---

## 2. What gets views

### 2.1 What each algorithm weights now

| Platform | Signals that carry weight | Source |
|---|---|---|
| TikTok | Strong interest signals (e.g. finishing a longer video) outweigh weak ones. Shares, likes, comments and follows all count. **Follower count is not a direct factor.** | [TikTok newsroom](https://newsroom.tiktok.com/how-tiktok-recommends-videos-for-you?lang=en) |
| Instagram | "The top three signals … are watch time, likes and sends". **Sends matter more for reaching non-followers.** Measure average watch time, likes per reach and sends per reach. Watch time counts both as a percentage of the video and in absolute seconds. | [Mosseri via Social Media Today](https://www.socialmediatoday.com/news/instagram-shares-algorithm-insights-2025/738034/); [Fanpage Karma](https://www.fanpagekarma.com/insights/instagram-reels-algorithm/) |
| Instagram (originality) | Reposted content is labelled. Accounts that repost others' work 10+ times in 30 days leave recommendations, and Reels "visibly recycled" from other apps (watermarks) are shown less. | [PetaPixel 2026](https://petapixel.com/2026/04/30/new-instagram-policies-target-reposted-content/); [Adweek](https://www.adweek.com/?p=1264750) |
| YouTube Shorts | "Viewed vs swiped away" (in Studio) and retention. Since 31 Mar 2025 every start or replay counts as a view. | [vidIQ](https://vidiq.com/blog/post/youtube-shorts-algorithm/) *(vendor; no official weights)* |
| X | A weighted sum of predicted actions: like, reply, repost, quote, **share via DM**, profile click, **dwell**, video quality view, follow. These are minus negative actions (not interested, mute, block, report, "not dwelled"). Out-of-network posts are discounted, **new authors get a boost**, and repeated posts from one author decay. | [xai-org/x-algorithm](https://github.com/xai-org/x-algorithm) (open source, Jan 2026) |
| Threads | Replies and conversation, and staying in a niche. Links are "ranked properly" since 2025 but still rarely clicked. | [Social Media Today](https://www.socialmediatoday.com/news/meta-says-link-posts-ranked-properly-threads-reach/750126/); [Lindsey Gamble](https://www.lindseygamble.com/blog/threads-says-its-improving-how-it-ranks-posts-with-links) |

**What we optimise for:** IG **sends** ("send this to someone who cooks dairy-free" is right,
because it names a real person to send it to), TikTok **completion + shares**, YouTube
**viewed-vs-swiped**, and X **replies + dwell**. Comment bait is out (PLAYBOOK §9). A genuine
question that only the target audience can answer ("which one got you?") is fine.

**Guardrail for this niche:** TikTok prohibits content that "promotes disordered eating and
risky weight management" and marketing weight products with exaggerated claims
([TikTok guidelines](https://www.tiktok.com/community-guidelines/en/mental-behavioral-health)).
It also keeps "extreme fitness or dieting" out of repeated recommendations
([FYF standards](https://www.tiktok.com/community-guidelines/en/fyf-standards)). Frame every
post as **cooking around a diet**, never weight loss. No calorie-cutting hooks and no
body imagery.

### 2.2 The first 1–2 seconds

- **The promise is on screen at frame 0, in the search phrase.** TikTok's ad research found
  "over 63%" of its highest-CTR videos state their key message in the first 3 s
  ([TikTok for Business](https://ads.tiktok.com/business/en-US/blog/9-creative-tips-to-drive-auction-ad-performance)).
  That finding is correlational and from ads, but it is the best primary data available.
- Hook patterns that fit us, all already in the copy style: *"[Diet]? [Thing] can hide in
  these N"*, *"Looks [diet]. Isn't."*, *"Your [kitchen rule] is wrong"*, and *"The swap is easy.
  The step that changes is the part no one tells you"* (for transforms).
- The picture must agree with the headline in the first frame, as the reviewer has already said.
  Drop the second "teaser" line ("#5 is at the steakhouse") or hold it to ≤4 words. Two lines
  to read in under 2 s is how the hook gets skipped.
- Cover frame: TikTok `cover_ms` and the IG grid should show the headline frame, not a transition.

### 2.3 Length

Buffer's dataset of about 1.1 M TikToks shows 5–10 s clips get a **3.1 s median watch** and the
lowest reach. Videos over 60 s get 43% more reach than 30–60 s ones
([Buffer](https://buffer.com/resources/best-tiktok-video-length/);
[eMarketer](https://www.emarketer.com/content/longer-tiktoks-perform-better-new-opportunities-advertisers)).
This is correlational (it reflects who makes long videos), but nothing in it argues for 15 s.
Instagram counts absolute watch seconds as well as completion (§2.1).

**Targets:** list videos **28–35 s** (5 items, or 4 if the lines will not shorten), transforms
30–45 s, recipe videos 30–60 s, app intros ≤30 s. Never pad a video to reach a length; the
reading pace sets it.

### 2.4 Reading pace

**Evidence**

- Adults read continuous English non-fiction silently at about **238 wpm (4.0 words/s)**, with
  nothing else competing for attention ([Brysbaert 2019 meta-analysis](https://www.Gwern.net/doc/psychology/linguistics/2019-brysbaert.pdf)).
- Subtitles, where the viewer also watches the picture: BBC **160–180 wpm (2.7–3.0 words/s)**.
  Netflix allows 20 characters/s for adults
  ([BBC guidelines copy](https://clevercast.com/bbc-subtitling-guidelines);
  [Szarkowska et al.](https://ueaeprints.uea.ac.uk/id/eprint/100082/1/6_Szarkowska_et_al.pdf)).
- The traditional "six-second rule" for a cold read is **12 characters/s ≈ 144 wpm ≈ 2.4 words/s**
  ([SURE survey](https://dev-avt.ckc.uw.edu.pl/wp-content/uploads/sites/170/2016/12/Report_Survey2_SURE.pdf)).
  Our case is the cold-read case: no audio to lean on, a new photo every beat, and type the
  viewer has never seen.

**What we ship today:** `list-hidden-dairy` gave each item 66 frames (2.2 s) for the name, stamp
and line together, about 15–17 words, which is **about 7 words/s**. The current branch's
`READ_WPS = 3.5` counts only the `line` and caps an item at 4.6 s. That is still above the
subtitle ceiling, and it gives the name and stamp no time.

**The rule:**

| Text | Time on screen |
|---|---|
| Sentence text (item line, close note) | **0.4 s per word (2.5 words/s)** |
| Display text ≤3 words (item name, stamp, label) | 0.3 s per word |
| Each new photo or card | + 0.8 s to take in the picture |
| Hook | ≤8 words, hold 2.5–3.0 s |
| Close checklist | 0.6 s per item + 1.0 s, at least 4.0 s |

Worked item: "Canned tuna" (2) + "Some brands" (2) + "A few add casein. Check the can." (7)
= 0.6 + 0.6 + 2.8 + 0.8 = **4.8 s**. Five items plus a hook and close come to about 31 s.
**On-screen lines are capped at 7 words.** The full sentence goes in the caption.

### 2.5 Loops, series and saves vs shares vs comments

- **Series**: keep the numbered series ("Label Detective #4"). Platforms classify accounts by
  what their early posts attract ([Threads niche clustering](https://www.outfy.com/blog/how-threads-algorithm-works/) *(vendor)*).
  A series is also a reason to follow.
- **Loop**: end the close card on a frame that cuts cleanly back to the hook photo (same image,
  no fade to black). A rewatch counts as watch time, and on Shorts every replay is a view.
- **What each post asks for:** a list video asks for a send (IG) or share (TikTok). A carousel
  or checklist asks for a save (carousels get the most saves on IG,
  [Socialinsider](https://www.socialinsider.io/blog/instagram-hashtag-study/)). A transform asks
  for a comment ("what should we fix next?" is a real question, because the next transform
  answers it).

### 2.6 Search

| Platform | How discovery by search works | What we do |
|---|---|---|
| TikTok | Reportedly indexes caption, on-screen text, spoken words and hashtags; no official weights published ([Kapwing](https://www.kapwing.com/resources/tiktok-seo-how-to-get-more-views-with-tiktok-keywords/) *(vendor)*) | Search phrase in the hook text, at the start of the caption, and spoken if voiced (already P2) |
| Instagram | Public posts from professional accounts can appear in Google since 10 Jul 2025 ([Metricool](https://metricool.com/instagram-indexing-on-google/)) | Caption's first line = search phrase as a plain sentence; set alt text; leave indexing on |
| YouTube | Shorts surface in YouTube search; the title carries the most weight | Title leads with the phrase (done); first description line repeats it |
| Pinterest | A visual search engine. Title ≤100 chars (first 40 show), description ≤800, 2:3 at 1000×1500 ([Pinterest Business](https://business.pinterest.com/creative-best-practices/)) | Keyword boards; title = search phrase |

### 2.7 Cadence for a new account

PLAYBOOK §3 stands. Instagram has the only solid data: Buffer's 2 M-post study found
**3–5 posts a week** more than doubled follower growth versus 1–2, with diminishing returns
above that, and growth fell after a week with no posts
([Buffer](https://buffer.com/resources/how-often-to-post-on-instagram/)). For TikTok, X and
Shorts there is no comparable public study; the PLAYBOOK numbers are reasonable starting
points. **Consistency matters more than volume:** never queue more than a reviewed buffer allows.

---

## 3. Platform fit matrix

✅ = lead slot · ◐ = secondary · ✕ = do not post there

| Post type | TikTok | IG Reels | IG carousel / feed | TikTok photo mode | YT Shorts | X | Threads | Pinterest |
|---|---|---|---|---|---|---|---|---|
| List video | ✅ | ✅ | ✕ | ✕ | ✅ | ◐ native video | ◐ | ◐ video pin, later |
| List as a carousel (same items, one per slide) | ✕ | ✕ | ✅ | ✅ | ✕ | ◐ 4-image post | ◐ | ✅ as a 2:3 checklist pin |
| Before/after transform | ✅ | ✅ | ✅ (before → after slides) | ◐ | ✅ | ✅ | ◐ | ✅ links to the Original |
| Quiz carousel / swap guide | ✕ | ✕ | ✅ | ✅ | ✕ | ◐ image + answer thread | ◐ | ◐ |
| X text post / thread | ✕ | ✕ | ✕ | ✕ | ✕ | ✅ | ✅ | ✕ |
| Recipe video (Originals) | ◐ | ◐ | ◐ | ✕ | ◐ | ✕ | ✕ | ✅ |
| App intro | ◐ 1/week max | ◐ | ✕ | ✕ | ◐ | ◐ pinned | ✕ | ✕ |

**How each post type must be adapted per platform**

- **TikTok:** the full captions + bed master. Description: search phrase, one line, sources, 3–5 tags.
  Set the AIGC flag whenever there are AI stills. Photo mode: 6–10 slides, slide 1 = hook,
  `autoAddMusic`. Carousels versus video is contested: Fanpage Karma reports carousels get 81% more
  engagement at similar reach, while Metricool's 2.3 M-post set finds video gets about 5× the reach
  ([Fanpage Karma](https://www.fanpagekarma.com/insights/carousel-vs-video-performance-tiktok-instagram/);
  [search summary](https://oakgen.ai/blog/do-carousels-perform-better-what-2026-data-says)).
  Video is for reach and photo mode for saves, about 5:2 a week (as in PLAYBOOK).
- **Instagram:** Reels find new people (they win reach for accounts under 50k), and carousels earn
  engagement and saves ([Socialinsider](https://www.socialinsider.io/blog/instagram-hashtag-study/)).
  Upload clean files, never a TikTok download (watermark penalty). A carousel that is skipped
  is often re-shown starting at slide 2 ([Social Media Today](https://www.socialmediatoday.com/news/ig-chief-recommends-posting-carousels-to-improve-reach/730232/)),
  so **slide 2 must work as a second hook**. Use Trial Reels once eligible (reported at 200+
  followers for professional accounts *(vendor, unconfirmed)*) to test hooks on non-followers.
- **YouTube Shorts:** the same master, kept under 60 s so a stray Content ID claim can never
  block it ([YouTube Help](https://support.google.com/youtube/answer/13486873?hl=en)). Links in
  Shorts descriptions are not clickable since Aug 2023
  ([Tubefilter](https://tubefilter.com/2023/08/10/youtube-shorts-comments-spam/)). The bridge
  is the channel link and, later, a "related video" set in Studio (not available through the API).
- **X:** native video or a 2–4 image post plus a short text. **No link in the main post**: put it
  in a reply. The penalty for links is widely reported but anecdotal; the open-sourced ranker
  shows that link clicks are predicted, not penalised. Dwell and replies are weighted, so the
  thread format (image + answer in a reply) fits. Repeated posts from the same author decay, so
  no more than 2 a day. New authors get a boost, so the first weeks matter.
- **Threads:** text-first, conversational, one topic tag. Mirror the X post, rewritten to sound
  less like a headline. Links are acceptable but rarely clicked.
- **Pinterest:** 2:3 standard image pins linking to the Originals or swap-guide page are the
  workhorse. Tailwind found 89% of the most viral pins were static images
  ([Tailwind](https://www.tailwindapp.com/blog/video-pins-vs-static-pins) *(vendor)*). Treat
  "idea pins" as legacy and do not build for them. Video pins are a secondary test.

---

## 4. The bridge to the product

The evidence on recipe apps is thin: no published organic case study for Whisk, ReciMe, Mob or
similar. ReciMe's growth role is **paid TikTok UA** ([ReciMe job post](https://recime.notion.site/Growth-Marketing-Manager-Paid-UA-25b720b31dfb81b29693fab6349537ee)).
These are the patterns that hold across sources, ranked:

1. **Make the product the content.** The before/after transform ("the swap is easy; here is the
   step that changes") is useful to a stranger and only exists because RecipeFix made it. It
   grows from 10% to 30% of the mix (PLAYBOOK §2), already decided.
2. **Answer comments with a video.** A comment-reply video posts as a new video and links back
   to the comment ([TikTok newsroom](https://newsroom.tiktok.com/product-tutorial-reply-to-comments-with-video)).
   One DTC brand credited 11 such replies with 100k+ views each and a sales lift
   ([Glossy](https://www.glossy.co/fashion/how-brevite-used-tiktoks-comment-response-feature-to-drive-a-200-lift-in-sales),
   self-reported). Our version: "Can you make X gluten-free?" in the comments, then a transform
   of X. This is the most natural product demo we have.
3. **Pinned comment, written by a person:** "Want your own recipe done this way? Paste it at
   recipefix.app (link in bio)". One per post, never in the video.
4. **Profile = landing page.** TikTok needs a business account (registered) or 1,000 followers
   for a clickable bio link ([Shopify](https://www.shopify.com/blog/how-to-add-link-to-tiktok-bio) *(vendor)*).
   Instagram and Threads allow up to five. Use one UTM'd link per platform (P8).
5. **Pinterest is the only feed where a post *is* a link.** Every Original and transform pin links
   to its page.
6. **Never** end the video on the logo (the review penalised this every time), and never add a
   discount code or "download now" in the first month.

---

## 5. Not seeming AI

### 5.1 What viewers read as AI slop in food content

- **Food that is too perfect:** physics-defying melts, perfectly spherical scoops, identical
  styling across every image, and no process shots
  ([Whole Lotta Yum](https://wholelottayum.com/ai-recipes/);
  [UX Collective](https://uxdesign.cc/why-people-hate-viral-ai-food-posters-db2b4329ae11)).
- **Anatomical errors** (two-winged chickens, merged hot dogs) were the Instacart scandal
  ([Futurism](https://futurism.com/the-byte/instacart-caught-ai-generated-images-food)).
- **The same template with swapped footage.** This is our own reviewer's remaining complaint
  (PLAYBOOK §8).
- **Generic copy:** stock phrases, absolutes, no personal voice. The copy gate already handles this.
- **Synthetic narration** stacked on the above.

### 5.2 What we do, given no footage and no face

| Lever | Cost | Effect |
|---|---|---|
| **Pexels video clips** in place of AI stills: hands chopping, grocery aisles, pans. Free for commercial use, no attribution, editable. No implied endorsement and no use as a trademark ([Pexels licence](https://www.pexels.com/license/)) | $0 + an API key | Moving, real footage is the step up the review asked for. Avoid clips with identifiable faces or brand packaging. |
| **Owner, hands only, phone:** 15 min a week filming real ingredient labels (the caseinate line on a creamer tub), a pan, a measuring cup. Blur brand logos. | $0, human | A real label is proof as well as footage. It is the highest-trust asset available without a face. |
| **Owner's voice** on transforms (phone mic, quiet room) | $0, human | A real voice with no AI label. YouTube exempts your own voice from disclosure. |
| AI stills only where no real asset fits, styled imperfectly (crumbs, uneven light, partial framing), and **labelled** | ~$0.05 | Keeps volume while the real library grows. |
| Paid stock: Storyblocks Unlimited is about $360/yr and its licence survives cancellation; Artgrid is about $20–30/mo and the licence ends with the subscription ([Storyblocks](https://pricingsaas.com/companies/storyblocks); [Photutorial](https://photutorial.com/artgrid-review) *(vendor)*) | Over the $0 budget | **Deferred.** Revisit if Pexels coverage of label close-ups proves too thin. Storyblocks is the pick. |
| Vary the layout per item (text position, crop, push-in on one detail) | engineering | Answers "templated by item 3". |

---

## 6. What we do next (in priority order)

1. **Correct the AI disclosure.** In `buildTarget` (`src/publish.ts`), set TikTok
   `isAiGenerated` and YouTube `containsSyntheticMedia` to **true whenever a post contains a
   generated photoreal asset** (derive it from `record.assets[].provenance`, not `ai_voice`).
   Add `disclosures.ai_images: true` to the record. For Instagram, either label in the app
   before publishing (add a checklist item in the approval page) or add a caption line
   "Illustrations: AI-generated" if Blotato cannot set Meta's label. Test: a record with a
   `generatedPhoto` asset must produce `isAiGenerated: true`.
2. **Reading pace in `src/formats/list.ts`.** Set `READ_WPS = 2.5` for sentence text. Time the
   name and stamp at 0.3 s/word, plus `PHOTO_S = 0.8` per new photo. Raise the per-item cap from
   4.6 s to 6.0 s. Hook ≤8 words held 2.5–3.0 s. Close card 0.6 s × items + 1.0 s, minimum 4.0 s.
   Add a QA check that fails a render when any beat's words exceed its time at these rates, and
   fails **on-screen item lines over 7 words**. Port the same timing helper to transform, carousel
   timing (photo mode has none) and the recipe format.
3. **Music beds.** Create `audio/beds/` with 8+ original 30–45 s GarageBand arrangements
   (several loops each, ≈90–110 BPM, no vocals). Store the `.band` project and a
   `beds.json` (id, BPM, mood, provenance "original composition from Apple Loops (Apple Support
   102034)"). Add `bed` to the List/Transform/Recipe compositions with the §1.5 mix
   (`loudnorm=I=-14:TP=-1`, bed −8 dB under SFX, duck −18 dB under voice, 0.3 s fade in and 1 s
   fade out). Rotate beds with no repeat on consecutive posts, and record `bed_id`.
4. **Real footage.** Add a `stockClip(query)` helper using the Pexels API (free key): vertical
   ≥1080p, no faces, licence and URL recorded as an asset. Prefer a clip, fall back to an AI
   still (labelled). Render clips with a slow push-in. Start with the hook beat and one item per
   video, then measure.
5. **Hook frame.** Make the `hook_sub` teaser optional and ≤4 words. QA asserts the
   `search_phrase` words appear in frame-0 text and that `cover_ms` lands on the hook frame.
6. **Length and loop.** Target list length 28–35 s (fail QA under 22 s or over 40 s). Make the
   close card's last 0.3 s cut to the hook photo for a clean loop.
7. **Narration policy.** Set `--voice` off by default for list and transform. Add a `--owner-voice
   <wav>` path that skips ElevenLabs and runs whisper timing on the owner's recording. Keep
   ElevenLabs for `mk app` only, always with the AI flags from step 1.
8. **Per-platform adaptation.** IG carousel: slide 2 written as a second hook (QA it). X: if
   there is a link, it goes in `thread[0]`, never in `text`. YouTube: assert duration < 60 s
   when any non-owned audio is present. Pinterest: build the 2:3 checklist pin from list items
   (P6).
9. **Bridge kit (assist).** Each run emits `pinned_comment` text per platform (UTM link
   wording), and the daily digest lists "can you make X…?" comments as transform candidates.
10. **Measurement (P7).** Pull and store per post: average watch time, completion, sends/shares
    per reach, saves per reach, YouTube viewed-vs-swiped, and `bed_id` / `voice` / `footage:
    real|ai`. After 4 weeks, compare real-footage against AI-still posts, and bed against
    SFX-only, before deciding anything else.

**Human-only, cheap, high-value:** register the TikTok business account (bio link); film 15 min
a week of hands-only label close-ups; record a voice line for each transform; add CML or Sound
Collection tracks to proven winners in the app; reply to comments in the first hour.
