// Parses one content/modules/*.md file into plain data for the seed script.
// The format is documented at the top of scripts/seed.ts. Errors name the file
// and line so a typo in a module file is quick to find.

import type { ResourceKind } from "@/lib/types/database.types";

export type ParsedResource = {
  kind: ResourceKind;
  title: string;
  url: string;
  source: string | null;
  note: string | null;
  subscribers: number | null;
  views: number | null;
  likes: number | null;
  publishedOn: string | null;
  checkedOn: string | null;
  durationMinutes: number | null;
};

export type ParsedLesson = {
  title: string;
  minutes: number | null;
  content: string;
  resources: ParsedResource[];
  practice: string;
  practiceAnswer: string;
};

export type ParsedQuestion = {
  question: string;
  options: { text: string; correct: boolean }[];
  explanation: string | null;
};

export type ParsedModule = {
  number: number;
  title: string;
  optional: boolean;
  summary: string;
  lessons: ParsedLesson[];
  quiz: { passingScore: number; questions: ParsedQuestion[] } | null;
  project: { title: string; maxScore: number; description: string; instructions: string } | null;
};

const RESOURCE_KINDS = new Set<ResourceKind>(["read", "watch", "docs", "deeper", "project"]);
const FIELD_SEPARATOR = " · ";

class ContentError extends Error {
  constructor(file: string, line: number, message: string) {
    super(`${file}:${line}: ${message}`);
  }
}

type Line = { text: string; n: number; inFence: boolean };

