"use client";

import { useActionState } from "react";
import { deleteCohort, updateCohort, type ActionState } from "@/actions/admin-cohorts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/auth/submit-button";

const initialState: ActionState = null;

export function CohortEditForm({
  cohortId,
  name,
  startDate,
  endDate,
}: {
  cohortId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
}) {
  const action = updateCohort.bind(null, cohortId);
  const [state, formAction] = useActionState(action, initialState);

  return (
    <Card>
      <form action={formAction} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <Field label="Name" htmlFor="cohort-name">
          <Input id="cohort-name" name="name" defaultValue={name} required />
        </Field>
        <Field label="Start date" htmlFor="cohort-start">
          <Input id="cohort-start" name="startDate" type="date" defaultValue={startDate ?? ""} />
        </Field>
        <Field label="End date" htmlFor="cohort-end">
          <Input id="cohort-end" name="endDate" type="date" defaultValue={endDate ?? ""} />
        </Field>
        <SubmitButton className="w-auto">Save</SubmitButton>
      </form>
      <div className="mt-2 flex items-center gap-3">
        {state?.success && <span className="text-xs font-semibold text-done">Saved</span>}
        {state?.error && <span className="text-xs text-warn">{state.error}</span>}
      </div>
      <form
        action={deleteCohort.bind(null, cohortId)}
        className="mt-3"
        onSubmit={(e) => {
          if (!window.confirm(`Delete "${name}"? This can't be undone.`)) e.preventDefault();
        }}
      >
        <Button variant="danger" type="submit" className="w-auto px-3 py-1 text-xs">
          Delete cohort
        </Button>
      </form>
    </Card>
  );
}
