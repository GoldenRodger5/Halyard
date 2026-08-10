# Social Engine — Production Architecture

Build specification for an AI-assisted, multi-product social content system.
Target: implementable by Claude Code from this document.

**Products:** RecipeFix (now), Kinolog (later, no rework).
**Platforms:** X, Instagram, TikTok, Pinterest, YouTube, Threads.
**Operator:** one person, approving on desktop and mobile.

---

## 0. Scope, and what "connect it all at once" actually means

Every platform adapter is built now, in this build. What varies is not the code but each
account's **capability state**, which the system reads at publish time.

```
pending_auth → draft_only → live
```

`draft_only` means the adapter uploads the asset to the platform as an unpublished draft
and marks the item `awaiting_manual_publish` in the queue with a deep link. Nothing is
lost, nothing is blocked, no rework happens when approval lands — you flip a row.

Realistic same-day status:

| Platform | Same-day live? | Gate |
|---|---|---|
| **X** | Likely | Developer account + a paid tier for meaningful write volume |
| **Pinterest** | Likely | Standard app registration |
| **YouTube** | Likely | Google Cloud project + OAuth consent screen |
| **Threads** | Likely | Meta app, simpler permissions than Instagram |
| **Instagram** | Partly | Business/Creator account linked to a Facebook Page. Dev-mode testing works against your own account immediately; public use needs app review for content publishing |
| **TikTok** | `draft_only` | Content Posting API direct-publish requires passing an audit. Draft upload works before that |

**Verify all six against current official docs before writing adapter code.** Platform
terms, pricing, scopes, and review requirements change often. Treat every specific in §8 as
the shape of the problem, not as current fact.

---

## 1. System topology

```
┌───────────────────────────────────────────────────────────────────────┐
│  WEB APP — Next.js 15 App Router on Vercel                            │
│  Dashboard · Approval Queue · Calendar · Library · Analytics ·        │
│  Products · Accounts · Templates · Settings                           │
│  Route handlers: OAuth callbacks, webhooks, job enqueue, CRUD         │
└───────────────┬───────────────────────────────────────────────────────┘
                │
┌───────────────▼───────────────────────────────────────────────────────┐
│  SUPABASE (own project — NOT RecipeFix's)                             │
│  Postgres · Auth (single admin) · Storage (assets) · pg_cron          │
│  Tables: products, accounts, signals, ideas, content_items,           │
│          renders, jobs, publications, metrics, attribution, audit     │
└───────────────┬───────────────────────────────────────────────────────┘
                │  jobs table (FOR UPDATE SKIP LOCKED)
┌───────────────▼───────────────────────────────────────────────────────┐
│  WORKER — Node container on Railway or Fly.io                         │
│  Long-running. Ships Chromium.                                        │
│   • Remotion video render      • Playwright screen capture            │
│   • Satori/Sharp image render  • ElevenLabs TTS                       │
│   • Platform publish           • Metrics polling                      │
└───────────────┬───────────────────────────────────────────────────────┘
                │
┌───────────────▼───────────────────────────────────────────────────────┐
│  EXTERNAL                                                             │
│  Anthropic API · ElevenLabs · Platform APIs · PostHog (read)          │
│  RecipeFix MCP server (product data source)                           │
└───────────────────────────────────────────────────────────────────────┘
```

**Why a separate worker.** Vercel route handlers cap out well below a video render.
Remotion and Playwright both need real Chromium and sustained CPU. One container serves
both. Vercel handles the UI and short requests; the worker handles anything measured in
minutes.

### Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15, App Router, TypeScript strict |
| UI | Tailwind + shadcn/ui, lucide-react |
| Server state | TanStack Query |
| Forms | react-hook-form + zod |
| DB / Auth / Storage | Supabase |
| Worker | Node 20 container, `graphile-worker` or a hand-rolled poller |
| LLM | Anthropic API (`claude-opus-4-5` for strategy, `claude-sonnet-4-6` for drafts) |
| Image render | Satori + Sharp |
| Video render | Remotion |
| Screen capture | Playwright |
| TTS | ElevenLabs |
| Error tracking | Sentry |

---

## 2. Data model

Full schema. RLS on every table, single admin user.

