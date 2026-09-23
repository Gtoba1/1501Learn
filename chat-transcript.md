# Chat Transcript: Data & Analytics Engineering Bootcamp

**Date:** 23 September 2026
**Participants:** TD Africa dev team and Claude

This file records the conversation that produced the 4-week curriculum, the training material, the course web app and the trainer dashboard. User messages are verbatim. Assistant replies are reproduced as written; tool activity (searches, file builds, publishing) is summarised in brackets.

**Artifacts produced**

| Artifact | Link / file |
| --- | --- |
| Training material (Claude Doc) | https://claude.ai/code/artifact/de34576d-2fb1-471b-a837-37c58c67df1d |
| Course web app with trainer dashboard | https://claude.ai/artifact/T8QrRJoD7mvxKM3tW6Jgjm |
| App source (this zip) | `index.html` |

---

## 1. User

> Act as a certified expert in data and analytics engineering. Develop a curriculum to train beginner to expert within a 4-week timeline

## 1. Assistant

# Data & Analytics Engineering Bootcamp: 4-Week Intensive Curriculum

**On the timeline:** four weeks can't produce a true expert, because expertise comes from years of production incidents, scale problems and design trade-offs. What four weeks *can* do is take a motivated beginner to a **job-ready practitioner** who has built a full production-style data platform end to end and has working exposure to the advanced topics experts deal with. The curriculum below is designed for that outcome and assumes roughly **45–50 hours per week**: about 2 hours of concepts, 4 hours of hands-on labs and 1 hour of review each weekday, plus a project each weekend.

**Prerequisites:** basic computer literacy and comfort with spreadsheets. No programming experience is required, though it helps.

**Core stack:** PostgreSQL, SQL, Python (pandas/Polars), DuckDB, Git, Docker, dbt Core, Airflow or Dagster, Power BI, Azure (Data Factory, Data Lake, Fabric or Databricks), Spark, and GitHub Actions. I chose a Microsoft-leaning cloud stack because it matches a PostgreSQL/.NET/D365 environment. The concepts transfer directly to AWS, GCP, Snowflake and BigQuery.

### Week 1: Foundations (SQL, Data Modeling, Tooling)

**Goal:** think in sets, model data correctly, and work like an engineer rather than an analyst.

| Day | Concepts | Hands-on lab |
|---|---|---|
| 1 | Data roles (DE vs AE vs analyst), the modern data stack, OLTP vs OLAP. Git basics, command line, Docker basics | Run PostgreSQL in Docker, load a sample database (e.g. Northwind or Pagila), and push your first repo |
| 2 | SQL core: SELECT, filtering, joins (all types), aggregation, GROUP BY/HAVING, NULL semantics | 40 graded query exercises on the sample database |
| 3 | Advanced SQL: CTEs, window functions (ROW_NUMBER, LAG/LEAD, running totals), subqueries, CASE, date logic | Build cohort retention, running revenue and top-N-per-group queries |
| 4 | Relational modeling: normalization (1NF–3NF), keys, constraints, indexes, reading EXPLAIN plans | Design and build an OLTP schema for an order-management system, then optimize three slow queries |
| 5 | Dimensional modeling (Kimball): facts, dimensions, grain, star vs snowflake, slowly changing dimensions (Types 1, 2, 3) | Convert the OLTP schema into a star schema with an SCD Type 2 customer dimension |

**Weekend project:** design a sales data mart from raw transactional tables, with a documented ERD, a grain statement for every fact table, and 10 business questions answered in SQL.

**Friday assessment:** a timed SQL test (window functions and joins) plus a modeling whiteboard exercise.

### Week 2: Data Engineering (Python, Ingestion, Pipelines, Orchestration)

**Goal:** move data reliably from sources into a warehouse, on a schedule, with failure handling.

