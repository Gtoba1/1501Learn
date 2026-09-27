import { createClient } from "@/lib/supabase/server";
import { getCourseStructureWithProgress, type ModuleSummary } from "@/lib/data/learning";

// ---------------------------------------------------------------------------
// Learner roster
// ---------------------------------------------------------------------------
export type LearnerRosterRow = {
  id: string;
  fullName: string;
  email: string;
  courseTitle: string | null;
  courseSlug: string | null;
  enrollmentStatus: string | null;
  progressPercent: number | null;
  quizAverage: number | null;
  assignmentsGraded: number;
  lastActive: string | null;
};

export type LearnerStats = {
  courseTitle: string | null;
  courseSlug: string | null;
  enrollmentStatus: string | null;
  progressPercent: number | null;
  quizAverage: number | null;
  assignmentsGraded: number;
  lastActive: string | null;
};

const EMPTY_STATS: LearnerStats = {
  courseTitle: null,
  courseSlug: null,
  enrollmentStatus: null,
  progressPercent: null,
  quizAverage: null,
  assignmentsGraded: 0,
  lastActive: null,
};

export async function computeLearnerStats(userIds: string[]): Promise<Map<string, LearnerStats>> {
  const stats = new Map<string, LearnerStats>();
  if (!userIds.length) return stats;

  const supabase = await createClient();

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("user_id, course_id, status")
    .in("user_id", userIds);

  const courseIds = [...new Set((enrollments ?? []).map((e) => e.course_id))];
  const { data: courses } = courseIds.length
    ? await supabase.from("courses").select("id, title, slug").in("id", courseIds)
    : { data: [] as { id: string; title: string; slug: string }[] };
  const courseById = new Map((courses ?? []).map((c) => [c.id, c]));

  const { data: attempts } = await supabase
    .from("quiz_attempts")
    .select("user_id, quiz_id, score")
    .in("user_id", userIds);

  const quizIds = [...new Set((attempts ?? []).map((a) => a.quiz_id))];
  const { data: questionRows } = quizIds.length
    ? await supabase.from("quiz_questions").select("quiz_id").in("quiz_id", quizIds)
    : { data: [] as { quiz_id: string }[] };
  const questionCountByQuiz = new Map<string, number>();
  for (const q of questionRows ?? []) {
    questionCountByQuiz.set(q.quiz_id, (questionCountByQuiz.get(q.quiz_id) ?? 0) + 1);
  }

  const { data: gradedSubmissions } = await supabase
    .from("assignment_submissions")
    .select("user_id")
    .in("user_id", userIds)
    .eq("status", "graded");

  const { data: progressRows } = await supabase
    .from("lesson_progress")
    .select("user_id, last_accessed_at")
    .in("user_id", userIds);

  for (const userId of userIds) {
    const enrollment = (enrollments ?? []).find((e) => e.user_id === userId);
    const course = enrollment ? courseById.get(enrollment.course_id) : undefined;

    let progressPercent: number | null = null;
    if (enrollment && course) {
      const modules = await getCourseStructureWithProgress(course.id, userId);
      const allLessons = modules.flatMap((m) => m.lessons);
      progressPercent = allLessons.length
        ? Math.round(
            (allLessons.filter((l) => l.completed || l.skipped).length / allLessons.length) * 100,
          )
        : 0;
    }

    const userAttempts = (attempts ?? []).filter((a) => a.user_id === userId);
    const quizAverage = userAttempts.length
      ? Math.round(
          userAttempts.reduce((sum, a) => {
            const total = questionCountByQuiz.get(a.quiz_id) ?? 0;
            return sum + (total ? (a.score / total) * 100 : 0);
          }, 0) / userAttempts.length,
        )
      : null;

    const assignmentsGraded = (gradedSubmissions ?? []).filter((s) => s.user_id === userId).length;

    const lastActive = (progressRows ?? [])
      .filter((p) => p.user_id === userId)
      .reduce<string | null>((latest, p) => (!latest || p.last_accessed_at > latest ? p.last_accessed_at : latest), null);

    stats.set(userId, {
      courseTitle: course?.title ?? null,
      courseSlug: course?.slug ?? null,
      enrollmentStatus: enrollment?.status ?? null,
      progressPercent,
      quizAverage,
      assignmentsGraded,
      lastActive,
    });
  }

  return stats;
}

