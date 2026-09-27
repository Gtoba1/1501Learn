import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getLearnerRoster, getRecentActivity } from "@/lib/data/admin";
import {
  LearnersIcon,
  CoursesIcon,
  ProgressIcon,
  SubmissionsIcon,
  QuizIcon,
  CompletedIcon,
  ActivityIcon,
} from "@/components/admin/icons";

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function AdminOverviewPage() {
  const supabase = await createClient();

  const [learners, courses, activeEnrollments, pendingSubmissions, roster, activity] = await Promise.all([
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "learner"),
    supabase.from("courses").select("*", { count: "exact", head: true }),
    supabase
      .from("enrollments")
      .select("*", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("assignment_submissions")
      .select("*", { count: "exact", head: true })
      .in("status", ["submitted", "under_review"]),
    getLearnerRoster(),
    getRecentActivity(15),
  ]);

  const enrolled = roster.filter((r) => r.progressPercent !== null);
  const avgProgress = enrolled.length
    ? Math.round(enrolled.reduce((sum, r) => sum + (r.progressPercent ?? 0), 0) / enrolled.length)
    : 0;
  const withQuiz = roster.filter((r) => r.quizAverage !== null);
  const avgQuizScore = withQuiz.length
    ? Math.round(withQuiz.reduce((sum, r) => sum + (r.quizAverage ?? 0), 0) / withQuiz.length)
    : 0;
  const completedLearners = roster.filter((r) => r.progressPercent === 100).length;

  const stats = [
    { label: "Total learners", value: learners.count ?? 0, Icon: LearnersIcon },
    { label: "Courses", value: courses.count ?? 0, Icon: CoursesIcon },
    { label: "Active enrollments", value: activeEnrollments.count ?? 0, Icon: ProgressIcon },
    { label: "Pending submissions", value: pendingSubmissions.count ?? 0, Icon: SubmissionsIcon },
    { label: "Average progress", value: `${avgProgress}%`, Icon: ProgressIcon },
    { label: "Average quiz score", value: `${avgQuizScore}%`, Icon: QuizIcon },
    { label: "Completed learners", value: completedLearners, Icon: CompletedIcon },
  ];

  return (
    <div>
      <h1 className="mb-6 font-display text-3xl font-bold">Admin overview</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="flex items-start justify-between gap-3">
            <div>
              <strong className="block font-display text-3xl">{s.value}</strong>
              <span className="text-sm text-muted">{s.label}</span>
            </div>
            <s.Icon className="h-6 w-6 shrink-0 text-brand" />
          </Card>
        ))}
      </div>

      <h2 className="mt-10 mb-3 flex items-center gap-2 font-display text-xl font-bold">
        <ActivityIcon className="h-5 w-5" />
        Recent activity
      </h2>
      {activity.length === 0 ? (
        <Card className="text-muted">Nothing has happened yet.</Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {activity.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <span>{a.message}</span>
                <span className="shrink-0 text-xs text-muted">{timeAgo(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
