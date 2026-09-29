---
module: 7
title: Advanced dbt
optional: false
summary: Take your ShopLink dbt project from working to production-ready. You will write Jinja and macros so logic lives in one place, install dbt_utils, capture customer history with snapshots, load ShopLink's second data batch and process it with an incremental fact table, and add custom tests, thresholds and unit tests.
---

# Lesson: Jinja

minutes: 45

## SQL that writes SQL

Every `{{ ref() }}` and `{{ source() }}` you wrote in Module 6 was Jinja, a templating language from the Python world. Before dbt sends a model to DuckDB, it **compiles** it: it runs the Jinja and produces plain SQL. DuckDB never sees a curly brace.

That compile step lets you use variables, loops and conditions to generate SQL, which is how you avoid copying the same expression into ten models.

Jinja has three kinds of tag:

| Tag | Does | Example |
|---|---|---|
| `{{ ... }}` | Prints the value of an expression into the SQL | `{{ ref('stg_orders') }}` |
| `{% ... %}` | Runs a statement: `set`, `for`, `if`, `macro` | `{% for status in statuses %}` |
| `{# ... #}` | A comment that is removed at compile time | `{# TODO: add channel #}` |

## Variables with set

`set` creates a variable you can reuse in the model:

```sql
{% set revenue_statuses = ['pending', 'shipped', 'delivered'] %}

select count(*) as revenue_orders
from {{ ref('stg_orders') }}
where order_status in ('{{ revenue_statuses | join("', '") }}')
```

`| join("', '")` is a Jinja **filter**: it glues the list into one string, so the last line compiles to `where order_status in ('pending', 'shipped', 'delivered')`.

## Loops

Leadership wants a monthly table with one column per order status. Written by hand, that is five nearly identical lines, and a sixth status would mean editing the model. A `for` loop generates them. Create `models/marts/orders_by_status_monthly.sql`:

```sql
{%- set statuses = ['pending', 'shipped', 'delivered', 'cancelled', 'returned'] -%}

select
    date_trunc('month', order_date) as order_month,
    {%- for status in statuses %}
    count(*) filter (where order_status = '{{ status }}') as {{ status }}_orders
    {%- if not loop.last %},{% endif %}
    {%- endfor %}
from {{ ref('stg_orders') }}
group by 1
order by 1
```

Two things to notice:

- `loop.last` is `true` on the final pass, so `{% if not loop.last %},{% endif %}` puts a comma after every column except the last. Trailing commas are the most common Jinja loop bug.
- `count(*) filter (where ...)` is DuckDB's tidy way to count only matching rows. It gives the same result as `sum(case when ... then 1 else 0 end)`.

## Conditions and target

`if` lets a model behave differently in different situations. dbt exposes the current connection as `target`, so `target.name` is `duckdb` for the profile you set up in Module 6. A common use is to process less data everywhere except production:

```sql
select ...
from {{ ref('stg_orders') }}
{% if target.name != 'prod' -%}
where order_date >= date '2026-01-01'
{%- endif %}
```

On your `duckdb` target the filter is included. In Module 9 you will add Snowflake targets named `dev` and `prod`; only on `prod` does the filter disappear.

## Project variables

A value you might want to change from the command line belongs in a **project variable**. Declare a default in `dbt_project.yml`:

```yaml
vars:
  report_start_date: '2024-01-01'
```

Read it in a model with `var()`:

```sql
where order_date >= date '{{ var("report_start_date") }}'
```

And override it for a single run:

```bash
dbt run --select orders_by_status_monthly --vars '{report_start_date: "2026-01-01"}'
```

On Windows PowerShell, keep the single quotes around the braces exactly as shown.

## Whitespace control

Jinja tags leave blank lines behind in the compiled SQL. A minus sign inside a tag, `{%-` or `-%}`, removes the whitespace on that side. It changes nothing about how the SQL runs, but it makes compiled code much easier to read and debug, which is why the loop above uses `{%- ... %}`.

## Reading the compiled SQL

When a Jinja model misbehaves, read what dbt actually sent:

```bash
dbt compile --select orders_by_status_monthly
```

The result is in `target/compiled/shoplink_analytics/models/marts/orders_by_status_monthly.sql`. For the loop above it looks like this:

```sql
select
    date_trunc('month', order_date) as order_month,
    count(*) filter (where order_status = 'pending') as pending_orders,
    count(*) filter (where order_status = 'shipped') as shipped_orders,
    count(*) filter (where order_status = 'delivered') as delivered_orders,
    count(*) filter (where order_status = 'cancelled') as cancelled_orders,
    count(*) filter (where order_status = 'returned') as returned_orders
from "shoplink"."analytics"."stg_orders"
group by 1
order by 1
```

`target/run/` holds the same SQL wrapped in the `create` statement dbt executed. You can paste compiled SQL straight into the DuckDB CLI to debug it, and `dbt show --select orders_by_status_monthly` previews the result without building anything.

## Resources

