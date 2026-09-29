---
module: 5
title: Data Warehousing & Lakes
optional: false
summary: Learn where analytical data lives and how it is shaped. You compare OLTP and OLAP systems, model ShopLink's sales as a star schema with surrogate keys and an SCD Type 2 customer dimension in the PostgreSQL warehouse, then add RustFS object storage to your Compose stack and build the lake side of the platform: Parquet files in Hive-style partitions, columnar storage and compression, and finally Delta Lake tables with ACID commits, MERGE and time travel, plus the catalogs that make lake tables discoverable.
---

# Lesson: OLTP vs OLAP

minutes: 40

## Two very different jobs

In Module 4 you built ShopLink's app database. Every time a rep logs a WhatsApp order, the app does something small and urgent: insert one row into `app.orders`, three or four into `app.order_lines`, confirm in a fraction of a second. When the order ships, it updates that one row's status. Thousands of these tiny reads and writes happen every day, and none may be lost.

On Monday the Head of Sales asks: "What was our net revenue each month for the last two years, by state?" Answering means reading every order line ShopLink has ever recorded, joining to orders and customers, and adding it all up. Nothing is written; millions of values are read.

These two workloads have names:

- **OLTP** (online transaction processing): many small, fast reads and writes of individual records. This is what application databases do.
- **OLAP** (online analytical processing): fewer, much larger queries that scan and aggregate many rows. This is what warehouses and lakes are for.

| | OLTP (`shoplink_app`) | OLAP (`warehouse`, the lake) |
|---|---|---|
| Main job | Run the business: take orders | Understand the business: report, analyse |
| Typical query | Fetch or update one order by key | Sum revenue across every order since 2024 |
| Rows per query | A handful | Thousands to billions |
| Design | Normalised: narrow tables, each fact stored once | Denormalised: wide tables shaped for reading (stars) |
| Storage layout | Row-oriented | Column-oriented |
| History | Current state; old values overwritten | History kept, loaded on a schedule |
| Indexes | B-trees on keys (Module 4) | Few indexes; partitions and column statistics instead |
| Examples | PostgreSQL, MySQL, SQL Server | Snowflake, BigQuery, Redshift, Databricks, Parquet on S3 with Spark or Athena |

## Why a data engineer cares

It is tempting to point a dashboard straight at the app database. It causes four problems, and data engineers are the people who fix them:

1. **It slows the business down.** A month-end report that scans every order competes with resellers placing orders.
2. **History is overwritten.** When customer 31 moved from Port Harcourt to Sango Ota in July, the app overwrote the city. Last year's "revenue by state" report would silently change. A warehouse can keep both versions (you build that in the next lesson).
3. **Data lives in many systems.** The supplier's price file and the orders API are not in the app database. The analytical side brings sources together.
4. **The design fights you.** A normalised schema is right for safe writes, but simple business questions need many joins and repeat the same cleaning logic every time.

So the standard pattern, and the one this track builds: the app database stays OLTP, pipelines copy its data out on a schedule, and all analysis happens on the analytical side.

## A note on this course's warehouse

Your `warehouse` database is PostgreSQL, a row store built for OLTP. That is a deliberate teaching choice: it is free, it runs in your Compose stack, and the SQL you write (schemas, stars, SCD Type 2) carries straight over to Snowflake, BigQuery or Redshift. Be honest about its limits: at ShopLink's size (tens of thousands of rows) PostgreSQL answers analytical queries instantly, but at hundreds of millions of rows a columnar engine wins by a wide margin. That is why the second half of this module builds the **lake** side, where data is stored in the columnar Parquet format and processed by engines such as Spark (Module 8) and Athena (Module 9).

## Row storage and column storage

A row store keeps all the columns of order 100001 together on disk, then order 100002, and so on: perfect for "fetch this one order". A column store keeps all the `order_date` values together, then all the `status` values:

```text
Row storage                                  Column storage
[100001, 69, 1, 2024-01-01, delivered, ...]  order_id:   100001, 100002, 100003, ...
[100002, 38, 1, 2024-01-01, delivered, ...]  order_date: 2024-01-01, 2024-01-01, ...
[100003, 72, 3, 2024-01-01, delivered, ...]  status:     delivered, delivered, ...
```

For analytics, columns win three ways: a query reads only the columns it names; a column of similar values (status, channel) compresses extremely well; and the engine can process a block of numbers at once. The practical rule: on a columnar engine `SELECT *` is expensive, because it forces every column to be read.

## Resources

