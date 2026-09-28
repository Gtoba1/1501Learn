// Seeds the 1501 Learn curriculum from content/modules/*.md into Supabase via
// the service role key.
//
// Usage:
//   npm run seed           parse every module file, then rebuild the course
//   npm run seed -- --check  parse and validate only, no database access
//
// Run after applying supabase/migrations/*.sql.
//
// The course row itself is kept (matched by slug), so enrollments survive a
// reseed. Its modules are deleted and recreated, which cascades to lessons,
// resources, quizzes, projects, and learners' progress, attempts, practice
// answers and submissions for the old lessons.
//
// Module file format (one file per module, parsed by src/lib/content/parse-module.ts):
//
//   ---
//   module: 2
//   title: Git & GitHub
//   optional: false
//   summary: One line shown on the course page.
//   ---
//
//   # Lesson: <title>
//   minutes: 45
//   <markdown, using ## and ### headings>
//   ## Resources
//   - read: [Title](https://...) · Source · Note
//   - watch: [Title](https://...) · Channel · 8.08K subscribers · 13.9K views · 464 likes · published 2024-12-16 · checked 2026-09-27 · 15 min
//   ## Practice
//   <task>
//   ## Example answer
//   <self-check answer, hidden until the learner reveals it>
//
//   # Quiz
//   passing_score: 70
//   ### <question>
//   - [ ] option
//   - [x] correct option
//   > explanation
//
//   # Project: <title>
//   max_score: 100
//   <markdown brief>

import { createClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { parseModule, type ParsedModule } from "../src/lib/content/parse-module";
import type { Database } from "../src/lib/types/database.types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(__dirname, "../content/modules");

const COURSE = {
  slug: "analytics-engineering",
  // Earlier seeds used this slug; the row is renamed in place so enrollments carry over.
  previousSlugs: ["data-analytics-engineering-bootcamp"],
  title: "Analytics Engineering Bootcamp",
  description:
    "A self-paced course built on ShopLink Distribution, a fictional Lagos electronics distributor. Go from your first advanced SQL query to a tested, documented analytics platform running in the cloud.",
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function loadModules(): ParsedModule[] {
  const files = readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();
  const modules = files.map((f) => parseModule(readFileSync(path.join(CONTENT_DIR, f), "utf8"), `content/modules/${f}`));

  const numbers = modules.map((m) => m.number);
  const expected = numbers.map((_, i) => i + 1);
  if (numbers.join() !== expected.join()) {
    throw new Error(`Module numbers must run 1..${modules.length} in file order, got ${numbers.join(", ")}`);
  }
  return modules;
}

// Style checks that don't break the parser but should be fixed before publishing.
function lint(modules: ParsedModule[], files: string[]) {
  const warnings: string[] = [];
  for (const f of files) {
    const text = readFileSync(path.join(CONTENT_DIR, f), "utf8");
    text.split(/\r?\n/).forEach((line, i) => {
      if (/[–—]/.test(line)) warnings.push(`${f}:${i + 1}: contains an en or em dash`);
    });
  }
  for (const m of modules) {
    if (!m.quiz) warnings.push(`module ${m.number}: no quiz`);
    else if (m.quiz.questions.length < 3 || m.quiz.questions.length > 5) {
      warnings.push(`module ${m.number}: quiz has ${m.quiz.questions.length} questions (aim for 3 to 5)`);
    }
    if (!m.project) warnings.push(`module ${m.number}: no project`);
    else {
      const points = [...m.project.instructions.matchAll(/^\|[^|\n]+\|\s*(\d+)\s*\|\s*$/gm)].reduce(
        (sum, match) => sum + Number(match[1]),
        0,
      );
      if (points && points !== m.project.maxScore) {
        warnings.push(`module ${m.number}: grading guide adds up to ${points}, max_score is ${m.project.maxScore}`);
      }
    }
    for (const l of m.lessons) if (!l.minutes) warnings.push(`module ${m.number}: lesson "${l.title}" has no minutes`);
  }
  return warnings;
}

async function seed(modules: ParsedModule[]) {
  dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in app/.env.local");
  }
  const supabase = createClient<Database>(url, serviceRoleKey);

  const { data: existing, error: findError } = await supabase
    .from("courses")
    .select("id, slug")
    .in("slug", [COURSE.slug, ...COURSE.previousSlugs]);
  if (findError) throw findError;

  const current = existing?.find((c) => c.slug === COURSE.slug) ?? existing?.[0];
  let courseId: string;
  if (current) {
    const { error } = await supabase
      .from("courses")
      .update({ title: COURSE.title, slug: COURSE.slug, description: COURSE.description, status: "published" })
      .eq("id", current.id);
    if (error) throw error;
    courseId = current.id;

    const { error: wipeError } = await supabase.from("modules").delete().eq("course_id", courseId);
    if (wipeError) throw wipeError;
  } else {
    const { data, error } = await supabase
      .from("courses")
      .insert({ title: COURSE.title, slug: COURSE.slug, description: COURSE.description, status: "published" })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("Course insert returned no row");
    courseId = data.id;
  }

  // Lesson slugs are unique across the whole table.
  const { data: otherLessons } = await supabase.from("lessons").select("slug");
  const usedSlugs = new Set((otherLessons ?? []).map((l) => l.slug));
  const uniqueSlug = (title: string, moduleNumber: number) => {
    const base = slugify(title);
    let slug = usedSlugs.has(base) ? `${base}-m${moduleNumber}` : base;
    for (let n = 2; usedSlugs.has(slug); n++) slug = `${base}-m${moduleNumber}-${n}`;
    usedSlugs.add(slug);
    return slug;
  };

  for (const [moduleIndex, mod] of modules.entries()) {
    const { data: moduleRow, error: moduleError } = await supabase
      .from("modules")
      .insert({
        course_id: courseId,
        title: mod.title,
        description: mod.summary,
        position: moduleIndex,
        is_optional: mod.optional,
      })
      .select("id")
      .single();
    if (moduleError || !moduleRow) throw moduleError ?? new Error("Module insert returned no row");

    const lessonIds: string[] = [];
    for (const [lessonIndex, lesson] of mod.lessons.entries()) {
      const { data: lessonRow, error: lessonError } = await supabase
        .from("lessons")
        .insert({
          module_id: moduleRow.id,
          title: lesson.title,
          slug: uniqueSlug(lesson.title, mod.number),
          content: lesson.content,
          practice: lesson.practice,
          practice_answer: lesson.practiceAnswer,
          position: lessonIndex,
          duration_minutes: lesson.minutes,
        })
        .select("id")
        .single();
      if (lessonError || !lessonRow) throw lessonError ?? new Error("Lesson insert returned no row");
      lessonIds.push(lessonRow.id);

      const { error: resourceError } = await supabase.from("lesson_resources").insert(
        lesson.resources.map((r, position) => ({
          lesson_id: lessonRow.id,
          kind: r.kind,
          title: r.title,
          url: r.url,
          source: r.source,
          note: r.note,
          subscribers: r.subscribers,
          views: r.views,
          likes: r.likes,
          published_on: r.publishedOn,
          checked_on: r.checkedOn,
          duration_minutes: r.durationMinutes,
          position,
        })),
      );
      if (resourceError) throw resourceError;
    }

    // Module-level quiz and project attach to the module's final lesson.
    const finalLessonId = lessonIds[lessonIds.length - 1];

    if (mod.quiz) {
      const { data: quizRow, error: quizError } = await supabase
        .from("quizzes")
        .insert({
          lesson_id: finalLessonId,
          title: `${mod.title} quiz`,
          description: `${mod.quiz.questions.length} questions. Pass with ${mod.quiz.passingScore}% to complete the module.`,
          passing_score: mod.quiz.passingScore,
        })
        .select("id")
        .single();
      if (quizError || !quizRow) throw quizError ?? new Error("Quiz insert returned no row");

      for (const [qIndex, q] of mod.quiz.questions.entries()) {
        const { data: questionRow, error: questionError } = await supabase
          .from("quiz_questions")
          .insert({ quiz_id: quizRow.id, question: q.question, explanation: q.explanation, position: qIndex })
          .select("id")
          .single();
        if (questionError || !questionRow) throw questionError ?? new Error("Question insert returned no row");

        const { error: optionsError } = await supabase.from("quiz_options").insert(
          q.options.map((o, position) => ({
            question_id: questionRow.id,
            option_text: o.text,
            is_correct: o.correct,
            position,
          })),
        );
        if (optionsError) throw optionsError;
      }
    }

    if (mod.project) {
      const { error: assignmentError } = await supabase.from("assignments").insert({
        lesson_id: finalLessonId,
        title: mod.project.title,
        description: mod.project.description,
        instructions: mod.project.instructions,
        max_score: mod.project.maxScore,
      });
      if (assignmentError) throw assignmentError;
    }

    const resources = mod.lessons.reduce((n, l) => n + l.resources.length, 0);
    console.log(
      `Seeded module ${mod.number}: ${mod.title} (${mod.lessons.length} lessons, ${resources} resources, ` +
        `${mod.quiz?.questions.length ?? 0} quiz questions${mod.project ? ", 1 project" : ""})`,
    );
  }
}

async function main() {
  const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".md")).sort();
  const modules = loadModules();
  const warnings = lint(modules, files);

  const lessons = modules.flatMap((m) => m.lessons);
  const coreMinutes = modules.filter((m) => !m.optional).flatMap((m) => m.lessons).reduce((s, l) => s + (l.minutes ?? 0), 0);
  console.log(
    `Parsed ${modules.length} modules, ${lessons.length} lessons, ` +
      `${lessons.reduce((n, l) => n + l.resources.length, 0)} resources; core lessons total ${Math.round(coreMinutes / 60)} hours.`,
  );
  for (const w of warnings) console.warn(`warning: ${w}`);

  if (process.argv.includes("--check")) return;
  await seed(modules);
  console.log("Seed complete.");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
