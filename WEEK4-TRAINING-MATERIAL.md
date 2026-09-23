# Week 4 — Lakehouse, Scale and Production

Replacement for the Week 4 section of the *Data & Analytics Engineering Bootcamp — Training Material*. This resolves the open question in that doc ("should the Week 4 cloud labs standardise on Databricks or Microsoft Fabric?").

## The decision, and why

**Neither. Week 4 runs on an open-source lakehouse that costs nothing, forever.**

Databricks Free Edition is genuinely free and needs no credit card, but its terms exclude commercial use — and training your own staff is commercial use. It is also serverless-only with no custom compute, which makes Day 2 (partitioning, shuffles, file sizing) unteachable: you cannot tune a cluster you cannot see. Its outbound network is restricted to a trusted-domain list, which also interferes with the Week 2 API-ingestion pattern.

Microsoft Fabric's trial expires after 60 days and then requires paid capacity, so it cannot underpin a course that reruns each quarter.

The open stack has no trial clock, no seat count, no commercial-use clause and no credit card. It also happens to teach the mechanics better, because nothing is hidden behind a managed abstraction.

| Concept | Week 4 tool | What it maps to in industry |
| --- | --- | --- |
| Object storage / data lake | MinIO | S3, ADLS — identical `s3a://` paths and credentials model |
| Table format: ACID, MERGE, time travel | Delta Lake OSS | Delta on Databricks or Fabric |
| Distributed processing | Apache Spark standalone, 1 master + 2 workers | Any managed Spark |
| Streaming transport | Apache Kafka, KRaft mode | Event Hubs, Confluent, Redpanda |
| Catalog, grants, lineage | Unity Catalog OSS, OpenLineage + Marquez | Unity Catalog, Purview |
| CI/CD | GitHub Actions | free and unlimited on public repos |
| Infrastructure as code | OpenTofu, Docker + MinIO providers | Terraform against a cloud provider |

**Say this to the cohort on Day 1.** They will ask why they are not learning Databricks. The honest answer: the portability is the point. Every concept transfers, and Day 5's test asks them to explain exactly what changes when this platform moves to S3 or ADLS (answer: the endpoint and the credentials). Keep DP-700 or the Databricks Associate as a post-course goal — exam fees are not a course cost.

---

## Before the week starts

Facilitator checklist, ideally done the Friday before:

1. Each learner clones the course repo and runs `docker compose up -d --build` in `week4-stack/`. See `week4-stack/README.md` for ports and known snags.
2. Confirm both Spark workers appear at http://localhost:8080. If only one shows, the machine is short on memory.
3. Confirm `bronze`, `silver` and `gold` exist in the MinIO console at http://localhost:9001.
4. Download the NYC Taxi parquet files for Day 2 *in advance* — roughly 3–4 GB. Doing this live burns an hour of class time.
5. Anyone with under 16 GB RAM: set them up in GitHub Codespaces instead (120 core-hours free per month), and have them verify it before Monday.

The first Spark job of the week pulls the Delta and hadoop-aws jars from Maven. That needs internet once and then caches. If your venue's connection is unreliable, warm the cache on every machine during setup.

---

## Day 1 — The lakehouse on object storage

### Concepts (2 h)

A data lake is cheap files in object storage. That alone gives you no transactions: two writers racing produce a half-written directory, and a reader mid-write sees garbage. A **table format** — Delta Lake or Apache Iceberg — adds a transaction log beside the data files. The log, not the file listing, defines what the table contains. That buys three things the course cares about:

- **ACID.** A write either commits to the log or it did not happen.
- **Schema enforcement.** A load with a changed column type is rejected rather than silently corrupting the table.
- **Time travel.** Every commit is a version, so you can read or restore the table as it was before a bad load.

Separating storage from compute is the other half. The data sits in the bucket permanently; Spark exists only while a job runs. That is why cloud lakehouses bill compute by the second, and it is why a badly written job is expensive rather than merely slow.

### Worked sample — point Spark at MinIO, then upsert

