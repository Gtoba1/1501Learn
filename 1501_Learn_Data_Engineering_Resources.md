# 1501 Learn --- Data Engineering Learning Resources

A curated resource library for a **10-module Data Engineering learning
roadmap**.

Resources prioritize official documentation, established publications,
highly engaged YouTube material, and practical projects.

## Roadmap

  -----------------------------------------------------------------------
  \#                      Module                  Core Focus
  ----------------------- ----------------------- -----------------------
  1                       Data Engineering        Role, lifecycle,
                          Foundations             architecture, batch vs
                                                  streaming

  2                       Python for Data         Python, APIs, files,
                          Engineering             databases, automation

  3                       Advanced SQL &          SQL, PostgreSQL,
                          Databases               transactions,
                                                  performance

  4                       Data Warehousing & Data Warehouses, lakes,
                          Lakes                   lakehouses, storage
                                                  formats

  5                       Data Pipelines &        Ingestion,
                          ETL/ELT                 transformation, APIs,
                                                  incremental loads

  6                       Git, Linux & Docker     Version control, CLI,
                                                  containers,
                                                  environments

  7                       Workflow Orchestration  Apache Airflow, DAGs,
                                                  scheduling,
                                                  dependencies

  8                       Distributed Data        Apache Spark, PySpark,
                          Processing              partitioning,
                                                  performance

  9                       Streaming & Cloud Data  Kafka, cloud platforms,
                          Engineering             real-time pipelines

  10                      Capstone --- End-to-End Production-style
                          Data Platform           batch + streaming
                                                  project
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# Module 1 --- Data Engineering Foundations

## Official / Reference

### Microsoft Learn --- Training for Data Engineers

https://learn.microsoft.com/en-us/training/career-paths/data-engineer

### Microsoft Learn --- Get Started with Data Engineering on Azure

https://learn.microsoft.com/en-us/training/paths/get-started-data-engineering/

## Publication

### Fundamentals of Data Engineering --- Joe Reis & Matt Housley

https://www.oreilly.com/library/view/fundamentals-of-data/9781098108298/

Published June 2022; 450 pages; approximately 13h 34m on O'Reilly.

Covers the data engineering lifecycle, architecture, storage, ingestion,
transformation, serving, security, reliability, and data engineering
responsibilities.

### Designing Data-Intensive Applications --- Martin Kleppmann & Chris Riccomini, 2nd Edition

https://www.oreilly.com/library/view/designing-data-intensive-applications/9781098119058/

Published February 2026; 672 pages; approximately 21h 56m.
Intermediate--advanced reference for distributed systems, analytical
systems, data warehouses, cloud architecture, replication, partitioning,
and reliability.

## YouTube

### Data Engineering Course for Beginners --- freeCodeCamp.org

https://www.youtube.com/watch?v=PHsC_t0j1dU

Observed during research: - Published: January 16, 2024 - Views: 1.1M+ -
Likes: 16K+ - Channel: freeCodeCamp.org - Subscribers: 11.9M+

Covers Docker, SQL, pipelines, dbt, Airflow, Airbyte, Spark, Kafka, and
an end-to-end project.

------------------------------------------------------------------------

# Module 2 --- Python for Data Engineering

## Official Documentation

### Python Tutorial

https://docs.python.org/3/tutorial/index.html

Covers syntax, data structures, control flow, functions, modules,
classes, file handling, exceptions, and the standard library.

## YouTube

### Python Full Course for Data Engineers --- Ansh Lamba

https://www.youtube.com/watch?v=ZvU7lupoXQE

Observed during research: - Published: June 8, 2025 - Views: 460K+ -
Likes: 6,500+ - Subscribers: 151K+

6+ hour course covering Python fundamentals, data structures, functions,
OOP, inheritance, multithreading, Requests, and OS modules.

### How I'd Learn Python for Data Engineering in 2025 --- Data with Baraa

https://www.youtube.com/watch?v=Vh0qcDerBMc

Observed during research: - Published: June 27, 2025 - Views: 146K+ -
Likes: 6,500+ - Subscribers: 479K+

Useful as a roadmap for learning Python specifically for data
engineering.

## Practical Work