- docs: [Jinja and macros](https://docs.getdbt.com/docs/build/jinja-macros) · dbt Labs · How dbt uses Jinja, with examples.
- docs: [dbt Jinja functions](https://docs.getdbt.com/reference/dbt-jinja-functions) · dbt Labs · Everything dbt adds to Jinja: `ref`, `source`, `var`, `target`, `this` and more.
- docs: [Template Designer Documentation](https://jinja.palletsprojects.com/en/stable/templates/) · Pallets Projects · The full Jinja language reference, including every filter and loop variable.
- watch: [How to Use Jinja w/ dbt Macros (3 Examples)](https://www.youtube.com/watch?v=dXSQHvyOh58) · Kahan Data Solutions · 60.2K subscribers · 10.8K views · 158 likes · published 2024-05-22 · checked 2026-09-27 · 12 min

## Practice

1. Create a branch `feature/module-7-advanced-dbt` and add `orders_by_status_monthly` from the lesson. Run `dbt compile --select orders_by_status_monthly` and read the compiled file.
2. Write a new model, `revenue_by_channel_monthly`, that reads `fct_order_lines`, joins to `dim_date` for `year_month`, and uses a Jinja loop over `['web', 'whatsapp', 'sales_rep']` to produce one net revenue column per channel.
3. Break it on purpose: remove the `{% if not loop.last %}` guard, compile, and note the error DuckDB gives when you run it. Then put it back.

## Example answer

`models/marts/revenue_by_channel_monthly.sql`:

```sql
{%- set channels = ['web', 'whatsapp', 'sales_rep'] -%}

select
    d.year_month,
    {%- for channel in channels %}
    sum(case when f.channel = '{{ channel }}' then f.net_revenue else 0 end)
        as {{ channel }}_net_revenue
    {%- if not loop.last %},{% endif %}
    {%- endfor %}
from {{ ref('fct_order_lines') }} as f
inner join {{ ref('dim_date') }} as d
    on f.date_key = d.date_key
group by 1
order by 1
```

Without the guard, the compiled SQL has a comma after `sales_rep_net_revenue` and before `from`, and DuckDB reports a parser error near `from`. `dbt compile` itself succeeds, because the Jinja is valid; only the SQL it produces is wrong. That is why reading the compiled file is the first debugging step.

# Lesson: Macros and packages

minutes: 50

## Writing a macro

A **macro** is a Jinja function that returns SQL. ShopLink's net revenue formula currently lives in `int_order_lines_enriched`. If another model ever needs it, say a future `fct_returns`, someone will copy it, and one day the copies will drift apart. Put it in a macro instead. Create `macros/net_revenue.sql`:

```sql
{% macro net_amount(quantity, unit_price, discount_pct) -%}
    ({{ quantity }} * {{ unit_price }} * (1 - {{ discount_pct }} / 100.0))
{%- endmacro %}


{% macro net_revenue(quantity, unit_price, discount_pct, status) -%}
    case
        when {{ status }} in ('cancelled', 'returned') then 0
        else {{ net_amount(quantity, unit_price, discount_pct) }}
    end
{%- endmacro %}
```

The arguments are **column names as strings**. The macro pastes them into the SQL it returns, so `net_revenue` calls `net_amount` and wraps it in the business rule. The definition of ShopLink's net revenue now exists in exactly one place.

Use them in `int_order_lines_enriched`, replacing the two hand-written expressions:

```sql
    {{ net_amount('order_lines.quantity', 'order_lines.unit_price', 'order_lines.discount_pct') }} as net_amount,
    {{ net_revenue('order_lines.quantity', 'order_lines.unit_price', 'order_lines.discount_pct', 'orders.order_status') }} as net_revenue
```

Run `dbt build`. Nothing in the output should change: the compiled SQL is the same, only its source is tidier.

## Currency helpers

Money needs care. ShopLink stores whole naira, but payment providers such as Paystack send amounts in **kobo** (1 naira = 100 kobo), and rounding a floating-point number in two different places can give two different answers. Small helpers keep it consistent. Create `macros/currency.sql`:

```sql
{% macro naira_to_kobo(column_name) -%}
    cast(round({{ column_name }} * 100) as bigint)
{%- endmacro %}


{% macro kobo_to_naira(column_name, scale=2) -%}
    round({{ column_name }} / 100.0, {{ scale }})
{%- endmacro %}
```

`scale=2` is a default argument: `{{ kobo_to_naira('amount_kobo') }}` rounds to 2 decimal places, and `{{ kobo_to_naira('amount_kobo', 0) }}` rounds to whole naira. Try a macro without building a model:

```bash
dbt show --inline "select {{ naira_to_kobo('1234.56') }} as kobo, {{ kobo_to_naira('123456') }} as naira"
```

## Packages and dbt_utils

You do not have to write every macro yourself. **Packages** are dbt projects other people publish so you can reuse their macros and tests. The most widely used is `dbt_utils`, maintained by dbt Labs.

Create `shoplink_dbt/packages.yml`, next to `dbt_project.yml`:

```yaml
packages:
  - package: dbt-labs/dbt_utils
    version: [">=1.3.0", "<2.0.0"]
```

Then install it:

```bash
dbt deps
```

dbt downloads the package into `dbt_packages/`, which `.gitignore` already excludes. Commit `packages.yml`, and also the `package-lock.yml` that `dbt deps` writes, so everyone installs the same version. Run `dbt deps` again whenever you clone the repo or change `packages.yml`.

On Windows, if `dbt deps` fails with a "No such file or directory" error on a long file name inside `dbt_packages`, your repo path is too long for Windows' default 260-character limit. Move the repo to a short path such as `C:\code\shoplink-analytics`, or ask your IT team to enable long paths.

## generate_surrogate_key

`dbt_utils.generate_surrogate_key` replaces your hand-written `md5(... || '|' || ...)`. It casts every column to text, replaces `NULL` with a placeholder so a missing value can never make the whole key `NULL`, joins the values with a separator and hashes the result:

```sql
select
    {{ dbt_utils.generate_surrogate_key(['product_id']) }} as product_key,
    product_id,
    ...
```

Update `dim_product` and `dim_warehouse` to use it. You will update `dim_customer` in the snapshots lesson, where its key becomes `generate_surrogate_key(['customer_id', 'valid_from'])`. Keep the unknown member key as `md5('unknown')` in every dimension and in the fact's `coalesce()`, so it stays the same everywhere.

For a single non-null column the macro produces exactly the same hash as `md5(cast(product_id as varchar))`, so product and warehouse keys do not change. The customer key does change, because the macro uses a different separator and formats `valid_from` in full. That is fine while `fct_order_lines` is still a table, because `dbt build` rebuilds the dimension and the fact together.

## Resources

- docs: [Jinja and macros](https://docs.getdbt.com/docs/build/jinja-macros) · dbt Labs · Writing and calling macros, with arguments and defaults.
- docs: [Packages](https://docs.getdbt.com/docs/build/packages) · dbt Labs · `packages.yml`, version ranges and `dbt deps`.
- docs: [dbt_utils on the dbt package hub](https://hub.getdbt.com/dbt-labs/dbt_utils/latest/) · dbt Labs · The current version and install snippet.
- docs: [dbt-utils](https://github.com/dbt-labs/dbt-utils) · dbt Labs on GitHub · The README documents every macro and test in the package.
- watch: [Macros in dbt: Jinja and macros tutorial](https://www.youtube.com/watch?v=VRTx97llL-A) · SleekData · 20.1K subscribers · 41.5K views · 439 likes · published 2023-07-26 · checked 2026-09-27 · 6 min

## Practice

1. Create `macros/net_revenue.sql` and `macros/currency.sql`, and use `net_amount` and `net_revenue` in `int_order_lines_enriched`.
2. Run `dbt build` and confirm total net revenue in `fct_order_lines` is unchanged.
3. Add `packages.yml`, run `dbt deps`, and switch `dim_product` and `dim_warehouse` to `generate_surrogate_key`.
4. Write a macro `order_status_is_revenue(status)` that returns a boolean expression, and use it inside `net_revenue` so the list of non-revenue statuses appears in only one macro.

## Example answer

Step 2: this query should give the same number before and after the refactor (₦373,724,922,550 for batch 1):

```sql
select sum(net_revenue) from analytics.fct_order_lines;
```

Step 3, the key line in `dim_warehouse`:

```sql
    {{ dbt_utils.generate_surrogate_key(['warehouse_id']) }} as warehouse_key,
```

Step 4, in `macros/net_revenue.sql`:

```sql
{% macro order_status_is_revenue(status) -%}
    ({{ status }} not in ('cancelled', 'returned'))
{%- endmacro %}


{% macro net_revenue(quantity, unit_price, discount_pct, status) -%}
    case
        when {{ order_status_is_revenue(status) }}
            then {{ net_amount(quantity, unit_price, discount_pct) }}
        else 0
    end
{%- endmacro %}
```

A good answer also uses `order_status_is_revenue` anywhere else a model counts "revenue orders", for example in a future order-level mart. Keeping the macros in one file named after the metric makes them easy to find.

# Lesson: Snapshots

minutes: 55

## Why you need snapshots

In Module 5 you designed `dim_customer` as SCD Type 2. But `raw.customers` only ever holds the **current** version of each customer: when a customer moves, the app overwrites the row. If you never save the old version, it is gone for good.

A dbt **snapshot** saves it. Each time you run `dbt snapshot`, dbt compares the source with what it saved last time. New customers get a row. Changed customers get their old row closed and a new row added. Unchanged customers are left alone. Over time the snapshot table becomes the full history, and it is exactly the Type 2 structure you designed.

## Configure a snapshot

Snapshots are configured in YAML in the `snapshots/` folder (dbt 1.9 and newer; older tutorials use a `{% snapshot %}` block in a `.sql` file). Create `snapshots/snp_customers.yml`:

```yaml
snapshots:
  - name: snp_customers
    relation: ref('stg_customers')
    description: Every version of every ShopLink customer, one row per version.
    config:
      schema: snapshots
      unique_key: customer_id
      strategy: timestamp
      updated_at: updated_at
```

| Setting | Meaning |
|---|---|
| `relation` | What to snapshot. Here the staging model, so trimming and lower-casing happen before the history is saved |
| `schema` | dbt appends it to your target schema, so the table lands in `analytics_snapshots` |
| `unique_key` | The natural key that identifies one customer |
| `strategy` and `updated_at` | How dbt detects a change: see below |

## Timestamp or check strategy

| Strategy | How it detects a change | Use when |
|---|---|---|
| `timestamp` | The `updated_at` column is newer than the saved one | The source reliably updates a timestamp on every change. ShopLink's customers do |
| `check` | Any of the listed `check_cols` differ from the saved values | There is no trustworthy `updated_at` |

A check snapshot of products would look like this:

```yaml
    config:
      unique_key: product_id
      strategy: check
      check_cols: ['product_name', 'category', 'brand', 'list_price', 'is_active']
```

Prefer `timestamp` when you can. It is faster, and it records when the change happened in the source rather than when you happened to run dbt.

## Take the first snapshot, before loading batch 2

The snapshot can only record history from the moment it first runs. Take the first one now, while `raw.customers` still holds batch 1:

```bash
dbt snapshot
```

dbt creates `analytics_snapshots.snp_customers` with 400 rows. Look at the extra columns dbt added:

| Column | Meaning |
|---|---|
| `dbt_scd_id` | A unique ID for each version row |
| `dbt_updated_at` | The `updated_at` value dbt used for this version |
| `dbt_valid_from` | When this version became true |
| `dbt_valid_to` | When it stopped being true; `NULL` for the current version |

## Load batch 2 customers

Download [ShopLink batch 2](/datasets/shoplink-batch-2.zip) and unzip it into your repo's `data/` folder, next to batch 1. The zip contains a `shoplink-batch-2` folder, so the files end up at `data/shoplink-batch-2/customers.csv` and so on. `data/` is already ignored by Git. It was extracted on 2026-07-31. Its `customers.csv` is the full customer table again: 430 rows, of which 20 existing customers have moved or changed type, and 30 (IDs 401 to 430) are new.

Close anything that has `shoplink.duckdb` open, then from the repo root open it in the DuckDB CLI with `duckdb shoplink.duckdb` and run:

```sql
create or replace table raw.customers as
select * from read_csv('data/shoplink-batch-2/customers.csv', header = true);

select count(*) as customers from raw.customers;   -- 430
```

Change the path if you keep your data somewhere else. Because the extract is the whole table, replacing it is correct: this is how the app itself would look after a month of changes. Leave the orders for now; you will load them in the next lesson.

Now take the second snapshot:

```bash
dbt snapshot
```

The snapshot now has 450 rows: 430 current versions plus 20 closed ones. Look at one of the changes, customer 358, a reseller that moved from Onitsha to Lagos:

```sql
select customer_id, customer_name, city, state, dbt_valid_from, dbt_valid_to
from analytics_snapshots.snp_customers
where customer_id = 358
order by dbt_valid_from;
```

| customer_id | customer_name | city | state | dbt_valid_from | dbt_valid_to |
|---|---|---|---|---|---|
| 358 | Uchenna Mobile World | Onitsha | Anambra | 2026-01-02 05:08:21 | 2026-07-14 13:35:20 |
| 358 | Uchenna Mobile World | Ikeja | Lagos | 2026-07-14 13:35:20 | NULL |

**If you loaded batch 2 before taking the first snapshot**, the old versions were never saved. Recover by putting batch 1 back, snapshotting it, and then loading batch 2 again:

```sql
drop table if exists analytics_snapshots.snp_customers;
create or replace table raw.customers as
select * from read_csv('data/shoplink/customers.csv', header = true);
```

Then run `dbt snapshot`, reload batch 2 customers with the SQL above, and run `dbt snapshot` once more.

## Build dim_customer from the snapshot

Rewrite `models/marts/dim_customer.sql` to read the snapshot instead of staging:

```sql
with snapshot as (
    select * from {{ ref('snp_customers') }}
),

versions as (
    select
        customer_id,
        customer_name,
        customer_type,
        coalesce(city, 'Unknown') as city,
        state,
        -- the first version of each customer is valid from the start of time,
        -- so orders placed before the first snapshot still find a match
        case
            when row_number() over (partition by customer_id order by dbt_valid_from) = 1
                then timestamp '1900-01-01'
            else dbt_valid_from
        end as valid_from,
        coalesce(dbt_valid_to, timestamp '9999-12-31') as valid_to,
        dbt_valid_to is null as is_current
    from snapshot
),

final as (
    select
        {{ dbt_utils.generate_surrogate_key(['customer_id', 'valid_from']) }} as customer_key,
        *
    from versions
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

select * from final
union all
select * from unknown_member
```

This applies the two conventions from Module 5: the first version starts at `1900-01-01`, and the current version ends at `9999-12-31` instead of `NULL`. The fact's point-in-time join needs no change at all: it already matches on `valid_from` and `valid_to`.

Run `dbt build --select +dim_customer`. The dimension now has 451 rows (450 versions and the unknown member), and customer 358 has two keys.

Three rules for living with snapshots:

- **Never drop a snapshot table in normal work.** Unlike a model, it cannot be rebuilt from the source: the old versions exist nowhere else. `--full-refresh` does not touch snapshots.
- **Run it on a schedule**, at least as often as the source changes. A change that is made and reverted between two runs is never seen.
- **Snapshot early and lightly.** Point snapshots at sources or staging models, not at marts full of business logic you might want to change later.

## Resources

- docs: [Add snapshots to your DAG](https://docs.getdbt.com/docs/build/snapshots) · dbt Labs · Snapshot configuration, strategies, meta columns and best practices.
- docs: [Type 2: Add New Row](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/type-2/) · Kimball Group · The design a snapshot implements, as a reminder from Module 5.
- watch: [How to use dbt Snapshots to track data history](https://www.youtube.com/watch?v=SNtM_RUa5G4) · Kahan Data Solutions · 60.2K subscribers · 28.4K views · 354 likes · published 2023-03-22 · checked 2026-09-27 · 11 min
- watch: [Data Build Tool DBT: The Ultimate Guide With CI/CD](https://www.youtube.com/watch?v=B8uwFmVt4sU) · Ansh Lamba · 154K subscribers · 216.6K views · 3,631 likes · published 2025-08-31 · checked 2026-09-27 · 307 min

## Practice

1. Add `snp_customers.yml` and run `dbt snapshot` on batch 1. Check the table has 400 rows.
2. Load batch 2 customers into `raw.customers` and run `dbt snapshot` again.
3. Write a query that lists every customer with more than one version, showing what changed (old and new city, state and customer type).
4. Rebuild `dim_customer` from the snapshot and run `dbt build --select +dim_customer`.
5. Customer 156 moved from Ikeja, Lagos to Kano on 2026-07-26. Using `dim_customer`, write the query that returns the version valid on 2026-06-15, and the one valid today.

## Example answer

Step 3, the changes:

```sql
with versions as (
    select
        customer_id,
        customer_name,
        customer_type,
        city,
        state,
        dbt_valid_from,
        row_number() over (partition by customer_id order by dbt_valid_from) as version
    from analytics_snapshots.snp_customers
)

select
    old.customer_id,
    old.customer_name,
    old.city || ', ' || old.state as old_location,
    new.city || ', ' || new.state as new_location,
    old.customer_type             as old_type,
    new.customer_type             as new_type,
    new.dbt_valid_from            as changed_at
from versions as old
inner join versions as new
    on old.customer_id = new.customer_id
   and new.version = old.version + 1
order by changed_at;
```

It returns 20 rows. Some are moves (for example 156 from Ikeja, Lagos to Kano, and 358 from Onitsha to Ikeja, Lagos), and others are customer type changes, such as 87, Ogunleye Pharmacy, and 50, Bello Microfinance Bank, both from business to reseller.

Step 5:

```sql
-- the version valid on 2026-06-15
select customer_key, city, state
from analytics.dim_customer
where customer_id = 156
  and timestamp '2026-06-15' >= valid_from
  and timestamp '2026-06-15' <  valid_to;       -- Ikeja, Lagos

-- the current version
select customer_key, city, state
from analytics.dim_customer
where customer_id = 156
  and is_current;                                -- Kano, Kano
```

# Lesson: Incremental models

minutes: 60

## Why incremental

`fct_order_lines` is a table, so every `dbt run` drops it and rebuilds all 26,771 rows. On DuckDB that takes a fraction of a second. At a real distributor with years of history, the same fact might hold hundreds of millions of rows, and a full rebuild every hour costs real time and, on Snowflake, real money.

An **incremental** model builds the full table once. On every later run it only processes rows that are new or changed since the last run, and merges them in.

## The pieces

Convert `models/marts/fct_order_lines.sql` by adding a config block and a filter to the first CTE:

```sql
{{
    config(
        materialized='incremental',
        unique_key='order_line_id',
        incremental_strategy='delete+insert',
        on_schema_change='fail'
    )
}}

with order_lines as (
    select * from {{ ref('int_order_lines_enriched') }}

    {% if is_incremental() %}
    -- only orders that are new or changed since the last run
    where order_updated_at > (select max(order_updated_at) from {{ this }})
    {% endif %}
),
```

The rest of the model, the dimension CTEs and the final `select`, stays exactly as it was.

| Piece | What it does |
|---|---|
| `materialized='incremental'` | Build once, then merge changes |
| `is_incremental()` | `true` only when the table already exists and you did not ask for a full refresh. On the first run the filter is left out, so every row is loaded |
| `{{ this }}` | The existing table itself, so the filter can ask "what is the newest change I already have?" |
| `unique_key='order_line_id'` | Rows arriving with an `order_line_id` that already exists replace the old row instead of being added again |
| `on_schema_change='fail'` | Stop with an error if the columns change, instead of silently building a mismatched table |

## Late-arriving updates

The filter uses `order_updated_at`, not `order_date`, and that choice matters. Batch 2 contains 132 June orders whose status changed in July: an order placed on 28 June as `pending` might be `delivered` by 3 July. Its `order_date` is old, but its `updated_at` is new.

- Filtering on `order_date` would skip those 132 orders, and the fact would keep showing them as pending forever.
- Filtering on `order_updated_at` picks them up. Their 414 lines are recomputed with the new status, and `unique_key` makes sure each one **replaces** its old row rather than being duplicated.

This pattern, reprocessing a record when its source timestamp moves, is how incremental models handle late-arriving changes.

## Strategies on DuckDB

`incremental_strategy` decides how the new rows are written:

| Strategy | How it works | Needs `unique_key` |
|---|---|---|
| `append` | Inserts the new rows. Changed rows would be duplicated | No |
| `delete+insert` | Deletes existing rows with matching keys, then inserts the new batch | Yes |
| `merge` | One `MERGE` statement: update matches, insert the rest. Needs DuckDB 1.4 or newer | Yes |

ShopLink's fact has updates, so `append` is wrong. `delete+insert` and `merge` both give the correct result on DuckDB; this course uses `delete+insert` because it works on every DuckDB version. In Module 9, Snowflake's default is `merge`.

## Build it on batch 1 first

Start from a clean full build so the new materialisation begins from a known state:

```bash
dbt build --select fct_order_lines --full-refresh
```

`--full-refresh` makes `is_incremental()` return `false`, so dbt drops and rebuilds the whole table. Check it still has 26,771 rows.

## Load batch 2 orders

Now load the rest of batch 2. `orders.csv` has 565 rows: 433 new July orders and 132 changed June orders with the same `order_id`. `order_lines.csv` has 1,230 lines, only for the new July orders, because order lines never change once written.

So the load must **upsert** orders (replace the 132 existing ones, add the 433 new ones) and **append** order lines. Close other connections, open the DuckDB CLI in the repo root and run:

```sql
begin transaction;

create or replace temp table batch2_orders as
select * from read_csv('data/shoplink-batch-2/orders.csv', header = true);

create or replace temp table batch2_order_lines as
select * from read_csv('data/shoplink-batch-2/order_lines.csv', header = true);

-- upsert orders: remove the old versions of changed orders, then insert every batch 2 order
delete from raw.orders
where order_id in (select order_id from batch2_orders);

insert into raw.orders by name
select * from batch2_orders;

-- append order lines, skipping any already loaded (safe to run twice)
insert into raw.order_lines by name
select * from batch2_order_lines
where order_line_id not in (select order_line_id from raw.order_lines);

commit;

select count(*) as orders, max(order_date) as latest_order from raw.orders;   -- 9524, 2026-07-31
select count(*) as order_lines from raw.order_lines;                         -- 28009
```

`insert into ... by name` matches columns by name rather than position, so the load still works if the CSV's column order ever changes. The transaction means that if any statement fails, none of the changes are kept.

## Run incrementally

```bash
dbt build
```

This time `fct_order_lines` runs incrementally: it processes the 1,230 new lines plus the 414 lines of the changed June orders, and leaves the other 26,357 rows untouched. Check the result:

```sql
select count(*) as lines, max(order_updated_at) as latest_change
from analytics.fct_order_lines;
-- 28001 lines, latest change 2026-07-31 23:00:00

-- every fact row must carry the order's current status
select count(*) as stale_rows
from analytics.fct_order_lines as f
inner join raw.orders as o
    on f.order_id = o.order_id
where lower(trim(o.status)) <> f.order_status;
-- 0
```

The second query is the real proof. If you had filtered on `order_date`, it would return 414.

## Full refresh

An incremental table only ever changes the rows its filter selects. So when you change the model's **logic**, for example a new revenue rule, old rows keep the old logic until you rebuild everything:

```bash
dbt build --select fct_order_lines --full-refresh
```

Run a full refresh after any change to the model's SQL or to the surrogate key logic of the dimensions it uses, and compare row counts and totals before and after. A full refresh of the fact after this lesson should give exactly the same 28,001 rows and total as the incremental run. If it does not, your filter is missing something.

Some teams add a **lookback window** to catch rows whose timestamp arrived slightly out of order: `where order_updated_at > (select max(order_updated_at) - interval 3 day from {{ this }})`. Because `unique_key` replaces rather than duplicates, reprocessing a few extra days is harmless.

## Resources

- docs: [Configure incremental models](https://docs.getdbt.com/docs/build/incremental-models) · dbt Labs · `is_incremental()`, `unique_key`, `on_schema_change` and full refreshes.
- docs: [About incremental strategy](https://docs.getdbt.com/docs/build/incremental-strategy) · dbt Labs · Append, delete+insert, merge and microbatch compared.
- docs: [dbt-duckdb](https://github.com/duckdb/dbt-duckdb) · DuckDB on GitHub · The incremental strategies DuckDB supports, and the DuckDB version each needs.
- watch: [How to Build Incremental Models: dbt tutorial](https://www.youtube.com/watch?v=-9RzZRkHay4) · Kahan Data Solutions · 60.2K subscribers · 28.5K views · 450 likes · published 2023-12-06 · checked 2026-09-27 · 11 min

## Practice

1. Convert `fct_order_lines` to incremental and run `dbt build --select fct_order_lines --full-refresh`. Record the row count and total net revenue.
2. Load batch 2 orders and order lines with the SQL from the lesson.
3. Run `dbt build` and run both check queries.
4. Record the fact's row count and total net revenue, then run a full refresh and record them again. They must match.
5. Answer in two or three sentences: why does the incremental run give the correct customer key to a July order from customer 358, who moved to Lagos on 14 July?

## Example answer

Expected figures:

| Point | Rows | Net revenue |
|---|---|---|
| After step 1 (batch 1) | 26,771 | ₦373,724,922,550 |
| After step 3 (incremental) | 28,001 | ₦392,220,230,925 |
| After step 4 (full refresh) | 28,001 | ₦392,220,230,925 |

The stale-rows check returns 0 after step 3.

Step 5: `dbt build` runs the snapshot and `dim_customer` before `fct_order_lines`, because the fact `ref()`s the dimension. So by the time the July orders are processed, `dim_customer` already holds both versions of customer 358, and the point-in-time join picks the Onitsha version for orders before 14 July 13:35:20 and the Lagos version for orders after it. June orders that were already in the fact keep their original key, which is still correct, and still exists because the surrogate key is a hash of `customer_id` and `valid_from`, both of which are unchanged for the first version.

# Lesson: Advanced testing

minutes: 55

## Tests from dbt_utils

`dbt_utils` ships more generic tests than dbt's built-in four. Three you will use on ShopLink:

| Test | Checks | ShopLink use |
|---|---|---|
| `unique_combination_of_columns` | A set of columns is unique together | One `dim_customer` row per `customer_id` and `valid_from` |
| `expression_is_true` | A SQL expression holds for every row | `net_revenue >= 0` |
| `accepted_range` | Values fall between a minimum and maximum | `discount_pct` between 0 and 50 |

Add them to `models/marts/_marts.yml`:

```yaml
models:
  - name: fct_order_lines
    columns:
      - name: discount_pct
        data_tests:
          - dbt_utils.accepted_range:
              arguments:
                min_value: 0
                max_value: 50
      - name: net_revenue
        data_tests:
          - dbt_utils.expression_is_true:
              arguments:
                expression: ">= 0"

  - name: dim_customer
    data_tests:
      - dbt_utils.unique_combination_of_columns:
          arguments:
            combination_of_columns:
              - customer_id
              - valid_from
```

`unique_combination_of_columns` sits under the model, not a column, because it tests several columns at once. Keep the existing `columns:` entries and add these alongside them.

## Write your own generic test

When a rule applies to many columns, turn it into a generic test. A generic test is a SQL query with two special arguments, `model` and `column_name`, that returns the failing rows. Create `tests/generic/is_positive.sql`:

```sql
{% test is_positive(model, column_name) %}

select {{ column_name }}
from {{ model }}
where {{ column_name }} <= 0

{% endtest %}
```

It is now available everywhere, just like `unique`:

```yaml
      - name: quantity
        data_tests:
          - is_positive
```

On `fct_order_lines.quantity` it passes, because the intermediate model excludes the 2 bad lines. On `stg_order_lines.quantity` it would fail with 2 rows, which is exactly the planted problem.

## Severity and thresholds

Not every failure should stop the build. Every test accepts a `severity` and two thresholds:

| Config | Meaning |
|---|---|
| `severity: error` (default) or `warn` | What a failure is reported as |
| `warn_if` | Condition on the number of failing rows that triggers a warning. Default `!=0` |
| `error_if` | Condition that triggers an error. Default `!=0` |

The fact sends orphan lines to the unknown customer. A few are expected, since batch 1 has 8; hundreds would mean a broken join. A singular test with thresholds expresses exactly that. Create `tests/assert_few_unknown_customers.sql`:

```sql
{{ config(severity='error', warn_if='>0', error_if='>50') }}

-- Order lines that could not be matched to a real customer.
-- A handful is expected (batch 1 has 3 orphan orders). Hundreds means a broken join.
select order_line_id, order_id
from {{ ref('fct_order_lines') }}
where customer_key = md5('unknown')
```

`dbt build` now reports `WARN 8` for this test. If a bad change ever drops every customer match, it reports an error and stops. The same `config:` keys work on YAML tests, under the test's `config:` block.

## Unit tests

Data tests check the data you have. **Unit tests** (added in dbt 1.8) check your **logic**, using small inputs you write by hand, before the model is built on real data. They are how you prove that the net revenue rule is right for cases that might not be in today's data at all.

Create `models/marts/_unit_tests.yml`:

```yaml
unit_tests:
  - name: net_revenue_is_zero_for_cancelled_and_returned_orders
    description: Cancelled and returned orders keep their net amount but earn no net revenue.
    model: int_order_lines_enriched
    given:
      - input: ref('stg_order_lines')
        rows:
          - {order_line_id: 1, order_id: 100, product_id: 7, quantity: 2, unit_price: 50000, discount_pct: 10}
          - {order_line_id: 2, order_id: 101, product_id: 7, quantity: 1, unit_price: 80000, discount_pct: 0}
          - {order_line_id: 3, order_id: 102, product_id: 7, quantity: 4, unit_price: 10000, discount_pct: 5}
          - {order_line_id: 4, order_id: 100, product_id: 8, quantity: 0, unit_price: 10000, discount_pct: 0}
      - input: ref('stg_orders')
        rows:
          - {order_id: 100, order_status: delivered}
          - {order_id: 101, order_status: cancelled}
          - {order_id: 102, order_status: returned}
    expect:
      rows:
        - {order_line_id: 1, net_amount: 90000, net_revenue: 90000}
        - {order_line_id: 2, net_amount: 80000, net_revenue: 0}
        - {order_line_id: 3, net_amount: 38000, net_revenue: 0}
```

How it works:

- `given` replaces each input with the rows you list. You only list the columns the logic needs; dbt fills the rest with `NULL`.
- `expect` lists the output rows. Again, you only list the columns you want to check.
- Line 4 has a quantity of 0, so it must not appear in the output at all. The test checks that rule too.

Run only unit tests with:

```bash
dbt test --select "test_type:unit"
```

To see a failure, change the expected `net_revenue` for line 1 to `1` and run it again. dbt prints a diff of actual against expected. Then change it back. `dbt build` runs each model's unit tests before building the model, so broken logic never reaches the warehouse.

Unit tests need the input models to exist in the warehouse so dbt can read their column types, which is why you run them after at least one `dbt build`. To unit test an incremental model's incremental branch, add `overrides: macros: {is_incremental: true}` to the test and give `this` as an input.

## Which test for which job

| Question | Tool |
|---|---|
| Is every key unique and present? | Built-in generic tests |
| Does a rule hold across many rows? | `dbt_utils` tests, or your own generic test |
| Is a known number of exceptions acceptable? | Severity and thresholds |
| Is my SQL logic right, including edge cases not in today's data? | Unit tests |

Module 8 builds on this with the wider practice of data quality: validating business rules with stakeholders, freshness, data contracts, anomaly checks and governance.

## Resources

- docs: [Unit tests](https://docs.getdbt.com/docs/build/unit-tests) · dbt Labs · The full `unit_tests:` syntax, input formats and overrides.
- docs: [Writing custom generic data tests](https://docs.getdbt.com/best-practices/writing-custom-generic-tests) · dbt Labs · How to write, document and reuse your own generic tests.
- docs: [severity, error_if and warn_if](https://docs.getdbt.com/reference/resource-configs/severity) · dbt Labs · Test severity and thresholds.
- docs: [Add data tests to your DAG](https://docs.getdbt.com/docs/build/data-tests) · dbt Labs · Generic and singular data tests, as a reference.
- docs: [dbt-utils](https://github.com/dbt-labs/dbt-utils) · dbt Labs on GitHub · Every generic test in the package, with examples.
- watch: [Explained everything about TESTS (Unit Tests, Data Tests) in DBT](https://www.youtube.com/watch?v=LzgKZ_eh82w) · Praveen Reddy Learnings · 2.88K subscribers · 4.6K views · 78 likes · published 2025-01-01 · checked 2026-09-27 · 18 min

## Practice

1. Add the three `dbt_utils` tests, the `is_positive` generic test on `fct_order_lines.quantity`, and the threshold test on unknown customers.
2. Add the unit test and run `dbt test --select "test_type:unit"`.
3. Write a second unit test for `int_order_lines_enriched` that checks discounts: a line with quantity 10, unit price ₦100,000 and a 15% discount on a delivered order should have a `gross_amount` of 1,000,000 and a `net_revenue` of 850,000.
4. Run `dbt build` and explain every warning in the output.

## Example answer

Step 3, added under `unit_tests:` in the same file:

```yaml
  - name: discount_is_applied_to_net_revenue
    model: int_order_lines_enriched
    given:
      - input: ref('stg_order_lines')
        rows:
          - {order_line_id: 10, order_id: 200, product_id: 1, quantity: 10, unit_price: 100000, discount_pct: 15}
      - input: ref('stg_orders')
        rows:
          - {order_id: 200, order_status: delivered}
    expect:
      rows:
        - {order_line_id: 10, gross_amount: 1000000, net_revenue: 850000}
```

Step 4: a full `dbt build` should end with `ERROR=0` and two warnings:

- `relationships_stg_orders_customer_id...` warns with 3 results: the orphan orders for customers 9001, 9002 and 9003, which exist in raw data.
- `assert_few_unknown_customers` warns with 8 results: the 8 order lines on those 3 orders, which the fact correctly sends to the unknown customer. Batch 2 added no new orphans, so the count stays at 8.

Both warnings are expected and documented, so they do not block the build, but they stay visible so someone can ask the sales team who those customers really are.

# Quiz

passing_score: 70

### You open target/compiled/ after dbt compile. What will you find there?

- [ ] The Jinja templates, unchanged
- [x] Plain SQL with all Jinja resolved, exactly as dbt will send it to the warehouse
- [ ] The results of each query
- [ ] A copy of the raw data

> dbt renders the Jinja first. The compiled SQL is what the warehouse receives, which makes it the first place to look when a model misbehaves.

### Why must you run dbt snapshot on batch 1 before loading batch 2 customers?

- [ ] dbt snapshot cannot read CSV files
- [ ] Batch 2 customers have no updated_at column
- [x] The raw table only holds current values, so old versions are lost unless a snapshot saved them before they were overwritten
- [ ] The snapshot strategy must be changed from check to timestamp first

> A snapshot can only record history from the moment it first runs. Once raw.customers is replaced, the batch 1 versions exist nowhere else.

### Why does ShopLink's incremental fct_order_lines filter on order_updated_at rather than order_date?

- [ ] order_date is not a timestamp
- [ ] order_updated_at is indexed
- [x] Orders placed in June can change status in July; filtering on order_date would skip those late updates
- [ ] dbt requires incremental filters to use a column called updated_at

> Late-arriving changes keep their old order_date but get a new updated_at. Filtering on the update timestamp, with a unique_key, reprocesses them and replaces the stale rows.

### An incremental model has unique_key='order_line_id' and incremental_strategy='delete+insert'. A changed order's lines arrive again. What happens?

- [ ] The lines are added a second time
- [x] The existing rows with the same order_line_id are deleted and the new versions inserted
- [ ] dbt raises an error because the keys already exist
- [ ] The whole table is rebuilt

> delete+insert removes rows whose unique_key matches the new batch, then inserts the batch, so each order line appears once with its latest values.

### What does a dbt unit test check that a data test does not?

- [ ] Whether the warehouse connection works
- [ ] Whether every key in production is unique
- [x] Whether a model's logic produces the expected output for small, hand-written inputs, including cases not in today's data
- [ ] Whether the source data arrived on time

> Data tests check the real data you have. Unit tests check your SQL logic against fixed inputs, before the model is built.

# Project: ShopLink production-ready dbt

max_score: 100

## Brief

ShopLink's July extract (batch 2) has arrived, and it brings the two things your Module 6 project cannot yet handle: customers who changed, and orders whose status changed after they were placed. Extend your dbt project so it keeps full customer history, processes new data incrementally, keeps the revenue definition in one place, and proves its logic with tests.

## Deliverables

On your `feature/module-7-advanced-dbt` branch in `shoplink-analytics`:

1. **Macros.** `macros/net_revenue.sql` containing a `net_revenue` macro (and any helpers such as `net_amount`), used by `int_order_lines_enriched`, so the revenue rule is written once. `packages.yml` and `package-lock.yml` installing `dbt_utils`, with `generate_surrogate_key` used for the surrogate keys.
2. **Snapshot.** `snapshots/snp_customers.yml` using the timestamp strategy, run once on batch 1 and again after loading batch 2 customers.
3. **SCD Type 2 dimension.** `dim_customer` built from the snapshot, with `valid_from`, `valid_to`, `is_current`, a surrogate key per version and an unknown member.
4. **Incremental fact.** `fct_order_lines` as an incremental model with a `unique_key`, filtering on `order_updated_at` so the 132 changed June orders are updated.
5. **A `load/02_load_batch_2.sql` script**, next to your Module 3 `load/01_load_raw.sql`, with the exact SQL you used to load batch 2: replace customers, upsert orders by `order_id`, append order lines.
6. **Tests.** At least one custom generic test in `tests/generic/` used in YAML, at least one `dbt_utils` test, one test with `warn_if` or `error_if` thresholds, and at least one unit test in a `unit_tests:` block. `dbt build` must finish with `ERROR=0`.
7. **Evidence in `docs/module_7_checks.md`**: the snapshot row counts before and after batch 2; the versions of two changed customers; the fact's row count and total net revenue after the incremental run and after a full refresh (they must match); and the result of the stale-status check.

## How to submit

Push the branch and open a pull request into `main` titled "Module 7: snapshots, incremental and tests". In the description, paste the final `dbt build` summary line and explain each warning in one sentence. Paste the pull request link into the submission form.

## Grading guide

| Criterion | Points |
|---|---|
| net_revenue macro is correct and used, so the rule exists in one place; dbt_utils installed and used | 15 |
| Snapshot is configured correctly and shows real history for the 20 changed customers | 20 |
| dim_customer from the snapshot has correct SCD2 columns, keys and unknown member | 15 |
| Incremental fact handles new and changed orders; full refresh matches the incremental result | 25 |
| Custom generic test, dbt_utils test, thresholds and unit test are present, meaningful and passing | 15 |
| Batch 2 load script and evidence document are complete and accurate | 10 |
