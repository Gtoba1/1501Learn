"use client";

import { useActionState } from "react";
import { assignToCohort, type ActionState } from "@/actions/admin-cohorts";
import { SubmitButton } from "@/components/auth/submit-button";
import type { EnrollableLearner } from "@/lib/data/cohorts";

const initialState: ActionState = null;

export function AssignToCohortForm({
  cohortId,
  candidates,
}: {
  cohortId: string;
  candidates: EnrollableLearner[];
}) {
  const action = assignToCohort.bind(null, cohortId);
  const [state, formAction] = useActionState(action, initialState);

  if (candidates.length === 0) {
    return <p className="text-sm text-muted">Every enrolled learner is already in this cohort.</p>;
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor="userId" className="mb-1.5 block text-sm font-semibold text-ink">
          Assign a learner
        </label>
        <select
          id="userId"
          name="userId"
          required
          className="rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-focus"
        >
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.fullName} ({c.email})
            </option>
          ))}
        </select>
      </div>
      <SubmitButton className="w-auto">Add to cohort</SubmitButton>
      {state?.error && <p className="text-xs text-warn">{state.error}</p>}
    </form>
  );
}