Build Python scripts that: 1. Read CSV/JSON 2. Call a REST API 3.
Transform records 4. Connect to PostgreSQL 5. Load data into tables 6.
Log errors 7. Run from the command line 8. Accept configuration
parameters

------------------------------------------------------------------------

# Module 3 --- Advanced SQL & Databases

## Official Documentation

### PostgreSQL Tutorial

https://www.postgresql.org/docs/18/tutorial.html

Covers database creation, tables, querying, joins, aggregates, updates,
deletes, views, foreign keys, transactions, and window functions.

### PostgreSQL --- SQL Language

https://www.postgresql.org/docs/current/tutorial-sql.html

## Recommended Topics

### Core SQL

-   SELECT
-   JOIN
-   GROUP BY
-   HAVING
-   CASE
-   Subqueries
-   CTEs

### Advanced SQL

-   Window functions
-   Recursive CTEs
-   MERGE / UPSERT
-   Transactions
-   Indexes
-   Query plans
-   Partitioning

### Data Engineering SQL

-   Incremental loads
-   Deduplication
-   Slowly changing dimensions
-   Change detection
-   Data validation
-   ETL transformations

------------------------------------------------------------------------

# Module 4 --- Data Warehousing & Data Lakes

## Publications / References

### Fundamentals of Data Engineering

https://www.oreilly.com/library/view/fundamentals-of-data/9781098108298/

### The Data Warehouse Toolkit --- Kimball Group

https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/books/data-warehouse-dw-toolkit/

### Kimball --- Dimensional Modeling Techniques

https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/

## Key Concepts

-   OLTP vs OLAP
-   Data warehouse
-   Data lake
-   Lakehouse
-   Star schema
-   Facts and dimensions
-   Grain
-   Surrogate keys
-   SCD Type 1
-   SCD Type 2
-   Partitioning
-   Columnar storage
-   Parquet
-   Data catalog
-   Metadata

## Cloud Reference

### AWS Glue

https://docs.aws.amazon.com/glue/latest/dg/

AWS Glue is a managed data integration service for discovering,
preparing, moving, and integrating data.

### AWS Glue Data Catalog --- Getting Started

https://docs.aws.amazon.com/glue/latest/dg/start-data-catalog.html

------------------------------------------------------------------------

# Module 5 --- Data Pipelines & ETL/ELT

## Core Pipeline

``` text
Source
  ↓
Extract
  ↓
Raw / Landing Layer
  ↓
Transform
  ↓
Quality Checks
  ↓
Warehouse / Lake
  ↓
Serving Layer
```

## Recommended Topics

-   ETL vs ELT
-   Batch ingestion
-   API ingestion
-   Database ingestion
-   File ingestion
-   Full loads
-   Incremental loads
-   CDC concepts
-   Idempotency
-   Schema evolution
-   Error handling
-   Retries
-   Logging
-   Monitoring
-   Data validation

## YouTube

### Data Engineering Course for Beginners --- freeCodeCamp.org

https://www.youtube.com/watch?v=PHsC_t0j1dU

Use the pipeline-building sections as an introduction before building
independent pipelines.

## Practical Project

``` text
REST API
   ↓
Python Extractor
   ↓
Raw JSON
   ↓
PostgreSQL
   ↓
Transformation
   ↓
Analytical Tables
```

Then extend the pipeline to support incremental loads.

------------------------------------------------------------------------

# Module 6 --- Git, Linux & Docker

## Git

### Pro Git

https://git-scm.com/book/en/v2

Free Git book covering version control, repositories, commits, branches,
merging, remotes, GitHub workflows, and advanced Git.

### GitHub --- Getting Started

https://docs.github.com/en/get-started

## Docker

### Docker --- Get Started

https://docs.docker.com/get-started/

### What is Docker?

https://docs.docker.com/get-started/docker-overview/

Docker packages applications and dependencies into containers for
consistent development and deployment environments.

## Data Engineering Docker Skills

Learners should be able to: - Pull images - Run containers - Build
images - Write Dockerfiles - Use volumes - Configure networks - Use
environment variables - Write Docker Compose files - Run PostgreSQL in
Docker - Run Airflow in Docker - Run Kafka in Docker

## Practical Environment

``` text
Docker Compose
│
├── PostgreSQL
├── Airflow
├── Spark
├── Kafka
└── Supporting services
```

