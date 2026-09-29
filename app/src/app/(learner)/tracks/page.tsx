import { redirect } from "next/navigation";
import { TrackPicker } from "@/components/tracks/track-picker";
import { getPublishedTracks } from "@/lib/data/courses";
import { getActiveCourseId } from "@/lib/data/learning";
import { getCurrentProfile } from "@/lib/data/profile";

export default async function TracksPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const [tracks, currentCourseId] = await Promise.all([getPublishedTracks(), getActiveCourseId(profile.id)]);

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Tracks</h1>
      <p className="mt-2 max-w-2xl text-muted">
        You follow one track at a time. Switching keeps your progress, quiz results and projects in
        your current track, so you can come back to it later.
      </p>
      <div className="mt-6">
        <TrackPicker tracks={tracks} currentCourseId={currentCourseId} />
      </div>
    </div>
  );
}
