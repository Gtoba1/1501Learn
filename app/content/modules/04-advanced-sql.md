---
module: 4
title: Advanced SQL
optional: false
summary: Move from writing queries that run to writing queries you can trust and maintain. Using DuckDB and ShopLink's raw tables, you structure logic with CTEs, rank and compare rows with window functions, clean and reshape messy data with CASE, conditional aggregation, pivots and date spines, find orphans with anti-joins, and read query plans to catch row explosions and wasted work. The module ends with you answering ShopLink's five leadership questions in SQL.
---

# Lesson: CTEs: writing SQL people can read

minutes: 45

## The problem with nested queries

This query calculates ShopLink's net revenue per month. It works, but reading it means starting in the middle and working outwards:

```sql
SELECT order_month, sum(line_revenue) AS net_revenue
FROM (
    SELECT
        date_trunc('month', o.order_date) AS order_month,
        ol.quantity * ol.unit_price * (1 - ol.discount_pct / 100) AS line_revenue
    FROM raw.order_lines AS ol
    JOIN (
        SELECT order_id, order_date
        FROM raw.orders
        WHERE lower(trim(status)) NOT IN ('cancelled', 'returned')
    ) AS o ON ol.order_id = o.order_id
) AS lines
GROUP BY order_month
ORDER BY order_month;
```

Now imagine five levels of nesting, and a reviewer asking "where exactly are returned orders removed?". Nested subqueries hide the steps of your logic.

## Common table expressions

A common table expression (CTE) gives a subquery a name, defined up front with `WITH`. The same query becomes a list of named steps, read top to bottom:

```sql
WITH valid_orders AS (
    SELECT order_id, order_date
    FROM raw.orders
    WHERE lower(trim(status)) NOT IN ('cancelled', 'returned')
),

order_line_revenue AS (
    SELECT
        vo.order_date,
        ol.quantity * ol.unit_price * (1 - ol.discount_pct / 100) AS line_revenue
    FROM raw.order_lines AS ol
    JOIN valid_orders AS vo
        ON ol.order_id = vo.order_id
)

SELECT
    date_trunc('month', order_date) AS order_month,
    round(sum(line_revenue)) AS net_revenue
FROM order_line_revenue
GROUP BY order_month
ORDER BY order_month;
```

The rules:

- Start with `WITH`, then `name AS ( ... )`. Separate CTEs with commas. There is no comma before the final `SELECT`.
- Each CTE can read from any CTE defined above it.
- A CTE exists only for the query it belongs to. It is not saved anywhere.
- Name CTEs for what they contain (`valid_orders`), not how they were made (`subquery2`).

A note on `discount_pct / 100`: in DuckDB, `/` always does true division, so `5 / 100` is `0.05`. Some databases do integer division when both sides are whole numbers, turning `5 / 100` into `0`. If you ever see revenue with no discount applied, check this first. (DuckDB uses `//` for integer division.)

## Chaining CTEs: a clean base for ShopLink

Chaining CTEs lets you build logic in small, testable steps. Here is a pattern you will reuse for every ShopLink question in this module. It fixes the problems you found in Module 3 before calculating anything:

```sql
WITH orders_clean AS (
    SELECT
        order_id,
        customer_id,
        warehouse_id,
        order_date,
        channel,
        lower(trim(status)) AS status
    FROM raw.orders
),

order_lines_clean AS (
    SELECT DISTINCT *              -- removes the 6 exact duplicate rows
    FROM raw.order_lines
    WHERE quantity > 0             -- drops the 2 invalid lines
),

revenue_lines AS (
    SELECT
        ol.order_line_id,
        ol.order_id,
        ol.product_id,
        o.customer_id,
        o.warehouse_id,
        o.order_date,
        ol.quantity * ol.unit_price * (1 - ol.discount_pct / 100) AS net_revenue
    FROM order_lines_clean AS ol
    JOIN orders_clean AS o
        ON ol.order_id = o.order_id
    WHERE o.status NOT IN ('cancelled', 'returned')
)

SELECT
    customer_id,
    count(DISTINCT order_id) AS orders,
    round(sum(net_revenue)) AS net_revenue
FROM revenue_lines
GROUP BY customer_id
ORDER BY net_revenue DESC
LIMIT 5;
```

```text
customer_id  orders  net_revenue
77           146     13864671600
61           186      9231911550
69           117      8869913725
92           194      7886022975
200          164      7845438200
```

Customer 77 has spent about ₦13.9 billion across 146 orders. Each CTE does one job, so a reviewer can check each one on its own.

## Debugging a chain

When a chained query gives a strange number, check each step. Temporarily replace the final `SELECT` with a query against one CTE:

```sql
WITH orders_clean AS (
    SELECT order_id, lower(trim(status)) AS status
    FROM raw.orders
)

SELECT status, count(*) AS orders
FROM orders_clean
GROUP BY status
ORDER BY status;
```

```text
status     orders
cancelled     562
delivered    8106
pending        41
returned      291
shipped        91
```

Five clean values, adding up to 9,091. That step is correct, so move on to the next. This habit of checking one CTE at a time is exactly how you will debug dbt models, where each CTE often becomes its own model.

## Recursive CTEs, briefly

A recursive CTE refers to itself. It starts with an anchor row and keeps adding rows until a condition stops it. You rarely need one in analytics, but you will meet them for hierarchies (managers and staff, product categories and subcategories) and for generating sequences. This one generates the first day of every month in ShopLink's data:

```sql
WITH RECURSIVE months(month_start) AS (
    SELECT DATE '2024-01-01'                         -- anchor: the first row
    UNION ALL
    SELECT CAST(month_start + INTERVAL 1 MONTH AS DATE)
    FROM months                                      -- refers to itself
    WHERE month_start < DATE '2026-06-01'            -- stop condition
)

SELECT * FROM months;
```

It returns 30 rows, from 2024-01-01 to 2026-06-01. Always include a stop condition, or the query runs forever. For date sequences DuckDB has a simpler tool, `generate_series`, which you will use in lesson 3.

## Resources

