"use client";

import { useActionState } from "react";
import { savePeerReview, type ActionState } from "@/actions/practice";
import { SubmitButton } from "@/components/auth/submit-button";

const initialState: ActionState = null;

export function PeerReviewForm({
  responseId,
  lessonPath,
  authorName,
  existingComment,
}: {
  responseId: string;
  lessonPath: string;
  authorName: string;
  existingComment?: string;
}) {
  const action = savePeerReview.bind(null, responseId, lessonPath);
  const [state, formAction] = useActionState(action, initialState);
  const fieldId = `review-${responseId}`;

  return (
    <form action={formAction} className="mt-3 grid gap-2">
      <label htmlFor={fieldId} className="text-sm font-semibold">
        {existingComment ? "Edit your feedback" : `Give ${authorName} feedback`}
      </label>
      <textarea
        id={fieldId}
        name="comment"
        rows={3}
        maxLength={4_000}
        required
        defaultValue={existingComment ?? ""}
        placeholder="One thing that works well, and one thing to improve."
        className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-focus"
      />
      {state?.error && <p className="text-sm text-warn">{state.error}</p>}
      {state?.success && <p className="text-sm text-done">{state.success}</p>}
      <SubmitButton className="w-auto justify-self-start">
        {existingComment ? "Update feedback" : "Share feedback"}
      </SubmitButton>
    </form>
  );
}
