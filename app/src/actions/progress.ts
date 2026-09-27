"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ToastActionState } from "@/hooks/use-toast-action";

export async function markLessonComplete(
  lessonId: string,
  courseSlug: string,
  lessonSlug: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const now = new Date().toISOString();

  await supabase.from("lesson_progress").upsert(
    {
      user_id: user.id,
      lesson_id: lessonId,
      completed: true,
      completed_at: now,
      last_accessed_at: now,
    },
    { onConflict: "user_id,lesson_id" },
  );

  await supabase.from("events").insert({
    user_id: user.id,
    event_type: "lesson_completed",
    entity_type: "lesson",
    entity_id: lessonId,
  });

  revalidatePath(`/courses/${courseSlug}/lessons/${lessonSlug}`);
  revalidatePath(`/courses/${courseSlug}`);
  revalidatePath("/dashboard");
}

export async function recordLessonView(lessonId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("lesson_progress").upsert(
    { user_id: user.id, lesson_id: lessonId, last_accessed_at: new Date().toISOString() },
    { onConflict: "user_id,lesson_id" },
  );

  await supabase.from("events").insert({
    user_id: user.id,
    event_type: "lesson_opened",
    entity_type: "lesson",
    entity_id: lessonId,
  });
}

export async function skipModule(
  moduleId: string,
  courseSlug: string,
  _prev: ToastActionState,
): Promise<ToastActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: lessons } = await supabase.from("lessons").select("id").eq("module_id", moduleId);
  if (!lessons?.length) return { error: "This module has no lessons." };

  const now = new Date().toISOString();
  const rows = lessons.map((l) => ({
    user_id: user.id,
    lesson_id: l.id,
    skipped: true,
    last_accessed_at: now,
  }));

  const { error } = await supabase
    .from("lesson_progress")
    .upsert(rows, { onConflict: "user_id,lesson_id" });
  if (error) return { error: "Could not skip this module. Please try again." };

  await supabase.from("events").insert({
    user_id: user.id,
    event_type: "module_skipped",
    entity_type: "module",
    entity_id: moduleId,
  });

  revalidatePath(`/courses/${courseSlug}`);
  revalidatePath("/dashboard");

  return { success: "Module skipped." };
}
