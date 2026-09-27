"use client";

import { useActionState } from "react";
import { submitAssignment, type ActionState } from "@/actions/assignments";
import { SubmitButton } from "@/components/auth/submit-button";
import { Field, Input } from "@/components/ui/input";

const initialState: ActionState = null;

export function AssignmentForm({
  assignmentId,
  courseSlug,
  defaultText,
  defaultUrl,
}: {
  assignmentId: string;
  courseSlug: string;
  defaultText?: string | null;
  defaultUrl?: string | null;
}) {
  const action = submitAssignment.bind(null, assignmentId, courseSlug);
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="grid gap-1">
      <Field label="GitHub URL or link" htmlFor="submissionUrl" hint="Optional if you're submitting a text response.">
        <Input
          id="submissionUrl"
          name="submissionUrl"
          type="url"
          placeholder="https://github.com/you/project"
          defaultValue={defaultUrl ?? ""}
        />
      </Field>
      <Field label="Text response" htmlFor="submissionText" hint="Optional if you're submitting a link.">
        <textarea
          id="submissionText"
          name="submissionText"
          rows={6}
          defaultValue={defaultText ?? ""}
          className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-focus"
        />
      </Field>
      {state?.error && <p className="mb-3 text-sm text-warn">{state.error}</p>}
      {state?.success && <p className="mb-3 text-sm text-done">{state.success}</p>}
      <SubmitButton>Submit assignment</SubmitButton>
    </form>
  );
}
