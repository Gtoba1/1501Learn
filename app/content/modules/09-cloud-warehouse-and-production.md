---
module: 9
title: Cloud Warehouse & Production
optional: false
summary: Move ShopLink from your laptop to Snowflake and run it like a real team. You learn how Snowflake separates storage and compute, set up a small, cost-controlled warehouse on a free trial, load the raw data, point dbt at it with separate development and production environments, and let GitHub Actions build and test the project on every pull request and every morning.
---

# Lesson: Snowflake architecture

minutes: 45

## Why move off your laptop at all?

DuckDB has served ShopLink well. It is fast, free and needs no setup. But it lives in one file on one computer. When ShopLink hires a second analytics engineer, the finance team wants to connect Power BI, and the models need to rebuild at 6am whether or not your laptop is open, you need a warehouse that lives in the cloud, that many people and tools can reach at once, and that has proper security.

Snowflake is one of the most widely used cloud data warehouses, and it appears in a large share of analytics engineering job adverts. The concepts you learn here (separate compute, roles, environments) carry over to BigQuery, Databricks and Redshift as well.

## Storage and compute are separate

In a traditional database, the disks that store data and the processors that query it are one machine. If you need more power, you buy a bigger machine, and everyone shares it.

Snowflake splits the two:

| Layer | What it does | What you pay for |
|---|---|---|
| Storage | Holds every table, compressed, in the cloud provider's object storage | A small monthly fee per terabyte stored |
| Compute (virtual warehouses) | Clusters of servers that run your queries; you start, stop and resize them | Credits, charged per second while a warehouse is running |
| Cloud services | Logins, security, query planning, metadata | Usually free at small scale |

The consequence is powerful. Many warehouses can read the same data at the same time without slowing each other down. ShopLink could give dbt its own warehouse and the finance team's dashboards another, so a heavy 6am rebuild never slows the CFO's report.

## Virtual warehouses and credits

In Snowflake a **warehouse** is not where data lives. It is a unit of compute. Each warehouse has a size, and each size up doubles both the power and the cost:

| Size | Credits per hour while running |
|---|---|
| X-Small | 1 |
| Small | 2 |
| Medium | 4 |
| Large | 8 |

You are billed per second, with a minimum of 60 seconds each time a warehouse starts. ShopLink's data (about 9,000 orders and 27,000 lines) is tiny by warehouse standards, so an **X-Small warehouse is all you will ever need** in this course.

Two settings control almost all of your spend:

- **`AUTO_SUSPEND`**: how many seconds of idleness before the warehouse switches itself off. Set it to 60. The default on some accounts is 600 (10 minutes), which means you pay for ten idle minutes after every query.
- **`AUTO_RESUME`**: the warehouse starts automatically when a query arrives. Keep it on, so you never have to remember to start it.

## Caching

Snowflake remembers work it has already done, in three places:

- **Result cache.** If you run exactly the same query again within 24 hours and the data has not changed, Snowflake returns the stored result instantly, without starting a warehouse. That is why a query can be fast and free the second time.
- **Warehouse cache.** A running warehouse keeps recently read data on local disk. It is lost when the warehouse suspends, which is the trade-off of a short `AUTO_SUSPEND`: slightly slower first queries, much lower bills.
- **Metadata.** Snowflake stores counts, minimums and maximums for each block of data, so `select count(*) from orders` often needs no compute at all.

When you compare query timings, remember the result cache. The second run of a query is not a fair test.

## Databases, schemas and objects

Snowflake organises objects in a hierarchy you already know from DuckDB, with one extra level:

```text
Account
├── Warehouses (compute, account level)
├── Roles and users (security, account level)
└── Databases
    └── Schemas
        └── Tables, views, stages, file formats
```

A fully qualified name has three parts: `shoplink_raw.raw.orders` is the `orders` table in the `raw` schema of the `shoplink_raw` database. Unquoted names are stored in upper case, so `orders` and `ORDERS` are the same table. Never wrap names in double quotes unless you have a very good reason; `"Orders"` would be a different table.

## Role-based access control

Snowflake never grants permissions directly to people. Permissions (privileges) are granted to **roles**, and roles are granted to **users**. A user switches between their roles with `use role`.

Every account comes with system roles:

| Role | Job |
|---|---|
| `ACCOUNTADMIN` | Top of the tree: billing, account settings. Use it rarely. |
| `SECURITYADMIN` | Creates roles and users, and manages grants |
| `SYSADMIN` | Creates warehouses, databases and other objects |
| `PUBLIC` | Granted to everyone automatically |

You then create your own roles for real work. For ShopLink you will create a `TRANSFORMER` role that can read the raw data, write to the analytics databases and use one warehouse, and nothing else. dbt will run as that role. A mistake in a dbt model then cannot drop a raw table or change a billing setting.

## Start your free trial

Now create your account.

1. Go to the Snowflake sign-up page (linked in the resources below) and register with your email. Choose **Standard** or **Enterprise** edition; either is fine for this course.
2. Choose a cloud provider (AWS is a good default) and the region closest to you. From Nigeria, a European region such as London or Frankfurt is a sensible choice.
3. Confirm your email, set your password, and set up multi-factor authentication when Snowflake asks. Snowflake now requires MFA for people signing in to the web interface.
4. You land in **Snowsight**, the web interface. Open a new SQL worksheet.

The trial lasts 30 days or until the free usage balance runs out, whichever comes first. When it ends, the account is suspended: you can log in but not run anything. So:

- **Do Modules 9 and 10 within the trial window.** Plan your time before you sign up.
- **Watch your credits.** Snowsight shows your remaining balance under Admin, then Cost Management. An X-Small warehouse with a 60 second auto-suspend uses very little for ShopLink, but a Large warehouse left running overnight could use a large part of your balance.
- **Export anything you want to keep.** Your dbt code is safe in GitHub; the tables in Snowflake are not.

## Resources

