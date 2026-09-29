---
module: 8
title: Data Quality & Governance
optional: false
summary: Go beyond "does the key look right" and make ShopLink's data trustworthy as a product. You turn business rules into checks, monitor source freshness, lock the shape of your main fact table with a model contract, catch sudden drops in volume, and record who owns what and which columns hold personal data.
---

# Lesson: Data validation and business rules

minutes: 50

## Tests you have, questions you have not asked yet

By the end of Module 7 your ShopLink project already has plenty of tests: `unique` and `not_null` on keys, `accepted_values` on status, `relationships` from orders to customers, singular tests, custom generic tests and unit tests. You know how to write a test. This module is about deciding **which** tests matter, **where** they belong and **what happens** when one fails.

Here is the gap. Every test from Module 6 could pass while the finance team still finds a problem: a line sold for ₦8,500 when the product costs ₦575,000 to buy in. The key is unique, nothing is null, the status is valid. The data is still wrong, because it breaks a rule of the business, not a rule of the table.

## The six dimensions of data quality

Data quality people describe "good data" along a handful of dimensions. You do not need to memorise a framework, but the vocabulary helps you spot the checks you are missing.

| Dimension | Question it asks | ShopLink example | Typical check |
|---|---|---|---|
| Accuracy | Does the value match the real world? | Line price ₦8,500 on a laptop that costs ₦575,000 | Compare against a trusted reference (unit cost, list price) |
| Completeness | Is everything that should be there, there? | 12 customers have no city | Null counts, expected row counts |
| Consistency | Does the same fact agree everywhere? | "Delivered", " shipped" and "CANCELLED" mean the same as their clean versions | Standardise in staging, then `accepted_values` |
| Timeliness | Is the data recent enough to use? | Orders were last updated weeks ago | Source freshness (next lesson) |
| Validity | Does the value follow the format and range rules? | A line with quantity -2 | Range checks, format checks |
| Uniqueness | Is each thing recorded once? | 6 order lines appear twice | `unique` on the grain, duplicate counts |

Your Module 6 tests mostly cover uniqueness, completeness and validity. Accuracy and timeliness usually need business knowledge, which is what this lesson and the next add.

## Turning business rules into checks

A business rule is a sentence that someone in the business would agree with. Your job is to turn it into a query that returns the rows that break it. That is exactly the shape of a singular test: **a query that should return zero rows**.

Work through it in three steps:

1. **Write the rule in plain words**, and confirm it with the person who owns the process. "Net revenue on a line is never negative" is something the finance lead can say yes or no to.
2. **Translate it into the failing rows.** "Never negative" becomes `where net_revenue < 0`.
3. **Decide how serious a failure is.** Some rules must stop the pipeline. Others should raise a flag but let the build continue.

Here are four ShopLink rules, with the query for each. Save them in your project's `tests/` folder. The column names below are the ones your Module 6 and 7 models use.

**Rule 1: net revenue per line is never negative.**

```sql
-- tests/assert_net_revenue_not_negative.sql
select
    order_line_id,
    quantity,
    unit_price,
    discount_pct,
    net_revenue
from {{ ref('fct_order_lines') }}
where net_revenue < 0
```

In the raw batch 1 data, one line has quantity -2, which would produce negative revenue. `int_order_lines_enriched` excludes quantities of zero or less, so this test passes, and that is the point: it proves the fix is still in place.

**Rule 2: delivered orders must have a warehouse.** A delivery that no warehouse fulfilled is impossible, so this is a hard failure.

```sql
-- tests/assert_delivered_orders_have_warehouse.sql
select
    order_id,
    order_status,
    warehouse_id
from {{ ref('stg_orders') }}
where order_status = 'delivered'
  and warehouse_id is null
```

**Rule 3: no line is sold below unit cost.** ShopLink sometimes discounts, but never below what it paid. This rule is the one that finds the ₦8,500 laptop.

```sql
-- tests/assert_no_line_sold_below_cost.sql
{{ config(severity = 'warn') }}

select
    f.order_line_id,
    p.product_id,
    f.unit_price,
    p.unit_cost
from {{ ref('fct_order_lines') }} as f
inner join {{ ref('dim_product') }} as p
    on f.product_key = p.product_key
where f.unit_price < p.unit_cost
```

Against the raw batch 1 data this returns 2 lines, both on products that have since been made inactive. It is set to `warn` because the finance team needs to investigate each one, but a single odd price should not stop the whole ShopLink build.

**Rule 4: no order is fulfilled by a warehouse before it opened.** Kano North opened on 2023-09-18 and Ibadan West on 2024-04-02, so an Ibadan order dated January 2024 is a data entry error.

```sql
-- tests/assert_orders_after_warehouse_opened.sql
select
    o.order_id,
    o.order_date,
    w.warehouse_name,
    w.opened_date
from {{ ref('stg_orders') }} as o
inner join {{ ref('stg_warehouses') }} as w
    on o.warehouse_id = w.warehouse_id
where o.order_date < w.opened_date
```

