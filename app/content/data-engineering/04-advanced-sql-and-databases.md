---
module: 4
title: Advanced SQL & Databases
optional: false
summary: Turn the PostgreSQL server from module 2 into ShopLink's operational app database. You design the app schema with types, primary keys, foreign keys and checks, load the batch 1 CSVs through staging tables with a reject report, then learn the SQL a data engineer uses every day in PostgreSQL 17: CTEs and window functions, transactions and isolation, upserts with ON CONFLICT and MERGE, indexes and EXPLAIN, range partitioning, and the deduplication, change detection and SCD Type 2 patterns that pipelines are built from.
---

# Lesson: Load ShopLink into PostgreSQL

minutes: 60

## From files to a real source system

In module 3 your Python code read ShopLink's CSV files and called the mock orders API. In a real company the most important source is neither of those: it is the **application database**, the PostgreSQL (or MySQL, or SQL Server) database behind the ShopLink web app. Every order a rep logs goes into it, and it is the system you will extract from in module 6.

There is no real ShopLink app, so in this lesson you build its database yourself, in the `shoplink_app` database that your module 2 `compose.yaml` already creates. You design the tables the way an application team would, with proper types and constraints, and load the batch 1 CSVs into them. Along the way you meet the first hard truth of data engineering: real data does not always fit the rules the database wants to enforce.

This lesson needs only the `postgres` service. If other services are running, stop them with `docker compose stop <service>`.

## Get the data and connect

1. Download [shoplink.zip](/datasets/shoplink.zip) and unzip it into `data/` in your `~/shoplink-data-platform` repo, so you have `data/shoplink/orders.csv` and so on. Your module 2 `.gitignore` already ignores `data/`.
2. Download [shoplink-batch-2.zip](/datasets/shoplink-batch-2.zip) too and unzip it into `data/` as well (`data/shoplink-batch-2/`). You need it at the end of this module.
3. Start PostgreSQL and open a `psql` prompt inside the container:

```bash
cd ~/shoplink-data-platform
docker compose up -d postgres
docker compose exec postgres psql -U shoplink -d shoplink_app
```

You get a `shoplink_app=#` prompt. `\l` lists the databases (you should see `shoplink_app`, `warehouse` and `airflow`), `\dn` lists schemas, `\dt app.*` lists the tables in a schema, `\d app.orders` describes one table, and `\q` quits. Running `psql` inside the container means you do not need to install anything else on your laptop.

## Design the app schema

A good operational schema says, in the database itself, what a valid row is. Four tools do that:

| Tool | What it enforces | ShopLink example |
|---|---|---|
| Data type | The kind of value | `order_date date`, `updated_at timestamp`, ids as `bigint` |
| `NOT NULL` | The value must be present | Every order has a `customer_id` |
| `PRIMARY KEY` | One row per key value, never NULL | One row per `order_id` |
| `FOREIGN KEY` (`REFERENCES`) | The value must exist in another table | Every order's `customer_id` exists in `customers` |
| `CHECK` | Any rule you can write as a true or false expression | `discount_pct IN (0, 5, 10, 15)` |
| `UNIQUE` | No two rows share the value | No two customers share an email |

Create `sql/schema/app.sql`:

```sql
-- sql/schema/app.sql
-- ShopLink's operational app database (the source system), in shoplink_app.
-- Rebuilds the app schema from scratch: it drops everything in it first.
-- All timestamps are UTC.

DROP SCHEMA IF EXISTS app CASCADE;
CREATE SCHEMA app;

CREATE TABLE app.customers (
    customer_id    bigint      PRIMARY KEY,
    customer_name  text        NOT NULL,
    customer_type  text        NOT NULL CHECK (customer_type IN ('reseller', 'school', 'business')),
    email          text        NOT NULL UNIQUE,
    city           text,                         -- 12 customers have no city
    state          text        NOT NULL,
    created_at     timestamp   NOT NULL,
    updated_at     timestamp   NOT NULL,
    CHECK (updated_at >= created_at)
);

CREATE TABLE app.products (
    product_id    bigint   PRIMARY KEY,
    product_name  text     NOT NULL,
    category      text     NOT NULL,
    brand         text     NOT NULL,
    unit_cost     bigint   NOT NULL CHECK (unit_cost >= 0),    -- whole naira
    list_price    bigint   NOT NULL CHECK (list_price >= 0),   -- whole naira
    is_active     boolean  NOT NULL
);

CREATE TABLE app.warehouses (
    warehouse_id    bigint  PRIMARY KEY,
    warehouse_name  text    NOT NULL UNIQUE,
    city            text    NOT NULL,
    state           text    NOT NULL,
    opened_date     date    NOT NULL
);

CREATE TABLE app.orders (
    order_id      bigint     PRIMARY KEY,
    customer_id   bigint     NOT NULL REFERENCES app.customers (customer_id),
    warehouse_id  bigint     NOT NULL REFERENCES app.warehouses (warehouse_id),
    order_date    date       NOT NULL,
    -- the app stores status as typed; the check allows messy casing but not new values
    status        text       NOT NULL
        CHECK (lower(btrim(status)) IN ('pending', 'shipped', 'delivered', 'cancelled', 'returned')),
    channel       text       NOT NULL CHECK (channel IN ('web', 'whatsapp', 'sales_rep')),
    updated_at    timestamp  NOT NULL
);

CREATE TABLE app.order_lines (
    order_line_id  bigint    PRIMARY KEY,
    order_id       bigint    NOT NULL REFERENCES app.orders (order_id),
    product_id     bigint    NOT NULL REFERENCES app.products (product_id),
    quantity       integer   NOT NULL,           -- no check: the app lets reps key 0 or -2
    unit_price     bigint    NOT NULL CHECK (unit_price >= 0),
    discount_pct   smallint  NOT NULL CHECK (discount_pct IN (0, 5, 10, 15))
);
```

A few choices worth understanding:

- **`bigint` for ids and money.** ShopLink's prices are whole naira, so an integer type is exact. `bigint` leaves room for totals in the billions without overflow. Never store money in `real` or `double precision`: floating point cannot represent many decimal values exactly. If ShopLink ever priced in kobo or dollars and cents, you would use `numeric(14, 2)`.
- **`text` rather than `varchar(50)`.** In PostgreSQL they perform the same, and a length limit you invent today becomes a failed insert when a school has a long name.
- **`timestamp` (without time zone).** Every ShopLink timestamp is UTC, and the column comment says so. `timestamptz` is the better default when data comes from many time zones; here it would only add confusion when you compare with the API's `updated_since` strings.
- **The status check allows messy casing.** The app has been storing " Delivered" and "CANCELLED" for two years, so a strict `status IN (...)` would reject real rows. The check blocks a genuinely new value such as "dispatched" while accepting the existing mess. Cleaning status is the warehouse's job.
- **No check on `quantity`.** The app does not stop a rep typing 0 or -2, which is exactly how the two bad lines got in. You mirror the source as it is; the pipeline in module 6 quarantines those lines.

## Why the naive load fails

The obvious way to load is to `\copy` each CSV straight into its table. Try it with the orders file after loading customers, and PostgreSQL stops you:

```text
ERROR:  insert or update on table "orders" violates foreign key constraint "orders_customer_id_fkey"
DETAIL:  Key (customer_id)=(9002) is not present in table "customers".
```

The three orphan orders (customer_id 9001, 9002 and 9003) break the foreign key. The order lines file fails the same way on its primary key:

```text
ERROR:  duplicate key value violates unique constraint "order_lines_pkey"
DETAIL:  Key (order_line_id)=(6789) already exists.
```

Six lines appear twice in the file. And because `\copy` runs as one statement, a single bad row means **none** of the 9,091 orders load.

You have three options, and only one is good:

| Option | Result |
|---|---|
| Drop the constraints | Everything loads, and the database can no longer promise anything. Every downstream query has to defend itself |
| Fix the CSV by hand | Works once, cannot be repeated, and nobody can see what you changed |
| **Stage, validate, insert, report** | Land every row in constraint-free staging tables, insert only the rows that pass, and record every reject with a reason |

The third is the pattern you will use for the rest of your career, in SQL here and in Python in module 6.

## Staging tables

Create `sql/load/stage.sql`. The staging tables have the same columns and types as `app.*` but no keys or constraints, so every row in a file lands, good or bad:

