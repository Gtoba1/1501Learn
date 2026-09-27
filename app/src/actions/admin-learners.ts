"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminUser } from "@/lib/auth/require-admin";

export type ActionState = { error?: string; success?: string } | null;

export async function enrollLearner(
  userId: string,
  courseId: string,
  _prev: ActionState,
): Promise<ActionState> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Only instructors can enroll learners." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("enrollments")
    .insert({ user_id: userId, course_id: courseId, status: "active" });
  if (error) return { error: "Could not enroll this learner. They may already be enrolled." };

  await supabase.from("events").insert({
    user_id: userId,
    event_type: "enrolled",
    entity_type: "course",
    entity_id: courseId,
  });

  revalidatePath("/admin/learners");
  return { success: "Enrolled." };
}
