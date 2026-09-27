# 1501 Learn, What We Built, and How It Works

A plain-language walkthrough of the Data & Analytics Engineering Bootcamp platform, for anyone who wants the big picture without reading code.

## The big picture

1501 Learn is a real, multi-user online learning platform, the kind of thing you'd expect from a paid course product, not a static webpage. Learners create their own accounts, work through a structured curriculum at their own pace, take quizzes, submit assignments, and get graded feedback. Instructors have a separate control panel to manage learners, edit course content, grade work, and organize people into cohorts.

Everything is private and permission-checked: a learner can only ever see their own progress and grades, never anyone else's, and that rule is enforced by the database itself, not just by the website's code, so it can't be bypassed.

The curriculum content itself, 4 modules, 20 lessons, videos, code samples, quizzes and projects, was carried over from the original ShopLink course material, so the platform launched with real content from day one instead of placeholder text.

---

## What a learner can do

1. **Sign up** with their name, email and a password (or reset it if forgotten).
2. **Land on a personal dashboard** showing exactly how far through the course they are, a progress bar, how many lessons are done, and a "Continue Learning" shortcut to the next thing they haven't finished.
3. **Browse the course**, four modules, each with its lessons listed, showing which ones are done (✓), which is next, and which haven't been started.
4. **Read a lesson**, formatted text, code examples, and an embedded video where one exists, then click "Mark as Complete."
5. **Take a quiz** at the end of a module, multiple-choice questions, submit, and see the score immediately along with which answers were right or wrong and why.
6. **Submit an assignment**, a text response and/or a link (e.g. a GitHub repo), and later see their score and the instructor's written feedback once it's graded.

Every one of those actions is backed by real data that persists, closing the browser and coming back later shows exactly where they left off.

## What an instructor (admin) can do

1. **See every learner** in one table, name, email, course progress, quiz average, assignments graded, and when they were last active.
2. **Click into any learner** for the full picture: module-by-module progress, every quiz attempt, every assignment score and feedback.
3. **Enroll a learner** into the course with one click (no more manually editing the database by hand, which is how this was done in early development).
4. **Edit the course**, change the course description, publish/unpublish it, and add, edit, delete or reorder modules and lessons, including the lesson video and written content.
5. **Grade submissions**, a queue of everything waiting for review, with a score + feedback box right there.
6. **Manage cohorts**, group learners into named batches ("Cohort 1", "Cohort 2"...) and see per-cohort stats: how many people, their average progress, average quiz score, and what percentage have finished.

## What isn't built yet (on purpose)

A few things were deliberately left out of this first version, rather than being half-built:

- **Uploading files** for an assignment, right now a learner submits text or a link, not a file. This needs a storage feature that hasn't been wired up yet.
- **Building a brand-new quiz from scratch** in the admin screen, instructors can edit an existing quiz's title, description and pass mark, but adding new questions still needs to be built.
- **More than one course** running at once, the platform supports it structurally, but the admin screens have only been tested against the single bootcamp course so far.

None of these block using the platform for the current bootcamp, they're the natural next additions.

---

## How it's built (without the jargon)

- **The website** is built with a modern web framework called Next.js, this is what makes pages load fast and lets learners and instructors do things (submit a quiz, grade an assignment) without the whole page reloading.
- **The database** is hosted by a service called Supabase, think of it as a secure filing cabinet that stores every course, lesson, learner, quiz score and grade, and also handles the login system (passwords, sessions, password resets) so we didn't have to build that from scratch.
- **The security model**: every single piece of data has a rule attached to it, enforced directly by the database, "a learner can only read their own progress," "only an instructor can grade a submission," and so on. This means even if there were a bug in the website's code, someone couldn't see another learner's private data, because the database itself refuses the request.
- **The visual design** (the "1501 Learn" logo, the black/gold/cream color scheme, and the elegant serif headline font) was built from a logo image you provided, with the exact colors sampled directly from it.

## How this was built, six stages, each checked before moving on

Rather than building everything at once, the platform was built in six stages, each one tested against the real database before starting the next:

1. **Foundation**, the website itself, accounts/login, and the database with all its security rules.
2. **Core learning experience**, browsing the course, reading lessons, watching videos, tracking progress.
3. **Quizzes & assignments**, taking a quiz and getting scored, submitting an assignment, instructors grading it.
4. **Admin tools**, the learner list, learner detail pages, and the course editor.
5. **Cohorts**, grouping learners and seeing group-level stats.
6. **Polish**, loading indicators, friendly error pages, confirmation prompts before deleting anything, keyboard/screen-reader accessibility, and a mobile-friendly layout.

At every stage, real test accounts were used to prove things worked end-to-end against the live database, not just "the code compiles," but "a learner really can submit a quiz and see the right score," "an instructor really can grade an assignment and the learner really does see the feedback," and so on.

## Trying it yourself

Full setup instructions (creating the database, running it locally) are in `app/README.md`. Once it's running, sign up for your own account to try the learner experience, or ask about the test accounts already set up if you just want to click around without signing up fresh.
