import { createClient } from "@/lib/supabase/server";
import type { ResourceKind } from "@/lib/types/database.types";

export type LessonSummary = {
  id: string;
  title: string;
  slug: string;
  position: number;
  durationMinutes: number | null;
  completed: boolean;
  skipped: boolean;
  quizId: string | null;
  assignmentId: string | null;
};

export type ModuleSummary = {
  id: string;
  title: string;
  description: string | null;
  position: number;
  isOptional: boolean;
  lessons: LessonSummary[];
  // The module quiz and project live on the module's final lesson.
  quizId: string | null;
  assignmentId: string | null;
  quizPassed: boolean;
  minutes: number;
  // Every lesson completed or skipped, and the quiz (if any) passed.
  complete: boolean;
  itemsDone: number;
  itemsTotal: number;
};

// Progress counts each lesson plus the module quiz as one item each. Optional
// modules are shown but never count towards course progress.
export function courseProgress(modules: ModuleSummary[]) {
  const core = modules.filter((m) => !m.isOptional);
  const done = core.reduce((n, m) => n + m.itemsDone, 0);
  const total = core.reduce((n, m) => n + m.itemsTotal, 0);
  return {
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 0,
    modulesComplete: core.filter((m) => m.complete).length,
    modulesTotal: core.length,
    coreMinutes: core.reduce((n, m) => n + m.minutes, 0),
  };
}

export async function getCourseStructureWithProgress(
  courseId: string,
  userId: string,
): Promise<ModuleSummary[]> {
  const supabase = await createClient();

  const { data: modules } = await supabase
    .from("modules")
    .select("id, title, description, position, is_optional")
    .eq("course_id", courseId)
    .order("position", { ascending: true });

  const moduleIds = (modules ?? []).map((m) => m.id);

  const { data: lessons } = moduleIds.length
    ? await supabase
        .from("lessons")
        .select("id, module_id, title, slug, position, duration_minutes")
        .in("module_id", moduleIds)
        .order("position", { ascending: true })
    : { data: [] as { id: string; module_id: string; title: string; slug: string; position: number; duration_minutes: number | null }[] };

  const lessonIds = (lessons ?? []).map((l) => l.id);

  const { data: progress } = lessonIds.length
    ? await supabase
        .from("lesson_progress")
        .select("lesson_id, completed, skipped")
        .eq("user_id", userId)
        .in("lesson_id", lessonIds)
    : { data: [] as { lesson_id: string; completed: boolean; skipped: boolean }[] };

  const completedIds = new Set((progress ?? []).filter((p) => p.completed).map((p) => p.lesson_id));
  const skippedIds = new Set((progress ?? []).filter((p) => p.skipped).map((p) => p.lesson_id));

  const [{ data: quizzes }, { data: assignments }] = lessonIds.length
    ? await Promise.all([
        supabase.from("quizzes").select("id, lesson_id").in("lesson_id", lessonIds),
        supabase.from("assignments").select("id, lesson_id").in("lesson_id", lessonIds),
      ])
    : [
        { data: [] as { id: string; lesson_id: string }[] },
        { data: [] as { id: string; lesson_id: string }[] },
      ];

  const quizByLesson = new Map((quizzes ?? []).map((q) => [q.lesson_id, q.id]));
  const assignmentByLesson = new Map((assignments ?? []).map((a) => [a.lesson_id, a.id]));

  const quizIds = (quizzes ?? []).map((q) => q.id);
  const { data: passes } = quizIds.length
    ? await supabase
        .from("quiz_attempts")
        .select("quiz_id")
        .eq("user_id", userId)
        .eq("passed", true)
        .in("quiz_id", quizIds)
    : { data: [] as { quiz_id: string }[] };
  const passedQuizIds = new Set((passes ?? []).map((p) => p.quiz_id));

  const lessonsByModule = new Map<string, LessonSummary[]>();
  for (const lesson of lessons ?? []) {
    const list = lessonsByModule.get(lesson.module_id) ?? [];
    list.push({
      id: lesson.id,
      title: lesson.title,
      slug: lesson.slug,
      position: lesson.position,
      durationMinutes: lesson.duration_minutes,
      completed: completedIds.has(lesson.id),
      skipped: skippedIds.has(lesson.id),
      quizId: quizByLesson.get(lesson.id) ?? null,
      assignmentId: assignmentByLesson.get(lesson.id) ?? null,
    });
    lessonsByModule.set(lesson.module_id, list);
  }

  return (modules ?? []).map((m) => {
    const moduleLessons = (lessonsByModule.get(m.id) ?? []).sort((a, b) => a.position - b.position);
    const last = moduleLessons[moduleLessons.length - 1];
    const quizId = last?.quizId ?? null;
    const quizPassed = quizId ? passedQuizIds.has(quizId) : false;
    const lessonsDone = moduleLessons.filter((l) => l.completed || l.skipped).length;
    const itemsTotal = moduleLessons.length + (quizId ? 1 : 0);
    const itemsDone = lessonsDone + (quizPassed ? 1 : 0);
    return {
      id: m.id,
      title: m.title,
      description: m.description,
      position: m.position,
      isOptional: m.is_optional,
      lessons: moduleLessons,
      quizId,
      assignmentId: last?.assignmentId ?? null,
      quizPassed,
      minutes: moduleLessons.reduce((n, l) => n + (l.durationMinutes ?? 0), 0),
      complete: itemsTotal > 0 && itemsDone === itemsTotal,
      itemsDone,
      itemsTotal,
    };
  });
}

