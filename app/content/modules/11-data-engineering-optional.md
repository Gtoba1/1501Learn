---
module: 11
title: Data Engineering (Optional)
optional: true
summary: An optional module for learners who want to go further into the engineering side of the data platform. You can take it any time after Module 6. You write Python that pulls ShopLink data from an API, land it as raw files, load it into DuckDB so that reruns are always safe, schedule it with Airflow, then run a real lakehouse stack (Docker, Spark, MinIO, Kafka and OpenTofu) on your own laptop and learn how pipelines are shipped, secured and operated.
---

# Lesson: Python for data engineers

minutes: 50

## Why data engineers write Python

So far in this course, data has simply been there: you downloaded ShopLink's CSV files and loaded them into DuckDB. In a real company, someone has to get that data out of the source systems every day, check it, and put it somewhere the analytics engineer can build on. That someone is usually a data engineer, and their main tool is Python.

Python is the glue of data engineering. You use it to call APIs, read and write files, validate records, load databases and trigger other tools such as dbt. You do not need to be a software developer to do this well. You need a small set of libraries and a few good habits, and this lesson covers both.

## A note on your setup

This module uses the terminal a lot, and some tools (Airflow in particular) do not run natively on Windows. If you are on Windows, do this whole module inside **WSL2** (Windows Subsystem for Linux) with Ubuntu. Run `wsl --install` in an administrator PowerShell, restart, and open the Ubuntu app. Docker Desktop integrates with WSL2, so everything later in the module works from the same Ubuntu terminal. On macOS or Linux, use your normal terminal.

On Windows, work from a copy of your repo inside Ubuntu rather than the Windows one: a `.venv` created on Windows cannot be used from Linux, and the Airflow DAG later in this module expects the repo at `~/shoplink-analytics`. Clone your repo into your Ubuntu home folder (`git clone <your repo URL> ~/shoplink-analytics`), copy the unzipped data in, and rerun `load/01_load_raw.sql`. Your Windows drive appears in Ubuntu under `/mnt/c`, so a repo at `C:\code\shoplink-analytics` copies with `cp -r /mnt/c/code/shoplink-analytics/data ~/shoplink-analytics/`. Install the DuckDB CLI for Linux and run `duckdb shoplink.duckdb -f load/01_load_raw.sql` from the repo root, as in Module 3. Then create the virtual environment below inside WSL, reinstall from `requirements.txt`, and run `dbt build` from `shoplink_dbt/` to rebuild your models in the new database.

You need Python 3.11 or newer. Check with `python3 --version`.

## Virtual environments

Every Python project should have its own **virtual environment**: a private folder of installed packages. Without one, installing a package for this project can break another project that needs a different version. With one, your `shoplink-analytics` repo carries exactly the packages it needs, written down in a file that anyone can install from.