```sql
-- sql/load/stage.sql
-- Landing tables for the CSV files: the same columns and types as app.*, but no keys
-- or constraints, so every row in a file lands, good or bad. Emptied on every run.

CREATE SCHEMA IF NOT EXISTS app_stage;

DROP TABLE IF EXISTS app_stage.customers, app_stage.products, app_stage.warehouses,
    app_stage.orders, app_stage.order_lines;

CREATE UNLOGGED TABLE app_stage.customers (
    customer_id bigint, customer_name text, customer_type text, email text,
    city text, state text, created_at timestamp, updated_at timestamp
);
CREATE UNLOGGED TABLE app_stage.products (
    product_id bigint, product_name text, category text, brand text,
    unit_cost bigint, list_price bigint, is_active boolean
);
CREATE UNLOGGED TABLE app_stage.warehouses (
    warehouse_id bigint, warehouse_name text, city text, state text, opened_date date
);
CREATE UNLOGGED TABLE app_stage.orders (
    order_id bigint, customer_id bigint, warehouse_id bigint, order_date date,
    status text, channel text, updated_at timestamp
);
CREATE UNLOGGED TABLE app_stage.order_lines (
    order_line_id bigint, order_id bigint, product_id bigint, quantity integer,
    unit_price bigint, discount_pct smallint
);

-- Rows the load refused, with the reason. Kept until the next run.
CREATE TABLE IF NOT EXISTS app_stage.rejects (
    table_name   text        NOT NULL,
    record_key   bigint,
    reason       text        NOT NULL,
    record       jsonb       NOT NULL,
    rejected_at  timestamptz NOT NULL DEFAULT now()
);
TRUNCATE app_stage.rejects;
```

`UNLOGGED` tables skip PostgreSQL's write-ahead log, so they load faster, at the cost of being emptied after a crash. That is fine for staging data you can always reload from the files. The staging columns are still typed, so a file with text in a number column fails loudly at the `\copy`. For a really dirty source you would stage everything as `text` and cast in the next step.

## Insert the valid rows, report the rest

Create `sql/load/load_app.sql`. It runs in one transaction, so a failure halfway leaves the previous good load in place:

```sql
-- sql/load/load_app.sql
-- Moves batch 1 from app_stage into app, keeping only rows the constraints accept.
-- Everything else goes to app_stage.rejects with a reason. One transaction: all or nothing.

BEGIN;

TRUNCATE app.order_lines, app.orders, app.customers, app.products, app.warehouses;

-- Parents first: these three tables are clean in batch 1.
INSERT INTO app.customers SELECT * FROM app_stage.customers;
INSERT INTO app.products  SELECT * FROM app_stage.products;
INSERT INTO app.warehouses SELECT * FROM app_stage.warehouses;

-- Orders whose customer or warehouse does not exist are rejected.
INSERT INTO app_stage.rejects (table_name, record_key, reason, record)
SELECT 'orders', s.order_id,
       CASE WHEN c.customer_id IS NULL THEN 'unknown customer_id' ELSE 'unknown warehouse_id' END,
       to_jsonb(s)
FROM app_stage.orders AS s
LEFT JOIN app.customers AS c ON c.customer_id = s.customer_id
LEFT JOIN app.warehouses AS w ON w.warehouse_id = s.warehouse_id
WHERE c.customer_id IS NULL OR w.warehouse_id IS NULL;

INSERT INTO app.orders
SELECT s.*
FROM app_stage.orders AS s
WHERE EXISTS (SELECT 1 FROM app.customers AS c WHERE c.customer_id = s.customer_id)
  AND EXISTS (SELECT 1 FROM app.warehouses AS w WHERE w.warehouse_id = s.warehouse_id);

-- Order lines: number the copies of each order_line_id, then sort every row into
-- kept or rejected. Copy 2 of a duplicate, and lines whose order or product is missing,
-- are rejected.
CREATE TEMP TABLE line_check ON COMMIT DROP AS
SELECT
    s.*,
    row_number() OVER (PARTITION BY s.order_line_id ORDER BY s.order_id) AS copy_number,
    EXISTS (SELECT 1 FROM app.orders AS o WHERE o.order_id = s.order_id) AS order_exists,
    EXISTS (SELECT 1 FROM app.products AS p WHERE p.product_id = s.product_id) AS product_exists
FROM app_stage.order_lines AS s;

INSERT INTO app_stage.rejects (table_name, record_key, reason, record)
SELECT 'order_lines', order_line_id,
       CASE WHEN copy_number > 1 THEN 'duplicate order_line_id'
            WHEN NOT order_exists THEN 'order not loaded'
            ELSE 'unknown product_id' END,
       to_jsonb(line_check) - 'copy_number' - 'order_exists' - 'product_exists'
FROM line_check
WHERE copy_number > 1 OR NOT order_exists OR NOT product_exists;

INSERT INTO app.order_lines
SELECT order_line_id, order_id, product_id, quantity, unit_price, discount_pct
FROM line_check
WHERE copy_number = 1 AND order_exists AND product_exists;

COMMIT;

-- Row-count check: staged rows = loaded rows + rejected rows, for every table.
SELECT t.table_name, t.staged, t.loaded,
       count(r.*) AS rejected,
       t.staged = t.loaded + count(r.*) AS balanced
FROM (
    VALUES ('customers',   (SELECT count(*) FROM app_stage.customers),   (SELECT count(*) FROM app.customers)),
           ('products',    (SELECT count(*) FROM app_stage.products),    (SELECT count(*) FROM app.products)),
           ('warehouses',  (SELECT count(*) FROM app_stage.warehouses),  (SELECT count(*) FROM app.warehouses)),
           ('orders',      (SELECT count(*) FROM app_stage.orders),      (SELECT count(*) FROM app.orders)),
           ('order_lines', (SELECT count(*) FROM app_stage.order_lines), (SELECT count(*) FROM app.order_lines))
) AS t (table_name, staged, loaded)
LEFT JOIN app_stage.rejects AS r ON r.table_name = t.table_name
GROUP BY t.table_name, t.staged, t.loaded
ORDER BY t.table_name;
```

Notice the knock-on effect: rejecting the 3 orphan orders means their 8 order lines must be rejected too, or the order lines foreign key fails. Constraints force you to think about the whole chain.

`to_jsonb(s)` turns a whole staging row into one JSON value, so the rejects table can hold rows from any table with its original values intact. The `-` operator removes keys from a `jsonb` value, which drops the helper columns.

## One command to rebuild the app database

`\copy` is a `psql` command that reads a file on the **client** side and streams it to the server, so it works even though the CSVs live on your laptop, not inside the container. Piping the file into `docker compose exec -T` (the `-T` turns off the terminal so input can be piped) and reading it with `from pstdin` means you never need to mount the data folder into the container. Save this as `sql/load/load_app.sh`:

```bash
#!/usr/bin/env bash
# Rebuilds shoplink_app from the batch 1 CSVs. Run from the repo root:
#   bash sql/load/load_app.sh
set -euo pipefail
DATA=data/shoplink

psql_app() {
  docker compose exec -T postgres psql -U shoplink -d shoplink_app -v ON_ERROR_STOP=1 "$@"
}

psql_app < sql/schema/app.sql
psql_app < sql/load/stage.sql
for table in customers products warehouses orders order_lines; do
  psql_app -c "\copy app_stage.${table} from pstdin with (format csv, header true)" < "${DATA}/${table}.csv"
done
psql_app < sql/load/load_app.sql
```

`-v ON_ERROR_STOP=1` makes `psql` stop at the first error instead of carrying on with the next statement, and `set -euo pipefail` makes the script stop if any command fails. Run it:

```bash
bash sql/load/load_app.sh
```

The last thing it prints is the row-count check:

```text
 table_name  | staged | loaded | rejected | balanced
-------------+--------+--------+----------+----------
 customers   |    400 |    400 |        0 | t
 order_lines |  26779 |  26765 |       14 | t
 orders      |   9091 |   9088 |        3 | t
 products    |    120 |    120 |        0 | t
 warehouses  |      5 |      5 |        0 | t
```

Every table balances: nothing was silently lost. Run the script a second time and you get exactly the same numbers, because it truncates and reloads inside a transaction. That property, same result however many times you run it, is called **idempotency**, and module 6 is built on it.

## The reject report

```sql
SELECT table_name, reason, count(*) AS rows, array_agg(record_key ORDER BY record_key) AS keys
FROM app_stage.rejects
GROUP BY table_name, reason
ORDER BY table_name, reason;
```

```text
 table_name  |         reason          | rows |                          keys
-------------+-------------------------+------+---------------------------------------------------------
 order_lines | duplicate order_line_id |    6 | {6789,15113,16962,19091,25891,26093}
 order_lines | order not loaded        |    8 | {17383,17384,17385,20637,20638,20639,20690,20691}
 orders      | unknown customer_id     |    3 | {105936,107041,107057}
```

This is what you would send to the app team: "three orders reference customers that do not exist, and six order lines were written twice". The rejects are not deleted; they wait in a table, with the original values, until someone decides what to do. In ShopLink's case the fix belongs in the app, not in your load.