export async function getLearnerRoster(): Promise<LearnerRosterRow[]> {
  const supabase = await createClient();

  const { data: learners } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("role", "learner")
    .order("full_name", { ascending: true });

  if (!learners?.length) return [];

  const stats = await computeLearnerStats(learners.map((l) => l.id));

  return learners.map((l) => ({
    id: l.id,
    fullName: l.full_name,
    email: l.email,
    ...(stats.get(l.id) ?? EMPTY_STATS),
  }));
}

// ---------------------------------------------------------------------------
// Learner detail
// ---------------------------------------------------------------------------
export type LearnerDetail = {
  profile: { id: string; fullName: string; email: string };
  enrollment: { courseTitle: string; courseSlug: string; status: string; enrolledAt: string } | null;
  modules: ModuleSummary[];
  quizAttempts: {
    quizTitle: string;
    score: number;
    totalQuestions: number;
    passed: boolean;
    attemptedAt: string;
  }[];
  submissions: {
    assignmentTitle: string;
    status: string;
    score: number | null;
    feedback: string | null;
    submittedAt: string | null;
    gradedAt: string | null;
  }[];
};

export async function getLearnerDetail(userId: string): Promise<LearnerDetail | null> {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return null;

  const { data: enrollmentRow } = await supabase
    .from("enrollments")
    .select("course_id, status, enrolled_at")
    .eq("user_id", userId)
    .maybeSingle();

  let enrollment: LearnerDetail["enrollment"] = null;
  let modules: ModuleSummary[] = [];

  if (enrollmentRow) {
    const { data: course } = await supabase
      .from("courses")
      .select("id, title, slug")
      .eq("id", enrollmentRow.course_id)
      .maybeSingle();
    if (course) {
      enrollment = {
        courseTitle: course.title,
        courseSlug: course.slug,
        status: enrollmentRow.status,
        enrolledAt: enrollmentRow.enrolled_at,
      };
      modules = await getCourseStructureWithProgress(course.id, userId);
    }
  }

  const { data: attempts } = await supabase
    .from("quiz_attempts")
    .select("quiz_id, score, passed, attempted_at")
    .eq("user_id", userId)
    .order("attempted_at", { ascending: false });

  const quizIds = [...new Set((attempts ?? []).map((a) => a.quiz_id))];
  const { data: quizzes } = quizIds.length
    ? await supabase.from("quizzes").select("id, title").in("id", quizIds)
    : { data: [] as { id: string; title: string }[] };
  const { data: questionRows } = quizIds.length
    ? await supabase.from("quiz_questions").select("quiz_id").in("quiz_id", quizIds)
    : { data: [] as { quiz_id: string }[] };

  const quizTitleById = new Map((quizzes ?? []).map((q) => [q.id, q.title]));
  const questionCountByQuiz = new Map<string, number>();
  for (const q of questionRows ?? []) {
    questionCountByQuiz.set(q.quiz_id, (questionCountByQuiz.get(q.quiz_id) ?? 0) + 1);
  }

  const { data: submissionRows } = await supabase
    .from("assignment_submissions")
    .select("assignment_id, status, score, feedback, submitted_at, graded_at")
    .eq("user_id", userId)
    .order("submitted_at", { ascending: false });

  const assignmentIds = [...new Set((submissionRows ?? []).map((s) => s.assignment_id))];
  const { data: assignments } = assignmentIds.length
    ? await supabase.from("assignments").select("id, title").in("id", assignmentIds)
    : { data: [] as { id: string; title: string }[] };
  const assignmentTitleById = new Map((assignments ?? []).map((a) => [a.id, a.title]));

  return {
    profile: { id: profile.id, fullName: profile.full_name, email: profile.email },
    enrollment,
    modules,
    quizAttempts: (attempts ?? []).map((a) => ({
      quizTitle: quizTitleById.get(a.quiz_id) ?? "Unknown quiz",
      score: a.score,
      totalQuestions: questionCountByQuiz.get(a.quiz_id) ?? 0,
      passed: a.passed,
      attemptedAt: a.attempted_at,
    })),
    submissions: (submissionRows ?? []).map((s) => ({
      assignmentTitle: assignmentTitleById.get(s.assignment_id) ?? "Unknown assignment",
      status: s.status,
      score: s.score,
      feedback: s.feedback,
      submittedAt: s.submitted_at,
      gradedAt: s.graded_at,
    })),
  };
}

