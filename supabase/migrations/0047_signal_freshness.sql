-- §206. Discovery decays, and the schema had no way to say so.
--
-- `signals` carried `relevance` and `created_at`, and `generate` selected with
-- `order by relevance desc nulls last, created_at desc`. Relevance is the
-- primary key of that sort, so a six-month-old trend scored 0.9 outranked
-- today's scored 0.7 — permanently. §9 of the social-intelligence specification
-- forbids exactly this: "Do not reuse stale trends merely because they exist in
-- memory."
--
-- Five columns, each earning its place:
alter table signals
  -- Where it was seen. A TikTok trend is not an X trend, and a signal with no
  -- platform is a signal nobody can route.
  add column if not exists platform text,
  -- When the *thing* was observed, which can predate the row that recorded it.
  -- Decay runs from the observation, not from the insert.
  add column if not exists observed_at timestamptz,
  -- A hard window for signals that have one — a season, an event, a launch.
  -- Overrides the decay curve entirely.
  add column if not exists expires_at timestamptz,
  -- How much the observation is trusted, separately from how relevant it is.
  -- Null means unrecorded, which is not the same as untrusted.
  add column if not exists confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  -- Rate of change where it could be measured. A trend still accelerating is
  -- worth more than a stalled one of the same size. Null means unmeasured, and
  -- unmeasured is not zero (gotcha 9).
  add column if not exists velocity numeric;

-- Existing rows were observed when they were recorded; that is the best
-- available answer and it is true often enough to be the right backfill.
update signals set observed_at = created_at where observed_at is null;
alter table signals alter column observed_at set default now();

comment on column signals.observed_at is
  'When the signal was observed. Decay runs from here, not from created_at.';
comment on column signals.expires_at is
  'A hard window. Overrides the half-life curve in discovery/freshness.ts.';
comment on column signals.velocity is
  'Rate of change where measurable. Null is unmeasured, which is not zero.';

-- The unconsumed index gains the expiry, so the common read can skip dead rows
-- in the index rather than filtering them after the fact.
drop index if exists signals_unconsumed_idx;
create index if not exists signals_unconsumed_idx
  on signals (product_id, observed_at desc)
  where consumed_at is null;
