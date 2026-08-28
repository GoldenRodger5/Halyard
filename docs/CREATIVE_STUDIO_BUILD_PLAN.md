# Halyard Creative Studio — Complete Production Build Plan

**Baseline:** `docs/HALYARD_CREATIVE_GAP_AUDIT.md`  
**Goal:** eliminate every `Partial` and `Missing` creative capability and prove the system works end-to-end in production.  
**Completion rule:** no critical creative capability is merely documented, stubbed, locally proven, or partially wired. Every stage must have an implementation, caller/orchestration, tests, production execution evidence, and observable outputs.

---

## 0. Non-negotiable product target

Halyard is not a caption generator with a video template. It is an AI creative studio and social operating system.

The complete loop must be:

`discover → understand account/product/audience → identify opportunity → generate ideas → strategy → generate multiple concepts → human selects concept → creative brief/storyboard → platform-specific creative plans → gather/create legitimate assets → script/hooks → voice/music/SFX → edit/render → artifact QA → self-correct → human approve/reject → intelligently stagger → publish → collect metrics → analyze → learn → feed insights back into future concepts, creative, strategy and scheduling → improve`

The operator experience must support both:

1. **"I know what I want."** Operator specifies intent, platforms, constraints and desired output.
2. **"Give me ideas."** Halyard uses discovery, account intelligence, product intelligence, trends, prior performance and creative memory to propose several materially different ideas.

For each selected idea Halyard must produce professional creative, not generic AI-looking cards or slideshow-like video.

---

# Phase 1 — Production foundation and orchestration

### Objective
Make the existing pipeline run end-to-end in production before adding more creative complexity.

### Work
- Trace every creative job kind from enqueue → worker → persistence → next job.
- Schedule `render`, `tts`, `review_media` and all currently defined creative stages correctly.
- Add/schedule `learn_from_performance`.
- Add/schedule `build_account_intelligence`.
- Verify retries, idempotency, locking and failure states.
- Add stage-level observability and correlation IDs.
- Make production runs distinguishable from local/test runs.
- Seed/use real RecipeFix content and connected accounts without publishing.
- Run `generate → strategy → creative plan → capture/assets → TTS → music → render → QA → correction` against real production data while `publishing_enabled=false`.
- Prove every artifact and database relationship survives a restart/retry.

### Exit criteria
- Every intended creative job is observed in production.
- `render`, `tts`, and `review_media` have non-zero successful production executions.
- Learning and account-intelligence tables populate.
- No publication occurs during validation.
- Failure/retry paths are demonstrated.

---

# Phase 2 — First-class creative data model

### Objective
Give creative work explicit structure instead of hiding critical decisions inside render props.

### Build
- `concepts` entity/table.
- `creative_briefs` entity/table.
- First-class storyboard/beat representation.
- Concept → brief → platform plan → asset set → render variant lineage.
- Per-platform render variant relationships.
- Asset-level provenance/licence/usage metadata.
- Creative treatment history and originality state.
- Creative experiment entity/generalization beyond hook-only experiments.
- Preserve backward compatibility and historical lineage.

### Required fields/concepts
Concepts should capture at least:
- idea/source
- objective
- audience hypothesis
- core promise
- hook options
- narrative structure
- visual concept
- audio concept
- CTA
- platform applicability
- novelty/originality signals
- evidence requirements
- generated-vs-owned asset policy

Creative briefs should capture the selected concept's executable production plan, including beats, timing, visual roles, narration, music, SFX, captions, product evidence and platform-specific constraints.

### Exit criteria
No production-critical creative decision lives only in opaque render props.

---

# Phase 3 — Discovery and social intelligence team

### Objective
Turn Halyard's discovery/social layer into a genuine external intelligence system.

### Build
#### Discovery team
- Trend Scout / Validator.
- Competitor Scout.
- Creator Scout.
- Community Scout.
- Content Gap Analyst.
- Trend relevance scoring.
- Trend velocity/decay.
- Platform-specific trend interpretation.
- Evidence and source lineage for every recommendation.

#### Social engine
- Platform search capabilities where APIs permit.
- Discover relevant creators, competitors and communities.
- Rank by relevance, not raw follower count.
- Recommend follows/interactions without autonomous execution.
- Detect useful conversations and content opportunities.
- Connect discovered entities to ideas and strategy.

### Safety
- No autonomous executable engagement.
- Recommendations require evidence.
- Preserve `assertNoAutonomousAction`.

### Exit criteria
A new account can receive evidence-backed ideas derived from its product, audience, competitors, creators, communities and current platform signals rather than only its own historical posts.

