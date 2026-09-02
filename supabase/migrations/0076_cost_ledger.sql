-- §494. Every paid call in one ledger, a daily budget, and a per-piece total.
--
-- Twenty dollars in twelve hours, and the recorded model cost said $2.29:
-- eighty images at the provider's default quality were never recorded at all.
-- Images, vision, the critic and voice now land in agent_runs like model
-- calls, so one sum is the truth; this view gives each piece its total and
-- the budget bounds a day.

alter table settings
  add column if not exists daily_budget_usd numeric(10,2) not null default 5.00;
comment on column settings.daily_budget_usd is
  '§494. Paid job kinds wait for tomorrow once today''s ledger passes this. '
  'Raised deliberately on /master/system; the default is a testing budget.';

create index if not exists agent_runs_trigger_ref_idx on agent_runs (trigger_ref)
  where trigger = 'job';

-- Paid calls are attributed to a piece through the job that made them: the
-- downstream jobs carry payload.contentItemId, and the generate job that made
-- the piece is remembered as generation_meta.jobId (§494).
create or replace view content_item_costs as
select ci.id as content_item_id,
       coalesce(sum(r.cost_usd), 0)::numeric(10,4) as usd,
       count(r.run_id)::int as calls
  from content_items ci
  left join jobs j
    on j.payload ->> 'contentItemId' = ci.id::text
    or j.id::text = ci.generation_meta ->> 'jobId'
  left join agent_runs r
    on r.trigger = 'job' and r.trigger_ref = j.id::text and r.cost_usd is not null
 group by ci.id;