function toLines(source: string): Line[] {
  let inFence = false;
  return source.split(/\r?\n/).map((text, i) => {
    const isFence = /^\s*(```|~~~)/.test(text);
    const line = { text, n: i + 1, inFence: inFence || isFence };
    if (isFence) inFence = !inFence;
    return line;
  });
}

function joinBody(lines: Line[]): string {
  return lines
    .map((l) => l.text)
    .join("\n")
    .trim();
}

// "13.9K" -> 13900, "1.2M" -> 1200000, "6,574" -> 6574
export function parseCount(raw: string): number | null {
  const match = raw.trim().replace(/,/g, "").match(/^(\d+(?:\.\d+)?)\s*([KMB])?$/i);
  if (!match) return null;
  const multiplier = { K: 1e3, M: 1e6, B: 1e9 }[(match[2] ?? "").toUpperCase() as "K" | "M" | "B"] ?? 1;
  return Math.round(Number(match[1]) * multiplier);
}

function parseResource(file: string, line: Line): ParsedResource {
  const body = line.text.replace(/^\s*-\s+/, "");
  const fields = body.split(FIELD_SEPARATOR).map((f) => f.trim());
  const head = fields[0].match(/^(\w+):\s*\[(.+)\]\((https:\/\/[^\s)]+)\)$/);
  if (!head) {
    throw new ContentError(file, line.n, `resource must start with "kind: [Title](https://...)", got: ${fields[0]}`);
  }
  const kind = head[1] as ResourceKind;
  if (!RESOURCE_KINDS.has(kind)) throw new ContentError(file, line.n, `unknown resource kind "${kind}"`);

  const resource: ParsedResource = {
    kind,
    title: head[2].trim(),
    url: head[3],
    source: fields[1] || null,
    note: null,
    subscribers: null,
    views: null,
    likes: null,
    publishedOn: null,
    checkedOn: null,
    durationMinutes: null,
  };

  const notes: string[] = [];
  for (const field of fields.slice(2)) {
    let m: RegExpMatchArray | null;
    if (kind === "watch" && (m = field.match(/^(.+?)\s+subscribers$/i))) resource.subscribers = parseCount(m[1]);
    else if (kind === "watch" && (m = field.match(/^(.+?)\s+views$/i))) resource.views = parseCount(m[1]);
    else if (kind === "watch" && (m = field.match(/^(.+?)\s+likes$/i))) resource.likes = parseCount(m[1]);
    else if ((m = field.match(/^published\s+(\d{4}-\d{2}-\d{2})$/i))) resource.publishedOn = m[1];
    else if ((m = field.match(/^checked\s+(\d{4}-\d{2}-\d{2})$/i))) resource.checkedOn = m[1];
    else if (kind === "watch" && (m = field.match(/^(\d+)\s*min$/i))) resource.durationMinutes = Number(m[1]);
    else notes.push(field);
  }
  resource.note = notes.length ? notes.join(FIELD_SEPARATOR) : null;
  return resource;
}

function splitH2(lines: Line[]): { heading: string | null; lines: Line[]; n: number }[] {
  const sections: { heading: string | null; lines: Line[]; n: number }[] = [
    { heading: null, lines: [], n: lines[0]?.n ?? 0 },
  ];
  for (const line of lines) {
    const m = !line.inFence && line.text.match(/^##\s+(.+?)\s*$/);
    if (m) sections.push({ heading: m[1], lines: [line], n: line.n });
    else sections[sections.length - 1].lines.push(line);
  }
  return sections;
}

function takeKeyValue(lines: Line[], key: string): { value: string | null; rest: Line[] } {
  const index = lines.findIndex((l) => !l.inFence && l.text.trim() !== "");
  const m = index >= 0 ? lines[index].text.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`)) : null;
  if (!m) return { value: null, rest: lines };
  return { value: m[1], rest: [...lines.slice(0, index), ...lines.slice(index + 1)] };
}

function parseLesson(file: string, title: string, headerLine: number, lines: Line[]): ParsedLesson {
  const { value: minutesRaw, rest } = takeKeyValue(lines, "minutes");
  const sections = splitH2(rest);

  const resourcesAt = sections.findIndex((s) => s.heading === "Resources");
  const practiceAt = sections.findIndex((s) => s.heading === "Practice");
  const answerAt = sections.findIndex((s) => s.heading === "Example answer");

  if (resourcesAt === -1 || practiceAt === -1 || answerAt === -1) {
    throw new ContentError(file, headerLine, `lesson "${title}" needs "## Resources", "## Practice" and "## Example answer"`);
  }
  if (!(resourcesAt < practiceAt && practiceAt < answerAt && answerAt === sections.length - 1)) {
    throw new ContentError(
      file,
      headerLine,
      `lesson "${title}": "## Resources", "## Practice" and "## Example answer" must be the last three sections, in that order`,
    );
  }

  const content = joinBody(sections.slice(0, resourcesAt).flatMap((s) => s.lines));
  const resources = sections[resourcesAt].lines
    .slice(1)
    .filter((l) => /^\s*-\s+/.test(l.text))
    .map((l) => parseResource(file, l));
  if (!resources.length) throw new ContentError(file, sections[resourcesAt].n, `lesson "${title}" has no resources`);

  const practice = joinBody(sections[practiceAt].lines.slice(1));
  const practiceAnswer = joinBody(sections[answerAt].lines.slice(1));
  if (!content) throw new ContentError(file, headerLine, `lesson "${title}" has no content`);
  if (!practice) throw new ContentError(file, sections[practiceAt].n, `lesson "${title}" has an empty practice task`);
  if (!practiceAnswer) throw new ContentError(file, sections[answerAt].n, `lesson "${title}" has an empty example answer`);

  const minutes = minutesRaw ? Number(minutesRaw) : null;
  if (minutesRaw && !Number.isInteger(minutes)) {
    throw new ContentError(file, headerLine, `lesson "${title}": minutes must be a whole number`);
  }

  return { title, minutes, content, resources, practice, practiceAnswer };
}

function parseQuiz(file: string, headerLine: number, lines: Line[]) {
  const { value: passRaw, rest } = takeKeyValue(lines, "passing_score");
  const passingScore = passRaw ? Number(passRaw) : 70;
  if (!Number.isInteger(passingScore) || passingScore < 0 || passingScore > 100) {
    throw new ContentError(file, headerLine, "passing_score must be a whole number from 0 to 100");
  }

  const questions: (ParsedQuestion & { n: number })[] = [];
  const explanation: string[] = [];
  const flush = () => {
    const current = questions[questions.length - 1];
    if (current && explanation.length) current.explanation = explanation.splice(0).join(" ").trim();
  };

  for (const line of rest) {
    const q = line.text.match(/^###\s+(.+?)\s*$/);
    const option = line.text.match(/^\s*-\s+\[( |x|X)\]\s+(.+?)\s*$/);
    const quote = line.text.match(/^>\s?(.*)$/);
    if (q) {
      flush();
      questions.push({ question: q[1], options: [], explanation: null, n: line.n });
    } else if (option) {
      const current = questions[questions.length - 1];
      if (!current) throw new ContentError(file, line.n, "quiz option before any ### question");
      current.options.push({ text: option[2], correct: option[1].toLowerCase() === "x" });
    } else if (quote) {
      explanation.push(quote[1]);
    } else if (line.text.trim()) {
      throw new ContentError(file, line.n, `unexpected line in quiz: ${line.text}`);
    }
  }
  flush();

  if (!questions.length) throw new ContentError(file, headerLine, "quiz has no questions");
  for (const q of questions) {
    if (q.options.length < 2) throw new ContentError(file, q.n, `question "${q.question}" needs at least two options`);
    const correct = q.options.filter((o) => o.correct).length;
    if (correct !== 1) {
      throw new ContentError(file, q.n, `question "${q.question}" must have exactly one [x] option, has ${correct}`);
    }
  }

  return {
    passingScore,
    questions: questions.map(({ question, options, explanation: e }) => ({ question, options, explanation: e })),
  };
}

function parseProject(file: string, title: string, headerLine: number, lines: Line[]) {
  const { value: maxRaw, rest } = takeKeyValue(lines, "max_score");
  const maxScore = maxRaw ? Number(maxRaw) : 100;
  if (!Number.isInteger(maxScore) || maxScore <= 0) {
    throw new ContentError(file, headerLine, "max_score must be a positive whole number");
  }
  const instructions = joinBody(rest);
  if (!instructions) throw new ContentError(file, headerLine, `project "${title}" has no brief`);

  const brief = splitH2(rest).find((s) => s.heading === "Brief");
  const firstParagraph = brief ? joinBody(brief.lines.slice(1)).split(/\n\s*\n/)[0] : "";
  return { title, maxScore, description: firstParagraph.replace(/\s+/g, " ").trim(), instructions };
}

export function parseModule(source: string, file = "module.md"): ParsedModule {
  const lines = toLines(source);

  if (lines[0]?.text.trim() !== "---") throw new ContentError(file, 1, "file must start with --- frontmatter");
  const end = lines.findIndex((l, i) => i > 0 && l.text.trim() === "---");
  if (end === -1) throw new ContentError(file, 1, "frontmatter is not closed with ---");

  const meta = new Map<string, string>();
  for (const line of lines.slice(1, end)) {
    const m = line.text.match(/^(\w+):\s*(.*?)\s*$/);
    if (m) meta.set(m[1], m[2]);
  }
  const number = Number(meta.get("module"));
  const title = meta.get("title");
  const summary = meta.get("summary") ?? "";
  if (!Number.isInteger(number) || number < 1) throw new ContentError(file, 2, "frontmatter needs module: <number>");
  if (!title) throw new ContentError(file, 2, "frontmatter needs title:");

  const blocks: { header: Line; lines: Line[] }[] = [];
  for (const line of lines.slice(end + 1)) {
    if (!line.inFence && /^#\s+/.test(line.text)) blocks.push({ header: line, lines: [] });
    else if (blocks.length) blocks[blocks.length - 1].lines.push(line);
    else if (line.text.trim()) throw new ContentError(file, line.n, "content before the first # Lesson:");
  }

  const parsed: ParsedModule = {
    number,
    title,
    optional: meta.get("optional") === "true",
    summary,
    lessons: [],
    quiz: null,
    project: null,
  };

  for (const block of blocks) {
    const heading = block.header.text.replace(/^#\s+/, "").trim();
    const lesson = heading.match(/^Lesson:\s*(.+)$/);
    const project = heading.match(/^Project:\s*(.+)$/);
    if (lesson) {
      if (parsed.quiz || parsed.project) {
        throw new ContentError(file, block.header.n, "lessons must come before the quiz and project");
      }
      parsed.lessons.push(parseLesson(file, lesson[1].trim(), block.header.n, block.lines));
    } else if (heading === "Quiz") {
      if (parsed.quiz) throw new ContentError(file, block.header.n, "only one # Quiz per module");
      parsed.quiz = parseQuiz(file, block.header.n, block.lines);
    } else if (project) {
      if (parsed.project) throw new ContentError(file, block.header.n, "only one # Project per module");
      parsed.project = parseProject(file, project[1].trim(), block.header.n, block.lines);
    } else {
      throw new ContentError(file, block.header.n, `unknown top-level heading "# ${heading}"`);
    }
  }

  if (!parsed.lessons.length) throw new ContentError(file, end + 1, "module has no lessons");
  return parsed;
}