```python
from pyspark.sql import SparkSession
from delta.tables import DeltaTable

spark = (SparkSession.builder
    .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
    .config("spark.hadoop.fs.s3a.endpoint", "http://minio:9000")   # S3 or ADLS in production
    .config("spark.hadoop.fs.s3a.path.style.access", "true")
    .getOrCreate())

silver = "s3a://silver/orders"
raw    = spark.read.json("s3a://bronze/orders/run=*/")
clean  = raw.dropDuplicates(["order_id", "updated_at"])

(DeltaTable.forPath(spark, silver).alias("t")
    .merge(clean.alias("s"), "t.order_id = s.order_id")
    .whenMatchedUpdateAll(condition="s.updated_at > t.updated_at")
    .whenNotMatchedInsertAll()
    .execute())

# time travel: the table as it was three versions ago
spark.read.format("delta").option("versionAsOf", 3).load(silver).count()
```

Most of that config lives in `week4-stack/conf/spark-defaults.conf` already. Show it in the notebook once anyway, so learners know where the settings come from and which three lines change in the cloud.

The `condition` on `whenMatchedUpdateAll` is the part to dwell on. Without it, a late-arriving stale record overwrites a newer one. This is the same idempotency argument from Week 2, now at the table-format level.

### Class activity — Architecture Pitch (30 min)

Groups draw a budget card and a requirement card, choose PostgreSQL-only, a warehouse or a lakehouse, sketch it, and pitch in three minutes. The class votes on the most cost-effective design that still meets the requirement.

Budget cards: ₦0/month · ₦200k/month · ₦2m/month. Requirement cards: *400 GB, 30 analysts, daily refresh* · *8 TB, 5 data scientists, hourly* · *40 GB, 3 analysts, weekly* · *200 GB but the CEO wants live dashboards*.

The lesson is that the ₦0 and 40 GB pairing should produce "PostgreSQL, and stop". Reward the group that refuses to build a lakehouse.

### Lab (4 h)

Bring the stack up. Land your Week 3 silver output as Delta tables in MinIO. Open the `_delta_log` directory in the MinIO console and read one JSON commit. Then deliberately break a load — write a batch with a corrupted currency column — and restore the table from the previous version.

### Exercises

1. Write a MERGE that deletes rows the source marks `is_deleted = true` while upserting the rest.
2. `DESCRIBE HISTORY` the silver orders table. Which commit added the most rows, and how do you know?
3. A colleague says "Delta is just Parquet". Give two things that stop being true if you delete the `_delta_log`.
4. You restore a table to version 5. What happens to versions 6 and 7?

---

## Day 2 — Distributed processing with Spark

### Concepts (2 h)

Spark splits data into partitions and processes them in parallel. **Narrow** operations (`filter`, `withColumn`) act within a partition. **Wide** operations (`groupBy`, `join`, `distinct`) need rows with the same key on the same executor, so Spark writes every partition to disk, moves it across the network, and reads it back. That is a **shuffle**, and it is nearly always the cost.

Three levers, in the order to try them:

1. **Broadcast the small side of a join.** Under roughly 10 MB, ship a copy to every executor and the shuffle disappears entirely.
2. **Fix file sizes.** Thousands of 2 MB files means thousands of tasks with more scheduling overhead than work. Aim for 128 MB to 1 GB.
3. **Then, and only then, add executors.** Throwing compute at a shuffle problem makes the bill grow faster than the speed.

Because the stack runs a real master with two worker containers, all of this is observable rather than theoretical. The shuffle read/write bytes on the stage detail page are the number to watch.

Counterweight worth stating plainly: for anything that fits on one machine, DuckDB or Polars beats Spark on both speed and cost. Spark earns its overhead somewhere north of a few hundred GB. Most "big data" is not.

### Worked sample — broadcast join and file sizing

```python
from pyspark.sql import functions as F

lines    = spark.read.format("delta").load("s3a://silver/order_lines")  # 500M rows
products = spark.read.format("delta").load("s3a://silver/products")     # 4k rows

fast    = lines.join(F.broadcast(products), "product_id")
revenue = (fast.groupBy("category")
               .agg(F.sum(F.col("quantity") * F.col("unit_price")).alias("revenue")))

revenue.explain(mode="formatted")   # expect BroadcastHashJoin, not SortMergeJoin
revenue.repartition(8).write.format("delta").mode("overwrite").save("s3a://gold/revenue")
```

Run it once without `F.broadcast` and once with, and put the two Spark UI stage pages side by side. The `SortMergeJoin` → `BroadcastHashJoin` change in the plan, and the shuffle bytes dropping to near zero, is the single most convincing demo of the week.

### Class activity — Shuffle Relay (20 min)

Learners act as executors holding order cards from mixed states. Counting their own cards is a narrow operation. Totalling by state means physically walking cards to other "executors" — a shuffle, and the noise and time it takes is the point. Repeat with a photocopied lookup sheet on every desk: a broadcast join.

