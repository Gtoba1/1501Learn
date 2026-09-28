---
module: 10
title: Capstone Project
optional: false
summary: Bring everything together into one finished, portfolio-ready analytics engineering project. You plan it in milestones, learn from seven real-world projects on GitHub, build a complete pipeline from raw files to tested, documented marts running in Snowflake with CI, and present it the way hiring managers want to see it.
---

# Lesson: The capstone brief

minutes: 40

## What you are building

The capstone is one complete analytics engineering project that you could show an employer tomorrow. It is not a new topic. It is every module of this course, assembled, finished and explained.

The finished project follows this path:

```text
Source files or system
      ↓
Raw layer in the warehouse (loaded as is)
      ↓
dbt staging models (one per source table, cleaned)
      ↓
dbt intermediate models (joins and reusable logic)
      ↓
dbt mart models (facts and dimensions for the business)
      ↓
Tests, contracts, freshness and documentation
      ↓
Git, pull requests and CI running in the cloud
      ↓
(Optional) a BI dashboard on top of the marts
```

## Two ways to do it

**Option A: finish ShopLink.** Your `shoplink-analytics` repository already has most of the pipeline. The capstone is where you make it complete and polished: add an intermediate layer if you skipped it, add a second fact table (for example `fct_orders` at order grain, or a monthly customer summary), close the gaps in tests and documentation, and present it properly. This is the safer choice if your time on the Snowflake trial is short.

**Option B: a new dataset.** Pick a dataset that interests you and build the same pipeline from scratch. This shows you can do it without a guide, and a dataset from your own field (banking, health, logistics, agriculture) can be a strong talking point in interviews. Good sources include the datasets used by the real-world projects later in this module: the Olist Brazilian e-commerce dataset, MovieLens ratings, or a synthetic SaaS dataset. A good dataset has at least three related tables, at least a few thousand rows, a date column and some real mess to clean.

Whichever you choose, the requirements are the same.

## Minimum requirements

| Area | You must have |
|---|---|
| Raw layer | Data loaded into Snowflake (or another cloud warehouse) with a repeatable script: stage and `COPY INTO`, or a Python loader |
| Staging | One staging model per source table, with renaming, type casting and cleaning, and no business logic |
| Intermediate | At least one intermediate model that holds logic reused by more than one mart |
| Marts | At least one fact table and two dimensions, with the grain of each written down |
| Tests | Keys tested for uniqueness and not null; relationships between facts and dimensions; at least three business-rule tests |
| Quality | Source freshness configured; a contract on your main fact table |
| Documentation | Every mart and its columns described; `dbt docs` generated; a README that explains the project |
| Version control | Work done on branches and merged through pull requests with clear descriptions |
| Deployment | Separate development and production targets; a GitHub Actions workflow that runs `dbt build` on pull requests and on a schedule |

A BI dashboard is an **optional extra**. If you build one, keep it small (one page, three or four visuals) and make clear that it reads from your marts. The analytics engineering work is what is graded.

## What "good" looks like

Watch at least the first half hour of one of the end-to-end projects in the resources below, and notice what the builders explain, not only what they type. A strong capstone:

- **Answers business questions.** It starts with three to five questions a stakeholder would ask, and every mart exists to answer at least one of them.
- **Is honest about data problems.** It lists the issues found in the raw data and shows how each one was handled.
- **Runs for someone else.** A reviewer can clone the repository, follow the README and build it.
- **Is finished, not huge.** Five well-tested, well-documented models beat twenty half-finished ones.

## Resources

