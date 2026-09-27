"use client";

import { useActionState } from "react";
import { updateFullName, type ActionState } from "@/actions/profile";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/auth/submit-button";

const initialState: ActionState = null;

export function EditNameForm({ fullName }: { fullName: string }) {
  const [state, formAction] = useActionState(updateFullName, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="min-w-[220px] flex-1">
        <Field label="Full name" htmlFor="fullName">
          <Input id="fullName" name="fullName" defaultValue={fullName} required />
        </Field>
      </div>
      <SubmitButton className="w-auto">Save</SubmitButton>
      {state?.success && <span className="text-xs font-semibold text-done">Saved</span>}
      {state?.error && <span className="text-xs text-warn">{state.error}</span>}
    </form>
  );
}
