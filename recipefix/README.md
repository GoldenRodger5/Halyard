# RecipeFix — generated drafts

Content Halyard generated for RecipeFix, exported from the database so it can be
read without a database. **Nothing here has been published.**

```
recipefix/
  x/  tiktok/  youtube/          one directory per platform
    <date>-<recipe>-<id8>/
      post.txt                   the post body, plus hashtags if any
      voiceover.txt              the narration script (video items)
      voiceover.mp3              the synthesised narration
      video-<template>.mp4       the rendered video
      image-<template>.png       rendered stills
      meta.json                  status, QC gates, claims, model and cost
```

## What the statuses mean

- **pending_approval** — passed its gates and is waiting for a human. This is
  the only state from which anything can be published.
- **failed** — refused by the system and never queued. Most of these are early
  runs from before the MCP connector was configured, where no product artifact
  existed and so no video template could carry the item. They are kept because a
  refusal is a result.

## Reading `meta.json`

`gates` is the QC verdict per gate. `skipped` is not `passed` — it means that
gate had nothing to examine. `claims` carries each factual statement together
with the `source` path into the product artifact it was verified against.
`generation` records which model wrote it and what it cost.

Regenerate this directory by re-running the export; it is derived from
`content_items`, not authored here, so edits will not survive.
