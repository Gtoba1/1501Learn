import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { CurriculumList } from "@/components/lessons/curriculum-list";
import { courseProgress, getCourseForLearner } from "@/lib/data/learning";
import { getCurrentProfile } from "@/lib/data/profile";

// Lesson minutes cover reading and practice. Module projects are real builds
// (a dbt project, a CI pipeline, the capstone), so allow this many hours each.
const PROJECT_HOURS = 6;

export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const data = await getCourseForLearner(slug, profile.id);
  if (!data) notFound();

  if (!data.enrolled) {
    redirect("/dashboard?notice=not-enrolled");
  }

  const progress = courseProgress(data.modules);
  const projects = data.modules.filter((m) => !m.isOptional && m.assignmentId).length;
  const hours = Math.round(progress.coreMinutes / 60 + projects * PROJECT_HOURS);
  const weeksAt = (hoursPerWeek: number) => Math.ceil(hours / hoursPerWeek);

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">{data.course.title}</h1>
      {data.course.description && <p className="mt-2 max-w-2xl text-muted">{data.course.description}</p>}

      <div className="mt-6 grid max-w-3xl gap-4 sm:grid-cols-2">
        <Card>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold">Course progress</span>
            <span className="text-muted">
              {progress.modulesComplete} of {progress.modulesTotal} modules
            </span>
          </div>
          <ProgressBar percent={progress.percent} />
          <p className="mt-2 text-xs text-muted">
            A module is complete when every lesson is done and its quiz is passed.
          </p>
        </Card>

        {hours > 0 && (
          <Card>
            <p className="text-sm font-semibold">Learn at your own pace</p>
            <p className="mt-1 text-sm text-muted">
              About {hours} hours including projects. At 8 hours a week that&apos;s around{" "}
              {weeksAt(8)} weeks; at 12 hours a week, around {weeksAt(12)}.
            </p>
          </Card>
        )}
      </div>

      <h2 className="mt-8 mb-4 font-display text-xl font-bold">Curriculum</h2>
      <CurriculumList courseSlug={data.course.slug} modules={data.modules} />
    </div>
  );
}