### Lab (4 h)

Process the NYC Taxi dataset in PySpark. Baseline the runtime, then cut it by fixing the join and the file sizes. Capture the Spark UI before and after and write three sentences explaining what changed in the physical plan and why.

### Exercises

1. A `groupBy` produces 200 output files of 400 KB each. What went wrong, and what is the one-line fix?
2. `explain()` shows `SortMergeJoin` on a 4,000-row dimension. Give two reasons the broadcast hint might have been ignored.
3. One task in a stage takes 40× longer than its peers. Name the condition and one way to address it.
4. When is DuckDB the correct answer instead of all of the above?

---

## Day 3 — Streaming and real time

### Concepts (2 h)

Batch processes bounded data on a schedule; streaming processes unbounded events as they arrive. Kafka stores events in ordered, **replayable** partitions — replayability is what separates it from a queue, and it is why a broken consumer can be fixed and re-run from an offset rather than losing data.

The two ideas that cause all the confusion:

- **Event time vs processing time.** Event time is when the order was placed; processing time is when your job saw it. Windowed aggregates must use event time or the numbers move depending on how busy your cluster was.
- **Watermarks.** A watermark says how late an event may arrive and still be counted. Set it too tight and you drop real revenue; too loose and Spark holds state forever. It is a business decision wearing an engineering costume.

**Checkpoints** record which offsets were processed and committed. They are what makes a restarted stream resume without double-counting.

Ask the cohort what latency the business actually needs. The answer is almost always "the dashboard should be right by the morning meeting", which is a 15-minute micro-batch, not a stream.

### Worked sample — Kafka to a windowed gold table

```python
events = (spark.readStream.format("kafka")
    .option("kafka.bootstrap.servers", "kafka:9092")
    .option("subscribe", "shoplink.orders")
    .option("startingOffsets", "earliest")
    .load()
    .select(F.from_json(F.col("value").cast("string"), order_schema).alias("o"))
    .select("o.*"))

per_5_min = (events
    .withWatermark("event_time", "10 minutes")
    .groupBy(F.window("event_time", "5 minutes"))
    .agg(F.sum("amount").alias("revenue"), F.count("*").alias("orders")))

(per_5_min.writeStream.format("delta")
    .outputMode("append")
    .option("checkpointLocation", "s3a://gold/_checkpoints/orders_5min")
    .trigger(processingTime="1 minute")
    .start("s3a://gold/revenue_5min"))
```

### Class activity — Late Delivery (20 min)

The instructor reads out order events with event times, several out of order and one 20 minutes late. Learners fill a five-minute window table on paper using a 10-minute watermark and decide which events count. Then re-run with a 30-minute watermark and ask what it cost: state held six times longer, for one recovered order.

### Lab (4 h)

Write a producer that publishes simulated ShopLink orders to a Kafka topic. Stream them into a gold Delta table of five-minute revenue. Then kill the stream mid-run, restart it, and prove from the table that nothing was double-counted.

### Exercises

1. A stream is restarted with the checkpoint directory deleted. What happens, and why is it worse than it first looks?
2. Your watermark is 10 minutes. An event arrives 12 minutes late. Where does it go?
3. Give one case where `outputMode("append")` is wrong and `update` is right.
4. The business asks for "real time". What three questions do you ask before agreeing?

---

## Day 4 — CI/CD and infrastructure as code

### Concepts (2 h)

Every change goes through a pull request, automated tests and a review before reaching production. Dev, test and prod environments keep experiments away from executives.

**Slim CI** is the practice that makes this survivable: build only the dbt models that changed and their downstream dependents (`state:modified+ --defer`), rather than the whole project on every PR. A 4-minute CI run gets used; a 40-minute one gets bypassed.

**Infrastructure as code** means the platform can be destroyed and rebuilt from the repository. The exercise that proves it is `tofu destroy` followed by `tofu apply` — if that does not reproduce the environment, the repo is not the source of truth and someone's laptop is.

GitHub Actions is free and unlimited on public repositories, and 2,000 Linux minutes a month on the private free tier, so none of this costs anything.

### Worked sample — the CI workflow and the OpenTofu

