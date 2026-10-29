> **Execution-ready checkpoint:** See [the October 29 first-batch operational handoff](2026-10-29-FIRST-CREATIVE-TEAM-EXECUTION-CHECKPOINT.md) for actual bounded creative deliverables, agent worktree boundaries, first gallery and live-release blockers.

# RecipeFix Social Studio — Specialist production workstreams and handoff contracts
**2026-10-29 | Product owner directive.** An execution blueprint; the specialists have not all been launched by publishing this document.

**Goal:** within a short focused sprint, assemble a founder-reviewable two-week slate using distinct assets for TikTok, Instagram, YouTube Shorts and X. Do not produce all 14 ideas simultaneously. No live posting/paid media until exact approval and provider capability.

## Parallel agent work — four small, isolated streams

| Stream | Lead & responsibility | First bounded deliverables / acceptance | File ownership guidance |
| --- | --- | --- | --- |
| **A — Video/Creative Production** | Creative director + motion editor + video engineer + sound specialist | Upgrade one *product-led real cooking problem* into premium, moving, appetizing, well-narrated/foley-supported video (not PR #107's flat broiler icon presentation). Optionally produce one different recipe-feature short. Actual native video playback, listened sound or explicit sensory limit, full QA, honest source. | Isolated branch A; own a new production run under a unique directory; no edits to shared publisher/scheduler. |
| **B — Instagram/X Design** | Editorial art director + copywriter + graphic designer | Two visually different 4:5 IG carousel concepts and 2 native X posts/graphic/thread variants; include the PR #107 theme if useful, but fix text overlaps and avoid unappetizing report/QA receipts as feed copy. Actual native art, swipe progression, ALT text, concise CTA. | Isolated branch B; source files and exports under unique directories; reuse shared media via committed hashes, do not overwrite A files. |
| **C — Food Education/Entertainment** | Fact-checking chef/editor + creative animator + community strategist | One source-backed *teach/did-you-know/history* piece and one truly playful game/trivia/humor piece; each with an engaging action and payoff. Choose appropriate platforms rather than making four clone formats. No fabricated nutrition/food history, no human footage necessary. | Isolated branch C; independent references, sources, manifests and exports. |
| **D — Growth/Distribution/Research** | Growth/analytics lead + integration engineer + security reviewer | Map actual RecipeFix accounts/profile link capabilities, compare current Blotato vs Buffer API/analytics by exact supported format, source-linked food/creator research brief, dry-run post identity; verify path from campaign URL → actual first Adapt event without fabricated conversions. | Isolated branch D; read-only until approved; no touch to creative assets, no live publish/account/paid changes. |

**Director / integration lead** reviews all exports, assigns/blocks revisions, compares effective format/idea variety, manages founder preview and rejects filler. Director must not auto-approve its own work or use the AI critic as authority.

## Shared handoff format

Every agent delivers a small, traceable packet with:
1. One parent idea: ID, category P/E/C, cooking target audience, compelling premise, what visually happens, payoff, value or relevant RecipeFix bridge, source links.
2. Appropriate platform variants: platform + native format, exact draft copy/title/caption, rendered media with SHA256, aspect/duration, alt text, owned/stock/generated rights, AI disclosure decision, proposed link and CTA.
3. Actual full-media QA evidence at phone size: visual/text overlap, keyframes and *sound listened by someone who can listen*; never claim that waveform/transport measurements constitute a sonic taste review.
4. Independent skeptic's findings: approve for founder consideration, revise, or reject with concrete reasons. Founder is final creative authority.
5. Source file path, isolated branch/commit/PR, per-piece costs, remaining truthful unknowns, no unapproved publishing.

The typed first-pass representation is socialStudioContract.ts. It prevents invalid platform-format pairings and stale exact-media approvals but does NOT authenticate approvals or publish content. Producer-generated review artifacts should be adapted to this contract in a later integration task.

## Work sequence and checkpoints

**Checkpoint 1 — Quality bar, 3–4 distinct ideas:** A contributes the premium real RecipeFix demo, B contributes distinct magazine-quality social graphics, C contributes one educational/entertaining piece. Founder reviews at full quality and rejects anything still looking cheap, static, clipped, robotic or generic. D reports exact distribution/account blockers in parallel. Do not mass-produce from unproven template styles.

**Checkpoint 2 — Expand the approved visual vocabulary:** Additional 4–5 parent ideas drawn from P01–P06, E01–E05, C01–C04, different genre, genuine culinary relevance, authentic product demo where appropriate. Native captions and media versions chosen independently for each platform.

**Checkpoint 3 — Finish the two-week calendar:** Up to 14 distinct strong parent ideas, approximately 20–30 relevant native execution variants only if each is worth publishing. Founder chooses dates/times and exact account/media/copy; record rejects and resubmissions. Review release readiness without claiming scheduling provider setup is complete.

**Checkpoint 4 — Post and learn (separately approved):** Only after provider proves RecipeFix-owned accounts, verified profile links, format support, exact owner approval, future scheduling and idempotency. Collect 48h/7d platform metrics and join tagged visitors to actual first adaptation/return/paying records only where consent/data support it.

## Non-negotiable coordination rules

- Agent A and B do not edit shared publisher or legacy format code while Stream D is investigating it. Integrator owns common schema and review UI; source contract stays frozen during first pilots unless a genuine new use case appears.
- New media must be in uniquely named run directories; never overwrite old rejected PR #104/#105 and PR #107 source/exports.
- No agent silently merges another agent's PR, raises model spend, enrolls external accounts or sends unsolicited public comments/DMs.
- Avoid “all four networks automatically publish everything” claims; TikTok photos, Instagram carousels/Stories, X polls, YouTube Shorts each need provider/account-specific verification.
- Preserve the founder-led creation model: human spends concentrated 1–2 days refining/approving each 14-day batch; after authorization, scheduling, analytics and research are the automated parts.
- Costs: near $0 new subscriptions, preferred ~ $20/month (Blotato $29 needs a justified choice), separately approved/capped paid AI visual experiments. No open-ended rendering/retries/agent paid calls.
- Product and revenue goals are real visitors, completed original adaptations, repeated use and verified subscriptions; views and vanity follower counts alone are not wins.

**Status:** This is a staffed *plan*, not a claim the specialists completed their posts or that four external social accounts were configured. The immediate subsequent execution is Checkpoint 1, not another giant architecture rewrite.