---

# Phase 4 — Account intelligence and learning

### Objective
Close the feedback loop so Halyard genuinely learns from what it publishes.

### Build
- Schedule and execute account intelligence jobs.
- Schedule and execute performance-learning jobs.
- Expand feature extraction to include:
  - hook family
  - hook strength
  - concept type
  - treatment
  - visual composition
  - imagery usage
  - audio characteristics
  - music energy/mood
  - voice style
  - duration
  - pacing profile
  - text density
  - platform
  - posting hour/day
  - CTA
  - topic
  - product feature demonstrated
- Learn from impressions, reach, likes, comments, shares, saves, views, watch time, profile visits, clicks and follows.
- Separate correlation from confidence.
- Keep sample-size/effect-size confidence model.
- Preserve contradiction handling.
- Feed insights into concept selection, treatment selection, platform strategy, creative direction and scheduling.
- Detect account-specific patterns rather than relying on global averages.

### Exit criteria
A successful and unsuccessful post measurably changes the evidence available to later generation decisions, and a later decision can name which learned belief influenced it.

---

# Phase 5 — Creative team expansion

### Objective
Add the judgement-oriented creative roles missing from the current 22-agent team.

### Add/establish
- Creative Director.
- Concept Generator.
- Visual Director.
- Story Architect.
- Voice Director.
- Music/Sound Director where model judgement is useful.
- Creative Critic / Retention Critic where judgement is useful.
- Originality Critic.
- Platform Creative Director / variant planner where needed.

### Preserve deterministic services
Do not turn arithmetic into agents unnecessarily. Keep portfolio analysis, strategy calculations, performance analysis, self-correction policy, humanization, QC, scheduling and other auditable mechanics deterministic.

### Resolve overlap
- Consolidate overlapping founder drafting roles where safe.
- Define a single authoritative handoff from hook generation to visual opening.
- Make each agent's input/output contract explicit.
- Require every registered agent to have a real caller and test.

### Exit criteria
Every taste/judgement responsibility has a clear owner, and no agent is producing output that another agent silently overwrites.

---

# Phase 6 — Concept generation and Creative Studio UX

### Objective
Make concept selection a first-class operator workflow.

### UX
1. Operator chooses platforms or asks Halyard for recommendations.
2. Operator enters intent, topic, product feature, campaign, or free-form request.
3. Halyard shows 3–5 materially different concepts.
4. Each concept shows:
   - hook
   - premise
   - story
   - visual direction
   - audio direction
   - expected platform fit
   - why Halyard recommends it
   - evidence/source context
5. Operator selects one.
6. Operator can adjust creative direction.
7. Halyard creates the full creative brief.
8. Generation runs with stage progress.
9. Operator sees platform variants side-by-side.
10. Operator can approve, reject, or request targeted changes.
11. Approval moves to scheduling; rejection feeds learning.

### Exit criteria
The studio is usable without opening a chat to manually orchestrate every step.

---

# Phase 7 — Professional visual asset pipeline

### Objective
Eliminate flat-ground creative while maintaining truth/provenance.

### Build
- Owned product captures as primary product-evidence source.
- Operator-supplied/licensed imagery support.
- Generated atmosphere for illustrative roles only.
- Asset provenance/licence checks before use.
- Visual Director chooses the appropriate asset role.
- Asset quality scoring.
- Crop/framing intelligence.
- Image treatment consistent with brand and platform.
- Safe handling of restricted publisher images.
- Attributed inset path where licence permits.

### RecipeFix-specific direction
Product UI and actual RecipeFix functionality should be the visual spine for product-focused content. Generated atmosphere can add visual richness but must never fake the product.

### Exit criteria
No professional creative is forced into type-only composition when legitimate visual assets exist, and no generated or third-party asset can be mistaken for product evidence.

---

# Phase 8 — Professional short-form video engine

### Objective
Make TikTok/Reels/Shorts look and feel like professionally edited short-form content.

### Build
#### Motion system
- Multiple camera movement types.
- Punch-ins/punch-outs.
- Dynamic crops.
- Kinetic typography.
- Word/phrase emphasis.
- Entrance/exit animation grammar.
- Beat-synchronized movement.
- Layered composition.
- Depth/parallax where appropriate.
- Professional transitions.
- Visual state changes.
- Fast pacing without random motion.

#### Editing system
- Storyboard-driven cuts.
- B-roll insertion.
- Product demonstration sequences.
- Real capture sequencing.
- Hook-to-payoff visual continuity.
- Beat-specific visual changes.
- Dynamic text/image relationships.
- Avoid repetitive templates.
- Treatment-specific editing grammar.

