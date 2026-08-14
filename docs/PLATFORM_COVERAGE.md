# Per-platform coverage: what exists, what doesn't, and what to build

Written 14 August 2026, against the code rather than against intent. Every claim
here was checked before it was written.

---

## 1. The honest answer

**Mechanically, coverage per platform is real.** Strategically, there is one
brain wearing seven hats.

| | Status |
|---|---|
| Publishing per platform | **Built.** Seven adapters, 246–470 lines each, with real per-platform knowledge |
| Constraints per platform | **Built.** Formats, hashtag ceilings, aspect ratios, link strategy, transport |
| Format choice per platform | **Built** (this week). Reads each adapter's declared capability |
| Manual handover where no API exists | **Built** (this week) |
| Research agents per platform | **None.** Nothing studies what works on TikTok as distinct from Pinterest |
| Reach/distribution agents | **None** |
| Product understanding | **A brief you wrote by hand.** No crawling, no code reading |
| Intelligent layer choosing what to show off | **Partial.** Mix debt and novelty, over a hand-written brief |
| Outreach | **None** — and deliberately, see §5 |

### What "one brain in seven hats" means concretely

At generation time the only things that differ per platform are: the format, the
hashtag ceiling, and a prompt variant. The *idea* — what to talk about, which
feature to show, what angle to take — is chosen once, per product, and then
dressed for each destination.

That is not obviously wrong. It is a real strategy, and for a small brand it may
be the right one. But it is a decision that was never made deliberately, and it
is the ceiling on quality right now: a TikTok that would work is not a Pinterest
pin with different dimensions.

---

## 2. Product understanding: the largest gap

The system's entire model of RecipeFix is `products.brief_markdown` — a document
**you wrote** — plus a connector that calls RecipeFix's own API for artifacts
(adaptations, substitutions) to build posts from.

That means:

- It knows what you told it. It cannot discover a feature you forgot to mention.
- It cannot notice that a feature changed, except through `detect_release`,
  which watches the homepage for edits.
- `shipped_features` exists as a table with **zero rows in production**, and the
  only thing that writes it is a prompt constant in `connectors/github.ts` that
  nothing calls.

`AGENTIC_PLAN.md` Phase 3 (the Explorer) is exactly this, and it is unbuilt:
crawl the product with Playwright, sign in with supplied credentials, walk the
real flows, read the code, reconcile the three into a feature inventory where
each entry is `verified` or honestly marked `unverified`.

**The plan's ordering is right and worth restating: build the verifier first,
then the crawler.** An inventory nobody can check is worse than no inventory,
because it reads as knowledge.

---

## 3. What per-platform agents would actually be for

Not "an agent per platform because there are several platforms." The question is
what differs enough between them to be worth a separate loop.

Three things genuinely do:

1. **What performs.** Pinterest rewards evergreen searchable pins with a
   months-long tail. TikTok rewards a hook in the first second and forgets you
   in three days. These are not the same content strategy with different crops.
2. **What is allowed.** Each platform's rules on links, disclosure, and
   promotional framing differ, and they change.
3. **What is already there.** The same substitution posted to a feed where it
   did well last month is a different decision from posting it somewhere new.

A per-platform loop is worth building where it reads *measured* results for that
platform and changes what gets made for it. Everything else is a prompt variant,
and prompt variants do not need agents.

**Which means this cannot be built usefully before Phase 0.** With no published
posts there is nothing per-platform to learn from, and a "TikTok strategist"
would be a model asserting best practices from its training data — the exact
thing this project has spent days removing.

---

## 4. The intelligent layer

There is one: `ideaEngine.ts` scores candidates on mix debt (are we
under-posting education?) and novelty (have we said this recently?).

What it lacks is any notion of **what is worth showing off**. It cannot rank
"the scaling maths is genuinely unusual" above "we also have a shopping list",
because it has no model of which features are differentiating — only the brief's
prose.

That is downstream of §2. A verified feature inventory, with each feature marked
for how unusual it is and what evidence supports that, is what would let the
strategist rank. Building the strategist first would produce confident rankings
over nothing.

---

## 5. Outreach — a direct conflict worth naming

Outreach was asked for. It conflicts with a standing rule set earlier in this
project:

> No auto-reply, no auto-DM, no engagement automation.

That rule is why `collect_comments` collects and the inbox states plainly that
it never sends. It is also the rule most likely to keep these accounts alive:
automated DMs and replies are the fastest route to a platform ban, and on
several of these platforms they violate the terms directly.

**This is your call to reverse, not mine to quietly work around.** Three
distinct things sit under "outreach", and they are not equally risky:

| | Risk | Recommendation |
|---|---|---|
| Drafted replies to real comments, shown for approval, sent only on your click | Low | Reasonable to build |
| Automated DMs to strangers | Bans accounts, violates terms | Do not build |
| Finding relevant conversations to join, surfaced as suggestions you act on | Low if it never posts | Reasonable to build |

The first and third preserve the rule's substance — nothing leaves without a
human — while removing the drudgery. If that is what "outreach" meant, say so
and it gets built. If it meant automated engagement, I would push back once and
then do what you decide.

---

## 6. How it looks in the UI

The approval model is now: **you see it, you press the button.** That shipped
today.

```
/queue/[id]
├── Copy, media, claims, destination        (existing)
├── QC — copy · claims · visual · audio · coherence
│
├── ▸ Post now                    [approved/scheduled only]
│     "Otherwise it goes out Thursday 09:20."
│     [ Post it now ]
│
└── ▸ Post this yourself          [awaiting_manual_publish]
      "This account cannot post through an API."
      [Copy caption] [Copy alt text] [Copy link] [Open tiktok ↗]
      ┌──────────────────────────────┐
      │ caption, already joined to   │
      │ its hashtags, as reviewed    │
      └──────────────────────────────┘
      1. Download video
      Paste the link once it is up:  [_________] [ I posted it ]
```

Two rules hold in that design, and both are load-bearing:

- **The caption is pre-joined to its hashtags.** Assembling it by hand is
  exactly where the posted version drifts from the reviewed one.
- **The URL back is required.** Without it nothing can collect metrics and
  nothing proves the post exists — the item would claim `published` on an
  assertion, which is the shape of every "it looked done" bug found here.

### What the remaining phases would add

- **Per-platform panel** on `/analytics`: what works here, measured, with sample
  sizes shown and the honest "not enough data yet" until there is.
- **Feature inventory** at `/product`: every feature the Explorer found, each
  marked verified or unverified, with the evidence and the date it was checked.
  Unverified entries visibly distinct — this is the screen most likely to be
  believed by accident.
- **Suggested replies** in the inbox, if §5 is approved: drafted, never sent,
  each needing a click.

---

## 7. Recommended order

1. **Phase 0 — publish.** Blocked on you. Everything below is unmeasurable
   without it, and a strategy agent with no data is a confident guess.
2. **Phase 3 — the Explorer**, verifier first. The largest real gap, and the one
   that does not need published posts to be worth building.
3. **Per-platform strategists**, once there is measured per-platform data.
4. **Suggested replies**, if the rule in §5 is relaxed.

The thing to resist is building 3 before 1. It would produce a system that
sounds authoritative about what works on TikTok, having never posted to TikTok.
