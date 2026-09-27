import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import type { CourseProgressSummary } from "@/lib/data/learning";

export function ContinueLearningCard({ summary }: { summary: CourseProgressSummary }) {
  if (!summary.continueLesson) {
    return (
      <Card className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold">All caught up</h3>
          <p className="text-sm text-muted">You&apos;ve completed every lesson in {summary.courseTitle}.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-sm text-muted">Continue learning</p>
        <h3 className="font-display text-lg font-bold">{summary.continueLesson.title}</h3>
      </div>
      <LinkButton href={`/courses/${summary.courseSlug}/lessons/${summary.continueLesson.slug}`}>
        Continue Learning
      </LinkButton>
    </Card>
  );
}
