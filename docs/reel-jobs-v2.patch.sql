-- DRAFT patch to docs/reel-jobs.sql. Not applied.
-- Correction: the draft's update policy already limits users to submitted -> canceled,
-- but "grant update" was table-wide, so a user could also edit other columns of their own
-- submitted row (brief, result path, claimed_by). Narrow it to the status column.
revoke update on public.reel_jobs from authenticated;
grant update (status) on public.reel_jobs to authenticated;
-- Brief size guard and cap on open jobs per user (needs measuring before a number is final).
alter table public.reel_jobs add constraint brief_size check (pg_column_size(brief_json) < 20000);
-- Stale claim return, run by the server-side worker path, not by users:
-- update public.reel_jobs set status='submitted', claimed_at=null, claimed_by=null
--  where status='claimed' and claimed_at < now() - interval '30 minutes';
-- Audit trigger: write an event row on each status change.
create or replace function public.reel_job_log() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' or new.status is distinct from old.status then
    insert into public.reel_job_events(job_id,status) values (new.id,new.status);
  end if;
  return new;
end $$;
create trigger reel_job_log_t after insert or update on public.reel_jobs for each row execute function public.reel_job_log();

-- Added after testing: a user could insert a job pointing source_video_path at another user's file
-- (the worker would then read it), or pre-fill server-only columns. Pin them at insert.
alter table public.reel_jobs add constraint source_in_own_folder
  check (source_video_path is null or source_video_path like user_id::text || '/' || id::text || '/%');
drop policy "own jobs create" on public.reel_jobs;
create policy "own jobs create" on public.reel_jobs for insert to authenticated
  with check (user_id = auth.uid() and status = 'submitted' and result_video_path is null
              and claimed_by is null and claimed_at is null and completed_at is null and error is null);