Simple range rules do not need a whole SQL file. As a reminder, this is the `dbt_utils.accepted_range` test you attached to `discount_pct` in `models/marts/_marts.yml` in Module 7:

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
```

The `arguments:` block is the dbt Core 1.10+ syntax this course uses.

## Severity: stop the line or raise a flag?

Every test has a severity. `error` (the default) fails the build and stops downstream models in `dbt build`. `warn` reports the failure and carries on. You can also set thresholds, so a test only errors when the problem is big:

```sql
{{ config(
    severity = 'error',
    warn_if = '>0',
    error_if = '>10'
) }}
```

This reads: "warn if any rows fail, error if more than 10 fail." A useful rule of thumb for choosing:

- **Error** when the problem makes the numbers wrong for everyone: duplicated revenue, a broken join, a missing key.
- **Warn** when a human needs to look but the rest of the data is still fine: one suspicious price, a handful of customers with no city.

When a test fails, you want to see the rows. Run it with `--store-failures` and dbt saves the failing rows to a table in your warehouse, named after the test, so you can query them and send them to the right person:

```bash
dbt test --select assert_no_line_sold_below_cost --store-failures
```

## Where to check: sources, staging or marts

The same problem can be caught at three points. Each has a different job.

| Layer | What to check | ShopLink example | Why here |
|---|---|---|---|
| Sources | That the raw data arrived and has the shape you expect | Source freshness; `not_null` on `orders.order_id` | Catches loader problems before any model runs, and tells you whose fault it is |
| Staging | That your cleaning worked | `accepted_values` on the cleaned status; `unique` on `order_line_id` after removing the 6 duplicates | Confirms each fix, one table at a time |
| Marts | That the business rules hold on the finished product | Net revenue never negative; no line below cost; row-count anomaly | This is what stakeholders read, so this is the promise you are making |

A good habit: test raw problems at the source with `warn` so you know about them, test your fix in staging with `error`, and test business rules on the marts. Avoid testing the same thing at every layer; it makes failures noisy and slows the build.

## Resources

- docs: [Add data tests to your DAG](https://docs.getdbt.com/docs/build/data-tests?name=Fusion&version=2.0) · dbt Labs · The reference for singular and generic tests, which you already know. Reread the section on configuring tests.
- docs: [severity, error_if and warn_if](https://docs.getdbt.com/reference/resource-configs/severity) · dbt Labs · How thresholds decide between a warning and an error.
- docs: [store_failures](https://docs.getdbt.com/reference/resource-configs/store_failures) · dbt Labs · Saving failing rows to a table so you can investigate them.
- read: [The 6 Data Quality Dimensions With Examples](https://montecarlo.ai/blog-6-data-quality-dimensions-examples) · Monte Carlo · A readable tour of the dimensions with examples from real teams.
- watch: [Data Quality in Six Dimensions](https://www.youtube.com/watch?v=1nJy0A3EwI4) · Statistics Canada · 10.1K subscribers · 3.4K views · 19 likes · published 2022-05-04 · checked 2026-09-27 · 9 min

## Practice

1. Write down five business rules for ShopLink in plain words, one for each of these dimensions: accuracy, completeness, consistency, validity and uniqueness. Do not reuse the four rules above.
2. For each rule, note which layer you would check it in (source, staging or mart) and whether it should be `error` or `warn`, with one sentence of reasoning.
3. Pick two of your rules and implement them as singular tests in your `shoplink-analytics` project. Run `dbt test --select` on each and record whether it passes or fails, and how many rows fail.

## Example answer

A strong set of five rules:

| Dimension | Rule | Layer | Severity | Reasoning |
|---|---|---|---|---|
| Accuracy | A line's unit price is never more than 50% above the product's list price | Mart | warn | A typo in a price is worth checking, but it should not stop the build |
| Completeness | Every order has at least one order line | Mart | error | An order with no lines has no revenue and breaks average order value |
| Consistency | After cleaning, order status is one of five lowercase values | Staging | error | Every model downstream filters on status, so an unexpected value silently drops revenue |
| Validity | Quantity on every line is greater than zero | Source (warn) and staging (error) | both | Warn at the source so you know the app let it through; error in staging to prove your fix works |
| Uniqueness | One row per `order_line_id` in `fct_order_lines` | Mart | error | Duplicate lines double count revenue |

The completeness rule as a singular test:

```sql
-- tests/assert_every_order_has_lines.sql
select o.order_id
from {{ ref('stg_orders') }} as o
left join {{ ref('stg_order_lines') }} as l
    on o.order_id = l.order_id
where l.order_id is null
```

On ShopLink this passes: every order in the extract has lines. The accuracy rule:

```sql
-- tests/assert_price_not_far_above_list.sql
{{ config(severity = 'warn') }}

select
    f.order_line_id,
    p.product_id,
    f.unit_price,
    p.list_price
from {{ ref('fct_order_lines') }} as f
inner join {{ ref('dim_product') }} as p
    on f.product_key = p.product_key
where f.unit_price > p.list_price * 1.5
```

ShopLink's list prices rise about 1.2% a month over the period, so recent orders sit well above the list price in `products.csv`. If this test warns, that is a finding to discuss with the business ("is `list_price` the current price or the launch price?") rather than a bug. Other rules are just as valid, for example "no order is dated in the future" or "every customer has an email".

# Lesson: Freshness

minutes: 40

## The quiet failure

The most common data problem is not wrong data. It is **old** data that looks fine. The loader that copies orders from the ShopLink app fails on Friday night. Nobody notices. On Monday the sales dashboard shows the weekend as a disaster, and a manager calls three warehouse leads to ask what went wrong. Every test passed, because every row that was there was correct.

Freshness checks answer one question: **when did this data last change, and is that recent enough?**

## Source freshness in dbt

dbt checks freshness on sources. You tell it which column records when a row was loaded or changed, and how old is too old. ShopLink's `orders` and `customers` tables both have an `updated_at` column, so you can use that.

Add this to `models/staging/_sources.yml` from Module 6, keeping the descriptions and tests you already have there. This is the syntax for dbt Core 1.9 and later, where `freshness` and `loaded_at_field` sit under `config:`:

```yaml
sources:
  - name: shoplink
    schema: raw
    config:
      loaded_at_field: updated_at
      freshness:
        warn_after: {count: 24, period: hour}
        error_after: {count: 48, period: hour}
    tables:
      - name: orders

      - name: customers
        config:
          freshness:
            warn_after: {count: 7, period: day}
            error_after: {count: 14, period: day}

      - name: order_lines
        config:
          freshness: null

      - name: products
        config:
          freshness: null

      - name: warehouses
        config:
          freshness: null
