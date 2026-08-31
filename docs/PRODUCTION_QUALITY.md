# What a Halyard piece is made of, and which layers are real

Written by rendering pieces and looking at the frames, not by reading the code.
Every finding below was invisible to 2,800 passing tests.

## The layers

A short-form piece is not a background and some words. It is nine decisions,
and a weak one anywhere is visible:

| Layer | State | Vocabulary | Chosen by |
|---|---|---|---|
| **Photography** | ✅ per beat, §407 | 6 framings × 5 lights × 5 surfaces | rotation on `assets.shot`, twice over — within the piece and across pieces |
| **Composition** | ✅ all 11 formats | Narrative · Quiz · Walkthrough + 4 artifact-driven | the format's own builder; artifact ones by fit |
| **Treatment** | ✅ | 5 narrative · 5 quiz · 7 carousel layouts | fit then recency on `renders.treatment` |
| **Typography** | ✅ | 6 systems | visual language + recency; operator can pin |
| **Opening** | ✅ | 7 compositions | fit + recency |
| **Motion** | ⚠️ partial | 6 entrances · 5 camera moves · 4 transitions | planned only for artifact-driven pieces; format beats get a per-beat Ken Burns push and their treatment's own animation |
| **Voiceover** | ✅ | ElevenLabs + Whisper WER check | per piece, from the piece's own slots |
| **Captions** | ✅ | word-level timing, karaoke highlight, measured 4.5:1 | burned in from the transcript |
| **Music** | ✅ 6 beds, 4 SFX | genre + instrumentation | usage history |
| **Motif / marks** | ✅ every beat-driven format, §415 | 2 registers, 4 mark kinds | the word the line lands on, marked in the product's own hand — worker decides, composition draws |

## What rendering found that tests could not

**The video was rendering the wrong story.** `{ ...composition.props, …,
...(plan ? { beats } : {}) }` — later keys win, and a creative plan exists
whenever the connector returned an artifact. So a `history` piece about
sourdough rendered *"Pressed tofu is not optional"*. §406.

**One photograph for the whole video.** Nineteen seconds, one still, four text
changes. Every platform asks for a visual reset every 1.5-4 seconds. §407.

**The palette went dark when the photographs moved to the beats**, because it
was computed from a piece-level background that no longer existed. Every word
nearly invisible, on four beautiful photographs.

**The scrim was dense in the wrong half of the frame** — bottom-heavy,
inherited from the quiz, while `anchored` puts type at the top. And its floor of
0.6 crushed a dark photograph that needed almost none.

**Three formats had no video path and one had no deck**, and the coverage test
that existed could not see it because it only checked formats that already had a
builder.

## Still open

- **Marks reach type, not captured regions.** §415 draws the product's own pen
  under the word a line lands on, in every beat-driven format. What is still
  unwired is `annotationForPhrase` — pointing at a *region of a capture* — which
  needs each composition to publish the box it laid its type into. §110.
- **Pacing.** Beats hold ~4-5s; the platforms want 1.5-3s (TikTok), 2.5-4
  (Reels), 3-5 (Shorts).
- **Planned motion on format videos.** The grammar exists and only artifact
  pieces get it.
- **Six music beds.** Enough to rotate, thin for a year of posting.
- **`tts` fails locally** — `whisper-cli` cannot load its model. Environment,
  not code; blocks seeing a finished video with audio on this machine.

## How to check it yourself

```
pnpm exec tsx scripts/format-smoke.ts              # every format, written and built
pnpm exec tsx scripts/preview-beat-photographs.ts <dir> "a|b|c"
pnpm exec tsx scripts/render-quiz-preview.ts --composition Narrative --props x.json
```

Then extract frames and **look at them**. That is the only step that has ever
found a visual defect here.
