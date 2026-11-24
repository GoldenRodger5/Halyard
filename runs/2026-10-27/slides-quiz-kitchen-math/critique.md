# Viewer critique: slides-quiz-kitchen-math

Looked at every exported JPEG (Instagram 6 slides at 1080×1350, TikTok 8 photos at 1080×1920) full size and as contact sheets (`review/`).

## Round 1 (first render)
- Cover: question reads at a glance, but the cover pancakes repeated on question 2. **Fixed**: cover photo is now one no question uses (a guard throws if it repeats).
- Question slides: question type too small for the space, option text small. **Fixed**: question up to 104 px (feed) / 88 px (tall), options up to 56 px.
- Answer key (IG): left a quarter of the slide empty; "Answers" overhung the 60 px margin by 2 px (QA caught it). **Fixed**: cards stretch to fill, why text up to 46 px, title inset.
- TikTok: every slide ended in a blank lower half (the text has to stay above y 1250 for the caption), answers were split 2 + 1 and small. **Fixed**: photos moved into the lower half as decoration, one answer per photo with the question repeated and a big answer chip, the question's own dish below it.
- OCR could not separate the lone option "5" from "5 and 1/3". One-character options are now checked by eye (they are: all four read correctly).

## Round 2 (shipped render)
- **Stop scrolling on the cover?** Yes, for the target viewer: "Could you scale a recipe without a calculator?" in big outlined type, a real dish, a yellow SWIPE sticker and "3 questions, answers at the end". Not a thumb-stopper for a general audience; the genre's ceiling (QUIZ_FORMAT_RESEARCH.md).
- **Swipe to the end?** Yes: the answers are withheld until after Q3 and each question slide says "Lock it in, then swipe".
- **Save / share?** The 1/3 cup answer (5 tbsp + 1 tsp) is the save-worthy one; the close says "Save this for the next time you halve a recipe."
- **Cheap / AI-made / cramped / squashed?** Nothing squashed (every photo crop is checked to the box aspect, downscale only). Grounds and type are bold but consistent with the quiz videos. The 4-tile grid of single digits leaves white space inside the tiles; that is the genre's look, not a defect.
- Verdict: **SHIP** (unpublished draft; QA PASS).
