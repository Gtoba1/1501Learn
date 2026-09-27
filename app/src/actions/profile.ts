"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fullNameSchema } from "@/lib/validations/auth";

export type ActionState = { error?: string; success?: string } | null;

export async function updateTheme(theme: "light" | "dark"): Promise<void> {
  // Server actions are public endpoints: the TypeScript type isn't enforced at runtime.
  if (theme !== "light" && theme !== "dark") return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("profiles").update({ theme }).eq("id", user.id);

  revalidatePath("/", "layout");
}

export async function updateFullName(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const parsed = fullNameSchema.safeParse(formData.get("fullName")?.toString() ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Name is required." };

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data })
    .eq("id", user.id);
  if (error) return { error: "Could not save your name. Please try again." };

  revalidatePath("/", "layout");
  return { success: "Saved." };
}
