---
module: 2
title: Git & GitHub
optional: false
summary: Learn the version control habits every analytics engineer relies on. You install Git, record your work in commits, keep secrets and data out of your repository, branch and merge (including fixing a merge conflict), and use GitHub to push code, open pull requests and review changes. By the end you have a `shoplink-analytics` repository that will hold all your ShopLink work for the rest of the course.
---

# Lesson: Git fundamentals: repositories, commits and .gitignore

minutes: 55

## Why analytics engineers use Git

Imagine ShopLink's revenue number changes overnight and nobody knows why. Someone edited a SQL file, but which file, what did they change, and what did it say before? Without version control, the answer is "nobody knows". With Git, the answer is one command away.

Git is a version control system. It keeps a full history of every change to the files in a folder, who made it, when, and why. For an analytics engineer that history is not a nice extra. It is how you:

- **Undo mistakes.** A bad change to a revenue model can be reverted in seconds.
- **Explain numbers.** When finance asks why March revenue moved, you can show the exact commit that changed the definition.
- **Work with others.** Several people can change the same project without overwriting each other.
- **Ship safely.** Every change to production goes through review first, which you will set up in this module.

Git runs on your computer. GitHub, which you meet in lesson 3, is a website that hosts Git repositories online so teams can share them.

## Install and configure Git

Install Git for your operating system:

| System | How to install |
|---|---|
| Windows | Download the installer from git-scm.com and accept the defaults. It includes Git Bash and Git Credential Manager, which you will use to log in to GitHub. You can also run `winget install --id Git.Git -e` in PowerShell. |
| macOS | Run `xcode-select --install` in Terminal, or `brew install git` if you use Homebrew. |
| Linux (Ubuntu or Debian) | Run `sudo apt update && sudo apt install git`. |

Open a new terminal (Git Bash or PowerShell on Windows, Terminal on macOS or Linux) and check it worked:

```bash
git --version
```

Now tell Git who you are. Every commit you make is stamped with this name and email, so use the email you will use for GitHub:

```bash
git config --global user.name "Ada Okafor"
git config --global user.email "ada.okafor@example.com"
git config --global init.defaultBranch main
git config --global --list
```

The third line makes new repositories start on a branch called `main`, which is what GitHub uses.

## Create a repository

A repository (repo) is a folder whose history Git is tracking. Create one for your ShopLink work:

```bash
mkdir shoplink-analytics
cd shoplink-analytics
git init
```

`git init` creates a hidden `.git` folder. That folder is the repository: it holds every version of every file. Never edit or delete it by hand.

## The three places a change lives

Git has three areas, and most confusion comes from forgetting which one a change is in:

| Area | What it is | How a change gets there |
|---|---|---|
| Working directory | The files you see and edit | You edit a file |
| Staging area | Changes you have chosen for the next commit | `git add` |
| Repository | Permanent, recorded history | `git commit` |

Staging exists so you can choose what goes into each commit. If you fixed a typo in the README and also started a half-finished SQL file, you can commit the README fix alone.

## Your first commit

Create a README file with any text editor (VS Code is a good free choice) and save it in the folder:

```markdown
# shoplink-analytics

Analytics engineering project for ShopLink Distribution, a Lagos electronics distributor.
```

Then check the state of the repo, stage the file and commit it:

```bash
git status
git add README.md
git status
git commit -m "Add README"
git log --oneline
```

`git status` is the command you will run most. Before `git add` it lists README.md as untracked; after, it shows it as a change to be committed. `git log --oneline` shows one line per commit, newest first:

```text
3f9c2a1 (HEAD -> main) Add README
```

The code at the start is the commit's ID (a shortened hash). You can use it to look at or undo that exact commit later.

Two more commands you will use every day:

```bash
git diff            # changes in your working directory that are not staged yet
git diff --staged   # changes that are staged and will go into the next commit
```

## Writing good commit messages

A commit message is a note to your future self and your teammates. Write it in the imperative, as if completing the sentence "This commit will...":

| Weak | Better |
|---|---|
| `update` | `Add row count checks to load script` |
| `fixed stuff` | `Exclude returned orders from net revenue` |
| `wip` | `Draft customer profiling queries` |

Keep the first line under about 60 characters. If the change needs explaining, leave a blank line and add a short paragraph on why you made it.

## What never goes into Git

Git keeps everything forever. Once a password is in a commit and that commit is pushed to GitHub, you must assume it has been seen, even if you delete it in a later commit. Anything in this list must stay out of your repository:

