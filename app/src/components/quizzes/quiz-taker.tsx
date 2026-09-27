"use client";

import { useActionState } from "react";
import { submitQuizAttempt, type QuizActionState, type QuizResult } from "@/actions/quiz";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/auth/submit-button";
import type { QuizForLearner } from "@/lib/data/assessment";

const initialState: QuizActionState = null;

export function QuizTaker({
  quiz,
  questions,
}: {
  quiz: QuizForLearner["quiz"];
  questions: QuizForLearner["questions"];
}) {
  const action = submitQuizAttempt.bind(null, quiz.id);
  const [state, formAction] = useActionState(action, initialState);

  if (state?.result) {
    return <QuizResultView result={state.result} />;
  }

  return (
    <form action={formAction} className="grid gap-5">
      {questions.map((q, i) => (
        <fieldset key={q.id} className="rounded-xl border border-line bg-surface p-5">
          <legend className="mb-3 px-1 font-semibold">
            {i + 1}. {q.question}
          </legend>
          <div className="grid gap-1.5">
            {q.options.map((opt) => (
              <label
                key={opt.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-ink/5"
              >
                <input
                  type="radio"
                  name={`question-${q.id}`}
                  value={opt.id}
                  required
                  className="accent-brand"
                />
                <span>{opt.optionText}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {state?.error && <p className="text-sm text-warn">{state.error}</p>}
      <SubmitButton>Submit Quiz</SubmitButton>
    </form>
  );
}

function QuizResultView({ result }: { result: QuizResult }) {
  return (
    <div className="grid gap-4">
      <div
        className={
          result.passed
            ? "rounded-xl border border-done bg-done/10 p-5"
            : "rounded-xl border border-warn bg-warn/10 p-5"
        }
      >
        <p className="font-display text-2xl font-bold">
          {result.score} / {result.totalQuestions}
        </p>
        <p className="mt-1 font-semibold">
          {result.passed ? "Passed" : "Not yet, you can try again"} · pass mark {result.passingScore}%
        </p>
      </div>

      <div className="grid gap-3">
        {result.breakdown.map((b, i) => (
          <div
            key={b.questionId}
            className={b.correct ? "rounded-xl border border-line p-4" : "rounded-xl border border-warn p-4"}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold">
                {i + 1}. {b.question}
              </p>
              <Badge tone={b.correct ? "done" : "warn"}>{b.correct ? "Correct" : "Incorrect"}</Badge>
            </div>
            {b.explanation && <p className="mt-2 text-sm text-muted">{b.explanation}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
