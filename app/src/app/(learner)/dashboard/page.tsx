import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ContinueLearningCard } from "@/components/dashboard/continue-learning-card";
import { ModuleProgressList } from "@/components/dashboard/module-progress-list";
import { ProgressSummary } from "@/components/dashboard/progress-summary";
import { TrackPicker } from "@/components/tracks/track-picker";
import { getPublishedTracks } from "@/lib/data/courses";
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

  if (courses.length === 0) {
    const tracks = await getPublishedTracks();
    return (
      <div>
        <h1 className="font-display text-3xl font-bold">Welcome, {profile?.full_name}</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Choose the track you want to follow. You can switch later, and your progress in each
          track is saved.
        </p>
        {notice === "not-enrolled" && (
          <Card className="mt-4 border-warn text-warn">Choose a track to open its lessons.</Card>
        )}
        <div className="mt-6">
          {tracks.length ? (
            <TrackPicker tracks={tracks} currentCourseId={null} />
          ) : (
            <Card className="text-muted">No tracks are open yet. Check back soon.</Card>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">Welcome back, {profile?.full_name}</h1>
        <Link href="/tracks" className="text-sm font-semibold text-muted underline hover:text-ink">
          Switch track
        </Link>
      </div>

      {notice === "not-enrolled" && (
        <Card className="mt-4 border-warn text-warn">
          That lesson belongs to a track you&apos;re not following.{" "}
          <Link href="/tracks" className="underline">
            Switch track
          </Link>{" "}
          to open it.
        </Card>
      )}

      <div className="mt-6 grid gap-8">
        {courses.map((summary) => (
          <div key={summary.courseSlug} className="grid gap-4">
            <ProgressSummary summary={summary} />
            <ContinueLearningCard summary={summary} />
            <h2 className="mt-2 font-display text-xl font-bold">Course modules</h2>
            <ModuleProgressList summary={summary} />
          </div>
        ))}
      </div>
    </div>
  );
}
