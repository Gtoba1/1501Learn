import { createClient } from "@/lib/supabase/server";

export type AdminPracticeItem = {
  id: string;
  lessonTitle: string;
  learnerName: string;
  responseText: string | null;
  responseUrl: string | null;
  shared: boolean;
  updatedAt: string;
  reviews: { id: string; reviewerName: string; comment: string; createdAt: string }[];
};

// Latest practice answers with their peer feedback, for moderation. Admins can
// read every row through RLS.
export async function getRecentPracticeActivity(limit = 50): Promise<AdminPracticeItem[]> {
  const supabase = await createClient();

  const { data: responses } = await supabase
    .from("practice_responses")
    .select("id, lesson_id, user_id, response_text, response_url, share_with_peers, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (!responses?.length) return [];

  const responseIds = responses.map((r) => r.id);
  const { data: reviews } = await supabase
    .from("practice_reviews")
    .select("id, response_id, reviewer_id, comment, created_at")
    .in("response_id", responseIds)
    .order("created_at", { ascending: true });

  const lessonIds = [...new Set(responses.map((r) => r.lesson_id))];
  const userIds = [...new Set([...responses.map((r) => r.user_id), ...(reviews ?? []).map((r) => r.reviewer_id)])];
  const [{ data: lessons }, { data: profiles }] = await Promise.all([
    supabase.from("lessons").select("id, title").in("id", lessonIds),
    supabase.from("profiles").select("id, full_name").in("id", userIds),
  ]);

  const lessonTitle = new Map((lessons ?? []).map((l) => [l.id, l.title]));
  const name = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return responses.map((r) => ({
    id: r.id,
    lessonTitle: lessonTitle.get(r.lesson_id) ?? "Unknown lesson",
    learnerName: name.get(r.user_id) ?? "Unknown learner",
    responseText: r.response_text,
    responseUrl: r.response_url,
    shared: r.share_with_peers,
    updatedAt: r.updated_at,
    reviews: (reviews ?? [])
      .filter((v) => v.response_id === r.id)
      .map((v) => ({
        id: v.id,
        reviewerName: name.get(v.reviewer_id) ?? "Unknown learner",
        comment: v.comment,
        createdAt: v.created_at,
      })),
  }));
}
