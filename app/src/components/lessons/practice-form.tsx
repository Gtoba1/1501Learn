"use client";

import { useActionState } from "react";
import { savePracticeResponse, type ActionState } from "@/actions/practice";
import { SubmitButton } from "@/components/auth/submit-button";
import { Field, Input } from "@/components/ui/input";
import type { PracticeResponse } from "@/lib/data/learning";

const initialState: ActionState = null;

export function PracticeForm({
  lessonId,
  lessonPath,
  existing,
}: {
  lessonId: string;
  lessonPath: string;
  existing: PracticeResponse | null;
}) {
  const action = savePracticeResponse.bind(null, lessonId, lessonPath);
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="grid gap-1">
      <Field label="Your answer" htmlFor="responseText" hint="Optional if you add a link instead.">
        <textarea
          id="responseText"
          name="responseText"
          rows={6}
          maxLength={10_000}
          defaultValue={existing?.responseText ?? ""}
          className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-focus"
        />
      </Field>
      <Field
        label="Link"
        htmlFor="responseUrl"
        hint="A GitHub file, pull request, Google Doc or image. Optional if you write your answer above."
      >
        <Input
          id="responseUrl"
          name="responseUrl"
          type="url"
          placeholder="https://github.com/you/shoplink-analytics/pull/1"
          defaultValue={existing?.responseUrl ?? ""}
        />
      </Field>
      <label className="mb-4 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="shareWithPeers"
          defaultChecked={existing?.shareWithPeers ?? true}
          className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
        />
        <span>
          Share with other learners for peer review. They see your first name and your answer, and
          you can review theirs.
        </span>
      </label>
      {state?.error && <p className="mb-3 text-sm text-warn">{state.error}</p>}
      {state?.success && <p className="mb-3 text-sm text-done">{state.success}</p>}
      <SubmitButton className="w-auto justify-self-start">
        {existing ? "Update my answer" : "Save my answer"}
      </SubmitButton>
    </form>
  );
}
