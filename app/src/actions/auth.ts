"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { firstPasswordProblem } from "@/lib/security/password";
import { isPasswordPwned } from "@/lib/security/pwned";
import { clientIp, consume, TOO_MANY_ATTEMPTS } from "@/lib/security/rate-limit";
import { safeRedirectPath } from "@/lib/security/urls";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validations/auth";

export type ActionState = { error?: string; success?: string } | null;

const MINUTE = 60_000;
const PWNED_MESSAGE =
  "This password has appeared in a known data breach. Choose a different one.";

export async function signUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ip = await clientIp();
  if (!consume(`signup:${ip}`, 5, 15 * MINUTE)) return { error: TOO_MANY_ATTEMPTS };

  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  if (await isPasswordPwned(parsed.data.password)) return { error: PWNED_MESSAGE };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } },
  });

  if (error) {
    // Don't reveal whether the address already has an account.
    console.error("signUp failed:", error.message);
    return { error: "We couldn't create that account. Check your details or sign in instead." };
  }

  redirect("/dashboard");
}

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  // Throttle per IP and per account, so one attacker can't spray many
  // accounts and many attackers can't hammer one account.
  const ip = await clientIp();
  if (
    !consume(`signin:ip:${ip}`, 20, 15 * MINUTE) ||
    !consume(`signin:email:${parsed.data.email}`, 8, 15 * MINUTE)
  ) {
    return { error: TOO_MANY_ATTEMPTS };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) return { error: "Incorrect email or password." };

  redirect(safeRedirectPath(formData.get("redirectTo")));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function requestPasswordReset(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a valid email address." };
  }

  const ip = await clientIp();
  if (
    !consume(`reset:ip:${ip}`, 5, 15 * MINUTE) ||
    !consume(`reset:email:${parsed.data.email}`, 3, 60 * MINUTE)
  ) {
    return { error: TOO_MANY_ATTEMPTS };
  }

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/reset-password`,
  });

  // Same answer whether or not the email exists, and whether or not the send
  // failed, so the form can't be used to discover which addresses have accounts.
  if (error) console.error("resetPasswordForEmail failed:", error.message);
  return { success: "If that email has an account, a reset link is on its way." };
}

// Email links (password reset, signup confirmation) point at /auth/confirm
// with a one-time token hash. Verifying it here, on the server, sets the
// session cookie directly, so the link works in any browser or device (unlike
// the PKCE flow, which needs the browser that requested it). It only runs when
// the learner clicks Continue, so mail scanners that prefetch links can't burn it.
const LINK_TYPES = {
  recovery: "/reset-password",
  email: "/dashboard",
  signup: "/dashboard",
  email_change: "/profile",
} as const;
type LinkType = keyof typeof LINK_TYPES;

export async function confirmEmailLink(
  tokenHash: string,
  type: string,
  _prev: ActionState,
): Promise<ActionState> {
  if (!(type in LINK_TYPES) || !/^[A-Za-z0-9_-]{10,200}$/.test(tokenHash)) {
    return { error: "This link isn't valid. Request a new one." };
  }

  const ip = await clientIp();
  if (!consume(`confirm-link:${ip}`, 10, 15 * MINUTE)) return { error: TOO_MANY_ATTEMPTS };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type === "signup" ? "email" : (type as Exclude<LinkType, "signup">),
  });
  if (error) {
    return {
      error:
        type === "recovery"
          ? "This reset link has expired or has already been used. Request a new one."
          : "This link has expired or has already been used.",
    };
  }

  revalidatePath("/", "layout");
  redirect(LINK_TYPES[type as LinkType]);
}

export async function updatePassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your reset session has ended. Request a new reset link." };

  if (!consume(`update-password:${user.id}`, 5, 15 * MINUTE)) return { error: TOO_MANY_ATTEMPTS };

  const personal = firstPasswordProblem(parsed.data.password, {
    email: user.email,
    fullName: user.user_metadata?.full_name,
  });
  if (personal) return { error: personal };
  if (await isPasswordPwned(parsed.data.password)) return { error: PWNED_MESSAGE };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    console.error("updateUser(password) failed:", error.message);
    return { error: "Could not update your password. Try a different one or request a new link." };
  }

  // Sign out every other device that held the old password.
  await supabase.auth.signOut({ scope: "others" });

  redirect("/dashboard");
}
