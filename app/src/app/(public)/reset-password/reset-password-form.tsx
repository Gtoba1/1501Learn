"use client";

import { useActionState, useState } from "react";
import { updatePassword, type ActionState } from "@/actions/auth";
import { NewPasswordFields } from "@/components/auth/new-password-fields";
import { SubmitButton } from "@/components/auth/submit-button";

const initialState: ActionState = null;

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(updatePassword, initialState);
  const [passwordValid, setPasswordValid] = useState(false);

  return (
    <form action={formAction} noValidate>
      <NewPasswordFields label="New password" onValidityChange={setPasswordValid} />
      {state?.error && (
        <p role="alert" className="mb-4 text-sm text-warn">
          {state.error}
        </p>
      )}
      <SubmitButton disabled={!passwordValid}>Update password</SubmitButton>
    </form>
  );
}
