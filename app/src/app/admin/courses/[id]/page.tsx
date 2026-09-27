import { notFound } from "next/navigation";
import { CourseEditForm } from "@/components/admin/course-edit-form";
import { ModuleEditor } from "@/components/admin/module-editor";
import { LessonList } from "@/components/admin/lesson-list";
import { NewModuleForm } from "@/components/admin/new-module-form";
import { Card } from "@/components/ui/card";
import { getCourseForAdmin } from "@/lib/data/admin";

export default async function AdminCourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getCourseForAdmin(id);
  if (!data) notFound();

  return (
    <div>
      <h1 className="mb-6 font-display text-3xl font-bold">{data.course.title}</h1>

      <CourseEditForm
        courseId={data.course.id}
        title={data.course.title}
        description={data.course.description}
        status={data.course.status}
      />

      <h2 className="mt-8 mb-3 font-display text-xl font-bold">Modules</h2>
      {data.modules.length === 0 && (
        <Card className="mb-4 text-muted">No modules yet. Add the first one below.</Card>
      )}
      <div className="grid gap-4">
        {data.modules.map((m, i) => (
          <ModuleEditor
            key={m.id}
            moduleId={m.id}
            courseId={data.course.id}
            title={m.title}
            description={m.description}
            isOptional={m.isOptional}
            isFirst={i === 0}
            isLast={i === data.modules.length - 1}
          >
            <LessonList moduleId={m.id} courseId={data.course.id} lessons={m.lessons} />
          </ModuleEditor>
        ))}
      </div>

      <div className="mt-4">
        <NewModuleForm courseId={data.course.id} />
      </div>
    </div>
  );
}