#### Short-form creative requirements
- Strong visual hook in frame 1.
- Hook must be visually integrated, not merely caption copy.
- First seconds must establish motion and curiosity.
- Music + voice + SFX should feel intentionally mixed.
- Captions should be readable and stylistically integrated.
- Product demonstration should be obvious when relevant.
- No long dead/static stretches.

### Exit criteria
Human review should reasonably describe the output as a professional short-form edit rather than a slideshow/template sequence.

---

# Phase 9 — Voice, music and sound design

### Objective
Remove the narration-only ceiling and create full audio production.

### Voice
- Multiple approved voices/styles where appropriate.
- Per-piece voice direction.
- Emotion, pacing and emphasis controls.
- Pronunciation lexicon.
- WER verification.
- Loudness normalization.

### Music
- Establish a licensed/usable music library.
- Store provenance/licence metadata.
- Music Director selects by concept, mood, pacing and platform.
- Beat-aware placement.
- Automatic ducking beneath narration.
- Intro/outro behavior where appropriate.

### Sound design
- SFX library and metadata.
- Subtle UI/product interaction sounds.
- Transitions/impact sounds where appropriate.
- Sound effects must support rather than overwhelm narration.

### Exit criteria
Every short-form video has intentional audio design; no video silently ships because the library is empty. Audio QA passes loudness, peak and voice-quality thresholds.

---

# Phase 10 — Platform-specific creative variants

### Objective
Stop treating one rendered video as universal media.

### Build
One concept → distinct execution plans for:

- TikTok
- Instagram Reels
- YouTube Shorts
- Pinterest
- X where video is appropriate
- YouTube long-form

Variants may change:
- duration
- crop/aspect
- hook timing
- text density
- captions
- pacing
- visual treatment
- music
- SFX
- CTA
- product demonstration order
- ending
- thumbnail frame

Copy remains independently platform-native.

### Exit criteria
Each selected platform has its own render artifact and creative rationale; no platform receives a generic copied video unless the system explicitly determines that reuse is optimal.

---

# Phase 11 — Long-form YouTube production

### Objective
Make YouTube long-form a first-class production surface.

### Build
- 16:9 composition system.
- Long-form concept types.
- Research/brief layer.
- Full script/story architecture.
- Chapters.
- Scene sequencing.
- Narration.
- B-roll/product footage.
- Graphics.
- Music/SFX.
- On-screen text.
- Retention-oriented pacing.
- Thumbnail Director.
- Thumbnail rendering and QA.
- Metadata/title/description/tag generation where supported.
- Intelligent Shorts extraction from long-form source footage.

### Exit criteria
A user can select YouTube long-form in Creative Studio and receive a complete 16:9 video with thumbnail and chapters, not a stretched short-form asset.

---

# Phase 12 — Creative QA and automatic self-correction

### Objective
Make creative quality a hard production gate, not a test script.

### Build
Expand artifact-level QA across:
- hook
- opening motion
- pacing
- text density
- frame usage
- product evidence
- fabrication
- audio
- originality
- accessibility
- platform fit
- visual quality
- transition quality
- music balance
- caption timing
- asset provenance
- thumbnail quality

### Correction loop
`render → inspect → diagnose → smallest permitted correction → render → inspect → accept/escalate`

Never allow correction to override provenance/fabrication failures automatically.

### Exit criteria
Bad output is rejected automatically; bounded correction can repair presentation defects; unresolved defects escalate to human review; all iterations are recorded.

---

# Phase 13 — Creative regression and acceptance suite

### Objective
Turn creative quality into a continuously tested engineering property.

### Build
- Real renders for every supported treatment.
- Real renders for every supported platform variant.
- Short-form baselines.
- Long-form baselines.
- Audio baselines.
- Thumbnail baselines.
- Golden/probe media where appropriate.
- Automated frame/audio measurements.
- Regression thresholds based on the quality benchmark.
- Scheduler coverage tests.
- Production smoke test.
- End-to-end creative acceptance test.

### Required quality gates
Preserve the audit benchmark:
- hook ≤8 words and frame 1
- opening tonal delta >0.02 within first 2s
- no static stretch >15s
- ≤14 words/beat in punch register
- ≥80% frame/band usage
- product evidence when capture exists
- no generated evidence
- −14 LUFS ±1 and true peak <−1 dBTP
- WER <2%
- treatment differs from last two account posts
- captions drift <150ms
- contrast ≥4.5:1
- platform constraints satisfied

