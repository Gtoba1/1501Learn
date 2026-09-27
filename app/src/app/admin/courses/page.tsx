import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getCoursesForAdmin } from "@/lib/data/admin";

export default async function AdminCoursesPage() {
  const courses = await getCoursesForAdmin();

  return (
    <div>
      <h1 className="mb-6 font-display text-3xl font-bold">Courses</h1>
      <div className="grid gap-3">
        {courses.map((c) => (
          <Link key={c.id} href={`/admin/courses/${c.id}`}>
            <Card className="flex items-center justify-between gap-4 hover:border-brand">
              <div>
                <h2 className="font-semibold">{c.title}</h2>
                {c.description && <p className="mt-1 text-sm text-muted">{c.description}</p>}
              </div>
              <Badge tone={c.status === "published" ? "done" : "neutral"}>{c.status}</Badge>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
