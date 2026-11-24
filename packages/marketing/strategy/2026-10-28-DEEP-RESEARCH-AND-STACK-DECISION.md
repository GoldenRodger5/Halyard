# RecipeFix Social Studio — Deep Research and Tool Decisions
Date: 2026-10-28 | Type: source-based research and recommendations, NOT evidence of completed pilots.
Authority: FOUNDER_OPERATING_MODEL_2026-10-28.md and CREATIVE_RESET_2026-10-28.md.

## Executive decision
Halyard remains the project workspace and owns knowledge, claims, asset rights, rendering coordination, preview/approvals, calendar, and distribution evidence. It is NOT limited to its existing layouts, editorial tastes, or video engines. The objective is exceptional, varied content across TikTok, Instagram, YouTube Shorts and X, collaboratively produced in a founder-led 1–2-day session every 14 days. After exact post approval, publishing, reporting and source-linked market research can operate without daily founder intervention.

Do not rebuild Halyard. The current marketing package already has Remotion, Sharp and formats named app, carousel, history, list, quiz, recipe, slides, transform and versus. The prior seven darkened-footage/list cuts and Roger voice are expressly REJECTED. Its automatic critic incorrectly approved an owner-rejected cut. Make actual creative quality the approval authority, not the number of passes or templates.

## Platform-specific creative strategy
| Network | Native audience behavior to test | What RecipeFix should make | Meaningful outcomes |
| --- | --- | --- | --- |
| TikTok | Fast visual curiosity, satisfying payoff, participatory stories, entertaining motion | One vivid transformation; animated food games; real UI demos with a compelling problem; photo swipe posts when better than motion | 2s/6s hold, average view duration, comments, followers, clicks to real app |
| Instagram | Reels for short narratives; polished saveable carousels, photos, Stories and community questions | Recipe transformation swipe, magazine recipe graphic, nutrition before/after, quiz carousel, Reel adapted to IG tone, Story poll | Saves/shares, profile visits, reply themes, qualified app visits |
| YouTube Shorts | Standalone satisfying explanation with relevant title/search metadata | Slightly deeper screen-recorded method demonstration; animated food-history reveal; complete short tutorial | Shown in feed, chose-to-view vs swipe-away, average percent viewed, subscribers and engaged views |
| X | Useful conversational posts, original ideas, questions, visual facts, native polls | Honest side-by-side screenshot, opinion/question, mini-thread, food history, funny cooking hot take, poll | Replies, reposts, useful audience conversations, qualified profile clicks |

These are STARTING HYPOTHESES, not guaranteed formulae. YouTube expressly says no particular Shorts format or fixed minimum cadence is privileged. TikTok Creative Center's Top Ads are AD examples, not causal evidence for organic growth. Source: https://support.google.com/youtube/answer/11914225 ; https://support.google.com/youtube/answer/12942217 ; https://ads.tiktok.com/business/en/guides/what-is-ad-creative-guide ; https://ads.tiktok.com/resources/help/article/how-to-use-the-top-ads-dashboard ; https://about.fb.com/news/2024/10/best-practices-education-hub-creators-instagram/ ; https://help.x.com/en/business-and-advertising/creative-ad-specifications

**One idea -> not necessarily four identical outputs.** A funny debate might be an X poll and IG carousel only. A real Adapt-and-Cook demonstration might justify distinct TikTok, Reels and Shorts video edits. We prioritize relevance over filling every slot.

