import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { CourseProgressSummary } from "@/lib/data/learning";

export function ProgressSummary({ summary }: { summary: CourseProgressSummary }) {
  return (
    <Card>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-display text-lg font-bold">{summary.courseTitle}</h2>
        <span className="text-sm font-semibold text-muted">{summary.percent}% complete</span>
      </div>
      <ProgressBar percent={summary.percent} />
      <p className="mt-2 text-sm text-muted">
        {summary.modulesComplete} of {summary.modulesTotal} modules completed ·{" "}
        {summary.completedLessons} of {summary.totalLessons} lessons
        {summary.skippedLessons > 0 && ` · ${summary.skippedLessons} skipped`}
      </p>
      <p className="mt-1 text-xs text-muted">
        A module is complete when every lesson is done and its quiz is passed. Optional modules
        don&apos;t count towards your progress.
      </p>
    </Card>
  );
}
