"use client";

import { useFormStatus } from "react-dom";
import { markLessonComplete } from "@/actions/progress";
import { Button } from "@/components/ui/button";

function SubmitState({ completed }: { completed: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={completed ? "ghost" : "primary"} disabled={pending || completed}>
      {completed ? "✓ Completed" : pending ? "Saving…" : "Mark as Complete"}
    </Button>
  );
}

export function MarkCompleteButton({
  lessonId,
  courseSlug,
  lessonSlug,
  completed,
}: {
  lessonId: string;
  courseSlug: string;
  lessonSlug: string;
  completed: boolean;
}) {
  return (
    <form action={markLessonComplete.bind(null, lessonId, courseSlug, lessonSlug)}>
      <SubmitState completed={completed} />
    </form>
  );
}
