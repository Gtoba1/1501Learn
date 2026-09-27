"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdminUser } from "@/lib/auth/require-admin";

export type ActionState = { error?: string; success?: string } | null;

export async function createCohort(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Only instructors can manage cohorts." };

  const name = formData.get("name")?.toString().trim();
  if (!name) return { error: "Name is required." };
  const startDate = formData.get("startDate")?.toString() || null;
  const endDate = formData.get("endDate")?.toString() || null;

  const supabase = await createClient();
  const { error } = await supabase.from("cohorts").insert({ name, start_date: startDate, end_date: endDate });
  if (error) return { error: "Could not create the cohort." };

  revalidatePath("/admin/cohorts");
  return { success: "Cohort created." };
}

export async function updateCohort(
  cohortId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Only instructors can manage cohorts." };

  const name = formData.get("name")?.toString().trim();
  if (!name) return { error: "Name is required." };
  const startDate = formData.get("startDate")?.toString() || null;
  const endDate = formData.get("endDate")?.toString() || null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("cohorts")
    .update({ name, start_date: startDate, end_date: endDate })
    .eq("id", cohortId);
  if (error) return { error: "Could not save the cohort." };

  revalidatePath(`/admin/cohorts/${cohortId}`);
  revalidatePath("/admin/cohorts");
  return { success: "Saved." };
}

export async function deleteCohort(cohortId: string): Promise<void> {
  const admin = await requireAdminUser();
  if (!admin) throw new Error("Only instructors can manage cohorts.");

  const supabase = await createClient();
  await supabase.from("cohorts").delete().eq("id", cohortId);

  revalidatePath("/admin/cohorts");
  redirect("/admin/cohorts");
}

export async function assignToCohort(
  cohortId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Only instructors can manage cohorts." };

  const userId = formData.get("userId")?.toString();
  if (!userId) return { error: "Choose a learner to assign." };

  const supabase = await createClient();
  const { error } = await supabase.from("cohort_members").insert({ cohort_id: cohortId, user_id: userId });
  if (error) return { error: "Could not assign this learner. They may already be in this cohort." };

  revalidatePath(`/admin/cohorts/${cohortId}`);
  return { success: "Assigned." };
}

export async function removeFromCohort(
  userId: string,
  cohortId: string,
  _prev: ActionState,
): Promise<ActionState> {
  const admin = await requireAdminUser();
  if (!admin) return { error: "Only instructors can manage cohorts." };

  const supabase = await createClient();
  await supabase.from("cohort_members").delete().eq("cohort_id", cohortId).eq("user_id", userId);

  revalidatePath(`/admin/cohorts/${cohortId}`);
  return { success: "Removed from cohort." };
}