```sql
-- ═══════════════════════════════════════════════════════════
-- PRODUCTS & CONFIGURATION
-- ═══════════════════════════════════════════════════════════

create table products (
  id                text primary key,              -- 'recipefix' | 'kinolog'
  name              text not null,
  tagline           text,
  website_url       text,
  app_store_url     text,
  status            text not null default 'active',

  -- The overview doc, chunked. Injected into generation prompts.
  brief_markdown    text,
  brief_summary     text,                          -- compressed, always in context
  brief_updated_at  timestamptz,

  -- Live product access
  connector_type    text not null,                 -- 'mcp' | 'rest' | 'none'
  connector_config  jsonb not null default '{}',   -- {url, auth_ref}

  -- Brand tokens for rendering
  brand_tokens      jsonb not null default '{}',
  -- {primary:'#C4714A', background:'hsl(50 20% 97%)',
  --  heading_font:'Instrument Serif', body_font:'Inter', logo_asset_id:'...'}

  -- Hard content rules, enforced in the copywriter prompt
  content_rules     jsonb not null default '{}',
  -- {forbidden_claims:['nutrition accuracy'],
  --  required_disclaimers:[], banned_phrases:['game changer','10x','revolutionizing']}

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table brand_voices (
  id            uuid primary key default gen_random_uuid(),
  product_id    text not null references products(id) on delete cascade,
  persona       text not null,                     -- 'founder' | 'brand'
  display_name  text not null,
  description   text not null,                     -- prose voice description
  do_rules      text[] not null default '{}',
  dont_rules    text[] not null default '{}',
  examples      jsonb not null default '[]',       -- [{platform, text, why_good}]
  mix_targets   jsonb not null default '{}',       -- {educational:0.4, product:0.15, ...}
  created_at    timestamptz not null default now(),
  unique (product_id, persona)
);

-- ═══════════════════════════════════════════════════════════
-- SOCIAL ACCOUNTS
-- ═══════════════════════════════════════════════════════════

create table social_accounts (
  id                   uuid primary key default gen_random_uuid(),
  product_id           text not null references products(id) on delete cascade,
  platform             text not null,              -- x|instagram|tiktok|pinterest|youtube|threads
  persona              text not null,              -- 'founder' | 'brand'
  handle               text not null,
  platform_user_id     text,

  -- OAuth. Tokens encrypted via pgsodium; never returned to the client.
  access_token_enc     bytea,
  refresh_token_enc    bytea,
  token_expires_at     timestamptz,
  scopes               text[] default '{}',

  -- Capability gating — this is what makes "connect everything now" work
  capability_state     text not null default 'pending_auth',
                       -- pending_auth | draft_only | live | error | disabled
  capability_detail    text,                       -- 'awaiting TikTok audit'
  supported_formats    text[] default '{}',        -- text|image|carousel|video|story
  rate_limit_config    jsonb default '{}',

  last_verified_at     timestamptz,
  last_error           text,
  created_at           timestamptz not null default now(),
  unique (product_id, platform, persona)
);

-- ═══════════════════════════════════════════════════════════
-- ASSET LIBRARY
-- ═══════════════════════════════════════════════════════════

create table assets (
  id            uuid primary key default gen_random_uuid(),
  product_id    text references products(id) on delete cascade,
  kind          text not null,        -- screenshot|logo|broll|font|photo|generated|capture
  storage_path  text not null,
  mime_type     text not null,
  width         int, height int, duration_seconds numeric,
  tags          text[] default '{}',  -- ['cook-mode','result-card','timer']
  caption       text,
  source        text,                 -- 'manual_upload' | 'playwright_capture' | 'render'
  usable_for    text[] default '{}',
  created_at    timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════
-- IDEA PIPELINE
-- ═══════════════════════════════════════════════════════════

create table signals (
  id            uuid primary key default gen_random_uuid(),
  product_id    text not null references products(id) on delete cascade,
  source        text not null,   -- product_activity|changelog|editorial|seasonal|trend|performance
  raw           jsonb not null,
  summary       text not null,
  relevance     numeric,
  consumed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index on signals (product_id, created_at desc) where consumed_at is null;

create table ideas (
  id             uuid primary key default gen_random_uuid(),
  product_id     text not null references products(id) on delete cascade,
  title          text not null,
  angle          text not null,          -- the actual insight
  category       text not null,          -- transformation|education|community|product|founder_insight
  rationale      text,                   -- why the system proposed it
  source_signals uuid[] default '{}',
  score          numeric not null default 0,
  score_breakdown jsonb default '{}',    -- {novelty, relevance, format_fit, historical}
  status         text not null default 'proposed',  -- proposed|selected|used|rejected|expired
  expires_at     timestamptz,            -- seasonal ideas
  created_at     timestamptz not null default now()
);
create index on ideas (product_id, status, score desc);

-- ═══════════════════════════════════════════════════════════
-- CONTENT — the core table
-- ═══════════════════════════════════════════════════════════

create table content_items (
  id              uuid primary key default gen_random_uuid(),
  product_id      text not null references products(id) on delete cascade,
  idea_id         uuid references ideas(id) on delete set null,
  account_id      uuid not null references social_accounts(id) on delete cascade,

  platform        text not null,
  persona         text not null,
  format          text not null,      -- text|image|carousel|video|story|pin
  category        text not null,

  -- Copy
  body            text not null,
  title           text,               -- YouTube/Pinterest
  alt_text        text,
  hashtags        text[] default '{}',
  link_url        text,               -- pre-UTM
  final_link_url  text,               -- UTM-stamped at schedule time

  -- Source material — the real product output this was built from
  product_artifact jsonb,             -- full adapt_recipe response, etc.

  -- Rendered media, ordered
  render_ids      uuid[] default '{}',

  -- Voiceover
  vo_script       text,
  vo_asset_id     uuid references assets(id),

  status          text not null default 'draft',
  -- draft|pending_approval|approved|scheduled|publishing|published
  -- |awaiting_manual_publish|failed|rejected|archived

  scheduled_at    timestamptz,
  published_at    timestamptz,

  -- Human feedback loop
  edited_by_human boolean not null default false,
  original_body   text,               -- pre-edit, for learning
  regen_notes     text[] default '{}',
  reject_reason   text,

  generation_meta jsonb default '{}',  -- {model, prompt_version, tokens, cost_usd}

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on content_items (status, scheduled_at);
create index on content_items (product_id, platform, created_at desc);

-- ═══════════════════════════════════════════════════════════
-- RENDERING
-- ═══════════════════════════════════════════════════════════

create table renders (
  id              uuid primary key default gen_random_uuid(),
  content_item_id uuid references content_items(id) on delete cascade,
  template_id     text not null,       -- 'transformation_diff_v2'
  renderer        text not null,       -- satori|remotion|playwright
  input_props     jsonb not null,      -- exact props — makes renders reproducible
  output_asset_id uuid references assets(id),
  status          text not null default 'queued',  -- queued|rendering|done|failed
  error           text,
  duration_ms     int,
  created_at      timestamptz not null default now()
);

create table templates (
  id            text primary key,      -- 'transformation_diff_v2'
  product_id    text references products(id) on delete cascade,
  renderer      text not null,
  format        text not null,
  aspect_ratio  text not null,         -- '1:1' | '4:5' | '9:16' | '16:9'
  props_schema  jsonb not null,        -- zod-compatible, validated before render
  description   text,
  preview_asset_id uuid references assets(id),
  enabled       boolean not null default true
);

-- ═══════════════════════════════════════════════════════════
-- JOBS
-- ═══════════════════════════════════════════════════════════

create table jobs (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null,   -- render|tts|capture|publish|collect_metrics|generate|collect_signals
  payload       jsonb not null,
  status        text not null default 'queued',  -- queued|running|done|failed|dead
  priority      int not null default 100,
  attempts      int not null default 0,
  max_attempts  int not null default 3,
  run_after     timestamptz not null default now(),
  locked_at     timestamptz,
  locked_by     text,
  last_error    text,
  created_at    timestamptz not null default now()
);
create index on jobs (status, run_after, priority) where status = 'queued';

-- ═══════════════════════════════════════════════════════════
-- PUBLISHING & MEASUREMENT
-- ═══════════════════════════════════════════════════════════

create table publications (
  id                uuid primary key default gen_random_uuid(),
  content_item_id   uuid not null references content_items(id) on delete cascade,
  account_id        uuid not null references social_accounts(id),
  platform          text not null,
  platform_post_id  text,
  permalink         text,
  publish_mode      text not null,   -- 'direct' | 'draft'
  published_at      timestamptz,
  error             text,
  raw_response      jsonb,
  created_at        timestamptz not null default now()
);
create unique index on publications (account_id, platform_post_id)
  where platform_post_id is not null;   -- idempotency

create table post_metrics (
  id              uuid primary key default gen_random_uuid(),
  publication_id  uuid not null references publications(id) on delete cascade,
  collected_at    timestamptz not null default now(),
  impressions int, reach int, likes int, comments int, shares int,
  saves int, video_views int, watch_time_seconds int,
  profile_visits int, link_clicks int, follows int,
  raw jsonb
);
create index on post_metrics (publication_id, collected_at desc);

-- Pulled from PostHog, keyed on utm_content = content_item_id
create table attribution (
  id                uuid primary key default gen_random_uuid(),
  content_item_id   uuid not null references content_items(id) on delete cascade,
  collected_at      timestamptz not null default now(),
  sessions int, signups int, activated_users int,
  adaptations int, saves int, cook_starts int, paid_conversions int
);

create table performance_scores (
  content_item_id  uuid primary key references content_items(id) on delete cascade,
  score            numeric not null,
  reach_score      numeric,
  engagement_score numeric,
  conversion_score numeric,
  computed_at      timestamptz not null default now(),
  notes            text
);

create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor       text not null,      -- 'human' | 'system'
  action      text not null,
  entity_type text, entity_id uuid,
  detail      jsonb,
  created_at  timestamptz not null default now()
);
```

