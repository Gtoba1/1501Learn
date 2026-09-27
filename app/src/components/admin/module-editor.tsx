"use client";

import { useActionState } from "react";
import { deleteModule, reorderModule, updateModule, type ActionState } from "@/actions/admin-courses";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/auth/submit-button";
import { useToastAction } from "@/hooks/use-toast-action";

const initialState: ActionState = null;

export function ModuleEditor({
  moduleId,
  courseId,
  title,
  description,
  isOptional,
  isFirst,
  isLast,
  children,
}: {
  moduleId: string;
  courseId: string;
  title: string;
  description: string | null;
  isOptional: boolean;
  isFirst: boolean;
  isLast: boolean;
  children: React.ReactNode;
}) {
  const updateAction = updateModule.bind(null, moduleId, courseId);
  const [state, formAction] = useActionState(updateAction, initialState);

  const deleteAction = deleteModule.bind(null, moduleId, courseId);
  const [, deleteFormAction] = useToastAction(deleteAction, initialState);

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <form action={formAction} className="grid flex-1 gap-2 sm:grid-cols-2 sm:items-end">
          <Field label="Module title" htmlFor={`mod-title-${moduleId}`}>
            <Input id={`mod-title-${moduleId}`} name="title" defaultValue={title} required />
          </Field>
          <Field label="Description" htmlFor={`mod-desc-${moduleId}`}>
            <Input id={`mod-desc-${moduleId}`} name="description" defaultValue={description ?? ""} />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              name="isOptional"
              defaultChecked={isOptional}
              className="accent-brand"
            />
            Optional module (shown as an addendum, doesn&apos;t block progression)
          </label>
          <div className="flex items-center gap-2 sm:col-span-2">
            <SubmitButton className="w-auto">Save</SubmitButton>
            {state?.success && <span className="text-xs font-semibold text-done">Saved</span>}
            {state?.error && <span className="text-xs text-warn">{state.error}</span>}
          </div>
        </form>
        <div className="flex shrink-0 flex-col gap-1">
          <form action={reorderModule.bind(null, moduleId, courseId, "up")}>
            <Button
              variant="ghost"
              type="submit"
              disabled={isFirst}
              aria-label={`Move ${title} up`}
              className="w-auto px-2 py-1 text-xs"
            >
              ↑
            </Button>
          </form>
          <form action={reorderModule.bind(null, moduleId, courseId, "down")}>
            <Button
              variant="ghost"
              type="submit"
              disabled={isLast}
              aria-label={`Move ${title} down`}
              className="w-auto px-2 py-1 text-xs"
            >
              ↓
            </Button>
          </form>
          <form
            action={deleteFormAction}
            onSubmit={(e) => {
              if (!window.confirm(`Delete "${title}"? This can't be undone.`)) e.preventDefault();
            }}
          >
            <Button
              variant="danger"
              type="submit"
              aria-label={`Delete ${title}`}
              className="w-auto px-2 py-1 text-xs"
            >
              Delete
            </Button>
          </form>
        </div>
      </div>
      <div className="mt-4 border-t border-line pt-4">{children}</div>
    </div>
  );
}
