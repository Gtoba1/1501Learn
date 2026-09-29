import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChooseTrackButton } from "@/components/tracks/choose-track-button";
import type { CourseCurriculum } from "@/lib/data/courses";

export function TrackPicker({
  tracks,
  currentCourseId,
}: {
  tracks: CourseCurriculum[];
  currentCourseId: string | null;
}) {
  const current = tracks.find((t) => t.id === currentCourseId) ?? null;

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {tracks.map((track) => {
        const isCurrent = track.id === currentCourseId;
        const coreModules = track.modules.filter((m) => !m.isOptional);
        return (
          <Card key={track.id} className={isCurrent ? "flex flex-col border-brand" : "flex flex-col"}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="font-display text-2xl font-bold">{track.title}</h2>
              {isCurrent && <Badge tone="done">Your track</Badge>}
            </div>
            {track.tagline && <p className="mt-2 font-semibold text-ink">{track.tagline}</p>}
            {track.description && <p className="mt-2 text-sm text-muted">{track.description}</p>}
            <p className="mt-3 text-xs text-muted">
              {coreModules.length} modules · {track.lessonCount} lessons · about{" "}
              {Math.round(track.minutes / 60)} hours of lessons, plus projects
            </p>
            <ol className="mt-4 grid flex-1 content-start gap-1 text-sm">
              {track.modules.map((m, i) => (
                <li key={m.id} className="flex gap-2">
                  <span className="w-5 shrink-0 text-right text-muted">{i + 1}.</span>
                  <span>{m.title}</span>
                </li>
              ))}
            </ol>
            <div className="mt-5">
              {isCurrent ? (
                <LinkButton href={`/courses/${track.slug}`} variant="ghost" className="w-full">
                  Continue this track
                </LinkButton>
              ) : (
                <ChooseTrackButton
                  courseId={track.id}
                  courseSlug={track.slug}
                  courseTitle={track.title}
                  currentTitle={current?.title ?? null}
                />
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
