import Link from "next/link";
import { notFound } from "next/navigation";
import { AssignmentMetaForm } from "@/components/admin/assignment-meta-form";
import { LessonEditForm } from "@/components/admin/lesson-edit-form";
import { QuizMetaForm } from "@/components/admin/quiz-meta-form";
import { getLessonForAdmin } from "@/lib/data/admin";

export default async function AdminLessonEditPage({
  params,
}: {
  params: Promise<{ id: string; lessonId: string }>;
}) {
  const { id, lessonId } = await params;
  const data = await getLessonForAdmin(lessonId);
  if (!data) notFound();

  return (
    <div className="max-w-2xl">
      <Link href={`/admin/courses/${id}`} className="text-sm font-semibold text-muted underline">
        ← {data.course.title}
      </Link>
      <h1 className="mt-2 mb-6 font-display text-3xl font-bold">{data.lesson.title}</h1>

      <div className="grid gap-6">
        <LessonEditForm lessonId={lessonId} courseId={id} lesson={data.lesson} />
        {data.quiz && <QuizMetaForm quiz={data.quiz} courseId={id} lessonId={lessonId} />}
        {data.assignment && (
          <AssignmentMetaForm assignment={data.assignment} courseId={id} lessonId={lessonId} />
        )}
      </div>
    </div>
  );
}
