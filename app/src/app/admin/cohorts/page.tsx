import Link from "next/link";
import { Card } from "@/components/ui/card";
import { NewCohortForm } from "@/components/admin/new-cohort-form";
import { getCohorts } from "@/lib/data/cohorts";

export default async function AdminCohortsPage() {
  const cohorts = await getCohorts();

  return (
    <div>
      <h1 className="mb-6 font-display text-3xl font-bold">Cohorts</h1>

      <div className="mb-6 grid gap-3">
        {cohorts.length === 0 ? (
          <Card className="text-muted">No cohorts yet.</Card>
        ) : (
          cohorts.map((c) => (
            <Link key={c.id} href={`/admin/cohorts/${c.id}`}>
              <Card className="flex items-center justify-between gap-4 hover:border-brand">
                <div>
                  <h2 className="font-semibold">{c.name}</h2>
                  {(c.startDate || c.endDate) && (
                    <p className="mt-1 text-sm text-muted">
                      {c.startDate ? new Date(c.startDate).toLocaleDateString() : "-"} –{" "}
                      {c.endDate ? new Date(c.endDate).toLocaleDateString() : "-"}
                    </p>
                  )}
                </div>
                <span className="text-sm font-semibold text-muted">
                  {c.memberCount} learner{c.memberCount === 1 ? "" : "s"}
                </span>
              </Card>
            </Link>
          ))
        )}
      </div>

      <NewCohortForm />
    </div>
  );
}
