import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-password-form";

// Reached from /auth/confirm once a reset link has been verified, which signs
// the learner in with a short-lived recovery session.
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AuthCard
        title="Reset link needed"
        subtitle="Open the link in your latest reset email, or request a new one. Each link works once and expires after an hour."
      >
        <Link href="/forgot-password" className="text-sm font-semibold text-ink underline">
          Send me a new reset link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" subtitle={`For ${user.email}. Set a new password below.`}>
      <ResetPasswordForm />
    </AuthCard>
  );
}
