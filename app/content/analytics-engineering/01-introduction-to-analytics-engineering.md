---
module: 1
title: Introduction to Analytics Engineering
optional: false
summary: Understand what analytics engineers do, where the role sits in a data team, the tools of the modern data stack, and the workflow you will practise for the rest of the course. You also meet ShopLink, the company whose data you will model from here to the capstone.
---

# Lesson: What analytics engineering is

minutes: 40

## Why the role exists

Picture a Monday leadership meeting. Sales says revenue last month was ₦17.8 billion. Finance says ₦16.9 billion. The operations dashboard says ₦18.6 billion. Nobody is lying: each team wrote its own SQL against the raw data, and each made different choices about cancelled orders, discounts and returns.

Analytics engineering exists to stop that meeting from happening. An analytics engineer takes raw data and turns it into a small number of clean, tested, documented tables that everyone agrees on. When those tables define "net revenue" once, every dashboard built on top of them shows the same number.

## A working definition

Analytics engineering is the practice of transforming raw data into trusted, analysis-ready datasets, using the habits of software engineering: version control, code review, automated testing, documentation and repeatable deployment.

Two ideas sit inside that definition:

1. **The output is a dataset, not a chart.** Analytics engineers build the tables that analysts and BI tools query. They care about what a row means, whether it is correct, and whether it will still be correct tomorrow.
2. **The work is treated as code.** Every transformation is a SQL file in a Git repository. Changes are reviewed in pull requests and checked by tests before they reach production, the same way a software team ships an app.

## Where the role sits

Most data teams split the work into three overlapping roles:

| Role | Main question | Typical output |
|---|---|---|
| Data engineer | How does data get from source systems into the warehouse, reliably and at scale? | Ingestion pipelines, infrastructure, orchestration |
| Analytics engineer | How do we turn that raw data into models the business can trust? | Tested, documented tables and shared metric definitions |
| Data analyst | What is the data telling us, and what should we do about it? | Analysis, dashboards, recommendations |

The boundaries blur. In a small company one person may do all three. What makes someone an analytics engineer is where they spend most of their time: in the transformation layer, between raw data and insight.

## What the job looks like day to day

A typical week might include:

- Building a new model so the marketing team can see customer lifetime value.
- Adding a test that fails when an order has no customer, after a bad record broke a dashboard.
- Reviewing a teammate's pull request and asking why a join changed the row count.
- Writing documentation so analysts know which table to use for revenue and why.
- Agreeing with finance on exactly what "active customer" means, then encoding it once.

## The skills this course builds

SQL is the core skill, and you will use it in every module. Around it you will learn dimensional modelling (how to shape tables for analysis), Git and GitHub (how to collaborate on code), dbt (the tool most analytics engineers use to build and test models), data quality practices, and a cloud data warehouse.

## Resources

