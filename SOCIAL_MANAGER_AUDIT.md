# Social Manager Audit

This audit is grounded in the repository itself and reflects what is implemented, partially implemented, or clearly planned in code. It does not assume the product is greenfield; it treats the monorepo as the source of truth.

## Executive summary

Halyard is a real TypeScript monorepo for AI-assisted social content operations. It includes:

- a web app with dashboard, queue, inbox, account management, and onboarding
- a worker service with scheduled jobs and job handlers
- a shared core library for platform adapters, prompts, generation, routing, and publishing logic
- a Postgres/Supabase schema governing products, accounts, ideas, content, campaigns, routing safety, and link attribution
- render and asset pipeline support for images, video, and audio workflows

The strongest evidence shows that the system is already built as a production-oriented social operating layer rather than a mock prototype. It includes human-in-the-loop approval gates, account identity confirmation, OAuth for multiple platforms, reject/approve content flows, publishing kill switches, deduplicated publish jobs, and a real DB-backed content lifecycle.

The main caveat is that this is not a fully autonomous “fire and forget” system. The codebase explicitly keeps human review and approval in the critical path, and several platform capabilities are still gated by review, API constraints, or manual publication flow.

## Product classification

### Implemented

The following are clearly represented in code and active project structure:

- AI-assisted social content planning and drafting pipeline
- Product onboarding and calibration flow
- Brand and founder personas with routing safety
- OAuth connection flow for multiple platforms
- Real content queue and approval workflow
- Worker scheduler and job-driven execution
- Publish pipeline with duplicate protection and kill switches
- AI disclosure and compliance checks
- Post metrics and comment polling
- Campaign and destination routing
- Link tracking / attribution and app-store attribution model
- Renders and TTS/media generation tasks

### Partial / gated

These appear to be implemented but are constrained by platform rules, operator approval, or not fully finished:

- Cross-platform publishing is implemented per adapter, but actual live publishing depends on credentials, review approval, and account maturity
- Instagram, Threads, and TikTok have platform-specific permission and review gating
- Manual publish handoff exists for accounts marked draft_only or awaiting review
- Bulk autonomous posting is intentionally not enabled; the worker enforces a human approval queue

### Planned or unproven in code

The repo is not a blank slate, but it also does not prove a complete autonomous social empire with zero human oversight. The code shows strong infrastructure and clear product intent, but not an entirely self-running production pod across all channels.

## Architectural reality

### Web app
The app under apps/web is real and includes operational screens such as:

- dashboard
- queue
- inbox
- accounts
- onboarding
- health and settings surfaces

Evidence comes from the dashboard read-models, queue page, inbox page, account queries, and onboarding logic.

### Worker
The worker is a real background runner and includes:

- scheduler
- poller
- multiple handlers for generation, render, publish, metrics, comments, attribution, signals, newsletters, and media review

The job architecture is not a toy example; it is explicitly designed around deduplication, scheduling, kill switches, and retries with safety boundaries.

### Shared core
The core package contains the actual platform abstraction layer and generation logic:

- OAuth helpers and platform scopes
- per-platform adapter implementations
- publishing types and constraints
- AI generation clients and prompt assembly
- route selection, destination logic, and product mix logic

### Database / schema
The Supabase migrations show a mature content model:

- products
- signals
- ideas
- hooks
- series
- content_items
- campaigns
- destinations
- link_clicks
- app_store_attribution
- routing and identity tables

The schema explicitly contains safety checks that prevent obvious critical failure modes, including routing mispairing and AI disclosure gaps.

## Key code-backed findings

### 1. This is not a mock product

The repo contains real infrastructure, including:

- multi-platform OAuth flows
- scheduled jobs with dedupe keys
- connection preflight guidance
- database schema with operational constraints
- content approval queue and publishing state machine
- actual workers and handlers

### 2. Human review is intentionally central

The system explicitly keeps humans in the loop. Examples:

- queue items wait for approval
- inbox comments require a reply decision
- publish handler aborts duplicate posting
- manual publish path is defined for draft-only accounts
- no direct “auto-reply” method exists on the platform adapters

### 3. Platform constraints are real and enforced

The adapters encode platform-specific rules, such as:

- X pay-per-post and link strategy rules
- Instagram Graph API constraints and app review gating
- TikTok upload and posting limits
- YouTube upload expectations
- Pinterest board-based pin routes

### 4. Routing and identity safety are treated as core infrastructure

The database schema enforces routing scope and identity confirmation rather than relying on approval discipline alone. This is a strong sign that the project is trying to prevent catastrophic mistakes rather than tolerate them.

### 5. The project is production-shaped but not complete

The repo demonstrates a serious product machine, but the code still shows guardrails around live publishing, account review, and worker operations. It is therefore best classified as a real, partially operational platform foundation rather than a finished autonomous social media engine.

## Capability matrix

| Area | Status | Evidence |
|---|---|---|
| Monorepo / app structure | Implemented | Next.js app, worker, core, db, render, ui packages |
| Dashboard and product UI | Implemented | apps/web dashboard and query layer |
| Queue and inbox | Implemented | queue/inbox screens and action handlers |
| OAuth / account connection | Implemented | OAuth route flows and adapter helpers |
| Content drafting | Implemented | generation handlers and prompt logic |
| Publishing worker | Implemented | apps/worker/src/handlers/publish.ts |
| Scheduling / background jobs | Implemented | scheduler and job registry |
| SQL schema for content lifecycle | Implemented | Supabase migrations |
| Routing safety | Implemented | migration 0014 and publish guardrails |
| Manual approval gates | Implemented | queue and status model |
| Platform live posting | Partial / gated | adapter accounts require review and credentials |
| Fully autonomous social publishing | Not proven in code | Human approval and safety gates remain active |

## Bottom line

Halyard is a credible, production-shaped social content operating system already implemented in code. It is not a demo-only repo. It clearly includes the core machinery for AI generation, account onboarding, approval gates, worker orchestration, content lifecycle management, and platform publishing infrastructure.

The code does not show a fully autonomous social agent without approval loops. Instead, it shows a disciplined operating system that is trying to automate the heavy lifting while still keeping launch quality, compliance, and routing safety under human control.

## Evidence files reviewed

- apps/web/src/app/(dashboard)/page.tsx
- apps/web/src/app/api/oauth/[platform]/start/route.ts
- apps/web/src/app/api/oauth/[platform]/callback/route.ts
- apps/web/src/app/(dashboard)/accounts/page.tsx
- apps/web/src/app/(dashboard)/inbox/page.tsx
- apps/web/src/app/(dashboard)/queue/page.tsx
- apps/web/src/lib/queries.ts
- apps/worker/src/index.ts
- apps/worker/src/scheduler.ts
- apps/worker/src/handlers/index.ts
- apps/worker/src/handlers/publish.ts
- apps/worker/src/handlers/generate.ts
- packages/core/src/adapters/index.ts
- packages/core/src/adapters/oauth.ts
- packages/core/src/adapters/x.ts
- packages/core/src/adapters/instagram.ts
- packages/core/src/generation/llm.ts
- packages/core/src/generation/prompts.ts
- packages/core/src/accounts/preflight.ts
- supabase/migrations/0004_ideas_and_content.sql
- supabase/migrations/0014_accounts_destinations_campaigns.sql

## Repository truth statement

The repository is the source of truth. This audit classifies the system according to what exists in the codebase, not what the marketing copy or roadmap suggests.
