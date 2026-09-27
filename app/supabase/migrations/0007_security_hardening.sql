-- Phase 9: security hardening.
--
-- The anon key ships to every browser, so anything RLS allows is reachable
-- directly over the Supabase REST API, not just through the app's server
-- actions. This migration closes the gaps where the app was trusted to behave
-- but the database was not enforcing it:
--   1. Quiz answers (quiz_options.is_correct) were readable by any enrolled learner.
--   2. Learners could insert their own quiz_attempts rows with any score / passed.
--   3. The grading guard only ran on UPDATE, so a learner could INSERT a
--      submission already marked graded with a score of their choosing.
--   4. Learners could rewrite profiles.email, which is what instructors see.
--   5. Learners could log progress, submissions and admin-only event types for
--      courses they aren't enrolled in.

-- ---------------------------------------------------------------------------
-- 1 + 2. Quizzes: hide answers, grade on the server inside the database
-- ---------------------------------------------------------------------------
revoke select on public.quiz_options from anon, authenticated;
grant select (id, question_id, option_text, position) on public.quiz_options to anon, authenticated;

drop policy if exists "quiz_attempts_insert_own" on public.quiz_attempts;
revoke insert, update, delete on public.quiz_attempts from anon, authenticated;

create or replace function public.submit_quiz_attempt(p_quiz_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_quiz      record;
  v_attempts  int;
  v_total     int;
  v_score     int;
  v_passed    boolean;
  v_answers   jsonb;
  v_breakdown jsonb;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select id, lesson_id, passing_score, max_attempts into v_quiz
  from quizzes where id = p_quiz_id;
  if not found then
    raise exception 'QUIZ_NOT_FOUND';
  end if;

  if not (is_admin(v_uid) or is_enrolled(v_uid, course_id_for_lesson(v_quiz.lesson_id))) then
    raise exception 'NOT_ENROLLED';
  end if;

  -- Serialise concurrent submissions by the same learner for the same quiz so
  -- two requests fired at once can't both slip under max_attempts.
  perform pg_advisory_xact_lock(hashtext(v_uid::text || ':' || p_quiz_id::text));

  if v_quiz.max_attempts is not null then
    select count(*) into v_attempts
    from quiz_attempts where quiz_id = p_quiz_id and user_id = v_uid;
    if v_attempts >= v_quiz.max_attempts then
      raise exception 'NO_ATTEMPTS_LEFT';
    end if;
  end if;

  with q as (
    select id, question, explanation, position from quiz_questions where quiz_id = p_quiz_id
  ),
  -- Only count a selected option if it really belongs to that question.
  sel as (
    select q.id as qid, o.id as oid
    from q join quiz_options o
      on o.question_id = q.id and o.id::text = coalesce(p_answers, '{}'::jsonb) ->> q.id::text
  ),
  cor as (
    select distinct on (q.id) q.id as qid, o.id as oid
    from q join quiz_options o on o.question_id = q.id and o.is_correct
    order by q.id, o.position
  )
  select
    count(*),
    count(*) filter (where sel.oid is not null and sel.oid = cor.oid),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'questionId', q.id,
          'question', q.question,
          'explanation', q.explanation,
          'selectedOptionId', sel.oid,
          'correctOptionId', cor.oid,
          'correct', coalesce(sel.oid = cor.oid, false)
        ) order by q.position
      ),
      '[]'::jsonb
    ),
    coalesce(jsonb_object_agg(q.id::text, sel.oid) filter (where sel.oid is not null), '{}'::jsonb)
  into v_total, v_score, v_breakdown, v_answers
  from q
  left join sel on sel.qid = q.id
  left join cor on cor.qid = q.id;

  if v_total = 0 then
    raise exception 'NO_QUESTIONS';
  end if;

  v_passed := (v_score::numeric / v_total) * 100 >= v_quiz.passing_score;

  insert into quiz_attempts (user_id, quiz_id, score, passed, answers)
  values (v_uid, p_quiz_id, v_score, v_passed, v_answers);

  insert into events (user_id, event_type, entity_type, entity_id, metadata)
  values (
    v_uid, 'quiz_submitted', 'quiz', p_quiz_id,
    jsonb_build_object('score', v_score, 'passed', v_passed, 'totalQuestions', v_total)
  );

  return jsonb_build_object(
    'score', v_score,
    'totalQuestions', v_total,
    'passed', v_passed,
    'passingScore', v_quiz.passing_score,
    'breakdown', v_breakdown
  );
end;
$$;

revoke execute on function public.submit_quiz_attempt(uuid, jsonb) from public, anon;
grant execute on function public.submit_quiz_attempt(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Submissions: guard grading columns on INSERT as well as UPDATE, and
--    freeze a submission once it has been graded
-- ---------------------------------------------------------------------------
create or replace function public.guard_submission_grading()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null or public.is_admin(auth.uid()) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.score     = null;
    new.feedback  = null;
    new.graded_at = null;
    new.graded_by = null;
    if new.status not in ('not_submitted', 'submitted') then
      new.status = 'submitted';
    end if;
    return new;
  end if;

  if old.status = 'graded' then
    raise exception 'This submission has been graded and can no longer be changed.';
  end if;

  new.assignment_id = old.assignment_id;
  new.user_id       = old.user_id;
  new.score         = old.score;
  new.feedback      = old.feedback;
  new.graded_at     = old.graded_at;
  new.graded_by     = old.graded_by;
  if new.status not in ('not_submitted', 'submitted') then
    new.status = old.status;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_submission_grading on public.assignment_submissions;
create trigger trg_guard_submission_grading
  before insert or update on public.assignment_submissions
  for each row execute function public.guard_submission_grading();

drop policy if exists "submissions_insert_own" on public.assignment_submissions;
create policy "submissions_insert_own_enrolled" on public.assignment_submissions
  for insert with check (
    user_id = auth.uid()
    and public.is_enrolled(auth.uid(), public.course_id_for_assignment(assignment_id))
  );

-- ---------------------------------------------------------------------------
-- 4. Profiles: learners may change their name and theme, not their email or
--    role (role was already guarded; email is now too)
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and not public.is_admin(auth.uid()) then
    new.role  = old.role;
    new.email = old.email;
  end if;
  return new;
end;
$$;

alter table public.profiles
  add constraint profiles_full_name_length check (char_length(full_name) between 1 and 100) not valid;

-- ---------------------------------------------------------------------------
-- 5. Progress and events: only for courses the learner is enrolled in, and
--    only event types a learner can legitimately cause
-- ---------------------------------------------------------------------------
drop policy if exists "lesson_progress_insert_own" on public.lesson_progress;
drop policy if exists "lesson_progress_update_own" on public.lesson_progress;

create policy "lesson_progress_insert_own_enrolled" on public.lesson_progress
  for insert with check (
    user_id = auth.uid()
    and (
      public.is_admin(auth.uid())
      or public.is_enrolled(auth.uid(), public.course_id_for_lesson(lesson_id))
    )
  );
create policy "lesson_progress_update_own_enrolled" on public.lesson_progress
  for update using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      public.is_admin(auth.uid())
      or public.is_enrolled(auth.uid(), public.course_id_for_lesson(lesson_id))
    )
  );

drop policy if exists "events_insert_own_or_admin" on public.events;
create policy "events_insert_own_or_admin" on public.events
  for insert with check (
    public.is_admin(auth.uid())
    or (
      user_id = auth.uid()
      and event_type in (
        'login', 'lesson_opened', 'lesson_completed', 'quiz_started',
        'assignment_submitted', 'resource_downloaded', 'module_skipped'
      )
    )
  );
