import { createClient } from "@/lib/supabase/server";
import { computeLearnerStats } from "@/lib/data/admin";

export type CohortListItem = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  memberCount: number;
};

export async function getCohorts(): Promise<CohortListItem[]> {
  const supabase = await createClient();

  const { data: cohorts } = await supabase
    .from("cohorts")
    .select("id, name, start_date, end_date")
    .order("created_at", { ascending: true });
  if (!cohorts?.length) return [];

  const { data: members } = await supabase
    .from("cohort_members")
    .select("cohort_id")
    .in(
      "cohort_id",
      cohorts.map((c) => c.id),
    );

  const countByCohort = new Map<string, number>();
  for (const m of members ?? []) {
    countByCohort.set(m.cohort_id, (countByCohort.get(m.cohort_id) ?? 0) + 1);
  }

  return cohorts.map((c) => ({
    id: c.id,
    name: c.name,
    startDate: c.start_date,
    endDate: c.end_date,
    memberCount: countByCohort.get(c.id) ?? 0,
  }));
}

export type CohortMember = {
  id: string;
  fullName: string;
  email: string;
  progressPercent: number | null;
  quizAverage: number | null;
};

export type CohortDetail = {
  cohort: { id: string; name: string; startDate: string | null; endDate: string | null };
  members: CohortMember[];
  stats: { size: number; avgProgress: number; avgQuizScore: number; completionRate: number };
};

export async function getCohortDetail(cohortId: string): Promise<CohortDetail | null> {
  const supabase = await createClient();

  const { data: cohort } = await supabase
    .from("cohorts")
    .select("id, name, start_date, end_date")
    .eq("id", cohortId)
    .maybeSingle();
  if (!cohort) return null;

  const { data: memberRows } = await supabase
    .from("cohort_members")
    .select("user_id")
    .eq("cohort_id", cohortId);
  const memberIds = (memberRows ?? []).map((m) => m.user_id);

  const { data: profiles } = memberIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", memberIds)
    : { data: [] as { id: string; full_name: string; email: string }[] };

  const stats = await computeLearnerStats(memberIds);

  const members: CohortMember[] = (profiles ?? []).map((p) => ({
    id: p.id,
    fullName: p.full_name,
    email: p.email,
    progressPercent: stats.get(p.id)?.progressPercent ?? null,
    quizAverage: stats.get(p.id)?.quizAverage ?? null,
  }));

  const withProgress = members.filter((m) => m.progressPercent !== null);
  const withQuiz = members.filter((m) => m.quizAverage !== null);

  return {
    cohort: { id: cohort.id, name: cohort.name, startDate: cohort.start_date, endDate: cohort.end_date },
    members,
    stats: {
      size: members.length,
      avgProgress: withProgress.length
        ? Math.round(withProgress.reduce((sum, m) => sum + (m.progressPercent ?? 0), 0) / withProgress.length)
        : 0,
      avgQuizScore: withQuiz.length
        ? Math.round(withQuiz.reduce((sum, m) => sum + (m.quizAverage ?? 0), 0) / withQuiz.length)
        : 0,
      completionRate: members.length
        ? Math.round((members.filter((m) => m.progressPercent === 100).length / members.length) * 100)
        : 0,
    },
  };
}

export type EnrollableLearner = { id: string; fullName: string; email: string };

export async function getEnrolledLearnersNotInCohort(cohortId: string): Promise<EnrollableLearner[]> {
  const supabase = await createClient();

  const { data: enrolled } = await supabase
    .from("enrollments")
    .select("user_id")
    .in("status", ["active", "completed"]);
  const enrolledIds = [...new Set((enrolled ?? []).map((e) => e.user_id))];
  if (!enrolledIds.length) return [];

  const { data: members } = await supabase
    .from("cohort_members")
    .select("user_id")
    .eq("cohort_id", cohortId);
  const memberIds = new Set((members ?? []).map((m) => m.user_id));

  const remainingIds = enrolledIds.filter((id) => !memberIds.has(id));
  if (!remainingIds.length) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", remainingIds)
    .order("full_name", { ascending: true });

  return (profiles ?? []).map((p) => ({ id: p.id, fullName: p.full_name, email: p.email }));
}
