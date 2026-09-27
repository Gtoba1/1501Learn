"use client";

import { useActionState } from "react";
import { updateAssignmentMeta, type ActionState } from "@/actions/admin-courses";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/auth/submit-button";
import type { AdminLessonDetail } from "@/lib/data/admin";

const initialState: ActionState = null;

export function AssignmentMetaForm({
  assignment,
  courseId,
  lessonId,
}: {
  assignment: NonNullable<AdminLessonDetail["assignment"]>;
  courseId: string;
  lessonId: string;
}) {
  const action = updateAssignmentMeta.bind(null, assignment.id, courseId, lessonId);
  const [state, formAction] = useActionState(action, initialState);

  return (
    <Card>
      <h3 className="mb-3 font-semibold">Assignment</h3>
      <form action={formAction} className="grid gap-1">
        <Field label="Title" htmlFor="asg-title">
          <Input id="asg-title" name="title" defaultValue={assignment.title} required />
        </Field>
        <Field label="Description" htmlFor="asg-description">
          <Input id="asg-description" name="description" defaultValue={assignment.description ?? ""} />
        </Field>
        <Field label="Instructions (markdown)" htmlFor="instructions">
          <textarea
            id="instructions"
            name="instructions"
            defaultValue={assignment.instructions ?? ""}
            rows={10}
            className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 font-mono text-sm text-ink focus:border-focus"
          />
        </Field>
        <Field label="Deadline" htmlFor="deadline">
          <Input
            id="deadline"
            name="deadline"
            type="date"
            defaultValue={assignment.deadline ? assignment.deadline.slice(0, 10) : ""}
          />
        </Field>
        <Field label="Max score" htmlFor="maxScore">
          <Input id="maxScore" name="maxScore" type="number" min={0} defaultValue={assignment.maxScore} required />
        </Field>
        <div className="flex items-center gap-2">
          <SubmitButton className="w-auto">Save assignment</SubmitButton>
          {state?.success && <span className="text-xs font-semibold text-done">Saved</span>}
          {state?.error && <span className="text-xs text-warn">{state.error}</span>}
        </div>
      </form>
    </Card>
  );
}
