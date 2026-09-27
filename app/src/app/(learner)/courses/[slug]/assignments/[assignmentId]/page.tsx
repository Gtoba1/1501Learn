import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AssignmentForm } from "@/components/assignments/assignment-form";
import { GradedFeedback, SubmissionStatusBadge } from "@/components/assignments/submission-status";
import { MarkdownContent } from "@/components/lessons/markdown-content";
import { getAssignmentForLearner } from "@/lib/data/assessment";
import { getCurrentProfile } from "@/lib/data/profile";

export default async function AssignmentPage({
  params,
}: {
  params: Promise<{ slug: string; assignmentId: string }>;
}) {
  const { slug, assignmentId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const data = await getAssignmentForLearner(assignmentId, profile.id);
  if (!data || data.course.slug !== slug) notFound();

  const { assignment, submission } = data;

  return (
    <div className="max-w-2xl">
      <Link href={`/courses/${slug}`} className="text-sm font-semibold text-muted underline">
        ← {data.course.title}
      </Link>
      <div className="mt-2 flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">{assignment.title}</h1>
        <SubmissionStatusBadge status={submission?.status ?? "not_submitted"} />
      </div>
      {assignment.description && <p className="mt-2 text-muted">{assignment.description}</p>}
      {assignment.deadline && (
        <p className="mt-1 text-sm text-muted">
          Deadline: {new Date(assignment.deadline).toLocaleDateString()}
        </p>
      )}
      <p className="mt-1 text-sm text-muted">Max score: {assignment.maxScore}</p>

      {assignment.instructions && (
        <div className="mt-5">
          <MarkdownContent content={assignment.instructions} />
        </div>
      )}

      <h2 className="mt-8 mb-3 font-display text-xl font-bold">Your submission</h2>
      {submission?.status === "graded" ? (
        <GradedFeedback submission={submission} />
      ) : (
        <AssignmentForm
          assignmentId={assignment.id}
          courseSlug={slug}
          defaultText={submission?.submissionText}
          defaultUrl={submission?.submissionUrl}
        />
      )}
    </div>
  );
}