- read: [The difference between OLAP and OLTP](https://aws.amazon.com/compare/the-difference-between-olap-and-oltp/) · AWS · A clear comparison table with examples of each.
- watch: [Explain By Example: OLTP vs OLAP](https://www.youtube.com/watch?v=aRT8E0nD_LE) · Explain By Example · 2.05K subscribers · 77.5K views · 2,270 likes · published 2021-10-02 · checked 2026-09-27 · 8 min
- watch: [Column vs Row Oriented Databases Explained](https://www.youtube.com/watch?v=Vw1fCeD06YI) · Hussein Nasser · 520K subscribers · 89.3K views · 2,588 likes · published 2020-10-30 · checked 2026-09-27 · 34 min
- deeper: [Fundamentals of Data Engineering](https://www.oreilly.com/library/view/fundamentals-of-data/9781098108298/) · Joe Reis and Matt Housley, O'Reilly (paid) · Chapter 6 on storage covers row and columnar layouts, warehouses and lakes.

## Practice

Classify each ShopLink workload as OLTP or OLAP, with a one-line reason:

1. A reseller in Onitsha checks the status of yesterday's order.
2. Finance totals discounts given per quarter since 2024.
3. A rep adds a new school as a customer.
4. Operations compares average order size across the five warehouses.
5. The app checks a product is active before confirming an order.
6. Marketing asks which customer type grew fastest this year.

Then answer: in Module 4 you added an index on `order_lines.order_id`. Would the same index speed up "total net revenue per month since 2024"? Why or why not?

## Example answer

1. **OLTP**: one order, looked up by key.
2. **OLAP**: scans and aggregates every order line for two and a half years.
3. **OLTP**: a single insert that must succeed immediately.
4. **OLAP**: aggregates across every order, grouped by warehouse.
5. **OLTP**: a fast lookup of one product row inside a live transaction.
6. **OLAP**: groups all customers and orders by type and period.

The index would not help. The monthly revenue query reads every order line, and Module 4 showed that PostgreSQL chooses a sequential scan when a query needs most of a table: jumping through an index would be slower. Analytical queries get faster by reading fewer columns (columnar storage) and fewer partitions, not by B-tree lookups. Any answer that says "it reads everything, so the index is not used" is correct.

# Lesson: Dimensional modelling essentials

minutes: 60

## Facts, dimensions and grain

Dimensional modelling, set out by Ralph Kimball in the 1990s, is still how most analytical data is shaped. A dimensional model has two kinds of table:

| Table | Holds | ShopLink example |
|---|---|---|
| Fact | Measurements of a business event, mostly numbers you add up | One row per order line: quantity, gross amount, net revenue |
| Dimension | The context of the event: who, what, where, when; the things you group and filter by | Customer, product, warehouse, date |

Design always starts with the **grain**: one plain sentence saying what one fact row is.

> One row in `marts.fct_order_lines` represents one product on one ShopLink order.

The grain decides everything else. A delivery fee belongs to the whole order, so it cannot sit on each line (a three-line order would count it three times). Duplicate lines break the grain, so they must be removed. Choose the lowest grain the source supports: you can always add order lines up to orders or months, but never split a monthly total back into products.

Facts come in three kinds. **Additive** facts (quantity, net amount) can be summed across every dimension. **Semi-additive** facts (stock on hand) can be summed across warehouses but not across days. **Non-additive** facts (unit price, discount percentage) cannot be summed at all, so you store additive parts, such as `gross_amount` and `net_amount`, and compute ratios at query time.

## The star schema

A **star schema** puts the fact in the middle and joins each dimension to it directly:

```text
                 dim_date
                     |
  dim_customer --- fct_order_lines --- dim_product
                     |
               dim_warehouse
```

Every question follows one pattern: join the fact to the dimensions you need, filter, group, sum. No status cleaning, no deduplication, no revenue formula in the query: all of that is done once, when the tables are built. Dimensions are kept **flat** (category and brand sit in `dim_product` rather than in their own tables, which would be a "snowflake" schema), because repeating "Laptops" on 59 rows costs nothing and saves every analyst a join. `order_id` sits on the fact with no table behind it: a **degenerate dimension**, useful for counting orders.

## Surrogate keys and the unknown member

The fact does not store `customer_id`. It stores a **surrogate key** that the warehouse generates, because natural keys cause trouble: with history, customer 31 has two rows, so `customer_id` is no longer unique; two source systems can both have a customer 358; and an orphan has no row to join to.

Modern ELT pipelines use a **hash** of the natural key, such as `md5(customer_id::text || '|' || valid_from::text)`. It comes out the same on every rebuild and every machine, so the fact can compute the key itself. The `'|'` separator stops `(1, 23)` and `(12, 3)` hashing the same.

Every dimension also gets an **unknown member**, one row with key `md5('unknown')`, and the fact uses `coalesce(key, md5('unknown'))`. Module 4's app database rejected the three orphan orders, so today no fact row points at it. The orders API in Module 6 still serves those orphans, and tomorrow's data might have new ones: with an unknown member, revenue totals stay correct, no key is ever NULL, and the problem is visible as "Unknown customer" in reports instead of silently vanishing in an inner join.

## SCD Type 2 for customers

Dimensions change. Module 4 showed the options: Type 1 overwrites, Type 2 adds a version with `valid_from`, `valid_to` and `is_current`. ShopLink's leadership reports revenue by state and by customer type, so those columns are Type 2; a name correction is Type 1.

In Module 4 you maintained history with an `UPDATE` and an `INSERT` each time a batch arrived. Here is the other common approach, and the one ELT teams prefer: **rebuild the dimension from snapshots**. If the raw layer keeps a full copy of the customers table for every load date, the versions can be derived with window functions, and the whole dimension can be dropped and rebuilt identically at any time.

## Get the data into the warehouse

The star lives in `warehouse.marts`, but the data is in `shoplink_app`. PostgreSQL cannot join across databases, so the data has to be copied. Module 6 builds the real pipeline; for now, a short Python script copies a full snapshot of the five app tables into `warehouse.raw`, tagged with a `_load_date`. Save it as `pipelines/copy_app_tables.py`:

```python
"""Copy a full snapshot of ShopLink's app tables into warehouse.raw, tagged with a load date.

Run from the repo root:  python -m pipelines.copy_app_tables --load-date 2026-06-30
Safe to rerun: a rerun replaces that load date's rows, it never adds a second copy.
"""
import argparse
import os
from datetime import date

import psycopg
from dotenv import load_dotenv

TABLES = ["customers", "products", "warehouses", "orders", "order_lines"]


def copy_snapshot(load_date: str) -> dict[str, int]:
    load_date = date.fromisoformat(load_date).isoformat()  # fails loudly on a bad date
    load_dotenv()
    counts = {}
    with psycopg.connect(os.environ["SHOPLINK_APP_DB_URL"]) as src, \
         psycopg.connect(os.environ["SHOPLINK_WAREHOUSE_DB_URL"]) as dst:
        dst.execute("CREATE SCHEMA IF NOT EXISTS raw")
        for table in TABLES:
            target = f"raw.app_{table}"
            # Same columns and types as the app table, plus the load date.
            # No keys or constraints: raw keeps exactly what arrived.
            columns = src.execute(
                "SELECT column_name, data_type FROM information_schema.columns "
                "WHERE table_schema = 'app' AND table_name = %s ORDER BY ordinal_position",
                [table],
            ).fetchall()
            col_defs = ", ".join(f"{name} {dtype}" for name, dtype in columns)
            col_list = ", ".join(name for name, _ in columns)
            dst.execute(f"CREATE TABLE IF NOT EXISTS {target} ({col_defs}, _load_date date NOT NULL)")
            dst.execute(f"DELETE FROM {target} WHERE _load_date = %s", [load_date])
            # Stream rows straight from one database to the other with COPY.
            # The date was checked by date.fromisoformat, so it is safe to put in the SQL text.
            select = f"SELECT {col_list}, date '{load_date}' FROM app.{table}"
            with src.cursor().copy(f"COPY ({select}) TO STDOUT") as out, \
                 dst.cursor().copy(f"COPY {target} ({col_list}, _load_date) FROM STDIN") as into:
                for chunk in out:
                    into.write(chunk)
            counts[table] = dst.execute(
                f"SELECT count(*) FROM {target} WHERE _load_date = %s", [load_date]).fetchone()[0]
        # Leaving the with-block commits the warehouse transaction: all five tables or none.
    return counts


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--load-date", required=True, help="YYYY-MM-DD")
    args = parser.parse_args()
    for table, rows in copy_snapshot(args.load_date).items():
        print(f"raw.app_{table}: {rows} rows for {args.load_date}")
```

It reads the two connection strings you already have in `.env` from Module 3, `SHOPLINK_APP_DB_URL` and `SHOPLINK_WAREHOUSE_DB_URL`, with python-dotenv. The new tables are called `raw.app_*` so they do not collide with the demo tables Module 3 loaded from CSVs (`raw.customers`, `raw.products`, `raw.order_lines`); you can drop those demo tables now if you like, since nothing later depends on them.

Now **replay time**, so the warehouse sees two snapshots of the app, one from 30 June and one from 31 July. Your Module 4 scripts (the load from lesson 1 and `apply_batch2.sh` from the project) make this easy, because both are safe to rerun:

```bash
bash sql/load/load_app.sh                                  # the app as it was on 30 June (batch 1)
python -m pipelines.copy_app_tables --load-date 2026-06-30
bash sql/load/apply_batch2.sh                              # the app moves forward to 31 July
python -m pipelines.copy_app_tables --load-date 2026-07-31
```

The copies report 400 customers and 9,088 orders for 30 June, then 430 customers, 9,521 orders and 27,995 order lines for 31 July. Rerun either copy and the counts do not change: the `DELETE` for that load date runs first, in the same transaction.

## Build the star in SQL

Save this as `sql/transforms/marts.sql`. It rebuilds all five tables from `raw` in one transaction:

```sql
-- sql/transforms/marts.sql
-- ShopLink sales star schema in warehouse.marts, rebuilt from warehouse.raw on every run.
-- Grain of the fact: one row per product on one ShopLink order (one order line).

BEGIN;

CREATE SCHEMA IF NOT EXISTS marts;
DROP TABLE IF EXISTS marts.fct_order_lines;   -- first, because it references the dimensions

-- dim_date: one row per day, 2024 to 2026 ------------------------------------------
DROP TABLE IF EXISTS marts.dim_date;
CREATE TABLE marts.dim_date AS
SELECT
    to_char(d, 'YYYYMMDD')::integer      AS date_key,
    d::date                              AS full_date,
    extract(year FROM d)::integer        AS year,
    extract(quarter FROM d)::integer     AS quarter,
    extract(month FROM d)::integer       AS month,
    to_char(d, 'FMMonth')                AS month_name,
    to_char(d, 'YYYY-MM')                AS year_month,
    extract(isodow FROM d)::integer      AS day_of_week,     -- 1 = Monday, 7 = Sunday
    extract(isodow FROM d) IN (6, 7)     AS is_weekend
FROM generate_series(date '2024-01-01', date '2026-12-31', interval '1 day') AS t (d);
ALTER TABLE marts.dim_date ADD PRIMARY KEY (date_key);

-- dim_customer: SCD Type 2, built from every snapshot in raw.app_customers ------------
DROP TABLE IF EXISTS marts.dim_customer;
CREATE TABLE marts.dim_customer AS
WITH snapshots AS (
    SELECT customer_id, customer_name, customer_type, city, state, updated_at, _load_date,
           md5(row(customer_type, city, state)::text) AS row_hash
    FROM raw.app_customers
),
changes AS (
    -- keep a snapshot row only when the tracked columns differ from the previous snapshot
    SELECT *, lag(row_hash) OVER (PARTITION BY customer_id ORDER BY _load_date) AS previous_hash
    FROM snapshots
),
versions AS (
    SELECT customer_id, customer_name, customer_type, city, state,
           CASE WHEN previous_hash IS NULL THEN timestamp '1900-01-01' ELSE updated_at END AS valid_from
    FROM changes
    WHERE previous_hash IS NULL OR previous_hash <> row_hash
)
SELECT
    md5(customer_id::text || '|' || valid_from::text)                        AS customer_key,
    customer_id,
    customer_name,
    customer_type,
    coalesce(city, 'Unknown')                                                AS city,
    state,
    valid_from,
    coalesce(lead(valid_from) OVER w, timestamp '9999-12-31')                AS valid_to,
    lead(valid_from) OVER w IS NULL                                          AS is_current
FROM versions
WINDOW w AS (PARTITION BY customer_id ORDER BY valid_from)
UNION ALL
SELECT md5('unknown'), NULL, 'Unknown customer', 'unknown', 'Unknown', 'Unknown',
       timestamp '1900-01-01', timestamp '9999-12-31', true;
ALTER TABLE marts.dim_customer ADD PRIMARY KEY (customer_key);

-- dim_product and dim_warehouse: Type 1, from the latest snapshot ---------------------
DROP TABLE IF EXISTS marts.dim_product;
CREATE TABLE marts.dim_product AS
SELECT md5(product_id::text) AS product_key, product_id, product_name, category, brand,
       unit_cost, list_price, is_active
FROM raw.app_products
WHERE _load_date = (SELECT max(_load_date) FROM raw.app_products)
UNION ALL
SELECT md5('unknown'), NULL, 'Unknown product', 'Unknown', 'Unknown', NULL, NULL, NULL;
ALTER TABLE marts.dim_product ADD PRIMARY KEY (product_key);

DROP TABLE IF EXISTS marts.dim_warehouse;
CREATE TABLE marts.dim_warehouse AS
SELECT md5(warehouse_id::text) AS warehouse_key, warehouse_id, warehouse_name, city, state, opened_date
FROM raw.app_warehouses
WHERE _load_date = (SELECT max(_load_date) FROM raw.app_warehouses)
UNION ALL
SELECT md5('unknown'), NULL, 'Unknown warehouse', 'Unknown', 'Unknown', NULL;
ALTER TABLE marts.dim_warehouse ADD PRIMARY KEY (warehouse_key);

-- fct_order_lines ----------------------------------------------------------------------
CREATE TABLE marts.fct_order_lines AS
WITH orders AS (
    SELECT order_id, customer_id, warehouse_id, order_date, channel,
           lower(btrim(status)) AS order_status
    FROM raw.app_orders
    WHERE _load_date = (SELECT max(_load_date) FROM raw.app_orders)
),
lines AS (
    SELECT DISTINCT ON (order_line_id) *
    FROM raw.app_order_lines
    WHERE _load_date = (SELECT max(_load_date) FROM raw.app_order_lines)
      AND quantity > 0                                  -- 2 invalid lines excluded
    ORDER BY order_line_id
)
SELECT
    l.order_line_id,
    l.order_id,                                                         -- degenerate dimension
    to_char(o.order_date, 'YYYYMMDD')::integer                          AS date_key,
    coalesce(c.customer_key, md5('unknown'))                            AS customer_key,
    coalesce(p.product_key, md5('unknown'))                             AS product_key,
    coalesce(w.warehouse_key, md5('unknown'))                           AS warehouse_key,
    o.order_status,
    o.channel,
    l.quantity,
    l.unit_price,
    l.discount_pct,
    l.quantity * l.unit_price                                           AS gross_amount,
    l.quantity * l.unit_price * (1 - l.discount_pct / 100.0)            AS net_amount,
    CASE WHEN o.order_status IN ('cancelled', 'returned') THEN 0
         ELSE l.quantity * l.unit_price * (1 - l.discount_pct / 100.0) END AS net_revenue
FROM lines AS l
JOIN orders AS o ON o.order_id = l.order_id
LEFT JOIN marts.dim_customer AS c
       ON c.customer_id = o.customer_id
      AND o.order_date >= c.valid_from AND o.order_date < c.valid_to     -- point-in-time join
LEFT JOIN marts.dim_product AS p ON p.product_id = l.product_id
LEFT JOIN marts.dim_warehouse AS w ON w.warehouse_id = o.warehouse_id;
ALTER TABLE marts.fct_order_lines ADD PRIMARY KEY (order_line_id);
ALTER TABLE marts.fct_order_lines
    ADD FOREIGN KEY (date_key) REFERENCES marts.dim_date (date_key),
    ADD FOREIGN KEY (customer_key) REFERENCES marts.dim_customer (customer_key),
    ADD FOREIGN KEY (product_key) REFERENCES marts.dim_product (product_key),
    ADD FOREIGN KEY (warehouse_key) REFERENCES marts.dim_warehouse (warehouse_key);

COMMIT;
```

How the SCD Type 2 part works: `lag(row_hash)` compares each customer's snapshot with their previous one; only the first snapshot and the snapshots where something tracked changed survive as versions. `lead(valid_from)` then closes each version exactly where the next one starts. A customer's first version is valid from `1900-01-01`, so old orders always find a match; later versions start at the `updated_at` of the change.

The primary and foreign keys at the end are not decoration. Adding them is the test: if the fact had a duplicate order line or a key with no dimension row, the `ALTER TABLE` would fail and the whole rebuild would roll back, leaving the previous good version in place.

Run it:

```bash
docker compose exec -T postgres psql -U shoplink -d warehouse -v ON_ERROR_STOP=1 < sql/transforms/marts.sql
```

## Check the star

```sql
SELECT count(*) AS versions, count(*) FILTER (WHERE is_current) AS current FROM marts.dim_customer;
-- 451 versions, 431 current: 400 + 20 changes + 30 new customers, plus the unknown member

SELECT count(*) AS fact_rows, round(sum(net_revenue)) AS net_revenue FROM marts.fct_order_lines;
-- 27,993 rows (27,995 lines less the 2 with quantity 0 or less), about ₦392.2 billion

SELECT d.year, round(sum(f.net_revenue) / 1e9, 1) AS net_revenue_bn
FROM marts.fct_order_lines AS f
JOIN marts.dim_date AS d ON d.date_key = f.date_key
GROUP BY d.year ORDER BY d.year;
-- 2024: 108.0, 2025: 165.3, 2026: 118.9 (January to July)
```

And the point of Type 2, customer 31, who moved in July:

```sql
SELECT c.city, c.state, round(sum(f.net_revenue)) AS net_revenue
FROM marts.fct_order_lines AS f
JOIN marts.dim_customer AS c ON c.customer_key = f.customer_key
WHERE c.customer_id = 31
GROUP BY c.city, c.state;
```

```text
     city      | state  | net_revenue
---------------+--------+-------------
 Port Harcourt | Rivers |  6596345650
 Sango Ota     | Ogun   |   423166700
```

Orders before the move stay in Rivers; July's orders count in Ogun. A Type 1 dimension would have moved all ₦7 billion to Ogun, and last year's state report would have changed.

## Resources

- docs: [Four-Step Dimensional Design Process](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/four-4-step-design-process/) · Kimball Group · Business process, grain, dimensions, facts, in that order.
- docs: [Dimensional Modeling Techniques](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/) · Kimball Group · The index of every technique: grain, surrogate keys, SCD types, degenerate dimensions.
- docs: [Dimension Surrogate Keys](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/dimension-surrogate-key/) · Kimball Group · Why dimensions need keys the warehouse controls.
- docs: [Type 2: Add New Row](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/type-2/) · Kimball Group · The standard way to keep full history.
- watch: [Data Modeling Tutorial: Star Schema (aka Kimball Approach)](https://www.youtube.com/watch?v=gRE3E7VUzRU) · Kahan Data Solutions · 60.2K subscribers · 220.2K views · 3,671 likes · published 2023-01-11 · checked 2026-09-27 · 17 min
- watch: [Understand Slowly Changing Dimensions](https://www.youtube.com/watch?v=Sg2AAk1vwEs) · Bryan Cafferky · 49.2K subscribers · 31K views · 977 likes · published 2020-10-06 · checked 2026-09-27 · 23 min
- deeper: [The Data Warehouse Toolkit, 3rd Edition](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/books/data-warehouse-dw-toolkit/) · Ralph Kimball and Margy Ross, Wiley (paid) · The standard book on dimensional modelling. Chapters 1 to 3 and 5 cover this lesson in depth.

## Practice

1. Create `pipelines/copy_app_tables.py` and `sql/transforms/marts.sql`, replay the two snapshots as shown, build the star and run the check queries.
2. Run `marts.sql` a second time. Do the counts change? Why is it safe?
3. Write a query for "net revenue by customer type in 2025" against the star. Which customer type brings in the most?
4. Explain in two sentences why the fact table stores `gross_amount` and `net_amount` and not a `discount_rate` column you could sum.

## Example answer

**2.** The counts are identical. The script drops and recreates every table inside one transaction, so a rerun produces exactly the same star from the same raw data, and a failure halfway leaves the previous version untouched.

**3.**

```sql
SELECT c.customer_type, round(sum(f.net_revenue) / 1e9, 1) AS net_revenue_bn
FROM marts.fct_order_lines AS f
JOIN marts.dim_customer AS c ON c.customer_key = f.customer_key
JOIN marts.dim_date AS d ON d.date_key = f.date_key
WHERE d.year = 2025
GROUP BY c.customer_type
ORDER BY net_revenue_bn DESC;
```

Resellers lead with about ₦106.7 billion, then schools (₦39.6 billion) and businesses (₦19.0 billion). Because `customer_key` points at the version valid on the order date, a customer reclassified in July 2026 still counts under their old type in 2025.

**4.** "A percentage is non-additive: adding up the discount rates of a thousand lines gives a meaningless number. Storing the additive amounts lets anyone compute the effective discount for any slice as `1 - sum(net_amount) / sum(gross_amount)`."

# Lesson: Data lakes, Parquet and partitioning

minutes: 55

## What a data lake is

A **data lake** is files in **object storage**: Amazon S3, Azure Data Lake Storage, Google Cloud Storage, or RustFS on your laptop. Object storage is cheap per gigabyte, practically unlimited, and separates storage from compute: the files sit there permanently, and you pay for processing only while a job runs. Any engine can read them: Python, Spark, Athena, Snowflake, DuckDB.

Object storage is not a file system. There are **buckets** (top-level containers) and **objects** with **keys**, such as `silver/parquet_demo/orders/load_date=2026-07-31/part-0000.parquet`. The slashes are just characters in the key; tools display them as folders. You write an object whole and replace it whole; you cannot edit the middle of one.

ShopLink's lake has three buckets, the medallion layers:

| Bucket | Holds | Maps to in `warehouse` |
|---|---|---|
| `bronze` | Data exactly as it arrived: API JSON, supplier CSVs, app table extracts | `raw` |
| `silver` | Cleaned, typed, deduplicated data, usually Parquet | `staging` |
| `gold` | Business-ready aggregates and models | `marts` |

## Add RustFS to your stack

RustFS is an open-source, S3-compatible object store (Apache 2.0 licence), so code you write against it works against Amazon S3 in Module 9 with only the endpoint and credentials changed. MinIO was the usual choice for this until its free community images were withdrawn in 2025, and RustFS is a drop-in alternative; SeaweedFS is another open-source option if you ever need one. Add two services to `compose.yaml`, under `services:` next to `postgres`:

```yaml
  rustfs:
    image: rustfs/rustfs:1.0.0
    command: ["/data"]
    ports: ["9000:9000", "9001:9001"]   # S3 API, web console
    environment:
      RUSTFS_ACCESS_KEY: ${S3_ACCESS_KEY:-shoplink}
      RUSTFS_SECRET_KEY: ${S3_SECRET_KEY:-shoplink123}
      RUSTFS_ADDRESS: ":9000"
      RUSTFS_CONSOLE_ADDRESS: ":9001"
      RUSTFS_CONSOLE_ENABLE: "true"
    volumes: ["rustfs-data:/data"]
  rustfs-init:
    image: amazon/aws-cli:2.37.4
    depends_on: [rustfs]
    environment:
      AWS_ACCESS_KEY_ID: ${S3_ACCESS_KEY:-shoplink}
      AWS_SECRET_ACCESS_KEY: ${S3_SECRET_KEY:-shoplink123}
      AWS_DEFAULT_REGION: us-east-1
    entrypoint: ["/bin/sh", "-c"]
    command: ["until aws --endpoint-url http://rustfs:9000 s3 ls >/dev/null 2>&1; do sleep 2; done; for b in bronze silver gold; do aws --endpoint-url http://rustfs:9000 s3 mb s3://$$b || true; done; echo 'buckets ready: bronze silver gold'"]
```

And add the volume to the top-level `volumes:` section, next to `postgres-data`:

```yaml
volumes:
  postgres-data:
  rustfs-data:
```

Details worth understanding:

- **`${S3_ACCESS_KEY:-shoplink}`** is read from `.env` by Compose, with `shoplink` as the default if the variable is missing. `$$b` (two dollar signs) is passed through to the container's shell as `$b`, the loop variable, instead of being filled in by Compose.
- **The `until` loop** makes `rustfs-init` wait until RustFS answers. Plain `depends_on` only waits for the container to start, not for the server inside to be ready.
- **`aws s3 mb`** creates each bucket. If a bucket already exists it prints an error, and `|| true` ignores it, so `rustfs-init` is safe to run every time. It exits after creating them; that is expected.
- **The named volume `rustfs-data`** holds the data. The RustFS container runs as user id 10001, and a named volume avoids the permission errors you can get by mounting a folder from your laptop.

Add these to `.env.example` and your `.env`. Compose reads the `S3_` keys to set up RustFS; the `AWS_` names are what Python's S3 libraries and Spark expect, and for RustFS they are the same user and password:

```bash
S3_ACCESS_KEY=shoplink
S3_SECRET_KEY=shoplink123
S3_ENDPOINT_URL=http://localhost:9000
AWS_ACCESS_KEY_ID=shoplink
AWS_SECRET_ACCESS_KEY=shoplink123
```

Start it and check:

```bash
docker compose up -d rustfs rustfs-init
docker compose logs rustfs-init    # ends with: buckets ready: bronze silver gold
```

Open the RustFS console at http://localhost:9001 and log in with `shoplink` / `shoplink123` to see the three buckets. From other containers the endpoint is `http://rustfs:9000`; from your laptop it is `http://localhost:9000`. This lesson needs `postgres` and `rustfs`.

You can also list the lake from the command line with the AWS CLI. Install it (see the resources), or run it in a throwaway container from the same image that `rustfs-init` uses:

```bash
aws configure --profile rustfs   # Access key shoplink, Secret key shoplink123, Region us-east-1, Output json
aws s3 ls --profile rustfs --endpoint-url http://localhost:9000                     # the three buckets
docker compose run --rm rustfs-init "aws --endpoint-url http://rustfs:9000 s3 ls"
```

Give the installed CLI its own `rustfs` profile instead of exporting the keys: in Module 9 the same CLI talks to real AWS, and exported `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` would override your AWS profile. The second form already has them from `compose.yaml`, and replaces the bucket-creating command with yours.

## Parquet and columnar storage

**Parquet** is the standard file format of data lakes. It stores data by column, keeps the types (a date is a date, not text), and compresses each column. Inside a file, rows are split into **row groups**, and each column of each row group stores statistics (minimum, maximum, null count) in the file footer. A reader looking for `status = 'cancelled'` or a date range can skip whole row groups without reading them.

`requirements.txt` already has pandas and pyarrow from Module 3. Append the S3 filesystem and the Delta Lake library, and install:

```bash
cat >> requirements.txt <<'EOF'
s3fs>=2024.6
deltalake>=1.0
EOF
pip install -r requirements.txt
```

Save the shared helpers as `pipelines/lake.py`:

```python
"""Helpers for ShopLink's lake: RustFS buckets bronze, silver and gold, through the S3 API."""
import os

import pandas as pd
import psycopg
import s3fs
from dotenv import load_dotenv

load_dotenv()


def s3() -> s3fs.S3FileSystem:
    """A filesystem object for RustFS. Paths look like 'silver/parquet_demo/orders/...'."""
    return s3fs.S3FileSystem(
        key=os.environ["AWS_ACCESS_KEY_ID"],
        secret=os.environ["AWS_SECRET_ACCESS_KEY"],
        endpoint_url=os.environ["S3_ENDPOINT_URL"],
    )


def delta_storage_options() -> dict[str, str]:
    """Settings the deltalake package needs to reach RustFS over plain HTTP."""
    return {
        "AWS_ENDPOINT_URL": os.environ["S3_ENDPOINT_URL"],
        "AWS_ACCESS_KEY_ID": os.environ["AWS_ACCESS_KEY_ID"],
        "AWS_SECRET_ACCESS_KEY": os.environ["AWS_SECRET_ACCESS_KEY"],
        "AWS_REGION": "us-east-1",
        "AWS_ALLOW_HTTP": "true",
        "AWS_S3_ALLOW_UNSAFE_RENAME": "true",   # fine for one writer at a time; see below
    }


def read_sql(db_url: str, sql: str, params: list | None = None) -> pd.DataFrame:
    """Run a query and return the result as a DataFrame."""
    with psycopg.connect(db_url) as con:
        cur = con.execute(sql, params)
        return pd.DataFrame(cur.fetchall(), columns=[col.name for col in cur.description])


def write_partition(df: pd.DataFrame, prefix: str, load_date: str, fs=None,
                    filename: str = "part-0000.parquet") -> str:
    """Replace the load_date partition under prefix with df, written as one Parquet file."""
    fs = fs or s3()
    folder = f"{prefix}/load_date={load_date}"
    if fs.exists(folder):
        fs.rm(folder, recursive=True)       # a rerun replaces the partition, never adds to it
    fs.makedirs(folder, exist_ok=True)
    key = f"{folder}/{filename}"
    with fs.open(key, "wb") as f:
        df.to_parquet(f, index=False)
    return key
```

`write_partition` is idempotent in the same way as your SQL loads: it deletes the partition's folder first, so a rerun replaces the data instead of adding a second file.

## Write silver orders as partitioned Parquet

Save `pipelines/write_silver_orders.py`:

```python
"""Write one load date of ShopLink orders from warehouse.raw to the silver bucket as Parquet.

Run from the repo root:  python -m pipelines.write_silver_orders --load-date 2026-07-31
"""
import argparse
import os

from pipelines.lake import read_sql, write_partition

SQL = """
SELECT order_id, customer_id, warehouse_id, order_date,
       lower(btrim(status)) AS status, channel, updated_at
FROM raw.app_orders
WHERE _load_date = %s
ORDER BY order_id
"""


def write_silver_orders(load_date: str, fs=None, prefix: str = "silver/parquet_demo/orders") -> str:
    orders = read_sql(os.environ["SHOPLINK_WAREHOUSE_DB_URL"], SQL, [load_date])
    if orders.empty:
        raise SystemExit(f"No rows in raw.app_orders for {load_date}: run copy_app_tables first")
    key = write_partition(orders, prefix, load_date, fs=fs)
    print(f"wrote {len(orders)} orders to {key}")
    return key


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--load-date", required=True)
    write_silver_orders(parser.parse_args().load_date)
```

Run it for both snapshots:

```bash
python -m pipelines.write_silver_orders --load-date 2026-06-30   # wrote 9088 orders
python -m pipelines.write_silver_orders --load-date 2026-07-31   # wrote 9521 orders
```

The prefix is `silver/parquet_demo/` on purpose. In Module 8, Spark writes the real silver tables (`silver/orders`, `silver/order_lines`) as Delta tables; keeping this demo in its own prefix means the two never collide.

Read the whole dataset back:

```python
import pandas as pd
from pipelines.lake import s3

orders = pd.read_parquet("silver/parquet_demo/orders", filesystem=s3())
print(orders.shape)                         # (18609, 8)
print(orders["load_date"].value_counts())   # 2026-07-31: 9521, 2026-06-30: 9088
```

The files have seven columns, but the result has eight. The folder names `load_date=2026-06-30` follow the **Hive-style partitioning** convention, `column=value`, and pyarrow turns them back into a `load_date` column. Every lake engine understands this convention, including Spark and Athena. To read one partition, point at its folder, or filter: `pd.read_parquet(..., filters=[("load_date", "=", "2026-07-31")])` opens only that folder.

## Compression and file sizes

The same 9,521 cleaned orders, written different ways:

| Format | Size |
|---|---|
| CSV | 571 KB |
| Parquet, no compression | 220 KB |
| Parquet, Snappy (the pandas default) | 169 KB |
| Parquet, Zstandard | 130 KB |
| Parquet, gzip | 124 KB |

Parquet is smaller than CSV even without compression, because it stores numbers as binary and encodes repeated values (five statuses, three channels) as small dictionary codes. Snappy is fast to write and read; Zstandard and gzip are smaller but cost more CPU. Many teams use Snappy for hot data and Zstandard for large, rarely read data. Choose with `df.to_parquet(path, compression="zstd")`.

## Choosing a partition key

Partitioning by `load_date` suits bronze and a "what arrived when" view: each run writes exactly one folder, so reruns and deletions are simple. But most analytical queries filter on a **business** date: "June 2026 orders". Partitioning by `order_month` lets those queries skip everything else. The rule is the same as for PostgreSQL partitions in Module 4: partition by the column your queries filter on most, and keep the number of partitions sensible.

## The small files problem

Every file has a cost to open: a request to object storage, a footer to read, a task to schedule. A thousand files of 10 KB are far slower to query than one file of 10 MB, even though the data is identical. Small files appear when you partition too finely (by `order_id`, or by hour for a small table), or when a streaming job writes a file every few seconds. Rules of thumb:

- Aim for files of roughly 100 MB to 1 GB in real lakes. ShopLink's whole dataset is smaller than one good file, so do not partition it more finely than monthly.
- Do not partition by a column with thousands of distinct values.
- Periodically **compact**: rewrite many small files into a few large ones. Table formats (next lesson) and Spark (Module 8) have commands for this.

## Resources

- docs: [File format](https://parquet.apache.org/docs/file-format/) · Apache Parquet · Row groups, column chunks, pages and the footer metadata.
- docs: [Tabular datasets](https://arrow.apache.org/docs/python/dataset.html) · Apache Arrow · Reading and writing partitioned Parquet datasets with pyarrow, including Hive partitioning.
- docs: [s3fs](https://s3fs.readthedocs.io/en/latest/) · s3fs documentation · The Python S3 filesystem, including `endpoint_url` for S3-compatible servers.
- docs: [Installing RustFS with Docker](https://docs.rustfs.com/installation/docker/) · RustFS documentation · The image, its environment variables, the console and the data volume used in this lesson.
- docs: [Installing the AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) · AWS · Install the CLI on your laptop to run `aws s3` commands against RustFS and, later, Amazon S3.
- docs: [Using high-level (s3) commands in the AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-services-s3-commands.html) · AWS · `ls`, `cp`, `rm`, `mb` and `sync`, which work the same against any S3-compatible endpoint.
- read: [What is a medallion architecture?](https://www.databricks.com/glossary/medallion-architecture) · Databricks · Bronze, silver and gold layers as lakehouse teams use them.
- watch: [Parquet File Format - Explained to a 5 Year Old!](https://www.youtube.com/watch?v=5NA57Pfpdr4) · Data Mozart · 7.84K subscribers · 141.4K views · 3,832 likes · published 2023-11-13 · checked 2026-09-27 · 11 min
- watch: [An introduction to Apache Parquet](https://www.youtube.com/watch?v=KLFadWdomyI) · Learn Data with Mark · 16.9K subscribers · 80.9K views · 1,945 likes · published 2022-10-14 · checked 2026-09-27 · 5 min

## Practice

1. Add `rustfs` and `rustfs-init` to `compose.yaml`, start them, and confirm the three buckets in the console.
2. Create `pipelines/lake.py` and `pipelines/write_silver_orders.py`, and write both snapshots. Run the 31 July write twice and confirm there is still exactly one file in that partition.
3. Land the supplier file in bronze exactly as it arrived: upload `data/shoplink/products.csv` to `bronze/supplier/products/load_date=2026-07-31/products.csv` with `s3().put(...)`.
4. Write the 31 July orders a second way, partitioned by `order_month` (`YYYY-MM`), to `silver/parquet_demo/orders_by_month/`. How many partition folders do you get, and how many rows are in July 2026?
5. Use `pyarrow.parquet.ParquetFile` to open one of your files and print its metadata and the statistics of the `status` column.

## Example answer

**2.** `s3().ls("silver/parquet_demo/orders/load_date=2026-07-31")` lists one object, `part-0000.parquet`, after both runs, because `write_partition` removes the folder before writing.

**3.**

```python
from pipelines.lake import s3

s3().put("data/shoplink/products.csv", "bronze/supplier/products/load_date=2026-07-31/products.csv")
```

Bronze keeps the file byte for byte: if your cleaning code has a bug next month, you can replay from it.

**4.**

```python
import pyarrow as pa
import pyarrow.dataset as ds
import pandas as pd
from pipelines.lake import s3

fs = s3()
orders = pd.read_parquet("silver/parquet_demo/orders/load_date=2026-07-31", filesystem=fs)
orders["order_month"] = pd.to_datetime(orders["order_date"]).dt.strftime("%Y-%m")
ds.write_dataset(pa.Table.from_pandas(orders, preserve_index=False),
                 "silver/parquet_demo/orders_by_month", format="parquet", filesystem=fs,
                 partitioning=["order_month"], partitioning_flavor="hive",
                 existing_data_behavior="delete_matching")

by_month = ds.dataset("silver/parquet_demo/orders_by_month", format="parquet",
                      partitioning="hive", filesystem=fs)
print(len(by_month.files))                                                   # 31
print(by_month.to_table(filter=ds.field("order_month") == "2026-07").num_rows)  # 433
```

31 folders, January 2024 to July 2026, and 433 July orders. The filter on the partition column opens only one of the 31 files. `existing_data_behavior="delete_matching"` replaces each partition it writes, which keeps the write idempotent.

**5.**

```python
import pyarrow.parquet as pq
from pipelines.lake import s3

with s3().open("silver/parquet_demo/orders/load_date=2026-07-31/part-0000.parquet", "rb") as f:
    meta = pq.ParquetFile(f).metadata
    print(meta)                                        # 9521 rows, 7 columns, 1 row group
    print(meta.row_group(0).column(4).statistics)      # status: min cancelled, max shipped
```

The statistics show `min: cancelled` and `max: shipped`, with `null_count: 0`. That is how an engine answering `WHERE status = 'returned'` knows whether a row group could contain matches before reading it.

# Lesson: Lakehouse tables and catalogs

minutes: 50

## What plain files cannot do

Parquet files in a bucket are cheap and fast to read, but they are not a table:

- **No transactions.** If a job writing 40 files crashes after 23, readers see 23 files: half a load.
- **No safe updates.** To change the status of 132 June orders you must rewrite whole files, and a reader in the middle sees a mixture.
- **No schema enforcement.** Nothing stops a job writing `unit_price` as text into a folder where it was a number yesterday.
- **No history.** Once a file is overwritten, the old data is gone.

A **table format** fixes this by keeping a **transaction log** next to the data files. The log, not the list of files in the folder, defines which files make up the table at each version. The main formats are **Delta Lake** (the default on Databricks and Microsoft Fabric, and the format this track uses) and **Apache Iceberg** (widely supported by Snowflake, AWS, Trino and others). Apache Hudi is a third. The ideas are the same in all of them.

| Feature | What it gives you |
|---|---|
| ACID commits | A write is one atomic commit to the log. Readers see the old version or the new one, never half |
| MERGE, UPDATE, DELETE | Row-level changes on object storage, in one commit |
| Schema enforcement and evolution | Writes with the wrong schema are rejected; adding a column is an explicit, logged change |
| Time travel | Every commit is a numbered version you can read or restore |

Lake storage plus a table format is called a **lakehouse**: the cheap, open storage of a lake with the reliability of a warehouse.

## Delta Lake from Python

In Module 8 you use Delta with Spark. Here you meet it without Spark, through the `deltalake` Python package (delta-rs, a Rust implementation), which you installed with `requirements.txt` in the last lesson. Save `pipelines/delta_demo.py`:

```python
"""Build a small Delta table on RustFS from the silver Parquet orders, then merge a later load.

Run from the repo root:  python -m pipelines.delta_demo
"""
import pandas as pd
from deltalake import DeltaTable, write_deltalake

from pipelines.lake import delta_storage_options, s3

PARQUET = "silver/parquet_demo/orders"
DELTA = "s3://silver/delta_demo/orders"


def read_partition(load_date: str, fs=None, prefix: str = PARQUET) -> pd.DataFrame:
    fs = fs or s3()
    return pd.read_parquet(f"{prefix}/load_date={load_date}", filesystem=fs)


def main(fs=None, prefix: str = PARQUET, table: str = DELTA, options: dict | None = None) -> None:
    options = delta_storage_options() if options is None else options

    # Version 0: the orders as they were on 30 June.
    first = read_partition("2026-06-30", fs, prefix)
    write_deltalake(table, first, mode="overwrite", storage_options=options)

    # Version 1: merge the 31 July extract. Newer updated_at wins; new orders are inserted.
    later = read_partition("2026-07-31", fs, prefix)
    metrics = (
        DeltaTable(table, storage_options=options)
        .merge(source=later, predicate="t.order_id = s.order_id",
               source_alias="s", target_alias="t")
        .when_matched_update_all(predicate="s.updated_at > t.updated_at")
        .when_not_matched_insert_all()
        .execute()
    )
    print("inserted", metrics["num_target_rows_inserted"], "updated", metrics["num_target_rows_updated"])

    dt = DeltaTable(table, storage_options=options)
    print("current version", dt.version(), "rows", len(dt.to_pandas()))
    print("version 0 rows", len(DeltaTable(table, version=0, storage_options=options).to_pandas()))
    for commit in dt.history():
        print("version", commit["version"], commit["operation"])


if __name__ == "__main__":
    main()
```

Run it:

```bash
python -m pipelines.delta_demo
```

```text
inserted 433 updated 132
current version 1 rows 9521
version 0 rows 9088
version 1 MERGE
version 0 WRITE
```

This is the same "newest version wins" upsert you wrote with `MERGE` in PostgreSQL in Module 4, now on object storage: 433 new July orders inserted, 132 June orders updated, in one atomic commit. `version=0` reads the table exactly as it was before the merge; that is **time travel**. If a bad load lands, you can read yesterday's version, or restore it with `DeltaTable(...).restore(0)`, which is itself a new commit, so even the undo is in the history.

`AWS_S3_ALLOW_UNSAFE_RENAME` in `delta_storage_options()` deserves a closer look. A commit is "write log file number N, but only if nobody else already wrote N". If two writers commit at the same moment, both could write version 5 and one commit would be lost. By default delta-rs refuses to write to S3 until you choose how to prevent that:

- **A conditional put** (`"aws_conditional_put": "etag"`), where the storage itself rejects the second write. Amazon S3 and Cloudflare R2 support this; check your S3-compatible store's documentation before relying on it.
- **A lock service**, such as the DynamoDB table delta-rs can use on AWS.
- **Accepting the risk** with `AWS_S3_ALLOW_UNSAFE_RENAME`, which is safe as long as only one process writes to a table at a time.

In this course one pipeline writes each table, so the third option is the honest choice for a laptop. In production, with several jobs writing to the same table, you would use one of the first two.

## Look inside the log

In the RustFS console (http://localhost:9001), open `silver/delta_demo/orders/`. You see Parquet data files and a `_delta_log/` folder with `00000000000000000000.json` and `00000000000000000001.json`. Download the first one and open it in a text editor. Each line is an action: `protocol`, `metaData` (the schema and partition columns), and one `add` per data file with its path, size and column statistics. The second commit has `add` actions for the rewritten file and `remove` actions for the file it replaced. The removed file is still in the bucket, which is exactly why time travel works, and why Delta has a `vacuum` command to delete old files once you no longer need their history.

Run the demo a second time and look at the history again: versions 2 (WRITE) and 3 (MERGE) appear. The data is the same, because `mode="overwrite"` replaced it, but the log records every run. A table format gives you an audit trail for free.

## Catalogs and metadata

A Delta table is a folder. For people and engines to find it by name (`silver.orders` rather than `s3://silver/delta_demo/orders`), and to know its schema, owner and location without scanning files, you need a **catalog**: a metadata service mapping table names to locations and schemas.

| Catalog | Where you meet it |
|---|---|
| Hive metastore | The original, from Hadoop. A database of table names, locations, schemas and partitions. Spark, Trino and many tools still speak its API |
| AWS Glue Data Catalog | AWS's managed catalog, Hive-compatible. Athena, EMR and Redshift Spectrum query tables registered in it. You create a Glue database called `shoplink` in Module 9 |
| Unity Catalog | Databricks' catalog, open-sourced in 2024. Adds permissions, lineage and a three-level `catalog.schema.table` namespace |
| Iceberg REST catalogs | The standard way Iceberg engines share tables (Polaris, Nessie, AWS S3 Tables and others) |

Catalogs hold the **metadata** that makes a lake usable: technical metadata (schema, location, partitions, file statistics), operational metadata (when a table was last written, by which job) and business metadata (descriptions, owners, sensitivity tags such as "contains personal data"). A lake without a catalog decays into a "data swamp": files nobody can find, trust or safely delete.

You do not run a catalog in this module. For now, keep a simple convention: one prefix per table, named `<bucket>/<source or domain>/<table>/`, and a short `README` in your repo listing each table's location, format and owner. In Module 9, a Glue crawler or an OpenTofu-defined table registers your S3 data so Athena can query it by name.

## Delta or Iceberg?

Both are open, both are mature, and both run on the same object storage. The practical choice usually follows your platform: Databricks and Fabric default to Delta; Snowflake, AWS (Athena, S3 Tables) and Trino-based stacks lean towards Iceberg. Converters and "universal format" features let one engine read the other. This track uses Delta because its Spark integration (delta-spark 3.2 with Spark 3.5.3) is the simplest to run on a laptop.

## Resources

- docs: [Delta Lake documentation](https://docs.delta.io/latest/index.html) · Delta Lake · Transactions, MERGE, time travel and vacuum.
- docs: [delta-rs Python usage](https://delta-io.github.io/delta-rs/latest/) · Delta Lake · The `deltalake` package: writing, reading, merging and history without Spark.
- docs: [S3-like storage backends](https://delta-io.github.io/delta-rs/latest/integrations/object-storage/s3-like/) · delta-rs documentation · The storage options for S3-compatible servers such as RustFS, and the choices for safe concurrent writes.
- docs: [Apache Iceberg documentation](https://iceberg.apache.org/docs/latest/) · Apache Iceberg · The other major open table format.
- docs: [Getting started with the AWS Glue Data Catalog](https://docs.aws.amazon.com/glue/latest/dg/start-data-catalog.html) · AWS · Databases, tables and crawlers, ahead of Module 9.
- read: [Unity Catalog](https://www.unitycatalog.io/) · Unity Catalog (Linux Foundation) · The open-source catalog for data and AI assets.
- watch: [Databricks Lakehouse Architecture | Delta Lake Databricks |Data Warehouse vs Data Lake vs Lakehouse](https://www.youtube.com/watch?v=NVhPkS7F5-8) · SleekData · 20.2K subscribers · 13.7K views · 249 likes · published 2024-11-22 · checked 2026-09-27 · 15 min

## Practice

1. Run `pipelines/delta_demo.py` and record the merge counts and the history.
2. Open the two `_delta_log` JSON files in the console. For the second commit, count the `add` and `remove` actions and explain what they mean.
3. Try to break schema enforcement: append a DataFrame in which `order_id` is text, with `write_deltalake(table, bad_df, mode="append", storage_options=...)`. What happens?
4. A colleague says "Delta is just Parquet with extra steps". Give two things that stop working if you delete the `_delta_log` folder.

## Example answer

**1.** Inserted 433, updated 132; current version 1 with 9,521 rows; version 0 with 9,088 rows. History shows version 1 MERGE and version 0 WRITE (more versions if you ran it more than once).

**2.** Version 0 has one `add` (the file written on 30 June). Version 1 has `add` actions for the new files the merge wrote (with the 132 updated orders and the 433 new ones) and a `remove` for the original file, whose rows were rewritten. The removed file still exists in the bucket; it is just no longer part of the current version, which is what makes `version=0` readable.

**3.**

```python
import pandas as pd
from deltalake import write_deltalake
from pipelines.lake import delta_storage_options

bad = pd.DataFrame({"order_id": ["abc"], "customer_id": [1], "warehouse_id": [1],
                    "order_date": [pd.Timestamp("2026-08-01").date()], "status": ["pending"],
                    "channel": ["web"], "updated_at": [pd.Timestamp("2026-08-01 09:00:00")]})
write_deltalake("s3://silver/delta_demo/orders", bad, mode="append",
                storage_options=delta_storage_options())
```

The write fails (delta-rs reports `Cannot cast string 'abc' to value of Int64 type`, because the table's schema says `order_id` is a long), and no commit is made, so the table is unchanged. With plain Parquet files the bad file would simply have landed in the folder. Adding a genuinely new column is possible, but only when you ask for it explicitly (`schema_mode="merge"`), so schema changes are deliberate and logged.

**4.** Without the log: there are no transactions, so readers could see half-written loads and concurrent writers could corrupt the table; and there is no history, so time travel and restore are gone. Worse, a tool reading the folder as plain Parquet would read every file, including the ones the merge logically removed, so the 132 updated orders would appear twice.

# Quiz

passing_score: 70

### Why does a B-tree index on order_lines.order_id not speed up "net revenue per month since 2024"?

- [ ] PostgreSQL cannot use indexes in aggregate queries
- [x] The query reads nearly every row, so a sequential scan is cheaper than jumping through the index
- [ ] The index only works on dates
- [ ] Indexes are disabled in the warehouse database

> OLAP queries scan most of a table. They get faster by reading fewer columns and fewer partitions, not from key lookups, which is why analytical storage is columnar and partitioned.

### ShopLink's fact table stores customer_key, not customer_id. Why?

- [ ] customer_id is too long to store
- [x] With SCD Type 2 a customer has several versions, and a surrogate key identifies the version valid when the order was placed
- [ ] Surrogate keys make the table smaller
- [ ] PostgreSQL cannot join on customer_id

> The surrogate key points at one version of the customer. Reports join on it with a simple equality and automatically get history right, such as July orders counting in Ogun and earlier ones in Rivers.

### What does the folder name `load_date=2026-07-31` in a lake path do?

- [ ] Nothing; it is only a label for humans
- [ ] It sets the file's expiry date
- [x] It is Hive-style partitioning: engines read it as a load_date column and can skip folders that do not match a filter
- [ ] It tells RustFS which bucket to use

> The column=value convention is understood by pyarrow, Spark, Athena and others. Filtering on the partition column opens only the matching folders.

### A job writes 40 Parquet files to a folder and crashes after 23. With a Delta table instead of plain files, what does a reader see?

- [ ] The 23 files that were written
- [ ] An error until someone deletes the files
- [x] The previous version of the table, because the new files were never committed to the transaction log
- [ ] A random mix of old and new rows

> The log defines the table. Files not referenced by a commit are invisible to readers, so a failed write leaves the last committed version intact.

### What is a data catalog for?

- [ ] Compressing Parquet files
- [x] Mapping table names to their location, schema and other metadata so people and engines can find and trust them
- [ ] Replacing the transaction log
- [ ] Running queries faster than Spark

> Catalogs such as the Hive metastore, AWS Glue Data Catalog and Unity Catalog hold the metadata that turns folders of files into named, discoverable, governed tables.

# Project: ShopLink star schema and silver Parquet

max_score: 100

## Brief

ShopLink's leadership wants one trusted place for sales numbers, and the data team wants the lake side of the platform started. Build both halves: a star schema for sales in `warehouse.marts`, built entirely by SQL from `warehouse.raw`, and the orders data written to RustFS as partitioned Parquet in the silver bucket.

Work in your `shoplink-data-platform` repo on a branch called `feature/warehouse-and-lake`.

## Deliverables

1. **Raw snapshots**: `pipelines/copy_app_tables.py`, with evidence (pasted output) that `raw.app_customers` holds 400 rows for 2026-06-30 and 430 for 2026-07-31, and that rerunning a load date does not change its counts.
2. **`sql/transforms/marts.sql`** building `marts.dim_date`, `marts.dim_customer` (SCD Type 2 on customer type, city and state, with an unknown member), `marts.dim_product`, `marts.dim_warehouse` and `marts.fct_order_lines`, with md5 surrogate keys, primary keys and foreign keys, in one transaction. A comment states the grain.
3. **`sql/transforms/check_marts.sql`** with at least five checks and their results as comments: fact row count against valid order lines in raw; no NULL keys in the fact; dimension version counts; net revenue by year; and one customer whose revenue is split across two versions.
4. **Lake**: `rustfs` and `rustfs-init` in `compose.yaml` exactly as in the lesson, the new variables in `.env.example` (never in `.env` committed), `pipelines/lake.py` and `pipelines/write_silver_orders.py`. Both snapshots written to `silver/parquet_demo/orders/load_date=YYYY-MM-DD/`, with a screenshot of the RustFS console showing the two partitions.
5. **One extension (choose one)**: the `order_month` partitioned copy with its file count; or `pipelines/delta_demo.py` with its merge counts and history; or a short comparison of CSV and Parquet sizes with two compression codecs.
6. **README section** "Warehouse and lake": the commands, in order, to rebuild the star and the silver files from scratch.

## How to submit

Push the branch and open a pull request into `main` in your `shoplink-data-platform` repository. Put the check results and the screenshot in the pull request description. Paste the pull request link into the submission form, with a one-line note on which extension you chose. Share your `dim_customer` design for peer review if you would like a second opinion.

## Grading guide

| Criterion | Points |
|---|---|
| Raw snapshots load with a load date and are idempotent per load date | 10 |
| Star schema: grain stated, keys and foreign keys correct, unknown members present | 25 |
| SCD Type 2 customer dimension: 451 rows including the unknown member, correct validity ranges, point-in-time join | 20 |
| Check queries prove the numbers and are pasted with results | 15 |
| RustFS added correctly; silver Parquet written with Hive-style load_date partitions, idempotently | 20 |
| Extension and README are clear and reproducible | 10 |
