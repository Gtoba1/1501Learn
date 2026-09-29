---
module: 3
title: Python for Data Engineering
optional: false
summary: Learn the Python a data engineer uses every day. You set up a virtual environment and a `pipelines` package, read and write CSV and JSON files, call a paginated REST API (a mock ShopLink orders API you run yourself), load rows into PostgreSQL with psycopg, and turn it all into a script that runs on its own with arguments, configuration, logging and exit codes. The project is ShopLink's first real pipeline: an incremental orders extractor.
---

# Lesson: Python essentials for data work

minutes: 55

## Why data engineers write Python

SQL moves data around inside a database. Almost everything else a data engineer does is Python: calling APIs, reading files that land in a folder, checking records, loading databases, and gluing tools such as dbt, Airflow and Spark together. Airflow DAGs are Python; PySpark is Python; most ingestion code in most companies is Python.

You do not need to be a software developer. You need the core language, a handful of libraries, and a few habits that keep code working at 02:00 when nobody is watching. This lesson covers the core language and the habits; the rest of the module adds the libraries.

## Set up the project

You need Python 3.11 or newer. Ubuntu 24.04 in WSL comes with Python 3.12; on macOS, install it from python.org or with `brew install python@3.12`. Work in your repo from Module 2:

```bash
cd ~/shoplink-data-platform
python3 --version
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
```

A **virtual environment** is a private folder of installed packages for this project. Without one, installing a package for ShopLink can break another project that needs a different version. Your prompt now starts with `(.venv)`. Run `deactivate` to leave it, and `source .venv/bin/activate` each time you open a new terminal. `.venv/` is already in your `.gitignore`: you commit the *list* of packages, never the packages.

That list is `requirements.txt` in the repo root. Create it now with everything this module needs. In later modules you **append** to this file; never replace it:

```text
requests>=2.32
psycopg[binary]>=3.2
python-dotenv>=1.0
fastapi[standard]>=0.115
pandas>=2.2
pyarrow>=17
```

```bash
pip install -r requirements.txt
```

Finally, make `pipelines/` a Python **package**, the home of all ShopLink ingestion code, with an empty `__init__.py` file:

```bash
mkdir -p pipelines tests
touch pipelines/__init__.py
```

Because `pipelines` is a package, you run its scripts as modules from the repo root, for example `python -m pipelines.explore_orders`. That way `from pipelines.db import connect` works the same from every script, in Airflow and in tests.

## The core language in one page

| Idea | Example | Data engineering use |
|---|---|---|
| Strings | `" Delivered ".strip().lower()` gives `"delivered"` | Cleaning text fields |
| f-strings | `f"{rows:,} rows loaded"` gives `9,091 rows loaded` | Log messages |
| Lists | `ids = [100001, 100002]` | A batch of records |
| Dictionaries | `order = {"order_id": 100001, "status": "delivered"}` | One record, as a JSON API returns it |
| List of dicts | `[{"order_id": 1, ...}, {"order_id": 2, ...}]` | A table of records |
| Loops and comprehensions | `[o["order_id"] for o in orders if o["channel"] == "web"]` | Filtering and reshaping |
| Sets | `seen = set()`; `key in seen` | Finding duplicates fast |
| Functions with type hints | `def net_amount(line: dict) -> float:` | Small, testable pieces |
| Exceptions | `try: ... except ValueError: ...` | Handling bad records and failed calls |
| `pathlib.Path` | `Path("data") / "shoplink" / "orders.csv"` | File paths that work on every system |
| `datetime` | `datetime.fromisoformat("2026-06-30 23:00:00")` | Timestamps and watermarks |

`collections.Counter` deserves a special mention: it counts things in one line, which is half of data exploration.

## A first ShopLink script

Copy the unzipped batch 1 folder into the repo's `data/` folder if you have not already (`data/shoplink/orders.csv` and so on; it is git-ignored). Save this as `pipelines/explore_orders.py`:

```python
"""A first look at ShopLink's orders and order lines with plain Python."""
import csv
from collections import Counter
from pathlib import Path

EXTRACT = Path("data/shoplink")


def read_csv(path: Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def clean_status(raw: str) -> str:
    return raw.strip().lower()


def net_amount(line: dict) -> float:
    return int(line["quantity"]) * int(line["unit_price"]) * (1 - int(line["discount_pct"]) / 100)


orders = read_csv(EXTRACT / "orders.csv")
lines = read_csv(EXTRACT / "order_lines.csv")
print(f"{len(orders)} orders, {len(lines)} order lines")

raw_statuses = Counter(o["status"] for o in orders)
print(f"{len(raw_statuses)} raw status spellings")
statuses = Counter(clean_status(o["status"]) for o in orders)
print(statuses.most_common())

status_by_order = {o["order_id"]: clean_status(o["status"]) for o in orders}
year_by_order = {o["order_id"]: o["order_date"][:4] for o in orders}

revenue_by_year: dict[str, float] = {}
for line in lines:
    if status_by_order.get(line["order_id"]) in ("cancelled", "returned"):
        continue
    year = year_by_order[line["order_id"]]
    revenue_by_year[year] = revenue_by_year.get(year, 0) + net_amount(line)

for year, revenue in sorted(revenue_by_year.items()):
    print(f"{year}: NGN {revenue / 1e9:,.1f}bn")
```

Run it from the repo root:

```bash
python -m pipelines.explore_orders
```

```text
9091 orders, 26779 order lines
24 raw status spellings
[('delivered', 8106), ('cancelled', 562), ('returned', 291), ('shipped', 91), ('pending', 41)]
2024: NGN 108.0bn
2025: NGN 165.4bn
2026: NGN 100.4bn
```

A few habits already visible here:

- **Dictionaries as lookups.** `status_by_order` is built once, so each of the 26,779 lines finds its order's status instantly instead of searching the whole list. On a million rows, that difference is minutes against milliseconds.
- **Small named functions.** `clean_status` and `net_amount` each do one thing, so they are easy to test and reuse.
- **Everything from a CSV is text.** `int(line["quantity"])` is needed because `csv` never guesses types. You deal with that properly in the next lesson.

2026 covers only January to June, which is why it is lower. The totals still include ShopLink's 6 duplicate order lines and 2 lines with a zero or negative quantity; the next lesson finds them.

## Resources

