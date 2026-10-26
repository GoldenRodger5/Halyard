# Independent critique: V1 TikTok / Reels short

Reviewer: fresh-context model (Claude subagent) given only the exported MP4 (frames it extracted itself at ~400 px), a 2-second contact sheet, the voiceover script, caption, brief.md and brand.md. No generation history. 2026-10-26.

## Lead's own pre-critique pass (before the reviewer saw it)
Found and fixed on my own frames: frame 1 had no real photo (brand rule) → the Original's licensed photo with label; the proof crops cut off the "RecipeFix changed this step" note and clipped the right edge → re-cropped; "chicken thighs" overran the safe box (caught by QA) → "chicken"; the proof beat's headline wrapped into the clip → one line.

## Round 1 — verdict: FIX
- Hook was a question over a label that gave the payoff away; no stated tension in the first 2 s.
- Static stretches: amounts (6–11 s), reduce open with no headline (~16–18 s), reduce diagram held (19–24 s), simmer pot (26–33 s), takeaway held 8 s.
- Photo label competed with the caption; reduce headline broke badly ("Spoon / leaves a trail? Done").
- Proof real but text ~30 px at 1080 and starting mid-sentence: readable only on pause.
- Caption flat; "Scaling a recipe up?" a weaker search phrase than "doubling a recipe".

Fixes applied (voiceover unchanged, so no re-synthesis):
1. Hook headline → "Cooking for 6? Don't add 50% to the time."; photo label moved clear of captions.
2. Headlines present from frame one of each beat; plates arrive on the amounts beat; reduce level drop + spoon drawing the trail; simmer gets a struck "hard boil → gentle simmer"; takeaway reveals line by line.
3. Proof → crisp crops of the two note boxes from the 3× captures, step-labelled, ~37 px, starting on their first line.
4. Reduce headline → "Wider pan? Start checking at 10 minutes."; caption rewritten around "doubling a recipe / cooking for more people".

## Round 2 — verdict: SHIP
No blockers. Hook sets up tension; every beat has something to watch (simmer still the quietest); proof real and readable at 400 px; takeaway hold acceptable. Optional: proof shows step 5 before step 4 (follows the voiceover order).

## Lead's verdict: SHIP as an unpublished draft, with honest caveats
- The diagrams are clean but plain vector illustration; this would be markedly better with 6–8 s of founder footage (hands broiling two sheets, a spoon dragged through sauce) replacing the broil and reduce diagrams, and the founder's own voice instead of the synthetic one.
- Motion passes at Halyard's production freeze setting (−45 dB, ≥ 1.5 s) but the strict reading (−54 dB, ≥ 0.5 s) is still high, because flat-colour beats only change at caption changes. Real footage fixes that too.
- The voice is ElevenLabs (synthetic): set the platform's AI-generated label.
- The proof screens come from a local build of the live UI with a simulated backend serving the real stored result; that is disclosed on screen.
