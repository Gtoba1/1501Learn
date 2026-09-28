import Link from "next/link";
import { notFound } from "next/navigation";
import { AssignmentMetaForm } from "@/components/admin/assignment-meta-form";
import { CreateAssessmentButtons, DeleteAssignmentButton } from "@/components/admin/create-assessment-buttons";
import { LessonEditForm } from "@/components/admin/lesson-edit-form";
import { QuizMetaForm } from "@/components/admin/quiz-meta-form";
import { QuizQuestionEditor } from "@/components/admin/quiz-question-editor";
import { ResourceManager } from "@/components/admin/resource-manager";
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
    <div className="max-w-4xl">
      <Link href={`/admin/courses/${id}`} className="text-sm font-semibold text-muted underline">
        ← {data.course.title}
      </Link>
      <h1 className="mt-2 mb-6 font-display text-3xl font-bold">{data.lesson.title}</h1>

      <div className="grid gap-6">
        <LessonEditForm lessonId={lessonId} courseId={id} lesson={data.lesson} />
        <ResourceManager lessonId={lessonId} courseId={id} resources={data.resources} />
        <CreateAssessmentButtons
          lessonId={lessonId}
          courseId={id}
          hasQuiz={Boolean(data.quiz)}
          hasAssignment={Boolean(data.assignment)}
        />
        {data.quiz && (
          <>
            <QuizMetaForm quiz={data.quiz} courseId={id} lessonId={lessonId} />
            <QuizQuestionEditor quizId={data.quiz.id} lessonId={lessonId} courseId={id} questions={data.questions} />
          </>
        )}
        {data.assignment && (
          <div className="grid gap-2">
            <AssignmentMetaForm assignment={data.assignment} courseId={id} lessonId={lessonId} />
            <div className="justify-self-end">
              <DeleteAssignmentButton assignmentId={data.assignment.id} lessonId={lessonId} courseId={id} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
