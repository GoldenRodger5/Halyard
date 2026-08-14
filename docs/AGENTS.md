# The agents, and which of them actually run

Audited against the code on 14 August 2026 by enumerating every LLM call site
and every caller of every exported agent function. Nothing here is claimed from
memory.

---

## The organisation, in one picture

There is no supervisor tree, and that is deliberate. The architecture is
**agents perceive, code decides** — every judgement that can be made
deterministically is, and models are used only where perception or writing is
genuinely required. A supervisor agent routing between sub-agents would add a
layer that can be wrong to a pipeline whose control flow is already correct.

```
IDEAS        ideaEngine ──────────── mix debt + novelty scoring (deterministic)
               │
WRITE        copywriter ──────────── slop filter + claim verifier, retry loop
               ├── hook stage ────── 8 variants → filter → score → payoff check
               └── vo scriptwriter ─ slop filter (spoken rules), retry loop
               │
MAKE         satori / remotion ───── images, video, captions
               └── tts ───────────── voice → duck bed → normalise → transcribe
               │
REVIEW       vision describer ────── describes frames, cannot see the intent
               ├── coherence ─────── what was claimed vs what is shown  (code)
               ├── visual slop ───── static, text-wall, text-never-changes (code)
               ├── audio QC ──────── WER, pacing, silence, loudness      (code)
               └── spoken slop ───── the transcript, not just the script (code)
               │
DECIDE       you ─────────────────── approve, or post now, or post by hand
               │
LEARN        rejection clusterer ─── why you said no, fed back to the copywriter
             hook history ────────── which openings were used, and how they did

SEPARATE LOOPS
  Daily Take   fact-check → verify story → strengthen → counter → risk → draft
  Explorer     crawl → propose claims → safety denylist → replay → verdict
```

---

## Every agent, and whether it runs

| Agent | What it does | Runs? |
|---|---|---|
| **Copywriter** | Per-platform post copy | ✅ gated, retry loop |
| **VO scriptwriter** | Narration for video | ✅ gated as of this week |
| **Hook generator** | 8 variants across a typed taxonomy | ✅ **wired this week** |
| **Payoff verifier** | Does the body deliver the hook's promise | ✅ **wired this week** |
| **Vision describer** | Describes sampled frames | ✅ |
| **Fact checker** | Founder's claims, *before* drafting | ✅ inside `runTakeLoop` |
| **Take drafter** | Founder's opinion, opinion preserved | ✅ |
| **Rejection clusterer** | Learns from what you reject | ✅ |
| **Setup kit writer** | Profile bios, pinned posts | ✅ |
| **Explorer discovery** | Proposes feature claims | ✅ built this week |
| **Co-pilot** | The compose screen | ✅ |
| **Auto-clip** | Picks clip candidates from long footage | ❌ **no caller** |
| **Shipped-feature summariser** | Reads merged PRs for what shipped | ❌ **no caller** |

### What the audit actually found

`surfaceBestVariants` — the half of the hook system that *chooses* a better
opening — **had no caller**. Generation recorded a hook after the fact by
classifying whichever first line the copywriter happened to write. The module
that calls itself "the loop that compounds: everything else makes production
faster, this makes the output better over time" was recording its results and
never acting on them.

Three tables (`hooks`, `hook_variants`, `hook_experiments`), a typed taxonomy, a
near-duplicate check, a clickbait check, a stop-rate predictor — all reachable
only from tests. That is now joined up, and it is the single largest quality
change available before anything publishes.

Two agents remain orphaned and are **not** urgent:

- **Auto-clip** needs long-form footage to clip from, and there is none.
- **Shipped-feature summariser** reads merged pull requests; RecipeFix ships
  through Lovable, so there are none to read. The Explorer supersedes it by
  looking at the product instead of its history.

---

## What there is deliberately *not* an agent for

**A per-platform strategist.** Documented at length in `PLATFORM_COVERAGE.md`.
It cannot be built usefully before anything has published: with no measured
per-platform data it would be a model asserting best practices from its training
data, which is the exact thing this project keeps removing.

**Outreach, DMs, auto-reply.** A standing rule, and the one most likely to keep
these accounts alive. `DECISIONS.md` §5 of `PLATFORM_COVERAGE.md` lays out which
parts of "outreach" are safe to build if the rule is relaxed.

**A supervisor.** Control flow is deterministic and correct. Putting a model in
charge of it would add a failure mode to a part that currently has none.

---

## The honest limits of review

The review layer measures a great deal and judges very little, on purpose.

- **Copy** — read and filtered, deterministically.
- **Images** — contrast, safe area, aspect ratio measured; *composition is not
  judged*. `pnpm render-templates` exists so a person can look, which is how the
  "heading over empty space" bug was found after every gate passed it.
- **Video** — frames described and compared to intent; static opens and text
  walls caught.
- **Audio** — word error rate, pacing, trailing silence, loudness, and the
  transcript slop-checked. **Delivery quality is not judged.** Whether the voice
  sounds robotic, or stresses the wrong word, is not measured by anything here.
  That is a real gap and it needs either a human ear or an audio-native model.

The rule throughout: a gate that cannot measure something reports `skipped` or
`not_measured`, never `passed`.
