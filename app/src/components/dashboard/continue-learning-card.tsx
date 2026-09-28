import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import type { CourseProgressSummary } from "@/lib/data/learning";

export function ContinueLearningCard({ summary }: { summary: CourseProgressSummary }) {
  const { next } = summary;
  if (!next) {
    return (
      <Card className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold">All caught up</h3>
          <p className="text-sm text-muted">
            You&apos;ve completed every module in {summary.courseTitle}.
          </p>
        </div>
      </Card>
    );
  }

  const href =
    next.kind === "lesson"
      ? `/courses/${summary.courseSlug}/lessons/${next.slug}`
      : `/courses/${summary.courseSlug}/quizzes/${next.quizId}`;

  return (
    <Card className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-sm text-muted">
          {next.kind === "lesson" ? "Continue learning" : "Pass the quiz to finish the module"} ·{" "}
          {next.moduleTitle}
        </p>
        <h3 className="font-display text-lg font-bold">{next.title}</h3>
      </div>
      <LinkButton href={href}>{next.kind === "lesson" ? "Continue learning" : "Take the quiz"}</LinkButton>
    </Card>
  );
}