```yaml
# .github/workflows/dbt_ci.yml
name: dbt CI
on:
  pull_request:
    paths: ["shoplink_dbt/**"]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: {python-version: "3.11"}
      - run: pip install dbt-postgres==1.8.*
      - name: Build changed models and their children
        working-directory: shoplink_dbt
        run: dbt build --select state:modified+ --defer --state ../prod-state --target ci
```

```hcl
# infra/main.tf     tofu init && tofu apply
provider "minio" {
  minio_server   = var.minio_server
  minio_user     = var.minio_user
  minio_password = var.minio_password
}

resource "minio_s3_bucket" "layer" {
  for_each = toset(["bronze", "silver", "gold"])
  bucket   = each.key
}
```

Full files are in `week4-stack/infra/`. Note the credentials come from `TF_VAR_` environment variables and are marked `sensitive` — that is the teaching point, not a detail.

### Class activity — PR Review Party (30 min)

Each learner opens a pull request containing one intentional flaw: a missing test, a hard-coded password, a changed column type, a model with no grain documented. Reviewers rotate, find the flaw and leave a constructive comment. Grade the *comment*, not the find: "this will break the finance dashboard because X" beats "wrong".

### Lab (4 h)

Add a CI workflow running slim dbt builds and SQL linting on every pull request. Then destroy your three buckets and recreate them with `tofu apply`. Confirm the pipeline still runs afterwards.

### Exercises

1. Why does slim CI need `--defer` and a `--state` directory? What breaks without them?
2. A secret is committed and then removed in the next commit. What must still happen?
3. Your `tofu apply` succeeds but a colleague's fails. Name two likely causes.
4. Why is reviewing infrastructure changes more important than reviewing dbt models, not less?

---

## Day 5 — Governance, security and operations

### Concepts (2 h)

Governance answers three questions: who can see what, where did this come from, and can I trust it.

- **Access.** Least privilege. Analysts read marts; raw schemas holding PII stay restricted. Unity Catalog OSS registers the Delta tables and holds the grants.
- **Lineage.** OpenLineage emits events from Airflow and Spark into Marquez, producing a graph of which job wrote which table. Its real value is answering "what breaks if I change this column?" *before* changing it.
- **Privacy.** Mask phone numbers and hash emails in anything shared widely. Nigeria's Data Protection Act 2023 requires a lawful basis and appropriate safeguards for personal data — this is a legal obligation, not a nice-to-have.
- **Operations.** A runbook lists alerts, likely causes, first actions, backfill steps and rollback. Written before the incident, not during.

### Worked sample — role-based access and PII masking

```sql
CREATE ROLE analyst NOLOGIN;
GRANT USAGE ON SCHEMA mart TO analyst;
GRANT SELECT ON ALL TABLES IN SCHEMA mart TO analyst;
REVOKE ALL ON SCHEMA app, silver FROM analyst;

CREATE VIEW mart.dim_customer_masked AS
SELECT customer_sk, customer_id, customer_name, city, state,
       regexp_replace(phone, '\d(?=\d{4})', '*', 'g') AS phone_masked,
       md5(lower(email)) AS email_hash
FROM mart.dim_customer;
```

Ask why `md5` of an email is still arguably personal data. The answer — it is a stable identifier that joins across systems, so it re-identifies — is the most useful five minutes of the day.

### Class activity — Incident Drill (40 min)

"The CEO's dashboard shows revenue down 60% overnight." Teams have 25 minutes to find the cause (one warehouse started sending kobo instead of naira), post status updates every five minutes, fix the data and write a five-line postmortem.

Grade the status updates as heavily as the fix. Silence during an incident is the failure mode that ends careers.

### Lab (4 h)

Bring up the governance profile. Register the gold tables in Unity Catalog, confirm the end-to-end lineage graph renders in Marquez, then write a runbook and an access policy for your platform.

### Exercises

1. A marketing contractor needs customer city and spend but not names. Write the grant.
2. Lineage shows `dim_customer` feeding nine models. You must change a column type. What is your sequence?
3. Your runbook says "restart the pipeline". Why is that a bad first action?
4. Name two things that belong in a postmortem and one that does not.

---

## Capstone

**Brief.** Build a production-style platform that ingests from at least two sources (the app database and the orders API; optionally an ERP export such as D365 F&O sales and inventory tables) and delivers a governed executive dashboard. The whole platform must come up from a single `docker compose up` on a clean machine. Present to a panel in 20 minutes plus Q&A.

**Deliverables**

