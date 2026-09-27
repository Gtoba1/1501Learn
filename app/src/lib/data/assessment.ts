import { createClient } from "@/lib/supabase/server";

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

async function getCourseForLesson(lessonId: string) {
  const supabase = await createClient();
  const { data: lesson } = await supabase
    .from("lessons")
    .select("module_id")
    .eq("id", lessonId)
    .single();
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
  return course;
}

export type QuizAttemptSummary = {
  score: number;
  totalQuestions: number;
  passed: boolean;
  attemptedAt: string;
};

export type QuizForLearner = {
  course: { id: string; title: string; slug: string };
  quiz: { id: string; title: string; description: string | null; passingScore: number; maxAttempts: number | null };
  questions: { id: string; question: string; position: number; options: { id: string; optionText: string; position: number }[] }[];
  attempts: QuizAttemptSummary[];
};

export async function getQuizForLearner(quizId: string, userId: string): Promise<QuizForLearner | null> {
  const supabase = await createClient();

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, lesson_id, title, description, passing_score, max_attempts")
    .eq("id", quizId)
    .maybeSingle();
  if (!quiz) return null;

  const course = await getCourseForLesson(quiz.lesson_id);
  if (!course) return null;

  const enrolled = await getEnrollmentStatus(course.id, userId);
  if (!enrolled) return null;

  const { data: questions } = await supabase
    .from("quiz_questions")
    .select("id, question, position")
    .eq("quiz_id", quizId)
    .order("position", { ascending: true });

  const questionIds = (questions ?? []).map((q) => q.id);
  const { data: options } = questionIds.length
    ? await supabase
        .from("quiz_options")
        .select("id, question_id, option_text, position")
        .in("question_id", questionIds)
        .order("position", { ascending: true })
    : { data: [] as { id: string; question_id: string; option_text: string; position: number }[] };

  const optionsByQuestion = new Map<string, { id: string; optionText: string; position: number }[]>();
  for (const option of options ?? []) {
    const list = optionsByQuestion.get(option.question_id) ?? [];
    list.push({ id: option.id, optionText: option.option_text, position: option.position });
    optionsByQuestion.set(option.question_id, list);
  }

  const { data: attempts } = await supabase
    .from("quiz_attempts")
    .select("score, answers, passed, attempted_at")
    .eq("quiz_id", quizId)
    .eq("user_id", userId)
    .order("attempted_at", { ascending: false });

  return {
    course,
    quiz: {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      passingScore: quiz.passing_score,
      maxAttempts: quiz.max_attempts,
    },
    questions: (questions ?? []).map((q) => ({
      id: q.id,
      question: q.question,
      position: q.position,
      options: optionsByQuestion.get(q.id) ?? [],
    })),
    attempts: (attempts ?? []).map((a) => ({
      score: a.score,
      totalQuestions: questions?.length ?? 0,
      passed: a.passed,
      attemptedAt: a.attempted_at,
    })),
  };
}

export type AssignmentForLearner = {
  course: { id: string; title: string; slug: string };
  assignment: {
    id: string;
    title: string;
    description: string | null;
    instructions: string | null;
    deadline: string | null;
    maxScore: number;
  };
  submission: {
    id: string;
    submissionText: string | null;
    submissionUrl: string | null;
    status: string;
    score: number | null;
    feedback: string | null;
    submittedAt: string | null;
    gradedAt: string | null;
  } | null;
};

export async function getAssignmentForLearner(
  assignmentId: string,
  userId: string,
): Promise<AssignmentForLearner | null> {
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, lesson_id, title, description, instructions, deadline, max_score")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) return null;

  const course = await getCourseForLesson(assignment.lesson_id);
  if (!course) return null;

  const enrolled = await getEnrollmentStatus(course.id, userId);
  if (!enrolled) return null;

  const { data: submission } = await supabase
    .from("assignment_submissions")
    .select("id, submission_text, submission_url, status, score, feedback, submitted_at, graded_at")
    .eq("assignment_id", assignmentId)
    .eq("user_id", userId)
    .maybeSingle();

  return {
    course,
    assignment: {
      id: assignment.id,
      title: assignment.title,
      description: assignment.description,
      instructions: assignment.instructions,
      deadline: assignment.deadline,
      maxScore: assignment.max_score,
    },
    submission: submission
      ? {
          id: submission.id,
          submissionText: submission.submission_text,
          submissionUrl: submission.submission_url,
          status: submission.status,
          score: submission.score,
          feedback: submission.feedback,
          submittedAt: submission.submitted_at,
          gradedAt: submission.graded_at,
        }
      : null,
  };
}

export type PendingSubmission = {
  id: string;
  assignmentTitle: string;
  courseSlug: string;
  learnerName: string;
  learnerEmail: string;
  submissionText: string | null;
  submissionUrl: string | null;
  status: string;
  submittedAt: string | null;
};

export async function getPendingSubmissions(): Promise<PendingSubmission[]> {
  const supabase = await createClient();

  const { data: submissions } = await supabase
    .from("assignment_submissions")
    .select("id, assignment_id, user_id, submission_text, submission_url, status, submitted_at")
    .in("status", ["submitted", "under_review"])
    .order("submitted_at", { ascending: true });

  if (!submissions?.length) return [];

  const assignmentIds = [...new Set(submissions.map((s) => s.assignment_id))];
  const userIds = [...new Set(submissions.map((s) => s.user_id))];

  const [{ data: assignments }, { data: profiles }] = await Promise.all([
    supabase.from("assignments").select("id, title, lesson_id").in("id", assignmentIds),
    supabase.from("profiles").select("id, full_name, email").in("id", userIds),
  ]);

  const lessonIds = [...new Set((assignments ?? []).map((a) => a.lesson_id))];
  const courseByLesson = new Map<string, { slug: string }>();
  for (const lessonId of lessonIds) {
    const course = await getCourseForLesson(lessonId);
    if (course) courseByLesson.set(lessonId, course);
  }

  const assignmentById = new Map((assignments ?? []).map((a) => [a.id, a]));
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return submissions.map((s) => {
    const assignment = assignmentById.get(s.assignment_id);
    const profile = profileById.get(s.user_id);
    const course = assignment ? courseByLesson.get(assignment.lesson_id) : null;
    return {
      id: s.id,
      assignmentTitle: assignment?.title ?? "Unknown assignment",
      courseSlug: course?.slug ?? "",
      learnerName: profile?.full_name ?? "Unknown learner",
      learnerEmail: profile?.email ?? "",
      submissionText: s.submission_text,
      submissionUrl: s.submission_url,
      status: s.status,
      submittedAt: s.submitted_at,
    };
  });
}
