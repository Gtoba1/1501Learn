import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { CourseProgressSummary } from "@/lib/data/learning";

function statusFor(m: CourseProgressSummary["modules"][number]) {
  if (m.completed === 0) return { label: "Not started", tone: "neutral" as const };
  if (m.completed === m.total) return { label: "Completed", tone: "done" as const };
  return { label: "In progress", tone: "wait" as const };
}

export function ModuleProgressList({ summary }: { summary: CourseProgressSummary }) {
  return (
    <div className="grid gap-3">
      {summary.modules.map((m, i) => {
        const status = statusFor(m);
        return (
          <Link
            key={m.id}
            href={`/courses/${summary.courseSlug}`}
            className="rounded-xl border border-line bg-surface p-4 hover:border-brand"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">
                Module {i + 1}: {m.title}
              </span>
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <ProgressBar percent={m.percent} className="flex-1" />
              <span className="text-xs text-muted">
                {m.completed}/{m.total}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
