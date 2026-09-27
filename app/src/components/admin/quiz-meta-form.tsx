"use client";

import { useActionState } from "react";
import { updateQuizMeta, type ActionState } from "@/actions/admin-courses";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/auth/submit-button";
import type { AdminLessonDetail } from "@/lib/data/admin";

const initialState: ActionState = null;

export function QuizMetaForm({
  quiz,
  courseId,
  lessonId,
}: {
  quiz: NonNullable<AdminLessonDetail["quiz"]>;
  courseId: string;
  lessonId: string;
}) {
  const action = updateQuizMeta.bind(null, quiz.id, courseId, lessonId);
  const [state, formAction] = useActionState(action, initialState);

  return (
    <Card>
      <h3 className="mb-3 font-semibold">Quiz</h3>
      <form action={formAction} className="grid gap-1">
        <Field label="Title" htmlFor="quiz-title">
          <Input id="quiz-title" name="title" defaultValue={quiz.title} required />
        </Field>
        <Field label="Description" htmlFor="quiz-description">
          <Input id="quiz-description" name="description" defaultValue={quiz.description ?? ""} />
        </Field>
        <Field label="Passing score (%)" htmlFor="passingScore">
          <Input
            id="passingScore"
            name="passingScore"
            type="number"
            min={0}
            max={100}
            defaultValue={quiz.passingScore}
            required
          />
        </Field>
        <Field label="Max attempts" htmlFor="maxAttempts" hint="Leave blank for unlimited.">
          <Input
            id="maxAttempts"
            name="maxAttempts"
            type="number"
            min={1}
            defaultValue={quiz.maxAttempts ?? ""}
          />
        </Field>
        <div className="flex items-center gap-2">
          <SubmitButton className="w-auto">Save quiz</SubmitButton>
          {state?.success && <span className="text-xs font-semibold text-done">Saved</span>}
          {state?.error && <span className="text-xs text-warn">{state.error}</span>}
        </div>
      </form>
    </Card>
  );
}
