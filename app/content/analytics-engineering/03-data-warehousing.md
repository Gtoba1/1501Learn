---
module: 3
title: Data Warehousing
optional: false
summary: Learn why analytics runs in a data warehouse rather than the app database, how ETL and ELT differ, and how a modern warehouse is organised into raw, staging, intermediate and mart layers on columnar storage. Then you install DuckDB on your laptop, load ShopLink's five raw tables into your own warehouse with a reusable SQL script, and profile the data to uncover the problems you will fix in later modules.
---

# Lesson: OLTP vs OLAP

minutes: 40

## Two very different jobs

Every time a ShopLink sales rep logs a WhatsApp order, the app does something small and urgent: it inserts one row into `orders`, three or four rows into `order_lines`, and returns a confirmation in a fraction of a second. Later, when the order ships, it updates that one order's `status`. Thousands of these tiny reads and writes happen every day, and each must be fast and must never be lost.

On Monday morning the Head of Sales asks: "What was our net revenue each month for the last two years, by state?" Answering that means reading every order and every order line ShopLink has ever recorded, joining them to customers, and adding everything up. Nothing is written. Millions of values are read.

These two workloads have names:

- **OLTP** (online transaction processing): many small, fast reads and writes of individual records. This is what application databases do.
- **OLAP** (online analytical processing): fewer, much larger queries that scan and aggregate lots of rows. This is what data warehouses do.

## Side by side

| | OLTP (the ShopLink app database) | OLAP (the ShopLink warehouse) |
|---|---|---|
| Main job | Run the business: take orders, update stock | Understand the business: report, analyse |
| Typical query | Fetch or update one order | Sum revenue across every order since 2024 |
| Rows touched per query | A handful | Thousands to billions |
| Users | The app itself, many at once | Analysts, dashboards, analytics engineers |
| Design | Normalised: many narrow tables, no repeated data | Often denormalised: wide tables built for reading |
| Storage layout | Row-oriented | Column-oriented |
| History | Current state; old values overwritten | History kept, loaded on a schedule |
| Examples | PostgreSQL, MySQL, SQL Server, Oracle | Snowflake, BigQuery, Redshift, Databricks, DuckDB |

## What the queries look like

An OLTP query touches one record by its key:

```sql
-- The app marks one order as shipped.
-- This runs in ShopLink's app database, not in your warehouse.
UPDATE orders
SET status = 'shipped', updated_at = now()
WHERE order_id = 104512;
```

An OLAP query reads a lot of rows but only a few columns, and aggregates them:

```sql
-- Leadership wants net revenue per month.
-- This runs in the warehouse, on the raw tables you load in lesson 4.
SELECT
    date_trunc('month', o.order_date) AS order_month,
    sum(ol.quantity * ol.unit_price * (1 - ol.discount_pct / 100)) AS net_revenue
FROM raw.order_lines AS ol
JOIN raw.orders AS o ON ol.order_id = o.order_id
WHERE lower(trim(o.status)) NOT IN ('cancelled', 'returned')
GROUP BY order_month
ORDER BY order_month;
```

## Why not just query the app database?

It is tempting to point a dashboard straight at the app database. ShopLink's teams do this today, and it causes four problems:

1. **It slows the business down.** A heavy analytical query competes with customers placing orders. At month end, when everyone runs reports at once, the app gets slow.
2. **History is overwritten.** When an order goes from `shipped` to `returned`, the app updates the row and the old status is gone. A warehouse can keep both. You will do this for ShopLink's customers in Module 7 with snapshots.
3. **Data lives in many systems.** Payments, the CRM, marketing spend and spreadsheets are not in the app database. A warehouse brings them together.
4. **The design fights you.** OLTP schemas are normalised for safe writes, so simple business questions need many joins. A warehouse lets you reshape the data for reading, which is what Module 5 on dimensional modelling is about.

So the standard pattern is: the app database stays OLTP, a copy of its data is loaded into a warehouse on a schedule, and all analytics happens in the warehouse.

## Resources