### Exit criteria
A creative regression can fail CI/tests just like a code regression.

---

# Phase 14 — Intelligent scheduling and cross-platform orchestration

### Objective
Use the intelligence layer to determine when and where creative should appear.

### Build
- Platform-specific optimal windows.
- Audience timezone handling.
- Density/cadence constraints.
- Cross-platform staggering.
- Avoid simultaneous cannibalization when evidence supports spacing.
- Sequence related content across platforms.
- Coordinate long-form release → Shorts → Reels/TikTok/Pinterest derivatives.
- Consider freshness/trend decay.
- Respect approval boundary.
- Show operator the proposed schedule and reasoning.

### Exit criteria
Halyard can take one campaign/creative concept and propose a coherent multi-platform release sequence without autonomous publishing.

---

# Phase 15 — Performance-driven creative evolution

### Objective
Make the system improve creative, not merely report analytics.

### Build
After publication:
- collect metrics
- normalize by platform
- evaluate against expected performance
- attribute to creative features
- update learned insights
- update account patterns
- identify winners/losers
- detect fatigue
- detect novelty opportunities
- feed changes into future concepts, hooks, visual treatments, audio and scheduling

### Examples of learned decisions
- Strong hook family for this account → increase exploration around it.
- Strong product-demo format → produce more variants.
- Voice style underperforms → reduce its probability.
- Music energy correlates with retention → bias future selection.
- Same treatment repeatedly underperforms → suppress it.
- Platform-specific differences → alter that platform's creative plan.

### Exit criteria
The next generation demonstrably uses new evidence rather than behaving identically before and after performance data arrives.

---

# Phase 16 — Social engine evolution

### Objective
Connect publishing intelligence to relationship/community intelligence.

### Build
- Creator graph.
- Competitor graph.
- Community graph.
- Relevant conversation discovery.
- Follow recommendations.
- Interaction recommendations.
- Content opportunity detection.
- Trend-to-idea linkage.
- Engagement outcome learning.

### Guardrails
Recommendations only; no autonomous likes/comments/follows/posts without explicit future product policy and approval.

### Exit criteria
Halyard can tell the operator not only what to post, but which external conversations/creators/communities are strategically relevant and why.

---

# Phase 17 — Final production-hardening pass

### Objective
Eliminate all remaining partial states.

### Audit mechanically
Search the repository and runtime for:
- `Partial`
- `Missing`
- TODOs in creative paths
- dead agents
- uncalled handlers
- job kinds without scheduler coverage
- scheduler entries without handlers
- assets without provenance/licence
- renders without platform identity
- creative decisions without lineage
- tests without real execution coverage
- production paths only tested locally

Run a module-vs-caller audit for every creative module.

### Required proof
For every capability:
1. implementation exists
2. caller exists
3. persistence exists where needed
4. tests exist
5. production execution exists
6. failure path exists
7. observability exists
8. downstream consumer exists
9. learning/feedback path exists where applicable

---

# Phase 18 — Full end-to-end production acceptance

Run a controlled, non-public acceptance campaign with publishing disabled unless a specific operator-approved platform test is intentionally performed.

## Test A — idea generation
- Request ideas for RecipeFix.
- Confirm discovery + product/account intelligence are consulted.
- Confirm multiple materially different concepts.

## Test B — short-form generation
- Select TikTok + Instagram Reels + YouTube Shorts.
- Generate one concept.
- Verify separate render variants.
- Verify real product capture.
- Verify voice.
- Verify music.
- Verify SFX where appropriate.
- Verify motion/transitions/kinetic type.
- Verify captions.
- Verify QA.

## Test C — long-form
- Select YouTube long-form.
- Generate 16:9 production.
- Verify chapters, narration, music, product footage, graphics and thumbnail.
- Extract Shorts and verify derivatives are genuinely edited for short-form.

## Test D — correction
- Intentionally introduce a measurable defect.
- Confirm QA catches it.
- Confirm correction changes only what policy allows.
- Confirm re-render.
- Confirm re-QA.
- Confirm iteration history.
- Confirm escalation when correction budget is exhausted.

## Test E — learning
- Inject/use representative performance data.
- Run learning job.
- Confirm insight changes.
- Generate a later concept.
- Confirm the changed insight affects treatment/creative strategy.

## Test F — social engine
- Generate evidence-backed creator/community/competitor recommendations.
- Verify relevance ranking.
- Verify no autonomous action occurs.

## Test G — scheduling
- Generate a multi-platform campaign.
- Verify intelligent staggering, timezone handling and cadence constraints.

