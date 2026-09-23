# Data & Analytics Engineering Bootcamp: Course Web App

A single-file web app (`index.html`) that presents the 4-week Data & Analytics Engineering course for ShopLink Distribution as a gated, self-paced offering.

## Contents

| Path | What it is |
| --- | --- |
| `index.html` | The course app and trainer dashboard. Open it, or publish it |
| `WEEK4-TRAINING-MATERIAL.md` | Trainer material for Week 4 on the open stack, with labs, activities, exercises and answer key |
| `week4-stack/` | The Week 4 lakehouse: `docker-compose.yml`, driver image, Spark config, OpenTofu |
| `chat-transcript.md` | How the curriculum, material and app were produced |

## What it does

- **4 modules × 5 sections.** Each section has lesson notes, key ideas, a worked code sample, a class activity, a lab and, where useful, a YouTube video.
- **Gated progression.** A section can be marked complete only after the learner scrolls to its end. Sections unlock in order; the module test unlocks after all sections; the project unlocks after passing the test (70%); submitting the project unlocks the next module.
- **Module tests.** 6–7 multiple-choice questions, retakes allowed; missed questions are flagged without revealing answers.
- **Hands-on projects.** Deliverables checklist, repository link and reflection are required to submit. Module 4's project is the capstone.
- **Certificate** after all four projects are submitted.
- **Zero-cost stack.** Every tool the course uses is free and open source, with no trial clock, seat count or credit card.
- **Trainer dashboard** (`#/trainer`, editors only): cohort stats, module completion, a searchable, sortable learner table, per-learner drill-down, project reviews (Approve / Request changes with feedback) and CSV export.

## Prerequisites for learners

Docker Desktop, Git and Python 3.11+. Everything else runs inside containers. Module 1 Section 1 carries per-OS install steps and verification commands in a "Before you start" block — send learners there the week before the course, because a room installing Docker simultaneously costs you the first morning.

## Course stack

Weeks 1–3 run on PostgreSQL, Python, DuckDB, Airflow and dbt Core under Docker, with Power BI Desktop (free) for BI. Week 4 replaces the managed cloud platform with an open lakehouse that runs on the same laptop:

| Week 4 concept | Tool | Maps to |
| --- | --- | --- |
| Object storage / data lake | MinIO | S3, ADLS — same `s3a://` paths and credentials model |
| Table format: ACID, MERGE, time travel | Delta Lake OSS | Delta on Databricks or Fabric |
| Distributed processing | Apache Spark standalone (1 master, 2 workers) | Any managed Spark |
| Streaming | Apache Kafka (KRaft mode) | Event Hubs, Confluent, Redpanda |
| Catalog, grants, lineage | Unity Catalog OSS + OpenLineage/Marquez | Unity Catalog, Purview |
| CI/CD | GitHub Actions | free and unlimited on public repos; 2,000 min/month on private free tier |
| Infrastructure as code | OpenTofu (Docker + MinIO providers) | Terraform against a cloud provider |

The point of this choice is that nothing is simulated: learners size real executors, watch real shuffles in the Spark UI and replay real Kafka partitions. Porting a job to S3 or ADLS is an endpoint and credentials change, which Module 4's test asks them to explain.

**Why not Databricks or Fabric.** Databricks Free Edition is genuinely free but its terms exclude commercial use — which corporate training is — and it is serverless-only, so the Spark cluster-tuning section cannot be taught on it. The Fabric trial expires after 60 days and then needs paid capacity.

**Hardware.** Everything runs locally on the learner's own machine. Weeks 1–3 are comfortable on 8 GB; the full Week 4 stack wants about 16 GB. Machines short of that can still do Week 4 by running the governance profile only on the day it is needed and dropping to a single Spark worker — the shuffle stays real, just narrower. `week4-stack/README.md` has the details.

## Running it

### Inside claude.ai (full features)
The published artifact uses the claude.ai runtime for per-learner progress (`roster/<id>`), trainer reviews (`reviews/<id>`), learner names and CSV download. Access rules:

| Path | Read | Write |
| --- | --- | --- |
| `roster` | editors | editors |
| `roster/{self}` | the learner | the learner |
| `reviews` | editors | editors |
| `reviews/{self}` | the learner | editors |

Learners need **Can interact** access to appear on the dashboard; people with **Can edit** access are trainers.

### Standalone (any static host or opened locally)
Open `index.html` in a browser or host it on any static server. Without the claude.ai runtime, the app runs in **single-learner mode**: progress is saved in the browser's localStorage, and the trainer dashboard, cloud sync and CSV download are unavailable. To run it as a multi-user LMS elsewhere, replace the `connectStore`, `pushRemote` and trainer subscription functions with calls to your own backend (for example, a .NET Core Web API + PostgreSQL with the same roster/review document shapes).

## Videos used (all public YouTube)

| Module | Section | Video | Channel |
| --- | --- | --- | --- |
| 1 | SQL core | HXV3zeQKqGY | freeCodeCamp.org |
| 1 | CTEs and window functions | Ww71knvhQ-s | techTFQ |
| 1 | Dimensional modeling | TtxfKIe0HuQ | Data with Baraa |
| 2 | Python for data | vmEHCJofslg | Keith Galli |
| 2 | Orchestration with Airflow | K9AnJ9_ZAXE | coder2j |
| 3 | dbt fundamentals | toSAAgLUHuk | Learn Data Analysis |
| 3 | Incremental models and snapshots | B8uwFmVt4sU | Ansh Lamba |
| 3 | Metrics and the semantic layer | ai4vZiIcEt4 | Mr. K Talks Tech |
| 3 | Power BI and storytelling | 4rC9Ow76n0U | Power BI DAX full course |
| 4 | The lakehouse on object storage | 2KMTIU9Gksk | Paul Andrew |
| 4 | Spark | bfqiGAn6Ws0 | PySpark crash course |
| 4 | Streaming | uvb00oaa3k8 | Fireship |
| 4 | CI/CD and IaC | R8_veQiYBjI | TechWorld with Nana |

Videos load on click via `youtube-nocookie.com`; each has an "Open on YouTube" fallback link.

## Editing content
All course content lives in the `COURSE` array near the top of the `<script>` block: sections, videos, code samples, activities, test questions (`a` = index of the correct option) and project deliverables. `PASS_MARK` sets the test threshold.
