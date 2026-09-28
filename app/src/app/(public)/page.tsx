import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getPublishedCourseCurriculum } from "@/lib/data/courses";

const SKILLS = [
  "Analytics Engineering",
  "Git & GitHub",
  "Data Warehousing",
  "Advanced SQL",
  "Data Modelling",
  "dbt",
  "Data Quality",
  "Snowflake",
  "CI/CD",
  "Capstone Project",
];

const EXPERIENCE = [
  { title: "Learn at your own pace", body: "No deadlines. Every lesson shows how long it takes, so you can plan your weeks." },
  { title: "One real dataset", body: "Every module builds on ShopLink Distribution's data, from raw CSVs to a tested analytics platform." },
  { title: "Practice with example answers", body: "Try each task yourself, then reveal a worked answer to check your thinking." },
  { title: "Peer review", body: "Share your practice answers and give feedback on other learners' work." },
  { title: "Quizzes and projects", body: "Pass a short quiz to finish each module, then build a project you can show employers." },
  { title: "Instructor feedback", body: "Every project gets a score and written feedback, not just a pass or fail." },
];

export default async function LandingPage() {
  const curriculum = await getPublishedCourseCurriculum();

  return (
    <>
      <section className="mx-auto max-w-6xl px-5 pt-14 pb-8">
        <h1 className="max-w-[14ch] font-display text-5xl font-extrabold tracking-tight text-ink sm:text-6xl">
          Analytics Engineering Bootcamp
        </h1>
        <p className="mt-4 max-w-[58ch] text-lg text-muted">
          Learn to turn raw data into trusted, tested models with SQL, dbt, Git and Snowflake.
          Self-paced, hands-on, and built around one real business from your first query to a
          production analytics platform. An optional Data Engineering module goes further.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <LinkButton href="/signup">Sign up</LinkButton>
          <LinkButton href="/login" variant="ghost">
            Sign In
          </LinkButton>
        </div>
      </section>

      <section className="border-t border-line py-10">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="mb-5 font-display text-2xl font-bold">What you&apos;ll learn</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {SKILLS.map((skill) => (
              <Card key={skill} className="text-center text-sm font-semibold">
                {skill}
              </Card>
            ))}
          </div>
        </div>
      </section>

      {curriculum && (
        <section className="border-t border-line py-10">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="mb-1 font-display text-2xl font-bold">Course curriculum</h2>
            <p className="mb-5 text-muted">{curriculum.title}</p>
            <div className="grid gap-3.5">
              {curriculum.modules.map((module, i) => (
                <Card key={module.id} className="flex items-baseline justify-between gap-4">
                  <div>
                    <h3 className="font-display text-lg font-bold">
                      Module {i + 1}: {module.title}
                      {module.isOptional && (
                        <span className="ml-2 align-middle text-xs font-semibold text-muted">(Optional)</span>
                      )}
                    </h3>
                    {module.description && (
                      <p className="mt-1 text-sm text-muted">{module.description}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-muted">
                    {module.lessonCount} lesson{module.lessonCount === 1 ? "" : "s"}
                  </span>
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
              A working data and analytics engineer who built this course&apos;s curriculum
              around ShopLink Distribution, a fictional Lagos electronics distributor, so every
              lesson answers a real business question.
            </p>
          </Card>
        </div>
      </section>
    </>
  );
}
