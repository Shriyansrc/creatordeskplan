-- Reel jobs schema. FOR THE OWNER TO APPLY LATER. Not applied in this project.
create type public.reel_job_status as enum ('submitted','claimed','in_progress','ready','failed','canceled');

create table public.reel_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.reel_job_status not null default 'submitted',
  brief_json jsonb not null,
  source_video_path text,
  result_video_path text,
  error text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by text,
  completed_at timestamptz
);
create index reel_jobs_pickup on public.reel_jobs (status, created_at);

create table public.reel_job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.reel_jobs(id) on delete cascade,
  at timestamptz not null default now(),
  status public.reel_job_status not null,
  note text
);

alter table public.reel_jobs enable row level security;
alter table public.reel_job_events enable row level security;
grant select, insert, update on public.reel_jobs to authenticated;
grant select on public.reel_job_events to authenticated;

create policy "own jobs read" on public.reel_jobs for select to authenticated using (user_id = auth.uid());
create policy "own jobs create" on public.reel_jobs for insert to authenticated with check (user_id = auth.uid() and status = 'submitted');
create policy "own jobs cancel" on public.reel_jobs for update to authenticated
  using (user_id = auth.uid() and status = 'submitted') with check (user_id = auth.uid() and status = 'canceled');
create policy "own events read" on public.reel_job_events for select to authenticated
  using (exists (select 1 from public.reel_jobs j where j.id = job_id and j.user_id = auth.uid()));
-- The worker uses its own server credential (service role) outside the app; no browser policy grants claim/complete.

insert into storage.buckets (id, name, public, file_size_limit) values
  ('reel-sources','reel-sources', false, 209715200),
  ('reel-results','reel-results', false, 524288000);
create policy "own sources write" on storage.objects for insert to authenticated
  with check (bucket_id = 'reel-sources' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own sources read" on storage.objects for select to authenticated
  using (bucket_id in ('reel-sources','reel-results') and (storage.foldername(name))[1] = auth.uid()::text);
