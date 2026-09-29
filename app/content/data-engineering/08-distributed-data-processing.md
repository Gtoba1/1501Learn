---
module: 8
title: Distributed Data Processing
optional: false
summary: Add a small Apache Spark 3.5 cluster and a JupyterLab driver to your Compose stack, connected to RustFS and Delta Lake. You learn how Spark splits work into jobs, stages and tasks, write PySpark that turns bronze files into silver and gold Delta tables, and use a larger synthetic copy of ShopLink to see partitions, shuffles, broadcast joins, skew, small files and caching in the Spark UI. You also submit jobs with spark-submit and run them from Airflow, and you learn to say honestly when Spark is not needed.
---

# Lesson: Spark architecture

minutes: 60

## Why distributed processing exists

Everything you have built so far runs on one machine. PostgreSQL, pandas and DuckDB are all excellent up to the point where the data, or the work on it, no longer fits one machine's memory, disk or time budget. **Apache Spark** is the most widely used engine for going past that point: it splits a dataset into pieces called **partitions** and processes them in parallel on many machines, then combines the results.

Before learning it, be honest about ShopLink. All of batch 1 is about 1.5 MB of CSV. PostgreSQL or DuckDB answers any ShopLink question in well under a second. Spark would be slower, because starting a Spark job and coordinating its workers costs a few seconds before any data is read.

| Situation | Better choice |
|---|---|
| ShopLink today (MBs), and anything up to tens of GB on one machine | PostgreSQL, DuckDB or your warehouse. Simpler, cheaper, faster |
| Hundreds of GB to many TB of files in object storage | Spark on a lakehouse |
| Heavy Python transformation or machine learning over large data | Spark |
| Mostly SQL over modelled tables for analysts and BI | A warehouse, or a SQL engine over the lakehouse |
| Streaming events | Spark Structured Streaming or another stream processor (Module 9) |

You learn Spark on ShopLink because the data is familiar, so you can watch the tool rather than the data. In lesson 4 you generate a larger synthetic copy, because some effects only appear when the data is big enough. In a real interview, saying "this does not need Spark" with reasons is a strong answer.

## The pieces of a Spark application

| Piece | Job | In your stack |
|---|---|---|
| Driver | Runs your program, builds the plan, splits it into tasks and schedules them | The `jupyter` container (or wherever you run `spark-submit`) |
| Cluster manager | Hands out machines and cores to applications | The `spark-master` container, in Spark's own "standalone" mode. In industry: YARN, Kubernetes, or a managed service |
| Worker | A machine that offers cores and memory | The `spark-worker` container |
| Executor | A process on a worker that runs tasks and holds cached data | Started on the worker for each application |

Your code runs on the driver, but the data is processed on the executors. That has a practical consequence you will meet in lesson 2: the executors must be able to reach the data themselves. A file on the driver's disk is invisible to them; a file in RustFS (`s3a://...`) is visible to all.

## Jobs, stages and tasks

Spark is **lazy**. Transformations such as `filter`, `select`, `join` and `groupBy` do not run anything; they add steps to a plan. Only an **action**, such as `count()`, `show()`, `collect()` or `write`, makes Spark run the plan. Laziness lets Spark optimise the whole plan before running it: for example, pushing a filter down so fewer rows are ever read.

When an action runs:

1. The action becomes a **job**.
2. The job is cut into **stages** at every **shuffle**: a point where rows must move between executors so that all rows with the same key end up together (for a `groupBy`, a `join`, a `distinct`).
3. Each stage runs as **tasks**, one per partition. A stage over 8 partitions is 8 tasks, spread over the executors' cores.

Operations that work within one partition (`filter`, `withColumn`, `select`) are **narrow** and cheap. Operations that need a shuffle are **wide**, and the shuffle, which writes data to disk and sends it over the network, is nearly always the expensive part of a job.

## Adding Spark to your compose.yaml

You add three services: a master, one worker and a JupyterLab container that acts as your driver. All three use Spark **3.5.3**, and that match matters: a driver and executors on different Spark versions fail with confusing serialisation errors.

**Step 1: Spark settings.** Create `spark/conf/spark-defaults.conf`. It is mounted into every Spark container so no notebook or job has to repeat it:

```text
# Delta Lake and the S3 connector, downloaded from Maven on first use.
# hadoop-aws must match Spark 3.5.3's bundled Hadoop (3.3.4); aws-java-sdk-bundle 1.12.262
# is the SDK version that Hadoop release was built against.
spark.jars.packages                         io.delta:delta-spark_2.12:3.2.1,org.apache.hadoop:hadoop-aws:3.3.4,com.amazonaws:aws-java-sdk-bundle:1.12.262
# The apache/spark image's spark user has no writable home folder, so keep the jar cache in /tmp
spark.jars.ivy                              /tmp/.ivy2

spark.sql.extensions                        io.delta.sql.DeltaSparkSessionExtension
spark.sql.catalog.spark_catalog             org.apache.spark.sql.delta.catalog.DeltaCatalog

# RustFS, through its S3 API. Keys come from the AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables,
# never from this file.
spark.hadoop.fs.s3a.endpoint                http://rustfs:9000
spark.hadoop.fs.s3a.path.style.access       true
spark.hadoop.fs.s3a.connection.ssl.enabled  false
spark.hadoop.fs.s3a.aws.credentials.provider com.amazonaws.auth.EnvironmentVariableCredentialsProvider

spark.sql.session.timeZone                  UTC
# A small cluster: 8 shuffle partitions is a sensible start (the default is 200)
spark.sql.shuffle.partitions                8
spark.executor.cores                        2
spark.executor.memory                       1g
spark.cores.max                             4
```

**Step 2: the driver image.** Save as `spark/Dockerfile`:

```dockerfile
# Same Spark version as the cluster. If you change one, change both.
FROM apache/spark:3.5.3-python3

USER root
# The image's Python is 3.8, so keep pip below 25.1, the first release without 3.8 support.
# pyspark is pinned to the cluster's version; otherwise delta-spark could pull a different 3.5.x.
RUN python3 -m pip install --no-cache-dir --upgrade "pip<25.1" \
 && python3 -m pip install --no-cache-dir \
      pyspark==3.5.3 \
      delta-spark==3.2.1 \
      jupyterlab==4.2.7
RUN mkdir -p /home/spark/work && chown -R spark:spark /home/spark

USER spark
ENV HOME=/home/spark
WORKDIR /home/spark/work
EXPOSE 8888 4040

CMD ["jupyter", "lab", "--ip=0.0.0.0", "--port=8888", "--no-browser", \
     "--ServerApp.token=", "--ServerApp.password=", "--ServerApp.root_dir=/home/spark/work"]
```

**Step 3: the services.** Add to `compose.yaml`:

