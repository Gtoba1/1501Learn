-- Phase 10: the 11-module Analytics Engineering curriculum.
-- 1. Lessons carry a practice task and a self-check example answer.
-- 2. Lessons have a resource library (read / watch / docs / deeper / project),
--    with the engagement numbers recorded when each resource was checked.
-- 3. Peer review: learners can share their practice answer and review other
--    learners' shared answers for the same lesson. Peers only ever see each
--    other through get_peer_practice(), which exposes first names and nothing
--    else from profiles.
-- 4. Admins can read quiz answers (for the quiz editor) without reopening
--    quiz_options.is_correct to learners.

-- ---------------------------------------------------------------------------
-- 1. Practice on lessons
-- ---------------------------------------------------------------------------
alter table public.lessons
  add column practice        text,
  add column practice_answer text;

-- ---------------------------------------------------------------------------
-- 2. Resource library
-- ---------------------------------------------------------------------------
create table public.lesson_resources (
  id               uuid primary key default gen_random_uuid(),
  lesson_id        uuid not null references public.lessons (id) on delete cascade,
  kind             text not null check (kind in ('read', 'watch', 'docs', 'deeper', 'project')),
  title            text not null check (char_length(title) between 1 and 300),
  url              text not null check (char_length(url) <= 2048 and url ~ '^https://'),
  source           text check (char_length(source) <= 200),
  note             text check (char_length(note) <= 1000),
  subscribers      bigint check (subscribers >= 0),
  views            bigint check (views >= 0),
  likes            bigint check (likes >= 0),
  published_on     date,
  checked_on       date,
  duration_minutes int check (duration_minutes >= 0),
  position         int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_lesson_resources_lesson on public.lesson_resources (lesson_id, position);
create trigger trg_lesson_resources_updated_at before update on public.lesson_resources
  for each row execute function public.set_updated_at();

alter table public.lesson_resources enable row level security;

create policy "lesson_resources_select_enrolled_or_admin" on public.lesson_resources
  for select using (
    public.is_admin(auth.uid())
    or public.is_enrolled(auth.uid(), public.course_id_for_lesson(lesson_id))
  );
create policy "lesson_resources_admin_write" on public.lesson_resources
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. Peer review
-- ---------------------------------------------------------------------------
create table public.practice_responses (
  id               uuid primary key default gen_random_uuid(),
  lesson_id        uuid not null references public.lessons (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  response_text    text check (char_length(response_text) <= 10000),
  response_url     text check (
                     response_url is null
                     or (char_length(response_url) <= 2048 and response_url ~ '^https?://')
                   ),
  share_with_peers boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (lesson_id, user_id),
  check (response_text is not null or response_url is not null)
);

create table public.practice_reviews (
  id          uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.practice_responses (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  comment     text not null check (char_length(comment) between 1 and 4000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (response_id, reviewer_id)
);

create index idx_practice_responses_lesson  on public.practice_responses (lesson_id);
create index idx_practice_responses_user    on public.practice_responses (user_id);
create index idx_practice_reviews_response  on public.practice_reviews (response_id);
create index idx_practice_reviews_reviewer  on public.practice_reviews (reviewer_id);

-- Ownership and the lesson a response belongs to never change after insert.
create function public.guard_practice_response()
returns trigger
language plpgsql
as $$
begin
  new.lesson_id  = old.lesson_id;
  new.user_id    = old.user_id;
  new.created_at = old.created_at;
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_guard_practice_response before update on public.practice_responses
  for each row execute function public.guard_practice_response();

create function public.guard_practice_review()
returns trigger
language plpgsql
as $$
begin
  new.response_id = old.response_id;
  new.reviewer_id = old.reviewer_id;
  new.created_at  = old.created_at;
  new.updated_at  = now();
  return new;
end;
$$;

create trigger trg_guard_practice_review before update on public.practice_reviews
  for each row execute function public.guard_practice_review();

-- A learner may review a response when it is shared, is not their own, they
-- are enrolled in its course, and they have answered the same practice task
-- themselves (so nobody can read answers without attempting first).
create function public.can_review_practice(uid uuid, rid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from practice_responses r
    where r.id = rid
      and r.share_with_peers
      and r.user_id <> uid
      and is_enrolled(uid, course_id_for_lesson(r.lesson_id))
      and exists (
        select 1 from practice_responses mine
        where mine.lesson_id = r.lesson_id and mine.user_id = uid
      )
  );
$$;

revoke execute on function public.can_review_practice(uuid, uuid) from public, anon;
grant execute on function public.can_review_practice(uuid, uuid) to authenticated;

alter table public.practice_responses enable row level security;
alter table public.practice_reviews   enable row level security;

create policy "practice_responses_select_own_or_admin" on public.practice_responses
  for select using (user_id = auth.uid() or public.is_admin(auth.uid()));
create policy "practice_responses_insert_own_enrolled" on public.practice_responses
  for insert with check (
    user_id = auth.uid()
    and public.is_enrolled(auth.uid(), public.course_id_for_lesson(lesson_id))
  );
create policy "practice_responses_update_own" on public.practice_responses
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "practice_responses_delete_own_or_admin" on public.practice_responses
  for delete using (user_id = auth.uid() or public.is_admin(auth.uid()));

create policy "practice_reviews_select_involved_or_admin" on public.practice_reviews
  for select using (
    reviewer_id = auth.uid()
    or public.is_admin(auth.uid())
    or exists (
      select 1 from public.practice_responses r
      where r.id = response_id and r.user_id = auth.uid()
    )
  );
create policy "practice_reviews_insert_allowed" on public.practice_reviews
  for insert with check (
    reviewer_id = auth.uid() and public.can_review_practice(auth.uid(), response_id)
  );
create policy "practice_reviews_update_own" on public.practice_reviews
  for update using (reviewer_id = auth.uid())
  with check (reviewer_id = auth.uid() and public.can_review_practice(auth.uid(), response_id));
create policy "practice_reviews_delete_own_or_admin" on public.practice_reviews
  for delete using (reviewer_id = auth.uid() or public.is_admin(auth.uid()));

-- Everything a learner sees about their peers for one lesson's practice task.
-- Until the caller has answered the task themselves, only a count comes back.
create function public.get_peer_practice(p_lesson_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid     uuid := auth.uid();
  v_mine    record;
  v_shared  int;
  v_peers   jsonb;
  v_reviews jsonb;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not (is_admin(v_uid) or is_enrolled(v_uid, course_id_for_lesson(p_lesson_id))) then
    raise exception 'NOT_ENROLLED';
  end if;

  select count(*) into v_shared
  from practice_responses
  where lesson_id = p_lesson_id and share_with_peers and user_id <> v_uid;

  select id into v_mine
  from practice_responses
  where lesson_id = p_lesson_id and user_id = v_uid;

  if not found then
    return jsonb_build_object('unlocked', false, 'sharedCount', v_shared);
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', rv.id,
             'reviewerName', split_part(coalesce(p.full_name, 'A learner'), ' ', 1),
             'comment', rv.comment,
             'createdAt', rv.created_at
           ) order by rv.created_at
         ), '[]'::jsonb)
  into v_reviews
  from practice_reviews rv
  left join profiles p on p.id = rv.reviewer_id
  where rv.response_id = v_mine.id;

  -- Least-reviewed answers first, so feedback spreads across everyone.
  select coalesce(jsonb_agg(x.item order by x.review_count, x.created_at desc), '[]'::jsonb)
  into v_peers
  from (
    select
      r.created_at,
      (select count(*) from practice_reviews c where c.response_id = r.id) as review_count,
      jsonb_build_object(
        'id', r.id,
        'authorName', split_part(coalesce(p.full_name, 'A learner'), ' ', 1),
        'responseText', r.response_text,
        'responseUrl', r.response_url,
        'createdAt', r.created_at,
        'reviews', coalesce((
          select jsonb_agg(
                   jsonb_build_object(
                     'id', rv.id,
                     'reviewerName', split_part(coalesce(rp.full_name, 'A learner'), ' ', 1),
                     'comment', rv.comment,
                     'mine', rv.reviewer_id = v_uid,
                     'createdAt', rv.created_at
                   ) order by rv.created_at
                 )
          from practice_reviews rv
          left join profiles rp on rp.id = rv.reviewer_id
          where rv.response_id = r.id
        ), '[]'::jsonb)
      ) as item
    from practice_responses r
    left join profiles p on p.id = r.user_id
    where r.lesson_id = p_lesson_id and r.share_with_peers and r.user_id <> v_uid
    order by review_count, r.created_at desc
    limit 20
  ) x;

  return jsonb_build_object(
    'unlocked', true,
    'sharedCount', v_shared,
    'reviewsReceived', v_reviews,
    'peers', v_peers
  );
end;
$$;

revoke execute on function public.get_peer_practice(uuid) from public, anon;
grant execute on function public.get_peer_practice(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Quiz editor: admins read answers through a function, learners still can't
-- ---------------------------------------------------------------------------
create function public.admin_quiz_questions(p_quiz_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not is_admin(auth.uid()) then
    raise exception 'NOT_ADMIN';
  end if;

  return coalesce((
    select jsonb_agg(
             jsonb_build_object(
               'id', q.id,
               'question', q.question,
               'explanation', q.explanation,
               'position', q.position,
               'options', coalesce((
                 select jsonb_agg(
                          jsonb_build_object(
                            'id', o.id,
                            'optionText', o.option_text,
                            'isCorrect', o.is_correct,
                            'position', o.position
                          ) order by o.position
                        )
                 from quiz_options o where o.question_id = q.id
               ), '[]'::jsonb)
             ) order by q.position
           )
    from quiz_questions q where q.quiz_id = p_quiz_id
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.admin_quiz_questions(uuid) from public, anon;
grant execute on function public.admin_quiz_questions(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Events for practice and peer review
-- ---------------------------------------------------------------------------
alter table public.events drop constraint events_event_type_check;
alter table public.events add constraint events_event_type_check
  check (event_type in (
    'login', 'enrolled', 'lesson_opened', 'lesson_completed',
    'quiz_started', 'quiz_submitted', 'assignment_submitted',
    'assignment_graded', 'resource_downloaded', 'module_skipped',
    'practice_submitted', 'peer_review_given'
  ));

drop policy if exists "events_insert_own_or_admin" on public.events;
create policy "events_insert_own_or_admin" on public.events
  for insert with check (
    public.is_admin(auth.uid())
    or (
      user_id = auth.uid()
      and event_type in (
        'login', 'lesson_opened', 'lesson_completed', 'quiz_started',
        'assignment_submitted', 'resource_downloaded', 'module_skipped',
        'practice_submitted', 'peer_review_given'
      )
    )
  );
