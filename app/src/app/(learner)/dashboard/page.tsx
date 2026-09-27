import { Card } from "@/components/ui/card";
import { ContinueLearningCard } from "@/components/dashboard/continue-learning-card";
import { ModuleProgressList } from "@/components/dashboard/module-progress-list";
import { ProgressSummary } from "@/components/dashboard/progress-summary";
import { getDashboardProgress } from "@/lib/data/learning";
import { getCurrentProfile } from "@/lib/data/profile";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const profile = await getCurrentProfile();
  const { notice } = await searchParams;
  const courses = profile ? await getDashboardProgress(profile.id) : [];

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Welcome back, {profile?.full_name}</h1>

      {notice === "not-enrolled" && (
        <Card className="mt-4 border-warn text-warn">
          You tried to open a course you&apos;re not enrolled in yet.
        </Card>
      )}

      <div className="mt-6 grid gap-8">
        {courses.length === 0 ? (
          <Card className="text-muted">
            You&apos;re not enrolled in a course yet. This usually happens automatically when you
            sign up, so try refreshing the page, or check back soon.
          </Card>
        ) : (
          courses.map((summary) => (
            <div key={summary.courseSlug} className="grid gap-4">
              <ProgressSummary summary={summary} />
              <ContinueLearningCard summary={summary} />
              <h2 className="mt-2 font-display text-xl font-bold">Course modules</h2>
              <ModuleProgressList summary={summary} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
