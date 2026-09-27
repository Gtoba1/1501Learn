"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, type ActionState } from "@/actions/auth";
import { AuthCard } from "@/components/auth/auth-card";
import { PasswordInput } from "@/components/auth/password-input";
import { SubmitButton } from "@/components/auth/submit-button";
import { Field, Input } from "@/components/ui/input";

const initialState: ActionState = null;

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [state, formAction] = useActionState(signIn, initialState);

  return (
    <AuthCard
      title="Sign in"
      subtitle="Welcome back to the bootcamp."
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="font-semibold text-ink underline">
            Create an account
          </Link>
        </>
      }
    >
      <form action={formAction} noValidate>
        <input type="hidden" name="redirectTo" value={redirectTo ?? ""} />
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
        </Field>
        <Field label="Password" htmlFor="password">
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            required
            maxLength={256}
          />
        </Field>
        <div className="mb-4 text-right">
          <Link href="/forgot-password" className="text-sm text-muted underline">
            Forgot password?
          </Link>
        </div>
        {state?.error && (
          <p role="alert" className="mb-4 text-sm text-warn">
            {state.error}
          </p>
        )}
        <SubmitButton>Sign in</SubmitButton>
      </form>
    </AuthCard>
  );
}
