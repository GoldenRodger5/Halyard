# Model providers and fallback

**Status:** built and proven against the live APIs (§398). Anthropic's balance was
genuinely exhausted while this was written, so the fallback was exercised for
real rather than simulated.

---

## What was wrong

`resolveLlmProvider` chose a provider **once, on key presence**. A provider with
a key and no credits counted as available, so every generation died on a 400
while a working OpenAI key sat in the same env file. Three `generate` jobs died
that way and the reason was only visible in the database.

`llm.ts`'s own docstring said there was *"no reason to be unable to generate
anything because one vendor's key is missing while another's is sitting right
there"* — and it only ever handled **missing**, never **failing**.

## What falls back, and what does not

| Falls back | Does not |
|---|---|
| Credit balance exhausted, quota, billing | Context length exceeded |
| Rate limited (`429`) | Invalid schema / malformed request |
| Overloaded, `5xx`, capacity | Content refusal |
| Timeout, connection reset | Unknown model |
| Bad or missing API key (`401`, `403`) | |

The distinction matters. A **provider** failure gives the next provider a real
chance. A **request** failure fails identically at the next provider — retrying
turns one clear error into two confusing ones and doubles the bill.

## Falling back is announced

`ctx.log('model provider fell back', { from, to, because })` writes it into the
run. *"Which model wrote this"* is the first question asked when output quality
moves, so a silent switch would be worse than none.

## The models

| Role | Anthropic | OpenAI |
|---|---|---|
| strategy | `claude-opus-5` | `gpt-5.5` |
| draft | `claude-sonnet-5` | `gpt-5.5` |

Each client resolves a *foreign* model name to its own tier, in both directions
— added to the Anthropic client in §398, because once a request can fall back it
arrives carrying the other provider's model name and a 404 at generation time is
the worst moment.

### On the OpenAI model choice

`gpt-5.5` for both roles is a **measured** choice already documented in
`openai.ts`, and it was left alone. The existing benchmark counted *attempts to
pass QC*: the smaller models failed the first pass and had to be regenerated, so
they were slower **and** dearer than the better one. Retries dominate at this
size.

A fresh benchmark of `gpt-5.4` → `gpt-5.6` against the three things Halyard's
gates actually punish — inventing an unsupported claim, breaking a character
ceiling, leaving a format slot empty — found **every candidate passed all
three**. Single-shot capability does not separate them; retry behaviour does,
and the existing measurement is the better evidence.

`gpt-5.6` (`luna`, `sol`, `terra`) is newly available and worth benchmarking the
same way — by attempts-to-pass and cost, not by single-shot pass rate.

## Falling back is a provider choice, never a quality one

**In production it is better to fail than to serve something fabricated.** A
fallback that invented text, returned a placeholder or skipped a check would be
exactly that. None of this does:

- The other provider runs **the same prompt**.
- **Every QC gate still runs** and still refuses. The first briefed quiz was
  abandoned rather than published on the very first fallback run — the guarantee
  working, not failing.
- When every provider is down the error is thrown. Nothing is invented. A test
  asserts this, because it is the property most worth protecting.

`LLM_FALLBACK=off` disables it entirely, for a deployment that would rather see
the error than have the other vendor answer. Default on, because generating
nothing is worse than generating something every gate has approved.

The rest of the codebase already holds this line — `plan.ts` and
`mediaDirector.ts` both say *"there is no default and no placeholder"*, and
`flows.ts` refuses to draw a synthetic progress bar because it "invents product
UI". This is that rule, applied to the model layer.

## What the fallback exposed

Two defects that could only appear once the fallback path actually ran:

1. **The OpenAI client sent `content: null`.** `LlmRequest.system` is optional
   and the system message was added unconditionally, which OpenAI refuses
   outright (`expected a string, got null`). Anthropic omits an absent system
   field, so the same request worked there. It stayed hidden because nothing
   ever reached this client.
2. **The citation gate was refusing well-formed quizzes.** A briefed quiz was
   refused three times with `format.unverified_citation` and abandoned. It
   looked like a model-quality problem and was not: `matchesResearchedFact`
   compared **one slot** against the researched fact and demanded a third of the
   fact's words appear in it.

   ```
   fact:     "Jacopo Beccari isolated gluten in 1728 by washing dough…"
   question: "What year was gluten first identified?"   → 9%
   answer:   "1728"                                     → 9%
   ```

   A question sharing a third of the fact's words has **given away its own
   answer**, so the rule could only ever be satisfied by bad writing. Fixed in
   §400: a question and its answer are one assertion and are checked together,
   and what a citation pins down is the fact's *specifics* — its numbers and
   proper nouns — not its grammar.

   Not a loosening. A piece that cites a source and says something else carries
   none of its specifics and still fails; the fabrication cases are asserted as
   hard as the good ones. After the fix the same brief produced a real piece
   with citations verified against Britannica, the FDA and the NIH.
