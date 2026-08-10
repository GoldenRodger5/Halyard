# Prompts

Versioned prompt text. v1 §4.4: the version is recorded in
`content_items.generation_meta` so a quality regression is traceable to a prompt
change rather than to "the model got worse".

**Where the text actually lives.** Prompt *assembly* is in
`packages/core/src/generation/prompts.ts`, because a prompt built from runtime
context (voice, artifact, few-shot examples, platform constraints) is code, and
splitting it across a template file makes it harder to review, not easier. These
files hold the parts that are pure text and the record of what changed when.

The one rule that matters: **every copywriter prompt ends with the hard-rules
block**, and that block is duplicated in code rather than loaded from a file, so
it is impossible to ship a generation call without it.

## Files

| File | Version | Assembled by |
|---|---|---|
| `idea_generator.v1.md` | `idea_generator.v1` | `buildIdeaGeneratorPrompt()` |
| `copywriter/shared.v1.md` | `copywriter.v1` | `buildCopywriterPrompt()` |
| `vo_script.v1.md` | `vo_script.v1` | `writeVoScript()` |
| `reply_drafter.v1.md` | `reply_drafter.v1` | `buildReplyDraftPrompt()` |

## Changing a prompt

Bump the version. Do not edit `v1` in place once anything has been generated
with it, or the `generation_meta` on existing rows becomes a lie.