| Day | Concepts | Hands-on lab |
|---|---|---|
| 1 | Python for data: data types, functions, virtual environments, pandas/Polars, file formats (CSV, JSON, Parquet) | Clean a messy dataset and compare CSV vs Parquet size and read speed |
| 2 | Ingestion patterns: batch vs incremental, full vs delta loads, watermarks, CDC concepts, REST API extraction, pagination, retries | Build a Python extractor that pulls from a public API incrementally and lands raw JSON |
| 3 | ETL vs ELT, raw/staging/mart layers (medallion: bronze/silver/gold), idempotency, backfills | Build an idempotent loader into PostgreSQL that can safely rerun any date |
| 4 | Orchestration: DAGs, scheduling, dependencies, sensors, retries, alerting (Airflow or Dagster) | Orchestrate extract → load → transform in Airflow running in Docker |
| 5 | Data quality at ingestion: schema validation, contracts, dead-letter handling, logging and observability | Add schema checks and failure alerts, then deliberately break the source and confirm the pipeline catches it |

**Weekend project:** an end-to-end pipeline that ingests two sources (an API and a database), lands them in bronze, cleans them into silver, runs on a schedule, and survives a rerun without duplicating data.

**Friday assessment:** a code review of your pipeline against an idempotency and error-handling checklist.

### Week 3: Analytics Engineering (dbt, Testing, Semantic Layer, BI)

**Goal:** turn raw data into trusted, documented, tested business models that analysts and executives rely on.

| Day | Concepts | Hands-on lab |
|---|---|---|
| 1 | dbt fundamentals: models, sources, refs, materializations (view, table, incremental, ephemeral), project structure | Scaffold a dbt project on your Week 2 data with staging models |
| 2 | dbt advanced: incremental models, snapshots (SCD2), Jinja, macros, packages (dbt_utils) | Build incremental fact models and a snapshot-based customer dimension |
| 3 | Testing and data quality: generic and singular tests, freshness, unit tests, data contracts, documentation and lineage | Reach 100% test coverage on keys, and generate and publish dbt docs |
| 4 | Metrics and the semantic layer: defining metrics once, conformed dimensions, avoiding metric drift | Define revenue, margin, and active-customer metrics consistently |
| 5 | BI and data storytelling: Power BI modeling, relationships, DAX basics (CALCULATE, time intelligence), row-level security, dashboard design | Build an executive sales dashboard on top of your gold layer |

**Weekend project:** a complete analytics layer, with staging → intermediate → marts in dbt, full testing, documentation, and a Power BI dashboard that answers the Week 1 business questions.

**Friday assessment:** a stakeholder simulation. You receive a vague business request, translate it into a model plus a metric, and defend your design choices.

### Week 4: Cloud, Scale and Production (the Expert-Exposure Week)

**Goal:** understand how a platform runs at scale in production, and ship a capstone project.

| Day | Concepts | Hands-on lab |
|---|---|---|
| 1 | Cloud data platforms: data lakes, warehouses vs lakehouses, Delta/Iceberg, storage and compute separation, Azure Data Factory and Fabric/Databricks | Land your pipeline's output in ADLS as Delta tables |
| 2 | Distributed processing: Spark architecture, partitioning, shuffles, file sizing, when *not* to use Spark (DuckDB/Polars) | Process a multi-GB dataset in PySpark and tune partitioning |
| 3 | Streaming and real-time: events, Kafka/Event Hubs concepts, micro-batch vs streaming, exactly-once semantics | Build a simple streaming ingest with Spark Structured Streaming |
| 4 | DataOps: CI/CD for dbt and pipelines (GitHub Actions), environments (dev/test/prod), infrastructure as code (Terraform intro), slim CI | Add a CI pipeline that runs dbt build and tests on every pull request |
| 5 | Governance and operations: security, PII handling, access control, lineage and catalogs (Purview/Unity Catalog), cost management, SLAs, incident response | Write a runbook and a cost/SLA review for your platform |

**Capstone (weekend plus final presentation):** build a production-style platform around a realistic business domain. A strong option is ERP data: exporting sales, inventory and finance tables from a system like D365 F&O (via Synapse Link/data lake export or a sample dataset) and producing:

1. Automated incremental ingestion into a bronze/silver/gold lakehouse
2. dbt models with a star schema, snapshots and full test coverage
3. Orchestration with alerting
4. CI/CD and separate environments
5. A Power BI dashboard with row-level security
6. Architecture documentation, a data dictionary and a runbook