- **Credentials and secrets**: `.env` files, API keys, database passwords, private keys. In Module 9 you will connect to Snowflake, and that password must never be committed.
- **Data files**: CSV extracts and database files. They are large, they change constantly, and in a real company they contain customer information. Your repository holds the code that builds the data, not the data itself.
- **Generated output**: folders that tools rebuild on every run, such as dbt's `target/` and `logs/`.
- **Local clutter**: virtual environments, editor settings, `.DS_Store` on macOS, `Thumbs.db` on Windows.

If you ever commit a secret by accident, treat it as leaked: change the password or revoke the key first, then remove the file.

## .gitignore

A `.gitignore` file in the root of the repo lists patterns that Git should ignore. Ignored files never show up in `git status`, so you cannot add them by accident. Here is the `.gitignore` you will use for ShopLink, which already covers the DuckDB database from Module 3 and the dbt project from Module 6:

```text
# Secrets: never commit these
.env
.env.*

# Local data: the CSVs are downloaded, not versioned
data/

# DuckDB database files
*.duckdb
*.duckdb.wal

# dbt build output and installed packages
target/
dbt_packages/
logs/

# Python
.venv/
venv/
__pycache__/

# Operating system and editor clutter
.DS_Store
Thumbs.db
.vscode/
```

A few rules for reading patterns: a trailing `/` matches a folder, `*` matches anything, and `#` starts a comment.

`.gitignore` only affects files Git is not already tracking. If you committed a file before ignoring it, stop tracking it with `git rm --cached <file>` and commit. To check why a file is ignored, run `git check-ignore -v <file>`.

## Resources

