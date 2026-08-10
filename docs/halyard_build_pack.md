# Halyard — Build Pack

Final gap-fill before implementation. Companion to `social_engine_architecture.md` (v1) and
`social_engine_addendum_v2.md` (v2). Read those first; this document covers only what they
left open.

**Project name:** Halyard
**Repo:** `halyard`
**Purpose:** AI-assisted social content system for RecipeFix, extensible to Kinolog.

---

## 1. Timezone handling

Missing from v1 and v2, and it will cause bugs on day one if left implicit.

| Concern | Rule |
|---|---|
| Storage | **Everything UTC.** `timestamptz` throughout, no exceptions |
| Operator display | Convert to the operator's browser timezone for all UI |
| Slot definitions | Stored against a **product-level timezone**, not the operator's |
| Audience timezone | Separate from both. A US-audience product posts on US time regardless of where the operator is |
| DST | Slots are wall-clock local, so 18:00 stays 18:00 across the transition. Compute the UTC instant at schedule time, not at slot-definition time |

```sql
alter table products add column audience_timezone text not null default 'America/New_York';
alter table products add column operator_timezone text not null default 'America/New_York';
```

The scheduler resolves a slot to a UTC instant using `audience_timezone`. The UI renders in
`operator_timezone`. Never let these collapse into one field. Use `date-fns-tz` or
`Temporal` rather than hand-rolling offsets.

**Test case that must pass:** schedule an evening slot on the day DST changes and confirm it
publishes at 18:xx local, not 17:xx or 19:xx.

---

## 2. Cold start — the first-run problem

On day one Halyard has no voice examples, no proven hooks, no swipe file, and no performance
history. The generator will produce generic output because it has nothing to imitate. This
is the most likely reason the tool gets abandoned in week one.

### The calibration flow

A first-run wizard, and it is not optional.

**Step 1 — Ingest.** Upload the RecipeFix overview document. Halyard parses it into
`products.brief_markdown`, generates `brief_summary`, and extracts brand tokens
(`#C4714A`, warm cream, Instrument Serif, Inter) as editable defaults.

**Step 2 — Voice bootstrap.** Halyard asks 8 questions in a conversational flow:

```
Who are you writing as? (founder name, how you'd describe yourself in a sentence)
Name three accounts whose voice you like. Why?
What phrasing makes you cringe?
Formal or casual? Pick a point on a slider.
Do you swear? Ever, rarely, never?
What do you want to be known for?
What should you never be caught saying about the product?
Paste 3 things you've written that sound like you. Anything. Slack messages count.
```

From this it drafts `brand_voices` for both personas, which you then edit directly.

**Step 3 — Calibration batch.** Halyard generates **20 drafts across formats and platforms**
with no intent to publish. You approve, reject, or edit each one, and *every rejection asks
why* in one line. This produces:

- A seeded `hooks` table from approved openings
- Few-shot examples in `brand_voices.examples` from approved copy
- Negative examples from rejections, fed into the copywriter as "do not do this"
- Additional entries in the slop filter's banned list from your stated reasons

Twenty drafts takes about thirty minutes and it is the single highest-leverage half hour in
the whole system. This is the manual sprint from v1 §8 Phase 1, done inside the tool so the
learning is captured rather than lost.

**Step 4 — Template preview.** Render every image and video template against a real
adaptation. Approve or adjust each. Templates you reject are disabled rather than deleted.

**Step 5 — Connect accounts.** OAuth for all six platforms. Submit reviews.

Until steps 1 through 4 are complete, the daily generation cron does not run. Halyard should
say so explicitly rather than producing bad content silently.

---

## 3. Failure and edge-case policy

Every one of these needs a decided answer or it becomes an outage at 3am.

