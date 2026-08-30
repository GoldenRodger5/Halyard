/**
 * The canonical agent registry.
 *
 * Every model-driven agent in Halyard, declared once. This file is the
 * *contract*; `@halyard/audit` derives the observed truth from source and
 * reports where the two disagree.
 *
 * ## What belongs here
 *
 * Agents — components where a model perceives, reasons, or writes. Deterministic
 * quality gates are **not** agents and are audited separately: they are code
 * that decides, and mixing them in would blur the one architectural line the
 * whole system rests on.
 *
 * ## Registering an orphan is the point
 *
 * Three of these have no caller, and one has no implementation at all. They are
 * registered *because* they are broken. An orphan absent from the registry is
 * invisible; an orphan present in it is a tracked defect with a name, a reason
 * and a state the UI can show.
 *
 * The prior audit (`docs/AUDIT.md`) found these by counting callers by hand.
 * This registry plus the Auditor is that audit made continuous.
 */
import type { AgentContract } from './contract.js';

export const AGENT_REGISTRY: AgentContract[] = [
  // ── Team: content ────────────────────────────────────────────────────────
  {
    agentId: 'copywriter',
    name: 'Copywriter',
    team: 'content',
    kind: 'model',
    version: '1.0',
    purpose:
      'Writes the post copy for one platform, retrying against the slop filter and claim verifier until it passes or is refused.',
    model: 'draft',
    runtimeAttribution: 'prompt_version',
    /*
     * §381. `copywriter.v2`, which is what the source actually emits.
     *
     * The prompt was bumped and the contract was not, so the Auditor reported
     * an unregistered agent — a version emitted by the source and claimed by
     * nobody — while `copywriter.v1` was a contract describing something that
     * could not run. Both halves of one drift, and the check runs in both
     * directions precisely because either alone would have looked fine.
     */
    promptVersions: ['copywriter.v2'],
    implementation: 'packages/core/src/generation/copywriter.ts#writeDraft',
    inputSchema: {
      platform: 'SlopPlatform',
      format: 'ContentFormat',
      idea: '{ title, angle }',
      artifact: 'ProductArtifact | null',
      voice: 'BrandVoice with examples and anti-examples',
      contentRules: '{ forbiddenClaims, bannedPhrases }',
    },
    outputSchema: {
      body: 'string',
      title: 'string | undefined',
      altText: 'string | undefined',
      hashtags: 'string[]',
      claims: 'Claim[] each with a source path into the artifact',
      qc: 'QCResults',
    },
    tools: ['llm'],
    expectedCallers: [
      'apps/worker/src/handlers/generate.ts#generateHandler',
      'apps/worker/src/handlers/campaignSlot.ts#fillCampaignSlot',
    ],
    downstreamConsumer: 'content_items.body — read by the queue, the renderers and the publisher',
    permissions: ['read:product_artifact', 'write:content_items'],
    retries: 3,
    timeoutMs: null,
    state: ['content_items', 'brand_voices'],
    observations: [],
    acceptanceTests: [
      'packages/core/src/generation/generation.test.ts',
      'apps/worker/src/generate.test.ts',
    ],
    declaredStatus: 'implemented_partial',
    statusNote:
      'Wired and covered by tests, but nothing has published, so no production run exists. Per the architecture, invocation must be provable — a caller is not proof of execution.',
  },
  {
    agentId: 'vo-scriptwriter',
    name: 'VO Scriptwriter',
    team: 'content',
    kind: 'model',
    version: '2.0',
    purpose:
      'Writes the voiceover script for a video, gated by the spoken-mode slop rules and the product forbidden-claims list.',
    model: 'draft',
    runtimeAttribution: 'prompt_version',
    promptVersions: ['vo_script.v3'],
    implementation: 'packages/core/src/generation/copywriter.ts#writeVoScript',
    inputSchema: {
      body: 'string — the post copy this narrates',
      artifact: 'ProductArtifact | null',
      targetSeconds: 'number',
      platform: 'SlopPlatform',
      contentRules: '{ bannedPhrases, forbiddenClaims }',
    },
    outputSchema: { script: 'string', qc: 'QCResults', attempts: 'number' },
    tools: ['llm'],
    expectedCallers: ['apps/worker/src/handlers/generate.ts#generateHandler'],
    downstreamConsumer: 'content_items.vo_script — read by the tts handler',
    permissions: ['write:content_items'],
    retries: 3,
    timeoutMs: null,
    state: ['content_items'],
    observations: [],
    acceptanceTests: ['packages/core/src/generation/generation.test.ts'],
    declaredStatus: 'implemented_partial',
    statusNote:
      'Wired and covered by tests, but nothing has published, so no production run exists. Per the architecture, invocation must be provable — a caller is not proof of execution.',
  },
  {
    agentId: 'hook-generator',
    name: 'Hook Generator',
    team: 'content',
    kind: 'model',
    version: '1.0',
    purpose:
      'Generates eight hook variants across a typed taxonomy, each as four coordinated layers rather than one string.',
    model: 'draft',
    runtimeAttribution: 'prompt_version',
    promptVersions: ['hooks.v1'],
    implementation: 'packages/core/src/generation/hooks.ts#generateHookVariants',
    inputSchema: {
      body: 'string',
      format: 'string',
      category: 'string',
      platform: 'string',
      isVideo: 'boolean',
      avoidTypes: 'HookType[] — recently used, to break formula',
    },
    outputSchema: {
      variants: 'HookVariant[] — hookType, textHook, spokenHook, visualDirection, captionHook',
    },
    tools: ['llm'],
    expectedCallers: ['apps/worker/src/hooks.ts#runHookStage'],
    downstreamConsumer: 'hook_variants — and content_items.body when a variant is applied',
    permissions: ['write:hook_variants', 'write:content_items'],
    retries: 0,
    timeoutMs: null,
    state: ['hooks', 'hook_variants'],
    observations: [],
    acceptanceTests: ['packages/core/src/generation/hooks.test.ts', 'apps/worker/src/hooks.test.ts'],
    declaredStatus: 'implemented_partial',
    statusNote:
      'Wired and covered by tests, but nothing has published, so no production run exists. Per the architecture, invocation must be provable — a caller is not proof of execution.',
  },
  {
    agentId: 'copilot',
    name: 'Compose Co-pilot',
    team: 'content',
    kind: 'model',
    version: '1.0',
    purpose: 'Streams assistance while the operator composes a post by hand.',
    model: 'draft',
    runtimeAttribution: 'prompt_version',
    promptVersions: ['copilot.v1'],
    implementation: '/api/compose/stream',
    inputSchema: { messages: 'ChatMessage[]', sessionId: 'uuid' },
    outputSchema: { stream: 'text/event-stream of assistant tokens' },
    tools: ['llm'],
    expectedCallers: ['apps/web/src/app/(dashboard)/compose/page.tsx'],
    downstreamConsumer: 'compose_sessions — and the operator, directly',
    permissions: ['write:compose_sessions'],
    retries: 0,
    timeoutMs: null,
    state: ['compose_sessions'],
    observations: [],
    acceptanceTests: [],
    declaredStatus: 'implemented_partial',
    statusNote:
      'Reachable from the compose screen, but no automated test covers the streaming route.',
  },
  {
    agentId: 'idea-generator',
    name: 'Idea Generator',
    team: 'content',
    kind: 'model',
    version: '1.0',
    purpose:
      'Proposes content ideas from the product brief and recent performance, for the deterministic idea engine to score.',
    model: 'strategy',
    runtimeAttribution: 'prompt_version',
    promptVersions: ['idea_generator.v1'],
    implementation: 'packages/core/src/generation/ideaGenerator.ts#proposeIdeas',
    inputSchema: {
      productBrief: 'string',
      signals: 'Array<{ id, source, summary }>',
      mixTargets: 'Record<category, number>',
      recentTitles: 'string[]',
    },
    outputSchema: { ideas: 'Array<{ title, angle, category, rationale }>' },
    tools: ['llm'],
    expectedCallers: ['apps/worker/src/handlers/generate.ts#proposeFromSignals'],
    downstreamConsumer: 'ideas — scored by ideaEngine.ts',
    permissions: ['write:ideas'],
    retries: 0,
    timeoutMs: null,
    state: ['ideas', 'signals'],
    observations: ['signals raised by collect_watch_terms when a question recurs'],
    acceptanceTests: [
      'packages/core/src/generation/ideaGenerator.test.ts',
      'apps/worker/src/generate.test.ts',
    ],
    declaredStatus: 'implemented_partial',
    statusNote:
      'Wired on 2026-08-19. `ideas` had no writer in the repository except `supabase/seed-demo.sql`, so `generate` found nothing proposed and returned on every run; `signals` was read by nothing. Both are closed: `proposeFromSignals` runs when no ideas are proposed and at least one unconsumed signal exists, and every idea carries the signal ids in `source_signals`. Still `implemented_partial` rather than exercised — it has never run against a live model, because there are no credits.',
  },

  // ── Team: quality ────────────────────────────────────────────────────────
  {
    agentId: 'payoff-verifier',
    name: 'Payoff Verifier',
    team: 'quality',
    kind: 'model',
    version: '1.0',
    purpose:
      'Decides whether the body of a post delivers the promise its hook makes. Fails closed: an unparseable answer is treated as undelivered.',
    model: 'draft',
    runtimeAttribution: 'prompt_version',
    promptVersions: ['hook_payoff.v1'],
    implementation: 'packages/core/src/generation/hooks.ts#verifyPayoff',
    inputSchema: { hook: 'string', body: 'string' },
    outputSchema: { delivered: 'boolean', where: 'string | null', reason: 'string' },
    tools: ['llm'],
    expectedCallers: ['apps/worker/src/hooks.ts#runHookStage'],
    downstreamConsumer: 'the applied hook — a failed payoff demotes to the runner-up',
    permissions: [],
    retries: 0,
    timeoutMs: null,
    state: [],
    observations: ['whether the body pays off the hook, and where'],
    acceptanceTests: ['packages/core/src/generation/hooks.test.ts', 'apps/worker/src/hooks.test.ts'],
    declaredStatus: 'implemented_partial',
    statusNote:
      'Wired and covered by tests, but nothing has published, so no production run exists. Per the architecture, invocation must be provable — a caller is not proof of execution.',
  },
  {
    agentId: 'vision-describer',
    name: 'Vision Describer',
    team: 'quality',
    kind: 'model',
    version: '1.0',
    purpose:
      'Describes what is visibly present in sampled video frames. Has no parameter for the post it belongs to, so it cannot be told what it is supposed to see.',
    model: 'vision',
    runtimeAttribution: 'explicit',
    promptVersions: [],
    implementation: 'packages/core/src/generation/vision.ts#OpenAiVisionClient.describeFrames',
    inputSchema: { images: 'ImageInput[] — sampled frames with timestamps' },
    outputSchema: {
      observations: 'FrameObservation[] — atSeconds, describes, visibleText',
    },
    tools: ['vision-api'],
    expectedCallers: ['apps/worker/src/handlers/reviewMedia.ts#reviewMediaHandler'],
    downstreamConsumer: 'runCoherenceQC — and content_items.qc_results.gates',
    permissions: ['read:assets'],
    retries: 0,
    timeoutMs: null,
    state: ['content_items'],
    observations: ['what each frame shows', 'text visible on screen'],
    acceptanceTests: ['apps/worker/src/reviewMedia.test.ts'],
    declaredStatus: 'implemented_partial',
    statusNote:
      'A vision model rather than a chat completion, so it carries no promptVersion and its runs are recorded explicitly rather than at the LLM seam. No production run exists yet.',
  },

  // ── Team: founder ────────────────────────────────────────────────────────
  {
    agentId: 'take-fact-checker',
    name: 'Take Fact Checker',
    team: 'founder',
    kind: 'model',
    version: '1.0',
    purpose:
      "Fact-checks the founder's own claim before anything is drafted, so the take can be revised rather than published with a footnote.",
    model: 'strategy',
    runtimeAttribution: 'prompt_version',
    promptVersions: ['take_fact_check.v1'],
    implementation: 'packages/core/src/founder/dailyTake.ts#factCheckTake',
    inputSchema: { rawInput: 'string', storyTitle: 'string', storyUrl: 'string' },
    outputSchema: {
      claims: 'Array<{ claim, verdict, note, sources, correction }>',
      storyVerified: 'boolean',
    },
    tools: ['llm', 'web-search'],
    expectedCallers: ['packages/core/src/founder/dailyTake.ts#runTakeLoop'],
    downstreamConsumer: 'takes.fact_check — and the take screen, which blocks on it',
    permissions: ['write:takes'],
    retries: 0,
    timeoutMs: null,
    state: ['takes'],
    observations: ['which assertions are supported, contradicted or unverifiable'],
    acceptanceTests: ['packages/core/src/founder/dailyTake.test.ts'],
    declaredStatus: 'implemented_partial',
    statusNote:
      'Wired and covered by tests, but nothing has published, so no production run exists. Per the architecture, invocation must be provable — a caller is not proof of execution.',
  },
  {
    agentId: 'take-drafter',
    name: 'Take Drafter',
    team: 'founder',
    kind: 'model',
    version: '1.0',
    purpose:
      "Drafts the founder's take in their voice, preserving the opinion rather than sanding it down.",
    model: 'strategy',
    runtimeAttribution: 'prompt_version',
    promptVersions: ['take_draft.v1'],
    implementation: 'packages/core/src/founder/dailyTake.ts#draftTake',
    inputSchema: { rawInput: 'string', verification: 'VerificationResult', voice: 'string' },
    outputSchema: { draft: 'string', likelyPushback: 'string' },
    tools: ['llm'],
    expectedCallers: ['packages/core/src/founder/dailyTake.ts#runTakeLoop'],
    downstreamConsumer: 'takes.draft — approved into content_items',
    permissions: ['write:takes'],
    retries: 0,
    timeoutMs: null,
    state: ['takes'],
    observations: [],
    acceptanceTests: ['packages/core/src/founder/dailyTake.test.ts'],
    declaredStatus: 'implemented_partial',
    statusNote:
      'Wired and covered by tests, but nothing has published, so no production run exists. Per the architecture, invocation must be provable — a caller is not proof of execution.',
  },
  {
    agentId: 'take-strengthener',
    name: 'Take Strengthener',
    team: 'founder',
    kind: 'model',
    version: '1.0',
    purpose:
      'Finds the supporting argument and the strongest honest counter, so a take is published knowing its own weakness.',
    model: 'strategy',
    runtimeAttribution: 'prompt_version',
    promptVersions: ['take_reinforce.v1'],
    implementation: 'packages/core/src/founder/dailyTake.ts#strengthenTake',
    inputSchema: { rawInput: 'string', storyTitle: 'string' },
    outputSchema: {
      supporting: 'string[]',
      strongestCounter: 'string',
      riskFlags: 'string[]',
    },
    tools: ['llm'],
    expectedCallers: ['packages/core/src/founder/dailyTake.ts#runTakeLoop'],
    downstreamConsumer: 'takes.supporting, takes.strongest_counter — shown on the take screen',
    permissions: ['write:takes'],
    retries: 0,
    timeoutMs: null,
    state: ['takes'],
    observations: ['the strongest argument against the founder position'],
    acceptanceTests: ['packages/core/src/founder/dailyTake.test.ts'],
    declaredStatus: 'implemented_partial',
    statusNote:
      'Wired and covered by tests, but nothing has published, so no production run exists. Per the architecture, invocation must be provable — a caller is not proof of execution.',
  },
  {
    agentId: 'find-drafter',
    name: 'Find Drafter',
    team: 'founder',
    kind: 'model',
    version: '1.0',
    purpose: 'Turns a saved find into a founder tip draft.',
    model: 'draft',
    runtimeAttribution: 'prompt_version',
    promptVersions: ['copywriter.founder.tip.v1'],
    implementation: 'apps/web/src/app/(dashboard)/finds/actions.ts#draftFind',
    inputSchema: { find: 'finds row', voice: 'BrandVoice' },
    outputSchema: { body: 'string' },
    tools: ['llm'],
    expectedCallers: ['apps/web/src/app/(dashboard)/finds/page.tsx'],
    downstreamConsumer: 'content_items — entering the approval queue',
    permissions: ['write:content_items'],
    retries: 0,
    timeoutMs: null,
    state: ['finds', 'content_items'],
    observations: [],
    acceptanceTests: [],
    declaredStatus: 'implemented_partial',
    statusNote: 'Reachable from the finds screen; no automated test covers the drafting path.',
  },

  // ── Team: engagement ─────────────────────────────────────────────────────
  {
    agentId: 'reply-drafter',
    name: 'Reply Drafter',
    team: 'engagement',
    kind: 'model',
    version: '1.0',
    purpose:
      'Drafts a reply to a real comment. Drafts only — nothing in Halyard sends a reply without an explicit human action.',
    model: 'draft',
    runtimeAttribution: 'prompt_version',
    promptVersions: ['reply_drafter.v1'],
    implementation: 'apps/web/src/app/(dashboard)/inbox/actions.ts#draftReply',
    inputSchema: { comment: 'comments row', voice: 'BrandVoice', product: 'brief' },
    outputSchema: { reply: 'string' },
    tools: ['llm'],
    expectedCallers: ['apps/web/src/app/(dashboard)/inbox/page.tsx'],
    downstreamConsumer: 'comment_replies — surfaced for the operator to send by hand',
    permissions: ['write:comment_replies'],
    retries: 0,
    timeoutMs: null,
    state: ['comments', 'comment_replies'],
    observations: [],
    acceptanceTests: ['packages/core/src/generation/generation.test.ts'],
    declaredStatus: 'implemented_partial',
    statusNote:
      'The prompt builder is tested; the server action that calls it is not covered end to end.',
  },

  // ── Team: setup ──────────────────────────────────────────────────────────
  {
    agentId: 'setup-kit-writer',
    name: 'Setup Kit Writer',
    team: 'setup',
    kind: 'model',
    version: '1.0',
    purpose:
      'Writes profile copy — bios, pinned posts — for a platform, within that platform’s own character rules.',
    model: 'draft',
    runtimeAttribution: 'prompt_version',
    promptVersions: ['setup-kit.v1'],
    implementation: 'packages/core/src/setup/kit.ts#generateProfileCopy',
    inputSchema: { platform: 'PlatformId', product: 'brief', voice: 'BrandVoice' },
    outputSchema: { bios: 'Array<{ text, rationale }>', pinnedPost: 'string' },
    tools: ['llm'],
    expectedCallers: ['apps/web/src/app/(dashboard)/setup-kit/actions.ts#generateKit'],
    downstreamConsumer: 'setup_kit_entries — downloaded as a ZIP by the operator',
    permissions: ['write:setup_kit_entries'],
    retries: 0,
    timeoutMs: null,
    state: ['setup_kit_entries'],
    observations: [],
    acceptanceTests: ['e2e/setup-kit.spec.ts'],
    declaredStatus: 'implemented_partial',
    statusNote:
      'Wired and covered by tests, but nothing has published, so no production run exists. Per the architecture, invocation must be provable — a caller is not proof of execution.',
  },

  // ── Team: explorer ───────────────────────────────────────────────────────
  {
    agentId: 'explorer-discovery',
    name: 'Explorer Discovery',
    team: 'explorer',
    kind: 'model',
    version: '1.0',
    purpose:
      'Proposes what a product page lets a user do, each claim carrying the steps that would prove it. Cannot mark anything verified.',
    model: 'draft',
    runtimeAttribution: 'prompt_version',
    promptVersions: ['explorer_discovery.v1'],
    implementation: 'packages/core/src/explorer/discovery.ts#discoverClaims',
    inputSchema: { outline: 'PageOutline — roles, names, visible text', productName: 'string' },
    outputSchema: {
      accepted: 'ProposedClaim[] — name, summary, replayable steps',
      rejected: 'RejectedClaim[] — with the reason',
    },
    tools: ['llm', 'browser'],
    expectedCallers: ['apps/worker/src/handlers/explore.ts#exploreHandler'],
    downstreamConsumer: 'feature_claims — replayed by the verify_feature job',
    permissions: ['write:feature_claims'],
    retries: 0,
    timeoutMs: null,
    state: ['feature_claims'],
    observations: ['what a page appears to let a user do'],
    acceptanceTests: ['packages/core/src/explorer/explorer.test.ts'],
    declaredStatus: 'implemented_partial',
    statusNote:
      'Wired to the explore_product job, which is deliberately unscheduled and has never run against a real product — no exploration credentials are configured.',
  },

  // ── Team: learning ───────────────────────────────────────────────────────
  {
    agentId: 'rejection-clusterer',
    name: 'Rejection Clusterer',
    team: 'learning',
    kind: 'model',
    version: '1.0',
    purpose:
      'Groups repeated rejections into a pattern the copywriter can follow, rather than five separate anti-examples.',
    model: 'strategy',
    runtimeAttribution: 'prompt_version',
    promptVersions: ['rejection_clusters.v1'],
    implementation: 'packages/core/src/generation/rejectionClusters.ts#clusterRejections',
    inputSchema: { rejections: 'Array<{ body, reason, rejectedAt }>' },
    outputSchema: { clusters: 'Array<{ pattern, examples, rule }>' },
    tools: ['llm'],
    expectedCallers: ['apps/worker/src/handlers/clusterRejections.ts#clusterRejectionsHandler'],
    downstreamConsumer:
      'rejection_clusters → the dashboard surfaces it → acceptCluster writes products.content_rules.operator_rules → the copywriter DO NOT list',
    permissions: ['write:rejection_clusters'],
    retries: 0,
    timeoutMs: null,
    state: ['rejection_clusters', 'products'],
    observations: ['what the operator consistently rejects'],
    acceptanceTests: [
      'packages/core/src/generation/hooks.test.ts',
      'apps/worker/src/clusterRejections.test.ts',
    ],
    declaredStatus: 'implemented_exercised',
    statusNote:
      'The `cluster_rejections` job runs daily per product and writes the clusters the dashboard reads. The clustering itself is deterministic — `clusterRejections` matches known complaint vocabulary — so it needs no model and no credits; `inferRejectionPattern` remains uncalled and would only name a group that matches no known pattern. Two chain breaks were repaired at the same time: nothing wrote rejection_clusters, and nothing read the operator_rules that accepting one produces.',
  },

  // ── Team: product_intelligence ───────────────────────────────────────────
  {
    agentId: 'shipped-feature-summariser',
    name: 'Shipped Feature Summariser',
    team: 'product_intelligence',
    kind: 'model',
    version: '1.0',
    purpose: 'Reads merged pull requests and summarises what actually shipped.',
    model: 'strategy',
    runtimeAttribution: 'prompt_version',
    promptVersions: ['shipped_features.v1'],
    implementation: 'packages/core/src/connectors/github.ts#summariseShippedFeatures',
    inputSchema: { pulls: 'MergedPullRequest[]' },
    outputSchema: { features: 'Array<{ title, summary, userFacing }>' },
    tools: ['llm', 'github-api'],
    expectedCallers: [],
    downstreamConsumer: 'shipped_features — zero rows in production',
    permissions: ['write:shipped_features'],
    retries: 0,
    timeoutMs: null,
    state: ['shipped_features'],
    observations: ['what changed in the product'],
    acceptanceTests: [],
    declaredStatus: 'blocked',
    statusNote:
      'RecipeFix ships through Lovable and has no merged pull requests to read. The Explorer supersedes this by inspecting the product rather than its history.',
  },

  /*
   * P1 — the Product Brain.
   *
   * Five agents that propose facts from observed evidence. What none of them
   * can do is decide anything: `parseProposals` discards every field that is
   * not a proposal, and status and confidence are computed by
   * `deriveFactStatus` and `computeConfidence` from the evidence rows alone.
   *
   * Their shared downstream consumer is `product_facts`, read by the Brain UI
   * and stamped through `markOutputConsumed` — which before this phase had no
   * production caller at all, meaning no agent could ever have reached
   * `implemented_exercised` however often it ran.
   */
  {
    agentId: 'product-discovery',
    name: 'Product Discovery',
    team: 'product_intelligence',
    kind: 'model',
    version: '1.0',
    purpose:
      "Proposes what a product is and who it serves, from its public web surface. Cannot set a fact's status or confidence.",
    model: 'strategy',
    runtimeAttribution: 'prompt_version',
    /* §381. `product_discovery.v2` is what `brain/agents.ts` emits. */
    promptVersions: ['product_discovery.v2'],
    implementation: 'packages/core/src/brain/agents.ts#discoverProductFacts',
    inputSchema: {
      productName: 'string',
      evidence: 'EvidenceForPrompt[] — collected web pages, verbatim',
    },
    outputSchema: {
      accepted: 'ProposedFact[] — category, key, value, detail',
      rejected: 'Array<{ key, reason }> — kept, so a failing prompt is visible',
    },
    tools: ['llm'],
    expectedCallers: ['apps/worker/src/handlers/buildBrain.ts#buildBrainHandler'],
    downstreamConsumer: 'product_facts — read by /brain and its category screens',
    permissions: ['read:product_evidence', 'write:product_facts'],
    retries: 0,
    timeoutMs: null,
    state: ['product_evidence', 'product_facts'],
    observations: ['what a product says it is, on its own website'],
    acceptanceTests: ['packages/core/src/brain/brain.test.ts', 'apps/worker/src/buildBrain.test.ts'],
    declaredStatus: 'implemented_partial',
    statusNote:
      'Wired to build_product_brain and covered by tests. Until the job runs against a real product there is no recorded execution, and a caller is not proof of one.',
  },
  {
    agentId: 'store-listing',
    name: 'Store Listing',
    team: 'product_intelligence',
    kind: 'model',
    version: '1.0',
    purpose:
      'Proposes how a product positions itself in an app store listing, where the constraints reveal what the operator thinks matters most.',
    model: 'strategy',
    runtimeAttribution: 'prompt_version',
    promptVersions: ['store_listing.v1'],
    implementation: 'packages/core/src/brain/agents.ts#discoverListingFacts',
    inputSchema: {
      productName: 'string',
      evidence: 'EvidenceForPrompt[] — the listing page and its JSON-LD',
    },
    outputSchema: { accepted: 'ProposedFact[]', rejected: 'Array<{ key, reason }>' },
    tools: ['llm'],
    expectedCallers: ['apps/worker/src/handlers/buildBrain.ts#buildBrainHandler'],
    downstreamConsumer: 'product_facts — read by /brain/app_store_positioning',
    permissions: ['read:product_evidence', 'write:product_facts'],
    retries: 0,
    timeoutMs: null,
    state: ['product_evidence', 'product_facts'],
    observations: ['how a product presents itself under store constraints'],
    acceptanceTests: ['packages/core/src/brain/brain.test.ts'],
    declaredStatus: 'implemented_partial',
    statusNote:
      'Wired and tested; no recorded run until the job executes against the live listing.',
  },
  {
    agentId: 'code-intelligence',
    name: 'Code Intelligence',
    team: 'product_intelligence',
    kind: 'model',
    version: '1.0',
    purpose:
      'Proposes what a product genuinely supports, from the API surface it actually exposes rather than from what it says about itself.',
    model: 'strategy',
    runtimeAttribution: 'prompt_version',
    promptVersions: ['code_intelligence.v1'],
    implementation: 'packages/core/src/brain/agents.ts#discoverImplementationFacts',
    inputSchema: {
      productName: 'string',
      evidence: 'EvidenceForPrompt[] — the connector tool surface',
    },
    outputSchema: { accepted: 'ProposedFact[]', rejected: 'Array<{ key, reason }>' },
    tools: ['llm'],
    expectedCallers: ['apps/worker/src/handlers/buildBrain.ts#buildBrainHandler'],
    downstreamConsumer: 'product_facts — read by /brain/workflows and /brain/ux_model',
    permissions: ['read:product_evidence', 'write:product_facts'],
    retries: 0,
    timeoutMs: null,
    state: ['product_evidence', 'product_facts'],
    observations: ['which capabilities a product API really exposes'],
    acceptanceTests: ['packages/core/src/brain/brain.test.ts'],
    declaredStatus: 'implemented_partial',
    statusNote:
      "Reads the connector's advertised tool surface, which is the available implementation truth for a product that ships without a repository. Deliberately not a second GitHub agent — shipped-feature-summariser is already blocked on the same absent input.",
  },
  {
    agentId: 'visual-brand',
    name: 'Visual Brand',
    team: 'product_intelligence',
    kind: 'model',
    version: '1.0',
    purpose:
      "Proposes a product's design language from descriptions of its screens — what recurs, rather than what one screenshot shows.",
    model: 'strategy',
    runtimeAttribution: 'prompt_version',
    promptVersions: ['visual_brand.v1'],
    implementation: 'packages/core/src/brain/agents.ts#discoverVisualFacts',
    inputSchema: {
      productName: 'string',
      evidence: 'EvidenceForPrompt[] — screenshot descriptions from the vision describer',
    },
    outputSchema: { accepted: 'ProposedFact[]', rejected: 'Array<{ key, reason }>' },
    tools: ['llm'],
    expectedCallers: ['apps/worker/src/handlers/buildBrain.ts#buildBrainHandler'],
    downstreamConsumer: 'product_facts — read by /brain/visual_identity',
    permissions: ['read:product_evidence', 'write:product_facts'],
    retries: 0,
    timeoutMs: null,
    state: ['product_evidence', 'product_facts'],
    observations: ['what a product consistently looks like'],
    acceptanceTests: ['packages/core/src/brain/brain.test.ts'],
    declaredStatus: 'implemented_partial',
    statusNote:
      'Wired and tested. It runs only when screenshot evidence exists; with none collected it is skipped and says so, rather than proposing a design language from nothing.',
  },
  {
    agentId: 'product-reconciler',
    name: 'Product Reconciler',
    team: 'product_intelligence',
    kind: 'model',
    version: '1.0',
    purpose:
      'Explains why two observations of one fact differ. It does not decide which is right, and it does not go looking — findContradictions does that.',
    model: 'strategy',
    runtimeAttribution: 'prompt_version',
    promptVersions: ['product_reconciler.v1'],
    implementation: 'packages/core/src/brain/agents.ts#explainContradiction',
    inputSchema: {
      contradiction: 'ReconciliationInput — one slot, two values, their sources',
    },
    outputSchema: { explanation: 'string — prose, never a decision' },
    tools: ['llm'],
    expectedCallers: ['apps/worker/src/handlers/buildBrain.ts#buildBrainHandler'],
    downstreamConsumer: 'product_facts.reconciliation — read by /brain/contradictions',
    permissions: ['read:product_facts', 'write:product_facts'],
    retries: 0,
    timeoutMs: null,
    state: ['product_facts'],
    observations: ['why two sources might disagree'],
    acceptanceTests: ['packages/core/src/brain/brain.test.ts'],
    declaredStatus: 'implemented_partial',
    statusNote:
      'Wired and tested. It runs only when the deterministic pass finds a contradiction, so an empty run is the correct outcome on a consistent product rather than a missing feature.',
  },

  // ── Team: content (media) ────────────────────────────────────────────────
  {
    agentId: 'auto-clip',
    name: 'Auto Clip',
    team: 'content',
    kind: 'model',
    version: '1.0',
    purpose: 'Picks the clip-worthy moments out of a longer piece of footage.',
    model: 'draft',
    runtimeAttribution: 'prompt_version',
    promptVersions: ['autoclip.v1'],
    implementation: 'packages/core/src/generation/autoClip.ts#findClipCandidates',
    inputSchema: { transcript: 'WhisperWord[]', durationSeconds: 'number' },
    outputSchema: { candidates: 'ClipCandidate[] — start, end, reason' },
    tools: ['llm'],
    expectedCallers: [],
    downstreamConsumer: null,
    permissions: [],
    retries: 0,
    timeoutMs: null,
    state: [],
    observations: ['which moments carry a complete idea'],
    acceptanceTests: ['packages/core/src/generation/autoClip.test.ts'],
    declaredStatus: 'blocked',
    statusNote:
      'Still blocked, and for an unchanged reason: Halyard ingests no long-form footage, so nothing can call it. Ingestion is a product decision, not missing plumbing. What did change is that "blocked" was being used to excuse "untested" — the deterministic half (duration bounds, the strength floor, overlap resolution, the ffmpeg arguments) is now covered with fixtures and a stub model. No live model call has been made and none is claimed.',
  },

  // ── Team: creative direction (§226-§233) ─────────────────────────────────
  {
    agentId: 'creative-director',
    name: 'Creative Director',
    team: 'content',
    kind: 'deterministic',
    version: '1.0',
    purpose:
      'Chooses the visual language every other creative decision hangs off, from platform, treatment, emotional angle, available assets, measured performance and what the account did last. Refuses languages the piece cannot coherently be.',
    model: null,
    runtimeAttribution: 'explicit',
    promptVersions: [],
    implementation: 'packages/core/src/creative/director.ts#directCreative',
    inputSchema: { platform: 'string', treatment: 'string', emotionalAngle: 'string | null', targetSeconds: 'number', hasProductFootage: 'boolean', recentLanguages: 'string[]', insights: 'Insight[]' },
    outputSchema: { language: 'VisualLanguage', reason: 'string', considered: 'Array<{ language, score, why }>' },
    tools: [],
    expectedCallers: ['apps/worker/src/handlers/generate.ts#generateHandler'],
    downstreamConsumer: 'creative_briefs.visual_direction.language — read by typography, motion and the music director',
    permissions: ['read:creative_briefs'],
    retries: 0,
    timeoutMs: null,
    state: ['creative_briefs'],
    observations: [],
    acceptanceTests: ['packages/core/src/creative/director.test.ts'],
    declaredStatus: 'implemented_exercised',
    statusNote:
      'Deterministic by design: a resolution of constraints that all exist as data. A model would be less consistent and could not explain itself against the alternatives.',
  },
  {
    agentId: 'visual-director',
    name: 'Visual Director',
    team: 'content',
    kind: 'deterministic',
    version: '1.0',
    purpose:
      'Picks the typography system from what fits the visual language and what the account least recently used, and cannot name a face that is not bundled.',
    model: null,
    runtimeAttribution: 'explicit',
    promptVersions: [],
    implementation: 'packages/core/src/creative/typography.ts#selectTypography',
    inputSchema: { visualLanguage: 'string', recentSystemIds: 'string[]', pinned: 'string | null' },
    outputSchema: { system: 'TypographySystem', reason: 'string', alternatives: 'string[]' },
    tools: [],
    expectedCallers: ['apps/worker/src/handlers/generate.ts#generateHandler'],
    downstreamConsumer: 'renders.input_props.presentation.typography — drawn by every treatment',
    permissions: ['read:creative_briefs'],
    retries: 0,
    timeoutMs: null,
    state: ['creative_briefs'],
    observations: [],
    acceptanceTests: ['packages/core/src/creative/typography.test.ts'],
    declaredStatus: 'implemented_exercised',
    statusNote:
      'Every language has at least three compatible systems, asserted in the test: two alternate, and an alternation reads as a pattern.',
  },
  {
    agentId: 'story-architect',
    name: 'Story Architect',
    team: 'content',
    kind: 'deterministic',
    version: '1.0',
    purpose:
      'Chooses the opening composition from what the artifact actually contains, refusing a layout whose requirement is absent rather than inventing one to unlock it.',
    model: null,
    runtimeAttribution: 'explicit',
    promptVersions: [],
    implementation: 'packages/core/src/creative/openings.ts#chooseOpening',
    inputSchema: { text: 'string', visualLanguage: 'string', hasMedia: 'boolean', numeral: 'string | null', beforeState: 'string | null', recent: 'string[]' },
    outputSchema: { composition: 'OpeningComposition', holdWords: 'number | undefined', reason: 'string', unavailable: 'Array<{ composition, because }>' },
    tools: [],
    expectedCallers: ['apps/worker/src/handlers/generate.ts#generateHandler'],
    downstreamConsumer: 'renders.input_props.beats[hook].opening — drawn by HookTitle',
    permissions: ['read:creative_briefs'],
    retries: 0,
    timeoutMs: null,
    state: ['creative_briefs'],
    observations: [],
    acceptanceTests: ['packages/core/src/creative/openings.test.ts'],
    declaredStatus: 'implemented_exercised',
    statusNote:
      'The numeral opening is unavailable without a real figure: inventing a number to unlock a composition would fabricate evidence for a design reason.',
  },
  {
    agentId: 'motion-director',
    name: 'Motion Director',
    team: 'content',
    kind: 'deterministic',
    version: '1.0',
    purpose:
      'Resolves entrance, camera move and transition for every beat, so the renderer draws a decision rather than making one.',
    model: null,
    runtimeAttribution: 'explicit',
    promptVersions: [],
    implementation: 'packages/core/src/creative/motion.ts#motionForPlan',
    inputSchema: { treatment: 'string', language: 'VisualLanguage | undefined', beats: 'Array<{ role, emphasis, hasMedia, wordCount }>' },
    outputSchema: { motions: 'BeatMotion[]' },
    tools: [],
    expectedCallers: ['apps/worker/src/handlers/generate.ts#beatsForRender'],
    downstreamConsumer: 'renders.input_props.beats[].motion — drawn by Enter, Camera and Cascade',
    permissions: ['read:creative_briefs'],
    retries: 0,
    timeoutMs: null,
    state: ['renders'],
    observations: [],
    acceptanceTests: ['packages/core/src/creative/motion.test.ts'],
    declaredStatus: 'implemented_exercised',
    statusNote:
      'Thirteen languages produce thirteen distinct motion signatures, asserted in the test: a set of labels over one behaviour is variety that is not variety.',
  },
  {
    agentId: 'voice-director',
    name: 'Voice Director',
    team: 'content',
    kind: 'deterministic',
    version: '1.0',
    purpose:
      'Sets the synthesis performance and writes the delivery notes the script must be written for, because the endpoint exposes no emphasis or speed control.',
    model: null,
    runtimeAttribution: 'explicit',
    promptVersions: [],
    implementation: 'packages/core/src/audio/voice.ts#directVoice',
    inputSchema: { platform: 'string', visualLanguage: 'string | null', emotionalAngle: 'string | null', targetSeconds: 'number' },
    outputSchema: { energy: 'VoiceEnergy', stability: 'number', similarityBoost: 'number', deliveryNotes: 'string[]' },
    tools: [],
    expectedCallers: ['apps/worker/src/handlers/generate.ts#generateHandler', 'apps/worker/src/handlers/tts.ts#ttsHandler'],
    downstreamConsumer: 'creative_briefs.audio_direction and the ElevenLabs synthesis request',
    permissions: ['read:creative_briefs', 'write:content_items'],
    retries: 0,
    timeoutMs: null,
    state: ['creative_briefs', 'content_items'],
    observations: [],
    acceptanceTests: ['packages/core/src/audio/voice.test.ts'],
    declaredStatus: 'implemented_exercised',
    statusNote:
      'Stability is a performance setting rather than a quality one; pace and stress live in the sentences because the API cannot take them.',
  },
  {
    agentId: 'music-director',
    name: 'Music Director',
    team: 'content',
    kind: 'deterministic',
    version: '1.0',
    purpose:
      'Selects a licensed bed matching the mood, energy and tempo the creative direction implies, and derives the mix level and duck depth. Licence is a gate, not a tiebreak.',
    model: null,
    runtimeAttribution: 'explicit',
    promptVersions: [],
    implementation: 'packages/core/src/audio/director.ts#selectBed',
    inputSchema: { library: 'MusicBed[]', brief: 'AudioBrief' },
    outputSchema: { chosen: 'MusicBed | null', rejected: 'Array<{ bed, reason }>', silenceReason: 'string | null' },
    tools: [],
    expectedCallers: ['apps/worker/src/bed.ts#LibraryBedClient'],
    downstreamConsumer: 'The audio mix, and content_items.qc_results.audio',
    permissions: ['read:creative_briefs'],
    retries: 0,
    timeoutMs: null,
    state: ['music_beds'],
    observations: [],
    acceptanceTests: ['packages/core/src/audio/director.test.ts'],
    declaredStatus: 'implemented_exercised',
    statusNote:
      '§311: no longer blocked. Seven CC0 beds imported from Openverse, one per mood the director can ask for. CC0 rather than CC-BY because attribution that depends on a caption surviving truncation will eventually be breached.',
  },
  {
    agentId: 'researcher',
    name: 'Researcher',
    team: 'content',
    kind: 'model',
    version: '1.0',
    purpose:
      'Finds facts with sources that can actually be read, and verifies every one before it reaches a writer. A writer handed verified facts cannot cite a page that does not exist.',
    model: 'claude-opus-5',
    runtimeAttribution: 'prompt_version',
    promptVersions: ['researcher.v1'],
    implementation: 'packages/core/src/generation/researcher.ts#research',
    inputSchema: { subject: 'string', productContext: 'string', want: 'number', preferDomains: 'string[]' },
    outputSchema: { facts: 'SourcedFact[]', rejected: 'Array<{ claim, url, because }>' },
    tools: ['fetch'],
    expectedCallers: ['apps/worker/src/formatWriter.ts'],
    downstreamConsumer: 'writeToFormat, which cites from these rather than from memory',
    permissions: [],
    retries: 0,
    timeoutMs: 60_000,
    state: [],
    observations: [],
    acceptanceTests: ['packages/core/src/generation/researcher.test.ts'],
    declaredStatus: 'implemented_exercised',
    statusNote:
      'Wired into formatWriter: a sourced format researches before it writes, and the writer is told to cite only from the verified list. Research failing is not fatal — the writer falls back to citing from memory and the gate still refuses what it invents.',
  },
  {
    agentId: 'screenwriter',
    name: 'Screenwriter',
    team: 'content',
    kind: 'model',
    version: '1.0',
    purpose:
      'Writes the whole piece at once — what is said, what is read, what the ground is, what moves, what is marked and what the score does — as a screenplay a person can read before it is made. The other directors execute it.',
    model: 'claude-sonnet-5',
    runtimeAttribution: 'prompt_version',
    promptVersions: ['screenwriter.v1'],
    implementation: 'packages/core/src/generation/screenwriter.ts#writeScreenplay',
    inputSchema: {
      subject: 'string',
      format: 'string',
      channel: 'string',
      productFacts: 'Array<{ category, key, value }>',
      marks: 'string[]',
      locatable: 'string[]',
      hasFootage: 'boolean',
    },
    outputSchema: { screenplay: 'Screenplay', costUsd: 'number' },
    tools: [],
    expectedCallers: ['scripts/write-screenplay.ts'],
    downstreamConsumer: 'checkScreenplay, then the motion, annotation and music directors',
    permissions: ['read:product_facts'],
    retries: 1,
    timeoutMs: null,
    state: [],
    observations: [],
    acceptanceTests: ['packages/core/src/creative/screenplay.test.ts'],
    declaredStatus: 'implemented_partial',
    statusNote:
      'Writes and passes `checkScreenplay` against a real product Brain; the render path does not consume a screenplay yet. Every direction it gives is checked for producibility before use — the model directs, the code decides whether the direction can be carried out.',
  },
  {
    agentId: 'annotation-director',
    name: 'Annotation Director',
    team: 'content',
    kind: 'deterministic',
    version: '1.0',
    purpose:
      'Decides which moments earn a mark, what kind, and where it points. A mark requires both a voice referring to something and a frame that can locate it; either alone produces a mark that means nothing.',
    model: null,
    runtimeAttribution: 'explicit',
    promptVersions: [],
    implementation: 'packages/core/src/creative/annotationDirector.ts#planAnnotations',
    inputSchema: {
      narration: 'SpokenLine[]',
      targets: 'MarkTarget[]',
      marks: 'MarkKind[]',
      durationSeconds: 'number',
    },
    outputSchema: { marks: 'PlannedMark[]', skipped: 'Array<{ label, because }>' },
    tools: [],
    expectedCallers: ['apps/worker/src/handlers/render.ts'],
    downstreamConsumer: 'The Walkthrough composition’s callouts and the annotate layer',
    permissions: [],
    retries: 0,
    timeoutMs: null,
    state: [],
    observations: [],
    acceptanceTests: ['packages/core/src/creative/annotationDirector.test.ts'],
    declaredStatus: 'implemented_exercised',
    statusNote:
      'Wired into the render path: a callout survives only where the director marked its region. The Auditor caught it as an orphan while it was declared and unwired, which is what that check is for.',
  },
  {
    agentId: 'product-inference',
    name: 'Product Inference',
    team: 'product_intelligence',
    kind: 'model',
    version: '1.0',
    purpose:
      'Reasons over established facts to conclude what follows — competitors, personas, jobs-to-be-done — where no page states it. Stored as `inferred`, which may shape how a piece is written and may never be asserted.',
    model: 'claude-opus-5',
    runtimeAttribution: 'prompt_version',
    promptVersions: ['product_inference.v1'],
    implementation: 'packages/core/src/brain/agents.ts#inferProductFacts',
    inputSchema: { productName: 'string', facts: 'Array<{ category, key, value }>' },
    outputSchema: { accepted: 'ProposedFact[]', rejected: 'Array<{ key, reason }>' },
    tools: [],
    expectedCallers: ['apps/worker/src/handlers/buildBrain.ts'],
    downstreamConsumer: 'product_facts, at status `inferred` and confidence 0.35',
    permissions: ['read:product_facts'],
    retries: 0,
    timeoutMs: null,
    state: ['product_facts'],
    observations: [],
    acceptanceTests: ['packages/core/src/brain/brain.test.ts'],
    declaredStatus: 'implemented_exercised',
    statusNote:
      'Reasons over facts rather than raw pages, so every inference has something checkable underneath it. EVIDENTIAL_STATUSES excludes `inferred`, so nothing published can cite one.',
  },
  {
    agentId: 'photographic-subject',
    name: 'Photographic Subject',
    team: 'content',
    kind: 'model',
    version: '1.0',
    purpose:
      'Names the physical thing a piece is about, so the hero photograph is of the video rather than of an unrelated artifact. Perceives a subject; `checkSubject` decides whether it can be photographed.',
    model: 'claude-haiku-4-5',
    /* It stamps promptVersion on the request, so that is how a run is attributed. */
    runtimeAttribution: 'prompt_version',
    promptVersions: ['photographic-subject@1'],
    implementation: 'packages/core/src/imagery/subject.ts#photographicSubject',
    inputSchema: { line: 'string', productContext: 'string | undefined' },
    outputSchema: { subject: 'string | null', reason: 'string' },
    tools: [],
    expectedCallers: ['apps/worker/src/handlers/generate.ts'],
    downstreamConsumer: 'heroPrompt, and therefore every generated hero image',
    permissions: [],
    retries: 0,
    timeoutMs: null,
    state: [],
    observations: [],
    acceptanceTests: ['packages/core/src/imagery/subject.test.ts'],
    declaredStatus: 'implemented_exercised',
    statusNote:
      'Its answer is checked before use: a sentence, an empty reply or an abstraction is refused and the caller falls back to the artifact. A model may not decide that its own subject is photographable.',
  },
  {
    agentId: 'sound-director',
    name: 'Sound Designer',
    team: 'content',
    kind: 'deterministic',
    version: '1.0',
    purpose:
      'Places effects on moments the edit already decided, and refuses languages where punctuation would read as a sizzle reel.',
    model: null,
    runtimeAttribution: 'explicit',
    promptVersions: [],
    implementation: 'packages/core/src/audio/sfx.ts#planSfx',
    inputSchema: { beats: 'Array<{ startSeconds, role, transitionOut, entrance, isProductFootage }>', totalSeconds: 'number', visualLanguage: 'string | null' },
    outputSchema: { cues: 'SfxCue[]', refusedReason: 'string | null' },
    tools: [],
    expectedCallers: ['packages/core/src/audio/sfx.ts#selectEffect'],
    downstreamConsumer: 'The audio mix',
    permissions: ['read:creative_briefs'],
    retries: 0,
    timeoutMs: null,
    state: ['sound_effects'],
    observations: [],
    acceptanceTests: ['packages/core/src/audio/sfx.test.ts'],
    declaredStatus: 'blocked',
    statusNote:
      'BLOCKED ON PROCUREMENT: sound_effects ships empty. A UI sound is only placed where a real interaction was captured; a tap over footage where nothing is tapped is a fabricated interaction.',
  },
  {
    agentId: 'platform-creative-director',
    name: 'Platform Creative Director',
    team: 'content',
    kind: 'deterministic',
    version: '1.0',
    purpose:
      'Decides what a concept becomes on every other connected platform: reuse the edit, remix it, make an original, or skip the platform.',
    model: null,
    runtimeAttribution: 'explicit',
    promptVersions: [],
    implementation: 'packages/core/src/creative/variants.ts#planVariants',
    inputSchema: { primaryPlatform: 'string', platforms: 'string[]', treatment: 'string', hasFootage: 'boolean', unsupported: 'Record<string, string[]>' },
    outputSchema: { variants: 'PlatformVariant[]' },
    tools: [],
    expectedCallers: ['apps/worker/src/handlers/generate.ts#generateHandler'],
    downstreamConsumer: 'platform_variants — read by the Studio and the scheduler',
    permissions: ['read:creative_briefs'],
    retries: 0,
    timeoutMs: null,
    state: ['platform_variants'],
    observations: [],
    acceptanceTests: ['packages/core/src/creative/variants.test.ts'],
    declaredStatus: 'implemented_exercised',
    statusNote:
      'Skip is what makes the other decisions honest: a system that always finds a way to post everywhere posts things it should not.',
  },
  {
    agentId: 'thumbnail-director',
    name: 'Thumbnail Director',
    team: 'content',
    kind: 'deterministic',
    version: '1.0',
    purpose:
      'Derives the thumbnail line from what the concept already said and sizes it for the 360px a feed actually renders, refusing rather than truncating a sentence.',
    model: null,
    runtimeAttribution: 'explicit',
    promptVersions: [],
    implementation: 'packages/core/src/youtube/thumbnail.ts#thumbnailTextFrom',
    inputSchema: { hook: 'string | null', title: 'string | null' },
    outputSchema: { text: 'string | null', source: 'string', reason: 'string | undefined' },
    tools: [],
    expectedCallers: ['apps/worker/src/handlers/generate.ts#generateHandler'],
    downstreamConsumer: 'renders.input_props for the youtube_thumbnail template',
    permissions: ['read:concepts', 'write:renders'],
    retries: 0,
    timeoutMs: null,
    state: ['renders'],
    observations: [],
    acceptanceTests: ['packages/core/src/youtube/thumbnail.test.ts'],
    declaredStatus: 'blocked',
    statusNote:
      'BLOCKED ON SCOPE: thumbnails.set needs youtube or youtube.force-ssl and the channel granted neither, so the upload refuses by naming the scope rather than spending a request on a 403.',
  },
  {
    /*
     * §381. The *deterministic* critic. There are two, and conflating them is
     * why `creative_critic.v2` had no owner: this one is a rule set — pacing,
     * motion density, loudness, contrast — and the model critic below judges
     * the craft problem no rule can express. They share a name and nothing
     * else, so they are two contracts.
     */
    agentId: 'creative-critic',
    name: 'Creative Critic (rules)',
    team: 'quality',
    kind: 'deterministic',
    version: '1.0',
    purpose:
      'Judges a finished creative on pacing against its platform, motion density, repetition of language, opening and typography, unexplained silence, loudness and alt text.',
    model: null,
    runtimeAttribution: 'explicit',
    promptVersions: [],
    implementation: 'packages/core/src/qc/creativeQC.ts#runCreativeQC',
    inputSchema: { creativeType: 'string', beats: 'CreativeQCBeat[]', motions: 'BeatMotion[]', visualLanguage: 'string', typography: 'string', opening: 'string', lufs: 'number | null', altText: 'string | null' },
    outputSchema: { passed: 'boolean', findings: 'CreativeFinding[]', unmeasured: 'string[]' },
    tools: [],
    expectedCallers: ['apps/worker/src/handlers/reviewMedia.ts'],
    downstreamConsumer: 'content_items.qc_results.gates — read by the queue and the correction controller',
    permissions: ['read:content_items', 'write:content_items'],
    retries: 0,
    timeoutMs: null,
    state: ['content_items'],
    observations: [],
    acceptanceTests: ['packages/core/src/qc/creativeQC.test.ts'],
    declaredStatus: 'implemented_partial',
    statusNote:
      'Every input is optional and an absent one reports unmeasured rather than passing: a skipped gate is not a passed gate.',
  },

  /**
   * §381. The model critic, registered beside the rule set it is not.
   *
   * `creative_critic.v2` was emitted by `qc/critic.ts` and claimed by no
   * contract — so the one agent whose entire job is to notice what no rule can
   * express was itself invisible to the audit that exists to notice exactly
   * that.
   */
  {
    agentId: 'creative-critic-model',
    name: 'Creative Critic',
    team: 'quality',
    kind: 'model',
    version: '2.0',
    purpose:
      'Watches the finished frames and names craft problems no rule can express — every caption set the same way, an opening that does not earn the next second, a piece that reads as automated. It may never pass anything and may never fail a piece: findings are warnings, and silence from it means nothing.',
    model: 'strategy',
    runtimeAttribution: 'prompt_version',
    promptVersions: ['creative_critic.v2'],
    implementation: 'packages/core/src/qc/critic.ts#criticSystemPrompt',
    inputSchema: { frames: 'CriticFrame[] — described frames with their visible text' },
    outputSchema: { findings: 'CriticFinding[] — each citing the frames it is about' },
    tools: ['vision'],
    /*
     * The vision client, not the handler. `critique()` is a method on
     * `CriticClient` and the handler calls that; the Auditor resolves a caller
     * through the call graph, so naming the handler claims an edge that does
     * not exist.
     */
    expectedCallers: ['packages/core/src/generation/critique.ts#createCriticClient'],
    downstreamConsumer: 'content_items.qc_results gates — warnings, never failures',
    permissions: ['read:content_items', 'write:content_items'],
    retries: 1,
    timeoutMs: 60000,
    state: ['content_items'],
    observations: ['what the frames look like as a set, rather than one at a time'],
    acceptanceTests: ['packages/core/src/qc/critic.test.ts'],
    declaredStatus: 'implemented_partial',
    statusNote:
      'A finding that does not cite its frames is discarded, for the same reason an unsourced claim is: nobody can act on it and nobody can argue with it.',
  },

  /**
   * §381. The agent that writes every quiz, history, tips and myth piece.
   *
   * `post_format.v1` is emitted by `apps/worker/src/formatWriter.ts` and was
   * claimed by nobody — so the writer behind the entire format family did not
   * appear in the registry at all. It is the largest thing the audit was
   * missing.
   */
  {
    agentId: 'format-writer',
    name: 'Format Writer',
    team: 'content',
    kind: 'model',
    version: '1.0',
    purpose:
      'Fills a post format slot by slot — the questions and answers of a quiz, the beats of a history — and is refused and asked again until every slot is filled, every claim carries a source that was actually read, and the format-specific checks pass.',
    model: 'draft',
    runtimeAttribution: 'prompt_version',
    promptVersions: ['post_format.v1'],
    implementation: 'apps/worker/src/formatWriter.ts#writeToFormat',
    inputSchema: {
      format: 'PostFormat — the catalogue entry, with its slots and its brief',
      subject: 'string',
      audience: 'string',
      platform: 'string',
    },
    outputSchema: {
      draft: 'FormatDraft — slots in the format own order, with citations',
      attempts: 'number',
      problems: 'SlotProblem[]',
    },
    tools: ['fetch'],
    expectedCallers: ['apps/worker/src/handlers/generate.ts'],
    downstreamConsumer:
      'content_items.body and the video composition, and the caption written afterwards from it',
    permissions: ['read:products', 'write:content_items'],
    retries: 3,
    timeoutMs: 240000,
    state: ['content_items'],
    observations: ['whether each cited page actually says what is claimed'],
    acceptanceTests: [
      'apps/worker/src/formatWriter.test.ts',
      'packages/core/src/formats/formatChecks.test.ts',
    ],
    declaredStatus: 'implemented_partial',
    statusNote:
      'Refuses rather than degrades: a quiz missing two of its five questions is not a shorter quiz, it is a post that promises five and delivers three.',
  },

  /**
   * §381. The agent that proposes several ways in, so one can be chosen.
   *
   * `concept_generator.v1` is emitted by `concepts/generate.ts` and was claimed
   * by nobody, which is part of how a batch of eleven concepts scoring 4.50
   * apiece went unexamined for as long as it did.
   */
  {
    agentId: 'concept-generator',
    name: 'Concept Generator',
    team: 'content',
    kind: 'model',
    version: '1.0',
    purpose:
      'Proposes several materially different directions for one subject, each declaring its treatment, objective, emotional angle and what evidence it would need — so an operator chooses between real alternatives rather than between phrasings of one idea.',
    model: 'strategy',
    runtimeAttribution: 'prompt_version',
    promptVersions: ['concept_generator.v1'],
    implementation: 'packages/core/src/concepts/generate.ts#generateConcepts',
    inputSchema: {
      productFacts: 'Fact[] — from the Brain, so a concept is grounded',
      objective: 'ConceptObjective | null',
      recentTreatments: 'string[] — what this account has just done',
      count: 'number',
    },
    outputSchema: {
      concepts: 'Concept[] — treatment, premise, hook, differentiation, evidence needed',
    },
    tools: [],
    expectedCallers: ['apps/worker/src/handlers/concepts.ts'],
    downstreamConsumer: 'concepts, scored by scoreConcepts and shown on /studio',
    permissions: ['read:product_facts', 'write:concepts'],
    retries: 2,
    timeoutMs: 120000,
    state: ['concepts'],
    observations: [],
    acceptanceTests: ['packages/core/src/concepts/generate.test.ts'],
    declaredStatus: 'implemented_partial',
    statusNote:
      'A generator asked for five concepts will happily return five phrasings of one, which a ranking cannot detect — conceptDiversity checks that structurally rather than trusting the batch.',
  },
];

/** Look an agent up by the prompt version its model calls carry. */
export function agentForPromptVersion(promptVersion: string): AgentContract | null {
  return AGENT_REGISTRY.find((a) => a.promptVersions.includes(promptVersion)) ?? null;
}

export function agentById(agentId: string): AgentContract | null {
  return AGENT_REGISTRY.find((a) => a.agentId === agentId) ?? null;
}

/** Every prompt version the registry claims, for the Auditor's two-way check. */
export function registeredPromptVersions(): string[] {
  return AGENT_REGISTRY.flatMap((a) => a.promptVersions);
}
