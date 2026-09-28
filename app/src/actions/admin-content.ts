"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminUser } from "@/lib/auth/require-admin";
import { parseCount } from "@/lib/content/parse-module";
import type { ResourceKind } from "@/lib/types/database.types";

export type ActionState = { error?: string; success?: string } | null;

const NOT_ADMIN = { error: "Only instructors can edit courses." };
const KINDS = new Set<ResourceKind>(["read", "watch", "docs", "deeper", "project"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function lessonPaths(courseId: string, lessonId: string) {
  revalidatePath(`/admin/courses/${courseId}/lessons/${lessonId}`);
  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath("/courses", "layout");
}

const text = (formData: FormData, key: string) => formData.get(key)?.toString().trim() || null;

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------
function readResource(formData: FormData) {
  const kind = formData.get("kind")?.toString() as ResourceKind;
  const title = text(formData, "title");
  const url = text(formData, "url");
  if (!KINDS.has(kind)) return { error: "Choose a resource type." } as const;
  if (!title) return { error: "Title is required." } as const;
  if (!url || !/^https:\/\/\S+$/.test(url) || url.length > 2048) {
    return { error: "The link must be a full https:// address." } as const;
  }

  const count = (key: string) => {
    const raw = text(formData, key);
    return raw ? parseCount(raw) : null;
  };
  const date = (key: string) => {
    const raw = text(formData, key);
    return raw && DATE.test(raw) ? raw : null;
  };
  const minutesRaw = text(formData, "durationMinutes");
  const minutes = minutesRaw ? Number(minutesRaw) : null;

  return {
    row: {
      kind,
      title,
      url,
      source: text(formData, "source"),
      note: text(formData, "note"),
      subscribers: kind === "watch" ? count("subscribers") : null,
      views: kind === "watch" ? count("views") : null,
      likes: kind === "watch" ? count("likes") : null,
      published_on: date("publishedOn"),
      checked_on: date("checkedOn"),
      duration_minutes: minutes !== null && Number.isInteger(minutes) && minutes >= 0 ? minutes : null,
    },
  } as const;
}

export async function createResource(
  lessonId: string,
  courseId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await requireAdminUser())) return NOT_ADMIN;
  const parsed = readResource(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("lesson_resources")
    .select("position")
    .eq("lesson_id", lessonId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase
    .from("lesson_resources")
    .insert({ ...parsed.row, lesson_id: lessonId, position: (last?.position ?? -1) + 1 });
  if (error) return { error: "Could not add the resource." };

  lessonPaths(courseId, lessonId);
  return { success: "Resource added." };
}

export async function updateResource(
  resourceId: string,
  lessonId: string,
  courseId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await requireAdminUser())) return NOT_ADMIN;
  const parsed = readResource(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.from("lesson_resources").update(parsed.row).eq("id", resourceId);
  if (error) return { error: "Could not save the resource." };

  lessonPaths(courseId, lessonId);
  return { success: "Saved." };
}

export async function deleteResource(resourceId: string, lessonId: string, courseId: string): Promise<void> {
  if (!(await requireAdminUser())) throw new Error(NOT_ADMIN.error);
  const supabase = await createClient();
  await supabase.from("lesson_resources").delete().eq("id", resourceId);
  lessonPaths(courseId, lessonId);
}

export async function moveResource(
  resourceId: string,
  lessonId: string,
  courseId: string,
  direction: "up" | "down",
): Promise<void> {
  if (!(await requireAdminUser())) throw new Error(NOT_ADMIN.error);
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("lesson_resources")
    .select("id, position")
    .eq("lesson_id", lessonId)
    .order("position", { ascending: true });
  if (!rows) return;

  const index = rows.findIndex((r) => r.id === resourceId);
  const swap = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swap < 0 || swap >= rows.length) return;

  // Positions may have gaps or ties after edits, so renumber while swapping.
  const ordered = rows.map((r) => r.id);
  [ordered[index], ordered[swap]] = [ordered[swap], ordered[index]];
  await Promise.all(
    ordered.map((id, position) => supabase.from("lesson_resources").update({ position }).eq("id", id)),
  );
  lessonPaths(courseId, lessonId);
}

// ---------------------------------------------------------------------------
// Quizzes
// ---------------------------------------------------------------------------
export async function createQuiz(lessonId: string, courseId: string, _prev: ActionState): Promise<ActionState> {
  if (!(await requireAdminUser())) return NOT_ADMIN;
  const supabase = await createClient();

  const { data: existing } = await supabase.from("quizzes").select("id").eq("lesson_id", lessonId).maybeSingle();
  if (existing) return { error: "This lesson already has a quiz." };

  const { data: lesson } = await supabase
    .from("lessons")
    .select("module_id")
    .eq("id", lessonId)
    .single();
  const { data: moduleRow } = lesson
    ? await supabase.from("modules").select("title").eq("id", lesson.module_id).single()
    : { data: null };

  const { error } = await supabase.from("quizzes").insert({
    lesson_id: lessonId,
    title: `${moduleRow?.title ?? "Module"} quiz`,
    description: "Pass to complete the module.",
    passing_score: 70,
  });
  if (error) return { error: "Could not create the quiz." };

  lessonPaths(courseId, lessonId);
  return { success: "Quiz created. Add its questions below." };
}

