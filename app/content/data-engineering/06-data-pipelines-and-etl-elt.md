---
module: 6
title: Data Pipelines & ETL/ELT
optional: false
summary: Build ShopLink's first real batch pipeline. You compare ETL and ELT, choose between full, incremental and change data capture loads, land three sources (the app database, the supplier's price file and the orders API) in the bronze bucket and warehouse.raw with loads that are safe to rerun, then harden the pipeline with retries, logging, schema drift checks and pydantic contracts that quarantine bad rows. The module ends with a short introduction to dbt, which turns the raw orders into a tested staging model.
---

# Lesson: ETL vs ELT

minutes: 40

## Three steps, two orders

Every pipeline does three things:

- **Extract**: read data out of a source, such as ShopLink's app database, the orders API or the supplier's CSV file.
- **Load**: write it into the platform: the lake, the warehouse, or both.
- **Transform**: clean, join, reshape and aggregate it into something useful.

ETL and ELT differ only in the order of the last two, and that order changes who does the work and where.

```text
ETL:  source --extract--> transform server (clean, join) --load--> warehouse (finished tables only)
ELT:  source --extract--> --load--> lake / warehouse raw --transform (SQL, dbt, Spark)--> clean layers
```

**ETL** made sense when warehouses were expensive machines in a server room: storage was costly, so you loaded only finished data, and the heavy work ran on a separate server, often in tools such as Informatica or SSIS.

**ELT** won when cloud storage became cheap and compute elastic. You land the raw data first, exactly as it came, then transform it where it sits. That is the pattern this track uses: bronze and `warehouse.raw` hold what arrived, and transformations build silver, staging and marts on top.

| | ETL | ELT |
|---|---|---|
| Where transformation happens | A separate engine, before loading | Inside the warehouse or lake, after loading |
| What lands | Only finished data | Raw data first, clean layers on top |
| When a business rule changes | Re-extract and rerun | Rerun the SQL on raw data you already hold |
| Main languages | Vendor tools, Python | SQL, dbt, Spark |

## Why raw data is your safety net

Suppose ShopLink's finance team decides in 2027 that returned orders should count as revenue until the refund is processed. In an ETL pipeline that filtered returns out before loading, the history you need was never stored. In ELT, every raw order is still in bronze and `raw`. You change one line in a model and rebuild.

The same applies to your own bugs. If the cleaning code in Module 5 had trimmed statuses wrongly, you would fix the code and rebuild from raw, without asking the app team for a new extract, and without calling an API that may only keep a week of history.

## When a small T comes first

ELT is the default, not a law. Some transformation belongs before loading, and many real pipelines are "EtLT": a small t on the way in, the big T later.

- **Privacy.** Under the Nigeria Data Protection Act, you may decide personal data such as phone numbers should never land in the platform at all, so you drop or mask it during extraction.
- **Validation at the boundary.** Checking that each record matches its contract, and quarantining the ones that do not, happens as data arrives. You build this in the validation lesson.
- **Huge or noisy sources.** Raw clickstream or sensor data may be filtered or summarised first to keep costs sensible.

## Where this track does each step

| Step | ShopLink tool | Module |
|---|---|---|
| Extract | Python (`pipelines/steps.py`) | 6 |
| Load | Python into RustFS bronze and `warehouse.raw` | 6 |
| Transform | SQL and dbt in PostgreSQL; Spark on the lake | 5, 6, 8 |
| Orchestrate | Airflow runs the steps in order every day | 7 |

## Resources

