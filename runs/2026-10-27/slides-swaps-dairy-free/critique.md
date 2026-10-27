# Viewer critique: slides-swaps-dairy-free

Looked at every exported slide (8 IG at 1080×1350, 8 TikTok at 1080×1920) full size and as contact sheets.

## Round 1
- Swap slides were top-heavy: a third of each slide empty, method text at ~32 px. **Fixed**: sizes fitted to the slide, the method panel fills the space, text up to 48 px.
- Butter's only "change" is a label check, under a heading that said "What changes in the steps". That overclaimed. **Fixed**: the butter slide says "What to check"; the cover, TikTok title and X post now say "what to do differently with each" instead of "what each changes in the steps".
- Quote fragments ended mid-sentence ("…gentle simmer Choose plain…" in the X reply). **Fixed**: fragments are closed with a period.
- TikTok: lower third blank on every photo. **Fixed**: a band of the Original's photo sits below the text safe area.
- "Serves 4" wrapped to two lines; lone digits ("4", "1") gave unmeasurable OCR contrast boxes. **Fixed**: counts on the labels are spelled out ("Swap two of four", "Serves six"); a lone-glyph contrast box is now recorded, not counted (multi-character words still fail).

## Round 2 (shipped render)
- **Stop scrolling on the cover?** For a dairy-free cook, yes: a real curry photo, "Dairy-free swaps that keep the dish working", a SWIPE sticker. The photo shows a cream swirl; the label on it says it is the original dairy recipe's stock photo.
- **Swipe to the end?** Slide 2 earns trust (the real app screen: "3 ingredients swapped, 15 amounts scaled from 4 to 6 servings, 5 steps rewritten"), then one swap per slide with the struck original and the step change in white on ink. Yes.
- **Save?** Yes: the coconut cream slide (whisk it smooth, gentle simmer, not cream of coconut) is what a cook needs at the stove.
- **Honesty:** every amount, reason and step line is quoted from `landingRealResult.ts` @ a82f8bb9 and checked verbatim in code (`proof.verbatim`); the 1½-can tomato line never appears; starting recipe labelled a RecipeFix Original, an AI-written home recipe; caption carries "Real RecipeFix result", "captured 2026-10-21", "4 to 6".
- **Weak spots:** only 4 swaps (the stored result has 3 plus one alternative; no unsourced fifth was invented). The yogurt slide is the densest. The TikTok photo band repeats the dairy photo without its label on inner slides.
- Verdict: **SHIP** (unpublished draft; QA PASS).