## Resources

- docs: [Constraints](https://www.postgresql.org/docs/17/ddl-constraints.html) · PostgreSQL 17 documentation · Check, not-null, unique, primary key and foreign key constraints, with examples.
- docs: [psql: the \copy meta-command](https://www.postgresql.org/docs/17/app-psql.html) · PostgreSQL 17 documentation · Search the page for "\copy". Explains client-side copy and `pstdin`.
- docs: [COPY](https://www.postgresql.org/docs/17/sql-copy.html) · PostgreSQL 17 documentation · The server-side command behind `\copy`, with every CSV option.
- docs: [Data types](https://www.postgresql.org/docs/17/datatype.html) · PostgreSQL 17 documentation · Numeric, text, date and time types, and why money should not be floating point.
- watch: [Learn PostgreSQL Tutorial - Full Course for Beginners](https://www.youtube.com/watch?v=qw--VYLpxG4) · freeCodeCamp.org · 11.9M subscribers · 3.3M views · 56K likes · published 2019-04-04 · checked 2026-09-27 · 260 min
- read: [PostgreSQL tutorial](https://www.postgresql.org/docs/current/tutorial.html) · PostgreSQL documentation · The official tutorial, from creating tables to foreign keys and transactions. Use it to fill gaps.

## Practice

1. Create `sql/schema/app.sql`, `sql/load/stage.sql`, `sql/load/load_app.sql` and `sql/load/load_app.sh` as shown, and run the load. Confirm every table balances.
2. Run it a second time and confirm the counts are identical.
3. Prove the naive load fails, safely, inside a transaction you then undo. In `psql` run `BEGIN;`, then `TRUNCATE app.order_lines, app.orders;`, then `INSERT INTO app.orders SELECT * FROM app_stage.orders;`, then `ROLLBACK;`. Explain the error, and check that `app.orders` still has 9,088 rows afterwards.
4. Write a query on `app_stage.rejects` that shows the customer_id and order_date of each rejected order, using the `record` column (hint: `record->>'customer_id'`).
5. In one or two sentences, explain why the load rejects the 8 order lines even though nothing is wrong with the lines themselves.

## Example answer

Step 3 fails with a foreign key violation on the first orphan:

```text
ERROR:  insert or update on table "orders" violates foreign key constraint "orders_customer_id_fkey"
DETAIL:  Key (customer_id)=(9002) is not present in table "customers".
```

One bad row aborts the whole statement, so none of the 9,091 staged orders is inserted. After `ROLLBACK`, `SELECT count(*) FROM app.orders;` returns 9,088 again: the truncate was undone too, because it ran inside the same transaction. (If you forgot `BEGIN`, the truncate committed on its own; rerun `bash sql/load/load_app.sh` to rebuild.)

Step 4:

```sql
SELECT record_key AS order_id,
       (record->>'customer_id')::bigint AS customer_id,
       (record->>'order_date')::date AS order_date,
       record->>'status' AS status
FROM app_stage.rejects
WHERE table_name = 'orders'
ORDER BY order_id;
```

It returns three rows: order 105936 for customer 9002, order 107041 for 9001, and order 107057 for 9003. `->>` extracts a JSON field as text, so you cast it back to the type you want.

Step 5: "An order line must point at an order that exists. Once the three orphan orders are rejected, their 8 lines have no order to belong to, so the foreign key would reject them anyway; rejecting them explicitly, with the reason 'order not loaded', keeps the report honest about why they are missing."

# Lesson: CTEs and window functions

minutes: 55

## Readable SQL with CTEs

A **common table expression** (CTE) names a subquery with `WITH`, so a long query reads as a list of steps from top to bottom. This is ShopLink's net revenue per month, the number leadership asks for most:

```sql
WITH orders_clean AS (
    SELECT order_id, order_date, lower(btrim(status)) AS status
    FROM app.orders
),

revenue_lines AS (
    SELECT
        o.order_date,
        ol.quantity * ol.unit_price * (1 - ol.discount_pct / 100.0) AS net_revenue
    FROM app.order_lines AS ol
    JOIN orders_clean AS o ON o.order_id = ol.order_id
    WHERE o.status NOT IN ('cancelled', 'returned')
      AND ol.quantity > 0
),

monthly AS (
    SELECT date_trunc('month', order_date)::date AS order_month,
           sum(net_revenue) AS net_revenue
    FROM revenue_lines
    GROUP BY order_month
)

SELECT order_month, round(net_revenue) AS net_revenue
FROM monthly
ORDER BY order_month;
```

The first rows are January 2024 at ₦5,404,728,900 and February at ₦7,099,990,375. Each CTE does one job, so when a number looks wrong you replace the final `SELECT` with `SELECT * FROM orders_clean` and check one step at a time.

Two PostgreSQL details matter here:

- **Integer division.** `discount_pct / 100` with two integers is integer division in PostgreSQL: `SELECT 5 / 100` returns `0`, and every discount silently disappears. Write `100.0` (or cast to `numeric`) so the result is a decimal: `SELECT 5 / 100.0` returns `0.05`.
- **`date_trunc` returns a timestamp.** `::date` casts it back to a date, which reads better and joins cleanly to date columns.

`btrim` is PostgreSQL's name for trimming both ends; `trim(status)` works too.

## Recursive CTEs

A recursive CTE refers to itself: an anchor row, then a step that repeats until a condition stops it. They are used for hierarchies (categories and subcategories, managers and staff) and for sequences:

```sql
WITH RECURSIVE months (month_start) AS (
    SELECT date '2024-01-01'
    UNION ALL
    SELECT (month_start + interval '1 month')::date
    FROM months
    WHERE month_start < date '2026-06-01'
)
SELECT count(*) FROM months;   -- 30
```

For plain date sequences PostgreSQL has a simpler tool, `generate_series(date '2024-01-01', date '2026-06-01', interval '1 month')`, which you will use for partitions later in this module.

## Window functions

A window function computes something over a set of rows related to the current row, without collapsing them the way `GROUP BY` does. The `OVER (...)` clause defines the window: `PARTITION BY` splits rows into groups, `ORDER BY` orders them inside each group, and a frame such as `ROWS BETWEEN 2 PRECEDING AND CURRENT ROW` picks the rows to include.

Month-on-month growth with `LAG`, using a named window:

```sql
WITH monthly AS (
    SELECT date_trunc('month', o.order_date)::date AS order_month,
           sum(ol.quantity * ol.unit_price * (1 - ol.discount_pct / 100.0)) AS net_revenue
    FROM app.order_lines AS ol
    JOIN app.orders AS o ON o.order_id = ol.order_id
    WHERE lower(btrim(o.status)) NOT IN ('cancelled', 'returned') AND ol.quantity > 0
    GROUP BY 1
)
SELECT order_month,
       round(net_revenue) AS net_revenue,
       round(100 * (net_revenue / lag(net_revenue) OVER w - 1), 1) AS mom_growth_pct,
       round(sum(net_revenue) OVER (PARTITION BY extract(year FROM order_month)
                                    ORDER BY order_month
                                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)) AS year_to_date
FROM monthly
WINDOW w AS (ORDER BY order_month)
ORDER BY order_month
LIMIT 3;
```

```text
 order_month | net_revenue | mom_growth_pct | year_to_date
-------------+-------------+----------------+--------------
 2024-01-01  |  5404728900 |                |   5404728900
 2024-02-01  |  7099990375 |           31.4 |  12504719275
 2024-03-01  |  6624006000 |           -6.7 |  19128725275
```

The ranking functions differ only in how they treat ties: `row_number()` gives 1, 2, 3, 4; `rank()` gives 1, 2, 2, 4; `dense_rank()` gives 1, 2, 2, 3.

## No QUALIFY in PostgreSQL

You cannot filter on a window function in `WHERE`, because `WHERE` runs before windows are computed. Some databases (Snowflake, DuckDB, BigQuery) add a `QUALIFY` clause for this. PostgreSQL does not have it, so you wrap the query and filter outside. The top two products per category:

```sql
SELECT category, product_name, net_revenue, rank_in_category
FROM (
    SELECT p.category,
           p.product_name,
           round(sum(ol.quantity * ol.unit_price * (1 - ol.discount_pct / 100.0))) AS net_revenue,
           rank() OVER (PARTITION BY p.category
                        ORDER BY sum(ol.quantity * ol.unit_price * (1 - ol.discount_pct / 100.0)) DESC)
               AS rank_in_category
    FROM app.order_lines AS ol
    JOIN app.orders AS o ON o.order_id = ol.order_id
    JOIN app.products AS p ON p.product_id = ol.product_id
    WHERE lower(btrim(o.status)) NOT IN ('cancelled', 'returned') AND ol.quantity > 0
    GROUP BY p.category, p.product_name
) AS ranked
WHERE rank_in_category <= 2
ORDER BY category, rank_in_category;
```

Phones lead overall: the Infinix Hot 40 16GB/512GB brings in about ₦15.7 billion. In Laptops, the Dell XPS 13 8GB/256GB leads with about ₦8.2 billion.

## DISTINCT ON: PostgreSQL's one-row-per-key shortcut

The most common window job in data engineering is "keep one row per key": the latest version of each order, the first order of each customer. The portable way is `row_number()` in a subquery:

```sql
SELECT customer_id, order_id, order_date
FROM (
    SELECT customer_id, order_id, order_date,
           row_number() OVER (PARTITION BY customer_id ORDER BY order_date, order_id) AS n
    FROM app.orders
) AS numbered
WHERE n = 1;
```

PostgreSQL has a shorter form, `DISTINCT ON`, which keeps the first row of each group according to `ORDER BY`:

```sql
SELECT DISTINCT ON (customer_id) customer_id, order_id, order_date
FROM app.orders
ORDER BY customer_id, order_date, order_id;
```

Both return 385 rows: 385 of the 400 customers have ordered. The `ORDER BY` must start with the `DISTINCT ON` columns, and the columns after them decide which row wins. Always add a tiebreaker (`order_id` here); otherwise two orders on the same day make the result change from run to run. Use `DISTINCT ON` in PostgreSQL code; use `row_number()` when the SQL must also run on other engines, such as Spark in module 8.

## Resources

- docs: [WITH queries (common table expressions)](https://www.postgresql.org/docs/17/queries-with.html) · PostgreSQL 17 documentation · CTEs, recursion and data-modifying CTEs.
- docs: [Window functions tutorial](https://www.postgresql.org/docs/17/tutorial-window.html) · PostgreSQL 17 documentation · A short introduction to PARTITION BY, ORDER BY and frames.
- docs: [Window functions reference](https://www.postgresql.org/docs/17/functions-window.html) · PostgreSQL 17 documentation · Every window function: row_number, rank, lag, lead, first_value and more.
- docs: [SELECT: the DISTINCT clause](https://www.postgresql.org/docs/17/sql-select.html#SQL-DISTINCT) · PostgreSQL 17 documentation · How DISTINCT ON picks one row per group.
- watch: [SQL WITH Clause | How to write SQL Queries using WITH Clause | SQL CTE (Common Table Expression)](https://www.youtube.com/watch?v=QNfnuK-1YYY) · techTFQ · 405K subscribers · 800.4K views · 17,633 likes · published 2021-09-05 · checked 2026-09-27 · 25 min
- watch: [SQL Window Function | How to write SQL Query using RANK, DENSE RANK, LEAD/LAG | SQL Queries Tutorial](https://www.youtube.com/watch?v=Ww71knvhQ-s) · techTFQ · 405K subscribers · 1.6M views · 44,691 likes · published 2021-05-21 · checked 2026-09-27 · 25 min

## Practice

Work in `psql` against `shoplink_app`.

1. For each customer, find the number of days between their first and second orders. How many customers ordered again within 30 days of their first order?
2. Using `DISTINCT ON`, find each warehouse's single best-selling product category by net revenue.
3. Add a three-month moving average of net revenue to the monthly query in this lesson.

## Example answer

**1.** Number the orders and take the gap on the second one:

```sql
WITH numbered AS (
    SELECT customer_id,
           order_date,
           row_number() OVER w AS order_number,
           order_date - lag(order_date) OVER w AS days_since_previous
    FROM app.orders
    WINDOW w AS (PARTITION BY customer_id ORDER BY order_date, order_id)
)
SELECT count(*) AS back_within_30_days
FROM numbered
WHERE order_number = 2 AND days_since_previous <= 30;
```

The answer is 167. Subtracting two `date` values in PostgreSQL gives a whole number of days.

**2.** Aggregate first, then keep the top row per warehouse:

```sql
WITH category_revenue AS (
    SELECT w.warehouse_name, p.category,
           sum(ol.quantity * ol.unit_price * (1 - ol.discount_pct / 100.0)) AS net_revenue
    FROM app.order_lines AS ol
    JOIN app.orders AS o ON o.order_id = ol.order_id
    JOIN app.products AS p ON p.product_id = ol.product_id
    JOIN app.warehouses AS w ON w.warehouse_id = o.warehouse_id
    WHERE lower(btrim(o.status)) NOT IN ('cancelled', 'returned') AND ol.quantity > 0
    GROUP BY w.warehouse_name, p.category
)
SELECT DISTINCT ON (warehouse_name) warehouse_name, category, round(net_revenue) AS net_revenue
FROM category_revenue
ORDER BY warehouse_name, net_revenue DESC, category;
```

It returns five rows, one per warehouse. Phones win in four of them; in Abuja Central, Laptops lead with about ₦26.1 billion. `category` at the end of the `ORDER BY` is the tiebreaker.

**3.** Add this column to the final `SELECT`:

```sql
round(avg(net_revenue) OVER (ORDER BY order_month ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)) AS moving_avg_3m
```

For March 2024 it is ₦6,376,241,758, the average of January, February and March. A `row_number()` subquery instead of `DISTINCT ON` in step 2 is equally correct.

# Lesson: Transactions, constraints and upserts

minutes: 55

## Transactions and ACID

A **transaction** groups statements so they succeed or fail together. You used one in `load_app.sql`: `BEGIN`, a truncate and five inserts, `COMMIT`. If the order lines insert had failed, the truncate would have been undone too, and the app would still hold yesterday's good data.

Transactions give four guarantees, known as **ACID**:

| Letter | Guarantee | ShopLink example |
|---|---|---|
| Atomicity | All statements happen, or none do | An order and its lines are saved together, never an order with no lines |
| Consistency | Constraints hold after every commit | No committed order ever has a customer that does not exist |
| Isolation | Concurrent transactions do not see each other's half-finished work | A report never sees an order whose lines are only half inserted |
| Durability | Once committed, it survives a crash | A confirmed order is not lost if the server restarts |

In `psql`, try it:

```sql
BEGIN;
UPDATE app.orders SET status = 'shipped', updated_at = now()::timestamp WHERE order_id = 109091;
SELECT status FROM app.orders WHERE order_id = 109091;   -- shipped, inside this transaction
ROLLBACK;
SELECT status FROM app.orders WHERE order_id = 109091;   -- pending again
```

Without `BEGIN`, `psql` commits every statement on its own ("autocommit"). In Python, psycopg 3 does the opposite: a connection opens a transaction automatically and nothing is saved until you call `conn.commit()` or leave a `with psycopg.connect(...) as conn:` block without an error.

## Isolation levels

When two transactions run at once, isolation decides what each one sees. PostgreSQL offers three levels (a fourth, read uncommitted, behaves like read committed in PostgreSQL):

| Level | What a transaction sees | Typical use |
|---|---|---|
| Read committed (default) | Each statement sees data committed before that statement started | Most application work |
| Repeatable read | The whole transaction sees one snapshot, taken at its first statement | Reports and extracts that must be consistent across several queries |
| Serializable | As if transactions ran one after another; PostgreSQL aborts one if they conflict | Money movements and rules that span rows |

The one data engineers need most is **repeatable read for extracts**. Suppose your module 6 pipeline extracts `orders` and then `order_lines` from the app with two queries. Under read committed, an order placed between the two queries has its lines in the second result but not its header in the first. Under repeatable read both queries see the same moment:

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT count(*) FROM app.orders;
SELECT count(*) FROM app.order_lines;
COMMIT;
```

Try it with two terminals, each running `docker compose exec postgres psql -U shoplink -d shoplink_app`. In terminal A, start the repeatable read transaction above and run the first count. In terminal B, run `DELETE FROM app.order_lines WHERE order_line_id = 1;` (autocommit). Back in A, run the second count: it still includes line 1. Commit in A and count again: now it does not. Rebuild afterwards with `bash sql/load/load_app.sh`.

A classic concurrency bug is the **lost update**: two reps read an order, both change it, and the second write silently overwrites the first. `SELECT ... FOR UPDATE` locks the rows you read until your transaction ends, so the second transaction waits instead of overwriting.

## Constraints as a contract

Constraints are the database's contract with everyone who writes to it. You added most of them in `app.sql`. Two more techniques are worth knowing.

**Adding a constraint to a table that already breaks it.** Try to make the app reject non-positive quantities:

```sql
ALTER TABLE app.order_lines ADD CONSTRAINT order_lines_quantity_positive CHECK (quantity > 0);
```

```text
ERROR:  check constraint "order_lines_quantity_positive" of relation "order_lines" is violated by some row
```

The two bad lines (order_line_id 3540 and 21582) block it. `NOT VALID` adds the constraint for new rows only, without checking the old ones:

```sql
ALTER TABLE app.order_lines
    ADD CONSTRAINT order_lines_quantity_positive CHECK (quantity > 0) NOT VALID;
```

Now a new line with quantity 0 is rejected, while the historic rows stay until someone fixes them and runs `ALTER TABLE app.order_lines VALIDATE CONSTRAINT order_lines_quantity_positive;`. This is how teams tighten rules on a live system without a big-bang clean-up. Drop it again for this course (`ALTER TABLE app.order_lines DROP CONSTRAINT order_lines_quantity_positive;`), because module 6 needs those two lines to practise quarantine.

**Constraints make the database do checks you would otherwise code.** A foreign key is a data quality test that runs on every insert, forever, for free.

## Upserts with INSERT ... ON CONFLICT

An **upsert** inserts a row, or updates it if the key already exists. Pipelines use it all the time: apply today's changes to a table without duplicating the rows you already have. PostgreSQL's form:

```sql
INSERT INTO app.customers AS t
SELECT * FROM app_stage.customers
ON CONFLICT (customer_id) DO UPDATE
    SET customer_type = excluded.customer_type,
        city          = excluded.city,
        state         = excluded.state,
        updated_at    = excluded.updated_at
    WHERE excluded.updated_at > t.updated_at;
```

- `ON CONFLICT (customer_id)` names the unique key to check. It needs a primary key or unique constraint on that column.
- `excluded` is the row you tried to insert.
- The `WHERE` makes it safe: an update happens only when the incoming row is newer. Without it, an old file loaded late would overwrite newer data.
- `ON CONFLICT DO NOTHING` simply skips rows whose key exists, which is right for data that never changes once written, such as ShopLink's order lines.

## MERGE

`MERGE` (PostgreSQL 15 and later) is the SQL standard way to apply a set of changes, with a separate action for each case:

```sql
MERGE INTO app.orders AS t
USING app_stage.orders AS s
ON t.order_id = s.order_id
WHEN MATCHED AND s.updated_at > t.updated_at THEN
    UPDATE SET status = s.status, updated_at = s.updated_at
WHEN NOT MATCHED THEN
    INSERT VALUES (s.order_id, s.customer_id, s.warehouse_id, s.order_date,
                   s.status, s.channel, s.updated_at)
RETURNING merge_action(), t.order_id;
```

`RETURNING merge_action()` is new in PostgreSQL 17: it tells you, for each row, whether it was an `INSERT`, `UPDATE` or `DELETE`, which is perfect for logging what a load changed. `MERGE` can also `DELETE` matched rows, which `ON CONFLICT` cannot.

| | INSERT ... ON CONFLICT | MERGE |
|---|---|---|
| Needs a unique constraint | Yes | No, joins on any condition |
| Safe under heavy concurrent inserts | Yes, designed for it | Can fail with a unique violation if another session inserts the same key at the same moment |
| Can delete | No | Yes |
| Portable | PostgreSQL and SQLite | SQL standard: Snowflake, SQL Server, Databricks, Spark with Delta |

For pipeline loads, where one job writes a table at a time, `MERGE` reads more clearly. For an application inserting rows concurrently, `ON CONFLICT` is safer. You will see `MERGE` again with Delta tables in module 8.

## Resources

- docs: [Transaction isolation](https://www.postgresql.org/docs/17/transaction-iso.html) · PostgreSQL 17 documentation · The three levels, with the anomalies each one prevents.
- docs: [INSERT, including ON CONFLICT](https://www.postgresql.org/docs/17/sql-insert.html) · PostgreSQL 17 documentation · Upserts, `excluded` and the `WHERE` clause on `DO UPDATE`.
- docs: [MERGE](https://www.postgresql.org/docs/17/sql-merge.html) · PostgreSQL 17 documentation · Every clause, including `RETURNING merge_action()`.
- docs: [ALTER TABLE](https://www.postgresql.org/docs/17/sql-altertable.html) · PostgreSQL 17 documentation · `NOT VALID` and `VALIDATE CONSTRAINT`.
- watch: [Relational Database ACID Transactions (Explained by Example)](https://www.youtube.com/watch?v=pomxJOFVcQs) · Hussein Nasser · 520K subscribers · 164.3K views · 4,667 likes · published 2019-08-30 · checked 2026-09-27 · 43 min
- deeper: [Designing Data-Intensive Applications, 2nd edition](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781098119058/) · Martin Kleppmann and Chris Riccomini, O'Reilly (paid) · The chapter on transactions is the best explanation of isolation anomalies in print.

## Practice

1. Run the `BEGIN` ... `ROLLBACK` example and the two-terminal repeatable read experiment. Write down what terminal A saw at each step.
2. A rep changes order 109090 to "shipped". Write an `INSERT ... ON CONFLICT` statement that applies this change with `updated_at` set to `2026-07-01 09:00:00`, and would do nothing if the stored row were already newer. Run it twice and check the row.
3. Explain in two sentences why an upsert without the `WHERE excluded.updated_at > t.updated_at` condition is dangerous in a pipeline.

## Example answer

**1.** Terminal A's second count still included line 1 (26,765 lines), because a repeatable read transaction keeps the snapshot it took at its first query. After `COMMIT`, a new count showed 26,764. Terminal B was never blocked: in PostgreSQL, readers do not block writers and writers do not block readers.

**2.**

```sql
INSERT INTO app.orders AS t (order_id, customer_id, warehouse_id, order_date, status, channel, updated_at)
SELECT order_id, customer_id, warehouse_id, order_date, 'shipped', channel, timestamp '2026-07-01 09:00:00'
FROM app.orders
WHERE order_id = 109090
ON CONFLICT (order_id) DO UPDATE
    SET status = excluded.status, updated_at = excluded.updated_at
    WHERE excluded.updated_at > t.updated_at;
```

The first run reports `INSERT 0 1` (one row updated), the second `INSERT 0 0`, because the stored `updated_at` is now equal, not older. The row shows `shipped` and `2026-07-01 09:00:00`. Restore it with `bash sql/load/load_app.sh`.

**3.** "Pipelines rerun and files arrive late, so the same change, or an older version of a row, can be applied after a newer one. Without the condition, the older version overwrites the newer one and the table silently goes back in time."

# Lesson: Indexes and query plans

minutes: 55

## How PostgreSQL finds rows

PostgreSQL stores a table as a heap: rows in pages of 8 KB, in no particular order. Without help, finding the lines of one order means reading every page, a **sequential scan**. An **index** is a separate, sorted structure (a B-tree by default) that maps a value to the rows that hold it, so PostgreSQL can jump straight to them.

Primary keys and unique constraints create an index automatically. **Foreign keys do not.** `app.order_lines.order_id` references `orders`, but nothing indexes it, and "get the lines of order X" is the most common query the app runs.

## Reading EXPLAIN (ANALYZE, BUFFERS)

`EXPLAIN` shows the plan PostgreSQL chose. `ANALYZE` actually runs the query and adds real row counts and times. `BUFFERS` adds how many 8 KB pages were read: `shared hit` from memory, `read` from disk. Pages are the honest measure of work; timings on a tiny laptop dataset are noisy.

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM app.order_lines WHERE order_id = 105000;
```

```text
Seq Scan on order_lines  (cost=0.00..585.56 rows=3 width=38) (actual time=0.463..0.833 rows=3 loops=1)
  Filter: (order_id = 105000)
  Rows Removed by Filter: 26762
  Buffers: shared hit=251
Planning Time: 0.232 ms
Execution Time: 0.865 ms
```

How to read it:

- **The node type**: `Seq Scan` reads the whole table.
- **`cost=0.00..585.56`**: the planner's estimate, in arbitrary units (startup cost..total cost). Use it to compare plans, not as seconds.
- **`rows=3` (estimated) and `actual ... rows=3`**: when estimate and actual differ by a factor of 10 or more, the planner's statistics are off, and it may pick a bad plan. `ANALYZE app.order_lines;` refreshes them.
- **`Rows Removed by Filter: 26762`**: 26,762 rows read to return 3. That is the smell of a missing index.
- **`Buffers: shared hit=251`**: all 251 pages of the table were touched.

Now add the index and run it again:

```sql
CREATE INDEX order_lines_order_id_idx ON app.order_lines (order_id);
```

```text
Index Scan using order_lines_order_id_idx on order_lines  (cost=0.29..8.34 rows=3 width=38) (actual time=0.059..0.060 rows=3 loops=1)
  Index Cond: (order_id = 105000)
  Buffers: shared hit=4 read=2
Execution Time: 0.074 ms
```

Six pages instead of 251. On 27,000 rows you barely notice; on ShopLink's 27 million order lines in a few years, it is the difference between a snappy app and a timeout. (PostgreSQL 18 adds an `Index Searches` line and prints rows with decimals; the plan is otherwise the same.)

## When an index does not help

Indexes are not free. Each one takes space (the new index is 416 kB next to the table's 2 MB) and slows every insert and update, because the index must be updated too. And the planner often ignores them, correctly:

- **When a query reads most of the table.** `WHERE order_date >= '2024-01-01'` matches every order, so a sequential scan is cheaper than jumping around the index. PostgreSQL picks `Seq Scan` even if an index exists.
- **When the column is wrapped in a function.** An index on `order_date` cannot serve `WHERE extract(year FROM order_date) = 2025`. Write the range instead: `WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01'`.
- **When the leading column of a composite index is missing.** An index on `(customer_id, order_date)` serves "customer 77's orders, newest first", but not "all orders on a date".

The composite index in action:

```sql
CREATE INDEX orders_customer_date_idx ON app.orders (customer_id, order_date);

EXPLAIN (ANALYZE)
SELECT order_id, order_date FROM app.orders
WHERE customer_id = 77
ORDER BY order_date DESC
LIMIT 5;
```

```text
Limit  (cost=0.29..10.89 rows=5 width=12) (actual time=0.130..0.135 rows=5 loops=1)
  ->  Index Scan Backward using orders_customer_date_idx on orders  (cost=0.29..337.66 rows=159 width=12) (actual time=0.126..0.130 rows=5 loops=1)
        Index Cond: (customer_id = 77)
```

PostgreSQL walks the index backwards and stops after five rows: no sort, no full scan.

For warehouse and pipeline work the rule of thumb is different from app work. Analytical queries read large parts of tables, so they gain little from B-tree indexes; they gain from reading fewer columns (columnar storage, module 5) and fewer partitions (next section). Index the keys that joins and upserts look up, and little else.

## Joins in the plan

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT o.order_id, sum(ol.quantity * ol.unit_price)
FROM app.orders AS o
JOIN app.order_lines AS ol ON ol.order_id = o.order_id
WHERE o.customer_id = 77
GROUP BY o.order_id;
```

The plan (trimmed) reads from the most indented line outwards:

```text
HashAggregate  (actual rows=159 loops=1)
  ->  Hash Join  (actual rows=497 loops=1)
        Hash Cond: (ol.order_id = o.order_id)
        ->  Seq Scan on order_lines ol  (actual rows=26765 loops=1)
        ->  Hash  (actual rows=159 loops=1)
              ->  Bitmap Heap Scan on orders o  (actual rows=159 loops=1)
                    ->  Bitmap Index Scan on orders_customer_date_idx
                          Index Cond: (customer_id = 77)
```

PostgreSQL finds customer 77's 159 orders with the index, builds a hash table from them, then scans all order lines and probes the hash. You will meet the same join strategies (hash join, sort-merge join, nested loop) in Spark in module 8, where the expensive part becomes moving data between machines.

## Partitioning

A partitioned table is one logical table stored as many physical ones, split by a key. Queries that filter on the key read only the partitions they need (**partition pruning**), and old data can be removed by dropping or detaching a whole partition instead of running a slow `DELETE`. Big event and order tables are usually partitioned by date.

Build a monthly range-partitioned copy of orders in a practice schema:

```sql
CREATE SCHEMA IF NOT EXISTS lab;

CREATE TABLE lab.orders_by_month (
    order_id     bigint    NOT NULL,
    customer_id  bigint    NOT NULL,
    warehouse_id bigint    NOT NULL,
    order_date   date      NOT NULL,
    status       text      NOT NULL,
    channel      text      NOT NULL,
    updated_at   timestamp NOT NULL,
    PRIMARY KEY (order_id, order_date)
) PARTITION BY RANGE (order_date);

-- one partition per month, January 2024 to July 2026
DO $$
DECLARE m date;
BEGIN
    FOR m IN SELECT generate_series(date '2024-01-01', date '2026-07-01', interval '1 month')::date LOOP
        EXECUTE format(
            'CREATE TABLE lab.orders_%s PARTITION OF lab.orders_by_month FOR VALUES FROM (%L) TO (%L)',
            to_char(m, 'YYYY_MM'), m, (m + interval '1 month')::date);
    END LOOP;
END $$;

-- catches any row outside the ranges instead of failing the insert
CREATE TABLE lab.orders_default PARTITION OF lab.orders_by_month DEFAULT;

INSERT INTO lab.orders_by_month SELECT * FROM app.orders;
```

Things to notice:

- **Ranges are half-open.** `FROM ('2026-06-01') TO ('2026-07-01')` includes 1 June and excludes 1 July, so every date lands in exactly one partition.
- **The primary key must include the partition key.** `PRIMARY KEY (order_id)` alone fails with "unique constraint on partitioned table must include all partitioning columns", because PostgreSQL can only enforce uniqueness within each partition.
- **`DO $$ ... $$`** runs a small PL/pgSQL block, here to create 31 partitions in a loop instead of typing them.

Check that pruning works:

```sql
EXPLAIN SELECT count(*) FROM lab.orders_by_month
WHERE order_date >= '2026-06-01' AND order_date < '2026-07-01';
```

```text
Aggregate  (cost=10.67..10.68 rows=1 width=8)
  ->  Seq Scan on orders_2026_06 orders_by_month  (cost=0.00..9.71 rows=381 width=0)
        Filter: ((order_date >= '2026-06-01'::date) AND (order_date < '2026-07-01'::date))
```

Only the June 2026 partition is read. Write the filter as `date_trunc('month', order_date) = '2026-06-01'` instead, and the plan becomes an `Append` over all 32 partitions: the function hides the key from the planner, just as it hides a column from an index.

Partitioning adds complexity, so do not reach for it early. PostgreSQL's documentation suggests it when a table is larger than the server's memory. ShopLink's 9,000 orders do not need it; the idea matters because the same idea, splitting data by date so queries skip what they do not need, is how data lakes are organised in module 5.

## Resources

- docs: [Using EXPLAIN](https://www.postgresql.org/docs/17/using-explain.html) · PostgreSQL 17 documentation · How to read plans, costs, ANALYZE and BUFFERS.
- docs: [Indexes](https://www.postgresql.org/docs/17/indexes.html) · PostgreSQL 17 documentation · B-tree and other index types, multicolumn indexes and when indexes are used.
- docs: [Table partitioning](https://www.postgresql.org/docs/17/ddl-partitioning.html) · PostgreSQL 17 documentation · Declarative range, list and hash partitioning, and partition pruning.
- read: [Use The Index, Luke](https://use-the-index-luke.com/) · Markus Winand · A free online book on indexing for developers. The chapters on the WHERE clause and on functions are directly relevant.
- watch: [Database Indexing Explained (with PostgreSQL)](https://www.youtube.com/watch?v=-qNSXK7s7_w) · Hussein Nasser · 520K subscribers · 402.1K views · 11,163 likes · published 2020-09-30 · checked 2026-09-27 · 18 min
- watch: [A beginners guide to EXPLAIN ANALYZE: Michael Christofides](https://www.youtube.com/watch?v=31EmOKBP1PY) · Tiger Data (creators of TimescaleDB) · 10.3K subscribers · 11.5K views · 160 likes · published 2021-11-04 · checked 2026-09-27 · 30 min
- watch: [Partitioning your Postgres tables for 20x better performance | POSETTE 2024](https://www.youtube.com/watch?v=TlCjfi0GHW8) · Microsoft Developer · 697K subscribers · 5K views · 116 likes · published 2024-06-13 · checked 2026-09-27 · 26 min

## Practice

1. Run `EXPLAIN (ANALYZE, BUFFERS)` for "all lines of order 105000" before and after creating `order_lines_order_id_idx`, and record the buffers each time.
2. Run `EXPLAIN` on `SELECT * FROM app.orders WHERE customer_id = 77 AND extract(year FROM order_date) = 2025;`. Which part uses the index and which part is a filter? Rewrite it so both conditions use the index.
3. Build `lab.orders_by_month`, then detach the January 2024 partition with `ALTER TABLE lab.orders_by_month DETACH PARTITION lab.orders_2024_01;`. How many rows does `lab.orders_by_month` have now, and where did the January rows go?
4. Save the two `CREATE INDEX` statements in `sql/schema/app_indexes.sql` and add a line running it to `sql/load/load_app.sh`, after the load.

## Example answer

**1.** Before: `Seq Scan`, `Buffers: shared hit=251`. After: `Index Scan using order_lines_order_id_idx`, about 6 buffers. Your exact numbers may differ slightly.

**2.** The plan is a `Bitmap Index Scan` on `orders_customer_date_idx` with `Index Cond: (customer_id = 77)`, then `Filter: (EXTRACT(year FROM order_date) = '2025'::numeric)` applied to each of the customer's 159 orders. The year condition cannot use the index because of the function. The rewrite:

```sql
SELECT * FROM app.orders
WHERE customer_id = 77
  AND order_date >= date '2025-01-01'
  AND order_date <  date '2026-01-01';
```

Now the plan's index condition includes both columns: `Index Cond: ((customer_id = 77) AND (order_date >= ...) AND (order_date < ...))`.

**3.** The table now has 8,932 rows: 9,088 less January 2024's 156. The rows were not deleted: `lab.orders_2024_01` still exists as an ordinary table, which you could archive or drop. Detaching is instant however big the partition is, which is why partitioned tables make retention ("keep 24 months") cheap.

**4.** `sql/schema/app_indexes.sql`:

```sql
CREATE INDEX IF NOT EXISTS order_lines_order_id_idx ON app.order_lines (order_id);
CREATE INDEX IF NOT EXISTS orders_customer_date_idx ON app.orders (customer_id, order_date);
```

and in `load_app.sh`, after the last line: `psql_app < sql/schema/app_indexes.sql`. Creating indexes after a bulk load is faster than loading into indexed tables, which is a common trick for large loads.

# Lesson: SQL for pipelines (deduplication, change detection)

minutes: 55

## The four questions every load asks

Whenever new data arrives, a pipeline has to answer four questions, and SQL answers each in a standard way:

| Question | Pattern |
|---|---|
| Are there duplicates in what arrived? | `DISTINCT ON` or `row_number()` per key |
| Which rows are new? | Anti-join: rows whose key is not in the target |
| Which existing rows changed? | Compare `updated_at`, or compare a hash of the columns |
| Do we overwrite or keep history? | Upsert (Type 1) or close and insert versions (SCD Type 2) |

This lesson practises all four on batch 2, the extract taken on 31 July 2026. Stage it without applying it (the load scripts from lesson 1 are safe to rerun):

```bash
bash sql/load/load_app.sh     # make sure app holds batch 1
docker compose exec -T postgres psql -U shoplink -d shoplink_app -v ON_ERROR_STOP=1 < sql/load/stage.sql
for table in customers orders order_lines; do
  docker compose exec -T postgres psql -U shoplink -d shoplink_app -v ON_ERROR_STOP=1 \
    -c "\copy app_stage.${table} from pstdin with (format csv, header true)" < "data/shoplink-batch-2/${table}.csv"
done
```

`app_stage` now holds batch 2: 430 customers, 565 orders and 1,230 order lines. `app` still holds batch 1.

## Deduplication

Duplicates arrive for many reasons: a file sent twice, an API page read twice, an overlap window on purpose (module 6). Always deduplicate on the **key**, and decide which copy wins:

```sql
-- one row per order, keeping the newest version
SELECT DISTINCT ON (order_id) *
FROM app_stage.orders
ORDER BY order_id, updated_at DESC;
```

`SELECT DISTINCT *` only removes rows that are identical in every column. It removed ShopLink's six exact duplicate lines, but it would keep two versions of an order whose status changed. Deduplicating on the key with an explicit winner handles both cases.

## New rows: the anti-join

```sql
SELECT count(*) AS new_orders
FROM app_stage.orders AS s
WHERE NOT EXISTS (SELECT 1 FROM app.orders AS t WHERE t.order_id = s.order_id);
```

This returns 433, the new July orders. Prefer `NOT EXISTS` to `NOT IN (SELECT ...)`: if the subquery ever returns a NULL, `NOT IN` returns no rows at all, silently.

## Changed rows: updated_at or a hash

**By timestamp.** If the source maintains a reliable `updated_at`, a changed row is one whose `updated_at` is newer than the stored one:

```sql
SELECT count(*) AS changed_orders
FROM app_stage.orders AS s
JOIN app.orders AS t ON t.order_id = s.order_id
WHERE s.updated_at > t.updated_at;    -- 132
```

It is cheap, but it trusts the source. A developer who fixes data with a manual `UPDATE` and forgets to bump `updated_at` makes the change invisible.

**By hash.** Compare the content itself. Hash the columns you care about and compare hashes:

```sql
SELECT count(*) AS changed_customers
FROM app_stage.customers AS s
JOIN app.customers AS t ON t.customer_id = s.customer_id
WHERE md5(row(s.customer_name, s.customer_type, s.email, s.city, s.state)::text)
   <> md5(row(t.customer_name, t.customer_type, t.email, t.city, t.state)::text);
```

This returns 20, the same customers whose `updated_at` moved, which is a good sign the source's timestamps are honest. `row(...)::text` turns the columns into one string such as `(Ajayi Gadgets,reseller,...,Lekki,Lagos)`. It handles NULLs safely (a NULL city becomes an empty slot, which is different from the text `''` shown as `""`), whereas `a || b` returns NULL if any part is NULL and `concat_ws` silently skips NULLs, so two different rows could hash the same.

A hash also lets you detect change without keeping the old values: store the hash next to each row, and compare the new hash with the stored one. That is exactly what the SCD Type 2 table below does.

## Slowly changing dimensions: Type 1 and Type 2

When a customer moves from Port Harcourt to Sango Ota, what should the warehouse remember?

- **Type 1: overwrite.** The upsert from lesson 3. The table shows only the current value; history is lost. Right for corrections, such as a typo in a name.
- **Type 2: add a version.** Close the old row by setting its `valid_to`, and insert a new row that is valid from the change. Every version is kept, so revenue from before the move stays in Port Harcourt.

A Type 2 table has, for each version, `valid_from`, `valid_to` (a far-future `9999-12-31` for the current version) and an `is_current` flag. Build one in the practice schema:

```sql
CREATE TABLE lab.customer_history (
    customer_id    bigint    NOT NULL,
    customer_name  text      NOT NULL,
    customer_type  text      NOT NULL,
    city           text,
    state          text      NOT NULL,
    valid_from     timestamp NOT NULL,
    valid_to       timestamp NOT NULL,
    is_current     boolean   NOT NULL,
    row_hash       text      NOT NULL,       -- hash of the tracked columns
    PRIMARY KEY (customer_id, valid_from)
);
```

Save the change logic as `sql/transforms/customer_history_scd2.sql`. It reads whatever is in `app_stage.customers` and applies it:

```sql
BEGIN;

CREATE TEMP TABLE incoming ON COMMIT DROP AS
SELECT s.*,
       md5(row(s.customer_type, s.city, s.state)::text) AS row_hash
FROM app_stage.customers AS s;

-- 1. Close the current version of every customer whose tracked columns changed.
UPDATE lab.customer_history AS h
SET valid_to = i.updated_at,
    is_current = false
FROM incoming AS i
WHERE h.customer_id = i.customer_id
  AND h.is_current
  AND h.row_hash <> i.row_hash;

-- 2. Add a current version for every customer that has none now: changed or brand new.
INSERT INTO lab.customer_history
    (customer_id, customer_name, customer_type, city, state, valid_from, valid_to, is_current, row_hash)
SELECT i.customer_id, i.customer_name, i.customer_type, i.city, i.state,
       CASE WHEN EXISTS (SELECT 1 FROM lab.customer_history AS h WHERE h.customer_id = i.customer_id)
            THEN i.updated_at
            ELSE timestamp '1900-01-01' END,
       timestamp '9999-12-31', true, i.row_hash
FROM incoming AS i
WHERE NOT EXISTS (
    SELECT 1 FROM lab.customer_history AS h
    WHERE h.customer_id = i.customer_id AND h.is_current
);

COMMIT;
```

Only `customer_type`, `city` and `state` are tracked: a change of name is treated as a correction and does not create a version. A customer's first version is valid from `1900-01-01`, because you do not know what the record looked like before you first saw it, and old orders must still find a match. The two steps run in one transaction, so a reader never sees a customer with no current version.

Run it once with batch 1 staged, then once with batch 2 staged:

| After | Rows | Current rows |
|---|---|---|
| Batch 1 | 400 | 400 |
| Batch 2 | 450 | 430 |
| Batch 2 again | 450 | 430 |

The 20 changed customers now have two versions each, the 30 new customers one each, and rerunning changes nothing. Customer 31, for example:

```text
 customer_id | city          | state  | valid_from          | valid_to            | is_current
-------------+---------------+--------+---------------------+---------------------+------------
          31 | Port Harcourt | Rivers | 1900-01-01 00:00:00 | 2026-07-10 15:11:37 | f
          31 | Sango Ota     | Ogun   | 2026-07-10 15:11:37 | 9999-12-31 00:00:00 | t
```

To attach each order to the version that was true when it was placed, join on the key and the date range: `o.customer_id = h.customer_id AND o.order_date >= h.valid_from AND o.order_date < h.valid_to`. The ranges are half-open, so exactly one version matches. You will build ShopLink's real `dim_customer` this way in module 5.

## Resources

- docs: [Row constructors](https://www.postgresql.org/docs/17/sql-expressions.html#SQL-SYNTAX-ROW-CONSTRUCTORS) · PostgreSQL 17 documentation · How `row(...)` builds a composite value, which you cast to text for hashing.
- docs: [String functions, including md5](https://www.postgresql.org/docs/17/functions-string.html) · PostgreSQL 17 documentation · `md5`, `concat_ws`, `btrim` and friends.
- docs: [Type 2: Add New Row](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/type-2/) · Kimball Group · The standard definition of SCD Type 2.
- watch: [SCD Type 1 and Type 2 using SQL | Implementation of Slowly Changing Dimensions](https://www.youtube.com/watch?v=kii_Kukh4po) · Ankit Bansal · 188K subscribers · 46.3K views · 784 likes · published 2024-04-11 · checked 2026-09-27 · 29 min
- deeper: [Fundamentals of Data Engineering](https://www.oreilly.com/library/view/fundamentals-of-data/9781098108298/) · Joe Reis and Matt Housley, O'Reilly (paid) · Chapter 8 covers these transformation patterns, including upserts and change handling.

## Practice

1. Stage batch 2 as shown. Count new orders, changed orders (by `updated_at`) and changed customers (by hash).
2. Find any order in `app_stage.orders` that appears more than once. What would you do if one did?
3. Build `lab.customer_history`, run `customer_history_scd2.sql` with batch 1 staged, then with batch 2 staged, then again. Record the row counts after each run.
4. Write a query that lists the 20 customers whose tracked columns changed, showing old and new state and customer type side by side.

## Example answer

**1.** 433 new orders, 132 changed orders and 20 changed customers, matching the batch 2 README.

**2.**

```sql
SELECT order_id, count(*) FROM app_stage.orders GROUP BY order_id HAVING count(*) > 1;
```

It returns no rows: batch 2 has one row per order. If it did return rows, you would keep the newest with `DISTINCT ON (order_id) ... ORDER BY order_id, updated_at DESC` before applying the batch, because `MERGE` fails if two source rows match the same target row.

**3.** 400 rows (400 current), then 450 (430 current), then 450 (430 current). To stage batch 1 again for the first run: run `stage.sql`, then `\copy` only `data/shoplink/customers.csv` into `app_stage.customers`.

**4.**

```sql
SELECT old.customer_id, old.customer_name,
       old.state AS old_state, new.state AS new_state,
       old.customer_type AS old_type, new.customer_type AS new_type,
       new.valid_from AS changed_at
FROM lab.customer_history AS old
JOIN lab.customer_history AS new
  ON new.customer_id = old.customer_id
 AND new.valid_from = old.valid_to
ORDER BY changed_at;
```

It returns 20 rows. Joining each version to the one that starts where it ends (`new.valid_from = old.valid_to`) is a neat way to pair versions; a `lag()` over `valid_from` per customer works too. Some customers changed state, some changed type: for example customer 26 went from reseller to business on 2026-07-18.

# Quiz

passing_score: 70

### Loading orders.csv straight into app.orders fails with a foreign key error. What is the best fix?

- [ ] Drop the foreign key so every row loads
- [ ] Delete the three orphan rows from the CSV by hand
- [x] Load into constraint-free staging tables, insert only valid rows, and record the rest in a rejects table with a reason
- [ ] Load the orders before the customers

> Staging first means every row lands, the constraints stay in force, and nothing is lost silently: each rejected row is kept with its reason for someone to fix at the source.

### In PostgreSQL, what does `SELECT 5 / 100` return?

- [x] 0, because dividing two integers does integer division
- [ ] 0.05
- [ ] An error
- [ ] NULL

> Integer division truncates. Write `5 / 100.0` or cast to numeric, or every ShopLink discount disappears from the revenue calculation.

### Why does `ON CONFLICT (order_id) DO UPDATE ... WHERE excluded.updated_at > t.updated_at` make a load safe to rerun?

- [ ] It deletes duplicate rows before inserting
- [ ] It locks the table so no one else can write
- [x] It only overwrites a stored row when the incoming version is newer, so replays and late files cannot move data backwards
- [ ] It skips every row that already exists

> The condition turns the upsert into "newest version wins". Running the same batch twice changes nothing the second time, and an old file loaded late cannot overwrite a newer row.

### A monthly range-partitioned orders table is queried with `WHERE date_trunc('month', order_date) = '2026-06-01'`. What happens?

- [ ] Only the June 2026 partition is read
- [x] Every partition is scanned, because the function hides the partition key from the planner
- [ ] The query fails
- [ ] PostgreSQL creates a new partition

> Partition pruning, like index use, needs a condition on the column itself. `order_date >= '2026-06-01' AND order_date < '2026-07-01'` reads one partition.

### A reseller moves from Port Harcourt to Sango Ota, and leadership wants past revenue to stay in Port Harcourt. What should the customer history table do?

- [ ] Overwrite the city (Type 1)
- [x] Close the current row with a valid_to and insert a new current row valid from the change (Type 2)
- [ ] Delete the customer and insert a new one with a new id
- [ ] Ignore the change

> SCD Type 2 keeps every version with its validity range, so each order joins to the version that was true when it was placed.

# Project: Build and load ShopLink's app database

max_score: 100

## Brief

ShopLink's app team has handed you the batch 1 export and asked you to stand up the app database it came from, with the constraints the app should have had all along. They also want a repeatable way to apply later extracts: batch 2, taken on 31 July 2026, contains new July orders, June orders whose status changed, and changed and new customers. Applying it must be safe to run twice.

Work in your `shoplink-data-platform` repo on a branch called `feature/app-database`.

## Deliverables

1. **`sql/schema/app.sql`**: the `app` schema in `shoplink_app` with all five tables, sensible types, primary keys, foreign keys, and at least three `CHECK` constraints. A comment on each constraint you decided not to add, saying why (for example, quantity).
2. **A validated load**: `sql/load/stage.sql`, `sql/load/load_app.sql` and `sql/load/load_app.sh`. The load stages every CSV with `\copy` via `docker compose exec`, inserts only valid rows in one transaction, writes every rejected row with a reason to `app_stage.rejects`, and prints a row-count check showing staged = loaded + rejected for every table.
3. **`sql/load/reject_report.sql`**: a query summarising rejects by table and reason, with example keys. Paste its output into the pull request description.
4. **`sql/load/apply_batch2.sql` and `sql/load/apply_batch2.sh`**: stage the three batch 2 files and apply them in one transaction, in foreign key order:
   - customers with `INSERT ... ON CONFLICT DO UPDATE`, only when the incoming `updated_at` is newer, never overwriting `created_at`;
   - orders with `MERGE`: update status and `updated_at` only when the incoming row is newer, insert new orders, and report the counts using `RETURNING merge_action()`;
   - order lines with `ON CONFLICT DO NOTHING`;
   - orders whose customer or warehouse is unknown go to `app_stage.rejects`.
5. **Evidence of idempotency**: in the pull request description, the output of `apply_batch2.sh` run twice. The first run must show 433 inserted and 132 updated orders; the second must change nothing. Include row counts for customers, orders and order lines after both runs.
6. **`sql/schema/app_indexes.sql`** with an index on `order_lines.order_id`, plus one `EXPLAIN (ANALYZE, BUFFERS)` before and after, pasted into the pull request description.

## How to submit

Push the branch and open a pull request into `main` in your `shoplink-data-platform` repository. Paste the pull request link into the submission form, with a one-line note on anything you would like feedback on. If you want a second opinion, share your reject report for peer review.

## Grading guide

| Criterion | Points |
|---|---|
| Schema: correct types, keys, foreign keys and meaningful checks, with reasons for omitted constraints | 20 |
| Batch 1 load stages everything, loads valid rows in one transaction and balances for every table | 20 |
| Reject report finds the 3 orphan orders, their 8 lines and the 6 duplicate lines, with reasons | 15 |
| Batch 2 apply uses ON CONFLICT and MERGE correctly, in foreign key order, newest version wins | 20 |
| Idempotency evidence: 433 inserted and 132 updated on the first run, no change on the second, correct final counts | 15 |
| Index and EXPLAIN evidence, scripts run from the repo root with no manual steps | 10 |
