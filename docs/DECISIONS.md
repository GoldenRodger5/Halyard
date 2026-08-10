# Decisions

Where the build departs from the specs, and why. Each entry names the doc it
diverges from, so a reader can tell a deliberate choice from a mistake.

---

## 1. Token encryption is application-level AES-256-GCM, not pgsodium

**v1 §7 says** "encrypt with pgsodium at rest."
**Build pack §5 lists** a `TOKEN_ENCRYPTION_KEY` env var, which implies
application-level sealing. The two documents disagree; we followed the build pack.

Three reasons:

1. pgsodium and Supabase Vault are deprecated for new Supabase projects. A
   pgsodium design would be built on a retiring primitive.
2. Sealing in the application means the ciphertext is opaque to PostgREST, so a
   mis-scoped RLS policy leaks bytes rather than credentials.
3. It keeps migrations portable to plain Postgres, which is what CI runs — and
   CI running the real migrations is worth more than matching one sentence.

`packages/core/src/crypto/tokenCrypto.ts`. Layout is `version ‖ iv ‖ tag ‖
ciphertext`; the version byte exists so a key rotation can be staged rather than
flag-dayed. Migration `0010_rls.sql` additionally revokes the ciphertext columns
from the PostgREST roles, so both layers have to fail before a token escapes.

---

## 2. Novelty uses stored float arrays and TypeScript cosine distance, not pgvector

**v2 G.3 says** "check novelty against the last 60 days by embedding distance."

`ideas.embedding` is `jsonb` and the comparison happens in
`packages/core/src/generation/ideaEngine.ts`. The working set is a few hundred
rows; an index would be slower than the scan. It also keeps the schema
applicable to a vanilla Postgres, which is what the integration tests use.

Revisit if the idea corpus reaches tens of thousands of rows. It will not soon.

---

## 3. The web tier queries Postgres directly, not through PostgREST

Halyard's web tier is entirely server-rendered and single-operator. Every page is
a server component; the browser never holds a database credential and there is no
client-side query surface. Going through PostgREST would add a hop and a second
authorisation model for no gain.

RLS is still enabled and forced on all thirty tables, because the anon key is the
credential most likely to leak, and PostgREST is what it would reach.
`packages/db/src/__tests__/schema.test.ts` asserts that a role outside
`admin_users` reads every table as empty.

---

## 4. `HALYARD_DEV_UNAUTHENTICATED` exists

Not in any spec. Without it, the app cannot be run, reviewed, or screenshotted
without provisioning a Supabase project. It is refused when
`NODE_ENV === 'production'`, and the dashboard renders a standing warning banner
whenever it is active.

---

## 5. TikTok direct publish is behind a second explicit flag

**v2 A.4 recommends** planning for audit rejection and using inbox upload.

`TikTokAdapter.publish()` uses inbox upload unless *three* conditions hold:
`contentPostingAuditPassed`, `allowDirectPublish`, and `capabilityState === 'live'`.
Even with the audit passed, `verifyCapabilities()` still reports `draft_only` and
explains why: the API cannot attach trending audio, and sound is a large share of
TikTok distribution (v2 E.4). Assisted, not automated — deliberately.

---

## 6. Two slop-filter rules extend beyond v2 F.1

- **`structure.sentence_too_long`** — v2 F.1 specifies an *average* sentence
  ceiling. A single 40-word sentence behind a three-word hook never moves the
  mean, so a per-sentence ceiling was added. Reported as its own rule so the two
  failures read differently in the queue.
- **`structure.rule_of_three`** — the doc lists rule-of-three lists as banned.
  One tricolon is ordinary human writing; two in one short post is a tic. One is
  a warning, two or more is an error.

Hashtag ceilings for Threads and YouTube are not in the doc either. They are
marked `inferred: true` in `HASHTAG_LIMITS` so the source of every number is
unambiguous.

---

## 7. `docs/recipefix_overview.md` is missing

The kickoff prompt lists four documents to read; only three are in the repo. The
product brief is therefore **not** baked into any prompt as a literal. Instead:

- `products.brief_markdown` holds it, pasted through `/products/recipefix`
- `brief_summary` is derived from it and rides in every generation prompt
- the first-run wizard blocks on that step, so generation cannot run against an
  empty brief and quietly produce generic copy

This is arguably better than the original design, but it was forced rather than
chosen. If the overview document exists elsewhere, paste it in.

---

## 8. Automated conversation discovery on X was not built

**v2 A.2 recommends** dropping it: reading is $0.005 per third-party post, which
puts reply-hunting at $30 to $75 a month before writing anything.

`XAdapter.collectMetrics()` reads only its own posts, at $0.001. `listComments()`
searches by `conversation_id` on posts Halyard published — that is answering
replies to your own content, not hunting for conversations. There is no watch-term
search anywhere.

---

## 9. Idea generation runs through the worker, not the web tier

Both the daily cron and the calibration batch enqueue a `generate` job rather
than calling a model inline. Vercel route handlers cap well below a generation
run that retries through three QC failures across four platforms.

---

## 10. Rendered assets go to a public Storage bucket

Meta cURLs media at publish time, and signed URLs with a short expiry fail
(v2 A.3). `assertPublicUrl()` in the Instagram adapter refuses anything that
looks signed, rather than letting the container hang in `IN_PROGRESS` until the
poll times out. The bucket holds rendered output only.