---

## 3. Product connector

The abstraction that makes Kinolog a config change.

```ts
// lib/connectors/types.ts
export interface ProductConnector {
  id: string;
  generateSample(spec: SampleSpec): Promise<ProductArtifact>;
  listRecentActivity(since: Date): Promise<ActivityItem[]>;
  getChangelog(): Promise<ChangelogEntry[]>;
  healthCheck(): Promise<{ ok: boolean; detail?: string }>;
}

export interface SampleSpec {
  intent: string;                 // 'gluten-free lemon bars, show crust change'
  params: Record<string, unknown>;
}

export interface ProductArtifact {
  kind: string;                   // 'recipe_adaptation'
  raw: unknown;                   // full API response, stored verbatim
  headline: string;
  highlights: Highlight[];        // the interesting bits, extracted
  visualHints: string[];          // which templates suit this
}
```

### RecipeFix implementation, over the existing MCP server

```ts
// lib/connectors/recipefix.ts
class RecipeFixConnector implements ProductConnector {
  async generateSample(spec) {
    const recipe = await this.mcp.call('adapt_recipe', {
      url: spec.params.url,
      dietary: spec.params.dietary,
      servings: spec.params.servings,
    });

    return {
      kind: 'recipe_adaptation',
      raw: recipe,
      headline: recipe.recipeName,
      highlights: [
        // swaps where the reason is substantive, not just "scaled"
        ...recipe.ingredients
          .filter(i => i.changed && i.changeType !== 'scaled' && i.changeReason)
          .map(i => ({
            type: 'swap',
            before: i.original,
            after: i.adapted,
            reason: i.changeReason,
            alternative: i.alternative ?? null,
          })),
        // step notes are the highest-value content in the payload
        ...recipe.steps
          .filter(s => s.updated_note)
          .map(s => ({ type: 'technique', title: s.title, note: s.updated_note })),
        ...recipe.explanations.map(e => ({ type: 'chef_note', text: e })),
      ],
      visualHints: ['transformation_diff', 'carousel_6', 'technique_explainer'],
    };
  }
}
```

