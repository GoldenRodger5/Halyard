# What popular quiz and trivia videos actually look like (2026-10-26)

Why this exists: three versions of the quiz template were designed from taste
(dark photo + white boxes, then an editorial paper card, then TikTok text
boxes). The owner asked what the genre's real standard is. This is the answer,
from the videos themselves rather than blog advice.

## Method

- `yt-dlp` search metadata (no video downloads) for 15 queries: food quiz,
  guess the food, food trivia, myth or fact food, cooking quiz, general
  knowledge quiz, would you rather food, food facts. Long-form and Shorts
  (`sp=EgIYAQ` = under 4 minutes) separately. 60 + 23 results ranked by views.
- For 8 representative videos, the YouTube **storyboards** (frame sprite
  sheets across the whole video) were pulled and looked at frame by frame:
  question, timer, reveal, end.
- TikTok itself was not browsable from here (the Chrome extension was not
  connected and TikTok blocks headless search). YouTube Shorts runs the same
  formats, so it stands in.

## What the numbers say

| Video | Channel | Views | Format |
|---|---|---|---|
| Guess the Fast Food Restaurant by Emoji | Monkey Quiz | 18.1M | game-show template |
| Can You Guess The FOOD By Emoji? | Guessr | 13.6M | game-show template |
| Ultimate REAL or CAKE Quiz | Sideserf Cake Studio | 12.1M | real people, real objects |
| Guess the Fruit in 3 Seconds | Quiz Blitz | 9.2M | game-show template |
| Would You Rather: REAL or CAKE | Daily Quiz | 6.9M | game-show template |
| Pick a Dish: Good vs Bad Food | Guessers | 4.5M | game-show template |
| Food Trivia! (family playing) | Heatwole Clan | 2.9M | **Short**, real people |
| Random Food Facts, Weird But True | Nat Geo Kids | 67K | Short, bold illustrated cards |
| Guess The Food Challenge | Satisfloxi | 180 | Short, templated |
| Food & Drink Trivia Quiz | Clacky Quiz | 0 | Short, dark minimal template |

Two honest conclusions:

1. **The template quiz channels win with long compilations** (50–100
   questions), not 20-second Shorts. Templated food quiz *Shorts* in the
   sample mostly sit in the hundreds of views.
2. **The short-form hits have people in them**: a family playing food
   trivia, a cake artist cutting into "food". A pipeline cannot make that.
   The owner (or a creator) on camera would; see "What the pipeline cannot do".

## What the hits share (seen in the storyboards)

- A **bright, saturated solid background** with a faint repeating pattern
  (`?`, `x`, food icons), a **new colour per question**. Never dark.
- **The food picture is the hero**: centred, in a white rounded card.
- **Chunky rounded display type** with a dark outline (Lilita/Fredoka-like),
  a title banner ("GUESS THE FRUIT", "PICK A DISH", "WOULD YOU RATHER").
- A **question-number badge** top-left and the **channel logo** as a corner
  watermark.
- A **horizontal timer bar** under the picture. Monkey Quiz puts its mascot
  running along the bar.
- **Big answer buttons**: A–D tiles, or two big circles (REAL green, CAKE
  red). On the reveal the answer appears in huge type under the picture.
- Fast: 3–5 seconds per question.

The 0-view example (Clacky Quiz) is a dark ground with small, letter-spaced
monospace type: very close to this lane's first two quiz versions.

## What `QuizShort` does now

All of the above, with RecipeFix's own pieces:
- grounds from the brand's warm palette (terracotta first), drifting `?` pattern
- the RecipeFix Original's licensed photo as the hero card
- Lilita One (SIL OFL, `@fontsource/lilita-one`) outlined display type
- the **RecipeFix icon is the mascot riding the timer bar**, and the corner mark
- A–D buttons that never wrap (size fitted to the longest label); MYTH/FACT as
  red/green circles; the verdict lands on the photo as a banner (red MYTH,
  green FACT); confetti burst; the why + source in a white card
- the last beat is one RecipeFix line tied to the fact ("Gluten-free fried
  rice? RecipeFix swaps the soy sauce and rewrites the steps.") and the URL

## What the pipeline cannot do (and should not fake)

- **People on camera.** The strongest short-form food trivia is humans
  playing. Recommended human format: the owner reacts to or plays the quiz
  (green-screen over the rendered video, or a duet/stitch of our own post).
- **Trending sounds.** A trending sound is added in the TikTok app; the API
  route posts the video with our own tick/chime only.

## Sources

YouTube search metadata and storyboards via yt-dlp, 2026-10-26: Monkey Quiz
`aKrSBz3ez5A`, Guessr `dZc-3PT5Qyk`, Sideserf `pGL120uzVSk`, Quiz Blitz
`4_XyvLFDJBs`, Daily Quiz `oo2aNvVDpAM`, Guessers `RQVEoAXUFb4`, Heatwole Clan
`5O8i1WGFRVA`, Nat Geo Kids `9CUFGnqifb0`, Satisfloxi `urnfg0UvolI`, Clacky
Quiz `sgjzzYone5s`. Background reading (blogs, lower weight): typito.com
trivia/timer guides, fluxnote.io trivia guide, Kapwing "TikTok AI Slop
Report" (what reads as slop: careless animation, wrong numbers, mangled
lettering, robotic voices).