| Situation | Policy |
|---|---|
| Render fails, retries exhausted | Item → `failed`. Surfaces in the queue with the error and a `Retry render` button. Never publishes without media |
| Scheduled time passes while item is still `pending_approval` | Auto-move to the next matching slot, up to 3 times, then → `expired`. Never publish something you approved four days ago as if it were fresh |
| Scheduled time passes while item is `approved` but render incomplete | Wait up to 20 minutes, then reschedule to the next slot |
| Publish fails with an auth error | Account → `capability_state: 'error'`, `last_error` set, all queued items for that account paused, one notification. Do not retry blindly against a dead token |
| Publish fails with a rate-limit error | Exponential backoff, respect `Retry-After`, up to 3 attempts, then reschedule |
| Publish succeeds but response is malformed | Treat as **success with unknown ID**. Write the publication row with `platform_post_id: null` and flag for manual reconciliation. Never retry — that double-posts |
| Duplicate publish attempt detected | Hard abort. Log to `audit_log`. This is the failure that must never happen |
| Product connector (MCP) unreachable | Generation for that product pauses. Existing queue unaffected. Health check surfaces it on the dashboard |
| Anthropic API down | Generation job retries with backoff, then fails soft. Queue unaffected |
| Storage full or unavailable | Renders fail, queue unaffected, alert |
| Token expires during a publish | Refresh inline once, then retry once. If refresh fails, treat as auth error |

**One notification channel to start:** email to yourself via Resend, with a daily digest
plus immediate alerts for auth errors and duplicate-publish aborts. Do not build a
notification system.

---

## 4. Repository structure

```
halyard/
├── apps/
│   ├── web/                          Next.js 15, App Router
│   │   ├── app/
│   │   │   ├── (dashboard)/
│   │   │   │   ├── page.tsx                  /
│   │   │   │   ├── queue/
│   │   │   │   ├── compose/                  co-pilot
│   │   │   │   ├── calendar/
│   │   │   │   ├── library/
│   │   │   │   ├── ideas/
│   │   │   │   ├── inbox/                    comment replies
│   │   │   │   ├── analytics/
│   │   │   │   ├── products/
│   │   │   │   ├── accounts/
│   │   │   │   ├── templates/
│   │   │   │   └── settings/
│   │   │   ├── onboarding/                   first-run wizard
│   │   │   └── api/
│   │   │       ├── oauth/[platform]/callback/
│   │   │       ├── compose/stream/           SSE for co-pilot
│   │   │       ├── jobs/enqueue/
│   │   │       └── cron/[task]/
│   │   └── components/
│   └── worker/                       Node container
│       ├── src/
│       │   ├── poller.ts
│       │   └── handlers/
│       │       ├── generate.ts
│       │       ├── render.ts
│       │       ├── tts.ts
│       │       ├── capture.ts
│       │       ├── publish.ts
│       │       └── collectMetrics.ts
│       └── Dockerfile
├── packages/
│   ├── db/                           schema, migrations, generated types
│   ├── core/
│   │   ├── connectors/               ProductConnector + recipefix impl
│   │   ├── adapters/                 PlatformAdapter + 6 implementations
│   │   ├── generation/               prompts, copywriter, idea engine
│   │   ├── qc/                       slopFilter, claimVerifier, visualQC, audioQC
│   │   ├── scheduling/               slots, staggering, timezone resolution
│   │   └── scoring/                  performance scoring
│   ├── render/
│   │   ├── image/                    Satori templates
│   │   └── video/                    Remotion compositions
│   └── ui/                           shared components
├── prompts/                          versioned .md files
├── docs/
└── supabase/migrations/
```

Turborepo or pnpm workspaces. The `core` package must not import from `web` or `worker`,
so both can use it.

---

## 5. Environment variables

Names only.

**Web (Vercel):**
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
CRON_SECRET

X_CLIENT_ID / X_CLIENT_SECRET
META_APP_ID / META_APP_SECRET
TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET
PINTEREST_APP_ID / PINTEREST_APP_SECRET
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET

