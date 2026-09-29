---
module: 1
title: Data Engineering Foundations
optional: false
summary: Understand what data engineers do and where the role sits in a data team, the data engineering lifecycle from source systems to serving, the difference between a warehouse, a lake and a lakehouse, and when to choose batch or streaming. You also meet ShopLink, the company whose data platform you will build from here to the capstone.
---

# Lesson: What data engineering is

minutes: 40

## Why the role exists

Picture ShopLink's Monday leadership meeting. The sales dashboard still shows Friday's numbers because a script failed on Saturday night and nobody noticed. Finance exported orders to a spreadsheet by hand and missed the WhatsApp orders. The operations team is waiting for a copy of the app database that takes six hours to run and slows the app down for customers while it does.

None of these are analysis problems. The data exists; it just does not arrive reliably, on time, in one place. Data engineering exists to fix that. A data engineer builds and runs the systems that move data from where it is created to where it is used, and makes sure those systems keep working every day without someone babysitting them.

## A working definition

Data engineering is the practice of designing, building and operating the systems that collect, store, move and prepare data, so that analysts, analytics engineers, data scientists and applications can use it reliably.

Three ideas sit inside that definition:

1. **The output is a working system, not a one-off result.** A query that answers today's question is analysis. A pipeline that loads yesterday's orders every morning at 06:00, retries when the source is slow, and alerts someone when it fails is engineering.
2. **Reliability is the product.** Nobody thanks a data engineer when the data arrives on time. Everyone notices when it does not. Most of the craft is about failures: late files, changed columns, duplicate records, servers that restart.
3. **The work is treated as code.** Pipelines, infrastructure and configuration live in Git, are reviewed in pull requests and are tested before they run in production, the same way a software team ships an app.

## Where the role sits

Most data teams split the work into three overlapping roles:

| Role | Main question | Typical output |
|---|---|---|
| Data engineer | How does data get from source systems into the warehouse or lake, reliably and at scale? | Ingestion pipelines, storage, orchestration, infrastructure |
| Analytics engineer | How do we turn that raw data into models the business can trust? | Tested, documented tables and shared metric definitions |
| Data analyst | What is the data telling us, and what should we do about it? | Analysis, dashboards, recommendations |

The boundaries blur. In a small company one person may do all three, and many data engineers write dbt models as well as pipelines. What makes someone a data engineer is where most of their time goes: getting data in, keeping it flowing, and running the platform it lives on.

1501 Learn also has an Analytics Engineering track, which goes deep on the transformation layer. This track touches transformation (you meet dbt briefly in Module 6) but spends most of its time on ingestion, storage, orchestration, processing and infrastructure.

## What the job looks like day to day

A typical week might include:

- Writing a Python extractor for a new source, such as a courier company's delivery API.
- Investigating why last night's load produced 40% fewer rows than usual, and finding that the source changed a column name.
- Adding retries and an alert to a pipeline that fails whenever the source database is being backed up.
- Reviewing a teammate's pull request that changes a Docker Compose file or an Airflow DAG.
- Moving a slow job from a single Python script to Spark because the data has grown tenfold.
- Checking the cloud bill and switching off a cluster someone forgot to stop.

## The skills this track builds

Python and SQL are the core skills, and you use both in almost every module. Around them you learn the command line, Git and Docker (Module 2), how warehouses and lakes store data (Module 5), how to build pipelines that are safe to rerun (Module 6), orchestration with Airflow (Module 7), distributed processing with Spark (Module 8), and streaming with Kafka plus cloud storage on AWS (Module 9). The capstone in Module 10 puts them together into one platform.

## Resources

