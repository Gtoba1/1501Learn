-- Fix: the Phase 1 guard triggers checked `not is_admin(auth.uid())` to block
-- self-escalation over the API. But auth.uid() is also NULL for any direct
-- Postgres connection (the SQL Editor, a service-role script, a migration) , 
-- so the triggers were silently blocking legitimate admin/service-role writes
-- too, e.g. promoting a learner to admin via Studio's table editor.
--
-- Fix: only apply the guard when there IS an authenticated, non-admin caller.
-- A NULL auth.uid() means "not going through PostgREST as an end user" (direct
-- SQL, service role) and is implicitly trusted, same as it always has been for
-- every other table in this schema.

create or replace function public.guard_profile_role()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and not public.is_admin(auth.uid()) then
    new.role = old.role;
  end if;
  return new;
end;
$$;

create or replace function public.guard_submission_grading()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and not public.is_admin(auth.uid()) then
    new.score      = old.score;
    new.feedback   = old.feedback;
    new.graded_at  = old.graded_at;
    new.graded_by  = old.graded_by;
    if new.status = 'graded' then
      new.status = old.status;
    end if;
  end if;
  return new;
end;
$$;

-- One-off fix-up for the admin-test@upskill.test account created while
-- verifying Phase 3 locally, whose promotion silently no-op'd under the bug.
update public.profiles set role = 'admin' where email = 'admin-test@upskill.test';