- read: [What is analytics engineering?](https://www.getdbt.com/blog/what-is-analytics-engineering) · dbt Labs · The article that popularised the term. Read it end to end.
- watch: [The Rise of Analytics Engineering (and Why You Should Care)](https://www.youtube.com/watch?v=Qj1_KgakzqU) · Maggie In Data · 8.08K subscribers · 13.9K views · 464 likes · published 2024-12-16 · checked 2026-09-27 · 15 min
- watch: [What Does an Analytics Engineer Do? (vs Data Engineer & Data Analyst)](https://www.youtube.com/watch?v=ZNSdgh1wXLM) · Maven Analytics · 211K subscribers · 6.5K views · 220 likes · published 2026-06-10 · checked 2026-09-27 · 3 min
- docs: [The dbt Viewpoint](https://docs.getdbt.com/community/resources/viewpoint) · dbt Labs · The principles behind treating analytics as code.
- deeper: [Analytics Engineering with SQL and dbt](https://www.oreilly.com/library/view/analytics-engineering-with/9781098142377/) · Rui Machado and Helder Russa, O'Reilly (paid) · Chapter 1 covers the history and scope of the role.

## Practice

Find three real analytics engineer job adverts, on LinkedIn or any job board. For each one, write down:

1. The tools it names (for example SQL, dbt, Snowflake, Git).
2. Three responsibilities in your own words.
3. One thing in the advert that sounds more like data engineering or data analysis than analytics engineering.

Then write two or three sentences on what the three adverts have in common. Keep your notes: you will use them in the module project.

## Example answer

Your adverts will differ, but a strong set of notes looks like this for one of them:

- **Tools:** SQL, dbt, Snowflake, GitHub, Looker.
- **Responsibilities:** build and maintain the models that power company reporting; write tests so data problems are caught before stakeholders see them; work with finance to define metrics such as monthly recurring revenue.
- **Not quite AE:** "Build and maintain Kafka streaming pipelines" is data engineering work.

**What they have in common:** all three ask for strong SQL and dbt, all three mention testing or data quality, and all three expect the person to work closely with business teams on definitions. The tools for storage and BI vary from company to company; SQL, dbt and Git do not.

If your adverts mostly described building dashboards, you probably found data analyst roles with a new title. That is common, and noticing it is part of the exercise.

# Lesson: The modern data stack

minutes: 45

## From one big server to a set of cloud tools

Ten years ago, most companies ran analytics on a single on-premise database. Storage and computing power were expensive, so data was cleaned and shrunk before it was loaded, a pattern called ETL: extract, transform, load.

Cloud data warehouses changed the economics. Storage became cheap and computing power could be switched on for a few seconds at a time. Teams started loading raw data first and transforming it inside the warehouse afterwards. That pattern is called ELT, and it is the reason analytics engineering exists as a role: once transformation happens in the warehouse, in SQL, it becomes its own discipline. You will study ETL and ELT properly in Module 3.

## The layers

The modern data stack is not a product. It is a way of assembling specialised tools, each doing one job, into a pipeline:

| Layer | Job | Example tools |
|---|---|---|
| Sources | Where data is created | App databases, payment providers, CRMs, spreadsheets |
| Ingestion | Copy data into the warehouse | Fivetran, Airbyte, custom Python scripts |
| Storage and compute | Store the data and run queries | Snowflake, BigQuery, Databricks, DuckDB |
| Transformation | Turn raw data into clean models | dbt, SQL |
| Consumption | Put the data in front of people | Power BI, Tableau, Looker, Metabase |

Three practices run across every layer rather than sitting in one:

- **Orchestration**: running each step in the right order, on schedule (Airflow, Dagster, dbt jobs).
- **Data quality and observability**: noticing when data is late, missing or wrong.
- **Version control**: keeping every piece of code in Git so changes are tracked and reviewed.

## Where analytics engineers work

Analytics engineers live in the transformation layer. They read from the raw tables that ingestion lands, and they build the models that consumption tools read from. They also care about the layers on either side: they need to know how data arrives so they can model it correctly, and how it is used so they can shape it helpfully.

## The stack you will use in this course

| Layer | This course |
|---|---|
| Storage and compute | DuckDB on your own computer (Modules 3 to 8), then Snowflake (Module 9 onwards) |
| Transformation | SQL and dbt |
| Version control | Git and GitHub |
| Quality | dbt tests and freshness checks |

DuckDB is a free database that runs on your laptop, with nothing to host and no trial that expires. It lets you learn at your own pace. In Module 9 you move your work to Snowflake, which is what many companies run in production.

## Resources

- read: [Understanding analytics engineering](https://www.getdbt.com/discover/understanding-analytics-engineering) · dbt Labs · How the role fits into the modern data stack.
- watch: [What Is The Modern Data Stack - Intro To Data Infrastructure Part 1](https://www.youtube.com/watch?v=-ClWgwC0Sbw) · Seattle Data Guy · 123K subscribers · 38.1K views · 990 likes · published 2022-01-14 · checked 2026-09-27 · 9 min
- docs: [Understanding ELT: extract, load, transform](https://docs.getdbt.com/terms/elt) · dbt Labs · A short reference page. Module 3 goes deeper.

## Practice

Pick a business you know well: a bank, a delivery app, a supermarket, or your own employer. Draw its data stack as five boxes, one per layer, and fill each box with:

1. Two or three data sources it probably has.
2. How that data might get into a warehouse.
3. Two questions a manager might want answered.

A photo of a hand-drawn diagram is fine. The goal is to see that every company, whatever it sells, has the same basic shape.

## Example answer

Here is one example for a food delivery app:

| Layer | Example |
|---|---|
| Sources | The app's orders database, the payments provider (for example Paystack), the rider tracking system, customer support tickets |
| Ingestion | A tool such as Fivetran copies the orders database and Paystack data every hour; a Python script pulls support tickets from an API |
| Storage and compute | Snowflake or BigQuery |
| Transformation | dbt models that join orders, payments and rider trips into one delivery table |
| Consumption | A Power BI dashboard for operations, a weekly revenue report for finance |

**Questions a manager might ask:** What is our average delivery time by area of Lagos? Which restaurants have the highest cancellation rate?

Your business will have different sources and questions, but check that you have something in every layer. If you jumped straight from sources to a dashboard, ask yourself where the data is stored and cleaned in between. That gap is where analytics engineers work.

# Lesson: The analytics engineering workflow

minutes: 45

## From request to trusted table

Analytics engineers follow a repeatable workflow. You will practise every step of it in later modules; for now, learn the shape.

1. **Understand the question.** A stakeholder asks for "monthly revenue by state". Before writing SQL, pin down the details. Does revenue include VAT? Are cancelled orders excluded? Is the month the order date or the delivery date?
2. **Define the grain.** Decide what one row of the final table represents: one order, one order line, or one customer per month. Getting the grain wrong is the most common cause of numbers that are double counted. Module 5 covers this in depth.
3. **Explore the sources.** Query the raw tables. Check for duplicates, missing values and odd statuses before building on them.
4. **Build in layers.** Transform the data step by step:
   - **Staging**: one model per source table. Rename columns, fix types, and apply light cleaning. No business logic yet.
   - **Intermediate**: join and reshape staging models into useful building blocks.
   - **Marts**: the final tables people query, shaped around business concepts such as orders, customers or revenue.
5. **Test.** Add checks that run automatically, such as "every order ID is unique" or "every order has a customer".
6. **Document.** Describe what each model and column means, so the next person does not have to guess.
7. **Review.** Open a pull request. A teammate reads the change, questions it, and approves it.
8. **Deploy and monitor.** Merge to production, schedule the models to rebuild, and watch for test failures or late data.

## Why layers matter

Imagine that the definition of "net revenue" changes because finance decides delivery fees should be excluded. If ten dashboards each contain their own revenue SQL, you have ten places to fix and ten chances to miss one. If they all read from one mart, you change one model and every dashboard updates together.

Layering also makes problems easier to trace. When a number looks wrong, you can check each layer in turn: is the raw data wrong, the staging clean-up, or the business logic in the mart?

## Engineering habits, applied to analytics

The workflow borrows four habits from software teams:

- **Version control**: every change is a commit you can inspect or undo.
- **Code review**: no change reaches production without a second pair of eyes.
- **Automated testing**: problems are caught by checks, not by a manager spotting a strange number.
- **Environments**: you build and test in your own development space, never directly in production.

You will set up each of these yourself, starting with Git in Module 2.

## Resources

- docs: [How we structure our dbt projects](https://docs.getdbt.com/best-practices/how-we-structure/1-guide-overview) · dbt Labs · The staging, intermediate and marts layers explained by the team behind dbt.
- read: [Modular data modeling techniques](https://www.getdbt.com/analytics-engineering/modular-data-modeling-technique) · dbt Labs · Why building small, reusable models beats one giant query.

## Practice

A sales manager sends you this message: "Can you get me revenue by product category for the last quarter?"

Write down:

1. Five clarifying questions you would ask before writing any SQL.
2. The grain you would choose for the final table, in one sentence ("one row per...").
3. Two tests you would add to make sure the numbers can be trusted.

There is no single right answer. What matters is that every question you ask would change the SQL you write.

## Example answer

**Clarifying questions:**

1. Is revenue before or after discounts?
2. Should cancelled and returned orders be excluded?
3. Does "last quarter" mean the last calendar quarter or the last 90 days?
4. Should the quarter be based on the order date or the delivery date?
5. Do you want the total for the quarter, or a breakdown by month within it?

**Grain:** one row per product category per month.

**Tests:**

1. Every order line has a product, and every product has a category, so no revenue is lost in a "blank" category.
2. The total revenue in the final table matches the total from the order lines it was built from, so nothing was double counted by a join.

Other good tests include checking that revenue is never negative, or that each category and month pair appears only once. If one of your questions would not change the SQL, for example "Why do you need this?", it is still worth asking, but it is not a clarifying question about the data.

# Lesson: Meet ShopLink

minutes: 30

## The company

ShopLink Distribution is a fictional electronics distributor based in Lagos. It buys laptops, phones, accessories and networking equipment from manufacturers and sells them in bulk to resellers, schools and businesses across Nigeria.

Orders arrive through the ShopLink web app, and through sales reps who log WhatsApp orders in the same app. Each order is fulfilled from one of ShopLink's warehouses.

ShopLink is growing fast, and its reporting has not kept up. Every team pulls numbers from the app database with its own spreadsheets, and the numbers rarely match. You have just been hired as ShopLink's first analytics engineer.

## The data

ShopLink's app database has five core tables:

| Table | One row is... | Key columns |
|---|---|---|
| customers | a customer account | customer_id, customer_name, customer_type (reseller, school, business), city, state |
| products | a product ShopLink sells | product_id, product_name, category, brand, unit_cost |
| warehouses | a warehouse | warehouse_id, warehouse_name, city, state |
| orders | an order placed by a customer | order_id, customer_id, warehouse_id, order_date, status |
| order_lines | one product on an order | order_line_id, order_id, product_id, quantity, unit_price, discount_pct |

Notice that revenue is not stored anywhere. It has to be calculated from order lines: quantity multiplied by unit price, less the discount. Deciding exactly how to calculate it, and making sure everyone uses the same calculation, is your job.

## The questions ShopLink needs answered

The leadership team has asked for:

1. What is our net revenue each month, and is it growing?
2. Which product categories and brands bring in the most revenue?
3. Which states and warehouses sell the most?
4. Who are our top customers, and how often do they order?
5. How many orders are cancelled, and is that rate going up?

## What you will build

Across the course you will build ShopLink a complete analytics layer:

| Module | What you add to ShopLink |
|---|---|
| 2 | A GitHub repository for all your ShopLink work |
| 3 | ShopLink's raw data loaded into a DuckDB warehouse |
| 4 | SQL answers to the leadership questions |
| 5 | A star schema design for ShopLink sales |
| 6 and 7 | That star schema built in dbt, with snapshots and incremental models |
| 8 | Tests, freshness checks and data contracts |
| 9 | The project moved to Snowflake and scheduled |
| 10 | The finished platform, presented as your capstone |

Some lessons use other datasets where they teach an idea better, but ShopLink is the thread that ties the course together.

## Resources

- read: [Four-Step Dimensional Design Process](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/four-4-step-design-process/) · Kimball Group · A preview of Module 5: how business questions become tables. Notice step 1 is "select the business process", which is what you did with ShopLink's orders.
- docs: [Why DuckDB](https://duckdb.org/why_duckdb) · DuckDB · The database you will load ShopLink into in Module 3, and why it suits learning on your own laptop.

## Practice

For each of the five leadership questions above, write down:

1. Which of the five tables you would need.
2. One thing that could make the answer wrong. For example: are cancelled orders included? What happens if a customer moves to another state?

You will come back to this list in Module 4 when you write the SQL.

## Example answer

| Question | Tables | What could make it wrong |
|---|---|---|
| 1. Net revenue each month | orders, order_lines | Including cancelled or returned orders; forgetting the discount |
| 2. Revenue by category and brand | order_lines, products | Products with a missing category; a join that duplicates lines |
| 3. Sales by state and warehouse | orders, order_lines, warehouses, customers | Mixing up the customer's state with the warehouse's state |
| 4. Top customers and order frequency | customers, orders, order_lines | Orders with a customer ID that does not exist in customers |
| 5. Cancellation rate over time | orders | Status values written inconsistently, such as "Cancelled" and "CANCELLED" |

Question 3 is the one most people get wrong: "sales by state" could mean where the customer is or where the warehouse is. Both are valid, but they give different answers, so ask which one the business means.

# Quiz

passing_score: 70

### What is the main output of an analytics engineer's work?

- [ ] Ingestion pipelines that copy data from source systems
- [x] Clean, tested, documented datasets that others can analyse
- [ ] Dashboards and slide decks for leadership
- [ ] Machine learning models that predict future sales

> Analytics engineers own the transformation layer. Data engineers usually own ingestion, and analysts usually own dashboards and insight.

### Why did the move to cloud data warehouses make ELT the common pattern?

- [ ] Cloud warehouses cannot store raw data
- [ ] ELT pipelines do not need SQL
- [x] Storage became cheap and compute scalable, so raw data can be loaded first and transformed inside the warehouse
- [ ] ETL tools stopped being supported

> When storage is cheap and compute can scale on demand, it is simpler to load everything raw and transform it with SQL in the warehouse, which is exactly where analytics engineers work.

### In a layered project, what belongs in a staging model?

- [ ] Final business metrics such as monthly revenue
- [x] One cleaned-up version of each source table: renamed columns, fixed types, no business logic
- [ ] Joins across every table in the warehouse
- [ ] Charts for the BI tool

> Staging models mirror the sources one to one with light cleaning. Business logic comes later, in intermediate and mart models.

### A stakeholder asks for "monthly revenue by state". What should you do before writing SQL?

- [ ] Build the dashboard first and adjust it later
- [ ] Copy the query another team already uses
- [x] Clarify the definition, such as whether cancelled orders and VAT are included and which date defines the month
- [ ] Ask a data engineer to write it

> Most disagreements about numbers come from different definitions, not wrong SQL. Pinning the definition down first is the step that prevents them.

### ShopLink's database has no revenue column. Where does revenue come from?

- [ ] The orders table's status column
- [ ] The products table's unit_cost column
- [x] The order_lines table: quantity multiplied by unit price, less the discount
- [ ] It cannot be calculated from this data

> Revenue is derived from order lines. Agreeing on exactly how to derive it, and encoding that once, is the analytics engineer's job.

# Project: ShopLink data journey brief

max_score: 100

## Brief

Before ShopLink's leadership invests in a data team, they want to understand how data would flow from their app to their monthly report. Write a short brief, no more than two pages, that explains it to them.

## Deliverables

1. **A data stack diagram for ShopLink.** Show the five layers from the modern data stack lesson and name at least one tool per layer. A neat hand drawing or a simple slide is fine.
2. **The journey of one order.** In 150 to 250 words, follow one laptop order from the moment a sales rep logs it to the moment it appears in the monthly revenue report. Name each system it passes through.
3. **Three risks.** List three places where the revenue number could go wrong, and for each one say which step of the analytics engineering workflow would catch it.
4. **A revenue definition.** Write one precise sentence defining ShopLink's net revenue. State what is included and what is excluded.

## How to submit

Put everything in one Google Doc, Notion page or PDF. Set sharing so anyone with the link can view it, paste the link into the submission form, and add a one-line note on anything you would like feedback on.

## Grading guide

| Criterion | Points |
|---|---|
| Diagram covers all five layers with sensible tools | 25 |
| Order journey is accurate and names each system | 25 |
| Risks are realistic and mapped to the right workflow step | 25 |
| Revenue definition is precise and unambiguous | 25 |
