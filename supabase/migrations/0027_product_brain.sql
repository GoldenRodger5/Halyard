/*
 * P1 — the Product Brain.
 *
 * A durable, evidence-backed understanding of a connected product, arranged so
 * that no belief can exist without something observed underneath it.
 *
 * ## The two tables, and why they are two
 *
 * `product_evidence` is what was *observed*: a page that was fetched, a listing
 * that was read, a tool surface that was enumerated. It is written only by
 * deterministic collectors and never by an agent.
 *
 * `product_facts` is what Halyard *believes*, and every row points back at the
 * evidence it rests on. Separating them is what makes provenance real rather
 * than decorative: a fact whose evidence was superseded is visibly a fact about
 * a page that no longer says that.
 *
 * ## What is deliberately NOT here
 *
 * **A `features` category.** `feature_claims` (0023) already is the feature
 * inventory, and its verification is stronger than anything this table could
 * offer — a claim becomes `verified` by being *replayed in a browser*, not by
 * being agreed with. Adding `product_facts.category = 'features'` would give one
 * question two answers, and they would drift. The Brain reads `feature_claims`
 * for features and owns everything else.
 *
 * **A `prohibited_claims` category.** That is an *instruction* — the operator
 * forbidding Halyard from saying something — and it already lives in
 * `products.content_rules.forbidden_claims`, enforced by the slop filter and the
 * copywriter. This table holds *observations*. A safety list with a second home,
 * in a table a model proposes into, is the worst place for it.
 *
 * **A `stale` status.** Staleness is a function of `last_verified_at` and the
 * clock, so it is computed by `isStale()` at read time. A stored `stale` is
 * wrong the moment the clock moves past it and nothing re-runs.
 *
 * **A confidence column the model writes.** `confidence` is computed from how
 * many independent sources corroborate the fact. A self-reported confidence is
 * a number a model chose, and it reads exactly like a measurement.
 */

-- ── Evidence: what was observed ────────────────────────────────────────────
create table if not exists product_evidence (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references products(id) on delete cascade,

  /*
   * Where this came from. The set is closed because an open one would let a
   * collector invent a provenance class nothing downstream weighs correctly.
   *
   * `connector_surface` is the product's own API as it actually exists — the
   * tool list an MCP server advertises. It is the closest thing to
   * implementation truth available for a product that ships without a
   * repository, which is the case for the first connected product.
   */
  kind text not null check (kind in (
    'web_page', 'app_store_listing', 'connector_surface', 'connector_artifact',
    'screenshot', 'repository', 'operator_brief'
  )),

  source_url text,

  /*
   * A hash of the observed content, and the reason re-collection is idempotent.
   *
   * Collecting the same unchanged page twice must not produce two rows, or the
   * corroboration count — which decides whether a fact is verified — would rise
   * every time the collector ran. Two identical observations of one source are
   * one observation.
   */
  content_hash text not null,

  title text,
  -- The observed content, as text. Truncated by the collector, never rewritten:
  -- the whole point is to be able to compare a fact against what was actually
  -- there.
  body text not null default '',
  meta jsonb not null default '{}'::jsonb,

  collected_at timestamptz not null default now(),
  -- Which collector, so a bad collector's output can be found and removed.
  collector text not null,

  /*
   * Set when the same source is observed with different content.
   *
   * The old row is kept rather than updated. A fact pointing at superseded
   * evidence is not a broken reference — it is the useful statement "this was
   * true of the page as it was on the third".
   */
  superseded_by uuid references product_evidence(id) on delete set null
);

-- One row per (source, content). Re-collecting unchanged content touches
-- `collected_at` instead of inserting.
create unique index if not exists product_evidence_identity_idx
  on product_evidence (product_id, kind, coalesce(source_url, ''), content_hash);

create index if not exists product_evidence_recent_idx
  on product_evidence (product_id, kind, collected_at desc);

comment on column product_evidence.content_hash is
  'Makes re-collection idempotent. Two identical observations of one source are one observation, which matters because corroboration count decides verification.';