**Why this matters.** Content is built from real product output — actual `changeReason`
strings, actual `updated_note` text. Nothing is invented, so nothing can be wrong about
what the product does. This is also the answer to "it must understand the product": the
brief gives context, the MCP gives ground truth.

**Kinolog** later implements the same three methods over whatever interface it exposes.

---

## 4. Generation pipeline

### 4.1 Signal collection — cron, hourly

| Collector | Source |
|---|---|
| `product_activity` | `connector.listRecentActivity()` |
| `changelog` | `connector.getChangelog()` |
| `editorial` | Seeded backlog — the 39 RecipeFix substitution guides |
| `seasonal` | Static calendar, 6-week lookahead |
| `trend` | Read-only platform search on watch terms |
| `performance` | Top scorers from 30–90 days ago, re-templated |

### 4.2 Idea generation — cron, daily

Opus call. Input: product brief summary, brand voice, unconsumed signals, last 60 days of
titles (novelty check), top-10 historical performers, mix targets vs actual mix.

Output: 10–20 scored ideas with rationale.

Scoring:

```
score = 0.30 × relevance      (fits a validated use case)
      + 0.25 × novelty        (cosine distance from last 60 days)
      + 0.20 × format_fit     (renderable with existing templates?)
      + 0.15 × historical     (similar content's conversion; 0.5 at cold start)
      + 0.10 × timeliness     (seasonal proximity)
```