------------------------------------------------------------------------

# Module 7 --- Workflow Orchestration

## Official Documentation

### Apache Airflow Tutorials

https://airflow.apache.org/docs/apache-airflow/stable/tutorial/

Current tutorials include Airflow 101, first workflows, TaskFlow API,
simple data pipelines, cloud-native workflows, and human-in-the-loop
workflows.

### Airflow Installation

https://airflow.apache.org/docs/apache-airflow/stable/installation.html

## YouTube / Project

### Apache Airflow with Spark for Data Engineers --- CodeWithYu

https://www.classcentral.com/course/youtube-apache-airflow-with-spark-pyspark-java-scala-for-data-engineers-full-course-337249

Free YouTube course; approximately 1h 9m; intermediate.

Covers Airflow, Docker, Spark clusters, Python Spark jobs, Scala, Java,
and cluster computation.

## Core Concepts

-   DAGs
-   Tasks
-   Operators
-   Dependencies
-   Scheduling
-   Sensors
-   TaskFlow API
-   XCom
-   Retries
-   Backfills
-   Catchup
-   Variables
-   Connections
-   Monitoring

## Practical Project

``` text
Extract API
    ↓
Validate data
    ↓
Load raw data
    ↓
Transform data
    ↓
Run quality checks
    ↓
Update warehouse
```

------------------------------------------------------------------------

# Module 8 --- Distributed Data Processing

## Apache Spark

### Spark SQL & DataFrames

https://spark.apache.org/docs/latest/sql-programming-guide

Spark SQL provides structured data processing through SQL, DataFrames,
and related APIs.

## Recommended Topics

### Spark Fundamentals

-   Spark architecture
-   Driver
-   Executors
-   Jobs
-   Stages
-   Tasks

### PySpark

-   DataFrames
-   Schemas
-   Transformations
-   Actions
-   Joins
-   Aggregations
-   Window functions

### Performance

-   Partitioning
-   Repartition
-   Coalesce
-   Shuffle
-   Broadcast joins
-   Caching
-   Data skew
-   Small files
-   Predicate pushdown

## YouTube

### Data Engineering Course for Beginners --- freeCodeCamp.org

https://www.youtube.com/watch?v=PHsC_t0j1dU

Use the Spark section as introductory material.

### Apache Airflow with Spark for Data Engineers --- CodeWithYu

https://www.classcentral.com/course/youtube-apache-airflow-with-spark-pyspark-java-scala-for-data-engineers-full-course-337249

Useful for seeing Spark integrated into an orchestration environment.

## Advanced Reference

### Designing Data-Intensive Applications --- 2nd Edition

https://www.oreilly.com/library/view/designing-data-intensive-applications/9781098119058/

Use for distributed-systems concepts rather than Spark syntax alone.

------------------------------------------------------------------------

# Module 9 --- Streaming & Cloud Data Engineering

This module introduces: 1. Real-time / streaming data 2. Cloud-based
data engineering

## Apache Kafka

### Kafka Introduction

https://kafka.apache.org/intro/

Kafka is an event streaming platform for publishing, subscribing to,
storing, and processing event streams.

### Kafka Documentation

https://kafka.apache.org/documentation/

## Kafka Concepts

-   Producers
-   Consumers
-   Topics
-   Partitions
-   Brokers
-   Consumer groups
-   Replication
-   Offsets
-   Kafka Connect
-   Stream processing

## Streaming Architecture

``` text
Application / API
       ↓
     Kafka
       ↓
   Consumer
       ↓
    Spark
       ↓
 PostgreSQL / Lake
       ↓
   Dashboard
```

## YouTube / End-to-End Streaming

### Realtime Data Streaming --- End-to-End Data Engineering Project --- CodeWithYu

https://www.classcentral.com/course/youtube-realtime-data-streaming-end-to-end-data-engineering-project-337259

Covers Airflow, Kafka, Kafka Connect, Docker, Spark, Cassandra,
PostgreSQL, and API ingestion.

### High-Performance Data Engineering with Kafka and Spark

https://www.classcentral.com/course/youtube-1-2-billion-records-per-hour-high-performance-kafka-and-spark-end-to-end-data-engineering-project-390990

