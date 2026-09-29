import { createClient } from "@/lib/supabase/server";

export type CourseCurriculum = {
  id: string;
  title: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  lessonCount: number;
  minutes: number;
  modules: {
    id: string;
    title: string;
    description: string | null;
    isOptional: boolean;
    lessonCount: number;
  }[];
};

// Public: relies on the "published course" RLS policy, so this works for
// signed-out visitors on the landing page as well as signed-in learners.
// Each published course is one track, shown in position order.
export async function getPublishedTracks(): Promise<CourseCurriculum[]> {
  const supabase = await createClient();

  const { data: courses } = await supabase
    .from("courses")
    .select("id, title, slug, tagline, description")
    .eq("status", "published")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (!courses?.length) return [];

  const { data: modules } = await supabase
    .from("modules")
    .select("id, course_id, title, description, is_optional, position")
    .in(
      "course_id",
      courses.map((c) => c.id),
    )
    .order("position", { ascending: true });

  const moduleIds = (modules ?? []).map((m) => m.id);
  const { data: lessons } = moduleIds.length
    ? await supabase.from("lessons").select("module_id, duration_minutes").in("module_id", moduleIds)
    : { data: [] as { module_id: string; duration_minutes: number | null }[] };

  const lessonCounts = new Map<string, number>();
  const minutesByModule = new Map<string, number>();
  for (const lesson of lessons ?? []) {
    lessonCounts.set(lesson.module_id, (lessonCounts.get(lesson.module_id) ?? 0) + 1);
    minutesByModule.set(lesson.module_id, (minutesByModule.get(lesson.module_id) ?? 0) + (lesson.duration_minutes ?? 0));
  }

  return courses.map((course) => {
    const courseModules = (modules ?? []).filter((m) => m.course_id === course.id);
    return {
      ...course,
      lessonCount: courseModules.reduce((n, m) => n + (lessonCounts.get(m.id) ?? 0), 0),
      minutes: courseModules.reduce((n, m) => n + (minutesByModule.get(m.id) ?? 0), 0),
      modules: courseModules.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        isOptional: m.is_optional,
        lessonCount: lessonCounts.get(m.id) ?? 0,
      })),
    };
  });
}