## Recommended creative stack, ranked
| Choice | Decision | What it enables | Cost, risks, proof needed |
| --- | --- | --- | --- |
| Remotion + FFmpeg | CORE NOW | Multiple custom motion scenes, accurate app edits, beautiful typography, effects, grading/audio, 9:16 and other exports | Already present; no extra rendering credits; Remotion free license for individuals/companies up to 3 people (verify future scale). Compare actual finished result, not template count. https://www.remotion.pro/license |
| Playwright + safe test browser | FIRST PILOT | Actual RecipeFix UI walkthroughs, coherent click/scroll/input/recipe transform, real data; crop/zoom into exact changed ingredients/method | Local; choose explicit vertical recording dimensions (Playwright defaults can downscale), mask private data and never simulate product successes. https://playwright.dev/docs/videos |
| HyperFrames by HeyGen | HIGH-PRIORITY SIDE-BY-SIDE | Agent-native HTML/CSS/GSAP-to-video for bespoke cinematic promos, vector action, ingredient/reveal motion | Open source Apache-2.0; Node/FFmpeg, not proved more beautiful than Remotion in this project. Run SAME creative brief and compare quality/time. https://github.com/heygen-com/hyperframes |
| Sharp + Satori | HIGH-PRIORITY VISUAL PILOT | Magazine-level IG carousel, infographic, X graphic, quirky trivia/game cover | Sharp installed; Satori MPL-2.0 static JSX->SVG; limited CSS subset, verify raster fidelity and typography. https://github.com/vercel/satori |
| Motion Canvas | CONDITIONAL | Deeply choreographed vector timelines, physical/visual explanations and food-history games | Free/open-source TypeScript animation, but second renderer increases complexity. Test only if Remotion/HyperFrames fail an ambitious vector pilot. https://motioncanvas.io/docs/ |
| Optional caption/audio tools | AS NEEDED | Word-accurate animated subtitles, original kitchen sound, music from properly licensed libraries, an occasional genuinely good narration | No mandatory narrator; previous Roger cut rejected; never assume ElevenLabs settings produce natural performance. https://github.com/francozanardi/tscaps |
| Licensed food clips | SUPPORT ONLY | Real cooking texture and interest within a truthful story | Pexels licensing and individual rights, track attribution/source. Stock cannot prove an actual label, weighed amount, RecipeFix bake, or before/after cooking. https://www.pexels.com/license/ |
| Hosted image-to-video AI scenes | FINITE PILOT | 2–5-second moving, playful, imaginative scenes or graphic transitions; strong variation when no real footage | LTX 2.3 Fast 720x1280: $0.03/second (five seconds ~$0.15, excluding retries). Kling 2.5 Turbo Pro: ~$0.35 for five seconds. Inspect actual clips and provider terms. https://docs.ltx.io/pricing/ ; https://fal.ai/explore/image-to-video-apis |
| Google Gemini Omni video | SECOND COMPARATOR ONLY | More flexible multimodal video generation/editing if first AI test inadequate | Roughly $0.10 per second standard API effective pricing. Veo 3.1 Preview model IDs were deactivated October 22, 2026: DO NOT implement old examples. https://ai.google.dev/gemini-api/docs/video ; https://ai.google.dev/gemini-api/docs/pricing |
| Wan 2.2 / LTX open weights | RESEARCH/DEFER LOCAL | Potential large-scale controllable generative footage later | Local production compute is NOT free. LTX-2.5 full local guide lists Nvidia 32GB+ VRAM/100GB+ storage, not a trivial Mac run. Use hosted 5s pilot first. https://github.com/Wan-Video/Wan2.2 ; https://docs.ltx.io/open-source-model/getting-started/system-requirements |
| Descript/CapCut/Meta Edits | HUMAN EDIT OPTION | Founder-led timeline polishing if code rendering gets in the way | Descript currently imports but AI editing failed for plan credits. No subscription before actual edit beats local tools. |

### Video quality principles
Build compelling OPENING -> ACTION -> REVEAL/PAYOFF -> USEFUL NEXT STEP, without forcing identical timing. Shots should change the viewer's understanding, not merely pan still stock. Real screen recordings are proof of app behavior only; AI-generative cooking imagery cannot attest to food physics, genuine labels, customer reviews or cooked outcomes. Different episode genres deserve distinct visual identities: playful colorful game show, bright food editorial, sleek app cinema, historical storybook, genuinely funny social text, clear cooking technique.

Evaluate each candidate at 390px actual feed size, mute and sound-on. Owner/editorial evaluation checks: stop-worthy opening, visible event, evolving story, payoff, accurate claims, natural visual pacing, typography, sound rights, overall polish and app bridge. Reject even if automated scores pass. Do not make post-production policies that homogenize every creative.

