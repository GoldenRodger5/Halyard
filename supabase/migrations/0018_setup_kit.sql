-- ═══════════════════════════════════════════════════════════════════════════
-- 0018 — Milestone 50: the account setup kit
-- ═══════════════════════════════════════════════════════════════════════════

/**
 * Generated profile copy, per product, platform and persona.
 *
 * Persisted rather than generated on view for two reasons. Generation costs a
 * model call per platform, and a page that regenerates on every load would burn
 * fourteen of them on a refresh. More importantly the operator *chooses* among
 * the variants while creating accounts in another tab — a bio that changes
 * underneath them between the read and the paste is worse than no bio.
 *
 * One row per (product, platform, persona). Regenerating replaces it, and the
 * previous version is not kept: this is a starting point for copy that gets
 * edited in the platform's own box anyway.
 */
create table setup_kit_entries (
  id             uuid primary key default gen_random_uuid(),
  product_id     text not null references products(id) on delete cascade,
  platform       text not null,
  persona        text not null check (persona in ('brand', 'founder')),

  -- [{text, angle, length}, ...] — three variants at different angles.
  bios           jsonb not null default '[]'::jsonb,
  display_names  jsonb not null default '[]'::jsonb,
  pinned_post    text,

  -- Which of the variants the operator settled on, so the download and the
  -- checklist agree with what actually went on the profile.
  chosen_bio     integer,
  chosen_name    integer,

  -- What the generator had to fix on the way, kept visible rather than hidden.
  notes          jsonb not null default '[]'::jsonb,
  prompt_version text not null,
  generated_at   timestamptz not null default now(),

  unique (product_id, platform, persona)
);

create index setup_kit_entries_product_idx on setup_kit_entries (product_id, persona);

/**
 * The handle the operator intends to use, per platform.
 *
 * Kept because the availability check is read-only and live: it answers a
 * question, it does not reserve anything. Recording the intent means the
 * checklist, the download and the pinned post all refer to the same handle, and
 * that a check run yesterday can be told apart from one run just now.
 */
create table desired_handles (
  product_id   text not null references products(id) on delete cascade,
  platform     text not null,
  handle       text not null,
  -- 'available' | 'taken' | 'invalid' | 'unknown'. Never inferred: a platform
  -- that cannot be checked without logging in stays 'unknown'.
  last_status  text,
  last_detail  text,
  last_method  text,
  checked_at   timestamptz,
  primary key (product_id, platform)
);

select public.apply_admin_rls();
