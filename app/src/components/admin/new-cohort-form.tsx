"use client";

import { useActionState } from "react";
import { createCohort, type ActionState } from "@/actions/admin-cohorts";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/auth/submit-button";

const initialState: ActionState = null;

export function NewCohortForm() {
  const [state, formAction] = useActionState(createCohort, initialState);

  return (
    <Card>
      <h2 className="mb-3 font-semibold">New cohort</h2>
      <form action={formAction} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <Field label="Name" htmlFor="name">
          <Input id="name" name="name" placeholder="Cohort 1" required />
        </Field>
        <Field label="Start date" htmlFor="startDate">
          <Input id="startDate" name="startDate" type="date" />
        </Field>
        <Field label="End date" htmlFor="endDate">
          <Input id="endDate" name="endDate" type="date" />
        </Field>
        <SubmitButton className="w-auto">Create</SubmitButton>
      </form>
      {state?.error && <p className="mt-2 text-xs text-warn">{state.error}</p>}
    </Card>
  );
}
