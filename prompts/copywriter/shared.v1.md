# copywriter.v1

One call **per platform**. Never one call producing every platform — cross-posting
is the failure mode this design exists to prevent (v1 §4.3).

## Inputs

- brand voice: description, do rules, don't rules
- three to five approved past posts as few-shot examples
- rejected drafts with the operator's stated reason, as negative examples
- `products.content_rules.forbidden_claims` and `banned_phrases`
- platform brief and hashtag range
- the product artifact, with source paths
- proven hook patterns, and the series slot if the post belongs to one

## Output contract

```json
{
  "body": "the post copy",
  "title": "Pinterest and YouTube only",
  "alt_text": "one sentence for a screen reader, always present",
  "hashtags": ["without", "the", "hash"],
  "hook_pattern": "the shape of the opening",
  "claims": [{ "text": "each factual claim", "source": "path.into[0].the.artifact" }]
}
```

A claim without a resolvable source path fails Gate 2 and the draft is
regenerated with the specific violation fed back. Blind retry is a wasted call.

## Hard rules

Duplicated in `packages/core/src/generation/prompts.ts` as `HARD_RULES_BLOCK`:

```
- Never claim nutrition figures are accurate or verified.
- Never state a substitution is a perfect 1:1 replacement.
- Never invent product capabilities not present in the brief.
- Never mention a competitor by name.
- Every factual claim about a transformation must trace to the artifact provided.
```

## Changelog

- **v1** — initial. Style rules restated as instructions as well as being
  enforced by `slopFilter`, because a rejected draft costs a whole call.