```

What this says:

- The source-level config is the default: every table is checked on `updated_at`, warning after 24 hours and erroring after 48.
- `customers` changes much less often than orders, so it gets a looser threshold.
- `order_lines`, `products` and `warehouses` have no `updated_at` column, so their checks are switched off with `freshness: null`. The freshness of `orders` stands in for `order_lines`, because lines arrive with their order.

Then run:

```bash
dbt source freshness
```

dbt runs `select max(updated_at)` on each table, compares it with the current time, and reports `PASS`, `WARN` or `ERROR STALE`. It also writes the results to `target/sources.json`. Note that `dbt build` does **not** check freshness; it is a separate command, and in production you run it first.

## What you will see with ShopLink

ShopLink's data is a historical extract, so be ready for this. The latest `orders.updated_at` in batch 1 is 2026-06-30 23:00:00, and after you load batch 2 it is 2026-07-31 23:00:00. Measured against today's date, that is weeks old, so every check with a realistic threshold fails:

```text
$ dbt source freshness
Running with dbt=1.12.5
...

1 of 2 START freshness of shoplink.customers ............................ [RUN]
2 of 2 START freshness of shoplink.orders ............................... [RUN]
1 of 2 ERROR STALE freshness of shoplink.customers ...................... [ERROR STALE in 0.04s]
2 of 2 ERROR STALE freshness of shoplink.orders ......................... [ERROR STALE in 0.03s]

Done.
```

That is the correct result. The check is doing its job: this data really is stale. Do not loosen the threshold to 365 days to make it green; that would hide exactly the failure the check exists to catch. Instead, note in your documentation that the ShopLink extract is historical and that the check is expected to error in this course.

To see the other outcomes for yourself, try temporary thresholds. With `warn_after: {count: 30, period: day}` and `error_after: {count: 365, period: day}` on `orders`, you get a `WARN`. Put your real thresholds back afterwards.

## Choosing thresholds: from SLA to YAML

A threshold should come from a promise to the business, called a service level agreement (SLA). Start from the question "when does someone look at this data, and how old can it be at that moment?"

For ShopLink: "The sales team opens the dashboard at 8am Lagos time, Monday to Saturday, and needs yesterday's orders." If the loader runs at 1am, the newest `updated_at` at 8am should be at most a few hours old, and never more than a day. So `warn_after: 12 hours` gives you an early nudge, and `error_after: 24 hours` means the promise is broken.

Two things to watch:

- **`updated_at` measures change, not loading.** A customer table where nobody changed anything this week looks stale, even if the loader ran perfectly an hour ago. In real projects, ask the data engineers to add a `_loaded_at` column set by the loader, and point `loaded_at_field` at that.
- **Quiet periods are normal.** ShopLink gets far fewer orders on Sundays. A 24 hour threshold on Monday morning may warn simply because Sunday was quiet. Use a slightly longer window, or a `filter`, rather than training people to ignore warnings.

## When freshness fails

A failed freshness check is an incident, and it needs a short, repeatable response. Write this down for your team:

1. **Confirm it.** Query the source yourself: `select max(updated_at) from raw.orders;`. Is it really old, or did the check misfire?
2. **Find the owner.** Freshness problems almost always start upstream: the loader, the app database, a changed password. Tell whoever owns ingestion, with the timestamp.
3. **Tell the consumers.** Post in the channel the sales team reads: "Orders data is stale since 31 July, 23:00. Dashboards after that point are incomplete. We will update you by noon." Being honest early builds more trust than a perfect record.
4. **Decide whether to run downstream models.** Building marts on stale data can overwrite yesterday's good numbers with the same numbers and a new timestamp, which misleads people. Many teams stop the pipeline when freshness errors.
5. **Close the loop.** When the data is back, rerun, confirm the check passes, and note what happened in your data quality log.

## Resources

- docs: [Source freshness](https://docs.getdbt.com/docs/deploy/source-freshness) · dbt Labs · How freshness snapshots work and how to run them in a deployment.
- docs: [freshness](https://docs.getdbt.com/reference/resource-configs/freshness) · dbt Labs · The full configuration reference, including `filter` and `loaded_at_query`.
- docs: [dbt source command](https://docs.getdbt.com/reference/commands/source) · dbt Labs · The command options and what goes into `sources.json`.
- watch: [How to monitor your source freshness in dbt](https://www.youtube.com/watch?v=JHpLfcFOe90) · Kahan Data Solutions · 60.2K subscribers · 23K views · 284 likes · published 2021-02-03 · checked 2026-09-27 · 8 min

## Practice

1. Add the freshness configuration above to `models/staging/_sources.yml`.
2. Run `dbt source freshness` and copy the output into a note. Explain in one sentence why it shows what it shows.
3. Change the `orders` thresholds temporarily so that you see a `WARN`, then put them back.
4. Write a one-paragraph SLA for ShopLink's orders data and the matching `warn_after` and `error_after` values, with your reasoning.

## Example answer

For step 2, with batch 2 loaded: "Both checks show `ERROR STALE` because the newest `orders.updated_at` is 2026-07-31 23:00:00, which is weeks older than the 48 hour limit. The ShopLink extract is historical, so this is expected and correct."

For step 3, this `orders` block gives a warning:

```yaml
      - name: orders
        config:
          freshness:
            warn_after: {count: 30, period: day}
            error_after: {count: 365, period: day}
