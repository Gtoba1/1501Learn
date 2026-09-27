"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EnrollButton } from "@/components/admin/enroll-button";
import type { LearnerRosterRow } from "@/lib/data/admin";

function statusTone(status: string | null) {
  if (status === "active") return "done" as const;
  if (status === "completed") return "done" as const;
  if (status === "dropped") return "warn" as const;
  return "neutral" as const;
}

export function LearnerRosterTable({
  rows,
  defaultCourseId,
}: {
  rows: LearnerRosterRow[];
  defaultCourseId: string | null;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.fullName.toLowerCase().includes(q) || r.email.toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <div>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or email"
        aria-label="Search learners"
        className="mb-3 max-w-xs"
      />
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold text-muted">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Course</th>
              <th className="px-4 py-3">Progress</th>
              <th className="px-4 py-3">Quiz avg</th>
              <th className="px-4 py-3">Assignments</th>
              <th className="px-4 py-3">Last active</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/admin/learners/${r.id}`} className="font-semibold text-brand underline">
                    {r.fullName}
                  </Link>
                  <span className="block text-xs text-muted">{r.email}</span>
                </td>
                <td className="px-4 py-3">{r.courseTitle ?? "-"}</td>
                <td className="px-4 py-3">
                  {r.progressPercent !== null ? (
                    <div className="flex items-center gap-2">
                      <ProgressBar percent={r.progressPercent} className="w-24" />
                      <span className="text-xs text-muted">{r.progressPercent}%</span>
                    </div>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-4 py-3">{r.quizAverage !== null ? `${r.quizAverage}%` : "-"}</td>
                <td className="px-4 py-3">{r.assignmentsGraded}</td>
                <td className="px-4 py-3 text-xs text-muted">
                  {r.lastActive ? new Date(r.lastActive).toLocaleDateString() : "-"}
                </td>
                <td className="px-4 py-3">
                  {r.enrollmentStatus ? (
                    <Badge tone={statusTone(r.enrollmentStatus)}>{r.enrollmentStatus}</Badge>
                  ) : defaultCourseId ? (
                    <EnrollButton userId={r.id} courseId={defaultCourseId} />
                  ) : (
                    <Badge tone="neutral">not enrolled</Badge>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted">
                  No learners match &quot;{query}&quot;.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
