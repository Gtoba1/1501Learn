-- ShopLink LMS, core schema
-- Run in the Supabase SQL editor (or `supabase db push`) in order: 0001, 0002, 0003.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles (one row per auth.users row, created by the trigger in 0003)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  email       text not null,
  avatar_url  text,
  role        text not null default 'learner' check (role in ('learner', 'admin')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- cohorts
-- ---------------------------------------------------------------------------
create table public.cohorts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  start_date  date,
  end_date    date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.cohort_members (
  id          uuid primary key default gen_random_uuid(),
  cohort_id   uuid not null references public.cohorts (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (cohort_id, user_id)
);

-- ---------------------------------------------------------------------------
-- courses / modules / lessons
-- ---------------------------------------------------------------------------
create table public.courses (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  slug          text not null unique,
  description   text,
  thumbnail_url text,
  status        text not null default 'draft' check (status in ('draft', 'published')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.modules (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses (id) on delete cascade,
  title       text not null,
  description text,
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.lessons (
  id               uuid primary key default gen_random_uuid(),
  module_id        uuid not null references public.modules (id) on delete cascade,
  title            text not null,
  slug             text not null unique,
  description      text,
  content          text,
  video_url        text,
  position         int not null default 0,
  duration_minutes int,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- enrollments / progress
-- ---------------------------------------------------------------------------
create table public.enrollments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  course_id    uuid not null references public.courses (id) on delete cascade,
  cohort_id    uuid references public.cohorts (id) on delete set null,
  status       text not null default 'active' check (status in ('active', 'completed', 'dropped')),
  enrolled_at  timestamptz not null default now(),
  unique (user_id, course_id)
);

create table public.lesson_progress (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  lesson_id         uuid not null references public.lessons (id) on delete cascade,
  completed         boolean not null default false,
  completed_at      timestamptz,
  last_accessed_at  timestamptz not null default now(),
  unique (user_id, lesson_id)
);

-- ---------------------------------------------------------------------------
-- quizzes (module-level tests attach to the module's final lesson)
-- ---------------------------------------------------------------------------
create table public.quizzes (
  id            uuid primary key default gen_random_uuid(),
  lesson_id     uuid not null references public.lessons (id) on delete cascade,
  title         text not null,
  description   text,
  passing_score int not null default 70,
  max_attempts  int,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.quiz_questions (
  id            uuid primary key default gen_random_uuid(),
  quiz_id       uuid not null references public.quizzes (id) on delete cascade,
  question      text not null,
  question_type text not null default 'single_choice' check (question_type in ('single_choice')),
  explanation   text,
  position      int not null default 0
);

create table public.quiz_options (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references public.quiz_questions (id) on delete cascade,
  option_text  text not null,
  is_correct   boolean not null default false,
  position     int not null default 0
);

create table public.quiz_attempts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  quiz_id      uuid not null references public.quizzes (id) on delete cascade,
  score        int not null,
  passed       boolean not null,
  answers      jsonb not null default '{}'::jsonb,
  attempted_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- assignments (module projects attach to the module's final lesson)
-- ---------------------------------------------------------------------------
create table public.assignments (
  id           uuid primary key default gen_random_uuid(),
  lesson_id    uuid not null references public.lessons (id) on delete cascade,
  title        text not null,
  description  text,
  instructions text,
  deadline     timestamptz,
  max_score    int not null default 100,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.assignment_submissions (
  id              uuid primary key default gen_random_uuid(),
  assignment_id   uuid not null references public.assignments (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  submission_url  text,
  submission_text text,
  status          text not null default 'not_submitted'
                    check (status in ('not_submitted', 'submitted', 'under_review', 'graded')),
  score           int,
  feedback        text,
  submitted_at    timestamptz,
  graded_at       timestamptz,
  graded_by       uuid references public.profiles (id) on delete set null,
  unique (assignment_id, user_id)
);

-- ---------------------------------------------------------------------------
-- events, append-only activity log, designed for later extraction into a
-- warehouse (fct_user_activity). Never updated or deleted by the app.
-- ---------------------------------------------------------------------------
create table public.events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles (id) on delete set null,
  event_type  text not null check (event_type in (
                'login', 'enrolled', 'lesson_opened', 'lesson_completed',
                'quiz_started', 'quiz_submitted', 'assignment_submitted',
                'assignment_graded', 'resource_downloaded'
              )),
  entity_type text,
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- indexes
-- ---------------------------------------------------------------------------
create index idx_modules_course_id            on public.modules (course_id);
create index idx_lessons_module_id            on public.lessons (module_id);
create index idx_enrollments_user_id          on public.enrollments (user_id);
create index idx_enrollments_course_id        on public.enrollments (course_id);
create index idx_lesson_progress_user_id      on public.lesson_progress (user_id);
create index idx_lesson_progress_lesson_id    on public.lesson_progress (lesson_id);
create index idx_quiz_questions_quiz_id       on public.quiz_questions (quiz_id);
create index idx_quiz_options_question_id     on public.quiz_options (question_id);
create index idx_quiz_attempts_user_id        on public.quiz_attempts (user_id);
create index idx_quiz_attempts_quiz_id        on public.quiz_attempts (quiz_id);
create index idx_assignment_submissions_user  on public.assignment_submissions (user_id);
create index idx_assignment_submissions_asgmt on public.assignment_submissions (assignment_id);
create index idx_events_user_id_created_at    on public.events (user_id, created_at);
create index idx_cohort_members_cohort_id     on public.cohort_members (cohort_id);
create index idx_cohort_members_user_id       on public.cohort_members (user_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at    before update on public.profiles    for each row execute function public.set_updated_at();
create trigger trg_cohorts_updated_at     before update on public.cohorts     for each row execute function public.set_updated_at();
create trigger trg_courses_updated_at     before update on public.courses     for each row execute function public.set_updated_at();
create trigger trg_modules_updated_at     before update on public.modules     for each row execute function public.set_updated_at();
create trigger trg_lessons_updated_at     before update on public.lessons     for each row execute function public.set_updated_at();
create trigger trg_quizzes_updated_at     before update on public.quizzes     for each row execute function public.set_updated_at();
create trigger trg_assignments_updated_at before update on public.assignments for each row execute function public.set_updated_at();
