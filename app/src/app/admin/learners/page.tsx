import { Card } from "@/components/ui/card";
import { LearnerRosterTable } from "@/components/admin/learner-roster-table";
import { getLearnerRoster } from "@/lib/data/admin";
import { getCoursesForAdmin } from "@/lib/data/admin";

export default async function AdminLearnersPage() {
  const [rows, courses] = await Promise.all([getLearnerRoster(), getCoursesForAdmin()]);
  const defaultCourse = courses.find((c) => c.status === "published") ?? courses[0] ?? null;

  return (
    <div>
      <h1 className="mb-6 font-display text-3xl font-bold">Learners</h1>
      {rows.length === 0 ? (
        <Card className="text-muted">No learners have signed up yet.</Card>
      ) : (
        <LearnerRosterTable rows={rows} defaultCourseId={defaultCourse?.id ?? null} />
      )}
    </div>
  );
}