State the cold-start weights as hand-set in the UI. Don't dress guesses as learning.

### 4.3 Draft production — cron, daily

For each selected idea:

1. If the idea needs real product output → `connector.generateSample()`
2. Fan out to platform drafts — one Sonnet call **per platform**, never one call producing
   all platforms. Cross-posting is the failure mode to design against.
3. Copywriter prompt receives: brand voice + do/don't rules + `content_rules.forbidden_claims`
   + platform constraints + the artifact + 3–5 approved past posts as few-shot examples
4. Validate: length, hashtag count, banned phrases, forbidden claims, link presence
5. Pick a template, build props, enqueue `render` jobs
6. If video → generate VO script (separate prompt, written for the ear), enqueue `tts`,
   then `render` with the audio duration as input
7. Set status `pending_approval`

### 4.4 Prompt architecture

Versioned files in `prompts/`, with the version recorded in `content_items.generation_meta`
so a quality regression is traceable to a prompt change.

```
prompts/
  idea_generator.v1.md
  copywriter/
    x.v1.md
    instagram.v1.md
    tiktok.v1.md
    pinterest.v1.md
    youtube.v1.md
    threads.v1.md
  vo_script.v1.md
  performance_analyst.v1.md
```

Every copywriter prompt ends with the same hard block:

```
HARD RULES — violating any of these makes the output unusable:
- Never claim nutrition figures are accurate or verified.
- Never state a substitution is a perfect 1:1 replacement.
- Never invent product capabilities not present in the brief.
- Never use: {banned_phrases}
- Never mention a competitor by name.
- Every factual claim about a transformation must trace to the artifact provided.
```

---

## 5. Rendering

### 5.1 Images — Satori + Sharp

React → SVG → PNG. Fast, deterministic, no browser.

| Template | Aspect | Use |
|---|---|---|
| `transformation_diff` | 1:1, 4:5 | Struck-through original above the swap, reason below |
| `carousel_6` | 4:5 ×6 | Original → what breaks → swaps → why → chef notes → result |
| `substitution_ratio` | 1:1 | Ratio card + the failure mode |
| `chef_note_quote` | 1:1 | Pull quote on brand background |
| `pinterest_tall` | 2:3 | Keyword-forward, long half-life |
| `scaling_math` | 1:1 | "Doubling isn't multiplication" |

All read `products.brand_tokens` — terracotta `#C4714A`, warm cream, Instrument Serif
headings, Inter body. Fonts loaded from Storage as woff2 buffers.

### 5.2 Video — Remotion

Compositions take a `ProductArtifact` as props. Same component, infinite data.

| Composition | Length | Shape |
|---|---|---|
| `TransformationDiff` | 20–35s | Original ingredient strikes, replacement slides in, `changeReason` caption, macros tick |
| `SubstitutionExplainer` | 25–40s | Ratio animation, failure mode as payoff |
| `ScalingMath` | 20–30s | Non-linear scaling, visualized |
| `ChefNoteCard` | 12–20s | Kinetic typography over b-roll |
| `FeatureDemo` | 15–30s | Playwright capture, speed-ramped, captioned |

Render at 1080×1920, `--concurrency` tuned to worker CPU. **Audio-first timing:** generate
TTS, measure duration, pass as `durationInFrames` so motion and voice are locked.

### 5.3 Voiceover — ElevenLabs

Separate script prompt. Written for the ear: short sentences, no parentheticals, numbers
spoken ("four hundred fifty degrees"). Store as an asset, reuse across cuts.

### 5.4 Screen capture — Playwright

Scripted flows against the live app, video recording on. Handles the 75-second adaptation:

```ts
const flows = {
  adapt_and_reveal: async (page) => {
    await page.goto('https://recipefix.app/adapt');
    await page.fill('[data-testid="url-input"]', RECIPE_URL);
    await page.click('[data-testid="dietary-gluten-free"]');
    await page.click('[data-testid="adapt-submit"]');
    await page.waitForSelector('[data-testid="result-card"]', { timeout: 120_000 });
    await page.click('[data-testid="ingredient-swapped"]');   // the payoff frame
  },
  swap_toggle: async (page) => { /* one toggle changes four things */ },
  cook_mode_timer: async (page) => { /* timer + lock screen */ },
};
```

Post-process in Remotion: full speed through input, ramp the wait to ~2s under a progress
overlay, full speed on the reveal. **Scope this to App Store assets, Product Hunt, feature
launches, and the Cook Mode demo — not the daily feed.**

