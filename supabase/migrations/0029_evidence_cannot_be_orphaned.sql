/*
 * Evidence cannot be deleted while a fact still cites it.
 *
 * `product_facts.evidence_ids` is a `uuid[]`, and Postgres cannot put a foreign
 * key on an array element. So 0027 could enforce "a fact cites at least one
 * evidence row" at write time and nothing at all afterwards: deleting the
 * evidence left the fact in place, citing a uuid that resolves to nothing, and
 * the UI would render it with an empty provenance list — a fact that looks
 * sourced and is not.
 *
 * Found by review rather than by a failure, because no current code path
 * deletes evidence: collection *supersedes*, keeping the old row so a fact
 * citing it stays accurate about the page as it was. But an invariant that
 * holds only while every future writer remembers it is not an invariant, and
 * this is the one the whole design rests on.
 *
 * `restrict` rather than `cascade`. Cascading would silently delete the facts
 * built on that evidence, which trades a visible dangling reference for an
 * invisible disappearance — the worse of the two failures by some distance.
 * Deleting evidence should mean deleting what was concluded from it first, as a
 * deliberate act.
 */
create or replace function public.product_evidence_not_cited()
returns trigger
language plpgsql
as $$
declare
  citing integer;
begin
  select count(*) into citing
    from public.product_facts
   where old.id = any(evidence_ids);

  if citing > 0 then
    raise exception
      'cannot delete evidence % — % fact(s) cite it; delete or supersede those facts first',
      old.id, citing;
  end if;

  return old;
end $$;

drop trigger if exists product_evidence_not_cited on public.product_evidence;
create trigger product_evidence_not_cited
  before delete on public.product_evidence
  for each row execute function public.product_evidence_not_cited();
