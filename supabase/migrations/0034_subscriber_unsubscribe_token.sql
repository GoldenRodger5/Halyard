/*
 * A per-subscriber unsubscribe secret.
 *
 * The newsletter draft renders its footer link as `/u/{{unsubscribe}}`, a
 * placeholder meant to be substituted per recipient at send time. The send
 * handler never substituted it — it re-rendered the footer with the
 * *newsletter* id, which is the same string for everyone who receives it and
 * identifies no one. There was also no `/u/` route, so the link was a 404.
 *
 * The token is the whole authorisation for the request: knowing it proves you
 * received the mail. So it must be unguessable and per-subscriber, and it must
 * not be derivable from the email address — a token derived from the address
 * would let anyone unsubscribe anyone.
 *
 * 32 random bytes, hex. Generated in the default so a subscriber cannot exist
 * without one, and backfilled for the rows already here.
 */
alter table subscribers
  add column unsubscribe_token text not null
    default encode(gen_random_bytes(32), 'hex');

-- Existing rows took the default individually, but be explicit that no two
-- subscribers may share a token: the whole scheme rests on it.
create unique index subscribers_unsubscribe_token_key on subscribers (unsubscribe_token);

comment on column subscribers.unsubscribe_token is
  'Per-subscriber secret in the unsubscribe URL. Knowing it is the only credential the unsubscribe route requires.';
