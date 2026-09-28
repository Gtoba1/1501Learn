import { createClient } from "@/lib/supabase/server";

export type PeerReview = {
  id: string;
  reviewerName: string;
  comment: string;
  mine?: boolean;
  createdAt: string;
};

export type PeerAnswer = {
  id: string;
  authorName: string;
  responseText: string | null;
  responseUrl: string | null;
  createdAt: string;
  reviews: PeerReview[];
};

export type PeerPractice =
  | { unlocked: false; sharedCount: number }
  | { unlocked: true; sharedCount: number; reviewsReceived: PeerReview[]; peers: PeerAnswer[] };

// Peers are only visible through get_peer_practice(), which returns first
// names only and nothing until the caller has answered the task themselves.
export async function getPeerPractice(lessonId: string): Promise<PeerPractice> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_peer_practice", { p_lesson_id: lessonId });
  if (error || !data) return { unlocked: false, sharedCount: 0 };
  return data as unknown as PeerPractice;
}