- watch: [Complete E2E dbt Cloud Project with Snowflake, GitHub & Power BI | Real-World dbt Project demo](https://www.youtube.com/watch?v=5NCywQcJ2r8) · SleekData · 20.1K subscribers · 17.2K views · 314 likes · published 2025-07-22 · checked 2026-09-27 · 19 min
- watch: [End-to-End Banking Data Engineering Project | Snowflake + DBT + Airflow](https://www.youtube.com/watch?v=uHiyZitmIS0) · Data with Jay · 9.22K subscribers · 39.3K views · 911 likes · published 2025-09-23 · checked 2026-09-27 · 295 min
- docs: [How we structure our dbt projects](https://docs.getdbt.com/best-practices/how-we-structure/1-guide-overview) · dbt Labs · Reread it before you finalise your folders and names.
- docs: [Intermediate: purpose-built transformation steps](https://docs.getdbt.com/best-practices/how-we-structure/3-intermediate) · dbt Labs · What belongs in the intermediate layer, if you have not built one yet.

## Practice

Write a one-page capstone proposal and commit it to your repository as `CAPSTONE_PROPOSAL.md`. Include:

1. Option A or B, and for option B, the dataset, its source link and its tables.
2. Three to five business questions your marts will answer.
3. The marts you plan to build, each with its grain in one sentence ("one row per...").
4. Three data problems you expect to find, or already know about.
5. One risk to finishing (time, trial credits, a hard dataset) and how you will manage it.

## Example answer

A strong option A proposal:

**Project:** ShopLink analytics platform (option A).

**Business questions:**
1. What is net revenue each month, by state and warehouse, and is it growing?
2. Which categories and brands drive revenue and margin?
3. Who are the top 20 customers, and how often do they reorder?
4. What share of orders is cancelled or returned, by channel?

**Marts:**

| Mart | Grain |
|---|---|
| `fct_order_lines` | One row per order line |
| `fct_orders` | One row per order, with line counts and order totals |
| `dim_customer` | One row per customer version (SCD Type 2, built from the customers snapshot) |
| `dim_product` | One row per product |
| `dim_warehouse` | One row per warehouse |
| `dim_date` | One row per calendar day |

**Known data problems:** inconsistent status casing and spaces; 6 duplicate order lines; 3 orphan orders whose customer does not exist; 2 lines with zero or negative quantity; 12 customers with no city; 11 recent lines on inactive products.

**Risk:** the Snowflake trial ends in 18 days. I will finish all Snowflake-dependent work (loading, CI, production run) in the first week, and keep a DuckDB target working so I can keep developing if the trial runs out.

For option B, the same structure applies. For example: "Olist e-commerce: orders, order items, customers, products, sellers and reviews; questions about delivery delays by state, seller performance and review scores."

# Lesson: Milestones and planning

minutes: 35

## Plan backwards from a finished project

The most common way to fail a capstone is not a hard bug. It is running out of time with everything 80% done. Plan in milestones, each of which ends with something working and merged to `main`.

## Suggested milestones

Assume two to three weeks of part-time work. Adjust the pace, not the order.

| Milestone | Goal | Done when |
|---|---|---|
| 1. Proposal and repository | Scope agreed; repository ready | `CAPSTONE_PROPOSAL.md` merged; README skeleton in place |
| 2. Raw layer | Data in the warehouse, repeatably | Load script committed; row counts recorded in the README |
| 3. Staging | Every source cleaned | One staging model per table; key tests passing |
| 4. Intermediate and marts | The business model | Facts and dimensions built; grain documented; relationships tested |
| 5. Quality | Trustworthy data | Business-rule tests, freshness, contract and anomaly check in place |
| 6. Production | It runs without you | Dev and prod targets; CI green on pull requests; scheduled run green |
| 7. Presentation | Someone else understands it | README finished; lineage screenshot; walkthrough video or write-up |

Each milestone is at least one branch and one pull request. By the end, your pull request history tells the story of how you built the project, which is itself something reviewers look at.

## Scoping: cut width, not depth

When time runs short, drop whole features, not quality. It is far better to have two marts that are tested, documented and deployed than five marts with no tests.

| If you are behind, cut this | Never cut this |
|---|---|
| A third fact table | Tests on keys and relationships |
| The BI dashboard | The README |
| Slim CI | CI on pull requests |
| A second snapshot | Documentation of each mart's grain |
| Extra columns nobody asked for | The contract on your main fact table |

A useful check at the end of every working session: "If I had to submit tonight, what would be missing?" Work on that next.

## Your capstone checklist

Copy this into a GitHub issue in your repository and tick items off as you merge them:

```text
Raw
[ ] Load script committed and repeatable
[ ] Row counts recorded

Modelling
[ ] One staging model per source table
[ ] At least one intermediate model
[ ] At least one fact and two dimensions
[ ] Grain written in each mart's description

Testing and quality
[ ] unique and not_null on every primary key
[ ] relationships from facts to dimensions
[ ] At least three business-rule tests
[ ] Source freshness configured
[ ] Contract on the main fact table
[ ] One anomaly or row-count check

Documentation
[ ] Every mart and column described
[ ] dbt docs generated; lineage screenshot saved
[ ] README complete

Version control and deployment
[ ] All work merged through pull requests
[ ] dev and prod targets; no secrets in Git
[ ] GitHub Actions green on pull requests
[ ] Scheduled production run green

Presentation
[ ] Walkthrough video or write-up
```

## Asking for peer review

A second pair of eyes catches what you cannot see. Share it through peer review on 1501 Learn, or ask a colleague, a friend who works in data, or someone in an online data community such as the dbt Community Slack to review one pull request, not your whole project; a focused request gets a useful answer.

Make it easy for them. A good review request contains:

1. **What the change does**, in two sentences.
2. **How to check it**: the commands to run, or the query to look at.
3. **What you are unsure about**: "I am not sure `fct_orders` should include cancelled orders" gets a better answer than "any feedback?".
4. **A deadline**, politely: "if you have 20 minutes before Friday".

On GitHub, request a review from the pull request's Reviewers panel. When you receive comments, reply to each one: either change the code or explain why not. Then return the favour by reviewing someone else's; reading other people's dbt code is one of the fastest ways to improve your own.

## Resources

- docs: [Requesting a pull request review](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/requesting-a-pull-request-review) · GitHub · How to ask for a review and what reviewers see.
- docs: [Best practice workflows](https://docs.getdbt.com/best-practices/best-practice-workflows) · dbt Labs · Habits for version control, environments and pull requests in dbt projects.

## Practice

1. Create a GitHub issue in your repository with the capstone checklist above.
2. Write your milestones with a target date for each, based on how many hours a week you can give. Put the dates in the issue.
3. Identify the one milestone most likely to overrun, and write down what you would cut if it does.
4. Open your milestone 1 pull request and request a review from one person, using the four-part request.

## Example answer

A realistic plan for someone with about ten hours a week and 18 days left on the Snowflake trial:

| Milestone | Target date | Notes |
|---|---|---|
| 1. Proposal and repository | Day 2 | Option A, so the repository already exists |
| 2. Raw layer | Day 3 | Setup and load scripts from Module 9 |
| 3. Staging | Day 5 | Mostly done; add the missing tests |
| 4. Intermediate and marts | Day 9 | New `int_order_totals` and `fct_orders` |
| 5. Quality | Day 11 | Module 8 work plus two new business rules on `fct_orders` |
| 6. Production | Day 13 | Workflow from Module 9; confirm the schedule runs |
| 7. Presentation | Day 16 | Two days of buffer before the trial ends |

Most likely to overrun: milestone 4, because a new fact table at a different grain can hide double counting. If it overruns, cut `fct_orders` and make `fct_order_lines` excellent instead.

A good review request: "This PR adds `int_order_totals`, which rolls `int_order_lines_enriched` up to one row per order so `fct_orders` can reuse it. To check it, run `dbt build --select +fct_orders` and compare its row count with `stg_orders`. I am unsure whether the inactive product flag belongs here or in `dim_product`. Could you take a look by Friday?"

# Lesson: Learning from real-world projects

minutes: 60

## Read before you write

Software engineers learn by reading other people's code; analytics engineers should too. The seven public projects below were built by practitioners and learners to show end-to-end analytics engineering. None is perfect, and that is useful: you will learn as much from what they leave out as from what they do well.

Do not copy them. Read them with a checklist, take notes, and borrow ideas.

## What to look for

Open each repository and answer these questions in about ten minutes per project:

| Question | Where to look |
|---|---|
| What business questions is it answering? | The README, near the top |
| How does data get in? | An `ingestion`, `scripts` or `setup` folder; the architecture diagram |
| How is the dbt project laid out? | `models/` folders: staging, intermediate, marts (or bronze, silver, gold) |
| Is the grain of each mart stated? | Mart YAML files and the README |
| What is tested, and is there anything beyond keys? | `tests/` and the YAML files; look for singular and business-rule tests |
| Is it documented? | Column descriptions, a docs site, a lineage image |
| Does it run automatically? | `.github/workflows/`, a scheduler script or an orchestration folder |
| Could you run it yourself? | Setup instructions; `requirements.txt`; how secrets are handled |
| What would you do differently? | Your judgement: this is the most valuable note |

## The seven projects

**1. Sales & Marketing Analytics Platform.** Synthetic sales and marketing data through a bronze, silver and gold (medallion) pipeline, with a dbt project that runs on DuckDB locally or on Snowflake, about 21 models and around 38 tests, CI, and a Power BI model. Look at how it supports two warehouses with one dbt project, just as you did with DuckDB and Snowflake, and at its "observability" outputs such as row-count reconciliation.

**2. Netflix Analytics Engineering Project.** dbt and Snowflake on the MovieLens dataset, with facts and dimensions, incremental models, snapshots, seeds and tests. Its README is a good model of explaining the problem, the data and who would use the result before any technical detail.

**3. YouTube Analytics Engineering Pipeline.** Data pulled from the YouTube Data API with Python, stored in Google Cloud Storage, loaded into BigQuery and transformed with dbt into a star schema, with source freshness checks, an SCD Type 2 snapshot and GitHub Actions orchestrating the whole pipeline. Look at its lineage and documentation screenshots, and at how the docs note known anomalies in the data. It shows the same ideas on a different cloud.

**4. Hospital Data Pipeline.** CSV extracts loaded into Snowflake with Python, a raw, staging and analytics layout, a star schema with three facts, data quality tests and a daily scheduled run. Notice the grain table in its README and the dbt docs site published with GitHub Pages, so reviewers can explore lineage without running anything. Parts of the README are in Vietnamese, a reminder that the structure of good documentation matters more than its language.

**5. Data & Analytics Engineering Project (AWS + Snowflake + dbt).** Raw, staging and marts layers in Snowflake with dbt, and an AWS S3 landing zone described as a concept. A useful project to review critically: check which folders are committed that normally should not be (such as build outputs and logs), and how much of the architecture is actually implemented versus described.

**6. Enterprise SaaS Analytics Platform.** A fictional SaaS company modelled in Snowflake, first as hand-written SQL layers (raw, clean, analytics) and then refactored into dbt, with KPI reporting, data quality checks and Power BI. The before-and-after is instructive: compare the plain SQL scripts with the dbt models and ask what dbt added.

**7. End-to-End Retail Analytics Warehouse.** The Olist e-commerce dataset ingested with Airbyte into Snowflake, transformed with dbt Core into bronze, silver and gold layers, with scripts on Snowflake features such as Time Travel and performance tuning, and Metabase or Power BI dashboards. A good reference if you choose Olist for option B.

## Patterns you will notice

After reading several, some patterns stand out:

- **The best READMEs start with the business**, not the tools.
- **Lineage images do a lot of work.** One screenshot of the DAG explains the architecture faster than any paragraph.
- **Testing is often the weakest part.** Many projects stop at `unique` and `not_null`. Business-rule tests, freshness and contracts, which you built in Module 8, will make your project stand out.
- **Few projects handle secrets and environments carefully.** A clean dev and prod setup with CI is a real differentiator.
- **Medallion (bronze, silver, gold) and staging, intermediate, marts are two names for similar ideas.** Use whichever fits, and explain it.

## Resources

- project: [Sales & Marketing Analytics Platform](https://github.com/AmenBouallagui/fabric-sales-marketing-platform) · GitHub, AmenBouallagui · Medallion pipeline, dbt on DuckDB or Snowflake, about 21 models and 38 tests, CI and Power BI.
- project: [Netflix Analytics Engineering Project](https://github.com/kushaljaink/netflixdbt) · GitHub, kushaljaink · dbt and Snowflake on MovieLens with facts, dimensions, incremental models, snapshots and tests.
- project: [YouTube Analytics Engineering Pipeline](https://github.com/mhdkerol/youtube-analytics-API) · GitHub, mhdkerol · YouTube API to Cloud Storage and BigQuery, dbt star schema, freshness, SCD Type 2 and GitHub Actions.
- project: [Hospital Data Pipeline](https://github.com/DatphamC/hospital-data-pipeline) · GitHub, DatphamC · CSV to Snowflake to a dbt star schema, with data quality tests and published dbt docs.
- project: [Data & Analytics Engineering Project: AWS + Snowflake + dbt](https://github.com/wasimranacse/Data-Analytics-Engineering-Project-AWS-Snowflake-dbt-) · GitHub, wasimranacse · Raw, staging and marts layers in Snowflake with dbt.
- project: [Enterprise SaaS Analytics Platform](https://github.com/WizardNox/End-to-End-SaaS-Analytics-Engineering-Platform) · GitHub, WizardNox · Snowflake SQL layers refactored into dbt, with KPI reporting and Power BI.
- project: [End-to-End Retail Analytics Warehouse](https://github.com/prajuktapriyadarshini9-collab/End-to-End-Retail-Analytics-Warehouse) · GitHub, prajuktapriyadarshini9-collab · Olist data through Airbyte, Snowflake and dbt Core to dashboards.

## Practice

1. Review at least four of the seven projects using the "what to look for" table. Keep your notes in a file called `notes/project-reviews.md` in your repository.
2. For each project, write one thing you will borrow and one thing you would do differently.
3. Pick the single best README among them and list the sections it uses, in order. You will use this list in the next lesson.

## Example answer

A strong review, for the Hospital Data Pipeline:

| Question | Notes |
|---|---|
| Business questions | Hospital operations: appointments, treatments and billing |
| Ingestion | Python script with the Snowflake connector loads CSV extracts into a RAW schema, full refresh |
| dbt layout | RAW, STAGING, ANALYTICS: 5 sources, 5 staging models, 6 marts |
| Grain stated? | Yes, a clear table of each dimension and fact with its grain |
| Tests | Data quality tests on the marts; worth checking whether any go beyond keys |
| Documentation | Column-level docs published as a live site on GitHub Pages; lineage image in the README |
| Automation | A cron job runs a shell script daily (ingest, then dbt run, then dbt test) |
| Could I run it? | Yes: `.env.example`, a lock file and setup steps |
| **Borrow** | The grain table and the published docs site |
| **Do differently** | Use `dbt build` instead of `dbt run` then `dbt test`, so a failed test stops downstream models; run it from GitHub Actions rather than cron on one machine |

For step 3, a good answer picks the Netflix project's README and lists: project overview, project summary, what the data is, the problem the project solves, primary use cases and who would use the result, and only then the technical sections. Other READMEs are also good choices; what matters is that you can name why the one you chose works.

# Lesson: Presenting your work

minutes: 45

## The work is not done until someone understands it

A hiring manager may spend five minutes on your repository. In that time they need to understand what you built, why, and whether you did it well. Presenting your work is part of the job: analytics engineers explain data models to stakeholders every week.

## README structure

Your README is the front door. Use this structure, and keep each section short:

1. **Title and one-sentence summary.** "An analytics platform for ShopLink, a Lagos electronics distributor: raw orders to tested, documented revenue marts in Snowflake, deployed with GitHub Actions."
2. **The business problem.** Three or four sentences, and the questions the marts answer.
3. **Architecture.** A simple diagram from source to marts, with the tools named.
4. **Lineage.** A screenshot of the dbt DAG.
5. **Data model.** A table of marts with the grain of each, and ideally a small diagram of the star schema.
6. **Data quality.** What you test, the data problems you found and how you handled them. Link to `DATA_QUALITY.md`.
7. **Environments and deployment.** Dev, CI and prod; what runs when; a link to a green workflow run.
8. **How to run it.** The exact commands, and the environment variables needed (never their values).
9. **What I would do next.** Two or three honest improvements. This shows judgement.

## Lineage and DAG screenshots

Generate the docs site and open the lineage graph:

```bash
dbt docs generate
dbt docs serve
```

In the browser, click the lineage button at the bottom right to open the full graph. For a clear screenshot, filter it: typing `+fct_order_lines` in the select box shows the fact table and everything upstream of it. Save the image to a `docs/` folder in your repository and embed it in the README:

```markdown
![dbt lineage for fct_order_lines](docs/lineage.png)
```

Crop it so the model names are readable. A clear graph of eight models beats an unreadable graph of forty.

## A five-minute walkthrough

Record a short video (a free screen recorder or a video call recording is fine) or write the same content as a one-page write-up. Five minutes is enough if you plan it:

| Time | Show |
|---|---|
| 0:00 to 0:45 | The business problem and the questions |
| 0:45 to 1:45 | The architecture and the lineage graph |
| 1:45 to 3:00 | One mart in detail: its grain, one tricky piece of logic, how it is tested |
| 3:00 to 4:00 | A data problem you found and how you handled it |
| 4:00 to 5:00 | CI and production: a green run, and what happens when a test fails |

Speak to a manager, not an examiner. "Net revenue excludes cancelled and returned orders, because finance only counts money we keep" is better than reading out SQL.

## What hiring managers look for

People who hire analytics engineers read portfolios for evidence of judgement, not just tool names:

- **Business understanding.** Do the marts answer real questions, and is the revenue definition precise?
- **Modelling judgement.** Is the grain clear? Are facts and dimensions sensible? Is there any double counting?
- **Quality mindset.** Are there tests beyond keys? Were the data problems noticed and handled?
- **Engineering habits.** Clean pull requests, readable commits, no secrets in Git, CI that actually runs.
- **Communication.** Can they follow the README without asking you anything?

The most common reasons a portfolio project falls flat are a README that lists tools but not purpose, no tests beyond `unique` and `not_null`, committed passwords or keys, and build outputs such as `target/` and `logs/` committed to the repository. Check yours for all four.

## Resources

- docs: [About READMEs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes) · GitHub · Where READMEs appear and how to format them.
- docs: [About documentation](https://docs.getdbt.com/docs/build/documentation) · dbt Labs · Descriptions, docs blocks and the lineage graph.
- docs: [dbt docs command](https://docs.getdbt.com/reference/commands/cmd-docs) · dbt Labs · `dbt docs generate` and `dbt docs serve` options.

## Practice

1. Rewrite your README using the nine-part structure.
2. Generate the docs, take a readable lineage screenshot and embed it.
3. Plan your five-minute walkthrough with the timing table, then record it or write it up.
4. Ask one person who has never seen your project to read only the README for five minutes, then tell you what it does. Note what they got wrong, and fix the README.

## Example answer

A strong README opening for ShopLink:

```markdown
# ShopLink analytics platform

An analytics platform for ShopLink Distribution, a Lagos electronics distributor:
raw order data loaded into Snowflake, modelled with dbt into tested, documented
revenue marts, and deployed daily with GitHub Actions.

## The business problem

ShopLink's teams each calculated revenue their own way, so sales, finance and
operations reported different numbers. This project defines net revenue once and
answers four questions: monthly revenue by state and warehouse, top categories and
brands, top customers and their reorder rate, and cancellation rates by channel.

## Data model

| Mart | Grain |
|---|---|
| fct_order_lines | One row per order line |
| fct_orders | One row per order |
| dim_customer | One row per customer version (SCD Type 2, from the customers snapshot) |
| dim_product | One row per product |
| dim_warehouse | One row per warehouse |
| dim_date | One row per calendar day |
```

For step 4, a typical first-reader mistake is thinking the project includes the dashboard, because the architecture diagram showed a BI box without saying it was optional. The fix is one line under the diagram: "BI is out of scope; the marts are ready for any BI tool." Your own reader will find something different, and whatever they misread is worth fixing.

# Quiz

passing_score: 70

### In the end-to-end workflow, where should the logic that removes ShopLink's 6 duplicate order lines and cleans the status values live?

- [ ] In the raw layer, by editing the loaded data
- [x] In the staging models, which clean each source table before any business logic
- [ ] In each mart separately, wherever it is needed
- [ ] In the BI tool

> Raw data is kept exactly as it arrived so problems can be traced. Staging cleans each source once, so every downstream model inherits the fix.

### A teammate's pull request changes fct_order_lines. What should happen before it reaches production?

- [ ] They run dbt build --target prod from their laptop to check it works
- [ ] It is merged immediately, and the scheduled run catches any problems
- [x] CI builds and tests the change in an isolated schema, a reviewer approves it, and only then is it merged to main for the scheduled production run
- [ ] The production tables are backed up and edited by hand

> Changes move through Git: CI proves the change builds and passes tests in isolation, review adds a second pair of eyes, and production only ever builds what is on main.

### Your capstone is behind schedule. Which cut does the least damage?

- [ ] Remove the tests on keys and relationships
- [ ] Skip the README and let the code speak for itself
- [x] Drop the planned third fact table and the optional dashboard, keeping fewer marts fully tested, documented and deployed
- [ ] Turn off CI so pull requests merge faster

> Cut width, not depth. Fewer finished marts show better judgement than more unfinished ones, and tests, documentation and CI are exactly what reviewers look for.

# Project: Capstone: an end-to-end analytics engineering platform

max_score: 100

## Brief

Build and present a complete analytics engineering project: data loaded into a cloud warehouse, modelled with dbt through staging, intermediate and mart layers, tested and documented, version controlled with pull requests, and deployed with separate environments and CI. Use ShopLink (option A) or a dataset of your choice (option B). This is the project you will show employers, so finish it properly.

## Deliverables

1. **A GitHub repository** (your `shoplink-analytics` repository for option A, or a new one for option B) containing:
   - A repeatable load script for the raw layer.
   - A dbt project with staging, intermediate and mart models: at least one fact and two dimensions, with the grain of each documented.
   - Tests: keys, relationships, at least three business-rule tests, source freshness, a contract on the main fact table and an anomaly or row-count check.
   - Documentation for every mart and column, and a `DATA_QUALITY.md`.
   - `dev` and `prod` targets, no secrets in Git, and a GitHub Actions workflow running `dbt build` on pull requests and on a schedule.
2. **A README** following the nine-part structure from the "Presenting your work" lesson, with an architecture diagram, a lineage screenshot, the data model table and a link to a green workflow run.
3. **A five-minute walkthrough**, as a video link (YouTube unlisted, Loom, Google Drive) or a one-page write-up in the repository.
4. **Optional:** a small BI dashboard on your marts, with a screenshot in the README.

## How to submit

Make sure `main` is up to date and the latest workflow run on `main` is green. Paste the link to the repository into the submission form. In the note, include the link to your walkthrough and one sentence on the part of the project you are proudest of.

## Grading guide

| Criterion | Points |
|---|---|
| Modelling: facts and dimensions answer the stated business questions; grain is explicit and correct; no double counting; sensible use of intermediate models | 20 |
| Transformation: a clean staging layer that handles the real data problems; readable, modular SQL; reusable logic in macros or intermediate models rather than copied | 15 |
| Testing and quality: keys and relationships tested; three or more meaningful business-rule tests; freshness, contract and anomaly check in place and explained | 15 |
| Documentation: every mart and column described; docs generated; DATA_QUALITY.md explains each check and what to do when it fails | 10 |
| Version control: work merged through focused pull requests with clear descriptions; sensible commits; no secrets, build outputs or data dumps committed | 10 |
| Deployment: separate dev and prod environments; CI on pull requests and a scheduled production run, both green; secrets handled with env_var() and repository secrets | 15 |
| Presentation: the README follows the structure and can be understood without help; lineage screenshot; a clear five-minute walkthrough aimed at a business audience | 15 |