- read: [Data engineer career path](https://learn.microsoft.com/en-us/training/career-paths/data-engineer) · Microsoft Learn · How Microsoft describes the role and its responsibilities. Read the overview; the Azure training modules are optional.
- watch: [Data Engineering Course for Beginners](https://www.youtube.com/watch?v=PHsC_t0j1dU) · freeCodeCamp.org · 11.9M subscribers · 1.1M views · 17K likes · published 2024-01-16 · checked 2026-09-28 · 184 min
- deeper: [Fundamentals of Data Engineering](https://www.oreilly.com/library/view/fundamentals-of-data/9781098108298/) · Joe Reis and Matt Housley, O'Reilly (paid) · Chapter 1 defines the field and the data engineer's place in an organisation.

## Practice

Find three real data engineer job adverts, on LinkedIn or any job board. For each one, write down:

1. The tools it names (for example Python, SQL, Airflow, Spark, Kafka, AWS, Docker).
2. Three responsibilities in your own words.
3. One thing in the advert that sounds more like analytics engineering or data analysis than data engineering.

Then write two or three sentences on what the three adverts have in common. Keep your notes: they help with the module project.

## Example answer

Your adverts will differ, but a strong set of notes for one of them looks like this:

- **Tools:** Python, SQL, Airflow, AWS (S3, Glue), Docker, Terraform, PostgreSQL.
- **Responsibilities:** build and maintain pipelines that bring data from internal apps and partner APIs into the lake; monitor pipelines and fix failures before the business notices; keep infrastructure defined in code and costs under control.
- **Not quite DE:** "Build Power BI dashboards for the commercial team" is analyst work.

**What they have in common:** all three ask for Python and SQL, all three mention an orchestrator (Airflow in two, Azure Data Factory in one), and all three talk about reliability, monitoring or data quality. The cloud platform differs from company to company; Python, SQL, Git and Docker do not.

If your adverts mostly described building dashboards or writing dbt models, you probably found analytics roles with a data engineering title. That is common, and noticing it is part of the exercise.

# Lesson: The data engineering lifecycle

minutes: 45

## From source to value

Tools come and go. The shape of the work does not. Joe Reis and Matt Housley, in *Fundamentals of Data Engineering*, describe it as a lifecycle with five stages, supported by a set of practices they call undercurrents. It is a useful map: whatever tool you are handed, you can ask which stage it serves.

| Stage | Question it answers | ShopLink example |
|---|---|---|
| Generation | Where is the data created, and who owns that system? | The ShopLink web app writes orders to its PostgreSQL database |
| Ingestion | How do we get the data out, how often, and in what form? | A Python script pulls changed orders from the orders API every night |
| Storage | Where do we keep it, in what format, for how long? | Raw JSON files in object storage, tables in a PostgreSQL warehouse |
| Transformation | How do we clean, combine and reshape it? | Remove duplicate order lines, standardise status values, build a sales fact table |
| Serving | How do people and systems use it? | A dashboard for leadership, a table for analysts, a feed for a pricing model |

Storage is not really a step between ingestion and transformation. It runs underneath every stage: data is stored when it lands, while it is transformed, and when it is served.

## Generation: you do not own the source

Data engineers rarely control the systems that create data. The app team owns the app database; a supplier owns its price-list files; a partner owns its API. That has consequences:

- The source can change without warning: a new column, a renamed field, a different date format.
- You must not harm it. A heavy query against the production app database at midday can slow down checkout for customers.
- You need to know how it behaves: does it update rows in place, or only add new ones? Does it ever delete? Does it have an `updated_at` column you can trust?

Good data engineers talk to the owners of their sources. A five-minute conversation with the app team ("do you ever hard-delete orders?") can save a week of debugging.

## Ingestion: the hardest stage to get right

Ingestion is where most pipelines break, because it is where your system meets systems you do not control. The main design questions are:

| Question | Options |
|---|---|
| How is the data offered? | Database connection, files dropped in a folder or bucket, a REST API, an event stream |
| How much do we take each time? | Everything (full load) or only what changed (incremental load) |
| How often? | Once a day, every hour, every few minutes, continuously |
| Push or pull? | We ask the source for data (pull), or the source sends it to us (push) |

You build all four kinds of ingestion for ShopLink in this track: database, files, API and stream.

## Transformation and serving

Transformation turns raw data into something useful: correct types, clean values, one version of each record, joined and aggregated into shapes the business understands. Serving is whatever puts the result in front of its users, from a dashboard to a table another system reads.

Data engineers own the plumbing for both: where transformations run, how they are scheduled, how much compute they get. The business logic inside them is often shared with analytics engineers.

## The undercurrents

Six practices run across every stage rather than sitting in one:

| Undercurrent | What it means in practice |
|---|---|
| Security | Least-privilege access, no passwords in code, personal data protected |
| Data management | Knowing what data you have, who owns it, what it means, how long to keep it |
| DataOps | Monitoring, alerting, testing and automating pipelines so failures are caught fast |
| Data architecture | Designing the whole system so it meets today's needs and can change tomorrow |
| Orchestration | Running each step in the right order, on schedule, with retries |
| Software engineering | Version control, code review, tests, readable code, containers |

A pipeline can move data correctly and still fail the undercurrents: if the database password is written in the script, or nobody is told when it breaks, it is not finished.

## Resources

- deeper: [Fundamentals of Data Engineering](https://www.oreilly.com/library/view/fundamentals-of-data/9781098108298/) · Joe Reis and Matt Housley, O'Reilly (paid) · Chapter 2 is the lifecycle and its undercurrents in full. The best single book for this track.
- read: [Get started with data engineering on Azure](https://learn.microsoft.com/en-us/training/paths/get-started-data-engineering/) · Microsoft Learn · A free learning path; its first module introduces the same stages with a cloud vendor's vocabulary.
- watch: [Data Engineering Course for Beginners](https://www.youtube.com/watch?v=PHsC_t0j1dU) · freeCodeCamp.org · 11.9M subscribers · 1.1M views · 17K likes · published 2024-01-16 · checked 2026-09-28 · 184 min

## Practice

Pick a business you know well: a bank, a ride-hailing app, a supermarket chain, or your own employer. For that business, write a short table with one row per lifecycle stage (generation, ingestion, storage, transformation, serving) and fill in:

1. One concrete example of what happens at that stage.
2. One thing that could go wrong there.

Then pick two undercurrents and give one example of each for your business.

## Example answer

Here is one example for a ride-hailing app operating in Lagos and Abuja:

| Stage | What happens | What could go wrong |
|---|---|---|
| Generation | The rider app records trips; the payments provider records card and transfer payments | The app team renames `fare` to `fare_amount` in a release |
| Ingestion | Trips are pulled from the app database every hour; payments arrive from the provider's API | The API rate-limits the extractor and half the payments are missing |
| Storage | Raw files in object storage, cleaned tables in a warehouse | Nobody sets a retention period and storage costs grow every month |
| Transformation | Join trips to payments, calculate driver earnings | A join duplicates trips with two payment attempts, so earnings are overstated |
| Serving | A daily earnings table feeds driver payouts and a finance dashboard | The dashboard refreshes before the load finishes and shows half a day |

**Undercurrents:** *security*: drivers' phone numbers and bank details are masked for analysts; *orchestration*: the transformation only starts after both the trips and payments loads succeed.

Your business will differ. Check that every "what could go wrong" is specific enough that you could write a check for it. "Bad data" is not specific; "a renamed column" is.

# Lesson: Warehouse, lake and lakehouse

minutes: 50

## Two kinds of database workload

Before comparing storage systems, separate two very different jobs a database can do:

| | OLTP (transactional) | OLAP (analytical) |
|---|---|---|
| Serves | The application | Analysts, dashboards, data science |
| Typical query | Read or update one order by its id | Sum a year of revenue by month and state |
| Rows touched per query | A handful | Millions |
| Design goal | Fast, safe small writes | Fast large scans and aggregations |
| ShopLink example | The app's PostgreSQL database (`shoplink_app`) | The analytical `warehouse` database, and later the lake |

Running heavy analytical queries on the OLTP database slows the app for customers, and the OLTP design is not built for them anyway. So data engineers copy the data into a system designed for analysis. There are three common shapes for that system. Module 5 goes deeper on OLTP and OLAP; here you need the big picture.

## The data warehouse

A **data warehouse** is a database built for analysis. Data is loaded into tables with a defined schema (column names and types), and queried with SQL. Modern cloud warehouses such as Snowflake, BigQuery and Amazon Redshift store data by column rather than by row, which makes large scans and aggregations fast, and they separate storage from compute so you can scale each independently.

Strengths: SQL for everyone, strong consistency, good performance for BI, easy access control. Weak spots: storing huge volumes of raw or unstructured data (images, logs, JSON blobs) is expensive or awkward, and you are tied to one vendor's engine.

In this track your first warehouse is PostgreSQL. It is a row-oriented OLTP database at heart, but at ShopLink's size it is a perfectly good warehouse, it is free, and everything you learn transfers.

## The data lake

A **data lake** is files in cheap **object storage**: Amazon S3, Azure Data Lake Storage, Google Cloud Storage, or RustFS (an open-source, S3-compatible object store) on your own laptop. You can store anything there, in any format (CSV, JSON, Parquet, images), at a fraction of a warehouse's price per GB, and many engines (Spark, Trino, DuckDB, Athena) can read it.

The catch is that plain files have no transactions and no enforced schema. If a job crashes halfway through writing 40 files, readers see 23 of them. Two jobs writing at once can interleave. Nothing stops a job writing a column as text that was a number yesterday. Lakes without discipline become "data swamps": full of files nobody trusts.

## The lakehouse

A **lakehouse** keeps the lake's cheap, open storage and adds the warehouse's reliability, using an **open table format**. The table format stores a transaction log next to the data files; the log, not the list of files, defines what the table contains. That gives you:

| Feature | What it gives you |
|---|---|
| ACID transactions | A write either commits or did not happen; readers never see half a load |
| Schema enforcement | A write with the wrong column types is rejected |
| Upserts (MERGE) | Update changed rows and insert new ones in one operation |
| Time travel | Read or restore the table as it was before a bad load |

The two leading formats are **Delta Lake** (the default on Databricks and Microsoft Fabric) and **Apache Iceberg** (widely supported by Snowflake, AWS, Trino and others). This track uses Delta Lake from Module 5; the ideas carry over to Iceberg.

## Layers: bronze, silver, gold

Whatever the storage, teams organise data in layers by how processed it is. Lakehouse teams call this the **medallion architecture**:

| Layer | Also called | What it holds |
|---|---|---|
| Bronze | Raw, landing | Data exactly as received, plus load metadata, so you can always replay it |
| Silver | Staging, cleaned | Typed, deduplicated, standardised data, one version per record |
| Gold | Marts, serving | Business-ready facts, dimensions and aggregates |

In ShopLink's PostgreSQL warehouse these become schemas `raw`, `staging` and `marts`; in the lake, buckets `bronze`, `silver` and `gold`. Same idea, two names.

## Which one should you choose?

| Situation | Sensible choice |
|---|---|
| A few GB of structured data, mostly SQL and BI users | A warehouse (for ShopLink today, PostgreSQL) |
| Large volumes, raw files you must keep, mixed data types, several engines | A lake with a table format: a lakehouse |
| Both needs, as in most growing companies | Raw data in the lake, curated tables served from a warehouse or a SQL engine over the lakehouse |

Be honest about scale. ShopLink's whole history is a few MB. It does not need Spark or a lake today; you build them in this track so you are ready when the data, or your next employer's data, is a million times bigger.

## Resources

- read: [What is a data lakehouse?](https://www.databricks.com/glossary/data-lakehouse) · Databricks · A short explanation from the company that coined the term.
- read: [What is a data lake?](https://aws.amazon.com/what-is/data-lake/) · Amazon Web Services · Lakes compared with warehouses, from the provider of S3.
- docs: [Medallion architecture](https://www.databricks.com/glossary/medallion-architecture) · Databricks · The bronze, silver and gold layers.
- watch: [Databricks Lakehouse Architecture | Delta Lake Databricks |Data Warehouse vs Data Lake vs Lakehouse](https://www.youtube.com/watch?v=NVhPkS7F5-8) · SleekData · 20.1K subscribers · 13.7K views · 249 likes · published 2024-11-22 · checked 2026-09-28 · 15 min
- deeper: [Designing Data-Intensive Applications, 2nd edition](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781098119058/) · Martin Kleppmann and Chris Riccomini, O'Reilly (paid) · The chapters on storage and analytics explain why row and column stores behave so differently.

## Practice

For each of these five situations, choose warehouse, lake or lakehouse, and write one sentence explaining why:

1. A 20-person accounting firm wants monthly reports from its invoicing system, about 2 GB of data.
2. A telecoms company keeps five years of call records, about 400 TB, and data scientists query them with Spark.
3. A hospital must keep scanned referral letters (PDF images) for seven years alongside structured appointment data.
4. An e-commerce company's analysts need yesterday's orders by 07:00, and the data science team trains models on three years of clickstream JSON.
5. ShopLink today.

## Example answer

1. **Warehouse.** Small, structured, SQL and reporting only; a lake would add moving parts for no benefit.
2. **Lakehouse.** At 400 TB, object storage is far cheaper than warehouse storage, Spark is already the engine, and a table format adds the transactions and schema control that plain files lack.
3. **Lake for the scans, warehouse (or lakehouse) for the appointments.** PDFs do not belong in warehouse tables; keep them as files and store their paths and metadata in tables.
4. **Lakehouse, or lake plus warehouse.** Clickstream JSON is large and semi-structured, which suits a lake; the orders tables analysts need can be served from the lakehouse's SQL engine or copied into a warehouse.
5. **Warehouse.** A few MB of structured data; PostgreSQL is plenty. The lake you add in Module 5 is for learning and for future growth.

Other answers are acceptable if the reasoning is about data volume, data types, who queries it and cost. If you chose a lakehouse for the accounting firm, ask what problem it would solve that a warehouse does not.

# Lesson: Batch vs streaming

minutes: 45

## Two ways to move data

**Batch** processing takes a bounded chunk of data (yesterday's orders, last hour's files), processes it, and stops. **Streaming** processes an unbounded flow of events continuously, as they happen.

| | Batch | Streaming |
|---|---|---|
| Unit of work | A chunk: a day, an hour, a file | An event: one order placed, one payment made |
| Latency | Minutes to hours | Seconds or less |
| Typical tools | Python scripts, SQL, dbt, Spark, scheduled by Airflow | Kafka, Spark Structured Streaming, Flink |
| Failure handling | Rerun the chunk | Resume from the last processed position |
| Cost and complexity | Lower | Higher: always-on infrastructure, harder testing |

Most of the data in most companies moves in batches, and that is not a failure of ambition. It is usually the right answer.

## Ask what latency the business actually needs

"Real time" is one of the most expensive phrases in data. Before building a stream, ask what decision will be made with the data, and how quickly that decision changes:

| Need | Latency that is enough | Approach |
|---|---|---|
| Leadership wants revenue right for the 09:00 meeting | Hours | Nightly batch |
| Warehouse managers check stock levels through the day | 15 minutes | Frequent micro-batches |
| A payment looks fraudulent and must be blocked before it completes | Under a second | Streaming |
| Sales reps want a live view of today's revenue on a screen in the office | Seconds to a minute | Streaming |

## Micro-batches: the middle ground

Between nightly batch and true streaming sits the **micro-batch**: a batch job that runs very often, every minute or every five minutes. Spark Structured Streaming, which you use in Module 9, works this way by default: it collects whatever arrived since the last trigger and processes it as a small batch. In practice, a lot of "streaming" is many small batches.

## Events, topics and replay

Streaming systems are built around **events**: small records of something that happened, such as "order 109524 was placed at 10:02:13 for ₦1,840,000". **Apache Kafka**, the most widely used event platform, stores events in named **topics** (ShopLink's will be `shoplink.orders`). Producers write events; consumers read them, each remembering how far it has read.

The property that makes Kafka different from a simple queue is that events stay in the topic for a retention period whether or not anyone has read them. If a consumer has a bug, you fix it and re-read from an earlier position. You learn Kafka properly in Module 9.

## Two ideas that matter in both

- **Event time and processing time.** Event time is when the order was placed. Processing time is when your pipeline saw it. A rep's phone in a Kano warehouse with no signal may send Monday's orders on Tuesday. Report on event time, or yesterday's numbers change depending on how busy your pipeline was.
- **Late and duplicate data.** Both batch and streaming pipelines receive records late and receive some records twice. Designing for that from the start (so a rerun or a replay does not double revenue) is the idea of **idempotency**, which you study in Module 6.

## ShopLink's choices

For ShopLink, the reports leadership asked for are daily, so the core platform is batch: nightly loads from the app database, the supplier file and the orders API, orchestrated by Airflow. One use case earns a stream: the sales team wants a live view of today's revenue during the day, so in Module 9 you publish order events to Kafka and aggregate them in near real time.

## Resources

- docs: [Introduction to Kafka](https://kafka.apache.org/intro/) · Apache Kafka · What event streaming is and how topics, producers and consumers fit together.
- read: [Batch processing vs stream processing](https://www.confluent.io/learn/batch-vs-real-time-data-processing/) · Confluent · A vendor overview of the trade-offs, with examples.
- watch: [Stream vs Batch processing explained with examples](https://www.youtube.com/watch?v=1xgBQTF24mU) · Andreas Kretz · 245K subscribers · 105.8K views · 561 likes · published 2021-11-19 · checked 2026-09-28 · 9 min
- deeper: [Designing Data-Intensive Applications, 2nd edition](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781098119058/) · Martin Kleppmann and Chris Riccomini, O'Reilly (paid) · The batch and stream processing chapters are the classic treatment.

## Practice

For each ShopLink request below, decide batch, micro-batch or streaming, name the latency you would promise, and give one sentence of reasoning:

1. The finance team wants monthly net revenue by state for its board pack.
2. Warehouse managers want to see which products are running low, several times a day.
3. The Head of Sales wants a screen in the Lagos office showing today's revenue, updating as orders come in.
4. The fraud team wants to flag any new customer who places orders worth more than ₦20 million within an hour of signing up, and hold the orders before they ship.
5. The marketing team wants a weekly list of customers who have not ordered for 90 days.

## Example answer

| Request | Choice | Latency | Reasoning |
|---|---|---|---|
| 1. Monthly revenue by state | Batch | Daily (the pack is monthly) | The decision is made once a month; a nightly load is more than enough |
| 2. Low-stock products | Micro-batch | 15 to 30 minutes | Managers act a few times a day; a job every 15 minutes is cheaper than a stream and fast enough |
| 3. Live revenue screen | Streaming | Under a minute | The whole point is to watch it move; a nightly batch would defeat the purpose |
| 4. Fraud hold on new customers | Streaming | Seconds to a minute | The orders must be held before they ship, so the check must run as the orders arrive |
| 5. Lapsed customers | Batch | Weekly | A weekly list for a weekly campaign |

Reasonable people disagree on 2 (hourly batch is also fine) and 4 (if orders only ship the next morning, an hourly batch could work; ask the fraud team). What matters is that each choice is tied to how quickly the decision is made, not to how exciting the technology is.

# Lesson: Meet ShopLink

minutes: 40

## The company

ShopLink Distribution is a fictional electronics distributor based in Lagos. It buys laptops, phones, tablets, accessories and networking equipment from manufacturers and suppliers, and sells them in bulk to resellers, schools and businesses across Nigeria.

Orders arrive through the ShopLink web app, and through sales reps who log WhatsApp and phone orders in the same app. Each order is fulfilled from one of ShopLink's five warehouses, in Lagos, Abuja, Port Harcourt, Kano and Ibadan.

ShopLink is growing fast, and its data has not kept up. Reports are built from spreadsheets exported by hand; nobody knows whether yesterday's numbers include yesterday. You have just been hired as ShopLink's **first data engineer**. Your job is to build the platform that brings all of ShopLink's data together, reliably, every day.

## The sources

ShopLink's data comes from four places. Each one is a different kind of ingestion problem, which is exactly why they make good practice:

| Source | What it is | Ingestion type | What makes it tricky |
|---|---|---|---|
| App database | ShopLink's PostgreSQL database (`shoplink_app`), with tables `customers`, `warehouses`, `orders` and `order_lines` | Database extraction | You must not slow the app down; rows are updated in place |
| Supplier price-list files | `products.csv`, dropped as a CSV file every day by the purchasing team from supplier price lists | File ingestion | Files can arrive late, twice, or with a changed layout |
| Orders API | An HTTP API that returns orders page by page, and only those updated since a time you give it (`updated_since`) | API and incremental ingestion | Pagination, rate limits, network failures, remembering where you got to |
| Order events stream | Order events published to a Kafka topic `shoplink.orders` as they happen | Streaming | Events arrive continuously, sometimes late, sometimes twice |

The data itself is the same across all four: customers, products, warehouses, orders and order lines. You can download it now: [shoplink.zip](/datasets/shoplink.zip) is batch 1, orders from 1 January 2024 to 30 June 2026. Later modules use [shoplink-batch-2.zip](/datasets/shoplink-batch-2.zip), a later extract with July 2026 orders and some changed records.

| Table | One row is... | Rows in batch 1 | Key columns |
|---|---|---|---|
| customers | a customer account | 400 | customer_id, customer_name, customer_type (reseller, school, business), city, state, updated_at |
| products | a product ShopLink sells | 120 | product_id, product_name, category, brand, unit_cost, list_price, is_active |
| warehouses | a warehouse | 5 | warehouse_id, warehouse_name, city, state |
| orders | an order placed by a customer | 9,091 | order_id, customer_id, warehouse_id, order_date, status, channel, updated_at |
| order_lines | one product on an order | 26,779 | order_line_id, order_id, product_id, quantity, unit_price, discount_pct |

Revenue is not stored anywhere. Net revenue for a line is `quantity * unit_price * (1 - discount_pct / 100)`, excluding cancelled and returned orders. It runs at roughly ₦9 billion a month in 2024, rising to about ₦17 billion a month in 2026.

The data is realistic, so it is not perfectly clean. The status column has inconsistent casing and stray spaces, some order lines are exact duplicates, a few orders point to customers that do not exist, and a couple of lines have a quantity of zero or less. Real sources look like this. Catching these problems before they reach a report is part of your job.

## What ShopLink needs from you

The leadership team has asked for:

1. A single place where all ShopLink data lands every day, without anyone exporting spreadsheets.
2. Daily revenue, orders and customer numbers ready by 07:00 Lagos time.
3. Raw data kept as received, so any report can be rebuilt if a bug is found.
4. A live view of today's revenue for the sales team.
5. Alerts when something fails, before the business notices.

## What you will build

Across the track you build ShopLink a complete data platform, one component per module, all in one GitHub repository called `shoplink-data-platform`:

| Module | What you add to ShopLink's platform |
|---|---|
| 1 | An architecture brief: the plan for the whole platform |
| 2 | The `shoplink-data-platform` repository, with PostgreSQL running in Docker Compose |
| 3 | A Python extractor that pulls orders from the orders API into raw JSON files and PostgreSQL |
| 4 | The app database loaded into PostgreSQL, and SQL that deduplicates and detects changes |
| 5 | A dimensional model for sales, and a data lake in RustFS with Parquet and Delta tables |
| 6 | Idempotent, incremental pipelines for all batch sources, with validation and a first dbt model |
| 7 | Airflow DAGs that run the pipelines every day, with retries, backfills and alerts |
| 8 | Spark jobs that process the lake from bronze to silver to gold |
| 9 | A Kafka order events stream with real-time revenue, and the lake on AWS managed with OpenTofu |
| 10 | The finished platform, with a BI dashboard, presented as your capstone |

Everything runs on your own laptop in Docker, except the short AWS section in Module 9, which uses the free tier. The full stack needs about 16 GB of RAM; each lesson tells you which services it needs so you can stop the rest.

## Resources

- read: [Data Engineering with Open Source Tools](https://www.coursera.org/specializations/open-source-data-engineering) · Coursera · A specialisation built on almost the same open-source stack as this track (PostgreSQL, Airflow, Spark, Kafka and S3-compatible object storage); useful to see where industry training is heading.
- docs: [What is PostgreSQL?](https://www.postgresql.org/docs/current/intro-whatis.html) · PostgreSQL documentation · The database that plays both ShopLink's app database and your first warehouse.

## Practice

For each of ShopLink's four sources, write down:

1. How often you would ingest it (and whether batch or streaming).
2. Whether you would take everything each time (full load) or only what changed (incremental), and why.
3. One thing that could go wrong, and how you would notice.

Use the table sizes above to guide your answer. You will come back to this in the module project.

## Example answer

| Source | How often | Full or incremental | What could go wrong, and how you would notice |
|---|---|---|---|
| App database | Nightly batch | Incremental for orders and order lines (they grow every day); full for customers and warehouses (small) | An order is updated after the extract read it, so the change is missed; a daily check comparing order counts in source and warehouse would catch the gap |
| Supplier file | Daily batch, when the file arrives | Full: the file is the whole price list, only 120 rows | The file arrives twice or not at all; log the file name and row count of every load and alert if no file has arrived by 05:00 |
| Orders API | Nightly batch (hourly if needed) | Incremental with `updated_since` | The API fails halfway through the pages; retry with backoff, and alert if the pipeline gives up |
| Order events stream | Continuous streaming | Every event, as it arrives | The same event is delivered twice and revenue is double counted; deduplicate on order id and check the day's streamed revenue against the nightly batch |

Good answers match the load pattern to the table size and how it changes. If you chose a full load for orders, ask what happens when ShopLink has ten million orders.

# Quiz

passing_score: 70

### What is the main output of a data engineer's work?

- [ ] Dashboards and slide decks for leadership
- [x] Reliable systems that move data from source systems to where it is used, every day
- [ ] One-off SQL queries that answer business questions
- [ ] Metric definitions agreed with finance

> Data engineers build and operate the pipelines, storage and infrastructure that get data in and keep it flowing. Dashboards are usually analyst work, and shared metric definitions are usually analytics engineering work.

### In the data engineering lifecycle, which stage is usually hardest to control, and why?

- [ ] Serving, because dashboards are slow
- [ ] Transformation, because SQL is difficult
- [x] Ingestion, because it depends on source systems the data team does not own and that can change without warning
- [ ] Storage, because disks fail

> Sources change columns, formats and behaviour, go down, rate-limit you and send duplicates. Ingestion is where your system meets systems you do not control, so it is where most pipelines break.

### What does an open table format such as Delta Lake or Iceberg add to a data lake?

- [ ] It converts CSV files into images
- [x] A transaction log that gives ACID writes, schema enforcement, upserts and time travel on top of files in object storage
- [ ] It moves the files into a data warehouse
- [ ] It removes the need for object storage

> Plain files have no transactions or schema. The table format's log defines which files make up the table at each version, which is what turns a lake into a lakehouse.

### ShopLink's finance team needs monthly revenue by state for its board pack. Which approach fits best?

- [ ] A Kafka stream with sub-second latency
- [ ] A Spark cluster running continuously
- [x] A nightly batch load, because the decision is made monthly and hours of latency are fine
- [ ] Manual spreadsheet exports

> Choose latency from how quickly the decision changes. A monthly decision does not justify always-on streaming infrastructure; a nightly batch is simpler, cheaper and reliable.

### Which of ShopLink's sources is a file ingestion problem?

- [ ] The app database
- [x] The daily supplier price-list file, products.csv
- [ ] The orders API
- [ ] The order events stream

> The supplier price list arrives as a CSV file every day. File ingestion has its own problems: files that arrive late, twice, or with a changed layout.

# Project: ShopLink data platform architecture brief

max_score: 100

## Brief

Before you write any code, ShopLink's leadership wants to see your plan. Write an architecture brief, no more than three pages, that explains how data will flow from ShopLink's four sources to the people who use it, and the key decisions you have made.

## Deliverables

1. **An architecture diagram.** Show ShopLink's four sources (app database, supplier price-list files, orders API, order events stream), how each is ingested, the storage layers (raw or bronze, cleaned or silver, marts or gold, in a warehouse, a lake or both), where processing happens, and how data is served (dashboards, tables). Name a tool for each box; the tools from the "What you will build" table are a good starting point. A neat hand drawing, a slide, or a diagram made in a free tool such as draw.io or Excalidraw is fine.
2. **Ingestion decisions.** For each of the four sources, one or two sentences: batch or streaming, how often, full or incremental, and why.
3. **Storage decision.** One paragraph: warehouse, lake, lakehouse or a combination, and why it suits ShopLink now and in three years.
4. **Three risks.** Three specific things that could make the platform's numbers wrong or late. For each, say how you would detect it and which lifecycle stage or undercurrent it belongs to.
5. **The journey of one order.** In 100 to 200 words, follow one laptop order from the moment a sales rep logs it to the moment it appears in the next morning's revenue report, naming every system it passes through.

## How to submit

Put everything in one Google Doc, Notion page or PDF. Set sharing so anyone with the link can view it, paste the link into the submission form, and add a one-line note on anything you would like feedback on. You can also share it for peer review on the platform.

## Grading guide

| Criterion | Points |
|---|---|
| Diagram covers all four sources, ingestion, storage layers, processing and serving, with sensible tools | 30 |
| Ingestion decisions are justified by each source's size, change pattern and latency needs | 20 |
| Storage decision is clear and fits ShopLink's scale | 15 |
| Risks are specific, realistic and have a way to detect them | 20 |
| Order journey is accurate and names each system | 15 |