```yaml
  spark-master:
    image: apache/spark:3.5.3-python3
    command: ["/opt/spark/bin/spark-class", "org.apache.spark.deploy.master.Master"]
    ports:
      - "8081:8080"   # master UI on 8081, because Airflow has 8080
      - "7077:7077"
    volumes:
      - ./spark/conf/spark-defaults.conf:/opt/spark/conf/spark-defaults.conf:ro

  spark-worker:
    image: apache/spark:3.5.3-python3
    command: ["/opt/spark/bin/spark-class", "org.apache.spark.deploy.worker.Worker", "spark://spark-master:7077"]
    environment:
      SPARK_WORKER_CORES: "4"
      SPARK_WORKER_MEMORY: "3g"
      AWS_ACCESS_KEY_ID: ${S3_ACCESS_KEY:-shoplink}
      AWS_SECRET_ACCESS_KEY: ${S3_SECRET_KEY:-shoplink123}
    depends_on: [spark-master]
    volumes:
      - ./spark/conf/spark-defaults.conf:/opt/spark/conf/spark-defaults.conf:ro

  jupyter:
    build: ./spark
    image: shoplink-spark:3.5.3
    environment:
      SPARK_MASTER_URL: spark://spark-master:7077
      AWS_ACCESS_KEY_ID: ${S3_ACCESS_KEY:-shoplink}
      AWS_SECRET_ACCESS_KEY: ${S3_SECRET_KEY:-shoplink123}
    ports:
      - "127.0.0.1:8888:8888"   # JupyterLab, with no password, so only on your own machine
      - "127.0.0.1:4040:4040"   # the Spark application UI while a session runs
    depends_on: [spark-master, rustfs]
    volumes:
      - ./spark:/home/spark/work
      - ./spark/conf/spark-defaults.conf:/opt/spark/conf/spark-defaults.conf:ro
```

With `SPARK_WORKER_CORES: "4"` and `spark.executor.cores 2`, each application gets two executors of two cores each on the one worker, so shuffles really do move data between processes. The worker and executors get the RustFS keys from `.env` through environment variables; executors inherit them from the worker.

The container runs as the image's `spark` user, which cannot write to a folder your own user created. Give it a notebooks folder it can write to (acceptable on a laptop, never on a shared server):

```bash
mkdir -p spark/notebooks spark/jobs
chmod 777 spark/notebooks
```

**Step 4: start it.** Spark needs about 4 GB. Stop Airflow while you work through this module's notebooks, and bring it back for the Airflow section in lesson 3:

```bash
docker compose stop airflow-apiserver airflow-scheduler airflow-dag-processor airflow-triggerer
docker compose up -d rustfs spark-master spark-worker jupyter
```

Open http://localhost:8081 and check that one worker is listed as ALIVE with 4 cores. Open http://localhost:8888 for JupyterLab.

## The Spark UI

Every running application serves its own UI, on port 4040 of the driver. It is the most useful debugging tool in Spark:

| Tab | What it shows |
|---|---|
| Jobs | One row per action, with its stages and duration |
| Stages | Per stage: number of tasks, input read, **shuffle read and shuffle write**, and the task time distribution (min, median, max). A max far above the median is skew |
| Storage | Cached DataFrames and how much memory they use |
| Environment | Every setting in effect, so you can check spark-defaults.conf really loaded |
| Executors | Each executor's cores, memory, tasks, and time spent in garbage collection |
| SQL / DataFrame | The query plan as a graph, with row counts on each step. The best place to see what Spark actually did |

The master UI on 8081 is different: it shows the cluster (workers and applications), not what one application is doing.

## Resources

