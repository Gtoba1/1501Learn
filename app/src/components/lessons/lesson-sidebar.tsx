import Link from "next/link";
import type { ModuleSummary } from "@/lib/data/learning";

export function LessonSidebar({
  courseSlug,
  courseTitle,
  modules,
  currentLessonSlug,
}: {
  courseSlug: string;
  courseTitle: string;
  modules: ModuleSummary[];
  currentLessonSlug: string;
}) {
  return (
    <nav className="sticky top-20 self-start" aria-label="Course curriculum">
      <Link href={`/courses/${courseSlug}`} className="text-sm font-semibold text-muted underline">
        ← {courseTitle}
      </Link>
      <div className="mt-4 grid gap-4">
        {modules.map((module, i) => (
          <div key={module.id}>
            <h3 className="mb-1.5 px-2 text-xs font-semibold tracking-wide text-muted uppercase">
              Module {i + 1}: {module.title}
            </h3>
            <ul className="grid gap-0.5 border-l-2 border-line">
              {module.lessons.map((lesson) => {
                const isCurrent = lesson.slug === currentLessonSlug;
                return (
                  <li key={lesson.id}>
                    <Link
                      href={`/courses/${courseSlug}/lessons/${lesson.slug}`}
                      aria-current={isCurrent ? "page" : undefined}
                      className="-ml-0.5 flex items-center gap-2 rounded-r-lg border-l-2 border-transparent py-1.5 pr-2 pl-3 text-sm text-ink hover:bg-ink/5 aria-[current=page]:border-brand aria-[current=page]:bg-brand/10 aria-[current=page]:font-semibold"
                    >
                      <span
                        aria-hidden
                        className={
                          lesson.completed
                            ? "h-1.5 w-1.5 shrink-0 rounded-full bg-done"
                            : lesson.skipped
                              ? "h-1.5 w-1.5 shrink-0 rounded-full bg-gold"
                              : "h-1.5 w-1.5 shrink-0 rounded-full bg-line"
                        }
                      />
                      {lesson.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
