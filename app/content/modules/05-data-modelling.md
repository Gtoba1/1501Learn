---
module: 5
title: Data Modelling
optional: false
summary: Learn dimensional modelling, the design method behind almost every analytics warehouse. You will declare the grain of a fact table, separate facts from dimensions, design a star schema with surrogate keys and an unknown member, and track history with slowly changing dimensions, then design and hand-build ShopLink's sales star schema in DuckDB.
---

# Lesson: Facts, dimensions and grain

minutes: 45

## Why raw tables are not enough

In Module 4 you answered ShopLink's leadership questions straight from the `raw` tables. Every query had to repeat the same work: join `order_lines` to `orders`, clean up the status, remove the duplicate lines, multiply quantity by price and take off the discount. Five analysts writing that SQL five times will make five slightly different choices, and you are back at the Monday meeting from Module 1 where nobody's revenue number matches.

Dimensional modelling fixes this by doing the work once and storing the result in a shape that is easy to query. The method was set out by Ralph Kimball in the 1990s and it is still how most analytics warehouses are designed, including the ones built with dbt.

A dimensional model has two kinds of table:

| Table type | What it holds | ShopLink example |
|---|---|---|
| Fact table | Measurements of a business event, usually numbers | One row per order line: quantity, unit price, net revenue |
| Dimension table | The context that describes the event: who, what, where, when | Customers, products, warehouses, dates |

A useful test: facts are the things you add up, dimensions are the things you group by and filter on. "Net revenue by state for Laptops in March" sums a fact (net revenue) and slices it by three dimensions (customer state, product category, date).

## Start from a business process

Kimball's four-step design process always starts in the same place:

1. **Choose the business process.** A process is something the business does that creates data: taking orders, shipping goods, receiving payments, counting stock. For ShopLink's first model the process is **selling**: customers placing orders.
2. **Declare the grain.** State exactly what one row of the fact table represents.
3. **Identify the dimensions.** List the who, what, where and when that describe each row.
4. **Identify the facts.** List the numbers measured at that grain.

The order matters. You choose dimensions and facts only after the grain is fixed, because the grain decides which of them are even possible.

## The grain statement

The grain is the single most important decision in a fact table. Write it as one plain sentence that anyone in the business could check:

> One row in `fct_order_lines` represents one product on one ShopLink order.

With that sentence fixed, many questions answer themselves:

- Can the table hold `product_id`? Yes, every row is about exactly one product.
- Can it hold the order's delivery fee? Not directly. A delivery fee belongs to the whole order, so putting it on every line would count it three times on a three-line order.
- How many rows should there be for batch 1? One per distinct order line: 26,773 after removing the 6 duplicates, or 26,771 once you also drop the 2 lines with a quantity of zero or less.

Choose the **lowest grain the source data supports**. ShopLink's data goes down to the order line, so an order-line fact can answer order-level, customer-level and monthly questions by summing. A fact built at order grain cannot answer "revenue by product category", because an order mixes categories. You can always roll a detailed grain up; you can never break a summary back down.

### Common grain mistakes

| Mistake | What happens |
|---|---|
| Mixing grains in one table (some rows per order, some per line) | Sums double count, and nobody can say what a row means |
| Joining a line-level table to an order-level value and summing it | Order values are repeated per line and inflated |
| Leaving duplicates in the source | The grain statement is false, so every total is too high |

The 6 duplicate rows in `raw.order_lines` are a grain problem, not just a tidiness problem. Until they are removed, "one row per order line" is not true.

## Additive, semi-additive and non-additive facts

Not every number can be summed safely. Kimball sorts facts into three groups:

| Type | Meaning | ShopLink examples |
|---|---|---|
| Additive | Can be summed across every dimension | `quantity`, `gross_amount`, `net_revenue` |
| Semi-additive | Can be summed across some dimensions but not across time | Units in stock per warehouse per day, a reseller's outstanding credit balance |
| Non-additive | Cannot be summed at all | `unit_price`, `discount_pct`, margin percentage |

Summing a semi-additive fact across time gives nonsense. If the Kano North warehouse holds 200 laptops on Monday and 180 on Tuesday, it does not hold 380 laptops. You would take the closing balance or an average instead.

Non-additive facts need care too. Adding up `discount_pct` across lines is meaningless. Store the additive parts instead, and compute the ratio at query time:

