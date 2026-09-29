import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getPublishedTracks } from "@/lib/data/courses";

const EXPERIENCE = [
  { title: "Learn at your own pace", body: "No deadlines. Every lesson shows how long it takes, so you can plan your weeks." },
  { title: "One real business", body: "Every module builds on ShopLink Distribution's data, from raw CSVs to a working platform." },
  { title: "Practice with example answers", body: "Try each task yourself, then reveal a worked answer to check your thinking." },
  { title: "Peer review", body: "Share your practice answers and give feedback on other learners' work." },
  { title: "Quizzes and projects", body: "Pass a short quiz to finish each module, then build a project you can show employers." },
  { title: "Instructor feedback", body: "Every project gets a score and written feedback, not just a pass or fail." },
];

export default async function LandingPage() {
  const tracks = await getPublishedTracks();

  return (
    <>
      <section className="mx-auto max-w-6xl px-5 pt-14 pb-8">
        <h1 className="max-w-[18ch] font-display text-5xl font-extrabold tracking-tight text-ink sm:text-6xl">
          Become a data engineer or an analytics engineer
        </h1>
        <p className="mt-4 max-w-[60ch] text-lg text-muted">
          Two self-paced, hands-on tracks built around one real business. Learn to build the
          pipelines that move data, or the tested models that turn it into answers. Pick a track
          after you sign up, and switch any time.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <LinkButton href="/signup">Sign up</LinkButton>
          <LinkButton href="/login" variant="ghost">
            Sign In
          </LinkButton>
        </div>
      </section>

      {tracks.length > 0 && (
        <section className="border-t border-line py-10">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="mb-5 font-display text-2xl font-bold">Choose your track</h2>
            <div className="grid gap-5 md:grid-cols-2">
              {tracks.map((track) => (
                <Card key={track.id} className="flex flex-col">
                  <h3 className="font-display text-2xl font-bold">{track.title}</h3>
                  {track.tagline && <p className="mt-2 font-semibold text-ink">{track.tagline}</p>}
                  <p className="mt-2 text-xs text-muted">
                    {track.modules.filter((m) => !m.isOptional).length} modules · {track.lessonCount} lessons ·
                    about {Math.round(track.minutes / 60)} hours of lessons, plus projects
                  </p>
                  <ol className="mt-4 grid gap-2">
                    {track.modules.map((module, i) => (
                      <li key={module.id} className="flex items-baseline justify-between gap-3 text-sm">
                        <span>
                          <span className="font-semibold">
                            {i + 1}. {module.title}
                          </span>
                          {module.isOptional && <span className="ml-1 text-xs text-muted">(Optional)</span>}
                        </span>
                        <span className="shrink-0 text-xs text-muted">
                          {module.lessonCount} lesson{module.lessonCount === 1 ? "" : "s"}
                        </span>
                      </li>
                    ))}
                  </ol>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="border-t border-line py-10">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="mb-5 font-display text-2xl font-bold">The learning experience</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {EXPERIENCE.map((item) => (
              <Card key={item.title}>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm text-muted">{item.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-line py-10">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="mb-5 font-display text-2xl font-bold">Your instructor</h2>
          <Card className="max-w-xl">
            <h3 className="font-display text-lg font-bold">Instructor</h3>
            <p className="mt-1 text-sm text-muted">
              A working data and analytics engineer who built both tracks around ShopLink
              Distribution, a fictional Lagos electronics distributor, so every lesson answers a
              real business question.
            </p>
          </Card>
        </div>
      </section>
    </>
  );
}
