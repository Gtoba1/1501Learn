-- ShopLink LMS, Row-Level Security
-- Run after 0001_init.sql.

-- ---------------------------------------------------------------------------
-- helper functions (security definer so they can read profiles/enrollments
-- without being blocked by the very policies that call them)
-- ---------------------------------------------------------------------------
create function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = uid and role = 'admin'
  );
$$;

create function public.is_enrolled(uid uuid, cid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.enrollments
    where user_id = uid and course_id = cid and status <> 'dropped'
  );
$$;

create function public.course_id_for_module(mid uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select course_id from public.modules where id = mid;
$$;

create function public.course_id_for_lesson(lid uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select m.course_id
  from public.lessons l
  join public.modules m on m.id = l.module_id
  where l.id = lid;
$$;

create function public.course_id_for_quiz(qid uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select public.course_id_for_lesson(lesson_id) from public.quizzes where id = qid;
$$;

create function public.course_id_for_assignment(aid uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select public.course_id_for_lesson(lesson_id) from public.assignments where id = aid;
$$;

-- ---------------------------------------------------------------------------
-- guard triggers: RLS controls which rows can be touched, these two guard
-- *which columns* a non-admin update is allowed to change, regardless of
-- what a client sends.
-- ---------------------------------------------------------------------------
create function public.guard_profile_role()
returns trigger
language plpgsql
as $$
begin
  if not public.is_admin(auth.uid()) then
    new.role = old.role;
  end if;
  return new;
end;
$$;

create trigger trg_guard_profile_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

create function public.guard_submission_grading()
returns trigger
language plpgsql
as $$
begin
  if not public.is_admin(auth.uid()) then
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

create trigger trg_guard_submission_grading
  before update on public.assignment_submissions
  for each row execute function public.guard_submission_grading();

-- ---------------------------------------------------------------------------
-- enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles               enable row level security;
alter table public.cohorts                enable row level security;
alter table public.cohort_members         enable row level security;
alter table public.courses                enable row level security;
alter table public.modules                enable row level security;
alter table public.lessons                enable row level security;
alter table public.enrollments            enable row level security;
alter table public.lesson_progress        enable row level security;
alter table public.quizzes                enable row level security;
alter table public.quiz_questions         enable row level security;
alter table public.quiz_options           enable row level security;
alter table public.quiz_attempts          enable row level security;
alter table public.assignments            enable row level security;
alter table public.assignment_submissions enable row level security;
alter table public.events                 enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin(auth.uid()));

create policy "profiles_update_own_or_admin" on public.profiles
  for update using (id = auth.uid() or public.is_admin(auth.uid()))
  with check (id = auth.uid() or public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- cohorts / cohort_members, admin managed, learners can see their own
-- ---------------------------------------------------------------------------
create policy "cohorts_select" on public.cohorts
  for select using (
    public.is_admin(auth.uid())
    or exists (select 1 from public.cohort_members cm where cm.cohort_id = id and cm.user_id = auth.uid())
  );
create policy "cohorts_admin_write" on public.cohorts
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy "cohort_members_select" on public.cohort_members
  for select using (user_id = auth.uid() or public.is_admin(auth.uid()));
create policy "cohort_members_admin_write" on public.cohort_members
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- courses / modules / lessons
-- A published course's syllabus (titles, lesson counts) is public marketing
-- material, shown on the landing page before signup. Full lesson *content*
-- gating by enrollment is enforced in the app layer in Phase 2 alongside the
-- lesson reader; this policy already blocks all access to draft courses.
-- ---------------------------------------------------------------------------
create policy "courses_select_published_or_admin" on public.courses
  for select using (status = 'published' or public.is_admin(auth.uid()));
create policy "courses_admin_write" on public.courses
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy "modules_select_published_or_admin" on public.modules
  for select using (
    public.is_admin(auth.uid())
    or exists (select 1 from public.courses c where c.id = course_id and c.status = 'published')
  );
create policy "modules_admin_write" on public.modules
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy "lessons_select_published_or_admin" on public.lessons
  for select using (
    public.is_admin(auth.uid())
    or exists (
      select 1 from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = module_id and c.status = 'published'
    )
  );
create policy "lessons_admin_write" on public.lessons
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- enrollments, admin enrolls learners; learners can see their own record
-- ---------------------------------------------------------------------------
create policy "enrollments_select_own_or_admin" on public.enrollments
  for select using (user_id = auth.uid() or public.is_admin(auth.uid()));
create policy "enrollments_admin_write" on public.enrollments
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- lesson_progress, a learner owns their own progress rows
-- ---------------------------------------------------------------------------
create policy "lesson_progress_select_own_or_admin" on public.lesson_progress
  for select using (user_id = auth.uid() or public.is_admin(auth.uid()));
create policy "lesson_progress_insert_own" on public.lesson_progress
  for insert with check (user_id = auth.uid());
create policy "lesson_progress_update_own" on public.lesson_progress
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- quizzes / questions / options, enrolled learners or admin only (never
-- public: unlike the syllabus, quiz content should not leak pre-enrollment).
-- The app must still avoid selecting quiz_options.is_correct when rendering
-- a quiz to a learner; grading happens server-side.
-- ---------------------------------------------------------------------------
create policy "quizzes_select_enrolled_or_admin" on public.quizzes
  for select using (
    public.is_admin(auth.uid())
    or public.is_enrolled(auth.uid(), public.course_id_for_lesson(lesson_id))
  );
create policy "quizzes_admin_write" on public.quizzes
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy "quiz_questions_select_enrolled_or_admin" on public.quiz_questions
  for select using (
    public.is_admin(auth.uid())
    or public.is_enrolled(auth.uid(), public.course_id_for_quiz(quiz_id))
  );
create policy "quiz_questions_admin_write" on public.quiz_questions
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy "quiz_options_select_enrolled_or_admin" on public.quiz_options
  for select using (
    public.is_admin(auth.uid())
    or public.is_enrolled(
      auth.uid(),
      (select public.course_id_for_quiz(qq.quiz_id) from public.quiz_questions qq where qq.id = question_id)
    )
  );
create policy "quiz_options_admin_write" on public.quiz_options
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- quiz_attempts, append-only history, a learner owns their own attempts
-- ---------------------------------------------------------------------------
create policy "quiz_attempts_select_own_or_admin" on public.quiz_attempts
  for select using (user_id = auth.uid() or public.is_admin(auth.uid()));
create policy "quiz_attempts_insert_own" on public.quiz_attempts
  for insert with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- assignments, enrolled learners or admin only
-- ---------------------------------------------------------------------------
create policy "assignments_select_enrolled_or_admin" on public.assignments
  for select using (
    public.is_admin(auth.uid())
    or public.is_enrolled(auth.uid(), public.course_id_for_lesson(lesson_id))
  );
create policy "assignments_admin_write" on public.assignments
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- assignment_submissions, a learner owns their own submission; grading
-- columns are protected by trg_guard_submission_grading above
-- ---------------------------------------------------------------------------
create policy "submissions_select_own_or_admin" on public.assignment_submissions
  for select using (user_id = auth.uid() or public.is_admin(auth.uid()));
create policy "submissions_insert_own" on public.assignment_submissions
  for insert with check (user_id = auth.uid());
create policy "submissions_update_own_or_admin" on public.assignment_submissions
  for update using (user_id = auth.uid() or public.is_admin(auth.uid()))
  with check (user_id = auth.uid() or public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- events, append-only activity log
-- ---------------------------------------------------------------------------
create policy "events_select_own_or_admin" on public.events
  for select using (user_id = auth.uid() or public.is_admin(auth.uid()));
create policy "events_insert_own_or_admin" on public.events
  for insert with check (user_id = auth.uid() or public.is_admin(auth.uid()));
