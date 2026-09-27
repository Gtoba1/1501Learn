import { notFound } from "next/navigation";
import { AssignToCohortForm } from "@/components/admin/assign-to-cohort-form";
import { CohortEditForm } from "@/components/admin/cohort-edit-form";
import { CohortMemberRow } from "@/components/admin/cohort-member-row";
import { Card } from "@/components/ui/card";
import { getCohortDetail, getEnrolledLearnersNotInCohort } from "@/lib/data/cohorts";

export default async function AdminCohortDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, candidates] = await Promise.all([getCohortDetail(id), getEnrolledLearnersNotInCohort(id)]);
  if (!data) notFound();

  const stats = [
    { label: "Learners", value: data.stats.size },
    { label: "Average progress", value: `${data.stats.avgProgress}%` },
    { label: "Average quiz score", value: `${data.stats.avgQuizScore}%` },
    { label: "Completion rate", value: `${data.stats.completionRate}%` },
  ];

  return (
    <div>
      <h1 className="mb-6 font-display text-3xl font-bold">{data.cohort.name}</h1>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <strong className="block font-display text-3xl">{s.value}</strong>
            <span className="text-sm text-muted">{s.label}</span>
          </Card>
        ))}
      </div>

      <CohortEditForm
        cohortId={data.cohort.id}
        name={data.cohort.name}
        startDate={data.cohort.startDate}
        endDate={data.cohort.endDate}
      />

      <h2 className="mt-8 mb-3 font-display text-xl font-bold">Members</h2>
      {data.members.length === 0 ? (
        <Card className="mb-4 text-muted">No learners in this cohort yet.</Card>
      ) : (
        <div className="mb-4 overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold text-muted">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3">Quiz avg</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((m) => (
                <CohortMemberRow key={m.id} member={m} cohortId={data.cohort.id} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AssignToCohortForm cohortId={data.cohort.id} candidates={candidates} />
    </div>
  );
}
