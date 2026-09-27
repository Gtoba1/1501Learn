"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  createLesson,
  deleteLesson,
  reorderLesson,
  type ActionState,
} from "@/actions/admin-courses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/auth/submit-button";
import { useToastAction } from "@/hooks/use-toast-action";

const initialState: ActionState = null;

function LessonRow({
  lesson,
  moduleId,
  courseId,
  isFirst,
  isLast,
}: {
  lesson: { id: string; title: string };
  moduleId: string;
  courseId: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const deleteAction = deleteLesson.bind(null, lesson.id, courseId);
  const [, deleteFormAction] = useToastAction(deleteAction, initialState);

  return (
    <li className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-ink/5">
      <Link
        href={`/admin/courses/${courseId}/lessons/${lesson.id}`}
        className="text-sm font-medium text-brand underline"
      >
        {lesson.title}
      </Link>
      <div className="flex shrink-0 items-center gap-1">
        <form action={reorderLesson.bind(null, lesson.id, moduleId, courseId, "up")}>
          <Button
            variant="ghost"
            type="submit"
            disabled={isFirst}
            aria-label={`Move ${lesson.title} up`}
            className="w-auto px-2 py-0.5 text-xs"
          >
            ↑
          </Button>
        </form>
        <form action={reorderLesson.bind(null, lesson.id, moduleId, courseId, "down")}>
          <Button
            variant="ghost"
            type="submit"
            disabled={isLast}
            aria-label={`Move ${lesson.title} down`}
            className="w-auto px-2 py-0.5 text-xs"
          >
            ↓
          </Button>
        </form>
        <form
          action={deleteFormAction}
          onSubmit={(e) => {
            if (!window.confirm(`Delete "${lesson.title}"? This can't be undone.`)) e.preventDefault();
          }}
        >
          <Button
            variant="danger"
            type="submit"
            aria-label={`Delete ${lesson.title}`}
            className="w-auto px-2 py-0.5 text-xs"
          >
            Delete
          </Button>
        </form>
      </div>
    </li>
  );
}

export function LessonList({
  moduleId,
  courseId,
  lessons,
}: {
  moduleId: string;
  courseId: string;
  lessons: { id: string; title: string }[];
}) {
  const createAction = createLesson.bind(null, moduleId, courseId);
  const [state, formAction] = useActionState(createAction, initialState);

  return (
    <div>
      {lessons.length === 0 && <p className="mb-2 text-sm text-muted">No lessons yet.</p>}
      <ul className="grid gap-1">
        {lessons.map((lesson, i) => (
          <LessonRow
            key={lesson.id}
            lesson={lesson}
            moduleId={moduleId}
            courseId={courseId}
            isFirst={i === 0}
            isLast={i === lessons.length - 1}
          />
        ))}
      </ul>
      <form action={formAction} className="mt-3 flex gap-2">
        <Input name="title" placeholder="New lesson title" required />
        <SubmitButton className="w-auto shrink-0">Add</SubmitButton>
      </form>
      {state?.error && <p className="mt-1 text-xs text-warn">{state.error}</p>}
    </div>
  );
}