- read: [The difference between ETL and ELT](https://aws.amazon.com/compare/the-difference-between-etl-and-elt/) · AWS · A vendor-neutral comparison table.
- read: [ETL vs ELT](https://www.getdbt.com/blog/etl-vs-elt) · dbt Labs · Where each approach fits, from the team behind dbt.
- watch: [What is ETL with a clear example - Data Engineering Concepts](https://www.youtube.com/watch?v=wDTzxdShbd8) · Chandoo · 886K subscribers · 240K views · 7,323 likes · published 2023-04-04 · checked 2026-09-27 · 14 min
- watch: [Data Engineering Course for Beginners](https://www.youtube.com/watch?v=PHsC_t0j1dU) · freeCodeCamp.org · 11.9M subscribers · 1.1M views · 17K likes · published 2024-01-16 · checked 2026-09-27 · 184 min
- deeper: [Fundamentals of Data Engineering](https://www.oreilly.com/library/view/fundamentals-of-data/9781098108298/) · Joe Reis and Matt Housley, O'Reilly (paid) · Chapters 7 and 8 cover ingestion and transformation patterns in depth.

## Practice

ShopLink wants to add two sources: payment records from its payment provider's API (which include customers' phone numbers and bank names), and a Google Sheet where marketing tracks monthly campaign spend. For each:

1. How would you extract it?
2. Would you transform anything before loading, and why?
3. Name one transformation you would do after loading.

Then explain in two sentences why ShopLink should keep bronze files even after silver and the marts are built.

## Example answer

**Payments.** Extract with a scheduled Python job paging through the provider's API with an `updated_since` parameter, like the orders API. Before loading, drop or hash the phone numbers: analytics does not need them, and data you never store cannot leak. After loading, match each payment to its `order_id` and compute days from order to payment.

**Marketing sheet.** Export to CSV on a schedule, or use the Sheets API, and land the file untouched in bronze. No pre-load transformation: keep the sheet exactly as it was, so you can prove where a number came from. After loading, turn the free-text month column into a real date and join spend to monthly revenue.

**Why keep bronze:** definitions change and code has bugs; with bronze you can rebuild every downstream table without going back to the source. It is also the evidence when someone asks where a number came from.

Loading payments fully raw into a tightly restricted schema, instead of masking before load, is also a defensible answer if it is a deliberate, documented choice.

# Lesson: Full, incremental and CDC loads

minutes: 55

## Three ways to copy a table

| Pattern | How it works | Good for | Weak spot |
|---|---|---|---|
| Full load | Copy every row, every run | Small tables: ShopLink's 5 warehouses, 430 customers, 120 products | Slow and wasteful for big, growing tables |
| Incremental load | Copy only rows changed since the last run, using a watermark such as `updated_at` | Big tables with a reliable change timestamp: orders | Misses hard deletes; trusts the source's timestamps |
| Change data capture (CDC) | Read the database's own log of every insert, update and delete | Important tables where deletes matter, or near real time | Needs database access and more infrastructure |

ShopLink's pipeline uses all three ideas: full loads of the app tables (they are small), an incremental load from the orders API, and a look at CDC so you know when to reach for it.

This lesson needs `postgres`, `rustfs` and the mock API. Stop anything else.

## The layout this pipeline writes

| Source | Bronze (exactly as it arrived) | Raw table in `warehouse` |
|---|---|---|
| App database tables | `bronze/app_db/<table>/load_date=YYYY-MM-DD/part-0000.parquet` | `raw.app_customers`, `raw.app_warehouses`, `raw.app_orders`, `raw.app_order_lines` |
| Supplier price file | `bronze/supplier/products/load_date=YYYY-MM-DD/products.csv` | `raw.supplier_products` |
| Orders API | `bronze/orders_api/load_date=YYYY-MM-DD/page-NNNN.json` | `raw.orders_api` |

Every raw table carries `_load_date`. The four `raw.app_*` tables are the ones Module 5's `copy_app_tables.py` created, with the same columns; from now on the pipeline fills them. Products now come from the supplier file, not the app database, so make one change to `sql/transforms/marts.sql`: in `dim_product`, replace both mentions of `raw.app_products` with `raw.supplier_products` (it has the same columns: `product_id`, `product_name`, `category`, `brand`, `unit_cost`, `list_price`, `is_active` and `_load_date`):

```sql
FROM raw.supplier_products
WHERE _load_date = (SELECT max(_load_date) FROM raw.supplier_products)
```

`raw.orders_api` is the table from your Module 3 project. Module 3 also created demo tables `raw.customers`, `raw.products` and `raw.order_lines` from CSVs, and Module 5 left `raw.app_products`; nothing uses them any more, so drop them to avoid confusion:

```sql
-- in psql on the warehouse database: docker compose exec postgres psql -U shoplink -d warehouse
DROP TABLE IF EXISTS raw.customers, raw.products, raw.order_lines, raw.app_products;
TRUNCATE raw.orders_api;     -- clear Module 3's test loads; this pipeline reloads everything
```

## Start pipelines/steps.py

The pipeline lives in one module, `pipelines/steps.py`, as five functions that each take a load date. Module 7's Airflow DAG calls exactly these functions, one task each:

| Function | Does |
|---|---|
| `extract_app_db_tables(load_date)` | Full extract of four app tables to bronze Parquet |
| `extract_supplier_file(load_date, path)` | Lands the supplier's `products.csv` in bronze, byte for byte |
| `extract_orders_api(load_date)` | Incremental extract from the orders API to bronze JSON |
| `validate_bronze(load_date)` | Checks bronze against the contracts, quarantines bad rows (lesson 5) |
| `load_raw(load_date)` | Loads bronze, minus quarantined rows, into `warehouse.raw` (lesson 3) |

Create `pipelines/steps.py` with the top of the file and the three extract functions:

```python
"""ShopLink's daily batch pipeline, as five steps. Every step takes a load date and is safe to rerun.

    extract_app_db_tables  app database tables  -> bronze/app_db/<table>/load_date=.../part-0000.parquet
    extract_supplier_file  supplier products.csv -> bronze/supplier/products/load_date=.../products.csv
    extract_orders_api     orders API            -> bronze/orders_api/load_date=.../page-NNNN.json
    validate_bronze        contracts             -> raw.quarantine, fails above the threshold
    load_raw               bronze minus rejects  -> warehouse.raw.*
"""
import io
import json
import logging
import os
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd
from pydantic import ValidationError

from pipelines import contracts
from pipelines.db import connect
from pipelines.http_utils import get_json
from pipelines.lake import s3, write_partition

log = logging.getLogger("shoplink.steps")

APP_TABLES = ["customers", "warehouses", "orders", "order_lines"]
OVERLAP = timedelta(hours=1)          # re-read the last hour to catch late commits

# dataset name -> (bronze prefix, contract, key column, raw table)
DATASETS = {
    "app_db.customers":   ("bronze/app_db/customers",   contracts.Customer,  "customer_id",   "raw.app_customers"),
    "app_db.warehouses":  ("bronze/app_db/warehouses",  contracts.Warehouse, "warehouse_id",  "raw.app_warehouses"),
    "app_db.orders":      ("bronze/app_db/orders",      contracts.Order,     "order_id",      "raw.app_orders"),
    "app_db.order_lines": ("bronze/app_db/order_lines", contracts.OrderLine, "order_line_id", "raw.app_order_lines"),
    "supplier.products":  ("bronze/supplier/products",  contracts.Product,   "product_id",    "raw.supplier_products"),
    "orders_api.orders":  ("bronze/orders_api",         contracts.Order,     "order_id",      "raw.orders_api"),
}

RAW_DDL = """
CREATE SCHEMA IF NOT EXISTS raw;
CREATE TABLE IF NOT EXISTS raw.app_customers (
    customer_id bigint, customer_name text, customer_type text, email text, city text,
    state text, created_at timestamp, updated_at timestamp, _load_date date NOT NULL);
CREATE TABLE IF NOT EXISTS raw.app_warehouses (
    warehouse_id bigint, warehouse_name text, city text, state text, opened_date date,
    _load_date date NOT NULL);
CREATE TABLE IF NOT EXISTS raw.app_orders (
    order_id bigint, customer_id bigint, warehouse_id bigint, order_date date, status text,
    channel text, updated_at timestamp, _load_date date NOT NULL);
CREATE TABLE IF NOT EXISTS raw.app_order_lines (
    order_line_id bigint, order_id bigint, product_id bigint, quantity integer,
    unit_price bigint, discount_pct smallint, _load_date date NOT NULL);
CREATE TABLE IF NOT EXISTS raw.supplier_products (
    product_id bigint, product_name text, category text, brand text, unit_cost bigint,
    list_price bigint, is_active boolean, _load_date date NOT NULL);
CREATE TABLE IF NOT EXISTS raw.orders_api (
    order_id bigint NOT NULL, customer_id bigint, warehouse_id bigint, order_date date,
    status text, channel text, updated_at timestamp,
    _load_date date NOT NULL, _loaded_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS raw.quarantine (
    dataset text NOT NULL, record_key text, reason text NOT NULL, record jsonb NOT NULL,
    _load_date date NOT NULL, _quarantined_at timestamptz NOT NULL DEFAULT now());
"""


def _check_date(load_date: str) -> str:
    return date.fromisoformat(load_date).isoformat()


def ensure_raw_tables() -> None:
    with connect() as conn:
        conn.execute(RAW_DDL)


# ---------------------------------------------------------------- extract

def extract_app_db_tables(load_date: str) -> dict[str, int]:
    """Full extract of the app tables, all from one consistent snapshot, to bronze as Parquet."""
    load_date = _check_date(load_date)
    counts = {}
    with connect(os.environ["SHOPLINK_APP_DB_URL"]) as conn:
        # REPEATABLE READ: every table is read as of the same moment, so no order
        # appears without its lines because it was committed between two queries.
        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        for table in APP_TABLES:
            cur = conn.execute(f"SELECT * FROM app.{table}")
            df = pd.DataFrame(cur.fetchall(), columns=[c.name for c in cur.description])
            key = write_partition(df, f"bronze/app_db/{table}", load_date)
            counts[table] = len(df)
            log.info("extract app_db.%s: %d rows -> %s", table, len(df), key)
    return counts


def extract_supplier_file(load_date: str, path: str | None = None) -> int:
    """Land the supplier's products.csv in bronze exactly as it arrived (byte for byte)."""
    load_date = _check_date(load_date)
    path = path or f"data/incoming/supplier/{load_date}/products.csv"
    if not Path(path).exists():
        raise FileNotFoundError(f"supplier file not found: {path}")
    fs = s3()
    folder = f"bronze/supplier/products/load_date={load_date}"
    if fs.exists(folder):
        fs.rm(folder, recursive=True)
    fs.put(path, f"{folder}/products.csv")
    rows = sum(1 for _ in open(path, encoding="utf-8")) - 1
    log.info("extract supplier.products: %d rows from %s -> %s", rows, path, folder)
    return rows


def _api_watermark(load_date: str) -> datetime:
    """Newest updated_at loaded by EARLIER load dates, less the overlap window."""
    with connect() as conn:
        newest = conn.execute(
            "SELECT max(updated_at) FROM raw.orders_api WHERE _load_date < %s", [load_date]
        ).fetchone()[0]
    if newest is None:
        return datetime(1900, 1, 1)                 # first run: take everything
    return newest - OVERLAP


def extract_orders_api(load_date: str) -> int:
    """Incremental extract from the orders API, one JSON file per page, to bronze."""
    load_date = _check_date(load_date)
    ensure_raw_tables()
    since = _api_watermark(load_date)
    url = os.environ["SHOPLINK_API_URL"].rstrip("/") + "/orders"
    fs = s3()
    folder = f"bronze/orders_api/load_date={load_date}"
    if fs.exists(folder):
        fs.rm(folder, recursive=True)               # a rerun replaces this date's pages
    page, fetched = 1, 0
    params = {"updated_since": since.strftime("%Y-%m-%d %H:%M:%S"), "page_size": 1000}
    while rows := get_json(url, params={**params, "page": page})["data"]:
        with fs.open(f"{folder}/page-{page:04d}.json", "w") as f:
            json.dump(rows, f)
        fetched += len(rows)
        page += 1
    log.info("extract orders_api: %d rows updated since %s -> %s", fetched, since, folder)
    return fetched
```

It imports `pipelines.contracts`, which you write in lesson 5. For now, create `pipelines/contracts.py` from the validation lesson straight away (it only defines classes), or read ahead: the file is short.

Things to notice:

- **Full loads read one consistent snapshot.** `REPEATABLE READ, READ ONLY` is the isolation level from Module 4: all four queries see the database as of the first one, so an order committed halfway through the extract appears in both `orders` and `order_lines`, or in neither.
- **The supplier file is copied, not parsed.** Bronze keeps the exact bytes the supplier sent. Parsing happens later, in validation and loading, where a failure can be fixed and replayed.
- **The API extract is incremental.** It asks only for orders updated since the watermark, and saves each page as it arrives.

## The watermark and the late commit problem

Your Module 3 extractor used the newest `updated_at` already loaded as the watermark. It has a subtle hole. ShopLink's extract runs at 02:00 and asks for orders updated after the previous run's newest timestamp. A rep updates an order at 01:59:59, but the app commits that change at 02:00:03, after the extractor has read. The order's `updated_at` says 01:59:59, which is before the next run's watermark, so it is **never** picked up.

The fix is an **overlap window**: each run re-reads a short period before the watermark (`OVERLAP = timedelta(hours=1)` above). Some orders arrive twice, which is harmless, because the raw layer keeps every version and the staging model keeps the latest. Cheap duplicates you can remove are always better than missing rows you cannot see.

The watermark comes from **earlier** load dates only (`_load_date < %s`). A rerun of today therefore asks the API for exactly the same window as the first run, instead of starting from today's newest row and fetching almost nothing.

## Run the extracts

Prepare the supplier's daily file drops (in real life the supplier would upload them; here you copy the course file):

```bash
mkdir -p data/incoming/supplier/2026-06-30 data/incoming/supplier/2026-07-31
cp data/shoplink/products.csv data/incoming/supplier/2026-06-30/
cp data/shoplink/products.csv data/incoming/supplier/2026-07-31/
```

Put the app back at 30 June and start the API with batch 1 in a second terminal:

```bash
bash sql/load/load_app.sh
uvicorn pipelines.mock_api:app --port 8000        # second terminal, batch 1 only
```

Then, in the first terminal:

```bash
python -c "
from dotenv import load_dotenv; load_dotenv()
import logging; logging.basicConfig(level=logging.INFO)
from pipelines import steps
steps.ensure_raw_tables()
print(steps.extract_app_db_tables('2026-06-30'))
print(steps.extract_supplier_file('2026-06-30'))
print(steps.extract_orders_api('2026-06-30'))
"
```

You get 400 customers, 5 warehouses, 9,088 orders and 26,765 order lines from the app, 120 products from the file, and 9,091 orders from the API (the API still serves the three orphan orders that the app database rejected in Module 4). Browse the `bronze` bucket in the RustFS console (http://localhost:9001) to see the three sources side by side, or list it from the command line with `aws s3 ls s3://bronze/ --recursive --profile rustfs --endpoint-url http://localhost:9000` (the AWS CLI and `rustfs` profile from Module 5, installed or run with `docker compose run --rm rustfs-init "aws --endpoint-url http://rustfs:9000 s3 ls s3://bronze/ --recursive"`).

## Change data capture

Watermarks have a blind spot: **hard deletes**. A deleted row has no `updated_at` left to find. **CDC** reads the database's transaction log instead, which records every insert, update and delete in commit order. PostgreSQL exposes it through **logical decoding**. Tools such as Debezium read it and publish each change as an event, often to Kafka (Module 9).

You can see the raw material yourself. Logical decoding needs `wal_level=logical`, which you set by adding a `command` to the `postgres` service in `compose.yaml` and recreating the container (your data is in the volume, so it survives):

```yaml
  postgres:
    # ...everything you already have...
    command: ["postgres", "-c", "wal_level=logical"]
```

```bash
docker compose up -d postgres
docker compose exec postgres psql -U shoplink -d shoplink_app
```

```sql
SELECT * FROM pg_create_logical_replication_slot('shoplink_cdc_demo', 'test_decoding');

UPDATE app.orders SET status = 'shipped', updated_at = '2026-07-01 10:00:00' WHERE order_id = 109091;
DELETE FROM app.order_lines WHERE order_line_id = 1;

SELECT lsn, xid, data FROM pg_logical_slot_get_changes('shoplink_cdc_demo', NULL, NULL);
SELECT pg_drop_replication_slot('shoplink_cdc_demo');
```

The changes come back in commit order, each wrapped in `BEGIN` and `COMMIT`, for example:

```text
table app.orders: UPDATE: order_id[bigint]:109091 customer_id[bigint]:108 ... status[text]:'shipped' ...
table app.order_lines: DELETE: order_line_id[bigint]:1
```

The delete is there, with the primary key of the deleted row: exactly what a watermark cannot see. Always drop a slot you are not using: PostgreSQL keeps all the log a slot has not read, and a forgotten slot can fill the disk. Rebuild the app afterwards with `bash sql/load/load_app.sh`. You can keep `wal_level=logical`; it costs a little extra log volume.

## Resources

- read: [What is change data capture?](https://www.confluent.io/learn/change-data-capture/) · Confluent · Log-based CDC compared with query-based approaches.
- docs: [Logical decoding examples](https://www.postgresql.org/docs/17/logicaldecoding-example.html) · PostgreSQL 17 documentation · Replication slots, `test_decoding` and `pg_logical_slot_get_changes`.
- docs: [Debezium connector for PostgreSQL](https://debezium.io/documentation/reference/stable/connectors/postgresql.html) · Debezium · How production CDC reads PostgreSQL's log and publishes events.
- watch: [Change Data Capture (CDC) Explained (with examples)](https://www.youtube.com/watch?v=5KN_feUhtTM) · Irtiza Hafiz · 15.9K subscribers · 92.1K views · 1,303 likes · published 2022-01-19 · checked 2026-09-27 · 8 min

## Practice

1. Create the start of `pipelines/steps.py` and `pipelines/contracts.py`, and run the three extracts for 2026-06-30.
2. For each ShopLink table and source, say whether you would use a full load, an incremental load or CDC, and why: warehouses, customers, orders from the API, order lines from the app, supplier products.
3. Explain, using the late commit example, why the watermark subtracts an hour instead of using the newest `updated_at` exactly.
4. Run the CDC demo and copy the change events into your notes.

## Example answer

**2.**

| Data | Choice | Why |
|---|---|---|
| Warehouses | Full | 5 rows; any change is cheap to recopy |
| Customers | Full | 430 rows; a full copy each day also gives you the daily snapshots Module 5's SCD Type 2 dimension is built from |
| Orders from the API | Incremental | Growing table, reliable `updated_at`, and the API supports `updated_since` |
| Order lines from the app | Full today, incremental or CDC at scale | 28,000 rows is fine to recopy; at 28 million, copy only lines of new orders, or use CDC |
| Supplier products | Full | The supplier sends the whole price list each day |

**3.** "An order updated at 01:59:59 but committed at 02:00:03 is invisible to the 02:00 run, and the next run asks only for rows after the newest timestamp it has, which is later than 01:59:59. Re-reading the last hour catches it; the duplicates this creates are removed by keeping the latest version per order in staging."

**4.** You see `BEGIN`, an `UPDATE` event for order 109091 with every column's new value, `COMMIT`, then a second transaction with the `DELETE` event carrying only `order_line_id[bigint]:1`. By default PostgreSQL logs only the primary key of a deleted row; `ALTER TABLE ... REPLICA IDENTITY FULL` makes it log the whole old row, at the cost of more log.

# Lesson: Idempotency and layers

minutes: 50

## The property that makes reruns safe

A pipeline is **idempotent** when running it twice with the same input gives the same result as running it once. Pipelines are rerun constantly: a task fails halfway and Airflow retries it, someone reruns yesterday after a fix, a backfill replays a month. If a rerun doubles the data, every one of those becomes an incident.

You have met the two standard techniques already:

1. **Replace a partition.** Tag every row with the load it came from (`_load_date`), and have each run delete its own partition, then insert it again, in one transaction. Every step in `steps.py` does this: bronze folders are removed before they are written, and raw rows for the load date are deleted before they are inserted.
2. **Upsert on the key, newest wins.** Module 4's `ON CONFLICT ... WHERE excluded.updated_at > t.updated_at` and `MERGE`, and Module 5's Delta merge.

Watch out for the watermark trap from the last lesson: if the watermark came from today's own data, a rerun would ask for a different window and replace today's partition with an almost empty one. Deriving it from earlier load dates keeps reruns identical.

## The load step

Add the rest of the loading code to `pipelines/steps.py`:

```python
# ---------------------------------------------------------------- read bronze

def read_bronze(dataset: str, load_date: str) -> pd.DataFrame:
    """Read one dataset's bronze partition for load_date into a DataFrame."""
    prefix = DATASETS[dataset][0]
    folder = f"{prefix}/load_date={load_date}"
    fs = s3()
    if not fs.exists(folder):
        raise FileNotFoundError(f"no bronze data for {dataset} on {load_date}: {folder}")
    if dataset == "supplier.products":
        with fs.open(f"{folder}/products.csv", "r", encoding="utf-8") as f:
            return pd.read_csv(f, dtype=str, keep_default_na=False).replace({"": None})
    if dataset == "orders_api.orders":
        rows = []
        for key in sorted(fs.ls(folder)):
            with fs.open(key, "r") as f:
                rows.extend(json.load(f))
        return pd.DataFrame(rows)
    return pd.read_parquet(folder, filesystem=fs)


# ---------------------------------------------------------------- load

def load_raw(load_date: str) -> dict[str, int]:
    """Load each bronze dataset, minus its quarantined rows, into warehouse.raw for load_date."""
    load_date = _check_date(load_date)
    ensure_raw_tables()
    counts = {}
    with connect() as conn:                       # one transaction: every table or none
        for dataset, (_, model, key, table) in DATASETS.items():
            df = read_bronze(dataset, load_date)
            columns = list(model.model_fields)
            rejected = {r[0] for r in conn.execute(
                "SELECT record_key FROM raw.quarantine WHERE dataset = %s AND _load_date = %s",
                [dataset, load_date])}
            df = df[~df[key].astype(str).isin(rejected)][columns].assign(_load_date=load_date)
            buffer = io.StringIO()
            df.to_csv(buffer, index=False, header=False)   # empty field = NULL in CSV COPY
            buffer.seek(0)
            conn.execute(f"DELETE FROM {table} WHERE _load_date = %s", [load_date])
            with conn.cursor().copy(
                f"COPY {table} ({', '.join(columns)}, _load_date) FROM STDIN WITH (FORMAT csv)"
            ) as copy:
                while chunk := buffer.read(1 << 16):
                    copy.write(chunk)
            counts[table] = conn.execute(
                f"SELECT count(*) FROM {table} WHERE _load_date = %s", [load_date]).fetchone()[0]
            log.info("load %s: %d rows for %s", table, counts[table], load_date)
    return counts
```

`load_raw` reads **from bronze**, not from the sources. That is the point of landing first: the load can be rerun, or fixed and replayed, without touching the app, the API or the supplier again. All six tables are loaded in one transaction, so raw never holds half a day. The contract's field list (`model.model_fields`) doubles as the column list, so the columns loaded are exactly the columns the contract promises. Until you write `validate_bronze` in lesson 5, `raw.quarantine` is empty and every row loads.

## Layers: lake and warehouse side by side

ShopLink now has two parallel sets of layers. They are the same idea on two kinds of storage:

| Layer | Lake (RustFS) | Warehouse (PostgreSQL) | Holds | Written by |
|---|---|---|---|---|
| Landing | `bronze/...` | | Exactly what arrived: files and extracts, one folder per load date | `extract_*` steps |
| Raw | | `raw.*` | Bronze rows that passed the contract, typed, with `_load_date` | `load_raw` |
| Cleaned | `silver/...` | `staging.*` | One clean, deduplicated version per record | Spark (Module 8), dbt (this module) |
| Business-ready | `gold/...` | `marts.*` | Facts, dimensions and aggregates | Spark, SQL, dbt |

Two rules keep this manageable: data flows only upwards (staging reads raw, marts read staging or raw, never the other way), and nothing is ever edited by hand in bronze or raw. If something is wrong, fix the code and rebuild from the layer below.

## Prove it

Load 30 June, then move time forward and load 31 July:

```bash
python -c "
from dotenv import load_dotenv; load_dotenv()
from pipelines import steps; print(steps.load_raw('2026-06-30'))"

bash sql/load/apply_batch2.sh          # the app moves to 31 July
# restart the API in the second terminal with both batches:
#   SHOPLINK_BATCHES=shoplink,shoplink-batch-2 uvicorn pipelines.mock_api:app --port 8000
```

Then run the three extracts and `load_raw` for `2026-07-31`, twice. The second day's API extract fetches 574 rows: the 565 new and changed orders in batch 2, plus 9 that the one-hour overlap re-reads. A fingerprint query shows the rerun changed nothing:

```sql
SELECT _load_date, count(*) AS row_count, sum(order_id) AS order_id_sum
FROM raw.orders_api
GROUP BY _load_date
ORDER BY _load_date;
```

Comparing a sum as well as a count matters: a load that replaced the right number of rows with the wrong rows would pass a count check.

## Resources

- read: [How to make data pipelines idempotent](https://www.startdataengineering.com/post/why-how-idempotent-data-pipeline/) · Start Data Engineering · A clear walk through the delete-then-insert pattern and why it matters.
- read: [What is a medallion architecture?](https://www.databricks.com/glossary/medallion-architecture) · Databricks · The bronze, silver and gold naming, as lakehouse teams use it.
- docs: [COPY](https://www.postgresql.org/docs/17/sql-copy.html) · PostgreSQL 17 documentation · How `COPY ... FROM STDIN WITH (FORMAT csv)` treats empty fields as NULL.
- watch: [Dimensional data modeling and idempotent pipelines in 78 minutes with DataExpert.io](https://www.youtube.com/watch?v=JeeqpK3o3LQ) · DataExpert · 264K subscribers · 34.9K views · 901 likes · published 2024-02-09 · checked 2026-09-27 · 78 min

## Practice

1. Add `read_bronze` and `load_raw`, load both dates, and run the 31 July extracts and load a second time. Show the fingerprint query before and after.
2. Make a copy of `load_raw` with the `DELETE` line removed. Run it twice for 31 July and record what happens to the counts. Then restore the real one and rerun to repair raw.
3. Write a query that returns the latest version of each order in `raw.orders_api`, across all load dates. How many rows does it return?

## Example answer

**1.** Both before and after the rerun: 2026-06-30 has 9,091 rows (9,088 once validation quarantines the three orphans in lesson 5) and 2026-07-31 has 574, with identical sums.

**2.** Without the delete, each rerun appends another copy: 31 July grows from 574 to 1,148 rows in `raw.orders_api` (and every other raw table doubles too), and any revenue built on it doubles. Rerunning the real `load_raw` for that date repairs it, because it deletes the whole partition first: an idempotent step can also fix the damage a non-idempotent one did.

**3.**

```sql
SELECT DISTINCT ON (order_id) order_id, lower(btrim(status)) AS status, updated_at, _load_date
FROM raw.orders_api
ORDER BY order_id, updated_at DESC, _load_date DESC;
```

It returns 9,524 rows before validation (9,091 batch 1 orders plus 433 new July orders), or 9,521 once the three orphans are quarantined. Each order appears once, with its newest version. This query is the shape of the dbt staging model at the end of this module.

# Lesson: Errors, retries, logging and schema changes

minutes: 50

## Decide what each failure means

Every failure is one of two kinds, and your code should treat them differently:

| Kind | Examples | Right response |
|---|---|---|
| Transient | Network blip, timeout, HTTP 429 (rate limit), 502, 503, 504, database restarting | Wait and retry, with a limit |
| Permanent | HTTP 400, 401, 403, 404, a missing file, a broken contract, a bug | Fail immediately and loudly; retrying will not help |

Retrying a permanent failure just delays the alert. Not retrying a transient one wakes someone up at 02:00 for a problem that would have fixed itself in ten seconds.

## Retries with tenacity

Your Module 3 `get_json` in `pipelines/http_utils.py` hand-rolls exponential backoff (1, 2, 4, 8, 16 seconds). That is worth understanding, and it is what `steps.py` uses. In larger codebases teams use a library so every retry behaves the same way. The same behaviour with **tenacity** (`echo "tenacity>=9.0" >> requirements.txt`):

```python
import logging

import requests
from tenacity import before_sleep_log, retry, retry_if_exception, stop_after_attempt, wait_exponential

log = logging.getLogger("shoplink.http")
RETRYABLE = {429, 500, 502, 503, 504}


def is_retryable(error: BaseException) -> bool:
    if isinstance(error, (requests.ConnectionError, requests.Timeout)):
        return True
    return isinstance(error, requests.HTTPError) and error.response.status_code in RETRYABLE


@retry(
    retry=retry_if_exception(is_retryable),
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, max=30),          # 1, 2, 4, 8 seconds, capped at 30
    before_sleep=before_sleep_log(log, logging.WARNING),  # log every retry
    reraise=True,                                         # after the last try, raise the real error
)
def get_json(url: str, params: dict | None = None) -> dict:
    response = requests.get(url, params=params, timeout=30)
    response.raise_for_status()
    return response.json()
```

With the API stopped, the log shows each attempt before the real `ConnectionError` is raised:

```text
WARNING shoplink.http: Retrying __main__.get_json in 1.0 seconds as it raised ConnectionError: ...
WARNING shoplink.http: Retrying __main__.get_json in 2.0 seconds as it raised ConnectionError: ...
```

Retries must sit on top of idempotent steps. A retried extract rewrites the same bronze folder; a retried load deletes and reloads the same partition. That is why lesson 3 came first. Module 7 adds a second layer of retries in Airflow, at the task level.

## Logging that helps at 06:00

A good log line answers: which step, which load date, how many rows, where, and how long. `steps.py` logs with `logging.getLogger("shoplink.steps")`. Save the runner that calls all five steps as `pipelines/run_batch.py`:

```python
"""Run ShopLink's whole daily batch for one load date, then build the dbt models.

    python -m pipelines.run_batch --load-date 2026-07-31
    python -m pipelines.run_batch --load-date 2026-07-31 --skip-dbt

Every step is idempotent, so rerunning a date is always safe.
"""
import argparse
import logging
import subprocess
import sys
import time

from dotenv import load_dotenv

from pipelines import steps
from pipelines.db import connect

log = logging.getLogger("shoplink.run_batch")

RUNS_DDL = """
CREATE TABLE IF NOT EXISTS raw.pipeline_runs (
    load_date date NOT NULL, step text NOT NULL, status text NOT NULL,
    detail text, seconds numeric, finished_at timestamptz NOT NULL DEFAULT now())
"""


def record(load_date: str, step: str, status: str, detail: str, seconds: float) -> None:
    with connect() as conn:
        conn.execute(RUNS_DDL)
        conn.execute(
            "INSERT INTO raw.pipeline_runs (load_date, step, status, detail, seconds) "
            "VALUES (%s, %s, %s, %s, %s)", [load_date, step, status, detail[:1000], round(seconds, 2)])


def run_step(load_date: str, name: str, func, *args):
    start = time.perf_counter()
    try:
        result = func(load_date, *args)
    except Exception as error:
        record(load_date, name, "failed", repr(error), time.perf_counter() - start)
        log.exception("step %s failed for %s", name, load_date)
        raise
    record(load_date, name, "succeeded", str(result), time.perf_counter() - start)
    return result


def main() -> int:
    load_dotenv()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--load-date", required=True)
    parser.add_argument("--supplier-file", default=None)
    parser.add_argument("--skip-dbt", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    ld = args.load_date
    steps.ensure_raw_tables()
    try:
        run_step(ld, "extract_app_db_tables", steps.extract_app_db_tables)
        run_step(ld, "extract_supplier_file", steps.extract_supplier_file, args.supplier_file)
        run_step(ld, "extract_orders_api", steps.extract_orders_api)
        run_step(ld, "validate_bronze", steps.validate_bronze)
        run_step(ld, "load_raw", steps.load_raw)
        if not args.skip_dbt:
            start = time.perf_counter()
            done = subprocess.run(["dbt", "build"], cwd="shoplink_dbt")
            status = "succeeded" if done.returncode == 0 else "failed"
            record(ld, "dbt_build", status, f"exit {done.returncode}", time.perf_counter() - start)
            if done.returncode:
                raise RuntimeError("dbt build failed")
    except Exception:
        log.error("batch for %s failed; fix the cause and rerun the same date", ld)
        return 1
    log.info("batch for %s finished", ld)
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

Three habits are built in:

- **Logs go to the terminal (and later to Airflow's task log), with a timestamp, level and logger name.** `log.exception` includes the full traceback.
- **Every step is recorded in `raw.pipeline_runs`** with its status, result and duration. "Did last night load the usual number of rows?" becomes a query, and Module 7's monitoring builds on it.
- **The exit code tells the truth.** `0` means success, `1` means failure, so a scheduler (cron, GitHub Actions, Airflow) can react.

## Schema changes

Sources change shape. The supplier adds a `currency` column; the API renames `channel` to `sales_channel`; the app team widens a field. How you react should be a decision, not an accident. This is what a **data contract** at the boundary is for: a written, versioned description of what each source must send.

| Change | Typical policy | Why |
|---|---|---|
| New column | Accept, ignore it for now, and warn | Nothing downstream depends on it yet; someone should decide whether to use it |
| Missing or renamed column | Fail | Downstream models would silently get NULLs |
| Type change (number becomes text) | Fail at validation | Loading it would break or corrupt raw |
| New allowed value (a new status) | Fail validation for those rows, or update the contract deliberately | New values often mean new business rules |

`contracts.check_columns` (next lesson) compares each dataset's columns with its contract, and `validate_bronze` fails on missing columns and logs a warning for new ones. When you decide to accept a new column, you evolve the schema on purpose: add it to the contract, `ALTER TABLE raw.<table> ADD COLUMN ...`, and let old rows hold NULL. Table formats make the same decision explicit: Delta rejects a write with an unexpected column unless you pass `schema_mode="merge"`.

## Resources

- docs: [Tenacity](https://tenacity.readthedocs.io/en/latest/) · Tenacity documentation · Retry conditions, stop and wait strategies, and logging hooks.
- docs: [Logging HOWTO](https://docs.python.org/3/howto/logging.html) · Python documentation · Loggers, levels, handlers and formats.
- read: [Data Contract](https://datacontract.com/) · datacontract.com · What a data contract contains, with examples of the open YAML format and a CLI that tests sources against it.
- deeper: [Fundamentals of Data Engineering](https://www.oreilly.com/library/view/fundamentals-of-data/9781098108298/) · Joe Reis and Matt Housley, O'Reilly (paid) · Chapter 7 on ingestion covers schema evolution, error handling and monitoring.

## Practice

1. Save `pipelines/run_batch.py` and run `python -m pipelines.run_batch --load-date 2026-07-31 --skip-dbt`. Query `raw.pipeline_runs`.
2. Stop the mock API and run it again. How long does it take to fail, what does the log show, and what is recorded in `raw.pipeline_runs`? Restart the API and rerun the same date.
3. Simulate schema drift: make a copy of the 31 July supplier file with an extra `currency` column (value `NGN` on every row), run the batch with `--supplier-file` pointing at it, and read the warning. Then delete the `brand` column instead and run again. What happens?

## Example answer

**1.** Five rows for 2026-07-31, one per step, all `succeeded`, with details such as `{'customers': 430, 'warehouses': 5, 'orders': 9521, 'order_lines': 27995}` for the app extract and durations of a second or two each.

**2.** The app and supplier steps succeed; `extract_orders_api` retries with growing waits (about 31 seconds in total with Module 3's `get_json`), then fails with `RuntimeError: Gave up on http://localhost:8000/orders after 5 attempts`. The log ends with `batch for 2026-07-31 failed; fix the cause and rerun the same date`, the exit code is 1, and `raw.pipeline_runs` has a `failed` row for `extract_orders_api` with the error text. Validation and load never ran, so raw still holds the previous good data for that date. After restarting the API, rerunning the same date succeeds, and because every step is idempotent there is nothing to clean up.

**3.** With the extra column the batch succeeds and logs `supplier.products: new columns ['currency'] ignored (schema drift: update the contract?)`. With `brand` missing it fails in `validate_bronze` with `ValueError: supplier.products: contract broken, missing columns ['brand']`, and nothing is loaded. You could create the files with pandas:

```python
import pandas as pd

df = pd.read_csv("data/incoming/supplier/2026-07-31/products.csv")
df.assign(currency="NGN").to_csv("/tmp/products_with_currency.csv", index=False)
df.drop(columns="brand").to_csv("/tmp/products_without_brand.csv", index=False)
```

# Lesson: Validation at ingestion

minutes: 50

## Check records before they spread

A bad value is cheapest to catch at the boundary, before it has been joined into ten models and shown on a dashboard. **pydantic** lets you describe a valid record as a Python class and check any record against it. The contracts for ShopLink's sources live in `pipelines/contracts.py` (add `pydantic>=2.8` to `requirements.txt`):

```python
"""Data contracts for ShopLink's batch sources: what a valid record looks like at the boundary."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

STATUSES = {"pending", "shipped", "delivered", "cancelled", "returned"}


class Contract(BaseModel):
    # Unknown extra columns are ignored here; check_columns() reports them as schema drift.
    model_config = ConfigDict(extra="ignore")


class Customer(Contract):
    customer_id: int
    customer_name: str = Field(min_length=1)
    customer_type: Literal["reseller", "school", "business"]
    email: str
    city: str | None = None          # 12 customers have no city: allowed, reported, not rejected
    state: str
    created_at: datetime
    updated_at: datetime


class Warehouse(Contract):
    warehouse_id: int
    warehouse_name: str
    city: str
    state: str
    opened_date: date


class Order(Contract):
    order_id: int
    customer_id: int
    warehouse_id: int
    order_date: date
    status: str
    channel: Literal["web", "whatsapp", "sales_rep"]
    updated_at: datetime

    @field_validator("status")
    @classmethod
    def known_status(cls, value: str) -> str:
        # Messy casing is allowed (staging cleans it); a genuinely new status is not.
        if value.strip().lower() not in STATUSES:
            raise ValueError(f"unknown status {value!r}")
        return value


class OrderLine(Contract):
    order_line_id: int
    order_id: int
    product_id: int
    quantity: int = Field(gt=0)
    unit_price: int = Field(ge=0)
    discount_pct: Literal[0, 5, 10, 15]


class Product(Contract):
    product_id: int
    product_name: str
    category: str
    brand: str
    unit_cost: int = Field(ge=0)
    list_price: int = Field(ge=0)
    is_active: bool


def check_columns(columns: list[str], model: type[BaseModel]) -> tuple[list[str], list[str]]:
    """Compare a source's columns with the contract. Returns (missing, unexpected)."""
    expected = list(model.model_fields)
    missing = [c for c in expected if c not in columns and model.model_fields[c].is_required()]
    unexpected = [c for c in columns if c not in expected]
    return missing, unexpected
```

pydantic converts as it checks: the supplier CSV's text `"842000"` becomes the integer 842000 and `"true"` becomes `True`, while `"abc"` in a number field is rejected. Notice the decisions written into the contract: a NULL city is allowed (it is real, and staging labels it "Unknown"), a messy status is allowed but an unknown one is not, and a quantity of 0 is not allowed.

## Not every problem is a reject

ShopLink's planted problems show that validation is a set of decisions, not one rule:

| Problem | Decision in this pipeline | Where |
|---|---|---|
| 2 order lines with quantity 0 and -2 | Quarantine | `OrderLine` contract |
| 3 API orders for customers 9001 to 9003 | Quarantine: unknown customer | Cross-check in `validate_bronze` |
| Status casing and spaces | Accept; clean in staging | `Order` contract allows it |
| 12 customers with no city | Accept; label "Unknown" in the dimension | `Customer` contract allows it |
| 11 recent lines on inactive products | Accept and report; it is a business question | A check query, not a reject |
| 6 duplicate order lines | Already rejected by the app database's primary key in Module 4 | Source constraint |

**Quarantine** means: do not drop the row silently, and do not crash the whole load because of it. Write it somewhere, with the reason, where someone will look. ShopLink's quarantine is a table, `raw.quarantine`, so it can be queried and counted next to the data. (A `quarantine/` prefix in the lake, with one JSON file per dataset and date, is an equally common choice.)

Then add a **threshold**. Two bad rows out of 27,995 is a data entry slip. Two thousand is a broken source, and loading the rest would hide the problem. The pipeline fails if more than 2% of any dataset is quarantined. The limit comes from the `SHOPLINK_QUARANTINE_THRESHOLD` environment variable (default `0.02`), or from an argument, which Module 7 fills from an Airflow variable.

## The validate step

Add this to `pipelines/steps.py`, between the extract and load sections:

```python
# ---------------------------------------------------------------- validate

def _threshold(threshold: float | None) -> float:
    if threshold is not None:
        return threshold
    return float(os.environ.get("SHOPLINK_QUARANTINE_THRESHOLD", "0.02"))


def validate_bronze(load_date: str, threshold: float | None = None) -> dict[str, dict]:
    """Check every bronze dataset for load_date against its contract.

    Bad rows go to raw.quarantine with the reason. Raises if any dataset's bad-row ratio
    is above the threshold (default 2%), because that means a broken source, not a typo.
    """
    load_date = _check_date(load_date)
    limit = _threshold(threshold)
    ensure_raw_tables()
    customers = read_bronze("app_db.customers", load_date)
    known_customers = set(int(c) for c in customers["customer_id"])
    rejects, summary = [], {}

    for dataset, (_, model, key, _) in DATASETS.items():
        df = read_bronze(dataset, load_date)
        missing, unexpected = contracts.check_columns(list(df.columns), model)
        if missing:
            raise ValueError(f"{dataset}: contract broken, missing columns {missing}")
        if unexpected:
            log.warning("%s: new columns %s ignored (schema drift: update the contract?)", dataset, unexpected)
        bad = 0
        for record in df.astype(object).where(df.notna(), None).to_dict("records"):
            reason = None
            try:
                row = model.model_validate(record)
                if dataset == "orders_api.orders" and row.customer_id not in known_customers:
                    reason = "unknown customer_id"
            except ValidationError as error:
                first = error.errors()[0]
                reason = f"{'.'.join(map(str, first['loc']))}: {first['msg']}"
            if reason:
                bad += 1
                rejects.append((dataset, str(record.get(key)), reason,
                                json.dumps(record, default=str), load_date))
        ratio = bad / len(df) if len(df) else 0.0
        summary[dataset] = {"rows": len(df), "quarantined": bad, "ratio": round(ratio, 5)}
        log.info("validate %s: %d rows, %d quarantined (%.2f%%)", dataset, len(df), bad, 100 * ratio)

    with connect() as conn:                       # replace this date's quarantine rows
        conn.execute("DELETE FROM raw.quarantine WHERE _load_date = %s", [load_date])
        with conn.cursor().copy(
            "COPY raw.quarantine (dataset, record_key, reason, record, _load_date) FROM STDIN"
        ) as copy:
            for row in rejects:
                copy.write_row(row)

    too_bad = {d: s["ratio"] for d, s in summary.items() if s["ratio"] > limit}
    if too_bad:
        raise RuntimeError(f"quarantine ratio above {limit:.0%}: {too_bad}")
    return summary
```

The quarantine rows for a date are replaced on every run, like everything else, so validation is idempotent too. The quarantine table is written **before** the threshold check, so even a failed run leaves the evidence behind. `load_raw` then skips every quarantined key.

The orphan check is a **cross-source** rule: it compares the API's orders with the customers extracted from the app on the same load date. Row-level contracts cannot see it, because a single order with `customer_id` 9001 is perfectly well formed.

## Run it

With the API serving batch 1 and the app reset to 30 June (as in lesson 2), run the whole batch without dbt:

```bash
python -m pipelines.run_batch --load-date 2026-06-30 --skip-dbt
```

```text
INFO shoplink.steps: validate app_db.order_lines: 26765 rows, 2 quarantined (0.01%)
INFO shoplink.steps: validate orders_api.orders: 9091 rows, 3 quarantined (0.03%)
INFO shoplink.steps: load raw.app_order_lines: 26763 rows for 2026-06-30
INFO shoplink.steps: load raw.orders_api: 9088 rows for 2026-06-30
```

```sql
SELECT dataset, reason, count(*), array_agg(record_key ORDER BY record_key) AS keys
FROM raw.quarantine
WHERE _load_date = '2026-06-30'
GROUP BY dataset, reason;
```

```text
      dataset       |                   reason                   | count |          keys
--------------------+--------------------------------------------+-------+------------------------
 app_db.order_lines | quantity: Input should be greater than 0   |     2 | {21582,3540}
 orders_api.orders  | unknown customer_id                        |     3 | {105936,107041,107057}
```

Keys are stored as text, so they sort as text. Every planted problem that should be a reject is caught, with a reason a person can act on.

## Resources

- docs: [Models](https://docs.pydantic.dev/latest/concepts/models/) · pydantic documentation · Defining models, validation and conversion.
- docs: [Validators](https://docs.pydantic.dev/latest/concepts/validators/) · pydantic documentation · Field validators such as `known_status`.
- read: [Great Expectations: data validation concepts](https://docs.greatexpectations.io/docs/core/introduction/) · Great Expectations · A larger framework for the same idea, common in data teams.
- watch: [Pydantic Tutorial • Solving Python's Biggest Problem](https://www.youtube.com/watch?v=XIdQ6gO3Anc) · pixegami · 85K subscribers · 513.5K views · 14,736 likes · published 2023-09-18 · checked 2026-09-27 · 11 min

## Practice

1. Add `validate_bronze` and run the batch for 2026-06-30 and 2026-07-31 (with batch 2 applied and the API serving both batches). Show the quarantine report for both dates.
2. Test the threshold: run `validate_bronze('2026-07-31', threshold=0.00001)` from Python. What happens, and is anything written?
3. Add a rule: an order's `updated_at` must not be earlier than its `order_date`. Where does it go, and how many ShopLink orders break it?
4. Write the check query for "order lines on inactive products since 2026-03-01" against `raw.app_order_lines` and `raw.supplier_products`, and explain why it reports instead of rejecting.

## Example answer

**1.** 30 June: 2 order lines (3540 and 21582) and 3 API orders (105936, 107041, 107057). 31 July: the same 2 order lines (the app still holds them), and no API rejects, because the orphans' orders did not change and so were not re-sent.

**2.** It raises `RuntimeError: quarantine ratio above 0%: {'app_db.order_lines': 7e-05}`. The quarantine rows are still written first, so you can see exactly what tripped it. In `run_batch`, the batch would stop before `load_raw`, leaving yesterday's raw data untouched.

**3.** A `model_validator` on `Order`, because it compares two fields:

```python
from pydantic import model_validator

class Order(Contract):
    ...
    @model_validator(mode="after")
    def updated_after_ordered(self):
        if self.updated_at.date() < self.order_date:
            raise ValueError("updated_at is before order_date")
        return self
```

ShopLink's data has no such orders, so nothing new is quarantined, which is the normal state of a good rule: it guards against tomorrow's problem.

**4.**

```sql
SELECT p.product_id, p.product_name, count(*) AS lines, max(o.order_date) AS last_ordered
FROM raw.app_order_lines AS l
JOIN raw.app_orders AS o ON o.order_id = l.order_id AND o._load_date = l._load_date
JOIN raw.supplier_products AS p ON p.product_id = l.product_id AND p._load_date = l._load_date
WHERE l._load_date = '2026-06-30' AND NOT p.is_active AND o.order_date >= '2026-03-01'
GROUP BY p.product_id, p.product_name
ORDER BY last_ordered DESC;
```

It finds 11 lines on 7 inactive products. These are real sales: rejecting them would understate revenue. Either the supplier's flag is out of date or reps are selling discontinued stock, which is a question for the business, so the pipeline reports it and loads the rows.

# Lesson: Transforming with dbt (a short intro)

minutes: 45

## What dbt adds

You have written transformations as SQL files run by `psql` (Module 5's `marts.sql`). That works, but you had to handle the order of tables, the drops and creates, and the checks yourself. **dbt** (data build tool) takes a folder of `SELECT` statements and does the rest: it works out the dependency order from references between models, creates the tables or views, runs tests, and generates documentation. It is the standard tool for the T in ELT.

This lesson is deliberately short: one project, one model, a few tests. The Analytics Engineering track spends four modules on dbt (materialisations, incremental models, snapshots, macros, packages, contracts); here you need enough to run it from your pipeline and, in Module 7, from Airflow.

## Install and set up

Append to `requirements.txt` and install:

```bash
cat >> requirements.txt <<'EOF'
dbt-core>=1.10
dbt-postgres>=1.11,<1.12
EOF
pip install -r requirements.txt
dbt --version
```

Create the project folder `shoplink_dbt/` in the repo root with this layout:

```text
shoplink_dbt/
  dbt_project.yml
  profiles.yml
  models/
    staging/
      _sources.yml
      _stg_models.yml
      stg_orders.sql
```

`shoplink_dbt/dbt_project.yml`:

```yaml
name: shoplink_dbt
version: "1.0.0"
profile: shoplink

model-paths: ["models"]
test-paths: ["tests"]
target-path: target
clean-targets: ["target", "dbt_packages"]

models:
  shoplink_dbt:
    staging:
      +materialized: view
```

`shoplink_dbt/profiles.yml` tells dbt how to connect. It reads the password and host from environment variables, so the file contains no secrets and is safe to commit:

```yaml
shoplink:
  target: dev
  outputs:
    dev:
      type: postgres
      host: "{{ env_var('DBT_HOST', 'localhost') }}"
      port: 5432
      user: shoplink
      password: "{{ env_var('POSTGRES_PASSWORD') }}"
      dbname: warehouse
      schema: staging
      threads: 4
```

`DBT_HOST` defaults to `localhost` on your laptop; inside a container (Airflow in Module 7) it is `postgres`. Add `DBT_HOST=localhost` to `.env.example` and `.env`. dbt looks for `profiles.yml` in the folder you run it from first, which is why you run dbt from inside `shoplink_dbt/`. Your Module 2 `.gitignore` already ignores `target/` and `dbt_packages/`.

## A source, a model and tests

`models/staging/_sources.yml` declares the raw table dbt reads:

```yaml
version: 2

sources:
  - name: raw
    schema: raw
    tables:
      - name: orders_api
        description: Orders from the ShopLink orders API, every version received, one partition per _load_date.
```

`models/staging/stg_orders.sql` is the query from the idempotency lesson, as a model:

```sql
-- One row per order: the latest version received from the orders API, with status cleaned.
select distinct on (order_id)
    order_id,
    customer_id,
    warehouse_id,
    order_date,
    lower(btrim(status)) as order_status,
    channel,
    updated_at,
    _load_date
from {{ source('raw', 'orders_api') }}
order by order_id, updated_at desc, _load_date desc
```

`{{ source('raw', 'orders_api') }}` compiles to `"warehouse"."raw"."orders_api"` and tells dbt this model depends on that source. Other models would refer to this one with `{{ ref('stg_orders') }}`, which is how dbt works out the build order.

`models/staging/_stg_models.yml` adds tests:

```yaml
version: 2

models:
  - name: stg_orders
    description: One row per ShopLink order, latest version, status cleaned.
    columns:
      - name: order_id
        data_tests:
          - unique
          - not_null
      - name: order_status
        data_tests:
          - accepted_values:
              arguments:
                values: ["pending", "shipped", "delivered", "cancelled", "returned"]
```

## Build it

```bash
# dbt reads POSTGRES_PASSWORD (and DBT_HOST, default localhost) from the environment.
# Export only what dbt needs, not the whole .env, which also holds the lake's AWS keys.
export POSTGRES_PASSWORD="$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)"
cd shoplink_dbt
dbt debug                         # ends with "All checks passed!"
dbt build
```

```text
1 of 4 OK created sql view model staging.stg_orders ............................ [CREATE VIEW]
3 of 4 PASS not_null_stg_orders_order_id ....................................... [PASS]
4 of 4 PASS unique_stg_orders_order_id ......................................... [PASS]
2 of 4 PASS accepted_values_stg_orders_order_status__pending__shipped__delivered__cancelled__returned  [PASS]
Done. PASS=4 WARN=0 ERROR=0 SKIP=0 NO-OP=0 REUSED=0 TOTAL=4
```

`dbt build` runs models and tests together, in dependency order, and skips anything downstream of a failure. `staging.stg_orders` now has 9,521 rows: one per order, latest version, with every status one of five clean values. The `unique` test is what proves the overlap window's duplicates were handled.

`run_batch.py` already ends with `dbt build`, so the whole pipeline is now one command:

```bash
cd ~/shoplink-data-platform
python -m pipelines.run_batch --load-date 2026-07-31
```

## Resources

- docs: [What is dbt?](https://docs.getdbt.com/docs/introduction) · dbt Labs · Models, sources, tests and the build command.
- docs: [Postgres setup](https://docs.getdbt.com/docs/core/connect-data-platform/postgres-setup) · dbt Labs · Every `profiles.yml` option for dbt-postgres.
- docs: [Data tests](https://docs.getdbt.com/docs/build/data-tests) · dbt Labs · The built-in generic tests and how to write your own.
- watch: [Master ELT with DBT and Postgres in 1 Hour | Full Course for Beginners | Data Engineering](https://www.youtube.com/watch?v=pvvTzQatxFA) · itversity · 71.2K subscribers · 6K views · 105 likes · published 2024-07-01 · checked 2026-09-27 · 53 min

## Practice

1. Create the dbt project, run `dbt debug` and `dbt build`, and check the row count of `staging.stg_orders`.
2. Break a test on purpose: change the model to `status as order_status` (no cleaning) and run `dbt build`. Which test fails, and what does dbt show? Put the cleaning back.
3. Run the full pipeline with `python -m pipelines.run_batch --load-date 2026-07-31` and show the last rows of `raw.pipeline_runs`, including `dbt_build`.

## Example answer

**1.** `select count(*) from staging.stg_orders;` returns 9,521.

**2.** `accepted_values_stg_orders_order_status...` fails with a count of failing values (the messy spellings such as `Delivered` and ` shipped`), and the summary ends with `ERROR=1`. dbt prints the compiled test SQL path under `target/compiled/`, so you can run it yourself to see the offending values. The other tests still pass, because they test other columns.

**3.** Six rows for 2026-07-31, one per step, all `succeeded`, the last being `dbt_build` with detail `exit 0`. If dbt had failed, the row would say `failed`, `run_batch` would exit with 1, and the raw data would still be loaded, which is right: raw is correct, only the transformation needs fixing, and rerunning `dbt build` alone is enough.

# Quiz

passing_score: 70

### What is the main advantage of ELT over ETL for ShopLink?

- [ ] ELT does not need to extract data
- [x] Raw data is kept, so when a rule changes or a bug is found you rebuild from raw instead of re-extracting
- [ ] ELT never transforms data
- [ ] ELT only works with CSV files

> Landing raw data first means every downstream table can be rebuilt from what you already hold. In ETL, anything filtered out before loading is gone.

### Which change does an updated_at watermark miss, but log-based change data capture catches?

- [ ] A new order being inserted
- [ ] An order's status being updated
- [x] An order line being hard deleted
- [ ] A customer with a NULL city

> A deleted row has no updated_at left to query. CDC reads the database's log, which records deletes with the key of the deleted row.

### Why does ShopLink's API extract re-read the hour before its watermark?

- [ ] To make the extract slower and safer
- [x] To catch rows committed late with an updated_at just before the previous run's watermark; the duplicates are removed later
- [ ] Because the API only returns one hour at a time
- [ ] To test the retry logic

> A change can be committed after the extractor has read, with an updated_at earlier than the next watermark. The overlap window catches it, and staging keeps only the latest version of each order.

### Validation quarantines 2 of 27,995 order lines. What should the pipeline do?

- [ ] Stop the whole load, because any bad row is unacceptable
- [ ] Load all rows including the bad ones
- [x] Load the valid rows and keep the 2 bad ones, with reasons, in raw.quarantine; fail only if the bad-row ratio passes the threshold
- [ ] Delete the 2 rows from the source database

> Quarantine keeps a slip from blocking the business while recording it for follow-up. The 2% threshold turns a broken source into a failed run instead of a quietly incomplete one.

### What does `{{ source('raw', 'orders_api') }}` do in a dbt model?

- [ ] It copies the table into dbt
- [x] It compiles to the raw.orders_api table and records that the model depends on that source
- [ ] It runs the extract from the API
- [ ] It creates the raw schema

> source() and ref() are how dbt knows what each model reads, so it can build models in the right order and show lineage.

# Project: ShopLink end-to-end batch pipeline

max_score: 100

## Brief

ShopLink's leadership wants the numbers refreshed every day without anyone running scripts by hand. Before it is scheduled in Module 7, the pipeline must work end to end from one command: ingest all three batch sources into the bronze bucket and `warehouse.raw`, validate them with quarantine, be safe to rerun for any date, and finish with a dbt build.

Work in your `shoplink-data-platform` repo on a branch called `feature/batch-pipeline`.

## Deliverables

1. **`pipelines/steps.py`** with exactly these functions, each taking a load date and idempotent for it:
   - `extract_app_db_tables(load_date)`: full extract of `customers`, `warehouses`, `orders` and `order_lines` from `shoplink_app` in one repeatable read snapshot, to `bronze/app_db/<table>/load_date=YYYY-MM-DD/` as Parquet;
   - `extract_supplier_file(load_date, path)`: the supplier's `products.csv` (by default `data/incoming/supplier/<load date>/products.csv`) landed byte for byte in `bronze/supplier/products/load_date=YYYY-MM-DD/`;
   - `extract_orders_api(load_date)`: incremental extract with a watermark from earlier load dates and a one-hour overlap, one JSON file per page in `bronze/orders_api/load_date=YYYY-MM-DD/`, using retries with backoff;
   - `validate_bronze(load_date)`: pydantic contracts in `pipelines/contracts.py`, schema drift check, the cross-source orphan check, quarantine to `raw.quarantine` with reasons, and failure above a 2% bad-row ratio (configurable);
   - `load_raw(load_date)`: bronze minus quarantined rows into `raw.app_customers`, `raw.app_warehouses`, `raw.app_orders`, `raw.app_order_lines`, `raw.supplier_products` and `raw.orders_api`, each with `_load_date`, in one transaction.
2. **`pipelines/run_batch.py`** running the five steps then `dbt build`, logging every step, recording each in `raw.pipeline_runs`, and exiting non-zero on failure.
3. **`shoplink_dbt/`** with profile `shoplink`, target `dev` on database `warehouse`, credentials from environment variables, the `raw.orders_api` source, `stg_orders`, and at least the `unique`, `not_null` and `accepted_values` tests.
4. **Evidence in the pull request description**:
   - the batch run for 2026-06-30 (app at batch 1, API serving batch 1) and for 2026-07-31 (batch 2 applied, API serving both), with row counts per raw table;
   - a second run of 2026-07-31 with an identical fingerprint (`count(*)` and `sum(order_id)` per `_load_date` in `raw.orders_api`);
   - the quarantine report, showing the 2 bad order lines and the 3 orphan API orders;
   - the `dbt build` summary and `select count(*) from staging.stg_orders` (9,521).
5. **`.env.example`** updated with every variable the pipeline reads (`SHOPLINK_APP_DB_URL`, `SHOPLINK_WAREHOUSE_DB_URL`, `SHOPLINK_API_URL`, `S3_ENDPOINT_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `POSTGRES_PASSWORD`, `DBT_HOST`, optionally `SHOPLINK_QUARANTINE_THRESHOLD`), with example values only, and `requirements.txt` appended with pydantic, tenacity (if used), dbt-core and dbt-postgres.
6. **README section** "Daily batch": how to run a date, how to rerun it, and a three-line runbook entry for "validate_bronze failed on the quarantine threshold".

## How to submit

Push the branch and open a pull request into `main` in your `shoplink-data-platform` repository, with the evidence above in the description. Paste the pull request link into the submission form, with a one-line note on anything you would like feedback on. Share your quarantine rules for peer review if you would like a second opinion on what should be rejected and what should only be reported.

## Grading guide

| Criterion | Points |
|---|---|
| Three sources extracted to the agreed bronze layout: consistent snapshot, byte-for-byte file, incremental API with overlap and retries | 25 |
| Idempotency: partitions replaced in bronze and raw, watermark from earlier dates, identical fingerprint on rerun | 20 |
| Validation: contracts, drift check, orphan check, quarantine with reasons, threshold that fails the run | 20 |
| Load into warehouse.raw with `_load_date`, in one transaction, skipping quarantined rows | 10 |
| dbt project builds `stg_orders` with passing tests from environment-based credentials | 10 |
| Runner logging, `raw.pipeline_runs`, exit codes, configuration and README with runbook entry | 15 |