Candidates present to a panel and defend their trade-offs: why incremental, why this grain, how they'd handle 100× the volume, and what happens when a source schema changes.

### Assessment and Certification Rubric

| Area | Weight | "Pass" looks like |
|---|---|---|
| SQL and modeling | 25% | Correct grain, clean star schema, efficient queries |
| Pipeline engineering | 25% | Idempotent, incremental, observable, recoverable |
| Analytics engineering | 20% | Tested, documented, consistent metrics |
| Production readiness | 15% | CI/CD, environments, security, cost awareness |
| Communication | 15% | Explains design decisions to technical and business audiences |

### Recommended Resources

The main texts are *Fundamentals of Data Engineering* (Reis & Housley), *The Data Warehouse Toolkit* (Kimball), and *Designing Data-Intensive Applications* (Kleppmann) for the expert track. Official learning paths worth working through are dbt Learn (free), Microsoft Learn's DP-203/DP-700 paths, and the Databricks Academy fundamentals. For practice, use DataLemur or LeetCode SQL, Kaggle datasets, and the NYC Taxi dataset for scale work.

### After the 4 Weeks: Path to Real Expertise

The bootcamp builds the foundation. Expertise comes over the following 6–18 months from owning a production pipeline, getting on-call for data incidents, handling schema evolution and late-arriving data, doing cost optimization, and earning certifications such as Microsoft DP-700 (Fabric Data Engineer), Databricks Data Engineer Associate/Professional, or dbt Analytics Engineering Certification.

If it would help, I can turn this into a doc your team can edit and share, or expand any week into day-by-day lesson plans with lab exercises and answer keys.

---

## 2. User

> Develop a training material for this course with actual samples and class activities to go along

## 2. Assistant

[Created a Claude Doc, "Data & Analytics Engineering Bootcamp — Training Material", and filled it section by section.]

Contents of the doc:

- **0. How to use this material:** daily rhythm, facilitator notes, Docker/PostgreSQL/Python/dbt setup (docker-compose.yml, requirements.txt), and the shared course dataset, ShopLink Distribution Ltd (customers, products, warehouses, orders, order_lines), with schema DDL and seed data.
- **Week 1, Foundations:** lesson notes per day; SQL samples (revenue by warehouse, anti-join, running totals, top-N per group, deduplication, EXPLAIN ANALYZE); star-schema DDL and an SCD Type 2 example; class activities (Follow the Naira, Join Tag, Human Window Function, Spreadsheet Surgery, Grain Court); exercises with an answer key; weekend project; Friday assessment.
- **Week 2, Data Engineering:** pandas/Polars/DuckDB samples; incremental API extractor with backoff and watermark; idempotent loader and upsert; Airflow DAG; Pydantic validation and health checks; activities (Format Race, Watermark Whodunit, Run It Twice, Be the Scheduler, Chaos Monkey); exercises and answers; project; code-review checklist.
- **Week 3, Analytics Engineering:** dbt project structure, sources, staging, incremental fact, macro, snapshot, dimension; tests, contracts and unit tests; metric definitions and the semantic layer; Power BI DAX measures and RLS; activities (Lineage Detective, Snapshot Time Machine, Break My Model, Revenue Argument, Five-Second Test); exercises and answers; project; stakeholder simulation.
- **Week 4, Cloud, Scale and Production:** Delta merge and time travel; Spark broadcast join and table maintenance; Structured Streaming from Event Hubs; GitHub Actions slim-CI workflow; Terraform for ADLS; RBAC and PII masking; cost query; runbook template; activities (Architecture Pitch, Shuffle Relay, Late Delivery, PR Review Party, Incident Drill); capstone brief and grading rubric.
- **Appendices:** overall grading weights, glossary, SQL/dbt/Airflow cheat sheets, warm-up question bank, further resources.

A comment in the doc asks whether the Week 4 cloud labs should standardise on Databricks or Microsoft Fabric.

> The Data & Analytics Engineering Bootcamp training material is ready. You can edit it inline, comment on any part, or share it with your trainers.

---

## 3. User

