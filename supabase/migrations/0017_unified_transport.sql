-- ═══════════════════════════════════════════════════════════════════════════
-- 0017 — Milestone 49: the unified transport
-- ═══════════════════════════════════════════════════════════════════════════

/**
 * How an account reaches its platform.
 *
 * `direct` uses Halyard's own adapter and its own developer app. `unified` goes
 * through a provider whose app has already passed the platform reviews.
 *
 * Per account rather than per platform, because the answer genuinely differs:
 * X and Bluesky have no review gate and are better direct (X's per-call billing
 * and link-in-first-reply are handled properly there), while Instagram might be
 * either depending on whether Standard Access covers accounts you own.
 *
 * Changing this is a dropdown on /accounts. Nothing else changes — the queue,
 * the six QC gates, scheduling, idempotency, routing safety and attribution all
 * sit above the transport.
 */
alter table social_accounts add column transport text not null default 'direct'
  check (transport in ('direct', 'unified'));

-- The provider's own id for the account, since the platform token lives there
-- rather than here. Null on a direct account.
alter table social_accounts add column provider_account_id text;

alter table social_accounts add constraint social_accounts_unified_needs_provider_id
  check (transport = 'direct' or provider_account_id is not null);

/**
 * What a provider has been *observed* to do, per platform.
 *
 * Written only by scripts/verify-provider.ts, and only from what it watched
 * happen. Absent means never verified, which is not the same as unsupported and
 * is never treated as permission to publish.
 */
create table provider_capabilities (
  provider     text primary key,
  capabilities jsonb not null,
  verified_at  timestamptz not null default now()
);

select public.apply_admin_rls();
