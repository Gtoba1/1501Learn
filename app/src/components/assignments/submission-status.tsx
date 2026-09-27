import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { AssignmentForLearner } from "@/lib/data/assessment";
import { safeHttpUrl } from "@/lib/security/urls";

const STATUS_TONE = {
  not_submitted: "neutral",
  submitted: "wait",
  under_review: "wait",
  graded: "done",
} as const;

const STATUS_LABEL = {
  not_submitted: "Not submitted",
  submitted: "Submitted",
  under_review: "Under review",
  graded: "Graded",
} as const;

// Learner-supplied link: only rendered as an href if it's plain http(s), and
// opened without handing the target page a reference back to this one.
export function SubmissionLink({ url }: { url: string }) {
  const safe = safeHttpUrl(url);
  if (!safe) return <span className="text-muted">{url}</span>;
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer nofollow" className="text-brand underline">
      {url}
    </a>
  );
}

export function SubmissionStatusBadge({ status }: { status: string }) {
  const key = (status in STATUS_TONE ? status : "not_submitted") as keyof typeof STATUS_TONE;
  return <Badge tone={STATUS_TONE[key]}>{STATUS_LABEL[key]}</Badge>;
}

export function GradedFeedback({ submission }: { submission: NonNullable<AssignmentForLearner["submission"]> }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Your submission</h3>
        <SubmissionStatusBadge status={submission.status} />
      </div>
      {submission.submissionUrl && (
        <p className="mt-3 break-all text-sm">
          <SubmissionLink url={submission.submissionUrl} />
        </p>
      )}
      {submission.submissionText && (
        <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{submission.submissionText}</p>
      )}
      <div className="mt-4 border-t border-line pt-4">
        <p className="font-display text-2xl font-bold">{submission.score} points</p>
        {submission.feedback && <p className="mt-2 text-sm text-muted">{submission.feedback}</p>}
        {submission.gradedAt && (
          <p className="mt-2 text-xs text-muted">
            Graded {new Date(submission.gradedAt).toLocaleDateString()}
          </p>
        )}
      </div>
    </Card>
  );
}
