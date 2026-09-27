"use client";

import { useActionState } from "react";
import { updateCourse, type ActionState } from "@/actions/admin-courses";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/auth/submit-button";

const initialState: ActionState = null;

export function CourseEditForm({
  courseId,
  title,
  description,
  status,
}: {
  courseId: string;
  title: string;
  description: string | null;
  status: "draft" | "published";
}) {
  const action = updateCourse.bind(null, courseId);
  const [state, formAction] = useActionState(action, initialState);

  return (
    <Card>
      <form action={formAction} className="grid gap-1">
        <Field label="Title" htmlFor="title">
          <Input id="title" name="title" defaultValue={title} required />
        </Field>
        <Field label="Description" htmlFor="description">
          <textarea
            id="description"
            name="description"
            defaultValue={description ?? ""}
            rows={3}
            className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-focus"
          />
        </Field>
        <Field label="Status" htmlFor="status">
          <select
            id="status"
            name="status"
            defaultValue={status}
            className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-focus"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </Field>
        <div className="flex items-center gap-2">
          <SubmitButton className="w-auto">Save course</SubmitButton>
          {state?.success && <span className="text-xs font-semibold text-done">Saved</span>}
          {state?.error && <span className="text-xs text-warn">{state.error}</span>}
        </div>
      </form>
    </Card>
  );
}
