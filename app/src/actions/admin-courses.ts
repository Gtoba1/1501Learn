"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminUser } from "@/lib/auth/require-admin";
import { safeHttpUrl } from "@/lib/security/urls";
import { slugify } from "@/lib/utils";

export type ActionState = { error?: string; success?: string } | null;

async function uniqueLessonSlug(base: string, ignoreLessonId?: string) {
  const supabase = await createClient();
  let slug = slugify(base);
  let n = 2;
  for (;;) {
    let query = supabase.from("lessons").select("id").eq("slug", slug);
    if (ignoreLessonId) query = query.neq("id", ignoreLessonId);
    const { data } = await query.maybeSingle();
    if (!data) return slug;
    slug = `${slugify(base)}-${n++}`;
  }
}

// ---------------------------------------------------------------------------
// Course
// ---------------------------------------------------------------------------
export async function updateCourse(
  courseId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Only instructors can edit courses." };

  const title = formData.get("title")?.toString().trim();
  const description = formData.get("description")?.toString().trim() || null;
  const status = formData.get("status")?.toString();
  if (!title) return { error: "Title is required." };
  if (status !== "draft" && status !== "published") return { error: "Invalid status." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("courses")
    .update({ title, description, status })
    .eq("id", courseId);
  if (error) return { error: "Could not save the course." };

  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath("/");
  return { success: "Saved." };
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------
export async function createModule(
  courseId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Only instructors can edit courses." };

  const title = formData.get("title")?.toString().trim();
  if (!title) return { error: "Title is required." };
  const description = formData.get("description")?.toString().trim() || null;

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("modules")
    .select("position")
    .eq("course_id", courseId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("modules").insert({
    course_id: courseId,
    title,
    description,
    position: (existing?.position ?? -1) + 1,
  });
  if (error) return { error: "Could not create the module." };

  revalidatePath(`/admin/courses/${courseId}`);
  return { success: "Module added." };
}

export async function updateModule(
  moduleId: string,
  courseId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Only instructors can edit courses." };

  const title = formData.get("title")?.toString().trim();
  if (!title) return { error: "Title is required." };
  const description = formData.get("description")?.toString().trim() || null;
  const isOptional = formData.get("isOptional") === "on";

  const supabase = await createClient();
  const { error } = await supabase
    .from("modules")
    .update({ title, description, is_optional: isOptional })
    .eq("id", moduleId);
  if (error) return { error: "Could not save the module." };

  revalidatePath(`/admin/courses/${courseId}`);
  return { success: "Saved." };
}

export async function deleteModule(
  moduleId: string,
  courseId: string,
  _prev: ActionState,
): Promise<ActionState> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Only instructors can edit courses." };

  const supabase = await createClient();
  await supabase.from("modules").delete().eq("id", moduleId);

  revalidatePath(`/admin/courses/${courseId}`);
  return { success: "Module deleted." };
}

export async function reorderModule(
  moduleId: string,
  courseId: string,
  direction: "up" | "down",
): Promise<void> {
  const admin = await requireAdminUser();
  if (!admin) throw new Error("Only instructors can edit courses.");

  const supabase = await createClient();
  const { data: modules } = await supabase
    .from("modules")
    .select("id, position")
    .eq("course_id", courseId)
    .order("position", { ascending: true });
  if (!modules) return;

  const index = modules.findIndex((m) => m.id === moduleId);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapWith < 0 || swapWith >= modules.length) return;

  await Promise.all([
    supabase.from("modules").update({ position: modules[swapWith].position }).eq("id", modules[index].id),
    supabase.from("modules").update({ position: modules[index].position }).eq("id", modules[swapWith].id),
  ]);

  revalidatePath(`/admin/courses/${courseId}`);
}

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------
export async function createLesson(
  moduleId: string,
  courseId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Only instructors can edit courses." };

  const title = formData.get("title")?.toString().trim();
  if (!title) return { error: "Title is required." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("lessons")
    .select("position")
    .eq("module_id", moduleId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const slug = await uniqueLessonSlug(title);

  const { error } = await supabase.from("lessons").insert({
    module_id: moduleId,
    title,
    slug,
    position: (existing?.position ?? -1) + 1,
  });
  if (error) return { error: "Could not create the lesson." };

  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath(`/courses`);
  return { success: "Lesson added." };
}

export async function updateLesson(
  lessonId: string,
  courseId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Only instructors can edit courses." };

  const title = formData.get("title")?.toString().trim();
  if (!title) return { error: "Title is required." };

  const requestedSlug = formData.get("slug")?.toString().trim();
  const slug = requestedSlug ? await uniqueLessonSlug(requestedSlug, lessonId) : undefined;

  const description = formData.get("description")?.toString().trim() || null;
  const content = formData.get("content")?.toString() || null;
  const practice = formData.get("practice")?.toString().trim() || null;
  const practiceAnswer = formData.get("practiceAnswer")?.toString().trim() || null;
  const rawVideoUrl = formData.get("videoUrl")?.toString().trim() || null;
  const videoUrl = safeHttpUrl(rawVideoUrl);
  if (rawVideoUrl && !videoUrl) return { error: "Video URL must be a full https:// address." };
  const durationRaw = formData.get("durationMinutes")?.toString();
  const durationMinutes = durationRaw ? Number(durationRaw) : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("lessons")
    .update({
      title,
      ...(slug ? { slug } : {}),
      description,
      content,
      practice,
      practice_answer: practiceAnswer,
      video_url: videoUrl,
      duration_minutes: Number.isFinite(durationMinutes) ? durationMinutes : null,
    })
    .eq("id", lessonId);
  if (error) return { error: "Could not save the lesson." };

  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath(`/admin/courses/${courseId}/lessons/${lessonId}`);
  revalidatePath(`/courses`);
  return { success: "Saved." };
}

export async function deleteLesson(
  lessonId: string,
  courseId: string,
  _prev: ActionState,
): Promise<ActionState> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Only instructors can edit courses." };

  const supabase = await createClient();
  await supabase.from("lessons").delete().eq("id", lessonId);

  revalidatePath(`/admin/courses/${courseId}`);
  return { success: "Lesson deleted." };
}

export async function reorderLesson(
  lessonId: string,
  moduleId: string,
  courseId: string,
  direction: "up" | "down",
): Promise<void> {
  const admin = await requireAdminUser();
  if (!admin) throw new Error("Only instructors can edit courses.");

  const supabase = await createClient();
  const { data: lessons } = await supabase
    .from("lessons")
    .select("id, position")
    .eq("module_id", moduleId)
    .order("position", { ascending: true });
  if (!lessons) return;

  const index = lessons.findIndex((l) => l.id === lessonId);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapWith < 0 || swapWith >= lessons.length) return;

  await Promise.all([
    supabase.from("lessons").update({ position: lessons[swapWith].position }).eq("id", lessons[index].id),
    supabase.from("lessons").update({ position: lessons[index].position }).eq("id", lessons[swapWith].id),
  ]);

  revalidatePath(`/admin/courses/${courseId}`);
}

// ---------------------------------------------------------------------------
// Quiz / assignment metadata
// ---------------------------------------------------------------------------
export async function updateQuizMeta(
  quizId: string,
  courseId: string,
  lessonId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Only instructors can edit courses." };

  const title = formData.get("title")?.toString().trim();
  if (!title) return { error: "Title is required." };
  const description = formData.get("description")?.toString().trim() || null;
  const passingScore = Number(formData.get("passingScore"));
  const maxAttemptsRaw = formData.get("maxAttempts")?.toString();
  const maxAttempts = maxAttemptsRaw ? Number(maxAttemptsRaw) : null;

  if (!Number.isFinite(passingScore) || passingScore < 0 || passingScore > 100) {
    return { error: "Passing score must be between 0 and 100." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("quizzes")
    .update({ title, description, passing_score: passingScore, max_attempts: maxAttempts })
    .eq("id", quizId);
  if (error) return { error: "Could not save the quiz." };

  revalidatePath(`/admin/courses/${courseId}/lessons/${lessonId}`);
  return { success: "Saved." };
}

export async function updateAssignmentMeta(
  assignmentId: string,
  courseId: string,
  lessonId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Only instructors can edit courses." };

  const title = formData.get("title")?.toString().trim();
  if (!title) return { error: "Title is required." };
  const description = formData.get("description")?.toString().trim() || null;
  const instructions = formData.get("instructions")?.toString() || null;
  const deadlineRaw = formData.get("deadline")?.toString();
  const deadline = deadlineRaw ? new Date(deadlineRaw).toISOString() : null;
  const maxScore = Number(formData.get("maxScore"));

  if (!Number.isFinite(maxScore) || maxScore < 0) {
    return { error: "Max score must be a positive number." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("assignments")
    .update({ title, description, instructions, deadline, max_score: maxScore })
    .eq("id", assignmentId);
  if (error) return { error: "Could not save the assignment." };

  revalidatePath(`/admin/courses/${courseId}/lessons/${lessonId}`);
  return { success: "Saved." };
}