- docs: [Key concepts and architecture](https://docs.snowflake.com/en/user-guide/intro-key-concepts) · Snowflake · Storage, compute and cloud services explained by Snowflake.
- docs: [Virtual warehouses](https://docs.snowflake.com/en/user-guide/warehouses) · Snowflake · Sizes, credits and how warehouses start and stop.
- docs: [Warehouse considerations](https://docs.snowflake.com/en/user-guide/warehouses-considerations) · Snowflake · How to choose a size and auto-suspend setting, and how caching affects cost.
- docs: [Overview of access control](https://docs.snowflake.com/en/user-guide/security-access-control-overview) · Snowflake · Roles, privileges and the system role hierarchy.
- docs: [Trial accounts](https://docs.snowflake.com/en/user-guide/admin-trial-account) · Snowflake · What the trial includes and what happens when it ends.
- docs: [Start a Snowflake free trial](https://signup.snowflake.com/) · Snowflake · The sign-up page for the 30-day trial.
- docs: [Snowflake documentation](https://docs.snowflake.com/en/index) · Snowflake · The home page for everything else. Bookmark it.
- docs: [Snowflake user guide](https://docs.snowflake.com/en/user-guide) · Snowflake · Task-based guides for loading data, security and cost.
- watch: [Snowflake Architecture](https://www.youtube.com/watch?v=RdPgzypYFWc) · IDWBI · 3.14K subscribers · 30.4K views · 299 likes · published 2022-10-31 · checked 2026-09-27 · 12 min
- watch: [Masterclass on Snowflake 2026: Full Course for Beginners to Advanced](https://www.youtube.com/watch?v=JsIK6Z3XPOk) · Data with Jay · 9.22K subscribers · 41.5K views · 728 likes · published 2025-12-09 · checked 2026-09-27 · 215 min

## Practice

1. Start your Snowflake trial and open a worksheet.
2. Run `select current_account(), current_region(), current_role(), current_warehouse();` and note the results.
3. In Admin, then Warehouses, find the warehouse Snowflake created for you (often `COMPUTE_WH`). Note its size and auto-suspend setting.
4. Answer in two or three sentences each: (a) why ShopLink could run dbt and dashboards at the same time without them slowing each other down; (b) why a second run of the same query can take almost no time; (c) why dbt should not run as `ACCOUNTADMIN`.

## Example answer

For step 2, you might see an account such as `XY12345`, a region such as `AWS_EU_WEST_2`, the role `ACCOUNTADMIN` and the warehouse `COMPUTE_WH`. For step 3, a new trial's `COMPUTE_WH` is typically X-Small; if its auto-suspend is longer than a minute, you will create your own warehouse with a 60 second setting in the next lesson.

For step 4:

(a) Storage and compute are separate in Snowflake, so ShopLink can create one warehouse for dbt and another for dashboards. Both read the same tables, but each has its own servers, so a heavy dbt rebuild does not queue up the finance team's queries.

(b) Snowflake keeps the result of every query for 24 hours. If the same query runs again and the underlying data has not changed, it returns the saved result without using a warehouse at all.

(c) `ACCOUNTADMIN` can change billing, drop any database and create users. If dbt runs with it, one wrong model or a leaked key could do enormous damage. A dedicated role with only the privileges dbt needs limits the harm any mistake can do.

# Lesson: Moving the project to Snowflake

minutes: 60

## The plan

You will do four things, in order:

1. Create a small warehouse, three databases, a `TRANSFORMER` role and a user for dbt.
2. Load the ShopLink CSV files into raw tables through a stage.
3. Install `dbt-snowflake` and add Snowflake targets to your profile.
4. Fix the handful of places where DuckDB SQL does not work in Snowflake.

## Step 1: warehouse, databases and a role

Paste this into a Snowsight worksheet and run it one block at a time. Each block starts by switching to the right system role.

```sql
-- Objects are created by SYSADMIN
use role sysadmin;

create warehouse if not exists transforming_wh
    warehouse_size = 'XSMALL'
    auto_suspend = 60
    auto_resume = true
    initially_suspended = true
    comment = 'dbt and ad hoc work for ShopLink';

create database if not exists shoplink_raw comment = 'Raw ShopLink data, loaded as is';
create schema if not exists shoplink_raw.raw;
create database if not exists shoplink_dev comment = 'dbt development and CI';
create database if not exists shoplink_prod comment = 'dbt production';
```

```sql
-- A spending limit, which only ACCOUNTADMIN can create
use role accountadmin;

create or replace resource monitor shoplink_monitor
    with credit_quota = 20
    frequency = monthly
    start_timestamp = immediately
    triggers
        on 80 percent do notify
        on 100 percent do suspend
        on 110 percent do suspend_immediate;

alter warehouse transforming_wh set resource_monitor = shoplink_monitor;
```

The resource monitor is your safety net: if `transforming_wh` ever uses 20 credits in a month, Snowflake suspends it. That is far more than ShopLink needs, so it only fires if something is badly wrong.

Three databases keep the layers apart: `shoplink_raw` holds data exactly as it arrived, `shoplink_dev` is where you and CI build, and `shoplink_prod` is what the business reads.

## Step 2: load the raw data through a stage

Snowflake loads files in two moves. First you put the files in a **stage**, a storage area for files. Then `COPY INTO` reads them from the stage into a table.

Create the file format, stage and raw tables:

```sql
use role sysadmin;
use warehouse transforming_wh;
use schema shoplink_raw.raw;

create or replace file format csv_format
    type = csv
    skip_header = 1
    field_optionally_enclosed_by = '"'
    null_if = ('');

create or replace stage csv_stage
    file_format = csv_format;

create or replace table customers (
    customer_id    integer,
    customer_name  varchar,
    customer_type  varchar,
    email          varchar,
    city           varchar,
    state          varchar,
    created_at     timestamp_ntz,
    updated_at     timestamp_ntz
);

create or replace table products (
    product_id    integer,
    product_name  varchar,
    category      varchar,
    brand         varchar,
    unit_cost     number(18, 2),
    list_price    number(18, 2),
    is_active     boolean
);

create or replace table warehouses (
    warehouse_id    integer,
    warehouse_name  varchar,
    city            varchar,
    state           varchar,
    opened_date     date
);

create or replace table orders (
    order_id      integer,
    customer_id   integer,
    warehouse_id  integer,
    order_date    date,
    status        varchar,
    channel       varchar,
    updated_at    timestamp_ntz
);

create or replace table order_lines (
    order_line_id  integer,
    order_id       integer,
    product_id     integer,
    quantity       integer,
    unit_price     number(18, 2),
    discount_pct   number(5, 2)
);
```

Three details in the file format matter for ShopLink. `skip_header = 1` ignores the header row. `field_optionally_enclosed_by = '"'` handles the status values with stray spaces, such as `" shipped"`, which the export wraps in quotes; the spaces are kept, exactly as in DuckDB, so your staging model's `lower(trim(status))` still has work to do. `null_if = ('')` turns the empty city values into proper NULLs.

**Upload the files.** Unzip [shoplink.zip](/datasets/shoplink.zip). In Snowsight, open the stage: go to the database explorer, then `SHOPLINK_RAW`, `RAW`, Stages, `CSV_STAGE`, and choose to add files. Select the five CSV files and, in the optional path box, type `batch1`. (If you prefer the command line, `PUT file://<folder>/*.csv @shoplink_raw.raw.csv_stage/batch1/` does the same from SnowSQL or the Snowflake CLI; `PUT` does not run in a Snowsight worksheet.)

Check the files arrived, then load them:

```sql
list @csv_stage;

copy into customers   from @csv_stage/batch1/customers.csv;
copy into products    from @csv_stage/batch1/products.csv;
copy into warehouses  from @csv_stage/batch1/warehouses.csv;
copy into orders      from @csv_stage/batch1/orders.csv;
copy into order_lines from @csv_stage/batch1/order_lines.csv;
```

Each `COPY INTO` reports the rows loaded and any errors. Snowflake also remembers which files it has loaded into each table, so running the same `COPY INTO` twice does not duplicate rows. Now confirm the counts match batch 1:

```sql
select 'customers' as table_name, count(*) as row_count from customers
union all select 'products', count(*) from products
union all select 'warehouses', count(*) from warehouses
union all select 'orders', count(*) from orders
union all select 'order_lines', count(*) from order_lines;
```

You should see 400 customers, 120 products, 5 warehouses, 9,091 orders and 26,779 order lines.

**Batch 2: upload now, load later.** Unzip [shoplink-batch-2.zip](/datasets/shoplink-batch-2.zip) and upload its three CSV files (`customers.csv`, `orders.csv` and `order_lines.csv`) to `CSV_STAGE` the same way, with the path `batch2`. **Do not load them yet.** Your snapshot can only record history from its first run, so dbt must see batch 1 first. You will load batch 2 after your first `dbt build --target dev`, later in this lesson.

## Step 3: a role and user for dbt

dbt needs to log in without a person typing a password and approving an MFA prompt. Snowflake's answer is a **service user** that authenticates with a key pair: a private key that stays secret on your computer (and later in GitHub), and a public key stored on the Snowflake user.

Generate the key pair in Git Bash (on Windows) or a terminal, somewhere **outside** your repository:

```bash
mkdir -p ~/.snowflake
cd ~/.snowflake
openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out shoplink_dbt_key.p8 -nocrypt
openssl rsa -in shoplink_dbt_key.p8 -pubout -out shoplink_dbt_key.pub
cat shoplink_dbt_key.pub
```

Copy the long text between `-----BEGIN PUBLIC KEY-----` and `-----END PUBLIC KEY-----` (not the header lines themselves). Then, in Snowsight:

```sql
use role securityadmin;

create role if not exists transformer;
grant role transformer to role sysadmin;

grant usage on warehouse transforming_wh to role transformer;

grant usage on database shoplink_raw to role transformer;
grant usage on schema shoplink_raw.raw to role transformer;
grant select on all tables in schema shoplink_raw.raw to role transformer;
grant select on future tables in schema shoplink_raw.raw to role transformer;

grant usage, create schema on database shoplink_dev to role transformer;
grant usage, create schema on database shoplink_prod to role transformer;

create user if not exists dbt_shoplink
    type = service
    default_role = transformer
    default_warehouse = transforming_wh
    rsa_public_key = 'PASTE_YOUR_PUBLIC_KEY_HERE'
    comment = 'dbt runs for ShopLink, from a laptop and from GitHub Actions';

grant role transformer to user dbt_shoplink;

-- Let yourself use the role in Snowsight too (use your own login name)
grant role transformer to user your_login_name;
```

`TYPE = SERVICE` marks this as a machine user: it cannot sign in with a password or use Snowsight, which is exactly what you want. In a larger team, each engineer would have their own development user; here, one dbt user for your laptop and CI keeps things simple.

**Never commit the `.p8` file.** Add this to your repository's `.gitignore` now, before you forget:

```text
*.p8
*.pem
```

## Step 4: install dbt-snowflake and add targets

In the virtual environment you use for dbt:

```bash
pip install dbt-snowflake
dbt --version
```

`dbt --version` should now list both the `duckdb` and `snowflake` plugins.

Find your account identifier in Snowsight: open the account menu (bottom left), then view your account details. It looks like `ABCDEFG-XY12345` (organisation name, a hyphen, account name).

You will keep secrets out of `profiles.yml` entirely by reading them from environment variables with `env_var()`, so the file stays safe to commit and CI can use it. Your `profiles.yml` already sits in `shoplink_dbt/` and has one output, `duckdb` (Module 6). Add a `dev` output for Snowflake and make it the default target. Keep the `duckdb` output exactly as it was:

```yaml
shoplink:
  target: dev
  outputs:
    duckdb:
      type: duckdb
      path: ../shoplink.duckdb
      schema: analytics
      threads: 4

    dev:
      type: snowflake
      account: "{{ env_var('SNOWFLAKE_ACCOUNT') }}"
      user: "{{ env_var('SNOWFLAKE_USER') }}"
      private_key_path: "{{ env_var('SNOWFLAKE_PRIVATE_KEY_PATH') }}"
      role: transformer
      warehouse: transforming_wh
      database: shoplink_dev
      schema: "dbt_{{ env_var('DBT_DEVELOPER', 'dev') }}"
      threads: 4
```

Set the variables for your current terminal session. In PowerShell:

```powershell
$env:SNOWFLAKE_ACCOUNT = "abcdefg-xy12345"
$env:SNOWFLAKE_USER = "dbt_shoplink"
$env:SNOWFLAKE_PRIVATE_KEY_PATH = "$HOME\.snowflake\shoplink_dbt_key.p8"
$env:DBT_DEVELOPER = "tolu"
```

In Git Bash:

```bash
export SNOWFLAKE_ACCOUNT="abcdefg-xy12345"
export SNOWFLAKE_USER="dbt_shoplink"
export SNOWFLAKE_PRIVATE_KEY_PATH="$HOME/.snowflake/shoplink_dbt_key.p8"
export DBT_DEVELOPER="tolu"
```

Then test the connection:

```bash
dbt debug --target dev
```

You want `All checks passed!`. Your DuckDB work still runs with `dbt build --target duckdb`.

## Point the sources at the raw database

In DuckDB, your raw tables sat in the same database file as your models. In Snowflake they live in `shoplink_raw`. Make the source's `database` depend on the target, so the same file works for both:

```yaml
sources:
  - name: shoplink
    database: "{{ 'shoplink_raw' if target.type == 'snowflake' else target.database }}"
    schema: raw
```

## DuckDB SQL that Snowflake will reject

Now run `dbt build --target dev`. Most of your project will just work, because standard SQL is standard. These are the differences that break ShopLink's project, plus a few more you may meet elsewhere:

| In DuckDB | In Snowflake | Notes |
|---|---|---|
| `cast(strftime(d, '%Y%m%d') as integer)` | `cast(year(d) * 10000 + month(d) * 100 + day(d) as integer)` | Snowflake has no `strftime`. The replacement works on both, so use it for `date_key` in `fct_order_lines` and `dim_date` |
| `strftime(d, '%Y-%m')` | `to_char(d, 'YYYY-MM')` | Different function and format codes |
| `strftime(d, '%B')` returns `January` | `to_char(d, 'MMMM')` returns `January` | `monthname(d)` in Snowflake returns only `Jan` |
| `strftime(d, '%A')` returns `Monday` | `decode(dayofweekiso(d), 1, 'Monday', 2, 'Tuesday', ...)` | Snowflake has no format code for the full day name, and `dayname(d)` returns only `Mon` |
| `isodow(d)` | `dayofweekiso(d)` | Both return 1 for Monday to 7 for Sunday |
| `count(*) filter (where x)` | `count_if(x)` | Snowflake does not support `filter`. DuckDB also has `count_if`, so the replacement works on both |
| `range(date '2024-01-01', date '2027-01-01', interval 1 day)` for a date spine | Not available | Build `dim_date` on `{{ dbt_utils.date_spine(...) }}`, which works on both (see below) |
| `date_diff('day', a, b)` | `datediff(day, a, b)` | Or use the cross-database macro `{{ dbt.datediff('a', 'b', 'day') }}` |
| `order_date + interval 7 day` | `dateadd(day, 7, order_date)` | Or `{{ dbt.dateadd('day', 7, 'order_date') }}` |
| `string_agg(x, ', ')` | `listagg(x, ', ')` | Or `{{ dbt.listagg('x', "', '") }}` |
| `regexp_matches(x, 'pattern')` | `regexp_like(x, 'pattern')` | |
| `try_cast(x as integer)` on any type | `try_cast` only accepts text input | Cast to `varchar` first if needed |
| Lower-case identifiers | Upper-case identifiers | Only matters if you used double quotes; remove them |

In `fct_order_lines`, change the `date_key` line of the final `select` to:

```sql
    cast(year(order_lines.order_date) * 10000
        + month(order_lines.order_date) * 100
        + day(order_lines.order_date) as integer)                as date_key,
```

In `orders_by_status_monthly` (Module 7), change the line inside the loop to:

```sql
    count_if(order_status = '{{ status }}') as {{ status }}_orders
```

`dim_date` needs the most work, because Module 5's version is built on `range()`, `strftime()` and `isodow()`. Replace `models/marts/dim_date.sql` with this version, which uses `dbt_utils` from Module 7 for the spine and switches the dialect-specific columns on `target.type`, so it builds the same 1,096 rows on both warehouses:

```sql
with spine as (
    {{ dbt_utils.date_spine(
        datepart = "day",
        start_date = "cast('2024-01-01' as date)",
        end_date = "cast('2027-01-01' as date)"
    ) }}
),

days as (
    select cast(date_day as date) as d
    from spine
)

select
    cast(year(d) * 10000 + month(d) * 100 + day(d) as integer) as date_key,
    d                                                           as full_date,
    year(d)                                                     as year,
    quarter(d)                                                  as quarter,
    month(d)                                                    as month,
    {% if target.type == 'snowflake' -%}
    to_char(d, 'MMMM')                                          as month_name,
    to_char(d, 'YYYY-MM')                                       as year_month,
    dayofweekiso(d)                                             as day_of_week,
    decode(dayofweekiso(d), 1, 'Monday', 2, 'Tuesday', 3, 'Wednesday',
        4, 'Thursday', 5, 'Friday', 6, 'Saturday', 7, 'Sunday')  as day_name,
    dayofweekiso(d) in (6, 7)                                   as is_weekend
    {%- else -%}
    strftime(d, '%B')                                           as month_name,
    strftime(d, '%Y-%m')                                        as year_month,
    isodow(d)                                                   as day_of_week,
    strftime(d, '%A')                                           as day_name,
    isodow(d) in (6, 7)                                         as is_weekend
    {%- endif %}
from days
```

`date_spine` leaves out its `end_date`, so the spine runs from 1 January 2024 to 31 December 2026, as before.

The contract on `fct_order_lines` from Module 8 passes once `date_key` no longer uses `strftime`, because you cast every column to a type Snowflake also understands (`bigint`, `integer`, `varchar`, `date`, `timestamp`, `decimal`).

## Load batch 2 and build again

Once `dbt build --target dev` succeeds on batch 1, your dev snapshot holds the batch 1 version of every customer. Now load batch 2 with the same upsert as your Module 7 `load/02_load_batch_2.sql`: replace the 132 changed June orders and add the 433 new ones, append the new order lines, and replace customers with the full new extract. In a Snowsight worksheet:

```sql
use role sysadmin;
use warehouse transforming_wh;
use schema shoplink_raw.raw;

create or replace temporary table batch2_orders like orders;
copy into batch2_orders from @csv_stage/batch2/orders.csv;
delete from orders where order_id in (select order_id from batch2_orders);
insert into orders select * from batch2_orders;
copy into order_lines from @csv_stage/batch2/order_lines.csv;
truncate table customers;
copy into customers from @csv_stage/batch2/customers.csv;
```

The stage already carries `csv_format`, so the `COPY INTO` statements need no `FILE_FORMAT`, just as for batch 1. Batch 2's order lines all belong to the new July orders, so appending them cannot duplicate a line. Run the count query from Step 2 again, then run `dbt build --target dev` a second time: the snapshot records the 20 changed customers and `fct_order_lines` processes the new and changed orders incrementally, exactly as in Module 7.

## Resources

- docs: [CREATE WAREHOUSE](https://docs.snowflake.com/en/sql-reference/sql/create-warehouse) · Snowflake · Every warehouse setting, including size, auto-suspend and auto-resume.
- docs: [Working with resource monitors](https://docs.snowflake.com/en/user-guide/resource-monitors) · Snowflake · How credit limits and triggers work.
- docs: [COPY INTO table](https://docs.snowflake.com/en/sql-reference/sql/copy-into-table) · Snowflake · Loading staged files, error handling and load history.
- docs: [Loading data using the web interface](https://docs.snowflake.com/en/user-guide/data-load-web-ui) · Snowflake · Uploading files to a stage from Snowsight.
- docs: [Key-pair authentication](https://docs.snowflake.com/en/user-guide/key-pair-auth) · Snowflake · Generating keys and assigning them to a user.
- docs: [Snowflake setup](https://docs.getdbt.com/docs/local/connect-data-platform/snowflake-setup) · dbt Labs · Every `profiles.yml` option for dbt-snowflake.
- watch: [Snowflake Full Course | Beginner to Advanced | 7+ Hours | learn by doing it](https://www.youtube.com/watch?v=7lpp5N73V98) · learn by doing it · 58.8K subscribers · 22.2K views · 269 likes · published 2026-09-11 · checked 2026-09-27 · 438 min

## Practice

1. Run the setup SQL: warehouse, resource monitor, databases, file format, stage and raw tables.
2. Upload and load batch 1, and confirm the five row counts.
3. Create the key pair, the `TRANSFORMER` role and the `dbt_shoplink` service user.
4. Install `dbt-snowflake`, add the `dev` target and pass `dbt debug --target dev`.
5. Upload the batch 2 files with the path `batch2`, without loading them. Run `dbt build --target dev`. Fix every SQL error you hit, and keep a list of what you changed and why.
6. Load batch 2 with the upsert from the lesson and run `dbt build --target dev` again.

## Example answer

After step 2, the count query returns exactly: customers 400, products 120, warehouses 5, orders 9,091, order_lines 26,779. After loading batch 2, orders grows by 433 to 9,524 (the 132 changed June orders replace their old rows), order lines by 1,230 to 28,009, and customers shows 430 rows. After the second build, `snp_customers` holds 450 rows and `fct_order_lines` 28,001, the same figures as in Module 7.

For step 5, the changes the course's project needs:

| File | Problem | Fix |
|---|---|---|
| `_sources.yml` | dbt looked for raw tables in `shoplink_dev` | Made `database` depend on `target.type` |
| `fct_order_lines.sql` | `strftime(order_lines.order_date, '%Y%m%d')` for `date_key` failed: Snowflake has no `strftime` | Replaced with `year(...) * 10000 + month(...) * 100 + day(...)`, cast to `integer`, which works on both |
| `orders_by_status_monthly.sql` | `count(*) filter (where ...)` is a syntax error in Snowflake | Replaced with `count_if(order_status = '...')` |
| `dim_date.sql` | `range()` does not exist in Snowflake | Rebuilt the spine with `dbt_utils.date_spine` |
| `dim_date.sql` | `strftime(d, '%Y%m%d')`, `strftime(d, '%B')` and `strftime(d, '%Y-%m')` failed | Used the portable `date_key` expression, `to_char(d, 'MMMM')` and `to_char(d, 'YYYY-MM')` |
| `dim_date.sql` | `strftime(d, '%A')` and `isodow(d)` failed | Used `dayofweekiso(d)`, and `decode(dayofweekiso(d), 1, 'Monday', 2, 'Tuesday', ...)` for `day_name`, because `dayname(d)` returns `Mon` instead of `Monday` |

If you added models of your own, your list may be longer. A run is finished when `dbt build --target dev` ends with `Completed successfully` and the only failures are tests you set to `warn` in Module 8.

# Lesson: Environments

minutes: 45

## Never develop in production

In production, people are reading your tables right now. If you build a half-finished change there, the sales dashboard breaks while you work. So every serious team separates at least two **environments**:

| Environment | Who builds it | Where | Who reads it |
|---|---|---|---|
| Development | You, from your laptop, as often as you like | `shoplink_dev`, schema `dbt_<yourname>` | Only you |
| CI | GitHub Actions, on every pull request | `shoplink_dev`, schema `ci_pr_<number>` | The reviewer |
| Production | GitHub Actions, on a schedule, from `main` only | `shoplink_prod` | The business |

Code moves between them only through Git: you develop on a branch, CI tests the pull request, and production only ever builds what has been merged to `main`. Nobody runs `dbt build --target prod` from their laptop.

## Targets are environments

In dbt, each environment is a **target** in `profiles.yml`. Add `ci` and `prod` next to `dev`:

```yaml
    ci:
      type: snowflake
      account: "{{ env_var('SNOWFLAKE_ACCOUNT') }}"
      user: "{{ env_var('SNOWFLAKE_USER') }}"
      private_key_path: "{{ env_var('SNOWFLAKE_PRIVATE_KEY_PATH') }}"
      role: transformer
      warehouse: transforming_wh
      database: shoplink_dev
      schema: "{{ env_var('DBT_CI_SCHEMA', 'ci') }}"
      threads: 4

    prod:
      type: snowflake
      account: "{{ env_var('SNOWFLAKE_ACCOUNT') }}"
      user: "{{ env_var('SNOWFLAKE_USER') }}"
      private_key_path: "{{ env_var('SNOWFLAKE_PRIVATE_KEY_PATH') }}"
      role: transformer
      warehouse: transforming_wh
      database: shoplink_prod
      schema: analytics
      threads: 4
```

`target: dev` at the top of the profile means a plain `dbt build` always goes to development. To reach production you must type `--target prod`, and in the next lesson only GitHub Actions will do that.

Inside your models, `target` is available in Jinja. A common use is building less data in development to save time and credits:

```sql
select *
from {{ ref('stg_orders') }}
{% if target.name == 'dev' %}
where order_date >= '2026-01-01'
{% endif %}
```

Use this sparingly. If development builds very different data from production, a bug can hide until it reaches production.

## Schemas: generate_schema_name

So far every model builds into the target schema. For production you want separate `staging` and `marts` schemas, so add `+schema: staging` under `staging:` and `+schema: marts` under `marts:` in `dbt_project.yml` now (on DuckDB your models move to `analytics_staging` and `analytics_marts`). Keep the other settings you already have there, such as `+group` from Module 8:

```yaml
models:
  shoplink_analytics:
    staging:
      +materialized: view
      +schema: staging
    intermediate:
      +materialized: ephemeral
    marts:
      +materialized: table
      +schema: marts
```

The snapshot already has a custom schema: `schema: snapshots` in `snp_customers.yml` (Module 7), which is why it lands in `analytics_snapshots` on DuckDB. By default dbt **joins** the target schema and the custom schema with an underscore. That is good for development, where it keeps your work apart from everyone else's, but untidy in production:

| Target | Target schema | Custom schema | Default result |
|---|---|---|---|
| duckdb | `analytics` | `marts` | `analytics_marts` |
| dev | `dbt_tolu` | `marts` | `dbt_tolu_marts` |
| prod | `analytics` | `marts` | `analytics_marts` |

Production should just be `marts`. Override the macro that decides this. Create `macros/generate_schema_name.sql`:

```sql
{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- set default_schema = target.schema -%}
    {%- if target.name == 'prod' and custom_schema_name is not none -%}
        {{ custom_schema_name | trim }}
    {%- elif custom_schema_name is none -%}
        {{ default_schema }}
    {%- else -%}
        {{ default_schema }}_{{ custom_schema_name | trim }}
    {%- endif -%}
{%- endmacro %}
```

Now production builds `shoplink_prod.staging`, `shoplink_prod.marts` and `shoplink_prod.snapshots`, while development and CI keep their prefixes: `shoplink_dev.dbt_tolu_marts` and `shoplink_dev.ci_pr_12_marts`. Because the database differs too, nothing in development can ever overwrite production.

The `duckdb` target is not `prod`, so it keeps the joined names too. **From now on, on DuckDB your marts live in `analytics_marts` and your staging views in `analytics_staging`**, while the snapshot stays in `analytics_snapshots`. Any DuckDB query you run from here on must use the new names, for example `from analytics_marts.fct_order_lines` instead of `from analytics.fct_order_lines`. The old copies in `analytics` stop updating; drop them once you have rebuilt, so nobody reads stale tables by mistake. Your dev schema `dbt_tolu` in Snowflake has the same leftovers from your first builds.

Production and each CI schema start with an empty snapshot while raw already holds batch 2, so their `snp_customers` has 430 rows and no history. History builds up from a snapshot's first run. Only your dev and DuckDB snapshots, which saw batch 1 first, hold the 20 closed versions.

## Secrets and env_var()

A secret is anything that grants access: a password, a private key, an API token. The rules are simple:

- **Secrets never go in Git.** Not in `profiles.yml`, not in a model, not in a commit you "will delete later". Git keeps history, and a public repository is scanned by bots within minutes.
- **Code reads secrets from the environment.** `env_var('SNOWFLAKE_ACCOUNT')` makes dbt read the value at run time. If the variable is missing and there is no default, dbt stops with a clear error, which is what you want for a secret.
- **Defaults are for non-secrets only.** `env_var('DBT_DEVELOPER', 'dev')` is fine; a default password is not.
- **Prefix very sensitive values with `DBT_ENV_SECRET_`.** dbt hides the values of variables with that prefix in its logs. They can only be used in `profiles.yml` and `packages.yml`.

Your key file path is not itself a secret, but the file it points to is. Keep the `.p8` file outside the repository, and keep `*.p8` in `.gitignore`.

Setting four variables every time you open a terminal gets tedious. In PowerShell you can store them for your user permanently:

```powershell
[Environment]::SetEnvironmentVariable("SNOWFLAKE_ACCOUNT", "abcdefg-xy12345", "User")
```

Open a new terminal afterwards for the change to take effect.

## Resources

- docs: [Custom schemas](https://docs.getdbt.com/docs/build/custom-schemas) · dbt Labs · How `generate_schema_name` works, with the environment-aware pattern.
- docs: [env_var](https://docs.getdbt.com/reference/dbt-jinja-functions/env_var) · dbt Labs · Reading environment variables, defaults and secret handling.
- docs: [target](https://docs.getdbt.com/reference/dbt-jinja-functions/target) · dbt Labs · What you can read from `target` inside models and macros.
- docs: [dbt environments](https://docs.getdbt.com/docs/local/dbt-environments) · dbt Labs · Development and deployment environments in dbt Core.

## Practice

1. Add the `ci` and `prod` targets to your `profiles.yml`.
2. Add `+schema: staging` and `+schema: marts` to `dbt_project.yml`, and add the `generate_schema_name` macro.
3. Run `dbt build --target dev`, then list the schemas that now exist with `show schemas in database shoplink_dev;`.
4. Just this once, to check the macro, run `dbt build --target prod` and list the schemas in `shoplink_prod`. From the next lesson on, only GitHub Actions builds production.
5. Search your repository for anything that looks like a secret: run `git grep -n -i "password\|private_key\|BEGIN"` and explain any result.

## Example answer

After step 3, `shoplink_dev` contains `DBT_TOLU_STAGING`, `DBT_TOLU_MARTS` and `DBT_TOLU_SNAPSHOTS` (from the `+schema` settings you just added and the snapshot's schema), `DBT_TOLU` with the leftover copies from your first builds, plus `INFORMATION_SCHEMA` and `PUBLIC`, which Snowflake creates in every database. After step 4, `shoplink_prod` contains `STAGING`, `MARTS` and `SNAPSHOTS`, with no personal prefix, and `shoplink_prod.snapshots.snp_customers` has 430 rows, one per customer, because production's history starts today. If you see `ANALYTICS_MARTS` instead, the macro is not being picked up: check that the file is in `macros/` and that the macro's name is exactly `generate_schema_name`.

For step 5, the only acceptable matches are lines such as `private_key_path: "{{ env_var('SNOWFLAKE_PRIVATE_KEY_PATH') }}"`, which name a variable and contain no secret. If the search finds a real key or password, removing it in a new commit is not enough, because it stays in history: rotate it immediately (generate a new key pair and run `alter user dbt_shoplink set rsa_public_key = '...';`), then clean up the file.

# Lesson: Scheduling and CI

minutes: 60

## Two jobs for one workflow

Production needs two kinds of automation:

- **Continuous integration (CI):** on every pull request, build and test the change in an isolated schema. If anything fails, the pull request shows a red cross and should not be merged.
- **Scheduled deployment:** every morning, build `main` in production, so the business sees yesterday's data by the time they arrive at work.

GitHub Actions can do both, for free at this scale. A **workflow** is a YAML file in `.github/workflows/`. It says **when** to run (the `on:` triggers) and **what** to run (jobs made of steps), on a fresh Linux machine that GitHub provides each time.

## Step 1: store the secrets in GitHub

The workflow needs your account, user and private key, just as your laptop does. In your `shoplink-analytics` repository on GitHub, go to Settings, then Secrets and variables, then Actions, and add three **repository secrets**:

| Name | Value |
|---|---|
| `SNOWFLAKE_ACCOUNT` | Your account identifier, such as `abcdefg-xy12345` |
| `SNOWFLAKE_USER` | `dbt_shoplink` |
| `SNOWFLAKE_PRIVATE_KEY` | The entire contents of `shoplink_dbt_key.p8`, including the `BEGIN` and `END` lines |

GitHub encrypts secrets, never shows them again after you save them, and masks them as `***` in logs.

## Step 2: pin your dependencies

CI should install exactly what you use locally. Create `shoplink_dbt/requirements-ci.txt` (Module 6's root file is for DuckDB), using the versions `dbt --version` shows on your laptop:

```text
dbt-core==1.12.5
dbt-snowflake==1.12.1
```

## Step 3: the workflow

Create `.github/workflows/dbt.yml` at the root of your repository. Its `run` steps work inside `shoplink_dbt/`, the folder that holds `dbt_project.yml`, `profiles.yml` and `requirements-ci.txt`.

```yaml
name: dbt

on:
  pull_request:
    branches: [main]
  schedule:
    - cron: "0 5 * * *" # every day at 05:00 UTC, which is 06:00 in Lagos
  workflow_dispatch: # adds a "Run workflow" button in the Actions tab

permissions:
  contents: read

concurrency:
  group: dbt-${{ github.ref }}
  cancel-in-progress: true

env:
  SNOWFLAKE_ACCOUNT: ${{ secrets.SNOWFLAKE_ACCOUNT }}
  SNOWFLAKE_USER: ${{ secrets.SNOWFLAKE_USER }}
  SNOWFLAKE_PRIVATE_KEY_PATH: ${{ github.workspace }}/snowflake_key.p8
  DBT_PROFILES_DIR: .
  DBT_TARGET: ${{ github.event_name == 'pull_request' && 'ci' || 'prod' }}
  DBT_CI_SCHEMA: ci_pr_${{ github.event.pull_request.number }}

jobs:
  dbt-build:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    defaults:
      run:
        working-directory: shoplink_dbt

    steps:
      - name: Check out the repository
        uses: actions/checkout@v7

      - name: Set up Python
        uses: actions/setup-python@v7
        with:
          python-version: "3.12"

      - name: Install dbt
        run: pip install -r requirements-ci.txt

      - name: Write the Snowflake private key
        env:
          SNOWFLAKE_PRIVATE_KEY: ${{ secrets.SNOWFLAKE_PRIVATE_KEY }}
        run: |
          printf '%s\n' "$SNOWFLAKE_PRIVATE_KEY" > "$SNOWFLAKE_PRIVATE_KEY_PATH"
          chmod 600 "$SNOWFLAKE_PRIVATE_KEY_PATH"

      - name: Install dbt packages
        run: dbt deps

      - name: Check the connection
        run: dbt debug --target "$DBT_TARGET"

      - name: Check source freshness
        # The ShopLink extract is historical, so freshness always errors in this course.
        # In a live project, remove continue-on-error so stale data stops the run.
        run: dbt source freshness --target "$DBT_TARGET"
        continue-on-error: true

      - name: Build and test
        run: dbt build --target "$DBT_TARGET"
```

Read it section by section:

- **`on:`** runs the workflow for pull requests into `main`, every day at 05:00 UTC, and whenever you click "Run workflow". Cron times in GitHub Actions are always UTC; Lagos is UTC+1.
- **`concurrency:`** cancels an older run on the same branch when you push again, so you do not pay for builds nobody will look at.
- **`env:`** makes the secrets available as the environment variables your `profiles.yml` already reads. `DBT_TARGET` is `ci` for pull requests and `prod` for everything else. `DBT_CI_SCHEMA` gives each pull request its own schema, such as `ci_pr_12`.
- **`DBT_PROFILES_DIR: .`** tells dbt to use the `profiles.yml` committed in the project folder.
- **The key step** writes the private key from the secret to a file, readable only by the runner, for `private_key_path` to use. It is deleted when the machine is thrown away at the end of the run.
- **`dbt build`** runs models, tests, snapshots and seeds in dependency order, and skips anything downstream of a failure. If any test with `error` severity fails, the step fails and the pull request shows a red cross.

Commit the workflow on a branch, push, and open a pull request. Open the Actions tab to watch it run. When the run is green, merge. From then on, production rebuilds every morning.

Two points about schedules: they only run from the workflow file on your default branch (`main`), and GitHub pauses scheduled workflows in public repositories after 60 days with no activity in the repository. Also, each daily run starts your warehouse for a few minutes, which your trial balance will easily cover, but it is another reason to keep `AUTO_SUSPEND = 60`.

## Make CI required

A red cross only protects `main` if it blocks the merge. In GitHub, go to Settings, then Branches (or Rules), add a rule for `main`, and require the `dbt-build` status check to pass before merging. Now a pull request that breaks a test cannot be merged, even by you in a hurry.

CI schemas pile up in `shoplink_dev` (one set per pull request). They cost almost nothing to store, but tidy them up now and then: for pull request 12, run `drop schema shoplink_dev.ci_pr_12_staging;` and the same for `ci_pr_12_marts` and `ci_pr_12_snapshots`.

## Stretch: slim CI with state:modified+

As a project grows, rebuilding everything on every pull request becomes slow. **Slim CI** builds only the models you changed and everything downstream of them. dbt works this out by comparing your branch's `manifest.json` with the one from the last production run.

The idea in three steps: the production run saves its manifest; the CI run downloads it; CI builds only what changed, reading unchanged parents from production. Add a step at the end of the job to save the manifest from production runs:

```yaml
      - name: Save the production manifest
        if: github.event_name != 'pull_request'
        uses: actions/upload-artifact@v7
        with:
          name: prod-manifest
          path: shoplink_dbt/target/manifest.json
          retention-days: 30
```

Then, for pull requests, replace the `Build and test` step with these two:

```yaml
      - name: Download the latest production manifest
        if: github.event_name == 'pull_request'
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          run_id=$(gh run list --workflow dbt.yml --branch main --status success --limit 1 --json databaseId --jq '.[0].databaseId')
          gh run download "$run_id" --name prod-manifest --dir prod-state

      - name: Build and test
        run: |
          if [ "$DBT_TARGET" = "ci" ]; then
            dbt build --target ci --select state:modified+ --defer --state prod-state
          else
            dbt build --target prod
          fi
```

And give the workflow permission to read other runs' artifacts:

```yaml
permissions:
  contents: read
  actions: read
```

`state:modified+` selects changed models and their children. `--defer` tells dbt that when a model refers to an unchanged parent that was not built in CI, it should read the production version instead. Run the workflow once from `main` with "Run workflow" first, so there is a production manifest to download.

## The alternative: dbt Cloud jobs

Everything in this lesson can also be done in dbt Cloud (now called the dbt platform) without writing a workflow file: you connect the repository, create a production environment, and set up a scheduled **deploy job** and a **CI job** that runs on pull requests, with slim CI built in. Many companies use it. The concepts are identical: environments, targets, schedules, CI on pull requests and state comparison. Knowing how to do it by hand in GitHub Actions means you will understand what dbt Cloud is doing for you.

## Resources

- docs: [GitHub Actions documentation](https://docs.github.com/en/actions) · GitHub · Start with the quickstart if you have never written a workflow.
- docs: [Workflow syntax for GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) · GitHub · Every key used in the workflow above.
- docs: [Using secrets in GitHub Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets) · GitHub · Creating repository secrets and passing them to steps.
- docs: [Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) · GitHub · `pull_request`, `schedule` and `workflow_dispatch` in detail.
- docs: [Node selector state methods](https://docs.getdbt.com/reference/node-selection/methods) · dbt Labs · How `state:modified` decides what changed.
- docs: [Defer](https://docs.getdbt.com/reference/node-selection/defer) · dbt Labs · Reading unchanged parents from production during CI.
- docs: [Continuous integration in dbt](https://docs.getdbt.com/docs/deploy/continuous-integration) · dbt Labs · How dbt Cloud CI jobs work, for comparison.
- watch: [Your First DBT CI/CD Pipeline With Github Actions](https://www.youtube.com/watch?v=bcr20_PYDro) · Technovation · 248 subscribers · 5.7K views · 131 likes · published 2024-11-03 · checked 2026-09-27 · 22 min

## Practice

1. Add the three repository secrets and `shoplink_dbt/requirements-ci.txt`.
2. Commit `.github/workflows/dbt.yml` on a new branch and open a pull request. Watch the run in the Actions tab and fix anything that fails until it is green.
3. In Snowflake, confirm that CI built into the schemas `CI_PR_<your PR number>_STAGING`, `CI_PR_<your PR number>_MARTS` and `CI_PR_<your PR number>_SNAPSHOTS` in `shoplink_dev`.
4. Merge, then start the workflow by hand from the Actions tab and confirm it built `shoplink_prod`.
5. Make a pull request that deliberately breaks a test (for example, remove the `lower(trim())` from the status in `stg_orders`). Confirm CI goes red, then close the pull request without merging.
6. Add branch protection so the `dbt-build` check is required.

## Example answer

A green pull request run shows every step with a tick. The `Check source freshness` step shows a warning icon rather than a tick, because it failed and `continue-on-error` let the job carry on; its log shows `ERROR STALE` for `shoplink.orders` and `shoplink.customers`, which is expected for the historical extract. The `Build and test` log ends with a line such as `Done. PASS=58 WARN=2 ERROR=0 SKIP=0 TOTAL=60` (your numbers depend on your project).

For step 3, `show schemas in database shoplink_dev;` lists `CI_PR_1_STAGING`, `CI_PR_1_MARTS` and `CI_PR_1_SNAPSHOTS` for pull request number 1. There is no plain `CI_PR_1`, because every model now has a custom schema and dbt only creates the schemas it builds into. For step 4, the manual run on `main` has `DBT_TARGET` set to `prod`, and `shoplink_prod.marts.fct_order_lines` has a fresh `last_altered` time in `information_schema.tables`.

For step 5, removing the clean-up from status makes the `accepted_values` test on `stg_orders.order_status` fail on values such as `Delivered` and ` shipped`. `dbt build` reports `ERROR=1`, skips every model downstream of `stg_orders`, and the pull request shows a red cross with "Some checks were not successful". That is CI doing exactly its job.

# Quiz

passing_score: 70

### ShopLink's Snowflake bill is higher than expected, and the X-Small warehouse shows long periods of running with no queries. Which setting most likely needs changing?

- [ ] WAREHOUSE_SIZE, from X-Small to Small
- [x] AUTO_SUSPEND, lowered to 60 seconds so the warehouse stops soon after the last query
- [ ] AUTO_RESUME, set to false
- [ ] The number of databases

> Warehouses cost credits for every second they run, including idle time. A short AUTO_SUSPEND stops idle spend, and AUTO_RESUME starts the warehouse again automatically when needed.

### Why does the ShopLink profiles.yml use env_var() for the account, user and private key path?

- [ ] Because dbt-snowflake cannot read values written directly in profiles.yml
- [x] So the file contains no secrets, can be committed to Git, and works on both your laptop and GitHub Actions with different values
- [ ] Because environment variables make queries run faster
- [ ] So that dbt can create the Snowflake user automatically

> Reading secrets from the environment keeps them out of Git. The same committed file then works anywhere the variables are set: your terminal locally, repository secrets in CI.

### With the custom generate_schema_name macro from this module, where does a model with +schema: marts build on the prod target?

- [ ] shoplink_prod.analytics_marts
- [x] shoplink_prod.marts
- [ ] shoplink_dev.dbt_tolu_marts
- [ ] shoplink_prod.analytics

> The macro uses the custom schema name on its own in production and keeps the default "target schema plus custom schema" behaviour in development and CI.

### In the GitHub Actions workflow, what makes a pull request build into its own schema instead of production?

- [ ] The concurrency setting
- [ ] The pull request branch name
- [x] DBT_TARGET is set to ci for pull_request events, and the ci target reads its schema from DBT_CI_SCHEMA, which includes the pull request number
- [ ] GitHub Actions always uses a separate Snowflake account for pull requests

> The expression github.event_name == 'pull_request' && 'ci' || 'prod' picks the target, and the ci target's schema comes from DBT_CI_SCHEMA, such as ci_pr_12, in the development database.

# Project: ShopLink in production

max_score: 100

## Brief

ShopLink has signed off on Snowflake. Your job is to move the project there and make it run without you: every change tested before it is merged, and production rebuilt every morning before the sales team logs in.

## Deliverables

1. **Snowflake setup script** committed as `snowflake/setup.sql`: the warehouse (X-Small, `AUTO_SUSPEND = 60`, `AUTO_RESUME = TRUE`), resource monitor, databases, file format, stage, raw tables, `TRANSFORMER` role, grants and the service user. Replace your public key with a placeholder before committing.
2. **Raw data loaded** into `shoplink_raw.raw` from a stage with `COPY INTO`, with the row counts recorded in your README.
3. **dbt on Snowflake** with `dev`, `ci` and `prod` targets in a committed `profiles.yml` that contains no secrets, the `generate_schema_name` macro, and every model and test running on Snowflake. Your Module 8 contract and tests should still pass.
4. **A GitHub Actions workflow** at `.github/workflows/dbt.yml` that runs `dbt build` on every pull request (into a CI schema) and on a daily schedule (into production), using repository secrets.
5. **Evidence of a green run**: a screenshot in the README, or a link to a successful workflow run in your repository's Actions tab.
6. **A short "Running in production" section in your README**: where each environment builds, how to run the project locally (which environment variables to set), and what to do if the morning run fails.

Optional stretch: slim CI with `state:modified+` and `--defer`.

## How to submit

Make sure `main` contains all of the above and that your latest workflow run on `main` is green. Paste the link to your `shoplink-analytics` repository into the submission form, and add a one-line note, for example which DuckDB SQL you had to change, or whether you attempted slim CI.

## Grading guide

| Criterion | Points |
|---|---|
| Snowflake setup is correct, cost-controlled and uses a least-privilege role and service user | 20 |
| Raw data loaded through a stage and COPY INTO, with counts verified | 10 |
| Profile has dev, ci and prod targets, uses env_var() for secrets, and generate_schema_name separates environments | 20 |
| The whole project builds and tests on Snowflake, with dialect issues fixed cleanly | 15 |
| Workflow runs dbt build on pull requests and on a daily schedule with repository secrets, and a green run is shown | 25 |
| README explains environments, local setup and the response to a failed run | 10 |
