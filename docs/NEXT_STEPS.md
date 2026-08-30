# Next steps — 2026-08-30

Written after the post-type work landed. This is the standing list; update it
rather than starting a new one.

## Done and verified

| | What | Evidence |
|---|---|---|
| §344 | Research before writing | Kinolog quiz went from failing 3 attempts to 12 slots in 1 |
| §345 | `planProduction` — stages per post type | 14 tests |
| §349 | Post types, platforms derived from adapters | 13 tests; found Threads + TikTok carousel gaps |
| §350 | `resolvePostType` wired into `generate.ts` | 24 workflow tests |
| §351 | Platform tests replaced by media questions | carousel + aspect ratio |
| §351 | VO script no longer written then discarded | skipped when the format wrote it |
| §352 | `platformFinish` — one production, several finishes | 10 tests |

## Open, in priority order

### 1. The caption is still written first
`writeDraft` is at line ~955, `writeToFormat` at ~1208. The stage plan says
`caption` is last and the code has not moved.

**Why it is hard:** the `content_items` insert needs `body`, so the row cannot
be written without a caption. **The fix:** insert with the format's own title,
then write the caption after the piece exists as a revision informed by it.
Not a reorder — a second, better-informed pass.

### 2. `platformFinish` is not called
Built and tested; `publish.ts` still sends the identical file to every
destination. Wire it into the publish path so a piece is checked per
destination, and record the finish it was checked against.

### 3. The directors do not read the screenplay
`writeScreenplay` produces scenes with `move`, `score` and `gestures`. The
motion, music and annotation directors still decide independently. Until they
read it, the screenplay describes a piece nobody makes.

### 4. The screenplay is not in `generate.ts`
It runs through `scripts/write-screenplay.ts`. It has to become the thing
`videoForFormat` is built from rather than a parallel description.

### 5. Per-scene assets
`generateHeroImage` produces one image per piece. A screenplay implies one per
scene that needs one — a hook and a payoff wanting different grounds cannot
have them today.

### 6. Short-form video quality
Return to this once the above is wired. Ken Burns, multi-image cuts on sentence
boundaries, the logo mark, and the remaining format compositions.

### 7. Cook mode capture
`cook_mode_timer`'s "Start Cooking" selector no longer resolves. Blocked on
selector rediscovery.

## The UI — to be specced before building

The operator flow, as described:

1. **Platforms** — pick one or several
2. **Post type** — only the ones every chosen platform can carry (`canCarry`)
3. **Same piece for all?** — yes, or diverge per platform
4. **Format** — quiz, history, tips, walkthrough…
5. **Format questions** — whatever that format needs (which flow, which subject)
6. **Generate** — then a live view of the agents working
7. **Review** — watch it, comment in free text or with adjustment buttons
8. **Decide** — schedule, publish, redo, delete

**Not started.** The full spec has to come first, then one page at a time. The
UI will be redesigned later; this is about the flow, not the visual design.

Everything steps 1–5 needs already exists: `postTypesForPlatform`, `canCarry`,
`POST_FORMAT_CATALOG`, `allFlows`. Step 6 needs a websocket and an agent event
stream that does not exist yet.

## Standing risks

- **`generate.ts` is ~2,500 lines** and every fix adds to it. The post-type
  work made it answerable but not smaller. At some point the stages have to
  become separate handlers, or it becomes unmaintainable.
- **Two narration systems** still exist — the format path builds its own, the
  artifact path uses `writeVoScript`. That is a repair that has not reached the
  whole surface.
- **Local Anthropic key is out of credits.** Production runs on OpenAI and is
  unaffected; local scripts need `--openai`.
