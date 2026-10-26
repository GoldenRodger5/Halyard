# Independent critique: I5 Instagram carousel

Reviewer: fresh-context model (Claude subagent) given ONLY the rendered frames at 400px, the brief (brief.md), brand.md and the caption. No generation history. 2026-10-26.

## Round 1 — verdict: FIX
- Hook works ("The dairy swap was easy. The steps changed."); the photo shows a visible cream swirl on a dairy-free post, and the label was a noun pile.
- Useful tonight: batches not longer broiling; don't multiply reduction time; let the marinade drip; gentle simmer; 165°F.
- "Use the spoon trail" was jargon, never explained (slide 4 and caption).
- Slide 7 headline clunky; filled pills read as tappable buttons.
- Brief requires the starting recipe be labelled a RecipeFix Original (AI-written); nowhere on slides or caption.
- Nothing looks generated; proof screenshot real and legible.

Fixes applied (smallest unit, recorded as reviewer_edits in record.json):
1. Slide 4 rewrite → "Check at 10 minutes. Done when a spoon leaves a trail"; caption explains the trail.
2. Slide 1 label → "Stock photo of the original dairy recipe, not the adapted dish".
3. Caption last line → "Link in bio for the starting recipe: a RecipeFix Original, an AI-written home recipe." (critic's "not kitchen-tested" trips the forbidden example `tested`, so reworded.)
4. (optional) Slide 7 headline → "What the app actually said"; pills → plain ruled list (renderer change).
Slides 2, 3, 5, 6 unchanged (deterministic re-render).

## Round 2 — verdict: SHIP
No blockers. Label now explains the cream swirl; slide 4 actionable; slide 7 reads as proof, not UI; caption meets the labelling rule.

## Lead's own verdict (looked at every slide at 400px): SHIP as an unpublished draft
Remaining honest caveats, none blocking: the licensed stock photo shows peas and what may be cauliflower, so a sharp viewer may notice it is not a textbook tikka; the caption runs 648 chars (Halyard's slop filter budgets 220 for IG — fine for a save-worthy teaching post, owner's call); publishing is blocked anyway while state.json.unreceipted_deploy is set and the knowledge pack is unmerged.
