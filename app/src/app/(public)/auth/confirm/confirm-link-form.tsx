"use client";

import { useActionState } from "react";
import Link from "next/link";
import { confirmEmailLink, type ActionState } from "@/actions/auth";
import { SubmitButton } from "@/components/auth/submit-button";

const initialState: ActionState = null;

export function ConfirmLinkForm({
  tokenHash,
  type,
  label,
}: {
  tokenHash: string;
  type: string;
  label: string;
}) {
  const [state, formAction] = useActionState(confirmEmailLink.bind(null, tokenHash, type), initialState);

  if (state?.error) {
    return (
      <div>
        <p role="alert" className="mb-4 text-sm text-warn">
          {state.error}
        </p>
        {type === "recovery" && (
          <Link href="/forgot-password" className="text-sm font-semibold text-ink underline">
            Send me a new reset link
          </Link>
        )}
      </div>
    );
  }

  return (
    <form action={formAction}>
      <SubmitButton>{label}</SubmitButton>
    </form>
  );
}
