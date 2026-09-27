"use client";

import { removeFromCohort, type ActionState } from "@/actions/admin-cohorts";
import { Button } from "@/components/ui/button";
import { useToastAction } from "@/hooks/use-toast-action";
import type { CohortMember } from "@/lib/data/cohorts";

const initialState: ActionState = null;

export function CohortMemberRow({ member, cohortId }: { member: CohortMember; cohortId: string }) {
  const action = removeFromCohort.bind(null, member.id, cohortId);
  const [, formAction] = useToastAction(action, initialState);

  return (
    <tr className="border-b border-line last:border-0">
      <td className="px-4 py-3">
        <span className="font-semibold">{member.fullName}</span>
        <span className="block text-xs text-muted">{member.email}</span>
      </td>
      <td className="px-4 py-3">{member.progressPercent !== null ? `${member.progressPercent}%` : "-"}</td>
      <td className="px-4 py-3">{member.quizAverage !== null ? `${member.quizAverage}%` : "-"}</td>
      <td className="px-4 py-3">
        <form
          action={formAction}
          onSubmit={(e) => {
            if (!window.confirm(`Remove ${member.fullName} from this cohort?`)) e.preventDefault();
          }}
        >
          <Button
            variant="ghost"
            type="submit"
            aria-label={`Remove ${member.fullName} from cohort`}
            className="w-auto px-2 py-1 text-xs"
          >
            Remove
          </Button>
        </form>
      </td>
    </tr>
  );
}
