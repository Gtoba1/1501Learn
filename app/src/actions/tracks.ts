"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { consume, TOO_MANY_ATTEMPTS } from "@/lib/security/rate-limit";
import type { ToastActionState } from "@/hooks/use-toast-action";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Enrolls the learner in one track and drops any other; progress in the
// dropped track is kept by the database (see choose_track in 0009_tracks.sql).
export async function chooseTrack(
  courseId: string,
  courseSlug: string,
  _prev: ToastActionState,
): Promise<ToastActionState> {
  if (!UUID.test(courseId)) return { error: "That track could not be found." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };
  if (!consume(`choose-track:${user.id}`, 10, 10 * 60_000)) return { error: TOO_MANY_ATTEMPTS };

  const { error } = await supabase.rpc("choose_track", { p_course_id: courseId });
  if (error) {
    return {
      error: error.message.includes("COURSE_NOT_FOUND")
        ? "That track could not be found."
        : "Could not switch tracks. Please try again.",
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/tracks");
  revalidatePath("/courses", "layout");
  redirect(`/courses/${courseSlug}`);
}
