"use client";

import { useActionState, useState } from "react";
import { updateLesson, type ActionState } from "@/actions/admin-courses";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/auth/submit-button";
import { MarkdownContent } from "@/components/lessons/markdown-content";
import type { AdminLessonDetail } from "@/lib/data/admin";

const initialState: ActionState = null;

const CONTENT_TEMPLATE = `Write a short intro paragraph here: what this lesson covers and why it matters.

## Key ideas
- First important point
- Second important point
- Third important point

## Example
\`\`\`
paste a code sample or command here, if useful
\`\`\`

## Try it
A short hands-on step or two the learner can actually do.`;

export function LessonEditForm({
  lessonId,
  courseId,
  lesson,
}: {
  lessonId: string;
  courseId: string;
  lesson: AdminLessonDetail["lesson"];
}) {
  const action = updateLesson.bind(null, lessonId, courseId);
  const [state, formAction] = useActionState(action, initialState);
  const [content, setContent] = useState(lesson.content ?? "");

  return (
    <Card>
      <form action={formAction} className="grid gap-1">
        <Field label="Title" htmlFor="title">
          <Input id="title" name="title" defaultValue={lesson.title} required />
        </Field>
        <Field label="Slug" htmlFor="slug" hint="Used in the lesson URL.">
          <Input id="slug" name="slug" defaultValue={lesson.slug} />
        </Field>
        <Field label="Short description" htmlFor="description">
          <Input id="description" name="description" defaultValue={lesson.description ?? ""} />
        </Field>
        <Field
          label="Video URL"
          htmlFor="videoUrl"
          hint="Paste a normal YouTube link (e.g. https://www.youtube.com/watch?v=...). It embeds automatically on the lesson page, no other steps needed."
        >
          <Input id="videoUrl" name="videoUrl" defaultValue={lesson.videoUrl ?? ""} />
        </Field>
        <Field label="Duration (minutes)" htmlFor="durationMinutes">
          <Input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            min={0}
            defaultValue={lesson.durationMinutes ?? ""}
          />
        </Field>

        <span className="mb-1.5 block text-sm font-semibold text-ink">Content (markdown)</span>
        <p className="mb-1.5 -mt-1 text-xs text-muted">
          Plain text works fine as-is. For formatting: a line starting with ## is a heading, lines
          starting with - become a bullet list, and text wrapped in a pair of ``` lines becomes a
          code block. The preview on the right updates as you type.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <textarea
            id="content"
            name="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={CONTENT_TEMPLATE}
            rows={18}
            className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 font-mono text-sm text-ink focus:border-focus"
          />
          <div className="max-h-[420px] overflow-y-auto rounded-lg border border-line bg-paper px-4 py-3">
            {content.trim() ? (
              <MarkdownContent content={content} />
            ) : (
              <p className="text-sm text-muted">Start typing to see a preview here.</p>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <SubmitButton className="w-auto">Save lesson</SubmitButton>
          {state?.success && <span className="text-xs font-semibold text-done">Saved</span>}
          {state?.error && <span className="text-xs text-warn">{state.error}</span>}
        </div>
      </form>
    </Card>
  );
}
