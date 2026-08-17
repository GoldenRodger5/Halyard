# Halyard — Engineering Deep Dive

This document is for engineers extending Halyard with multi-agent social intelligence and automation. It explains **exactly how Halyard works** today, grounded in actual code and database structure.

---

## 1. Agentic Architecture

### Current State: Not a Multi-Agent System

Halyard does **NOT** use:
- Agent loops or tool-calling patterns
- Function calling APIs
- Multi-agent orchestrators
- Subagents or supervisors
- Persistent agent state or memory
- Structured output schema libraries

Halyard **DOES** use:
- **Input-gated workflows** (the Daily Take loop)
- **Deterministic QC gates** as feedback and retry controllers
- **Single LLM calls** with structured output extraction
- **Retry loops** with feedback-based regeneration
- **Background job execution** (not agents)

### [TRUE WORKFLOW] Daily Take Loop

**NAME:** `runTakeLoop`  
**FILE:** [packages/core/src/founder/dailyTake.ts](packages/core/src/founder/dailyTake.ts#L360)  
**PURPOSE:** Input-gated workflow for founder commentary on news stories  
**ENTRY POINT:** Web action in [apps/web/src/app/(dashboard)/take/actions.ts](apps/web/src/app/(dashboard)/take/actions.ts#L45)  
**TRIGGER:** User submits story URL + raw reaction  
**MODEL:** Claude Opus 4.5 (strategy model)  
**SYSTEM PROMPT:** Fact-checking guidance  
**TOOLS:** None (web search is optional external dependency)  
**INPUT:** Story (title, URL, optional summary) + founder's reaction  
**OUTPUT:** Staged result object with stage indicator ('needs_input', 'needs_revision', 'ready_to_draft')  
**STATE:** Returns to UI for user confirmation  
**MEMORY:** None (stateless per invocation)  
**DATABASE:** Reads rss_sources, rss_items, writes to content_items  
**LOOP:** Five-step deterministic pipeline:

1. **factCheckTake()** — Fact-check claims before drafting
2. **strengthenTake()** — Find strongest counter-argument
3. **draftTake()** — Draft the founder's take
4. **verifyPushback()** — Predict criticism
5. **Return staged result** — Not a retry loop; user decides next step

**MAX ITERATIONS:** None (single pass per invoke)  
**RETRY LOGIC:** None (user revises input)  
**ERROR HANDLING:** Returns `needs_revision` state if verification fails  
**HUMAN APPROVAL:** Required at every stage (user confirms or revises)  
**FILES:** dailyTake.ts, founder.test.ts  
**FUNCTIONS:** `runTakeLoop()`, `factCheckTake()`, `strengthenTake()`, `draftTake()`, `verifyPushback()`  
**CURRENT STATUS:** [IMPLEMENTED] — Fully built, tested, deployed

---

### [LLM FUNCTION] writeDraft (Copy Generation)

**NAME:** `writeDraft`  
**FILE:** [packages/core/src/generation/copywriter.ts](packages/core/src/generation/copywriter.ts#L87)  
**PURPOSE:** Generate platform-specific social post copy  
**ENTRY POINT:** [apps/worker/src/handlers/generate.ts](apps/worker/src/handlers/generate.ts#L333)  
**TRIGGER:** `generate` job in worker queue  
**MODEL:** Claude Sonnet 4.6 (draft model)  
**SYSTEM PROMPT:** Voice, platform brief, style rules, hard rules (in [buildCopywriterPrompt](packages/core/src/generation/prompts.ts#L92))  
**TOOLS:** None (reads from database)  
**INPUT:** `DraftRequest` with idea, artifact, voice, platform, format, category  
**OUTPUT:** `Draft` with body, hashtags, claims, QC results  
**STATE:** Stored in content_items table  
**MEMORY:** None  
**DATABASE:** Reads ideas, artifacts, brand_voices; writes content_items  
**LOOP:** **Retry loop with feedback**

```
attempt = 1 to maxAttempts (default 3):
  1. Call model with prompt + feedback
  2. Parse JSON from response
  3. Run QC gates on output
  4. If passed: return Draft
  5. If failed: build feedback from QC violations, retry
```

**MAX ITERATIONS:** 3 (configurable)  
**RETRY LOGIC:** Feedback-driven regeneration with gate violation details  
**ERROR HANDLING:** `DraftRejectedError` thrown after max attempts  
**HUMAN APPROVAL:** Content enters approval queue; human can reject and trigger regeneration  
**FILES:** copywriter.ts, generation.test.ts  
**FUNCTIONS:** `writeDraft()`, `buildFeedback()`  
**CURRENT STATUS:** [IMPLEMENTED] — Core generation system

---

### [PIPELINE] Content Generation Pipeline

**NAME:** Generation handler  
**FILE:** [apps/worker/src/handlers/generate.ts](apps/worker/src/handlers/generate.ts)  
**PURPOSE:** Daily content generation and scheduling  
**ENTRY POINT:** `generate` job (triggered daily and manually)  
**INPUT:** Product ID, optional limits  
**OUTPUT:** Content items queued for approval  
**FLOW:**

```
1. Load product, ideas, mix state, voice, templates
2. Filter ideas (proposed, not snoozed, not expired)
3. Select ideas based on mix targets (content_mix_actual)
4. For each selected idea and account:
   a. Fetch connector artifact (generateSample)
   b. Choose format for platform
   c. Call writeDraft per platform
   d. Run hook stage optimization
   e. Create content_item in DB
   f. Enqueue render jobs
   g. Enqueue TTS job (if video)
5. Mark ideas as 'used'
```

**TOOLS:** Connectors (RecipeFix via MCP, GitHub)  
**QC GATES:** Multiple gates block low-quality output before queue  
**HUMAN APPROVAL:** Queue requires approval before scheduling  
**DATABASE:** Reads ideas, products, brand_voices; writes content_items, renders, jobs  
**CURRENT STATUS:** [IMPLEMENTED]

---

### No Other Agents Found

Search for agent-like patterns yields:
- `runTakeLoop` — only true workflow
- Job handlers — deterministic, not agentic
- No tool registries, no function calling APIs
- No persistent agent state or memory
- No routers, supervisors, or sub-agents

---

## 2. Agent / Workflow Graph

Current graph (what actually exists):

```
┌─────────────────────────────────────────┐
│         Operator UI (Next.js)            │
│  ┌─────────────┐      ┌──────────────┐  │
│  │   Dashboard │      │  Daily Take  │  │
│  │   ├ Queue   │      │  (Input)     │  │
│  │   ├ Inbox   │      │              │  │
│  │   ├ Accounts│      └──────────────┘  │
│  │   └ Setup   │            ↓           │
│  └─────────────┘      runTakeLoop()     │
└──────────────────────────────────────────┘
       ↓              ↓
       │         [LLM: Claude Opus]
       │              ↓
       │         factCheckTake()
       │         strengthenTake()
       │         draftTake()
       ↓              ↓
   ┌─────────────────────────┐
   │   Content Approval      │
   │   (Human gate)          │
   └─────────────────────────┘
       ↓ (approved)
   ┌─────────────────────────┐
   │  Scheduled Queue        │
   │  (content_items table)  │
   └─────────────────────────┘
       ↓ (at scheduled time)
   ┌─────────────────────────┐
   │   Worker Job Queue      │
   │  ├ generate             │
   │  ├ render               │
   │  ├ tts                  │
   │  ├ publish              │
   │  ├ collect_metrics      │
   │  └ [19 more job kinds]  │
   └─────────────────────────┘
       ↓ (per job kind)
   ┌─────────────────────────┐
   │  Job Handlers           │
   │ ┌──────────────────────┐│
   │ │ publishHandler       ││ → [QC gates] → Publish
   │ │ generateHandler      ││ → [writeDraft] → Queue
   │ │ renderHandler        ││ → [Remotion] → Assets
   │ │ ttsHandler           ││ → [TTS API] → Audio
   │ │ collectMetricsHandler││ → [Platform API] → Metrics
   │ └──────────────────────┘│
   └─────────────────────────┘
       ↓
   ┌─────────────────────────┐
   │  Platform Adapters      │
   │ ┌──────────────────────┐│
   │ │ X, Instagram, TikTok││
   │ │ YouTube, Pinterest   ││
   │ │ Threads, Bluesky     ││
   │ └──────────────────────┘│
   └─────────────────────────┘
       ↓
   ┌─────────────────────────┐
   │  Social Platforms       │
   └─────────────────────────┘
```

**Key edges:**

| From | To | Code |
|---|---|---|
| UI Submit | runTakeLoop | apps/web/src/app/(dashboard)/take/actions.ts#45 |
| runTakeLoop | LLM | packages/core/src/founder/dailyTake.ts#82 |
| Dashboard Approve | content_items insert | apps/web/src/app/(dashboard)/queue/actions.ts |
| Scheduled time | publish job | apps/worker/src/scheduler.ts#205 |
| publish job | publishHandler | apps/worker/src/poller.ts#116 |
| publishHandler | platform adapter.publish() | apps/worker/src/handlers/publish.ts#314 |
| platform.publish | HTTP POST | packages/core/src/adapters/x.ts#174 |

---

## 3. All AI Models

### Anthropic Claude

**PROVIDER:** Anthropic  
**MODELS:** 
- Strategy: `claude-opus-4-5` (expensive, used for planning)
- Draft: `claude-sonnet-4-6` (cheaper, used for volume work)

**SDK:** `@anthropic-ai/sdk`  
**FILES:** [packages/core/src/generation/llm.ts](packages/core/src/generation/llm.ts)  
**CLASS:** `AnthropicLlmClient`  
**PURPOSE:** Primary LLM provider  
**TEMPERATURE:** 1 (default, sampled)  
**MAX TOKENS:** 2000 (copywriter), 1200 (fact check)  
**SYSTEM PROMPT:** Per-function (see Section 4)  
**USER PROMPT:** Context-dependent  
**STRUCTURED OUTPUT:** JSON extraction via `extractJson()`  
**TOOLS:** None (no tool calling)  
**FALLBACK:** OpenAI (if Anthropic key not set)  
**RETRY:** Built into writeDraft loop, not at model level  
**TIMEOUT:** 30s HTTP timeout  
**COST CONTROL:** Token usage tracked, reported per call  
**CONTEXT WINDOW:** 200K (not fully used; max tokens per call is ~2000)  
**STREAMING:** No  
**CURRENT USE:** Content generation, Daily Takes, idea evaluation  

**Pricing tracked in code:**
```typescript
const PRICING_PER_MTOK = {
  'claude-opus-4-5': { input: 5, output: 25 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
};
```

---

### OpenAI GPT

**PROVIDER:** OpenAI  
**MODELS:** `gpt-5.5` (for both strategy and draft)  
**SDK:** Manual HTTP calls  
**FILES:** [packages/core/src/generation/openai.ts](packages/core/src/generation/openai.ts)  
**CLASS:** `OpenAiLlmClient`  
**PURPOSE:** Fallback when Anthropic unavailable  
**TEMPERATURE:** 1  
**MAX TOKENS:** 1500 (copywriter)  
**STRUCTURED OUTPUT:** JSON extraction  
**TOOLS:** None  
**RETRY:** Same as Anthropic  
**TIMEOUT:** 30s HTTP timeout  
**COST CONTROL:** Pricing estimated (not fetched); stored in generation_meta  
**CONTEXT WINDOW:** 128K  
**STREAMING:** No  
**CURRENT USE:** Fallback only (cold-start until Anthropic available)  
**INTERCHANGEABILITY:** Prompts are compatible; output parsing is identical  

---

### OpenAI Vision

**PROVIDER:** OpenAI  
**MODEL:** `gpt-4-vision-preview`  
**FILES:** [packages/core/src/generation/vision.ts](packages/core/src/generation/vision.ts)  
**PURPOSE:** Frame description and QC (coherence check)  
**INPUT:** Base64-encoded image  
**OUTPUT:** Structured JSON description  
**USED BY:** [apps/worker/src/handlers/reviewMedia.ts](apps/worker/src/handlers/reviewMedia.ts)  
**JOB KIND:** `review_media` (post-render inspection)  
**CURRENT STATUS:** [IMPLEMENTED] — Milestone 52

---

### No Other AI Models

- No fine-tuned models
- No embedding models (similarity search uses raw cosine distance)
- No speech recognition (transcription is OpenAI only, optional)
- No proprietary models

---

## 4. All Prompts

### copywriter.v1 — Copy Generation

**FILE:** [packages/core/src/generation/prompts.ts](packages/core/src/generation/prompts.ts#L92)  
**FUNCTION:** `buildCopywriterPrompt(context)`  
**MODEL:** Claude Sonnet 4.6  
**INPUT SCHEMA:** `CopywriterContext`  
**OUTPUT SCHEMA:** JSON with `body`, `title`, `alt_text`, `hashtags`, `claims`, `hook_pattern`  
**SYSTEM PROMPT:** Voice rules, platform brief, style rules, hard rules  
**VARIABLES:**
- Brand voice (name, description, do/don't rules)
- Platform (determines character limit, hashtag range)
- Format (image, carousel, video, story, pin)
- Category (transformation, education, community, product, founder_insight)
- Idea (title, angle)
- Product artifact (real output, source of truth for claims)
- Hooks (recurring successful patterns)
- Series info (if part of a recurring format)
- Product rules (forbidden claims, banned phrases)

**HARD RULES BLOCK:** Enforced violations that reject output:
- Never claim nutrition figures are accurate/verified
- Never state substitution is perfect 1:1 replacement
- Never invent product capabilities not in brief
- Never mention competitor by name
- Every factual claim must trace to artifact

**STYLE RULES BLOCK:** Lint rules applied via `slopFilter()`:
- No em dashes, en dashes outside ranges, ellipsis character
- Max one emoji, and only where it carries meaning
- Specific banned phrases (game changer, revolutionize, 10x, etc.)
- Opening line: 12 words max
- Average sentence under 22 words
- No stacked adjectives

**DOWNSTREAM:** [writeDraft()](packages/core/src/generation/copywriter.ts#L87) calls it, extracts JSON, runs QC gates  

**VERSION TRACKING:** Stamped as `copywriter.v1` in generation_meta  

**CURRENT STATUS:** [IMPLEMENTED]

---

### idea_generator.v1 — Idea Scoring

**FILE:** [prompts/idea_generator.v1.md](prompts/idea_generator.v1.md)  
**FUNCTION:** [selectIdeas()](packages/core/src/generation/ideaEngine.ts)  
**MODEL:** Claude Opus 4.5 (strategy)  
**PURPOSE:** Score proposed ideas and rank them by mix targets  
**INPUT:** Proposed ideas, mix targets (transformation 20%, education 30%, etc.), novelty embeddings  
**OUTPUT:** Ranked list of ideas to draft, with scores  
**CURRENT STATUS:** [IMPLEMENTED] — Deterministic scoring logic, not an LLM call per idea

---

### reply_drafter.v1 — Comment Replies

**FILE:** [prompts/reply_drafter.v1.md](prompts/reply_drafter.v1.md)  
**FUNCTION:** [buildReplyDraftPrompt()](packages/core/src/generation/prompts.ts#L270)  
**MODEL:** Claude Sonnet 4.6  
**PURPOSE:** Draft founder reply to comments  
**ENTRY POINT:** [apps/web/src/app/(dashboard)/inbox/actions.ts](apps/web/src/app/(dashboard)/inbox/actions.ts#L6)  
**INPUT:** Comment text, post context, founder voice  
**OUTPUT:** Suggested reply text (human sends or edits)  
**APPROVAL:** Manual send required; no auto-reply method exists  
**CURRENT STATUS:** [IMPLEMENTED]

---

### vo_script.v1 — Voiceover Script

**FILE:** [prompts/vo_script.v1.md](prompts/vo_script.v1.md)  
**FUNCTION:** [writeVoScript()](packages/core/src/generation/copywriter.ts#L310)  
**MODEL:** Claude Sonnet 4.6  
**PURPOSE:** Write script for video voiceover  
**TARGET DURATION:** 22 seconds (mid-band pacing ~158 wpm)  
**CONSTRAINTS:**
- No hashtags, no emoji, no CTA
- Spoken punctuation only (no parentheticals)
- Numbers spelled out
- Sentence fragments for pacing

**QC GATES:** Same as copy (slopFilter, claim verifier)  
**UPSTREAM:** Enqueued as `tts` job after generation  
**CURRENT STATUS:** [IMPLEMENTED]

---

### take_fact_check.v1 — Daily Take Fact-Check

**FILE:** [packages/core/src/founder/dailyTake.ts](packages/core/src/founder/dailyTake.ts#L27)  
**FUNCTION:** `factCheckTake()`  
**MODEL:** Claude Opus 4.5  
**PURPOSE:** Verify founder claims before drafting  
**INPUT:** Raw reaction, story title, optional summary, optional web search results  
**OUTPUT SCHEMA:**
```json
{
  "claims": [
    {
      "claim": "...",
      "verdict": "supported|contradicted|unverifiable|imprecise",
      "note": "...",
      "sources": [],
      "correction": "..."  // optional
    }
  ],
  "story_verified": boolean,
  "story_note": "..."
}
```

**DECISION LOGIC:**
- If any claim contradicted → return `needs_revision`
- If all unverifiable but story OK → proceed to next step
- If story verified → proceed

**CURRENT STATUS:** [IMPLEMENTED]

---

### Format-Specific Prompts (11 variants)

**FILE:** [packages/core/src/generation/formatPrompts.ts](packages/core/src/generation/formatPrompts.ts)  
**PURPOSE:** Platform + format specific guidance (carousel copy shape, reel structure, etc.)  
**VARIANTS:**
- Image (single, carousel — carousel requires matching aspect ratios)
- Video (Reels, Shorts, long-form)
- Story
- Pin (Pinterest keyword-forward)
- Thread (X conversation structure)

**USAGE:** Selected by `selectFormatSpec(platform, format)` and included in copywriter system prompt

**CURRENT STATUS:** [IMPLEMENTED]

---

## 5. Tool System

### No Traditional "Tools"

Halyard does not have:
- Tool-calling APIs (no `tools.call`)
- Tool registries
- Tool discovery endpoints
- Tool permission models
- Agent-callable tools

### Platform Adapters ARE the "Tools"

Each adapter is a **read-only + write interface** to a platform:

**Available adapter methods:**

| Method | Inputs | Outputs | Mutating |
|---|---|---|---|
| getAuthUrl | state | URL | No |
| exchangeCode | code | TokenSet | No |
| refresh | tokens | TokenSet | No |
| fetchIdentity | account | PlatformIdentity | No |
| verifyCapabilities | account | CapabilityReport | No |
| publish | item, assets, account | PublishResult | **Yes** |
| collectMetrics | publication | MetricSnapshot | No |
| listComments | publication | PlatformComment[] | No |

**No adapter method:**
- Replies to comments (intentional — v1 §13 enforced in code)
- Follows accounts
- Likes posts
- Direct messages
- Deletes posts
- Modifies profile

**MCP Tools (RecipeFix only)**

**FILE:** [packages/core/src/connectors/recipefix.ts](packages/core/src/connectors/recipefix.ts#L80)  
**AVAILABLE TOOLS:**

| Tool | Inputs | Output | Gates | Required |
|---|---|---|---|---|
| search_recipes | query, dietary | recipes | Recipe seeding | No |
| estimate_nutrition | recipe | nutrition | Nutritional info | No |
| adapt_recipe | recipe, adaptation | adapted | Adaptations | Yes |

**MCP Client:** [packages/core/src/connectors/mcpClient.ts](packages/core/src/connectors/mcpClient.ts)  
**AUTH:** Bearer token (RECIPEFIX_MCP_TOKEN)  
**PROTOCOL:** Streamable HTTP over MCP v1.0  
**MUTATING:** No (read-only discovery only)

---

## 6. Social Platform Adapters

### All Seven Adapters

Each adapter in [packages/core/src/adapters/](packages/core/src/adapters/) implements `PlatformAdapter` interface.

---

### X (Twitter)

**FILE:** [packages/core/src/adapters/x.ts](packages/core/src/adapters/x.ts)  
**CLASS:** `XAdapter`  
**CONSTRAINTS:**
- Max 280 chars
- 0–2 hashtags
- Link in reply (not body), $0.20/post
- Pay-per-use model

**METHODS:**

| Method | File | Status | Notes |
|---|---|---|---|
| getAuthUrl | x.ts:72 | ✅ | PKCE required, OAuth2 Web App |
| exchangeCode | x.ts:78 | ✅ | Returns access + refresh token |
| refresh | x.ts:104 | ✅ | Refresh token required |
| fetchIdentity | x.ts:128 | ✅ | Calls `/users/me` |
| verifyCapabilities | x.ts:155 | ✅ | Checks auth, reports live state |
| publish | x.ts:174 | ✅ | Posts text + media, returns post ID |
| collectMetrics | x.ts:219 | ✅ | Reads post metrics |
| listComments | x.ts:252 | ✅ | Reads replies to post |
| uploadMedia (private) | x.ts:278 | ✅ | Uploads to /media/upload |

**COSTS:** $0.015/tweet without link, $0.20 with link (encoded in adapter)  
**REVIEW GATE:** None (only platform without review gate)  
**ERROR HANDLING:** PublishError typed by kind (auth, rate_limit, malformed_response)

**CURRENT STATUS:** [IMPLEMENTED] ✅

---

### Instagram

**FILE:** [packages/core/src/adapters/instagram.ts](packages/core/src/adapters/instagram.ts)  
**CLASS:** `InstagramAdapter`  
**GRAPH API VERSION:** v23.0 (pinned, review date: 2028-02-01)  
**CONSTRAINTS:**
- Max 2200 chars
- 3–8 hashtags
- Carousel min 2, max 10 slides
- Same aspect ratio required for carousel slides
- Video min 5s, max 90s (h.264, hevc codecs)
- No link in caption (bio only)

**METHODS:**

| Method | Status | Notes |
|---|---|---|
| getAuthUrl | ✅ | OAuth2, Facebook OAuth consent |
| exchangeCode | ✅ | Short-lived → long-lived token exchange |
| refresh | ✅ | `fb_exchange_token` grant |
| fetchIdentity | ✅ | Returns all linked Business accounts |
| verifyCapabilities | ✅ | Checks instagram_content_publish scope, app review status |
| publish | ✅ | Two-step: create media container, then publish |
| collectMetrics | ✅ | Reads insights API |
| listComments | ✅ | Not implemented |

**REVIEW GATE:** Meta App Review (2–4 weeks)  
**DEV MODE:** Up to 25 test users without review  
**DAILY LIMIT:** 100 API-published posts (carousel counts as 1)  
**CURRENT STATUS:** [IMPLEMENTED] ✅

---

### Threads

**FILE:** [packages/core/src/adapters/threads.ts](packages/core/src/adapters/threads.ts)  
**CLASS:** `ThreadsAdapter`  
**CONSTRAINTS:**
- Max 500 chars
- 0–3 hashtags
- Links clickable in body

**METHODS:**

| Method | Status | Notes |
|---|---|---|
| getAuthUrl | ✅ | Threads-specific OAuth |
| exchangeCode | ✅ | Uses Meta OAuth endpoint |
| refresh | ✅ | Meta token refresh |
| fetchIdentity | ✅ | Fetches from Threads account |
| verifyCapabilities | ✅ | Checks threads_content_publish |
| publish | ✅ | Direct API call |
| collectMetrics | ✅ | Limited (newer API) |
| listComments | ✅ | Implemented |

**REVIEW GATE:** Meta App Review (same as Instagram)  
**CURRENT STATUS:** [IMPLEMENTED] ✅

---

### TikTok

**FILE:** [packages/core/src/adapters/tiktok.ts](packages/core/src/adapters/tiktok.ts)  
**CLASS:** `TikTokAdapter`  
**CONSTRAINTS:**
- Video 3s–10min
- Upload (not direct posting — videos land in drafts)
- No trending audio via API
- Hosted URL must be verified with TikTok

**METHODS:**

| Method | Status | Notes |
|---|---|---|
| getAuthUrl | ✅ | TikTok OAuth |
| exchangeCode | ✅ | Auth code exchange |
| refresh | ✅ | OAuth refresh |
| fetchIdentity | ✅ | Fetches user profile |
| verifyCapabilities | ✅ | Checks Content Posting API |
| publish | ✅ | Video upload to drafts (not live) |
| collectMetrics | ✅ | Reads analytics |
| listComments | ✅ | Not implemented |

**REVIEW GATE:** Content Posting API audit (rejection typical for internal tools)  
**POSTING MODE:** Drafts only (operator publishes manually)  
**CURRENT STATUS:** [PARTIAL] — Upload works, but manual publish required

---

### YouTube

**FILE:** [packages/core/src/adapters/youtube.ts](packages/core/src/adapters/youtube.ts)  
**CLASS:** `YouTubeAdapter`  
**CONSTRAINTS:**
- Max 5000 chars description
- Video min 59s minimum (40s for Shorts)
- Channel verification required for long-form
- Read quota: 1 unit/read, 100 units/search, 50 units/write, 10K/day pool

**METHODS:**

| Method | Status | Notes |
|---|---|---|
| getAuthUrl | ✅ | Google OAuth2 |
| exchangeCode | ✅ | Auth code exchange |
| refresh | ✅ | Google token refresh |
| fetchIdentity | ✅ | Fetches channel info |
| verifyCapabilities | ✅ | Checks youtube.upload scope |
| publish | ✅ | Resumable upload (chunked) |
| collectMetrics | ✅ | Analytics API |
| listComments | ❌ | Not implemented |

**REVIEW GATE:** Compliance audit (2–6 weeks, no guaranteed timeline)  
**DEV MODE:** Private uploads only  
**CURRENT STATUS:** [PARTIAL] — Upload works, live public posting gated by review

---

### Pinterest

**FILE:** [packages/core/src/adapters/pinterest.ts](packages/core/src/adapters/pinterest.ts)  
**CLASS:** `PinterestAdapter`  
**CONSTRAINTS:**
- Title is search query (keyword-forward)
- No hashtags (search index, not feed)
- Pin must have board_id
- Boards routed by signal (image, text, category, artifact)

**METHODS:**

| Method | Status | Notes |
|---|---|---|
| getAuthUrl | ✅ | Pinterest OAuth2 |
| exchangeCode | ✅ | Auth code exchange |
| refresh | ✅ | Pinterest token refresh |
| fetchIdentity | ✅ | Returns user + boards |
| verifyCapabilities | ✅ | Checks pins:write scope |
| publish | ✅ | Creates pin with board_id |
| collectMetrics | ✅ | Reads insights (if Standard access) |
| listComments | ❌ | Not implemented |

**REVIEW GATE:** Trial → Standard (1–4 weeks, video demo required)  
**BOARD ROUTING:** [packages/core/src/destinations/pinterestBoards.ts](packages/core/src/destinations/pinterestBoards.ts)  
**CURRENT STATUS:** [IMPLEMENTED] ✅

---

### Bluesky

**FILE:** [packages/core/src/adapters/bluesky.ts](packages/core/src/adapters/bluesky.ts)  
**CLASS:** `BlueskyAdapter`  
**CONSTRAINTS:**
- 300 chars
- 0–2 hashtags
- Links unfurl as cards

**AUTH:** App password (no OAuth, no credentials required)  
**METHODS:**

| Method | Status | Notes |
|---|---|---|
| getAuthUrl | ✅ | Returns app password prompt |
| exchangeCode | ✅ | N/A (manual paste) |
| refresh | ❌ | App passwords don't refresh |
| fetchIdentity | ✅ | Calls createSession |
| verifyCapabilities | ✅ | Tests session |
| publish | ✅ | Posts via /com.atproto.repo.createRecord |
| collectMetrics | ❌ | No public metrics API |
| listComments | ❌ | Not implemented |

**REVIEW GATE:** None  
**CURRENT STATUS:** [IMPLEMENTED] ✅

---

### Adapter Capability Matrix

| Capability | X | Instagram | Threads | TikTok | YouTube | Pinterest | Bluesky |
|---|---|---|---|---|---|---|---|
| OAuth | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (app pwd) |
| Read profile | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Read posts | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Read metrics | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Read comments | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Read mentions | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Publish** | ✅ Live | ✅ Review | ✅ Review | ⚠️ Draft | ⚠️ Review | ✅ Review | ✅ Live |
| Post text | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ Title | ✅ |
| Post image | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Post video | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Post carousel | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Reply | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Delete | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Scheduling | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Legend:**
- ✅ = Implemented and live
- ⚠️ = Implemented but review/draft gated
- ❌ = Not implemented

---

## 7. Public Social Research

### Current Capabilities

**PURPOSE:** Watch for recurring questions and trends in public sources  
**DISCOVERY ONLY:** No writing, following, or messaging  
**FILES:** [packages/core/src/watch/sources.ts](packages/core/src/watch/sources.ts)

---

### Reddit

**API:** Public JSON endpoint  
**AUTH:** None  
**ENDPOINT:** `https://www.reddit.com/search.json?q=...`  
**WHAT IT CAN READ:**
- Post titles
- Post body (self-text)
- Scores and comments
- All subreddits

**RATE LIMIT:** ~60 requests/minute per user agent  
**COST:** Free  
**IMPLEMENTATION:** [fetchReddit()](packages/core/src/watch/sources.ts#L58)  
**CURRENT STATUS:** [IMPLEMENTED] ✅

---

### RSS Feeds

**API:** Standard RSS/Atom  
**AUTH:** None (or bearer token if feed requires)  
**WHAT IT CAN READ:**
- Title, link, description
- Publication date
- All feeds

**RATE LIMIT:** Per-feed rules (typically 1–10 requests/day)  
**COST:** Free  
**IMPLEMENTATION:** [fetchRss()](packages/core/src/watch/sources.ts#L114)  
**FEEDS SEEDED:**
- HN above 100 points (hnrss.org)
- OpenAI news, Anthropic, Hugging Face, MIT Tech Review, arXiv, The Verge
- All managed in [supabase/migrations/0013_founder_engine.sql](supabase/migrations/0013_founder_engine.sql)

**CURRENT STATUS:** [IMPLEMENTED] ✅

---

### Pinterest Trends

**API:** `/v5/trends/keywords/US/top/growing`  
**AUTH:** Bearer token (requires account with Standard access)  
**WHAT IT CAN READ:**
- Trending keywords in US market
- Growth rate per keyword

**LIMITATION:** Requires Pinterest Standard access (same review that gates publishing)  
**RATE LIMIT:** Standard API limits  
**COST:** Included with publishing access  
**IMPLEMENTATION:** [fetchPinterestTrends()](packages/core/src/watch/sources.ts#L170)  
**CURRENT STATUS:** [IMPLEMENTED] — Gated by Pinterest review

---

### X Search (Deliberate Absence)

**COST:** $0.005 per read  
**MONTHLY COST AT SCALE:** $30–75/month just for term watching  
**DECISION:** Not implemented; manual app search recommended  
**RATIONALE:** [X adapter commentary](packages/core/src/adapters/x.ts#L11)

---

### Question Detection

**LOGIC:** [looksLikeQuestion()](packages/core/src/watch/sources.ts#L42)  
**PATTERN:**
- Contains `?` OR
- Starts with why, how, what, when, which, can, does, etc.

**GROUPING:** [findRecurringQuestions()](packages/core/src/watch/sources.ts#L260)  
**DEDUPLICATION:** Normalizes similar questions by removing stop words and sorting content words  
**MIN RECURRENCE:** Configurable (default 3 occurrences)

**CURRENT STATUS:** [IMPLEMENTED] ✅

---

## 8. OAuth / Token Architecture

### Complete OAuth Flow

**START POINT:** [apps/web/src/app/api/oauth/[platform]/start/route.ts](apps/web/src/app/api/oauth/[platform]/start/route.ts)  
**CALLBACK:** [apps/web/src/app/api/oauth/[platform]/callback/route.ts](apps/web/src/app/api/oauth/[platform]/callback/route.ts)  
**CONFIRMATION:** [apps/web/src/app/(dashboard)/accounts/confirm/[id]/actions.ts](apps/web/src/app/(dashboard)/accounts/confirm/[id]/actions.ts)

---

### State & Security

**STATE PARAMETER:**

```
Signed envelope (not opaque random):
- productId
- platform
- persona (founder|brand)
- nonce (12 random bytes)
- issuedAt (unix timestamp)

Format: base64(payload).base64(HMAC-SHA256(payload))
TTL: 15 minutes
```

**FILE:** [packages/core/src/adapters/oauth.ts](packages/core/src/adapters/oauth.ts)  
**FUNCTIONS:** `signState()`, `verifyState()`  
**KEY:** `process.env.TOKEN_ENCRYPTION_KEY`

---

### PKCE (Proof Key Code Exchange)

**PLATFORMS:** Required for X, tolerated by others  
**RFC:** RFC 7636 S256  
**IMPLEMENTATION:** [createPkcePair()](packages/core/src/adapters/oauth.ts#L62)

```
verifier = 48 random bytes (base64url)
challenge = SHA256(verifier) (base64url)
```

**STORED:** Verifier in `__Host-pkce_verifier` cookie  
**VERIFIED:** At callback with `/oauth2/token`

---

### Token Storage

**TABLE:** [pending_connections](supabase/migrations/0014_accounts_destinations_campaigns.sql#L37) (temporary)  
→ [social_accounts](supabase/migrations/0003_accounts_and_assets.sql#L6) (permanent after confirmation)

**COLUMNS:**
- `access_token_enc` (bytea, encrypted)
- `refresh_token_enc` (bytea, encrypted)
- `token_expires_at` (timestamptz)
- `scopes` (text array)
- `token_meta` (jsonb — platform-specific data like IG user ID)

**ENCRYPTION:** [packages/core/src/crypto/tokenCrypto.ts](packages/core/src/crypto/tokenCrypto.ts)  
**KEY:** `process.env.TOKEN_ENCRYPTION_KEY`  
**ALGORITHM:** AES-256-GCM with random IV

---

### Token Refresh

**SCHEDULE:** `refresh_tokens` job, runs hourly  
**TRIGGER:** [apps/web/src/app/api/cron/[task]/route.ts](apps/web/src/app/api/cron/[task]/route.ts#L112)  
**PREDICATE:** `needsRefresh(expiresAt, leadMinutes=60)`  
→ Refreshes if expires within 1 hour

**PLATFORMS:**
- X: `grant_type=refresh_token` at `/2/oauth2/token`
- Instagram: `fb_exchange_token` at `/oauth/access_token`
- Google: Standard OAuth2 refresh
- Others: Platform-specific seams

**ERROR HANDLING:**
- Token not refreshable → account marked `error`
- Refresh fails at publish time → single retry with fresh token, then fail

**FILE:** [apps/worker/src/handlers/index.ts](apps/worker/src/handlers/index.ts#L164) (collectAttribution job shows pattern)

---

### Account Confirmation (M40)

**PROBLEM:** Connecting while logged in as wrong account is silent until first post lands on wrong feed  
**SOLUTION:** Show identity before saving token

**FLOW:**
1. OAuth callback creates `pending_connections` row (token sealed)
2. Query platform API: `fetchIdentity()`
3. Show alternatives (Meta pages, YouTube channels)
4. Operator confirms: "Yes, this is me"
5. Move token to `social_accounts`, mark `identity_confirmed_at`

**FILES:**
- Confirmation flow: [apps/web/src/app/(dashboard)/accounts/confirm/[id]/page.tsx](apps/web/src/app/(dashboard)/accounts/confirm/[id]/page.tsx)
- Action handler: [apps/web/src/app/(dashboard)/accounts/confirm/[id]/actions.ts](apps/web/src/app/(dashboard)/accounts/confirm/[id]/actions.ts)

**DATABASE:** `pending_connections` expires in 30 minutes

---

### Preflight Checklist

**FILE:** [packages/core/src/accounts/preflight.ts](packages/core/src/accounts/preflight.ts)  
**PURPOSE:** Prevent common connection failures  
**EXPORTED:** `PREFLIGHT: Record<PlatformId, Preflight>`

**Example (Instagram):**
- Account must be Professional (Business or Creator)
- Linked to a Facebook Page
- Meta app needs instagram_content_publish scope
- Developer/admin/tester role on app (while unreviewed)

**Example (X):**
- Project exists on paid tier
- OAuth2 enabled, callback URL exact match
- App permissions are "Read and write"
- Payment method on file

---

## 9. Database Implementation

### Complete Schema

**MIGRATIONS:** [supabase/migrations/](supabase/migrations/) 0001–0024  
**CONNECTION:** Postgres 15+  
**HOSTING:** Supabase (API over PostgREST)

---

### Core Tables

**TABLE: products**
- `id` (text PK)
- `kind` (enum: 'product', 'personal')
- `name`, `tagline`, `website_url`
- `brief_summary`, `brief_markdown`
- `content_rules` (jsonb: forbidden_claims, banned_phrases)
- `connector_type` (enum: 'mcp', 'rest', 'github', 'none')
- `connector_config` (jsonb)
- `audience_timezone`, `operator_timezone`
- `expected_handles` (jsonb: {brand, founder})
- `destinations` (jsonb: {web, app_store, ...})
- `observed_app_version`

**TABLE: social_accounts**
- `id` (uuid PK)
- `product_id` (text FK)
- `platform` (enum: x, instagram, tiktok, youtube, pinterest, threads, bluesky)
- `persona` (enum: founder, brand)
- `handle`, `display_name`, `avatar_url`, `follower_count`
- `capability_state` (enum: pending_auth, draft_only, live, error, disabled)
- `access_token_enc` (bytea)
- `refresh_token_enc` (bytea)
- `token_expires_at` (timestamptz)
- `scopes` (text[])
- `routing_scope` (generated: '*founder*' or product_id)
- `identity_confirmed_at`, `identity_warning`
- `last_self_test_at`, `last_self_test_ok`, `last_self_test_detail`
- `last_published_at`
- `transport` (enum: direct, unified)
- `provider_account_id` (text FK to blotato)

**TABLE: content_items** (The core table)
- `id` (uuid PK)
- `product_id` (text FK)
- `idea_id` (uuid FK)
- `account_id` (uuid FK)
- `platform`, `persona`, `format`, `category`
- `body`, `title`, `alt_text`, `hashtags`, `link_url`, `final_link_url`
- `product_artifact` (jsonb)
- `render_ids` (uuid[])
- `status` (enum: draft, pending_approval, approved, scheduled, publishing, published, awaiting_manual_publish, failed, rejected, archived, expired)
- `scheduled_at`, `published_at`, `reschedule_count`
- `ai_components` (text[]: copy, voiceover, imagery, motion, none)
- `requires_ai_label` (generated from ai_components)
- `disclosure_text`
- `qc_results` (jsonb: {gates: [{gate, status, summary, detail}]})
- `claims` (jsonb[])
- `generation_meta` (jsonb: {model, promptVersion, tokens, costUsd})
- `edited_by_human`, `original_body`, `regen_notes`, `reject_reason`
- `audio_mode` (enum: founder_cloned, founder_recorded, text_only)
- `series_id` (uuid FK)
- `sequence_number` (int)
- `eligible_for_repost_at` (timestamptz)
- `campaign_id` (uuid FK)
- `destination_type` (enum: share_link, app_store, web, link_in_bio)
- `destination_url`, `destination_reason`
- `board_id` (text, Pinterest board)

**STATE MACHINE:**
```
draft
  ↓ (human approves)
pending_approval → approved → scheduled
                              ↓ (at scheduled_at)
                         publishing → published
                              ↓ (error)
                             failed
                              ↓ (retry limit)
                            expired

Rejection paths:
pending_approval → rejected → archived
```

---

### Other Key Tables

**TABLE: ideas**
- `id`, `product_id`, `title`, `angle`, `category`
- `status` (enum: proposed, selected, used, rejected, expired, snoozed)
- `score`, `score_breakdown` (jsonb: mix_debt, novelty, seasonal, etc.)
- `embedding` (jsonb: float array for cosine distance)
- `source_signals` (uuid array)
- `series_id` (FK)
- `reject_reason`, `snoozed_until`, `expires_at`

**TABLE: hooks** (Hook patterns for openings)
- `id`, `product_id`, `pattern` (e.g., "Why your {thing} is {problem}")
- `hook_type` (enum: open_loop, pattern_interrupt, curiosity_gap, etc.)
- `platform`, `category`, `format`
- `uses`, `avg_stop_rate`, `avg_score`, `last_used_at`
- `recency_weighted_score`

**TABLE: signals** (Raw product events)
- `id`, `product_id`
- `source` (enum: product_activity, changelog, editorial, seasonal, trend, performance, submission)
- `raw` (jsonb)
- `summary`, `relevance`, `consumed_at`

**TABLE: campaigns**
- `id`, `product_id`, `name`
- `kind` (enum: launch, feature, seasonal, experiment, other)
- `brief`, `goal`
- `starts_at`, `ends_at`
- `destination_override`
- `product_mix_ceiling` (numeric, overrides default)
- `status` (enum: planning, staged, running, complete, abandoned)

**TABLE: publications** (Record of what was published where)
- `id`, `content_item_id`, `account_id`, `platform`
- `platform_post_id`, `permalink`
- `publish_mode` (enum: direct, draft, manual)
- `manual_publish_url`
- `link_reply_post_id` (for X)
- `published_at`
- `raw_response` (jsonb)
- `needs_reconciliation`

**TABLE: post_metrics** (Polled on decay schedule)
- `id`, `publication_id`
- `impressions`, `reach`, `likes`, `comments`, `shares`, `saves`
- `video_views`, `watch_time_seconds`
- `profile_visits`, `link_clicks`, `follows`
- `raw`, `purge_after`, `collected_at`

**TABLE: comments** (Engagement inbox)
- `id`, `publication_id`
- `platform_comment_id`, `author_handle`, `author_display_name`
- `body`, `posted_at`
- `reply_status` (enum: pending, replied, ignored, support)
- `suggested_reply`, `ai_drafted_at`

**TABLE: jobs** (Background work queue)
- `id`, `kind` (enum, see Section 11)
- `payload` (jsonb)
- `status` (enum: queued, running, done, failed)
- `priority` (1–100, higher runs first)
- `run_after` (timestamptz)
- `locked_at`, `locked_by` (pessimistic locking)
- `attempts`, `max_attempts`
- `dedupe_key` (unique index prevents doubles)

**TABLE: pending_connections** (Temporary, expires 30min)
- `id`, `product_id`, `platform`, `persona`
- `platform_user_id`, `handle`, `display_name`
- `access_token_enc`, `refresh_token_enc`
- `scopes`, `token_meta`, `alternatives`, `warnings`
- `expires_at`

**TABLE: brand_voices**
- `id`, `product_id`, `persona` (brand|founder)
- `display_name`, `description`
- `do_rules`, `dont_rules` (text arrays)
- `examples`, `anti_examples` (jsonb)
- `mix_targets` (jsonb: {category: share})

**TABLE: templates** (Render templates)
- `id`, `format` (image, video, satori, remotion)
- `renderer_key` (satori|remotion)
- `enabled`
- `loop_ready`
- `opens_on_content`
- `min_pattern_interrupt_seconds`

**TABLE: renders**
- `id`, `content_item_id`
- `template_id`, `renderer` (satori|remotion)
- `input_props` (jsonb)
- `quality` (draft|final)
- `output_url`, `output_format`
- `status` (queued|processing|done|failed)
- `error`

**TABLE: rss_sources** (Founder's news feeds)
- `id`, `product_id`, `name`, `url`
- `enabled`

**TABLE: rss_items** (News items for Daily Takes)
- `id`, `source_id`, `url`
- `title`, `summary`, `published_at`
- `status` (enum: new, surfaced, taken, expired)

**TABLE: onboarding_state**
- `product_id` (PK)
- `step_ingest_done`, `step_voice_done`, `step_calibration_done`, `step_templates_done`, `step_accounts_done`
- `calibration_reviewed`, `calibration_target`
- `completed_at`

**TABLE: settings** (Global kill switches)
- `id` (always true)
- `publishing_enabled`, `publishing_disabled_reason`
- `generation_enabled`
- `learning_min_posts_per_category`

---

### Constraints & Safety

**ROUTING SAFETY (M40):**
```sql
-- Brand account can only reach its product
content_items.routing_scope = social_accounts.routing_scope

-- Founder account can only reach '*founder*'
-- (enforced via generated column + foreign key)
```

**AI DISCLOSURE (v2 Part C):**
```sql
-- If AI label required, disclosure text must exist and non-empty
check (
  status not in ('approved','scheduled','publishing','published')
  or requires_ai_label = false
  or (disclosure_text is not null and length(trim(disclosure_text)) > 0)
)
```

**INDEXES:**
- `content_items_schedule_idx` (status, scheduled_at)
- `content_items_browse_idx` (product_id, platform, created_at desc)
- `content_items_repost_idx` (product_id, eligible_for_repost_at) where published
- `social_accounts_identity_uniq` (platform, platform_user_id) where not duplicate
- `links_clicks_item_idx` (content_item_id, clicked_at desc)
- `jobs_idx` (status, priority, run_after) — implicit for poller

---

## 10. Content State Machine

### Full State Diagram

```
┌──────────────┐
│   idea       │ (proposed, selected, used, rejected, expired, snoozed)
└──────┬───────┘
       │ (selected by idea engine)
       ↓
┌──────────────┐
│   draft      │ ← content_items.status
│ (pending QC) │
└──────┬───────┘
       │ (writeDraft succeeds, enters queue)
       ↓
┌──────────────────────┐
│ pending_approval     │ (human views in queue)
│ (waiting for review) │
└──────┬───────────────┘
       │ ┌─────────────────────────────┐
       │ │ (human rejects or revises)  │
       │ ↓                             │
       │ rejected → archived           │ (or regenerate)
       │                               │
       │ (human approves)              │
       ↓                               │
┌──────────────┐                       │
│  approved    │ ←─────────────────────┘
│              │
└──────┬───────┘
       │ (scheduled)
       ↓
┌──────────────┐
│  scheduled   │
│              │
└──────┬───────┘
       │ (at scheduled_at time, publish job enqueued)
       ↓
┌──────────────────────┐
│  publishing          │ (intermediate state during publish call)
│                      │
└──────┬───────────────┘
       │ ┌──────────────────────┐
       │ │ (publish fails)       │
       │ ↓                       │
       │ failed                  │
       │   ↓                     │
       │ (after 3 retries)       │
       │   ↓                     │
       │ expired                 │
       │                         │
       │ (publish succeeds)      │
       ↓                         │
┌──────────────┐                 │
│ published    │ ←────────────────┘
│              │
│ (metrics     │
│  polled for  │
│  24 hours)   │
└──────────────┘
```

**Transitions:**
- `draft` → `pending_approval` (automatic on insert)
- `pending_approval` → `approved` (human action)
- `pending_approval` → `rejected` (human action) → `archived`
- `approved` → `scheduled` (operator schedules)
- `scheduled` → `publishing` (job starts)
- `publishing` → `published` (success)
- `publishing` → `failed` (network error, but retryable)
- `failed` → `expired` (after max retries = 3)
- `pending_approval` → `pending_approval` (regenerate, user triggers)

**Who changes state:**
- `draft` → `pending_approval`: automatic (writeDraft success)
- `pending_approval` → `approved`: [apps/web/src/app/(dashboard)/queue/actions.ts](apps/web/src/app/(dashboard)/queue/actions.ts#L24)
- `approved` → `scheduled`: [apps/web/src/app/(dashboard)/launch/actions.ts](apps/web/src/app/(dashboard)/launch/actions.ts#L211)
- `scheduled` → `publishing` → `published`: [apps/worker/src/handlers/publish.ts](apps/worker/src/handlers/publish.ts#L150)

---

## 11. Job / Worker System

### Architecture

**FILE:** [apps/worker/src/](apps/worker/src/)  
**ENTRY POINT:** [apps/worker/src/index.ts](apps/worker/src/index.ts)  
**FRAMEWORK:** Postgres-backed job queue (no external queue)  
**POLLING:** Long-poll with exponential backoff

---

### Job Kinds (24 total)

**Database enum:** [packages/db/src/index.ts](packages/db/src/index.ts#L47)

| Job Kind | Handler | Trigger | Timeout | Max Attempts | Purpose |
|---|---|---|---|---|---|
| `generate` | [generate.ts](apps/worker/src/handlers/generate.ts) | Daily, manual | 5min | 2 | Create content drafts |
| `render` | [render.ts](apps/worker/src/handlers/render.ts) | generate job | 15min | 3 | Remotion/Satori image render |
| `tts` | [tts.ts](apps/worker/src/handlers/tts.ts) | generate job (video) | 2min | 3 | Text-to-speech voiceover |
| `capture` | [capture.ts](apps/worker/src/handlers/capture.ts) | Manual (setup) | 20min | 2 | Playwright browser flow |
| `publish` | [publish.ts](apps/worker/src/handlers/publish.ts) | Scheduler at slot time | 5min | 3 | Publish to platform |
| `collect_metrics` | [index.ts](apps/worker/src/handlers/index.ts#L105) | After publish (decay schedule) | 5min | 3 | Poll engagement metrics |
| `collect_signals` | [signals.ts](apps/worker/src/handlers/signals.ts) | Daily | 5min | 2 | Gather product events |
| `collect_comments` | [index.ts](apps/worker/src/handlers/index.ts#L143) | After publish (5min, 10min, 15min... up to 24hr) | 5min | 3 | Poll comments |
| `collect_attribution` | [index.ts](apps/worker/src/handlers/index.ts#L193) | Daily | 5min | 3 | Fetch PostHog events |
| `refresh_tokens` | Inline in poller | Hourly | 2min | 2 | OAuth token refresh |
| `score_performance` | [index.ts](apps/worker/src/handlers/index.ts#L233) | Daily | 5min | 3 | Score posts by metrics |
| `digest_email` | [newsletter.ts](apps/worker/src/handlers/newsletter.ts) | Scheduled | 5min | 2 | Send email digest |
| `reconcile_schedule` | [reconcile.ts](apps/worker/src/handlers/reconcile.ts) | Post-publish | 5min | 3 | Fix scheduling mismatches |
| `mark_stale_assets` | [capture.ts](apps/worker/src/handlers/capture.ts) | Daily | 5min | 2 | Archive old assets |
| `collect_app_store` | [appStore.ts](apps/worker/src/handlers/appStore.ts) | Daily | 5min | 3 | App Store attribution |
| `detect_release` | [detectRelease.ts](apps/worker/src/handlers/detectRelease.ts) | Weekly | 5min | 2 | Detect product releases |
| `collect_watch_terms` | [watch.ts](apps/worker/src/handlers/watch.ts) | Daily | 5min | 3 | Watch public Q&A |
| `draft_newsletter` | [newsletter.ts](apps/worker/src/handlers/newsletter.ts) | Daily | 5min | 2 | Generate newsletter |
| `send_newsletter` | [newsletter.ts](apps/worker/src/handlers/newsletter.ts) | Scheduled | 5min | 2 | Send via Resend |
| `collect_reviews` | [reviews.ts](apps/worker/src/handlers/reviews.ts) | Weekly | 5min | 2 | Gather customer reviews |
| `review_media` | [reviewMedia.ts](apps/worker/src/handlers/reviewMedia.ts) | Post-render | 5min | 2 | Frame description QC |
| `verify_feature` | [verifyFeature.ts](apps/worker/src/handlers/verifyFeature.ts) | Manual | 10min | 2 | Replay and verify feature claim |
| `explore_product` | [explore.ts](apps/worker/src/handlers/explore.ts) | Manual | 10min | 1 | Discover feature claims |

---

### Polling & Scheduling

**POLLER:** [apps/worker/src/poller.ts](apps/worker/src/poller.ts)  
**SCHEDULER:** [apps/worker/src/scheduler.ts](apps/worker/src/scheduler.ts)

**Flow:**
1. Worker starts → poller + scheduler
2. Scheduler runs every 60s:
   - Find due jobs (run_after <= now)
   - Insert into jobs queue
3. Poller runs continuously:
   - `claim_next_job()` SQL function (pessimistic locking)
   - Load handler from registry
   - Execute with timeout
   - Update status (done|failed)
   - Log via Sentry if error

**LOCKING:** Pessimistic row lock
```sql
update jobs set locked_by = $1, locked_at = now()
where id = $2 and status = 'queued'
```

**DEDUPLICATION:** `dedupe_key` column (unique index)
```
before inserting: check if dedupe_key already exists
if exists: skip (prevent double-work)
```

**RETRY BACKOFF:**
```
attempt 1: run immediately
attempt 2: wait backoffSeconds
attempt 3: wait backoffSeconds
max reached: status = failed
```

---

## 12. Human Approval Architecture

### Approval Gates

**GATE 1: QC Lint Pass**
- **TRIGGER:** writeDraft() → runAllGates()
- **BLOCKS:** Draft rejected if failed
- **DATABASE:** qc_results column (jsonb)
- **UI:** Queue shows violations
- **BYPASS:** User can regenerate or edit

**GATE 2: Manual Approval Queue**
- **TRIGGER:** content_items inserted with status = 'pending_approval'
- **INTERFACE:** [apps/web/src/app/(dashboard)/queue/page.tsx](apps/web/src/app/(dashboard)/queue/page.tsx)
- **ACTIONS:**
  - Approve → status = 'approved'
  - Reject → status = 'rejected', reject_reason recorded
  - Edit → original_body saved, edited_by_human = true
  - Regenerate → calls writeDraft with regen_notes
- **DATABASE:** [apps/web/src/app/(dashboard)/queue/actions.ts](apps/web/src/app/(dashboard)/queue/actions.ts)

**GATE 3: Manual Scheduling**
- **TRIGGER:** Approve doesn't auto-schedule
- **INTERFACE:** Launch screen
- **ACTION:** Select slot, commit to calendar
- **DATABASE:** Insert/update scheduled_at, campaign_id

**GATE 4: Identity Confirmation**
- **TRIGGER:** OAuth callback
- **INTERFACE:** [apps/web/src/app/(dashboard)/accounts/confirm/[id]/page.tsx](apps/web/src/app/(dashboard)/accounts/confirm/[id]/page.tsx)
- **BLOCKS:** Token not saved until confirmed
- **DECISION:** Operator verifies "Is this the right account?"
- **DATABASE:** pending_connections → social_accounts

**GATE 5: Publishing Kill Switch**
- **TRIGGER:** Every publish job
- **INTERFACE:** Settings page
- **CHECK:** [apps/worker/src/handlers/publish.ts](apps/worker/src/handlers/publish.ts#L78)
- **EFFECT:** Throws PublishingDisabled if `publishing_enabled = false`
- **DATABASE:** settings table

---

### Bypass Mechanisms

**NO BYPASS FOR:**
- Platform review gates (Instagram, YouTube, Pinterest, TikTok, Threads)
- AI disclosure requirement
- Routing safety (DB constraint)
- Draft-only accounts (handoff to manual publish)

**PARTIAL BYPASS:**
- QC gates → regenerate with notes until pass
- Approval queue → reject and re-edit
- Scheduling → reschedule (max 3 times, then expired)

---

## 13. Routing / Identity Safety

### Problem Solved

Prevents:
1. Brand content landing on founder account
2. One product's content on another's account
3. Founder content scattered across brand accounts

---

### Solution: Routing Scope

**GENERATED COLUMN:**
```sql
routing_scope = CASE
  WHEN persona = 'founder' THEN '*founder*'
  ELSE product_id
END
```

**INVARIANT:**
- Brand content → product_id = its product
- Founder content → routing_scope = '*founder*'

**ENFORCEMENT:**
```sql
ALTER TABLE content_items
  ADD CONSTRAINT content_items_account_routing_fk
  FOREIGN KEY (account_id, routing_scope)
  REFERENCES social_accounts (id, routing_scope);
```

**FILES:**
- Schema: [supabase/migrations/0014_accounts_destinations_campaigns.sql](supabase/migrations/0014_accounts_destinations_campaigns.sql#L85)
- Publish check: [apps/worker/src/handlers/publish.ts](apps/worker/src/handlers/publish.ts#L156)

---

### Founder Account (Shared)

**MODEL:** One identity per platform, shared across all products  
**STORAGE:** Lives on `products.kind = 'personal'` (a pseudo-product)  
**VISIBILITY:** Appears in product calendars by routing, not by product_id  
**CREATION:** Automatic when first founder account connects  
**CONSTRAINT:** Exactly one personal product per Halyard instance

---

### Identity Confirmation (M40)

**FLOW:** See Section 8, Account Confirmation  
**KEY FILES:**
- [apps/web/src/app/(dashboard)/accounts/confirm/[id]/page.tsx](apps/web/src/app/(dashboard)/accounts/confirm/[id]/page.tsx)
- [apps/web/src/app/(dashboard)/accounts/confirm/[id]/actions.ts](apps/web/src/app/(dashboard)/accounts/confirm/[id]/actions.ts)

---

## 14. Media Pipeline

### Render System

**FILE:** [apps/worker/src/handlers/render.ts](apps/worker/src/handlers/render.ts)  
**JOB KIND:** `render`  
**RENDERERS:**
- **Satori:** Image rendering (React → PNG/JPG via headless browser)
- **Remotion:** Video rendering (30s scripted composition → MP4)

**TEMPLATES:** [supabase/migrations/0005_render_and_jobs.sql](supabase/migrations/0005_render_and_jobs.sql#L6)
- `transformation_diff_4x5` (Satori)
- `carousel_6` (Satori, 6-slide carousel)
- Various Remotion video compositions

**INPUT:** `input_props` (jsonb) → template parameters  
**OUTPUT:** `output_url` (public URL to asset)  
**STORAGE:** Supabase Storage or local `HALYARD_LOCAL_ASSET_DIR`

**FLOW:**
```
writeDraft (generate job)
  ↓
Check if artifact supports template
  ↓
Insert render row (status: queued)
  ↓
Enqueue render job
  ↓
Render handler:
  - Load template
  - Invoke Satori/Remotion
  - Upload output
  - Update render.output_url
  ↓
(if TTS needed)
Enqueue tts job
```

---

### TTS (Text-to-Speech)

**FILE:** [apps/worker/src/handlers/tts.ts](apps/worker/src/handlers/tts.ts)  
**JOB KIND:** `tts`  
**PROVIDER:** ElevenLabs (if configured) or OpenAI Whisper  
**STATUS:** [NOT FULLY IMPLEMENTED] — No ElevenLabs integration in code  
**FALLBACK:** Null voice (text_only audio_mode)

**PLANNED (from schema):**
- `voice_lexicon` table for brand voice cloning
- `audio_mode` column: founder_cloned, founder_recorded, text_only
- VO script generation: [writeVoScript()](packages/core/src/generation/copywriter.ts#L310)

**CURRENT:** VO scripts generated, but audio not produced

---

### Media Frames & QC

**JOB KIND:** `review_media` (Milestone 52)  
**FILE:** [apps/worker/src/handlers/reviewMedia.ts](apps/worker/src/handlers/reviewMedia.ts)  
**PROVIDER:** OpenAI Vision API  
**PURPOSE:** Sample frames from finished render and describe them

**FLOW:**
```
render completes (output_url set)
  ↓
Enqueue review_media job
  ↓
review_media handler:
  1. Fetch rendered video/image
  2. Sample 3–5 frames
  3. Call vision model: "Describe this frame"
  4. Store descriptions in media_observations (jsonb)
  5. Run visual QC gate
```

**DATABASE:** `media_observations` column on content_items

---

### Asset Management

**TABLE:** [supabase/migrations/0015_capture_and_assets.sql](supabase/migrations/0015_capture_and_assets.sql#L8)  
- `assets.source_url` (e.g., recipe image from RecipeFix)
- `assets.output_url` (e.g., rendered carousel slide)
- `assets.checksum` (SHA256)
- `assets.archived_at`, `archived_reason`

**STALE ASSET CLEANUP:**
- **JOB KIND:** `mark_stale_assets`
- **TRIGGER:** Daily
- **LOGIC:** Archive unused assets after 30 days

---

## 15. Analytics / Learning Loop

### Metrics Collection

**METRIC SOURCES:**

| Source | API | Frequency | Database |
|---|---|---|---|
| Platform native | Platform GraphAPI | Decay schedule (1h, 6h, 24h, 72h, 168h after publish) | post_metrics |
| Link clicks | Router logs + PostHog | Real-time | link_clicks |
| App Store | App Store Connect API | Daily | app_store_attribution |
| Web analytics | PostHog | Daily | attribution |

**FILES:**
- Metrics collection: [apps/worker/src/handlers/index.ts](apps/worker/src/handlers/index.ts#L105)
- Attribution: [apps/worker/src/handlers/index.ts](apps/worker/src/handlers/index.ts#L193)
- App Store: [apps/worker/src/handlers/appStore.ts](apps/worker/src/handlers/appStore.ts)

---

### Performance Scoring

**JOB KIND:** `score_performance`  
**TRIGGER:** Daily  
**LOGIC:** [packages/core/src/scoring/scoring.ts](packages/core/src/scoring/scoring.ts)

**INPUT:**
- Post metrics (impressions, likes, comments)
- App installs, conversions
- Link clicks by destination

**OUTPUT:**
- Stored on content_items as columns or jsonb
- Used to inform future idea scoring

---

### Learning Loop Status

**CURRENT STATE:** [NO CLOSED-LOOP LEARNING SYSTEM FOUND]

**Evidence:**
- Metrics are collected but not fed back into model prompts
- Idea scoring is deterministic (not learned)
- Hook patterns are recorded but not actively optimized
- No reinforcement learning or bandit algorithms

**FILES THAT MIGHT SUGGEST LEARNING:**
- [packages/core/src/generation/rejectionClusters.ts](packages/core/src/generation/rejectionClusters.ts) — identifies patterns of rejection (not implemented as optimization)
- `learning_min_posts_per_category` in settings — threshold for enabling learning (never used)

**ROADMAP REFERENCE:** [docs/STRATEGY.md](docs/STRATEGY.md#L168) mentions "learning loop between 'we made something' and 'it is good', which is currently closed"

---

## 16. MCP / External Agent Interface

### MCP Server: RecipeFix

**ENDPOINT:** `process.env.RECIPEFIX_MCP_URL`  
**AUTH:** Bearer `process.env.RECIPEFIX_MCP_TOKEN`  
**FILE:** [packages/core/src/connectors/mcpClient.ts](packages/core/src/connectors/mcpClient.ts)

**IMPLEMENTED METHODS:**
- `initialize` (handshake)
- `tools/list` (enumerate tools)
- `tools/call` (invoke tool)

**NOT IMPLEMENTED:**
- `resources/list`, `resources/read` (MCP resources)
- `prompts/list`, `prompts/get` (MCP prompts)
- Everything else in MCP spec

---

### RecipeFix Tools

**FILE:** [packages/core/src/connectors/recipefix.ts](packages/core/src/connectors/recipefix.ts)  
**TOOLS:**

| Tool | Required | Purpose | Input | Output |
|---|---|---|---|---|
| `search_recipes` | No | Find recipes by query | query (str), dietary (str) | [Recipe] |
| `estimate_nutrition` | No | Calculate nutrition facts | recipe (json) | NutritionFacts |
| `adapt_recipe` | **Yes** | Modify recipe (GF, vegan, etc.) | recipe (json), adaptation (str) | AdaptedRecipe |

**GATE:** Every tool call is recorded and reported on /settings health page  
**CURRENT STATUS:** [IMPLEMENTED] — Connector can call tools, receives JSON responses

---

### No External Agent Interface Beyond MCP

- No REST API designed for agents
- No tool registry exposed externally
- Platform adapters are internal only
- No agent permissions model

---

## 17. API Inventory

### Public API Routes

**FILE LOCATION:** [apps/web/src/app/api/](apps/web/src/app/api/)

---

### OAuth

**ROUTE:** `POST /api/oauth/[platform]/start`  
**FILE:** [apps/web/src/app/api/oauth/[platform]/start/route.ts](apps/web/src/app/api/oauth/[platform]/start/route.ts)  
**PURPOSE:** Initiate OAuth flow  
**INPUT:** Query: platform, persona (brand|founder)  
**OUTPUT:** Redirect to platform consent  
**AUTH:** None (state HMAC'd)  
**MUTATING:** Sets PKCE cookie

**ROUTE:** `POST /api/oauth/[platform]/callback`  
**FILE:** [apps/web/src/app/api/oauth/[platform]/callback/route.ts](apps/web/src/app/api/oauth/[platform]/callback/route.ts)  
**PURPOSE:** Exchange code for token, stage pending connection  
**INPUT:** Query: code, state  
**OUTPUT:** Redirect to confirmation screen  
**AUTH:** State verification (HMAC)  
**MUTATING:** Inserts pending_connections row

---

### Composition / Generation

**ROUTE:** `POST /api/compose/stream`  
**FILE:** [apps/web/src/app/api/compose/stream/route.ts](apps/web/src/app/api/compose/stream/route.ts)  
**PURPOSE:** Real-time copy generation (for co-pilot)  
**INPUT:** JSON: platform, format, category, idea, voice, productBrief  
**OUTPUT:** Streaming text (Server-Sent Events)  
**AUTH:** Anthropic key check  
**MUTATING:** No

**ROUTE:** `POST /api/compose/queue`  
**FILE:** [apps/web/src/app/api/compose/queue/route.ts](apps/web/src/app/api/compose/queue/route.ts)  
**PURPOSE:** Queue a full draft for approval  
**INPUT:** JSON: similar to /stream  
**OUTPUT:** content_item inserted, redirects to queue  
**AUTH:** Session required  
**MUTATING:** Inserts content_items

---

### Media

**ROUTE:** `GET /api/templates/[id]/preview`  
**FILE:** [apps/web/src/app/api/templates/[id]/preview/route.ts](apps/web/src/app/api/templates/[id]/preview/route.ts)  
**PURPOSE:** Render template preview on-demand  
**INPUT:** Template ID, template-specific props  
**OUTPUT:** PNG/JPG  
**AUTH:** None  
**MUTATING:** No

**ROUTE:** `GET /api/setup-kit/image`  
**FILE:** [apps/web/src/app/api/setup-kit/image/route.ts](apps/web/src/app/api/setup-kit/image/route.ts)  
**PURPOSE:** Generate setup wizard preview images  
**INPUT:** Query: productId, platform  
**OUTPUT:** PNG  
**AUTH:** Session  
**MUTATING:** No

---

### Utility

**ROUTE:** `POST /api/take/transcribe`  
**FILE:** [apps/web/src/app/api/take/transcribe/route.ts](apps/web/src/app/api/take/transcribe/route.ts)  
**PURPOSE:** Transcribe audio → text (for Daily Takes)  
**INPUT:** FormData: audio file (wav, m4a, etc.)  
**OUTPUT:** {text: string}  
**PROVIDER:** OpenAI Whisper API  
**AUTH:** OpenAI key check  
**MUTATING:** No

**ROUTE:** `POST /api/finds`  
**FILE:** [apps/web/src/app/api/finds/route.ts](apps/web/src/app/api/finds/route.ts)  
**PURPOSE:** Trigger story discovery for founder  
**INPUT:** Optional query params  
**OUTPUT:** 200 OK or error  
**AUTH:** Cron secret required  
**MUTATING:** Enqueues discover job

**ROUTE:** `GET /api/cron/[task]`  
**FILE:** [apps/web/src/app/api/cron/[task]/route.ts](apps/web/src/app/api/cron/[task]/route.ts)  
**PURPOSE:** Trigger scheduled jobs  
**INPUT:** Query: secret  
**OUTPUT:** 200 OK or error  
**TASKS:** daily-generate, daily-discover, etc.  
**AUTH:** CRON_SECRET  
**MUTATING:** Enqueues multiple jobs

**ROUTE:** `GET /api/export`  
**FILE:** [apps/web/src/app/api/export/route.ts](apps/web/src/app/api/export/route.ts)  
**PURPOSE:** Export data (CSV, JSON)  
**INPUT:** Query: productId, format  
**OUTPUT:** File download  
**AUTH:** Session  
**MUTATING:** No

**ROUTE:** `GET /api/setup-kit/download`  
**FILE:** [apps/web/src/app/api/setup-kit/download/route.ts](apps/web/src/app/api/setup-kit/download/route.ts)  
**PURPOSE:** Download setup instructions  
**INPUT:** Query: productId  
**OUTPUT:** PDF  
**AUTH:** Session  
**MUTATING:** No

---

### Router

**ROUTE:** `GET /r/[id]`  
**FILE:** [apps/web/src/app/r/[id]/route.ts](apps/web/src/app/r/[id]/route.ts)  
**PURPOSE:** Smart link routing (v2 M42)  
**INPUT:** URL params: content_item_id  
**DECISION:** iOS → app/web; Android → app/web; Desktop → web  
**OUTPUT:** Redirect to destination  
**AUTH:** None  
**MUTATING:** Inserts link_clicks row
**LOGGING:** Device class, platform, destination tracked for analytics

---

### Auth

**ROUTE:** `POST /api/auth/callback`  
**FILE:** [apps/web/src/app/api/auth/callback/route.ts](apps/web/src/app/api/auth/callback/route.ts)  
**PURPOSE:** Supabase auth callback (sign-in provider)  
**INPUT:** Query: code  
**OUTPUT:** Redirect to dashboard  
**AUTH:** None (Supabase handles)  
**MUTATING:** Sets session cookie

---

## 18. Environment Variables / Configuration

### Model Provider

| Var | Required | Used By | Example |
|---|---|---|---|
| ANTHROPIC_API_KEY | Yes (primary) | generation/llm.ts | sk-ant-... |
| OPENAI_API_KEY | If no Anthropic | generation/openai.ts | sk-... |
| LLM_PROVIDER | No | generation/llm.ts | "anthropic" or "openai" |

### Platforms

| Var | Platform | Used By |
|---|---|---|
| X_CLIENT_ID | X | adapters/x.ts |
| X_CLIENT_SECRET | X | adapters/x.ts |
| META_APP_ID | Instagram, Threads | adapters/instagram.ts, threads.ts |
| META_APP_SECRET | Instagram, Threads | adapters/instagram.ts, threads.ts |
| TIKTOK_CLIENT_KEY | TikTok | adapters/tiktok.ts |
| TIKTOK_CLIENT_SECRET | TikTok | adapters/tiktok.ts |
| GOOGLE_CLIENT_ID | YouTube | adapters/youtube.ts |
| GOOGLE_CLIENT_SECRET | YouTube | adapters/youtube.ts |
| PINTEREST_APP_ID | Pinterest | adapters/pinterest.ts |
| PINTEREST_APP_SECRET | Pinterest | adapters/pinterest.ts |
| BLUESKY_UNUSED | Bluesky | (not used; app password via UI) |

### Connectors

| Var | Purpose | Example |
|---|---|---|
| RECIPEFIX_MCP_URL | RecipeFix adapter endpoint | http://localhost:3000/mcp |
| RECIPEFIX_MCP_TOKEN | RecipeFix MCP auth | bearer token |
| GITHUB_TOKEN | GitHub releases detection | github_pat_... |

### Integrations

| Var | Service | Used By |
|---|---|---|
| ELEVENLABS_API_KEY | TTS voiceover | generation/speech.ts (not integrated) |
| ELEVENLABS_VOICE_ID | TTS voice | (not integrated) |
| RESEND_API_KEY | Email newsletters | handlers/newsletter.ts |
| BLOTATO_API_KEY | Unified publishing | adapters/unified/blotato.ts |
| POSTHOG_HOST | Analytics events | handlers/index.ts (attribution) |
| POSTHOG_PROJECT_API_KEY | Analytics | handlers/index.ts |
| POSTHOG_PROJECT_ID | Analytics | handlers/index.ts |

### Database & Security

| Var | Purpose | Example |
|---|---|---|
| DATABASE_URL | Postgres connection | postgres://user@host/db |
| SUPABASE_URL | Supabase API base | https://abc.supabase.co |
| SUPABASE_SERVICE_ROLE_KEY | Privileged Supabase auth | eyJhbG... (JWT) |
| TOKEN_ENCRYPTION_KEY | AES-256-GCM for OAuth tokens | (32 bytes, base64) |
| CRON_SECRET | Trigger scheduled jobs | (any secret string) |

### App Configuration

| Var | Purpose | Example |
|---|---|---|
| NODE_ENV | Environment | production, development |
| HALYARD_PUBLIC_URL | App public base URL | https://halyard.app or http://localhost:3200 |
| HALYARD_CAPTURE_DIR | Playwright flow captures | /tmp/halyard-captures |
| HALYARD_LOCAL_ASSET_DIR | Local asset storage | ./public/dev-assets |
| OAUTH_REDIRECT_BASE_URL | OAuth callback base | https://halyard.app or http://localhost:3200 |
| HALYARD_DEV_UNAUTHENTICATED | Dev bypass auth | "1" or unset |
| HALYARD_RELEASE | Release identifier | git commit SHA |
| WORKER_ID | Worker process ID | worker-1, worker-2 |
| RENDER_CONCURRENCY | Remotion parallel renders | 4 |
| SENTRY_DSN | Error reporting | https://key@sentry.io/... |

---

## 19. Tests

### Test Coverage Summary

**Total:** ~150 test files  
**Framework:** Vitest (TypeScript)  
**E2E:** Playwright

---

### Agent / Workflow Tests

**FILE:** [packages/core/src/founder/founder.test.ts](packages/core/src/founder/founder.test.ts)  
**CASES:**
- `runTakeLoop` returns `needs_input` when no input
- `runTakeLoop` returns `needs_revision` if claim contradicted
- `runTakeLoop` returns ready result if fact-check passes
- Fact-check with web search
- Fact-check without search

**CRITICAL:** Tests verify that opinions are never invented

---

### Generation Tests

**FILE:** [packages/core/src/generation/generation.test.ts](packages/core/src/generation/generation.test.ts)  
**CASES:**
- `writeDraft` passes QC on first try
- `writeDraft` retries and fails after max attempts
- Copywriter produces valid JSON
- Output passes all gates

---

### Job Handler Tests

**FILE:** [apps/worker/src/handlerCoverage.test.ts](apps/worker/src/handlerCoverage.test.ts)  
**INVARIANTS:**
- Every job kind has a handler registered
- Every handler is tested
- Every job kind has a policy (timeout, retries)

**FILE:** [packages/db/src/__tests__/jobPoller.test.ts](packages/db/src/__tests__/jobPoller.test.ts)  
**CASES:**
- Lock and claim job
- Mark complete
- Retry on failure
- Deduplication works
- Dead-letter after max retries

---

### Platform Adapter Tests

**FILE:** [packages/core/src/adapters/adapters.test.ts](packages/core/src/adapters/adapters.test.ts)  
**INVARIANTS:**
- No adapter has a `reply()` method (enforced in code, not policy)
- Every platform has constraints
- Every platform has link strategy defined
- Token refresh works
- Identity fetch works

**PLATFORMS TESTED:** All 7 (X, Instagram, Threads, TikTok, YouTube, Pinterest, Bluesky)

---

### Routing Safety Tests

**FILE:** [packages/db/src/__tests__/routing.test.ts](packages/db/src/__tests__/routing.test.ts)  
**INVARIANTS:**
- Brand content cannot reach founder account
- Founder content cannot reach brand account
- One product's content cannot reach another's account
- Routing scope is correctly generated

---

### QC Gate Tests

**FILE:** [packages/core/src/qc/slopFilter.test.ts](packages/core/src/qc/slopFilter.test.ts)  
**CASES:**
- Hashtag count violations detected
- Character limit violations detected
- Banned phrase violations detected
- Violations per platform

---

### E2E Tests

**FILE:** [e2e/](e2e/)  
**SCENARIOS:**
- `cold-start.spec.ts` — First-run wizard
- `daily-path.spec.ts` — Complete generation → publish flow
- `manual-publish.spec.ts` — Draft-only account handoff
- `launch.spec.ts` — Campaign scheduling
- `campaigns.spec.ts` — Campaign routing
- `router.spec.ts` — Link routing device detection
- `accounts.spec.ts` — Account connection flow
- `safety.spec.ts` — Violation detection

---

## 20. Observability

### Logging

**PROVIDER:** None structured in-code; console.log in handlers  
**SENTRY:** Configured for error reporting (if SENTRY_DSN set)  
**TAGS:** job_kind, attempt, worker_id

---

### Tracing

**NOT IMPLEMENTED:** No distributed tracing (no OpenTelemetry)  
**AUDIT LOG:** Minimal
```sql
audit_log(actor, action, entity_type, entity_id, detail)
```
Records:
- Account connections
- Content approvals
- Publish routing violations
- Manual publish handoffs

---

### Metrics

**AVAILABLE:** Token usage per generation call (stored in generation_meta)  
**UNAVAILABLE:** No APM, no performance dashboard  
**LOGS:** Job start/end times in database (created_at, processing)

---

### Token Usage Tracking

**STORED:** [content_items.generation_meta](supabase/migrations/0004_ideas_and_content.sql#L178)
```json
{
  "model": "claude-sonnet-4-6",
  "promptVersion": "copywriter.v1",
  "inputTokens": 2500,
  "outputTokens": 300,
  "costUsd": 0.0125,
  "attempts": 2
}
```

**AGGREGATION:** Dashboard can query:
```sql
select sum((generation_meta -> 'costUsd')::numeric) from content_items
```

---

### Audit Reconstruction

**POSSIBLE:** Trace a published post back to:
- Which idea it came from
- Which model version wrote it
- Which voice/platform/format combination
- What token cost
- What QC gates it passed
- Who approved it
- When it was published
- What the metrics were

**NOT POSSIBLE:** Verify why model made a specific word choice (no prompt inspection at query time)

---

## 21. Future Multi-Agent Architecture

### Recommended Agents

Based on existing infrastructure, these agents should be built:

---

### 1. Social Discovery Agent

**PURPOSE:** Find trending questions, creator patterns, market gaps  
**INPUTS:** Watch sources (Reddit, RSS, Pinterest trends)  
**OUTPUTS:** Signals table, opportunities ranked  
**INFRASTRUCTURE TO REUSE:**
- [packages/core/src/watch/sources.ts](packages/core/src/watch/sources.ts) (Reddit, RSS, Pinterest APIs)
- [packages/core/src/explorer/discovery.ts](packages/core/src/explorer/discovery.ts) (discovery patterns)
- `signals` table
- Claude Opus 4.5 for opportunity ranking

**NEW INFRASTRUCTURE NEEDED:**
- Agent loop (multiple passes → prioritized list)
- Tool registry for search APIs
- Integration with web search (currently optional)

**RISK:** Low (read-only, no publishing)  
**HUMAN APPROVAL:** Review signals before they enter idea engine

---

### 2. Engagement Analyzer Agent

**PURPOSE:** Analyze comment sentiment, identify support questions, suggest replies  
**INPUTS:** Comments polled from platforms, post context  
**OUTPUTS:** Suggested replies, sentiment tags, priority flags  
**INFRASTRUCTURE TO REUSE:**
- `comments` table (already polled)
- Claude Sonnet 4.6 for reply drafting
- [packages/core/src/generation/prompts.ts](packages/core/src/generation/prompts.ts) reply draft prompt

**NEW INFRASTRUCTURE NEEDED:**
- Sentiment classification
- Support ticket routing
- Multi-comment thread understanding

**RISK:** Medium (replies drafted but not sent — human still sends)  
**HUMAN APPROVAL:** Every reply requires manual send

---

### 3. Content Strategist Agent

**PURPOSE:** Plan content calendar balancing mix targets, trends, campaigns  
**INPUTS:** Performance data, campaigns, mix targets  
**OUTPUTS:** Slots filled with ideas, calendar optimized  
**INFRASTRUCTURE TO REUSE:**
- [packages/core/src/generation/ideaEngine.ts](packages/core/src/generation/ideaEngine.ts) (idea selection)
- [packages/core/src/scheduling/launchBatch.ts](packages/core/src/scheduling/launchBatch.ts) (slotting)
- `campaigns` table

**NEW INFRASTRUCTURE NEEDED:**
- Agent loop for plan-review-refine
- Constraint solver (mix targets, platform limits, campaign windows)
- Feedback integration from metrics

**RISK:** Low (planning only, no publish)  
**HUMAN APPROVAL:** Calendar review before slots are committed

---

### 4. Feature Verification Agent

**PURPOSE:** Replay claimed product features, verify they work (M52 + Phase 3)  
**INPUTS:** Feature claims, product flows  
**OUTPUTS:** Verified/rejected claims  
**INFRASTRUCTURE TO REUSE:**
- [apps/worker/src/handlers/verifyFeature.ts](apps/worker/src/handlers/verifyFeature.ts) (framework exists)
- Playwright + browser automation
- OpenAI Vision for frame analysis

**NEW INFRASTRUCTURE NEEDED:**
- Agent loop for fallback flows
- Claim uncertainty handling
- Evidence collection

**RISK:** Medium (browser automation is fragile; read-only)  
**HUMAN APPROVAL:** Verification results reviewed before marking live

---

### 5. Media Optimization Agent

**PURPOSE:** Review rendered frames, suggest layout/text adjustments  
**INPUTS:** Rendered images/video frames, description from vision model  
**OUTPUTS:** Recommendations or re-render signals  
**INFRASTRUCTURE TO REUSE:**
- [apps/worker/src/handlers/reviewMedia.ts](apps/worker/src/handlers/reviewMedia.ts) (frame sampling)
- OpenAI Vision API
- `media_observations` column

**NEW INFRASTRUCTURE NEEDED:**
- Iterative refinement loop
- Layout suggestion prompts
- Template parameter optimization

**RISK:** Low (review only, recommendations only)  
**HUMAN APPROVAL:** Always (rendering requires input)

---

## 22. Agent Permission Model

### Proposed Framework

```
Action | Risk | Current | Recommended Tier
---|---|---|---
Read public post | None | [AUTO] | READ_ONLY
Read comments | None | [AUTO] | READ_ONLY
Read metrics | None | [AUTO] | READ_ONLY
Analyze creator | None | [AUTO] | READ_ONLY
Detect trends | None | [AUTO] | READ_ONLY
Draft comment | Low | [AUTO] (shown to human) | DRAFT_ONLY
Draft post | Low | [AUTO] (queued for approval) | DRAFT_ONLY
Generate idea | Low | [AUTO] (queued for review) | DRAFT_ONLY
Suggest reply | Low | [AUTO] (human sends) | DRAFT_ONLY
Classify sentiment | None | [AUTO] | READ_ONLY
Verify feature | Medium | Manual job | EXPLORE_ONLY
Schedule post | Medium | [HUMAN] | SCHEDULE_ONLY
**Publish post** | **High** | [HUMAN] | PUBLISH_ONLY
Reply to comment | High | [HUMAN] | NEVER
Follow account | High | [HUMAN] | NEVER
Like post | High | [HUMAN] | NEVER
Send DM | Very High | [HUMAN] | NEVER
Modify profile | Very High | [HUMAN] | NEVER
Delete post | Very High | [HUMAN] | NEVER
```

---

### Permission Tiers

**READ_ONLY**
- Access to platform APIs for reading
- Cannot create, modify, or delete anything
- Public social data only

**DRAFT_ONLY**
- Create draft content
- Content queued for human review
- Cannot publish

**EXPLORE_ONLY**
- Replay flows and capture screenshots
- Generate reports of findings
- Cannot interact with platform accounts

**SCHEDULE_ONLY**
- Place content in calendar slots
- Requires human approval first

**PUBLISH_ONLY**
- Publish pre-approved, pre-scheduled content
- Gated by kill switch
- Limited to exact slot times

**NEVER**
- No agent can do this
- Enforced at code level (no method exists)
- Human-only actions

---

## 23. Exact Implementation Gaps

### P0 — Blocking

1. **TTS Integration**
   - **WHAT:** ElevenLabs voice cloning for founder audio
   - **WHERE:** [apps/worker/src/handlers/tts.ts](apps/worker/src/handlers/tts.ts) (skeleton only)
   - **BLOCKER:** Video with voiceover cannot be completed
   - **EFFORT:** 40h (API integration + voice management + audio QC)

2. **Learning Loop**
   - **WHAT:** Feed performance metrics back into idea generation
   - **WHERE:** [packages/core/src/generation/ideaEngine.ts](packages/core/src/generation/ideaEngine.ts)
   - **BLOCKER:** Without learning, system cannot adapt to what resonates
   - **EFFORT:** 30h (scoring model, metric aggregation, feedback integration)

3. **MCP Tool Calling in Agent Loop**
   - **WHAT:** Agents cannot call RecipeFix tools yet (only synchronous calls in generation)
   - **WHERE:** No agent tool registry exists
   - **BLOCKER:** Cannot build discovery agents that use product APIs
   - **EFFORT:** 20h (tool registry, async caller, permission model)

---

### P1 — Critical

4. **Platform-Specific Adapters**
   - **WHAT:** LinkedIn (biggest B2B gap), Facebook (no adapter at all)
   - **BLOCKER:** 25% of target audience unreachable
   - **EFFORT:** 20h per platform (OAuth, constraints, publish, metrics)

5. **Conversation Discovery**
   - **WHAT:** Monitor what audiences are discussing (X mentions, etc.)
   - **WHERE:** No adapter reads third-party mentions
   - **BLOCKER:** Cannot position against competitors or market needs
   - **COST:** $30–75/month (X reads at $0.005 each)
   - **EFFORT:** 10h (API integration, filtering, signal creation)

6. **Scheduled Content Execution**
   - **WHAT:** Platforms without native scheduling (Bluesky, X)
   - **WHERE:** Publish job handles this but not robustly
   - **BLOCKER:** Cannot guarantee "publish at 8am" on non-supporting platforms
   - **EFFORT:** 15h (timezone logic, UTC alignment, retry with backoff)

---

### P2 — Important

7. **Multi-Platform Content Adaptation**
   - **WHAT:** Automatically adapt one idea to platform-specific formats
   - **WHERE:** generate handler drafts per-platform (works) but doesn't optimize across
   - **EFFORT:** 25h (constraint solver for format fit, multi-platform prompting)

8. **Influencer/Creator Mapping**
   - **WHAT:** Track which creators drive traffic (from link_clicks)
   - **WHERE:** attribution table exists but not used
   - **EFFORT:** 15h (aggregation, influencer database, recommendation model)

9. **Automated Compliance Checks**
   - **WHAT:** Flag claims that violate platform ToS before publish
   - **WHERE:** QC gates exist but don't cover platform-specific rules
   - **EFFORT:** 20h (per-platform rule database, checker model)

10. **Competitor Monitoring**
    - **WHAT:** Track competitor posts, identify gaps
    - **WHERE:** No public research capability
    - **EFFORT:** 30h (API integration, similarity matching, gap analysis)

---

### P3 — Later

11. **Feedback UI for Learning**
    - **WHAT:** Human grades ideas/posts for learning
    - **EFFORT:** 10h (UI + schema + aggregation)

12. **A/B Testing Framework**
    - **WHAT:** Automatically test variants and measure
    - **EFFORT:** 25h (variant creation, split routing, analysis)

13. **Trend Forecasting**
    - **WHAT:** Predict what's trending next, not just now
    - **EFFORT:** 40h (time-series model, data collection)

---

## 24. Final Architecture

### Current State (Halyard Today)

```
┌─────────────────────────────────────────────────────────┐
│                    HALYARD WEB APP                      │
│              (Next.js 15, App Router)                   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Dashboard │ Queue │ Inbox │ Accounts │ Settings │   │
│  └──────────────────────────────────────────────────┘   │
└──────────┬───────────────────────────────────────────────┘
           │ (Server Actions, Next.js)
           ↓
┌──────────────────────────────────────────────────────────┐
│              HALYARD CORE LIBRARY                        │
│  ┌─────────────────────────────────────────────────┐    │
│  │  AI Generation (writeDraft, runTakeLoop)        │    │
│  │  Platform Adapters (X, Instagram, TikTok, etc) │    │
│  │  QC Gates (slopFilter, claimVerifier, etc)      │    │
│  │  Public Research (Reddit, RSS, Pinterest)       │    │
│  │  OAuth & Token Management                       │    │
│  │  Connectors (RecipeFix MCP, GitHub)             │    │
│  │  Scheduling & Mix Logic                         │    │
│  │  Routing & Safety                               │    │
│  └─────────────────────────────────────────────────┘    │
└──────────┬──────────────┬───────────────────────────────┘
           │              │
           │ (Postgres)   │ (HTTP API, MCP)
           ↓              ↓
┌─────────────────────┐  ┌──────────────────────────┐
│ HALYARD DATABASE    │  │  EXTERNAL SERVICES      │
│  ├ products         │  │  ├ Anthropic API        │
│  ├ accounts         │  │  ├ OpenAI API           │
│  ├ content_items    │  │  ├ Platform APIs        │
│  ├ ideas            │  │  ├ RecipeFix MCP        │
│  ├ jobs (queue)     │  │  ├ GitHub API           │
│  ├ campaigns        │  │  └ Supabase Storage     │
│  ├ brand_voices     │  │                         │
│  ├ templates        │  │  PUBLIC SOURCES         │
│  └ [19 more]        │  │  ├ Reddit JSON          │
└─────────────────────┘  │  ├ RSS Feeds             │
                         │  └ Pinterest Trends      │
           ↑             └──────────────────────────┘
           │ (queries, inserts)
           │
┌──────────┴─────────────────────────────────────────────┐
│           HALYARD WORKER                               │
│  (Node.js Background Jobs)                             │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Scheduler (60s tick → enqueue due jobs)        │  │
│  │  Poller (continuous claim → execute → update)    │  │
│  │  Handlers (24 job kinds)                         │  │
│  │    ├ generate (LLM + QC)                         │  │
│  │    ├ publish (platform adapter + kill switch)    │  │
│  │    ├ render (Satori/Remotion)                    │  │
│  │    ├ collect_metrics (API polling)               │  │
│  │    └ [19 more]                                   │  │
│  └──────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

---

### Recommended Future State (Multi-Agent)

```
┌────────────────────────────────────────────────────────┐
│           HALYARD AGENT ORCHESTRATOR                   │
│  (New layer: Agent planning, routing, memory)          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Agent Router (route tasks to specialized agents) │  │
│  │ Agent Memory (persistent agent state)            │  │
│  │ Agent Planner (decompose goals → tasks)          │  │
│  │ Tool Registry (all agent tools in one place)     │  │
│  └──────────────────────────────────────────────────┘  │
└───────────┬──────────────────────────────────────────┘
            │ (spawn agents)
    ┌───────┼───────┬────────┬─────────┬────────┐
    ↓       ↓       ↓        ↓         ↓        ↓
 DISCO   ENGAGE  STRATEGY VERIFY   OPTIMIZE  [Other]
 AGENT   AGENT   AGENT     AGENT    AGENT
  └───┘   └───┘   └───┘     └───┘   └───┘

    Each agent:
    - Has its own tool set (discovery tools, drafting tools, verification tools)
    - Calls back to Halyard Core for execution
    - Stores findings in database
    - Returns results to orchestrator

            │ (all agents)
            ↓ (tool calls)
    ┌─────────────────────────┐
    │  HALYARD CORE + WORKER  │ (unchanged)
    │  + NEW TOOL LAYER       │
    └─────────────────────────┘
```

---

## Summary

### Key Takeaways

1. **Halyard is NOT a multi-agent system today.** It is a sophisticated workflow engine with:
   - Input-gated Daily Takes loop
   - Retry-based generation with QC feedback
   - Job-based publishing pipeline
   - Human-in-the-loop approval at every gate

2. **AI models are simple:** Anthropic (primary) + OpenAI (fallback). No fine-tuning, no function calling, no embeddings.

3. **Platform capabilities are real but constrained:** All 7 adapters implemented, but 6 of 7 gated by platform review. Only X and Bluesky allow live publishing without approval.

4. **Public research exists but limited:** Reddit, RSS, Pinterest trends. No conversation discovery (cost). No influencer mapping.

5. **No closed-loop learning yet.** Metrics are collected but not fed back into AI decisions.

6. **Routing safety is enforced at the database level,** not by code discipline. This is the right approach.

7. **The architecture is well-suited to multi-agent extension,** especially for:
   - Discovery agents (read-only, high value)
   - Engagement agents (draft-only, human approves)
   - Strategy agents (planning, calendar optimization)
   - Verification agents (feature claims, Q&A)

---

**Generated:** 2026-08-16  
**Repository:** Halyard (GoldenRodger5/Halyard)  
**Source of Truth:** Actual code and database schema