```

For step 4, a good SLA: "ShopLink's orders data in the warehouse is never more than 24 hours behind the app at 8am Lagos time, Monday to Saturday. If it is, the analytics engineer on duty tells the sales channel by 9am." The matching config is `warn_after: {count: 12, period: hour}` and `error_after: {count: 24, period: hour}`, because the loader runs overnight: 12 hours gives an early warning that the overnight load did not happen, and 24 hours is the point where the promise is broken. Answers with a 26 or 36 hour error window, to allow for quiet Sundays, are also sensible if you explain why.

# Lesson: Data contracts

minutes: 50

## A promise about shape

Imagine the finance team builds a monthly revenue report on top of `fct_order_lines`. One day you rename `net_revenue` to `net_revenue_ngn` because it reads better. Your dbt build passes. Finance's report breaks at month end, in front of the CFO.

Tests check the **values** in a table. A data contract checks its **shape**: which columns exist, what they are called and what type they are. It is an agreement between a producer (you, the team that builds the table) and its consumers (finance, the BI tool, a data scientist). The producer promises not to change the shape without warning; consumers can build on it with confidence.

## Contracts as agreements between people

Before any YAML, a contract is a conversation. For `fct_order_lines` it might cover:

| Part of the agreement | ShopLink example |
|---|---|
| Owner | Analytics engineering, contact Tolu |
| Grain | One row per order line |
| Columns and types | `order_line_id` bigint, `net_revenue` decimal(18,2), and so on |
| Guarantees | `order_line_id` is never null and is unique; `net_revenue` is never negative |
| Freshness | Updated daily by 7am Lagos time |
| Change policy | Breaking changes announced two weeks ahead, and old version kept for a month |

dbt can enforce the middle rows directly. The rest lives in your documentation and in how your team behaves.

## Model contracts in dbt

You switch on a contract per model, in its YAML file. When a contract is enforced, dbt checks, **before** it builds the table, that the model's SQL returns exactly the columns you listed with exactly the types you listed. If not, the build stops.

Contracts work on `table` and `incremental` models. On a `view`, dbt checks names and types but not constraints. Ephemeral models cannot have contracts. You must list **every** column the model returns, with a `data_type` for each.

Your `fct_order_lines` from Module 7 is incremental, and dbt requires an incremental model with a contract to say what happens when columns change. Module 7 already set this in the model's `config()` block:

```sql
{{
    config(
        materialized='incremental',
        unique_key='order_line_id',
        incremental_strategy='delete+insert',
        on_schema_change='fail'
    )
}}
```

Leave it as it is. `on_schema_change='fail'` means "if the columns ever change, stop and make me decide", which is exactly what a contracted table needs.

## Step 1: make the types explicit

A contract compares types exactly, and DuckDB infers types for you. IDs read from the CSV files become `BIGINT`; `md5()` returns `VARCHAR`; arithmetic such as `quantity * unit_price * (1 - discount_pct / 100.0)` becomes `DOUBLE`. If you declare `decimal(18,2)` but the query returns `DOUBLE`, the contract fails. So cast every column in the model's final `select`. Keep the `order_lines` CTE with its incremental filter, the three dimension CTEs and the joins exactly as they are, and change only the column list:

```sql
select
    cast(order_lines.order_line_id as bigint)                    as order_line_id,
    cast(order_lines.order_id as bigint)                         as order_id,
    cast(strftime(order_lines.order_date, '%Y%m%d') as integer)  as date_key,
    cast(coalesce(customers.customer_key, md5('unknown')) as varchar)   as customer_key,
    cast(coalesce(products.product_key, md5('unknown')) as varchar)     as product_key,
    cast(coalesce(warehouses.warehouse_key, md5('unknown')) as varchar) as warehouse_key,
    cast(order_lines.order_status as varchar)                    as order_status,
    cast(order_lines.channel as varchar)                         as channel,
    cast(order_lines.quantity as integer)                        as quantity,
    cast(order_lines.unit_price as decimal(18, 2))               as unit_price,
    cast(order_lines.discount_pct as decimal(5, 2))              as discount_pct,
    cast(order_lines.gross_amount as decimal(18, 2))             as gross_amount,
    cast(order_lines.net_amount as decimal(18, 2))               as net_amount,
    cast(order_lines.net_revenue as decimal(18, 2))              as net_revenue,
    cast(order_lines.order_updated_at as timestamp)              as order_updated_at
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

The column names do not change. In particular `order_updated_at` keeps its name, because the incremental filter in the `order_lines` CTE reads `max(order_updated_at)` from the existing table. To see exactly what the model returns today, run:

```bash
dbt show --inline "select column_name, data_type from information_schema.columns where table_name = 'fct_order_lines' order by ordinal_position"
```

These casts also pay off in Module 9: `bigint`, `integer`, `varchar`, `timestamp` and `decimal` all exist in Snowflake too, so the same contract works there unchanged.

## Step 2: declare the contract

In `models/marts/_marts.yml`, where `fct_order_lines` is documented:

```yaml
models:
  - name: fct_order_lines
    description: One row per order line. ShopLink's main sales fact.
    config:
      contract:
        enforced: true
    columns:
      - name: order_line_id
        data_type: bigint
        constraints:
          - type: not_null
        data_tests:
          - unique
      - name: order_id
        data_type: bigint
        constraints:
          - type: not_null
      - name: date_key
        data_type: integer
        constraints:
          - type: not_null
      - name: customer_key
        data_type: varchar
        constraints:
          - type: not_null
      - name: product_key
        data_type: varchar
        constraints:
          - type: not_null
      - name: warehouse_key
        data_type: varchar
        constraints:
          - type: not_null
      - name: order_status
        data_type: varchar
      - name: channel
        data_type: varchar
      - name: quantity
        data_type: integer
      - name: unit_price
        data_type: decimal(18,2)
      - name: discount_pct
        data_type: decimal(5,2)
      - name: gross_amount
        data_type: decimal(18,2)
      - name: net_amount
        data_type: decimal(18,2)
      - name: net_revenue
        data_type: decimal(18,2)
      - name: order_updated_at
        data_type: timestamp
```

The three dimension keys can be `not_null` because the model already sends unmatched lines to the unknown member with `coalesce(..., md5('unknown'))`.

Keep the tests and descriptions you already had on each column; the contract adds `data_type` and `constraints` alongside them.

## What a broken contract looks like

Now try to break it on purpose. Remove the `cast` around `net_revenue` and run `dbt build --select fct_order_lines --full-refresh`. dbt stops before touching the table:

```text
Compilation Error in model fct_order_lines (models/marts/fct_order_lines.sql)
  This model has an enforced contract that failed.
  Please ensure the name, data_type, and number of columns in your contract match the columns in your model's definition.

  | column_name | definition_type | contract_type | mismatch_reason    |
  | ----------- | --------------- | ------------- | ------------------ |
  | net_revenue | DOUBLE          | DECIMAL(18,2) | data type mismatch |
```

Renaming or removing a column gives a similar table with `missing in definition`. This is the whole value of a contract: the mistake is caught on your laptop or in CI, not at month end by finance.

