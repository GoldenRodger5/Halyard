# Marketing pipeline: handoff (2026-10-27)

Read this first when picking the work back up. Then read `PLAYBOOK.md` (the plan, §8 status
and the review lessons) and `CREATIVE_STRATEGY.md` (sound, platforms, pacing, AI labels).

Branch `feat/marketing-lean-lane-poc-20261026`, draft PR #100. Everything below is committed.

## What exists and works

| Piece | Command | State |
|---|---|---|
| List videos (lead format) | `pnpm mk list <id>` / `pnpm mk batch list all` | 6 lists in `facts/lists.yaml`, every item sourced (`food-facts.yaml`). Editorial look, ~33 s, 2.8 words/s, punch-in mid-beat, loop seam, QA passes. Medians ~7/6–7/5–7/7; halal hit 7/7/7/7. |
| List photo carousel | same render | Each list render exports `photos/*.jpg` and a `tiktok_photos` post (scheduler slot `list-photos`). |
| Quiz carousels, image posts, X text | `pnpm mk slides quiz <set>`, `pnpm mk image <fact>` | Decks end on the answers, with images that match each claim and calm swipe prompts; the tie is a pinned comment. |
| Transform (before/after) | `pnpm mk transform tikka-dairy-free` | Merged; 6/6/4–5/6. Next: bigger type, faster open. |
| Recipe, app intro | `pnpm mk recipe <id>`, `pnpm mk app --voice` | Built earlier; not re-reviewed this round. |
| Quiz, history, this-or-that VIDEOS | `mk quiz`, `mk history`, `mk versus` | Built but out of rotation: engagement stuck at 3–5 after five rounds each. |
| Viewer review | `pnpm mk critique <run-dir>` | Median of 3 GPT reviews, 1 labelled frame/s. Judges within "no live footage". "Pro team would post" is advisory (owner, 2026-10-27). Bar 7/7/6/7, majority cringe-free. |
| Owner review page | `mk batch list` writes `runs/<date>/review/` | Published copy: https://claude.ai/artifact/FWLVJ7jyDDh97tpdkUA94o (shows the 2026-10-27 afternoon cut; republish `runs/2026-10-27/review/index.html` with its `v/` folder to refresh it). |
| Weekly plan | `pnpm mk plan-week --start YYYY-MM-DD` | Lists lead, then list-photos, quiz carousels, transform, recipes, at most 1 app intro. |
| Publisher | `pnpm mk publish <run-dir> [--live]` | Blotato. Live posting requires a "post" critique. AI labels (TikTok AIGC, YouTube synthetic) come from asset provenance. **Never posted anything.** |

## Latest round (2026-10-27, evening)

- **List look is now `native`** (the default): a full-frame moving photo, captions that build
  in three beats (name, "Hidden: X", takeaway), a band behind the captions for contrast, and
  no cards, boxes or sound effects. The owner called the card looks "clip art and Canva".
  The old looks are still reachable with `--look editorial|magazine|sticker`.
- **The 7 lists** pass QA. Medians run 6–7/6–7/5–7/7. The review page is the same URL
  (v2), and it now includes the 14-day queue.
- **14-day queue:** `planWeek({ days: 14 })` builds it from an explicit weekly template
  following the PLAYBOOK mix and per-platform cadence.
- **Real motion is the next step**, and needs one of:
  - a Pexels API key (https://www.pexels.com/api/);
  - OpenAI organization verification so Sora works. `sora-2` is listed, but
    `POST /v1/videos` returns 404 on this account.
- **Data bug found:** in `food-facts.yaml`, `bake-soda-acid`'s source quote is the
  soda-to-powder quote and does not support its claim. Fix it before any post uses it.

## Where it stopped

- The last batch (commit `33d0f3f`: punch-in, shorter cover, "Swap: X" copy) re-rendered all
  six lists. Scores are in `runs/2026-10-27/list-*/critique.json`; the review page is in
  `runs/2026-10-27/review/`. The two quiz carousels were **not** re-rendered with the newest
  prompt changes (`7e44e10`): run `pnpm mk slides quiz kitchen-math` and `… kitchen-myths`.
- Review notes still open on the lists:
  - the cover title could be bigger and punchier;
  - the five beats share one structure;
  - source lines are small on a phone.
- Not built yet (CREATIVE_STRATEGY §6):
  - music beds (step 3);
  - Pexels stock footage (step 4);
  - a QA check for beat reading time;
  - the 4:5 Instagram carousel layout for lists;
  - the Pinterest 2:3 pin (P6);
  - the analytics loop (P7);
  - the nightly runner (P10).

## Needs the owner

1. **Approve or reject** the six lists on the review page. Approved ones become the first
   buffer posts.
2. **Music:** download GarageBand's sound library (Apple Loops, royalty-free inside our own
   tracks), or approve a free licensed library. Business accounts cannot use trending sounds.
3. **Pexels API key** (free) for real stock footage, the biggest lever left past ~7/10.
4. **Connect the RecipeFix accounts in Blotato** (the current workspace is Moment Circuit's;
   never post from it).
5. **A separate OpenAI key** for marketing: `MK_OPENAI_API_KEY` in `Halyard/.env`. Until then,
   runs need `MK_SHARED_OPENAI_OK=1`. The shared org once hit its limit and took RecipeFix
   production's OpenAI down with it (2026-10-27).

## How to run

```sh
cd /Users/isaacmineo/PROJECT_2025/halyard-marketing-lean-lane
set -a; . /Users/isaacmineo/PROJECT_2025/Halyard/.env; set +a
export MK_SHARED_OPENAI_OK=1          # until MK_OPENAI_API_KEY exists
pnpm mk batch list all                # render + review + review page
pnpm mk plan-week --start 2026-11-02
```

Spend: the ledger (`runs/ledger.jsonl`) records about $9 for the whole project to date. That is
an estimate: images are booked at $0.05 each, which may be under the real bill. One list
render is ~$0.3–1.0 (images are cached after the first run), and one review ~$0.05.