export async function getCourseBySlug(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("courses")
    .select("id, title, slug, description")
    .eq("slug", slug)
    .maybeSingle();
  return data;
}

// The track the learner is following now (one at a time), if any.
export async function getActiveCourseId(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("enrollments")
    .select("course_id")
    .eq("user_id", userId)
    .in("status", ["active", "completed"])
    .limit(1)
    .maybeSingle();
  return data?.course_id ?? null;
}

async function getEnrollmentStatus(courseId: string, userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("enrollments")
    .select("status")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle();
  return data?.status === "active" || data?.status === "completed";
}

export type CourseForLearner = {
  course: { id: string; title: string; slug: string; description: string | null };
  enrolled: boolean;
  modules: ModuleSummary[];
};

export async function getCourseForLearner(
  slug: string,
  userId: string,
): Promise<CourseForLearner | null> {
  const course = await getCourseBySlug(slug);
  if (!course) return null;

  const enrolled = await getEnrollmentStatus(course.id, userId);
  const modules = enrolled ? await getCourseStructureWithProgress(course.id, userId) : [];

  return { course, enrolled, modules };
}

export type LessonResource = {
  id: string;
  kind: ResourceKind;
  title: string;
  url: string;
  source: string | null;
  note: string | null;
  subscribers: number | null;
  views: number | null;
  likes: number | null;
  publishedOn: string | null;
  checkedOn: string | null;
  durationMinutes: number | null;
};

export type PracticeResponse = {
  responseText: string | null;
  responseUrl: string | null;
  shareWithPeers: boolean;
  updatedAt: string;
};

export type LessonDetail = {
  course: { id: string; title: string; slug: string };
  module: { id: string; title: string };
  lesson: {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    content: string | null;
    videoUrl: string | null;
    practice: string | null;
    practiceAnswer: string | null;
    durationMinutes: number | null;
    completed: boolean;
  };
  resources: LessonResource[];
  myPractice: PracticeResponse | null;
  modules: ModuleSummary[];
  prev: { slug: string; title: string } | null;
  next: { slug: string; title: string } | null;
  quiz: { id: string; title: string } | null;
  assignment: { id: string; title: string } | null;
};