Advanced project covering Kafka, Spark, monitoring, architecture,
performance, and high-throughput streaming.

## Cloud Data Engineering

For 1501 Learn, choose **one primary cloud** rather than trying to learn
AWS, Azure, and GCP simultaneously.

### AWS Glue

https://docs.aws.amazon.com/glue/latest/dg/

### AWS Glue Data Catalog

https://docs.aws.amazon.com/glue/latest/dg/start-data-catalog.html

### Microsoft Learn --- Data Engineering Career Path

https://learn.microsoft.com/en-us/training/career-paths/data-engineer

### Microsoft Learn --- Data Engineering on Azure

https://learn.microsoft.com/en-us/training/paths/get-started-data-engineering/

> **Important:** Microsoft retired the DP-203 certification on March 31,
> 2025. Its study guide remains useful as a curriculum reference, but
> 1501 Learn should not present DP-203 as a current certification
> target.

Reference:
https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/dp-203

------------------------------------------------------------------------

# Module 10 --- Capstone: End-to-End Data Platform

The capstone should combine the technologies from the previous modules.

## Recommended Architecture

``` text
                    SOURCE SYSTEMS
                         │
              ┌──────────┼──────────┐
              │          │          │
             API       CSV       PostgreSQL
              │          │          │
              └──────────┼──────────┘
                         ↓
                  INGESTION LAYER
                         │
                    Python / API
                         │
                         ↓
                   RAW DATA LAYER
                         │
              ┌──────────┴──────────┐
              │                     │
             Batch              Streaming
              │                     │
           Airflow                Kafka
              │                     │
              └──────────┬──────────┘
                         ↓
                PROCESSING LAYER
                         │
                    PySpark / SQL
                         │
                         ↓
                 WAREHOUSE / LAKE
                         │
                       dbt / SQL
                         │
                         ↓
                 DATA QUALITY LAYER
                         │
                         ↓
                 ANALYTICAL MARTS
                         │
                         ↓
                   POWER BI / BI
```

## Capstone Requirements

### Data ingestion

At least three source types: - REST API - CSV/JSON - Relational database

### Storage

-   PostgreSQL
-   Object storage / data lake
-   Parquet

### Transformation

-   SQL
-   Python
-   PySpark

### Orchestration

-   Apache Airflow

### Streaming

-   Kafka
-   Spark Structured Streaming

### Infrastructure

-   Docker
-   Docker Compose

### Version Control

-   Git
-   GitHub

### Data Quality

Implement checks for: - Nulls - Duplicates - Invalid values -
Referential integrity - Schema changes - Freshness

### Monitoring

Capture: - Pipeline status - Task failures - Processing time - Record
counts - Error logs

### BI Layer

Connect the final analytical dataset to Power BI.

------------------------------------------------------------------------

# Real-World Project References

### freeCodeCamp Data Engineering Course

https://www.youtube.com/watch?v=PHsC_t0j1dU

### Apache Airflow + Spark Project

https://www.classcentral.com/course/youtube-apache-airflow-with-spark-pyspark-java-scala-for-data-engineers-full-course-337249

### Real-Time Streaming Project

https://www.classcentral.com/course/youtube-realtime-data-streaming-end-to-end-data-engineering-project-337259

### High-Performance Kafka + Spark

https://www.classcentral.com/course/youtube-1-2-billion-records-per-hour-high-performance-kafka-and-spark-end-to-end-data-engineering-project-390990

### Data Engineering with Open Source Tools

https://www.coursera.org/specializations/open-source-data-engineering

This current specialization covers SQL, Python, PostgreSQL, PySpark,
Spark SQL, dbt, Airflow, Apache Iceberg, MinIO, Kafka, and Spark
Structured Streaming, with hands-on projects.

------------------------------------------------------------------------

# Recommended 1501 Learn Teaching Structure

Each module should use a consistent structure:

## 1. 1501 Learn Lesson

Your own explanation of the topic.

## 2. Official Documentation

The authoritative documentation.

## 3. Guided Video

A selected video with: - Title - Creator - Views at selection - Likes at
selection - Publication date - Link

## 4. Hands-On Lab

Learner implements the concept.

## 5. Challenge

Learner solves a problem without following the tutorial step-by-step.

## 6. Assessment

