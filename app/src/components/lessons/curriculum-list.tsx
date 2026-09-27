import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SkipModuleButton } from "@/components/lessons/skip-module-button";
import type { ModuleSummary } from "@/lib/data/learning";

function LessonStatusIcon({ completed, skipped }: { completed: boolean; skipped: boolean }) {
  if (completed) {
    return (
      <span
        aria-hidden
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-done text-xs font-bold text-white"
      >
        ✓
      </span>
    );
  }
  if (skipped) {
    return (
      <span
        aria-hidden
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-gold text-[10px] font-bold text-gold"
      >
        -
      </span>
    );
  }
  return <span aria-hidden className="h-5 w-5 shrink-0 rounded-full border-2 border-line" />;
}

export function CurriculumList({
  courseSlug,
  modules,
  currentLessonSlug,
}: {
  courseSlug: string;
  modules: ModuleSummary[];
  currentLessonSlug?: string;
}) {
  return (
    <div className="grid gap-4">
      {modules.map((module, i) => {
        const lastLesson = module.lessons[module.lessons.length - 1];
        return (
          <Card key={module.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg font-bold">
                Module {i + 1}: {module.title}
              </h3>
              {module.isOptional && <Badge tone="neutral">Optional · Addendum</Badge>}
            </div>

            <div className="mt-3 mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-ink/5 px-3 py-2 text-sm">
              <span className="text-muted">Already know this?</span>
              {lastLesson?.quizId && (
                <Link href={`/courses/${courseSlug}/quizzes/${lastLesson.quizId}`}>
                  <Badge tone="wait">Take the quick quiz</Badge>
                </Link>
              )}
              <SkipModuleButton moduleId={module.id} courseSlug={courseSlug} moduleTitle={module.title} />
            </div>

            <ul className="grid gap-1.5">
              {module.lessons.map((lesson) => (
                <li key={lesson.id}>
                  <Link
                    href={`/courses/${courseSlug}/lessons/${lesson.slug}`}
                    aria-current={lesson.slug === currentLessonSlug ? "page" : undefined}
                    className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-ink/5 aria-[current=page]:bg-brand/10 aria-[current=page]:font-semibold"
                  >
                    <LessonStatusIcon completed={lesson.completed} skipped={lesson.skipped} />
                    <span className="flex-1">{lesson.title}</span>
                    {lesson.skipped && !lesson.completed && (
                      <span className="text-xs text-gold">Skipped</span>
                    )}
                    {lesson.durationMinutes && (
                      <span className="text-xs text-muted">{lesson.durationMinutes} min</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
            {(lastLesson?.quizId || lastLesson?.assignmentId) && (
              <div className="mt-3 flex gap-2 border-t border-line pt-3">
                {lastLesson.quizId && (
                  <Link href={`/courses/${courseSlug}/quizzes/${lastLesson.quizId}`}>
                    <Badge tone="wait">Module checkpoint</Badge>
                  </Link>
                )}
                {lastLesson.assignmentId && (
                  <Link href={`/courses/${courseSlug}/assignments/${lastLesson.assignmentId}`}>
                    <Badge tone="wait">Project</Badge>
                  </Link>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