---

## 6. Job system

Single `jobs` table, `FOR UPDATE SKIP LOCKED`, worker polls every 2s.

```sql
update jobs set status='running', locked_at=now(), locked_by=$1, attempts=attempts+1
where id = (
  select id from jobs
  where status='queued' and run_after <= now()
  order by priority, created_at
  for update skip locked limit 1
) returning *;
```

| Kind | Timeout | Retries | Backoff |
|---|---|---|---|
| `generate` | 5 min | 2 | 60s |
| `render` (image) | 60s | 3 | 10s |
| `render` (video) | 15 min | 2 | 120s |
| `tts` | 2 min | 3 | 30s |
| `capture` | 5 min | 2 | 60s |
| `publish` | 5 min | 3 | 60s, **idempotent** |
| `collect_metrics` | 5 min | 3 | 300s |

**Publish idempotency is non-negotiable.** Before posting, check `publications` for an
existing row for this `content_item_id` + `account_id`. A retry that double-posts is the
worst bug this system can have.

Stale lock reaper: `locked_at < now() - interval '30 minutes'` → requeue.

---

## 7. Platform adapters

```ts
export interface PlatformAdapter {
  platform: string;
  getAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<TokenSet>;
  refresh(tokens: TokenSet): Promise<TokenSet>;
  verifyCapabilities(account: SocialAccount): Promise<CapabilityReport>;
  publish(item: ContentItem, assets: Asset[], account: SocialAccount): Promise<PublishResult>;
  collectMetrics(pub: Publication, account: SocialAccount): Promise<MetricSnapshot>;
  constraints: PlatformConstraints;   // maxChars, maxHashtags, video specs, ratios
}

export interface PublishResult {
  mode: 'direct' | 'draft';
  platformPostId?: string;
  permalink?: string;
  manualPublishUrl?: string;   // for draft mode
}
```

`publish()` reads `account.capability_state`. If `draft_only`, upload as draft and return
`mode:'draft'` — the queue then shows **"Uploaded as draft → finish in TikTok"** with a
deep link. Same code path, no branching in the UI beyond a badge.

### Per-platform notes — verify all before implementing

| Platform | Auth | Publish shape | Gotchas |
|---|---|---|---|
| **X** | OAuth2 PKCE, refresh tokens | Media upload → tweet with `media_ids` | Write volume tied to paid tier. Read limits may make reply-monitoring impractical — check before promising it |
| **Instagram** | Facebook Login → IG Graph | **Two-step:** create media container, poll status, then publish. Carousels create N children then a parent | Business/Creator + linked Page required. Content-publishing permission needs app review. Reels need a public asset URL, so upload to Storage with a signed public URL first |
| **TikTok** | OAuth | Content Posting API, chunked upload | Direct publish needs audit. **Default to draft.** |
| **Pinterest** | OAuth | Create pin on a board | Needs board management. Best keyword surface in the set |
| **YouTube** | Google OAuth | Resumable upload | Shorts = vertical + under the length cap. Set title/description/tags explicitly |
| **Threads** | Meta app | Container → publish, similar to IG | Simpler permissions than Instagram |

**Token storage.** Encrypt with pgsodium at rest. Never expose to the client — the browser
sees `capability_state` and `handle`, nothing more. Refresh runs as a cron job an hour
before expiry.

---

## 8. UI specification

### Layout

Desktop: persistent left sidebar (240px), content area max 1280px.
Mobile: bottom tab bar — Queue · Calendar · Library · More. **The queue must be fully
usable on a phone**; approval happens in spare moments or it doesn't happen.

### Routes

```
/                    Dashboard
/queue               Approval queue          ← the primary screen
/queue/[id]          Item detail / edit
/calendar            Scheduled view
/library             Published archive + performance
/ideas               Idea backlog
/analytics           Performance
/products            Product config
/products/[id]       Brief, voice, tokens, rules
/accounts            Social connections
/templates           Template gallery + live preview
/settings            API keys, cadence, cron
```

### `/` Dashboard

- Header: product switcher (RecipeFix ▾), date
- **Action strip:** `6 pending approval` · `3 scheduled today` · `1 failed` — each a link
- **Account health grid:** one chip per platform — green `live`, amber `draft_only`,
  red `error`, grey `pending_auth`. Amber and red show the reason inline