-- ── Facts: what Halyard believes, and why ──────────────────────────────────
create table if not exists product_facts (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references products(id) on delete cascade,

  /*
   * The architecture's category list (§3 Team A), minus `features` and
   * `prohibited_claims`.
   *
   * See the header: features live in `feature_claims`, which verifies by replay,
   * and prohibited claims live in `products.content_rules`, which enforces them.
   */
  category text not null check (category in (
    'identity', 'mission', 'users', 'personas', 'jobs_to_be_done', 'workflows',
    'differentiators', 'pricing', 'monetization', 'competitors', 'brand_voice',
    'visual_identity', 'claims', 'ux_model',
    'conversion_funnel', 'app_store_positioning', 'content_pillars'
  )),

  -- A stable slug within the category, so two observations of the same thing
  -- collide instead of accumulating. 'primary_audience', not 'audience_2'.
  key text not null,
  value text not null,
  detail text,

  /*
   * The same four words `feature_claims` uses, so the system has one vocabulary
   * for belief rather than two.
   *
   * `unverifiable` means the fact is not the kind of thing corroboration can
   * settle — it is kept and marked rather than discarded, because silently
   * dropping it would make the Brain look more certain than it is.
   */
  status text not null default 'unverified'
    check (status in ('unverified', 'verified', 'refuted', 'unverifiable')),

  /*
   * Computed from corroboration, never supplied by a model.
   *
   * There is no code path that writes this from parsed model output; it is set
   * by `computeConfidence` from the evidence rows alone.
   */
  confidence numeric(3,2) not null default 0.00 check (confidence >= 0 and confidence <= 1),

  -- The evidence this rests on. A fact with an empty array is refused by a
  -- trigger below rather than by a caller remembering to check.
  evidence_ids uuid[] not null default '{}',

  -- Set by the deterministic contradiction pass when another fact disagrees.
  contradicts uuid references product_facts(id) on delete set null,
  -- The reconciler's explanation of a contradiction. Prose, never a decision.
  reconciliation text,

  -- Provenance: which agent, which version, which prompt.
  agent_id text not null,
  agent_version text not null,
  prompt_version text,

  first_seen_at timestamptz not null default now(),
  last_verified_at timestamptz,
  updated_at timestamptz not null default now(),

  superseded_by uuid references product_facts(id) on delete set null
);

/*
 * One live row per (slot, value) — deliberately *not* per slot.
 *
 * A slot holds every distinct value observed for it, because two sources
 * disagreeing is a thing this system must be able to represent. Keying on the
 * slot alone would make the second value overwrite the first on upsert, and
 * `findContradictions` — which groups by slot and looks for two values — could
 * then never find anything. The contradiction screen, the reconciler agent and
 * the rule behind them would all be wired to something structurally incapable
 * of happening.
 *
 * Re-observing the same value in the same slot still collides and updates,
 * which is what keeps repeated collection from accumulating duplicates.
 */
create unique index if not exists product_facts_identity_idx
  on product_facts (product_id, category, key, value) where superseded_by is null;

create index if not exists product_facts_category_idx
  on product_facts (product_id, category, status);

/*
 * A fact with no evidence cannot exist.
 *
 * Enforced here rather than in the writer because this is the single rule the
 * whole design rests on: it is what stops a model's fluent invention from
 * becoming a product fact. A check constraint cannot express it against the
 * referenced rows, so it is a trigger.
 */
create or replace function public.product_facts_require_evidence()
returns trigger
language plpgsql
as $$
begin
  if array_length(new.evidence_ids, 1) is null then
    raise exception 'a product fact must cite at least one evidence row (category=%, key=%)',
      new.category, new.key;
  end if;
  return new;
end $$;

drop trigger if exists product_facts_require_evidence on public.product_facts;
create trigger product_facts_require_evidence
  before insert or update on public.product_facts
  for each row execute function public.product_facts_require_evidence();

comment on column product_facts.confidence is
  'Computed from independent corroborating sources. No code path writes this from model output.';
comment on column product_facts.status is
  'verified requires two independent evidence sources. A model cannot set this; deriveFactStatus does.';

-- ── RLS, matching every other table in this database ───────────────────────
--
-- The model from 0010, 0020 and 0025, reused rather than reinvented: RLS
-- enabled AND forced, one `admin_all` policy gated on `public.is_admin()` and
-- not scoped to a role, and no privileges at all for `anon` or `authenticated`.
--
-- The policy is created unconditionally. Guarding a policy on a role existing
-- is what shipped a `using (true)` boundary in 0023 and nearly shipped one in
-- 0025 — a plain Postgres has no `authenticated` role, so the guarded block
-- never ran locally and the defect existed only on Supabase.
alter table product_evidence enable row level security;
alter table product_evidence force row level security;
alter table product_facts enable row level security;
alter table product_facts force row level security;

do $$
declare
  t text;
begin
  foreach t in array array['product_evidence', 'product_facts'] loop
    if not exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = t and policyname = 'admin_all'
    ) then
      execute format(
        'create policy admin_all on public.%I for all
           using (public.is_admin()) with check (public.is_admin())', t);
    end if;
  end loop;
end $$;

-- Grants are role-specific, so these are guarded: the roles exist on Supabase
-- and not on a plain Postgres.
do $$
declare
  t text;
  r text;
begin
  foreach t in array array['product_evidence', 'product_facts'] loop
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('revoke all on public.%I from %I', t, r);
      end if;
    end loop;
  end loop;
end $$;
