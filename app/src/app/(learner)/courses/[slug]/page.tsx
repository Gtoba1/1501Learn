import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { CurriculumList } from "@/components/lessons/curriculum-list";
import { getCourseForLearner } from "@/lib/data/learning";
import { getCurrentProfile } from "@/lib/data/profile";

export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const data = await getCourseForLearner(slug, profile.id);
  if (!data) notFound();

  if (!data.enrolled) {
    redirect("/dashboard?notice=not-enrolled");
  }

  const allLessons = data.modules.flatMap((m) => m.lessons);
  const completed = allLessons.filter((l) => l.completed).length;
  const skipped = allLessons.filter((l) => l.skipped && !l.completed).length;
  const done = completed + skipped;
  const percent = allLessons.length ? Math.round((done / allLessons.length) * 100) : 0;

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">{data.course.title}</h1>
      {data.course.description && <p className="mt-2 max-w-2xl text-muted">{data.course.description}</p>}

      <Card className="mt-6 max-w-md">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold">Course progress</span>
          <span className="text-muted">
            {completed} of {allLessons.length} lessons
            {skipped > 0 && ` · ${skipped} skipped`}
          </span>
        </div>
        <ProgressBar percent={percent} />
      </Card>

      <h2 className="mt-8 mb-4 font-display text-xl font-bold">Curriculum</h2>
      <CurriculumList courseSlug={data.course.slug} modules={data.modules} />
    </div>
  );
}