- **Last 7 days:** posts published, impressions, link clicks, signups, **activated users**
- **Opportunities panel:** AI-written, 2–4 lines
  > "Gluten-free transformations converted 2.7× better than dairy-free over 14 days."
  > "Pinterest link clicks convert at 3.1× X, on one-fifth the volume."

### `/queue` — the primary screen

Grouped by scheduled day, then platform. Filters: product, platform, persona, format, status.

Card anatomy:

```
┌────────────────────────────────────────────────────────┐
│ ● INSTAGRAM   BRAND   CAROUSEL        Today · 6:00 PM  │
├────────────────────────────────────────────────────────┤
│ ┌────┬────┬────┬────┬────┬────┐                        │
│ │ 1  │ 2  │ 3  │ 4  │ 5  │ 6  │  ← real rendered PNGs  │
│ └────┴────┴────┴────┴────┴────┘     tap to lightbox    │
│                                                        │
│ Chicken Alfredo, dairy-free + high-protein. The        │
│ cream sauce is the whole problem — here's what         │
│ actually replaces it, and why the heat changes...      │
│                                                        │
│ #dairyfree #highprotein #recipeswap                    │
│ → recipefix.app/adapt?utm_content=a3f9…                │
│                                                        │
│ ⓘ From: Chicken Alfredo → dairy-free (real adaptation) │
├────────────────────────────────────────────────────────┤
│ [✓ Approve] [✎ Edit] [↻ Regenerate] [✕ Reject] [🕐 ▾]  │
└────────────────────────────────────────────────────────┘
```

Requirements:

- **Previews are real.** Actual PNGs, actual playable MP4 with audio. Approving a
  description of an asset is not approval
- **Edit is inline.** Textarea in place, autosave, sets `edited_by_human`, preserves
  `original_body` for learning
- **Regenerate opens a note field** — "less salesy", "lead with the failure". Blind retry
  is a wasted call
- **Schedule** is a dropdown: Next slot · Tonight 6pm · Tomorrow 9am · Custom
- **Approve all** appears only when every visible item is brand-persona and low-risk.
  Founder posts and anything mentioning a competitor always require individual approval
- **Keyboard:** `j`/`k` navigate, `a` approve, `e` edit, `r` regenerate, `x` reject
- Render still in progress → skeleton with a spinner, Approve disabled
- Render failed → red state, error text, `Retry render`

### `/queue/[id]` Detail

Two columns. Left: full-size preview, carousel slide navigation, video scrubber, VO
waveform. Right: editable copy, hashtags, link, schedule, template picker with re-render,
the source artifact in a collapsible JSON viewer, generation metadata (model, prompt
version, cost), and a regeneration history diff.

### `/calendar`

Week and month views. Colour by platform, icon by format. Drag to reschedule. Density
warnings — "3 Instagram posts within 2 hours". Click opens the detail drawer.

### `/library`

Table: thumbnail, platform, date, format, category, impressions, link clicks, **activated
users**, score. Sortable, filterable. Row expands to the post plus its metric time series.
"Re-template" duplicates a winner as a fresh draft.

### `/ideas`

Ranked backlog with score breakdown as a small bar chart. Actions: Promote to draft ·
Snooze · Reject with reason. Manual "Add idea" for founder-originated angles.

### `/analytics`

- Funnel: impressions → clicks → signups → activated
- **Conversion by content category** — the chart that decides strategy
- Platform comparison, normalised per post
- Best/worst posts
- Attribution table joining `content_items` to PostHog cohorts on `utm_content`
- Honest empty state: "Not enough data yet. Meaningful comparison needs ~20 posts per
  category." Don't render noise as signal

### `/products/[id]`

Tabs: Brief (markdown editor + re-summarise) · Voices (founder/brand, do/don't lists,
few-shot examples, mix targets vs actual as a progress bar) · Brand tokens (colour pickers,
font upload, live preview) · Content rules (forbidden claims, banned phrases) · Connector
(MCP URL, health check button, "Generate test sample").

### `/accounts`

One row per platform per persona. Connect button → OAuth. Shows handle, scopes,
capability state with plain-language explanation:

> **TikTok — @recipefix** · `draft_only`
> Direct publishing requires passing TikTok's audit. Posts upload as drafts; finish
> publishing in the TikTok app. [Check status]

Manual override to flip `draft_only` → `live` once approval lands.

### `/templates`

Gallery with live preview against sample props. Renders on demand so a template change is
visible immediately.

---

