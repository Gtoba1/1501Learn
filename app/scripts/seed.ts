// Syncs every course in content/<course>/ into Supabase via the service role key.
//
// Usage:
//   npm run seed             parse every course, then sync the database
//   npm run seed -- --check  parse and validate only, no database access
//   npm run seed -- --course=analytics-engineering   sync one course only
//
// Run after applying supabase/migrations/*.sql.
//
// The sync updates rows in place instead of recreating them, so learners keep
// their progress, quiz passes, practice answers and submissions:
//   - courses match by slug (or a previous slug), modules by title (then by
//     position), lessons by slug, and each module's quiz and project by the
//     module they belong to;
//   - content fields are overwritten from the files, so edits made in the admin
//     area to seeded lessons are replaced on the next sync;
//   - modules and lessons that are no longer in the files are deleted, which
//     removes their progress too;
//   - a quiz's questions are replaced each time; attempts and pass marks stay.
//
// Layout:
//   content/<course-slug>/_course.md   course frontmatter (slug, title, position,
//                                      tagline, description, previous_slugs)
//   content/<course-slug>/NN-*.md      one file per module
//
// Module file format (parsed by src/lib/content/parse-module.ts):
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

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { parseModule, type ParsedModule } from "../src/lib/content/parse-module";
import type { Database } from "../src/lib/types/database.types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(__dirname, "../content");

type Db = SupabaseClient<Database>;

type CourseContent = {
  dir: string;
  slug: string;
  previousSlugs: string[];
  title: string;
  position: number;
  tagline: string | null;
  description: string | null;
  files: string[];
  modules: ParsedModule[];
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function readFrontmatter(file: string): Map<string, string> {
  const text = readFileSync(file, "utf8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error(`${file}: missing --- frontmatter`);
  const meta = new Map<string, string>();
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^(\w+):\s*(.*?)\s*$/);
    if (m) meta.set(m[1], m[2]);
  }
  return meta;
}