// ---------------------------------------------------------------------------
// Course / module / lesson editing
// ---------------------------------------------------------------------------
export type AdminCourse = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  status: "draft" | "published";
};

export async function getCoursesForAdmin(): Promise<AdminCourse[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("courses")
    .select("id, title, slug, description, status")
    .order("created_at", { ascending: true });
  return data ?? [];
}

export type AdminModule = {
  id: string;
  title: string;
  description: string | null;
  position: number;
  isOptional: boolean;
  lessons: {
    id: string;
    title: string;
    slug: string;
    position: number;
    quizId: string | null;
    assignmentId: string | null;
  }[];
};

export type AdminCourseDetail = { course: AdminCourse; modules: AdminModule[] };

export async function getCourseForAdmin(courseId: string): Promise<AdminCourseDetail | null> {
  const supabase = await createClient();

  const { data: course } = await supabase
    .from("courses")
    .select("id, title, slug, description, status")
    .eq("id", courseId)
    .maybeSingle();
  if (!course) return null;

  const { data: modules } = await supabase
    .from("modules")
    .select("id, title, description, position, is_optional")
    .eq("course_id", courseId)
    .order("position", { ascending: true });

  const moduleIds = (modules ?? []).map((m) => m.id);
  const { data: lessons } = moduleIds.length
    ? await supabase
        .from("lessons")
        .select("id, module_id, title, slug, position")
        .in("module_id", moduleIds)
        .order("position", { ascending: true })
    : { data: [] as { id: string; module_id: string; title: string; slug: string; position: number }[] };

  const lessonIds = (lessons ?? []).map((l) => l.id);
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

  const lessonsByModule = new Map<string, AdminModule["lessons"]>();
  for (const lesson of lessons ?? []) {
    const list = lessonsByModule.get(lesson.module_id) ?? [];
    list.push({
      id: lesson.id,
      title: lesson.title,
      slug: lesson.slug,
      position: lesson.position,
      quizId: quizByLesson.get(lesson.id) ?? null,
      assignmentId: assignmentByLesson.get(lesson.id) ?? null,
    });
    lessonsByModule.set(lesson.module_id, list);
  }

  return {
    course,
    modules: (modules ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      position: m.position,
      isOptional: m.is_optional,
      lessons: (lessonsByModule.get(m.id) ?? []).sort((a, b) => a.position - b.position),
    })),
  };
}

export type AdminLessonDetail = {
  lesson: {
    id: string;
    moduleId: string;
    title: string;
    slug: string;
    description: string | null;
    content: string | null;
    videoUrl: string | null;
    durationMinutes: number | null;
  };
  course: { id: string; title: string; slug: string };
  quiz: { id: string; title: string; description: string | null; passingScore: number; maxAttempts: number | null } | null;
  assignment: {
    id: string;
    title: string;
    description: string | null;
    instructions: string | null;
    deadline: string | null;
    maxScore: number;
  } | null;
};

