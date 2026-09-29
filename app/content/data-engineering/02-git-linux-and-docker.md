---
module: 2
title: Git, Linux & Docker
optional: false
summary: Set up the working environment every data engineer relies on. You learn the Linux command line (in WSL 2 on Windows), record your work with Git, branch and merge through pull requests on GitHub, and run software in Docker containers. By the end you have a `shoplink-data-platform` repository with PostgreSQL running in Docker Compose, which holds all your ShopLink work for the rest of the track.
---

# Lesson: The command line and Linux (WSL on Windows)

minutes: 60

## Why data engineers live in the terminal

Almost everything a data engineer runs lives on Linux: the servers pipelines run on, the Docker containers they are packaged in, Airflow, Spark and Kafka. Most of it has no graphical interface. You start it, stop it, read its logs and fix it from a terminal. The sooner typing commands feels normal, the easier the rest of this track becomes.

From this lesson on, every command in the track is written for **bash**, the standard Linux shell.

## Set up your terminal

| System | What to do |
|---|---|
| Windows 10 (version 2004 or later) or 11 | Install WSL 2 with Ubuntu, below |
| macOS | Use the built-in Terminal app. macOS is Unix underneath, so the commands work; the default shell is zsh, which behaves like bash for everything in this track |
| Linux | Use your normal terminal |

**WSL 2 on Windows.** Windows Subsystem for Linux runs a real Ubuntu Linux inside Windows. Open PowerShell as administrator (right-click the Start button, choose Terminal (Admin)) and run:

```powershell
wsl --install
```

Restart when asked. After the restart an Ubuntu window opens and asks you to create a Linux username and password. This password is for `sudo` inside Ubuntu; it does not need to match your Windows one, but do not forget it. Then check you are on WSL version 2 by running this in PowerShell:

```powershell
wsl -l -v
```

The `VERSION` column should say 2. If it says 1, run `wsl --set-version Ubuntu 2`. From now on, open **Ubuntu** from the Start menu (or a new Ubuntu tab in Windows Terminal) whenever the track says "terminal".

Two rules that save Windows learners a lot of pain:

1. **Keep your work in the Linux home folder** (`~`, which is `/home/<your-linux-username>`), not under `/mnt/c/...`. Files on the Windows drive are much slower from Linux, and tools such as Docker and Python virtual environments behave badly there. Your repo will live at `~/shoplink-data-platform`.
2. **Your Windows drive is still reachable** at `/mnt/c`. A file in your Windows Downloads folder is at `/mnt/c/Users/<your-windows-username>/Downloads/`. To open the current Linux folder in Windows Explorer, run `explorer.exe .`; to edit it in VS Code, install the WSL extension and run `code .`.

Finally, update Ubuntu's packages and install a few tools you need later:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y unzip git python3-venv python3-pip
```

`sudo` runs one command as the administrator (root). `apt` is Ubuntu's package manager.

## Finding your way around

| Command | What it does |
|---|---|
| `pwd` | Print the folder you are in (the working directory) |
| `ls` | List files; `ls -l` shows details, `ls -a` shows hidden files (names starting with `.`) |
| `cd folder` | Change into a folder; `cd ..` goes up one level, `cd ~` or plain `cd` goes home, `cd -` goes back |
| `mkdir -p a/b/c` | Make folders, including any parents that are missing |
| `touch file.txt` | Create an empty file (or update its timestamp) |
| `cp src dest` | Copy; `cp -r` copies a folder |
| `mv src dest` | Move or rename |
| `rm file` | Delete a file; `rm -r folder` deletes a folder. There is no recycle bin |
| `cat file` | Print a whole file |
| `less file` | Page through a file; press `q` to quit, `/word` to search |
| `head -n 5 file`, `tail -n 5 file` | First or last lines; `tail -f` follows a log as it grows |

Paths starting with `/` are absolute (from the root of the disk); anything else is relative to where you are. `~` is your home folder, `.` is the current folder, `..` is the parent. Press **Tab** to complete file names and **Up** to recall earlier commands; they save more time than any other habit.

## Get ShopLink's data onto Linux

Download [shoplink.zip](/datasets/shoplink.zip) and [shoplink-batch-2.zip](/datasets/shoplink-batch-2.zip) in your browser. On Windows they land in your Windows Downloads folder; copy them into Linux and unzip:

```bash
mkdir -p ~/downloads
cp /mnt/c/Users/<your-windows-username>/Downloads/shoplink*.zip ~/downloads/
cd ~/downloads
unzip shoplink.zip
unzip shoplink-batch-2.zip
ls -l shoplink shoplink-batch-2
```

On macOS or Linux, use `~/Downloads` directly. Each zip contains a folder of the same name (`shoplink/` and `shoplink-batch-2/`). In the Compose lesson you copy them into your repo's `data/` folder.

## Pipes and grep: questions without writing a program

Every command reads input and writes output. The **pipe** `|` sends one command's output into the next command's input, so small tools combine into powerful ones:

```bash
cd ~/downloads/shoplink
wc -l *.csv                               # lines per file (rows plus the header)
head -n 3 orders.csv                      # see the columns
grep -c ",whatsapp," orders.csv           # count lines containing ,whatsapp,
grep ",," customers.csv | head -n 3       # rows with an empty field
tail -n +2 orders.csv | cut -d, -f5 | sort | uniq -c | sort -rn
```

The last line reads: skip the header (`tail -n +2`), take the fifth comma-separated field (`cut -d, -f5`, the status), sort it, count each distinct value (`uniq -c`), and sort by count, largest first. On batch 1 it shows the 9,091 orders' status values in 24 different spellings: `delivered` 7,597, `Delivered` 260, `DELIVERED` 127, `" delivered"` 66 and so on. That is one of ShopLink's planted data problems, found in one line. Add `| tr -d '" ' | tr 'A-Z' 'a-z'` after the `cut` to normalise them, and five values remain: delivered 8,106, cancelled 562, returned 291, shipped 91 and pending 41.

Two more redirections you will use constantly:

```bash
grep -i "lagos" customers.csv > lagos_customers.csv   # > writes output to a file (overwrites)
echo "checked on $(date)" >> notes.txt               # >> appends
```

`cut -d,` is fine for a quick look, but it does not understand quoted fields that contain commas. For real parsing, use Python's `csv` module (Module 3).

## Permissions

Every file has an owner and permissions for reading, writing and executing. `ls -l` shows them:

```text
-rw-r--r-- 1 ada ada 550324 Aug  1 00:00 orders.csv
-rwxr-xr-x 1 ada ada    212 Sep 28 10:02 count_rows.sh
```

The first block reads as three groups of three: owner (`rw-`), group (`r--`), everyone else (`r--`). `r` is read, `w` write, `x` execute. A script needs `x` to run directly:

```bash
cat > count_rows.sh <<'EOF'
#!/usr/bin/env bash
# Print the number of data rows (not counting the header) in each CSV given.
for f in "$@"; do
  echo "$f: $(( $(wc -l < "$f") - 1 )) rows"
