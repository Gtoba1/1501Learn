import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getPublishedCourseCurriculum } from "@/lib/data/courses";

const SKILLS = [
  "Advanced SQL",
  "Data Modelling",
  "Git & GitHub",
  "dbt",
  "Snowflake",
  "Data Quality",
  "CI/CD",
  "Analytics Engineering",
  "Airflow fundamentals",
  "Capstone Project",
];

const EXPERIENCE = [
  { title: "Practical lessons", body: "Every concept lands in a real ShopLink Distribution dataset, not a toy example." },
  { title: "Hands-on projects", body: "Each module ends in a deliverable you can put in a portfolio." },
  { title: "Assignments", body: "Submit work as text, a GitHub link, or a file, reviewed by an instructor." },
  { title: "Quizzes", body: "Check understanding before moving on, with instant feedback." },
  { title: "Instructor feedback", body: "Every submission gets a score and written feedback, not just a pass/fail." },
  { title: "Progress tracking", body: "See exactly how far through the bootcamp you are, at a glance." },
];

export default async function LandingPage() {
  const curriculum = await getPublishedCourseCurriculum();

  return (
    <>
      <section className="mx-auto max-w-6xl px-5 pt-14 pb-8">
        <h1 className="max-w-[14ch] font-display text-5xl font-extrabold tracking-tight text-ink sm:text-6xl">
          Data &amp; Analytics Engineering Bootcamp
        </h1>
        <p className="mt-4 max-w-[58ch] text-lg text-muted">
          Learn modern data transformation, modelling, analytics engineering and data workflows:
          hands-on, cohort-based, and built around a real business scenario from first query to
          production platform.
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
              A working data and analytics engineer who built this bootcamp&apos;s curriculum
              around ShopLink Distribution, a fictional Lagos electronics distributor, so every
              lesson answers a real business question.
            </p>
          </Card>
        </div>
      </section>
    </>
  );
}
