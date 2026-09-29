-- Phase 11: two tracks (Analytics Engineering and Data Engineering).
-- 1. Courses get a display order and a one-line tagline for the track picker.
-- 2. Signup no longer auto-enrolls; learners choose a track on the dashboard.
-- 3. choose_track(): a learner is in one track at a time. Switching drops the
--    other enrollment but keeps its lesson progress, quiz attempts and
--    submissions, so switching back picks up where they left off.

-- ---------------------------------------------------------------------------
-- 1. Track display
-- ---------------------------------------------------------------------------
alter table public.courses
  add column position int not null default 0,
  add column tagline  text check (char_length(tagline) <= 300);

-- ---------------------------------------------------------------------------
-- 2. Signup creates the profile only
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Choosing or switching track
-- ---------------------------------------------------------------------------
create function public.choose_track(p_course_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not exists (select 1 from courses where id = p_course_id and status = 'published') then
    raise exception 'COURSE_NOT_FOUND';
  end if;

  -- Serialise concurrent switches by the same learner.
  perform pg_advisory_xact_lock(hashtext('choose_track:' || v_uid::text));

  update enrollments
  set status = 'dropped'
  where user_id = v_uid and course_id <> p_course_id and status <> 'dropped';

  insert into enrollments (user_id, course_id, status)
  values (v_uid, p_course_id, 'active')
  on conflict (user_id, course_id) do update
    set status = case when enrollments.status = 'completed' then 'completed' else 'active' end;

  insert into events (user_id, event_type, entity_type, entity_id)
  values (v_uid, 'enrolled', 'course', p_course_id);
end;
$$;

revoke execute on function public.choose_track(uuid) from public, anon;
grant execute on function public.choose_track(uuid) to authenticated;
