import { createClient } from "@/lib/supabase/server";

export type CourseCurriculum = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  modules: {
    id: string;
    title: string;
    description: string | null;
    lessonCount: number;
  }[];
};

// Public: relies on the "published course" RLS policy, so this works for
// signed-out visitors on the landing page as well as signed-in learners.
export async function getPublishedCourseCurriculum(): Promise<CourseCurriculum | null> {
  const supabase = await createClient();

  const { data: course } = await supabase
    .from("courses")
    .select("id, title, slug, description")
    .eq("status", "published")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!course) return null;

  const { data: modules } = await supabase
    .from("modules")
    .select("id, title, description")
    .eq("course_id", course.id)
    .order("position", { ascending: true });

  const moduleIds = (modules ?? []).map((m) => m.id);
  const { data: lessons } = moduleIds.length
    ? await supabase.from("lessons").select("module_id").in("module_id", moduleIds)
    : { data: [] as { module_id: string }[] };

  const lessonCounts = new Map<string, number>();
  for (const lesson of lessons ?? []) {
    lessonCounts.set(lesson.module_id, (lessonCounts.get(lesson.module_id) ?? 0) + 1);
  }

  return {
    ...course,
    modules: (modules ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      lessonCount: lessonCounts.get(m.id) ?? 0,
    })),
  };
}
