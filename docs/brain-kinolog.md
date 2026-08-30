# What Halyard learned about Kinolog

Written by `scripts/brain-report.ts` from `product_facts`. Nothing here was typed by a person: every line is a fact an agent proposed and `planFactWrites` accepted, with the status that evidence supports.

- **Site:** https://kinolog.app
- **Tagline:** A diary with a brain
- **Facts:** 24 across 7 categories
- **Evidence:** 8 pages

## Brand, read from the product’s own stylesheet

| Token | Value |
|---|---|
| `ink` | #ede8e0 |
| `muted` | #9a938a |
| `primary` | #e3b341 |
| `bodyFont` | Inter |
| `background` | #141210 |
| `headingFont` | Bricolage Grotesque |

## identity

- **asks** — Users can make “asks” for Kinolog to think about their diary and recommendations.
  - The pricing page uses “asks” as the unit of AI use.
- **diary_features** — Users log films with ratings, vibes, notes and honest watch dates.
  - The Free plan includes unlimited logging, ratings, vibes, notes and watch dates.
- **platforms** — Kinolog has a native iPhone app and also runs in any browser on Android and desktop.
  - One account works everywhere so the diary is the same wherever opened.
- **product_summary** — Kinolog is a private movie diary with AI recommendations.
  - The homepage title calls it a “movie diary with AI recommendations” and the hero calls it “a private movie diary.”
- **recommendation_engine** — Kinolog reads a user’s diary to recommend what to watch and explain why.
  - Reasons come from the user’s own ratings and notes rather than charts.

## mission

- **mission_end_scrolling_stalemate** — Help users choose one film to watch instead of scrolling a wall of artwork and going to bed. _(unverifiable)_
  - The try page says the problem is not finding films, but scrolling for forty minutes without deciding.
- **mission_private_taste_reader** — Help a private movie diary give something back: taste reads and recommendations grounded in the user’s own history. _(unverifiable)_
  - The site contrasts Kinolog with charts, public social profiles and generic mood quizzes.
- **mission_trustworthy_recommendations** — Make recommendations accountable by explaining picks, avoiding repeats and keeping score on misses. _(unverifiable)_
  - Users can mark picks bullseye, fine or miss; hit rate stays on the stats page.

## users

- **primary_audience** — People who want a private movie diary that remembers what they watched and recommends from their own ratings and notes.
  - They are the users who would miss the diary, taste page, asks and personal recommendations.
- **secondary_audience** — Letterboxd users who want privacy, better recommendations or to move a long film history without losing it.
  - Kinolog highlights Letterboxd import and publishes a Letterboxd alternatives guide.
- **tertiary_audience** — People choosing a film with someone else on the couch.
  - Movie night lets users add whoever is watching and find something none of them have seen.

## personas

- **letterboxd_migrator** — A Letterboxd migrator with years of ratings, reviews, watch dates, tags, rewatches, likes and watchlist to preserve.
  - Kinolog imports a full Letterboxd export and keeps half-star precision and original watch dates.
- **letterboxd_escapee_with_history** — Someone rebuilding years of viewing history after leaving or reducing use of Letterboxd, while trying not to lose ratings, reviews, watch dates, tags, rewatches, likes and a watchlist. _(inferred)_
  - Follows from secondary_audience and letterboxd_migrator.
- **private_taste_archivist** — Someone who logs films for themselves, not an audience, and wants their ratings, vibes, notes and watch dates to turn into useful taste feedback. _(inferred)_
  - Follows from private movie diary, diary_features, recommendation_engine and primary_audience.
- **recommendation_skeptic** — Someone who has been burned by vague recommendations and wants to know why a pick fits, whether it repeats old suggestions and whether misses are remembered. _(inferred)_
  - Follows from mission_trustworthy_recommendations and recommendation_engine.
- **stuck_on_the_couch_picker** — Someone sitting with another person, trying to choose one film both can commit to before the night disappears into browsing. _(inferred)_
  - Follows from tertiary_audience and mission_end_scrolling_stalemate.

## jobs to be done

- **choose_tonight_without_scrolling** — Decide what to watch tonight without scrolling through posters for forty minutes and giving up. _(inferred)_
  - Follows from mission_end_scrolling_stalemate.
