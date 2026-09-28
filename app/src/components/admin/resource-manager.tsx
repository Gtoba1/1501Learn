"use client";

import { useActionState, useState } from "react";
import {
  createResource,
  deleteResource,
  moveResource,
  updateResource,
  type ActionState,
} from "@/actions/admin-content";
import { SubmitButton } from "@/components/auth/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import type { LessonResource } from "@/lib/data/learning";
import type { ResourceKind } from "@/lib/types/database.types";

const initialState: ActionState = null;

const KIND_LABEL: Record<ResourceKind, string> = {
  watch: "Watch (YouTube)",
  read: "Read",
  docs: "Official documentation",
  deeper: "Go deeper (books, long courses)",
  project: "Real-world project",
};

function ResourceFields({ resource, idPrefix }: { resource?: LessonResource; idPrefix: string }) {
  const [kind, setKind] = useState<ResourceKind>(resource?.kind ?? "read");
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <>
      <div className="grid gap-x-4 md:grid-cols-2">
        <Field label="Type" htmlFor={id("kind")}>
          <select
            id={id("kind")}
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as ResourceKind)}
            className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-focus"
          >
            {(Object.keys(KIND_LABEL) as ResourceKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Source or channel" htmlFor={id("source")} hint="For example: dbt Labs, Seattle Data Guy.">
          <Input id={id("source")} name="source" defaultValue={resource?.source ?? ""} />
        </Field>
      </div>
      <Field label="Title" htmlFor={id("title")}>
        <Input id={id("title")} name="title" defaultValue={resource?.title ?? ""} required />
      </Field>
      <Field label="Link" htmlFor={id("url")} hint="Must start with https://">
        <Input id={id("url")} name="url" type="url" defaultValue={resource?.url ?? ""} required />
      </Field>
      <Field label="Note" htmlFor={id("note")} hint="One line on why it's worth the learner's time.">
        <Input id={id("note")} name="note" defaultValue={resource?.note ?? ""} />
      </Field>

      {kind === "watch" && (
        <div className="grid gap-x-4 sm:grid-cols-3">
          <Field label="Views" htmlFor={id("views")} hint="13.9K or 13900">
            <Input id={id("views")} name="views" defaultValue={resource?.views ?? ""} />
          </Field>
          <Field label="Likes" htmlFor={id("likes")}>
            <Input id={id("likes")} name="likes" defaultValue={resource?.likes ?? ""} />
          </Field>
          <Field label="Channel subscribers" htmlFor={id("subscribers")}>
            <Input id={id("subscribers")} name="subscribers" defaultValue={resource?.subscribers ?? ""} />
          </Field>
          <Field label="Length (minutes)" htmlFor={id("durationMinutes")}>
            <Input
              id={id("durationMinutes")}
              name="durationMinutes"
              type="number"
              min={0}
              defaultValue={resource?.durationMinutes ?? ""}
            />
          </Field>
          <Field label="Published" htmlFor={id("publishedOn")}>
            <Input id={id("publishedOn")} name="publishedOn" type="date" defaultValue={resource?.publishedOn ?? ""} />
          </Field>
          <Field label="Figures checked on" htmlFor={id("checkedOn")}>
            <Input
              id={id("checkedOn")}
              name="checkedOn"
              type="date"
              defaultValue={resource?.checkedOn ?? new Date().toISOString().slice(0, 10)}
            />
          </Field>
        </div>
      )}
    </>
  );
}

function ResourceRow({
  resource,
  lessonId,
  courseId,
  isFirst,
  isLast,
}: {
  resource: LessonResource;
  lessonId: string;
  courseId: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState(
    updateResource.bind(null, resource.id, lessonId, courseId),
    initialState,
  );

  return (
    <li className="rounded-lg border border-line px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <Badge tone="neutral">{resource.kind}</Badge>{" "}
          <a href={resource.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand underline">
            {resource.title}
          </a>
          {resource.source && <span className="text-sm text-muted"> · {resource.source}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <form action={moveResource.bind(null, resource.id, lessonId, courseId, "up")}>
            <Button variant="ghost" type="submit" disabled={isFirst} aria-label={`Move ${resource.title} up`} className="px-2 py-0.5 text-xs">
              ↑
            </Button>
          </form>
          <form action={moveResource.bind(null, resource.id, lessonId, courseId, "down")}>
            <Button variant="ghost" type="submit" disabled={isLast} aria-label={`Move ${resource.title} down`} className="px-2 py-0.5 text-xs">
              ↓
            </Button>
          </form>
          <Button variant="ghost" type="button" onClick={() => setEditing((v) => !v)} className="px-2 py-0.5 text-xs">
            {editing ? "Close" : "Edit"}
          </Button>
          <form
            action={deleteResource.bind(null, resource.id, lessonId, courseId)}
            onSubmit={(e) => {
              if (!window.confirm(`Remove "${resource.title}"?`)) e.preventDefault();
            }}
          >
            <Button variant="danger" type="submit" aria-label={`Remove ${resource.title}`} className="px-2 py-0.5 text-xs">
              Remove
            </Button>
          </form>
        </div>
      </div>
      {editing && (
        <form action={formAction} className="mt-3 border-t border-line pt-3">
          <ResourceFields resource={resource} idPrefix={`res-${resource.id}`} />
          <div className="flex items-center gap-2">
            <SubmitButton className="w-auto">Save resource</SubmitButton>
            {state?.success && <span className="text-xs font-semibold text-done">Saved</span>}
            {state?.error && <span className="text-xs text-warn">{state.error}</span>}
          </div>
        </form>
      )}
    </li>
  );
}

export function ResourceManager({
  lessonId,
  courseId,
  resources,
}: {
  lessonId: string;
  courseId: string;
  resources: LessonResource[];
}) {
  const [adding, setAdding] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await createResource(lessonId, courseId, prev, formData);
    if (result?.success) setFormKey((k) => k + 1);
    return result;
  }, initialState);

  return (
    <Card>
      <h3 className="font-semibold">Resources</h3>
      <p className="mt-1 mb-3 text-sm text-muted">
        Shown on the lesson under the content. The first video is embedded; the rest are listed as
        links.
      </p>
      {resources.length === 0 && <p className="mb-2 text-sm text-muted">No resources yet.</p>}
      <ul className="grid gap-2">
        {resources.map((r, i) => (
          <ResourceRow
            key={r.id}
            resource={r}
            lessonId={lessonId}
            courseId={courseId}
            isFirst={i === 0}
            isLast={i === resources.length - 1}
          />
        ))}
      </ul>

      {adding ? (
        <form key={formKey} action={formAction} className="mt-4 border-t border-line pt-4">
          <ResourceFields idPrefix="new-resource" />
          <div className="flex items-center gap-2">
            <SubmitButton className="w-auto">Add resource</SubmitButton>
            <Button variant="ghost" type="button" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            {state?.success && <span className="text-xs font-semibold text-done">{state.success}</span>}
            {state?.error && <span className="text-xs text-warn">{state.error}</span>}
          </div>
        </form>
      ) : (
        <Button variant="ghost" type="button" onClick={() => setAdding(true)} className="mt-3">
          + Add a resource
        </Button>
      )}
    </Card>
  );
}
