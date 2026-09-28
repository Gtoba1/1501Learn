"use client";

import { useActionState } from "react";
import { createAssignment, createQuiz, deleteAssignment, type ActionState } from "@/actions/admin-content";
import { SubmitButton } from "@/components/auth/submit-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const initialState: ActionState = null;

export function CreateAssessmentButtons({
  lessonId,
  courseId,
  hasQuiz,
  hasAssignment,
}: {
  lessonId: string;
  courseId: string;
  hasQuiz: boolean;
  hasAssignment: boolean;
}) {
  const [quizState, quizAction] = useActionState(createQuiz.bind(null, lessonId, courseId), initialState);
  const [projectState, projectAction] = useActionState(
    createAssignment.bind(null, lessonId, courseId),
    initialState,
  );
  if (hasQuiz && hasAssignment) return null;

  return (
    <Card>
      <h3 className="font-semibold">Module quiz and project</h3>
      <p className="mt-1 mb-3 text-sm text-muted">
        Add these to the last lesson of a module. They then appear at the end of the module for
        learners.
      </p>
      <div className="flex flex-wrap gap-2">
        {!hasQuiz && (
          <form action={quizAction}>
            <SubmitButton className="w-auto">+ Add a quiz</SubmitButton>
          </form>
        )}
        {!hasAssignment && (
          <form action={projectAction}>
            <SubmitButton className="w-auto">+ Add a project</SubmitButton>
          </form>
        )}
      </div>
      {[quizState, projectState].map(
        (s, i) => s?.error && <p key={i} className="mt-2 text-xs text-warn">{s.error}</p>,
      )}
    </Card>
  );
}

export function DeleteAssignmentButton({
  assignmentId,
  lessonId,
  courseId,
}: {
  assignmentId: string;
  lessonId: string;
  courseId: string;
}) {
  return (
    <form
      action={deleteAssignment.bind(null, assignmentId, lessonId, courseId)}
      onSubmit={(e) => {
        if (!window.confirm("Delete this project, including learners' submissions? This can't be undone.")) {
          e.preventDefault();
        }
      }}
    >
      <Button variant="danger" type="submit" className="px-2 py-0.5 text-xs">
        Delete project
      </Button>
    </form>
  );
}