## Constraints versus tests

`constraints` are rules written into the table definition itself, so the database refuses bad rows. `data_tests` run after the table is built and report problems. How much the database enforces varies:

| Constraint | DuckDB | Snowflake |
|---|---|---|
| `not_null` | Enforced | Enforced |
| `unique` / `primary_key` | Enforced | Recorded but not enforced |
| `foreign_key` | Enforced, but it stops dbt dropping and rebuilding the parent table, so avoid it | Recorded but not enforced |
| `check` | Enforced | Not supported |

Because you move to Snowflake in Module 9, use `not_null` constraints and keep your `unique` and `relationships` **tests**. That combination behaves the same on both warehouses.

## Model versions, briefly

Sometimes a breaking change is the right thing to do. Instead of surprising consumers, dbt lets you publish a new version of a model alongside the old one:

```yaml
models:
  - name: fct_order_lines
    latest_version: 2
    versions:
      - v: 1
        deprecation_date: 2026-12-31
      - v: 2
```

Consumers keep reading version 1 until they are ready, then switch to `ref('fct_order_lines', v=2)`. You will not need versions for ShopLink yet; just know the tool exists for when a contracted table has to change.

## Resources

- docs: [Model contracts](https://docs.getdbt.com/docs/mesh/govern/model-contracts) · dbt Labs · How enforcement works, which materialisations support it, and platform support for constraints.
- docs: [contract](https://docs.getdbt.com/reference/resource-configs/contract) · dbt Labs · The configuration reference, including how data types are compared.
- docs: [constraints](https://docs.getdbt.com/reference/resource-properties/constraints) · dbt Labs · Every constraint type and what each warehouse does with it.
- docs: [Model versions](https://docs.getdbt.com/docs/mesh/govern/model-versions) · dbt Labs · When and how to version a contracted model.
- watch: [Data Contracts: The Rise of Modern Data Management with Chad Sanderson](https://www.youtube.com/watch?v=xycPzr5Rbb4) · Starburst · 4.77K subscribers · 2.6K views · 43 likes · published 2024-05-10 · checked 2026-09-27 · 19 min

## Practice

1. Add explicit casts to the final `select` of your `fct_order_lines` and check that its config still has `on_schema_change='fail'`.
2. Add an enforced contract to `fct_order_lines`, with a `data_type` for every column and `not_null` constraints on `order_line_id`, `order_id` and the four keys.
3. Run `dbt build --select fct_order_lines --full-refresh` and confirm it passes.
4. Break the contract twice: once by removing a cast, once by renaming a column in the SQL. Copy each error message into your notes.
5. Write the "agreement between people" table for `fct_order_lines`: owner, grain, guarantees, freshness and change policy.

## Example answer

After steps 1 to 3, `dbt build --select fct_order_lines --full-refresh` ends with `Completed successfully` and the model and its tests pass. For step 4, removing the `net_revenue` cast gives the `data type mismatch` table shown in the lesson. Renaming `channel` to `order_channel` in the SQL gives:

```text
  | column_name   | definition_type | contract_type | mismatch_reason       |
  | ------------- | --------------- | ------------- | --------------------- |
  | channel       |                 | VARCHAR       | missing in definition |
  | order_channel | VARCHAR         |               | missing in contract   |
```

For step 5:

| Part | fct_order_lines |
|---|---|
| Owner | Analytics engineering (your name and email) |
| Grain | One row per order line, keyed on `order_line_id` |
| Guarantees | Keys never null; `order_line_id` unique; `net_revenue` never negative; only valid statuses |
| Freshness | Rebuilt daily; source orders no more than 24 hours old at 8am Lagos time |
| Change policy | No column removed or renamed without two weeks' notice in the data channel; breaking changes shipped as a new model version |

If you added columns of your own, list those too. What matters is that every column appears with a type that matches an explicit cast.

# Lesson: Anomaly and row-count checks

minutes: 45

## When every row is right but the table is wrong

Picture Tuesday morning. The loader crashed halfway through Monday's run, so only half of June's order lines made it into the warehouse. Each row that did arrive is perfect: unique keys, valid statuses, positive revenue. Every test passes. June's revenue is down 50%, and a regional manager is asked to explain a collapse that never happened.

Row-level tests cannot see this. You need checks on the **table as a whole**: how many rows arrived, compared with what you would expect.

## Know your normal first

You cannot spot an abnormal month until you know what a normal one looks like. Profile ShopLink's volume:

```sql
select
    date_trunc('month', order_date) as order_month,
    count(*)                        as line_count
from analytics.fct_order_lines
group by 1
order by 1;
```

ShopLink's orders grow steadily: about 249 a month on average in 2024, 330 in 2025 and 358 in the first half of 2026, at roughly 2.9 lines per order. The pattern also has seasons. December is the peak (school budgets and the festive season), September is strong (the new school year), and January is quiet. Sundays are much slower than weekdays.

That shapes your check. A rule like "this month must be within 10% of last month" would fire every December and every January, and people would quickly learn to ignore it. You want a check that is loose enough for normal seasons and tight enough to catch a half-loaded month.

## A simple row-count anomaly test

Compare the latest complete month with the average of the three months before it, and fail if it is less than half or more than double. Save this as a singular test:

```sql
-- tests/assert_fct_order_lines_monthly_volume_is_normal.sql
{% set min_ratio = var('volume_min_ratio', 0.5) %}
{% set max_ratio = var('volume_max_ratio', 2.0) %}

with monthly as (
    select
        date_trunc('month', order_date) as order_month,
        count(*)                        as line_count
    from {{ ref('fct_order_lines') }}
    group by 1
),

with_baseline as (
    select
        order_month,
        line_count,
        avg(line_count) over (
            order by order_month
            rows between 3 preceding and 1 preceding
        ) as baseline_avg
    from monthly
),

latest_month as (
    select *
    from with_baseline
    order by order_month desc
    limit 1
)

select
    order_month,
    line_count,
    round(baseline_avg, 0)               as baseline_avg,
    round(line_count / baseline_avg, 2)  as ratio
from latest_month
where baseline_avg is not null
  and (
      line_count < baseline_avg * {{ min_ratio }}
      or line_count > baseline_avg * {{ max_ratio }}
  )
```

How it works:

- `monthly` counts lines per month.
- The window function in `with_baseline` averages the three previous months for each month, using the `rows between` framing you learned in Module 4.
- `latest_month` keeps only the most recent month, because that is the one that just loaded.
- The final `where` returns a row only when the latest month is outside the allowed range, so an empty result means the test passes.

With batch 2 loaded, the latest month is July 2026 with about 1,230 lines, against a baseline of about 1,150 from April to June. The ratio is about 1.07, so the test passes. The 0.5 and 2.0 limits also pass every December peak and January dip in the ShopLink history, which is why they were chosen.

To watch it fail, tighten the lower limit from the command line without editing the file:

```bash
dbt test --select assert_fct_order_lines_monthly_volume_is_normal --vars '{volume_min_ratio: 1.2}'
```

A ratio of 1.07 is below 1.2, so the test fails and returns July's row.

Two points for real projects. First, this test uses the latest month **in the data**, which suits a historical extract. In a live pipeline the current month is always partial, so add `where order_month < date_trunc('month', current_date)` to the `monthly` CTE and test the last complete month, or switch to daily counts. Second, set this test to `warn` at first. Watch it for a few weeks, adjust the limits, and only then make it an error.

## Other ways to compare

The same idea comes in several shapes. Pick the one that matches the failure you fear.

| Check | Catches | How |
|---|---|---|
| Latest period versus recent average | Partial loads, duplicated loads | The singular test above |
| Same month last year | Problems hidden by seasonality | Compare with `order_month - interval 12 month`; needs a year of history |
| Layer to layer | Rows lost or multiplied by a join | A singular test comparing staging and mart counts, allowing for known filters; `dbt_utils.equal_rowcount` when nothing is filtered |
| Latest timestamp in a model | Models that stopped updating | `dbt_utils.recency` |
| Fixed range | Obvious breaks, as a first safety net | `dbt_expectations.expect_table_row_count_to_be_between` |

## Packages that do this for you

Writing your own singular test teaches you how anomaly checks work, and for ShopLink it is enough. At scale, teams use packages:

- **dbt_utils**, which you already have, offers `equal_rowcount`, `fewer_rows_than` and `recency`.
- **dbt_expectations** ports the Great Expectations library to dbt: row-count ranges, value distributions and more, all as generic tests.
- **Elementary** stores the results of every run and learns what normal looks like, then flags volume, freshness and distribution anomalies automatically. It also produces a data observability report. It is the step up from "tests" to "monitoring".

Try one of them only after your own test works, and read its install instructions on the dbt package hub.

## Resources

- docs: [dbt_utils on the package hub](https://hub.getdbt.com/dbt-labs/dbt_utils/latest/) · dbt Labs · See `equal_rowcount`, `fewer_rows_than`, `recency` and `accepted_range`.
- docs: [dbt_expectations on the package hub](https://hub.getdbt.com/metaplane/dbt_expectations/latest/) · Metaplane · Row-count, distribution and value tests in the Great Expectations style.
- docs: [Elementary documentation](https://docs.elementary-data.com/home) · Elementary · Anomaly detection and observability for dbt projects.
- read: [elementary-data/elementary on GitHub](https://github.com/elementary-data/elementary) · Elementary · The open source package and its examples of volume anomaly tests.

## Practice

1. Run the monthly profiling query on your `fct_order_lines` and note the three highest and three lowest months. Explain each in one sentence.
2. Add the row-count anomaly test to your project and run it. It should pass.
3. Make it fail with `--vars`, and record the output.
4. Write a second volume check of a different kind from the table above (for example, staging to mart row counts) and explain which failure it would catch that the first one would miss.

## Example answer

For step 1, from ShopLink's data the highest months are December 2025 (about 1,490 lines), July 2026 (about 1,230) and September 2025 (about 1,210), and the lowest are January, February and March 2024 (about 475 to 570). December is the festive and school-budget peak; September is the start of the school year; July 2026 is high because the business has been growing for two and a half years; early 2024 is low because that is the start of the history, when ShopLink had fewer customers.
For step 3, the failing run looks like this:

```text
1 of 1 START test assert_fct_order_lines_monthly_volume_is_normal ....... [RUN]
1 of 1 FAIL 1 assert_fct_order_lines_monthly_volume_is_normal ........... [FAIL 1 in 0.05s]
```

For step 4, a layer-to-layer check. `dbt_utils.equal_rowcount` between `stg_order_lines` and `fct_order_lines` would fail, because the fact has 28,001 rows and staging has 28,003: `int_order_lines_enriched` deliberately drops the 2 lines with a quantity of zero or less. So compare the fact with the staging lines that should reach it:

```sql
-- tests/assert_fct_matches_valid_staging_lines.sql
with staging as (
    select count(*) as line_count
    from {{ ref('stg_order_lines') }}
    where quantity > 0
),

mart as (
    select count(*) as line_count
    from {{ ref('fct_order_lines') }}
)

select
    staging.line_count as staging_lines,
    mart.line_count    as mart_lines
from staging
cross join mart
where staging.line_count <> mart.line_count
```

With batch 2 loaded both counts are 28,001, so the test passes. It catches a join in the mart that silently drops or duplicates lines (for example, joining to a customer dimension that has two overlapping versions for one customer), which the monthly test would miss if the error were small.

# Lesson: Governance

minutes: 45

## Governance is knowing who, what and why

Governance sounds like a policy document nobody reads. In analytics engineering it is practical: for every important table, can someone answer **who owns it, who may use it, what is in it and what it means**? If the answer lives only in one person's head, ShopLink's data is one resignation away from chaos.

Governance matters as much as clean SQL. A beautifully modelled mart that nobody trusts, or that leaks customer emails to the wrong team, is a liability. Most of what follows is a few lines of YAML, and it turns your project into something a company can depend on.

## Ownership

Every model should have an owner: the person or team who answers questions about it and approves changes. dbt gives you two tools.

**Groups** collect related models under one owner. Define them in a YAML file, for example `models/_groups.yml`:

```yaml
groups:
  - name: sales_analytics
    owner:
      name: ShopLink Analytics Engineering
      email: analytics@shoplink.example
```

Then assign your models to the group in `dbt_project.yml`, under `shoplink_analytics`, the project name from Module 6:

```yaml
models:
  shoplink_analytics:
    +group: sales_analytics
```

**`meta`** holds any extra facts you want to record. It has no effect on how dbt builds anything, but it appears in the documentation site and in `manifest.json`, where other tools can read it:

```yaml
models:
  - name: fct_order_lines
    config:
      meta:
        owner: analytics@shoplink.example
        business_owner: Head of Sales
        tier: 1
        contains_pii: false
```

A `tier` is a simple way to say how critical a model is: tier 1 means "leadership uses this; failures are urgent".

## Access: private, protected and public

Once models belong to groups, you can control who may `ref` them:

| Access | Who can `ref` it | Use for |
|---|---|---|
| `private` | Only models in the same group | Intermediate building blocks that should not be built upon elsewhere |
| `protected` (the default) | Any model in this project | Staging models and marts |
| `public` | Any model, including other dbt projects | Contracted marts that are a stable interface |

Set access by folder in `dbt_project.yml`:

```yaml
models:
  shoplink_analytics:
    +group: sales_analytics
    staging:
      +access: protected
    intermediate:
      +access: private
    marts:
      +access: protected
```

Then make the one contracted mart public, next to its contract in `models/marts/_marts.yml`:

```yaml
models:
  - name: fct_order_lines
    config:
      access: public
      contract:
        enforced: true
```

If a model outside the group tries to `ref` a private one, dbt refuses to parse the project:

```text
Node model.shoplink_analytics.finance_report attempted to reference node model.shoplink_analytics.int_order_lines_enriched, which is not allowed because the referenced node is private to the sales_analytics group.
```

That is the point: `private` tells a colleague "do not build on this; use the mart". Access rules only apply to models, not to snapshots, seeds or sources. Only mark a model `public` when it also has a contract, because `public` is a promise that it will stay stable. That is why `fct_order_lines` is public and the other marts stay protected until they have contracts too.

## Personal data: tag it before you share it

ShopLink's `customers` table holds email addresses. Some customers are schools and businesses, but an email address usually identifies a real person, and under Nigeria's Data Protection Act 2023 you must know where personal data is and limit who sees it. The first step is simply knowing which columns contain it.

Tag the email column everywhere it appears: the source, `stg_customers` and the `snp_customers` snapshot, which keeps every version of every email. From dbt Core 1.9 onwards, column `meta` and `tags` sit under `config:`:

```yaml
sources:
  - name: shoplink
    tables:
      - name: customers
        columns:
          - name: email
            description: Customer contact email. Personal data.
            config:
              meta:
                contains_pii: true
              tags: ['pii']
```

In `models/staging/_stg_models.yml`:

```yaml
models:
  - name: stg_customers
    config:
      meta:
        contains_pii: true
    columns:
      - name: email
        description: Customer contact email, trimmed and lower-cased. Personal data; do not export.
        config:
          meta:
            contains_pii: true
          tags: ['pii']
```

Add the same `columns:` entry for `email` to `snp_customers` in `snapshots/snp_customers.yml`, alongside its `config:` block.

`dim_customer` has no `email` column at all: the dimension you built in Modules 6 and 7 leaves it out on purpose. That is the best protection there is. A column that never reaches the mart cannot leak from it, and nobody has to remember to mask it.

Once every personal data column is tagged, you can answer "where do we hold customer emails?" in seconds from the docs site. In Snowflake, tags like these can drive masking policies that hide the value from roles that should not see it. The first question to ask before adding a personal data column to a mart is: does anyone actually need it? Often an analyst needs `customer_id`, not an email.

## Documentation is governance

Everything above only helps if people can find it. The `dbt docs` site you built in Module 6 is ShopLink's catalogue: descriptions, owners, tests, contracts, lineage and PII tags in one place. Three habits make it useful:

- **Describe grain and business rules, not just column names.** "Net revenue in naira: quantity * unit_price * (1 - discount_pct / 100), excluding cancelled and returned orders" beats "net revenue".
- **Record who uses a mart.** An exposure is a short YAML entry that names a dashboard or report, its owner and the models it depends on. It appears in the lineage graph, so before you change `fct_order_lines` you can see that the finance revenue report reads it.
- **Keep the docs in the pull request.** A model change without a description change is an unfinished change. Reviewers should check both.

## Resources

- docs: [Model access](https://docs.getdbt.com/docs/mesh/govern/model-access) · dbt Labs · Groups, private, protected and public, with the error messages you will see.
- docs: [Groups](https://docs.getdbt.com/docs/build/groups) · dbt Labs · Defining groups and owners.
- docs: [meta](https://docs.getdbt.com/reference/resource-configs/meta) · dbt Labs · Where `meta` goes for models and columns, including the PII example.
- docs: [Exposures](https://docs.getdbt.com/docs/build/exposures) · dbt Labs · Recording which dashboards and reports depend on your models.
- watch: [Data Governance Explained](https://www.youtube.com/watch?v=24Ki4Ck4Y2E) · IBM Technology · 1.8M subscribers · 140K views · 2.3K likes · published 2022-05-20 · checked 2026-09-27 · 8 min

## Practice

1. Create a `sales_analytics` group with an owner, and assign every model in your project to it.
2. Set `access` by folder: `protected` for staging and marts and `private` for intermediate, then set `access: public` on `fct_order_lines`, the contracted mart. Run `dbt parse` and fix any access errors.
3. Add `meta` with `owner`, `business_owner` and `tier` to each mart.
4. Tag the `email` column in the source, `stg_customers` and `snp_customers` with `contains_pii: true` and the `pii` tag.
5. Run `dbt docs generate` and `dbt docs serve`, open `stg_customers` and check that the owner and PII tags appear.

## Example answer

After steps 1 and 2, `dbt parse` completes with no errors. If you get an access error, it usually means a model outside the intermediate folder refs an intermediate model directly; either route it through the mart or relax that model to `protected`.

For step 3, a `dim_customer` entry:

```yaml
models:
  - name: dim_customer
    description: One row per version of each ShopLink customer (SCD Type 2, from snp_customers).
    config:
      meta:
        owner: analytics@shoplink.example
        business_owner: Head of Sales
        tier: 1
        contains_pii: false
```

`contains_pii` is `false` because `dim_customer` has no `email` column.

For step 4, `email` is tagged in three places: `sources.shoplink.customers`, `stg_customers` and `snp_customers`. There is nothing to tag in `dim_customer`, because it leaves email out. In the docs site, the `stg_customers` page shows the group owner under "Details", the `meta` values in the model and column panels, and the `pii` tag on the email column. Other valid answers put the `owner` only in the group rather than repeating it in `meta`; what matters is that anyone reading the docs can find a named owner for every mart.

# Quiz

passing_score: 70

### Every unique, not_null and relationships test on fct_order_lines passes, but one line was sold for ₦8,500 on a product that cost ₦575,000. Which kind of check would catch this?

- [ ] A stricter unique test on order_line_id
- [x] A business-rule test comparing unit price with unit cost
- [ ] Source freshness on the orders table
- [ ] An accepted_values test on order status

> The row is structurally valid, so structural tests pass. Only a rule that encodes business knowledge (never sell below cost) finds an accuracy problem like this.

### ShopLink's dbt source freshness shows ERROR STALE for orders, because the latest updated_at is weeks old. What should you do?

- [ ] Raise error_after to 365 days so the check passes
- [ ] Delete the freshness block until the data is newer
- [x] Treat it as a real signal: confirm the timestamp, tell the data owner and consumers, and document why this historical extract is stale
- [ ] Run dbt build, since build will refresh the source

> A freshness check that is loosened until it passes can never warn you. dbt build does not load source data, and in this course the extract really is historical, so the right response is to confirm and document it.

### What does an enforced model contract on fct_order_lines guarantee?

- [ ] That every value in net_revenue is positive
- [ ] That the table is rebuilt every day
- [x] That the model returns exactly the declared columns and data types, checked before the table is built
- [ ] That only the owner's group can query the table

> Contracts check shape (column names, types and any constraints the platform enforces). Values are still checked by tests, schedules by your deployment, and access by groups and warehouse permissions.

### Why does the row-count anomaly test compare the latest month with the average of the previous three, using limits of 0.5 and 2.0, rather than requiring it to be within 10% of last month?

- [ ] Because dbt cannot compare two neighbouring months
- [x] Because ShopLink's volume has seasonal peaks and dips, and a tight limit would fire every December and January until people ignored it
- [ ] Because a three-month average is required by dbt_utils
- [ ] Because row counts are only meaningful once a year

> A check that fires on normal seasonality trains people to ignore it. Wide limits against a recent baseline still catch the failures that matter, such as a half-loaded or doubled month.

### A teammate wants to use int_order_lines_enriched, a private model in your sales_analytics group, in a new finance model outside the group. What happens, and what should they do?

- [ ] It works, because all models in one project can reference each other
- [ ] dbt builds it but logs a warning
- [x] dbt refuses to parse the project; they should build on the public mart instead
- [ ] The model builds but returns no rows

> Private models can only be referenced from inside their group. The error is intentional: it steers other teams to the stable, public, contracted mart.

# Project: ShopLink quality and governance layer

max_score: 100

## Brief

ShopLink's leadership has started using your marts in their Monday meeting, and the finance team now wants to build its month-end report on `fct_order_lines`. Before they do, they want to know the data is checked, fresh, stable in shape and properly owned. Add a quality and governance layer to your `shoplink-analytics` project on a new branch, and open a pull request for it.

## Deliverables

1. **Source freshness** on the ShopLink sources: `loaded_at_field` set to `updated_at`, `warn_after` and `error_after` on `orders` and `customers`, and freshness switched off for tables without a timestamp.
2. **A model contract** on `fct_order_lines`: `contract: {enforced: true}`, a `data_type` for every column, `not_null` constraints on the keys, explicit casts in the model and `on_schema_change` set to `fail`.
3. **At least three business-rule tests**, each a rule the business would recognise (for example: net revenue is never negative; delivered orders have a warehouse; no line is sold below cost). Choose severity deliberately.
4. **One anomaly check**: the monthly row-count test on `fct_order_lines` or an equivalent volume check.
5. **Ownership and PII**: a group with an owner covering your models, access set by folder with `fct_order_lines` as the only public model, `meta` with an owner on each mart, and the `email` column tagged as PII in the source, `stg_customers` and `snp_customers`.
6. **`DATA_QUALITY.md`** at the root of your repository. For every check above, one row or short paragraph: what it checks, where it runs, its severity, and what to do when it fails (who to tell, and what to look at first). Include a note that freshness is expected to error on the historical ShopLink extract.

Before opening the pull request, run `dbt source freshness` and `dbt build`. `dbt build` should pass apart from any tests you deliberately set to `warn`.

## How to submit

Push your branch and open a pull request into `main` in your `shoplink-analytics` repository. In the PR description, paste the summary lines from `dbt build` and `dbt source freshness`. Paste the pull request link into the submission form, and add a one-line note on anything you would like feedback on, such as a severity choice you were unsure of.

## Grading guide

| Criterion | Points |
|---|---|
| Freshness is configured correctly, with thresholds justified by an SLA | 15 |
| Contract on fct_order_lines is enforced, complete, and backed by explicit casts | 20 |
| Three or more business-rule tests that encode real rules, with sensible severity | 20 |
| Anomaly check works and its limits are explained | 15 |
| Group, owner, access and PII tags are in place and visible in the docs | 15 |
| DATA_QUALITY.md clearly explains each check and the response when it fails | 15 |
