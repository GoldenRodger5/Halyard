-- §156. `private` is a third delivery outcome, distinct from `draft`.
--
-- A native draft (TikTok's inbox upload) is finished by the creator inside
-- their own app; Halyard cannot publish it afterwards. A private upload
-- (YouTube's privacyStatus=private) is real content Halyard can still publish
-- over the API. Both are unpublished, and telling an operator the wrong one
-- sends them to the wrong place.
--
-- Gotcha 1 in the other direction: the TypeScript union and this check
-- constraint are the same list written twice, so they change together.

alter table publications drop constraint if exists publications_publish_mode_check;
alter table publications
  add constraint publications_publish_mode_check
  check (publish_mode in ('direct', 'draft', 'private'));