function loadCourses(): CourseContent[] {
  const dirs = readdirSync(CONTENT_DIR).filter((d) => {
    const full = path.join(CONTENT_DIR, d);
    return statSync(full).isDirectory() && existsSync(path.join(full, "_course.md"));
  });

  const courses = dirs.map((dir) => {
    const full = path.join(CONTENT_DIR, dir);
    const meta = readFrontmatter(path.join(full, "_course.md"));
    const slug = meta.get("slug") ?? dir;
    const title = meta.get("title");
    if (!title) throw new Error(`content/${dir}/_course.md needs title:`);

    const files = readdirSync(full)
      .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
      .sort();
    const modules = files.map((f) => parseModule(readFileSync(path.join(full, f), "utf8"), `content/${dir}/${f}`));

    const numbers = modules.map((m) => m.number).join();
    const expected = modules.map((_, i) => i + 1).join();
    if (numbers !== expected) {
      throw new Error(`content/${dir}: module numbers must run 1..${modules.length} in file order, got ${numbers}`);
    }

    return {
      dir,
      slug,
      previousSlugs: (meta.get("previous_slugs") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      title,
      position: Number(meta.get("position") ?? 0),
      tagline: meta.get("tagline") || null,
      description: meta.get("description") || null,
      files,
      modules,
    };
  });

  return courses.sort((a, b) => a.position - b.position);
}

// Style checks that don't break the parser but should be fixed before publishing.
function lint(course: CourseContent) {
  const warnings: string[] = [];
  for (const f of course.files) {
    const text = readFileSync(path.join(CONTENT_DIR, course.dir, f), "utf8");
    text.split(/\r?\n/).forEach((line, i) => {
      if (/[–—]/.test(line)) warnings.push(`${course.dir}/${f}:${i + 1}: contains an en or em dash`);
    });
  }
  for (const m of course.modules) {
    const where = `${course.dir} module ${m.number}`;
    if (!m.quiz) warnings.push(`${where}: no quiz`);
    else if (m.quiz.questions.length < 3 || m.quiz.questions.length > 5) {
      warnings.push(`${where}: quiz has ${m.quiz.questions.length} questions (aim for 3 to 5)`);
    }
    if (!m.project) warnings.push(`${where}: no project`);
    else {
      const points = [...m.project.instructions.matchAll(/^\|[^|\n]+\|\s*(\d+)\s*\|\s*$/gm)].reduce(
        (sum, match) => sum + Number(match[1]),
        0,
      );
      if (points && points !== m.project.maxScore) {
        warnings.push(`${where}: grading guide adds up to ${points}, max_score is ${m.project.maxScore}`);
      }
    }
    for (const l of m.lessons) if (!l.minutes) warnings.push(`${where}: lesson "${l.title}" has no minutes`);
  }
  return warnings;
}

function check<T>(result: { data: T; error: unknown }, what: string): T {
  if (result.error) throw new Error(`${what}: ${(result.error as { message?: string }).message ?? result.error}`);
  return result.data;
}

async function syncCourse(supabase: Db, course: CourseContent, claimedSlugs: Map<string, string>) {
  const { data: existing } = await supabase
    .from("courses")
    .select("id, slug")
    .in("slug", [course.slug, ...course.previousSlugs]);
  const current = existing?.find((c) => c.slug === course.slug) ?? existing?.[0];

  const courseFields = {
    title: course.title,
    slug: course.slug,
    description: course.description,
    tagline: course.tagline,
    position: course.position,
    status: "published" as const,
  };
  const courseId = current
    ? (check(await supabase.from("courses").update(courseFields).eq("id", current.id), "update course"), current.id)
    : check(await supabase.from("courses").insert(courseFields).select("id").single(), "insert course")!.id;

  // Existing rows for this course.
  const oldModules = check(
    await supabase.from("modules").select("id, title, position").eq("course_id", courseId),
    "load modules",
  ) ?? [];
  const oldModuleIds = oldModules.map((m) => m.id);
  const oldLessons = oldModuleIds.length
    ? check(await supabase.from("lessons").select("id, slug, module_id").in("module_id", oldModuleIds), "load lessons") ?? []
    : [];
  const lessonBySlug = new Map(oldLessons.map((l) => [l.slug, l]));

  // Lesson slugs are unique across the whole table: a slug another course
  // already uses gets this course's short suffix.
  const courseSuffix = course.slug.split("-").map((w) => w[0]).join("");
  const usedHere = new Set<string>();
  const slugFor = (title: string, moduleNumber: number) => {
    const base = slugify(title);
    const candidates = [base, `${base}-${courseSuffix}`, `${base}-${courseSuffix}-m${moduleNumber}`];
    for (const slug of candidates) {
      const owner = claimedSlugs.get(slug);
      if (!usedHere.has(slug) && (!owner || owner === course.slug)) {
        usedHere.add(slug);
        claimedSlugs.set(slug, course.slug);
        return slug;
      }
    }
    throw new Error(`no free slug for lesson "${title}"`);
  };

  const keptModuleIds = new Set<string>();
  const keptLessonIds = new Set<string>();
  const unmatched = [...oldModules];

  for (const [moduleIndex, mod] of course.modules.entries()) {
    const matchAt =
      unmatched.findIndex((m) => m.title === mod.title) !== -1
        ? unmatched.findIndex((m) => m.title === mod.title)
        : unmatched.findIndex((m) => m.position === moduleIndex);
    const match = matchAt === -1 ? null : unmatched.splice(matchAt, 1)[0];

    const moduleFields = {
      course_id: courseId,
      title: mod.title,
      description: mod.summary,
      position: moduleIndex,
      is_optional: mod.optional,
    };
    const moduleId = match
      ? (check(await supabase.from("modules").update(moduleFields).eq("id", match.id), "update module"), match.id)
      : check(await supabase.from("modules").insert(moduleFields).select("id").single(), "insert module")!.id;
    keptModuleIds.add(moduleId);

    const lessonIds: string[] = [];
    for (const [lessonIndex, lesson] of mod.lessons.entries()) {
      const slug = slugFor(lesson.title, mod.number);
      const fields = {
        module_id: moduleId,
        title: lesson.title,
        slug,
        content: lesson.content,
        practice: lesson.practice,
        practice_answer: lesson.practiceAnswer,
        position: lessonIndex,
        duration_minutes: lesson.minutes,
      };
      const existingLesson = lessonBySlug.get(slug);
      const lessonId = existingLesson
        ? (check(await supabase.from("lessons").update(fields).eq("id", existingLesson.id), "update lesson"),
          existingLesson.id)
        : check(await supabase.from("lessons").insert(fields).select("id").single(), `insert lesson ${slug}`)!.id;
      lessonIds.push(lessonId);
      keptLessonIds.add(lessonId);

      check(await supabase.from("lesson_resources").delete().eq("lesson_id", lessonId), "clear resources");
      check(
        await supabase.from("lesson_resources").insert(
          lesson.resources.map((r, position) => ({
            lesson_id: lessonId,
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
        ),
        "insert resources",
      );
    }

    // The module quiz and project live on the module's final lesson. Reuse the
    // existing rows (moving them if the final lesson changed) so attempts and
    // submissions stay attached.
    const finalLessonId = lessonIds[lessonIds.length - 1];
    const [{ data: quizzes }, { data: assignments }] = await Promise.all([
      supabase.from("quizzes").select("id, lesson_id").in("lesson_id", lessonIds),
      supabase.from("assignments").select("id, lesson_id").in("lesson_id", lessonIds),
    ]);
    const existingQuiz = quizzes?.find((q) => q.lesson_id === finalLessonId) ?? quizzes?.[0];
    const existingAssignment = assignments?.find((a) => a.lesson_id === finalLessonId) ?? assignments?.[0];

    if (mod.quiz) {
      const quizFields = {
        lesson_id: finalLessonId,
        title: `${mod.title} quiz`,
        description: `${mod.quiz.questions.length} questions. Pass with ${mod.quiz.passingScore}% to complete the module.`,
        passing_score: mod.quiz.passingScore,
      };
      const quizId = existingQuiz
        ? (check(await supabase.from("quizzes").update(quizFields).eq("id", existingQuiz.id), "update quiz"),
          existingQuiz.id)
        : check(await supabase.from("quizzes").insert(quizFields).select("id").single(), "insert quiz")!.id;

      check(await supabase.from("quiz_questions").delete().eq("quiz_id", quizId), "clear questions");
      for (const [qIndex, q] of mod.quiz.questions.entries()) {
        const question = check(
          await supabase
            .from("quiz_questions")
            .insert({ quiz_id: quizId, question: q.question, explanation: q.explanation, position: qIndex })
            .select("id")
            .single(),
          "insert question",
        )!;
        check(
          await supabase.from("quiz_options").insert(
            q.options.map((o, position) => ({
              question_id: question.id,
              option_text: o.text,
              is_correct: o.correct,
              position,
            })),
          ),
          "insert options",
        );
      }
    } else if (existingQuiz) {
      check(await supabase.from("quizzes").delete().eq("id", existingQuiz.id), "delete quiz");
    }

    if (mod.project) {
      const projectFields = {
        lesson_id: finalLessonId,
        title: mod.project.title,
        description: mod.project.description,
        instructions: mod.project.instructions,
        max_score: mod.project.maxScore,
      };
      if (existingAssignment) {
        check(
          await supabase.from("assignments").update(projectFields).eq("id", existingAssignment.id),
          "update project",
        );
      } else {
        check(await supabase.from("assignments").insert(projectFields), "insert project");
      }
    } else if (existingAssignment) {
      check(await supabase.from("assignments").delete().eq("id", existingAssignment.id), "delete project");
    }

    const resources = mod.lessons.reduce((n, l) => n + l.resources.length, 0);
    console.log(
      `  module ${mod.number}: ${mod.title} (${mod.lessons.length} lessons, ${resources} resources, ` +
        `${mod.quiz?.questions.length ?? 0} quiz questions${mod.project ? ", 1 project" : ""})`,
    );
  }

  // Anything no longer in the files.
  const staleLessons = oldLessons.filter((l) => !keptLessonIds.has(l.id)).map((l) => l.id);
  if (staleLessons.length) {
    check(await supabase.from("lessons").delete().in("id", staleLessons), "delete stale lessons");
    console.log(`  removed ${staleLessons.length} lessons no longer in the content`);
  }
  const staleModules = oldModules.filter((m) => !keptModuleIds.has(m.id)).map((m) => m.id);
  if (staleModules.length) {
    check(await supabase.from("modules").delete().in("id", staleModules), "delete stale modules");
    console.log(`  removed ${staleModules.length} modules no longer in the content`);
  }
}

async function main() {
  const courses = loadCourses();

  for (const course of courses) {
    const lessons = course.modules.flatMap((m) => m.lessons);
    const coreMinutes = course.modules
      .filter((m) => !m.optional)
      .flatMap((m) => m.lessons)
      .reduce((s, l) => s + (l.minutes ?? 0), 0);
    console.log(
      `${course.title}: ${course.modules.length} modules, ${lessons.length} lessons, ` +
        `${lessons.reduce((n, l) => n + l.resources.length, 0)} resources; core lessons total ${Math.round(coreMinutes / 60)} hours.`,
    );
    for (const w of lint(course)) console.warn(`warning: ${w}`);
  }

  if (process.argv.includes("--check")) return;

  dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in app/.env.local");
  }
  const supabase = createClient<Database>(url, serviceRoleKey);

  // Which course owns each lesson slug today, so slugs stay stable across syncs.
  const { data: allLessons } = await supabase.from("lessons").select("slug, module_id");
  const { data: allModules } = await supabase.from("modules").select("id, course_id");
  const { data: allCourses } = await supabase.from("courses").select("id, slug");
  const courseSlugById = new Map((allCourses ?? []).map((c) => [c.id, c.slug]));
  const courseByModule = new Map((allModules ?? []).map((m) => [m.id, courseSlugById.get(m.course_id)]));
  const renamed = new Map(courses.flatMap((c) => c.previousSlugs.map((p) => [p, c.slug] as const)));
  const claimedSlugs = new Map<string, string>();
  for (const l of allLessons ?? []) {
    const owner = courseByModule.get(l.module_id);
    if (owner) claimedSlugs.set(l.slug, renamed.get(owner) ?? owner);
  }

  // --course=<slug> syncs just that course, e.g. while another is being written.
  const only = process.argv.find((a) => a.startsWith("--course="))?.slice("--course=".length);

  for (const course of courses) {
    if (only && course.slug !== only) continue;
    // Never publish an empty track while its content is still being written.
    if (!course.modules.length) {
      console.log(`Skipping ${course.title}: no module files yet`);
      continue;
    }
    console.log(`Syncing ${course.title}`);
    await syncCourse(supabase, course, claimedSlugs);
  }
  console.log("Seed complete.");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
