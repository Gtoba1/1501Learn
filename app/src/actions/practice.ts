"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { consume, TOO_MANY_ATTEMPTS } from "@/lib/security/rate-limit";
import { safeHttpUrl } from "@/lib/security/urls";

export type ActionState = { error?: string; success?: string } | null;

const MAX_RESPONSE_LENGTH = 10_000;
const MAX_REVIEW_LENGTH = 4_000;
const MAX_URL_LENGTH = 2048;

export async function savePracticeResponse(
  lessonId: string,
  lessonPath: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const responseText = formData.get("responseText")?.toString().trim() || null;
  const rawUrl = formData.get("responseUrl")?.toString().trim() || null;
  const responseUrl = safeHttpUrl(rawUrl);
  const shareWithPeers = formData.get("shareWithPeers") === "on";

  if (!responseText && !rawUrl) return { error: "Write your answer or add a link first." };
  if (rawUrl && (!responseUrl || responseUrl.length > MAX_URL_LENGTH)) {
    return { error: "Links must be a full http:// or https:// address." };
  }
  if (responseText && responseText.length > MAX_RESPONSE_LENGTH) {
    return { error: `Keep your answer under ${MAX_RESPONSE_LENGTH.toLocaleString()} characters.` };
  }
  if (!consume(`practice:${user.id}`, 30, 10 * 60_000)) return { error: TOO_MANY_ATTEMPTS };

  const { data: existing } = await supabase
    .from("practice_responses")
    .select("id")
    .eq("lesson_id", lessonId)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = existing
    ? await supabase
        .from("practice_responses")
        .update({ response_text: responseText, response_url: responseUrl, share_with_peers: shareWithPeers })
        .eq("id", existing.id)
    : await supabase.from("practice_responses").insert({
        lesson_id: lessonId,
        user_id: user.id,
        response_text: responseText,
        response_url: responseUrl,
        share_with_peers: shareWithPeers,
      });
  if (error) return { error: "Could not save your answer. Please try again." };

  if (!existing) {
    await supabase.from("events").insert({
      user_id: user.id,
      event_type: "practice_submitted",
      entity_type: "lesson",
      entity_id: lessonId,
      metadata: { shared: shareWithPeers },
    });
  }

  revalidatePath(lessonPath);
  return {
    success: shareWithPeers
      ? "Saved. Other learners' answers are open below for you to review."
      : "Saved. Only you can see this answer.",
  };
}

export async function savePeerReview(
  responseId: string,
  lessonPath: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const comment = formData.get("comment")?.toString().trim() ?? "";
  if (!comment) return { error: "Write some feedback first." };
  if (comment.length > MAX_REVIEW_LENGTH) {
    return { error: `Keep feedback under ${MAX_REVIEW_LENGTH.toLocaleString()} characters.` };
  }
  if (!consume(`peer-review:${user.id}`, 30, 10 * 60_000)) return { error: TOO_MANY_ATTEMPTS };

  const { data: existing } = await supabase
    .from("practice_reviews")
    .select("id")
    .eq("response_id", responseId)
    .eq("reviewer_id", user.id)
    .maybeSingle();

  // RLS (can_review_practice) decides whether this learner may review it.
  const { error } = existing
    ? await supabase.from("practice_reviews").update({ comment }).eq("id", existing.id)
    : await supabase.from("practice_reviews").insert({ response_id: responseId, reviewer_id: user.id, comment });
  if (error) return { error: "Could not save your feedback. Please try again." };

  if (!existing) {
    await supabase.from("events").insert({
      user_id: user.id,
      event_type: "peer_review_given",
      entity_type: "practice_response",
      entity_id: responseId,
    });
  }

  revalidatePath(lessonPath);
  return { success: existing ? "Feedback updated." : "Thanks, your feedback has been shared." };
}

export async function deletePeerReview(reviewId: string, lessonPath: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // RLS lets reviewers delete their own reviews and admins delete any.
  await supabase.from("practice_reviews").delete().eq("id", reviewId);
  revalidatePath(lessonPath);
}
