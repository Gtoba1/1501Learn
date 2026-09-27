import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { LessonSidebar } from "@/components/lessons/lesson-sidebar";
import { MarkdownContent } from "@/components/lessons/markdown-content";
import { MarkCompleteButton } from "@/components/lessons/mark-complete-button";
import { VideoEmbed } from "@/components/lessons/video-embed";
import { recordLessonView } from "@/actions/progress";
import { getLessonDetail } from "@/lib/data/learning";
import { getCurrentProfile } from "@/lib/data/profile";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ slug: string; lessonSlug: string }>;
}) {
  const { slug, lessonSlug } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const detail = await getLessonDetail(slug, lessonSlug, profile.id);
  if (!detail) notFound();

  await recordLessonView(detail.lesson.id);

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-[260px_1fr]">
      <LessonSidebar
        courseSlug={detail.course.slug}
        courseTitle={detail.course.title}
        modules={detail.modules}
        currentLessonSlug={detail.lesson.slug}
      />

      <div className="min-w-0 max-w-3xl">
        <p className="text-sm font-semibold text-muted">{detail.module.title}</p>
        <h1 className="mt-1 font-display text-3xl font-bold">{detail.lesson.title}</h1>
        {detail.lesson.durationMinutes && (
          <p className="mt-1 text-sm text-muted">{detail.lesson.durationMinutes} min</p>
        )}

        {detail.lesson.videoUrl && (
          <div className="mt-5">
            <VideoEmbed url={detail.lesson.videoUrl} title={detail.lesson.title} />
          </div>
        )}

        {detail.lesson.content && (
          <div className="mt-5">
            <MarkdownContent content={detail.lesson.content} />
          </div>
        )}

        {(detail.quiz || detail.assignment) && (
          <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-5">
            {detail.quiz && (
              <Link href={`/courses/${detail.course.slug}/quizzes/${detail.quiz.id}`}>
                <Badge tone="wait">Checkpoint: {detail.quiz.title}</Badge>
              </Link>
            )}
            {detail.assignment && (
              <Link href={`/courses/${detail.course.slug}/assignments/${detail.assignment.id}`}>
                <Badge tone="wait">Project: {detail.assignment.title}</Badge>
              </Link>
            )}
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
          <div className="text-sm">
            {detail.prev ? (
              <Link
                href={`/courses/${detail.course.slug}/lessons/${detail.prev.slug}`}
                className="font-semibold text-muted hover:text-ink"
              >
                ← {detail.prev.title}
              </Link>
            ) : (
              <span />
            )}
          </div>

          <MarkCompleteButton
            lessonId={detail.lesson.id}
            courseSlug={detail.course.slug}
            lessonSlug={detail.lesson.slug}
            completed={detail.lesson.completed}
          />

          <div className="text-sm">
            {detail.next && (
              <Link
                href={`/courses/${detail.course.slug}/lessons/${detail.next.slug}`}
                className="font-semibold text-muted hover:text-ink"
              >
                {detail.next.title} →
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
