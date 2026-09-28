"use client";

import { useActionState, useState } from "react";
import { deleteQuestion, deleteQuiz, saveQuestion, type ActionState } from "@/actions/admin-content";
import { SubmitButton } from "@/components/auth/submit-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import type { AdminQuizQuestion } from "@/lib/data/admin";

const initialState: ActionState = null;
const OPTION_SLOTS = 4;

function QuestionForm({
  quizId,
  lessonId,
  courseId,
  question,
  onDone,
}: {
  quizId: string;
  lessonId: string;
  courseId: string;
  question?: AdminQuizQuestion;
  onDone?: () => void;
}) {
  const [formKey, setFormKey] = useState(0);
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await saveQuestion(quizId, question?.id ?? null, lessonId, courseId, prev, formData);
    if (result?.success) {
      if (question) onDone?.();
      else setFormKey((k) => k + 1);
    }
    return result;
  }, initialState);

  const prefix = question ? `q-${question.id}` : "q-new";
  const slots = Math.max(OPTION_SLOTS, question?.options.length ?? 0);
  const correctIndex = question?.options.findIndex((o) => o.isCorrect) ?? -1;

  return (
    <form key={formKey} action={formAction} className="grid gap-1">
      <Field label="Question" htmlFor={`${prefix}-question`}>
        <Input id={`${prefix}-question`} name="question" defaultValue={question?.question ?? ""} required />
      </Field>
      <fieldset className="mb-4">
        <legend className="mb-1.5 text-sm font-semibold">Options (select the correct one)</legend>
        <div className="grid gap-2">
          {Array.from({ length: slots }, (_, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name="correct"
                value={i}
                defaultChecked={i === (correctIndex === -1 ? 0 : correctIndex)}
                aria-label={`Option ${i + 1} is correct`}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              <Input
                name={`option-${i}`}
                defaultValue={question?.options[i]?.optionText ?? ""}
                placeholder={`Option ${i + 1}${i >= 2 ? " (optional)" : ""}`}
                aria-label={`Option ${i + 1}`}
              />
            </div>
          ))}
        </div>
      </fieldset>
      <Field label="Explanation" htmlFor={`${prefix}-explanation`} hint="Shown to the learner after they submit.">
        <Input id={`${prefix}-explanation`} name="explanation" defaultValue={question?.explanation ?? ""} />
      </Field>
      <div className="flex items-center gap-2">
        <SubmitButton className="w-auto">{question ? "Save question" : "Add question"}</SubmitButton>
        {question && onDone && (
          <Button variant="ghost" type="button" onClick={onDone}>
            Cancel
          </Button>
        )}
        {state?.success && <span className="text-xs font-semibold text-done">{state.success}</span>}
        {state?.error && <span className="text-xs text-warn">{state.error}</span>}
      </div>
    </form>
  );
}

function QuestionRow({
  question,
  index,
  quizId,
  lessonId,
  courseId,
}: {
  question: AdminQuizQuestion;
  index: number;
  quizId: string;
  lessonId: string;
  courseId: string;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="rounded-lg border border-brand px-3 py-3">
        <QuestionForm
          quizId={quizId}
          lessonId={lessonId}
          courseId={courseId}
          question={question}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-line px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">
            {index + 1}. {question.question}
          </p>
          <ul className="mt-1 text-sm">
            {question.options.map((o) => (
              <li key={o.id} className={o.isCorrect ? "font-semibold text-done" : "text-muted"}>
                {o.isCorrect ? "✓ " : "· "}
                {o.optionText}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" type="button" onClick={() => setEditing(true)} className="px-2 py-0.5 text-xs">
            Edit
          </Button>
          <form
            action={deleteQuestion.bind(null, question.id, lessonId, courseId)}
            onSubmit={(e) => {
              if (!window.confirm("Delete this question?")) e.preventDefault();
            }}
          >
            <Button variant="danger" type="submit" className="px-2 py-0.5 text-xs">
              Delete
            </Button>
          </form>
        </div>
      </div>
    </li>
  );
}

export function QuizQuestionEditor({
  quizId,
  lessonId,
  courseId,
  questions,
}: {
  quizId: string;
  lessonId: string;
  courseId: string;
  questions: AdminQuizQuestion[];
}) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Quiz questions</h3>
        <form
          action={deleteQuiz.bind(null, quizId, lessonId, courseId)}
          onSubmit={(e) => {
            if (!window.confirm("Delete the whole quiz, including learners' attempts? This can't be undone.")) {
              e.preventDefault();
            }
          }}
        >
          <Button variant="danger" type="submit" className="px-2 py-0.5 text-xs">
            Delete quiz
          </Button>
        </form>
      </div>
      <p className="mt-1 mb-3 text-sm text-muted">
        Aim for 3 to 5 questions. Learners must pass this quiz to complete the module.
      </p>
      {questions.length === 0 && <p className="mb-2 text-sm text-muted">No questions yet.</p>}
      <ol className="grid gap-2">
        {questions.map((q, i) => (
          <QuestionRow key={q.id} question={q} index={i} quizId={quizId} lessonId={lessonId} courseId={courseId} />
        ))}
      </ol>
      <div className="mt-4 border-t border-line pt-4">
        <h4 className="mb-2 text-sm font-semibold">Add a question</h4>
        <QuestionForm quizId={quizId} lessonId={lessonId} courseId={courseId} />
      </div>
    </Card>
  );
}
