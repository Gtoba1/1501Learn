-- Phase 7: self-serve pivot.
-- 1. New signups auto-enroll in the published course (no admin action needed).
-- 2. Modules can be flagged optional ("addendum"), Data Engineering becomes one,
--    and the curriculum reorders so Analytics Engineering leads.
-- 3. Lessons can be marked "skipped" (distinct from "completed") so a learner can
--    skip material they already know without an honest progress view lying about it.

-- ---------------------------------------------------------------------------
-- 1. Auto-enroll on signup
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_id uuid;
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email
  );

  select id into v_course_id from public.courses where status = 'published' limit 1;
  if v_course_id is not null then
    insert into public.enrollments (user_id, course_id, status)
    values (new.id, v_course_id, 'active')
    on conflict (user_id, course_id) do nothing;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Optional modules + curriculum reorder
-- ---------------------------------------------------------------------------
alter table public.modules add column is_optional boolean not null default false;

update public.modules set position = 0 where title = 'Foundations';
update public.modules set position = 1 where title = 'Analytics Engineering';
update public.modules set position = 2 where title = 'Lakehouse, Scale and Production';
update public.modules set position = 3, is_optional = true where title = 'Data Engineering';

-- ---------------------------------------------------------------------------
-- 3. Skip tracking
-- ---------------------------------------------------------------------------
alter table public.lesson_progress add column skipped boolean not null default false;

alter table public.events drop constraint events_event_type_check;
alter table public.events add constraint events_event_type_check
  check (event_type in (
    'login', 'enrolled', 'lesson_opened', 'lesson_completed',
    'quiz_started', 'quiz_submitted', 'assignment_submitted',
    'assignment_graded', 'resource_downloaded', 'module_skipped'
  ));
