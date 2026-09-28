---
module: 6
title: dbt Fundamentals
optional: false
summary: Learn dbt, the tool most analytics engineers use to build, test and document their models. You will set up a dbt project on top of your DuckDB warehouse, declare ShopLink's raw tables as sources, write staging models that fix the planted data problems, rebuild your Module 5 star schema as dbt marts, and protect it with tests and documentation.
---

# Lesson: What dbt is and setting up a project

minutes: 50

## What dbt does

In Module 5 you built ShopLink's star schema with one long SQL script. It worked, but think about what happens next month. A colleague changes the status cleaning in one place and forgets another. Someone runs the fact table before the dimensions and gets missing keys. Nobody remembers which checks to run afterwards. The script has no tests, no documentation and no record of which table depends on which.

dbt (data build tool) fixes this. You write each table as a single `select` statement in its own `.sql` file, called a **model**. dbt then:

- works out the order to build models in, from the references between them;
- wraps each `select` in the right `create table` or `create view` statement for your warehouse;
- runs tests you declare against the results;
- generates a documentation website with a lineage graph of the whole project.

dbt does not move data into the warehouse, and it does not store data itself. It is the "T" in ELT: it sends SQL to a warehouse that already holds your raw data, and the warehouse does the work.

## dbt Core, adapters and dbt-duckdb

There are several ways to run dbt:

| Option | What it is | Used in this course |
|---|---|---|
| dbt Core | Free, open-source command-line tool, installed with pip | Yes |
| dbt platform (formerly dbt Cloud) | dbt Labs' hosted service with a web IDE and scheduler | No (you will see it in job adverts) |
| dbt Fusion | dbt Labs' newer engine, written in Rust | No |

dbt Core talks to each warehouse through an **adapter**, a Python package for that database. `dbt-snowflake` talks to Snowflake, `dbt-bigquery` to BigQuery, and `dbt-duckdb` to DuckDB. Installing `dbt-duckdb` also installs dbt Core. In Module 9 you will switch adapters and run the same project on Snowflake, with almost no changes to your SQL.

This course uses **dbt Core 1.10 or newer**. The YAML examples use the current syntax (`data_tests:` and `arguments:`), which older versions do not understand.

## Install dbt in a virtual environment

A Python **virtual environment** is a private folder of packages for one project, so the versions you install here cannot clash with anything else on your computer. Open a terminal in the root of your `shoplink-analytics` repo, the folder that holds `shoplink.duckdb`.

On Windows (PowerShell):

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install dbt-duckdb
dbt --version
```

If PowerShell refuses to run `Activate.ps1`, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, then try again.

On macOS or Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install dbt-duckdb
dbt --version
```

`dbt --version` should list Core and a `duckdb` plugin. Your prompt now starts with `(.venv)`: you need to activate the environment again each time you open a new terminal.

Two housekeeping steps keep the repo clean. Do both in your code editor rather than with shell redirects, which on older Windows PowerShell can save files in an encoding Git and pip dislike:

1. Open `.gitignore` in the repo root and check it contains `.venv/`, alongside `data/`, `*.duckdb`, `target/`, `dbt_packages/` and `logs/` from Module 2, so your virtual environment, your database, the CSVs and dbt's build output will never be committed.
2. Create `requirements.txt` in the repo root with one line pinning the adapter version that `dbt --version` reported for the duckdb plugin, for example `dbt-duckdb==1.11.0`. A teammate can then run `python -m pip install -r requirements.txt` and get the same setup.

## Create the project

Still in the repo root, run:

```bash
dbt init shoplink_analytics --skip-profile-setup
```

`shoplink_analytics` is the dbt **project name**: dbt project names may only use lower-case letters, digits and underscores, so it cannot have a hyphen like the repo. dbt creates a folder with the same name. Rename the folder to `shoplink_dbt`, so it is obvious in the repo which folder holds the dbt project:

```bash
mv shoplink_analytics shoplink_dbt
```

On Windows PowerShell, `mv` works too, or use `Rename-Item shoplink_analytics shoplink_dbt`. The folder name does not matter to dbt; the name inside `dbt_project.yml` does.

Your repo now looks like this:

```text
shoplink-analytics/
    data/shoplink/          batch 1 CSVs (ignored by Git)
    load/01_load_raw.sql    from Module 3
    shoplink.duckdb         your warehouse (ignored by Git)
    shoplink_dbt/           the dbt project
```

Inside `shoplink_dbt/`:

| Path | Holds |
|---|---|
| `dbt_project.yml` | Project name, folder paths and default configs |
| `models/` | Your models (`.sql`) and their properties (`.yml`) |
| `tests/` | Singular data tests |
| `macros/` | Reusable Jinja functions (Module 7) |
| `snapshots/` | Snapshot definitions (Module 7) |
| `seeds/` | Small CSV files dbt can load, such as lookup lists |
| `analyses/` | SQL you want compiled but not built |
| `.gitignore` | dbt's own ignore list for `target/`, `dbt_packages/` and `logs/` |

Now tidy what `dbt init` generated:

1. Delete the `models/example/` folder.
2. In `dbt_project.yml`, change `profile: 'shoplink_analytics'` to `profile: 'shoplink'`. The profile is the name of the connection settings you create next.
3. Delete the `example:` block at the bottom of `dbt_project.yml`. You will write your own configs there in the materialisations lesson.

