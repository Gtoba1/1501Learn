"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type ActionState } from "@/actions/auth";
import { AuthCard } from "@/components/auth/auth-card";
import { SubmitButton } from "@/components/auth/submit-button";
import { Field, Input } from "@/components/ui/input";

const initialState: ActionState = null;

export default function ForgotPasswordPage() {
  const [state, formAction] = useActionState(requestPasswordReset, initialState);

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link."
      footer={
        <Link href="/login" className="font-semibold text-ink underline">
          Back to sign in
        </Link>
      }
    >
      {state?.success ? (
        <p className="text-sm text-done">{state.success}</p>
      ) : (
        <form action={formAction} noValidate>
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          {state?.error && <p className="mb-4 text-sm text-warn">{state.error}</p>}
          <SubmitButton>Send reset link</SubmitButton>
        </form>
      )}
    </AuthCard>
  );
}
