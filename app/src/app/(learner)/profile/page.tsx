import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { EditNameForm } from "@/components/profile/edit-name-form";
import { ThemeToggle } from "@/components/profile/theme-toggle";
import { ProgressSummary } from "@/components/dashboard/progress-summary";
import { getCurrentProfile } from "@/lib/data/profile";
import { getDashboardProgress } from "@/lib/data/learning";

export default async function ProfilePage() {
  const profile = await getCurrentProfile();
  const courses = profile ? await getDashboardProgress(profile.id) : [];

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 font-display text-3xl font-bold">Your profile</h1>

      <div className="grid gap-6">
        <section>
          <h2 className="mb-3 font-display text-lg font-bold">Account</h2>
          <Card>
            <EditNameForm fullName={profile?.full_name ?? ""} />
            <dl className="mt-4 grid grid-cols-[100px_1fr] gap-y-2 border-t border-line pt-4 text-sm">
              <dt className="text-muted">Email</dt>
              <dd>{profile?.email}</dd>
              <dt className="text-muted">Role</dt>
              <dd>
                <Badge tone={profile?.role === "admin" ? "wait" : "neutral"}>{profile?.role}</Badge>
              </dd>
            </dl>
          </Card>
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-bold">Appearance</h2>
          <Card>
            <p className="mb-3 text-sm text-muted">
              Choose how 1501 Learn looks for you. This is your own choice, it never changes on
              its own.
            </p>
            <ThemeToggle current={profile?.theme ?? "light"} />
          </Card>
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-bold">Security</h2>
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">Change your password by requesting a reset link.</p>
            <LinkButton href="/forgot-password" variant="ghost">
              Reset password
            </LinkButton>
          </Card>
        </section>

        {courses.length > 0 && (
          <section>
            <h2 className="mb-3 font-display text-lg font-bold">Learning</h2>
            <div className="grid gap-3">
              {courses.map((summary) => (
                <div key={summary.courseSlug}>
                  <ProgressSummary summary={summary} />
                  <Link
                    href={`/courses/${summary.courseSlug}`}
                    className="mt-2 inline-block text-sm font-semibold text-brand underline"
                  >
                    Go to course
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
