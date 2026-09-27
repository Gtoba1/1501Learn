"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminUser } from "@/lib/auth/require-admin";
import { consume, TOO_MANY_ATTEMPTS } from "@/lib/security/rate-limit";
import { safeHttpUrl } from "@/lib/security/urls";

export type ActionState = { error?: string; success?: string } | null;

const MAX_TEXT_LENGTH = 20_000;
const MAX_URL_LENGTH = 2048;

export async function submitAssignment(
  assignmentId: string,
  courseSlug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const submissionText = formData.get("submissionText")?.toString().trim() || null;
  const rawUrl = formData.get("submissionUrl")?.toString().trim() || null;
  const submissionUrl = safeHttpUrl(rawUrl);

  if (!submissionText && !rawUrl) {
    return { error: "Add a text response or a link before submitting." };
  }
  if (rawUrl && (!submissionUrl || submissionUrl.length > MAX_URL_LENGTH)) {
    return { error: "Links must be a full http:// or https:// address." };
  }
  if (submissionText && submissionText.length > MAX_TEXT_LENGTH) {
    return { error: `Keep your response under ${MAX_TEXT_LENGTH.toLocaleString()} characters.` };
  }
  if (!consume(`submit-assignment:${user.id}`, 20, 10 * 60_000)) return { error: TOO_MANY_ATTEMPTS };

  const { data: existing } = await supabase
    .from("assignment_submissions")
    .select("status")
    .eq("assignment_id", assignmentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing?.status === "graded") {
    return { error: "This assignment has already been graded and can't be resubmitted." };
  }

  const { error: upsertError } = await supabase.from("assignment_submissions").upsert(
    {
      assignment_id: assignmentId,
      user_id: user.id,
      submission_text: submissionText,
      submission_url: submissionUrl,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    },
    { onConflict: "assignment_id,user_id" },
  );
  if (upsertError) return { error: "Could not save your submission. Please try again." };

  await supabase.from("events").insert({
    user_id: user.id,
    event_type: "assignment_submitted",
    entity_type: "assignment",
    entity_id: assignmentId,
  });

  revalidatePath(`/courses/${courseSlug}/assignments/${assignmentId}`);
  revalidatePath("/admin/submissions");

  return { success: "Submitted! Your instructor will review it soon." };
}

export async function gradeSubmission(
  submissionId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Only instructors can grade submissions." };

  const supabase = await createClient();

  const scoreRaw = formData.get("score")?.toString();
  const feedback = formData.get("feedback")?.toString().trim() || null;
  const score = scoreRaw ? Number(scoreRaw) : NaN;

  if (!Number.isInteger(score) || score < 0 || score > 100_000) {
    return { error: "Enter a valid score." };
  }
  if (feedback && feedback.length > MAX_TEXT_LENGTH) {
    return { error: `Keep feedback under ${MAX_TEXT_LENGTH.toLocaleString()} characters.` };
  }

  const { data: submission, error: updateError } = await supabase
    .from("assignment_submissions")
    .update({
      score,
      feedback,
      status: "graded",
      graded_at: new Date().toISOString(),
      graded_by: admin.id,
    })
    .eq("id", submissionId)
    .select("assignment_id, user_id")
    .single();

  if (updateError || !submission) return { error: "Could not save the grade. Please try again." };

  await supabase.from("events").insert({
    user_id: submission.user_id,
    event_type: "assignment_graded",
    entity_type: "assignment",
    entity_id: submission.assignment_id,
    metadata: { score, graded_by: admin.id },
  });

  revalidatePath("/admin/submissions");

  return { success: "Graded." };
}
