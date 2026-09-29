"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signUp, type ActionState } from "@/actions/auth";
import { AuthCard } from "@/components/auth/auth-card";
import { NewPasswordFields } from "@/components/auth/new-password-fields";
import { SubmitButton } from "@/components/auth/submit-button";
import { Field, Input } from "@/components/ui/input";

const initialState: ActionState = null;

export default function SignUpPage() {
  const [state, formAction] = useActionState(signUp, initialState);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [passwordValid, setPasswordValid] = useState(false);

  return (
    <AuthCard
      title="Create your account"
      subtitle="Join 1501 Learn. You'll choose your track next."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-ink underline">
            Sign in
          </Link>
        </>
      }
    >
      <form action={formAction} noValidate>
        <Field label="Full name" htmlFor="fullName">
          <Input
            id="fullName"
            name="fullName"
            autoComplete="name"
            required
            maxLength={100}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <NewPasswordFields context={{ email, fullName }} onValidityChange={setPasswordValid} />
        {state?.error && (
          <p role="alert" className="mb-4 text-sm text-warn">
            {state.error}
          </p>
        )}
        <SubmitButton disabled={!passwordValid}>Create account</SubmitButton>
      </form>
    </AuthCard>
  );
}