## Connect dbt to shoplink.duckdb

dbt reads connection details from a file called `profiles.yml`. It looks in the current folder first, then in a `.dbt` folder in your home directory.

This course keeps `profiles.yml` **inside the dbt project and commits it to Git**. DuckDB needs no password, so there is nothing secret in it, and every teammate gets the same settings when they clone the repo. In Module 9, when you add Snowflake, no secret will be written in the file: the account, user and private key path will be read from environment variables with `{{ env_var('SNOWFLAKE_ACCOUNT') }}` and similar, and the key itself stays outside the repo, so the file stays safe to commit. Never commit a real password or key.

Create `shoplink_dbt/profiles.yml`:

```yaml
shoplink:
  target: duckdb
  outputs:
    duckdb:
      type: duckdb
      path: ../shoplink.duckdb
      schema: analytics
      threads: 4
```

- `shoplink` matches `profile: 'shoplink'` in `dbt_project.yml`.
- `outputs` lists connections, called **targets**. There is one for now, named `duckdb`, and `target: duckdb` makes it the default. Module 9 adds Snowflake targets named `dev`, `ci` and `prod` alongside it.
- `path` is relative to where you run dbt. You will always run dbt from inside `shoplink_dbt/`, and the database file sits one level up in the repo root.
- `schema: analytics` is where dbt builds your models, so they never mix with the `raw` tables.

Now test the connection:

```bash
cd shoplink_dbt
dbt debug
```

The last line should read `All checks passed!`. The most common failure on DuckDB is a lock: DuckDB lets only one process write to a file at a time, so close the DuckDB CLI, DBeaver or any notebook that has `shoplink.duckdb` open, then run `dbt debug` again.

## Resources

