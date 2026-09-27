import { createClient } from "@/lib/supabase/server";

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
};

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

  return (modules ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    position: m.position,
    isOptional: m.is_optional,
    lessons: (lessonsByModule.get(m.id) ?? []).sort((a, b) => a.position - b.position),
  }));
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
    durationMinutes: number | null;
    completed: boolean;
  };
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
    .select("id, module_id, title, slug, description, content, video_url, duration_minutes")
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

  const [{ data: quiz }, { data: assignment }] = await Promise.all([
    supabase.from("quizzes").select("id, title").eq("lesson_id", lesson.id).maybeSingle(),
    supabase.from("assignments").select("id, title").eq("lesson_id", lesson.id).maybeSingle(),
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
      durationMinutes: lesson.duration_minutes,
      completed: flat[currentIndex]?.completed ?? false,
    },
    modules,
    prev: prev ? { slug: prev.slug, title: prev.title } : null,
    next: next ? { slug: next.slug, title: next.title } : null,
    quiz: quiz ? { id: quiz.id, title: quiz.title } : null,
    assignment: assignment ? { id: assignment.id, title: assignment.title } : null,
  };
}

export type CourseProgressSummary = {
  courseTitle: string;
  courseSlug: string;
  totalLessons: number;
  completedLessons: number;
  skippedLessons: number;
  percent: number;
  modules: { id: string; title: string; total: number; completed: number; percent: number }[];
  continueLesson: { slug: string; title: string } | null;
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
    const allLessons = modules.flatMap((m) => m.lessons);
    const totalLessons = allLessons.length;
    const completedLessons = allLessons.filter((l) => l.completed).length;
    const skippedLessons = allLessons.filter((l) => l.skipped && !l.completed).length;
    const doneLessons = completedLessons + skippedLessons;
    const continueLesson = allLessons.find((l) => !l.completed && !l.skipped) ?? null;

    summaries.push({
      courseTitle: course.title,
      courseSlug: course.slug,
      totalLessons,
      completedLessons,
      skippedLessons,
      percent: totalLessons ? Math.round((doneLessons / totalLessons) * 100) : 0,
      modules: modules.map((m) => {
        const moduleDone = m.lessons.filter((l) => l.completed || l.skipped).length;
        return {
          id: m.id,
          title: m.title,
          total: m.lessons.length,
          completed: moduleDone,
          percent: m.lessons.length ? Math.round((moduleDone / m.lessons.length) * 100) : 0,
        };
      }),
      continueLesson: continueLesson ? { slug: continueLesson.slug, title: continueLesson.title } : null,
    });
  }

  return summaries;
}
