import { VideoEmbed } from "@/components/lessons/video-embed";
import type { LessonResource } from "@/lib/data/learning";
import type { ResourceKind } from "@/lib/types/database.types";

const GROUPS: { kind: ResourceKind; label: string }[] = [
  { kind: "watch", label: "Watch" },
  { kind: "read", label: "Read" },
  { kind: "docs", label: "Official documentation" },
  { kind: "deeper", label: "Go deeper" },
  { kind: "project", label: "Real-world projects" },
];

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

function formatDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function VideoStats({ resource }: { resource: LessonResource }) {
  const parts = [
    resource.durationMinutes ? `${resource.durationMinutes} min` : null,
    resource.views !== null ? `${compact.format(resource.views)} views` : null,
    resource.likes !== null ? `${compact.format(resource.likes)} likes` : null,
    resource.subscribers !== null ? `channel ${compact.format(resource.subscribers)} subscribers` : null,
    resource.publishedOn ? `published ${formatDate(resource.publishedOn)}` : null,
  ].filter(Boolean);
  if (!parts.length) return null;
  return (
    <p className="mt-1 text-xs text-muted">
      {parts.join(" · ")}
      {resource.checkedOn && ` (figures checked ${formatDate(resource.checkedOn)})`}
    </p>
  );
}

function ResourceItem({ resource }: { resource: LessonResource }) {
  return (
    <li className="rounded-lg border border-line bg-paper px-4 py-3">
      <a
        href={resource.url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-brand underline-offset-2 hover:underline"
      >
        {resource.title}
        <span className="sr-only"> (opens in a new tab)</span>
        <span aria-hidden> ↗</span>
      </a>
      {resource.source && <p className="text-sm text-ink">{resource.source}</p>}
      {resource.note && <p className="mt-1 text-sm text-muted">{resource.note}</p>}
      {resource.kind === "watch" && <VideoStats resource={resource} />}
    </li>
  );
}

export function ResourceList({ resources, lessonTitle }: { resources: LessonResource[]; lessonTitle: string }) {
  if (!resources.length) return null;
  const [featuredVideo] = resources.filter((r) => r.kind === "watch");

  return (
    <section aria-labelledby="resources-heading" className="mt-8 border-t border-line pt-6">
      <h2 id="resources-heading" className="font-display text-2xl font-bold">
        Resources
      </h2>
      {featuredVideo && (
        <div className="mt-4">
          <VideoEmbed url={featuredVideo.url} title={featuredVideo.title || lessonTitle} />
        </div>
      )}
      <div className="mt-2 grid gap-5">
        {GROUPS.map(({ kind, label }) => {
          const items = resources.filter((r) => r.kind === kind);
          if (!items.length) return null;
          return (
            <div key={kind}>
              <h3 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">{label}</h3>
              <ul className="grid gap-2">
                {items.map((r) => (
                  <ResourceItem key={r.id} resource={r} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