- docs: [The Python Tutorial](https://docs.python.org/3/tutorial/index.html) · Python documentation · The official tutorial. Sections 3 to 5 (numbers, strings, lists, control flow, functions, data structures) cover this lesson.
- docs: [venv: creation of virtual environments](https://docs.python.org/3/library/venv.html) · Python documentation · The official reference for virtual environments.
- watch: [Python Full Course For Data Engineers [6+ HOURS]](https://www.youtube.com/watch?v=ZvU7lupoXQE) · Ansh Lamba · 155K subscribers · 483K views · 6.7K likes · published 2025-06-08 · checked 2026-09-28 · 327 min
- watch: [Python Tutorial: VENV (Mac & Linux) - How to Use Virtual Environments with the Built-In venv Module](https://www.youtube.com/watch?v=Kg1Yvry_Ydk) · Corey Schafer · 1.56M subscribers · 310.9K views · 8.2K likes · published 2019-04-02 · checked 2026-09-28 · 14 min

## Practice

1. Set up `.venv`, `requirements.txt` and the `pipelines` package, and run `explore_orders.py`.
2. Extend it to print net revenue by **channel** (web, whatsapp, sales_rep) for 2025, excluding cancelled and returned orders.
3. Write a function `orders_per_warehouse(orders: list[dict]) -> dict[str, int]` and print the result sorted by count, largest first.
4. Find the orders whose `customer_id` does not appear in `customers.csv`. How many are there, and which customer ids do they use?

## Example answer

```python
customers = read_csv(EXTRACT / "customers.csv")
channel_by_order = {o["order_id"]: o["channel"] for o in orders}

revenue_2025: dict[str, float] = {}
for line in lines:
    order_id = line["order_id"]
    if year_by_order[order_id] != "2025" or status_by_order[order_id] in ("cancelled", "returned"):
        continue
    channel = channel_by_order[order_id]
    revenue_2025[channel] = revenue_2025.get(channel, 0) + net_amount(line)
for channel, revenue in sorted(revenue_2025.items(), key=lambda kv: kv[1], reverse=True):
    print(f"{channel}: NGN {revenue / 1e9:,.1f}bn")


def orders_per_warehouse(orders: list[dict]) -> dict[str, int]:
    return dict(Counter(o["warehouse_id"] for o in orders).most_common())


print(orders_per_warehouse(orders))

known = {c["customer_id"] for c in customers}
orphans = [o for o in orders if o["customer_id"] not in known]
print(len(orphans), sorted({o["customer_id"] for o in orphans}))
```

The three channels add up to the 2025 total of about ₦165.4bn, with web the largest, because it has the most orders. The orphan check finds **3 orders**, using customer ids 9001, 9002 and 9003: one of ShopLink's planted problems. Using a set for `known` makes each lookup instant. Any version that gets these numbers is fine; if your channel totals do not add up to the yearly total, check that you applied the same filters to both.

# Lesson: Files: CSV and JSON

minutes: 50

## Files are how a lot of data arrives

ShopLink's purchasing team drops the supplier price list, `products.csv`, into a folder every day. Partners send nightly CSV exports; APIs return JSON; the lake in Module 5 stores Parquet. Reading and writing files correctly, and noticing when a file is not what you expected, is everyday data engineering.

## CSV with the csv module

CSV looks simple and is full of traps: commas inside quoted fields, different line endings, stray spaces, text encodings. Never split lines on commas yourself. Use the `csv` module, and always open files with `newline=""` and an explicit `encoding="utf-8"`:

```python
import csv

with open("data/shoplink/products.csv", newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    print(reader.fieldnames)
    products = list(reader)

print(products[0])
```

```text
['product_id', 'product_name', 'category', 'brand', 'unit_cost', 'list_price', 'is_active']
{'product_id': '1', 'product_name': 'HP ProBook 450 G10', 'category': 'Laptops', 'brand': 'HP', 'unit_cost': '659000', 'list_price': '842000', 'is_active': 'true'}
```

Every value is a string, including `'1'` and `'true'`. CSV has no types; your code must decide them. Converting explicitly is a feature: if a supplier ever sends `'N/A'` as a price, `int()` fails loudly instead of the bad value sliding silently into a report.

Writing CSV is the mirror image, with `csv.DictWriter`:

```python
with open("data/active_products.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["product_id", "product_name", "list_price"])
    writer.writeheader()
    for p in products:
        if p["is_active"] == "true":
            writer.writerow({k: p[k] for k in writer.fieldnames})
```

## JSON and JSON Lines

JSON is the language of APIs. It has real types: numbers, strings, booleans, `null`, lists (`[...]`) and objects (`{...}`), and it can nest. Python maps them directly: objects become dicts, lists become lists, `null` becomes `None`.

```python
import json

record = {"order_id": 100001, "status": "delivered", "lines": [{"product_id": 73, "quantity": 19}]}
text = json.dumps(record)          # Python to a JSON string
back = json.loads(text)            # JSON string to Python
```

For whole files, `json.dump(obj, f)` and `json.load(f)` do the same with an open file. Two shapes are common in data work:

| Shape | What it looks like | Good for |
|---|---|---|
| A JSON array | One big `[{...}, {...}, ...]` | An API page; small files |
| JSON Lines (`.jsonl`) | One JSON object per line | Large files: you can read, append and split them line by line without loading everything |

## Landing a file: typed, checked and replayable

Here is the pattern you will use again and again: read the source, give each column its type, run a few cheap checks, and land the result under a folder named for the load date. Save as `pipelines/land_order_lines.py`:

```python
"""Read order lines from CSV, type them, land them as JSON Lines, and read them back."""
import csv
import json
from datetime import date
from pathlib import Path

SOURCE = Path("data/shoplink/order_lines.csv")
landing = Path("data/raw/order_lines") / f"load_date={date.today()}"
landing.mkdir(parents=True, exist_ok=True)

INT_COLUMNS = ["order_line_id", "order_id", "product_id", "quantity", "unit_price", "discount_pct"]

with open(SOURCE, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    print("columns:", reader.fieldnames)
    rows = [{c: int(row[c]) for c in INT_COLUMNS} for row in reader]

seen, duplicates = set(), 0
for row in rows:
    key = tuple(row.values())
    if key in seen:
        duplicates += 1
    seen.add(key)
bad_quantity = [r for r in rows if r["quantity"] <= 0]
print(f"{len(rows)} rows, {duplicates} exact duplicates, {len(bad_quantity)} with quantity <= 0")

out = landing / "order_lines.jsonl"
with open(out, "w", encoding="utf-8") as f:
    for row in rows:
        f.write(json.dumps(row) + "\n")

with open(out, encoding="utf-8") as f:
    back = [json.loads(line) for line in f]
print(f"read back {len(back)} rows; first: {back[0]}")
print(f"sizes: csv {SOURCE.stat().st_size / 1024:.0f} KB, jsonl {out.stat().st_size / 1024:.0f} KB")
```

```text
columns: ['order_line_id', 'order_id', 'product_id', 'quantity', 'unit_price', 'discount_pct']
26779 rows, 6 exact duplicates, 2 with quantity <= 0
read back 26779 rows; first: {'order_line_id': 1, 'order_id': 100001, 'product_id': 73, 'quantity': 19, 'unit_price': 1059500, 'discount_pct': 0}
sizes: csv 723 KB, jsonl 3129 KB
```

Three things to notice:

- **The `load_date=YYYY-MM-DD` folder.** Each day's file lands in its own folder, so you can replay any day and see exactly what arrived when. The same naming appears in the lake in Module 5 (`bronze/<source>/<table>/load_date=.../`).
- **Checks, not fixes.** The script counts the duplicates and bad quantities but does not remove them. The raw layer keeps data as received; cleaning happens later, in staging. Validation at ingestion is a lesson of its own in Module 6.
- **JSON is big.** The JSON Lines file is more than four times the CSV, because every row repeats every column name. That is the price of self-describing records.

## pandas, briefly

For exploring files interactively, **pandas** loads a whole file into a DataFrame and guesses types for you:

```python
import pandas as pd

orders = pd.read_csv("data/shoplink/orders.csv", parse_dates=["order_date", "updated_at"])
print(orders.dtypes)
print(orders["channel"].value_counts())

lines = pd.read_csv("data/shoplink/order_lines.csv")
print(lines.duplicated().sum(), (lines["quantity"] <= 0).sum())   # 6 2
lines.to_parquet("data/order_lines.parquet", index=False)
```

The Parquet file is about half the size of the CSV and keeps the types, which is why lakes use it (Module 5). pandas is excellent for exploration and small tables. For pipelines, be careful with its guessing: a column of ids that is empty in one file becomes floats, and `'00123'` loses its leading zeros. Plain `csv` with explicit types, as above, is often the safer choice for ingestion code, and Spark takes over when data outgrows one machine (Module 8).

## Resources

- docs: [csv: CSV file reading and writing](https://docs.python.org/3/library/csv.html) · Python documentation · DictReader, DictWriter and why `newline=""` matters.
- docs: [json: JSON encoder and decoder](https://docs.python.org/3/library/json.html) · Python documentation · dumps, loads, dump and load.
- docs: [10 minutes to pandas](https://pandas.pydata.org/docs/user_guide/10min.html) · pandas documentation · A fast tour of DataFrames and file input and output.
- watch: [Python Tutorial: CSV Module - How to Read, Parse, and Write CSV Files](https://www.youtube.com/watch?v=q5uM4VKywbA) · Corey Schafer · 1.56M subscribers · 1.5M views · 24.5K likes · published 2017-08-09 · checked 2026-09-28 · 16 min
- watch: [Complete Python Pandas Data Science Tutorial! (Reading CSV/Excel files, Sorting, Filtering, Groupby)](https://www.youtube.com/watch?v=vmEHCJofslg) · Keith Galli · 258K subscribers · 3.5M views · 76K likes · published 2018-10-25 · checked 2026-09-28 · 60 min

## Practice

Build a checker for the daily supplier price list, `pipelines/land_supplier_prices.py`:

1. Read `data/shoplink/products.csv` and check the header is exactly `product_id, product_name, category, brand, unit_cost, list_price, is_active`. If it is not, print which columns are missing or unexpected and stop with `raise SystemExit(1)`.
2. Convert each row to proper types: ids and prices as `int`, `is_active` as `bool`.
3. Count the active and inactive products, and any product whose `list_price` is below its `unit_cost`.
4. Land the typed rows as JSON Lines in `data/raw/supplier_prices/load_date=<today>/products.jsonl`.
5. Test step 1 by making a copy of the file with the `brand` column renamed and pointing your script at it.

## Example answer

```python
"""Check and land the daily supplier price list."""
import csv
import json
import sys
from datetime import date
from pathlib import Path

EXPECTED = ["product_id", "product_name", "category", "brand", "unit_cost", "list_price", "is_active"]
source = Path(sys.argv[1] if len(sys.argv) > 1 else "data/shoplink/products.csv")

with open(source, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    if reader.fieldnames != EXPECTED:
        print("missing:", sorted(set(EXPECTED) - set(reader.fieldnames or [])))
        print("unexpected:", sorted(set(reader.fieldnames or []) - set(EXPECTED)))
        raise SystemExit(1)
    products = [
        {
            "product_id": int(r["product_id"]),
            "product_name": r["product_name"],
            "category": r["category"],
            "brand": r["brand"],
            "unit_cost": int(r["unit_cost"]),
            "list_price": int(r["list_price"]),
            "is_active": r["is_active"] == "true",
        }
        for r in reader
    ]

active = sum(p["is_active"] for p in products)
below_cost = [p["product_id"] for p in products if p["list_price"] < p["unit_cost"]]
print(f"{len(products)} products: {active} active, {len(products) - active} inactive, "
      f"{len(below_cost)} priced below cost")

landing = Path("data/raw/supplier_prices") / f"load_date={date.today()}"
landing.mkdir(parents=True, exist_ok=True)
with open(landing / "products.jsonl", "w", encoding="utf-8") as f:
    for p in products:
        f.write(json.dumps(p) + "\n")
```

On batch 1 it reports 120 products: 110 active, 10 inactive, and none priced below cost. With `brand` renamed to `brand_name`, it prints `missing: ['brand']` and `unexpected: ['brand_name']` and exits with status 1 (check with `echo $?`). Comparing the header exactly, in order, is strict on purpose: a supplier who reorders columns may also have changed what they mean, and you want a human to look. A check that only tests for the presence of the columns is also acceptable if you say why.

# Lesson: Calling REST APIs

minutes: 55

## How APIs work

Data engineers rarely get direct access to another team's production database. Instead, the team offers an **API**: a web address you send a request to, which replies with data, usually JSON. Payment providers, CRMs, courier companies and exchange-rate services all work this way.

A REST API request has a few parts:

| Part | Example | Meaning |
|---|---|---|
| Method | `GET` | Read data (`POST` sends data, `PUT`/`PATCH` update, `DELETE` removes) |
| URL | `http://localhost:8000/orders` | Which resource you want |
| Query parameters | `?updated_since=2026-06-01&page=2` | Filters and paging |
| Headers | `Authorization: Bearer <token>` | Authentication and metadata |
| Status code | `200` | Whether it worked |
| Body | `{"data": [...], "page": 2, "total": 863}` | The data, as JSON |

## ShopLink's orders API

ShopLink's orders API does not exist on the internet, so you run a stand-in on your laptop. It serves the course CSV files as if they were a live API: orders sorted by `updated_at`, filtered by an `updated_since` parameter, 500 per page. Save this as `pipelines/mock_api.py`:

```python
"""A stand-in for ShopLink's orders API, serving the course CSV extracts."""
import csv
import os
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, Query

DATA_DIR = Path(os.environ.get("SHOPLINK_DATA_DIR", "data"))
# Which extract folders are "live". Add shoplink-batch-2 to simulate July arriving.
BATCHES = os.environ.get("SHOPLINK_BATCHES", "shoplink").split(",")

app = FastAPI(title="ShopLink mock orders API")


def current_orders() -> list[dict]:
    latest: dict[str, dict] = {}
    for batch in BATCHES:
        with open(DATA_DIR / batch.strip() / "orders.csv", newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                for key in ("order_id", "customer_id", "warehouse_id"):
                    row[key] = int(row[key])  # JSON APIs send numbers as numbers
                latest[row["order_id"]] = row  # a later batch replaces the earlier version
    return sorted(latest.values(), key=lambda r: (r["updated_at"], r["order_id"]))


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "batches": BATCHES}


@app.get("/orders")
def orders(
    updated_since: datetime = datetime(1900, 1, 1),
    page: int = Query(1, ge=1),
    page_size: int = Query(500, ge=1, le=1000),
) -> dict:
    rows = [
        r for r in current_orders()
        if datetime.fromisoformat(r["updated_at"]) > updated_since
    ]
    start = (page - 1) * page_size
    return {
        "data": rows[start:start + page_size],
        "page": page,
        "page_size": page_size,
        "total": len(rows),
    }
```

Open a **second terminal** for it, and leave it running while you work in the first:

```bash
cd ~/shoplink-data-platform
source .venv/bin/activate
uvicorn pipelines.mock_api:app --port 8000
```

Then open http://localhost:8000/orders?page_size=2 in your browser, or http://localhost:8000/docs for a page FastAPI generates that describes the API and lets you try it. FastAPI checks the parameters for you: `?page=0` returns a `422` error saying the page must be at least 1.

`SHOPLINK_BATCHES` lists which folders in `data/` are "live". It starts with batch 1 only (9,091 orders). Later, you stop the API with Ctrl+C and restart it with both batches to simulate July's new and changed orders arriving:

```bash
SHOPLINK_BATCHES=shoplink,shoplink-batch-2 uvicorn pipelines.mock_api:app --port 8000
```

Batch 2 adds 433 new July orders and 132 June orders whose status changed, each with a newer `updated_at`, so the API then serves 9,524 distinct orders. In Module 7 you run this same API as the `mock-api` service in Docker Compose, so Airflow's containers can reach it.

## Making requests with requests

The `requests` library makes an HTTP call in one line:

```python
import requests

response = requests.get(
    "http://localhost:8000/orders",
    params={"updated_since": "2026-06-01", "page": 1},
    timeout=30,
)
print(response.status_code)           # 200
body = response.json()
print(body["total"], len(body["data"]))   # 430 430 with batch 1
print(body["data"][0])
```

**Always pass a `timeout`.** Without one, a request to a server that never answers can hang your pipeline forever.

## When requests fail

Real APIs fail, and your code must decide what to do about each kind of failure:

| Response | Meaning | What your code should do |
|---|---|---|
| 200 | Success | Use the data |
| 429 | Too many requests: you are being rate limited | Wait, then retry |
| 500, 502, 503, 504 | The server had a problem | Wait, then retry |
| 400, 401, 403, 404, 422 | Your request is wrong, or you lack access | Fail immediately and loudly: retrying will not help |
| No response | The network dropped or timed out | Wait, then retry |

Waiting longer after each failure is called **exponential backoff**: 1 second, then 2, 4, 8, 16. It gives a struggling server room to recover. Put this in `pipelines/http_utils.py`, where every extractor can use it:

```python
"""Small HTTP helpers shared by ShopLink extractors."""
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
        response.raise_for_status()  # any other 4xx or 5xx fails immediately
        return response.json()
    raise RuntimeError(f"Gave up on {url} after {attempts} attempts")


def get_all_pages(url: str, params: dict | None = None) -> list[dict]:
    """Follow ?page=1, 2, 3... until the API returns an empty page."""
    rows, page = [], 1
    while batch := get_json(url, params={**(params or {}), "page": page})["data"]:
        rows.extend(batch)
        page += 1
    return rows
```

Many real APIs also send a `Retry-After` header with a 429, saying how long to wait; honouring it is a good refinement.

## Pagination and incremental extraction

`get_all_pages` asks for page 1, then 2, until a page comes back empty. Other APIs signal the end differently, with a `next` link or a cursor token; read each API's documentation for its rule.

```python
from pipelines.http_utils import get_all_pages

everything = get_all_pages("http://localhost:8000/orders")
print(len(everything))    # 9091 with batch 1, fetched in 19 pages

recent = get_all_pages("http://localhost:8000/orders", {"updated_since": "2026-06-01"})
print(len(recent))        # 430
```

The `updated_since` parameter is what makes **incremental** extraction possible: instead of downloading all 9,091 orders every night, you ask only for orders changed since the newest `updated_at` you already have, your **watermark**. That is the core of this module's project. Module 6 goes deeper into incremental loads, including their blind spots.

## Land it raw first

Save an API response exactly as received, before any cleaning. If your cleaning code has a bug, you fix it and replay the saved files without calling the API again, and some APIs only keep a few days of history. A real public example: ShopLink imports stock priced in US dollars, so finance wants the daily dollar to naira rate. The free ExchangeRate-API endpoint needs no key:

```python
import json
from datetime import date
from pathlib import Path

from pipelines.http_utils import get_json

body = get_json("https://open.er-api.com/v6/latest/USD")

landing = Path("data/raw/fx_rates") / f"load_date={date.today()}"
landing.mkdir(parents=True, exist_ok=True)
(landing / "usd.json").write_text(json.dumps(body, indent=2), encoding="utf-8")

print("USD to NGN:", body["rates"]["NGN"], "as of", body["time_last_update_utc"])
```

The service updates once a day, asks you to call it at most about once an hour, and asks for credit if you publish its rates. A daily pipeline is well within that.

## Resources

- docs: [Requests quickstart](https://requests.readthedocs.io/en/latest/user/quickstart/) · Requests documentation · Parameters, JSON responses, status codes and timeouts.
- docs: [FastAPI first steps](https://fastapi.tiangolo.com/tutorial/first-steps/) · FastAPI documentation · Enough to read and extend the mock API.
- docs: [HTTP response status codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status) · MDN Web Docs · What every status code means.
- read: [ExchangeRate-API free endpoint](https://www.exchangerate-api.com/docs/free) · ExchangeRate-API · Terms, update frequency and response format for the rates used above.
- watch: [Python Requests Tutorial: Request Web Pages, Download Images, POST Data, Read JSON, and More](https://www.youtube.com/watch?v=tb8gHvYlCFs) · Corey Schafer · 1.56M subscribers · 1.1M views · 22K likes · published 2019-02-26 · checked 2026-09-28 · 25 min

## Practice

With the mock API running:

1. Using `get_json`, find how many orders were updated since 2026-06-01, first with batch 1 only, then after restarting the API with both batches.
2. With both batches live, fetch all orders updated since 2026-06-01 with `page_size=100`. How many pages does it take? Check that no `order_id` appears twice.
3. Stop the API and call `get_json` against it. How long does it take to give up, and what error do you get? Then call `http://localhost:8000/nope` with the API running. What happens, and why is it different?
4. Explain in two sentences why the retry code retries a 503 but not a 404.

## Example answer

```python
import time

from pipelines.http_utils import get_all_pages, get_json

url = "http://localhost:8000/orders"
print(get_json(url, {"updated_since": "2026-06-01"})["total"])   # 430 with batch 1, 863 with both

rows, page = [], 1
while batch := get_json(url, {"updated_since": "2026-06-01", "page": page, "page_size": 100})["data"]:
    rows.extend(batch)
    page += 1
print(len(rows), "rows in", page - 1, "pages")                  # 863 rows in 9 pages
print(len({r["order_id"] for r in rows}) == len(rows))          # True

start = time.perf_counter()
try:
    get_json(url)                                               # with the API stopped
except RuntimeError as error:
    print(error, f"after {time.perf_counter() - start:.0f}s")   # about 31 seconds
```

With batch 1 there are 430 orders updated since 1 June; with both batches, 863 (the 430, plus 433 new July orders; the 132 changed June orders were already among the 430 and are served once, in their newer version). At 100 per page that is 9 pages, the last with 63 rows, and no duplicates, because the mock API keeps one version per order.

With the API stopped, each attempt fails with a connection error and the code sleeps 1, 2, 4, 8 and 16 seconds, then raises `RuntimeError: Gave up on http://localhost:8000/orders after 5 attempts` after about 31 seconds. `/nope` returns 404 at once and `raise_for_status()` raises `requests.HTTPError: 404 Client Error: Not Found`: no retry.

"A 503 means the server is temporarily unable to answer, so the same request may well succeed a few seconds later. A 404 means the thing we asked for does not exist; asking again will give the same answer, so retrying only delays the failure and hides a bug in our request."

# Lesson: Python and PostgreSQL

minutes: 55

## psycopg: Python's PostgreSQL driver

**psycopg** (version 3) is the standard way to talk to PostgreSQL from Python. You installed it with `psycopg[binary]` in the first lesson. This lesson uses the `postgres` service from Module 2, so start it and check it is healthy:

```bash
docker compose up -d postgres
docker compose ps
```

## Connection settings come from the environment

Never write a password in code. Your `.env` from Module 2 already holds the connection strings:

```text
SHOPLINK_WAREHOUSE_DB_URL=postgresql://shoplink:shoplink@localhost:5432/warehouse
SHOPLINK_APP_DB_URL=postgresql://shoplink:shoplink@localhost:5432/shoplink_app
```

Put the connection code in one place, `pipelines/db.py`, so every script connects the same way:

```python
"""Connections to ShopLink's PostgreSQL server, configured from environment variables."""
import os

import psycopg


def warehouse_url() -> str:
    # No default: a missing setting should fail loudly, not connect somewhere unexpected.
    return os.environ["SHOPLINK_WAREHOUSE_DB_URL"]


def connect(url: str | None = None) -> psycopg.Connection:
    """Open a connection to the warehouse database (or another URL you pass in)."""
    return psycopg.connect(url or warehouse_url(), connect_timeout=10)
```

`os.environ` only sees variables that are exported to the program, and a `.env` file on disk is not exported by itself. For now, export the one variable this lesson's code reads into your terminal before running scripts:

```bash
export SHOPLINK_WAREHOUSE_DB_URL="$(grep '^SHOPLINK_WAREHOUSE_DB_URL=' .env | cut -d= -f2-)"
```

Export only what you need rather than the whole file: from Module 5, `.env` also holds the lake's AWS keys, and exported AWS keys override the AWS CLI's profiles (which matters in Module 9, when the same CLI talks to real AWS). In the next lesson your scripts read `.env` themselves, with python-dotenv, and you no longer export anything.

## Connections, cursors and transactions

```python
from pipelines.db import connect

with connect() as conn:
    print(conn.execute("select version()").fetchone()[0])
    conn.execute("create schema if not exists raw")
```

| Piece | What it is |
|---|---|
| Connection | One session with the server. Opened by `psycopg.connect`; closed when the `with` block ends |
| Transaction | Everything you run on a connection is inside a transaction until it is committed. Leaving the `with connect()` block commits; an exception inside it rolls everything back |
| `conn.execute(sql, params)` | Runs one statement and returns a cursor |
| Cursor | Holds the results: `fetchone()`, `fetchall()`, or loop over it |

That rollback behaviour is a gift to data engineers. If a load fails halfway, none of it is committed, so the table is never left half-loaded. When you need a smaller all-or-nothing block inside a longer script, use `with conn.transaction():`.

## Parameterised queries: never build SQL with f-strings

To pass a value into SQL, use a `%s` placeholder and give the values separately. psycopg sends them to the server apart from the SQL text:

```python
state = "Kano"
rows = conn.execute(
    "select customer_id, customer_name, city from raw.customers where state = %s",
    [state],
).fetchall()
```

Never do this:

```python
conn.execute(f"select * from raw.customers where state = '{state}'")   # DO NOT
```

If `state` ever comes from outside your code (a file, an API, a user), a value such as `Kano' or '1'='1` turns the f-string into a different query that returns every customer; worse values can drop tables. This is **SQL injection**, and parameters make it impossible, because the value is never parsed as SQL. Parameters also handle quoting, dates and `None` (sent as `NULL`) correctly. Placeholders are always `%s`, whatever the type; table and column names cannot be parameters, so never build those from outside input either.

## Loading rows: executemany and COPY

There are two ways to write many rows:

| Method | How | When |
|---|---|---|
| `cursor.executemany(sql, rows)` | Runs one `insert` with many sets of parameters | Hundreds or a few thousand rows; when you need `on conflict` logic |
| `COPY ... FROM STDIN` | Streams rows into a table in PostgreSQL's bulk format | Thousands to millions of rows: much faster |

Save this as `pipelines/load_raw_files.py`. It loads the supplier price list and the order lines into the `raw` schema of the `warehouse` database, one with each method:

```python
"""Load the supplier price list and order lines CSVs into warehouse.raw."""
import csv
import time
from pathlib import Path

from pipelines.db import connect

EXTRACT = Path("data/shoplink")

DDL = """
create schema if not exists raw;

create table if not exists raw.products (
    product_id bigint,
    product_name text,
    category text,
    brand text,
    unit_cost bigint,
    list_price bigint,
    is_active boolean,
    _loaded_at timestamptz not null default now()
);

create table if not exists raw.order_lines (
    order_line_id bigint,
    order_id bigint,
    product_id bigint,
    quantity integer,
    unit_price bigint,
    discount_pct integer,
    _loaded_at timestamptz not null default now()
);
"""

PRODUCT_COLS = ["product_id", "product_name", "category", "brand", "unit_cost", "list_price", "is_active"]
LINE_COLS = ["order_line_id", "order_id", "product_id", "quantity", "unit_price", "discount_pct"]


def read_rows(path: Path, columns: list[str]) -> list[tuple]:
    with open(path, newline="", encoding="utf-8") as f:
        return [tuple(row[c] for c in columns) for row in csv.DictReader(f)]


def main() -> None:
    products = read_rows(EXTRACT / "products.csv", PRODUCT_COLS)
    lines = read_rows(EXTRACT / "order_lines.csv", LINE_COLS)

    with connect() as conn:
        conn.execute(DDL)
        with conn.cursor() as cur:
            # A full load: replace the whole table every run.
            cur.execute("truncate raw.products, raw.order_lines")

            start = time.perf_counter()
            cur.executemany(
                "insert into raw.products (product_id, product_name, category, brand,"
                " unit_cost, list_price, is_active) values (%s, %s, %s, %s, %s, %s, %s)",
                products,
            )
            print(f"products: {len(products)} rows with executemany in {time.perf_counter() - start:.2f}s")

            start = time.perf_counter()
            with cur.copy(f"copy raw.order_lines ({', '.join(LINE_COLS)}) from stdin") as copy:
                for row in lines:
                    copy.write_row(row)
            print(f"order_lines: {len(lines)} rows with COPY in {time.perf_counter() - start:.2f}s")
    # leaving the "with connect()" block commits; an exception rolls everything back


if __name__ == "__main__":
    main()
```

```bash
python -m pipelines.load_raw_files
```

```text
products: 120 rows with executemany in 0.01s
order_lines: 26779 rows with COPY in 0.06s
```

Your timings will differ. Notice the design choices:

- **The raw tables keep the source's shape**, plus a `_loaded_at` column recording when each row arrived. Load metadata columns start with `_` so nobody mistakes them for source data.
- **Types come from the table.** The CSV values are strings; PostgreSQL converts `'659000'` to `bigint` and `'true'` to `boolean` as they arrive, and rejects the whole load if one cannot be converted.
- **`truncate` then load, in one transaction**, is a full load that is safe to rerun: run it twice and you still have 120 products, never 240. If the load fails, the truncate is rolled back too, so yesterday's data is still there. Module 4 goes deeper into transactions and constraints, and Module 6 into making every kind of load safe to rerun.
- **`create table if not exists`** lets the script run on a fresh database or an existing one.

Check the result in psql, or from Python:

```bash
docker compose exec postgres psql -U shoplink -d warehouse \
  -c "select count(*), count(distinct order_line_id) from raw.order_lines;"
```

It shows 26,779 rows and 26,773 distinct ids: the 6 duplicates arrived in raw, exactly as the source sent them.

## Resources

- docs: [Basic module usage](https://www.psycopg.org/psycopg3/docs/basic/usage.html) · psycopg 3 documentation · Connections, cursors, the `with` blocks and transactions.
- docs: [Passing parameters to SQL queries](https://www.psycopg.org/psycopg3/docs/basic/params.html) · psycopg 3 documentation · Placeholders, and why you must never build queries with string formatting.
- docs: [Using COPY TO and COPY FROM](https://www.psycopg.org/psycopg3/docs/basic/copy.html) · psycopg 3 documentation · Fast bulk loading with `cursor.copy()` and `write_row()`.
- docs: [COPY](https://www.postgresql.org/docs/17/sql-copy.html) · PostgreSQL documentation · The server side of bulk loading.
- read: [SQL injection](https://owasp.org/www-community/attacks/SQL_Injection) · OWASP · What SQL injection is and why parameterised queries prevent it.

## Practice

1. Run `load_raw_files.py` twice and show that `raw.products` still has 120 rows.
2. Write `pipelines/load_customers.py` that loads `customers.csv` into `raw.customers` with COPY. Empty cities in the CSV should arrive as `NULL`, not as empty strings. Print the row count and the number of customers with no city.
3. Add a function `customers_in_state(state: str) -> list[tuple]` that uses a parameterised query. Call it for `"Kano"`, then with the value `"Kano' or '1'='1"`, and explain the result.
4. Break a load on purpose: in a copy of the products CSV, change one `unit_cost` to `N/A` and load it. What happens to the rows that were already in `raw.products`?

## Example answer

```python
"""Load customers.csv into warehouse.raw.customers with COPY."""
import csv
from pathlib import Path

from pipelines.db import connect

COLUMNS = ["customer_id", "customer_name", "customer_type", "email", "city", "state", "created_at", "updated_at"]

DDL = """
create schema if not exists raw;
create table if not exists raw.customers (
    customer_id bigint,
    customer_name text,
    customer_type text,
    email text,
    city text,
    state text,
    created_at timestamp,
    updated_at timestamp,
    _loaded_at timestamptz not null default now()
);
"""


def main() -> None:
    with open(Path("data/shoplink/customers.csv"), newline="", encoding="utf-8") as f:
        rows = [[row[c] or None for c in COLUMNS] for row in csv.DictReader(f)]

    with connect() as conn:
        conn.execute(DDL)
        conn.execute("truncate raw.customers")
        with conn.cursor() as cur:
            with cur.copy(f"copy raw.customers ({', '.join(COLUMNS)}) from stdin") as copy:
                for row in rows:
                    copy.write_row(row)
        total, no_city = conn.execute(
            "select count(*), count(*) filter (where city is null) from raw.customers"
        ).fetchone()
    print(f"raw.customers: {total} rows, {no_city} with no city")


def customers_in_state(state: str) -> list[tuple]:
    with connect() as conn:
        return conn.execute(
            "select customer_id, customer_name, city from raw.customers where state = %s order by customer_id",
            [state],
        ).fetchall()


if __name__ == "__main__":
    main()
    kano = customers_in_state("Kano")
    print(f"Kano: {len(kano)} customers, first {kano[0]}")
    print("injection attempt:", len(customers_in_state("Kano' or '1'='1")))
```

```text
raw.customers: 400 rows, 12 with no city
Kano: 25 customers, first (18, 'Adewale Legal Partners', 'Kano')
injection attempt: 0
```

`row[c] or None` turns empty strings into `None`, which COPY writes as `NULL`, so the 12 missing cities are real NULLs. The injection attempt returns 0 rows: the whole string was compared as a value, and no state is literally called `Kano' or '1'='1`. With an f-string, the same input would have returned all 400 customers.

For step 4, the load fails with `invalid input syntax for type bigint: "N/A"`, the exception rolls back the transaction, including the `truncate`, and `raw.products` still holds the previous 120 rows. That is the behaviour you want: a bad file stops the load instead of replacing good data with half a table.

# Lesson: Scripts that run on their own (arguments, config, logging)

minutes: 55

## From "it runs for me" to "it runs at 02:00"

A script you run by hand can print whatever it likes and crash when it wants; you are watching. A script that Airflow runs every night needs four more things:

| Need | Tool | Why |
|---|---|---|
| Inputs without editing code | `argparse` command-line arguments | The same code loads any date, or reprocesses a range |
| Settings and secrets outside the code | Environment variables and `.env`, read with python-dotenv | Different settings on your laptop, in Docker and in production; no passwords in Git |
| A record of what happened | `logging` | When it fails at 02:00, the log is all you have at 07:00 |
| A clear pass or fail signal | Exit codes | The scheduler decides whether to retry and alert from the exit code alone |

In this lesson you build the first version of ShopLink's orders extractor with all four: `python -m pipelines.extract_orders --since 2026-06-01`.

## Arguments with argparse

`argparse` turns command-line flags into a Python object, with types, defaults and a `--help` page for free:

```python
import argparse
from datetime import date, datetime

parser = argparse.ArgumentParser(description="Extract ShopLink orders from the orders API.")
parser.add_argument("--since", type=datetime.fromisoformat, default=datetime(1900, 1, 1),
                    help="fetch orders updated after this time")
parser.add_argument("--load-date", type=date.fromisoformat, default=date.today(),
                    help="the date to file this load under (default: today)")
parser.add_argument("--verbose", action="store_true", help="log every page")
args = parser.parse_args()
print(args.since, args.load_date, args.verbose)
```

`type=datetime.fromisoformat` means `--since 2026-06-01` arrives as a `datetime`, and `--since yesterday` is rejected with a clear message and exit code 2 before any work starts. `--load-date` becomes `args.load_date` (dashes turn into underscores).

## Configuration from the environment with python-dotenv

Arguments say *what* to do this run; configuration says *where*: which API, which database. Configuration lives in environment variables, and on your laptop they come from `.env`:

```python
import os

from dotenv import load_dotenv

load_dotenv()   # reads .env in the current folder, if there is one
api_url = os.environ.get("SHOPLINK_API_URL", "http://localhost:8000")
db_url = os.environ["SHOPLINK_WAREHOUSE_DB_URL"]
```

`load_dotenv()` never overrides a variable that is already set. That is exactly right: on your laptop the values come from `.env`; in Docker or Airflow, the platform sets real environment variables and the same code uses them, with no `.env` file at all. You no longer need the `export` from the previous lesson, and the variables `load_dotenv()` sets exist only inside that Python process, not in your terminal.

Use `os.environ.get("NAME", default)` for settings with a safe default, and `os.environ["NAME"]` (which raises `KeyError` if missing) for anything, like a database URL, where guessing would be worse than failing.

## Logging instead of print

`print` writes a line. `logging` writes a line with a time, a level and the name of the part of the code that wrote it, and lets you choose how much detail to show without changing code:

```python
import logging

log = logging.getLogger("extract_orders")
logging.basicConfig(level="INFO", format="%(asctime)s %(levelname)s %(name)s: %(message)s")

log.debug("page 3: 500 rows")                       # hidden at INFO level
log.info("landed %d orders in %s", 863, "data/raw/orders_api/load_date=2026-09-28")
log.warning("API returned an empty page 1")
```

```text
2026-09-28 06:00:01,240 INFO extract_orders: landed 863 orders in data/raw/orders_api/load_date=2026-09-28
```

| Level | Use it for |
|---|---|
| DEBUG | Detail you want only when investigating: every page, every file |
| INFO | The normal story of a run: started, extracted N rows, loaded N rows |
| WARNING | Something odd that did not stop the run: zero rows today, a retry |
| ERROR | The run failed |

Two habits: log **counts** (rows extracted, rows loaded), because a run that "succeeded" with zero rows is the most common silent failure; and use `log.exception(...)` inside an `except` block, which logs the full traceback. In Module 7, Airflow collects these log lines for every task.

## Exit codes

Every program ends with a number. `0` means success; anything else means failure. The shell stores it in `$?`, and schedulers such as Airflow and cron read it to decide whether a task failed:

```bash
python -m pipelines.extract_orders --since 2026-06-01; echo "exit code: $?"
```

In Python, `sys.exit(0)` or `sys.exit(1)` sets it; an uncaught exception exits with 1; argparse uses 2 for bad arguments. The pattern below has `main()` return the code, so it is explicit and easy to test.

## The extractor, version 1

Save this as `pipelines/extract_orders.py`:

```python
"""Extract ShopLink orders from the orders API and land them as JSON files.

Example:
    python -m pipelines.extract_orders --since 2026-06-01
"""
import argparse
import json
import logging
import os
import shutil
import sys
from datetime import date, datetime
from pathlib import Path

from dotenv import load_dotenv

from pipelines.http_utils import get_json

log = logging.getLogger("extract_orders")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract ShopLink orders from the orders API.")
    parser.add_argument(
        "--since",
        type=datetime.fromisoformat,
        default=datetime(1900, 1, 1),
        help="fetch orders updated after this time, YYYY-MM-DD or 'YYYY-MM-DD HH:MM:SS' (default: everything)",
    )
    parser.add_argument(
        "--load-date",
        type=date.fromisoformat,
        default=date.today(),
        help="the date to file this load under (default: today)",
    )
    parser.add_argument("--verbose", action="store_true", help="log every page")
    return parser.parse_args(argv)


def extract(api_url: str, since: datetime, landing: Path) -> int:
    if landing.exists():
        shutil.rmtree(landing)  # a rerun replaces this date's files instead of adding to them
    landing.mkdir(parents=True)
    page, fetched = 1, 0
    params = {"updated_since": since.isoformat(sep=" ")}
    while rows := get_json(f"{api_url}/orders", params={**params, "page": page})["data"]:
        (landing / f"page-{page:04d}.json").write_text(json.dumps(rows), encoding="utf-8")
        log.debug("page %d: %d rows", page, len(rows))
        fetched += len(rows)
        page += 1
    return fetched


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    load_dotenv()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else os.environ.get("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    api_url = os.environ.get("SHOPLINK_API_URL", "http://localhost:8000")
    landing = Path("data/raw/orders_api") / f"load_date={args.load_date}"

    log.info("extracting orders updated since %s from %s", args.since, api_url)
    try:
        fetched = extract(api_url, args.since, landing)
    except Exception:
        log.exception("extract failed")
        return 1
    log.info("landed %d orders in %s", fetched, landing)
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

With the mock API running both batches:

```bash
python -m pipelines.extract_orders --since 2026-06-01 --load-date 2026-09-28
python -m pipelines.extract_orders --help
```

```text
2026-09-28 19:38:05,731 INFO extract_orders: extracting orders updated since 2026-06-01 00:00:00 from http://localhost:8000
2026-09-28 19:38:05,880 INFO extract_orders: landed 863 orders in data/raw/orders_api/load_date=2026-09-28
```

The folder now holds `page-0001.json` and `page-0002.json`, exactly as the API sent them. Things worth noticing:

- **`if __name__ == "__main__":`** runs `main()` only when the file is executed, not when another module imports it. Airflow and your tests can import `extract` and call it directly.
- **`main(argv=None)`** lets a test call `main(["--since", "2026-06-01"])` without touching the real command line.
- **A rerun for the same load date replaces that date's folder** rather than adding a second copy of every page. Running it twice gives the same files as running it once.
- **`if __name__`, `sys.exit(main())`, a module-level `log`**: this is the skeleton of every command-line pipeline you will write.

The project turns this into ShopLink's first real pipeline: it works out `--since` for itself from what is already loaded, and loads the rows into PostgreSQL.

## Resources

- docs: [Argparse tutorial](https://docs.python.org/3/howto/argparse.html) · Python documentation · Positional and optional arguments, types and help text.
- docs: [Logging HOWTO](https://docs.python.org/3/howto/logging.html) · Python documentation · Levels, formatting and when to use each.
- docs: [python-dotenv](https://pypi.org/project/python-dotenv/) · PyPI · How `load_dotenv` reads `.env` and why it does not override existing variables.
- read: [The Twelve-Factor App: Config](https://12factor.net/config) · 12factor.net · The classic argument for keeping configuration in the environment, not in code.
- watch: [Python Tutorial: Logging Basics - Logging to Files, Setting Levels, and Formatting](https://www.youtube.com/watch?v=-ARI4Cz-awo) · Corey Schafer · 1.56M subscribers · 572.8K views · 14K likes · published 2017-03-15 · checked 2026-09-28 · 14 min

## Practice

1. Save `extract_orders.py` and run it with `--since 2026-06-01`, with `--verbose`, and with no arguments. Check the exit code each time with `echo $?`.
2. Run it with `--since yesterday`. What is the exit code, and what does the message say?
3. Stop the mock API and run it again. What is the exit code? Find the traceback in the output.
4. Add a `--page-size` argument (an integer, default 500) and pass it to the API. Run with `--page-size 100` and `--verbose` and count the page log lines.
5. Set `SHOPLINK_API_URL=http://localhost:9999` on the command line in front of the script (`SHOPLINK_API_URL=... python -m pipelines.extract_orders`) while `.env` still says port 8000. Which value wins, and why?

## Example answer

| Run | Exit code | What you see |
|---|---|---|
| `--since 2026-06-01` | 0 | 863 orders landed (both batches live) |
| `--verbose` | 0 | Plus one DEBUG line per page |
| No arguments | 0 | All 9,524 orders in 20 pages |
| `--since yesterday` | 2 | `argument --since: invalid fromisoformat value: 'yesterday'`, before any request |
| API stopped | 1 | After about 31 seconds of retries, `ERROR extract_orders: extract failed` followed by the traceback ending in `RuntimeError: Gave up on http://localhost:8000/orders after 5 attempts` |

For step 4, add the argument and pass it through:

```python
parser.add_argument("--page-size", type=int, default=500, help="orders per API page (1 to 1000)")
...
params = {"updated_since": since.isoformat(sep=" "), "page_size": page_size}
```

Give `extract` a `page_size` parameter and call it with `args.page_size`. With `--since 2026-06-01 --page-size 100 --verbose` you get 9 DEBUG page lines (the last with 63 rows). `--page-size 5000` makes the API answer `422`, which `get_json` does not retry, so the script exits with 1 immediately: the right behaviour for a mistake in your own request.

For step 5, the command-line value wins and the run fails against port 9999: `load_dotenv()` does not override variables that are already set, so a real environment variable always beats `.env`. That is how Docker and Airflow configure the same code differently.

# Quiz

passing_score: 70

### Why should every data engineering project have its own virtual environment and requirements.txt?

- [ ] Virtual environments make Python run faster
- [x] So the project's exact packages are isolated from other projects and can be reinstalled anywhere from a committed list
- [ ] GitHub requires them
- [ ] Without them Python cannot read CSV files

> A virtual environment keeps this project's package versions separate, and `requirements.txt` records them so a teammate, a Docker image or Airflow can install exactly the same set. The `.venv/` folder itself is never committed.

### You read orders.csv with csv.DictReader. What type is the value of row["quantity"]?

- [ ] int
- [ ] float
- [x] str, because CSV has no types and your code must convert it
- [ ] It depends on the value

> CSV is plain text. The csv module returns every field as a string; converting explicitly with `int()` makes bad values fail loudly instead of slipping through.

### The orders API returns HTTP 503. What should your extractor do?

- [ ] Fail immediately; the request is wrong
- [x] Wait with exponential backoff and retry, then fail loudly if it still does not succeed
- [ ] Skip that page and continue with the next one
- [ ] Retry forever until it works

> A 503 is a temporary server problem, so retrying after a growing wait often succeeds. Skipping the page would silently lose data, and retrying forever would hang the pipeline; a bounded number of retries and then a clear failure is the safe choice.

### Which is the safe way to pass a state name into a SQL query with psycopg?

- [ ] `conn.execute(f"select * from raw.customers where state = '{state}'")`
- [ ] `conn.execute("select * from raw.customers where state = '" + state + "'")`
- [x] `conn.execute("select * from raw.customers where state = %s", [state])`
- [ ] `conn.execute("select * from raw.customers where state = {}".format(state))`

> Parameters are sent separately from the SQL text, so the value is never parsed as SQL. That prevents SQL injection and handles quoting, dates and NULLs correctly. String formatting of any kind builds a new query from the input.

### Airflow runs your extractor, which catches an error, logs it and then finishes normally with exit code 0. What happens?

- [ ] Airflow reads the log and marks the task failed
- [x] Airflow marks the task successful, so no retry or alert happens and downstream tasks run on missing data
- [ ] Airflow retries it automatically
- [ ] The operating system restarts the script

> Schedulers judge a task by its exit code. A failure must end with a non-zero code (`return 1` from `main`, or an uncaught exception) so the scheduler can retry, alert and stop the tasks that depend on it.

# Project: Incremental orders extractor

max_score: 100

## Brief

ShopLink's first real pipeline. Extend `pipelines/extract_orders.py` from the last lesson so that every run pulls only the orders that changed since the previous load from the orders API, lands them as raw JSON files, and loads them into `warehouse.raw.orders_api` in PostgreSQL. It must be safe to rerun, configured from the environment, and tell you clearly what it did or why it failed.

Design notes to guide you:

- **The raw table** keeps the API's columns plus load metadata: `order_id bigint not null, customer_id bigint, warehouse_id bigint, order_date date, status text, channel text, updated_at timestamp, _load_date date not null, _loaded_at timestamptz not null default now()`. Create it with `create table if not exists`. The raw layer keeps every version it receives; choosing the latest version of each order is a later layer's job.
- **The watermark.** When `--since` is not given, use the newest `updated_at` already loaded by **earlier** load dates: `select max(updated_at) from raw.orders_api where _load_date < %s`. Using earlier dates only means a rerun of today asks the API for the same window as the first run did, instead of fetching almost nothing. On an empty table, fetch everything.
- **Safe reruns.** In one transaction (`with conn.transaction():`), delete the rows for this `--load-date`, then insert the new ones with COPY. A rerun replaces that day's rows; a failure leaves the previous rows untouched. The JSON folder for the load date is replaced the same way. Module 6 studies this pattern, and its limits, in depth.
- **Configuration**: `SHOPLINK_API_URL` and `SHOPLINK_WAREHOUSE_DB_URL` from the environment or `.env`. Nothing secret in the code.

## Deliverables

1. **`pipelines/extract_orders.py`**, run as `python -m pipelines.extract_orders`, with `--since` (optional; overrides the watermark), `--load-date` (default today) and `--verbose`. It uses `pipelines/http_utils.py` (retries and backoff) and `pipelines/db.py` (connection from the environment).
2. **Raw files** in `data/raw/orders_api/load_date=YYYY-MM-DD/page-NNNN.json`, exactly as the API returned them (git-ignored, not committed).
3. **The `raw.orders_api` table** in the `warehouse` database, loaded as described above.
4. **Logging and exit codes**: INFO lines with the watermark used, rows extracted and rows loaded; the full traceback and exit code 1 on failure; exit code 0 on success.
5. **`pipelines/mock_api.py`**, `requirements.txt` (with the packages from this module) and `.env.example` updated if you added any setting.
6. **A README section, "Orders extractor"**: what it does, how to run the mock API and the extractor, the arguments, and how to check the result in psql.
7. **Evidence in the PR description**: the log output and a query result for this sequence:
   1. mock API with batch 1; run with `--load-date 2026-09-26`: 9,091 rows;
   2. the same command again: still 9,091 rows for that date, not 18,182;
   3. restart the API with both batches; run with `--load-date 2026-09-27`: 565 rows (the 433 new July orders and 132 changed June orders);
   4. the same command again: still 565;
   5. `select _load_date, count(*) from raw.orders_api group by 1 order by 1;` and `select count(distinct order_id) from raw.orders_api;` (9,524).

Optional: a `tests/test_extract_orders.py` with a test of `parse_args`, and a `--dry-run` flag that extracts but does not load.

## How to submit

Do the work on a branch `feature/orders-extractor`, push it and open a pull request into `main` with a What / Why / How I checked it / Reviewer notes description, including the evidence from deliverable 7. Paste the link to the pull request into the submission form. You can share it for peer review on the platform before you merge.

## Grading guide

| Criterion | Points |
|---|---|
| Incremental extraction works: the watermark comes from earlier load dates, `--since` overrides it, and pagination fetches every page | 25 |
| Load into raw.orders_api is correct and safe to rerun (delete and COPY in one transaction; reruns give the same counts) | 25 |
| Raw JSON files land under the load date folder and are replaced on rerun | 10 |
| Configuration from the environment, logging with counts, and correct exit codes | 20 |
| README section and PR evidence let a reviewer run and verify it | 20 |
