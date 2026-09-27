"use client";

import { useActionState, useEffect, useState } from "react";
import { updatePassword, type ActionState } from "@/actions/auth";
import { AuthCard } from "@/components/auth/auth-card";
import { NewPasswordFields } from "@/components/auth/new-password-fields";
import { SubmitButton } from "@/components/auth/submit-button";
import { createClient } from "@/lib/supabase/client";

const initialState: ActionState = null;

export default function ResetPasswordPage() {
  const [state, formAction] = useActionState(updatePassword, initialState);
  const [passwordValid, setPasswordValid] = useState(false);

  // The password-reset link lands here with the recovery session in the URL
  // hash. Instantiating the browser client processes that hash and syncs the
  // session into cookies, which the updatePassword server action then reads.
  useEffect(() => {
    createClient();
  }, []);

  return (
    <AuthCard
      title="Choose a new password"
      subtitle="You followed a reset link. Set a new password below."
    >
      <form action={formAction} noValidate>
        <NewPasswordFields label="New password" onValidityChange={setPasswordValid} />
        {state?.error && (
          <p role="alert" className="mb-4 text-sm text-warn">
            {state.error}
          </p>
        )}
        <SubmitButton disabled={!passwordValid}>Update password</SubmitButton>
      </form>
    </AuthCard>
  );
}
