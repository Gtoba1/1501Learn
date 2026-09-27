import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { getLearnerDetail } from "@/lib/data/admin";

export default async function AdminLearnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getLearnerDetail(id);
  if (!data) notFound();

  const allLessons = data.modules.flatMap((m) => m.lessons);
  const completed = allLessons.filter((l) => l.completed).length;
  const percent = allLessons.length ? Math.round((completed / allLessons.length) * 100) : 0;

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">{data.profile.fullName}</h1>
      <p className="text-muted">{data.profile.email}</p>

      {!data.enrollment ? (
        <Card className="mt-6 text-muted">Not enrolled in a course yet.</Card>
      ) : (
        <>
          <Card className="mt-6 max-w-md">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-semibold">{data.enrollment.courseTitle}</span>
              <span className="text-muted">{percent}% complete</span>
            </div>
            <ProgressBar percent={percent} />
            <p className="mt-2 text-sm text-muted">
              {completed} of {allLessons.length} lessons · enrolled{" "}
              {new Date(data.enrollment.enrolledAt).toLocaleDateString()}
            </p>
          </Card>

          <h2 className="mt-8 mb-3 font-display text-xl font-bold">Module progress</h2>
          <div className="grid gap-3">
            {data.modules.map((m, i) => {
              const moduleCompleted = m.lessons.filter((l) => l.completed).length;
              const modulePercent = m.lessons.length
                ? Math.round((moduleCompleted / m.lessons.length) * 100)
                : 0;
              return (
                <Card key={m.id} className="flex items-center justify-between gap-4">
                  <span className="font-semibold">
                    Module {i + 1}: {m.title}
                  </span>
                  <div className="flex items-center gap-2">
                    <ProgressBar percent={modulePercent} className="w-32" />
                    <span className="text-xs text-muted">
                      {moduleCompleted}/{m.lessons.length}
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <h2 className="mt-8 mb-3 font-display text-xl font-bold">Quiz attempts</h2>
      {data.quizAttempts.length === 0 ? (
        <Card className="text-muted">No quiz attempts yet.</Card>
      ) : (
        <div className="grid gap-2">
          {data.quizAttempts.map((a, i) => (
            <Card key={i} className="flex items-center justify-between">
              <span className="font-semibold">{a.quizTitle}</span>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted">
                  {a.score}/{a.totalQuestions} · {new Date(a.attemptedAt).toLocaleDateString()}
                </span>
                <Badge tone={a.passed ? "done" : "warn"}>{a.passed ? "Passed" : "Failed"}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}

      <h2 className="mt-8 mb-3 font-display text-xl font-bold">Assignments</h2>
      {data.submissions.length === 0 ? (
        <Card className="text-muted">No submissions yet.</Card>
      ) : (
        <div className="grid gap-2">
          {data.submissions.map((s, i) => (
            <Card key={i}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{s.assignmentTitle}</span>
                <Badge tone={s.status === "graded" ? "done" : "wait"}>{s.status}</Badge>
              </div>
              {s.status === "graded" && (
                <p className="mt-1 text-sm text-muted">
                  Score: {s.score} {s.feedback && `· ${s.feedback}`}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
