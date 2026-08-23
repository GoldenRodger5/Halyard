# Five tables nothing reads — classified, with a proposal

Found by the §127 reachability sweep. **None has been dropped**, and the SQL
below is deliberately *not* in `supabase/migrations/`: putting it there would
apply it on the next `db:reset` and in every test harness, which is the same as
doing it. Move a block into a migration when the decision is made.

## Classification

| Table | Created | Class | Recommendation |
|---|---|---|---|
| `submissions` | 0007 | **Historical.** Superseded by `review_submissions` (0016), which every screen uses. | Drop |
| `format_cadence` | 0012 | **Superseded by code.** `DEFAULT_CADENCE` in `scheduling/cadence.ts` is what governs; the table holds three seeded rows nothing reads. | Drop |
| `connector_calls` | 0011 | **Accidental orphan.** "Connector call log, for the health page and the rate limiter" — neither was built on it. | Decide |
| `product_artifacts` | 0011 | **Intended, deliberately unbuilt.** This is the adaptation cache's storage. §120 proved the cache is unnecessary for correctness and left it unwired on purpose. | Keep |
| `hook_experiments` | 0012 | **Intended, half-built.** `hook_variants` is live — `hooks.ts` reads and writes it — and this is the A/B layer above it that was never finished. | Keep |

`content_items.product_artifact_id` is unused for the same reason as
`product_artifacts` and should share its fate.

## Why two are safe

`submissions` and `format_cadence` are superseded rather than unfinished. There
is a newer table doing the first job and code doing the second, so dropping them
removes a duplicate, not a capability. Both are empty of anything but seed rows.

## Why two should stay

`product_artifacts` and `hook_experiments` are the storage for features that
were designed, partially built, and consciously stopped. Dropping them converts
"unfinished" into "deleted", which is a larger decision than tidying and would
have to be redone from scratch to resume.

## Why one needs a decision

`connector_calls` was to back a connector health view and a rate limiter.
Neither exists. `platform_requests` covers adjacent ground and is itself
unwritten (§81). The smallest question is: **does Halyard want a per-connector
call log at all?** If yes, `connector_calls` is where it goes and it needs a
writer. If no, it goes with the other two.

**Recommendation: drop it.** Connector failures already surface through
`jobs.last_error`, notifications and the readiness page, and an unwritten log is
worse than no log because it looks like coverage.

## The proposal, ready to apply

```sql
/*
 * Remove tables superseded by a newer one or by code. Not reversible except by
 * restoring from backup, which is why this waited for a decision.
 */
drop table if exists submissions;      -- superseded by review_submissions (0016)
drop table if exists format_cadence;   -- superseded by DEFAULT_CADENCE in code

-- Only if the connector-log question above is answered "no".
drop table if exists connector_calls;
```

Anything dropped must also leave `packages/db/src/types.gen.ts`, which is
regenerated with `pnpm db:types`.
