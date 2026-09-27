"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { enrollLearner, type ActionState } from "@/actions/admin-learners";
import { Button } from "@/components/ui/button";

const initialState: ActionState = null;

function EnrollSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" disabled={pending} className="px-3 py-1 text-xs">
      {pending ? "Enrolling…" : "Enroll"}
    </Button>
  );
}

export function EnrollButton({ userId, courseId }: { userId: string; courseId: string }) {
  const action = enrollLearner.bind(null, userId, courseId);
  const [state, formAction] = useActionState(action, initialState);

  if (state?.success) return <span className="text-xs font-semibold text-done">Enrolled</span>;

  return (
    <form action={formAction}>
      <EnrollSubmit />
      {state?.error && <p className="mt-1 text-xs text-warn">{state.error}</p>}
    </form>
  );
}