## Test H — approval/publish safety
- Confirm kill switch remains respected.
- Confirm no publication without explicit approval.
- Confirm idempotency.
- Confirm publication ledger behavior on an intentionally approved controlled test.

---

# Phase 19 — Definition of done

Halyard is complete only when all of the following are true:

### Creative generation
- [ ] Ideas can be generated intelligently.
- [ ] 3–5 materially different concepts can be proposed.
- [ ] Operator can select and configure a concept.
- [ ] Creative Director owns the overall direction.
- [ ] Visual Director owns visual direction.
- [ ] Story Architect owns story/beat structure.
- [ ] Hook Specialist controls the visual opening.
- [ ] Voice Director controls voice treatment.
- [ ] Music/Sound system produces intentional audio.
- [ ] Video editor/motion system produces professional edits.
- [ ] Product captures are integrated as evidence.
- [ ] Legitimate imagery is used intelligently.
- [ ] Generated imagery remains illustrative only.

### Short-form
- [ ] TikTok is purpose-built.
- [ ] Instagram Reels is purpose-built.
- [ ] YouTube Shorts is purpose-built.
- [ ] Fast pacing feels intentional.
- [ ] Motion is varied and professional.
- [ ] Videos do not look like 2D slideshow cards.
- [ ] Music, voice and SFX are mixed professionally.
- [ ] Product story is visually demonstrated.

### Long-form
- [ ] YouTube 16:9 works.
- [ ] Long-form story/script works.
- [ ] Chapters work.
- [ ] Thumbnail generation works.
- [ ] Shorts extraction works.

### Intelligence
- [ ] Discovery jobs execute.
- [ ] Trend intelligence executes.
- [ ] Account intelligence executes.
- [ ] Performance learning executes.
- [ ] Social discovery executes where APIs permit.
- [ ] Insights affect future generation.
- [ ] Cross-platform strategy affects creative variants.
- [ ] Intelligent staggering affects scheduling.

### Quality
- [ ] Every artifact receives real media QA.
- [ ] QA is production-exercised.
- [ ] Self-correction is production-exercised.
- [ ] Regression baselines exist.
- [ ] Provenance/licence gates cannot be bypassed.
- [ ] Human approval remains the publishing boundary.

### Product UX
- [ ] Operator can ask for ideas.
- [ ] Operator can choose platforms.
- [ ] Operator can select concepts.
- [ ] Operator can configure direction.
- [ ] Operator can generate.
- [ ] Operator can compare variants.
- [ ] Operator can request revisions.
- [ ] Operator can approve/reject.
- [ ] Operator can schedule.
- [ ] Operator can understand why Halyard made the recommendation.

### Operational proof
- [ ] No critical creative module is dead/unreferenced.
- [ ] No required job is unscheduled.
- [ ] No required capability is `Partial` or `Missing`.
- [ ] Production has rendered real media.
- [ ] Production has run TTS.
- [ ] Production has run QA.
- [ ] Production has run correction.
- [ ] Production has populated learning/account intelligence.
- [ ] Full acceptance suite passes.
- [ ] Nothing important is proven only by local mocks.

---

# Implementation discipline

For every phase, use this cadence:

**Investigate → design → implement → test → run real artifact/data → inspect → correct → document → commit.**

Do not declare a capability complete because:
- a function exists;
- a unit test passes;
- a table exists;
- a handler exists;
- a local render looks acceptable; or
- documentation says it works.

A capability is complete only when its full path is wired and exercised.

## Priority rule

**Content quality is the highest priority.** Intelligence exists to make Halyard choose better creative opportunities and learn faster; it cannot compensate for weak creative output. If forced to choose, professional-grade generation, media production, QA and iteration take precedence over additional analytics polish.

## Final target architecture

`Discovery Team`
→ `Account/Product Intelligence`
→ `Strategy`
→ `Creative Director`
→ `Concept Generator`
→ `Hook Specialist`
→ `Story Architect`
→ `Visual Director`
→ `Asset/Capture System`
→ `Voice Director`
→ `Music/Sound`
→ `Platform Creative Directors`
→ `Motion/Video Editor`
→ `Platform Render Variants`
→ `Creative/Retention/Technical QA`
→ `Self-Correction`
→ `Human Approval`
→ `Intelligent Scheduling`
→ `Publishing`
→ `Performance Analytics`
→ `Learning/Creative Memory`
→ back into `Discovery / Strategy / Creative Director / Concept Generator`.

The durable jobs system remains the orchestration backbone. Agents provide judgement where judgement is valuable; deterministic services provide policy, measurement and arithmetic where those are more reliable and auditable.