Use: - MCQs - Short answers - SQL/code exercises - Debugging tasks -
Architecture questions

## 7. Project

Where appropriate, the module contributes a component to the final
capstone.

------------------------------------------------------------------------

# Resource Hierarchy

### Tier 1 --- Official Documentation

-   Apache
-   PostgreSQL
-   Python
-   Docker
-   Git
-   Kafka
-   Airflow
-   Spark
-   AWS
-   Microsoft
-   Google Cloud

### Tier 2 --- Established Publications

-   O'Reilly
-   Kimball Group
-   Recognized technical authors

### Tier 3 --- High-Engagement YouTube

Select based on: - Meaningful view count - Likes - Channel reputation -
Recency - Depth - Practical demonstrations - Learner feedback where
available

### Tier 4 --- Real-World Projects

Use projects to expose learners to: - Architecture - Code organization -
Configuration - Deployment - Monitoring - Failure handling -
Documentation

------------------------------------------------------------------------

# Suggested Data Engineering Skill Stack

``` text
                    DATA ENGINEERING
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
   PROGRAMMING          DATABASES          INFRASTRUCTURE
       │                   │                   │
    Python               SQL                  Git
    APIs                PostgreSQL            Linux
    Files               Warehousing            Docker
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                    DATA PIPELINES
                           │
                 ┌─────────┴─────────┐
                 │                   │
               Batch              Streaming
                 │                   │
              Airflow              Kafka
              PySpark        Spark Streaming
                 │                   │
                 └─────────┬─────────┘
                           │
                    CLOUD / LAKE
                           │
                 AWS / Azure / GCP
                           │
                           ↓
                     BI / ANALYTICS
                           │
                       Power BI
```

------------------------------------------------------------------------

# Data Engineering vs Analytics Engineering

  -----------------------------------------------------------------------
  Area                    Analytics Engineering   Data Engineering
  ----------------------- ----------------------- -----------------------
  Primary focus           Transforming data for   Building and operating
                          analytics               data systems

  SQL                     Very high               Very high

  Python                  Useful                  High

  Data modelling          Very high               High

  dbt                     Core                    Useful

  Airflow                 Useful                  Core

  Spark                   Useful                  Core for large-scale
                                                  processing

  Kafka                   Usually optional        Important for streaming

  Docker                  Useful                  Important

  Cloud                   Important               Important

  APIs                    Useful                  Important

  Data ingestion          Moderate                Core

  Infrastructure          Moderate                High

  BI                      Important               Usually downstream

  Data quality            Core                    Core

  Orchestration           Moderate                Core
  -----------------------------------------------------------------------

The two 1501 Learn tracks should share foundations in SQL, data
modelling, warehousing, Git, data quality, and cloud fundamentals.

The Data Engineering track should go deeper into ingestion, pipelines,
distributed systems, Spark, Kafka, Airflow, infrastructure, cloud data
services, reliability, and monitoring.

------------------------------------------------------------------------

# Final 1501 Learn Data Engineering Outcome

A learner completing the curriculum should be able to design and build a
system resembling:

``` text
                    ┌───────────────┐
                    │ Source Systems│
                    └───────┬───────┘
                            │
               ┌────────────┴────────────┐
               │                         │
           Batch Sources            Streaming Sources
               │                         │
          Python / APIs                 Kafka
               │                         │
               └────────────┬────────────┘
                            ↓
                       Data Lake
                            │
                       PySpark
                            │
                     Data Warehouse
                            │
                       dbt / SQL
                            │
                      Data Quality
                            │
                       Airflow
                            │
                     Analytical Marts
                            │
                         Power BI
```

The objective is not to make learners memorize individual tools. It is
to make them understand **how data systems work together**, how to build
reliable pipelines, and how to troubleshoot and operate those pipelines
in realistic environments.

------------------------------------------------------------------------

## Notes on Engagement Metrics

YouTube views, likes, subscriber counts, and course availability are
time-sensitive. The figures in this document are the public figures
observed during research and should be treated as selection signals
rather than permanent ratings.

For the 1501 Learn LMS, store the following metadata for external
videos:

-   Video title
-   URL
-   Channel
-   Date checked
-   Views at time of selection
-   Likes at time of selection
-   Publication date
