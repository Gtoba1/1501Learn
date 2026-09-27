"use client";

import { useActionState } from "react";
import { createModule, type ActionState } from "@/actions/admin-courses";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/auth/submit-button";

const initialState: ActionState = null;

export function NewModuleForm({ courseId }: { courseId: string }) {
  const action = createModule.bind(null, courseId);
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex gap-2">
      <Input name="title" placeholder="New module title" required />
      <SubmitButton className="w-auto shrink-0">Add module</SubmitButton>
      {state?.error && <span className="self-center text-xs text-warn">{state.error}</span>}
    </form>
  );
}
