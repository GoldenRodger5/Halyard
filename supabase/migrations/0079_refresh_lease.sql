-- §531. One refresher at a time, and an error that is not a grave.
--
-- X issues a two-hour access token and a refresh token that is **single use**:
-- every refresh returns a new one and invalidates the old immediately. Three
-- things in this system called `refreshDueTokens` with no coordination — the
-- worker's hourly schedule, the web tier's daily cron backstop, and, routinely,
-- a second worker (gotcha 13). Two of those refreshing the same account at once
-- is how a rotating chain is destroyed: one call rotates, the other presents a
-- token that no longer exists, and X answers "Value passed for the token was
-- invalid". Which is the exact message recorded against @Recipe_Fix on 23 Aug.
--
-- Then the account was marked `error`, and the select in `refreshDueTokens`
-- reads `capability_state in ('live','draft_only')` — so it was excluded from
-- every refresh thereafter. Its refresh token was still valid for six months
-- and nothing would ever use it again. The only exit was a person pressing
-- Reconnect, which is the thing being complained about.
--
-- Three columns, all mirroring how `jobs` already claims work:
--
--   refresh_locked_at      a lease, so exactly one process refreshes an account
--   refresh_failures       consecutive failures, for backoff and for giving up
--   refresh_next_attempt_at when this account may be tried again
--
-- Nullable with no backfill: null means "never attempted, try now", which is
-- the correct reading for every existing row.

alter table social_accounts
  add column if not exists refresh_locked_at timestamptz,
  add column if not exists refresh_failures integer not null default 0,
  add column if not exists refresh_next_attempt_at timestamptz;

comment on column social_accounts.refresh_locked_at is
  'Lease held while a process refreshes this account. X rotates refresh tokens on every use, so two concurrent refreshes destroy the chain. Stale leases are reclaimed after five minutes.';

comment on column social_accounts.refresh_failures is
  'Consecutive refresh failures. Drives exponential backoff and, past a threshold, the notification that a person really must reconnect.';

comment on column social_accounts.refresh_next_attempt_at is
  'Earliest next refresh attempt. Null means now. A transient provider failure sets this rather than marking the account error, because an error state used to exclude the account from refresh permanently.';

-- The refresher scans by "who is due", so index that rather than the lease.
-- Matches the refresher's scan: it selects on expiry being known, which is what
-- makes an account refreshable at all — Meta's long-lived tokens carry an
-- expiry and no refresh token, and are renewed by exchanging the access token.
create index if not exists social_accounts_refresh_due_idx
  on social_accounts (refresh_next_attempt_at)
  where token_expires_at is not null;