OAUTH_REDIRECT_BASE_URL
TOKEN_ENCRYPTION_KEY
SENTRY_DSN
```

**Worker (Railway/Fly):**
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID
REMOTION_LICENSE_KEY        # "free-license" while under 4 employees
RESEND_API_KEY
ALERT_EMAIL
POSTHOG_PROJECT_API_KEY     # read, for attribution
POSTHOG_HOST
RECIPEFIX_MCP_URL
RECIPEFIX_MCP_TOKEN
WORKER_ID
SENTRY_DSN
```

`.env.example` committed with every key and a comment. Never a value.

---

## 6. Testing

Not comprehensive coverage. Cover the things whose failure is expensive.

| Area | Type | Why |
|---|---|---|
| `slopFilter` | Unit, extensive | Pure function, cheap to test, and it is the quality floor. Include a fixture file of known-bad LLM copy that must all fail |
| `claimVerifier` | Unit | Path resolution against artifact fixtures. Must reject unresolvable paths |
| Scheduling and staggering | Unit | Timezone and DST cases. Gap enforcement. Jitter bounds |
| Platform adapters | Contract tests against recorded fixtures | Never hit live APIs in tests |
| **Publish idempotency** | Integration | The one bug that must never ship. Test concurrent publish of the same item |
| Render templates | Snapshot | Satori output diffed against approved PNGs |
| Job poller | Integration | `SKIP LOCKED` correctness under concurrency; stale lock reaping |
| QC gates | Unit | Known-good and known-bad media fixtures |

**CI from commit one.** RecipeFix has no CI and it cost sixteen days of silent drift. Do not
repeat it. GitHub Actions: typecheck, lint, test on every push. Block merge on failure.

---

## 7. Running cost

| Item | Monthly |
|---|---|
| Vercel | $0–20 |
| Supabase | $0–25 |
| Worker (Railway/Fly) | $5–20 |
| Anthropic (generation) | $10–40 |
| ElevenLabs | $5–22 |
| X API pay-per-use (1 link-free post/day + 1 link reply/day) | ~$7 |
| Remotion | $0 (free under 4 employees) |
| Pinterest / YouTube / Meta / TikTok APIs | $0 |
| Music licence | $0–15 |
| Sentry | $0 |
| **Total** | **~$30–150** |

The X link-post rate at $0.20 is the item that scales worst. Keep links in replies.

---

## 8. Observability

- **Sentry** in web and worker
- **Health page** at `/settings/health`: connector status, per-account capability state and
  token expiry, job queue depth, failed jobs in 24h, last successful publish per platform,
  render success rate
- **Daily digest email**: published, pending, failed, upcoming, token expiries within 7 days
- **Immediate alerts only for**: auth failure, duplicate-publish abort, job queue depth
  above 50, worker heartbeat missing over 15 minutes

Worker writes a heartbeat row every 60 seconds. Missing heartbeat is the only way to detect
a dead worker.

---

## 9. Data ownership

- **Export**: a settings action dumping all content, publications, and metrics to JSON.
  Platform data comes and goes; your content history should not depend on any vendor
- **Supabase point-in-time recovery** enabled
- **Pinterest exception**: their terms bar caching most API data. Give `post_metrics` a
  platform-aware retention policy and purge Pinterest rows per their current guidelines
- **Token rotation**: a settings action to force-refresh or revoke any platform token
- **The kill switch** (`settings.publishing_enabled`) checked at the top of every publish
  job, with a prominent toggle on the dashboard

---

## 10. Definition of done for v1

Halyard is complete enough to run the RecipeFix launch when:

1. First-run wizard completed, voice calibrated on 20 reviewed drafts
2. All six accounts OAuth'd; reviews submitted; X live
3. Daily cron produces ideas, drafts, and renders without intervention
4. Queue is fully operable from a phone
5. Co-pilot produces a finished post with video inside one conversation
6. All four QC gates run and display results
7. Publish is idempotent, verified by test
8. Comment inbox surfaces replies within 15 minutes of arrival
9. UTM stamping live, and RecipeFix captures UTMs on the other side
10. Kill switch works
11. CI green

Items 2 and 9 depend on things outside this repo. Start both on day one.
