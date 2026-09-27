// Seeds the real ShopLink curriculum (parsed straight out of the repo-root
// index.html's `COURSE` array) into Supabase via the service role key.
//
// Usage: npm run seed   (run after applying supabase/migrations/*.sql)

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import type { Database } from "../src/lib/types/database.types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in app/.env.local",
  );
  process.exit(1);
}

const supabase = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------------
// 1. Pull the COURSE array literal out of index.html and evaluate it.
//    It's plain data (strings/numbers/arrays/objects, no external refs), so
//    this is safe, but only because we control that file.
// ---------------------------------------------------------------------------
type RawSetupGroup = { on: string; steps: string[] };
type RawSetup = { title: string; intro: string; groups: RawSetupGroup[]; note?: string };
type RawVideo = { id: string; title: string; channel: string; note?: string };
type RawActivity = { title: string; body: string };
type RawSection = {
  id: string;
  title: string;
  mins: number;
  intro: string;
  points?: string[];
  setup?: RawSetup;
  video?: RawVideo;
  codeCap?: string;
  code?: string;
  activity?: RawActivity;
  lab?: string;
};
type RawTestQuestion = { q: string; o: string[]; a: number; e: string };
type RawProject = { title: string; brief: string; deliverables: string[] };
type RawModule = {
  id: string;
  title: string;
  layer: string;
  summary: string;
  sections: RawSection[];
  test: RawTestQuestion[];
  project: RawProject;
};

function extractCourseArray(html: string): RawModule[] {
  const marker = "const COURSE = [";
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) throw new Error("Could not find `const COURSE = [` in index.html");
  const arrayStart = markerIndex + marker.length - 1; // index of the opening '['

  let depth = 0;
  let inString: '"' | "'" | "`" | null = null;
  let end = -1;

  for (let i = arrayStart; i < html.length; i++) {
    const ch = html[i];
    const prev = html[i - 1];

    if (inString) {
      if (ch === inString && prev !== "\\") inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  if (end === -1) throw new Error("Could not find the end of the COURSE array in index.html");

  const literal = html.slice(arrayStart, end);
  return new Function(`"use strict"; return (${literal});`)() as RawModule[];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function buildLessonContent(section: RawSection): string {
  const parts: string[] = [section.intro];

  if (section.points?.length) {
    parts.push(["## Key ideas", ...section.points.map((p) => `- ${p}`)].join("\n"));
  }

  if (section.setup) {
    const groups = section.setup.groups
      .map((g) => [`### ${g.on}`, ...g.steps.map((s) => `1. ${s}`)].join("\n"))
      .join("\n\n");
    parts.push(
      [`## ${section.setup.title}`, section.setup.intro, groups, section.setup.note ?? ""]
        .filter(Boolean)
        .join("\n\n"),
    );
  }

  if (section.code) {
    parts.push(
      [section.codeCap ? `## ${section.codeCap}` : "## Code", "```", section.code, "```"].join(
        "\n",
      ),
    );
  }

  if (section.activity) {
    parts.push(`## Activity: ${section.activity.title}\n${section.activity.body}`);
  }

  if (section.lab) {
    parts.push(`## Lab\n${section.lab}`);
  }

  return parts.join("\n\n");
}

async function main() {
  const indexHtmlPath = path.resolve(__dirname, "../../index.html");
  const html = readFileSync(indexHtmlPath, "utf8");
  const modules = extractCourseArray(html);

  console.log(`Parsed ${modules.length} modules from index.html`);

  const courseSlug = "data-analytics-engineering-bootcamp";

  // Idempotent: wipe any previous seed of this course; cascades to
  // modules/lessons/quizzes/assignments via the FK ON DELETE CASCADE.
  await supabase.from("courses").delete().eq("slug", courseSlug);

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .insert({
      title: "Data & Analytics Engineering Bootcamp",
      slug: courseSlug,
      description:
        "A four-week intensive built on ShopLink Distribution, a fictional Lagos electronics distributor, from first query to production platform.",
      status: "published",
    })
    .select()
    .single();
  if (courseError || !course) throw courseError ?? new Error("Course insert returned no row");

  const usedSlugs = new Set<string>();
  const uniqueSlug = (base: string) => {
    let slug = slugify(base);
    let n = 2;
    while (usedSlugs.has(slug)) slug = `${slugify(base)}-${n++}`;
    usedSlugs.add(slug);
    return slug;
  };

  for (const [moduleIndex, mod] of modules.entries()) {
    const { data: moduleRow, error: moduleError } = await supabase
      .from("modules")
      .insert({
        course_id: course.id,
        title: mod.title,
        description: mod.summary,
        position: moduleIndex,
      })
      .select()
      .single();
    if (moduleError || !moduleRow) throw moduleError ?? new Error("Module insert returned no row");

    const lessonIds: string[] = [];

    for (const [sectionIndex, section] of mod.sections.entries()) {
      const { data: lessonRow, error: lessonError } = await supabase
        .from("lessons")
        .insert({
          module_id: moduleRow.id,
          title: section.title,
          slug: uniqueSlug(section.title),
          description: section.intro,
          content: buildLessonContent(section),
          video_url: section.video
            ? `https://www.youtube.com/watch?v=${section.video.id}`
            : null,
          position: sectionIndex,
          duration_minutes: section.mins,
        })
        .select()
        .single();
      if (lessonError || !lessonRow) throw lessonError ?? new Error("Lesson insert returned no row");
      lessonIds.push(lessonRow.id);
    }

    const finalLessonId = lessonIds[lessonIds.length - 1];

    // The static course page gives each module one test and one project , 
    // attach both to the module's final lesson (see plan: quizzes/assignments
    // are modelled per-lesson, and "unlocks after the last section" is the
    // real-world behaviour this mirrors).
    const { data: quizRow, error: quizError } = await supabase
      .from("quizzes")
      .insert({
        lesson_id: finalLessonId,
        title: `${mod.title} checkpoint`,
        description: `Module ${moduleIndex + 1} test, pass at 70% to unlock the project.`,
        passing_score: 70,
      })
      .select()
      .single();
    if (quizError || !quizRow) throw quizError ?? new Error("Quiz insert returned no row");

    for (const [qIndex, q] of mod.test.entries()) {
      const { data: questionRow, error: questionError } = await supabase
        .from("quiz_questions")
        .insert({ quiz_id: quizRow.id, question: q.q, explanation: q.e, position: qIndex })
        .select()
        .single();
      if (questionError || !questionRow)
        throw questionError ?? new Error("Question insert returned no row");

      const options = q.o.map((optionText, optionIndex) => ({
        question_id: questionRow.id,
        option_text: optionText,
        is_correct: optionIndex === q.a,
        position: optionIndex,
      }));
      const { error: optionsError } = await supabase.from("quiz_options").insert(options);
      if (optionsError) throw optionsError;
    }

    const instructions = mod.project.deliverables.map((d) => `- ${d}`).join("\n");
    const { error: assignmentError } = await supabase.from("assignments").insert({
      lesson_id: finalLessonId,
      title: mod.project.title,
      description: mod.project.brief,
      instructions,
      max_score: 100,
    });
    if (assignmentError) throw assignmentError;

    console.log(`Seeded module ${moduleIndex + 1}: ${mod.title} (${lessonIds.length} lessons)`);
  }

  console.log("Seed complete.");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