export async function getLessonDetail(
  courseSlug: string,
  lessonSlug: string,
  userId: string,
): Promise<LessonDetail | null> {
  const course = await getCourseBySlug(courseSlug);
  if (!course) return null;

  const enrolled = await getEnrollmentStatus(course.id, userId);
  if (!enrolled) return null;

  const supabase = await createClient();

  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, module_id, title, slug, description, content, video_url, practice, practice_answer, duration_minutes")
    .eq("slug", lessonSlug)
    .maybeSingle();
  if (!lesson) return null;

  const { data: moduleRow } = await supabase
    .from("modules")
    .select("id, title, course_id")
    .eq("id", lesson.module_id)
    .single();
  if (!moduleRow || moduleRow.course_id !== course.id) return null;

  const modules = await getCourseStructureWithProgress(course.id, userId);
  const flat = modules.flatMap((m) => m.lessons);
  const currentIndex = flat.findIndex((l) => l.id === lesson.id);
  const prev = currentIndex > 0 ? flat[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < flat.length - 1 ? flat[currentIndex + 1] : null;

  const [{ data: quiz }, { data: assignment }, { data: resources }, { data: myPractice }] = await Promise.all([
    supabase.from("quizzes").select("id, title").eq("lesson_id", lesson.id).maybeSingle(),
    supabase.from("assignments").select("id, title").eq("lesson_id", lesson.id).maybeSingle(),
    supabase
      .from("lesson_resources")
      .select(
        "id, kind, title, url, source, note, subscribers, views, likes, published_on, checked_on, duration_minutes",
      )
      .eq("lesson_id", lesson.id)
      .order("position", { ascending: true }),
    supabase
      .from("practice_responses")
      .select("response_text, response_url, share_with_peers, updated_at")
      .eq("lesson_id", lesson.id)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  return {
    course,
    module: { id: moduleRow.id, title: moduleRow.title },
    lesson: {
      id: lesson.id,
      title: lesson.title,
      slug: lesson.slug,
      description: lesson.description,
      content: lesson.content,
      videoUrl: lesson.video_url,
      practice: lesson.practice,
      practiceAnswer: lesson.practice_answer,
      durationMinutes: lesson.duration_minutes,
      completed: flat[currentIndex]?.completed ?? false,
    },
    resources: (resources ?? []).map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      url: r.url,
      source: r.source,
      note: r.note,
      subscribers: r.subscribers,
      views: r.views,
      likes: r.likes,
      publishedOn: r.published_on,
      checkedOn: r.checked_on,
      durationMinutes: r.duration_minutes,
    })),
    myPractice: myPractice
      ? {
          responseText: myPractice.response_text,
          responseUrl: myPractice.response_url,
          shareWithPeers: myPractice.share_with_peers,
          updatedAt: myPractice.updated_at,
        }
      : null,
    modules,
    prev: prev ? { slug: prev.slug, title: prev.title } : null,
    next: next ? { slug: next.slug, title: next.title } : null,
    quiz: quiz ? { id: quiz.id, title: quiz.title } : null,
    assignment: assignment ? { id: assignment.id, title: assignment.title } : null,
  };
}

export type NextStep =
  | { kind: "lesson"; slug: string; title: string; moduleTitle: string }
  | { kind: "quiz"; quizId: string; title: string; moduleTitle: string };

// The first unfinished thing in the first incomplete core module: a lesson, or
// the module quiz once every lesson is done. Optional modules come last.
export function nextStep(modules: ModuleSummary[]): NextStep | null {
  const ordered = [...modules.filter((m) => !m.isOptional), ...modules.filter((m) => m.isOptional)];
  for (const m of ordered) {
    if (m.complete) continue;
    const lesson = m.lessons.find((l) => !l.completed && !l.skipped);
    if (lesson) return { kind: "lesson", slug: lesson.slug, title: lesson.title, moduleTitle: m.title };
    if (m.quizId && !m.quizPassed) {
      return { kind: "quiz", quizId: m.quizId, title: `${m.title} quiz`, moduleTitle: m.title };
    }
  }
  return null;
}

export type CourseProgressSummary = {
  courseTitle: string;
  courseSlug: string;
  totalLessons: number;
  completedLessons: number;
  skippedLessons: number;
  percent: number;
  modulesComplete: number;
  modulesTotal: number;
  modules: {
    id: string;
    title: string;
    isOptional: boolean;
    total: number;
    completed: number;
    percent: number;
    hasQuiz: boolean;
    quizPassed: boolean;
    complete: boolean;
  }[];
  next: NextStep | null;
};

export async function getDashboardProgress(userId: string): Promise<CourseProgressSummary[]> {
  const supabase = await createClient();

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("course_id, status")
    .eq("user_id", userId)
    .in("status", ["active", "completed"]);

  if (!enrollments?.length) return [];

  const courseIds = enrollments.map((e) => e.course_id);
  const { data: courses } = await supabase
    .from("courses")
    .select("id, title, slug")
    .in("id", courseIds);

  const summaries: CourseProgressSummary[] = [];

  for (const course of courses ?? []) {
    const modules = await getCourseStructureWithProgress(course.id, userId);
    const coreLessons = modules.filter((m) => !m.isOptional).flatMap((m) => m.lessons);
    const progress = courseProgress(modules);

    summaries.push({
      courseTitle: course.title,
      courseSlug: course.slug,
      totalLessons: coreLessons.length,
      completedLessons: coreLessons.filter((l) => l.completed).length,
      skippedLessons: coreLessons.filter((l) => l.skipped && !l.completed).length,
      percent: progress.percent,
      modulesComplete: progress.modulesComplete,
      modulesTotal: progress.modulesTotal,
      modules: modules.map((m) => ({
        id: m.id,
        title: m.title,
        isOptional: m.isOptional,
        total: m.itemsTotal,
        completed: m.itemsDone,
        percent: m.itemsTotal ? Math.round((m.itemsDone / m.itemsTotal) * 100) : 0,
        hasQuiz: m.quizId !== null,
        quizPassed: m.quizPassed,
        complete: m.complete,
      })),
      next: nextStep(modules),
    });
  }

  return summaries;
}