- docs: [WITH clause](https://duckdb.org/docs/stable/sql/query_syntax/with) · DuckDB · CTEs and recursive CTEs in the dialect you are using.
- docs: [WITH queries (common table expressions)](https://www.postgresql.org/docs/16/queries-with.html) · PostgreSQL · The clearest reference on CTEs, including how recursion works.
- docs: [PostgreSQL: Queries](https://www.postgresql.org/docs/16/queries.html) · PostgreSQL · The full chapter on joins, table expressions, grouping and CTEs. Standard SQL that DuckDB follows closely.
- watch: [SQL WITH Clause | How to write SQL Queries using WITH Clause | SQL CTE (Common Table Expression)](https://www.youtube.com/watch?v=QNfnuK-1YYY) · techTFQ · 405K subscribers · 800K views · 17,632 likes · published 2021-09-05 · checked 2026-09-27 · 25 min
- watch: [How Much SQL Do You ACTUALLY Need? (Data Analyst vs Data Engineer vs Data Scientist)](https://www.youtube.com/watch?v=gq8OUt8hpIA) · techTFQ · 405K subscribers · 34.5K views · 409 likes · published 2026-09-22 · checked 2026-09-27 · 8 min
- read: [Mode SQL Tutorial for Data Analysis](https://mode.com/sql-tutorial/introduction-to-sql/?force_isolation=true) · Mode · A free tutorial from basics to advanced. Use the advanced section to fill any gaps.
- deeper: [SQL for Data Analysis](https://www.oreilly.com/library/view/sql-for-data/9781492088776/) · Cathy Tanimura, O'Reilly (paid) · Chapter 8 covers building complex queries with CTEs.

## Practice

Open `shoplink.duckdb` in the DuckDB CLI from your repo root.

1. Rewrite the nested monthly revenue query from the start of this lesson using the three-CTE clean base (`orders_clean`, `order_lines_clean`, `revenue_lines`), so duplicates and invalid quantities are removed.
2. Add a fourth CTE, `monthly_revenue`, and make the final `SELECT` return only months where net revenue was above ₦15 billion.
3. Check your `order_lines_clean` step on its own: how many rows does it return?

## Example answer

```sql
WITH orders_clean AS (
    SELECT order_id, order_date, lower(trim(status)) AS status
    FROM raw.orders
),

order_lines_clean AS (
    SELECT DISTINCT *
    FROM raw.order_lines
    WHERE quantity > 0
),

revenue_lines AS (
    SELECT
        o.order_date,
        ol.quantity * ol.unit_price * (1 - ol.discount_pct / 100) AS net_revenue
    FROM order_lines_clean AS ol
    JOIN orders_clean AS o ON ol.order_id = o.order_id
    WHERE o.status NOT IN ('cancelled', 'returned')
),

monthly_revenue AS (
    SELECT
        date_trunc('month', order_date) AS order_month,
        sum(net_revenue) AS net_revenue
    FROM revenue_lines
    GROUP BY order_month
)

SELECT order_month, round(net_revenue) AS net_revenue
FROM monthly_revenue
WHERE net_revenue > 15000000000
ORDER BY order_month;
```

The months above ₦15 billion are all in late 2025 and 2026, which already hints at the growth you will measure in lesson 2. For step 3, `SELECT count(*) FROM (SELECT DISTINCT * FROM raw.order_lines WHERE quantity > 0)` returns 26,771: 26,779 rows, less 6 duplicates, less 2 invalid lines. Your CTE names can differ; what matters is that each step does one clear job and the filter on revenue happens after aggregation, not before.

# Lesson: Window functions

minutes: 60

## Aggregates without collapsing rows

`GROUP BY` collapses many rows into one per group. Sometimes you want to keep every row and still see something about its group: each order alongside the customer's total, each month alongside the previous month, each product with its rank in its category. That is what window functions do.

A window function has an `OVER` clause that defines the "window" of rows it looks at:

```text
function(...) OVER (
    PARTITION BY ...   -- split rows into groups (optional)
    ORDER BY ...       -- order rows inside each group (optional)
    ROWS BETWEEN ...   -- which rows around the current one to include (optional)
)
```

A simple example: each customer's share of all orders, without losing the per-customer rows.

```sql
SELECT
    customer_id,
    count(*) AS orders,
    sum(count(*)) OVER () AS all_orders,
    round(100.0 * count(*) / sum(count(*)) OVER (), 2) AS pct_of_orders
FROM raw.orders
GROUP BY customer_id
ORDER BY orders DESC, customer_id
LIMIT 3;
```

```text
customer_id  orders  all_orders  pct_of_orders
92           221     9091        2.43
61           206     9091        2.27
57           190     9091        2.09
```

`OVER ()` with nothing inside means "the whole result". Customers 57 and 128 both have 190 orders; the `customer_id` tiebreaker in `ORDER BY` makes sure the same one is shown every time. The window runs after `GROUP BY`, so it can wrap an aggregate such as `count(*)`.

## Numbering and ranking

`ROW_NUMBER()` numbers rows inside each partition. This gives every customer's orders a sequence number, first order first:

```sql
SELECT
    customer_id,
    order_id,
    order_date,
    ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date, order_id) AS order_number
FROM raw.orders
ORDER BY customer_id, order_number
LIMIT 4;
```

```text
customer_id  order_id  order_date  order_number
1            100675    2024-04-18  1
1            101816    2024-09-10  2
1            102164    2024-10-14  3
1            102938    2024-12-27  4
```

Notice the `order_id` tiebreaker in the `ORDER BY`. If a customer placed two orders on the same day, `order_date` alone would leave their order unpredictable, and your numbers could change between runs.

There are three ranking functions. They differ only in how they treat ties:

| Values | ROW_NUMBER | RANK | DENSE_RANK |
|---|---|---|---|
| ₦900m | 1 | 1 | 1 |
| ₦750m | 2 | 2 | 2 |
| ₦750m | 3 | 2 | 2 |
| ₦600m | 4 | 4 | 3 |

- `ROW_NUMBER` always gives unique numbers, breaking ties arbitrarily unless you add a tiebreaker.
- `RANK` gives ties the same rank and then skips.
- `DENSE_RANK` gives ties the same rank and does not skip.

## QUALIFY: filtering on a window

You cannot put a window function in `WHERE`, because `WHERE` runs before windows are calculated. Many databases force you to wrap the query in a CTE and filter outside. DuckDB (and Snowflake) support `QUALIFY`, which filters on window results directly:

```sql
WITH product_revenue AS (
    SELECT
        p.category,
        p.product_name,
        sum(ol.quantity * ol.unit_price * (1 - ol.discount_pct / 100)) AS net_revenue
    FROM (SELECT DISTINCT * FROM raw.order_lines WHERE quantity > 0) AS ol
    JOIN raw.orders AS o ON ol.order_id = o.order_id
    JOIN raw.products AS p ON ol.product_id = p.product_id
    WHERE lower(trim(o.status)) NOT IN ('cancelled', 'returned')
    GROUP BY p.category, p.product_name
)

SELECT
    category,
    product_name,
    round(net_revenue) AS net_revenue,
    RANK() OVER (PARTITION BY category ORDER BY net_revenue DESC) AS rank_in_category
FROM product_revenue
QUALIFY rank_in_category <= 2
ORDER BY category, rank_in_category;
```

This returns the top two products in each of the five categories. In Laptops, for example, the Dell XPS 13 8GB/256GB leads with about ₦8.2 billion.

## LAG and LEAD: comparing with other rows

`LAG` reads a value from an earlier row; `LEAD` from a later one. They are how you calculate growth, which is ShopLink's first leadership question:

```sql
WITH revenue_lines AS (
    SELECT
        o.order_date,
        ol.quantity * ol.unit_price * (1 - ol.discount_pct / 100) AS net_revenue
    FROM (SELECT DISTINCT * FROM raw.order_lines WHERE quantity > 0) AS ol
    JOIN raw.orders AS o ON ol.order_id = o.order_id
    WHERE lower(trim(o.status)) NOT IN ('cancelled', 'returned')
),

monthly AS (
    SELECT
        date_trunc('month', order_date) AS order_month,
        sum(net_revenue) AS net_revenue
    FROM revenue_lines
    GROUP BY order_month
)

SELECT
    order_month,
    round(net_revenue) AS net_revenue,
    round(LAG(net_revenue) OVER (ORDER BY order_month)) AS previous_month,
    round(100.0 * (net_revenue - LAG(net_revenue) OVER (ORDER BY order_month))
          / LAG(net_revenue) OVER (ORDER BY order_month), 1) AS mom_growth_pct
FROM monthly
ORDER BY order_month
LIMIT 4;
```

```text
order_month  net_revenue  previous_month  mom_growth_pct
2024-01-01   5404728900   NULL            NULL
2024-02-01   7099990375   5404728900      31.4
2024-03-01   6624006000   7099990375      -6.7
2024-04-01   7297155725   6624006000      10.2
```

The first month has no previous month, so `LAG` returns `NULL`. `LAG(net_revenue, 12)` would look back twelve rows, giving year-on-year growth, as long as there is exactly one row for every month (lesson 3 shows how to guarantee that).

Repeating the same `OVER (...)` gets tiresome. A `WINDOW` clause names it once:

```sql
SELECT
    order_month,
    orders,
    LAG(orders) OVER w AS previous_month_orders,
    orders - LAG(orders) OVER w AS change
FROM (
    SELECT date_trunc('month', order_date) AS order_month, count(*) AS orders
    FROM raw.orders
    GROUP BY order_month
)
WINDOW w AS (ORDER BY order_month)
ORDER BY order_month;
```

`LAG` also works on dates. Days between a customer's orders:

```sql
SELECT
    customer_id,
    order_date,
    order_date - LAG(order_date) OVER (PARTITION BY customer_id ORDER BY order_date) AS days_since_previous
FROM raw.orders
ORDER BY customer_id, order_date
LIMIT 4;
```

Subtracting two `DATE` values in DuckDB gives a whole number of days.

## Running totals and moving averages: frames

With `ORDER BY` inside `OVER`, aggregate functions such as `sum` and `avg` become running calculations. The **frame** says exactly which rows to include:

```sql
WITH monthly AS (
    SELECT
        date_trunc('month', o.order_date) AS order_month,
        sum(ol.quantity * ol.unit_price * (1 - ol.discount_pct / 100)) AS net_revenue
    FROM (SELECT DISTINCT * FROM raw.order_lines WHERE quantity > 0) AS ol
    JOIN raw.orders AS o ON ol.order_id = o.order_id
    WHERE lower(trim(o.status)) NOT IN ('cancelled', 'returned')
    GROUP BY order_month
)

SELECT
    order_month,
    round(net_revenue) AS net_revenue,
    round(sum(net_revenue) OVER (
        PARTITION BY year(order_month)
        ORDER BY order_month
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )) AS year_to_date,
    round(avg(net_revenue) OVER (
        ORDER BY order_month
        ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
    )) AS moving_avg_3m
FROM monthly
ORDER BY order_month;
```

- `year_to_date` restarts every January because of `PARTITION BY year(order_month)`.
- `moving_avg_3m` averages the current month and the two before it, which smooths out a noisy month.

Common frames:

| Frame | Meaning |
|---|---|
| `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` | Everything from the start up to this row (running total) |
| `ROWS BETWEEN 2 PRECEDING AND CURRENT ROW` | This row and the two before (3-period moving window) |
| `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING` | The whole partition |

If you write `ORDER BY` without a frame, the default is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. `RANGE` treats rows with the same `ORDER BY` value as one step, so tied rows all get the same running total. When you want one step per row, write `ROWS` explicitly.

## The deduplication pattern

This is the window function analytics engineers use most. To keep exactly one row per key, number the rows within each key and keep number 1:

```sql
SELECT *
FROM raw.order_lines
QUALIFY ROW_NUMBER() OVER (PARTITION BY order_line_id ORDER BY order_line_id) = 1;
```

This returns 26,773 rows: one per order_line_id. For ShopLink's exact duplicates, `SELECT DISTINCT *` gives the same result. The window version is more powerful because it also handles rows that share a key but differ in other columns. Then the `ORDER BY` decides which one wins. For example, when batch 2 arrives in Module 7, an order can appear twice with different statuses, and you keep the newest:

```sql
SELECT *
FROM raw.orders
QUALIFY ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY updated_at DESC) = 1;
```

The same pattern finds each customer's first order, a building block for customer analysis:

```sql
SELECT customer_id, order_id AS first_order_id, order_date AS first_order_date
FROM raw.orders
QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date, order_id) = 1;
```

## Resources

- docs: [Window functions](https://duckdb.org/docs/stable/sql/functions/window_functions) · DuckDB · Every window function, frame option and the WINDOW clause.
- docs: [QUALIFY clause](https://duckdb.org/docs/stable/sql/query_syntax/qualify) · DuckDB · Filtering on window results without a wrapper query.
- docs: [Window functions tutorial](https://www.postgresql.org/docs/16/tutorial-window.html) · PostgreSQL · A short, clear introduction to PARTITION BY and ORDER BY in windows.
- read: [SQL window functions](https://mode.com/sql-tutorial/sql-window-functions) · Mode · Worked examples of ranking, running totals and LAG/LEAD.
- watch: [SQL Window Function | How to write SQL Query using RANK, DENSE RANK, LEAD/LAG | SQL Queries Tutorial](https://www.youtube.com/watch?v=Ww71knvhQ-s) · techTFQ · 405K subscribers · 1.6M views · 44,683 likes · published 2021-05-21 · checked 2026-09-27 · 25 min
- watch: [SQL Window Functions in 10 Minutes](https://www.youtube.com/watch?v=y1KCM8vbYe4) · Colt Steele · 282K subscribers · 139K views · 5,410 likes · published 2022-10-18 · checked 2026-09-27 · 10 min
- deeper: [SQL for Data Analysis](https://www.oreilly.com/library/view/sql-for-data/9781492088776/) · Cathy Tanimura, O'Reilly (paid) · Chapters 3 and 4 use window functions for time series and cohort analysis.

## Practice

1. For each warehouse, rank the product categories by net revenue (use the clean base from lesson 1). Show only the top category per warehouse using `QUALIFY`.
2. For each customer, calculate the number of days between their first and second orders. How many customers ordered a second time within 30 days of their first order?
3. Calculate each month's net revenue and its year-on-year growth using `LAG(..., 12)`. Which month in 2025 grew fastest compared with the same month in 2024?

## Example answer

**1. Top category per warehouse:**

```sql
WITH revenue_lines AS (
    SELECT
        o.warehouse_id,
        ol.product_id,
        ol.quantity * ol.unit_price * (1 - ol.discount_pct / 100) AS net_revenue
    FROM (SELECT DISTINCT * FROM raw.order_lines WHERE quantity > 0) AS ol
    JOIN raw.orders AS o ON ol.order_id = o.order_id
    WHERE lower(trim(o.status)) NOT IN ('cancelled', 'returned')
)

SELECT
    w.warehouse_name,
    p.category,
    round(sum(rl.net_revenue)) AS net_revenue,
    RANK() OVER (PARTITION BY w.warehouse_name ORDER BY sum(rl.net_revenue) DESC) AS category_rank
FROM revenue_lines AS rl
JOIN raw.products AS p ON rl.product_id = p.product_id
JOIN raw.warehouses AS w ON rl.warehouse_id = w.warehouse_id
GROUP BY w.warehouse_name, p.category
QUALIFY category_rank = 1
ORDER BY w.warehouse_name;
```

Phones come first in four warehouses; in Abuja Central, Laptops lead. The window wraps an aggregate (`sum(...)`) because windows run after `GROUP BY`.

**2. Days from first to second order:**

```sql
WITH numbered AS (
    SELECT
        customer_id,
        order_date,
        ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date, order_id) AS order_number,
        order_date - LAG(order_date) OVER (PARTITION BY customer_id ORDER BY order_date, order_id) AS days_since_previous
    FROM raw.orders
)

SELECT count(*) AS customers_back_within_30_days
FROM numbered
WHERE order_number = 2
  AND days_since_previous <= 30;
```

The answer is 167 customers. Filtering on `order_number = 2` in an outer query (or with `QUALIFY`) keeps one row per customer: their second order, with the gap since the first.

**3. Year-on-year growth:**

```sql
WITH monthly AS (
    SELECT
        date_trunc('month', o.order_date) AS order_month,
        sum(ol.quantity * ol.unit_price * (1 - ol.discount_pct / 100)) AS net_revenue
    FROM (SELECT DISTINCT * FROM raw.order_lines WHERE quantity > 0) AS ol
    JOIN raw.orders AS o ON ol.order_id = o.order_id
    WHERE lower(trim(o.status)) NOT IN ('cancelled', 'returned')
    GROUP BY order_month
)

SELECT
    order_month,
    round(net_revenue) AS net_revenue,
    round(100.0 * (net_revenue - LAG(net_revenue, 12) OVER (ORDER BY order_month))
          / LAG(net_revenue, 12) OVER (ORDER BY order_month), 1) AS yoy_growth_pct
FROM monthly
QUALIFY year(order_month) = 2025
ORDER BY yoy_growth_pct DESC;
```

April 2025 grew fastest, up 74.8% on April 2024, with March and September 2025 close behind. Filtering to 2025 with `QUALIFY` rather than `WHERE` matters: `WHERE` would remove the 2024 rows before `LAG` could read them, and every growth figure would be `NULL`. `LAG(..., 12)` is only safe because ShopLink has an order in every month; lesson 3 shows how to guarantee one row per month with a date spine.

# Lesson: Complex transformations

minutes: 60

## Cleaning the status column

You found 24 spellings of five statuses in Module 3. The fix is a single expression, but check it before trusting it:

```sql
SELECT
    status AS raw_status,
    lower(trim(status)) AS clean_status,
    count(*) AS orders
FROM raw.orders
GROUP BY ALL
ORDER BY clean_status, raw_status;
```

Every raw value should map to one of pending, shipped, delivered, cancelled or returned. `trim` removes leading and trailing spaces and `lower` fixes the casing. If a new spelling appeared tomorrow, such as 'dispatched', this query is how you would spot it. In Module 6 you will turn this into a test that fails automatically.

## CASE: rules as code

`CASE` turns business rules into columns. Grouping statuses into what they mean for the business:

```sql
SELECT
    order_id,
    lower(trim(status)) AS status,
    CASE lower(trim(status))
        WHEN 'pending'   THEN 'open'
        WHEN 'shipped'   THEN 'open'
        WHEN 'delivered' THEN 'completed'
        WHEN 'cancelled' THEN 'lost'
        WHEN 'returned'  THEN 'lost'
        ELSE 'unknown'
    END AS status_group
FROM raw.orders;
```

Always include an `ELSE`. Without it, an unexpected value silently becomes `NULL`. With `ELSE 'unknown'`, it shows up where you can see it.

The second form of `CASE` tests conditions in order and stops at the first match. Banding ShopLink's customers by lifetime net revenue:

```sql
WITH customer_revenue AS (
    SELECT
        o.customer_id,
        sum(ol.quantity * ol.unit_price * (1 - ol.discount_pct / 100)) AS net_revenue
    FROM (SELECT DISTINCT * FROM raw.order_lines WHERE quantity > 0) AS ol
    JOIN raw.orders AS o ON ol.order_id = o.order_id
    WHERE lower(trim(o.status)) NOT IN ('cancelled', 'returned')
    GROUP BY o.customer_id
)

SELECT
    CASE
        WHEN net_revenue >= 1000000000 THEN '1. Key account (₦1bn and above)'
        WHEN net_revenue >= 250000000  THEN '2. Growth (₦250m to ₦1bn)'
        ELSE '3. Standard (under ₦250m)'
    END AS customer_band,
    count(*) AS customers
FROM customer_revenue
GROUP BY customer_band
ORDER BY customer_band;
```

```text
customer_band                        customers
1. Key account (₦1bn and above)      105
2. Growth (₦250m to ₦1bn)            117
3. Standard (under ₦250m)            162
```

Order matters: a customer with ₦2 billion also satisfies `>= 250000000`, but the first `WHEN` catches them. The number prefixes make the bands sort in a sensible order.

## Conditional aggregation

Conditional aggregation counts or sums only the rows that match a condition, inside a normal `GROUP BY`. It answers "how many of X, and how many of those were Y" in one pass. ShopLink's fifth leadership question, the cancellation rate:

```sql
SELECT
    year(order_date) AS order_year,
    count(*) AS orders,
    count(*) FILTER (WHERE lower(trim(status)) = 'cancelled') AS cancelled,
    sum(CASE WHEN lower(trim(status)) = 'returned' THEN 1 ELSE 0 END) AS returned,
    round(100.0 * count(*) FILTER (WHERE lower(trim(status)) = 'cancelled') / count(*), 1) AS cancel_rate_pct
FROM raw.orders
GROUP BY order_year
ORDER BY order_year;
```

```text
order_year  orders  cancelled  returned  cancel_rate_pct
2024        2983    199        101       6.7
2025        3963    245        131       6.2
2026        2145    118         59       5.5
```

Two ways of writing the same idea are shown:

- `count(*) FILTER (WHERE ...)` is standard SQL, supported by DuckDB, PostgreSQL and others. It reads clearly.
- `sum(CASE WHEN ... THEN 1 ELSE 0 END)` works in every database, including ones without `FILTER`.

Note `100.0` rather than `100`: it guarantees a decimal result in databases that would otherwise do integer division.

## Pivoting: rows to columns

A pivot turns the values of one column into column headers. Conditional aggregation can do it by hand:

```sql
SELECT
    year(order_date) AS order_year,
    count(*) FILTER (WHERE channel = 'web')       AS web,
    count(*) FILTER (WHERE channel = 'whatsapp')  AS whatsapp,
    count(*) FILTER (WHERE channel = 'sales_rep') AS sales_rep
FROM raw.orders
GROUP BY order_year
ORDER BY order_year;
```

DuckDB also has a `PIVOT` statement that works out the columns for you:

```sql
PIVOT (SELECT year(order_date) AS order_year, channel FROM raw.orders)
ON channel
USING count(*)
GROUP BY order_year
ORDER BY order_year;
```

```text
order_year  sales_rep  web   whatsapp
2024        600        1358  1025
2025        816        1796  1351
2026        444         971   730
```

`UNPIVOT` does the reverse, turning columns back into rows. The hand-written version is more portable (Snowflake's `PIVOT` syntax is different), while DuckDB's `PIVOT` saves typing when there are many values. In analytics engineering you usually keep data "long" (one row per year per channel) in your models and pivot only at the very end, for presentation.

## Date spines: making gaps visible

If a warehouse had no orders in a month, a `GROUP BY` month simply has no row for it. The month vanishes from the chart, and `LAG` compares the wrong months. A **date spine** is a table with one row for every date or month, which you join your data onto.

DuckDB's `generate_series` builds one in a line:

```sql
SELECT CAST(generate_series AS DATE) AS month_start
FROM generate_series(DATE '2024-01-01', DATE '2026-06-01', INTERVAL 1 MONTH);
```

That returns 30 months. (`generate_series` includes the end value; its sibling `range` stops before it.) Here is a spine in use. Ibadan West opened on 2024-04-02, so it has no orders in January to March 2024. A spine makes those months appear with zero instead of disappearing:

```sql
WITH month_spine AS (
    SELECT CAST(generate_series AS DATE) AS month_start
    FROM generate_series(DATE '2024-01-01', DATE '2026-06-01', INTERVAL 1 MONTH)
),

warehouse_months AS (
    SELECT w.warehouse_id, w.warehouse_name, s.month_start
    FROM raw.warehouses AS w
    CROSS JOIN month_spine AS s
),

monthly_orders AS (
    SELECT
        warehouse_id,
        CAST(date_trunc('month', order_date) AS DATE) AS month_start,
        count(*) AS orders
    FROM raw.orders
    GROUP BY ALL
)

SELECT
    wm.warehouse_name,
    wm.month_start,
    coalesce(mo.orders, 0) AS orders
FROM warehouse_months AS wm
LEFT JOIN monthly_orders AS mo
    ON wm.warehouse_id = mo.warehouse_id
   AND wm.month_start = mo.month_start
WHERE wm.warehouse_name = 'Ibadan West'
ORDER BY wm.month_start
LIMIT 5;
```

```text
warehouse_name  month_start  orders
Ibadan West     2024-01-01    0
Ibadan West     2024-02-01    0
Ibadan West     2024-03-01    0
Ibadan West     2024-04-01   33
Ibadan West     2024-05-01   27
```

The pattern is always the same: build every combination you expect (`CROSS JOIN` warehouses with months), `LEFT JOIN` the real data onto it, and fill the gaps with `coalesce`. `date_trunc` returns a timestamp in DuckDB, so both sides are cast to `DATE` to make the join keys match.

## Handling NULLs

`NULL` means "unknown", and SQL treats it carefully. Twelve ShopLink customers have a `NULL` city. The rules that catch people out:

| Expression | Result | Why |
|---|---|---|
| `city = NULL` | Never true | Nothing equals unknown. Use `city IS NULL`. |
| `city <> 'Ikeja'` | Excludes the 12 NULL cities | Unknown is not known to be different from Ikeja |
| `city IS DISTINCT FROM 'Ikeja'` | Includes the 12 NULL cities | Treats NULL as a value that can be compared |
| `count(city)` | 388 | `count(column)` skips NULLs; `count(*)` counts rows (400) |
| `avg(x)` | Average of non-NULL values only | NULLs are ignored, not treated as zero |

You can check the second and third rows yourself:

```sql
SELECT
    count(*) FILTER (WHERE city <> 'Ikeja') AS not_ikeja,
    count(*) FILTER (WHERE city IS DISTINCT FROM 'Ikeja') AS distinct_from_ikeja
FROM raw.customers;
```

This returns 353 and 365: the difference is exactly the 12 unknown cities.

Tools for handling NULLs:

- `coalesce(city, 'Unknown')` returns the first non-NULL value. Use it for labels in reports, and be explicit that "Unknown" is a real group.
- `nullif(x, 0)` returns NULL when `x` is 0. It prevents division-by-zero errors: `revenue / nullif(orders, 0)`.

Whether to fill a NULL or leave it is a business decision. Replacing a missing city with 'Lagos' because most customers are there would be inventing data.

## Anti-joins: finding what is missing

An anti-join returns rows from one table that have no match in another. It is how you find orphans. Three ways to write it:

```sql
-- 1. LEFT JOIN and keep the rows where the right side is missing
SELECT o.order_id, o.customer_id
FROM raw.orders AS o
LEFT JOIN raw.customers AS c ON o.customer_id = c.customer_id
WHERE c.customer_id IS NULL;

-- 2. NOT EXISTS
SELECT o.order_id, o.customer_id
FROM raw.orders AS o
WHERE NOT EXISTS (
    SELECT 1 FROM raw.customers AS c WHERE c.customer_id = o.customer_id
);

-- 3. DuckDB's ANTI JOIN
SELECT o.order_id, o.customer_id
FROM raw.orders AS o
ANTI JOIN raw.customers AS c ON o.customer_id = c.customer_id;
```

All three return the same three orphan orders (customer_id 9001, 9002 and 9003). The `SEMI JOIN` is the opposite: rows that do have a match, without duplicating them.

Avoid `NOT IN` with a subquery for this job. If the subquery returns even one `NULL`, `x NOT IN (...)` is never true and you get no rows at all, with no error. `NOT EXISTS` and `ANTI JOIN` do not have this trap.

Anti-joins work in the other direction too. Customers who have never ordered:

```sql
SELECT c.customer_id, c.customer_name, c.created_at
FROM raw.customers AS c
ANTI JOIN raw.orders AS o ON c.customer_id = o.customer_id
ORDER BY c.created_at;
```

Fifteen customers have accounts but no orders: a list the sales team would like to see.

## Resources

- docs: [CASE expression](https://duckdb.org/docs/stable/sql/expressions/case) · DuckDB · Both forms of CASE.
- docs: [FILTER clause](https://duckdb.org/docs/stable/sql/query_syntax/filter) · DuckDB · Conditional aggregation with `FILTER (WHERE ...)`.
- docs: [PIVOT statement](https://duckdb.org/docs/stable/sql/statements/pivot) · DuckDB · DuckDB's pivot syntax, with the SQL standard alternative.
- docs: [UNPIVOT statement](https://duckdb.org/docs/stable/sql/statements/unpivot) · DuckDB · Columns back into rows.
- docs: [FROM and JOIN clauses](https://duckdb.org/docs/stable/sql/query_syntax/from) · DuckDB · Includes SEMI and ANTI joins.
- docs: [Date functions](https://duckdb.org/docs/stable/sql/functions/date) · DuckDB · `date_trunc`, `year`, date arithmetic and more.
- docs: [Comparison operators](https://duckdb.org/docs/stable/sql/expressions/comparison_operators) · DuckDB · How NULL behaves in comparisons, and `IS DISTINCT FROM`.
- read: [SQL CASE](https://mode.com/sql-tutorial/sql-case) · Mode · CASE in SELECT and inside aggregates, with exercises.
- deeper: [SQL for Data Analysis](https://www.oreilly.com/library/view/sql-for-data/9781492088776/) · Cathy Tanimura, O'Reilly (paid) · Chapter 2 is a thorough guide to data cleaning, pivots and NULLs.

## Practice

1. Build a table with one row per warehouse per month (use a date spine) showing total orders, cancelled orders and the cancellation rate. Months with no orders should show 0 orders and a NULL rate, not an error.
2. Pivot net revenue by product category into columns, one row per year.
3. Find every product that has never been ordered, using an anti-join. Then find every order line whose product is inactive, and show the product name and order date.

## Example answer

**1. Cancellation rate by warehouse and month:**

```sql
WITH month_spine AS (
    SELECT CAST(generate_series AS DATE) AS month_start
    FROM generate_series(DATE '2024-01-01', DATE '2026-06-01', INTERVAL 1 MONTH)
),

warehouse_months AS (
    SELECT w.warehouse_id, w.warehouse_name, s.month_start
    FROM raw.warehouses AS w
    CROSS JOIN month_spine AS s
),

monthly AS (
    SELECT
        warehouse_id,
        CAST(date_trunc('month', order_date) AS DATE) AS month_start,
        count(*) AS orders,
        count(*) FILTER (WHERE lower(trim(status)) = 'cancelled') AS cancelled
    FROM raw.orders
    GROUP BY ALL
)

SELECT
    wm.warehouse_name,
    wm.month_start,
    coalesce(m.orders, 0) AS orders,
    coalesce(m.cancelled, 0) AS cancelled,
    round(100.0 * m.cancelled / nullif(m.orders, 0), 1) AS cancel_rate_pct
FROM warehouse_months AS wm
LEFT JOIN monthly AS m
    ON wm.warehouse_id = m.warehouse_id
   AND wm.month_start = m.month_start
ORDER BY wm.warehouse_name, wm.month_start;
```

This returns 150 rows (5 warehouses times 30 months). Ibadan West's first three months show 0 orders and a NULL rate, because `nullif` turns the zero into NULL instead of dividing by it.

**2. Revenue by category and year:**

```sql
WITH revenue_lines AS (
    SELECT
        year(o.order_date) AS order_year,
        p.category,
        ol.quantity * ol.unit_price * (1 - ol.discount_pct / 100) AS net_revenue
    FROM (SELECT DISTINCT * FROM raw.order_lines WHERE quantity > 0) AS ol
    JOIN raw.orders AS o ON ol.order_id = o.order_id
    JOIN raw.products AS p ON ol.product_id = p.product_id
    WHERE lower(trim(o.status)) NOT IN ('cancelled', 'returned')
)

PIVOT revenue_lines
ON category
USING round(sum(net_revenue))
GROUP BY order_year
ORDER BY order_year;
```

Phones is the largest column every year, followed by Laptops. The hand-written alternative, `sum(net_revenue) FILTER (WHERE category = 'Phones') AS phones` and so on, is equally correct.

**3. Products never ordered, and inactive products on orders:**

```sql
SELECT p.product_id, p.product_name
FROM raw.products AS p
ANTI JOIN raw.order_lines AS ol ON p.product_id = ol.product_id;

SELECT p.product_name, o.order_date, ol.order_line_id
FROM raw.order_lines AS ol
JOIN raw.products AS p ON ol.product_id = p.product_id
JOIN raw.orders AS o ON ol.order_id = o.order_id
WHERE NOT p.is_active
ORDER BY o.order_date DESC;
```

If the first query returns no rows, that is a valid answer: every product has been ordered at least once. The second list is what you would take to the product team, asking whether these products are really discontinued.

# Lesson: Query optimisation

minutes: 45

## Correct first, then fast

On your laptop, ShopLink's queries finish in milliseconds. So why learn optimisation now? Two reasons:

1. **On a cloud warehouse, time is money.** Snowflake bills compute by the second. A query that scans ten times more data than it needs costs roughly ten times more, every time a dashboard refreshes it.
2. **The most common performance problem is also a correctness problem.** A join that explodes the row count makes a query slow *and* gives the wrong answer. Learning to read query plans is how you catch it.

## How DuckDB runs a query

You write SQL describing *what* you want. The optimiser decides *how* to get it: which table to scan first, which join algorithm to use, where to apply filters. The result is a **query plan**, a tree of operators. `EXPLAIN` shows the plan without running the query:

```sql
EXPLAIN
SELECT warehouse_id, count(*) AS orders
FROM raw.orders
WHERE order_date >= DATE '2026-01-01'
GROUP BY warehouse_id;
```

Trimmed, the plan reads from the bottom up:

```text
┌───────────────────────────┐
│   PERFECT_HASH_GROUP_BY   │
│         Groups: #0        │
│  Aggregates: count_star() │
└─────────────┬─────────────┘
┌─────────────┴─────────────┐
│          SEQ_SCAN         │
│ Table: shoplink.raw.orders│
│ Projections: warehouse_id │
│ Filters:                  │
│ order_date>='2026-01-01'  │
│       ~1,818 rows         │
└───────────────────────────┘
```

Two things to notice. **Projections** lists the only column the scan reads for output (`warehouse_id`), even though the table has seven. **Filters** shows the date filter has been pushed right down into the scan, so rows are discarded as they are read. The `~1,818 rows` is an estimate.

`EXPLAIN ANALYZE` actually runs the query and shows real row counts and timings for each operator:

```sql
EXPLAIN ANALYZE
SELECT warehouse_id, count(*) AS orders
FROM raw.orders
WHERE order_date >= DATE '2026-01-01'
GROUP BY warehouse_id;
```

Now the scan shows `2,145 rows`, the real number of 2026 orders, and a total time at the top. When you read a plan, look for the operator where the row count suddenly jumps. That is almost always where the problem is.

## Join fan-out and row explosions

A join returns one row for every matching pair. If the key is unique on one side, the row count stays the same as the other side. If it is not unique, rows multiply. This is called fan-out.

Joining orders to order lines is a planned fan-out: each order has several lines. The bug is forgetting it happened:

```sql
SELECT count(*) AS orders
FROM raw.orders AS o
JOIN raw.order_lines AS ol ON o.order_id = ol.order_id;
```

This returns 26,779, not 9,091. After the join there is one row per line, so `count(*)` counts lines. Any order-level measure, such as a delivery fee stored on the order, would be summed three times over.

Duplicates cause unplanned fan-out. The six duplicated order lines mean that joining order_lines to itself on `order_line_id` returns 26,791 rows instead of 26,779: each duplicated line matches both copies of itself. The same happens when you join to a "dimension" table you assumed had one row per key but does not.

Three habits prevent this:

1. **Know the grain of every table before you join it.** Check the key is unique:

    ```sql
    SELECT order_line_id, count(*) AS copies
    FROM raw.order_lines
    GROUP BY order_line_id
    HAVING count(*) > 1;
    ```

2. **Check row counts before and after each join.** If a join to customers changes the number of orders, the customers table has duplicate keys (or an inner join dropped orphans).
3. **Aggregate before you join.** Reduce the "many" side to one row per key first, so the join cannot multiply anything:

```sql
WITH order_totals AS (
    SELECT
        order_id,
        count(*) AS line_count,
        sum(quantity * unit_price * (1 - discount_pct / 100)) AS order_net_revenue
    FROM (SELECT DISTINCT * FROM raw.order_lines WHERE quantity > 0)
    GROUP BY order_id
)

SELECT
    o.warehouse_id,
    count(*) AS orders,
    round(sum(ot.order_net_revenue)) AS net_revenue
FROM raw.orders AS o
JOIN order_totals AS ot ON o.order_id = ot.order_id
WHERE lower(trim(o.status)) NOT IN ('cancelled', 'returned')
GROUP BY o.warehouse_id
ORDER BY o.warehouse_id;
```

`order_totals` has exactly one row per order, so `count(*)` counts orders, and the join also processes 9,091 rows instead of 26,779.

## Filter early, read less

Every row and column you remove early is one fewer to join, sort and aggregate later.

- **Filter in the CTE where the data enters,** not at the end. `valid_orders` in lesson 1 removed cancelled and returned orders before the join. DuckDB's optimiser often pushes simple filters down for you, as the plan above shows, but it cannot do it for every query, and filtering early also makes your intent obvious to a reviewer.
- **Name the columns you need instead of `SELECT *`.** In a columnar warehouse each column is stored separately, so a query that uses three columns reads only those three. `SELECT *` forces every column to be read and makes your query break or change when someone adds a column upstream. `SELECT *` is fine for a quick look (`LIMIT 10`) or in a CTE that immediately selects from a narrower source; avoid it in anything you commit.
- **Filter on columns, not on expressions of columns, where you can.** DuckDB keeps the minimum and maximum of each column for every block of rows, and skips blocks that cannot match `order_date >= DATE '2026-01-01'`. A condition wrapped in a function, such as `strftime(order_date, '%Y') = '2026'`, may stop the engine using those statistics.

## Other good habits

| Habit | Why |
|---|---|
| Use `UNION ALL` instead of `UNION` when you know rows are distinct | `UNION` removes duplicates, which means an extra sort or hash of everything |
| Use `count(DISTINCT ...)` deliberately, not as a patch | If you need DISTINCT to get the right count, find the fan-out that caused the duplicates |
| Avoid `ORDER BY` in CTEs and models | Only the final result's order matters; sorting in between is wasted work |
| Add `LIMIT` while exploring | You rarely need 26,779 rows on screen to check a query works |

## Columnar thinking

Put together, the ideas of this lesson are "columnar thinking": in an analytical warehouse, cost is driven by **how many columns you read** and **how many rows flow through each step**, not by how many lines of SQL you write. A long query with five clear CTEs that each narrow the data is usually faster, cheaper and easier to review than a short clever one.

## Resources

- docs: [EXPLAIN: inspect query plans](https://duckdb.org/docs/stable/guides/meta/explain) · DuckDB · How to read DuckDB's plan output.
- docs: [EXPLAIN ANALYZE: profile queries](https://duckdb.org/docs/stable/guides/meta/explain_analyze) · DuckDB · Real row counts and timings per operator.
- docs: [Performance guide](https://duckdb.org/docs/stable/guides/performance/overview) · DuckDB · Schema, indexing and query tips from the DuckDB team.
- docs: [Tuning workloads](https://duckdb.org/docs/stable/guides/performance/how_to_tune_workloads) · DuckDB · Includes how DuckDB uses min/max statistics to skip data.
- read: [SQL performance tuning](https://mode.com/sql-tutorial/sql-performance-tuning) · Mode · Reducing rows early, join tips and using EXPLAIN.
- watch: [7 Simple Tricks to Instantly Make Your SQL Queries Better](https://www.youtube.com/watch?v=p5PKnqGyDaE) · techTFQ · 405K subscribers · 153K views · 6,014 likes · published 2025-12-30 · checked 2026-09-27 · 14 min
- watch: [SQL Query Optimization - Tips for More Efficient Queries](https://www.youtube.com/watch?v=GA8SaXDLdsY) · Cody Baldwin · 94.1K subscribers · 99.6K views · 1,785 likes · published 2022-10-06 · checked 2026-09-27 · 3 min

## Practice

A colleague wrote this query for "net revenue and number of orders per customer type". It runs, but the numbers are wrong and it reads more than it needs.

```sql
SELECT *
FROM (
    SELECT
        c.customer_type,
        count(o.order_id) AS orders,
        sum(ol.quantity * ol.unit_price * (1 - ol.discount_pct / 100)) AS net_revenue
    FROM raw.orders AS o
    JOIN raw.order_lines AS ol ON o.order_id = ol.order_id
    JOIN raw.customers AS c ON o.customer_id = c.customer_id
    WHERE o.status <> 'cancelled'
    GROUP BY c.customer_type
)
ORDER BY net_revenue DESC;
```

1. List every problem you can find: correctness first, then efficiency.
2. Rewrite it.
3. Run `EXPLAIN ANALYZE` on both versions. Find the operator where the row count is highest in each, and compare.

## Example answer

**Problems:**

1. `count(o.order_id)` counts order lines, not orders, because of the join fan-out. It returns about three times too many.
2. The status filter misses spellings such as 'Cancelled' and ' cancelled', and does not exclude returned orders at all.
3. Duplicate order lines and lines with quantity 0 or less are included.
4. The inner join to customers silently drops the three orphan orders. That may be acceptable, but it should be a choice, noted in a comment.
5. The outer `SELECT *` wrapper adds nothing.

**Rewrite:**

```sql
WITH valid_orders AS (
    SELECT order_id, customer_id
    FROM raw.orders
    WHERE lower(trim(status)) NOT IN ('cancelled', 'returned')
),

order_totals AS (
    SELECT
        order_id,
        sum(quantity * unit_price * (1 - discount_pct / 100)) AS order_net_revenue
    FROM (SELECT DISTINCT * FROM raw.order_lines WHERE quantity > 0)
    GROUP BY order_id
)

SELECT
    coalesce(c.customer_type, 'unknown customer') AS customer_type,
    count(*) AS orders,
    round(sum(ot.order_net_revenue)) AS net_revenue
FROM valid_orders AS vo
JOIN order_totals AS ot ON vo.order_id = ot.order_id
LEFT JOIN raw.customers AS c ON vo.customer_id = c.customer_id   -- keep orphan orders visible
GROUP BY ALL
ORDER BY net_revenue DESC;
```

Resellers bring in by far the most revenue (about ₦244 billion from 5,309 orders), followed by schools (about ₦88 billion) and businesses (about ₦42 billion). A small "unknown customer" row shows two orphan orders instead of hiding them. Compare the original's 16,302 reseller "orders": that is the fan-out, counting lines.

**Plans:** in the original, the join between orders and order_lines produces about 26,800 rows, which then flow into the second join and the aggregate. In the rewrite, `order_totals` is aggregated down to about 9,000 rows (one per order) before any join, so the largest operator is the scan of order_lines itself, and every step after it handles one row per order. On ShopLink's data both run in milliseconds; on a warehouse with 500 million order lines, that difference is the size of your Snowflake bill.

# Quiz

passing_score: 70

### Why does `WHERE yoy_growth IS NOT NULL` fail when yoy_growth is calculated with LAG in the same SELECT?

- [ ] LAG only works on dates
- [x] WHERE runs before window functions are calculated, so use QUALIFY or an outer query instead
- [ ] DuckDB does not support filtering on NULL
- [ ] Window functions can only be used inside CTEs

> SQL evaluates FROM, WHERE, GROUP BY and HAVING before window functions. DuckDB's QUALIFY clause filters after windows are computed; elsewhere you wrap the query in a CTE and filter outside it.

### Two products tie for second place in revenue. What ranks do RANK() and DENSE_RANK() give the next product?

- [ ] RANK gives 3, DENSE_RANK gives 3
- [x] RANK gives 4, DENSE_RANK gives 3
- [ ] RANK gives 3, DENSE_RANK gives 4
- [ ] Both give 2

> RANK leaves a gap after ties (1, 2, 2, 4). DENSE_RANK does not (1, 2, 2, 3). ROW_NUMBER would give 1, 2, 3, 4 with the tie broken arbitrarily.

### Which query reliably finds orders whose customer_id has no match in customers?

- [ ] `SELECT * FROM raw.orders WHERE customer_id NOT IN (SELECT customer_id FROM raw.customers WHERE city IS NULL)`
- [ ] `SELECT * FROM raw.orders AS o JOIN raw.customers AS c ON o.customer_id = c.customer_id`
- [x] `SELECT * FROM raw.orders AS o ANTI JOIN raw.customers AS c ON o.customer_id = c.customer_id`
- [ ] `SELECT * FROM raw.orders WHERE customer_id IS NULL`

> An anti-join returns rows with no match on the other side. An inner join returns only matches, and NOT IN with a subquery returns nothing at all if the subquery contains a NULL.

### After joining orders to order_lines, `count(*)` returns 26,779 instead of 9,091. What is the best fix?

- [ ] Add `DISTINCT` to the final SELECT
- [ ] Switch to a LEFT JOIN
- [x] Aggregate order_lines to one row per order before joining, or count distinct order_id deliberately
- [ ] Add `LIMIT 9091`

> The join changed the grain to one row per order line. Aggregating the many side first keeps one row per order, so counts and sums at order level are correct and fewer rows flow through the query.

### What does `SELECT CAST(generate_series AS DATE) FROM generate_series(DATE '2024-01-01', DATE '2026-06-01', INTERVAL 1 MONTH)` give you?

- [ ] Every order date in the orders table
- [x] One row for the first day of every month from January 2024 to June 2026, a date spine
- [ ] A random sample of 30 dates
- [ ] An error, because DuckDB cannot generate dates

> A date spine has one row per period whether or not anything happened. LEFT JOIN your data onto it so empty months show as zero instead of disappearing.

# Project: Answer ShopLink's leadership questions

max_score: 100

## Brief

In Module 1, ShopLink's leadership asked five questions:

1. What is our net revenue each month, and is it growing?
2. Which product categories and brands bring in the most revenue?
3. Which states and warehouses sell the most?
4. Who are our top customers, and how often do they order?
5. How many orders are cancelled, and is that rate going up?

Answer all five from the raw tables in your DuckDB warehouse, using the techniques from this module. Leadership will read your written answers, not your SQL, so each answer must be short, plain and honest about its limits. Your SQL must be clean enough for a reviewer to check every number.

## Deliverables

On a feature branch in your `shoplink-analytics` repo:

1. **An `analysis/` folder with one SQL file per question**, for example `analysis/q1_monthly_revenue.sql` to `analysis/q5_cancellations.sql`. Each file:
   - starts with a comment stating the question and the definitions used (for example, which statuses count as revenue);
   - cleans the data it needs with CTEs: clean status, remove duplicate order lines, exclude quantities of 0 or less;
   - runs from the repo root against `shoplink.duckdb` without errors.
2. **An `analysis/ANSWERS.md` file** with, for each question:
   - a two to four sentence answer with the key numbers (in naira where relevant);
   - a small results table (the top rows are enough);
   - at least two **business caveats**: things that could make the answer misleading. Examples: 2026 only covers January to June; recent orders may still be cancelled or returned, so June 2026 is provisional; "state" could mean the customer's state or the warehouse's state, and you must say which you used; orphan orders have no customer and therefore no state; Ibadan West opened in April 2024, so its 2024 total is not comparable.
3. **Techniques**: across the five files, use at least one window function (with `QUALIFY` or LAG), one conditional aggregation, and one anti-join or date spine.
4. **A pull request** into `main` whose description lists the five headline answers in one line each.

## How to submit

Merge your pull request after reviewing it (ask a peer if you can: row counts and definitions are what they should check). Paste the link to the pull request into the submission form, and in the note say which answer you are least confident about and why.

## Grading guide

| Criterion | Points |
|---|---|
| All five questions answered with correct numbers, using the agreed net revenue definition | 30 |
| Data problems handled: status cleaned, duplicates and invalid quantities removed, orphans handled deliberately | 20 |
| SQL is readable: named CTEs, one job per step, header comments with definitions | 15 |
| Required techniques used appropriately (window function, conditional aggregation, anti-join or date spine) | 10 |
| Written answers are short, plain and include meaningful business caveats | 20 |
| PR description summarises the answers clearly | 5 |
