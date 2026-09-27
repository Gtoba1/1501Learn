import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { QuizTaker } from "@/components/quizzes/quiz-taker";
import { getQuizForLearner } from "@/lib/data/assessment";
import { getCurrentProfile } from "@/lib/data/profile";

export default async function QuizPage({
  params,
}: {
  params: Promise<{ slug: string; quizId: string }>;
}) {
  const { slug, quizId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const data = await getQuizForLearner(quizId, profile.id);
  if (!data || data.course.slug !== slug) notFound();

  const attemptsUsed = data.attempts.length;
  const attemptsExhausted = data.quiz.maxAttempts !== null && attemptsUsed >= data.quiz.maxAttempts;

  return (
    <div className="max-w-2xl">
      <Link href={`/courses/${slug}`} className="text-sm font-semibold text-muted underline">
        ← {data.course.title}
      </Link>
      <h1 className="mt-2 font-display text-3xl font-bold">{data.quiz.title}</h1>
      {data.quiz.description && <p className="mt-2 text-muted">{data.quiz.description}</p>}
      <p className="mt-1 text-sm text-muted">
        Pass mark: {data.quiz.passingScore}%
        {data.quiz.maxAttempts && ` · ${attemptsUsed} of ${data.quiz.maxAttempts} attempts used`}
      </p>

      {data.attempts.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {data.attempts.map((a, i) => (
            <Badge key={i} tone={a.passed ? "done" : "warn"}>
              Attempt {data.attempts.length - i}: {a.score}/{a.totalQuestions}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-6">
        {attemptsExhausted ? (
          <Card className="text-warn">You&apos;ve used all your attempts for this quiz.</Card>
        ) : (
          <QuizTaker quiz={data.quiz} questions={data.questions} />
        )}
      </div>
    </div>
  );
}