- **get_recs_from_my_own_history** — Give me recommendations based on what I actually watched, rated, felt and wrote down, not generic popularity. _(inferred)_
  - Follows from diary_features, recommendation_engine and mission_private_taste_reader.
- **log_honest_viewing_memory** — Record what I watched, when I really watched it, how it felt and what I thought, for my own memory. _(inferred)_
  - Follows from diary_features and primary_audience.
- **move_letterboxd_history_privately** — Move my long Letterboxd history somewhere private without treating years of ratings, reviews and watch dates as disposable. _(inferred)_
  - Follows from secondary_audience and letterboxd_migrator.
- **understand_the_pick** — Tell me why this film is being recommended to me so I can trust the suggestion before I spend the evening on it. _(inferred)_
  - Follows from recommendation_engine and mission_trustworthy_recommendations.

## differentiators

- **private_diary_first** — Kinolog’s starting point is a private diary rather than a public film profile, which makes it distinct for people reacting against social film logging. _(inferred)_
  - Follows from product_summary, primary_audience and secondary_audience.

## competitors

- **letterboxd** — Letterboxd is the clear incumbent for people with existing film diaries, especially because Kinolog addresses Letterboxd users who want privacy, better recommendations or to move a long history. _(inferred)_
  - Follows from secondary_audience and letterboxd_migrator.
- **streaming_service_home_screens** — Streaming-service home screens are a practical competitor in the watch-choice moment, because Kinolog is positioned against the behavior of scrolling a wall of artwork instead of choosing one film. _(inferred)_
  - Follows from mission_end_scrolling_stalemate and tertiary_audience.

## Nothing learned about

Listed because an empty category is the interesting part. A report of only findings makes a brain with a hole in it look complete.

- workflows
- pricing
- monetization
- brand voice
- visual identity
- claims
- ux model
- conversion funnel
- app store positioning

## Evidence it read

| Page | Characters |
|---|---|
| https://kinolog.app | 4,074 |
| https://kinolog.app/ | 4,074 |
| https://kinolog.app/blog | 1,995 |
| https://kinolog.app/blog/letterboxd-alternatives | 9,274 |
| https://kinolog.app/login | 326 |
| https://kinolog.app/pricing | 6,027 |
| https://kinolog.app/privacy | 6,263 |
| https://kinolog.app/try | 3,436 |

## Claims it refused to verify

A company saying something on its own site is evidence that it *says* it, not that it is true. These are recorded and marked, so nothing downstream can publish one as a fact.

- Letterboxd is the clear incumbent for people with existing film diaries, especially because Kinolog addresses Letterboxd users who want privacy, better recommendations or to move a long history. — `inferred`
- Streaming-service home screens are a practical competitor in the watch-choice moment, because Kinolog is positioned against the behavior of scrolling a wall of artwork instead of choosing one film. — `inferred`
- Kinolog’s starting point is a private diary rather than a public film profile, which makes it distinct for people reacting against social film logging. — `inferred`
- Decide what to watch tonight without scrolling through posters for forty minutes and giving up. — `inferred`
- Give me recommendations based on what I actually watched, rated, felt and wrote down, not generic popularity. — `inferred`
- Record what I watched, when I really watched it, how it felt and what I thought, for my own memory. — `inferred`
- Move my long Letterboxd history somewhere private without treating years of ratings, reviews and watch dates as disposable. — `inferred`
- Tell me why this film is being recommended to me so I can trust the suggestion before I spend the evening on it. — `inferred`
- Help users choose one film to watch instead of scrolling a wall of artwork and going to bed. — `unverifiable`
- Help a private movie diary give something back: taste reads and recommendations grounded in the user’s own history. — `unverifiable`
- Make recommendations accountable by explaining picks, avoiding repeats and keeping score on misses. — `unverifiable`
- Someone rebuilding years of viewing history after leaving or reducing use of Letterboxd, while trying not to lose ratings, reviews, watch dates, tags, rewatches, likes and a watchlist. — `inferred`
- Someone who logs films for themselves, not an audience, and wants their ratings, vibes, notes and watch dates to turn into useful taste feedback. — `inferred`
- Someone who has been burned by vague recommendations and wants to know why a pick fits, whether it repeats old suggestions and whether misses are remembered. — `inferred`
- Someone sitting with another person, trying to choose one film both can commit to before the night disappears into browsing. — `inferred`
