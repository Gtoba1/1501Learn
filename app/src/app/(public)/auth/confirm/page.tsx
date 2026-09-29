import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ConfirmLinkForm } from "./confirm-link-form";

const COPY: Record<string, { title: string; subtitle: string; label: string }> = {
  recovery: {
    title: "Reset your password",
    subtitle: "Continue to choose a new password for your 1501 Learn account.",
    label: "Continue",
  },
  email: {
    title: "Confirm your email",
    subtitle: "Continue to confirm your email address and open your dashboard.",
    label: "Confirm my email",
  },
  signup: {
    title: "Confirm your email",
    subtitle: "Continue to confirm your email address and open your dashboard.",
    label: "Confirm my email",
  },
  email_change: {
    title: "Confirm your new email",
    subtitle: "Continue to confirm the new email address for your account.",
    label: "Confirm new email",
  },
};

// Landing page for links in Supabase auth emails. The token is only used when
// the learner presses the button (see confirmEmailLink), not on page load.
export default async function ConfirmEmailLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { token_hash: tokenHash, type } = await searchParams;
  const copy = type ? COPY[type] : undefined;

  if (!tokenHash || !copy) {
    return (
      <AuthCard title="This link isn't valid" subtitle="It may be incomplete. Try the link from the email again.">
        <Link href="/forgot-password" className="text-sm font-semibold text-ink underline">
          Send me a new reset link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={copy.title} subtitle={copy.subtitle}>
      <ConfirmLinkForm tokenHash={tokenHash} type={type!} label={copy.label} />
    </AuthCard>
  );
}
