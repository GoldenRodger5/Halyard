alter table public.momentcircuit_render_jobs
  alter column github_issue_number drop not null;

comment on column public.momentcircuit_render_jobs.github_issue_number is
  'Optional GitHub issue reference for legacy/secondary triggers. Supabase/Vercel is the primary cloud queue and does not require an issue.';