- read: [The difference between OLAP and OLTP](https://aws.amazon.com/compare/the-difference-between-olap-and-oltp/) · AWS · A clear comparison table with examples of each.
- watch: [Explain By Example: OLTP vs OLAP](https://www.youtube.com/watch?v=aRT8E0nD_LE) · Explain By Example · 2.05K subscribers · 77.5K views · 2,270 likes · published 2021-10-02 · checked 2026-09-27 · 8 min
- watch: [What is a Data Warehouse? (Database vs. Data Warehouse Explained)](https://www.youtube.com/watch?v=myi50Ccfbwo) · techTFQ · 405K subscribers · 17.9K views · 802 likes · published 2026-01-27 · checked 2026-09-27 · 15 min
- deeper: [Fundamentals of Data Engineering](https://www.oreilly.com/library/view/fundamentals-of-data/9781098108298/) · Joe Reis and Matt Housley, O'Reilly (paid) · Chapter 5 covers source systems and why they differ from analytical storage.

## Practice

Classify each workload as OLTP or OLAP, and give a one-line reason:

1. A reseller in Onitsha logs in to see the status of yesterday's order.
2. Finance calculates total discounts given per quarter since 2024.
3. A sales rep adds a new school as a customer.
4. The operations manager compares average delivery times across the five warehouses.
5. The app checks stock before confirming an order for 40 laptops.
6. Marketing asks which customer type has grown fastest this year.

Then write two sentences explaining to a ShopLink manager why the monthly board report should not be run against the app database.

## Example answer

1. **OLTP.** One customer, one order, looked up by key.
2. **OLAP.** Scans every order line for two and a half years and aggregates.
3. **OLTP.** A single insert that must succeed immediately.
4. **OLAP.** Aggregates across every delivered order, grouped by warehouse.
5. **OLTP.** A fast lookup of a few stock records inside a live transaction.
6. **OLAP.** Groups all customers and orders by type and period.

For the manager: "Running the board report on the app database slows the app down for resellers placing orders, and the app overwrites old values, so it cannot show us how an order's status changed over time. A separate warehouse gives us fast reports, full history, and one place to combine the app's data with finance and marketing data."

# Lesson: ETL vs ELT

minutes: 40

## Getting data into the warehouse

Data does not appear in the warehouse by magic. Some process has to copy it out of the source systems, move it, and reshape it for analysis. Three steps are always involved:

- **Extract**: read data out of a source, such as ShopLink's app database, a payments API or a spreadsheet.
- **Load**: write it into the warehouse.
- **Transform**: clean, join, reshape and aggregate it into something useful.

The difference between ETL and ELT is the order of the last two steps, and that order changes who does the work and where.

## ETL: transform, then load

In ETL, data is transformed on a separate server before it reaches the warehouse. Only the cleaned, reshaped result is loaded.

```text
App database --extract--> ETL server (clean, join, aggregate) --load--> Warehouse (finished tables only)
```

ETL made sense when warehouses were expensive on-premise machines: storage was costly, so you only loaded what you needed, and compute was limited, so the heavy work happened elsewhere. The transformations were usually built in specialist tools such as Informatica or SSIS.

## ELT: load, then transform

In ELT, data is loaded into the warehouse raw, exactly as it came from the source, and transformed afterwards inside the warehouse, using SQL.

```text
App database --extract--> --load--> Warehouse: raw tables --transform (SQL, dbt)--> clean tables
```

This is the pattern you will use for ShopLink:

1. **Extract**: the app exports its five tables as CSV files (your `shoplink.zip`).
2. **Load**: a SQL script copies each CSV, untouched, into a `raw` schema in DuckDB. You will write it in lesson 4.
3. **Transform**: SQL, and later dbt, turns `raw.orders` into cleaned staging tables (status fixed, duplicates removed) and then into marts that answer the leadership questions.

## Side by side

| | ETL | ELT |
|---|---|---|
| Where transformation happens | A separate server or tool, before loading | Inside the warehouse, after loading |
| What lands in the warehouse | Only cleaned, finished data | Raw data first, then cleaned layers on top |
| Main language | Often a vendor tool or Python | SQL (with dbt) |
| If a business rule changes | Re-extract and re-run the pipeline | Re-run the SQL on raw data you already have |
| Who usually owns the transforms | Data engineers | Analytics engineers |
| Typical era | On-premise warehouses | Cloud warehouses such as Snowflake and BigQuery |

## Why ELT won

Cloud warehouses made storage cheap and compute elastic: you pay for a few seconds of a large machine when you need it. Once that was true, keeping the raw data became the obvious choice, and it brings a big advantage.

Suppose ShopLink's finance team decides in 2027 that returned orders should count as revenue until the refund is processed. In an ETL world, returned orders might have been filtered out before loading, so the history you need is simply not in the warehouse. In an ELT world, every raw order is still there. You change one line of SQL and rebuild. Raw data is your safety net.

ELT also moved transformation into SQL, a language analysts already know. That shift is what created the analytics engineer role you met in Module 1.

## When ETL still makes sense

ELT is the default, not a law. Some transformation still happens before loading:

- **Privacy and regulation.** Under the Nigeria Data Protection Act, a company may choose to mask or drop personal data such as phone numbers before it ever lands in the warehouse.
- **Huge or noisy sources.** Raw clickstream or sensor data may be filtered or summarised first to keep costs sensible.
- **Legacy systems** that were built as ETL and still work.

Many real pipelines are a mix, sometimes written as EtLT: a small "t" (light cleaning, masking) before loading, and the big "T" (business logic) in the warehouse.

## Two load ideas to know

- **Full refresh vs incremental.** A full refresh reloads the whole table every time. An incremental load only adds new or changed rows. ShopLink's batch 1 is a full load; batch 2 in Module 7 is an incremental extract.
- **Idempotent loads.** Running the same load twice should give the same result, not double the data. Your load script in lesson 4 uses `CREATE OR REPLACE TABLE`, so you can re-run it safely.

## Resources

- watch: [What is ETL with a clear example - Data Engineering Concepts](https://www.youtube.com/watch?v=wDTzxdShbd8) · Chandoo · 886K subscribers · 240K views · 7,321 likes · published 2023-04-04 · checked 2026-09-27 · 14 min
- watch: [Lec - 11 : ETL vs ELT in Data Warehouse](https://www.youtube.com/watch?v=KyUaGxWrKkE) · Gate Smashers · 2.86M subscribers · 53.8K views · 849 likes · published 2025-02-06 · checked 2026-09-27 · 6 min
- docs: [Understanding ELT: extract, load, transform](https://docs.getdbt.com/terms/elt) · dbt Labs · The ELT process from the team behind dbt.
- read: [ETL vs ELT](https://www.getdbt.com/blog/etl-vs-elt) · dbt Labs · Where each approach fits, and why ELT suits analytics engineering.
- read: [The difference between ETL and ELT](https://aws.amazon.com/compare/the-difference-between-etl-and-elt/) · AWS · A vendor-neutral comparison table.
- deeper: [Fundamentals of Data Engineering](https://www.oreilly.com/library/view/fundamentals-of-data/9781098108298/) · Joe Reis and Matt Housley, O'Reilly (paid) · Chapters 7 and 8 cover ingestion and transformation patterns in depth.

## Practice

ShopLink wants to add two new sources to its warehouse: payment records from its payment provider (which include customers' phone numbers and bank names), and a Google Sheet where the marketing team tracks monthly campaign spend.

For each source, write down:

1. How you would extract it.
2. Whether you would transform anything before loading, and why.
3. One transformation you would do in the warehouse after loading.

Then explain in two or three sentences why ShopLink should keep raw orders in the warehouse even after building clean tables.

## Example answer

**Payment records**

1. Extract with an ingestion tool (such as Airbyte or Fivetran) that has a connector for the provider's API, or a scheduled Python script, running daily.
2. Yes, a small pre-load step: mask or drop the phone numbers, because analytics does not need them and keeping personal data out of the warehouse reduces privacy risk. Everything else is loaded raw.
3. In the warehouse: match each payment to its order_id and calculate how many days after the order it was paid.

**Marketing spend sheet**

1. Extract with a Google Sheets connector, or export to CSV on a schedule.
2. No. Load it as it is, so the raw sheet is always available to check against.
3. In the warehouse: standardise the month column into a proper date and join spend to monthly revenue to calculate cost per order.

**Why keep raw orders:** definitions change. If finance changes how returns are treated, or you discover a bug in your cleaning logic, you can rebuild every clean table from the raw data you already hold, without asking the app team for a new extract. Raw data also lets you prove where a number came from.

Other reasonable answers: loading the payments fully raw into a restricted schema with tight access controls, instead of masking before load, is also defensible if it is a deliberate decision.

# Lesson: Warehouse architecture and layers

minutes: 50

## Databases, schemas and tables

A warehouse organises objects in three levels, written with dots:

```text
database.schema.table
shoplink.raw.orders
```

- A **database** is the top container. In DuckDB, it is your `shoplink.duckdb` file.
- A **schema** is a folder of tables inside the database. You will use one schema per layer.
- A **table** (or view) holds the data.

## The layers

Module 1 introduced the idea of building in layers. Here is how the layers look inside ShopLink's warehouse:

| Layer | Schema | Job | ShopLink example |
|---|---|---|---|
| Raw | `raw` | An exact copy of the source. Never edited by hand. | `raw.orders`, with status values such as ' Delivered' and 'CANCELLED' |
| Staging | `staging` | One cleaned model per raw table: rename, cast types, trim and lowercase, remove exact duplicates. No business logic. | `stg_orders`, where status is always one of five clean values |
| Intermediate | `intermediate` | Join and reshape staging models into reusable building blocks | `int_order_lines_enriched`: each order line with its order date, customer and product |
| Marts | `marts` | Final business-facing tables that people and BI tools query | `fct_order_lines`, `dim_customer`, `dim_product` |

Three rules keep the layers useful:

1. **Data only flows upwards.** Staging reads from raw, intermediate from staging, marts from intermediate or staging. A mart never reads from raw.
2. **Raw is sacred.** You never update or delete raw data. If it is wrong, you fix it in staging, so you can always compare the fix with the original.
3. **Consumers only touch marts.** Dashboards and analysts read marts, so you can refactor everything underneath without breaking them.

You may also meet the **medallion** naming used by Databricks and others: bronze (raw), silver (cleaned, like staging and intermediate) and gold (business-ready, like marts). It is the same idea with different labels.

## Naming conventions

Consistent names let anyone find their way around. The dbt community convention, which you will use from Module 6:

| Prefix | Layer | Example |
|---|---|---|
| `stg_` | Staging | `stg_orders`, `stg_order_lines` |
| `int_` | Intermediate | `int_order_lines_enriched` |
| `fct_` | Mart: facts (events you measure) | `fct_order_lines` |
| `dim_` | Mart: dimensions (things you describe) | `dim_customer` |

Facts and dimensions are the heart of Module 5.

## Columnar storage

OLTP databases store data **by row**: all the columns of order 100001 sit together on disk, then all the columns of order 100002. That is perfect for "fetch this one order".

Warehouses store data **by column**: all the `order_date` values together, then all the `status` values, and so on.

```text
Row storage                                  Column storage
[100001, 69, 1, 2024-01-01, delivered, ...]  order_id:   100001, 100002, 100003, ...
[100002, 38, 1, 2024-01-01, delivered, ...]  order_date: 2024-01-01, 2024-01-01, ...
[100003, 72, 3, 2024-01-01, delivered, ...]  status:     delivered, delivered, ...
```

For analytics this is a huge win:

- **Read only what you need.** `SELECT sum(quantity) FROM order_lines` reads one column out of six. In a 100-column table, a query using three columns reads about 3% of the data.
- **Better compression.** A column of similar values, such as `status` or `channel`, compresses extremely well, so there is less to read from disk.
- **Faster maths.** The engine can process a whole block of numbers at once.

The practical lesson: in a columnar warehouse, `SELECT *` is expensive because it forces every column to be read. You will see this again in Module 4's optimisation lesson.

## Compute and storage

A warehouse needs two resources: **storage** (disks holding the data) and **compute** (processors running your queries).

Traditional warehouses tied the two together in one machine. If you needed more processing power at month end, you had to buy a bigger machine, including storage you did not need.

Modern cloud warehouses separate them:

- **Snowflake** keeps all data in cheap cloud storage and runs queries on "virtual warehouses", which are clusters of compute you size (X-Small, Small, Medium...) and switch on and off. You pay for storage by the terabyte and for compute by the second. Finance can run a big month-end job on a Large warehouse while analysts use an X-Small one, both reading the same data.
- **DuckDB** takes a different route. It runs **in-process**: there is no server at all. The database is one file on your laptop, and the compute is your laptop's processor.

## Where DuckDB and Snowflake fit

| | DuckDB | Snowflake |
|---|---|---|
| Where it runs | On your laptop, inside the CLI or a Python process | In the cloud, managed for you |
| Cost | Free and open source | Pay per use (30-day free trial in Module 9) |
| Storage | A single `.duckdb` file | Cloud storage managed by Snowflake |
| Users | One person, one process writing at a time | Whole companies, many users at once |
| Scale | Comfortable with gigabytes to tens of gigabytes on a laptop | Terabytes and beyond |
| Best for | Learning, local development, analysis of files | Production warehouses shared by a company |

Both are columnar, both speak SQL, and dbt works with both. That is why this course uses DuckDB for Modules 3 to 8, where you want fast, free, private practice, and moves your project to Snowflake in Module 9, where you learn how production works.

## Resources

- docs: [How we structure our dbt projects](https://docs.getdbt.com/best-practices/how-we-structure/1-guide-overview) · dbt Labs · The staging, intermediate and marts layers you will build in Modules 6 and 7.
- read: [What is a medallion architecture?](https://www.databricks.com/glossary/medallion-architecture) · Databricks · Bronze, silver and gold layers explained.
- read: [What is columnar storage?](https://motherduck.com/learn/columnar-storage-guide/) · MotherDuck · Row versus column storage with diagrams, from the company behind DuckDB's cloud service.
- watch: [Column vs Row Oriented Databases Explained](https://www.youtube.com/watch?v=Vw1fCeD06YI) · Hussein Nasser · 520K subscribers · 89.3K views · 2,589 likes · published 2020-10-30 · checked 2026-09-27 · 34 min
- watch: [What is a Data Warehouse - Explained with real life example | datawarehouse vs database (2020)](https://www.youtube.com/watch?v=jmwGNhUXn_o) · IT k Funde · 543K subscribers · 489K views · 14,201 likes · published 2020-06-15 · checked 2026-09-27 · 10 min
- docs: [Snowflake key concepts and architecture](https://docs.snowflake.com/en/user-guide/intro-key-concepts) · Snowflake · How Snowflake separates storage, compute and cloud services.
- docs: [Why DuckDB](https://duckdb.org/why_duckdb) · DuckDB · What an in-process analytical database is and when to use one.
- deeper: [The Data Warehouse Toolkit](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/books/data-warehouse-dw-toolkit/) · Ralph Kimball and Margy Ross, Wiley (paid) · The classic book on warehouse design. Chapters 1 and 2 set up Module 5.
- deeper: [The Data Warehouse Toolkit, 3rd edition (publisher page)](https://www.wiley-vch.de/en/areas-interest/computing-computer-sciences/the-data-warehouse-toolkit-978-1-118-53080-1) · Wiley · Edition details and formats.

## Practice

Design ShopLink's warehouse on paper. Using the four layers from this lesson:

1. List every table you expect in the `raw` schema.
2. List a staging model for each raw table, and write one cleaning step each will do. Use what you know about ShopLink's data problems from Module 1 and the brief.
3. Propose one intermediate model and two or three mart tables that together would answer the question "Which states and warehouses sell the most?".
4. Explain which layer the Head of Sales's dashboard should read from, and why.

## Example answer

**Raw:** `raw.customers`, `raw.products`, `raw.warehouses`, `raw.orders`, `raw.order_lines`.

**Staging:**

| Model | One cleaning step |
|---|---|
| `stg_customers` | Keep NULL cities as NULL but add a flag, or label them 'Unknown', so they are visible in reports |
| `stg_products` | Make sure `is_active` is a proper boolean and prices are numbers |
| `stg_warehouses` | Cast `opened_date` to a date |
| `stg_orders` | `lower(trim(status))` so every status is one of five clean values |
| `stg_order_lines` | Remove the exact duplicate rows |

**Intermediate:** `int_order_lines_enriched`: one row per order line, with the order date, clean status, warehouse, customer state and net revenue for the line.

**Marts:** `fct_order_lines` (one row per order line, with net revenue), `dim_customer` (one row per customer version, including state), `dim_warehouse` (one row per warehouse).

**Dashboard:** it should read only from the marts. They carry the agreed definitions (such as excluding cancelled and returned orders), and the team can change staging and intermediate models without breaking the dashboard.

Different model names are fine. The important points are that raw is untouched, each staging model maps to exactly one raw table, and the dashboard never reads raw data.

# Lesson: Set up DuckDB and load ShopLink

minutes: 60

## Install the DuckDB CLI

DuckDB's command line interface (CLI) is a single program. Install it for your system.

On **Windows**, in PowerShell:

```bash
winget install DuckDB.cli
```

On **macOS**, with Homebrew, or with the official install script:

```bash
brew install duckdb
# or
curl https://install.duckdb.org | sh
```

On **Linux**:

```bash
curl https://install.duckdb.org | sh
```

Close and reopen your terminal, then check:

```bash
duckdb --version
```

If Windows says `duckdb` is not recognised, open a brand new terminal window so it picks up the updated PATH. On macOS and Linux, the install script prints the folder it installed DuckDB into and the line to add to your shell profile if `duckdb` is not found. The install page on duckdb.org also offers a zip you can download and unpack by hand.

## Put the data in your repo folder

1. Download [shoplink.zip](/datasets/shoplink.zip).
2. Unzip it into a `data` folder inside your `shoplink-analytics` repo. You should end up with these paths:

```text
shoplink-analytics/
  .gitignore
  README.md
  data/
    shoplink/
      README.txt
      customers.csv
      products.csv
      warehouses.csv
      orders.csv
      order_lines.csv
```

Your `.gitignore` from Module 2 already ignores `data/`, so the CSVs will never be committed. Run `git status` to confirm: the data folder should not appear.

## Open your warehouse

From the root of the repo, start DuckDB with a database file name:

```bash
cd shoplink-analytics
duckdb shoplink.duckdb
```

DuckDB creates `shoplink.duckdb` if it does not exist and opens a `D` prompt. That file is your whole warehouse. It is ignored by the `*.duckdb` line in your `.gitignore`.

DuckDB can query a CSV file directly, before you load anything:

```sql
SELECT * FROM read_csv('data/shoplink/orders.csv') LIMIT 5;
```

`read_csv` detects the delimiter, header and column types automatically. Paths are relative to the folder you started DuckDB in, which is why you start it from the repo root. Forward slashes work on Windows too.

Some useful CLI commands (they start with a dot and need no semicolon):

| Command | What it does |
|---|---|
| `.tables` | List tables |
| `.read file.sql` | Run a SQL script |
| `.mode line` | Show each row vertically, handy for wide rows (`.mode duckbox` switches back) |
| `.quit` | Exit |

## Write the load script

Rather than typing load commands by hand, write them in a script. A script can be reviewed, committed and re-run by anyone. Create a folder `load/` in your repo and a file `load/01_load_raw.sql`:

```sql
-- load/01_load_raw.sql
-- Builds the raw layer of the ShopLink warehouse from batch 1.
-- Run from the repo root:  duckdb shoplink.duckdb -f load/01_load_raw.sql
-- Safe to re-run: every table is replaced, never appended to.

CREATE SCHEMA IF NOT EXISTS raw;

CREATE OR REPLACE TABLE raw.customers AS
SELECT * FROM read_csv('data/shoplink/customers.csv', header = true);

CREATE OR REPLACE TABLE raw.products AS
SELECT * FROM read_csv('data/shoplink/products.csv', header = true);

CREATE OR REPLACE TABLE raw.warehouses AS
SELECT * FROM read_csv('data/shoplink/warehouses.csv', header = true);

CREATE OR REPLACE TABLE raw.orders AS
SELECT * FROM read_csv('data/shoplink/orders.csv', header = true);

CREATE OR REPLACE TABLE raw.order_lines AS
SELECT * FROM read_csv('data/shoplink/order_lines.csv', header = true);
```

Notice what the script does **not** do: it does not clean status, remove duplicates or drop bad rows. The raw layer is an exact copy of the source. Cleaning belongs in staging.

Run it, either from inside the CLI:

```sql
.read load/01_load_raw.sql
```

or straight from your terminal, without opening the prompt:

```bash
duckdb shoplink.duckdb -f load/01_load_raw.sql
```

Only one program can have a DuckDB file open for writing at a time. If you get a lock error, close any other DuckDB window (or a database tool such as DBeaver) that has `shoplink.duckdb` open.

## Check what you loaded

First, check the types DuckDB inferred:

```sql
DESCRIBE raw.orders;
```

```text
column_name   column_type
order_id      BIGINT
customer_id   BIGINT
warehouse_id  BIGINT
order_date    DATE
status        VARCHAR
channel       VARCHAR
updated_at    TIMESTAMP
```

Dates, timestamps, whole numbers and `is_active` (BOOLEAN) are all detected correctly. If detection ever guesses wrong, you can pass `types = {'column': 'TYPE'}` to `read_csv`, or `all_varchar = true` to load everything as text and cast it in staging.

Next, compare row counts with the dataset's README.txt:

```sql
SELECT 'customers' AS table_name, count(*) AS row_count FROM raw.customers
UNION ALL SELECT 'products', count(*) FROM raw.products
UNION ALL SELECT 'warehouses', count(*) FROM raw.warehouses
UNION ALL SELECT 'orders', count(*) FROM raw.orders
UNION ALL SELECT 'order_lines', count(*) FROM raw.order_lines;
```

| table_name | row_count |
|---|---|
| customers | 400 |
| products | 120 |
| warehouses | 5 |
| orders | 9091 |
| order_lines | 26779 |

If any number differs, the load is wrong (for example a file was not fully unzipped). Stop and fix it before going further. Checking row counts after every load is a habit you will keep for the rest of your career.

## Profile the data

Profiling means asking the data simple questions to learn its shape and spot problems before you build on it. DuckDB has a shortcut that profiles every column at once:

```sql
SUMMARIZE raw.customers;
```

It returns, for each column, the minimum, maximum, approximate number of distinct values, and `null_percentage`. For customers, `city` shows 3.00% nulls. Now dig into each area with targeted queries.

**What status values exist?** Wrapping the value in brackets makes stray spaces visible:

```sql
SELECT '[' || status || ']' AS status_with_edges, count(*) AS orders
FROM raw.orders
GROUP BY status
ORDER BY orders DESC;
```

```text
status_with_edges  orders
[delivered]        7597
[cancelled]         530
[returned]          271
[Delivered]         260
[DELIVERED]         127
[shipped]            86
[ delivered]         66
[delivered ]         56
[pending]            36
[Cancelled]          22
...                (24 rows in total)
```

There should be five statuses, but there are 24 spellings. Any query that filters `WHERE status = 'cancelled'` misses 32 cancelled orders.

**How many customers have no city?**

```sql
SELECT
    count(*) AS customers,
    count(city) AS customers_with_city,
    count(*) - count(city) AS customers_missing_city
FROM raw.customers;
```

`count(*)` counts rows; `count(city)` counts only non-NULL values. The difference is 12.

**Are there duplicate order lines?**

```sql
SELECT *, count(*) AS copies
FROM raw.order_lines
GROUP BY ALL
HAVING count(*) > 1
ORDER BY order_line_id;
```

`GROUP BY ALL` is a DuckDB shortcut that groups by every column that is not aggregated. Six rows come back, each with `copies = 2`: six order lines appear twice, identical in every column, including order_line_id 6789 and 15113.

**Do all orders have a real customer?**

```sql
SELECT o.order_id, o.customer_id, o.order_date
FROM raw.orders AS o
LEFT JOIN raw.customers AS c
    ON o.customer_id = c.customer_id
WHERE c.customer_id IS NULL;
```

Three orders point to customer IDs 9001, 9002 and 9003, which do not exist. These are orphans. An INNER JOIN to customers would silently drop them.

**Are quantities sensible?**

```sql
SELECT * FROM raw.order_lines WHERE quantity <= 0;
```

Two lines: one with quantity 0 and one with quantity -2.

**Are inactive products still being sold?**

```sql
SELECT p.product_id, p.product_name, max(o.order_date) AS last_ordered, count(*) AS lines
FROM raw.order_lines AS ol
JOIN raw.orders AS o ON ol.order_id = o.order_id
JOIN raw.products AS p ON ol.product_id = p.product_id
WHERE p.is_active = false
  AND o.order_date >= DATE '2026-03-01'
GROUP BY p.product_id, p.product_name
ORDER BY last_ordered DESC;
```

Ten products are marked inactive, yet seven of them appear on 11 order lines since March 2026. Either the flag is out of date or orders are being taken for discontinued stock: a question for the business, not something to "fix" silently.

You do not fix any of these problems now. You record them, so that staging (Module 6) and your data quality checks (Modules 7 and 8) can handle each one deliberately.

## Commit the load script

Do this on a branch, the way you learned in Module 2:

```bash
git switch main
git pull
git switch -c feature/load-raw-data
git add load/01_load_raw.sql
git status
git commit -m "Add DuckDB load script for ShopLink raw tables"
git push -u origin feature/load-raw-data
```

`git status` should list only the SQL file. If `shoplink.duckdb` or anything in `data/` shows up, fix your `.gitignore` before committing.

## Resources

- docs: [DuckDB installation](https://duckdb.org/install/) · DuckDB · Install commands and downloads for every operating system.
- docs: [DuckDB CLI overview](https://duckdb.org/docs/stable/clients/cli/overview) · DuckDB · Starting the CLI, opening a database file and running scripts.
- docs: [Dot commands](https://duckdb.org/docs/stable/clients/cli/dot_commands) · DuckDB · Every `.command` the CLI understands.
- docs: [Reading CSV files](https://duckdb.org/docs/stable/data/csv/overview) · DuckDB · `read_csv` and all its options, including `types` and `all_varchar`.
- docs: [CSV auto detection](https://duckdb.org/docs/stable/data/csv/auto_detection) · DuckDB · How DuckDB guesses delimiters, headers and types, and how to override it.
- docs: [SUMMARIZE](https://duckdb.org/docs/stable/guides/meta/summarize) · DuckDB · One-command profiling of every column in a table.
- watch: [DuckDB in 100 Seconds](https://www.youtube.com/watch?v=uHm6FEb2Re4) · Fireship · 4.28M subscribers · 529K views · 29,755 likes · published 2025-08-14 · checked 2026-09-27 · 2 min

## Practice

1. Install DuckDB, unzip the dataset into `data/shoplink/`, and create `load/01_load_raw.sql` as shown.
2. Run the script and confirm the five row counts match README.txt.
3. Run the script a second time and check the row counts again. What do you notice, and why does it matter?
4. Run every profiling query in this lesson and record the result of each in a short list.
5. Write one extra profiling query of your own. For example: which channels exist and how many orders came through each, or the earliest and latest order_date.
6. Commit the load script on a branch and push it.

## Example answer

**Step 3:** the row counts are identical after the second run (orders is still 9,091, not 18,182), because `CREATE OR REPLACE TABLE` rebuilds each table from scratch. The load is idempotent, so anyone can re-run it without fear of doubling the data.

**Step 4 findings:**

- Row counts match: customers 400, products 120, warehouses 5, orders 9,091, order_lines 26,779.
- `status` has 24 distinct spellings; `lower(trim(status))` reduces them to 5.
- 12 customers have a NULL city. No other customer column has nulls.
- 6 order lines are exact duplicates, so there are 26,773 distinct order_line_id values.
- 3 orphan orders: order_id 105936, 107041 and 107057, with customer_id 9002, 9001 and 9003.
- 2 order lines have quantity 0 or less (order_line_id 3540 and 21582).
- 10 inactive products; 7 of them appear on 11 order lines since 2026-03-01 (for example product 13, Lenovo ThinkPad T14, ordered on 2026-06-20).

**Step 5, one possible extra query:**

```sql
SELECT channel, count(*) AS orders
FROM raw.orders
GROUP BY channel
ORDER BY orders DESC;
```

```text
channel    orders
web        4125
whatsapp   3106
sales_rep  1860
```

Channel values are clean, unlike status. Other good extra checks: `SELECT min(order_date), max(order_date) FROM raw.orders` (2024-01-01 to 2026-06-30), or counting distinct discount_pct values (0, 5, 10 and 15).

# Quiz

passing_score: 70

### Which workload is OLAP?

- [ ] The app saving a new order when a reseller clicks "Place order"
- [ ] Updating one order's status to shipped
- [x] Summing net revenue per state for every order since 2024
- [ ] Looking up a customer's email to send a receipt

> OLAP queries scan and aggregate many rows to answer analytical questions. The other three touch single records inside the running app, which is OLTP.

### What is the key difference between ETL and ELT?

- [ ] ELT does not extract data from sources
- [x] In ELT, raw data is loaded into the warehouse first and transformed there, usually with SQL
- [ ] ETL can only load CSV files
- [ ] ELT transforms data on a separate server before loading

> ELT swaps the order of load and transform. Keeping raw data in the warehouse means you can rebuild clean tables whenever a definition changes.

### In ShopLink's warehouse, where should the status column be cleaned with lower(trim(status))?

- [ ] In the raw layer, by updating raw.orders
- [x] In the staging layer, in the model built from raw.orders
- [ ] In every dashboard that uses status
- [ ] Nowhere; analysts should remember the spellings

> Raw data is never edited, so the original is always available to compare against. Staging applies light cleaning once, and every model above it benefits.

### Why is `SELECT *` especially wasteful in a columnar warehouse?

- [ ] Columnar warehouses cannot return more than ten columns
- [ ] It returns rows in random order
- [x] Columnar storage lets the engine read only the columns a query uses, and `SELECT *` forces it to read all of them
- [ ] It locks the table for other users

> Columnar engines store each column separately. A query that names three columns reads only those three, while `SELECT *` reads every column from disk.

### After running the load script twice, raw.orders still has 9,091 rows. Why?

- [ ] DuckDB ignores the second run
- [ ] The CSV file was deleted after the first run
- [x] `CREATE OR REPLACE TABLE` rebuilds each table from scratch, so the load is idempotent
- [ ] DuckDB removes duplicates automatically

> An idempotent load gives the same result however many times you run it. Appending with INSERT instead would have doubled the rows.

# Project: Load and profile ShopLink's raw data

max_score: 100

## Brief

ShopLink's leadership has agreed to fund a proper warehouse. Your first job is to load the raw data reliably and report what you found in it, before anyone builds reports on top. Your work must be reproducible: a teammate should be able to clone your repo, download the dataset, run one command and get the same warehouse.

## Deliverables

All of this goes on a feature branch in your `shoplink-analytics` repo, merged to `main` through a pull request.

1. **`load/01_load_raw.sql`**: a script that creates the `raw` schema and builds `raw.customers`, `raw.products`, `raw.warehouses`, `raw.orders` and `raw.order_lines` from the batch 1 CSVs. It must be safe to re-run and must not clean or change the data.
2. **`load/profiling.sql`**: the profiling queries you ran, each with a comment saying what it checks.
3. **`docs/profiling_report.md`**: a short data profiling report (one to two pages) containing:
   - row counts for all five tables, and a statement that they match the dataset README;
   - null counts for the key columns of each table (at least customer_id, city and state in customers; order_id, customer_id and status in orders; order_id, product_id and quantity in order_lines);
   - every distinct raw status value with its count, and what the clean values should be;
   - the duplicates, orphans, invalid quantities and inactive-product sales you found, with counts and example IDs;
   - for each problem, one sentence on how you propose to handle it in later layers.
4. **README update**: a "How to build the warehouse" section explaining where to put the data and the one command to run the load.

## How to submit

Open a pull request from your branch into `main` with a description that includes your row count table. Merge it after reviewing it yourself (or after a peer review). Paste the link to the pull request into the submission form, and in the note mention anything in the data that surprised you.

## Grading guide

| Criterion | Points |
|---|---|
| Load script builds all five raw tables, runs cleanly and is idempotent | 25 |
| Raw data is loaded unchanged; no data or database files are committed | 10 |
| Profiling report has correct row counts, null counts and status values | 20 |
| All planted problems are found, with counts and example IDs | 25 |
| Sensible proposed handling for each problem, in the right layer | 10 |
| README explains how to rebuild the warehouse; PR description is clear | 10 |