> create a full web app that helps to present this course as an offering. It presents the course in modules and sections with inline videos where appropriate. Use videos from publicly available sources like YouTube. Users must complete each section in the module before they can proceed to the next and can only progress module by module after all the sections in each module is completed. At the end of each module, there should be a test to confirm section completion. At the end of each module, there should be a hands-on project to complete the module.

## 3. Assistant

[Verified 13 public YouTube videos via web search, designed the app around the medallion layers (raw → bronze → silver → gold), built `index.html`, tested the gating logic and layouts on desktop and mobile, and published it.]

> The course web app is live as the Data & Analytics Engineering Bootcamp.
>
> It opens on a course overview. The four modules are shown as stages of one data pipeline (raw, bronze, silver, gold), and the pipeline fills in as the learner progresses. Each module has five sections, and each section contains:
>
> - lesson notes and key ideas,
> - a worked code sample on the ShopLink dataset,
> - the class activity and the lab,
> - a YouTube video where one helps (13 in total, from freeCodeCamp, techTFQ, coder2j, TechWorld with Nana, Fireship and others).
>
> **How progression is locked:**
> - A section can only be marked complete once the learner has scrolled to the end of it, and that opens the next section.
> - After all five sections, the module test opens. It has 6–7 questions and a 70% pass mark. Learners can retake it; missed questions are flagged without revealing the answers.
> - Passing the test opens the hands-on project. To submit, the learner must tick every deliverable, add a repository link and write a short reflection.
> - Submitting the project unlocks the next module. After the Module 4 capstone, a certificate page appears.
>
> **Things to know:**
> - **Videos:** they load when clicked. If the viewer blocks the embedded player, each video has an "Open on YouTube" link. Completion can't track how much of a video someone actually watched.
> - **Saving progress:** progress is saved privately to each learner's account when their access allows it. Otherwise it falls back to their browser, and the header shows which one is in use.
> - **Project checks:** submissions are self-reported. The app records the repo link and notes for your instructors, but it doesn't check the work itself.
>
> If you want instructors to see every learner's progress and project links in one place, I can add a trainer dashboard next.

---

## 4. User

> add a trainer dashboard

## 4. Assistant

[Added a roster store (learners write their own row, trainers read all), a reviews store (trainers write, learners read their own), the dashboard and detail views, a project review flow with resubmission, and CSV export. Tested with mock learner data and republished.]

> The course app now has a trainer dashboard. It appears as a "Trainer dashboard" button in the header, but only for people with edit access to the page.
>
> **Overview page:**
> - Headline numbers: learners enrolled, active in the last 7 days, average progress, projects awaiting review, and course completions.
> - A completion bar for each module across the cohort.
> - A learner table showing each person's progress, current step, and status per module. The module status reads, for example, "3/5 sections", "Test 4/7, 2 attempts", "Needs review", "Changes requested" or "Approved". You can search by name and sort by progress, name or last active.
> - **Download CSV** exports the whole cohort, including repo links and review status.
>
> **Learner detail page** (click a name):
> - When each section was completed.
> - Test scores and attempt counts, plus which questions were missed on the latest attempt.
> - Project deliverables, the repository link and the learner's reflection.
> - A review form: **Approve** or **Request changes**, with written feedback.
>
> **What learners see:** your feedback appears on their project page. If you request changes, the project reopens for resubmission and shows up as "Needs review" again once they resubmit. Their next module stays unlocked in the meantime, so a review never blocks progress.
>
> **Access:**
> - Learners need **"Can interact"** access to appear on the dashboard. View-only users can still take the course, but their progress saves only in their own browser and trainers won't see it.
> - Anyone you give **"Can edit"** access becomes a trainer.
> - Learners can't see each other's progress or reviews.
> - Trainers don't show up in the learner list unless they start taking the course themselves.
>
> I tested this with sample learners. With a real cohort, names come from people's Claude profiles.

---

## 5. User

> Export the web app to a zip file. Also add the md for this chat

## 5. Assistant

[Packaged `index.html`, a `README.md` (features, hosting modes, access rules, video list, how to edit content) and this `chat-transcript.md` into `shoplink-course-app.zip`.]