export async function getLessonForAdmin(lessonId: string): Promise<AdminLessonDetail | null> {
  const supabase = await createClient();

  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, module_id, title, slug, description, content, video_url, duration_minutes")
    .eq("id", lessonId)
    .maybeSingle();
  if (!lesson) return null;

  const { data: moduleRow } = await supabase
    .from("modules")
    .select("course_id")
    .eq("id", lesson.module_id)
    .single();
  if (!moduleRow) return null;

  const { data: course } = await supabase
    .from("courses")
    .select("id, title, slug")
    .eq("id", moduleRow.course_id)
    .single();

  const [{ data: quiz }, { data: assignment }] = await Promise.all([
    supabase
      .from("quizzes")
      .select("id, title, description, passing_score, max_attempts")
      .eq("lesson_id", lessonId)
      .maybeSingle(),
    supabase
      .from("assignments")
      .select("id, title, description, instructions, deadline, max_score")
      .eq("lesson_id", lessonId)
      .maybeSingle(),
  ]);

  return {
    lesson: {
      id: lesson.id,
      moduleId: lesson.module_id,
      title: lesson.title,
      slug: lesson.slug,
      description: lesson.description,
      content: lesson.content,
      videoUrl: lesson.video_url,
      durationMinutes: lesson.duration_minutes,
    },
    course: course ?? { id: "", title: "", slug: "" },
    quiz: quiz
      ? {
          id: quiz.id,
          title: quiz.title,
          description: quiz.description,
          passingScore: quiz.passing_score,
          maxAttempts: quiz.max_attempts,
        }
      : null,
    assignment: assignment
      ? {
          id: assignment.id,
          title: assignment.title,
          description: assignment.description,
          instructions: assignment.instructions,
          deadline: assignment.deadline,
          maxScore: assignment.max_score,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Recent activity feed
// ---------------------------------------------------------------------------
export type ActivityItem = {
  id: string;
  message: string;
  createdAt: string;
};

const EVENT_LABEL: Partial<Record<string, string>> = {
  lesson_opened: "opened",
  lesson_completed: "completed",
  quiz_submitted: "took the quiz",
  assignment_submitted: "submitted",
  assignment_graded: "was graded on",
  module_skipped: "skipped",
  enrolled: "enrolled in",
  login: "logged in",
  resource_downloaded: "downloaded a resource for",
};

export async function getRecentActivity(limit = 15): Promise<ActivityItem[]> {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("events")
    .select("id, user_id, event_type, entity_type, entity_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!events?.length) return [];

  const userIds = [...new Set(events.filter((e) => e.user_id).map((e) => e.user_id as string))];
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
    : { data: [] as { id: string; full_name: string }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const idsByType = new Map<string, string[]>();
  for (const e of events) {
    if (!e.entity_type || !e.entity_id) continue;
    const list = idsByType.get(e.entity_type) ?? [];
    list.push(e.entity_id);
    idsByType.set(e.entity_type, list);
  }

  const tableByType: Record<string, string> = {
    lesson: "lessons",
    quiz: "quizzes",
    assignment: "assignments",
    module: "modules",
    course: "courses",
  };

  const titleById = new Map<string, string>();
  await Promise.all(
    [...idsByType.entries()].map(async ([entityType, ids]) => {
      const table = tableByType[entityType];
      if (!table) return;
      const { data } = await supabase
        .from(table as "lessons" | "quizzes" | "assignments" | "modules" | "courses")
        .select("id, title")
        .in("id", ids);
      for (const row of data ?? []) titleById.set(row.id, row.title);
    }),
  );

  return events.map((e) => {
    const name = (e.user_id && nameById.get(e.user_id)) || "Someone";
    const verb = EVENT_LABEL[e.event_type] ?? e.event_type.replace(/_/g, " ");
    const title = e.entity_id ? titleById.get(e.entity_id) : undefined;
    const message = title ? `${name} ${verb} "${title}"` : `${name} ${verb}`;
    return { id: e.id, message, createdAt: e.created_at };
  });
}