- docs: [Pro Git: Getting a Git Repository](https://git-scm.com/book/en/v2/Git-Basics-Getting-a-Git-Repository) · git-scm.com · Chapter 2 of the free official book. Read this section and the next one, Recording Changes to the Repository.
- docs: [Pro Git: Recording Changes to the Repository](https://git-scm.com/book/en/v2/Git-Basics-Recording-Changes-to-the-Repository) · git-scm.com · Status, staging, committing and ignoring files, in depth.
- docs: [Ignoring files](https://docs.github.com/en/get-started/git-basics/ignoring-files) · GitHub Docs · How .gitignore works, with GitHub's own templates.
- watch: [Git Explained in 100 Seconds](https://www.youtube.com/watch?v=hwP7WQkmECE) · Fireship · 4.28M subscribers · 831K views · 27,338 likes · published 2020-03-02 · checked 2026-09-27 · 2 min
- watch: [Git and GitHub for Beginners - Crash Course](https://www.youtube.com/watch?v=RGOj5yH7evk) · freeCodeCamp.org · 11.9M subscribers · 5.1M views · 108,062 likes · published 2020-05-28 · checked 2026-09-27 · 68 min
- read: [How to Write a Git Commit Message](https://cbea.ms/git-commit/) · Chris Beams · The seven rules most teams follow for commit messages.
- deeper: [Pro Git (full book)](https://git-scm.com/book/en/v2) · Scott Chacon and Ben Straub, free · Chapters 1 to 3 cover everything in this module and more.

## Practice

1. Install Git, configure your name and email, and set `main` as the default branch.
2. Create the `shoplink-analytics` folder, run `git init`, and commit a short README.
3. Add the `.gitignore` above and commit it with a clear message.
4. Test that it works. Create a file called `.env` containing `SNOWFLAKE_PASSWORD=not-a-real-password`, a folder `data/` with any file in it, and an empty file called `test.duckdb`. Run `git status`. None of the three should appear.
5. Run `git log --oneline` and write down how many commits you have.

## Example answer

After step 4, `git status` should say there is nothing to commit, because every new file is ignored:

```bash
$ git status
On branch main
nothing to commit, working tree clean

$ git check-ignore -v .env test.duckdb data/notes.txt
.gitignore:2:.env	.env
.gitignore:9:*.duckdb	test.duckdb
.gitignore:6:data/	data/notes.txt

$ git log --oneline
b71e0d4 (HEAD -> main) Add .gitignore for secrets, data and dbt output
3f9c2a1 Add README
```

Your commit IDs and line numbers will differ. If `.env` appeared in `git status`, check that the file is named exactly `.gitignore` (Windows sometimes saves it as `.gitignore.txt`) and that it sits in the root of the repo, next to README.md. Delete the fake `.env` and `test.duckdb` when you are done.

# Lesson: Branching and merging

minutes: 50

## What a branch is

A branch is a separate line of work. When you create a branch, you get a safe copy of the project's history to change as you like, while `main` stays exactly as it was. When the work is finished and checked, you merge the branch back into `main`.

Analytics teams treat `main` as the version that is trusted, the code that builds the tables the business uses. Nobody edits `main` directly. Every change, even a one-line fix, happens on a branch first.

Under the hood a branch is just a label pointing at a commit. That is why creating one is instant, even in a huge project.

## Creating and switching branches

```bash
git branch                          # list branches; * marks the one you are on
git switch -c docs/describe-tables  # create a new branch and switch to it
git switch main                     # switch back to main
git switch docs/describe-tables     # and back again
```

You may see older tutorials use `git checkout -b`. It does the same thing; `git switch` is the newer, clearer command.

Name branches so a teammate can guess what is on them. A common pattern is a type, a slash and a short description:

| Prefix | Use it for | Example |
|---|---|---|
| `feature/` | New models or analysis | `feature/monthly-revenue` |
| `fix/` | Correcting something wrong | `fix/exclude-returned-orders` |
| `docs/` | Documentation only | `docs/describe-tables` |

## Merging

On your branch, make a change and commit it. For example, add a section to the README describing ShopLink's orders table, then:

```bash
git add README.md
git commit -m "Describe the orders table in README"
```

To bring that work into `main`, switch to `main` and merge the branch in:

```bash
git switch main
git merge docs/describe-tables
git log --oneline --graph --all
git branch -d docs/describe-tables
```

If `main` has not changed since you branched, Git does a **fast-forward**: it simply moves the `main` label forward to your latest commit. If both branches have new commits, Git creates a **merge commit** that joins the two lines of history. `git log --oneline --graph --all` draws the history so you can see which happened. `git branch -d` deletes the branch label once its work is safely merged.

In a team you will rarely run `git merge` into `main` yourself. You will merge through a pull request on GitHub, which you learn in the next lesson. But the idea is the same, and you still merge locally when you bring the latest `main` into your own branch.

## Merge conflicts

A conflict happens when two branches change the same lines of the same file. Git cannot know which version is right, so it stops and asks you. Conflicts are normal, not a sign that you did something wrong.

Here is one, step by step. Start on `main` with a README that contains this line:

```markdown
ShopLink's app database has five core tables.
```

**Step 1. Make two branches that change the same line.**

```bash
git switch -c docs/duckdb-note
# edit the line to: ShopLink's app database has five core tables, loaded into DuckDB.
git commit -am "Mention DuckDB in README"

git switch main
git switch -c docs/refresh-note
# edit the same line to: ShopLink's app database has five core tables, refreshed daily.
git commit -am "Mention daily refresh in README"
```

`git commit -am` stages every tracked file that changed and commits in one step. It does not pick up new, untracked files.

**Step 2. Merge both into main.** The first merge is clean. The second conflicts:

```bash
git switch main
git merge docs/duckdb-note
git merge docs/refresh-note
```

```text
Auto-merging README.md
CONFLICT (content): Merge conflict in README.md
Automatic merge failed; fix conflicts and then commit the result.
```

**Step 3. Open the file.** Git has written both versions into it, between conflict markers:

```text
<<<<<<< HEAD
ShopLink's app database has five core tables, loaded into DuckDB.
=======
ShopLink's app database has five core tables, refreshed daily.
>>>>>>> docs/refresh-note
```

The part above `=======` is what is already on the branch you are merging into (`HEAD`, here `main`). The part below is what the incoming branch wants.

**Step 4. Decide and edit.** Keep one side, the other, or a combination, and delete all three marker lines. Here both facts are true, so combine them:

```markdown
ShopLink's app database has five core tables, refreshed daily and loaded into DuckDB.
```

**Step 5. Mark it resolved and finish the merge.**

```bash
git add README.md
git commit --no-edit
git log --oneline --graph
```

`git commit --no-edit` completes the merge with Git's default message. If you get lost halfway, `git merge --abort` puts everything back to how it was before the merge.

VS Code highlights conflicts and offers buttons such as "Accept Current Change" and "Accept Both Changes". They edit the same markers for you. Whichever tool you use, read the result before you commit: a conflict in a SQL file resolved carelessly can leave a query that runs but gives the wrong number.

## Keeping your branch up to date

While you work on a branch, teammates merge their own work into `main`. Bring those changes into your branch regularly so conflicts stay small:

```bash
git switch main
git pull                  # get the latest main from GitHub (next lesson)
git switch feature/monthly-revenue
git merge main
```

## Resources

- docs: [Pro Git: Basic Branching and Merging](https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging) · git-scm.com · Branches, fast-forwards, merge commits and conflicts with worked examples.
- docs: [Pro Git: Branches in a Nutshell](https://git-scm.com/book/en/v2/Git-Branching-Branches-in-a-Nutshell) · git-scm.com · Why a branch is only a pointer to a commit.
- watch: [Git Branching and Merging - Detailed Tutorial](https://www.youtube.com/watch?v=Q1kHG842HoI) · SuperSimpleDev · 829K subscribers · 347K views · 8,968 likes · published 2021-06-13 · checked 2026-09-27 · 54 min
- watch: [Git & GitHub Tutorial for Beginners #9 - Merging Branches (& conflicts)](https://www.youtube.com/watch?v=XX-Kct0PfFc) · Net Ninja · 1.9M subscribers · 501K views · 7,734 likes · published 2017-06-15 · checked 2026-09-27 · 8 min
- docs: [Resolving a merge conflict using the command line](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/addressing-merge-conflicts/resolving-a-merge-conflict-using-the-command-line) · GitHub Docs · The same steps as this lesson, for reference.

## Practice

In your `shoplink-analytics` repo:

1. Create a branch `docs/describe-tables`, add one sentence to the README about ShopLink's customers table, commit, and merge it into `main` locally. Note whether it was a fast-forward.
2. Recreate the conflict from this lesson on purpose: two branches, each changing the same README line differently. Merge both into `main`, resolve the conflict by combining the two versions, and finish the merge.
3. Run `git log --oneline --graph --all` and copy the output into a note.
4. Delete the branches you have merged.

## Example answer

After step 1, Git reports a fast-forward because `main` had not moved:

```text
Updating b71e0d4..c2d4e88
Fast-forward
 README.md | 2 ++
 1 file changed, 2 insertions(+)
```

After the conflict in step 2, the graph shows two lines of work joined by a merge commit:

```text
*   e81f3b7 (HEAD -> main) Merge branch 'docs/refresh-note'
|\
| * 9a0c6d2 (docs/refresh-note) Mention daily refresh in README
* | 5be1f40 (docs/duckdb-note) Mention DuckDB in README
|/
* c2d4e88 Describe the customers table in README
* b71e0d4 Add .gitignore for secrets, data and dbt output
* 3f9c2a1 Add README
```

Then clean up:

```bash
git branch -d docs/describe-tables docs/duckdb-note docs/refresh-note
```

Your IDs will differ, and your resolved sentence may be worded differently. What matters is that the final README contains no `<<<<<<<`, `=======` or `>>>>>>>` lines and that the merge commit exists in the log.

# Lesson: GitHub: remotes, pushing and pull requests

minutes: 55

## Git and GitHub are different things

Git is the tool on your laptop. GitHub is a service that hosts a copy of your repository online. The online copy is called a **remote**. Once your repo is on GitHub:

- your work is backed up if your laptop dies;
- teammates can get your code and send you theirs;
- changes can be reviewed in pull requests before they reach `main`;
- employers can see your work. Your `shoplink-analytics` repo becomes a portfolio piece.

GitLab and Bitbucket do the same job. The Git commands are identical; only the website differs.

## Create the repository on GitHub

1. Sign up at github.com if you do not have an account. Choose a professional username: it will appear in every link you share.
2. Click **New repository**. Name it `shoplink-analytics`.
3. Choose **Public** so you can share it as a portfolio piece. ShopLink is fictional and your data folder is ignored, so nothing sensitive will be published. In a real job, company repositories are private.
4. Leave "Add a README", ".gitignore" and "license" **unticked**. You already have a README and .gitignore locally, and starting with an empty GitHub repo avoids a clash between two unrelated histories.
5. Click **Create repository**. GitHub shows the URL of your new remote, such as `https://github.com/ada-okafor/shoplink-analytics.git`.

## Connect and push

In your local repo, add the remote and push `main` to it:

```bash
git remote add origin https://github.com/ada-okafor/shoplink-analytics.git
git remote -v
git push -u origin main
```

`origin` is the conventional name for your main remote. The `-u` flag links your local `main` to `origin/main`, so from now on a plain `git push` or `git pull` knows where to go.

The first push asks you to log in:

- **Windows**: Git Credential Manager (installed with Git) opens a browser window. Sign in to GitHub and approve. Your login is stored securely for next time.
- **macOS and Linux**: the simplest route is the GitHub CLI. Install it from cli.github.com, run `gh auth login`, and choose HTTPS and "Login with a web browser".

GitHub does not accept your account password for Git commands. If you are asked for a password in the terminal, use one of the options above or a personal access token.

Refresh the GitHub page and your README appears.

## Clone, pull and fetch

To get a copy of a repository that already exists on GitHub, clone it:

```bash
git clone https://github.com/ada-okafor/shoplink-analytics.git
```

Cloning sets up `origin` for you. Later, to get changes others have pushed:

```bash
git pull     # download new commits and merge them into your current branch
git fetch    # download new commits but do not merge; inspect them first
```

A good daily habit: `git switch main` and `git pull` before you start a new branch, so you always branch from the latest code.

## Pull requests

A pull request (PR) is a request to merge one branch into another, usually a feature branch into `main`, with a page on GitHub where the change can be discussed, reviewed and approved before it is merged. For analytics engineers, PRs are the quality gate: no change to the trusted models reaches `main` without one.

The flow:

```bash
git switch main
git pull
git switch -c docs/describe-tables
# edit README.md
git add README.md
git commit -m "Describe ShopLink's five source tables in README"
git push -u origin docs/describe-tables
```

Then on GitHub:

1. A yellow banner offers **Compare & pull request**. Click it (or go to the Pull requests tab and click **New pull request**).
2. Check the direction: **base** is `main` (where the change is going), **compare** is your branch (where it comes from).
3. Write a title and description (see below) and click **Create pull request**.
4. Review the **Files changed** tab yourself before asking anyone else. You will often spot a stray line or typo.
5. When the reviewer approves, click **Merge pull request**.

If you installed the GitHub CLI you can do steps 1 to 3 from the terminal with `gh pr create`.

After merging, tidy up locally:

```bash
git switch main
git pull
git branch -d docs/describe-tables
```

GitHub offers a **Delete branch** button on the merged PR to remove the remote copy.

## Merge options

The green merge button has three options:

| Option | What happens | When teams use it |
|---|---|---|
| Create a merge commit | Keeps every commit from the branch plus a merge commit | When the individual commits tell a useful story |
| Squash and merge | Combines all the branch's commits into one commit on `main` | Common in analytics teams: one PR becomes one tidy commit |
| Rebase and merge | Replays the commits onto `main` without a merge commit | Teams that want a straight-line history |

For this course, squash and merge is a good default.

## Writing a good PR description

A reviewer should understand your change without asking you. A useful description answers four questions: what changed, why, how you checked it, and what the reviewer should look at closely.

```markdown
## What
Adds a "Source tables" section to the README describing ShopLink's five
tables (customers, products, warehouses, orders, order_lines), with the
grain and key columns of each.

## Why
New contributors need to know what each raw table contains before they
write any SQL. Closes #1.

## How I checked it
- Compared the column lists against the CSV headers in batch 1.
- Previewed the README on GitHub to check the table renders.

## Reviewer notes
Please check the "one row is..." descriptions, especially order_lines.
```

For SQL changes, "How I checked it" should include row counts or totals before and after the change. You will practise that in the next lesson.

## Resources

- docs: [About pull requests](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests) · GitHub Docs · What a PR is and how review, checks and merging fit together.
- docs: [Pro Git: Working with Remotes](https://git-scm.com/book/en/v2/Git-Basics-Working-with-Remotes) · git-scm.com · Remotes, fetch, pull and push explained properly.
- docs: [Getting started with Git](https://docs.github.com/en/get-started/learning-to-code/getting-started-with-git) · GitHub Docs · GitHub's own beginner guide to using Git with GitHub.
- docs: [Getting started with GitHub](https://docs.github.com/en/get-started) · GitHub Docs · Accounts, repositories and settings.
- watch: [How to create a pull request in 4 min | GitHub for Beginners](https://www.youtube.com/watch?v=nCKdihvneS0) · GitHub · 689K subscribers · 321K views · 4,065 likes · published 2024-08-12 · checked 2026-09-27 · 4 min
- docs: [GitHub CLI quickstart](https://docs.github.com/en/github-cli/github-cli/quickstart) · GitHub Docs · Log in with `gh auth login` and open PRs from the terminal.

## Practice

1. Create an empty public `shoplink-analytics` repo on GitHub and push your local `main` to it.
2. Create a branch `docs/describe-tables`. In the README, add a "Source tables" section with a markdown table describing ShopLink's five tables: the table name, what one row is, and its key columns. Use Module 1's "Meet ShopLink" lesson as your source.
3. Push the branch and open a pull request into `main` with a description that follows the What / Why / How I checked it / Reviewer notes pattern.
4. Review your own PR in the Files changed tab, leave at least one comment on a line, then squash and merge it.
5. Update your local `main` and delete the branch.

## Example answer

The README section could look like this:

```markdown
## Source tables

ShopLink's app database has five core tables, delivered as CSV extracts.

| Table | One row is... | Key columns |
|---|---|---|
| customers | a customer account | customer_id, customer_name, customer_type, city, state |
| products | a product ShopLink sells | product_id, product_name, category, brand, unit_cost, list_price |
| warehouses | a warehouse | warehouse_id, warehouse_name, city, state |
| orders | an order placed by a customer | order_id, customer_id, warehouse_id, order_date, status, channel |
| order_lines | one product on an order | order_line_id, order_id, product_id, quantity, unit_price, discount_pct |

Revenue is not stored. Net revenue for a line is
quantity * unit_price * (1 - discount_pct / 100), excluding cancelled and returned orders.
```

The commands, end to end:

```bash
git remote add origin https://github.com/ada-okafor/shoplink-analytics.git
git push -u origin main
git switch -c docs/describe-tables
git add README.md
git commit -m "Describe ShopLink's five source tables in README"
git push -u origin docs/describe-tables
# open the PR on GitHub, review, squash and merge
git switch main
git pull
git branch -d docs/describe-tables
```

A good self-review comment is specific, for example on the order_lines row: "Worth noting that order_lines can contain duplicates, check in Module 3." If `git branch -d` complains that the branch is not fully merged, that is because squash merging creates a new commit on `main`. Once you have checked the PR is merged on GitHub, `git branch -D docs/describe-tables` deletes it anyway.

# Lesson: Collaboration workflows for analytics

minutes: 45

## The feature branch workflow

Most analytics teams, and the dbt community, use a simple workflow often called GitHub flow:

1. `main` always contains working, reviewed code. It is what production runs.
2. For every piece of work, create a short-lived branch from the latest `main`.
3. Commit small, clear steps on the branch.
4. Push and open a pull request early, even as a draft, so others can see what you are doing.
5. A teammate reviews. Automated checks run (later in the course, your dbt tests run at this step).
6. Merge into `main`, delete the branch, start the next one.

Short-lived is the key word. A branch that lives for three weeks drifts far from `main` and ends in a painful merge. Aim for branches that last a day or two and PRs a reviewer can read in fifteen minutes.

## Reviewing SQL changes

Code review in analytics is different from code review in software. The SQL might run perfectly and still produce the wrong number. A reviewer's real question is: **will the data be correct after this change?**

What experienced reviewers look for:

| Check | Why it matters | What to ask |
|---|---|---|
| Row counts | A join that suddenly multiplies or drops rows is the most common analytics bug | "How many rows before and after? Does orders still have one row per order_id?" |
| Grain | Mixing order-level and line-level data double counts | "What does one row of this model represent?" |
| Join keys and join type | A wrong key or an INNER JOIN where a LEFT JOIN was needed silently loses data | "Why INNER here? What happens to orders with no customer?" |
| Filters and definitions | Business rules hide in WHERE clauses | "Are cancelled and returned orders excluded? Is status cleaned first?" |
| NULL handling | `NULL` behaves unexpectedly in comparisons and averages | "What happens to the 12 customers with no city?" |
| Hard-coded values | Dates or IDs typed into SQL break silently later | "Why is 2026-06-30 hard-coded?" |
| Readability | The next person has to maintain it | "Could this subquery be a named CTE?" |
| Performance | Wasteful queries cost money on a cloud warehouse | "Do we need `SELECT *` here?" |

As the author, make review easy. Put the evidence in the PR description:

```markdown
## How I checked it
| Check | Before | After |
|---|---|---|
| Rows in order_lines | 26,779 | 26,773 (6 exact duplicates removed) |
| Lines with quantity 0 or less | 2 | 0 (filtered out) |
| Net revenue 2025 | ₦165.37bn | ₦165.32bn |
| Distinct order_id | 9,091 | 9,091 |
```

A before and after table like this lets the reviewer see the effect of your change in seconds. If a number moves, the description should say why it moved.

When you review, be kind and specific. "This join fans out: order_lines has several rows per order, so SUM(order_total) counts each order several times" is useful. "This is wrong" is not. GitHub lets you comment on single lines, suggest an exact replacement, and finish with **Approve** or **Request changes**.

## Issues and project boards

GitHub Issues are a to-do list attached to the repository. Each issue describes one piece of work: a new model, a bug, a question from a stakeholder.

A good issue for ShopLink:

```markdown
Title: Monthly net revenue by state

Requested by: Head of Sales
Question: Which states bring in the most net revenue each month?
Definition: Net revenue excludes cancelled and returned orders.
Open questions: Use the customer's state or the warehouse's state?
Done when: Query is merged and the result is shared with Sales.
```

Link a pull request to an issue by writing `Closes #4` in the PR description. When the PR merges, GitHub closes issue 4 automatically, and anyone reading the issue can find the code that answered it.

GitHub Projects turns issues into a board with columns such as **To do**, **In progress**, **In review** and **Done**. Many analytics teams run their whole backlog this way. For your own ShopLink work, a board with one issue per module project is a simple way to track progress.

## Protecting main

In a team repository, an admin turns on branch protection for `main` so that nobody can push to it directly. Typical rules: changes must come through a pull request, at least one approval is required, and automated checks must pass. You can set this up on your own repo under Settings, then Branches (or Rules), to practise the habit, even though you will approve your own PRs.

## Version control as part of analytics

Once all of your SQL lives in Git, some useful things become possible:

- **An audit trail for definitions.** When the revenue definition changes, the PR that changed it records who, when, why and who approved it.
- **Blame for numbers.** `git log -p models/revenue.sql` or the Blame view on GitHub shows every change to a file, line by line.
- **Safe rollback.** `git revert <commit>` creates a new commit that undoes a bad change without rewriting history.
- **Reproducibility.** Anyone can clone the repo and rebuild exactly the same tables. You will rely on this from Module 3 onwards.

## Resources

- docs: [GitHub flow](https://docs.github.com/en/get-started/using-github/github-flow) · GitHub Docs · The branch, pull request, review and merge workflow in six steps.
- read: [Git feature branch workflow](https://www.atlassian.com/git/tutorials/comparing-workflows/feature-branch-workflow) · Atlassian · A clear walkthrough of the workflow with a worked team example.
- docs: [About pull request reviews](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/about-pull-request-reviews) · GitHub Docs · Comments, suggestions, approvals and requested changes.
- docs: [About Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects) · GitHub Docs · Boards and tables built from your issues.
- docs: [Linking a pull request to an issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue) · GitHub Docs · The keywords such as `Closes #4` that close issues on merge.
- docs: [About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) · GitHub Docs · Require pull requests and approvals before merging to main.
- docs: [Git and GitHub learning resources](https://docs.github.com/en/get-started/start-your-journey/git-and-github-learning-resources) · GitHub Docs · GitHub's curated list for going further.

## Practice

A teammate at ShopLink opens a pull request with this change to a query that counts orders per warehouse. Review it as if you were the approver. Write three review comments and decide whether to approve or request changes.

```sql
-- Before
SELECT warehouse_id, count(*) AS orders
FROM raw.orders
WHERE lower(trim(status)) NOT IN ('cancelled', 'returned')
GROUP BY warehouse_id;

-- After: "add revenue to the warehouse summary"
SELECT
    o.warehouse_id,
    count(*) AS orders,
    sum(ol.quantity * ol.unit_price) AS revenue
FROM raw.orders AS o
JOIN raw.order_lines AS ol ON o.order_id = ol.order_id
WHERE o.status NOT IN ('cancelled', 'returned')
GROUP BY o.warehouse_id;
```

Then, in your own repo, create two issues (for example "Load ShopLink raw data into DuckDB" and "Answer the five leadership questions") and a project board with To do, In progress and Done columns.

## Example answer

Request changes. Three comments a strong reviewer would leave:

1. **Row explosion on `count(*)`.** "After joining to order_lines there is one row per line, not per order, so `orders` now counts lines, roughly three times too many. Use `count(DISTINCT o.order_id)`, or aggregate order_lines to one row per order before joining."
2. **Status cleaning removed.** "The old query used `lower(trim(status))`. Without it, values such as 'Cancelled' and ' cancelled' slip through the filter and are counted as revenue. Please restore the cleaning."
3. **Revenue ignores the discount.** "Net revenue is `quantity * unit_price * (1 - discount_pct / 100)`. This is gross revenue, so it will not match finance. Rename it `gross_revenue` or apply the discount."

Other valid comments: order_lines contains six exact duplicate rows that should be removed first; the PR description should include before and after row counts; `revenue` as a name is ambiguous. A corrected version:

```sql
WITH order_totals AS (
    SELECT
        order_id,
        sum(quantity * unit_price * (1 - discount_pct / 100)) AS net_revenue
    FROM (SELECT DISTINCT * FROM raw.order_lines)
    WHERE quantity > 0
    GROUP BY order_id
)

SELECT
    o.warehouse_id,
    count(*) AS orders,
    sum(ot.net_revenue) AS net_revenue
FROM raw.orders AS o
JOIN order_totals AS ot ON o.order_id = ot.order_id
WHERE lower(trim(o.status)) NOT IN ('cancelled', 'returned')
GROUP BY o.warehouse_id;
```

Because `order_totals` has exactly one row per order, the join cannot multiply orders and `count(*)` is correct again. You will run queries like this yourself in Modules 3 and 4.

# Quiz

passing_score: 70

### You ran `git add model.sql` but have not committed yet. Where is the change?

- [ ] Only in the working directory
- [x] In the staging area, ready for the next commit
- [ ] In the repository history
- [ ] On GitHub

> `git add` moves a change into the staging area. It only becomes part of the permanent history when you run `git commit`, and only reaches GitHub when you push.

### Which of these should be listed in the ShopLink project's .gitignore?

- [ ] README.md
- [ ] The SQL load script
- [x] `.env`, `*.duckdb` and dbt's `target/` folder
- [ ] .gitignore itself

> Secrets, local database files and generated build output never belong in the repository. The code that builds the data, such as SQL scripts, is exactly what should be committed.

### During a merge, Git reports a conflict in README.md. What do you do?

- [ ] Delete the repository and clone it again
- [ ] Run `git push --force`
- [x] Edit the file to keep the right content, remove the conflict markers, then `git add` and commit
- [ ] Ignore it; Git will pick the newest version automatically

> Git cannot decide between two changes to the same lines, so you choose. After editing out the `<<<<<<<`, `=======` and `>>>>>>>` markers, staging the file marks the conflict as resolved and committing completes the merge.

### A teammate's PR joins orders to order_lines and the query's `count(*)` of orders jumps from about 9,000 to about 27,000. What is the most likely cause?

- [ ] The warehouse has more orders than before
- [x] The join changed the grain to one row per order line, so orders are counted once per line
- [ ] DuckDB counts NULLs twice
- [ ] The PR was merged with squash and merge

> Each order has several lines, so after the join every order appears several times. Checking row counts before and after a change is one of the most valuable things a SQL reviewer does.

### Why do analytics teams merge changes to main through pull requests rather than pushing directly?

- [ ] Pull requests make queries run faster
- [ ] GitHub charges less for pull requests
- [x] A pull request lets someone review the change and its effect on the data before it reaches the trusted code
- [ ] Git cannot merge branches without GitHub

> `main` holds the code that builds the tables the business trusts. A pull request adds review, discussion and automated checks before anything changes there, and leaves a record of who approved what.

# Project: Set up the shoplink-analytics repository

max_score: 100

## Brief

Every piece of ShopLink work you do from now on lives in one GitHub repository. In this project you create it properly: a README that tells a new teammate what ShopLink's data looks like, a `.gitignore` that keeps secrets and data out, and your first change merged through a reviewed pull request. Modules 3 to 10 add to this same repo.

## Deliverables

1. **A public GitHub repository named `shoplink-analytics`.**
2. **A README.md on `main`** containing:
   - a one-paragraph description of ShopLink Distribution and what this project will build;
   - a table describing ShopLink's five source tables (customers, products, warehouses, orders, order_lines): what one row is, and the key columns;
   - the net revenue definition in one sentence;
   - a planned folder structure, for example `load/` for Module 3 load scripts and `analysis/` for Module 4 queries.
3. **A .gitignore on `main`** that ignores at least `.env`, `data/`, `*.duckdb`, `target/`, `dbt_packages/` and `logs/`.
4. **At least one merged pull request** from a feature branch into `main`, with a description following the What / Why / How I checked it / Reviewer notes pattern, and at least one review comment (from you or a peer).
5. **A clean history**: at least four commits in total with clear, imperative commit messages, and no secrets or data files anywhere in the history.

Optional: a GitHub project board or two issues planning your Module 3 and 4 work, and branch protection on `main`.

## How to submit

Paste the link to your repository (for example `https://github.com/ada-okafor/shoplink-analytics`) into the submission form, and paste the link to your merged pull request in the note. If a peer reviewed your PR, name them in the note.

## Grading guide

| Criterion | Points |
|---|---|
| README describes ShopLink and all five tables accurately, with grain and key columns | 25 |
| .gitignore covers secrets, data, DuckDB files and dbt output, and nothing sensitive is committed | 20 |
| Work arrived on main through a feature branch and a merged pull request | 20 |
| PR description explains what, why and how it was checked, and includes a review comment | 20 |
| Commit history is clean, with clear imperative messages | 15 |