export async function deleteQuiz(quizId: string, lessonId: string, courseId: string): Promise<void> {
  if (!(await requireAdminUser())) throw new Error(NOT_ADMIN.error);
  const supabase = await createClient();
  await supabase.from("quizzes").delete().eq("id", quizId);
  lessonPaths(courseId, lessonId);
}

function readQuestion(formData: FormData) {
  const question = text(formData, "question");
  const explanation = text(formData, "explanation");
  const options = [0, 1, 2, 3, 4, 5]
    .map((i) => ({ i, text: text(formData, `option-${i}`) }))
    .filter((o): o is { i: number; text: string } => Boolean(o.text));
  const correct = Number(formData.get("correct"));

  if (!question) return { error: "Write the question." } as const;
  if (options.length < 2) return { error: "Add at least two options." } as const;
  if (!options.some((o) => o.i === correct)) return { error: "Mark which option is correct." } as const;

  return {
    question,
    explanation,
    options: options.map((o, position) => ({ option_text: o.text, is_correct: o.i === correct, position })),
  } as const;
}

export async function saveQuestion(
  quizId: string,
  questionId: string | null,
  lessonId: string,
  courseId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await requireAdminUser())) return NOT_ADMIN;
  const parsed = readQuestion(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = await createClient();
  let id = questionId;

  if (id) {
    const { error } = await supabase
      .from("quiz_questions")
      .update({ question: parsed.question, explanation: parsed.explanation })
      .eq("id", id);
    if (error) return { error: "Could not save the question." };
    const { error: clearError } = await supabase.from("quiz_options").delete().eq("question_id", id);
    if (clearError) return { error: "Could not update the options." };
  } else {
    const { data: last } = await supabase
      .from("quiz_questions")
      .select("position")
      .eq("quiz_id", quizId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data, error } = await supabase
      .from("quiz_questions")
      .insert({
        quiz_id: quizId,
        question: parsed.question,
        explanation: parsed.explanation,
        position: (last?.position ?? -1) + 1,
      })
      .select("id")
      .single();
    if (error || !data) return { error: "Could not add the question." };
    id = data.id;
  }

  // Inserted without returning rows: learners and admins alike can't SELECT
  // quiz_options.is_correct directly (see 0007_security_hardening.sql).
  const { error: optionsError } = await supabase
    .from("quiz_options")
    .insert(parsed.options.map((o) => ({ ...o, question_id: id! })));
  if (optionsError) return { error: "Could not save the options." };

  lessonPaths(courseId, lessonId);
  return { success: questionId ? "Question saved." : "Question added." };
}

export async function deleteQuestion(questionId: string, lessonId: string, courseId: string): Promise<void> {
  if (!(await requireAdminUser())) throw new Error(NOT_ADMIN.error);
  const supabase = await createClient();
  await supabase.from("quiz_questions").delete().eq("id", questionId);
  lessonPaths(courseId, lessonId);
}

// ---------------------------------------------------------------------------
// Peer review moderation
// ---------------------------------------------------------------------------
export async function removePracticeResponse(responseId: string): Promise<void> {
  if (!(await requireAdminUser())) throw new Error(NOT_ADMIN.error);
  const supabase = await createClient();
  await supabase.from("practice_responses").delete().eq("id", responseId);
  revalidatePath("/admin/peer-review");
  revalidatePath("/courses", "layout");
}

export async function removePeerReview(reviewId: string): Promise<void> {
  if (!(await requireAdminUser())) throw new Error(NOT_ADMIN.error);
  const supabase = await createClient();
  await supabase.from("practice_reviews").delete().eq("id", reviewId);
  revalidatePath("/admin/peer-review");
  revalidatePath("/courses", "layout");
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
export async function createAssignment(
  lessonId: string,
  courseId: string,
  _prev: ActionState,
): Promise<ActionState> {
  if (!(await requireAdminUser())) return NOT_ADMIN;
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("assignments")
    .select("id")
    .eq("lesson_id", lessonId)
    .maybeSingle();
  if (existing) return { error: "This lesson already has a project." };

  const { error } = await supabase.from("assignments").insert({
    lesson_id: lessonId,
    title: "Module project",
    instructions: "## Brief\n\nDescribe what to build.\n\n## Deliverables\n\n1. \n\n## How to submit\n\nPaste a link to your work.",
    max_score: 100,
  });
  if (error) return { error: "Could not create the project." };

  lessonPaths(courseId, lessonId);
  return { success: "Project created. Fill in its details below." };
}

export async function deleteAssignment(assignmentId: string, lessonId: string, courseId: string): Promise<void> {
  if (!(await requireAdminUser())) throw new Error(NOT_ADMIN.error);
  const supabase = await createClient();
  await supabase.from("assignments").delete().eq("id", assignmentId);
  lessonPaths(courseId, lessonId);
}