## 9. Attribution

Every link is stamped at schedule time:

```
?utm_source={platform}&utm_medium=social
&utm_campaign={category}&utm_content={content_item_id}
```

`utm_content` is the content item's UUID — the join key.

A daily job queries PostHog for sessions grouped by `utm_content`, then the activation
cohort — *adapted a recipe AND (saved OR started Cook Mode) in the first session* — and
writes to `attribution`.

**Hard prerequisite:** RecipeFix must capture UTMs. Currently it does not — a grep for
`utm_` in `src/` returns zero results. That's roughly an hour of work in the RecipeFix
repo (fix spec item P2-8) and **without it this entire section produces nothing.**

Scoring, deliberately conversion-weighted:

```
score = 0.15 × normalise(impressions)
      + 0.25 × normalise(engagement_rate)
      + 0.60 × normalise(activated_users_per_1k_impressions)
```

Below ~1,000 impressions, show the score greyed with "low confidence".

---

## 10. Security

| Concern | Approach |
|---|---|
| Platform tokens | pgsodium-encrypted, server-only, never in a client payload |
| API keys | Env vars on Vercel + Railway. Never in the database |
| Auth | Supabase Auth, single admin, RLS on every table |
| Worker → DB | Service role key, worker-side only |
| Webhooks | Signature verification, replay window |
| Publish safety | Idempotency check before every post |
| Rate limits | Per-platform token bucket in `rate_limit_config`, enforced in the worker |
| Audit | Every human approve/edit/reject and every publish written to `audit_log` |

**Kill switch.** A `settings.publishing_enabled` boolean checked at the top of every
publish job. One toggle stops all outbound posting.

---

## 11. Build order

Discrete milestones. Each is a self-contained Claude Code prompt with a verifiable end
state.

| # | Milestone | Done when |
|---|---|---|
| 1 | Scaffold — Next.js, Supabase, full schema, RLS, auth, sidebar shell | Migrations apply, login works, all routes render empty states |
| 2 | Products + voices CRUD, brief upload, brand tokens | RecipeFix configured end to end |
| 3 | RecipeFix MCP connector | "Generate test sample" returns a real adaptation |
| 4 | Worker container + jobs table + poller | A test job runs and completes |
| 5 | Idea pipeline — signals, generation, `/ideas` | Daily cron produces scored ideas |
| 6 | Copywriter + `/queue` + approve/edit/reject/regenerate | Text drafts flow through approval |
| 7 | **X adapter** — OAuth, publish, metrics | **First real post published** |
| 8 | Satori image templates + `/templates` | Transformation cards render from real data |
| 9 | Pinterest + Threads adapters | Image posts publish |
| 10 | Instagram adapter — container flow, carousels, Reels | Dev-mode publish to own account |
| 11 | Remotion + ElevenLabs | Video with VO renders end to end |
| 12 | YouTube + TikTok (draft mode) | Video publishes to YouTube, drafts to TikTok |
| 13 | Playwright capture flows | Three demo captures produced |
| 14 | Metrics collection + `/library` + `/analytics` | Real numbers per post |
| 15 | Attribution join + performance scoring + opportunities | Activated users attributed per post |
| 16 | Calendar, keyboard shortcuts, mobile polish, kill switch | Fully operable from a phone |

**Milestone 7 is the meaningful checkpoint** — the first end-to-end loop from idea to
published post. Everything after is breadth.

---

## 12. Open items — verify before building

1. **Current API terms for all six platforms.** Pricing, scopes, rate limits, review
   requirements. Do this before writing adapter code, not during
2. **X read-tier limits** — determines whether reply-monitoring is feasible or manual
3. **Instagram app review timeline** — start it at milestone 1, not milestone 10
4. **TikTok audit requirements** — document the dependency; do not architect around
   direct publish
5. **Remotion licence terms** for commercial use
6. **RecipeFix MCP auth from a server context** — the existing OAuth flow is built for
   interactive clients; a machine-to-machine path may need adding
7. **Whether RecipeFix's UTM capture has shipped** — blocks §9 entirely

---

## 13. Deliberately excluded

Auto-reply and auto-DM. Follow/unfollow automation. Multi-account posting of identical
content. Engagement pods. Comment generation. Any metric-inflating behaviour.

The system suggests founder replies for manual sending. It never sends them. That line is
the difference between a growth tool and a spam operation, and it should be enforced in
code, not policy — there is no `reply()` method on the adapter interface.