From the root of your `shoplink-analytics` repo:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
```

Your prompt now starts with `(.venv)`. Every `pip install` goes into that folder, not your whole machine. Run `deactivate` to leave it, and `source .venv/bin/activate` to come back.

Add these to the `requirements.txt` you created in Module 6, keeping its `dbt-duckdb` pin:

```text
pandas>=2.2
pyarrow>=17
duckdb>=1.4
requests>=2.32
pydantic>=2.8
fastapi[standard]>=0.115
pytest>=8
ruff>=0.6
```

Install it with `pip install -r requirements.txt`. `.venv/` is already in `.gitignore` from Module 2: you commit the list of packages, never the packages themselves.

## A project layout that scales

Keep ingestion code separate from your dbt project. A layout like this works well:

| Path | What lives there |
|---|---|
| `data/shoplink/` | The batch 1 CSVs from Module 3, unzipped from [shoplink.zip](/datasets/shoplink.zip) |
| `data/shoplink-batch-2/` | The batch 2 extract from Module 7, unzipped from [shoplink-batch-2.zip](/datasets/shoplink-batch-2.zip) |
| `data/raw/` | Files your pipeline lands, untouched, one folder per load |
| `ingestion/` | Your Python pipeline code |
| `tests/` | Automated tests for the pipeline |
| `shoplink.duckdb` | The DuckDB database from Module 3, at the repo root, which the pipeline loads |
| `shoplink_dbt/` | Your dbt project from Module 6 |

Each zip contains a folder with the same name, so unzipping both into `data/` gives, for example, `data/shoplink/orders.csv` and `data/shoplink-batch-2/orders.csv`. If you have not reached Module 7 yet, download batch 2 now; you need it in the ingestion lesson.

The CI workflow later in this module needs the extracts, so commit them. Your Module 2 `.gitignore` ignores the whole `data/` folder, so in `.gitignore` replace the `data/` line with these three:

```text
data/*
!data/shoplink/
!data/shoplink-batch-2/
```

`data/*` still ignores everything else in the folder, so pipeline outputs such as `data/raw/`, `data/clean/` and `data/quarantine/` stay out of Git: your pipeline can always recreate them. The extracts are small (about 1.4 MB in total). Committing them is fine here only because ShopLink is fictional: never do this with real customer data. `shoplink.duckdb` stays ignored by the `*.duckdb` line from Module 2.

## pandas in ten minutes

pandas loads a table into a **DataFrame**, which you can filter, clean and summarise with Python. Save this as `ingestion/explore.py` and run it with `python ingestion/explore.py` from the repo root:

```python
from pathlib import Path

import pandas as pd

EXTRACT = Path("data/shoplink")
CLEAN = Path("data/clean")
CLEAN.mkdir(parents=True, exist_ok=True)

orders = pd.read_csv(EXTRACT / "orders.csv", parse_dates=["order_date", "updated_at"])
lines = pd.read_csv(EXTRACT / "order_lines.csv")

print(orders.shape, lines.shape)
print(orders.dtypes)
print(orders["status"].value_counts())

orders["status"] = orders["status"].str.strip().str.lower()
print(orders["status"].value_counts())

print("duplicate lines:", lines.duplicated().sum())
lines = lines.drop_duplicates()

bad_qty = lines[lines["quantity"] <= 0]
print("bad quantity lines:", len(bad_qty))

lines["net_amount"] = lines["quantity"] * lines["unit_price"] * (1 - lines["discount_pct"] / 100)

orders.to_parquet(CLEAN / "orders.parquet", index=False)
lines.to_parquet(CLEAN / "order_lines.parquet", index=False)
```

On batch 1 you should see 9,091 orders and 26,779 order lines. The first `value_counts()` shows more than twenty spellings of five statuses ("delivered", "Delivered", " delivered", "DELIVERED" and so on). After `str.strip().str.lower()` there are exactly five: delivered 8,106, cancelled 562, returned 291, shipped 91 and pending 41. You will also find the 6 duplicate order lines and the 2 lines with a zero or negative quantity. These are the same problems you met in SQL in earlier modules. Now you can catch them before the data even reaches the warehouse.

## Why Parquet

The script ends by writing **Parquet** files. Parquet is a columnar, compressed file format: it stores each column together, keeps the data types, and is usually much smaller than the same CSV (on ShopLink's order lines, about half the size; on larger, more repetitive tables often a tenth). Tools that read Parquet only read the columns a query needs, which makes it much faster to query.

DuckDB can query Parquet files directly, with no loading step:

```python
import duckdb

duckdb.sql("""
    select status, count(*) as orders
    from 'data/clean/orders.parquet'
    group by status
    order by orders desc
""").show()
```

A rule worth keeping: normalise text before you deduplicate or group. "Aba Phone Hub" and "aba phone hub " are the same customer to a human and two customers to a computer.

## Resources

- docs: [venv: creation of virtual environments](https://docs.python.org/3/library/venv.html) · Python documentation · The official reference for the venv module.
- docs: [10 minutes to pandas](https://pandas.pydata.org/docs/user_guide/10min.html) · pandas documentation · A fast tour of DataFrames, selection, grouping and file I/O.
- watch: [Python Tutorial: VENV (Mac & Linux) - How to Use Virtual Environments with the Built-In venv Module](https://www.youtube.com/watch?v=Kg1Yvry_Ydk) · Corey Schafer · 1.56M subscribers · 310.9K views · 8.2K likes · published 2019-04-02 · checked 2026-09-27 · 14 min
- watch: [Complete Python Pandas Data Science Tutorial! (Reading CSV/Excel files, Sorting, Filtering, Groupby)](https://www.youtube.com/watch?v=vmEHCJofslg) · Keith Galli · 258K subscribers · 3.5M views · 76K likes · published 2018-10-25 · checked 2026-09-27 · 60 min
- docs: [DuckDB Python API](https://duckdb.org/docs/stable/clients/python/overview) · DuckDB · How to run SQL from Python, including over Parquet files and DataFrames.

## Practice

Run a format race on ShopLink's order lines.

1. Set up the virtual environment and `requirements.txt` above, and run `explore.py`.
2. Save the cleaned order lines three ways: CSV (`lines.to_csv(...)`), JSON (`lines.to_json(..., orient="records")`) and Parquet.
3. Record the size of each file in KB.
4. For each file, time how long DuckDB takes to compute total net revenue (use `time.perf_counter()` before and after the query). DuckDB reads CSV with `read_csv('file.csv')`, JSON with `read_json('file.json')` and Parquet with `'file.parquet'`.
5. Write three sentences on what you found and which format you would choose for the raw layer and which for the clean layer.

If you have a study partner, race each other: compare numbers and see whose laptop wins.

## Example answer

A timing script that works:

```python
import time

import duckdb

queries = {
    "csv": "select sum(net_amount) from read_csv('data/clean/order_lines.csv')",
    "json": "select sum(net_amount) from read_json('data/clean/order_lines.json')",
    "parquet": "select sum(net_amount) from 'data/clean/order_lines.parquet'",
}
for name, sql in queries.items():
    start = time.perf_counter()
    total = duckdb.sql(sql).fetchone()[0]
    print(f"{name}: {time.perf_counter() - start:.3f}s, total NGN {total:,.0f}")
```

Typical results: the JSON file is the largest (the column names repeat on every row), CSV is in the middle, and Parquet is the smallest by a wide margin. Parquet is also the fastest to query. All three give the same total, which is the point: the format changes cost and speed, not the answer.

A good write-up: "Parquet was about half the size of the CSV, a sixth of the JSON, and by far the fastest to query. For the raw layer I would keep the files exactly as the source sent them (CSV or JSON), so I can always replay them. For the clean layer I would use Parquet, because it keeps types and is cheaper to store and query." Any conclusion is acceptable if it is backed by your own measurements.

# Lesson: Pulling data from APIs and validating it

minutes: 50

## APIs are how most data arrives

ShopLink's orders live in its web app. Data engineers rarely get direct access to an app's production database. Instead, the app team offers an **API**: a web address you send a request to, which replies with data, usually as JSON. Payment providers, CRMs, courier companies and exchange-rate services all work the same way.

There is no real ShopLink API, so in this module you run a small stand-in on your own laptop. It serves the course CSV files as if they were a live API. Save this as `ingestion/mock_api.py`:

```python
"""A tiny stand-in for the ShopLink orders API, serving the course CSV extracts."""
import csv
import os
from pathlib import Path

from fastapi import FastAPI

app = FastAPI(title="ShopLink mock orders API")

BATCHES = os.environ.get("SHOPLINK_BATCHES", "shoplink").split(",")


def current_orders() -> list[dict]:
    latest = {}
    for batch in BATCHES:
        path = Path("data") / batch / "orders.csv"
        with open(path, newline="") as f:
            for row in csv.DictReader(f):
                latest[row["order_id"]] = row  # a later batch replaces the earlier version
    return sorted(latest.values(), key=lambda r: (r["updated_at"], r["order_id"]))


@app.get("/orders")
def orders(updated_since: str = "1900-01-01 00:00:00", page: int = 1, page_size: int = 500):
    rows = [r for r in current_orders() if r["updated_at"] > updated_since]
    start = (page - 1) * page_size
    return {"data": rows[start:start + page_size], "page": page, "total": len(rows)}
```

Start it from the repo root in its own terminal and leave it running:

```bash
source .venv/bin/activate
uvicorn ingestion.mock_api:app --port 8000
```

Open http://localhost:8000/orders?page=1 in your browser to see the first 500 orders, or http://localhost:8000/docs for an automatic page that describes the API. The `SHOPLINK_BATCHES` environment variable lists which folders in `data/` are "live". It starts with batch 1 (`shoplink`) only. In the next lesson you restart it with `SHOPLINK_BATCHES=shoplink,shoplink-batch-2` to simulate a month of new and changed orders arriving.

## Making requests that survive the real world

The `requests` library makes an HTTP call in one line: `requests.get(url, params=..., timeout=30)`. Real APIs fail, though, and your code must decide what to do about each kind of failure:

| Response | Meaning | What your code should do |
|---|---|---|
| 200 | Success | Use the data |
| 429 | Too many requests: you are being rate limited | Wait, then retry |
| 500, 502, 503, 504 | The server had a problem | Wait, then retry |
| 400, 401, 403, 404 | Your request is wrong, or you lack access | Fail immediately and loudly: retrying will not help |
| No response | Network dropped or timed out | Wait, then retry |

Waiting a little longer after each failure is called **exponential backoff**: 1 second, then 2, 4, 8, 16. It gives a struggling server room to recover. Save this as `ingestion/http_utils.py`:

```python
import time

import requests

RETRYABLE = {429, 500, 502, 503, 504}


def get_json(url: str, params: dict | None = None, attempts: int = 5) -> dict:
    """GET a URL and return the JSON body, retrying rate limits and server errors."""
    for attempt in range(attempts):
        try:
            response = requests.get(url, params=params, timeout=30)
        except (requests.ConnectionError, requests.Timeout):
            time.sleep(2 ** attempt)  # 1, 2, 4, 8, 16 seconds
            continue
        if response.status_code in RETRYABLE:
            time.sleep(2 ** attempt)
            continue
        response.raise_for_status()  # any other 4xx fails immediately
        return response.json()
    raise RuntimeError(f"Gave up on {url} after {attempts} attempts")
```

Always pass a `timeout`. Without one, a request to a server that never answers can hang your pipeline forever.

## Pagination

APIs rarely send everything at once. The mock API returns 500 orders per **page**, and you ask for page 1, then page 2, until a page comes back empty. The loop is short:

```python
from http_utils import get_json

page, rows = 1, []
while batch := get_json("http://localhost:8000/orders", params={"page": page})["data"]:
    rows.extend(batch)
    page += 1
print(len(rows), "orders")
```

Run it from inside the `ingestion/` folder (or with `PYTHONPATH=ingestion`) and you get all 9,091 batch 1 orders across 19 pages.

## Land it raw first

The first thing to do with an API response is save it, exactly as received, before any cleaning. If your cleaning code has a bug, you can fix the bug and replay the saved files without calling the API again. Some APIs only keep a few days of history, so the raw copy may be the only one you ever get. You will see this idea again in the next lesson as the raw (or bronze) layer.

A real public example: ShopLink imports most of its stock priced in US dollars, so finance wants the daily dollar to naira rate. The free ExchangeRate-API endpoint needs no key:

```python
import json
from datetime import date
from pathlib import Path

from http_utils import get_json

body = get_json("https://open.er-api.com/v6/latest/USD")

landing = Path("data/raw/fx_rates") / f"load_date={date.today():%Y-%m-%d}"
landing.mkdir(parents=True, exist_ok=True)
(landing / "usd.json").write_text(json.dumps(body, indent=2))

print("USD to NGN:", body["rates"]["NGN"], "as of", body["time_last_update_utc"])
```

The service asks you to credit it if you publish its rates, and to call it at most about once an hour. A daily pipeline is well within that.

## Validating records with pydantic

A raw file can contain anything. Before data moves on, check that each record has the fields you expect, of the right type, within sensible ranges. **pydantic** lets you describe a valid record as a Python class, then checks any record against it:

```python
import csv
import json
from pathlib import Path

from pydantic import BaseModel, Field, ValidationError


class OrderLine(BaseModel):
    order_line_id: int
    order_id: int
    product_id: int
    quantity: int = Field(gt=0)
    unit_price: float = Field(ge=0)
    discount_pct: float = Field(ge=0, le=100)


good, bad = [], []
with open("data/shoplink/order_lines.csv", newline="") as f:
    for row in csv.DictReader(f):
        try:
            good.append(OrderLine.model_validate(row).model_dump())
        except ValidationError as error:
            bad.append({**row, "error": error.errors()[0]["msg"]})

Path("data/quarantine").mkdir(parents=True, exist_ok=True)
Path("data/quarantine/order_lines.json").write_text(json.dumps(bad, indent=2))
print(f"{len(good)} valid, {len(bad)} quarantined")
```

pydantic converts the CSV's text values into integers and floats for you, and rejects anything it cannot convert. On batch 1 this prints `26777 valid, 2 quarantined`: the two lines with a quantity of 0 and -2.

Notice what the code does with bad records. It does not drop them silently, and it does not crash the whole load because of two rows. It **quarantines** them: writes them somewhere with the reason, so someone can investigate. Then add one more rule: if the quarantine rate goes above a threshold, such as 2%, stop the pipeline. Two bad rows out of 26,779 is a data-entry slip. Two thousand is a broken source, and loading the rest would hide the problem.

Record-level checks like these catch bad values. Table-level problems, such as duplicates across the whole file, orphaned customer IDs or data that stopped arriving, need checks over the whole table. You covered those with dbt in Modules 6 to 8.

## Resources

- docs: [Requests quickstart](https://requests.readthedocs.io/en/latest/user/quickstart/) · Requests documentation · Parameters, JSON responses, status codes and timeouts.
- docs: [Models](https://docs.pydantic.dev/latest/concepts/models/) · pydantic documentation · Defining models, validation and model_dump.
- docs: [FastAPI first steps](https://fastapi.tiangolo.com/tutorial/first-steps/) · FastAPI documentation · Enough to read and extend the mock API.
- read: [ExchangeRate-API free endpoint](https://www.exchangerate-api.com/docs/free) · ExchangeRate-API · Terms, update frequency and response format for the rates used above.
- watch: [Python Requests Tutorial: Request Web Pages, Download Images, POST Data, Read JSON, and More](https://www.youtube.com/watch?v=tb8gHvYlCFs) · Corey Schafer · 1.56M subscribers · 1.1M views · 22K likes · published 2019-02-26 · checked 2026-09-27 · 25 min
- watch: [Pydantic Tutorial • Solving Python's Biggest Problem](https://www.youtube.com/watch?v=XIdQ6gO3Anc) · pixegami · 85K subscribers · 513.2K views · 14.7K likes · published 2023-09-18 · checked 2026-09-27 · 11 min

## Practice

Build a validated FX rate extractor.

1. Save the FX script above as `ingestion/fx_rate.py` and run it. Open the landed JSON file and read its structure.
2. Write a pydantic model called `FxResponse` that checks: `result` equals `"success"`, `base_code` equals `"USD"`, and `rates` is a dictionary of currency codes to positive numbers that must include `NGN`.
3. Validate the landed file against your model. If validation fails, write the error to `data/quarantine/fx_rates.json` and exit with an error.
4. Test your model by editing a copy of the file so that the NGN rate is `-5`, and confirm your code rejects it.

## Example answer

```python
import json
import sys
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, PositiveFloat, ValidationError, field_validator


class FxResponse(BaseModel):
    result: Literal["success"]
    base_code: Literal["USD"]
    time_last_update_utc: str
    rates: dict[str, PositiveFloat]

    @field_validator("rates")
    @classmethod
    def must_include_naira(cls, rates: dict[str, float]) -> dict[str, float]:
        if "NGN" not in rates:
            raise ValueError("NGN rate missing")
        return rates


path = Path(sys.argv[1])  # for example data/raw/fx_rates/load_date=2026-09-27/usd.json
try:
    fx = FxResponse.model_validate_json(path.read_text())
except ValidationError as error:
    Path("data/quarantine").mkdir(parents=True, exist_ok=True)
    Path("data/quarantine/fx_rates.json").write_text(error.json(indent=2))
    sys.exit(f"FX file failed validation: {error.error_count()} problem(s)")

print(f"Valid. USD to NGN = {fx.rates['NGN']}")
```

With `"NGN": -5` the script exits with `FX file failed validation: 1 problem(s)`, and the quarantine file says the NGN value must be greater than 0. Using `Literal` for fixed values and `PositiveFloat` for the rates are the key moves. A version that checks the same rules with plain `if` statements is also acceptable, but the pydantic version documents the expected shape in one place.

# Lesson: Ingestion patterns and idempotent loads

minutes: 60

## Full loads and incremental loads

There are two basic ways to copy a table from a source:

| Pattern | How it works | Good for | Weak spot |
|---|---|---|---|
| Full load | Copy every row, every run | Small tables such as ShopLink's 120 products and 5 warehouses | Slow and wasteful for big tables |
| Incremental load | Copy only rows changed since the last run | Big, growing tables such as orders | Needs a reliable way to find "changed since" |

An incremental load remembers how far it got using a **watermark**: usually the newest `updated_at` value it has already loaded. Each run asks the source for rows with `updated_at` greater than the watermark, loads them, then moves the watermark forward.

ShopLink's two extracts show why this matters. Batch 2 does not repeat all 9,091 orders. It contains 565 rows: 433 new July orders and 132 June orders whose status changed, each with a newer `updated_at`. An incremental load picks up exactly those.

## Change data capture

Watermarks have a blind spot: **hard deletes**. If a row is deleted from the source, it has no `updated_at` left to find, so a watermark query never sees it go.

**Change data capture (CDC)** solves this by reading the source database's own transaction log, the record the database keeps of every insert, update and delete. Tools such as Debezium stream those changes out, deletes included, often into Kafka (which you meet later in this module). CDC is more work to set up and needs access to the database itself, so teams use it for important tables where deletes matter, and simple watermarks everywhere else.

## The late commit problem

Here is a puzzle worth solving before you read the answer. ShopLink's extractor runs at 02:00 and asks for orders with `updated_at` after the previous run's time. A sales rep updates an order at 01:59:59, but the app's database only commits that change at 02:00:03, after the extractor has already read. On the next run, the extractor asks for rows updated after 02:00:00. The order's `updated_at` is 01:59:59. It is never picked up.

The usual fix is an **overlap window**: each run re-reads a short period before the watermark (an hour, say). Some rows arrive twice, which is fine as long as the layer above keeps only the latest version of each order. Cheap duplicates you can remove are always better than missing rows you cannot see.

## Layers: raw, staging, marts and bronze, silver, gold

You have used **raw, staging and marts** since Module 1. Data engineering teams, and lakehouse platforms in particular, often call the same idea the **medallion architecture**, with three layers named after medals:

| Medallion name | This course's name | What it holds |
|---|---|---|
| Bronze | Raw | Data exactly as received: files or tables, plus load metadata |
| Silver | Staging (and intermediate) | Cleaned, typed, deduplicated data, one version per record |
| Gold | Marts | Business-ready facts, dimensions and metrics |

The names are different; the idea is identical. In the rest of this module you will see both, because the lakehouse stack later in this module uses bronze, silver and gold buckets. When a job advert asks for "medallion architecture", you already know it.

## Idempotency: the property that makes reruns safe

A pipeline is **idempotent** when running it twice with the same input gives the same result as running it once. It sounds academic. It is the most practical idea in this lesson, because pipelines are rerun all the time: a task fails halfway and retries, someone reruns yesterday to fix a bug, a scheduler fires twice.

The naive loader is not idempotent. `insert into raw.orders select * from read_csv(...)` run twice gives you every row twice, and every revenue number doubles.

There are two standard ways to make a load idempotent:

1. **Delete then insert a partition, in one transaction.** Tag every row with the load it came from (a `_load_date` or `_batch_id` column). Each run first deletes its own partition, then inserts it again. Wrap both in a transaction so a crash halfway leaves the old data in place, not half of it.
2. **Upsert on the key, ignoring stale rows.** Insert new keys, update existing ones, but only when the incoming `updated_at` is newer than the stored one. DuckDB can do this with `insert ... on conflict do update ... where`, or with `merge into`.

The second one looks like this in DuckDB, for a table with `order_id` as primary key:

```sql
insert into orders_current as t
select order_id, status, updated_at
from new_orders
on conflict (order_id) do update
    set status = excluded.status,
        updated_at = excluded.updated_at
    where excluded.updated_at > t.updated_at;
```

The `where` clause is the part that matters. Without it, a late-arriving old version of an order would overwrite a newer one.

## The watermark trap

There is one more subtlety. If you keep the watermark in a small state file and move it forward after each run, a rerun of today's load starts from the new watermark and fetches almost nothing. The delete-then-insert step then replaces today's full partition with that almost-empty one, and you have silently lost data.

The fix is to work out the watermark from the warehouse itself: the newest `updated_at` loaded by **earlier** load dates. A rerun of today then asks the API for exactly the same window as the first run did.

## The ShopLink pipeline

Here is the whole pattern in one file, `ingestion/pipeline.py`. It extracts from the mock API into `data/raw/orders_api/load_date=<date>/`, then loads those files into a new `raw.orders_api` table in `shoplink.duckdb` at the repo root, the same database you have used since Module 3:

```python
"""ShopLink orders pipeline: API -> raw JSON files -> DuckDB. Safe to rerun for any load_date."""
import json
import os
import shutil
import sys
from datetime import timedelta
from pathlib import Path

import duckdb
from http_utils import get_json

API = os.environ.get("SHOPLINK_API_URL", "http://localhost:8000/orders")
DB = os.environ.get("SHOPLINK_DB", "shoplink.duckdb")
RAW = Path("data/raw/orders_api")
OVERLAP = timedelta(hours=1)  # re-read the last hour to catch late commits

DDL = """
create schema if not exists raw;
create table if not exists raw.orders_api (
    order_id integer, customer_id integer, warehouse_id integer, order_date date,
    status varchar, channel varchar, updated_at timestamp,
    _load_date date, _loaded_at timestamp with time zone
);
"""


def connect() -> duckdb.DuckDBPyConnection:
    Path(DB).parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(DB)
    con.execute(DDL)
    return con


def watermark(load_date: str) -> str:
    """Newest updated_at loaded BEFORE this load_date, so a rerun asks for the same window."""
    with connect() as con:
        newest = con.execute(
            "select max(updated_at) from raw.orders_api where _load_date < ?", [load_date]
        ).fetchone()[0]
    if newest is None:
        return "1900-01-01 00:00:00"  # first run: take everything
    return (newest - OVERLAP).strftime("%Y-%m-%d %H:%M:%S")


def extract(load_date: str) -> int:
    since = watermark(load_date)
    landing = RAW / f"load_date={load_date}"
    if landing.exists():
        shutil.rmtree(landing)  # a rerun replaces this date's files, never adds to them
    landing.mkdir(parents=True)
    page, fetched = 1, 0
    while rows := get_json(API, params={"updated_since": since, "page": page})["data"]:
        (landing / f"page-{page:04d}.json").write_text(json.dumps(rows))
        fetched += len(rows)
        page += 1
    print(f"extract {load_date}: {fetched} rows updated since {since}")
    return fetched


def load(load_date: str) -> int:
    landing = RAW / f"load_date={load_date}"
    with connect() as con:
        con.execute("begin transaction")
        con.execute("delete from raw.orders_api where _load_date = ?", [load_date])
        if any(landing.glob("*.json")):
            con.execute(
                """
                insert into raw.orders_api
                select *, cast(? as date), current_timestamp
                from read_json(?, hive_partitioning = false, columns = {
                    order_id: 'integer', customer_id: 'integer', warehouse_id: 'integer',
                    order_date: 'date', status: 'varchar', channel: 'varchar',
                    updated_at: 'timestamp'
                })
                """,
                [load_date, str(landing / "*.json")],
            )
        con.execute("commit")
        rows = con.execute(
            "select count(*) from raw.orders_api where _load_date = ?", [load_date]
        ).fetchone()[0]
    print(f"load {load_date}: {rows} rows in raw.orders_api")
    return rows


if __name__ == "__main__":
    step, day = sys.argv[1], sys.argv[2]  # for example: all 2026-09-27
    if step in ("extract", "all"):
        extract(day)
    if step in ("load", "all"):
        load(day)
```

A few details worth noticing:

- `columns = {...}` fixes the types on the way in, so the raw table has a stable shape however the JSON looks.
- `hive_partitioning = false` stops DuckDB treating the `load_date=...` folder name as an extra column. DuckDB does that automatically for folders named `key=value`, which is useful elsewhere but would break this insert.
- If anything fails between `begin transaction` and `commit`, the connection closes without committing and DuckDB rolls back, so the old partition survives.
- The raw layer keeps every version it receives. Choosing the latest version of each order is the staging layer's job, in dbt.

Run it with the mock API serving batch 1:

```bash
python ingestion/pipeline.py all 2026-09-26
python ingestion/pipeline.py all 2026-09-26
```

Both runs report 9,091 rows for 2026-09-26. Now stop the API (Ctrl+C), restart it with both batches live, and load the next day:

```bash
SHOPLINK_BATCHES=shoplink,shoplink-batch-2 uvicorn ingestion.mock_api:app --port 8000
python ingestion/pipeline.py all 2026-09-27
```

The second day fetches about 575 rows: the 565 in batch 2, plus a few that the one-hour overlap re-reads. Across both days there are 9,524 distinct orders (9,091 plus 433 new July orders).

## Resources

- read: [How to make data pipelines idempotent](https://www.startdataengineering.com/post/why-how-idempotent-data-pipeline/) · Start Data Engineering · A clear walk through the delete-then-insert pattern and why it matters.
- read: [What is change data capture?](https://www.confluent.io/learn/change-data-capture/) · Confluent · Log-based CDC compared with query-based approaches.
- docs: [INSERT statement, including ON CONFLICT](https://duckdb.org/docs/stable/sql/statements/insert) · DuckDB · Upserts and the `where` clause on `do update`.
- docs: [Medallion architecture](https://www.databricks.com/glossary/medallion-architecture) · Databricks · The bronze, silver and gold naming, as lakehouse teams use it.
- watch: [Change Data Capture (CDC) Explained (with examples)](https://www.youtube.com/watch?v=5KN_feUhtTM) · Irtiza Hafiz · 15.9K subscribers · 92K views · 1.3K likes · published 2022-01-19 · checked 2026-09-27 · 8 min
- watch: [Dimensional data modeling and idempotent pipelines in 78 minutes with DataExpert.io](https://www.youtube.com/watch?v=JeeqpK3o3LQ) · DataExpert · 264K subscribers · 34.9K views · 901 likes · published 2024-02-09 · checked 2026-09-27 · 78 min

## Practice

Prove the pipeline is idempotent, then break it on purpose.

1. Run the two loads above (2026-09-26 with batch 1, 2026-09-27 with both batches).
2. Write one SQL query that returns, for each `_load_date`, the row count and the sum of `order_id`. Run the 2026-09-27 load again and show that both numbers are unchanged.
3. Make a copy of `pipeline.py` and remove the `delete` line. Run the copy twice for the same date and record what happens to the counts.
4. Write a query that returns the latest version of each order across all load dates, with the status cleaned. Confirm it returns 9,524 rows and that no `order_id` appears twice.

## Example answer

Open the database with `duckdb shoplink.duckdb` from the repo root, or run the SQL from Python with `duckdb.connect("shoplink.duckdb").sql(...)`.

```sql
select _load_date, count(*) as row_count, sum(order_id) as order_id_sum
from raw.orders_api
group by _load_date
order by _load_date;
```

The result is the same before and after the rerun: 9,091 rows for 2026-09-26 and about 575 for 2026-09-27, with identical sums. Comparing a sum as well as a count matters: a load that replaced the right number of rows with the wrong rows would pass a count check alone.

Without the `delete`, each rerun adds another copy of the partition, so 2026-09-27 grows from about 575 to about 1,150 rows, and any revenue built on it doubles.

The latest version of each order:

```sql
select
    order_id,
    customer_id,
    warehouse_id,
    order_date,
    lower(trim(status)) as order_status,
    channel,
    updated_at
from raw.orders_api
qualify row_number() over (
    partition by order_id
    order by updated_at desc, _load_date desc
) = 1;
```

This returns 9,524 rows, one per order. This query is the shape of the dbt staging model you will add in the project.

# Lesson: Orchestration with Airflow

minutes: 60

## What an orchestrator does

Your pipeline now has three steps that must run in order, every day: extract, load, then rebuild the dbt models. You could run them by hand, or with a cron job. Both stop working the day something fails at 02:00 and nobody notices until the Monday meeting.

An **orchestrator** runs tasks in the right order, on a schedule, retries the ones that fail, records what happened, and tells someone when it gives up. Apache Airflow is the most widely used open-source orchestrator. Dagster and Prefect are popular alternatives, and dbt Cloud has its own scheduler. The ideas below carry across all of them.

## The vocabulary

| Term | Meaning |
|---|---|
| DAG | Directed acyclic graph: your pipeline, as a set of tasks and the dependencies between them. "Acyclic" means no loops |
| Task | One step, such as "extract orders" |
| Operator | A template for a kind of task: BashOperator runs a shell command, PythonOperator runs a Python function |
| Schedule | When the DAG runs, often a cron expression such as `0 2 * * *` (02:00 daily) |
| DAG run | One execution of the DAG, identified by its logical date |
| Logical date | The date a run is for. Available in templates as `{{ ds }}` (YYYY-MM-DD) |
| Retries | How many times a failed task is tried again before it is marked failed |
| Backfill | Running the DAG for a range of past dates |

The logical date is what connects Airflow to the previous lesson. Every task receives the date it is running for, passes it to `pipeline.py` as the load date, and the pipeline's delete-then-insert means a rerun for any date is safe. Idempotent tasks plus a logical date are what make retries and backfills boring, which is exactly what you want.

## Installing Airflow

Airflow runs on Linux and macOS (on Windows, use your WSL2 Ubuntu terminal). Give it its own virtual environment, separate from your project's, because Airflow pins many of its own dependencies. Airflow publishes a "constraints" file for each version, which makes the install reproducible:

```bash
python3 -m venv ~/airflow-venv
source ~/airflow-venv/bin/activate
AIRFLOW_VERSION=3.3.2
PYTHON_VERSION="$(python -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
pip install "apache-airflow==${AIRFLOW_VERSION}" \
  --constraint "https://raw.githubusercontent.com/apache/airflow/constraints-${AIRFLOW_VERSION}/constraints-${PYTHON_VERSION}.txt"
```

Then point Airflow at a `dags` folder in your repo and start everything in one process:

```bash
export AIRFLOW_HOME=~/airflow
export AIRFLOW__CORE__DAGS_FOLDER=~/shoplink-analytics/dags
airflow standalone
```

`airflow standalone` sets up a local database, starts the scheduler and the web UI, and prints a login in the terminal. Open http://localhost:8080. This is a development setup only; production Airflow runs its components separately, often from the official Docker Compose file or a managed service.

## The ShopLink DAG

Save this as `dags/shoplink_daily.py` in your repo:

```python
"""Daily ShopLink pipeline: extract orders, load DuckDB, rebuild dbt models."""
from datetime import timedelta
from pathlib import Path

import pendulum
from airflow.providers.standard.operators.bash import BashOperator
from airflow.sdk import dag

PROJECT = str(Path.home() / "shoplink-analytics")  # change if your repo lives elsewhere
PYTHON = f"{PROJECT}/.venv/bin/python"
DBT = f"{PROJECT}/.venv/bin/dbt"


def notify_failure(context):
    ti = context["task_instance"]
    print(f"ALERT shoplink_daily: task {ti.task_id} failed for {context['ds']}")


@dag(
    dag_id="shoplink_daily",
    schedule="0 2 * * *",  # 02:00 every day
    start_date=pendulum.datetime(2026, 9, 1, tz="Africa/Lagos"),
    catchup=False,
    max_active_runs=1,  # runs share one DuckDB file, so never overlap them
    default_args={
        "retries": 3,
        "retry_delay": timedelta(minutes=5),
        "on_failure_callback": notify_failure,
    },
    tags=["shoplink"],
)
def shoplink_daily():
    extract = BashOperator(
        task_id="extract_orders",
        bash_command=PYTHON + " ingestion/pipeline.py extract {{ ds }}",
        cwd=PROJECT,
    )
    load = BashOperator(
        task_id="load_raw",
        bash_command=PYTHON + " ingestion/pipeline.py load {{ ds }}",
        cwd=PROJECT,
    )
    dbt_build = BashOperator(
        task_id="dbt_build",
        bash_command=DBT + " build --target duckdb",
        cwd=f"{PROJECT}/shoplink_dbt",
    )
    extract >> load >> dbt_build


shoplink_daily()
```

Things to notice:

- **The tasks call your project's own Python and dbt**, from the project's `.venv`. Airflow only orchestrates. This keeps Airflow's dependencies and your pipeline's dependencies from fighting each other, and it means the same commands work by hand, in Airflow and in CI.
- **`{{ ds }}` is a template.** Airflow replaces it with the run's logical date before running the command. In Airflow 3, a daily cron schedule gives each run the date it was scheduled for, so the 02:00 run on 27 September loads `2026-09-27`.
- **The timezone is Lagos**, so 02:00 means 02:00 at ShopLink, not 02:00 UTC.
- **`max_active_runs=1`** matters for DuckDB in particular: only one process can write to a DuckDB file at a time. For the same reason, close any SQL tool that has `shoplink.duckdb` open before a run.
- **`>>` sets the order.** If `load_raw` fails after its retries, `dbt_build` does not run, so the marts are never rebuilt on half-loaded data.
- **dbt runs from inside `shoplink_dbt/`**, as it has since Module 6, because the profile's `path: ../shoplink.duckdb` is relative to where dbt runs. `--target duckdb` keeps it on DuckDB even if Module 9 made Snowflake your default.

The failure callback here only prints to the task log. In real work it would post to Slack or Teams, or send an email. Whatever the channel, a good alert names the DAG, the task and the date, so the person reading it at 06:00 knows where to look.

## Running, testing and backfilling

With the mock API running in another terminal, test the whole DAG once without the scheduler:

```bash
airflow dags test shoplink_daily 2026-09-27
```

Then switch the DAG on in the UI and watch the scheduled run, or trigger it manually. Click a task to read its log.

To run a range of past dates, create a backfill. Because each task is parameterised by the logical date and the loads are idempotent, this is safe to run as often as you like:

```bash
airflow backfill create --dag-id shoplink_daily --from-date 2026-09-20 --to-date 2026-09-26
```

`catchup=False` in the DAG means Airflow will not do this automatically when you first switch the DAG on. Backfills happen only when you ask for them.

## Running dbt from Airflow

Calling `dbt build` from a BashOperator is the simplest way to run dbt from Airflow, and it is how many teams start. Its weakness is that Airflow sees the whole dbt project as one task: if one model fails, the log tells you, but the Airflow graph does not. The open-source Astronomer Cosmos package turns each dbt model into its own Airflow task, which is worth exploring once the basic DAG works.

## Resources

- docs: [Airflow fundamentals tutorial](https://airflow.apache.org/docs/apache-airflow/stable/tutorial/fundamentals.html) · Apache Airflow · DAGs, operators, templating and dependencies, in the official tutorial.
- docs: [Quick start](https://airflow.apache.org/docs/apache-airflow/stable/start.html) · Apache Airflow · Installing with constraints and running `airflow standalone`.
- read: [Hands-on Apache Airflow 3.0 tutorial](https://www.startdataengineering.com/post/airflow-tutorial/) · Start Data Engineering · A practical, production-minded walk through Airflow 3.
- read: [Orchestrate dbt Core jobs with Airflow](https://www.astronomer.io/docs/learn/airflow-dbt) · Astronomer · Options for running dbt from Airflow, including Cosmos.
- watch: [Write your first DAG in Airflow 3 for beginners](https://www.youtube.com/watch?v=dX6p-EwnkP4) · Data with Marc · 41.2K subscribers · 21.6K views · 616 likes · published 2025-06-20 · checked 2026-09-27 · 20 min
- watch: [Airflow Tutorial for Beginners - Full Course in 2 Hours 2022](https://www.youtube.com/watch?v=K9AnJ9_ZAXE) · coder2j · 18.7K subscribers · 1.0M views · 15K likes · published 2022-06-05 · checked 2026-09-27 · 121 min

## Practice

Be the scheduler, then run the real one.

1. On paper, arrange these eight ShopLink tasks into a valid DAG with as much parallelism as possible: extract orders, extract customers, extract FX rate, load raw orders, load raw customers, load raw FX, dbt build, send daily report email. Then imagine `load raw customers` fails after all retries. List which tasks still run and which must not.
2. Install Airflow and add `dags/shoplink_daily.py` to your repo.
3. Run `airflow dags test shoplink_daily` for one date, then trigger two runs for the same date from the UI. Show that the row count for that `_load_date` is the same after both.
4. Break the extract on purpose (stop the mock API) and trigger a run. Watch the retries in the task log, and find your alert message.

## Example answer

A valid DAG for step 1:

```text
extract_orders    -> load_raw_orders    \
extract_customers -> load_raw_customers  -> dbt_build -> send_report
extract_fx        -> load_raw_fx        /
```

The three extract-and-load pairs are independent, so they run in parallel. `dbt_build` waits for all three loads, because the marts join orders, customers and FX rates. The report waits for dbt.

If `load_raw_customers` fails: the other extracts and loads still run and succeed (they do not depend on it). `dbt_build` and `send_report` must not run, and Airflow marks them "upstream_failed". Sending the report would show leadership numbers built on yesterday's customers mixed with today's orders.

In Airflow code, the fan-in is written `[load_orders, load_customers, load_fx] >> dbt_build >> send_report`.

For step 4, the task log shows `extract_orders` failing with a connection error, being marked "up_for_retry", and trying again five minutes later. After the fourth failed attempt (the first try plus three retries) the task log contains `ALERT shoplink_daily: task extract_orders failed for 2026-09-27`, and `load_raw` and `dbt_build` are marked upstream failed. Restart the API and clear the failed task in the UI, and the run completes.

# Lesson: Docker for data engineers

minutes: 55

## "It works on my machine"

Your pipeline needs Python 3.11 or newer, a specific set of packages and a running API. A colleague's laptop has Python 3.9. The production server has no FastAPI. Every difference is a chance for the pipeline to fail somewhere it passed for you.

**Docker** removes those differences by packaging your code together with everything it needs to run. It is now a basic tool of data engineering: Airflow, Spark, Kafka and most databases are distributed as Docker images, and most production pipelines run inside containers.

## Images, containers, volumes and ports

| Idea | What it is | ShopLink example |
|---|---|---|
| Image | A read-only package: an operating system layer, your code and its dependencies | `shoplink-ingest`, built from your repo |
| Container | A running instance of an image, isolated from your laptop | The mock API, running from that image |
| Dockerfile | The recipe that builds an image, step by step | The five lines below |
| Volume | A folder shared between your laptop and a container, so data outlives the container | `./data` mounted into the container |
| Port mapping | Makes a port inside the container reachable from your laptop | `8000:8000` for the API |
| Network | Lets containers reach each other by service name | The pipeline calls `http://api:8000` |

Install Docker Desktop (Windows or macOS) or Docker Engine (Linux), then check it works with `docker run --rm hello-world`. On Windows, enable the WSL2 integration in Docker Desktop's settings so `docker` works from your Ubuntu terminal.

## A Dockerfile for the ShopLink pipeline

Save this as `Dockerfile` in the repo root:

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY ingestion/ ingestion/
```

Each line is a layer. Docker caches layers, which is why `requirements.txt` is copied and installed before the code: when you change only your Python, the slow install step is reused. Build and try it:

```bash
docker build -t shoplink-ingest .
docker run --rm shoplink-ingest python --version
```

## Compose: several containers as one system

Real pipelines have more than one moving part. **Docker Compose** describes them all in one file and starts them together. Save this as `compose.yaml`:

```yaml
services:
  api:
    build: .
    command: ["uvicorn", "ingestion.mock_api:app", "--host", "0.0.0.0", "--port", "8000"]
    environment:
      SHOPLINK_BATCHES: shoplink
    volumes:
      - ./data:/app/data:ro
    ports:
      - "8000:8000"

  ingest:
    build: .
    profiles: ["jobs"]
    environment:
      SHOPLINK_API_URL: http://api:8000/orders
      SHOPLINK_DB: /app/shoplink.duckdb
    volumes:
      - .:/app
    depends_on:
      - api
```

Then:

```bash
docker compose up -d api
docker compose run --rm ingest python ingestion/pipeline.py all 2026-09-27
docker compose logs api
docker compose down
```

Three details carry over to every compose file you will read:

- **Services find each other by name.** Inside the network, the pipeline calls `http://api:8000`, not `localhost`. Inside a container, `localhost` means that container itself.
- **`depends_on` only controls start order**, not readiness. The API may still be starting when the pipeline makes its first request. The retry and backoff in `get_json` absorbs that, which is one more reason to write it.
- **Volumes keep your data.** The `ingest` service mounts the whole repo at `/app`, so the raw files land in your `data/` folder and the load writes to `shoplink.duckdb` at your repo root, the same file dbt reads. Both survive `docker compose down`. Without the volume they would vanish with the container. (Mounting the folder rather than the single `.duckdb` file matters: if you mount a file that does not exist yet, Docker creates a directory with that name instead.)

The `profiles: ["jobs"]` line means `docker compose up` starts only the long-running API. The ingest job runs when you ask for it with `docker compose run`.

## The week4-stack: a lakehouse on your laptop

The rest of this module uses a larger compose project, the **week4-stack**, in the course's GitHub repository: [github.com/Gtoba1/1501Learn/tree/main/week4-stack](https://github.com/Gtoba1/1501Learn/tree/main/week4-stack). It runs a complete open-source lakehouse on one machine, at no cost, with no cloud account or credit card:

| File | What it does |
|---|---|
| `week4-stack/docker-compose.yml` | Defines every service: MinIO, a Spark master and two workers, Kafka, a Jupyter driver, and an optional governance profile |
| `week4-stack/driver/Dockerfile` | Builds the Jupyter notebook image from the same Spark image as the cluster, adding delta-spark, kafka-python, boto3, DuckDB and pandas |
| `week4-stack/conf/spark-defaults.conf` | Spark settings mounted into every Spark container: the Delta Lake and S3 packages, and how to reach MinIO |
| `week4-stack/infra/main.tf` and `variables.tf` | OpenTofu code that creates the storage buckets (you use these later in the module) |
| `week4-stack/README.md` | Ports, logins, memory advice and known snags |

The services, and what each maps to in industry:

| Service | Open-source tool | What it stands in for |
|---|---|---|
| `minio` | MinIO object storage, with `bronze`, `silver` and `gold` buckets | Amazon S3, Azure Data Lake Storage |
| `spark-master`, `spark-worker` (2 replicas) | Apache Spark 3.5 standalone cluster | Databricks, EMR, Fabric Spark, any managed Spark |
| `driver` | JupyterLab, where you write PySpark | A notebook in a managed platform |
| `kafka` | Apache Kafka in KRaft mode (no ZooKeeper) | Confluent, Azure Event Hubs, Redpanda |
| `unity-catalog`, `marquez` (governance profile) | Unity Catalog OSS, OpenLineage with Marquez | Unity Catalog, Microsoft Purview |

## Running the week4-stack

Allow about 16 GB of RAM for the full stack. With 8 GB, run only the core services and close other programs. The first start downloads several GB of images, so do it on a good connection.

```bash
git clone https://github.com/Gtoba1/1501Learn.git
cd 1501Learn/week4-stack
mkdir -p work
docker compose up -d --build
docker compose ps
```

`mkdir -p work` creates the folder that holds your notebooks, mounted into the driver at `/home/spark/work`. On Linux, the container's `spark` user may not be able to write to a folder your own user created. If JupyterLab cannot save a notebook, run `chmod 777 work` and try again.

When `docker compose ps` shows the services running:

| Open this | To see |
|---|---|
| http://localhost:8888 | JupyterLab (no password) |
| http://localhost:8080 | The Spark master: check that two workers are registered |
| http://localhost:9001 | The MinIO console, login `shoplink` / `shoplink123`: check the three buckets exist |
| http://localhost:4040 | The Spark application UI, only while a Spark session is running |

The first Spark job downloads the Delta Lake and S3 connector jars from Maven, so it is slow once and needs internet. After that they are cached.

Useful commands while it runs:

```bash
docker compose logs -f driver
docker compose stop
docker compose start
docker compose down
docker compose down -v
```

`down` removes the containers but keeps your data volumes. `down -v` also deletes the volumes, which wipes everything in MinIO. Use it only when you want a clean start.

If you are short on memory, edit `replicas: 2` to `replicas: 1` under `spark-worker`. The README lists other known snags, such as what to do if the `apache/spark:3.5.3-python3` image tag cannot be found.

A note on the credentials: `shoplink` / `shoplink123` are written into the compose file so the stack starts with no setup. That is acceptable only because nothing is exposed beyond your own laptop. Never carry this pattern into real work; the last lesson shows what to do instead.

## Resources

- docs: [Docker: get started](https://docs.docker.com/get-started/) · Docker · Official introduction to images, containers and Compose.
- docs: [Docker Compose overview](https://docs.docker.com/compose/) · Docker · How compose files, services, networks and profiles work.
- project: [week4-stack](https://github.com/Gtoba1/1501Learn/tree/main/week4-stack) · 1501 Learn on GitHub · The lakehouse stack used for the rest of this module, with its README.
- watch: [Docker in 100 Seconds](https://www.youtube.com/watch?v=Gjnup-PuquQ) · Fireship · 4.28M subscribers · 1.3M views · 53.6K likes · published 2020-08-17 · checked 2026-09-27 · 2 min
- watch: [Docker Tutorial for Beginners [FULL COURSE in 3 Hours]](https://www.youtube.com/watch?v=3c-iBn73dDE) · TechWorld with Nana · 1.49M subscribers · 6.5M views · 105.1K likes · published 2020-10-21 · checked 2026-09-27 · 166 min

## Practice

Containerise your pipeline, then bring up the lakehouse.

1. Add the `Dockerfile` and `compose.yaml` above to your repo. Start the API with compose and run the pipeline for one date with `docker compose run`. Check that `shoplink.duckdb` at your repo root has the rows.
2. Read `week4-stack/docker-compose.yml` in the 1501Learn repo and answer: which service creates the three buckets, and how does it know MinIO is ready? Why is port 8080 not used for Unity Catalog? What would break if the driver were built from a different Spark version than the workers?
3. Bring up the week4-stack, and take a screenshot of the Spark master UI showing two workers and of the MinIO console showing the three buckets.

## Example answer

For step 1, `docker compose run --rm ingest python ingestion/pipeline.py all 2026-09-27` prints the same extract and load lines as running it locally, and `select count(*) from raw.orders_api where _load_date = '2026-09-27'` in `shoplink.duckdb` at the repo root returns a count for that date (9,091 if it is the first load date, with the API serving batch 1). Close any SQL tool that has the file open before you run the job: only one process can write to a DuckDB file at a time. If it fails with a connection error, the pipeline is probably still pointing at `localhost`: check that `SHOPLINK_API_URL` is set to `http://api:8000/orders`.

For step 2:

- The `minio-init` service creates the buckets with the MinIO client (`mc mb -p local/bronze local/silver local/gold`). It waits because of `depends_on` with `condition: service_healthy`: the `minio` service has a healthcheck (`mc ready local`), and `minio-init` only starts once it passes. This is the readiness check that plain `depends_on` does not give you.
- Port 8080 on the laptop is already taken by the Spark master UI, so Unity Catalog's port 8080 inside its container is mapped to 8085 outside (`"8085:8080"`).
- Spark sends serialised code and data between the driver and the executors, and the formats can change between versions. A mismatch usually fails with confusing serialisation or class errors. That is why the driver image is built `FROM` the same Spark tag as the cluster, and why the README says to change both together.

For step 3, the master UI lists two workers with state ALIVE, 2 cores and 2 GB each, and the MinIO console's bucket list shows `bronze`, `silver` and `gold`. If only one worker appears, your machine is probably short of memory.

# Lesson: The lakehouse and Spark

minutes: 60

## From files to tables

A **data lake** is cheap files in **object storage**: Amazon S3, Azure Data Lake Storage, Google Cloud Storage, or MinIO on your laptop. Object storage is extremely cheap per GB and practically unlimited, and it separates storage from compute: the data sits there permanently, and you pay for processing power only while a job runs.

Plain files have a problem, though. There are no transactions. If a job crashes halfway through writing 40 files, readers see 23 of them. Two jobs writing at once can interleave. Nothing stops a job writing a column as text that was a number yesterday.

A **table format** fixes this by keeping a transaction log next to the data files. The log, not the list of files, defines what the table contains. The two main formats are **Delta Lake** and **Apache Iceberg**:

| Feature | What it gives you |
|---|---|
| ACID transactions | A write either commits to the log or did not happen. Readers never see half a load |
| Schema enforcement | A write with the wrong column types is rejected instead of silently corrupting the table |
| MERGE | Upserts in one atomic operation, including "update only if newer" |
| Time travel | Every commit is a version, so you can read or restore the table as it was before a bad load |

Data lake plus table format is called a **lakehouse**: the cheap, open storage of a lake with the reliability of a warehouse. Delta Lake is the default on Databricks and Microsoft Fabric. Iceberg is widely supported by Snowflake, AWS, Trino and others. The week4-stack uses Delta Lake, but the ideas are the same in both.

## What Spark is

**Apache Spark** processes data that is too big for one machine. It splits a dataset into **partitions** and processes them in parallel across many machines (executors). You write code against a **DataFrame**, much like pandas, and Spark plans how to spread the work.

Two kinds of operation matter for performance:

- **Narrow** operations, such as `filter` and `withColumn`, work within one partition. They are cheap.
- **Wide** operations, such as `groupBy`, `join` and `distinct`, need all rows with the same key in the same place, so Spark moves data across the network between executors. This is a **shuffle**, and it is nearly always the expensive part of a job.

The first lever to pull on a slow join is to **broadcast** the small side: send a copy of a small table (under roughly 10 MB) to every executor, so the large table never has to shuffle. ShopLink's 120 products are a perfect example.

## When Spark beats a warehouse, and when it does not

| Situation | Better choice |
|---|---|
| ShopLink's whole dataset (a few MB), or anything up to tens of GB | DuckDB, or your cloud warehouse. Faster, cheaper and simpler than Spark |
| Hundreds of GB to many TB of files in object storage | Spark on a lakehouse |
| Heavy transformation in Python, or machine learning on big data | Spark |
| Mostly SQL over modelled tables, used by analysts and BI | A warehouse such as Snowflake, or a SQL engine over the lakehouse |
| Streaming data | Spark Structured Streaming or a dedicated streaming engine |

Be honest with yourself here. ShopLink does not need Spark. You use it with ShopLink's data in this lesson because the data is familiar, so you can concentrate on the tool. Rewarding the team that says "DuckDB, and stop" is a sign of engineering maturity, not laziness.

## Hands on: ShopLink in the lakehouse

Bring up the week4-stack and copy the ShopLink extracts into its `work` folder, so the driver can see them: `week4-stack/work/data/shoplink/orders.csv`, `week4-stack/work/data/shoplink-batch-2/orders.csv` and so on for both batches. Open JupyterLab at http://localhost:8888 and create a notebook.

**Cell 1: start Spark and upload the raw files to the bronze bucket.** The Delta and MinIO settings already come from `conf/spark-defaults.conf`, so the session needs only the master URL:

```python
import os

import boto3
from delta.tables import DeltaTable
from pyspark.sql import SparkSession
from pyspark.sql import functions as F

spark = (SparkSession.builder
    .master(os.environ["SPARK_MASTER_URL"])
    .appName("shoplink-lakehouse")
    .getOrCreate())

s3 = boto3.client("s3", endpoint_url="http://minio:9000",
                  aws_access_key_id="shoplink", aws_secret_access_key="shoplink123")
for batch in ["shoplink", "shoplink-batch-2"]:
    for table in ["customers", "products", "warehouses", "orders", "order_lines"]:
        path = f"data/{batch}/{table}.csv"
        if os.path.exists(path):
            s3.upload_file(path, "bronze", f"{batch}/{table}.csv")
```

The files executors need must be in shared storage, not on the driver's disk. That is why you upload to MinIO first: every Spark worker can read `s3a://bronze/...`, but none of them can see the driver's `work` folder.

**Cell 2: clean batch 1 into silver Delta tables.**

```python
def read_bronze(batch, table):
    return (spark.read.option("header", True).option("inferSchema", True)
            .csv(f"s3a://bronze/{batch}/{table}.csv"))


def clean_orders(df):
    return (df
        .withColumn("status", F.lower(F.trim("status")))
        .withColumn("order_date", F.to_date("order_date"))
        .withColumn("updated_at", F.to_timestamp("updated_at"))
        .select("order_id", "customer_id", "warehouse_id", "order_date",
                "status", "channel", "updated_at"))


clean_orders(read_bronze("shoplink", "orders")).write.format("delta") \
    .mode("overwrite").save("s3a://silver/orders")

(read_bronze("shoplink", "order_lines")
    .dropDuplicates()
    .filter(F.col("quantity") > 0)
    .write.format("delta").mode("overwrite").save("s3a://silver/order_lines"))

read_bronze("shoplink", "products").write.format("delta") \
    .mode("overwrite").save("s3a://silver/products")
```

Open the MinIO console and browse to `silver/orders/_delta_log/`. The first file, `00000000000000000000.json`, is the transaction log's first commit. Open it: it lists the Parquet files that make up version 0 of the table, and the schema.

**Cell 3: merge batch 2 into silver, updating only when the source is newer.**

```python
changes = clean_orders(read_bronze("shoplink-batch-2", "orders"))

(DeltaTable.forPath(spark, "s3a://silver/orders").alias("t")
    .merge(changes.alias("s"), "t.order_id = s.order_id")
    .whenMatchedUpdateAll(condition="s.updated_at > t.updated_at")
    .whenNotMatchedInsertAll()
    .execute())

spark.sql("DESCRIBE HISTORY delta.`s3a://silver/orders`") \
    .select("version", "operation", "operationMetrics").show(truncate=False)
```

The history shows version 1 as a MERGE, with metrics for rows updated (the 132 changed June orders) and inserted (the 433 new July orders). The table now holds 9,524 orders. The `condition` on the update is the same idea as the `where` on DuckDB's upsert in the ingestion lesson: without it, an old record arriving late would overwrite a newer one.

**Cell 4: build a gold table with a broadcast join.**

```python
lines = spark.read.format("delta").load("s3a://silver/order_lines")
orders = spark.read.format("delta").load("s3a://silver/orders")
products = spark.read.format("delta").load("s3a://silver/products")

monthly = (lines
    .join(orders.filter(~F.col("status").isin("cancelled", "returned")), "order_id")
    .join(F.broadcast(products.select("product_id", "category")), "product_id")
    .groupBy(F.date_trunc("month", "order_date").alias("month"), "category")
    .agg(F.sum(F.col("quantity") * F.col("unit_price")
               * (1 - F.col("discount_pct") / 100)).alias("net_revenue")))

monthly.explain(mode="formatted")
monthly.write.format("delta").mode("overwrite").save("s3a://gold/monthly_category_revenue")
```

In the plan printed by `explain`, look for `BroadcastHashJoin` on the products join. While the write runs, open http://localhost:4040, click the job, and look at the stages: the boundaries between stages are the shuffles.

**Cell 5: time travel and restore.**

```python
path = "s3a://silver/orders"
print(spark.read.format("delta").option("versionAsOf", 0).load(path).count())  # 9091
print(spark.read.format("delta").load(path).count())                           # 9524
```

If a bad load ever lands, `DeltaTable.forPath(spark, path).restoreToVersion(n)` puts the table back as it was at version `n`. The restore is itself a new commit, so even the undo is in the history.

## Moving to the cloud

Everything above talks to MinIO through `s3a://` paths. To run the same code against Amazon S3 or Azure Data Lake Storage, you change the endpoint and credentials in `spark-defaults.conf` (or your platform's equivalent), not the code. That portability is why the course uses open tools: every concept here transfers to Databricks, Fabric, EMR or any other managed Spark.

## Resources

- docs: [Delta Lake documentation](https://docs.delta.io/latest/index.html) · Delta Lake · Batch reads and writes, MERGE, history and time travel.
- docs: [Apache Iceberg documentation](https://iceberg.apache.org/docs/latest/) · Apache Iceberg · The other major open table format.
- docs: [PySpark DataFrame quickstart (Spark 3.5)](https://spark.apache.org/docs/3.5.8/api/python/getting_started/quickstart_df.html) · Apache Spark · Creating, transforming and writing DataFrames.
- docs: [Spark SQL performance tuning](https://spark.apache.org/docs/latest/sql-performance-tuning.html) · Apache Spark · Broadcast joins, shuffle partitions and adaptive query execution.
- watch: [Databricks Lakehouse Architecture | Delta Lake Databricks |Data Warehouse vs Data Lake vs Lakehouse](https://www.youtube.com/watch?v=NVhPkS7F5-8) · SleekData · 20.1K subscribers · 13.7K views · 249 likes · published 2024-11-22 · checked 2026-09-27 · 15 min
- watch: [PySpark Tutorial for Beginners](https://www.youtube.com/watch?v=EB8lfdxpirM) · coder2j · 18.7K subscribers · 191.3K views · 4.1K likes · published 2023-10-08 · checked 2026-09-27 · 48 min
- watch: [PySpark Tutorial | Full Course (From Zero to Pro!)](https://www.youtube.com/watch?v=94w6hPk7nkM) · Ansh Lamba · 154K subscribers · 1.3M views · 18.9K likes · published 2024-11-10 · checked 2026-09-27 · 354 min

## Practice

Work through the five cells above, then:

1. Merge batch 2's order lines into `silver/order_lines`. Batch 2 has only new lines, so you might be tempted to use `mode("append")`. Explain why that is not idempotent, and write a MERGE that is.
2. Run `DESCRIBE HISTORY` on `silver/orders` and say which version added the most rows and how you know.
3. Run the gold job twice: once with `F.broadcast(...)` and once without it. Compare the physical plans and the shuffle read and write sizes on the stage page in the Spark UI. Write three sentences on what changed.
4. A colleague says "Delta is just Parquet". Give two things that stop being true if you delete the `_delta_log` folder.

## Example answer

1. Appending twice would insert the 1,230 batch 2 lines twice. A MERGE on the key inserts only lines that are not there yet, so a rerun changes nothing:

```python
new_lines = read_bronze("shoplink-batch-2", "order_lines").dropDuplicates().filter(F.col("quantity") > 0)

(DeltaTable.forPath(spark, "s3a://silver/order_lines").alias("t")
    .merge(new_lines.alias("s"), "t.order_line_id = s.order_line_id")
    .whenNotMatchedInsertAll()
    .execute())
```

2. Version 0 (the initial write, operation WRITE) added the most rows: its `operationMetrics` shows `numOutputRows` of 9091. Version 1 (the MERGE) shows `numTargetRowsInserted` of 433 and `numTargetRowsUpdated` of 132.

3. A strong answer: "With the broadcast hint, the plan shows BroadcastHashJoin for products and the products side never shuffles. Without it, Spark may use a SortMergeJoin, which shuffles both sides by product_id and adds a stage with shuffle read and write bytes. On data this small the time difference is tiny, but on a 500-million-row order lines table the shuffle would dominate the runtime." Note that Spark broadcasts small tables automatically when it knows their size (below `spark.sql.autoBroadcastJoinThreshold`), so you may see a broadcast even without the hint; saying so, with the evidence from your plan, is a perfectly good answer.

4. Without the log: there are no transactions, so a reader could see a half-finished write and concurrent writers could corrupt the table; and there is no history, so time travel and restore are gone. The Parquet files are still readable, but Spark no longer knows which of them belong to the current version, so old files that were logically deleted by the MERGE would reappear as duplicates.

# Lesson: Streaming and real time

minutes: 50

## Batch and streaming

Everything so far has been **batch**: take a bounded chunk of data (yesterday's orders), process it, stop. **Streaming** processes an unbounded flow of events continuously, as they happen.

Before building anything, ask what latency the business actually needs. "Real time" is one of the most expensive phrases in data. If ShopLink's leadership wants the dashboard right for the 09:00 meeting, a nightly batch is enough. If warehouse managers want stock levels every 15 minutes, a 15-minute micro-batch is enough. True streaming earns its cost when a decision changes within seconds: fraud checks on a payment, or alerting a rep that a big reseller's order has just failed.

## Kafka in five ideas

**Apache Kafka** is the standard transport for streaming data. It is a distributed log of events.

| Idea | Meaning |
|---|---|
| Topic | A named stream of events, such as `shoplink.orders` |
| Partition | A topic is split into ordered partitions, so it can be spread over many machines |
| Offset | The position of an event within a partition: event 0, 1, 2... |
| Producer | Writes events to a topic, for example the ShopLink web app when an order is placed |
| Consumer group | Readers that share the work of a topic, each remembering which offset it has reached |

The property that makes Kafka different from a simple queue is that it is **replayable**. Events stay in the topic for a retention period, whether or not anyone has read them. If a consumer has a bug, you fix it and re-read from an earlier offset. Nothing is lost.

## Four ideas that cause the confusion

- **Event time and processing time.** Event time is when the order was placed. Processing time is when your job saw it. Always aggregate on event time, or your numbers change depending on how busy the cluster was.
- **Micro-batches.** Spark Structured Streaming does not process events one by one. It collects what arrived in the last trigger interval (say one minute) and processes that as a small batch. Streaming, in practice, is often many tiny batch jobs.
- **Watermarks.** Some events arrive late: a rep's phone was offline in a Kano warehouse with no signal. A watermark says how late an event may be and still count. With a 10-minute watermark, the five-minute window for 10:00 to 10:05 stays open until Spark has seen events up to 10:15, then it is final. Too tight and you drop real revenue; too loose and Spark holds state in memory for a long time. It is a business decision wearing an engineering costume.
- **Checkpoints.** The stream records which Kafka offsets it has processed, and its in-progress state, in a checkpoint folder. If the job stops and restarts, it resumes exactly where it left off.

## Exactly once, intuitively

Delivery guarantees come in three strengths: **at most once** (events may be lost), **at least once** (events may be processed twice) and **exactly once**. Exactly once is not magic. It comes from two things working together: a replayable source with checkpointed offsets, so nothing is skipped, and an idempotent or transactional sink, so reprocessing an offset range does not write it twice. Spark's Delta sink records which micro-batch it has committed, so a restarted stream that replays the last batch does not double count. This is the same idempotency idea as the ingestion lesson, applied to a stream.

## Hands on: ShopLink orders as a stream

Use the week4-stack. Only one Spark application gets the cluster's cores at a time by default, so first shut down the kernel of your lakehouse notebook (Kernel, then Shut Down Kernel).

**Notebook 1: a producer.** It sends a simulated order every half second for 30 minutes. Every 50th event pretends to be 20 minutes late.

```python
import json
import random
import time
from datetime import datetime, timedelta, timezone

from kafka import KafkaProducer

producer = KafkaProducer(
    bootstrap_servers="kafka:9092",
    value_serializer=lambda v: json.dumps(v).encode("utf-8"),
)

for i in range(3600):
    event_time = datetime.now(timezone.utc)
    if i % 50 == 49:
        event_time -= timedelta(minutes=20)  # a late event from a phone with no signal
    producer.send("shoplink.orders", {
        "order_id": 200000 + i,
        "warehouse_id": random.randint(1, 5),
        "amount": random.randint(50_000, 2_000_000),
        "event_time": event_time.isoformat(timespec="seconds"),
    })
    time.sleep(0.5)
producer.flush()
```

**Notebook 2: the stream.** Reading Kafka needs one more Spark package than `spark-defaults.conf` provides. Setting `spark.jars.packages` in the session replaces the default list, so it repeats the Delta and S3 packages too. This must be the first cell of a fresh kernel:

```python
import os

from pyspark.sql import SparkSession
from pyspark.sql import functions as F

spark = (SparkSession.builder
    .master(os.environ["SPARK_MASTER_URL"])
    .appName("shoplink-stream")
    .config("spark.jars.packages", ",".join([
        "io.delta:delta-spark_2.12:3.2.0",
        "org.apache.hadoop:hadoop-aws:3.3.4",
        "org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.3",
    ]))
    .getOrCreate())

order_schema = "order_id INT, warehouse_id INT, amount LONG, event_time TIMESTAMP"

events = (spark.readStream.format("kafka")
    .option("kafka.bootstrap.servers", "kafka:9092")
    .option("subscribe", "shoplink.orders")
    .option("startingOffsets", "earliest")
    .load()
    .select(F.from_json(F.col("value").cast("string"), order_schema).alias("o"))
    .select("o.*"))

per_5_min = (events
    .withWatermark("event_time", "10 minutes")
    .groupBy(F.window("event_time", "5 minutes"), "warehouse_id")
    .agg(F.sum("amount").alias("revenue"), F.count("*").alias("orders")))

query = (per_5_min.writeStream.format("delta")
    .outputMode("append")
    .option("checkpointLocation", "s3a://gold/_checkpoints/revenue_5min")
    .trigger(processingTime="1 minute")
    .start("s3a://gold/revenue_5min"))
```

Rows only appear in `gold/revenue_5min` about 15 minutes after the first events: in append mode a window is written once, when the watermark has passed its end. That wait is the watermark doing its job. Check progress with `query.lastProgress`, and read the table from any cell with `spark.read.format("delta").load("s3a://gold/revenue_5min")`.

## Resources

- docs: [Structured Streaming programming guide (Spark 3.5)](https://spark.apache.org/docs/3.5.8/structured-streaming-programming-guide.html) · Apache Spark · Triggers, watermarks, output modes and checkpoints.
- docs: [Structured Streaming and Kafka integration (Spark 3.5)](https://spark.apache.org/docs/3.5.8/structured-streaming-kafka-integration.html) · Apache Spark · Every Kafka source option, and the package you need.
- docs: [Kafka quickstart](https://kafka.apache.org/quickstart) · Apache Kafka · Topics, producers and consumers from the command line.
- watch: [Kafka in 100 Seconds](https://www.youtube.com/watch?v=uvb00oaa3k8) · Fireship · 4.28M subscribers · 1.2M views · 36K likes · published 2023-01-10 · checked 2026-09-27 · 3 min

## Practice

1. Before running anything, fill in this table by hand. Windows are five minutes long and the watermark is 10 minutes. Events arrive in this order, each written as (event time, amount in naira): (10:01, 200,000), (10:03, 150,000), (10:07, 400,000), (10:02, 100,000), (10:16, 300,000), (10:04, 250,000). For each event, say which window it belongs to and whether it is counted in that window.
2. Run the producer and the stream for at least 20 minutes. Check that the late events (every 50th) are missing from the totals.
3. Stop the stream with `query.stop()` while the producer is still running. Wait two minutes, then run the stream cell again, with the same checkpoint location. Prove from the gold table that no window was written twice.
4. Answer: what happens if you restart the stream after deleting the checkpoint folder, and why is it worse than it first looks?

## Example answer

1. Spark's watermark is the latest event time seen, minus 10 minutes.

| Event | Window | Watermark just before it arrives | Counted? |
|---|---|---|---|
| 10:01, 200,000 | 10:00 to 10:05 | none yet | Yes |
| 10:03, 150,000 | 10:00 to 10:05 | 09:51 | Yes |
| 10:07, 400,000 | 10:05 to 10:10 | 09:53 | Yes |
| 10:02, 100,000 | 10:00 to 10:05 | 09:57 | Yes: late, but within the watermark |
| 10:16, 300,000 | 10:15 to 10:20 | 09:57 | Yes. The watermark then moves to 10:06, which closes the 10:00 to 10:05 window |
| 10:04, 250,000 | 10:00 to 10:05 | 10:06 | No: its window already closed, so it is dropped |

The 10:00 to 10:05 window is written with 450,000 naira from three orders. (In Spark the watermark actually advances between micro-batches rather than after every event, so exactly which late events survive depends on how they fall into batches; the principle is the same.)

2. With the producer's late events 20 minutes behind and a 10-minute watermark, they fall into windows that have already closed, so they are silently dropped. Summing `orders` across the gold table gives about 49 of every 50 events sent.

3. The proof:

```python
gold = spark.read.format("delta").load("s3a://gold/revenue_5min")
gold.groupBy("window", "warehouse_id").count().filter("count > 1").count()  # 0
```

Zero duplicate windows means the restart resumed from the checkpoint: it read on from the last committed offsets and the Delta sink did not rewrite a batch it had already committed.

4. Without the checkpoint, the stream has no record of what it processed, so it starts again from `startingOffsets` (here `earliest`) and reprocesses every event still in the topic. It is worse than it looks because in append mode the duplicate windows are simply added to the gold table: nothing fails, the job looks healthy, and revenue is silently double counted until someone reconciles the totals. Checkpoints must be treated as part of the table, not as temporary files.

# Lesson: Infrastructure as code with OpenTofu

minutes: 55

## Why infrastructure belongs in Git

Everything you have built in this course is code in a repository: SQL, dbt models, Python, a DAG. The storage buckets, databases, permissions and servers underneath it usually are not. Someone clicked them into existence in a web console. When that person leaves, or a bucket is changed by hand at 23:00, nobody can say exactly how the platform is set up, and nobody can rebuild it.

**Infrastructure as code (IaC)** describes infrastructure in text files that live in Git. Changes go through pull requests and review like any other code. The test of whether you really have it: can you destroy the environment and rebuild it from the repository alone?

**Terraform** is the most widely used IaC tool. **OpenTofu** is its open-source fork, maintained by the Linux Foundation after Terraform's licence changed in 2023. The language and commands are almost identical: `tofu` instead of `terraform`. Everything you learn here applies to both.

## The core ideas

| Idea | Meaning |
|---|---|
| Provider | A plugin that knows how to talk to one platform: AWS, Azure, Snowflake, GitHub, MinIO... |
| Resource | One thing you want to exist, such as a bucket |
| Variable | An input, such as a password, so it is not written into the code |
| Output | A value the run prints or exposes, such as the list of buckets created |
| State | OpenTofu's record of what it has created, so it can compare the code with reality |
| Plan | A preview: what OpenTofu would create, change or destroy to make reality match the code |
| Apply | Carrying out the plan |

You describe what you want, not the steps to get there. OpenTofu works out the steps.

## Reading the week4-stack infra folder

Open `week4-stack/infra/main.tf` in the [1501Learn repository](https://github.com/Gtoba1/1501Learn/tree/main/week4-stack). Its three parts:

```hcl
terraform {
  required_version = ">= 1.6"
  required_providers {
    minio = {
      source  = "aminueza/minio"
      version = "~> 3.0"
    }
  }
}

provider "minio" {
  minio_server   = var.minio_server
  minio_user     = var.minio_user
  minio_password = var.minio_password
  minio_ssl      = false
}

resource "minio_s3_bucket" "layer" {
  for_each = toset(["bronze", "silver", "gold"])
  bucket   = each.key
}
```

- The `terraform` block (OpenTofu keeps the same keyword) pins the tool version and the MinIO provider. `~> 3.0` means "any 3.x version".
- The `provider` block says how to connect. Its values come from variables.
- The `resource` block uses `for_each` to create three buckets from one definition. They are addressed as `minio_s3_bucket.layer["bronze"]` and so on.

The file also has a `minio_ilm_policy` resource: a lifecycle rule that deletes objects in `bronze` 90 days after they land, so raw files cannot grow forever. And an `output` that lists the buckets.

Now open `week4-stack/infra/variables.tf`. The credentials are declared as variables marked `sensitive = true`, with no default. OpenTofu reads them from environment variables named `TF_VAR_` plus the variable name, so the secret never appears in a file you commit. That is the teaching point of the folder, not a detail.

## Running it

Install OpenTofu 1.6 or newer: `brew install opentofu` on macOS, `snap install --classic opentofu` on Ubuntu, or `winget install --exact --id=OpenTofu.Tofu` on Windows. Check with `tofu -version`. With the week4-stack running, from the `infra` folder:

```bash
cd 1501Learn/week4-stack/infra
export TF_VAR_minio_user=shoplink
export TF_VAR_minio_password=shoplink123
tofu init
tofu plan
```

`tofu init` downloads the MinIO provider and writes `.terraform.lock.hcl`, which records the exact provider version. `tofu plan` compares the code with reality.

There is a catch. The stack's `minio-init` service already created the three buckets, but OpenTofu's state is empty, so OpenTofu thinks they do not exist and plans to create them. Applying would fail because they already exist. This is a real situation you will meet at work: infrastructure somebody created by hand that you now want to manage as code. The answer is to **import** it into the state:

```bash
tofu import 'minio_s3_bucket.layer["bronze"]' bronze
tofu import 'minio_s3_bucket.layer["silver"]' silver
tofu import 'minio_s3_bucket.layer["gold"]' gold
tofu plan
tofu apply
tofu output buckets
```

After the imports, the plan should show only the bronze lifecycle policy to add (possibly with small in-place updates to bucket settings). `tofu apply` shows the plan again and asks you to type `yes`.

If your buckets are still empty, you can instead delete them in the MinIO console and let `tofu apply` create all four resources from scratch, which is the week4-stack README's suggested route.

## What goes in Git, and what does not

| File | Commit it? | Why |
|---|---|---|
| `*.tf` | Yes | This is the code |
| `.terraform.lock.hcl` | Yes | Everyone gets the same provider version. A missing lock file is a classic reason one person's apply works and another's fails |
| `.terraform/` | No | Downloaded providers, recreated by `tofu init` |
| `terraform.tfstate` | No | State can contain secrets and must not be edited by hand. Teams keep it in shared remote storage (an S3 bucket, for example) with locking |

## Resources

- docs: [OpenTofu: getting started](https://opentofu.org/docs/intro/) · OpenTofu · What OpenTofu is and the core workflow.
- docs: [Input variables](https://opentofu.org/docs/language/values/variables/) · OpenTofu · Variables, sensitive values and `TF_VAR_` environment variables.
- docs: [Command: import](https://opentofu.org/docs/cli/import/) · OpenTofu · Bringing existing infrastructure under management.
- docs: [MinIO provider](https://search.opentofu.org/provider/aminueza/minio/latest) · OpenTofu Registry · Every resource the week4-stack's provider offers.
- watch: [Terraform in 100 Seconds](https://www.youtube.com/watch?v=tomUWcQ0P3k) · Fireship · 4.28M subscribers · 821.2K views · 31K likes · published 2021-07-28 · checked 2026-09-27 · 2 min
- watch: [Install and use OpenTofu](https://www.youtube.com/watch?v=a-lGAp9vWaQ) · Mathis Van Eetvelde · 2.58K subscribers · 13.1K views · 176 likes · published 2023-09-21 · checked 2026-09-27 · 6 min

## Practice

In your clone of the 1501Learn repo:

1. Run the steps above until `tofu plan` reports "No changes".
2. ShopLink wants a `quarantine` bucket for records that fail validation, where objects expire after 30 days. Add it to the code (you may not use the MinIO console), then plan and apply.
3. Run `tofu destroy -target='minio_ilm_policy.expire_quarantine' -target='minio_s3_bucket.layer["quarantine"]'` (using your own resource names), then `tofu apply` again, and confirm the bucket comes back. Then try destroying the `bronze` bucket while it has files in it, and explain what happens and why that is a good thing.
4. Answer: your `tofu apply` succeeds but a colleague's fails on the same code. Name two likely causes.

## Example answer

For step 2, the smallest change is to add `quarantine` to the `for_each` set and give it its own lifecycle policy (each bucket may have only one `minio_ilm_policy`):

```hcl
resource "minio_s3_bucket" "layer" {
  for_each = toset(["bronze", "silver", "gold", "quarantine"])
  bucket   = each.key
}

resource "minio_ilm_policy" "expire_quarantine" {
  bucket = minio_s3_bucket.layer["quarantine"].bucket

  rule {
    id         = "expire-quarantined-records"
    expiration = "30d"
  }
}
```

`tofu plan` shows "2 to add, 0 to change, 0 to destroy", and after `tofu apply` the output lists four buckets.

For step 3, destroying and re-applying the targeted resources brings the `quarantine` bucket back exactly as defined. Destroying `bronze` fails because the bucket is not empty: the provider will not delete a bucket full of objects unless you set `force_destroy = true` on it. That refusal is a safety feature. Deleting raw data should take a deliberate change to the code, which a reviewer sees in a pull request, not a typo in a terminal. (The ideal of "destroy and rebuild from the repo" applies to the infrastructure; your data needs backups, not IaC.)

For step 4, likely causes: the colleague has a different provider version because the lock file was not committed; their state is out of date or missing (for example each person has a local state file instead of shared remote state); someone changed a bucket by hand so reality has drifted from the state; or their `TF_VAR_` credentials are missing or wrong. Any two, explained, is a full answer.

# Lesson: CI/CD, security and operations

minutes: 55

## From "it runs" to "it runs in production"

A pipeline that works on your laptop is half done. The other half is making sure changes do not break it, that secrets do not leak, and that when it fails at 02:00 the right person finds out and knows what to do. This lesson covers the habits that make that happen. None of them need expensive tools.

## CI/CD for pipeline code

**Continuous integration (CI)** means every change is tested automatically before it is merged. **Continuous delivery (CD)** means merged changes reach production by an automated, repeatable route rather than someone copying files. For a data pipeline, CI usually runs three things on every pull request:

1. **A linter** (ruff for Python, sqlfluff for SQL) that catches mistakes and keeps style consistent.
2. **Unit tests** for the pipeline logic, especially the promises you rely on, such as "a rerun does not duplicate".
3. **A dbt build** of changed models, if the change touches the dbt project.

Here is a test of the idempotency promise, `tests/test_pipeline.py`. It uses pytest's `tmp_path`, so it never touches your real database:

```python
import json

import pipeline


def test_load_is_idempotent(tmp_path, monkeypatch):
    monkeypatch.setattr(pipeline, "DB", str(tmp_path / "test.duckdb"))
    monkeypatch.setattr(pipeline, "RAW", tmp_path / "raw")
    landing = tmp_path / "raw" / "load_date=2026-09-27"
    landing.mkdir(parents=True)
    rows = [
        {"order_id": 1, "customer_id": 10, "warehouse_id": 1, "order_date": "2026-09-27",
         "status": "pending", "channel": "web", "updated_at": "2026-09-27 09:00:00"},
        {"order_id": 2, "customer_id": 11, "warehouse_id": 2, "order_date": "2026-09-27",
         "status": " Shipped", "channel": "whatsapp", "updated_at": "2026-09-27 09:05:00"},
    ]
    (landing / "page-0001.json").write_text(json.dumps(rows))

    assert pipeline.load("2026-09-27") == 2
    assert pipeline.load("2026-09-27") == 2  # a rerun must not duplicate
```

Run it with `PYTHONPATH=ingestion pytest -q`. The `PYTHONPATH` lets the test import `pipeline.py` from the `ingestion` folder.

A GitHub Actions workflow runs the tests on every pull request, and can also run the whole pipeline on a schedule. Save this as `.github/workflows/pipeline.yml`:

```yaml
name: shoplink-pipeline

on:
  pull_request:
  schedule:
    - cron: "0 1 * * *"  # 01:00 UTC is 02:00 in Lagos
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-python@v7
        with:
          python-version: "3.12"
      - run: pip install -r requirements.txt
      - run: ruff check ingestion tests
      - run: pytest -q
        env:
          PYTHONPATH: ingestion

  run-pipeline:
    needs: test
    if: github.event_name != 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-python@v7
        with:
          python-version: "3.12"
      - run: pip install -r requirements.txt
      - name: Start the mock ShopLink API
        run: |
          uvicorn ingestion.mock_api:app --port 8000 &
          sleep 5
        env:
          SHOPLINK_BATCHES: shoplink,shoplink-batch-2
      - name: Extract and load
        run: python ingestion/pipeline.py all "$(date -u +%F)"
      - name: Build the orders_api staging model
        working-directory: shoplink_dbt
        run: |
          dbt deps
          dbt build --target duckdb --select "source:orders_api+1"
      - uses: actions/upload-artifact@v7
        with:
          name: shoplink-duckdb
          path: shoplink.duckdb
```

The scheduled job starts on a fresh machine every time, so it also proves the pipeline can be rebuilt from the repository. `shoplink.duckdb` is not committed, so on that fresh machine the database holds only what this run loaded: `raw.orders_api`, not the other raw tables from Module 3. That is why the dbt step selects `source:orders_api+1`, meaning the `orders_api` source and the models one step downstream of it (the staging model you build in the project), rather than the whole project. The step runs from `shoplink_dbt/`, so `../shoplink.duckdb` reaches the file the pipeline just loaded. `pip install -r requirements.txt` has already installed `dbt-duckdb` from your Module 6 pin, `dbt deps` installs the packages from Module 7, such as `dbt_utils`, which a fresh machine does not have, and `--target duckdb` keeps the build on DuckDB even if Module 9 made Snowflake your default. The finished DuckDB file is saved as a downloadable artifact. For a real company, the database would be a cloud warehouse (as in Module 9) that persists between runs, and this schedule could replace Airflow for a pipeline this simple. GitHub Actions is free for public repositories and includes a monthly allowance of minutes for private ones.

If you have done Module 9, you already have `.github/workflows/dbt.yml`, which runs `dbt build` against Snowflake on every pull request and once a day. Keep it. This workflow sits alongside it: `dbt.yml` tests your models, and `pipeline.yml` tests and runs the ingestion code.

## Secrets

A real ShopLink API would need a key. Keys, passwords and tokens are **secrets**, and the rule is absolute: they never go in code, in a README, or in a commit.

- **Locally**, keep them in a `.env` file that is listed in `.gitignore`, or in your shell's environment. Read them with `os.environ["SHOPLINK_API_TOKEN"]`, which fails loudly if the secret is missing.
- **In CI**, store them in the repository's secret store (Settings, then Secrets and variables, then Actions) and pass them in as environment variables: `SHOPLINK_API_TOKEN: ${{ secrets.SHOPLINK_API_TOKEN }}`. GitHub hides the value in logs.
- **In production**, use a secrets manager (AWS Secrets Manager, Azure Key Vault, HashiCorp Vault) with access limited to the pipeline that needs it.

If a secret is ever committed, deleting it in the next commit is not enough: Git history keeps it, and bots scan public GitHub for keys within minutes. Treat it as stolen and **rotate** it (issue a new one and revoke the old one) straight away. Turn on GitHub's secret scanning so it warns you before it happens.

## Access and personal data

ShopLink's customers table holds names and email addresses. That is personal data, and Nigeria's Data Protection Act 2023 requires a lawful basis for processing it and appropriate safeguards. In practice:

- **Least privilege.** Analysts read marts. Raw schemas containing personal data stay restricted to the pipeline and a few engineers.
- **Mask what you share.** A widely shared customer view does not need raw emails:

```sql
create or replace view analytics.customers_shared as
select
    customer_id,
    customer_type,
    city,
    state,
    md5(lower(trim(email))) as email_hash
from analytics.stg_customers;
```

This runs in `shoplink.duckdb`, where Module 6 builds your models in the `analytics` schema. After Module 9's `+schema` settings, your staging models live in `analytics_staging` and your marts in `analytics_marts`, so read from `analytics_staging.stg_customers` instead.

A hashed email is still arguably personal data: it is a stable identifier that joins across systems and can re-identify someone. Hashing reduces risk; it does not remove your obligations.

## Monitoring and runbooks

A pipeline you cannot see is a pipeline you cannot trust. Three layers of monitoring cover most needs:

1. **Did it run?** The orchestrator's run history and failure alerts.
2. **Did it load what we expected?** Record every run in an audit table, then compare today with recent history:

```python
with connect() as con:
    con.execute("""
        create table if not exists raw._pipeline_runs (
            load_date date, step varchar, row_count integer,
            finished_at timestamp with time zone)
    """)
    con.execute("insert into raw._pipeline_runs values (?, 'load', ?, current_timestamp)",
                [load_date, rows])
```

3. **Is the data fresh and sensible?** dbt source freshness and the row-count and anomaly checks from Module 8.

When something does go wrong, a **runbook** tells the person on call what to do. For each alert it lists: what the alert means, the likely causes, the first checks to make, how to rerun or backfill safely, and how to roll back. Write it before the incident, when you are calm. "Restart the pipeline" is a bad first step in a runbook: it can destroy the evidence and trigger the same failure again. Look first, then act.

## Costs

In the cloud, storage is cheap (a few US cents per GB per month for object storage) and compute is where the bill grows, because it is charged for every second it runs. The habits that keep a ShopLink-sized bill in the thousands of naira rather than the millions: process incrementally rather than reloading everything, pick the smallest engine that does the job (DuckDB before Spark), stop clusters and warehouses when idle (auto-suspend), and expire raw files you can re-fetch, as the week4-stack's bronze lifecycle rule does.

## Resources

- docs: [GitHub Actions documentation](https://docs.github.com/en/actions) · GitHub · Workflows, triggers, jobs and runners.
- docs: [Using secrets in GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions) · GitHub · Creating secrets and passing them safely to workflows.
- docs: [About secret scanning](https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning) · GitHub · How GitHub detects committed keys and tokens.
- read: [Nigeria Data Protection Commission](https://ndpc.gov.ng/) · NDPC · The regulator for the Nigeria Data Protection Act 2023, with guidance for organisations.
- watch: [GitHub Actions Tutorial - Basic Concepts and CI/CD Pipeline with Docker](https://www.youtube.com/watch?v=R8_veQiYBjI) · TechWorld with Nana · 1.49M subscribers · 2.3M views · 39.6K likes · published 2020-10-08 · checked 2026-09-27 · 32 min
- deeper: [Fundamentals of Data Engineering](https://www.oreilly.com/library/view/fundamentals-of-data/9781098108298/) · Joe Reis and Matt Housley, O'Reilly (paid) · The best single book on the whole data engineering lifecycle, including security, DataOps and cost.

## Practice

Do an incident drill on your own, or with a study partner playing the CEO.

The scenario: at 07:30 the CEO messages you that the dashboard shows yesterday's revenue down by about a fifth. (The cause, which the person on call does not know yet: after a system upgrade, the Kano warehouse started sending `unit_price` in kobo instead of naira, so its prices look 100 times too big. Your price-range validation rule quarantined every Kano line, so Kano's sales vanished from revenue. If you have a study partner, only they should read this bracket.)

1. Write the first status message you would send the CEO within five minutes, before you know the cause.
2. List, in order, the first four checks you would make, naming the table or tool for each.
3. Write a five-line postmortem once it is fixed: what happened, impact, cause, fix, and what will stop it happening again.
4. Add the incident as an entry in a `RUNBOOK.md` in your repo.

## Example answer

1. "I've seen it and I'm on it. Revenue looks down about 20% since last night's load; I don't yet know whether it's a data problem or a real drop. I'll update you by 08:00. Until then please treat today's revenue figures as unconfirmed."

Good status messages say you are working on it, what you know, what you do not, when the next update is, and what the reader should do meanwhile.

2. A strong sequence:
   - Airflow run history for last night: did every task succeed? (It did, so this is a data problem, not a failed job.)
   - `raw._pipeline_runs`: compare last night's row counts with the past week. (Order counts are normal, so orders arrived.)
   - The quarantine output: the quarantine rate jumped, and every quarantined line is from warehouse 4, Kano, with `unit_price` about 100 times its usual value.
   - A query on raw order lines comparing Kano's average unit price by day, which shows the change starting with last night's load, then a check with the Kano team, who confirm a system upgrade.

3. Postmortem:
   - What happened: revenue on the executive dashboard fell by about 20% for the 27 September load.
   - Impact: leadership saw wrong figures from 07:00 to 09:15; no decisions were made on them.
   - Cause: the Kano warehouse system upgrade began sending unit prices in kobo, the price-range rule quarantined those lines, and the pipeline did not stop because the 2% quarantine threshold had been added to the orders check but never to the order lines check.
   - Fix: converted Kano's affected prices to naira in staging, reloaded 27 September (safe because the load is idempotent) and confirmed totals against the Kano team's figures.
   - Prevention: applied the quarantine threshold to every validated table, added a per-warehouse quarantine-rate alert, and agreed with the source team that unit changes are announced a week in advance.

Notice what the postmortem leaves out: the name of anyone to blame. It looks for the gap in the system, not the person.

# Quiz

passing_score: 70

### What does it mean for a data pipeline to be idempotent?

- [ ] It runs faster each time it is retried
- [x] Running it twice with the same input gives the same result as running it once
- [ ] It only ever processes new data
- [ ] It never fails

> Idempotency is what makes retries, reruns and backfills safe. In this module it comes from delete-then-insert of a load partition inside a transaction, and from upserts that ignore stale rows.

### Which change in a source table is missed by an incremental load that uses an updated_at watermark, but caught by log-based change data capture?

- [ ] New rows being inserted
- [ ] Existing rows being updated
- [x] Rows being hard deleted
- [ ] Rows with a NULL city

> A deleted row has no updated_at left to query, so a watermark never sees it disappear. CDC reads the database's transaction log, which records deletes as well as inserts and updates.

### In Airflow, what makes it safe to backfill the ShopLink DAG for a week of past dates?

- [ ] Setting retries to zero
- [ ] Running the scheduler twice
- [x] Tasks parameterised by the logical date ({{ ds }}) that are idempotent for that date
- [ ] Using only PythonOperator tasks

> Each backfilled run receives its own logical date and passes it to the pipeline as the load date. Because the load replaces that date's partition, running any date again cannot create duplicates.

### ShopLink's order lines (hundreds of millions of rows in a future year) join to 120 products in Spark. What should you try first to speed up the join?

- [ ] Add ten times more executors
- [x] Broadcast the small products table to every executor
- [ ] Convert the Delta tables to CSV
- [ ] Increase spark.sql.shuffle.partitions to 10,000

> Broadcasting the small side of a join removes the shuffle of the large side, which is usually the most expensive part of the job. Add compute only after fixing the plan.

### An API key for a source system was committed to your GitHub repository, then removed in the next commit. What must you do?

- [ ] Nothing, because the latest commit no longer contains it
- [ ] Make the repository private
- [x] Treat the key as compromised and rotate it, then keep secrets in environment variables or a secret store
- [ ] Add a comment asking people not to use it

> Git history keeps every committed version, and public repositories are scanned for keys within minutes. The only safe response is to revoke the old key and issue a new one.

# Project: ShopLink ingestion pipeline

max_score: 100

## Brief

ShopLink's orders will soon come from the web app's API instead of monthly CSV extracts. Build the ingestion pipeline that feeds your existing dbt project: Python pulls orders from the API (the mock API from this module, serving the course extracts), lands every response untouched as raw files, validates it, and loads it into DuckDB so that any rerun is safe. Then schedule it, test it, and document how to run it.

Work in your `shoplink-analytics` repository, on a branch called `feature/data-engineering`.

## Deliverables

1. **Extraction.** `ingestion/` contains the mock API, a request helper with timeouts and exponential backoff, and an incremental extractor that pages through the API, lands raw JSON in `data/raw/orders_api/load_date=<date>/`, and uses a watermark with an overlap window.
2. **Idempotent load.** The load into `raw.orders_api` in DuckDB replaces its load date's partition in a single transaction. Show evidence (a screenshot or pasted query output in the README) of two consecutive runs for the same date with identical row counts and sums.
3. **Validation and quarantine.** At least one pydantic model validates records before they are loaded. Failing records are written to a quarantine file with the reason, and the run stops if more than 2% of records fail. Show one quarantined record in the README (you can create one by editing a copy of an extract).
4. **Staging model.** A dbt source named `orders_api` (schema `raw`, table `orders_api`) and a staging model built on it that keeps the latest version of each order with the status cleaned, plus a `unique` test on `order_id`. After loading batch 1 and then batch 2, it returns 9,524 rows.
5. **Orchestration.** Either an Airflow DAG (extract, load, then dbt build, with retries and a failure alert) or a scheduled GitHub Actions workflow that runs the same steps. Include a screenshot of a successful run.
6. **Tests and CI.** At least one pytest test that proves a rerun does not duplicate, and a GitHub Actions workflow that runs ruff and pytest on every pull request.
7. **Configuration and secrets.** The API URL and database path come from environment variables. No passwords, tokens or keys are committed, and `.gitignore` excludes `.venv/`, `data/raw/`, `shoplink.duckdb` and any `.env` file.
8. **README.** A `README` section explaining how to set up the environment, start the API, run the pipeline for a date, rerun it, and run the tests, plus a short runbook entry for "the extract task failed".
9. **One extension (choose one).** Run the ShopLink lakehouse notebook on the week4-stack and include the `DESCRIBE HISTORY` output for `silver/orders` after the batch 2 MERGE; or stream simulated orders through Kafka into the gold Delta table and show that a restart did not double count; or add the `quarantine` bucket to the week4-stack with OpenTofu and include the `tofu plan` output.

## How to submit

Push the `feature/data-engineering` branch and open a pull request into `main` in your `shoplink-analytics` repository. Make sure CI has run on the pull request. Paste the pull request link into the submission form, with a one-line note saying which orchestration option and which extension you chose, and anything you would like feedback on.

## Grading guide

| Criterion | Points |
|---|---|
| Extraction: paging, timeouts, backoff on 429 and 5xx, raw landing, watermark with overlap | 20 |
| Idempotent load: partition replaced in one transaction, with evidence from two runs | 20 |
| Validation and quarantine: pydantic model, reasons recorded, 2% threshold stops the run | 10 |
| Staging model returns one latest row per order (9,524 rows) with a passing unique test | 10 |
| Orchestration: correct task order, retries, failure alert, evidence of a successful run | 15 |
| Tests and CI: an idempotency test and a workflow running ruff and pytest on pull requests | 10 |
| Configuration and secrets handled from the environment, with a sensible .gitignore | 5 |
| README and runbook entry are clear enough for someone else to run the pipeline | 5 |
| Extension completed with evidence | 5 |