```sql
-- Average discount rate for 2025, computed from additive facts
select
    1 - sum(net_amount) / sum(gross_amount) as effective_discount_rate
from star.fct_order_lines
where date_key between 20250101 and 20251231;
```

This is why the ShopLink fact stores `gross_amount` and `net_amount` as well as `unit_price` and `discount_pct`: the two amounts can be summed, and any percentage can be derived from them.

## Resources

- docs: [Dimensional Modeling Techniques](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/) · Kimball Group · The index of every Kimball technique. Keep it open for the whole module.
- docs: [Four-Step Dimensional Design Process](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/four-4-step-design-process/) · Kimball Group · Business process, grain, dimensions, facts, in that order.
- docs: [Grain](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/grain/) · Kimball Group · Why the grain must be declared before anything else.
- docs: [Additive, Semi-Additive, Non-Additive Facts](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/additive-semi-additive-non-additive-fact/) · Kimball Group · A short reference page.
- read: [A Dimensional Modeling Manifesto](https://www.kimballgroup.com/1997/08/a-dimensional-modeling-manifesto/) · Kimball Group · Kimball's 1997 case for dimensional models over normalised ones. Still worth reading in full.
- watch: [Dimensional Data Model Tutorial: A Kimball Style Data Model](https://www.youtube.com/watch?v=gQisQHPhjwU) · nullQueries · 18.4K subscribers · 35.5K views · 1,039 likes · published 2021-06-15 · checked 2026-09-27 · 7 min
- watch: [Types of Facts: Data Warehouse Concepts](https://www.youtube.com/watch?v=luum7NikCm0) · aroundBI · 12.6K subscribers · 81.8K views · 952 likes · published 2017-07-06 · checked 2026-09-27 · 6 min

## Practice

ShopLink wants to model two more business processes later. For each one, write:

1. A one-sentence grain statement.
2. Three dimensions.
3. Two facts, labelled additive, semi-additive or non-additive.

The processes:

- **A. Payments.** Customers pay invoices by bank transfer, sometimes in several instalments per order.
- **B. Warehouse stock.** At midnight each day, each warehouse records how many units of each product it holds.

Then, using your Module 4 knowledge, run this against `shoplink.duckdb` and explain in one sentence why the two numbers differ:

```sql
select count(*) as all_rows, count(distinct order_line_id) as distinct_lines
from raw.order_lines;
```

## Example answer

**A. Payments.** Grain: one row per payment instalment received from a customer. Dimensions: customer, date received, payment method (transfer, POS, cash deposit), and the order the payment is for. Facts: `amount_paid` (additive), `days_after_invoice` (non-additive: an average makes sense, a sum does not).

**B. Warehouse stock.** Grain: one row per product per warehouse per day. Dimensions: product, warehouse, date. Facts: `units_on_hand` (semi-additive: sum across products and warehouses, never across days), `stock_value_at_cost` (also semi-additive, for the same reason).

This is a *periodic snapshot* fact table, a different kind from the *transaction* fact you are building for sales. Other reasonable answers: a payments grain of "one row per bank transaction" is fine if one transfer can never cover two orders.

The query returns 26,779 rows but 26,773 distinct order line IDs, because 6 rows are exact duplicates of other rows, so the table does not yet match the grain "one row per order line".

# Lesson: The star schema

minutes: 50

## What a star schema looks like

A star schema puts one fact table in the middle and joins each dimension to it directly. Drawn out, the dimensions sit around the fact like the points of a star.

For ShopLink sales:

```text
                 dim_date
                     |
  dim_customer --- fct_order_lines --- dim_product
                     |
               dim_warehouse
```

Each dimension has a primary key, and the fact table holds one foreign key per dimension plus its numeric facts. Every question follows the same pattern: join the fact to the dimensions you need, filter, group and sum.

```sql
-- Net revenue by customer state and product category, 2025
select
    c.state,
    p.category,
    sum(f.net_revenue) as net_revenue
from star.fct_order_lines as f
join star.dim_customer as c on f.customer_key = c.customer_key
join star.dim_product  as p on f.product_key  = p.product_key
join star.dim_date     as d on f.date_key     = d.date_key
where d.year = 2025
group by 1, 2
order by net_revenue desc;
```

No status cleaning, no deduplication, no revenue formula. All of that was done once when the tables were built.

## Normalised, star and snowflake

ShopLink's app database is **normalised** (third normal form). Each fact about the world is stored once: a product's category lives in `products`, the customer's state lives in `customers`. That is right for an app that inserts and updates single rows all day, because there is only one place to change anything.

It is awkward for analysis. Questions need many joins, and the business logic (what counts as revenue, which statuses are valid) is not stored anywhere.

| Design | Shape | Good for | Weakness |
|---|---|---|---|
| Normalised (3NF) | Many narrow tables, no repetition | Apps writing single rows | Many joins; logic lives in every query |
| Star schema | One fact, wide flat dimensions | Analysis and BI | Some repeated values in dimensions |
| Snowflake schema | A star whose dimensions are normalised further | Saving a little storage | More joins, slower to write and read |

A **snowflake** would split `dim_product` into `dim_product` and a separate `dim_category` table, and `dim_customer` into `dim_customer` and `dim_state`. Kimball's advice, which most teams follow, is to keep dimensions flat. Repeating the word "Laptops" on 59 product rows costs almost nothing in a columnar database like DuckDB or Snowflake, and it saves every analyst a join.

## Conformed dimensions

A dimension is **conformed** when several fact tables share it, with the same keys and the same meaning. Later in the course ShopLink might add `fct_payments` and `fct_returns`. If all three use the same `dim_customer`, you can put revenue, payments and returns side by side for one customer, and "Lagos" means the same thing in every report.

The alternative, where each fact table has its own customer table with its own cleaning rules, brings back the problem of numbers that do not match. Build each dimension once and reuse it.

## The date dimension

You could filter on `order_date` directly, so why have a `dim_date` table at all? Because the business thinks about dates in ways a raw date column cannot express:

- Month names and year-month labels for reports ("2026-03", "March").
- Quarters, and ShopLink's financial year if it differs from the calendar year.
- Weekend flags, and Nigerian public holidays (Democracy Day on 12 June, Independence Day on 1 October), which matter for a distributor's delivery schedule.

Every fact table that has a date can then join to the same, conformed calendar. A common convention is an integer key in the form `YYYYMMDD`, so 3 March 2026 is `20260303`. It is readable and sorts correctly.

DuckDB can generate a calendar with `range()`:

```sql
create schema if not exists star;

create or replace table star.dim_date as
select
    cast(strftime(d, '%Y%m%d') as integer) as date_key,
    cast(d as date)                        as full_date,
    year(d)                                as year,
    quarter(d)                             as quarter,
    month(d)                               as month,
    strftime(d, '%B')                      as month_name,
    strftime(d, '%Y-%m')                   as year_month,
    isodow(d)                              as day_of_week,   -- 1 = Monday, 7 = Sunday
    strftime(d, '%A')                      as day_name,
    isodow(d) in (6, 7)                    as is_weekend
from range(date '2024-01-01', date '2027-01-01', interval 1 day) as t(d);
```

That gives 1,096 rows, one per day from 1 January 2024 to 31 December 2026, which covers every ShopLink order with room to spare.

## Degenerate dimensions

`order_id` is on every fact row, but there is no `dim_order` table. All the useful attributes of an order (customer, warehouse, date, status, channel) are already in the fact or its dimensions. Kimball calls a key like this a **degenerate dimension**: a dimension key with no table behind it. It is still useful for counting orders (`count(distinct order_id)`) and for tracing a row back to the app.

Small descriptive values that belong to the order, such as `order_status` and `channel`, can sit on the fact too. With only five statuses and three channels, a separate dimension table would add a join and little else.

## Why BI tools like stars

You will not build dashboards in this course, but the tables you build are what BI tools read. Power BI, Tableau and Looker all work best on star schemas:

- Filters flow in one direction, from dimension to fact, so a slicer on "state" behaves predictably.
- There is exactly one join path between any two tables, so the tool never has to guess.
- Wide, flat dimensions become the fields users drag onto a report, with friendly names.

Microsoft's own Power BI guidance tells modellers to shape data as a star before building anything, which is a good sign that the design you learn here is what employers expect.

## Resources

- docs: [Star Schemas and OLAP Cubes](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/star-schema-olap-cube/) · Kimball Group · The definition of a star schema in two paragraphs.
- docs: [Conformed Dimensions](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/conformed-dimension/) · Kimball Group · Why shared dimensions make facts comparable.
- docs: [Calendar Date Dimensions](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/calendar-date-dimension/) · Kimball Group · What a date dimension should contain.
- docs: [Snowflaked Dimensions](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/snowflake-dimension/) · Kimball Group · Why Kimball recommends flattening them.
- docs: [Degenerate Dimensions](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/degenerate-dimension/) · Kimball Group · Order numbers and similar keys with no table behind them.
- read: [Building a Kimball dimensional model with dbt](https://docs.getdbt.com/blog/kimball-dimensional-model) · dbt Labs · A worked example of the same design you are learning, built in dbt. Useful preview for Module 6.
- read: [Understand star schema and the importance for Power BI](https://learn.microsoft.com/en-us/power-bi/guidance/star-schema) · Microsoft Learn · Why BI tools expect stars.
- watch: [Data Modeling Tutorial: Star Schema (aka Kimball Approach)](https://www.youtube.com/watch?v=gRE3E7VUzRU) · Kahan Data Solutions · 60.2K subscribers · 220.1K views · 3,670 likes · published 2023-01-11 · checked 2026-09-27 · 17 min

## Practice

1. Run the `dim_date` SQL above against `shoplink.duckdb`. Then write a query that counts how many weekend days fall in each year of `star.dim_date`.
2. ShopLink's operations team asks: "Which warehouse ships the most Networking products to schools?" List the tables in the star schema you would join, and the column from each you would filter or group on.
3. A colleague proposes a snowflake: `dim_product` joins to `dim_brand`, which joins to `dim_category`. Write two or three sentences explaining to them why you would keep `dim_product` flat.

## Example answer

1. Weekend days per year:

```sql
select year, count(*) as weekend_days
from star.dim_date
where is_weekend
group by year
order by year;
```

This returns 104 for each of 2024, 2025 and 2026.

2. Join `fct_order_lines` to `dim_warehouse` (group by `warehouse_name`), `dim_product` (filter `category = 'Networking'`) and `dim_customer` (filter `customer_type = 'school'`), then sum `quantity` or `net_revenue`. `dim_date` is only needed if they want a time period.

3. "Brand and category are just attributes of a product, and there are only 120 products, so repeating 'Laptops' or 'HP' on each row costs nothing in a columnar database. Keeping them in `dim_product` means analysts write one join instead of three, and BI tools see one simple path from the fact to every product attribute."

# Lesson: Surrogate keys

minutes: 40

## Natural keys and their problems

A **natural key** (also called a business key) is the identifier the source system uses: `customer_id`, `product_id`, `order_line_id`. It is tempting to use these as the keys in your star schema. It works at first, then causes trouble:

- **History.** In the next lesson, one customer can have several rows in `dim_customer`, one per version of their details. `customer_id = 358` would then appear twice, so it can no longer be the primary key.
- **Several sources.** If ShopLink buys a competitor, both companies will have a customer 358. Natural keys from different systems collide.
- **Reuse and change.** Some systems recycle IDs after a record is deleted, or change key formats during a migration.
- **Missing values.** An orphan order points at a customer that is not there. A natural key gives you nothing to join to.

A **surrogate key** is a key the warehouse creates itself, with no business meaning. The dimension uses it as its primary key, and the fact table stores it instead of the natural key. Keep the natural key in the dimension as an ordinary column, so people can still look customers up by the ID they know.

## Sequences or hashes

There are two common ways to make a surrogate key:

| Method | Example | Trade-off |
|---|---|---|
| A sequence (1, 2, 3...) | `row_number() over (order by customer_id)` | Small and fast, but the numbers can change every time you rebuild the table |
| A hash of the natural key | `md5(cast(customer_id as varchar))` | Same input always gives the same key, on every rebuild and every machine |

Modern ELT teams use hashes. Because the tables are rebuilt from scratch often, you need a key that comes out the same every time, so that yesterday's fact rows still point at the right dimension rows. A hash also lets the fact table compute the key on its own, without looking it up first.

DuckDB's `md5()` takes a string and returns a 32-character hexadecimal string:

```sql
select
    customer_id,
    md5(cast(customer_id as varchar)) as customer_key
from raw.customers
limit 3;
```

When the key needs more than one column, join the values with a separator before hashing. The separator stops `('1', '23')` and `('12', '3')` from producing the same string:

```sql
-- one key per customer version (you will need this for history)
md5(cast(customer_id as varchar) || '|' || cast(valid_from as varchar))
```

`md5` of a `NULL` is `NULL`, so wrap any column that might be missing in `coalesce()` before hashing. In Module 7 you will replace this hand-written SQL with a dbt macro that handles the casting and the nulls for you.

## Orphans and the unknown member

Batch 1 has 3 orders whose `customer_id` (9001, 9002 and 9003) does not exist in `raw.customers`. Those orders have 8 order lines between them. What should the fact table do with them?

- **Inner join to `dim_customer`**: the 8 lines disappear. Two of the orders are delivered, so ShopLink's revenue silently drops by about ₦50.4 million.
- **Left join**: the lines stay, but `customer_key` is `NULL`. Any report that joins fact to dimension with an inner join, which is what BI tools do by default, drops them anyway.
- **Unknown member**: add one special row to `dim_customer` that stands for "we do not know who this is", and point the orphan lines at it.

The third option is the Kimball standard. Revenue totals stay correct, no key is ever `NULL`, and the orphans show up clearly in reports as "Unknown customer" so someone can chase them.

```sql
create or replace table star.dim_customer as
select
    md5(cast(customer_id as varchar) || '|1900-01-01') as customer_key,
    customer_id,
    trim(customer_name)             as customer_name,
    lower(trim(customer_type))      as customer_type,
    coalesce(trim(city), 'Unknown') as city,
    trim(state)                     as state,
    timestamp '1900-01-01'          as valid_from,
    timestamp '9999-12-31'          as valid_to,
    true                            as is_current
from raw.customers

union all

-- the unknown member
select
    md5('unknown'), null, 'Unknown customer', 'unknown', 'Unknown', 'Unknown',
    timestamp '1900-01-01', timestamp '9999-12-31', true;
```

Ignore `valid_from`, `valid_to` and `is_current` for now: the next lesson explains them. The customer key hashes `customer_id` together with `valid_from` because, once history is tracked, each version of a customer needs its own key.

The fact table then uses `coalesce()` to fall back to the unknown key whenever the lookup fails:

```sql
coalesce(c.customer_key, md5('unknown')) as customer_key
```

The same idea handles the 12 customers with no city: rather than leaving a `NULL` that shows as a blank in reports, the dimension says 'Unknown'. Give every dimension an unknown member, even if it has no orphans today. Tomorrow's data might.

## Resources

- docs: [Dimension Surrogate Keys](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/dimension-surrogate-key/) · Kimball Group · Why dimensions need keys the warehouse controls.
- read: [Surrogate keys in dbt: integers or hashes?](https://docs.getdbt.com/blog/sql-surrogate-keys) · dbt Labs · The case for hashed keys in ELT pipelines.
- read: [The guide to surrogate keys](https://www.getdbt.com/blog/guide-to-surrogate-key) · dbt Labs · Short definition with examples.
- watch: [Why Surrogate Keys are used in Data Warehouse](https://www.youtube.com/watch?v=OjoOSWusBsc) · aroundBI · 12.6K subscribers · 147.4K views · 2,222 likes · published 2017-10-14 · checked 2026-09-27 · 7 min
- watch: [Do You Still Need Surrogate Keys in Modern Data Warehouses?](https://www.youtube.com/watch?v=51He_8RBcyk) · Guy in a Cube · 559K subscribers · 10.6K views · 334 likes · published 2026-06-04 · checked 2026-09-27 · 7 min

## Practice

1. Write a query against `raw.orders` and `raw.customers` that lists the orphan orders: order ID, the missing customer ID and the order status.
2. Write the SQL for `star.dim_warehouse` with an md5 surrogate key and an unknown member row. Columns: `warehouse_key`, `warehouse_id`, `warehouse_name`, `city`, `state`, `opened_date`.
3. Explain in two sentences why `row_number()` would be a risky way to create `warehouse_key` if the table is rebuilt every night.

## Example answer

1. Orphan orders:

```sql
select o.order_id, o.customer_id, o.status
from raw.orders as o
left join raw.customers as c
    on o.customer_id = c.customer_id
where c.customer_id is null;
```

It returns 3 rows, for customer IDs 9001, 9002 and 9003.

2. Warehouse dimension:

```sql
create or replace table star.dim_warehouse as
select
    md5(cast(warehouse_id as varchar)) as warehouse_key,
    warehouse_id,
    warehouse_name,
    city,
    state,
    opened_date
from raw.warehouses

union all

select md5('unknown'), null, 'Unknown warehouse', 'Unknown', 'Unknown', null;
```

That gives 6 rows: the 5 warehouses plus the unknown member.

3. `row_number()` numbers rows by their position, so if a warehouse is added, or the sort order changes, existing warehouses can get different numbers on the next rebuild. Any fact rows still holding the old numbers would then point at the wrong warehouse, whereas an md5 of `warehouse_id` is the same every time.

# Lesson: Slowly changing dimensions

minutes: 55

## Dimensions change

Facts describe events that happened and do not change. Dimensions describe things, and things change. A reseller moves to another city. A business customer is reclassified as a reseller. A product is renamed or discontinued. These changes are slow, a few per month rather than thousands per second, so Kimball calls these tables **slowly changing dimensions** (SCDs).

The question is what the warehouse should do when a dimension attribute changes. There is no single right answer: it depends on what the business needs to report. Kimball numbered the options.

## The four types you need

| Type | What happens on a change | History kept? | ShopLink example |
|---|---|---|---|
| Type 0 | Never change the value; keep the original | Original value only | `created_at`: the date a customer first signed up |
| Type 1 | Overwrite the old value | No | Correcting a typo in `customer_name` |
| Type 2 | Close the old row and add a new row | Full history | A reseller moving state |
| Type 3 | Keep the old value in an extra column | One previous value | `previous_customer_type` next to `customer_type` |

Most real dimensions mix types by column. In `dim_customer` you might treat `customer_name` as Type 1 (always show the current spelling), `created_at` as Type 0, and `city`, `state` and `customer_type` as Type 2, because those drive revenue reports by region and segment.

## A worked example: a reseller moves from Kano to Lagos

Here is a made-up example. Suppose a reseller called Sahel Gadgets, customer 777, has been ordering from its shop in Kano since 2024. On 1 March 2026 it moves its business to Lagos. Its orders before March were worth ₦80 million; after the move it orders another ₦20 million.

Leadership asks: "What was our revenue from Kano customers in 2025?"

**With Type 1** you overwrite the state. The customer row now says Lagos:

| customer_id | customer_name | city | state |
|---|---|---|---|
| 777 | Sahel Gadgets | Ikeja | Lagos |

Every past order now joins to Lagos. The 2025 Kano report quietly loses ₦80 million that really was sold in Kano, and last year's report, if you run it again today, gives a different answer from the one you presented last year. For state-level reporting that is wrong.

**With Type 2** you keep both versions, each with the dates it was true:

| customer_key | customer_id | customer_name | city | state | valid_from | valid_to | is_current |
|---|---|---|---|---|---|---|---|
| a3f1... | 777 | Sahel Gadgets | Kano | Kano | 1900-01-01 | 2026-03-01 | false |
| 9c07... | 777 | Sahel Gadgets | Ikeja | Lagos | 2026-03-01 | 9999-12-31 | true |

Now each order joins to the version that was true **on the order date**. The ₦80 million stays in Kano, the ₦20 million goes to Lagos, and last year's report gives the same answer it always did.

**With Type 3** you add a column:

| customer_id | state | previous_state |
|---|---|---|
| 777 | Lagos | Kano |

That supports "compare customers by where they are now and where they were before", but only for one change. If Sahel Gadgets moves again to Abuja, the Kano history is lost. Type 3 is rare in practice.

## The Type 2 columns

A Type 2 dimension adds a few columns that every version row carries:

| Column | Meaning |
|---|---|
| `customer_key` | Surrogate key for this version. Hash of `customer_id` and `valid_from`, so each version has its own key |
| `customer_id` | The natural key. Repeats across versions of the same customer |
| `valid_from` | When this version became true |
| `valid_to` | When it stopped being true. The current version gets a far-future date such as `9999-12-31` |
| `is_current` | `true` for the latest version only. Handy for "where are our customers now?" questions |

Two conventions make the joins simpler:

- Use `9999-12-31` rather than `NULL` for the current version's `valid_to`, so a plain range comparison works without special cases.
- Give each customer's **first** version a `valid_from` of `1900-01-01`. The source only tells you when a record was last updated, not what it looked like before, so treating the earliest known version as always true means old orders still find a match.

Ranges are half-open: a version is valid from `valid_from` up to, but not including, `valid_to`. That way a timestamp exactly on the change date matches exactly one version.

## The point-in-time join

When you build the fact table, join each order to the customer version that was valid on the order date:

```sql
left join star.dim_customer as c
    on o.customer_id = c.customer_id
   and o.order_date >= c.valid_from
   and o.order_date <  c.valid_to
```

Because the fact stores that version's `customer_key`, later reports need only a simple equality join, `f.customer_key = c.customer_key`, and they automatically get the history right. For the "where are they now" view, join on `customer_id` and filter `is_current`.

In batch 1 each customer has only one version, so this join behaves like a normal one. In Module 7, batch 2 brings real changes (20 customers moved or changed type) and you will watch the second versions appear.

## Resources

- docs: [Type 0: Retain Original](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/type-0/) · Kimball Group · The first of the numbered SCD pages. Follow the links to Types 1, 2 and 3.
- docs: [Type 2: Add New Row](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/type-2/) · Kimball Group · The standard way to keep full history.
- docs: [Type 3: Add New Attribute](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/type-3/) · Kimball Group · The "previous value" column approach.
- watch: [Understand Slowly Changing Dimensions](https://www.youtube.com/watch?v=Sg2AAk1vwEs) · Bryan Cafferky · 49.2K subscribers · 31K views · 978 likes · published 2020-10-06 · checked 2026-09-27 · 23 min
- watch: [SCD Type 1 and Type 2 using SQL: Implementation of Slowly Changing Dimensions](https://www.youtube.com/watch?v=kii_Kukh4po) · Ankit Bansal · 188K subscribers · 46.2K views · 785 likes · published 2024-04-11 · checked 2026-09-27 · 29 min
- deeper: [The Data Warehouse Toolkit, 3rd Edition](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/books/data-warehouse-dw-toolkit/) · Ralph Kimball and Margy Ross, Wiley (paid) · The standard book on dimensional modelling. Chapters 1 to 3 and 5 cover everything in this module in depth.

## Practice

For each change below, say which SCD type you would use for that column in ShopLink's warehouse, and why, in one sentence:

1. A customer's email address changes.
2. A school is reclassified as a business because it now buys for a chain of training centres.
3. A product's `list_price` goes up from ₦842,000 to ₦899,000.
4. A customer's `created_at` is sent again by the app with a later value because of a bug.

Then write the two `dim_customer` rows that a Type 2 dimension would hold for this change: customer 87, Ogunleye Pharmacy, a business in Ikeja, Lagos, is reclassified as a reseller on 2026-07-18 13:23:57. Use the column list from the lesson and write `<hash>` for the keys.

## Example answer

1. **Type 1.** Nobody reports revenue by email address, so showing only the latest, correct address is what the business wants.
2. **Type 2.** Revenue by customer type is a leadership metric, so past orders should stay under "school" and new ones count under "business".
3. **Type 1** is usually enough. The fact already stores `unit_price`, the price really charged on each line, so revenue never depends on the list price in `dim_product`. Choose Type 2 only if the business wants to analyse how list prices changed over time; both answers are acceptable if you explain that the fact holds the real price.
4. **Type 0.** The date a customer first signed up never truly changes, so keep the first value you saw and ignore later ones.

The two rows for customer 87:

| customer_key | customer_id | customer_name | customer_type | city | state | valid_from | valid_to | is_current |
|---|---|---|---|---|---|---|---|---|
| `<hash>` | 87 | Ogunleye Pharmacy | business | Ikeja | Lagos | 1900-01-01 00:00:00 | 2026-07-18 13:23:57 | false |
| `<hash>` | 87 | Ogunleye Pharmacy | reseller | Ikeja | Lagos | 2026-07-18 13:23:57 | 9999-12-31 00:00:00 | true |

Check that the first row's `valid_to` equals the second row's `valid_from` exactly, with no gap and no overlap, and that only the second row is current.

# Quiz

passing_score: 70

### What is the grain of ShopLink's fct_order_lines table?

- [ ] One row per order
- [x] One row per product on one order
- [ ] One row per customer per month
- [ ] One row per product per warehouse per day

> The grain is the lowest level the source supports: the order line. Order, customer and monthly figures can all be rolled up from it by summing.

### Which of these is a semi-additive fact?

- [ ] net_revenue on an order line
- [ ] unit_price on an order line
- [x] Units in stock per warehouse at midnight each day
- [ ] Quantity ordered on an order line

> A stock balance can be summed across products and warehouses but not across days. net_revenue and quantity are fully additive; unit_price is non-additive.

### Three ShopLink orders point to customer IDs that do not exist. What does the Kimball approach do with their order lines?

- [ ] Drop them with an inner join so reports only show known customers
- [ ] Keep them with a NULL customer_key
- [x] Point them at an unknown member row in dim_customer
- [ ] Delete the orders from the raw table

> An unknown member keeps revenue totals correct, avoids NULL keys that BI tools drop, and makes the orphans visible in reports.

### A reseller moves from Kano to Lagos. Leadership wants 2025 revenue by state to stay the same as it was reported last year. Which SCD type should the state column use?

- [ ] Type 0
- [ ] Type 1
- [x] Type 2
- [ ] Type 3

> Type 2 adds a new version row, so orders placed before the move keep joining to the Kano version and past reports do not change.

### Why do ELT teams prefer hashed surrogate keys over row_number() sequences?

- [ ] Hashes are shorter than integers
- [x] A hash of the natural key comes out the same on every rebuild, so fact rows keep pointing at the right dimension rows
- [ ] DuckDB cannot generate sequences
- [ ] Hashes make joins faster than integers

> Tables in ELT pipelines are rebuilt often. A deterministic key is stable across rebuilds; a sequence can renumber rows each time.

# Project: ShopLink sales star schema

max_score: 100

## Brief

ShopLink's leadership have approved your plan to build a proper analytics layer. Before any dbt work starts in Module 6, the team wants a design document they can review, and a hand-built prototype in DuckDB that proves the design gives the right numbers.

Design a star schema for the **selling** process with one fact table, `fct_order_lines`, and four dimensions: `dim_customer` (designed as SCD Type 2), `dim_product`, `dim_warehouse` and `dim_date`. Then build it by hand in a `star` schema inside your `shoplink.duckdb`.

## Deliverables

Work on a new branch in your `shoplink-analytics` repo, for example `feature/module-5-star-schema`, and add:

1. **`docs/star_schema.md`: the design document.** It must contain:
   - The business process and a one-sentence grain statement.
   - For each of the five tables: its purpose, its primary key, and a table of columns with type and a one-line description. Mark each fact as additive, semi-additive or non-additive.
   - How surrogate keys are generated (which columns are hashed, and the separator).
   - How the unknown member works, and how many fact rows point to it in batch 1.
   - Which `dim_customer` columns are Type 1 and which are Type 2, and why.
   - The rules the fact applies: which duplicates are removed, which lines are excluded, and the net revenue definition.
2. **An ERD.** Draw the five tables and their relationships in any tool, for example [dbdiagram.io](https://dbdiagram.io/), draw.io or Lucidchart. Export it as a PNG into `docs/` and embed it in `star_schema.md`. If you use dbdiagram.io, commit the DBML text too.
3. **`sql/build_star_schema.sql`.** One script that creates the `star` schema and all five tables from the `raw` schema. Anyone should be able to run it top to bottom and get the same result.
4. **`sql/check_star_schema.sql`.** At least four check queries with their results pasted as comments, including: fact row count against distinct order lines in raw; no `NULL` keys in the fact; total net revenue for 2025 compared with the same figure from your Module 4 SQL; and the number of fact rows on the unknown customer.

## How to submit

Commit your work, push the branch and open a pull request into `main` titled "Module 5: star schema design". In the PR description, summarise the design in three or four sentences and state your 2025 net revenue figure. Paste the pull request link into the submission form, with a one-line note on anything you would like feedback on.

## Grading guide

| Criterion | Points |
|---|---|
| Grain statement is precise and every fact and dimension is consistent with it | 15 |
| Column lists are complete, with keys and fact additivity correctly labelled | 20 |
| Surrogate keys, unknown members and SCD Type 2 columns are designed correctly | 20 |
| ERD is clear and matches the SQL | 10 |
| Build script runs cleanly from the raw schema and produces the designed tables | 20 |
| Check queries prove the numbers: row counts, no NULL keys, revenue reconciles with Module 4 | 15 |