- docs: [Cluster mode overview](https://spark.apache.org/docs/3.5.8/cluster-overview.html) · Apache Spark · Driver, executors and cluster managers, with the official diagram.
- docs: [Web UI](https://spark.apache.org/docs/3.5.8/web-ui.html) · Apache Spark · A tour of every tab in the Spark UI, with screenshots.
- docs: [Spark standalone mode](https://spark.apache.org/docs/3.5.8/spark-standalone.html) · Apache Spark · The master and worker settings used in this lesson.
- docs: [Hadoop-AWS: S3A](https://hadoop.apache.org/docs/r3.3.4/hadoop-aws/tools/hadoop-aws/index.html) · Apache Hadoop · The S3A connector, credential providers and endpoint settings, for the exact Hadoop version Spark 3.5.3 uses.
- watch: [PySpark Tutorial for Beginners](https://www.youtube.com/watch?v=EB8lfdxpirM) · coder2j · 18.7K subscribers · 191.3K views · 4.1K likes · published 2023-10-08 · checked 2026-09-28 · 48 min
- deeper: [Designing Data-Intensive Applications, 2nd edition](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781098119058/) · Martin Kleppmann and Chris Riccomini, O'Reilly (paid) · The chapters on batch processing explain why distributed engines are built the way they are.

## Practice

1. Bring up the Spark services and screenshot the master UI with the worker ALIVE.
2. In a new notebook in `notebooks/`, start a session and run a tiny job:

```python
import os
from pyspark.sql import SparkSession

spark = (SparkSession.builder
         .master(os.environ["SPARK_MASTER_URL"])
         .appName("shoplink-hello")
         .getOrCreate())

df = spark.range(1_000_000).withColumnRenamed("id", "n")
print(df.filter("n % 7 = 0").count())
print(df.groupBy((df.n % 10).alias("last_digit")).count().count())
```

3. Open http://localhost:4040. For each of the two `count()` calls, write down how many jobs, stages and tasks it created. Which one had a shuffle, and how can you tell?
4. Check the Environment tab for `spark.jars.packages` and `spark.sql.shuffle.partitions`.
5. Decide, with one reason each, whether Spark is the right tool for: (a) ShopLink's monthly revenue report; (b) a telecoms company reprocessing 3 TB of call records each night; (c) a model that scores 50,000 customers once a week.

## Example answer

For step 2 the first cell prints `142858` (the multiples of 7 below one million, including 0). The second prints `10`.

For step 3: the filtered `count()` is one job with one stage (the final count adds a tiny second stage in some plans, because each partition counts its rows and the counts are then combined). Its tasks equal the number of input partitions, usually one per core Spark was given, so 4 here. The `groupBy` count has an extra stage: the first stage writes shuffle data, the second reads it. You can tell from the Stages tab: one stage shows **Shuffle Write** and the next **Shuffle Read**, and the SQL tab shows an `Exchange` node, Spark's name for a shuffle. The second stage runs 8 tasks, or fewer if adaptive query execution (lesson 4) merged small partitions.

For step 4, `spark.sql.shuffle.partitions` shows `8` and `spark.jars.packages` lists the three packages. If either is missing, the config file was not mounted: check `docker compose exec jupyter cat /opt/spark/conf/spark-defaults.conf`.

For step 5: (a) no, a few MB of SQL belongs in PostgreSQL or dbt; (b) yes, 3 TB per night is beyond one machine in a reasonable time and splits naturally by partition; (c) usually no, 50,000 rows fit easily in pandas on one machine, unless the features come from a huge table that is already in the lakehouse, in which case Spark can build the features and pandas can score them. Answers that weigh data size, frequency and existing infrastructure are all acceptable.

# Lesson: PySpark DataFrames

minutes: 55

## The SparkSession and DataFrames

A **DataFrame** in Spark looks like a pandas DataFrame or a SQL table: named, typed columns. Unlike pandas, it is not in memory on your machine. It is a plan for producing rows, split into partitions across the executors. You get one from the **SparkSession**, the entry point to everything:

```python
import os

from pyspark.sql import SparkSession
from pyspark.sql import functions as F

spark = (SparkSession.builder
         .master(os.environ["SPARK_MASTER_URL"])
         .appName("shoplink-dataframes")
         .getOrCreate())
```

The Delta and RustFS settings come from `spark-defaults.conf`. The first session downloads the three packages from Maven, which takes a minute once.

## Reading bronze from RustFS

In Module 6 your pipeline landed ShopLink's sources in the `bronze` bucket, under keys like `bronze/app_db/orders/load_date=2026-06-30/part-0000.parquet` and `bronze/supplier/products/load_date=2026-06-30/products.csv`. Spark reads a whole folder at once:

```python
orders_bronze = spark.read.parquet("s3a://bronze/app_db/orders/load_date=2026-06-30/")
orders_bronze.printSchema()
print(orders_bronze.count())
```

If your Module 6 layout is different (other folder names, CSV instead of Parquet), change the paths here and in the jobs in lesson 3; nothing else depends on them. Parquet files carry their own schema, so Spark reads column names and types from them.

**CSV has no schema.** Spark can guess one with `inferSchema`, but that reads the file an extra time and guesses wrong surprisingly often (a column of product codes like `007` becomes a number). For anything that runs in production, declare the schema:

```python
from pyspark.sql.types import (BooleanType, LongType, StringType,
                               StructField, StructType)

product_schema = StructType([
    StructField("product_id", LongType(), nullable=False),
    StructField("product_name", StringType()),
    StructField("category", StringType()),
    StructField("brand", StringType()),
    StructField("unit_cost", LongType()),
    StructField("list_price", LongType()),
    StructField("is_active", BooleanType()),
])

products = (spark.read
            .option("header", True)
            .schema(product_schema)
            .csv("s3a://bronze/supplier/products/load_date=2026-06-30/"))
```

A schema can also be written as a DDL string, which is shorter: `"product_id BIGINT, product_name STRING, category STRING, ..."`. By default a value that does not match the declared type becomes NULL; add `.option("mode", "FAILFAST")` to make a bad file fail the read instead.

## Transformations and actions

Transformations return a new DataFrame and run nothing:

```python
clean_orders = (orders_bronze
    .select(
        F.col("order_id").cast("bigint"),
        F.col("customer_id").cast("bigint"),
        F.col("warehouse_id").cast("bigint"),
        F.col("order_date").cast("date"),
        F.lower(F.trim("status")).alias("status"),
        "channel",
        F.col("updated_at").cast("timestamp"),
    )
    .filter(F.col("order_id").isNotNull()))
```

Casting every column, even if Parquet already has the right type, makes the job robust to a source that changes its types: the output schema is the one you wrote, not whatever arrived.

Actions run the plan:

| Action | Returns | Care needed |
|---|---|---|
| `count()` | A number | Reads everything; fine |
| `show(n)` | Prints n rows | Fine for looking |
| `take(n)`, `first()` | A few rows to the driver | Fine |
| `collect()`, `toPandas()` | **Every row** to the driver | Only on small results. On big data this crashes the driver |
| `write...save()` | Writes files | The normal end of a job |

`explain()` shows the plan without running it:

```python
clean_orders.groupBy("status").count().explain(mode="formatted")
```

Read it from the bottom up: a `Scan parquet` (with any `PushedFilters`), a `HashAggregate` that counts within each partition, an `Exchange hashpartitioning(status, 8)` (the shuffle), then a final `HashAggregate`. Every `Exchange` is a stage boundary.

## Spark SQL

Everything the DataFrame API does, SQL can do, on the same engine with the same plans. Register a DataFrame as a temporary view:

```python
clean_orders.createOrReplaceTempView("orders")
spark.sql("""
    select status, count(*) as orders
    from orders
    group by status
    order by orders desc
""").show()
```

Use whichever reads better for the job. Many teams write joins and aggregations in SQL and the plumbing (reading, configuration, writing) in Python.

## Writing a Delta table

Writing is an action. Delta Lake adds a transaction log (`_delta_log/`) next to the Parquet files, which gives you atomic writes, schema enforcement, MERGE and time travel (Module 5 introduced them):

```python
(clean_orders.write
    .format("delta")
    .mode("overwrite")
    .save("s3a://silver/orders_basic"))

spark.read.format("delta").load("s3a://silver/orders_basic").count()
```

Browse to `silver/orders_basic/_delta_log/` in the RustFS console (http://localhost:9001): the JSON file there is the first commit, listing the Parquet files that make up version 0. Apache Iceberg is the main alternative table format, with the same ideas and a different log layout; Delta is used here because it is the default on Databricks and Microsoft Fabric and needs no separate catalog service.

## Resources

- docs: [PySpark DataFrame quickstart](https://spark.apache.org/docs/3.5.8/api/python/getting_started/quickstart_df.html) · Apache Spark · Creating, selecting, filtering, grouping and writing DataFrames.
- docs: [Spark SQL, DataFrames and Datasets guide](https://spark.apache.org/docs/3.5.8/sql-programming-guide.html) · Apache Spark · The reference for data sources, schemas and SQL.
- docs: [CSV files](https://spark.apache.org/docs/3.5.8/sql-data-sources-csv.html) · Apache Spark · Every CSV option, including `mode` for malformed rows.
- docs: [Delta Lake quickstart](https://docs.delta.io/latest/quick-start.html) · Delta Lake · Creating, reading, updating and time-travelling Delta tables with PySpark.
- watch: [PySpark Tutorial | Full Course (From Zero to Pro!)](https://www.youtube.com/watch?v=94w6hPk7nkM) · Ansh Lamba · 155K subscribers · 1.3M views · 18.9K likes · published 2024-11-10 · checked 2026-09-28 · 354 min · Long; the DataFrame sections are the ones to watch now.

## Practice

1. Read the bronze orders, order lines and products for one load date. Print each schema and count.
2. Write `clean_orders` as above and check that `status` has exactly five distinct values.
3. Read `products.csv` twice: once with `inferSchema` and once with the explicit schema. Compare the two `printSchema()` outputs and the number of jobs each read created in the Spark UI.
4. Without running it, predict how many `Exchange` nodes `clean_orders.groupBy("warehouse_id").agg(F.countDistinct("customer_id"))` has, then check with `explain()`.
5. Try `spark.read.csv("file:///home/spark/work/notebooks/some.csv")` with a file you put in `spark/notebooks`, and `count()` it. Explain the result.

## Example answer

For step 1, remember that bronze `app_db` holds what Module 4's app database accepted: it rejected the 3 orphan orders, their 8 lines and the 6 duplicate lines. For 2026-06-30 you see 9,088 orders, 26,765 order lines and 120 products; for 2026-07-31 or later, 9,521 orders and 27,995 order lines. Parquet brings its types with it, so the schemas show `long`, `string`, `date` or `timestamp` depending on how your Module 6 code wrote them.

For step 2:

```python
clean_orders.select("status").distinct().orderBy("status").show()
```

shows `cancelled`, `delivered`, `pending`, `returned`, `shipped`: `lower(trim())` fixes the planted casing and spaces.

For step 3, the inferred schema reads the file twice (one job to infer, another when you act on the data), and may type `unit_cost` as `int` and `is_active` as `boolean` or `string` depending on the values. The explicit schema needs no inference job and always gives the same types.

For step 4, `countDistinct` usually adds two shuffles: one to group by `warehouse_id` and `customer_id` together to remove duplicates, and one to group by `warehouse_id` alone. `explain()` shows two `Exchange` nodes (Spark may plan it slightly differently; what matters is that you counted from the plan).

For step 5, the read fails, which is the point: the driver can see the file, so planning succeeds, but the tasks run on executors in the `spark-worker` container, which cannot, so they fail with a "file not found" error. In a cluster, data must live in storage every executor can reach: RustFS here, S3 or ADLS in the cloud.

# Lesson: Joins, aggregations and windows

minutes: 60

## Joins

A join combines two DataFrames on a key. Spark has several join strategies, and which one it picks decides the cost:

| Strategy | How it works | When |
|---|---|---|
| Broadcast hash join | Sends a full copy of the small side to every executor; the big side never moves | One side is small: under `spark.sql.autoBroadcastJoinThreshold`, 10 MB by default |
| Sort merge join | Shuffles both sides by the key, sorts, then merges | Both sides are large; the default for big-to-big joins |
| Shuffle hash join | Shuffles both sides, builds a hash table of one side per partition | Chosen in some cases where one side's partitions fit in memory |

ShopLink's 120 products are tiny, so a join to them should always be a broadcast. Spark usually picks that itself when it knows the size; `F.broadcast(products)` makes the intent explicit.

Join types are the same as SQL: `inner`, `left`, `right`, `full`, plus two that are especially useful in pipelines: `left_semi` (rows of the left side that have a match, without adding columns) and `left_anti` (rows that have **no** match, which is how you find orphans).

```python
orphans = orders.join(customers, "customer_id", "left_anti")
print(orphans.count())   # 0 for bronze/app_db: Module 4 rejected the orphans
```

The orphans are still in the API extract, which lands the orders exactly as the API returned them. Read it with `spark.read.option("multiLine", True).json("s3a://bronze/orders_api/load_date=2026-06-30/")` and the same anti join returns 3, the planted orders with customer_id 9001 to 9003.

## Aggregations

`groupBy` with `agg` works like SQL `GROUP BY`:

```python
daily = (lines
    .groupBy("order_date", "warehouse_id")
    .agg(
        F.countDistinct("order_id").alias("orders"),
        F.count("*").alias("order_lines"),
        F.sum("net_amount").alias("net_revenue"),
    ))
```

Spark aggregates within each partition first (a partial aggregate), then shuffles only the partial results. That is why a `groupBy` on billions of rows can be cheap: what crosses the network is one row per key per partition, not every row.

## Window functions

Windows compute a value per row from a group of related rows, without collapsing them, exactly like SQL window functions in Module 4. Two jobs they do in every lakehouse:

**Keep the latest version of each record.** Bronze keeps every version it received; silver keeps one:

```python
from pyspark.sql import Window

latest_first = Window.partitionBy("order_id").orderBy(F.col("updated_at").desc())

latest_orders = (clean_orders
    .withColumn("_rn", F.row_number().over(latest_first))
    .filter("_rn = 1")
    .drop("_rn"))
```

**Rolling measures.** A seven-day rolling average of revenue per warehouse, over calendar days (a range) rather than rows, so missing days do not stretch the window:

```python
seven_days = (Window.partitionBy("warehouse_id")
              .orderBy(F.expr("unix_date(order_date)"))
              .rangeBetween(-6, 0))

daily = daily.withColumn("net_revenue_7d_avg", F.avg("net_revenue").over(seven_days))
```

`unix_date` turns a date into a day number, so `rangeBetween(-6, 0)` means "this day and the six before it". A window with `partitionBy` shuffles by that key; a window with no `partitionBy` moves every row to one task, which is a classic way to make a big job crawl.

## The silver and gold jobs

Notebooks are for exploring. Jobs that run every day are Python files, submitted to the cluster. Save this as `spark/jobs/build_silver.py`:

```python
"""Build ShopLink silver Delta tables from one bronze load date. Safe to rerun."""
from __future__ import annotations  # allows "str | None" on the Spark image's Python 3.8

import argparse

from delta.tables import DeltaTable
from pyspark.sql import DataFrame, SparkSession, Window
from pyspark.sql import functions as F

BRONZE, SILVER = "s3a://bronze", "s3a://silver"

# Where Module 6 landed each table, and in which format. Change these to match your layout.
SOURCES = {
    "orders": ("app_db/orders", "parquet"),
    "order_lines": ("app_db/order_lines", "parquet"),
    "products": ("supplier/products", "csv"),
}


def read_bronze(spark: SparkSession, table: str, load_date: str) -> DataFrame:
    prefix, fmt = SOURCES[table]
    reader = spark.read.format(fmt)
    if fmt == "csv":
        reader = reader.option("header", True)
    return reader.load(f"{BRONZE}/{prefix}/load_date={load_date}/")


def clean_orders(df: DataFrame) -> DataFrame:
    latest_first = Window.partitionBy("order_id").orderBy(F.col("updated_at").desc())
    return (df
        .select(
            F.col("order_id").cast("bigint"),
            F.col("customer_id").cast("bigint"),
            F.col("warehouse_id").cast("bigint"),
            F.col("order_date").cast("date"),
            F.lower(F.trim("status")).alias("status"),
            F.col("channel").cast("string"),
            F.col("updated_at").cast("timestamp"),
        )
        .filter(F.col("order_id").isNotNull())
        .withColumn("_rn", F.row_number().over(latest_first))
        .filter("_rn = 1")
        .drop("_rn"))


def clean_order_lines(lines: DataFrame, products: DataFrame) -> DataFrame:
    product_attrs = products.select(
        F.col("product_id").cast("bigint"), "category", "brand")
    return (lines
        .select(
            F.col("order_line_id").cast("bigint"),
            F.col("order_id").cast("bigint"),
            F.col("product_id").cast("bigint"),
            F.col("quantity").cast("int"),
            F.col("unit_price").cast("bigint"),
            F.col("discount_pct").cast("int"),
        )
        .dropDuplicates(["order_line_id"])   # MERGE needs one row per key; the app's primary key already removed the 6 CSV duplicates
        .filter(F.col("quantity") > 0)        # quantity 0 and -2 were quarantined in Module 6
        .join(F.broadcast(product_attrs), "product_id", "left")
        .withColumn("net_amount",
                    (F.col("quantity") * F.col("unit_price")
                     * (1 - F.col("discount_pct") / 100)).cast("decimal(18,2)")))


def upsert(spark: SparkSession, df: DataFrame, path: str, key: str,
           update_condition: str | None = None) -> None:
    """Create the table on the first run; MERGE on the key afterwards, so reruns change nothing."""
    if not DeltaTable.isDeltaTable(spark, path):
        df.write.format("delta").mode("overwrite").save(path)
        return
    merge = (DeltaTable.forPath(spark, path).alias("t")
             .merge(df.alias("s"), f"t.{key} = s.{key}"))
    if update_condition:
        merge = merge.whenMatchedUpdateAll(condition=update_condition)
    merge.whenNotMatchedInsertAll().execute()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--load-date", required=True)
    load_date = parser.parse_args().load_date

    spark = SparkSession.builder.appName(f"shoplink_silver_{load_date}").getOrCreate()

    orders = clean_orders(read_bronze(spark, "orders", load_date))
    upsert(spark, orders, f"{SILVER}/orders", "order_id",
           update_condition="s.updated_at > t.updated_at")

    lines = clean_order_lines(read_bronze(spark, "order_lines", load_date),
                              read_bronze(spark, "products", load_date))
    upsert(spark, lines, f"{SILVER}/order_lines", "order_line_id")

    for table in ("orders", "order_lines"):
        count = spark.read.format("delta").load(f"{SILVER}/{table}").count()
        print(f"silver.{table}: {count} rows after load_date {load_date}")
    spark.stop()


if __name__ == "__main__":
    main()
```

Why it is idempotent: the first run creates each table; every later run MERGEs on the key. Rerunning the same load date finds every key already present, inserts nothing, and updates nothing, because an order is only updated when the incoming `updated_at` is **newer**. A crash halfway through a MERGE commits nothing, because Delta commits a write in one step or not at all. MERGE also requires the source to have one row per key, which is why the window and `dropDuplicates` come first.

Then `spark/jobs/build_gold.py`:

```python
"""Build gold.daily_revenue from silver. Recomputes the whole table: small, and always correct."""
from pyspark.sql import SparkSession, Window
from pyspark.sql import functions as F

SILVER, GOLD = "s3a://silver", "s3a://gold"


def main() -> None:
    spark = SparkSession.builder.appName("shoplink_gold_daily_revenue").getOrCreate()
    orders = spark.read.format("delta").load(f"{SILVER}/orders")
    lines = spark.read.format("delta").load(f"{SILVER}/order_lines")

    revenue_orders = orders.filter(~F.col("status").isin("cancelled", "returned"))

    daily = (lines
        .join(revenue_orders.select("order_id", "order_date", "warehouse_id"), "order_id")
        .groupBy("order_date", "warehouse_id")
        .agg(F.countDistinct("order_id").alias("orders"),
             F.count("*").alias("order_lines"),
             F.sum("net_amount").alias("net_revenue")))

    seven_days = (Window.partitionBy("warehouse_id")
                  .orderBy(F.expr("unix_date(order_date)"))
                  .rangeBetween(-6, 0))
    daily = daily.withColumn(
        "net_revenue_7d_avg", F.avg("net_revenue").over(seven_days).cast("decimal(18,2)"))

    (daily.write.format("delta")
        .mode("overwrite")
        .option("overwriteSchema", "true")
        .save(f"{GOLD}/daily_revenue"))
    print(f"gold.daily_revenue: {daily.count()} rows")
    spark.stop()


if __name__ == "__main__":
    main()
```

Gold is recomputed from silver on every run with `overwrite`. Delta's overwrite is atomic, so readers see the old version until the new one commits, and the old version stays available for time travel. Recomputing is the right choice here because the table is small and because a status change on a June order must change June's revenue. At a larger scale you would rebuild only the affected dates with `.option("replaceWhere", "order_date >= '2026-06-01'")`.

After the 2026-06-30 load date, the jobs give 9,088 rows in `silver/orders`, 26,763 in `silver/order_lines` (the app's 26,765, less the 2 bad quantities) and 3,454 rows in `gold/daily_revenue` (one per day and warehouse with revenue), with a total net revenue of ₦373,674,496,800. Then run the silver job for 2026-07-31 and the gold job again: the MERGE brings batch 2 in, giving 9,521, 27,993 and 3,580 rows, and ₦392,169,805,175, the same total as Module 5's star. Use those numbers to check your own run.

## Submitting jobs with spark-submit

`spark-submit` sends a job file to the cluster. Run it inside the `jupyter` container, which has the right Spark, Python packages and `spark-defaults.conf`:

```bash
docker compose exec jupyter /opt/spark/bin/spark-submit \
  --master spark://spark-master:7077 \
  --name shoplink_silver \
  /home/spark/work/jobs/build_silver.py --load-date 2026-06-30

docker compose exec jupyter /opt/spark/bin/spark-submit \
  --master spark://spark-master:7077 \
  /home/spark/work/jobs/build_gold.py
```

Here the driver runs inside `jupyter` (Spark calls this **client** deploy mode) and the executors run on the worker. Spark's standalone cluster manager does not support **cluster** deploy mode for Python applications, so for PySpark on standalone, client mode is the only choice; on YARN or Kubernetes, cluster mode runs the driver inside the cluster too. Only one application gets the worker's cores at a time with these settings, so shut down any notebook kernel with a session before you submit.

## Running the jobs from Airflow

Your Module 7 DAG should build silver and gold after the load. There are two common ways, each with a real tradeoff:

| Approach | How | For | Against |
|---|---|---|---|
| `SparkSubmitOperator` | The Airflow image gets Java and the Spark client, and runs `spark-submit` itself, against `spark://spark-master:7077` | The proper integration: connections, templated arguments, logs in Airflow, no special access | A heavier Airflow image; the Spark client must match the cluster's version; the driver runs inside the Airflow container |
| `BashOperator` calling `docker exec jupyter spark-submit ...` | Airflow asks Docker to run the command in the Spark container | No Spark in the Airflow image | Airflow needs the Docker socket mounted, which gives it full control of your machine. Acceptable on a laptop for a demo, never in production |

This course uses `SparkSubmitOperator`. Add Java and the Spark client to `airflow/Dockerfile`, before the `COPY requirements.txt` line:

```dockerfile
USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends openjdk-17-jre-headless \
 && apt-get autoremove -yqq --purge && apt-get clean && rm -rf /var/lib/apt/lists/*
USER airflow
```

Add two lines to `airflow/requirements.txt`:

```text
apache-airflow-providers-apache-spark==5.5.0
pyspark==3.5.3
```

The provider is pinned to 5.5.0 on purpose: from version 6.0 it depends on the Spark 4 Connect client, which does not match a 3.5.3 cluster. Then add to `x-airflow-common` in `compose.yaml`: a volume `- ./spark:/opt/airflow/spark`, and two environment variables:

```yaml
    AIRFLOW_CONN_SPARK_DEFAULT: spark://spark-master:7077
    SPARK_CONF_DIR: /opt/airflow/spark/conf
```

`SPARK_CONF_DIR` makes `spark-submit` in Airflow read the same `spark-defaults.conf` as the cluster, and the RustFS keys are already in the Airflow environment from Module 7. Rebuild with `docker compose build airflow-init` and restart the Airflow services. In `dags/shoplink_daily_ingest.py`:

```python
from airflow.providers.apache.spark.operators.spark_submit import SparkSubmitOperator

spark_silver = SparkSubmitOperator(
    task_id="spark_build_silver",
    conn_id="spark_default",
    application="/opt/airflow/spark/jobs/build_silver.py",
    application_args=["--load-date", "{{ ds }}"],
    name="shoplink_silver_{{ ds }}",
)
spark_gold = SparkSubmitOperator(
    task_id="spark_build_gold",
    conn_id="spark_default",
    application="/opt/airflow/spark/jobs/build_gold.py",
    name="shoplink_gold_{{ ds }}",
)

load >> spark_silver >> spark_gold
```

Here `load` is your `load_raw` task. Two cautions. The Airflow image uses Python 3.11 and the Spark workers Python 3.8; that is fine for these jobs because they use only DataFrame operations, which run in the JVM, but a Python UDF would fail on a version mismatch. If you need UDFs, run the jobs from the Spark image instead. And with everything on one laptop, running Airflow and Spark together needs most of 16 GB: stop `jupyter` while Airflow runs the jobs.

## Resources

- docs: [Performance tuning: join strategy hints](https://spark.apache.org/docs/3.5.8/sql-performance-tuning.html) · Apache Spark · Broadcast and other join hints, and the settings that choose join strategies.
- docs: [Window functions](https://spark.apache.org/docs/3.5.8/sql-ref-syntax-qry-select-window.html) · Apache Spark · Frames, `rangeBetween` and `rowsBetween`, in SQL form.
- docs: [Table deletes, updates and merges](https://docs.delta.io/latest/delta-update.html) · Delta Lake · MERGE with conditions, and why the source must have one row per key.
- docs: [Submitting applications](https://spark.apache.org/docs/3.5.8/submitting-applications.html) · Apache Spark · spark-submit options, master URLs and deploy modes.
- docs: [SparkSubmitOperator](https://airflow.apache.org/docs/apache-airflow-providers-apache-spark/stable/operators.html) · Apache Airflow · The operator's arguments and the Spark connection.

## Practice

1. Save the two jobs, submit them for load date 2026-06-30, then run the silver job for 2026-07-31 and the gold job again. Check your counts against the numbers above after each.
2. Submit `build_silver.py` a second time for the same date. Run `DESCRIBE HISTORY` on `silver/orders` and show that the second run changed no rows.
3. Using a left anti join, count the order lines whose `order_id` is not in `silver/orders`, and the orders whose `customer_id` is not in the bronze customers.
4. Add to `build_gold.py` a second output, `gold/monthly_category_revenue` (month, category, net revenue), and state its grain in one sentence.
5. Stretch: wire both jobs into `shoplink_daily_ingest` with `SparkSubmitOperator` and get a green run.

## Example answer

For step 2:

```python
spark.sql("DESCRIBE HISTORY delta.`s3a://silver/orders`") \
    .select("version", "operation", "operationMetrics").show(truncate=False)
```

Version 0 is the `WRITE` (or `CREATE OR REPLACE`) with `numOutputRows` 9,088. The rerun adds a `MERGE` version whose metrics show `numTargetRowsInserted` 0 and `numTargetRowsUpdated` 0. A new version with zero changes is the proof of idempotency: the job ran, and the data did not change.

For step 3, both checks return 0, because the app database enforced both foreign keys in Module 4: the 3 planted orphan orders (customer_id 9001 to 9003) and their lines never reached it, so they exist only in `bronze/orders_api`:

```python
orders = spark.read.format("delta").load("s3a://silver/orders")
lines = spark.read.format("delta").load("s3a://silver/order_lines")
customers = spark.read.parquet("s3a://bronze/app_db/customers/load_date=2026-06-30/")

print(lines.join(orders, "order_id", "left_anti").count())
print(orders.join(customers.select(F.col("customer_id").cast("bigint")),
                  "customer_id", "left_anti").count())
```

For step 4:

```python
monthly = (lines
    .join(revenue_orders.select("order_id", "order_date"), "order_id")
    .groupBy(F.date_trunc("month", "order_date").cast("date").alias("month"), "category")
    .agg(F.sum("net_amount").alias("net_revenue")))
monthly.write.format("delta").mode("overwrite").save(f"{GOLD}/monthly_category_revenue")
```

Grain: one row per calendar month per product category. The sum across all rows must equal the sum of `gold/daily_revenue`, which is a good check to add.

For step 5, a green run shows `spark_build_silver` and `spark_build_gold` after `load_raw`, and the task log contains the lines printed by the jobs, because the driver runs inside Airflow. If the task fails with `JAVA_HOME is not set` or `java: not found`, the image was not rebuilt; if executors cannot connect back, check that `spark-master` and Airflow are on the same Compose network (they are, unless you gave them different networks).

# Lesson: Performance: partitions, shuffles, skew, small files

minutes: 60

## Make the data big enough to matter

On 28,000 rows every job takes a second or two, mostly start-up time, and no tuning makes a visible difference. To see performance effects you need more data. Save this as `spark/jobs/make_synthetic.py`: it copies silver order lines many times with new ids, and can concentrate a share of rows on one product to create skew:

```python
"""Make a larger synthetic copy of silver.order_lines for performance experiments."""
import argparse

from pyspark.sql import SparkSession
from pyspark.sql import functions as F


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--copies", type=int, default=200)
    parser.add_argument("--skew", type=float, default=0.0,
                        help="share of rows moved to product_id 7, for example 0.6")
    args = parser.parse_args()

    spark = SparkSession.builder.appName("shoplink_make_synthetic").getOrCreate()
    lines = spark.read.format("delta").load("s3a://silver/order_lines")
    copies = spark.range(args.copies).withColumnRenamed("id", "copy")

    big = (lines.crossJoin(copies)
        .withColumn("order_line_id", F.col("copy") * 10_000_000 + F.col("order_line_id"))
        .withColumn("order_id", F.col("copy") * 1_000_000 + F.col("order_id")))
    if args.skew > 0:
        big = big.withColumn(
            "product_id",
            F.when(F.rand(seed=42) < args.skew, F.lit(7).cast("bigint")).otherwise(F.col("product_id")))

    target = "s3a://silver/order_lines_big" + ("_skewed" if args.skew > 0 else "")
    big.drop("copy").write.format("delta").mode("overwrite").save(target)
    print(f"{target}: {spark.read.format('delta').load(target).count()} rows")
    spark.stop()


if __name__ == "__main__":
    main()
```

```bash
docker compose exec jupyter /opt/spark/bin/spark-submit --master spark://spark-master:7077 \
  /home/spark/work/jobs/make_synthetic.py --copies 200
docker compose exec jupyter /opt/spark/bin/spark-submit --master spark://spark-master:7077 \
  /home/spark/work/jobs/make_synthetic.py --copies 200 --skew 0.6
```

200 copies of silver's 27,993 lines is 5,598,600 rows: still small by Spark standards, but big enough to see shuffles and skew on a laptop. Raise `--copies` if your machine has room; lower it if a job takes more than a few minutes.

To time a query without writing anything, use the `noop` sink, which runs the whole plan and throws the result away:

```python
import time

def timed(df, label):
    start = time.perf_counter()
    df.write.format("noop").mode("overwrite").save()
    print(f"{label}: {time.perf_counter() - start:.1f}s")
```

## Partitions

Spark's parallelism is its partitions: one task per partition per stage.

- **Reading:** file sources split input into partitions of up to `spark.sql.files.maxPartitionBytes` (128 MB by default). `df.rdd.getNumPartitions()` tells you how many you got.
- **After a shuffle:** `spark.sql.shuffle.partitions` (200 by default, 8 in your config), adjusted by adaptive query execution.
- **Rule of thumb:** aim for tasks of roughly 100 to 200 MB, and at least two to three times as many partitions as total cores, so no core sits idle.

Too few partitions leave cores idle and risk running out of memory; too many make thousands of tiny tasks where scheduling costs more than the work.

## repartition versus coalesce

| | `repartition(n)` or `repartition(n, "col")` | `coalesce(n)` |
|---|---|---|
| Shuffle | Yes, a full one | No; merges existing partitions |
| Can increase partitions | Yes | No, only decrease |
| Result | Evenly sized partitions, optionally grouped by a column | Possibly uneven partitions |
| Hidden cost | The shuffle | It can reduce the parallelism of the work **before** it too, because Spark folds it into the earlier stage |

Typical uses: `repartition("order_date")` before writing a table partitioned by date, so each date's rows are in few files; `coalesce(1)` only for a small final result you need as a single file.

## Shuffles and broadcast joins

The shuffle is where most time goes, so the first question about a slow job is "which shuffles does it do, and can one go?". Compare the same join both ways:

```python
big = spark.read.format("delta").load("s3a://silver/order_lines_big")
products = spark.read.format("delta").load("s3a://silver/order_lines").select("product_id", "category").distinct()

spark.conf.set("spark.sql.autoBroadcastJoinThreshold", -1)   # forbid broadcasting
timed(big.join(products, "product_id").groupBy("category").count(), "sort merge join")

spark.conf.set("spark.sql.autoBroadcastJoinThreshold", 10 * 1024 * 1024)   # back to the default
timed(big.join(F.broadcast(products), "product_id").groupBy("category").count(), "broadcast join")
```

In the SQL tab, the first plan has `SortMergeJoin` with an `Exchange` on **both** sides: all 5.6 million rows are shuffled by `product_id`. The second has `BroadcastHashJoin` and a `BroadcastExchange` of about a hundred rows; the big side is read and joined where it lies. Setting the threshold to `-1` also stops adaptive query execution from switching to a broadcast at runtime, which it otherwise would.

## Adaptive query execution (AQE)

Since Spark 3.2, **AQE** is on by default (`spark.sql.adaptive.enabled`). It re-plans a query at each shuffle using real statistics from the stages that already ran:

- **Coalescing shuffle partitions:** merges many small post-shuffle partitions into fewer, right-sized ones. This is why a stage often has fewer tasks than `spark.sql.shuffle.partitions`.
- **Switching join strategy:** turns a sort merge join into a broadcast join when one side turns out to be small after filtering.
- **Splitting skewed partitions:** in a sort merge join, splits an oversized partition into several tasks (`spark.sql.adaptive.skewJoin.enabled`). A partition counts as skewed when it is more than 5 times the median **and** larger than 256 MB, so on laptop-sized data you must lower the threshold to see it.

In the SQL tab, a plan changed by AQE shows `AdaptiveSparkPlan isFinalPlan=true`, and nodes such as `AQEShuffleRead` with "coalesced" or "skewed" in their details.

## Skew and salting

**Skew** is when one key has far more rows than the others. Its partition becomes one task that runs long after all the others have finished, and the whole stage waits for it. Your skewed copy puts 60% of all lines on product 7. Join it to products without broadcasting and without AQE's skew handling:

```python
skewed = spark.read.format("delta").load("s3a://silver/order_lines_big_skewed")
spark.conf.set("spark.sql.autoBroadcastJoinThreshold", -1)
spark.conf.set("spark.sql.adaptive.skewJoin.enabled", "false")
timed(skewed.join(products, "product_id").groupBy("category").count(), "skewed join")
```

On the Stages page for the join stage, look at the task time summary: the **max** is many times the **median**, and one task's shuffle read is most of the stage's. That single task is product 7.

**Salting** spreads the hot key by adding a random number to it on the big side, and copying the small side once per number:

```python
SALT = 8
salted_big = skewed.withColumn("salt", F.floor(F.rand(seed=1) * SALT).cast("bigint"))
salted_products = products.crossJoin(spark.range(SALT).withColumnRenamed("id", "salt"))

timed(salted_big.join(salted_products, ["product_id", "salt"]).groupBy("category").count(),
      "salted join")
```

Product 7's rows are now split over 8 keys, so 8 tasks share them. The price is 8 copies of the small side, and a more complicated query. Try AQE first: turn `spark.sql.adaptive.skewJoin.enabled` back on and lower `spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes` to `"1MB"` for this experiment, and compare. Salting is for when AQE cannot help (for example skew in a window or in an aggregation it does not handle), and, of course, broadcasting the small side avoids the problem entirely here.

## Small files and compaction

Every file costs a request to object storage and a task to open it. A table made of thousands of tiny files is slow to read even when the total size is small. Tiny files usually come from writing with too many partitions, or from many small appends (streaming makes them all day, as you will see in Module 9). Make the problem on purpose:

```python
big.repartition(800).write.format("delta").mode("overwrite").save("s3a://silver/order_lines_tiny_files")
spark.sql("DESCRIBE DETAIL delta.`s3a://silver/order_lines_tiny_files`").select("numFiles", "sizeInBytes").show()

tiny = spark.read.format("delta").load("s3a://silver/order_lines_tiny_files")
timed(tiny.groupBy("product_id").count(), "800 small files")
```

Delta's `OPTIMIZE` rewrites small files into larger ones, as a new table version, without changing the data:

```python
from delta.tables import DeltaTable

DeltaTable.forPath(spark, "s3a://silver/order_lines_tiny_files").optimize().executeCompaction()
spark.sql("DESCRIBE DETAIL delta.`s3a://silver/order_lines_tiny_files`").select("numFiles", "sizeInBytes").show()
timed(spark.read.format("delta").load("s3a://silver/order_lines_tiny_files")
      .groupBy("product_id").count(), "after OPTIMIZE")
```

The old small files stay in storage (time travel needs them) until `VACUUM` removes files older than the retention period, 7 days by default.

## Reading less: pruning and pushdown

The fastest data to process is data you never read:

- **Column pruning:** Parquet is columnar, so `select("order_date", "net_amount")` reads only those two columns from storage.
- **Predicate pushdown:** a filter on a Parquet or Delta source is pushed into the scan, so row groups whose min and max statistics cannot match are skipped. In `explain()`, look for `PushedFilters: [IsNotNull(order_date), GreaterThanOrEqual(order_date,2026-06-01)]`.
- **Partition pruning:** a table written with `partitionBy("order_date")` stores each date in its own folder, and a filter on the date skips whole folders (`PartitionFilters` in the plan). Partition only by low-cardinality columns that queries filter on; partitioning by a high-cardinality column such as `order_id` creates millions of tiny files, the problem above.

A filter written after a Python UDF, or on a column computed with a function Spark cannot see through, may not be pushed down. Check the plan rather than assuming.

## Caching

`df.cache()` keeps a DataFrame in executor memory (spilling to disk if needed) after the first action computes it, so later actions reuse it instead of recomputing from the source. It is worth it only when the same DataFrame is used by **several** actions, such as a cleaned table you query several ways in a notebook. It is lazy (nothing is cached until an action runs), it uses memory other work needs, and a DataFrame used once gains nothing. Call `df.unpersist()` when you are done, and check the Storage tab to see what is cached.

## Resources

- docs: [Performance tuning](https://spark.apache.org/docs/3.5.8/sql-performance-tuning.html) · Apache Spark · Caching, partition settings, join hints and every AQE setting with its default.
- docs: [Optimizations](https://docs.delta.io/latest/optimizations-oss.html) · Delta Lake · OPTIMIZE compaction, Z-ordering and data skipping.
- docs: [Parquet files](https://spark.apache.org/docs/3.5.8/sql-data-sources-parquet.html) · Apache Spark · Partition discovery, schema merging and filter pushdown for Parquet.
- watch: [25 AQE aka Adaptive Query Execution in Spark | Coalesce Shuffle Partitions | Skew Partitions Fix](https://www.youtube.com/watch?v=164OKvwW8T8) · Ease With Data · 79.8K subscribers · 27.9K views · 382 likes · published 2024-01-06 · checked 2026-09-28 · 12 min
- docs: [Apache Iceberg documentation](https://iceberg.apache.org/docs/latest/) · Apache Iceberg · The main alternative to Delta, with its own compaction and maintenance procedures.

## Practice

1. Generate both synthetic tables. Record the row counts.
2. Run the sort merge join and the broadcast join, and record for each: the time, the number of stages, and the total shuffle write in the Stages tab.
3. Run the skewed join with AQE's skew handling off, then with it on (and the lowered threshold), then salted. For each, record the time and the max and median task duration of the join stage.
4. Make the 800-file table, record `numFiles` and the query time, run `OPTIMIZE`, and record both again.
5. Write three sentences for ShopLink's team: which of these techniques they need **today**, with their real data size, and which they would need at 100 times the size.

## Example answer

For step 1 you should see 5,598,600 rows in each synthetic table. Your timings will depend on your machine, so the example below describes what to look for rather than exact seconds.

For step 2, a strong record looks like this:

| Join | Time | Stages | Shuffle write |
|---|---|---|---|
| Sort merge join | Several seconds | 3 or more | Tens of MB: the big side was shuffled |
| Broadcast join | Noticeably faster | Fewer | A few KB: only the small aggregate is shuffled |

For step 3: with skew handling off, the join stage's max task time is many times its median, and one task's shuffle read is about 60% of the stage. With AQE skew handling on and the threshold lowered, the plan shows the skewed partition split (in the SQL tab the sort merge join is marked as a skew join, and the `AQEShuffleRead` node mentions skewed partitions) and the max task time falls close to the median. Salting gives a similar spread by hand. If AQE did not split anything, the partition was still under the threshold: check the value you set in the Environment tab.

For step 4: before `OPTIMIZE`, `numFiles` is 800 (or close) and the query is slower than on the original table; after, `numFiles` drops to a handful (Delta targets files of up to 1 GB) and the query time returns close to the original. `DESCRIBE HISTORY` shows `OPTIMIZE` as a new version with `numRemovedFiles` and `numAddedFiles`.

For step 5: "Today ShopLink needs none of this: its whole dataset is a few MB, fits in PostgreSQL, and dbt handles it in seconds, so Spark would add cost and complexity for no gain. At 100 times the size (around 2.8 million order lines in total) PostgreSQL and DuckDB would still cope, and the first Spark techniques to matter, if the lake grows to billions of rows, would be broadcasting small dimension tables, partitioning large tables by date for pruning, and compacting the small files that daily and streaming loads create. Skew handling and salting only become relevant if a few very large customers or products dominate the data." Any answer that ties each technique to a data size and a symptom is acceptable.

# Quiz

passing_score: 70

### What does Spark do when your code calls filter() and groupBy() on a DataFrame, but no action?

- [ ] It runs both steps on the executors immediately
- [ ] It runs the filter immediately and waits for the groupBy
- [x] It records them in a plan and runs nothing until an action such as count() or write
- [ ] It copies the data to the driver

> Transformations are lazy. Spark builds and optimises the whole plan, and only an action turns it into a job with stages and tasks.

### In the Spark UI, what usually marks the boundary between two stages?

- [ ] A filter
- [x] A shuffle (an Exchange in the plan), where rows move between executors by key
- [ ] A change of column names
- [ ] The end of a Python function

> Spark cuts a job into stages at every shuffle. Narrow operations such as filter and select run within one stage.

### ShopLink's 5 million synthetic order lines join to 120 products. What is the best first step to speed up the join?

- [ ] Increase spark.sql.shuffle.partitions to 2,000
- [ ] Salt the product_id key
- [x] Broadcast the small products table so the large side is never shuffled
- [ ] Cache the products table

> Broadcasting the small side removes the shuffle of the large side, which is the expensive part. Salting and partition tuning are for when both sides are large.

### What is the difference between repartition(10) and coalesce(10)?

- [x] repartition does a full shuffle and can increase or decrease partitions; coalesce merges existing partitions without a shuffle and can only decrease them
- [ ] They are the same function with different names
- [ ] coalesce shuffles the data and repartition does not
- [ ] repartition only works on Delta tables

> coalesce avoids a shuffle by merging partitions, which is cheap but can leave them uneven and reduce parallelism upstream. repartition pays for a shuffle to get even partitions.

### A Delta table has 20,000 files of about 50 KB each and reads slowly. What fixes it?

- [ ] VACUUM with a retention of zero hours
- [x] Compacting the files with OPTIMIZE, then fixing the writes that create tiny files
- [ ] Partitioning the table by order_id
- [ ] Caching the table on the driver

> OPTIMIZE rewrites many small files into a few large ones as a new table version. Partitioning by a high-cardinality key would make the small-files problem worse.

# Project: ShopLink silver and gold on Spark and Delta

max_score: 100

## Brief

ShopLink's data is small today, but the board wants to know the platform could handle a much larger business. Build the lakehouse layer: PySpark jobs that turn bronze files in RustFS into silver and gold Delta tables, safely and repeatably, and prove with the Spark UI that you can find and fix a performance problem.

Work in your `shoplink-data-platform` repository on a branch called `feature/spark-lakehouse`.

## Deliverables

1. **The Spark stack.** `compose.yaml` has `spark-master` (UI on host port 8081), `spark-worker` and `jupyter` (built from `spark/Dockerfile` on `apache/spark:3.5.3-python3`, with `pyspark==3.5.3` and `delta-spark` 3.2.x). `spark/conf/spark-defaults.conf` configures Delta and S3A for RustFS, with no credentials in the file.
2. **Silver job.** `spark/jobs/build_silver.py --load-date YYYY-MM-DD` builds `silver/orders` (latest version per order, status cleaned) and `silver/order_lines` (deduplicated, bad quantities removed, product attributes joined, `net_amount` calculated) as Delta tables with MERGE.
3. **Gold job.** `spark/jobs/build_gold.py` builds `gold/daily_revenue` (one row per order date and warehouse, cancelled and returned orders excluded, with a 7-day rolling average) as a Delta table.
4. **Idempotency evidence.** `DESCRIBE HISTORY` output showing a rerun of the silver job for the same date inserted and updated 0 rows, and a row count check of gold before and after a rerun.
5. **One performance improvement.** Using `make_synthetic.py` data (or your own larger copy), pick one problem (a shuffle a broadcast removes, skew, small files, too many or too few partitions, missing pruning), and document it in `spark/PERFORMANCE.md`: the query, the before and after times, the Spark UI evidence (stage count, shuffle sizes, task durations or file counts, with screenshots), and a sentence on whether ShopLink needs it at today's size.
6. **README.** How to start the Spark services, submit each job, and where to look in the Spark UI. Optional: the jobs wired into `shoplink_daily_ingest` with `SparkSubmitOperator`.

## How to submit

Push the branch and open a pull request into `main`. Paste the pull request link into the submission form, with a one-line note naming the performance problem you chose and anything you would like feedback on. Share `PERFORMANCE.md` for peer review if you want someone to challenge your measurements.

## Grading guide

| Criterion | Points |
|---|---|
| Spark services and configuration follow the brief, versions match, and no secrets are committed | 15 |
| Silver job: correct cleaning, deduplication, broadcast join and net amount, written with MERGE | 25 |
| Gold job: correct grain, revenue rule and rolling window | 15 |
| Idempotency proven with Delta history and counts | 15 |
| Performance improvement measured before and after, with Spark UI evidence and an honest verdict | 20 |
| README clear enough for someone else to run the jobs | 10 |
