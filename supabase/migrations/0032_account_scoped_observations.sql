/*
 * 0032 — capability observations that belong to one account.
 *
 * ## The hole this fills
 *
 * `capability_probes` (0030) records what a *transport* was observed doing:
 * provider, platform, action, outcome. That is the right shape for "can Blotato
 * publish to Pinterest" — a fact about a provider, true or false for everyone
 * using it.
 *
 * It is the wrong shape for an engagement read. "Can Halyard read the comments
 * on this post" is a fact about **one connected account**: it depends on which
 * permissions that account granted, whether its token still carries them, and
 * whether the platform has approved that app for that account. @recipe.fix
 * succeeding says nothing about @isaacmineo, and with no account column the two
 * observations are indistinguishable — one account's success would vouch for
 * every other account on the same platform.
 *
 * That is why `read_comments` could not reach `verified` before this migration
 * and was left at `declared`. The resolver had no field to read, and there was
 * nowhere honest to write the observation. The gap was recorded rather than
 * papered over; this closes it.
 *
 * ## Why cascade rather than set null
 *
 * `on delete set null` would turn an account-scoped observation into a
 * provider-wide one the moment its account row disappeared — silently widening
 * a confirmation from "this account can" to "this platform can", which is
 * exactly the substitution the capability model exists to prevent. An
 * observation about access that no longer exists has no meaning to preserve.
 *
 * Nothing in Halyard deletes an account row: disconnecting erases the
 * credential and keeps the row, precisely so published history stays
 * explicable. This cascade is therefore a guard against a future path, not a
 * routine one.
 *
 * ## No new vocabulary
 *
 * `outcome` is unchanged and still describes what happened to the probe, not
 * what the capability is. `action` is unchanged and still free text matching
 * `CapabilityAction`. The verdict is still computed by `resolveCapability` in
 * code and is still not a column.
 */

alter table capability_probes
  add column if not exists account_id uuid references social_accounts(id) on delete cascade;

comment on column capability_probes.account_id is
  'The connected account this observation is about. Null means the probe was about a transport rather than an account — a provider-wide reachability check. An account-scoped read is never valid evidence for a different account, so readers must match this column exactly rather than falling back to null.';

/*
 * The read this exists for: the latest observation of one action, for one
 * account. Ordered so `limit 1` needs no sort.
 */
create index if not exists capability_probes_account_action_idx
  on capability_probes (account_id, action, started_at desc)
  where account_id is not null;