1. Incremental, idempotent ingestion into bronze and silver Delta tables in MinIO
2. dbt gold layer with two facts (sales, inventory movements), an SCD2 dimension and 40+ passing tests
3. Orchestration with retries, alerting and a demonstrated backfill
4. A CI pipeline running slim dbt builds and SQL linting on every PR, with the storage layers created by OpenTofu
5. A Power BI report with RLS and a masked-PII customer view
6. End-to-end lineage visible in Marquez, plus an architecture diagram, data dictionary and runbook
7. A cost model: what this platform would cost on S3 or ADLS with managed Spark at 100× volume
8. Prepared answers on schema changes, 100× volume, single points of failure and cost cuts

Deliverable 7 is the one that replaces hands-on cloud billing. Require real figures from current public price lists, not estimates. A candidate who can say "this is ₦X/month today and ₦Y at 100×, and here is the line item I would attack first" has the cost instinct the cloud labs were meant to build.

**Panel questions to press on**

- Why that grain? What would you regret at 100× volume?
- A source adds a column on Monday. Walk me through Tuesday.
- Which single container's failure takes the platform down, and what would you do about it?
- You have to cut the bill by half. What goes first, and what does it cost the business?

## Grading rubric

| Area | Weight | "Pass" looks like |
| --- | --- | --- |
| Lakehouse and modelling | 25% | Correct grain, clean star schema, MERGE that handles stale updates |
| Pipeline engineering | 25% | Idempotent, incremental, observable, recoverable, rebuilt from the repo |
| Analytics engineering | 20% | Tested, documented, consistent metrics, lineage visible |
| Production readiness | 15% | CI green on every PR, IaC reproducible, secrets out of the repo, PII masked |
| Communication | 15% | Defends design decisions to technical and business audiences |

---

## Answer key

**Day 1** — (1) Add `.whenMatchedDelete(condition="s.is_deleted = true")` before the update clause; order matters. (2) The `operationMetrics.numOutputRows` column in `DESCRIBE HISTORY`. (3) Atomicity and time travel both disappear — the files remain readable as plain Parquet, but concurrent writes and version history are gone. (4) They stay in history; the restore is itself a new commit (version 8) that points at version 5's files.

**Day 2** — (1) `spark.sql.shuffle.partitions` is too high for the data volume; `.repartition()` or `.coalesce()` before writing, or lower the setting. (2) The table statistics are stale so Spark thinks it is large, or `spark.sql.autoBroadcastJoinThreshold` is set to −1. (3) Data skew; salt the key, or enable adaptive query execution's skew join handling. (4) When the data fits comfortably on one machine — below roughly 100 GB, and certainly for the ShopLink dataset.

**Day 3** — (1) The stream reprocesses from `startingOffsets` and duplicates everything already in the sink; worse, `append` mode means the duplicates are invisible until someone reconciles the totals. (2) It is dropped from the windowed aggregate silently — which is why late-arrival rates belong on a monitoring dashboard. (3) When the aggregate must be corrected as late data arrives and the sink supports updates. (4) What decision changes in the next five minutes? What does an hour of staleness cost? Who is awake at 3 a.m. when it breaks?

**Day 4** — (1) `--defer` resolves unchanged `ref()`s against the production manifest instead of rebuilding them; without it the "slim" build has no upstream tables and fails. (2) Treat the secret as compromised: rotate it. Git history retains it. (3) Different provider versions with no lock file committed, or state drift because someone changed a bucket by hand. (4) Because a bad infrastructure change takes down every model at once, whereas a bad model takes down one.

**Day 5** — (1) `GRANT SELECT ON mart.dim_customer_masked TO contractor;` and nothing on `mart.dim_customer` or any raw schema. (2) Notify the nine owners, add the new column alongside the old, migrate consumers, then drop — an expand/contract migration. (3) It destroys the evidence and often re-triggers the same failure; capture state and identify the cause first. (4) Belongs: timeline, and the systemic gap that let it happen. Does not belong: the name of the person who merged it.

---

## Trainer notes

- The Day 2 broadcast-join demo is the highest-value 10 minutes of the week. Rehearse it.
- Expect pushback on Day 1 about not learning a named vendor platform. Answer it directly and early; do not let it simmer until the capstone.
- Day 3 will overrun. The producer script is the usual culprit — have a working one ready to hand out if a group is still fighting it after 90 minutes.
- If the venue's internet is weak, Days 1 and 2 still work fully offline once the Maven jars are cached. Day 4 needs GitHub.