done
EOF
chmod +x count_rows.sh
./count_rows.sh ~/downloads/shoplink/*.csv
```

The first line (`#!/usr/bin/env bash`, the "shebang") tells Linux which program runs the script. "Permission denied" when running a script almost always means a missing `chmod +x`. When a file belongs to root, you need `sudo`; never fix permission problems with `chmod 777` on anything that matters.

## Environment variables

**Environment variables** are named values every program inherits from the shell that started it. Data tools use them for configuration, and above all for secrets, so passwords never appear in code:

```bash
echo $HOME                         # your home folder
echo $PATH                         # folders searched for commands, separated by :
export SHOPLINK_ENV=dev            # set a variable for this shell and anything it starts
echo "Running in $SHOPLINK_ENV"
env | grep SHOPLINK                # list matching variables
unset SHOPLINK_ENV                 # remove it
```

A variable set with `export` lasts until you close the terminal. To make one permanent, add the `export` line to `~/.bashrc`, which runs every time a terminal opens. For project settings and passwords you will use a `.env` file instead, starting in this module's Compose lesson.

## Resources

- docs: [How to install Linux on Windows with WSL](https://learn.microsoft.com/en-us/windows/wsl/install) · Microsoft Learn · The official install steps, including troubleshooting.
- docs: [Set up a WSL development environment](https://learn.microsoft.com/en-us/windows/wsl/setup/environment) · Microsoft Learn · Best practices: file storage, VS Code, Git and Docker with WSL.
- read: [The Linux command line for beginners](https://ubuntu.com/tutorials/command-line-for-beginners) · Ubuntu · A short, friendly tutorial covering navigation, files, pipes and sudo.
- watch: [The 50 Most Popular Linux & Terminal Commands - Full Course for Beginners](https://www.youtube.com/watch?v=ZtqBQ68cfJc) · freeCodeCamp.org · 11.9M subscribers · 2.9M views · 70.7K likes · published 2021-11-03 · checked 2026-09-28 · 300 min
- deeper: [The Linux Command Line](https://linuxcommand.org/tlcl.php) · William Shotts, free online · A complete book on bash, free to read; chapters 1 to 10 cover this lesson and more.

## Practice

In your terminal:

1. Install WSL 2 and Ubuntu if you are on Windows, and confirm `wsl -l -v` shows version 2.
2. Copy and unzip both ShopLink zips into `~/downloads`.
3. Using only shell commands, answer: how many data rows does each batch 1 file have? How many orders came through each channel (`web`, `whatsapp`, `sales_rep`)? How many customers have an empty city?
4. Write `count_rows.sh` from the lesson, make it executable and run it on both batches.
5. Set an environment variable `SHOPLINK_BATCH=shoplink-batch-2` and write a one-line command that uses it to count the orders in that batch.

## Example answer

```bash
cd ~/downloads/shoplink
wc -l *.csv
tail -n +2 orders.csv | cut -d, -f6 | sort | uniq -c
grep -c ",," customers.csv
```

`wc -l` prints 401, 26,780, 9,092, 121 and 6 lines for customers, order_lines, orders, products and warehouses: subtract the header for 400, 26,779, 9,091, 120 and 5 rows. The channel count shows web 4,125, whatsapp 3,106 and sales_rep 1,860. `grep -c ",,"` finds 12 customers, the rows where city is empty.

```bash
chmod +x count_rows.sh
./count_rows.sh ~/downloads/shoplink/*.csv ~/downloads/shoplink-batch-2/*.csv
export SHOPLINK_BATCH=shoplink-batch-2
echo $(( $(wc -l < ~/downloads/$SHOPLINK_BATCH/orders.csv) - 1 ))
```

Batch 2 has 430 customers, 1,230 order lines and 565 orders. The empty-city check works here because no other column is ever empty; say so if you used it, because on another file `,,` could match a different column. A version using `awk -F, '$5 == ""'` to test the city column exactly is even better.

# Lesson: Git fundamentals

minutes: 55

## Why data engineers use Git

Imagine ShopLink's nightly load starts failing on Tuesday. Someone changed the pipeline code, the Docker Compose file or a SQL script, but which one, what did they change, and what did it say before? Without version control, the answer is "nobody knows". With Git, it is one command away.

Git is a version control system. It keeps a full history of every change to the files in a folder: who made it, when, and why. For a data engineer that history is how you:

- **Undo mistakes.** A bad change to a pipeline can be reverted in seconds.
- **Reproduce the platform.** Pipelines, Compose files, SQL and infrastructure code all live in one repository, so anyone can rebuild the whole system from it.
- **Work with others.** Several people can change the same project without overwriting each other.
- **Ship safely.** Every change goes through review first, which you set up in the next lesson.

Git runs on your computer. GitHub is a website that hosts Git repositories online so teams can share them.

## Install and configure Git

You installed Git with `apt` in the previous lesson (on macOS, run `xcode-select --install`; on other Linux distributions use its package manager). Check it, then tell Git who you are. Every commit is stamped with this name and email, so use the email you will use for GitHub:

```bash
git --version
git config --global user.name "Ada Okafor"
git config --global user.email "ada.okafor@example.com"
git config --global init.defaultBranch main
git config --global --list
```

The third line makes new repositories start on a branch called `main`, which is what GitHub uses. On Windows, do this inside Ubuntu even if you already have Git for Windows: WSL has its own Git and its own settings.

## Create the repository

A repository (repo) is a folder whose history Git is tracking. Create the one that will hold your whole ShopLink platform, in your Linux home folder:

```bash
mkdir ~/shoplink-data-platform
cd ~/shoplink-data-platform
git init
```

`git init` creates a hidden `.git` folder (see it with `ls -a`). That folder is the repository: it holds every version of every file. Never edit or delete it by hand.

## The three places a change lives

| Area | What it is | How a change gets there |
|---|---|---|
| Working directory | The files you see and edit | You edit a file |
| Staging area | Changes you have chosen for the next commit | `git add` |
| Repository | Permanent, recorded history | `git commit` |

Staging exists so you can choose what goes into each commit. If you fixed a typo in the README and also started a half-finished pipeline, you can commit the README fix alone.

## Your first commit

Create a README with any editor (`code README.md` opens VS Code; `nano README.md` works in any terminal):

```markdown
# shoplink-data-platform

Data platform for ShopLink Distribution, a Lagos electronics distributor.
```

Then check the state of the repo, stage the file and commit it:

```bash
git status
git add README.md
git status
git commit -m "Add README"
git log --oneline
```

`git status` is the command you will run most. Before `git add` it lists README.md as untracked; after, as a change to be committed. `git log --oneline` shows one line per commit, newest first:

```text
3f9c2a1 (HEAD -> main) Add README
```

The code at the start is the commit's ID (a shortened hash). You can use it to inspect or undo that exact commit later. Two more commands you will use every day:

```bash
git diff            # changes in your working directory that are not staged yet
git diff --staged   # changes that are staged and will go into the next commit
```

## Writing good commit messages

Write the message in the imperative, as if completing the sentence "This commit will...":

| Weak | Better |
|---|---|
| `update` | `Add healthcheck to postgres service` |
| `fixed stuff` | `Retry the orders API on 503 responses` |
| `wip` | `Draft extractor for supplier price list` |

Keep the first line under about 60 characters. If the change needs explaining, leave a blank line and add a short paragraph on why.

## What never goes into Git

Git keeps everything forever. Once a password is in a commit that has been pushed to GitHub, assume it has been seen, even if you delete it in the next commit. Keep all of this out:

- **Secrets**: `.env` files, API keys, database passwords, cloud access keys. In Module 9 you create AWS keys; committing them can cost real money within minutes, because bots scan GitHub for them.
- **Data files**: CSV extracts, database files, lake folders. They are large, they change constantly, and in a real company they contain customer information. The repo holds the code that moves data, not the data.
- **Generated output**: logs, build folders, Python caches, dbt's `target/`, OpenTofu state.
- **Local environments**: Python virtual environments (`.venv/`).

If you ever commit a secret by accident, treat it as leaked: change the password or revoke the key first, then remove the file.

## .gitignore

A `.gitignore` file in the root of the repo lists patterns Git should ignore. Ignored files never show up in `git status`, so you cannot add them by accident. This is the `.gitignore` for `shoplink-data-platform`. It already covers what later modules create:

```text
# Secrets: never commit these
.env

# Python
.venv/
__pycache__/
*.pyc

# Local data: CSV extracts, landed files and the local lake
data/
lake/

# Logs and generated output (Airflow, dbt)
logs/
target/
dbt_packages/

# OpenTofu (Module 9)
.terraform/
*.tfstate*
```

A trailing `/` matches a folder, `*` matches anything, and `#` starts a comment. Note that `.env.example` is **not** ignored: it is a template with placeholder values that you do commit, so others know which settings the project needs.

`.gitignore` only affects files Git is not already tracking. If you committed a file before ignoring it, stop tracking it with `git rm --cached <file>` and commit. To check why a file is ignored, run `git check-ignore -v <file>`.

## Resources

- docs: [Pro Git: Getting a Git Repository](https://git-scm.com/book/en/v2/Git-Basics-Getting-a-Git-Repository) · git-scm.com · Chapter 2 of the free official book. Read this section and the next.
- docs: [Pro Git: Recording Changes to the Repository](https://git-scm.com/book/en/v2/Git-Basics-Recording-Changes-to-the-Repository) · git-scm.com · Status, staging, committing and ignoring files, in depth.
- docs: [Ignoring files](https://docs.github.com/en/get-started/git-basics/ignoring-files) · GitHub Docs · How .gitignore works, with GitHub's own templates.
- watch: [Git Explained in 100 Seconds](https://www.youtube.com/watch?v=hwP7WQkmECE) · Fireship · 4.28M subscribers · 831K views · 27.3K likes · published 2020-03-02 · checked 2026-09-28 · 2 min
- watch: [Git and GitHub for Beginners - Crash Course](https://www.youtube.com/watch?v=RGOj5yH7evk) · freeCodeCamp.org · 11.9M subscribers · 5.1M views · 108K likes · published 2020-05-28 · checked 2026-09-28 · 68 min
- read: [How to Write a Git Commit Message](https://cbea.ms/git-commit/) · Chris Beams · The seven rules most teams follow.
- deeper: [Pro Git (full book)](https://git-scm.com/book/en/v2) · Scott Chacon and Ben Straub, free · Chapters 1 to 3 cover everything in this module and more.

## Practice

1. Configure Git inside your terminal (Ubuntu on Windows) with your name, email and `main` as the default branch.
2. Create `~/shoplink-data-platform`, run `git init`, and commit a short README.
3. Add the `.gitignore` above and commit it with a clear message.
4. Test it. Create a `.env` file containing `POSTGRES_PASSWORD=not-a-real-password`, copy your unzipped `shoplink` folder into `data/`, and create an empty `.venv/` folder. Run `git status`: none of them should appear.
5. Create `.env.example` containing `POSTGRES_PASSWORD=change-me` and check that it **does** appear in `git status`.

## Example answer

```bash
cd ~/shoplink-data-platform
echo "POSTGRES_PASSWORD=not-a-real-password" > .env
mkdir -p data .venv
cp -r ~/downloads/shoplink data/
git status
git check-ignore -v .env data/shoplink/orders.csv .venv
echo "POSTGRES_PASSWORD=change-me" > .env.example
git status
```

```text
$ git check-ignore -v .env data/shoplink/orders.csv .venv
.gitignore:2:.env	.env
.gitignore:10:data/	data/shoplink/orders.csv
.gitignore:5:.venv/	.venv

$ git status
On branch main
Untracked files:
  (use "git add <file>..." to include in what will be committed)
	.env.example
```

Your line numbers depend on your comments and blank lines. Only `.env.example` is untracked; everything secret or local is ignored. If `.env` appears in `git status`, check the file is named exactly `.gitignore` and sits in the repo root. Leave `.env.example` uncommitted for now: you commit it with the Compose work later in this module.

# Lesson: Branches and pull requests

minutes: 60

## What a branch is

A branch is a separate line of work. You create one, change what you like, and `main` stays exactly as it was until you merge. Data teams treat `main` as the version production runs. Nobody edits it directly: every change, even a one-line fix to a Compose file, happens on a branch first and arrives through a pull request.

Under the hood a branch is just a label pointing at a commit, which is why creating one is instant.

```bash
git branch                               # list branches; * marks the current one
git switch -c feature/describe-sources   # create a branch and switch to it
git switch main                          # back to main
git switch feature/describe-sources      # and back again
```

Older tutorials use `git checkout -b`; it does the same. In this track, branches are named `feature/<short-description>`, for example `feature/postgres-compose` or `feature/orders-extractor`. Many teams also use `fix/` and `docs/` prefixes.

## Merging

On your branch, add a "Sources" section to the README describing ShopLink's four sources, and commit it. To bring the work into `main` locally:

```bash
git switch main
git merge feature/describe-sources
git log --oneline --graph --all
git branch -d feature/describe-sources
```

If `main` has not changed since you branched, Git does a **fast-forward**: it just moves the `main` label forward. If both branches have new commits, Git creates a **merge commit** joining the two lines of history. In a team you rarely merge into `main` yourself; you merge through a pull request on GitHub. But you still merge locally when you bring the latest `main` into your own branch.

## Merge conflicts

A conflict happens when two branches change the same lines of the same file. Git cannot know which version is right, so it stops and asks you. Conflicts are normal. Here is one, step by step, starting on `main` with this README line:

```markdown
ShopLink has four data sources.
```

```bash
git switch -c feature/sources-note
# edit the line to: ShopLink has four data sources, ingested nightly.
git commit -am "Mention nightly ingestion in README"

git switch main
git switch -c feature/stream-note
# edit the same line to: ShopLink has four data sources, one of them a stream.
git commit -am "Mention the order events stream in README"

git switch main
git merge feature/sources-note
git merge feature/stream-note
```

`git commit -am` stages every tracked file that changed and commits in one step (it does not pick up new files). The second merge reports:

```text
Auto-merging README.md
CONFLICT (content): Merge conflict in README.md
Automatic merge failed; fix conflicts and then commit the result.
```

Open README.md. Git has written both versions between markers:

```text
<<<<<<< HEAD
ShopLink has four data sources, ingested nightly.
=======
ShopLink has four data sources, one of them a stream.
>>>>>>> feature/stream-note
```

Above `=======` is what is already on the branch you are merging into (`HEAD`, here `main`); below is the incoming branch. Keep one side, the other, or a combination, and delete all three marker lines:

```markdown
ShopLink has four data sources: three ingested nightly in batches, and one stream.
```

Then mark it resolved and finish:

```bash
git add README.md
git commit --no-edit
```

If you get lost, `git merge --abort` puts everything back. Read the result before you commit: a conflict in a Compose file resolved carelessly can leave YAML that is valid but starts the wrong service.

## GitHub: remotes and pushing

GitHub hosts a copy of your repository online, called a **remote**. Once your repo is there, it is backed up, others can review it, and employers can see it: `shoplink-data-platform` becomes your portfolio.

1. Sign up at github.com if you need to. Choose a professional username.
2. Click **New repository**, name it `shoplink-data-platform`, choose **Public**, and leave "Add a README", ".gitignore" and "license" **unticked**, so GitHub's history does not clash with yours.
3. Log in from your terminal with the GitHub CLI. Install it following the instructions at cli.github.com (on Ubuntu, `sudo apt install gh` also works), then run `gh auth login`, choose GitHub.com, HTTPS, "Authenticate Git with your GitHub credentials: Yes", and "Login with a web browser". GitHub does not accept your account password for Git commands; the CLI handles a token for you.
4. Connect and push:

```bash
git remote add origin https://github.com/ada-okafor/shoplink-data-platform.git
git remote -v
git push -u origin main
```

`origin` is the conventional name for your main remote. `-u` links local `main` to `origin/main`, so later a plain `git push` or `git pull` knows where to go. To get changes others have pushed, `git pull` downloads and merges; `git fetch` downloads without merging.

## Pull requests

A pull request (PR) asks to merge one branch into another, with a page on GitHub where the change is discussed, reviewed and approved first. For data engineers, PRs are the quality gate in front of production: every later module asks for evidence (commands, row counts, logs) in the PR description, and teams add automated checks that run on every PR before it can merge.

```bash
git switch main
git pull
git switch -c feature/describe-sources
# edit README.md
git add README.md
git commit -m "Describe ShopLink's four sources in README"
git push -u origin feature/describe-sources
gh pr create --fill          # or use the "Compare & pull request" button on GitHub
```

On GitHub, check the direction (**base** is `main`, **compare** is your branch), review the **Files changed** tab yourself, and when it is approved choose **Squash and merge**, which turns the branch's commits into one tidy commit on `main`. Then tidy up locally:

```bash
git switch main
git pull
git branch -D feature/describe-sources   # -D because squash merging makes a new commit
```

A good PR description answers four questions: what changed, why, how you checked it, and what the reviewer should look at closely.

```markdown
## What
Adds compose.yaml with a postgres service (postgres:17), a named volume,
a healthcheck and an init script that creates shoplink_app, warehouse, airflow and metabase.

## Why
Every later module needs a local PostgreSQL server. Closes #1.

## How I checked it
- `docker compose up -d` then `docker compose ps` shows postgres as healthy.
- `\l` in psql lists shoplink_app, warehouse, airflow and metabase.
- `git status` shows .env is ignored; only .env.example is committed.

## Reviewer notes
Please check the healthcheck command and the volume name.
```

For pipeline changes, "How I checked it" should include evidence: row counts before and after, the command you ran, a log excerpt.

## Reviewing infrastructure and pipeline changes

A reviewer's question is: **will the platform still work, and still be safe, after this change?**

| Check | What to ask |
|---|---|
| Secrets | "Is any password, key or token in this diff? Should it come from `.env`?" |
| Reruns | "What happens if this runs twice? Does it duplicate rows?" |
| Failure | "What happens if the source is down? Does it retry, and does anyone find out?" |
| Versions | "Is the image tag or package version pinned, or will it change under us?" |
| Ports and resources | "Does this clash with a port another service uses? How much memory does it need?" |
| Evidence | "How do we know it worked? Where are the counts or logs?" |

Be kind and specific. "Port 8080 is already the Airflow UI, so this Spark UI needs another host port" is useful; "this is wrong" is not.

## Resources

- docs: [Pro Git: Basic Branching and Merging](https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging) · git-scm.com · Branches, fast-forwards, merge commits and conflicts with worked examples.
- docs: [About pull requests](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests) · GitHub Docs · What a PR is and how review, checks and merging fit together.
- docs: [GitHub CLI quickstart](https://docs.github.com/en/github-cli/github-cli/quickstart) · GitHub Docs · `gh auth login` and `gh pr create`.
- docs: [GitHub flow](https://docs.github.com/en/get-started/using-github/github-flow) · GitHub Docs · The branch, pull request, review and merge workflow in six steps.
- watch: [Git Branching and Merging - Detailed Tutorial](https://www.youtube.com/watch?v=Q1kHG842HoI) · SuperSimpleDev · 829K subscribers · 347.3K views · 9K likes · published 2021-06-13 · checked 2026-09-28 · 54 min
- watch: [How to create a pull request in 4 min | GitHub for Beginners](https://www.youtube.com/watch?v=nCKdihvneS0) · GitHub · 690K subscribers · 322K views · 4.1K likes · published 2024-08-12 · checked 2026-09-28 · 4 min

## Practice

In `~/shoplink-data-platform`:

1. Create a public `shoplink-data-platform` repo on GitHub, log in with `gh auth login` and push `main`.
2. Recreate the conflict from this lesson: two `feature/` branches changing the same README line. Merge both into `main` locally, resolve the conflict by combining them, and finish the merge. Push `main`.
3. Create `feature/describe-sources`. Add a "Sources" section to the README: a table of ShopLink's four sources with their ingestion type (use Module 1's "Meet ShopLink" lesson). Push it and open a PR with a What / Why / How I checked it / Reviewer notes description.
4. Leave at least one review comment on a line in the Files changed tab, then squash and merge. Update local `main` and delete the branch.

## Example answer

The README section could look like this:

```markdown
## Sources

| Source | Ingestion type | Lands in |
|---|---|---|
| App database (`shoplink_app`: customers, warehouses, orders, order_lines) | Database extraction, nightly | `warehouse.raw` and the bronze bucket |
| Supplier price list (`products.csv`, daily file) | File ingestion, full load | `warehouse.raw` and the bronze bucket |
| Orders API (`updated_since`, paged) | API, incremental | `warehouse.raw.orders_api` |
| Order events (Kafka topic `shoplink.orders`) | Streaming | Real-time revenue (Module 9) |
```

After the conflict, `git log --oneline --graph --all` shows two lines of work joined by a merge commit:

```text
*   e81f3b7 (HEAD -> main) Merge branch 'feature/stream-note'
|\
| * 9a0c6d2 (feature/stream-note) Mention the order events stream in README
* | 5be1f40 (feature/sources-note) Mention nightly ingestion in README
|/
* b71e0d4 Add .gitignore for secrets, data and generated files
* 3f9c2a1 Add README
```

Your IDs will differ. What matters is that the final README has no `<<<<<<<`, `=======` or `>>>>>>>` lines, the merge commit is in the history, and the PR page on GitHub shows your description, a line comment and "merged". A good self-review comment is specific, for example on the orders API row: "Check in Module 3 whether the API ever returns deleted orders."

# Lesson: Docker basics

minutes: 60

## "It works on my machine"

Your pipeline needs Python 3.12, a set of packages, PostgreSQL 17 and later Airflow, Spark and Kafka. A teammate's laptop has a different Python. The production server has PostgreSQL 15. Every difference is a chance for the pipeline to fail somewhere it passed for you.

**Docker** removes those differences by packaging software together with everything it needs to run. It is a basic tool of data engineering: PostgreSQL, Airflow, Spark, Kafka and RustFS are all distributed as Docker images, and in this track you run every one of them that way, on your own laptop, for free.

## Install Docker

| System | What to install |
|---|---|
| Windows | **Docker Desktop** for Windows, with the WSL 2 backend (the default). After installing, open Docker Desktop, go to **Settings, Resources, WSL integration**, and switch on integration for your Ubuntu distribution. Then `docker` works from your Ubuntu terminal |
| macOS | **Docker Desktop** for Mac (choose Apple silicon or Intel) |
| Linux | **Docker Engine** and the Compose plugin, from Docker's apt repository. Then run `sudo usermod -aG docker $USER` and log out and in, so you can run `docker` without `sudo` |

Docker Desktop is free for personal use, education and small businesses; large companies need a paid subscription. Give it enough memory: in Docker Desktop's settings on macOS, set at least 8 GB (on Windows, WSL 2 manages memory for you). The full ShopLink stack in later modules is comfortable with 16 GB of RAM in your laptop.

Check it works, from your terminal (Ubuntu on Windows):

```bash
docker --version
docker compose version
docker run --rm hello-world
```

`hello-world` downloads a tiny image, runs it, prints a message and exits. If you get "permission denied" on Linux, you have not logged out and in since `usermod`. On Windows, if `docker` is "not found" in Ubuntu, the WSL integration switch is off, or Docker Desktop is not running.

## Images and containers

| Idea | What it is | ShopLink example |
|---|---|---|
| Image | A read-only package: a minimal operating system, the software and its dependencies | `postgres:17`, `python:3.12-slim` |
| Tag | The version label after the colon | `17` in `postgres:17` |
| Registry | Where images are published and downloaded from | Docker Hub, quay.io |
| Container | A running instance of an image, isolated from your laptop | Your PostgreSQL server |

An image is like a recipe card; a container is the dish you cooked from it. You can run many containers from one image, and deleting a container does not delete the image.

Always pin a tag. `postgres:latest` changes meaning every time a new major version is released, so your pipeline can break without you changing anything. `postgres:17` stays on PostgreSQL 17.

## Running a container

Run a throwaway PostgreSQL server:

```bash
docker pull postgres:17
docker run -d --name pg-test \
  -e POSTGRES_PASSWORD=practice \
  -p 5432:5432 \
  postgres:17
docker ps
docker logs pg-test
docker exec -it pg-test psql -U postgres -c "select version();"
docker stop pg-test
docker rm pg-test
```

| Flag or command | Meaning |
|---|---|
| `-d` | Detached: run in the background |
| `--name pg-test` | A name to refer to the container by |
| `-e NAME=value` | Set an environment variable inside the container; the postgres image reads `POSTGRES_PASSWORD` to set the superuser password |
| `-p 5432:5432` | Port mapping, `host:container`: port 5432 on your laptop reaches port 5432 inside |
| `docker ps` | Running containers (`docker ps -a` includes stopped ones) |
| `docker logs` | What the container printed; add `-f` to follow |
| `docker exec -it` | Run a command inside a running container, interactively |

If `docker run` fails with "port is already allocated", something on your laptop already uses port 5432, usually a PostgreSQL you installed directly. Stop that service, or map a different host port such as `-p 5433:5432`.

## Volumes: data that outlives the container

A container's own files disappear when you remove it. Run `pg-test` again, create a table, `docker rm -f pg-test`, start a new one: the table is gone. Databases need a **volume**, storage managed by Docker that lives outside any container:

```bash
docker volume create pgdata-test
docker run -d --name pg-test -e POSTGRES_PASSWORD=practice \
  -v pgdata-test:/var/lib/postgresql/data postgres:17
sleep 5   # give the server a few seconds to start
docker exec -it pg-test psql -U postgres -c "create table kept (id int); insert into kept values (1);"
docker rm -f pg-test
docker run -d --name pg-test -e POSTGRES_PASSWORD=practice \
  -v pgdata-test:/var/lib/postgresql/data postgres:17
sleep 5
docker exec -it pg-test psql -U postgres -c "select * from kept;"
```

The second container finds the table, because the data lives in the volume. There are two kinds of mount:

| Kind | Syntax | Use it for |
|---|---|---|
| Named volume | `-v pgdata-test:/var/lib/postgresql/data` | Database storage that Docker manages |
| Bind mount | `-v "$(pwd)/data:/app/data"` | Sharing a folder from your laptop, such as code or CSV files |

Clean up with `docker rm -f pg-test` and `docker volume rm pgdata-test`.

## Networks: containers talking to each other

Containers on the same Docker **network** reach each other by container name. Inside a container, `localhost` means that container itself, not your laptop:

```bash
docker network create shoplink-test
docker run -d --name db --network shoplink-test -e POSTGRES_PASSWORD=practice postgres:17
sleep 5
docker run --rm --network shoplink-test -e PGPASSWORD=practice postgres:17 \
  psql -h db -U postgres -c "select 'reached db by name' as result;"
docker rm -f db
docker network rm shoplink-test
```

The second container connects to host `db`, the first container's name. This is the rule you use for the rest of the track: from your laptop, PostgreSQL is `localhost:5432`; from another container, it is `postgres:5432`. Compose creates the network for you, as you see in the next lesson.

## Building your own image: the Dockerfile

A **Dockerfile** is the recipe for an image. Make a practice folder outside your repo with a tiny Python script:

```bash
mkdir -p ~/docker-practice && cd ~/docker-practice
cp ~/downloads/shoplink/orders.csv .
cat > count_orders.py <<'EOF'
import csv
import os

path = os.environ.get("ORDERS_FILE", "orders.csv")
with open(path, newline="") as f:
    rows = list(csv.DictReader(f))
print(f"{path}: {len(rows)} orders")
EOF
```

Then save this as `Dockerfile` (no extension) in the same folder:

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY count_orders.py .
CMD ["python", "count_orders.py"]
```

| Instruction | Meaning |
|---|---|
| `FROM` | The base image to start from |
| `WORKDIR` | The folder inside the image where later steps run |
| `COPY` | Copy files from your folder (the build context) into the image |
| `RUN` | Run a command while building, for example `pip install` |
| `CMD` | The default command when a container starts |

Build and run it, mounting the data rather than baking it into the image:

```bash
docker build -t shoplink-count .
docker run --rm -v "$(pwd)/orders.csv:/app/orders.csv:ro" shoplink-count
docker run --rm -v "$HOME/downloads/shoplink-batch-2:/data:ro" \
  -e ORDERS_FILE=/data/orders.csv shoplink-count
```

The first prints `orders.csv: 9091 orders`; the second `/data/orders.csv: 565 orders`. `:ro` mounts read-only. Each Dockerfile instruction is a cached **layer**; Docker rebuilds only from the first changed line down. That is why real Dockerfiles copy `requirements.txt` and run `pip install` before copying the code: changing the code then reuses the slow install layer. You containerise ShopLink's own Python code this way later in the track.

## Cleaning up

Images and stopped containers take disk space. See what is there with `docker images`, `docker ps -a` and `docker system df`. `docker system prune` removes stopped containers, unused networks and dangling images; it asks before deleting and does not touch volumes unless you add `--volumes`.

## Resources

- docs: [Docker: get started](https://docs.docker.com/get-started/) · Docker · Official introduction to images, containers, volumes and building.
- docs: [What is Docker?](https://docs.docker.com/get-started/docker-overview/) · Docker · The architecture: client, daemon, images, containers and registries.
- docs: [Docker Desktop WSL 2 backend on Windows](https://docs.docker.com/desktop/features/wsl/) · Docker · Turning on WSL integration and best practices for Windows.
- docs: [Building best practices](https://docs.docker.com/build/building/best-practices/) · Docker · Layer caching, small base images, pinning versions.
- docs: [postgres official image](https://hub.docker.com/_/postgres) · Docker Hub · Environment variables, volumes and init scripts for the image you use all track.
- watch: [Docker in 100 Seconds](https://www.youtube.com/watch?v=Gjnup-PuquQ) · Fireship · 4.28M subscribers · 1.3M views · 53.6K likes · published 2020-08-17 · checked 2026-09-28 · 2 min
- watch: [Docker Tutorial for Beginners [FULL COURSE in 3 Hours]](https://www.youtube.com/watch?v=3c-iBn73dDE) · TechWorld with Nana · 1.49M subscribers · 6.5M views · 105.1K likes · published 2020-10-21 · checked 2026-09-28 · 166 min

## Practice

1. Install Docker (with WSL integration on Windows) and run `hello-world`.
2. Run the volume experiment from this lesson and show, with the second container, that the `kept` table survived. Then run the same experiment **without** `-v` and show that it does not.
3. Build the `shoplink-count` image and run it against both batches.
4. Change `count_orders.py` so it also prints the number of orders per channel. Rebuild and watch which build steps say `CACHED`.
5. In two sentences, explain why `docker run -p 5432:5432` lets a tool on your laptop reach PostgreSQL, but a second container must use the first container's name instead of `localhost`.

## Example answer

For step 4, one version of the script:

```python
import csv
import os
from collections import Counter

path = os.environ.get("ORDERS_FILE", "orders.csv")
with open(path, newline="") as f:
    rows = list(csv.DictReader(f))
print(f"{path}: {len(rows)} orders")
for channel, n in Counter(r["channel"] for r in rows).most_common():
    print(f"  {channel}: {n}")
```

On batch 1 it prints web 4,125, whatsapp 3,106 and sales_rep 1,860. On rebuild, `FROM` and `WORKDIR` show `CACHED`; `COPY count_orders.py` and everything after it rebuild, because the copied file changed.

For step 2, without `-v` the second container fails with `relation "kept" does not exist`: the table lived in the first container's own filesystem, which `docker rm` deleted.

For step 5: "`-p 5432:5432` publishes the container's port on the laptop, so anything on the laptop can reach it at `localhost:5432`. Inside another container, `localhost` is that container itself, so it must reach PostgreSQL over the Docker network using the container or service name, such as `db` or `postgres`."

# Lesson: Docker Compose: run PostgreSQL

minutes: 55

## One file for the whole platform

`docker run` with six flags is fine once. For a platform with PostgreSQL, an API, Airflow, Spark and Kafka, you need the configuration written down, versioned and started with one command. **Docker Compose** does that: a `compose.yaml` file in your repo describes every service, and `docker compose up` starts them all on a shared network.

In this track there is exactly **one** Compose file, `compose.yaml` in the root of `shoplink-data-platform`. Each module adds services to it. In this lesson you add the first: `postgres`.

## The plan for PostgreSQL

One PostgreSQL 17 server plays two roles, source and warehouse, and also holds the tools' own metadata, each in a separate database:

| Database | Role | Used from |
|---|---|---|
| `shoplink_app` | ShopLink's operational app database, the source system (loaded in Module 4) | Module 4 onwards |
| `warehouse` | The analytical side, with schemas `raw`, `staging` and `marts` | Module 3 onwards |
| `airflow` | Airflow's own metadata | Module 7 |
| `metabase` | Metabase's own settings (users, questions, dashboards) | Module 10 |

The user is `shoplink`. The password comes from a `.env` file that is never committed.

## Step 1: the .env and .env.example files

In `~/shoplink-data-platform`, create `.env.example` (committed, placeholder values) and copy it to `.env` (ignored, your real values):

```bash
cat > .env.example <<'EOF'
# Copy to .env and change the values. .env is git-ignored; never commit it.
POSTGRES_PASSWORD=shoplink

# Connection strings for Python code in pipelines/ (from your laptop).
# From another container, replace localhost with postgres.
SHOPLINK_APP_DB_URL=postgresql://shoplink:shoplink@localhost:5432/shoplink_app
SHOPLINK_WAREHOUSE_DB_URL=postgresql://shoplink:shoplink@localhost:5432/warehouse

# The mock orders API you run in Module 3
SHOPLINK_API_URL=http://localhost:8000
EOF
cp .env.example .env
```

Compose uses `POSTGRES_PASSWORD`; the three `SHOPLINK_` keys are for the Python code you write in Module 3, which reads its connection strings from them. If you change the password, change it in the two URLs as well. For a database that only ever listens on your own laptop, `shoplink` is an acceptable password. Anything reachable from a network needs a long random one. Later modules add more keys to both files, such as the RustFS object storage keys in Module 5 and Airflow's in Module 7.

## Step 2: the init script

The postgres image runs any `.sql` or `.sh` file it finds in `/docker-entrypoint-initdb.d` the first time it starts with an empty data volume. Use that to create the four databases. Save this as `sql/init/01_create_databases.sql`:

```sql
-- Runs once, the first time the postgres container starts with an empty volume.
-- shoplink_app plays ShopLink's operational app database (the source system).
-- warehouse is the analytical side (schemas raw, staging, marts).
-- airflow holds Airflow's own metadata from Module 7.
-- metabase holds the settings of Module 10's Metabase dashboard tool.
create database shoplink_app;
create database warehouse;
create database airflow;
create database metabase;
```

The script runs as the `shoplink` user, so `shoplink` owns all four databases.

## Step 3: compose.yaml

Save this as `compose.yaml` in the repo root:

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: shoplink
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./sql/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -h localhost -U shoplink -d warehouse"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 10s
    restart: unless-stopped

volumes:
  postgres-data:
```

Line by line:

| Setting | What it does |
|---|---|
| `services: postgres:` | Defines a service named `postgres`. Other containers reach it at host `postgres` |
| `image: postgres:17` | Pinned major version, as in the previous lesson |
| `POSTGRES_USER: shoplink` | The superuser the image creates on first start |
| `${POSTGRES_PASSWORD:?...}` | Compose reads `.env` in the project folder and substitutes the value; if it is missing, Compose stops with that message instead of starting a database with no password |
| `ports: "5432:5432"` | Reachable from your laptop at `localhost:5432` |
| `postgres-data:/var/lib/postgresql/data` | A named volume for the database files, so data survives restarts and `docker compose down` |
| `./sql/init:/docker-entrypoint-initdb.d:ro` | A read-only bind mount of your init scripts |
| `healthcheck` | Every 5 seconds, `pg_isready` asks whether the server accepts connections. `-h localhost` matters: during first-time initialisation the server only listens on an internal socket, so a TCP check reports healthy only once initialisation has finished |
| `restart: unless-stopped` | Restart the container if it crashes or Docker restarts, unless you stopped it yourself |
| `volumes: postgres-data:` | Declares the named volume at the bottom of the file |

The healthcheck earns its place in Module 7: Airflow's services wait with `depends_on: postgres: condition: service_healthy`, which plain `depends_on` (start order only) does not give you.

## Step 4: start it and connect

```bash
docker compose up -d
docker compose ps
docker compose logs postgres | tail -n 20
```

Wait until `docker compose ps` shows the postgres service as `(healthy)`, usually a few seconds. The logs show the init script running (`running /docker-entrypoint-initdb.d/01_create_databases.sql`) and end with `database system is ready to accept connections`.

Connect with **psql**, PostgreSQL's command-line client, which is already inside the container:

```bash
docker compose exec postgres psql -U shoplink -d warehouse
```

You are now at a `warehouse=#` prompt. Type these one at a time:

```sql
\l
\conninfo
create schema raw;
create table raw.smoke_test (id int, note text);
insert into raw.smoke_test values (1, 'hello from ShopLink');
select * from raw.smoke_test;
\dt raw.*
\c shoplink_app
\q
```

| psql command | What it does |
|---|---|
| `\l` | List databases: `shoplink_app`, `warehouse`, `airflow` and `metabase` are there |
| `\conninfo` | Show which database and user you are connected as |
| `\dt raw.*` | List tables in the `raw` schema |
| `\c shoplink_app` | Switch to another database |
| `\q` | Quit |

Commands starting with `\` are psql's own and need no semicolon; everything else is SQL and ends with `;`. You can also run one statement without opening the prompt:

```bash
docker compose exec postgres psql -U shoplink -d warehouse -c "select count(*) from raw.smoke_test;"
```

Tools on your laptop (Python in Module 3, a GUI such as DBeaver or pgAdmin if you like one) connect with `postgresql://shoplink:shoplink@localhost:5432/warehouse`, the `SHOPLINK_WAREHOUSE_DB_URL` in your `.env`.

## Step 5: stop, start and reset

| Command | Containers | Data in the volume |
|---|---|---|
| `docker compose stop postgres` | Stopped, kept | Kept |
| `docker compose start postgres` | Started again | Kept |
| `docker compose down` | Removed (and the network) | Kept |
| `docker compose up -d` | Recreated | Kept: `raw.smoke_test` is still there |
| `docker compose down -v` | Removed | **Deleted** |

Use `down -v` only when you want a clean start. It is also the answer to a common puzzle: **init scripts only run when the volume is empty**. If you edit `01_create_databases.sql` after the first start, nothing happens until you `docker compose down -v` and `up -d` again (which wipes the data), or you create the database by hand in psql.

From now on, each lesson tells you which services it needs. When the stack grows, stop the ones you are not using with `docker compose stop <service>` to save memory.

## When it does not start

| Symptom | Likely cause and fix |
|---|---|
| `set POSTGRES_PASSWORD in .env` | No `.env` in the folder where you ran the command, or the key is misspelt. Run Compose from the repo root |
| `port is already allocated` or `address already in use` | Another PostgreSQL is using 5432. Stop it (on Linux, `sudo systemctl stop postgresql`) rather than changing the port, so your setup matches the track |
| Stays `(health: starting)` then `unhealthy` | Read `docker compose logs postgres`; often a typo in the init script. Fix it, then `docker compose down -v` and `up -d` |
| `database "warehouse" does not exist` | The volume already existed before you added the init script. `docker compose down -v`, then `up -d` |
| `password authentication failed` from your laptop | You changed `.env` after the first start; the password was set when the volume was created. Reset with `down -v`, or change it in psql with `alter user shoplink password '...'` |

## Resources

- docs: [Docker Compose overview](https://docs.docker.com/compose/) · Docker · What Compose is and how services, networks and volumes fit together.
- docs: [Compose file reference: services](https://docs.docker.com/reference/compose-file/services/) · Docker · Every service setting, including `healthcheck`, `depends_on` and `restart`.
- docs: [Set environment variables within your container's environment](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/) · Docker · How Compose reads `.env` and substitutes `${VARIABLES}`.
- docs: [postgres official image](https://hub.docker.com/_/postgres) · Docker Hub · The "Initialization scripts" section explains `/docker-entrypoint-initdb.d`.
- docs: [psql](https://www.postgresql.org/docs/17/app-psql.html) · PostgreSQL documentation · Every psql option and backslash command.
- watch: [Docker Compose Tutorial for Beginners (Networks - Volumes - Secrets - Postgres - Letsencrypt)](https://www.youtube.com/watch?v=YMBT1NguJJw) · Anton Putra · 121K subscribers · 40K views · 1.1K likes · published 2024-07-25 · checked 2026-09-28 · 72 min

## Practice

1. On a branch `feature/postgres-compose`, add `.env.example`, `sql/init/01_create_databases.sql` and `compose.yaml` from this lesson. Copy `.env.example` to `.env`.
2. Start the service, wait for `(healthy)`, and in psql list the databases. Create `raw.smoke_test` in `warehouse` and insert a row.
3. Run `docker compose down`, then `up -d`, and show the row is still there. Then run `docker compose down -v` and `up -d`, and show it is gone but the four databases exist again.
4. Copy the unzipped `shoplink` and `shoplink-batch-2` folders into the repo's `data/` folder and confirm with `git status` that they are ignored.
5. Break it on purpose: rename `.env` to `env.bak` and run `docker compose up -d`. Record the error, then put it back.

## Example answer

```bash
cd ~/shoplink-data-platform
git switch -c feature/postgres-compose
mkdir -p sql/init data
# create .env.example, sql/init/01_create_databases.sql and compose.yaml
cp .env.example .env
docker compose up -d
docker compose ps
docker compose exec postgres psql -U shoplink -d warehouse -c "\l"
```

```text
NAME                                IMAGE         SERVICE    STATUS
shoplink-data-platform-postgres-1   postgres:17   postgres   Up 12 seconds (healthy)
```

(Some columns are trimmed here; yours also shows the command, creation time and ports.)

`\l` lists `airflow`, `metabase`, `postgres`, `shoplink`, `shoplink_app`, `template0`, `template1` and `warehouse`. The `shoplink` database is the default one the image creates for the `shoplink` user; you will not use it.

```bash
docker compose exec postgres psql -U shoplink -d warehouse -c "create schema raw; create table raw.smoke_test (id int, note text); insert into raw.smoke_test values (1, 'hello');"
docker compose down && docker compose up -d
docker compose exec postgres psql -U shoplink -d warehouse -c "select * from raw.smoke_test;"   # 1 row
docker compose down -v && docker compose up -d
docker compose exec postgres psql -U shoplink -d warehouse -c "select * from raw.smoke_test;"   # relation does not exist
cp -r ~/downloads/shoplink ~/downloads/shoplink-batch-2 data/
git status   # data/ does not appear
```

Wait for `(healthy)` again after each `up -d` before running psql, or the command may fail with "the database system is starting up". For step 5, Compose refuses to start with `required variable POSTGRES_PASSWORD is missing a value: set POSTGRES_PASSWORD in .env`. That message is the `:?` in `compose.yaml` doing its job: failing loudly beats starting a misconfigured database. The container name prefix comes from the folder name; if yours differs, that is fine.

# Quiz

passing_score: 70

### On Windows, where should you keep the `shoplink-data-platform` repo while using WSL 2?

- [ ] On the Windows desktop, so it is easy to find
- [ ] Under `/mnt/c/Users/<you>/Documents`
- [x] In the Linux home folder, `~/shoplink-data-platform`
- [ ] Inside Docker Desktop's installation folder

> Files on the Windows drive (`/mnt/c`) are much slower from Linux, and Docker and Python virtual environments behave badly there. Keep the repo in the Linux filesystem and reach it from Windows with `explorer.exe .` or VS Code's WSL extension.

### Which of these belongs in `shoplink-data-platform`'s Git history?

- [ ] `.env` with the real PostgreSQL password
- [ ] The `data/shoplink/` CSV extracts
- [x] `compose.yaml`, `.env.example` and `sql/init/01_create_databases.sql`
- [ ] The `.venv/` folder

> The repository holds the code and configuration that build the platform. Secrets, data and local environments stay out; `.env.example` shows which settings are needed without revealing real values.

### You deleted a PostgreSQL container that had no volume and started a new one from the same image. What happened to your tables?

- [ ] They are in the image, so the new container has them
- [x] They are gone, because they lived in the deleted container's own filesystem
- [ ] Docker moved them to a volume automatically
- [ ] They are on GitHub

> A container's writable layer is deleted with the container. Databases need a named volume (`postgres-data` in the Compose file) so data survives removing and recreating the container.

### You edited `sql/init/01_create_databases.sql` to add a database, ran `docker compose up -d`, and the new database does not exist. Why?

- [ ] Compose does not support init scripts
- [ ] The file must be named `init.sql`
- [x] Init scripts only run when the data volume is empty, and the volume already existed
- [ ] The healthcheck blocked it

> The postgres image runs `/docker-entrypoint-initdb.d` scripts only on first initialisation. Create the database by hand, or run `docker compose down -v` (which deletes the data) and start again.

### A Python script running in another container on the Compose network needs to connect to PostgreSQL. Which host should it use?

- [ ] `localhost`
- [x] `postgres`, the service name
- [ ] `127.0.0.1`
- [ ] The laptop's Wi-Fi IP address

> Inside a container, `localhost` is that container itself. Services on the same Compose network reach each other by service name, so the host is `postgres`. From your laptop it is `localhost:5432`.

# Project: The shoplink-data-platform repository

max_score: 100

## Brief

Every piece of ShopLink work you do from now on lives in one GitHub repository, and the platform runs from it. In this project you create it properly: a README a new teammate can follow, a `.gitignore` that keeps secrets and data out, and PostgreSQL running in Docker Compose with the four databases the rest of the track needs, all merged into `main` through a reviewed pull request.

## Deliverables

1. **A public GitHub repository named `shoplink-data-platform`.**
2. **README.md on `main`** containing:
   - a one-paragraph description of ShopLink and what the platform will do;
   - a table of ShopLink's four sources and how each will be ingested;
   - setup steps a teammate can follow: clone, `cp .env.example .env`, where to put the CSVs (`data/shoplink/`, `data/shoplink-batch-2/`), `docker compose up -d`, and how to connect with psql;
   - the planned folder layout (`pipelines/`, `sql/`, `dags/`, `spark/`, `streaming/`, `infra/`, `shoplink_dbt/`, `tests/`).
3. **`.gitignore` on `main`** containing at least `.env`, `.venv/`, `data/`, `__pycache__/`, `*.pyc`, `logs/`, `target/`, `dbt_packages/`, `.terraform/`, `*.tfstate*` and `lake/`.
4. **`.env.example`** with `POSTGRES_PASSWORD`, `SHOPLINK_APP_DB_URL`, `SHOPLINK_WAREHOUSE_DB_URL` and `SHOPLINK_API_URL` (example values, no real secrets) and a comment saying to copy it to `.env`.
5. **`compose.yaml`** with a `postgres` service: image `postgres:17`, host port 5432, user `shoplink`, password from `.env`, a named volume, a healthcheck, and the init script `sql/init/01_create_databases.sql` creating `shoplink_app`, `warehouse`, `airflow` and `metabase`.
6. **At least one merged pull request** from a `feature/` branch into `main` containing the Compose work, with a What / Why / How I checked it / Reviewer notes description. "How I checked it" must include the `docker compose ps` output showing `(healthy)` and the `\l` output listing the four databases.
7. **A clean history**: at least four commits with clear, imperative messages, and no `.env` or data files anywhere in the history.

Optional: branch protection on `main`, and a GitHub issue for each upcoming module.

## How to submit

Paste the link to your repository (for example `https://github.com/ada-okafor/shoplink-data-platform`) into the submission form, and paste the link to your merged pull request in the note. If a peer reviewed your PR through the platform's peer review, name them in the note.

## Grading guide

| Criterion | Points |
|---|---|
| compose.yaml runs PostgreSQL 17 as specified (port, user, password from .env, named volume, healthcheck, init script) and creates the four databases | 30 |
| README describes ShopLink and its sources and has setup steps a teammate can follow | 20 |
| .gitignore and .env.example are correct, and no secret or data file is in the history | 20 |
| Work arrived through a feature branch and a merged PR with a clear description and evidence | 20 |
| Commit history is clean, with clear imperative messages | 10 |