- docs: [What is dbt?](https://docs.getdbt.com/docs/introduction) · dbt Labs · The official overview of what dbt does and does not do.
- docs: [Install dbt](https://docs.getdbt.com/docs/local/install-dbt) · dbt Labs · Installing dbt Core with pip in a virtual environment.
- docs: [DuckDB setup](https://docs.getdbt.com/docs/local/connect-data-platform/duckdb-setup) · dbt Labs · The profile settings for the dbt-duckdb adapter.
- docs: [dbt-duckdb](https://github.com/duckdb/dbt-duckdb) · DuckDB on GitHub · The adapter's own README, with every DuckDB-specific option.
- docs: [dbt Developer Hub](https://docs.getdbt.com/) · dbt Labs · Home of all dbt documentation. Bookmark it.
- read: [dbt quickstarts](https://docs.getdbt.com/docs/get-started-dbt) · dbt Labs · Step-by-step starter projects for each warehouse.
- read: [dbt guides](https://docs.getdbt.com/guides) · dbt Labs · Searchable how-to guides for specific tasks, from setup to advanced patterns.
- read: [dbt Learn](https://learn.getdbt.com/) · dbt Labs · Free official courses. "dbt Fundamentals" covers this whole module and is worth doing alongside it.
- watch: [Data Build Tool DBT: The Ultimate Guide With CI/CD](https://www.youtube.com/watch?v=B8uwFmVt4sU) · Ansh Lamba · 154K subscribers · 216.6K views · 3,631 likes · published 2025-08-31 · checked 2026-09-27 · 307 min

## Practice

1. Create the virtual environment, install `dbt-duckdb`, and run `dbt --version`.
2. Run `dbt init shoplink_analytics --skip-profile-setup`, rename the folder to `shoplink_dbt`, remove the example models, set `profile: 'shoplink'`, and create `profiles.yml` as shown.
3. Run `dbt debug` until it passes.
4. On a new branch called `feature/module-6-dbt`, commit the new `shoplink_dbt/` folder (including `profiles.yml`) and `requirements.txt`. Before committing, run `git status` and check that `.venv/`, `shoplink.duckdb` and `shoplink_dbt/target/` are not listed.

## Example answer

A working session on Windows looks like this:

```powershell
cd C:\code\shoplink-analytics
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install dbt-duckdb
dbt --version
dbt init shoplink_analytics --skip-profile-setup
Rename-Item shoplink_analytics shoplink_dbt
Remove-Item -Recurse shoplink_dbt\models\example
# edit shoplink_dbt\dbt_project.yml: profile: 'shoplink', and delete the example: block
# create shoplink_dbt\profiles.yml
cd shoplink_dbt
dbt debug
cd ..
git switch -c feature/module-6-dbt
git add requirements.txt shoplink_dbt
git status
git commit -m "Add dbt project connected to shoplink.duckdb"
```

`dbt debug` ends with `Connection test: [OK connection ok]` and `All checks passed!`, and the output shows `target: duckdb`. `git status` should show files under `shoplink_dbt/` plus `requirements.txt`, and nothing under `.venv/`. If `dbt debug` reports that it cannot find a profile named `shoplink_analytics`, you missed the `profile:` change in `dbt_project.yml`. If it cannot find `profiles.yml` at all, you are probably running it from the repo root instead of from inside `shoplink_dbt/`.

# Lesson: Sources and staging models

minutes: 55

## Declaring sources

Your models should never hard-code `raw.orders`. Instead, you tell dbt once where the raw tables are, in a YAML file, and refer to them by name. Create `models/staging/_sources.yml`:

```yaml
sources:
  - name: shoplink
    description: Raw tables loaded from the ShopLink app extract in Module 3.
    schema: raw
    tables:
      - name: customers
      - name: products
      - name: warehouses
      - name: orders
      - name: order_lines
```

In a model, `{{ source('shoplink', 'orders') }}` then compiles to `"shoplink"."raw"."orders"`. The double curly braces are Jinja, which you will study properly in Module 7; for now, read them as "dbt fills this in".

Declaring sources does three useful things:

- If the raw schema moves, you change one YAML line instead of every model.
- The lineage graph starts from the real raw tables, so you can see which models depend on which source.
- You can attach tests and freshness checks to raw data. Module 8 uses this to warn when ShopLink's extract is late.

## What a staging model does

A staging model is a clean, one-to-one copy of one source table. The rules are strict on purpose:

| Staging models do | Staging models do not |
|---|---|
| Rename columns to a consistent style | Join to other tables |
| Cast columns to the right types | Aggregate |
| Fix formatting: trim spaces, lower-case codes | Apply business rules such as "exclude cancelled orders" |
| Remove exact duplicates | Filter out real rows because the business does not want them |

Everything downstream reads from staging, never from the source. So once `stg_orders` cleans the status column, nobody ever deals with `' Delivered'` again.

Name each one `stg_<table>.sql` and put them all in `models/staging/`.

## stg_orders: fixing status

Batch 1 has 24 different spellings of five statuses, such as `'Delivered'`, `' shipped'` and `'CANCELLED'`. One expression fixes them all. Create `models/staging/stg_orders.sql`:

```sql
with source as (
    select * from {{ source('shoplink', 'orders') }}
),

renamed as (
    select
        order_id,
        customer_id,
        warehouse_id,
        cast(order_date as date)      as order_date,
        lower(trim(status))           as order_status,
        lower(trim(channel))          as channel,
        cast(updated_at as timestamp) as updated_at
    from source
)

select * from renamed
```

The pattern, a `source` CTE followed by a `renamed` CTE, is the dbt Labs style guide's convention. It keeps every staging model looking the same, which makes them quick to review.

## stg_order_lines: removing duplicates

Six rows in `raw.order_lines` are exact copies of other rows. `qualify` (which you met in Module 4) keeps one row per `order_line_id`:

```sql
with source as (
    select * from {{ source('shoplink', 'order_lines') }}
),

deduplicated as (
    -- batch 1 contains exact duplicate rows: keep one copy of each order line
    select *
    from source
    qualify row_number() over (partition by order_line_id order by order_line_id) = 1
),

renamed as (
    select
        order_line_id,
        order_id,
        product_id,
        cast(quantity as integer)           as quantity,
        cast(unit_price as decimal(18, 2))  as unit_price,
        cast(discount_pct as decimal(5, 2)) as discount_pct
    from deduplicated
)

select * from renamed
```

Removing exact duplicates is allowed in staging because they are not real rows: they are copies of the same fact. The 2 lines with a quantity of zero or less are different. They are real rows with a bad value, so staging keeps them, and the decision to exclude them is a business rule that belongs in a later layer.

## stg_customers: tidy text and missing cities

```sql
with source as (
    select * from {{ source('shoplink', 'customers') }}
),

renamed as (
    select
        customer_id,
        trim(customer_name)           as customer_name,
        lower(trim(customer_type))    as customer_type,
        lower(trim(email))            as email,
        nullif(trim(city), '')        as city,
        trim(state)                   as state,
        cast(created_at as timestamp) as created_at,
        cast(updated_at as timestamp) as updated_at
    from source
)

select * from renamed
```

`nullif(trim(city), '')` turns an empty or blank city into a proper `NULL`, so there is only one way for a city to be missing. Staging leaves the 12 missing cities as `NULL`; the dimension decides how to display them.

## Build and look

Run just the staging folder, then preview a model without leaving the terminal:

```bash
dbt run --select staging
dbt show --select stg_orders --limit 5
```

dbt builds each staging model as a view in the `analytics` schema. Check the status fix in DuckDB (close the DuckDB CLI again before your next `dbt run`):

```sql
select order_status, count(*) as orders
from analytics.stg_orders
group by order_status
order by orders desc;
```

You should see exactly five statuses: pending, shipped, delivered, cancelled and returned.

## Resources

- docs: [Add sources to your DAG](https://docs.getdbt.com/docs/build/sources) · dbt Labs · Declaring sources and using `source()`.
- docs: [Staging: preparing our atomic building blocks](https://docs.getdbt.com/best-practices/how-we-structure/2-staging) · dbt Labs · The official conventions for staging models.
- docs: [SQL models](https://docs.getdbt.com/docs/build/sql-models) · dbt Labs · How dbt turns a `select` file into a table or view.
- project: [netflixdbt](https://github.com/kushaljaink/netflixdbt) · GitHub · A small real dbt project with sources, staging, facts and dimensions to compare with yours.

## Practice

1. Create `_sources.yml` and the three staging models from the lesson.
2. Write `stg_products.sql` and `stg_warehouses.sql` yourself, following the same pattern. Cast `unit_cost` and `list_price` to `decimal(18, 2)`, `is_active` to `boolean` and `opened_date` to `date`, and trim the text columns.
3. Run `dbt run --select staging` and check that five views appear in the `analytics` schema.
4. Write one query that proves `stg_order_lines` has no duplicate `order_line_id` values, and one that counts customers with a `NULL` city in `stg_customers`.

## Example answer

`models/staging/stg_products.sql`:

```sql
with source as (
    select * from {{ source('shoplink', 'products') }}
),

renamed as (
    select
        product_id,
        trim(product_name)                 as product_name,
        trim(category)                     as category,
        trim(brand)                        as brand,
        cast(unit_cost as decimal(18, 2))  as unit_cost,
        cast(list_price as decimal(18, 2)) as list_price,
        cast(is_active as boolean)         as is_active
    from source
)

select * from renamed
```

`models/staging/stg_warehouses.sql`:

```sql
with source as (
    select * from {{ source('shoplink', 'warehouses') }}
),

renamed as (
    select
        warehouse_id,
        trim(warehouse_name)      as warehouse_name,
        trim(city)                as city,
        trim(state)               as state,
        cast(opened_date as date) as opened_date
    from source
)

select * from renamed
```

Checks:

```sql
select count(*) as all_rows, count(distinct order_line_id) as distinct_ids
from analytics.stg_order_lines;
-- 26773 and 26773

select count(*) as customers_without_city
from analytics.stg_customers
where city is null;
-- 12
```

If your staging views show 26,779 rows, the `qualify` is missing or partitioned by the wrong column.

# Lesson: ref() and the DAG

minutes: 45

## ref() connects models

Models read from sources with `source()`, and from other models with `ref()`:

```sql
select * from {{ ref('stg_orders') }}
```

`ref('stg_orders')` compiles to `"shoplink"."analytics"."stg_orders"`. More importantly, it tells dbt that this model depends on `stg_orders`, so `stg_orders` must be built first. You never write build order yourself: dbt reads every `ref()` and `source()` and works it out.

The result is a **DAG**, a directed acyclic graph. "Directed" because each arrow points from a model to the models that use it; "acyclic" because there are no loops: a model can never depend on itself, however indirectly. If you create a loop, dbt refuses to run and tells you which models are involved.

## The layers in ShopLink's project

You met the three layers in Module 1. Now they become folders:

| Folder | Models | Reads from |
|---|---|---|
| `models/staging/` | `stg_customers`, `stg_products`, `stg_warehouses`, `stg_orders`, `stg_order_lines` | `source()` only |
| `models/intermediate/` | `int_order_lines_enriched` | Staging models |
| `models/marts/` | `dim_customer`, `dim_product`, `dim_warehouse`, `dim_date`, `fct_order_lines` | Staging and intermediate models |

Only staging models call `source()`. Marts never do. If you find yourself writing `source()` in a mart, you are skipping the cleaning, and the planted problems come straight back.

## An intermediate model

The fact table needs order-level columns (customer, warehouse, date, status) on every line, plus the revenue calculation. That joining and calculating is a reusable building block, so it goes in its own intermediate model. Create `models/intermediate/int_order_lines_enriched.sql`:

```sql
with order_lines as (
    select * from {{ ref('stg_order_lines') }}
),

orders as (
    select * from {{ ref('stg_orders') }}
)

select
    order_lines.order_line_id,
    order_lines.order_id,
    orders.customer_id,
    order_lines.product_id,
    orders.warehouse_id,
    orders.order_date,
    orders.order_status,
    orders.channel,
    orders.updated_at as order_updated_at,
    order_lines.quantity,
    order_lines.unit_price,
    order_lines.discount_pct,
    order_lines.quantity * order_lines.unit_price as gross_amount,
    order_lines.quantity * order_lines.unit_price
        * (1 - order_lines.discount_pct / 100.0) as net_amount,
    case
        when orders.order_status in ('cancelled', 'returned') then 0
        else order_lines.quantity * order_lines.unit_price
            * (1 - order_lines.discount_pct / 100.0)
    end as net_revenue
from order_lines
inner join orders
    on order_lines.order_id = orders.order_id
where order_lines.quantity > 0
```

This is where the business rules from your Module 5 design live: lines with a quantity of zero or less are excluded, and cancelled and returned orders earn no net revenue.

## The marts

The marts are your Module 5 tables, rewritten as dbt models. Each dimension reads from staging with `ref()`. Here is `models/marts/dim_product.sql`:

```sql
with products as (
    select * from {{ ref('stg_products') }}
)

select
    md5(cast(product_id as varchar)) as product_key,
    product_id,
    product_name,
    category,
    brand,
    unit_cost,
    list_price,
    is_active
from products

union all

select md5('unknown'), null, 'Unknown product', 'Unknown', 'Unknown', null, null, null
```

And `models/marts/fct_order_lines.sql`, which uses the point-in-time join from Module 5:

```sql
with order_lines as (
    select * from {{ ref('int_order_lines_enriched') }}
),

customers as (
    select * from {{ ref('dim_customer') }}
),

products as (
    select * from {{ ref('dim_product') }}
),

warehouses as (
    select * from {{ ref('dim_warehouse') }}
)

select
    order_lines.order_line_id,
    order_lines.order_id,
    cast(strftime(order_lines.order_date, '%Y%m%d') as integer) as date_key,
    coalesce(customers.customer_key, md5('unknown'))           as customer_key,
    coalesce(products.product_key, md5('unknown'))             as product_key,
    coalesce(warehouses.warehouse_key, md5('unknown'))         as warehouse_key,
    order_lines.order_status,
    order_lines.channel,
    order_lines.quantity,
    order_lines.unit_price,
    order_lines.discount_pct,
    order_lines.gross_amount,
    order_lines.net_amount,
    order_lines.net_revenue,
    order_lines.order_updated_at
from order_lines
left join customers
    on order_lines.customer_id = customers.customer_id
   and order_lines.order_date >= customers.valid_from
   and order_lines.order_date < customers.valid_to
left join products
    on order_lines.product_id = products.product_id
left join warehouses
    on order_lines.warehouse_id = warehouses.warehouse_id
```

`order_updated_at` is carried onto the fact now because Module 7 will use it to load only changed orders.

## Running parts of the DAG

`dbt run` builds every model. As the project grows you will usually want part of it, using **selectors**:

| Command | Builds |
|---|---|
| `dbt run` | Everything |
| `dbt run --select fct_order_lines` | Just that model |
| `dbt run --select +fct_order_lines` | The model and everything upstream of it |
| `dbt run --select stg_orders+` | The model and everything downstream of it |
| `dbt run --select staging` | Every model in the `models/staging/` folder |
| `dbt ls --select +fct_order_lines` | Lists what would be selected, without running anything |

`stg_orders+` is the one you will use most. After changing a staging model, it rebuilds that model and every model that could be affected, and nothing else.

## Seeing the DAG

dbt can draw the graph for you:

```bash
dbt docs generate
dbt docs serve
```

A browser tab opens on the project's documentation site. Click the round lineage button at the bottom right to see the DAG: sources in green on the left, then staging, intermediate and marts flowing to the right. Press Ctrl+C in the terminal to stop the server. The docs lesson later in this module fills the site with descriptions.

## Resources

- docs: [ref](https://docs.getdbt.com/reference/dbt-jinja-functions/ref) · dbt Labs · What `ref()` does and how it resolves.
- docs: [Graph operators](https://docs.getdbt.com/reference/node-selection/graph-operators) · dbt Labs · The `+` selectors and more.
- docs: [Syntax overview](https://docs.getdbt.com/reference/node-selection/syntax) · dbt Labs · Every way to select models, including by folder, tag and test type.
- docs: [Intermediate: purpose-built transformation steps](https://docs.getdbt.com/best-practices/how-we-structure/3-intermediate) · dbt Labs · When a model belongs in the intermediate layer.
- docs: [Marts: business-defined entities](https://docs.getdbt.com/best-practices/how-we-structure/4-marts) · dbt Labs · How dbt Labs shapes the final layer.
- read: [awesome-dbt](https://github.com/Hiflylabs/awesome-dbt) · Hiflylabs on GitHub · A curated list of dbt articles, packages and example projects for when you want more.

## Practice

1. Create `int_order_lines_enriched`, `dim_product` and `fct_order_lines` from the lesson.
2. Write `dim_warehouse`, `dim_customer` and `dim_date` yourself, as dbt models reading from staging with `ref()`. Reuse your Module 5 SQL: the logic is the same, only the `from` clauses change.
3. Run `dbt ls --select +fct_order_lines` and write down how many models it lists and why `dim_date` is not among them.
4. Run `dbt run`, then compare `analytics.fct_order_lines` with your Module 5 `star.fct_order_lines`: row count and total net revenue for 2025 should match.

## Example answer

`models/marts/dim_customer.sql`:

```sql
with customers as (
    select * from {{ ref('stg_customers') }}
),

versions as (
    select
        md5(cast(customer_id as varchar) || '|1900-01-01') as customer_key,
        customer_id,
        customer_name,
        customer_type,
        coalesce(city, 'Unknown') as city,
        state,
        timestamp '1900-01-01'    as valid_from,
        timestamp '9999-12-31'    as valid_to,
        true                      as is_current
    from customers
),

unknown_member as (
    select
        md5('unknown')            as customer_key,
        null                      as customer_id,
        'Unknown customer'        as customer_name,
        'unknown'                 as customer_type,
        'Unknown'                 as city,
        'Unknown'                 as state,
        timestamp '1900-01-01'    as valid_from,
        timestamp '9999-12-31'    as valid_to,
        true                      as is_current
)

select * from versions
union all
select * from unknown_member
```

`dim_warehouse` follows the `dim_product` pattern with `md5(cast(warehouse_id as varchar))`, and `dim_date` is the Module 5 `range()` query unchanged, since it reads no tables at all.

`dbt ls --select +fct_order_lines` lists 15 resources, the 5 sources plus 10 models: the fact, three dimensions, the intermediate model and five staging models. Sources appear as `source:shoplink_analytics.shoplink.orders` and so on. `dim_date` is missing because `fct_order_lines` does not `ref()` it: the fact computes `date_key` from the order date itself. The two tables still join perfectly, and a relationships test in the testing lesson will prove it.

The comparison:

```sql
select 'module 5' as source, count(*) as lines, sum(net_revenue) as net_revenue
from star.fct_order_lines
union all
select 'dbt', count(*), sum(net_revenue)
from analytics.fct_order_lines;
```

Both rows should show 26,771 lines and the same net revenue, about ₦373.7 billion across the whole of batch 1.

# Lesson: Materialisations

minutes: 40

## What a materialisation is

Every model is a `select` statement. The **materialisation** decides what dbt builds from it in the warehouse:

| Materialisation | What dbt creates | Good for | Watch out for |
|---|---|---|---|
| `view` | A view: the query runs every time someone reads it | Staging models; anything light | Slow if the query is heavy and read often |
| `table` | A table, dropped and rebuilt on every run | Marts that people and BI tools query | Rebuild time grows with data size |
| `ephemeral` | Nothing: the SQL is pasted into downstream models as a CTE | Small intermediate steps nobody queries directly | You cannot query it or test it on its own in the warehouse |
| `incremental` | A table that only processes new or changed rows on each run | Large facts | More logic to get right; taught in Module 7 |

A fifth type, the **snapshot**, records history and is covered with incremental models in Module 7.

## Setting defaults per folder

Rather than configure every model, set a default per folder in `dbt_project.yml`. Replace the `models:` block with:

```yaml
models:
  shoplink_analytics:
    staging:
      +materialized: view
    intermediate:
      +materialized: ephemeral
    marts:
      +materialized: table
```

`shoplink_analytics` is the project name from `dbt_project.yml`, and the keys below it are folder names inside `models/`. The `+` means "this is a config, applied to everything in this folder and below".

## Overriding one model

A `config()` block at the top of a model file overrides the folder default for that one model:

```sql
{{ config(materialized='view') }}

with days as (
    select cast(d as date) as full_date
    from range(date '2024-01-01', date '2027-01-01', interval 1 day) as t(d)
)

select ...
```

The most specific setting wins: a `config()` in the file beats a setting in a `.yml` properties file, which beats the folder default in `dbt_project.yml`. Keep most settings at folder level and override only when there is a reason. Reviewers can then understand the whole project from `dbt_project.yml`.

## Seeing what dbt built

After `dbt run`, ask DuckDB what exists in the `analytics` schema:

```sql
select table_name, table_type
from information_schema.tables
where table_schema = 'analytics'
order by table_name;
```

You should see 5 staging views (`VIEW`) and 5 marts tables (`BASE TABLE`). `int_order_lines_enriched` is not there at all, because it is ephemeral. Open `target/compiled/shoplink_analytics/models/marts/fct_order_lines.sql` in your editor: the intermediate model's SQL appears inside it, as a CTE named `__dbt__cte__int_order_lines_enriched`.

## Choosing for ShopLink

| Model | Choice | Why |
|---|---|---|
| Staging | View | Light cleaning over small tables; always shows the latest raw data |
| `int_order_lines_enriched` | Ephemeral | Only the fact reads it, and nobody needs to query it on its own |
| Dimensions and `dim_date` | Table | Read constantly by the fact and by analysts |
| `fct_order_lines` | Table for now | Incremental in Module 7, once batch 2 gives it new rows to process |

Ephemeral models have a cost: when something looks wrong, you cannot simply `select * from` them to investigate. If an intermediate model becomes important or complex, switch it to a view. Views cost almost nothing in DuckDB.

## Resources

- docs: [Materializations](https://docs.getdbt.com/docs/build/materializations) · dbt Labs · Every materialisation with its trade-offs.
- docs: [Model configurations](https://docs.getdbt.com/reference/model-configs) · dbt Labs · Where configs can be set and which setting wins.
- docs: [How we structure our dbt projects](https://docs.getdbt.com/best-practices/how-we-structure/1-guide-overview) · dbt Labs · Recommended materialisations per layer.

## Practice

1. Add the folder defaults to `dbt_project.yml` and run `dbt run`.
2. Run the `information_schema` query and confirm which models are views, which are tables, and that the intermediate model is missing.
3. Find the ephemeral CTE inside the compiled `fct_order_lines.sql` in `target/compiled/`.
4. Temporarily add `{{ config(materialized='view') }}` to `dim_date.sql`, run `dbt run --select dim_date`, and check the `information_schema` again. Then remove the config and rebuild. Write one sentence on why a table is the better choice for `dim_date`.

## Example answer

After step 1, `dbt run` reports `5 table models` and `5 view models`, and the `information_schema` query returns `dim_customer`, `dim_date`, `dim_product`, `dim_warehouse` and `fct_order_lines` as `BASE TABLE`, and the five `stg_` models as `VIEW`.

The compiled fact starts like this (names shortened):

```sql
with __dbt__cte__int_order_lines_enriched as (
with order_lines as (
    select * from "shoplink"."analytics"."stg_order_lines"
),
...
```

After step 4, `dim_date` shows as `VIEW`. A table is better because the calendar never changes between runs, yet every query that joins to it would regenerate 1,096 rows from `range()` if it were a view. Building it once as a table is cheaper and makes it faster to join.

# Lesson: Tests and documentation

minutes: 55

## Data tests

A **data test** is a query that looks for rows that should not exist. If the query returns zero rows, the test passes. If it returns any rows, the test fails, and dbt tells you how many.

dbt has two kinds:

- **Generic tests** are reusable and declared in YAML against a column. dbt ships four.
- **Singular tests** are one-off SQL files in the `tests/` folder.

## The four built-in generic tests

| Test | Fails when | ShopLink use |
|---|---|---|
| `unique` | A value appears more than once | `order_line_id` in the fact; every surrogate key |
| `not_null` | A value is `NULL` | Every key |
| `accepted_values` | A value is not in your list | `order_status`, `customer_type` |
| `relationships` | A value has no match in another model | Every fact foreign key must exist in its dimension |

Declare them in a properties file next to the models. Create `models/staging/_stg_models.yml`:

```yaml
models:
  - name: stg_orders
    description: One row per ShopLink order, with status and channel cleaned.
    columns:
      - name: order_id
        data_tests:
          - unique
          - not_null
      - name: order_status
        data_tests:
          - accepted_values:
              arguments:
                values: ['pending', 'shipped', 'delivered', 'cancelled', 'returned']
      - name: customer_id
        data_tests:
          - relationships:
              arguments:
                to: ref('stg_customers')
                field: customer_id
              config:
                severity: warn

  - name: stg_order_lines
    columns:
      - name: order_line_id
        data_tests:
          - unique
          - not_null
```

Two details:

- Test inputs such as `values`, `to` and `field` go under `arguments:`. Older tutorials put them directly under the test name; dbt 1.10 and newer still run that, but print a deprecation warning. Tutorials written before dbt 1.8 also use `tests:` where this course uses `data_tests:`.
- The `customer_id` relationships test has `severity: warn`. You already know batch 1 has 3 orphan orders, and the marts handle them with an unknown member. A warning keeps them visible on every run without blocking the build. Module 7 covers severity and thresholds in more depth.

## Singular tests

When a rule does not fit a generic test, write the query yourself. Create `tests/assert_net_revenue_not_above_gross.sql`:

```sql
-- Net revenue can never be more than the gross amount of the line.
-- The test fails if this query returns any rows.
select
    order_line_id,
    gross_amount,
    net_revenue
from {{ ref('fct_order_lines') }}
where net_revenue > gross_amount
```

## dbt test and dbt build

```bash
dbt test                            # run every test
dbt test --select fct_order_lines   # tests on one model
dbt build                           # run and test everything, in DAG order
```

`dbt build` is what you will use day to day. For each model it builds the model, runs that model's tests, and only then moves downstream. If a test on `stg_orders` fails, dbt skips every model that depends on `stg_orders`, so a broken staging model can never quietly feed bad data into the marts.

You can also test sources directly. Add this to the `orders` table in `_sources.yml` and run `dbt test --select source:shoplink`:

```yaml
      - name: orders
        columns:
          - name: status
            data_tests:
              - accepted_values:
                  arguments:
                    values: ['pending', 'shipped', 'delivered', 'cancelled', 'returned']
```

It fails, because the raw column has 24 spellings. That is the point: the same test passes on `stg_orders`, which proves the staging model fixed the problem. Remove the source test again afterwards, or set its severity to `warn`.

## Documentation

Descriptions live in the same YAML files as tests:

```yaml
models:
  - name: fct_order_lines
    description: >
      One row per order line on a ShopLink order. Lines with a quantity of zero
      or less are excluded. Net revenue is zero for cancelled and returned orders.
    columns:
      - name: order_line_id
        description: Natural key of the order line, from the app database.
        data_tests:
          - unique
          - not_null
      - name: customer_key
        description: Surrogate key of the customer version valid on the order date.
        data_tests:
          - not_null
          - relationships:
              arguments:
                to: ref('dim_customer')
                field: customer_key
      - name: net_revenue
        description: quantity * unit_price * (1 - discount_pct / 100), or 0 for cancelled and returned orders.
```

Then generate and open the site:

```bash
dbt docs generate
dbt docs serve
```

Each model's page now shows its description, its columns with descriptions and tests, the compiled SQL and the lineage graph. This is the page you send to an analyst who asks "which table should I use for revenue, and what is excluded?"

Write descriptions for what a reader cannot guess from the name. "The order ID" adds nothing; "Natural key from the app database; also used to count orders" does.

## Resources

- docs: [Add data tests to your DAG](https://docs.getdbt.com/docs/build/data-tests) · dbt Labs · Generic and singular tests, with the full YAML syntax.
- docs: [dbt build](https://docs.getdbt.com/reference/commands/build) · dbt Labs · How build interleaves runs and tests, and what gets skipped on failure.
- docs: [Documentation](https://docs.getdbt.com/docs/build/documentation) · dbt Labs · Descriptions, doc blocks and the docs site.
- docs: [dbt docs commands](https://docs.getdbt.com/reference/commands/cmd-docs) · dbt Labs · `docs generate` and `docs serve` options.
- watch: [How to implement testing in data build tool (dbt): Tutorial for beginners](https://www.youtube.com/watch?v=f6snuMeZWS0) · Mastering Snowflake · 11.5K subscribers · 14.5K views · 145 likes · published 2022-05-10 · checked 2026-09-27 · 16 min

## Practice

1. Complete `_stg_models.yml` so every staging model has `unique` and `not_null` on its primary key, `accepted_values` on `order_status` and `customer_type`, and a `relationships` test from `stg_order_lines.order_id` to `stg_orders`.
2. Create `models/marts/_marts.yml` with a description for every mart, `unique` and `not_null` on every surrogate key and on `fct_order_lines.order_line_id`, and a `relationships` test from each of the fact's four keys (`date_key`, `customer_key`, `product_key`, `warehouse_key`) to its dimension.
3. Add the singular test from the lesson.
4. Run `dbt build`. Note the final summary line, and explain the one warning.

## Example answer

The relationships tests from the fact to its dimensions, in `_marts.yml`:

```yaml
      - name: date_key
        description: Order date as an integer (YYYYMMDD). Joins to dim_date.
        data_tests:
          - not_null
          - relationships:
              arguments:
                to: ref('dim_date')
                field: date_key
      - name: product_key
        data_tests:
          - not_null
          - relationships:
              arguments:
                to: ref('dim_product')
                field: product_key
      - name: warehouse_key
        data_tests:
          - not_null
          - relationships:
              arguments:
                to: ref('dim_warehouse')
                field: warehouse_key
```

With the tests described here, a complete run ends with a line like:

```text
Done. PASS=43 WARN=1 ERROR=0 SKIP=0 NO-OP=0 REUSED=0 TOTAL=44
```

Your counts will differ slightly if you added more or fewer tests; what matters is `ERROR=0`. The warning is the `relationships` test on `stg_orders.customer_id`: it finds 3 orders whose customer does not exist (customer IDs 9001, 9002 and 9003). That is expected. The fact sends their 8 lines to the unknown customer, and the `customer_key` relationships test on the fact passes because the unknown member row exists in `dim_customer`.

# Quiz

passing_score: 70

### What does dbt do when you run dbt run?

- [ ] Copies raw data from ShopLink's app into DuckDB
- [x] Compiles each model's select statement and runs it in the warehouse as a view or table, in dependency order
- [ ] Builds dashboards from your marts
- [ ] Stores a copy of your data in dbt's own database

> dbt is the transformation layer. It sends SQL to a warehouse that already holds the raw data; it does not ingest or store data itself.

### Which of these belongs in a staging model?

- [ ] Joining orders to customers to add the customer's state
- [ ] Excluding cancelled orders from revenue
- [x] Turning ' Delivered' and 'DELIVERED' into 'delivered'
- [ ] Summing net revenue by month

> Staging models clean one source table: renaming, casting and fixing formats. Joins, aggregations and business rules belong in intermediate models and marts.

### You change stg_orders. Which command rebuilds it and everything that depends on it, and nothing else?

- [ ] dbt run --select +stg_orders
- [x] dbt run --select stg_orders+
- [ ] dbt run --select staging
- [ ] dbt run

> A + after the model name selects it and everything downstream. A + before it selects everything upstream.

### int_order_lines_enriched is materialised as ephemeral. What does that mean?

- [ ] dbt builds it as a temporary table and drops it at the end of the run
- [ ] dbt builds it only on the first run
- [x] dbt builds nothing for it; its SQL is inserted as a CTE into the models that ref() it
- [ ] dbt builds it as a view in a hidden schema

> An ephemeral model never exists in the warehouse. You can find its SQL inside the compiled code of downstream models.

### A test on stg_orders fails during dbt build. What happens to fct_order_lines?

- [ ] It is built anyway and the failure is reported at the end
- [x] It is skipped, because it depends on a model whose test failed
- [ ] It is rebuilt from the previous day's data
- [ ] dbt deletes it

> dbt build runs tests straight after each model and skips everything downstream of a failure, so bad data cannot flow into the marts.

# Project: ShopLink dbt project

max_score: 100

## Brief

Replace your hand-written Module 5 script with a dbt project that anyone on the ShopLink data team can clone, run and trust. The project must rebuild your star schema from the `raw` schema, fix every planted problem in the staging layer, and prove its own correctness with tests.

## Deliverables

On your `feature/module-6-dbt` branch in `shoplink-analytics`:

1. **A working dbt project in `shoplink_dbt/`**, named `shoplink_analytics` in `dbt_project.yml`, with a committed `profiles.yml` (profile `shoplink`, target `duckdb`) pointing at `shoplink.duckdb`, `requirements.txt` in the repo root, and `.venv/`, `target/` and `shoplink.duckdb` not committed.
2. **Sources and staging.** `_sources.yml` declaring all five raw tables, and one staging model per source (`stg_customers`, `stg_products`, `stg_warehouses`, `stg_orders`, `stg_order_lines`) that renames, casts, trims and lower-cases where needed, and removes the duplicate order lines.
3. **Intermediate and marts.** `int_order_lines_enriched`, and your Module 5 star schema as marts: `fct_order_lines`, `dim_customer` (with the SCD Type 2 columns and an unknown member), `dim_product`, `dim_warehouse` and `dim_date`, all using `ref()`.
4. **Materialisations** set per folder in `dbt_project.yml`.
5. **Tests.** At minimum: `unique` and `not_null` on every primary and surrogate key; `accepted_values` on `order_status` and `customer_type`; `relationships` from each of the fact's four keys to its dimension; and at least one singular test of your own. `dbt build` must finish with `ERROR=0`.
6. **Documentation.** A description for every mart model and every fact column.
7. **A `shoplink_dbt/README.md`** with the commands to set up and run the project, and a screenshot of the lineage graph from `dbt docs serve`.

## How to submit

Push the branch and open a pull request into `main` titled "Module 6: ShopLink dbt project". In the description, paste the final summary line of `dbt build` and list any warnings with a sentence explaining each. Paste the pull request link into the submission form.

## Grading guide

| Criterion | Points |
|---|---|
| Project runs from a fresh clone using the README; profile and .gitignore are correct | 15 |
| Sources declared and all five staging models follow staging rules and fix the planted problems | 20 |
| Marts reproduce the Module 5 star schema correctly using ref(), with unknown members and SCD2 columns | 25 |
| Materialisations are set per folder and justified | 10 |
| Tests cover keys, statuses and fact-to-dimension relationships, and dbt build passes | 20 |
| Documentation describes every mart and fact column clearly | 10 |