## Distribution research and decision
| Provider | Public offer as of Oct 2026 | Strength | Important missing proof |
| --- | --- | --- | --- |
| Blotato Starter | $29/month, API/MCP, up to 20 connected social accounts, nine publishing networks, analytics now covers eight, Instagram/Facebook own-comment and DM capabilities | Existing Halyard code; richest single connected publishing and engagement candidate | Last use returned expired subscription; connected accounts are not RecipeFix-verified. API excluded from free trial. Viral-post discovery database may be Creator tier, not Starter. None of four RecipeFix connections was proven. https://www.blotato.com/pricing ; https://www.blotato.com/blog/blotato-analytics-launch |
| Buffer Free | $0, 3 channels, 10 pending posts per channel, API access | Cheap fallback / controlled API test | Four-channel and complete 14-day daily queue exceed free limits without a hybrid. https://buffer.com/pricing |
| Buffer Essentials | $5 per channel monthly equivalent with ANNUAL billing; about $20 equivalent for four channels, ~ $24 if billed monthly | Possibly most cost-aligned paid four-channel scheduling | Check actual provider media limits, channel features, analytics and account IDs; annual commitment must be chosen by founder. https://buffer.com/pricing |
| Metricool | Free: 1 brand, 20 posts per month, competitor insights; X excluded from free. Starter around €20/month, X extra | Owned stats/competitor discovery can help | Connected Metricool inventory in this chat contains only MomentCircuit accounts. NEVER use them to post RecipeFix. https://metricool.com/pricing/ |
| Postiz self-host | Open source AGPL scheduler | Fallback if provider cost/API constrains operations | OAuth developer approvals, updates, server availability, platform API fees, maintenance and terms make it not automatically $0. https://github.com/gitroomhq/postiz-app |

**Current Blotato reconciliation:** An older help FAQ claims comments/analytics unsupported, contradicted by the vendor's more recent documented launches. Verify current live API plus exact Starter limits; don't use help FAQ as current truth. Instagram/Facebook own-post comments and opted-in DMs do NOT grant arbitrary access to comments across TikTok/X/YouTube or permission to mass message strangers.

Publishing platform decision sequence: first prove RecipeFix-owned account identity + access, supported media types (automatic vs notification-only), schedule, no duplicate publish, readback provider ID/URL, analytics availability, and reversible queue; then choose platform. No purchase, posting or unauthorized account association is approved by this document.

## Source-linked market research agent
Goal: enrich the founder's 14-day creative decision with genuinely current audience questions, creator styles, comments, history/seasonal opportunities and safe community leads. Sources: TikTok Creative Center, public authorized creator posts, YouTube Data API and own YouTube Studio, Google Trends user-facing view (formal API is limited alpha), Reddit conversations within terms, RecipeFix first-party search intent and verified own-account comments in Blotato/Metricool. Cite full source URL, date and timestamp, audience intent, potential format and why relevant. Avoid pretending ads and native short-form performance are comparable. https://ads.tiktok.com/business/creativecenter/topads/7290531092313620481/pc/en ; https://developers.google.com/youtube/data/reference/rest/v3/search/list ; https://developers.google.com/search/apis/trends

One research brief should supply: five to ten high-signal source-linked discoveries, three creative opportunities, three unanswered owned-user questions, a watchlist of relevant channels, two or three opportunities to interact helpfully, suggested founder-review drafts and account-specific missing capabilities. A research suggestion is NOT authorization to comment, DM, follow, scrape or engage automatically.

## Proposed cost envelope and limitations
Recurring subscription target: $0 preferred, approximately $20/month ideal; $29/month Blotato would require proof of incremental value and explicit approval. Proposed **one-time creative experiment variable spend ceiling $12**, not authorized until the founder confirms; baseline Remotion/Playwright/Satori/HyperFrames dry-render costs no provider credits. AI video incurs charges, including failed/retied attempts depending on provider. Compare results, not marketing claims.

The experimental test phase must document actual rendering latency, developer iteration burden, end quality, footage rights, provider response, spend, reliable export and integration. Current research cannot promise virality or new paid subscribers.

## Product-owner selection
**Standard creative base:** Halyard orchestration + Remotion + FFmpeg + Playwright + Sharp; optional Satori if graphic pilot improves visual quality.
**First R&D challenge:** Remotion vs HyperFrames on a visually ambitious RecipeFix video; Satori/Sharp on a premium carousel; one approved short LTX 2.3 motion clip versus an entirely code-animated scene.
**Only import Motion Canvas or additional AI-video tools on measured creative gains.**
**No expensive new platform or local video-model install now.**
**No creative output accepted or auto-published merely because the pipeline renders successfully.**
