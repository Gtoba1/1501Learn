"use client";

import { useActionState } from "react";
import { gradeSubmission, type ActionState } from "@/actions/assignments";
import { SubmitButton } from "@/components/auth/submit-button";
import { Field, Input } from "@/components/ui/input";

const initialState: ActionState = null;

export function GradeSubmissionForm({ submissionId }: { submissionId: string }) {
  const action = gradeSubmission.bind(null, submissionId);
  const [state, formAction] = useActionState(action, initialState);

  if (state?.success) {
    return <p className="text-sm font-semibold text-done">Graded.</p>;
  }

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-[120px_1fr_auto] sm:items-end">
      <Field label="Score" htmlFor={`score-${submissionId}`}>
        <Input id={`score-${submissionId}`} name="score" type="number" min={0} required />
      </Field>
      <Field label="Feedback" htmlFor={`feedback-${submissionId}`}>
        <Input id={`feedback-${submissionId}`} name="feedback" />
      </Field>
      <SubmitButton>Grade</SubmitButton>
      {state?.error && <p className="text-sm text-warn sm:col-span-3">{state.error}</p>}
    </form>
  );
}
