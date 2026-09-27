import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { GradeSubmissionForm } from "@/components/admin/grade-submission-form";
import { SubmissionLink } from "@/components/assignments/submission-status";
import { getPendingSubmissions } from "@/lib/data/assessment";

export default async function AdminSubmissionsPage() {
  const submissions = await getPendingSubmissions();

  return (
    <div>
      <h1 className="mb-6 font-display text-3xl font-bold">Submissions to review</h1>

      {submissions.length === 0 ? (
        <Card className="text-muted">Nothing pending. Every submission has been graded.</Card>
      ) : (
        <div className="grid gap-4">
          {submissions.map((s) => (
            <Card key={s.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{s.assignmentTitle}</h2>
                  <p className="text-sm text-muted">
                    {s.learnerName} · {s.learnerEmail}
                  </p>
                </div>
                <Badge tone="wait">{s.status === "under_review" ? "Under review" : "Submitted"}</Badge>
              </div>

              {s.submissionUrl && (
                <p className="mt-3 break-all text-sm">
                  <SubmissionLink url={s.submissionUrl} />
                </p>
              )}
              {s.submissionText && (
                <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{s.submissionText}</p>
              )}

              <div className="mt-4 border-t border-line pt-4">
                <GradeSubmissionForm submissionId={s.id} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
