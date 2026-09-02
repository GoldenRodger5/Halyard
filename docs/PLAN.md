# Plan of record — 2 September 2026

The one document to read first. `docs/ROADMAP.md` holds the format-by-format
plan and `docs/DIRECTION_SPEC.md` the length/composition model; this is what
is being done *now*, in order, and why. Update it when a step lands.

## 1. Where we are

- **Short video works end to end locally** for history, tips, quiz, myth/fact
  and origin. Four tips renders today were critiqued frame by frame and eight
  classes of defect fixed at the class (§480–§491). Pictures no longer look
  generated; the voice is a person; captions are prose.
- **Nothing can generate right now.** Both model accounts are out of credits
  (OpenAI: chat, images, vision; Anthropic: everything). §493 makes that one
  dead job with the reason instead of retries.
- **Production is behind.** The live gallery 500s on a column production
  never received (§489). Step 2 below is the fix.
- **Real motion is built and unproven on a real clip** (§478): no Pexels key
  yet, so zero clips have been generated.
- **Spend is the problem the operator named:** ~$20 in twelve hours of
  testing. Section 3 is the programme.

## 2. Order of work

1. **Cost programme — done 2 Sep (§494).** Ledger, budget guard, image
   quality, photo reuse, cadence, per-piece cost in the UI. Details in §3.
2. **Production recovery (operator, 2 commands).** See §5. Then push main
   (now 90+ commits ahead), then verify the live gallery.
3. **Real motion, first real clip.** Operator adds `PEXELS_API_KEY` (free);
   the next tips or history piece carries footage on its process beats; the
   three critic personas judge it; §4 says where footage belongs.
4. **Fund one model account and re-run the tips matrix** (TikTok/Instagram/
   YouTube) under the budget guard, reading the per-post cost on each card.
5. **Then the roadmap resumes:** walkthrough capture, series, carousel.

## 3. Cost: what happened and what changes

### What the last 24 hours actually cost

| Where | Recorded? | 24h |
|---|---|---|
| Model calls (`agent_runs.cost_usd`) | yes | $2.29 today, $5.09 on 31 Aug |
| Images: **80 generated** on `gpt-image-1` with no `quality` set | **no** — logged as $0.04 each, a constant | at the default (auto → high) a 1024×1536 image is ~$0.19–0.25: **≈ $15–20** |
| Vision describer + critic: 10 reviews × 2 calls on `gpt-5.5` with six frames each | **no** | ≈ $1–2 |
| Voice: 13 syntheses | no (ElevenLabs credits, not USD) | — |

So the $20 was almost entirely **images at high quality, unrecorded**, and
most of them were re-photographs of the same herbs for test re-runs.
Testing multiplied it, but the multiplier was the unrecorded image price,
not the model calls.

Call profile per tips piece: 11–13 model calls, $0.07–0.14. The
`concept-generator` scheduler alone made 38 calls/day ($1.08) that nobody
consumed during testing.

### The programme

| Lever | Saves | How |
|---|---|---|
| **Record every paid call** in `agent_runs` — images, vision, critic, voice — with a real price | nothing directly; makes the rest measurable | image price by quality/size; vision/critic from token usage; voice from characters |
| **Image quality `medium`** | ~4× on images (the biggest line) | explicit `quality` on the request; social 9:16 is covered-and-cropped, medium is indistinguishable in the frame |
| **Photograph reuse** | ~$0.30–1.50 per re-run of a subject already shot | before generating, reuse a recent asset with the same subject for this product (110 exist), rotating shots |
| **Daily budget guard** | bounds the worst day | `settings.daily_budget_usd` (default $5); paid job kinds wait until tomorrow when today's ledger passes it, and the digest says so |
| **Per-post cost in the UI** | the operator sees the price before approving | gallery card and detail: total API cost of the piece, from the ledger |
| **Concepts once a day**, not hourly | ~$1/day | scheduler cadence; nothing reads concepts faster than daily |
| Retry caps: copywriter 2 attempts, one audio correction | ~20% of model calls | already partly in place; measure first |

Targets: **< $0.60 per finished short video** at medium quality with reuse;
**< $5/day** by default, raised deliberately in `/settings`.

## 4. Real motion: when the agents should reach for it

`footage` (licensed b-roll) belongs on a line about something **happening** —
hands kneading, water poured, steam, sifting, slicing — and on the *hook* for
completion-ranked platforms (TikTok, Shorts), where the first second must
move. `photograph` belongs to a thing at rest (a loaf, a jar). `colour` is
punctuation. Footage may never carry a claim about the product or a `proof`/
`demo` beat: it is somebody else's kitchen. Formats that want it most: tips
(each step is a process), history/origin turns ("this is what it looked
like"), recipe steps. Formats that want it least: quiz (the frame is the
question), text posts. The screenwriter is briefed exactly this (§478) and
the gallery shows what it chose.

**Status: nothing has been generated yet** — there is no key. Free key:
https://www.pexels.com/api/ → "Get Started" → copy the key → `PEXELS_API_KEY=`
in the master `.env` → `./scripts/env-sync` → restart the worker.

## 5. Only the operator can do these

1. **Fund a model account.** OpenAI is the configured primary
   (https://platform.openai.com/settings/organization/billing) — it also
   serves images and the frame critic; or Anthropic
   (https://console.anthropic.com/settings/billing). Either resumes the queue.
2. **Bring production's schema current**, from the repo root, with the pooler
   URL from Supabase → Project Settings → Database:
   ```bash
   supabase migration repair --linked --status applied $(seq -f "%04g" 1 70)
   supabase db push --linked --yes
   ```
   (The first of the three repair steps — reverting the four Aug 30 stamps —
   is already done.) Then `git push origin main`, wait for the Vercel deploy,
   open https://halyard-ten.vercel.app/gallery.
3. **Pexels key** (free, link above) for real motion.
4. **Music licence**: set `ELEVENLABS_MUSIC_LICENSED=true` only if the account
   plan permits commercial use; the seeded bed fixture does not exist.
5. Reconnect X; connect TikTok/YouTube/Threads/Pinterest; Instagram Business
   conversion — the publishing half (`docs/ROADMAP.md`).
